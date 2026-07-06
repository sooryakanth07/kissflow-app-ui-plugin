// Builders — compile the App-Spec IR into Kissflow metadata blobs/docs.
// Deterministic: same IR → same ids. Covers the high-value 80% (lists, forms with
// fields incl. reference/select/computed + layout, roles, simple pages/dashboards).
// Live publish is done by client.mjs; these are pure functions (no I/O).

import { slug, eid, REF_TYPES } from "./util.mjs";

// Compile a formula string → Expression::Node AST, mirroring the shape Kissflow's UI emits (verified
// against real exports: infix operators carry {Value:"+"/"-"/"*"/"/"/"="/..., Syntax:"Infix"}, the
// engine resolves the symbol via resolve_engine_fn → ADDOPER/MULOPER/…; parenthesised nodes carry
// IsParenthesised:true; named functions carry {Value:"IF"/"CONCATENATE"/…, Category:<module>} with
// their args as Node::Node). Grammar: comparison (= < > >= <= !=) over additive (+ -) over
// multiplicative (* /); operands are numbers, "strings", FUNC(args), or field names/ids (resolved
// model-first). Returns true if it built a valid AST under exprId; false to DEGRADE.
const FN_CATEGORY = {
  CONCATENATE: "String", TOUPPERCASE: "String", TOLOWERCASE: "String", SUBSTRING: "String", FIND: "String", REPLACE: "String", LENGTH: "String", TOTEXT: "String", TRIM: "String", LEFT: "String", RIGHT: "String", INSERT: "String", CODE: "String",
  IF: "Logical", AND: "Logical", OR: "Logical", NOT: "Logical", ISBLANK: "Logical", HAS: "Logical", HASALL: "Logical",
  SUM: "Number", ROUND: "Number", ABS: "Number", AVERAGE: "Number", MIN: "Number", MAX: "Number", CEIL: "Number", FLOOR: "Number", RANDBETWEEN: "Number", POWER: "Number", SQRT: "Number", MOD: "Number", EXTRACTNUMBER: "Number",
  DATEDIFF: "Date", CALENDARDAYS: "Date", DAY: "Date", MONTH: "Date", YEAR: "Date", HOUR: "Date", OFFSET: "Date", EOM: "Date", NOW: "DateTime", TODAY: "Date", DATE: "Date", DATETIME: "DateTime",
  GETVALUE: "List", GET: "List", CONVERT: "Currency", CURRENCY: "Currency",
};
function compileFormula(blob, exprId, formula, fieldType, modelId) {
  const dt = fieldType === "Currency" || fieldType === "Number" ? "Number" : "String";
  const allFields = Object.values(blob).filter((e) => e && e.Kind === "Field");
  const resolveField = (tok) => {
    if (allFields.some((f) => f.Id === tok)) return tok;                 // exact id
    const low = String(tok).toLowerCase();
    const m = allFields.filter((f) => slug(f.Name) === tok || slug(f.Name).toLowerCase() === low);
    if (!m.length) return null;
    return (modelId && (m.find((f) => f.Model === modelId) || {}).Id) || m[0].Id; // prefer same model
  };
  let seq = 0;
  const mk = (props) => { const id = eid("Node", `${exprId}:n${seq++}`); blob[id] = { Id: id, Kind: "Node", DataType: dt, ...props }; return id; };
  const op = (sym, l, r, cat) => { if (l == null || r == null) { ok = false; return null; } return mk({ Type: "Function", Value: sym, Category: cat || dt, Syntax: "Infix", "Node::Node": [l, r], FieldRefCount: 2 }); };
  const toks = formula.match(/"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_.]*|\d+\.?\d*|>=|<=|!=|&&|\|\||[-+*/(),=<>]/g) || [];
  let pos = 0, ok = true;
  const peek = () => toks[pos], eat = () => toks[pos++];
  const parseCompare = () => { let n = parseAdd(); while (n != null && /^(=|<|>|>=|<=|!=)$/.test(peek() || "")) n = op(eat(), n, parseAdd(), "Boolean"); return n; };
  const parseAdd = () => { let n = parseMul(); while (n != null && (peek() === "+" || peek() === "-")) n = op(eat(), n, parseMul(), dt); return n; };
  const parseMul = () => { let n = parseFactor(); while (n != null && (peek() === "*" || peek() === "/")) n = op(eat(), n, parseFactor(), dt); return n; };
  const parseFactor = () => {
    const t = peek();
    if (t === undefined) { ok = false; return null; }
    if (t === "(") { eat(); const n = parseCompare(); if (peek() === ")") eat(); else ok = false; if (n != null) blob[n].IsParenthesised = true; return n; }
    eat();
    if (/^["']/.test(t)) return mk({ Type: "Static", DataType: "String", Value: t.slice(1, -1) });        // string literal
    if (/^\d+\.?\d*$/.test(t)) return mk({ Type: "Static", Value: String(t) });                            // number literal
    if (/^[A-Za-z_]/.test(t)) {
      if (peek() === "(") {                                                                                // named function call FUNC(args)
        eat(); const args = [];
        if (peek() !== ")") { args.push(parseCompare()); while (peek() === ",") { eat(); args.push(parseCompare()); } }
        if (peek() === ")") eat(); else ok = false;
        if (args.some((a) => a == null)) { ok = false; return null; }
        const fn = t.toUpperCase();
        return mk({ Type: "Function", Value: fn, Category: FN_CATEGORY[fn] || dt, "Node::Node": args, FieldRefCount: args.length });
      }
      const fid = resolveField(t); if (fid) return mk({ Type: "Field", Field: fid });                      // field reference
      ok = false; return null;
    }
    ok = false; return null;
  };
  const root = parseCompare();
  if (ok && root != null && pos >= toks.length) {
    blob[exprId]["Expression::Node"] = [root];
    // root links to the Expression; every descendant links to its parent Node via "Node".
    const walk = (id, parentKey, parentId) => { const n = blob[id]; n[parentKey] = parentId; if (n["Node::Node"]) for (const c of n["Node::Node"]) walk(c, "Node", id); };
    walk(root, "Expression", exprId);
    return true;
  }
  for (let i = 0; i < seq; i++) delete blob[eid("Node", `${exprId}:n${i}`)];   // degrade: drop partial nodes
  return false;
}

/** A List/option dataset → flow doc only (no metadata blob). */
// ── Derived-field helpers (shared by buildForm & buildFieldInto) ──
// Rich lookup: multi-field LookupField is already wired from f.lookup; this adds AutoFill (copy the
// pulled columns into the form's own fields) + SortBy onto the reference's QueryDefinition.
function enrichLookup(blob, qdId, f) {
  if (!blob[qdId]) return;
  if (f.autofill) blob[qdId].AutoFill = true;
  if (f.sortBy) blob[qdId].SortBy = f.sortBy;
}
// Aggregate: a Currency/Number field that sums/counts a column of a CHILD TABLE (or related flow).
// Shape verified against real exports (ITAM Asset_Disposal "Repair costs until now"): the field is
// ReadOnly + Widget:"Aggregation" and links a QueryDefinition via **`Field::QueryDefinition`** (NOT a
// separate Aggregate:: relation) carrying {LHSModel, FlowType, LookupField:[], AggregateField,
// AggregateType:"Sum"|"Count"|… (title-case)}. f.aggregate = { fn, over:"<flow/child name>",
// field?:"<column>" } (field omitted for Count).
const AGG_TYPE = { SUM: "Sum", COUNT: "Count", AVG: "Average", AVERAGE: "Average", MIN: "Min", MAX: "Max", UNIQUE_COUNT: "UniqueCount" };
function addAggregate(blob, field, f, fid, resolve) {
  if (!f.aggregate || !f.aggregate.over) return;
  const adId = eid("AggregateDefinition", field.Model + ":" + fid);
  field["Field::QueryDefinition"] = [adId];
  field.Widget = "Aggregation";
  field.ReadOnly = true;
  const lhs = resolve(f.aggregate.over);
  // publish-verified QD shape (npd-plm live apply 2026-07-03): the live validator REQUIRES
  // LHSRootModel (the parent model) + FlowType of the PARENT flow (not the child's) + an
  // AggregateField even for Count — missing any → publish 500 QueryDefinitionValidationException.
  const ad = {
    Id: adId, Kind: "QueryDefinition", Field: fid, LHSModel: lhs,
    LHSRootModel: field.Model,
    FlowType: f.aggregate.flowType || blob[field.Model]?.FlowType || "Form", LookupField: [],
    AggregateType: AGG_TYPE[String(f.aggregate.fn || "SUM").toUpperCase()] || "Sum",
  };
  if (f.aggregate.field) ad.AggregateField = slug(f.aggregate.field);
  else {
    const first = Object.values(blob).find((v) => v && v.Kind === "Field" && v.Model === lhs);
    if (first) ad.AggregateField = first.Id; // Count still needs a concrete column
  }
  blob[adId] = ad;
}

export function buildList(spec, appId) {
  const id = spec.id || `${slug(spec.name)}_A00`;
  return {
    type: "list", id,
    doc: {
      _id: id, Name: spec.name, Description: spec.description || "", Type: "List", Status: "Live",
      ListItems: spec.items || [], _application_id: appId,
      Security: { AllowAllFlows: true, AllowedFlows: [] },
    },
  };
}

/**
 * A flow-stitch automation → an Integration flow (Connector with a Trigger + Action entity).
 * Trigger = the source flow reaching a state/event; Action = create/update/notify a target flow.
 * Shape matches the observed Integration blob (Connectors[]→Entities[{Kind:"Trigger"|"Action"}]).
 * NOTE: Kissflow exposes no PUBLIC author route for integrations (create is internal-only), so
 * apply emits this to the plan and defers the live write — it is still a first-class build artifact.
 */
export function buildAutomation(a, appId) {
  const id = a.id ? `${slug(a.id)}_A00` : `${slug(a.name)}_A00`;
  const connId = eid("Connector", id), trigId = eid("Trigger", id + ":t"), actId = eid("Action", id + ":a");
  const blob = {
    Root: id,
    [id]: { _id: id, Id: id, Kind: "Integration", Name: a.name, Type: "Integration", Status: "Draft", IsActive: true,
      _application_id: appId, Connectors: [connId], "Integration::Trigger": [trigId], "Integration::Action": [actId] },
    [connId]: { _id: connId, Id: connId, Kind: "Connector", Name: `${a.name} connector`, Entities: [trigId, actId] },
    [trigId]: { _id: trigId, Id: trigId, Kind: "Trigger", Version: 1, Name: `${a.source.flow} · ${a.source.event || "completed"}`,
      Flow: a.source.flow, On: a.source.on || null, Event: a.source.event || "completed" },
    [actId]: { _id: actId, Id: actId, Kind: "Action", Version: 1, Name: `${a.action.type} → ${a.action.target_flow}`,
      ActionType: a.action.type, TargetFlow: a.action.target_flow, FieldMap: a.action.field_map || {}, Condition: a.action.condition || null },
  };
  return { type: "integration", id, shell: { Name: a.name, Description: a.rationale || "" }, blob, automation: a };
}

/** A Role → app_role doc. */
export function buildRole(spec, appId) {
  const id = spec.id || eid("Ro", spec.name);
  return {
    type: "role", id,
    doc: {
      _id: id, Name: spec.name, Description: spec.description || "", _application_id: appId,
      Users: (spec.users || []).map((u) => ({ _id: u })), Groups: (spec.groups || []).map((g) => ({ _id: g })),
    },
  };
}

/**
 * A Form/Dataform → { shell doc, draft blob (entity graph) }.
 * fields: [{ name, type, required?, ref?(targetModelId), referredList?, currency?, formula? }]
 * Layout: one Section, each field on its own row (full width). Computed fields carry an
 * Expression with the raw ExpressionStr (the platform AI compiles the node tree on publish;
 * the engine emits the string + a placeholder node so the shape is valid).
 */
export function buildForm(spec, appId, idmap = {}, flowTypes = {}) {
  const resolve = (logical) => idmap[logical] || logical; // logical IR ref → generated id
  // QD FlowType must be the TARGET's real flow type (Form|Process|Case) — real exports confirm;
  // a wrong type breaks reference resolution at runtime. Unknown targets default to Form.
  const refFlowType = (ref) => flowTypes[ref] || flowTypes[resolve(ref)] || "Form";
  const modelId = spec.id || `${slug(spec.name)}_A00`;
  const blob = { Root: modelId };
  const model = {
    Id: modelId, Name: spec.name, Kind: "Model", FlowType: spec.flowType || "Form",
    Description: spec.description || "", "Model::Row": [], "Model::Field": [],
  };
  blob[modelId] = model;

  // GRID LAYOUT — group fields into sections, pack by width into 6-wide rows (mirrors SDK
  // __create_field_in_section). Default width 3 (two per row); long fields span full width.
  const widthOf = (f) => f.width || (["Textarea", "Table", "Attachment", "Image", "Geolocation"].includes(f.type) ? 6 : 3);
  const orderedSections = [];
  for (const f of spec.fields || []) {
    const sName = f.section || spec.section || "Details";
    let s = orderedSections.find((x) => x.name === sName);
    if (!s) orderedSections.push((s = { name: sName, fields: [] }));
    s.fields.push(f);
  }
  const colOf = {};
  orderedSections.forEach((sec, si) => {
    const sRow = eid("Row", modelId + ":sec" + si), sCol = eid("Column", modelId + ":sec" + si);
    model["Model::Row"].push(sRow);
    blob[sRow] = { Id: sRow, Kind: "Row", Model: modelId, "Row::Column": [sCol] };
    blob[sCol] = { Id: sCol, Kind: "Column", Type: "Section", Name: sec.name, Start: 0, End: 6, Row: sRow, "Column::Row": [] };
    let curRow = null, used = 0, rn = 0;
    for (const f of sec.fields) {
      const fid = f.id || slug(f.name), w = widthOf(f);
      if (!curRow || used + w > 6) {
        curRow = eid("Row", modelId + ":s" + si + "r" + rn++);
        blob[sCol]["Column::Row"].push(curRow);
        blob[curRow] = { Id: curRow, Kind: "Row", Column: sCol, "Row::Column": [] };
        used = 0;
      }
      const colId = eid("Column", modelId + ":" + fid);
      blob[curRow]["Row::Column"].push(colId);
      blob[colId] = { Id: colId, Kind: "Column", Type: "Field", Start: used, End: used + w, Row: curRow, "Column::Field": [fid] };
      used += w;
      colOf[fid] = colId;
    }
  });

  for (const f of spec.fields || []) {
    const fid = f.id || slug(f.name);
    const colId = colOf[fid];
    const field = { Id: fid, Kind: "Field", Type: f.type, Name: f.name, Model: modelId, Column: colId };
    if (f.required) field.Required = true;
    if (f.type === "Currency") field.CurrencyTypes = [f.currency || "USD"];
    // Attach a list reference ONLY when referredList names a real list (in idmap). The old
    // `|| f.name` fallback turned any plain Select into a phantom list ref (the field name),
    // which the remap never resolves → dangling cross-ref → the whole form/process is skipped.
    if ((f.type === "Select" || f.type === "Multiselect") && f.referredList && idmap[f.referredList]) field.ReferredList = idmap[f.referredList];

    // reference / user lookup
    if (REF_TYPES.has(f.type)) {
      const qdId = eid("QueryDefinition", modelId + ":" + fid);
      field["Field::QueryDefinition"] = [qdId];
      const isUser = f.type.startsWith("User") || f.type === "MultiUser";
      blob[qdId] = {
        Id: qdId, Kind: "QueryDefinition", Field: fid,
        LHSModel: isUser ? "User" : resolve(f.ref || ""), FlowType: isUser ? "User" : refFlowType(f.ref || ""),
        LookupField: (f.lookup || []).map((l) => ({ Id: l.id || slug(l.name), Name: l.name, Type: l.type || "Text" })),
        HiddenField: f.hidden || [],
      };
      enrichLookup(blob, qdId, f);
    }
    // computed field: compile f.formula → Expression::Node AST (mirrors the SDK). If the formula
    // can't be compiled (unsupported shape), DEGRADE to a manual field rather than emit a broken
    // empty-node Expression (which 500s on publish).
    if (f.formula) {
      const exId = eid("Expression", modelId + ":" + fid);
      blob[exId] = { Id: exId, Kind: "Expression", Field: fid, ExpressionStr: f.formula, "Expression::Node": [] };
      if (compileFormula(blob, exId, f.formula, f.type, modelId)) field["Field::Expression"] = [exId];
      else delete blob[exId];
    }
    // SequenceNumber requires a Field::Property (Padding) — without it, publish 500s
    if (f.type === "SequenceNumber") {
      const padId = eid("Property", modelId + ":" + fid + ":pad");
      field["Field::Property"] = [padId];
      blob[padId] = { Id: padId, Kind: "Property", Name: "Padding", Field: fid, Value: f.padding || "0001", ValueType: "Value" };
    }
    blob[fid] = field;
    addAggregate(blob, field, f, fid, resolve);
    model["Model::Field"].push(fid);
  }

  return {
    type: spec.flowType?.toLowerCase() || "form", id: modelId,
    shell: { Name: spec.name, Description: spec.description || "", _application_id: appId },
    blob,
  };
}

/**
 * A role's landing page — translates the experience-designer's CARDS into a rich, role-specific
 * INTERMEDIATE (KPI cards, scope-mapped data tables, charts), so each role's dashboard differs.
 * Card: { label, view:"kpi"|"list"|"chart", scope:"my-items"|"my-team"|"all", metric:"count"|"sum:F",
 *         source_flow, filter:{status?|groupBy?} }. flowInfo: { name: {genId, flowType, fields:{slug→id}} }.
 * Returns the intermediate only — applyIR compiles it via Kissflow's REAL transformer.py.
 */
export function buildPage(spec, appId, flowInfo = {}) {
  const ACCENTS = [["Color.Primary.100", "Color.Primary.600"], ["Color.Secondary.Five.100", "Color.Secondary.Five.600"], ["Color.Secondary.One.100", "Color.Secondary.One.600"], ["Color.Secondary.Three.100", "Color.Secondary.Three.600"], ["Color.Secondary.Six.100", "Color.Secondary.Six.600"]];
  const ICONS = ["file-solid.svg", "clock-solid.svg", "dollar-sign-solid.svg", "chart-bar-solid.svg", "check-solid.svg", "bell-solid.svg"];
  const label = (t, sz, c, w) => ({ type: "Label", properties: { title: t }, style: { fontSize: sz, color: c, ...(w ? { fontWeight: w } : {}) } });
  const panel = { background: "Color.White", borderWidth: "1px", borderStyle: "solid", borderColor: "Color.Gray.200", borderRadius: "12px" };
  const card = (title, desc, icon, bg, fg, width) => ({ type: "Container", layout: "horizontal", style: { width, height: "auto", wrap: "nowrap", alignItems: "center", gap: "14px", ...panel, paddingTop: "18px", paddingBottom: "18px", paddingLeft: "20px", paddingRight: "20px" }, children: [
    { type: "Icon", properties: { iconUrl: icon }, style: { width: "44px", height: "44px", bgColor: bg, color: fg, borderRadius: "10px", paddingTop: "11px", paddingBottom: "11px", paddingLeft: "11px", paddingRight: "11px" } },
    { type: "Container", layout: "vertical", style: { width: "100%", height: "auto", wrap: "nowrap", gap: "4px" }, children: [label(title, "15px", "Color.Gray.900", "Font.Weight.SemiBold"), label(desc, "13px", "Color.Gray.500")] }] });
  const section = (title, widget) => ({ type: "Container", layout: "vertical", style: { width: "100%", height: "auto", wrap: "nowrap", gap: "12px", ...panel, paddingTop: "20px", paddingBottom: "20px", paddingLeft: "20px", paddingRight: "20px" }, children: [label(title, "16px", "Color.Gray.900", "Font.Weight.SemiBold"), widget] });
  // View mapping is ROLE-AWARE: the `admin` (all-items) process view requires Manage-level access,
  // which only a true admin role has. A non-admin role (an approver) must use `mytasks` — its own
  // pending tasks, accessible to any process member — else the table walls off with "no access".
  // Only a TRUE admin/reporting role gets the all-items `admin` view. Match the role name ending in
  // "Admin" (Admin, General_Admin) — NOT "...Administrator" (e.g. BT_Administrator is an approver,
  // not an app admin, and must use mytasks or it walls off).
  const isAdminRole = /(^|[_ ])admin$/i.test(spec.role || "");
  const viewId = (scope, ft) => {
    if (ft !== "Process") return "allitems";
    if (scope === "my-items") return "myitems";
    if (scope === "all" && isAdminRole) return "admin";
    return "mytasks"; // my-team, or a non-admin "all" (an approval queue) → the role's own tasks
  };
  const metricDesc = (c) => c.metric === "count" ? "Count" : (c.metric || "").startsWith("sum:") ? "Total " + c.metric.slice(4) : (c.metric || "");
  const fieldId = (info, name) => info?.fields?.[slug(String(name || "")).toLowerCase()];

  const cards = spec.cards || [];
  const popups = []; // top-level Popup specs the transformer renders (create-form popups)
  const btn = (caption, popupId) => ({ type: "Button", name: caption, properties: { caption, type: "primary", size: "base" }, onClick: { type: "openPopup", popupId }, style: { width: "auto" } });
  const children = [
    { type: "Container", layout: "horizontal", style: { width: "100%", height: "auto", wrap: "nowrap", justifyContent: "space-between", alignItems: "center", ...panel, paddingTop: "20px", paddingBottom: "20px", paddingLeft: "24px", paddingRight: "24px" }, children: [
      { type: "Container", layout: "vertical", style: { width: "100%", height: "auto", wrap: "nowrap", gap: "4px" }, children: [label(spec.name, "24px", "Color.Gray.900", "Font.Weight.SemiBold"), label(spec.description || `${spec.role || ""} dashboard`, "14px", "Color.Gray.500")] }] },
  ];
  // KPI cards row
  const kpis = cards.filter((c) => c.view === "kpi");
  if (kpis.length) {
    const w = `calc(${(100 / kpis.length).toFixed(2)}% - ${Math.round((16 * (kpis.length - 1)) / kpis.length)}px)`;
    children.push({ type: "Container", layout: "horizontal", style: { width: "100%", height: "auto", wrap: "nowrap", columnGap: "16px" }, children: kpis.map((c, i) => card(c.label, metricDesc(c), ICONS[i % ICONS.length], ACCENTS[i % ACCENTS.length][0], ACCENTS[i % ACCENTS.length][1], w)) });
  }
  // list + chart sections (in card order)
  for (const c of cards) {
    const info = flowInfo[c.source_flow]; if (!info || c.view === "kpi") continue;
    const isProc = (info.flowType || "Form") === "Process";
    if (c.view === "list") {
      const st = Array.isArray(c.filter?.status) ? c.filter.status[0] : c.filter?.status;
      const tbl = isProc
        ? { type: "ProcessTable", name: c.label, process: { processId: info.genId, viewId: viewId(c.scope, "Process") }, properties: { showform: true, ...(st ? { status: st } : {}) }, style: { width: "100%", height: "420px" } }
        : { type: "DataformTable", name: c.label, dataform: { formId: info.genId, viewId: "allitems" }, properties: { showform: true }, style: { width: "100%", height: "420px" } };
      children.push(section(c.label, tbl));
    } else if (c.view === "chart" && isProc) {
      const dim = fieldId(info, c.filter?.groupBy), meas = (c.metric || "").startsWith("sum:") ? fieldId(info, c.metric.slice(4)) : null;
      if (dim) children.push(section(c.label, { type: "ChartReport", name: c.label, report: { processId: info.genId, generate: { viewType: "BarColumnChart", dimensionFieldId: dim, measureFieldId: meas || dim, aggregateFunction: meas ? "SUM" : "COUNT" } }, style: { width: "100%", height: "360px" } }));
    } else if (c.view === "action" || c.view === "create") {
      // CREATE action — a "New <flow>" Button that opens a HIDDEN popup containing the flow's create
      // FormView (a bare ProcessTable has NO native +New; the create affordance is Button→Popup→FormView
      // per the transformer's own catalog). The flow's worklist sits below so the page doubles as the
      // "My <flow>" list. Emitted on pages of roles that may INITIATE this flow.
      const popupId = `Popup_new_${slug(c.source_flow)}`;
      const form = isProc
        ? { type: "FormView", name: "New " + c.label, process: { processId: info.genId } }
        : { type: "FormView", name: "New " + c.label, dataform: { formId: info.genId } };
      popups.push({ id: popupId, title: "New " + c.label, children: [form] });
      const tbl = isProc
        ? { type: "ProcessTable", name: c.label, process: { processId: info.genId, viewId: viewId(c.scope || "my-items", "Process") }, style: { width: "100%", height: "460px" } }
        : { type: "DataformTable", name: c.label, dataform: { formId: info.genId, viewId: "allitems" }, style: { width: "100%", height: "460px" } };
      children.push({ type: "Container", layout: "vertical", style: { width: "100%", height: "auto", wrap: "nowrap", gap: "14px", ...panel, paddingTop: "20px", paddingBottom: "20px", paddingLeft: "20px", paddingRight: "20px" }, children: [
        { type: "Container", layout: "horizontal", style: { width: "100%", height: "auto", wrap: "nowrap", justifyContent: "space-between", alignItems: "center" }, children: [label(c.label, "16px", "Color.Gray.900", "Font.Weight.SemiBold"), btn("New " + c.label, popupId)] },
        tbl,
      ] });
    }
  }
  const intermediate = { page: { name: spec.name, description: spec.description || "" }, ...(popups.length ? { popups } : {}), body: { style: { width: "100%", height: "auto", wrap: "nowrap", background: "Color.Gray.100", paddingTop: "24px", paddingBottom: "24px", paddingLeft: "24px", paddingRight: "24px", rowGap: "20px" }, children } };
  return { type: "page", id: `${slug(spec.name)}_A00`, shell: { Name: spec.name, Description: spec.description || "" }, intermediate };
}

// Build one field entity into a blob under a given model (no layout column needed for
// child-table fields). Shared by child-table embedding.
function buildFieldInto(blob, modelId, f, idmap, withColumn, flowTypes = {}) {
  const resolve = (l) => idmap[l] || l;
  const refFlowType = (ref) => flowTypes[ref] || flowTypes[resolve(ref)] || "Form";
  const fid = f.id || slug(f.name);
  const field = { Id: fid, Kind: "Field", Type: f.type, Name: f.name, Model: modelId };
  if (withColumn) field.Column = withColumn;
  if (f.required) field.Required = true;
  if (f.type === "Currency") field.CurrencyTypes = [f.currency || "USD"];
  if ((f.type === "Select" || f.type === "Multiselect") && f.referredList && idmap[f.referredList]) field.ReferredList = idmap[f.referredList];
  if (REF_TYPES.has(f.type)) {
    const qdId = eid("QueryDefinition", modelId + ":" + fid);
    field["Field::QueryDefinition"] = [qdId];
    const isUser = f.type.startsWith("User") || f.type === "MultiUser";
    blob[qdId] = { Id: qdId, Kind: "QueryDefinition", Field: fid, LHSModel: isUser ? "User" : resolve(f.ref || ""), FlowType: isUser ? "User" : refFlowType(f.ref || ""), LookupField: (f.lookup || []).map((l) => ({ Id: l.id || slug(l.name), Name: l.name, Type: l.type || "Text" })), HiddenField: f.hidden || [] };
    enrichLookup(blob, qdId, f);
  }
  blob[fid] = field; // field must exist before compiling a formula that may reference siblings
  addAggregate(blob, field, f, fid, resolve);
  if (f.formula) {
    const exId = eid("Expression", modelId + ":" + fid);
    blob[exId] = { Id: exId, Kind: "Expression", Field: fid, ExpressionStr: f.formula, "Expression::Node": [] };
    if (compileFormula(blob, exId, f.formula, f.type, modelId)) field["Field::Expression"] = [exId];
    else delete blob[exId];
  }
  if (f.type === "SequenceNumber") {
    const padId = eid("Property", modelId + ":" + fid + ":pad");
    field["Field::Property"] = [padId];
    blob[padId] = { Id: padId, Kind: "Property", Name: "Padding", Field: fid, Value: f.padding || "0001", ValueType: "Value" };
  }
  return fid;
}

/** Embed a child table — mirrors ProcessSDK/BaseFormSDK.create_table:
 *  Model → Row → Column(Type=Model) → child Model → Row → Column(Type=Field) → Field. */
export function addChildTable(parent, childSpec, fieldLabel, idmap, flowTypes = {}) {
  const blob = parent.blob, parentId = parent.id;
  const childId = childSpec.id || `${slug(childSpec.name)}_A00`;
  const rowId = eid("Row", parentId + ":ct:" + childId), colId = eid("Column", parentId + ":ct:" + childId);
  blob[parentId]["Model::Row"].push(rowId);
  blob[rowId] = { Id: rowId, Kind: "Row", Model: parentId, "Row::Column": [colId] };
  blob[colId] = { Id: colId, Kind: "Column", Type: "Model", Name: fieldLabel || childSpec.name, Start: 0, End: 6, AllowImport: false, Row: rowId, "Column::Model": [childId] };
  const child = { Id: childId, Kind: "Model", Name: childSpec.name, Model: parentId, Column: colId, "Model::Row": [], "Model::Field": [] };
  blob[childId] = child;
  // table fields are COLUMNS — all in ONE row, sequential (Start=0,End=0), per SDK __create_field_in_table
  const tRow = eid("Row", childId + ":row");
  child["Model::Row"].push(tRow);
  blob[tRow] = { Id: tRow, Kind: "Row", Model: childId, "Row::Column": [] };
  for (const f0 of childSpec.fields || []) {
    // Child-field ids default to slug(name). If that id is already taken (a sibling child table
    // of the same parent, or the parent itself, has the same field name — e.g. "Vendor ID" in
    // both Independent & Resigned member tables), namespace it by the child model so the two
    // don't collide and orphan a QueryDefinition. We clone the spec (never mutate the IR, so
    // buildApp stays deterministic); formulas still resolve because compileFormula matches
    // operands by field NAME, not id.
    const base = f0.id || slug(f0.name);
    const f = (!f0.id && blob[base]) ? { ...f0, id: `${childId}_${slug(f0.name)}` } : f0;
    const fid = f.id || slug(f.name);
    const fcol = eid("Column", childId + ":" + fid);
    blob[tRow]["Row::Column"].push(fcol);
    blob[fcol] = { Id: fcol, Kind: "Column", Type: "Field", Start: 0, End: 0, Row: tRow, "Column::Field": [fid] };
    buildFieldInto(blob, childId, f, idmap, fcol, flowTypes);
    child["Model::Field"].push(fid);
  }
}

/** Author a process workflow inline into the process model blob (export-verified shape).
 * Per-step field access: default Editable at Start / ReadOnly elsewhere, overridable via
 * step.field_permissions { "<field or child-table name>": Editable|ReadOnly|Hidden|Mandatory }
 * (process activities accept all four levels — Mandatory = required-at-this-step). */
export function addWorkflow(parent, steps, roleIds) {
  const blob = parent.blob, modelId = parent.id, model = blob[modelId];
  // layout columns of the top-level form fields (child-table internal fields have no Column)
  const fieldCols = Object.values(blob).filter((e) => e && e.Kind === "Field" && e.Model === modelId && e.Column).map((f) => f.Column);
  // child-table columns (Type:Model) ALSO need a per-step permission — without one Kissflow
  // hides the whole table in the form (no permission = not shown). Their Row is a top-level
  // row of the parent model. Append them so each step grants the tables visibility.
  const childTableCols = Object.values(blob).filter((e) => e && e.Kind === "Column" && e.Type === "Model" && blob[e.Row]?.Model === modelId).map((e) => e.Id);
  const allCols = [...fieldCols, ...childTableCols];
  // name → layout column, for resolving field_permissions overrides (field Name, child-table
  // Column Name, and the nested child Model Name all address the same table column)
  const normName = (s) => String(s ?? "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const nameToCol = {};
  for (const e of Object.values(blob)) if (e && e.Kind === "Field" && e.Model === modelId && e.Column) nameToCol[normName(e.Name)] = e.Column;
  for (const cId of childTableCols) {
    const c = blob[cId];
    if (c.Name) nameToCol[normName(c.Name)] = cId;
    const cm = blob[(c["Column::Model"] || [])[0]];
    if (cm?.Name) nameToCol[normName(cm.Name)] = cId;
  }
  const pdId = eid("ProcessDef", modelId);
  model["Model::ProcessDef"] = [pdId];
  model.RootProcessDef = pdId;
  blob[pdId] = { Id: pdId, Kind: "ProcessDef", WorkflowType: "Sequence", Model: modelId, "ProcessDef::Activity": [] };
  (steps || []).forEach((s, i) => {
    const aId = eid("Activity", modelId + ":" + s.name);
    const nodeType = i === 0 ? "StartEvent" : i === steps.length - 1 ? "EndEvent" : "UserTask";
    const act = { Id: aId, Kind: "Activity", NodeType: nodeType, Name: s.name, ProcessDef: pdId, "Activity::Permission": [] };
    blob[pdId]["ProcessDef::Activity"].push(aId);
    // one Permission per field per step (initiator edits at Start; reviewers read elsewhere;
    // step.field_permissions overrides per field — mid-flow edits, Hidden, Mandatory)
    const defLevel = nodeType === "StartEvent" ? "Editable" : "ReadOnly";
    const overrides = {};
    for (const [k, v] of Object.entries(s.field_permissions || {})) {
      const col = nameToCol[normName(k)];
      if (col) overrides[col] = v;
    }
    for (const col of allCols) {
      const pId = eid("Permission", aId + ":" + col);
      act["Activity::Permission"].push(pId);
      blob[pId] = { Id: pId, Kind: "Permission", Column: col, Permission: overrides[col] || defLevel, Activity: aId };
    }
    // assignee only on UserTask steps (not Start/End)
    if (nodeType === "UserTask" && s.actor && roleIds[s.actor]) {
      const rId = eid("Resource", aId);
      act["Activity::Resource"] = [rId];
      blob[rId] = { Id: rId, Kind: "Resource", ValueType: "AppRole", DisplayValue: s.actor, Value: roleIds[s.actor], Activity: aId };
    }
    blob[aId] = act;
  });
  // Appearance → Style (card display config every process model carries)
  const appId = eid("Appearance", modelId), styleId = eid("Style", modelId);
  model["Model::Appearance"] = [appId];
  blob[appId] = { Id: appId, Kind: "Appearance", Model: modelId, "Appearance::Style": [styleId] };
  blob[styleId] = { Id: styleId, Kind: "Style", Appearance: appId };
  // action-button row (every process model carries a Button::Row)
  const browId = eid("Row", modelId + ":buttons");
  model["Button::Row"] = [browId];
  blob[browId] = { Id: browId, Kind: "Row", Button: modelId };
}

// The 4 system swimlane States every board carries (golden-eval: ProfServ Projects/Enquiry/Tasks).
const BOARD_STATES = [
  { Id: "State_Not_Started", Name: "Not started", Category: "NotStarted", IsSystem: true, IsDefaultState: true, IsLastState: false },
  { Id: "State_In_Progress", Name: "In progress", Category: "InProgress", IsSystem: true, IsDefaultState: false, IsLastState: false },
  { Id: "State_On_Hold", Name: "On hold", Category: "NotStarted", IsSystem: true, IsDefaultState: false, IsLastState: false },
  { Id: "State_Done", Name: "Done", Category: "Closed", IsSystem: true, IsDefaultState: false, IsLastState: true },
];

/**
 * A BOARD (Kissflow Case flow) → the Model (`FlowType:"Case"`) PLUS a SEPARATE CaseFlow blob (the
 * Statuses = board columns + the 4 system swimlane States). A board models an UNSTRUCTURED workflow:
 * the user moves each card between statuses freely (no system routing) — todos, tasks, projects, and
 * case use-cases (service requests, support, onboarding). This is the counterpart to a Process
 * (structured, system-routed steps). Golden-eval shape.
 *
 * spec: { name, id?, fields:[…], section?, statuses?:[{ name, category? }] }
 *   `statuses` default to a generic To Do → In Progress → Done lifecycle. `category` ∈
 *   NotStarted | InProgress | Done | Closed | ReOpened. Each status's OutwardStatus lists every OTHER
 *   status (free movement — the trait that distinguishes a board from a process). A system "Reopened"
 *   status is appended (matches the golden eval). The form layout/fields reuse buildForm.
 *
 * Returns the standard { type:"case", id, shell, blob } for the Model, PLUS a `caseflow` sub-artifact
 * { type:"caseflow", id, parentModel, shell, blob } that the publish path emits after the model.
 */
export function buildBoard(spec, appId, idmap = {}, flowTypes = {}) {
  const form = buildForm({ ...spec, flowType: "Case" }, appId, idmap, flowTypes); // Model(FlowType:Case) + fields + layout
  form.type = "case";
  const modelId = form.id;

  // Model::Appearance (Appearance + Style holder) — every UI-built board/case model carries this pair (it's
  // the card-display config holder). buildForm omits it; without it the case model is structurally
  // incomplete vs a real board. (Verified missing by diffing against a UI-built Service Request board.)
  const apId = eid("Appearance", modelId), stId = eid("Style", modelId);
  form.blob[modelId]["Model::Appearance"] = [apId];
  form.blob[apId] = { Id: apId, Kind: "Appearance", Model: modelId, "Appearance::Style": [stId] };
  form.blob[stId] = { Id: stId, Kind: "Style", Appearance: apId };

  const cfId = eid("CaseFlow", modelId);
  const cfBlob = { Root: cfId };
  const specStatuses = (spec.statuses && spec.statuses.length) ? spec.statuses
    : [{ name: "To Do", category: "NotStarted" }, { name: "In Progress", category: "InProgress" }, { name: "Done", category: "Done" }];
  const built = specStatuses.map((s) => ({ id: eid("Status", modelId + ":" + s.name), name: s.name, category: s.category || "InProgress", isSystem: false }));
  built.push({ id: eid("Status", modelId + ":Reopened"), name: "Reopened", category: "ReOpened", isSystem: true });

  const statusIds = [];
  for (const b of built) {
    cfBlob[b.id] = {
      Id: b.id, Kind: "Status", Name: b.name, Category: b.category, IsSystem: b.isSystem, Resources: [],
      OutwardStatus: built.filter((x) => x.id !== b.id).map((x) => x.id), // unstructured: reachable from any status
      EntryRule: [], ExitRule: [], Rule: [], SLADisabled: false,
    };
    statusIds.push(b.id);
  }
  const stateIds = [];
  for (const s of BOARD_STATES) { cfBlob[s.Id] = { ...s, Kind: "State" }; stateIds.push(s.Id); }

  cfBlob[cfId] = {
    Id: cfId, Name: `${spec.name} flow`, Kind: "CaseFlow", Model: modelId, Type: "Case", FlowType: "CaseFlow",
    "CaseFlow::Status": statusIds, "CaseFlow::State": stateIds,
  };
  form.caseflow = { type: "caseflow", id: cfId, parentModel: modelId, shell: { Name: `${spec.name} flow`, _application_id: appId }, blob: cfBlob };
  return form;
}

/**
 * Build the PAGE entity-graph that embeds a Kanban board (+ header + a default "New <Item>" button that
 * opens the create-form popup). Grafts onto the page's starter `draft` (which ships a Body Container001).
 * CRITICAL (verified vs live Retail pages): a component's flow binding lives in its CONTAINER's
 * `Container::FieldMapping`, NOT the component's Data. Current manifests: kanban=`view/kanban`/`Kanban`,
 * form=`view/form`/`Form` (the `case/views/kanban` + `case/form` from older exports are DEPRECATED and
 * render "board view not found"). See reference/BOARD-AND-KANBAN-PAGE.md.
 * spec: { pageId, caseId, viewId?(=<caseId>_all), title, subtitle?, itemLabel?(="Item"), newButton?(=true) }
 */
export function buildKanbanPage(spec, draft) {
  const d = draft && draft.Root ? draft : { Root: spec.pageId, [spec.pageId]: { Id: spec.pageId, Kind: "Page", "Page::Container": ["Container001"] }, Container001: { Id: "Container001", Kind: "Container", Type: "Body", Name: "Body", Page: spec.pageId, "Container::Style": [] } };
  const PID = spec.pageId, CASE = spec.caseId, VIEW = spec.viewId || `${CASE}_all`, root = d.Root, body = "Container001";
  const keep = new Set([root, body, ...(d[body]["Container::Style"] || [])]);
  for (const k of Object.keys(d)) { if (k === "Root") continue; const v = d[k]; if (v && v.Kind === "User") continue; if (!keep.has(k) && v && v.Kind) delete d[k]; }
  let n = 0; const nid = (p) => `${p}_${eid(p, PID + (++n)).replace(/^[^_]*_/, "")}`;
  const st = (h, val) => { const s = nid("Style"); d[s] = { Id: s, Kind: "Style", Container: h, ...(val ? { Value: val } : {}) }; return s; };
  const cn = (type, parent, arrays = {}, sv) => { const c = nid("Container"); d[c] = { Id: c, Kind: "Container", Type: type, Name: type, Container: parent, "Container::Style": [st(c, sv)], ...arrays }; return c; };
  const fmv = (h, name, value, type = "Value") => { const f = nid("FieldMapping"), p = nid("Property"); d[f] = { Id: f, Kind: "FieldMapping", Name: name, Container: h, "FieldMapping::Property": [p] }; d[p] = { Id: p, Kind: "Property", Type: type, Value: value, FieldMapping: f }; return f; };
  const label = (parent, title, fs, color) => { const slot = cn("Component", parent, { "Container::Component": [] }); const c = nid("Label"); d[c] = { Id: c, Kind: "Component", Script: { web: "general/label" }, Name: "Label", Page: PID, Container: slot, Data: { manifest_id: "Label", category: "general", visualization_type: "label" } }; d[slot]["Container::Component"] = [c]; d[slot]["Container::FieldMapping"] = [fmv(slot, "title", title), fmv(slot, "fontSize", fs), ...(color ? [fmv(slot, "color", color)] : [])]; return c; };

  // HEADER — title + optional subtitle, each in its own row
  const header = cn("Container", body, { "Container::Container": [] }, { marginBottom: "12px" });
  const hkids = [], comps = [];
  { const r = cn("Container", header, { "Container::Container": [] }); const l = label(r, spec.title || "Board", "24px"); d[r]["Container::Container"] = [d[l].Container]; hkids.push(r); comps.push(l); }
  if (spec.subtitle) { const r = cn("Container", header, { "Container::Container": [] }); const l = label(r, spec.subtitle, "14px", "#5b6b83"); d[r]["Container::Container"] = [d[l].Container]; hkids.push(r); comps.push(l); }
  d[header]["Container::Container"] = hkids;

  const kanId = nid("Kanban");
  const bodyKids = [header];
  const pagePopups = [];

  // NEW-<Item> BUTTON + create-form popup (default for kanban pages)
  if (spec.newButton !== false) {
    const popup = nid("Popup"), popCont = nid("Container"), formCont = cn("Component", popCont, { "Container::Component": [] }), form = nid("Form");
    d[popCont] = { Id: popCont, Kind: "Container", Type: "Popup", Name: "Popup", Popup: popup, "Container::Style": [st(popCont)], "Container::Container": [formCont] };
    d[form] = { Id: form, Kind: "Component", Script: { web: "view/form" }, Name: "Case form", Page: PID, Container: formCont, Data: { manifest_id: "Form", category: "view", visualization_type: "form", flow_type: "Case", flow_id: CASE } };
    d[formCont]["Container::Component"] = [form];
    d[formCont]["Container::FieldMapping"] = [fmv(formCont, "flow_id", CASE), fmv(formCont, "flow_type", "Case")];
    const jsCode = `let component = await kf.app.page.getComponent("${kanId}")\ncomponent.refresh();\nkf.app.page.popup.close()`;
    const evJS = (name) => { const e = nid("EventMapping"), p = nid("Property"); d[e] = { Id: e, Kind: "EventMapping", Container: formCont, Name: name, Type: "JSAction", "EventMapping::Property": [p] }; d[p] = { Id: p, Kind: "Property", Type: "Code", Value: jsCode, EventMapping: e }; return e; };
    d[formCont]["Container::EventMapping"] = [evJS("on_submit"), evJS("on_discard")];
    d[popup] = { Id: popup, Kind: "Popup", Script: { web: "general/popup" }, Name: `New ${spec.itemLabel || "Item"} Popup`, Page: PID, "Popup::Container": [popCont], "Popup::Style": [st(popup)] };
    pagePopups.push(popup); comps.push(form);
    const btnRow = cn("Container", body, { "Container::Container": [] }, { display: "flex", justifyContent: "flex-end", marginBottom: "8px" });
    const btnSlot = cn("Component", btnRow, { "Container::Component": [] }); const btn = nid("Button");
    d[btn] = { Id: btn, Kind: "Component", Script: { web: "general/button" }, Name: "Button", Page: PID, Container: btnSlot, Data: { manifest_id: "Button", category: "general", subcategory: "system", visualization_type: "button" } };
    d[btnSlot]["Container::Component"] = [btn];
    d[btnSlot]["Container::FieldMapping"] = [fmv(btnSlot, "caption", `New ${spec.itemLabel || "Item"}`), fmv(btnSlot, "size", "medium"), fmv(btnSlot, "type", "primary"), fmv(btnSlot, "iconPosition", "left")];
    const ce = nid("EventMapping"), cp = nid("Property"); d[ce] = { Id: ce, Kind: "EventMapping", Container: btnSlot, Name: "on_click", Type: "OpenPopup", "EventMapping::Property": [cp] }; d[cp] = { Id: cp, Kind: "Property", Type: "Popup", Name: "popup_params", Value: popup, EventMapping: ce };
    d[btnSlot]["Container::EventMapping"] = [ce]; d[btnRow]["Container::Container"] = [btnSlot];
    bodyKids.push(btnRow); comps.push(btn);
  }

  // BOARD — Kanban component; flow binding in the CONTAINER's FieldMappings
  const bouter = cn("Container", body, { "Container::Container": [] }, { height: "640px" });
  const bslot = cn("Component", bouter, { "Container::Component": [] }, { "Kanban.Height": { value: "100%" } });
  d[kanId] = { Id: kanId, Kind: "Component", Script: { web: "view/kanban" }, Name: "Kanban", Page: PID, Container: bslot, Data: { manifest_id: "Kanban", category: "view", visualization_type: "kanban", flow_type: "Case", flow_id: CASE, view_id: VIEW } };
  d[bslot]["Container::Component"] = [kanId];
  d[bslot]["Container::FieldMapping"] = [fmv(bslot, "flow_type", "Case"), fmv(bslot, "flow_id", CASE), fmv(bslot, "view_id", VIEW), fmv(bslot, "showform", false), fmv(bslot, "filterParameters", null, "FilterParam")];
  d[bouter]["Container::Container"] = [bslot];
  bodyKids.push(bouter); comps.push(kanId);

  d[body]["Container::Container"] = bodyKids;
  d[root]["Page::Component"] = comps;
  if (pagePopups.length) d[root]["Page::Popup"] = pagePopups;
  return d;
}

/** Build a per-(role,model) permission artifact. Permission{Column, Permission} is the
 *  export shape; the holder Kind is a projection (wired to the real formview/activity on publish). */
export function buildPermission(perm, ir, idmap, roleIds) {
  const modelId = idmap[perm.model] || perm.model;
  const roleId = roleIds[perm.role] || perm.role;
  const id = eid("Perm", perm.role + ":" + perm.model);
  const form = (ir.forms || []).find((f) => (f.id || f.name) === perm.model);
  const holder = { Id: id, Kind: "FlowPermission", Role: roleId, RoleName: perm.role, Model: modelId, Level: perm.level || "Editable", Scope: perm.scope || "all", "FlowPermission::Permission": [] };
  const blob = { Root: id, [id]: holder };
  for (const f of form?.fields || []) {
    const fid = f.id || slug(f.name);
    const pId = eid("Permission", id + ":" + fid);
    holder["FlowPermission::Permission"].push(pId);
    blob[pId] = { Id: pId, Kind: "Permission", Column: fid, Permission: f.level || perm.level || "Editable" };
  }
  return { type: "permission", id, blob };
}

/** Orchestrate IR → artifacts in CANONICAL ORDER:
 *  roles → lists/masters → forms/flows (+ embedded child tables + workflow) → permissions → pages. */
export function buildApp(ir) {
  const appId = ir.app?.id || `${slug(ir.app?.name || "App")}_A00`;
  const idmap = {};
  for (const l of ir.lists || ir.datasets || []) idmap[l.id || l.name] = l.id || `${slug(l.name)}_A00`;
  for (const f of ir.forms || []) idmap[f.id || f.name] = f.id || `${slug(f.name)}_A00`;
  const roleIds = {};
  for (const r of ir.roles || []) roleIds[r.name] = r.id || eid("Ro", r.name);
  // child relationships from BOTH the explicit ir.childTables array AND forms tagged `childOf`
  const childRels = [
    ...(ir.childTables || []).map((ct) => ({ parent: ct.parent, child: ct.child, field: ct.field })),
    ...(ir.forms || []).filter((f) => f.childOf).map((f) => ({ parent: f.childOf, child: f.id || f.name, field: f.tableLabel || f.name })),
  ];
  const childNames = new Set(childRels.map((c) => c.child));

  // NORMALIZE field types + WIRE UP unlinked Selects. An invalid/alias type (e.g. "YesNo") and a
  // Select with neither a list nor options both fail to publish. The Select's data source usually
  // exists (a list, or a master FORM) — it just wasn't wired. Link it by name (exact, else suffix
  // match to absorb prefixes), as a list (→ Select) or a master form (→ Reference). Never silently
  // drop a Select to Text.
  const TYPE_ALIAS = { YesNo: "Boolean", "Yes/No": "Boolean", YesOrNo: "Boolean", Dropdown: "Select", DropDown: "Select", Datetime: "DateTime", LongText: "Textarea" };
  const nrm = (s) => String(s || "").toLowerCase().replace(/\bmaster\b|\(.*?\)|[^a-z0-9]/g, "");
  const listIdx = (ir.lists || []).map((l) => ({ name: l.name, n: nrm(l.name) }));
  const formIdx = (ir.forms || []).map((f) => ({ name: f.id || f.name, n: nrm(f.name) }));
  const matchBy = (idx, t) => t.length > 3 && (idx.find((x) => x.n === t) || idx.find((x) => x.n.endsWith(t)))?.name;
  for (const f of ir.forms || []) for (const fld of f.fields || []) {
    if (TYPE_ALIAS[fld.type]) fld.type = TYPE_ALIAS[fld.type];
    if ((fld.type === "Select" || fld.type === "Multiselect") && (!fld.referredList || !idmap[fld.referredList])) {
      const t = nrm(fld.name);
      const li = matchBy(listIdx, t);
      if (li) fld.referredList = li;                                   // wire to its list
      else {
        const fo = matchBy(formIdx, t);
        if (fo) { fld.type = "Reference"; fld.ref = fo; delete fld.referredList; } // or its master form
        else {
          // No existing source — CREATE a dedicated backing list so it stays a valid dropdown
          // (never silently degrade a Select to Text). Seed with any inline options the IR carries.
          if (!ir.lists.some((l) => l.name === fld.name)) {
            ir.lists.push({ name: fld.name, items: fld.options || fld.possibleValues || fld.PossibleValues || [] });
            listIdx.push({ name: fld.name, n: nrm(fld.name) });
            idmap[fld.name] = `${slug(fld.name)}_A00`;
          }
          fld.referredList = fld.name;
        }
      }
    }
  }

  // DEFAULT REFERENCE LOOKUPS — a Reference field with no `lookup` produces an empty
  // QueryDefinition.LookupField → QueryDefinitionValidationException on publish. Default it to
  // the target form's first displayable field (the column the reference shows).
  const formByName = {};
  for (const f of ir.forms || []) formByName[f.id || f.name] = f;
  for (const f of ir.forms || []) for (const fld of f.fields || []) {
    const isUser = (fld.type || "").startsWith("User") || fld.type === "MultiUser";
    if (REF_TYPES.has(fld.type) && !isUser && fld.ref && (!fld.lookup || !fld.lookup.length)) {
      const tf = (formByName[fld.ref]?.fields || []).find((x) => !["SequenceNumber", "Table", "Attachment", "Image"].includes(x.type));
      if (tf) fld.lookup = [{ id: tf.id || slug(tf.name), name: tf.name, type: ["Email", "Number"].includes(tf.type) ? tf.type : "Text" }];
    }
  }

  // target flow types for reference QDs (both logical names and generated ids), R15:
  // a QD's FlowType must match the target flow's real type or references break at runtime
  const flowTypes = {};
  for (const f of ir.forms || []) {
    const ft = /^(board|case)$/i.test(f.flowType || "") || (Array.isArray(f.statuses) && f.statuses.length) ? "Case"
      : /^process$/i.test(f.flowType || "") ? "Process" : "Form";
    flowTypes[f.id || f.name] = ft;
    flowTypes[idmap[f.id || f.name]] = ft;
  }

  const artifacts = [];
  for (const r of ir.roles || []) artifacts.push(buildRole(r, appId));                 // 1. roles
  for (const l of ir.lists || ir.datasets || []) artifacts.push(buildList(l, appId));   // 2. masters/lists
  const formArtifacts = {};                                                            // 3. flows
  for (const f of ir.forms || []) {
    if (childNames.has(f.id || f.name)) continue; // child forms are embedded, not standalone
    // BOARD (Case) when the spec asks for an unstructured workflow — flowType Board/Case, or it declares
    // board statuses. Everything else is a Form/Process. buildBoard also emits a separate caseflow artifact.
    const isBoard = /^(board|case)$/i.test(f.flowType || "") || (Array.isArray(f.statuses) && f.statuses.length);
    const a = isBoard ? buildBoard(f, appId, idmap, flowTypes) : buildForm(f, appId, idmap, flowTypes);
    formArtifacts[f.id || f.name] = a;
    artifacts.push(a);
    if (a.caseflow) artifacts.push(a.caseflow); // caseflow (statuses/states) published after its model
  }
  for (const ct of childRels) {                  // embed child tables into their parents
    const parent = formArtifacts[ct.parent];
    const childSpec = (ir.forms || []).find((f) => (f.id || f.name) === ct.child);
    if (parent && childSpec) addChildTable(parent, childSpec, ct.field, idmap, flowTypes);
  }
  // per-form workflows: a Process form may carry its own `workflow:{steps}` (in addition to a
  // single top-level ir.workflow). Build each into its process flow.
  for (const f of ir.forms || []) {
    if (f.workflow && f.workflow.steps && formArtifacts[f.id || f.name]) addWorkflow(formArtifacts[f.id || f.name], f.workflow.steps, roleIds);
  }
  if (ir.workflow) {                              // single top-level workflow into its process flow
    const parent = formArtifacts[ir.workflow.flow];
    if (parent) addWorkflow(parent, ir.workflow.steps, roleIds);
  }
  for (const perm of ir.permissions || []) artifacts.push(buildPermission(perm, ir, idmap, roleIds)); // 4. permissions
  const flowInfo = {};                                                                  // id AND name → {genId, flowType} for page data-binding
  for (const f of ir.forms || []) {
    const info = { genId: f.id || `${slug(f.name)}_A00`, flowType: f.flowType || "Form", fields: Object.fromEntries((f.fields || []).map((fl) => [slug(fl.name).toLowerCase(), fl.id || slug(fl.name)])) };
    if (f.id) flowInfo[f.id] = info;                                                    // source_flow may reference a flow by id …
    if (f.name) flowInfo[f.name] = info;                                                // … or by name — resolve either (baseline uses names)
  }
  for (const p of ir.pages || []) artifacts.push(buildPage(p, appId, flowInfo));        // 5. pages (data-bound queues)
  for (const a of ir.automations || []) {                                               // 6. flow-stitch automations (integrations)
    if ((a.channel || "internal") === "external") continue;                             // external stitches are flagged, not authored
    artifacts.push(buildAutomation(a, appId));
  }
  // POST-PASS: aggregate QDs need an AggregateField even for Count, but at field-build time the
  // child model isn't grafted yet — resolve the default (first field on the aggregated model) now.
  for (const a of artifacts) {
    if (!a.blob) continue;
    for (const v of Object.values(a.blob)) {
      if (v && v.Kind === "QueryDefinition" && v.AggregateType && !v.AggregateField) {
        const first = Object.values(a.blob).find((x) => x && x.Kind === "Field" && x.Model === v.LHSModel);
        if (first) v.AggregateField = first.Id;
      }
    }
  }
  return { appId, artifacts, idmap, roleIds };
}
