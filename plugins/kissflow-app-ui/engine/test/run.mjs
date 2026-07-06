// Test suite. Three kinds:
//  1. GOLDEN — load REAL app exports and assert our validators accept them
//     (real published apps must be structurally sound; warnings are findings).
//  2. BUILDER FIDELITY — build from IR and assert the output is structurally valid
//     and shaped like the real exports.
//  3. NEGATIVE — broken IR / blobs must be caught by the validators.
//
// Plain node, zero deps:  node test/run.mjs

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadApp, allBlobs } from "../loader.mjs";
import { validateBlob, checkStructural, checkFields, checkCaseflow, errors, warnings } from "../validators.mjs";
import { buildForm, buildList, buildRole, buildApp, buildAutomation, buildBoard, buildKanbanPage } from "../builders.mjs";
import { fmType, resolveSkeleton, buildIntegrationDraft, buildIntegrationDraftFull, connectionsFromExport, provisionSystemConnection, ensureConnections, resolveEntityFields, applyIntegrationResolved } from "../integrations.mjs";
import { index, entities } from "../graph.mjs";
import { validateIR } from "../ir.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KF = join(__dirname, "../../.."); // → kf-framework
const APPS = ["ITAM", "KFSustainabilityApp", "ProfServAppMetadata"].map((n) => [n, join(KF, n)]).filter(([, p]) => existsSync(p));

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`); } };
const section = (s) => console.log(`\n### ${s}`);

// ---------------- 1. GOLDEN: real exports validate ----------------
section("GOLDEN — real app exports load & pass structural validation");
if (!APPS.length) console.log("  (no app exports found under kf-framework — skipping golden tests)");
for (const [name, root] of APPS) {
  let app, blobs;
  try { app = loadApp(root); blobs = allBlobs(app); }
  catch (e) { ok(`${name}: loads`, false, e.message); continue; }
  ok(`${name}: loads (${blobs.length} blobs; ${app.forms.length} forms, ${app.cases.length} cases, ${app.pages.length} pages, ${app.lists.length} lists)`, blobs.length > 0);

  let structErrors = 0, caseflowFindings = 0;
  const errSamples = [];
  for (const b of blobs) {
    const es = errors(checkStructural(b.blob, b.label));
    structErrors += es.length;
    if (es.length && errSamples.length < 3) errSamples.push(es[0].msg);
    if (b.label.includes("caseflow")) caseflowFindings += warnings(checkCaseflow(b.blob, b.label)).length;
  }
  ok(`${name}: ZERO structural errors across all blobs`, structErrors === 0, structErrors ? `${structErrors} errors e.g. ${errSamples.join("; ")}` : "");
  // field checks across forms (errors only; warnings = catalog gaps, informational)
  let fieldErrors = 0;
  for (const f of app.forms) if (f.blob) fieldErrors += errors(checkFields(f.blob, f.id)).length;
  ok(`${name}: ZERO field errors across forms`, fieldErrors === 0, fieldErrors ? `${fieldErrors}` : "");
  if (caseflowFindings) console.log(`    (note: ${caseflowFindings} caseflow behavioral warnings — real-app findings, not test failures)`);
}

// ---------------- 2. BUILDER FIDELITY ----------------
section("BUILDER FIDELITY — IR → blob is valid & shaped like real exports");
const formSpec = {
  name: "Customer", section: "Customer Info",
  fields: [
    { name: "Customer Name", type: "Text", required: true },
    { name: "Email", type: "Email" },
    { name: "Annual Spend", type: "Currency", currency: "USD" },
    { name: "Region", type: "Reference", ref: "Region_A00", lookup: [{ name: "Region Name", type: "Text" }] },
    { name: "Full Label", type: "Text", formula: "Customer_Name" },
  ],
};
const built = buildForm(formSpec, "Demo_App_A00");
const bErr = errors(checkStructural(built.blob, "built:Customer")).concat(errors(checkFields(built.blob, "built:Customer")));
ok("built form has zero structural/field errors", bErr.length === 0, bErr.map((e) => e.msg).join("; "));
const idx = index(built.blob);
ok("built form Root resolves to a Model", idx.get(built.blob.Root)?.Kind === "Model");
ok("Model::Field lists all 5 fields", idx.get(built.id)["Model::Field"].length === 5);
ok("reference field carries a QueryDefinition", !!built.blob["Region"]?.["Field::QueryDefinition"]);
ok("computed field compiles to an Expression with a non-empty Node AST (never empty-node)", (() => { const ex = built.blob["Full_Label"]?.["Field::Expression"] && built.blob[built.blob["Full_Label"]["Field::Expression"][0]]; return !!ex && ex["Expression::Node"].length > 0 && built.blob[ex["Expression::Node"][0]].Kind === "Node"; })());
ok("Currency field carries CurrencyTypes", JSON.stringify(built.blob["Annual_Spend"]?.CurrencyTypes) === JSON.stringify(["USD"]));
// shape parity vs a real form field (same core keys)
if (APPS.length) {
  const realApp = loadApp(APPS[0][1]);
  const realForm = realApp.forms.find((f) => f.blob);
  if (realForm) {
    const realField = entities(realForm.blob).find((e) => e.Kind === "Field" && !e.Id.startsWith("_"));
    const builtField = built.blob["Customer_Name"];
    const coreKeys = ["Id", "Kind", "Type", "Name", "Model", "Column"];
    ok("built Field has the same core keys as a real Field", coreKeys.every((k) => k in builtField) && coreKeys.every((k) => k in realField));
  }
}
// determinism
const built2 = buildForm(formSpec, "Demo_App_A00");
ok("builder is deterministic (same IR → same blob)", JSON.stringify(built.blob) === JSON.stringify(built2.blob));
// list + role
ok("buildList emits ListItems", JSON.stringify(buildList({ name: "Region", items: ["APAC", "EMEA"] }, "Demo_App_A00").doc.ListItems) === JSON.stringify(["APAC", "EMEA"]));
ok("buildRole emits a role doc", buildRole({ name: "Manager" }, "Demo_App_A00").doc.Name === "Manager");

// ---------------- 3. NEGATIVE — broken IR/blobs are caught ----------------
section("NEGATIVE — invalid IR & blobs are rejected");
const has = (res, code) => res.issues.some((i) => i.code === code);
ok("IR: reference field with no target → REF_NO_TARGET", has(validateIR({ app: { name: "X" }, forms: [{ name: "F", fields: [{ name: "R", type: "Reference" }] }] }), "REF_NO_TARGET"));
ok("IR: reference to missing model → REF_TARGET_MISSING", has(validateIR({ app: { name: "X" }, forms: [{ name: "F", fields: [{ name: "R", type: "Reference", ref: "Nope" }] }] }), "REF_TARGET_MISSING"));
ok("IR: missing app.name → NO_APP_NAME", has(validateIR({ forms: [] }), "NO_APP_NAME"));
ok("IR: permission to undefined role → PERM_ROLE_MISSING", has(validateIR({ app: { name: "X" }, permissions: [{ role: "Ghost", model: "F" }] }), "PERM_ROLE_MISSING"));
ok("IR: a valid IR passes", validateIR({ app: { name: "X" }, roles: [{ name: "Admin" }], lists: [{ name: "Region", items: ["A"] }], forms: [{ name: "F", fields: [{ name: "Region", type: "Reference", ref: "F" }] }] }).ok);
// blob negatives
const dangling = { Root: "M", M: { Id: "M", Kind: "Model", "Model::Field": ["GHOST"] } };
ok("blob: dangling ref → DANGLING_REF", checkStructural(dangling).some((i) => i.code === "DANGLING_REF"));
const sysauth = { Root: "M", M: { Id: "M", Kind: "Model", "Model::Field": ["_id"] }, _id: { Id: "_id", Kind: "Field", Type: "Text", Name: "ID" } };
ok("blob: authored system field → SYSTEM_FIELD_AUTHORED", checkFields(sysauth).some((i) => i.code === "SYSTEM_FIELD_AUTHORED"));
const badflow = { Root: "F", F: { Id: "F", Kind: "CaseFlow", "CaseFlow::Status": ["A", "B"] },
  A: { Id: "A", Kind: "Status", Category: "NotStarted", OutwardStatus: [] },
  B: { Id: "B", Kind: "Status", Category: "InProgress", OutwardStatus: [] } };
ok("caseflow: unreachable status + no terminal → flagged", checkCaseflow(badflow).some((i) => i.code === "UNREACHABLE_STATUS" || i.code === "NO_TERMINAL_STATUS"));

// ---------------- 4. BUILDERS: workflow / child table / permissions ----------------
section("BUILDERS — workflow, child table & permissions (the PO app)");
const poIR = JSON.parse(readFileSync(join(__dirname, "../examples/purchase-order.ir.json"), "utf8"));
const poV = validateIR(poIR);
ok("PO IR validates (0 errors)", poV.ok, poV.issues.filter((i) => i.level === "error").map((i) => i.code).join(", "));
const { artifacts: poArts } = buildApp(poIR);
const po = poArts.find((a) => a.id === "Purchase_Order_A00").blob;
const poKinds = new Set(entities(po).map((e) => e.Kind));
ok("PO process blob has zero structural/field errors", errors(checkStructural(po, "po")).concat(errors(checkFields(po, "po"))).length === 0);
// workflow
ok("workflow: ProcessDef + Activities present", poKinds.has("ProcessDef") && poKinds.has("Activity"));
const pd = entities(po).find((e) => e.Kind === "ProcessDef");
ok("workflow: 4 activities, Start→…→End", pd["ProcessDef::Activity"].length === 4 && po[pd["ProcessDef::Activity"][0]].NodeType === "StartEvent" && po[pd["ProcessDef::Activity"][3]].NodeType === "EndEvent");
const mgrAct = entities(po).find((e) => e.Kind === "Activity" && e.Name === "Manager Approval");
ok("workflow: UserTask carries an AppRole resource", po[mgrAct["Activity::Resource"][0]].ValueType === "AppRole" && po[mgrAct["Activity::Resource"][0]].DisplayValue === "Approving Manager");
ok("workflow: every step has Activity::Permission (per-field) + Appearance/Style + Button::Row", entities(po).every((a) => a.Kind !== "Activity" || a.NodeType === "SendBackToInitiator" || (a["Activity::Permission"] || []).length > 0) && poKinds.has("Appearance") && po[po.Root]["Button::Row"]);
// per-step field_permissions overrides (mid-flow edits / Hidden / Mandatory)
const fpIR = { app: { name: "FP" }, roles: [{ name: "Requester" }, { name: "Manager" }],
  forms: [{ name: "Claim", flowType: "Process",
    fields: [{ name: "Amount", type: "Number" }, { name: "Approver Comments", type: "Text" }, { name: "Notes", type: "Text" }],
    workflow: { steps: [
      { name: "Submit", actor: "Requester" },
      { name: "Manager Approval", actor: "Manager", field_permissions: { "Amount": "Editable", "Approver Comments": "Mandatory", "Notes": "Hidden" } },
      { name: "Done" }] } }] };
const fpV = validateIR(fpIR);
ok("IR: workflow with field_permissions validates (0 errors)", fpV.ok, fpV.issues.filter((i) => i.level === "error").map((i) => i.code).join(", "));
const fp = buildApp(fpIR).artifacts.find((a) => a.id === "Claim_A00").blob;
const fpPermAt = (actName, fieldName) => {
  const act = entities(fp).find((e) => e.Kind === "Activity" && e.Name === actName);
  const col = entities(fp).find((e) => e.Kind === "Field" && e.Name === fieldName).Column;
  return fp[(act["Activity::Permission"] || []).find((p) => fp[p].Column === col)].Permission;
};
ok("field_permissions: mid-flow Editable override applied", fpPermAt("Manager Approval", "Amount") === "Editable");
ok("field_permissions: Mandatory + Hidden overrides applied", fpPermAt("Manager Approval", "Approver Comments") === "Mandatory" && fpPermAt("Manager Approval", "Notes") === "Hidden");
ok("field_permissions: non-overridden field keeps step default (ReadOnly mid-flow, Editable at Start)", fpPermAt("Done", "Amount") === "ReadOnly" && fpPermAt("Submit", "Amount") === "Editable");
ok("IR: bad permission level → STEP_PERM_LEVEL_BAD", has(validateIR({ ...fpIR, forms: [{ ...fpIR.forms[0], workflow: { steps: [{ name: "S", field_permissions: { Amount: "Writable" } }] } }] }), "STEP_PERM_LEVEL_BAD"));
ok("IR: unknown field in overrides → STEP_PERM_FIELD_MISSING", has(validateIR({ ...fpIR, forms: [{ ...fpIR.forms[0], workflow: { steps: [{ name: "S", field_permissions: { Ghost: "Editable" } }] } }] }), "STEP_PERM_FIELD_MISSING"));
ok("IR: unknown step actor → STEP_ACTOR_MISSING (warn)", has(validateIR({ ...fpIR, forms: [{ ...fpIR.forms[0], workflow: { steps: [{ name: "S", actor: "Ghost" }] } }] }), "STEP_ACTOR_MISSING"));
// reference QD FlowType must be the TARGET's real flow type (R15) — real exports carry Form|Process|Case|User
const ftIR = { app: { name: "FT" }, roles: [],
  forms: [
    { name: "Claim", flowType: "Process", fields: [{ name: "Amount", type: "Number" }] },
    { name: "Ticket", flowType: "Board", statuses: [{ name: "Open" }, { name: "Closed", category: "Completed" }], fields: [{ name: "Title", type: "Text" }] },
    { name: "Audit", flowType: "Form", fields: [
      { name: "Claim Ref", type: "Reference", ref: "Claim", lookup: [{ name: "Amount", type: "Number" }] },
      { name: "Ticket Ref", type: "Reference", ref: "Ticket", lookup: [{ name: "Title" }] },
      { name: "Self Ref", type: "Reference", ref: "Audit", lookup: [{ name: "Claim Ref" }] }] }] };
const ftBlob = buildApp(ftIR).artifacts.find((a) => a.id === "Audit_A00").blob;
const qdOf = (fieldName) => { const f = entities(ftBlob).find((e) => e.Kind === "Field" && e.Name === fieldName); return ftBlob[f["Field::QueryDefinition"][0]]; };
ok("QD FlowType: Process target → Process", qdOf("Claim Ref").FlowType === "Process" && qdOf("Claim Ref").LHSModel === "Claim_A00");
ok("QD FlowType: Board target → Case", qdOf("Ticket Ref").FlowType === "Case");
ok("QD FlowType: Form target → Form", qdOf("Self Ref").FlowType === "Form");
// child table — SDK shape: Column(Type=Model) → nested Model (not a Table field)
const ctCol = entities(po).find((e) => e.Kind === "Column" && e.Type === "Model");
const cm = po[ctCol["Column::Model"][0]];
ok("child table: Column(Type=Model) → nested Model (no Table field)", cm.Kind === "Model" && !entities(po).some((e) => e.Kind === "Field" && e.Type === "Table"));
ok("child table: child model has its 5 line fields incl. Line Total", cm["Model::Field"].length === 5 && cm["Model::Field"].map((f) => po[f].Name).includes("Line Total"));
ok("child table: line-item reference resolves to Item Catalog", (() => { const item = po[cm["Model::Field"].find((f) => po[f].Name === "Item")]; return po[item["Field::QueryDefinition"][0]].LHSModel === "Item_Catalog_A00"; })());
// computed AST — Line Total = Quantity * Unit_Price compiles to a Function node
const lineTotal = po[cm["Model::Field"].find((f) => po[f].Name === "Line Total")];
const ltExpr = lineTotal["Field::Expression"] && po[lineTotal["Field::Expression"][0]];
ok("computed: Line Total compiled to a Function(*) AST with 2 Field operands", !!ltExpr && (() => { const fn = po[ltExpr["Expression::Node"][0]]; return fn.Type === "Function" && fn.Value === "*" && fn.Syntax === "Infix" && fn["Node::Node"].every((n) => po[n].Type === "Field"); })());
// permissions
const perms = poArts.filter((a) => a.type === "permission");
ok("permissions: one artifact per IR permission", perms.length === poIR.permissions.length);
const mgrPerm = perms.find((p) => p.blob[p.id].RoleName === "Approving Manager");
ok("permission: role + model + data-scope + per-field Permission{Column,Permission}", mgrPerm.blob[mgrPerm.id].Scope === "my-team" && mgrPerm.blob[mgrPerm.id]["FlowPermission::Permission"].length > 0);
ok("buildApp is deterministic (same IR → same artifacts)", JSON.stringify(buildApp(poIR).artifacts) === JSON.stringify(poArts));

// ---------------- 5. FORMULAS: full arithmetic compiler ----------------
section("FORMULAS — multi-term, precedence, parens, name resolution");
const fxRoot = (blob, fid) => { const ex = blob[fid]?.["Field::Expression"]; const e = ex && blob[ex[0]]; return e && blob[e["Expression::Node"][0]]; };
const fxFns = (blob) => Object.values(blob).filter((n) => n && n.Type === "Function").length;
const fxForm = (formula) => buildForm({ name: "Calc", section: "S", fields: [
  { name: "A", type: "Number" }, { name: "B", type: "Number" }, { name: "C", type: "Number" }, { name: "Result", type: "Number", formula },
] }, "Demo_App_A00").blob;
const fm1 = fxForm("A + B + C");
ok("formula: multi-term A+B+C → 2 nested Function nodes", fxFns(fm1) === 2 && fxRoot(fm1, "Result")?.Type === "Function");
const fm2 = fxForm("(A - B) / C");
const fr2 = fxRoot(fm2, "Result");
ok("formula: parens+precedence (A-B)/C → root '/' over a '-'", fr2?.Value === "/" && fm2[fr2["Node::Node"][0]].Value === "-");
const fm3 = fxForm("A * B / 100");
ok("formula: percentage A*B/100 → carries a Static '100' node", Object.values(fm3).some((n) => n && n.Type === "Static" && n.Value === "100"));
const fm4 = buildForm({ name: "Calc2", section: "S", fields: [
  { name: "Unit Price", type: "Currency" }, { name: "Qty", type: "Number" }, { name: "Line", type: "Currency", formula: "Unit_Price * Qty" },
] }, "Demo_App_A00").blob;
const fr4 = fxRoot(fm4, "Line");
ok("formula: operands resolve by field name", fr4?.Type === "Function" && fr4["Node::Node"].every((n) => fm4[n].Type === "Field"));
const fm5 = fxForm("A + nonexistent_field");
ok("formula: unresolved operand → degrades cleanly (no Expression)", !fm5["Result"]?.["Field::Expression"]);
const fm6 = fxForm("ROUND(A * B, 2)");
const fr6 = fxRoot(fm6, "Result");
ok("formula: named function ROUND(A*B,2) → Function 'ROUND' with 2 args", fr6?.Type === "Function" && fr6.Value === "ROUND" && fr6["Node::Node"].length === 2);
const fm7 = fxForm("IF(A > B, A, B)");
const fr7 = fxRoot(fm7, "Result");
ok("formula: IF(A>B,A,B) → Function 'IF' (Category Logical), 3 args, condition '>'", fr7?.Value === "IF" && fr7.Category === "Logical" && fr7["Node::Node"].length === 3 && fm7[fr7["Node::Node"][0]].Value === ">");
const fm8 = fxForm("(A + B) * C");
const fr8 = fxRoot(fm8, "Result");
ok("formula: parenthesised sub-expression carries IsParenthesised", fr8?.Value === "*" && fm8[fr8["Node::Node"][0]].IsParenthesised === true);

// ---------------- 6. CHILD TABLES: sibling field-name collision ----------------
section("CHILD TABLES — sibling same-named fields get distinct ids (no orphan QD)");
const collIR = { app: { name: "Coll App" }, forms: [
  { name: "Vendor", fields: [{ name: "Code", type: "Text" }] },
  { name: "Parent", flowType: "Process", fields: [{ name: "Title", type: "Text" }] },
  { name: "Tbl A", childOf: "Parent", fields: [{ name: "Vendor ID", type: "Reference", ref: "Vendor" }, { name: "Amount", type: "Currency" }] },
  { name: "Tbl B", childOf: "Parent", fields: [{ name: "Vendor ID", type: "Reference", ref: "Vendor" }, { name: "Amount", type: "Currency" }] },
] };
const collParent = buildApp(collIR).artifacts.find((a) => a.id === "Parent_A00");
const vIdFields = Object.values(collParent.blob).filter((e) => e && e.Kind === "Field" && e.Name === "Vendor ID");
ok("child tables: two 'Vendor ID' columns get DISTINCT field ids", vIdFields.length === 2 && vIdFields[0].Id !== vIdFields[1].Id);
const collOrphans = Object.values(collParent.blob).filter((e) => e && e.Kind === "QueryDefinition" && !Object.values(collParent.blob).some((f) => f && f.Kind === "Field" && (f["Field::QueryDefinition"] || []).includes(e.Id)));
ok("child tables: collision leaves NO orphaned QueryDefinition", collOrphans.length === 0);

// ---------------- 7. AGGREGATE & RICH LOOKUP — derived fields ----------------
section("AGGREGATE & RICH LOOKUP — derived fields");
const aggIR = { app: { name: "Agg App" }, forms: [
  { name: "Order", flowType: "Process", fields: [
    { name: "Title", type: "Text" },
    { name: "Line Total", type: "Currency", aggregate: { fn: "SUM", over: "Order Lines", field: "Amount" } },
    { name: "Line Count", type: "Number", aggregate: { fn: "COUNT", over: "Order Lines" } },
  ] },
  { name: "Order Lines", childOf: "Order", fields: [{ name: "Amount", type: "Currency" }] },
] };
const orderBlob = buildApp(aggIR).artifacts.find((a) => a.id === "Order_A00").blob;
const aggLineTotal = Object.values(orderBlob).find((e) => e && e.Kind === "Field" && e.Name === "Line Total");
const aggDef = aggLineTotal && orderBlob[(aggLineTotal["Field::QueryDefinition"] || [])[0]];
ok("aggregate: SUM → AggregateDefinition {Type,Field,LHSModel=child} + Widget 'Aggregation'",
  !!aggDef && aggDef.AggregateType === "Sum" && aggDef.AggregateField === "Amount" && aggDef.LHSModel === "Order_Lines_A00" && aggLineTotal.Widget === "Aggregation");
const aggLineCount = Object.values(orderBlob).find((e) => e && e.Kind === "Field" && e.Name === "Line Count");
const cntDef = aggLineCount && orderBlob[(aggLineCount["Field::QueryDefinition"] || [])[0]];
// live-publish verified (npd-plm 2026-07-03): Count STILL needs AggregateField (defaults to the
// child's first field) + LHSRootModel (parent model) + FlowType of the PARENT — else publish 500s.
ok("aggregate: COUNT → AggregateType Count + defaulted AggregateField + LHSRootModel",
  !!cntDef && cntDef.AggregateType === "Count" && cntDef.AggregateField === "Amount" && cntDef.LHSRootModel === "Order_A00");

const lkIR = { app: { name: "Lk App" }, forms: [
  { name: "Vendor", fields: [{ name: "Vendor Name", type: "Text" }, { name: "IBAN", type: "Text" }] },
  { name: "Bill", fields: [{ name: "Vendor", type: "Reference", ref: "Vendor", autofill: true, sortBy: [{ Field: "Vendor Name" }], lookup: [{ name: "Vendor Name", type: "Text" }, { name: "IBAN", type: "Text" }] }] },
] };
const billBlob = buildApp(lkIR).artifacts.find((a) => a.id === "Bill_A00").blob;
const vRef = Object.values(billBlob).find((e) => e && e.Kind === "Field" && e.Name === "Vendor");
const qd = vRef && billBlob[vRef["Field::QueryDefinition"][0]];
ok("lookup: multi-field LookupField + AutoFill + SortBy", !!qd && qd.LookupField.length === 2 && qd.AutoFill === true && !!qd.SortBy);

// ---------------- 8. PAGES — create-action card ----------------
section("PAGES — create-action card (raise a request)");
const pgIR = { app: { name: "Pg App" }, forms: [{ name: "Req", flowType: "Process", fields: [{ name: "Title", type: "Text" }] }],
  pages: [{ name: "Requester Home", role: "User", cards: [{ label: "Raise a Request", view: "action", source_flow: "Req" }] }] };
const pgArt = buildApp(pgIR).artifacts.find((a) => a.type === "page");
const pgInter = pgArt && pgArt.intermediate;
const pgStr = pgInter && JSON.stringify(pgInter);
// 'action' → create Button (openPopup) + a HIDDEN popup holding the create FormView + the worklist table
const pgPopup = (pgInter?.popups || [])[0];
ok("page: 'action' card → worklist + create Button→Popup(FormView); create form HIDDEN in a popup, not embedded",
  !!pgStr && pgStr.includes('"ProcessTable"') && pgStr.includes('"Button"') && pgStr.includes('"openPopup"')
  && pgStr.includes('"Req_A00"') && !!pgPopup && JSON.stringify(pgPopup).includes('"FormView"')
  && !JSON.stringify(pgInter.body).includes('"FormView"')); // FormView lives in the popup, never in the body

// ---------------- 9. AUTOMATIONS — flow-stitch → Integration ----------------
section("AUTOMATIONS — flow-stitch compiles to an Integration (Trigger+Action)");
const autoArt = buildAutomation({ id: "req_to_pay", name: "Request → Payment",
  source: { flow: "Request_A00", on: "approved", event: "approved" },
  action: { type: "create", target_flow: "Payment_A00", field_map: { Vendor: "Requester", Amount: "Amount" } },
  channel: "internal", rationale: "approved request creates a payment" }, "Pg_App_A00");
const autoStr = JSON.stringify(autoArt.blob);
ok("automation → Integration flow with a Connector + Trigger + Action, bound to source & target",
  autoArt.type === "integration" && autoStr.includes('"Kind":"Integration"') && autoStr.includes('"Kind":"Trigger"')
  && autoStr.includes('"Kind":"Action"') && autoStr.includes('"Flow":"Request_A00"') && autoStr.includes('"TargetFlow":"Payment_A00"'));
// buildApp includes internal automations, excludes external
const autoIR = { app: { name: "A" }, forms: [{ name: "Request", flowType: "Process" }, { name: "Payment", flowType: "Process" }],
  automations: [
    { id: "s1", name: "R→P", source: { flow: "Request", event: "approved" }, action: { type: "create", target_flow: "Payment", field_map: {} }, channel: "internal" },
    { id: "s2", name: "ext", source: { flow: "Request", event: "approved" }, action: { type: "notify", target_flow: "Payment" }, channel: "external" },
  ] };
const autoApp = buildApp(autoIR).artifacts.filter((a) => a.type === "integration");
ok("buildApp emits internal automations, drops external ones", autoApp.length === 1 && autoApp[0].automation.id === "s1");

// ---------------- BOARD BUILDER (buildBoard) — golden-eval Case shape ----------------
section("BUILDERS — Board (Case flow: Model FlowType:Case + CaseFlow blob w/ Statuses+States)");
const boardSpec = { name: "Support Tickets", section: "Details", statuses: [{ name: "New", category: "NotStarted" }, { name: "Triage", category: "InProgress" }, { name: "Resolved", category: "Done" }],
  fields: [{ name: "Subject", type: "Text" }, { name: "Priority", type: "Text" }] };
const board = buildBoard(boardSpec, "Demo_App_A00");
const bModel = board.blob[board.blob.Root];
ok("board: artifact type is 'case'", board.type === "case");
ok("board: Model FlowType='Case'", bModel.FlowType === "Case");
ok("board: form fields still built (reuses buildForm layout)", (bModel["Model::Field"] || []).length === 2);
ok("board: emits a SEPARATE caseflow sub-artifact", !!board.caseflow && board.caseflow.type === "caseflow" && board.caseflow.parentModel === board.id);
const cf = board.caseflow.blob;
const cfEnt = cf[cf.Root];
ok("board: CaseFlow entity links Model + Type=Case", cfEnt.Kind === "CaseFlow" && cfEnt.Model === board.id && cfEnt.Type === "Case");
const bStatuses = Object.values(cf).filter((e) => e && e.Kind === "Status");
const bStates = Object.values(cf).filter((e) => e && e.Kind === "State");
ok("board: 3 spec statuses + system Reopened = 4 Status entities", bStatuses.length === 4 && bStatuses.some((s) => s.Name === "Reopened" && s.IsSystem));
ok("board: CaseFlow::Status + CaseFlow::State reference all built entities", cfEnt["CaseFlow::Status"].length === 4 && cfEnt["CaseFlow::State"].length === 4);
ok("board: 4 system swimlane States (default Not started, last Done)", bStates.length === 4 && bStates.some((s) => s.IsDefaultState && s.Name === "Not started") && bStates.some((s) => s.IsLastState && s.Category === "Closed"));
const aStatus = bStatuses.find((s) => s.Name === "New");
ok("board: UNSTRUCTURED — each status's OutwardStatus reaches every OTHER status (free movement)", aStatus.OutwardStatus.length === bStatuses.length - 1 && !aStatus.OutwardStatus.includes(aStatus.Id));
ok("board: Status carries golden fields (Category, Resources, EntryRule/ExitRule/Rule, SLADisabled)", "Category" in aStatus && Array.isArray(aStatus.Resources) && Array.isArray(aStatus.EntryRule) && aStatus.SLADisabled === false);
// default statuses when none specified
const bDef = buildBoard({ name: "My Tasks", fields: [{ name: "Task", type: "Text" }] }, "Demo_App_A00");
ok("board: defaults to To Do → In Progress → Done (+Reopened) when no statuses given", Object.values(bDef.caseflow.blob).filter((e) => e && e.Kind === "Status").length === 4);
// buildApp dispatch: a form with flowType 'Board' routes to buildBoard and emits the caseflow artifact
const boardIR = { app: { name: "Ops" }, roles: [{ name: "Agent" }], forms: [{ name: "Onboarding", flowType: "Board", statuses: [{ name: "Requested" }, { name: "Done", category: "Done" }], fields: [{ name: "Employee", type: "Text" }] }] };
const boardApp = buildApp(boardIR).artifacts;
ok("buildApp: flowType 'Board' → a 'case' artifact + its 'caseflow' artifact", boardApp.some((a) => a.type === "case" && a.id === "Onboarding_A00") && boardApp.some((a) => a.type === "caseflow" && a.parentModel === "Onboarding_A00"));
ok("buildApp: board build is deterministic", JSON.stringify(buildApp(boardIR).artifacts) === JSON.stringify(boardApp));

// buildKanbanPage — page graph that embeds a Kanban (+ default New-<Item> button) with CURRENT manifests
const kpStarter = { Root: "P1", P1: { Id: "P1", Kind: "Page", "Page::Container": ["Container001"] }, Container001: { Id: "Container001", Kind: "Container", Type: "Body", Name: "Body", Page: "P1", "Container::Style": [] } };
const kp = buildKanbanPage({ pageId: "P1", caseId: "Deals_A00", title: "Pipeline", subtitle: "Track deals", itemLabel: "Deal" }, kpStarter);
const kpVals = Object.values(kp);
const kanC = kpVals.find((e) => e && e.Kind === "Component" && (e.Data || {}).manifest_id === "Kanban");
const kanCont = kp[kanC.Container];
const kfmName = (cont, name) => cont["Container::FieldMapping"].map((f) => kp[f]).find((f) => f && f.Name === name);
ok("kanbanPage: uses CURRENT kanban manifest (view/kanban, not deprecated case/views/kanban)", kanC.Script.web === "view/kanban" && kanC.Data.manifest_id === "Kanban" && kanC.Data.category === "view");
ok("kanbanPage: flow binding is on the CONTAINER FieldMapping (not just Data)", kp[kfmName(kanCont, "flow_id")["FieldMapping::Property"][0]].Value === "Deals_A00" && kp[kfmName(kanCont, "flow_type")["FieldMapping::Property"][0]].Value === "Case" && !!kfmName(kanCont, "view_id") && !!kfmName(kanCont, "showform"));
const btnC = kpVals.find((e) => e && e.Kind === "Component" && (e.Data || {}).visualization_type === "button");
const btnCont = kp[btnC.Container];
const clickEv = kpVals.find((e) => e && e.Kind === "EventMapping" && e.Container === btnCont.Id && e.Name === "on_click");
const popId = kp[clickEv["EventMapping::Property"][0]].Value;
ok("kanbanPage: New-<Item> button caption + on_click OpenPopup", kp[kfmName(btnCont, "caption")["FieldMapping::Property"][0]].Value === "New Deal" && clickEv.Type === "OpenPopup" && kp[popId].Kind === "Popup");
const popCont = kp[kp[popId]["Popup::Container"][0]];
ok("kanbanPage: popup container is Type:'Popup' wrapping a form container", popCont.Type === "Popup" && kp[popCont["Container::Container"][0]].Type === "Component");
const formC = kpVals.find((e) => e && e.Kind === "Component" && (e.Data || {}).manifest_id === "Form");
const formCont = kp[formC.Container];
ok("kanbanPage: form uses view/form manifest + flow binding on its container", formC.Script.web === "view/form" && formC.Data.category === "view" && kp[kfmName(formCont, "flow_id")["FieldMapping::Property"][0]].Value === "Deals_A00");
ok("kanbanPage: on_submit/on_discard refresh the kanban + close popup", formCont["Container::EventMapping"].map((e) => kp[e]).every((e) => e.Type === "JSAction") && kp[kp[formCont["Container::EventMapping"][0]]["EventMapping::Property"][0]].Value.includes(kanC.Id) && kp[kp[formCont["Container::EventMapping"][0]]["EventMapping::Property"][0]].Value.includes("popup.close"));
ok("kanbanPage: NO deprecated manifests present (CaseViewKanban / case/form)", !kpVals.some((e) => e && (((e.Data || {}).manifest_id === "CaseViewKanban") || (e.Script || {}).web === "case/views/kanban" || (e.Script || {}).web === "case/form")));
ok("kanbanPage: body children clean (header, button row, board) + Page::Popup set", kp.Container001["Container::Container"].length === 3 && kp[kp.Root]["Page::Popup"].length === 1);
ok("kanbanPage: newButton:false omits the button+popup", (() => { const p = buildKanbanPage({ pageId: "P2", caseId: "X_A00", title: "T", newButton: false }, { Root: "P2", P2: { Id: "P2", Kind: "Page", "Page::Container": ["Container001"] }, Container001: { Id: "Container001", Kind: "Container", Type: "Body", "Container::Style": [] } }); return !Object.values(p).some((e) => e && e.Kind === "Popup") && Object.values(p).some((e) => e && (e.Data || {}).manifest_id === "Kanban"); })());

// ---------------- 10. INTEGRATION EMITTER (integrations.mjs) — 20 tests ----------------
section("INTEGRATION EMITTER — connector/trigger/action skeleton + builder-grade draft");

// fmType — Kissflow field type → FieldMapping type (6)
ok("fmType: Currency → Number", fmType("Currency") === "Number");
ok("fmType: Number/Decimal → Number", fmType("Number") === "Number" && fmType("Decimal") === "Number");
ok("fmType: Date/DateTime → Date", fmType("Date") === "Date" && fmType("DateTime") === "Date");
ok("fmType: Reference/User → Object", fmType("Reference") === "Object" && fmType("User") === "Object");
ok("fmType: YesNo → Boolean", fmType("YesNo") === "Boolean");
ok("fmType: Text/unknown → String", fmType("Text") === "String" && fmType("") === "String");

// resolveSkeleton — the plugin (AI) picks trigger + action deterministically (4)
const skCtx = { flowTypeOf: () => "Process" };
const upAuto = { name: "U", source: { flow: "Src", event: "approved" }, action: { type: "update", target_flow: "Tgt", match: { lhs: "Fund", rhs: "Fund" }, field_map: { "Amount": "Amount" } } };
const crAuto = { name: "C", source: { flow: "Src", event: "created" }, action: { type: "create", target_flow: "Tgt", field_map: { "Note": "'hi'" } } };
ok("resolveSkeleton: approved → ItemCompleted trigger", resolveSkeleton(upAuto, skCtx).triggerId === "ItemCompleted");
ok("resolveSkeleton: update → UpdateAnItem action", resolveSkeleton(upAuto, skCtx).actionId === "UpdateAnItem");
ok("resolveSkeleton: created → ItemCreated trigger", resolveSkeleton(crAuto, skCtx).triggerId === "ItemCreated");
ok("resolveSkeleton: create → CreateAndSubmitItem action", resolveSkeleton(crAuto, skCtx).actionId === "CreateAndSubmitItem");

// buildIntegrationDraft — STEP SKELETON only (trigger + create/update/email action; no connection,
// no flow binding, no field mappings — the user configures those in the builder after auth) (11)
const iCtx = { connectors: {
  process: { _id: "CP", name: "Kissflow Process", version: "3.7.5", logo: {} },
  email: { _id: "CE", name: "Email", version: "1.0.6", logo: {} },
  _available: ["Kissflow Process", "Email"] } };
const emAuto = { name: "E", source: { flow: "Src", event: "created" }, action: { type: "email", target_flow: "—" } };
const up = buildIntegrationDraft(upAuto, iCtx), cr = buildIntegrationDraft(crAuto, iCtx), em = buildIntegrationDraft(emAuto, iCtx);
const upT = Object.values(up).find((e) => e && e.Kind === "Trigger");
const upA = Object.values(up).find((e) => e && e.Kind === "Action");
ok("draft: Integration root links 1 Trigger + 1 Action", up[up.Root]["Integration::Trigger"].length === 1 && up[up.Root]["Integration::Action"].length === 1);
ok("draft: Trigger step has the right TriggerId (ItemCompleted)", upT.Connector.TriggerId === "ItemCompleted");
ok("draft: Trigger step is internal-auth w/ empty Connection (user auths in builder)", upT.IsInternalAuth === true && JSON.stringify(upT.Connection) === "{}");
ok("draft: Trigger step has EMPTY field mapping (mapped later)", Array.isArray(upT["Trigger::FieldMapping"]) && upT["Trigger::FieldMapping"].length === 0);
ok("draft: Trigger IsInternalAuth=true + Integration back-ref", upT.IsInternalAuth === true && upT.Integration === up.Root);
ok("draft: update → Action ActionId=UpdateAnItem, entity Type='Create' (golden: never 'Update')", upA.Connector.ActionId === "UpdateAnItem" && upA.Type === "Create");
ok("draft: Action step has EMPTY field mapping (no mappings)", Array.isArray(upA["Action::FieldMapping"]) && upA["Action::FieldMapping"].length === 0);
ok("draft: NO Property/FieldMapping entities (steps only)", !Object.values(up).some((e) => e && (e.Kind === "Property" || e.Kind === "FieldMapping")));
ok("draft: create → Action step ActionId = CreateAndSubmitItem", Object.values(cr).find((e) => e.Kind === "Action").Connector.ActionId === "CreateAndSubmitItem");
ok("draft: email → SendEmail on the Email connector", Object.values(em).find((e) => e.Kind === "Action").Connector.ActionId === "SendEmail" && Object.values(em).find((e) => e.Kind === "Action").Connector._id === "CE");
// notify = email semantics (INT-C2): a valid-IR notify must emit SendEmail on the Email connector,
// NEVER CreateAndSubmitItem on the process connector (which would create a spurious item per trigger)
const noAuto = { name: "N", source: { flow: "Src", event: "completed" }, action: { type: "notify", target_flow: "Tgt" } };
const noSk = resolveSkeleton(noAuto, skCtx);
ok("resolveSkeleton: notify → email connector + SendEmail", noSk.tgtKey === "email" && noSk.actionId === "SendEmail");
const no = buildIntegrationDraft(noAuto, iCtx);
const noA = Object.values(no).find((e) => e && e.Kind === "Action");
ok("draft: notify → SendEmail on the Email connector, no process create", noA.Connector.ActionId === "SendEmail" && noA.Connector._id === "CE" && noA.Connector.ActionId !== "CreateAndSubmitItem");
const noFull = buildIntegrationDraftFull(noAuto, { ...iCtx, flows: { Src: { id: "Src_A00", fields: [{ id: "F1", name: "F1", type: "Text" }] } } });
ok("draftFull: notify early-returns like email (To/Subject/Body deferred to builder)", Array.isArray(noFull._unresolved) && noFull._unresolved[0].includes("email action") && !Object.values(noFull).some((e) => e && e.Kind === "FieldMapping" && e.Action));
let threw = false; try { buildIntegrationDraft(upAuto, { connectors: { _available: [] } }); } catch { threw = true; }
ok("draft: throws when the connector isn't available", threw);

// connectionsFromExport — harvest connection + pinned connector from app metadata (1)
const mockFs = {
  readdirSync: (dir) => dir.endsWith("/integration") ? [{ name: "x", isDirectory: () => true }] : [{ name: "m.json", isDirectory: () => false }],
  readFileSync: () => JSON.stringify({ Root: "I", I: { Kind: "Integration" }, T: { Kind: "Trigger", Connector: { Name: "Kissflow Process", _id: "CP", Version: "3.2.1", Logo: {} }, Connection: { _id: "CnX", Name: "Kissflow Process Connection" } } }),
};
const cfe = connectionsFromExport("/fake", mockFs);
ok("connectionsFromExport: harvests connection + PINNED connector version from metadata", cfe.process && cfe.process._id === "CnX" && cfe.process.connector.Version === "3.2.1");

// provisionSystemConnection — the platform mints its own key; caller supplies NO credential (verified live) (2)
const provClient = {
  calls: [],
  async call(method, path, body) {
    this.calls.push({ method, path, body });
    if (path.endsWith("/SystemApiKey")) return { status: 200, body: { _id: "CnNEW", Name: body.Name, Connector: { _id: "CP", Version: "3.7.5" } } };
    return { status: 200, body: [] }; // resolveConnections list → empty (MBAC/none)
  },
};
const prov = await provisionSystemConnection(provClient, "ACC", "CP", "3.7.5", "Kissflow Process Connection");
ok("provisionSystemConnection: POSTs .../SystemApiKey and returns {_id,Name}", prov._id === "CnNEW" && provClient.calls.some((c) => c.method === "POST" && c.path.endsWith("/connection/CP/3.7.5/SystemApiKey") && c.body.Name && !("api_key" in c.body) && !("Secret" in c.body)));

// ensureConnections — provisions for each catalog key missing from the (gated) live list (1)
const ens = await ensureConnections(provClient, "ACC", { process: { _id: "CP", name: "Kissflow Process", version: "3.7.5" }, _available: ["Kissflow Process"] });
ok("ensureConnections: provisions a connection for the missing 'process' key", ens.process && ens.process._id === "CnNEW");

// buildIntegrationDraft WITH a provisioned connection → auth pre-satisfied (IsInternalAuth:false + Connection) (2)
const iCtxConn = { ...iCtx, connections: { process: { _id: "CnNEW", Name: "Kissflow Process Connection" } } };
const upC = buildIntegrationDraft(upAuto, iCtxConn);
const upCT = Object.values(upC).find((e) => e && e.Kind === "Trigger");
const upCA = Object.values(upC).find((e) => e && e.Kind === "Action");
ok("draft(conn): Trigger attaches provisioned Connection + IsInternalAuth=false", upCT.IsInternalAuth === false && upCT.Connection._id === "CnNEW");
ok("draft(conn): Action attaches provisioned Connection + IsInternalAuth=false", upCA.IsInternalAuth === false && upCA.Connection._id === "CnNEW");

// buildIntegrationDraftFull — process bindings + per-field mappings (the fully-configured draft) (11)
const fullFlows = {
  Valuation: { id: "Valuation_A07", fields: [{ id: "Average_Valuation", name: "Average Valuation", type: "Currency" }, { id: "Fund", name: "Fund", type: "Reference" }] },
  NAV: { id: "NAV_A07", fields: [{ id: "Market_Value_of_the_land", name: "Market Value of the land", type: "Currency" }, { id: "Fund", name: "Fund", type: "Reference" }] },
  Payment: { id: "Payment_A07", fields: [{ id: "Total", name: "Total", type: "Currency" }, { id: "Notes", name: "Notes", type: "Text" }] },
};
const fCtx = { ...iCtxConn, flows: fullFlows };
// update stitch: NAV.Market Value ← Valuation.Average Valuation (by label)
const updAuto = { name: "V→NAV", source: { flow: "Valuation", event: "approved" }, action: { type: "update", target_flow: "NAV", field_map: { "Market Value of the land": "Average Valuation" } } };
const fd = buildIntegrationDraftFull(updAuto, fCtx);
const fT = Object.values(fd).find((e) => e && e.Kind === "Trigger");
const fA = Object.values(fd).find((e) => e && e.Kind === "Action");
const propsOf = (fmId) => Object.values(fd).filter((e) => e && e.Kind === "Property" && e.FieldMapping === fmId);
const fmByName = (parent, key, name) => parent[key].map((id) => fd[id]).find((f) => f && f.Name === name);
const tPid = fmByName(fT, "Trigger::FieldMapping", "process_id");
const aPid = fmByName(fA, "Action::FieldMapping", "process_id");
const aMv = fmByName(fA, "Action::FieldMapping", "Market_Value_of_the_land");
const aId2 = fmByName(fA, "Action::FieldMapping", "_id");
ok("full: Trigger process_id = Value:[source flow id]", propsOf(tPid.Id)[0].Type === "Value" && JSON.stringify(propsOf(tPid.Id)[0].Value) === '["Valuation_A07"]');
ok("full: Trigger carries an Output sample (drives smart mapping)", fT.Output && fT.Output._id && "Average_Valuation" in fT.Output);
ok("full: Action process_id = Value:[target flow id]", propsOf(aPid.Id)[0].Type === "Value" && JSON.stringify(propsOf(aPid.Id)[0].Value) === '["NAV_A07"]');
ok("full: field label resolved to id (Market Value of the land → Market_Value_of_the_land)", !!aMv);
ok("full: currency field mapped with fmType Number", aMv.Type === "Number");
ok("full: field bound via Property Type:Field context.<trigger>.<srcFieldId>", propsOf(aMv.Id)[0].Type === "Field" && propsOf(aMv.Id)[0].Field === `context.${fT.Id}.Average_Valuation`);
ok("full: update WITHOUT key_field omits _id + flags record-locator (empty _id = invalid payload)", !aId2 && (fd._unresolved || []).some((u) => /record-locator/.test(u)));
// update WITH key_field → _id bound from the named source ref
const updKeyAuto = { ...updAuto, action: { ...updAuto.action, key_field: "Fund" } };
const fdk = buildIntegrationDraftFull(updKeyAuto, fCtx);
const fAk = Object.values(fdk).find((e) => e && e.Kind === "Action");
const fTk = Object.values(fdk).find((e) => e && e.Kind === "Trigger");
const aIdk = fAk["Action::FieldMapping"].map((id) => fdk[id]).find((f) => f && f.Name === "_id");
const kPropsOf = (fmId) => Object.values(fdk).filter((e) => e && e.Kind === "Property" && e.FieldMapping === fmId);
ok("full: update WITH key_field binds _id via context.<trigger>.<keyFieldId>", !!aIdk && kPropsOf(aIdk.Id)[0].Field === `context.${fTk.Id}.Fund`);
// create stitch with a quoted literal → Property Type:Value
const crFullAuto = { name: "→Pay", source: { flow: "Valuation", event: "created" }, action: { type: "create", target_flow: "Payment", field_map: { "Total": "Average Valuation", "Notes": "'auto-created'" } } };
const cfd = buildIntegrationDraftFull(crFullAuto, fCtx);
const cfA = Object.values(cfd).find((e) => e && e.Kind === "Action");
const cPropsOf = (fmId) => Object.values(cfd).filter((e) => e && e.Kind === "Property" && e.FieldMapping === fmId);
const cNotes = cfA["Action::FieldMapping"].map((id) => cfd[id]).find((f) => f && f.Name === "Notes");
const cTotal = cfA["Action::FieldMapping"].map((id) => cfd[id]).find((f) => f && f.Name === "Total");
ok("full(create): quoted literal → Property Type:Value (unquoted)", cPropsOf(cNotes.Id)[0].Type === "Value" && JSON.stringify(cPropsOf(cNotes.Id)[0].Value) === '["auto-created"]');
ok("full(create): field ref → Property Type:Field", cPropsOf(cTotal.Id)[0].Type === "Field");
// unresolved refs are collected, not fatal
const badAuto = { name: "bad", source: { flow: "Valuation", event: "approved" }, action: { type: "update", target_flow: "NAV", field_map: { "Nonexistent Field": "Average Valuation" } } };
ok("full: unresolved target field collected on _unresolved (non-fatal)", (buildIntegrationDraftFull(badAuto, fCtx)._unresolved || []).some((u) => /Nonexistent/.test(u)));

// applyIntegrationResolved — the builder-faithful 2-pass live path (create + update) via a MOCK client (7)
function mockResolvedClient(actionSchema) {
  const puts = [];
  return { puts, acc: "ACC", async call(method, path, body) {
    if (method === "POST" && /\/integration\?/.test(path)) return { status: 200, body: { _id: "INT_A00" } };
    if (method === "GET" && /\/integration\/INT_A00\/draft/.test(path)) return { status: 200, body: { Root: "SRV_ROOT" } };
    if (method === "PUT" && /\/draft$/.test(path)) { puts.push(JSON.parse(JSON.stringify(body))); return { status: 200, body: {} }; }
    if (method === "GET" && /\/action\/[^/]+\/fields$/.test(path)) return { status: 200, body: actionSchema };
    if (method === "POST" && /\/publish$/.test(path)) return { status: 200, body: {} };
    if (method === "POST" && /\/SystemApiKey$/.test(path)) return { status: 200, body: { _id: "CnX", Name: "C", Connector: { _id: "CP", Version: "3.7.5" } } };
    if (method === "GET" && /\/connection$/.test(path)) return { status: 200, body: [] };
    return { status: 200, body: {} };
  } };
}
const rflows = {
  Valuation: { id: "Valuation_A07", display: "Valuation", fields: [{ id: "Average_Valuation", name: "Average Valuation", type: "Currency" }, { id: "Fund", name: "Fund", type: "Reference" }] },
  NAV: { id: "NAV_A07", display: "NAV", fields: [{ id: "Market_Value_of_the_land", name: "Market Value of the land", type: "Currency" }] },
  Payment: { id: "Payment_A07", display: "Payment", fields: [{ id: "Fund", name: "Fund", type: "Reference" }, { id: "Total", name: "Total", type: "Currency" }] },
};
const rCtx = { connectors: iCtx.connectors, connections: { process: { _id: "CnX", Name: "C" } }, flows: rflows };
const updSchema = [{ Name: "process_id", Label: "Choose a process", Type: "String", IsRequired: true, IsDropdown: true }, { Name: "_id", Label: "Select instance", Type: "String", IsRequired: true }, { Name: "Market_Value_of_the_land", Label: "Market Value of the land", Type: "String", IsRequired: false }];
const rUpd = { name: "RU", source: { flow: "Valuation", event: "approved" }, action: { type: "update", target_flow: "NAV", field_map: { "Market Value of the land": "Average Valuation" } } };
const mc = mockResolvedClient(updSchema);
const rrep = await applyIntegrationResolved(mc, "ACC", "APP_A00", rUpd, rCtx);
ok("resolved(update): all steps 200 (create/putSkeleton/putFull/publish)", rrep.steps.create === 200 && rrep.steps.putSkeleton === 200 && rrep.steps.putFull === 200 && rrep.steps.publish === 200);
ok("resolved(update): resolvedFields count reported from live schema", rrep.steps.resolvedFields === 3);
const finalDraft = mc.puts[mc.puts.length - 1];
const rAction = Object.values(finalDraft).find((e) => e && e.Kind === "Action");
const rActProps = (fmId) => Object.values(finalDraft).filter((e) => e && e.Kind === "Property" && e.FieldMapping === fmId);
const rFm = (name) => rAction["Action::FieldMapping"].map((id) => finalDraft[id]).find((f) => f && f.Name === name);
ok("resolved(update): action enumerates ALL resolved fields (golden shape)", rAction["Action::FieldMapping"].length === 3);
ok("resolved(update): process_id has SelectedDropdown + Value binding", rFm("process_id").SelectedDropdown[0].FieldId === "NAV_A07" && rActProps(rFm("process_id").Id)[0].Type === "Value");
ok("resolved(update): mapped field bound via context.<trigger>", rActProps(rFm("Market_Value_of_the_land").Id)[0].Field.startsWith("context.") && rActProps(rFm("Market_Value_of_the_land").Id)[0].Field.endsWith(".Average_Valuation"));
ok("resolved(update): _id flagged unresolved when no key_field", (rrep.unresolved || []).some((u) => /record-locator/.test(u)));
// CREATE — resolved schema has NO _id; nothing left unresolved
const crSchema = [{ Name: "process_id", Label: "Choose a process", Type: "String", IsRequired: true, IsDropdown: true }, { Name: "Fund", Label: "Fund", Type: "Object", IsRequired: false }, { Name: "Total", Label: "Total", Type: "String", IsRequired: false }];
const rCr = { name: "RC", source: { flow: "Valuation", event: "created" }, action: { type: "create", target_flow: "Payment", field_map: { "Fund": "Fund" } } };
const mc2 = mockResolvedClient(crSchema);
const rrep2 = await applyIntegrationResolved(mc2, "ACC", "APP_A00", rCr, rCtx);
ok("resolved(create): all steps 200 and NO unresolved (create needs no _id locator)", rrep2.steps.putFull === 200 && rrep2.steps.publish === 200 && !rrep2.unresolved);

// ---------------- summary ----------------
console.log(`\n${"=".repeat(48)}\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
