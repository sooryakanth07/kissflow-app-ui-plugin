// App-Spec IR validation — the contract the AI fills. Validates shape AND
// cross-references (a reference field's target exists, a page's role exists, a
// journey's persona exists), so errors are caught at the IR boundary, never in
// raw metadata.
//
// IR shape (high level):
// {
//   app: { name, id?, description? },
//   personas: [{ id, name, goals?:[string] }],
//   journeys: [{ id, persona, story, steps?:[string] }],
//   roles: [{ name, id?, users?, groups? }],
//   lists: [{ name, id?, items?:[string] }],          // option lists / datasets
//   forms: [{ name, id?, flowType?:"Form"|"Process"|"Case"|"Board", section?,
//             statuses?:[{ name, category? }], // BOARD/CASE only — columns of an UNSTRUCTURED workflow
//                                              // (todos/tasks/projects; service requests/support/onboarding)
//             fields:[{ name, type, required?, ref?, referredList?, currency?, formula? }],
//             workflow?: { steps:[{ name, actor?,   // PROCESS only — Sequence steps; actor = role name
//               field_permissions?: { "<field or child-table name>":  // per-step access override
//                 "Editable"|"ReadOnly"|"Hidden"|"Mandatory" } }] } }],  // default: Editable@Start, ReadOnly after
//   pages: [{ name, id?, role?, cards?:[{label, report?, scope?}] }],
//   permissions: [{ role, model, level?, fields?:[{field, level}] }]
// }

const REF_FIELD_TYPES = new Set(["Reference", "ReferenceList"]);

export function validateIR(ir) {
  const issues = [];
  const err = (code, msg, where = "") => issues.push({ level: "error", code, msg, where });
  const warn = (code, msg, where = "") => issues.push({ level: "warn", code, msg, where });

  if (!ir || typeof ir !== "object") return { ok: false, issues: [{ level: "error", code: "IR_EMPTY", msg: "IR missing" }] };
  if (!ir.app?.name) err("NO_APP_NAME", "app.name is required");

  const formIds = new Set((ir.forms || []).map((f) => f.id || f.name));
  const listIds = new Set((ir.lists || ir.datasets || []).map((l) => l.id || l.name));

  // field-map verification helpers (used by automations): resolve a flow by id OR name, and get its
  // declared field-name set (incl. child-table columns). Returns null when the flow is unknown or
  // declares no fields — in which case we can't verify and skip (no false positives).
  const norm = (s) => String(s ?? "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const SYS_FIELDS = new Set(["name", "id", "id_", "createdat", "createdby", "modifiedat", "modifiedby", "status", "currentstep", "flowname"].map(norm));
  const flowFieldSet = (flowRef) => {
    const f = (ir.forms || []).find((x) => (x.id || x.name) === flowRef || x.name === flowRef || x.id === flowRef);
    if (!f) return null;
    const names = [];
    for (const fl of f.fields || []) { if (fl.name) names.push(fl.name); if (fl.id) names.push(fl.id); }
    for (const ct of f.child_tables || []) for (const fl of ct.fields || []) if (fl.name) names.push(fl.name);
    return names.length ? new Set(names.map(norm)) : null;
  };
  // a source value is a plain field ref only if it's not a quoted literal and not a computed expression
  const isBareField = (v) => {
    const s = String(v ?? "").trim();
    if (!s) return false;
    if (/^['"]/.test(s)) return false;                                   // 'literal'
    if (/[-+*/()]|,/.test(s)) return false;                              // arithmetic / call args
    if (/\b(SUM|AVG|COUNT|MIN|MAX|UNIQUE_COUNT|IF|CONCAT|CONCATENATE|ROUND|DATEDIFF|TODAY|NOW)\s*\(/i.test(s)) return false; // function
    if (s.includes(".")) return false;                                   // Flow.Field cross-ref
    return true;
  };
  const roleNames = new Set((ir.roles || []).map((r) => r.name));
  const personaIds = new Set((ir.personas || []).map((p) => p.id || p.name));

  // forms + fields
  for (const f of ir.forms || []) {
    const w = `form:${f.name}`;
    if (!f.name) err("FORM_NO_NAME", "form missing name", w);
    if (!Array.isArray(f.fields) || !f.fields.length) warn("FORM_NO_FIELDS", "form has no fields", w);
    for (const fld of f.fields || []) {
      if (!fld.name) err("FIELD_NO_NAME", "field missing name", w);
      if (!fld.type) err("FIELD_NO_TYPE", `field '${fld.name}' missing type`, w);
      if (REF_FIELD_TYPES.has(fld.type)) {
        if (!fld.ref) err("REF_NO_TARGET", `reference field '${fld.name}' has no ref (target model)`, w);
        else if (!formIds.has(fld.ref) && !listIds.has(fld.ref)) err("REF_TARGET_MISSING", `reference field '${fld.name}' → '${fld.ref}' is not a known form/list`, w);
      }
      if (fld.type === "Select" && fld.referredList && !listIds.has(fld.referredList)) {
        warn("SELECT_LIST_MISSING", `select field '${fld.name}' → list '${fld.referredList}' not defined`, w);
      }
    }
    // workflow steps: names present, actors are known roles, field_permissions resolve
    const PERM_LEVELS = new Set(["Editable", "ReadOnly", "Hidden", "Mandatory"]);
    if (f.workflow?.steps) {
      // valid override keys: top-level field names/ids + child-table names (a table is one permission column)
      const permKeys = new Set();
      for (const fl of f.fields || []) { if (fl.name) permKeys.add(norm(fl.name)); if (fl.id) permKeys.add(norm(fl.id)); }
      for (const ct of f.child_tables || []) if (ct.name) permKeys.add(norm(ct.name));
      f.workflow.steps.forEach((s, i) => {
        const sw = `${w} step:${s.name || i}`;
        if (!s.name) err("STEP_NO_NAME", `workflow step ${i} missing name`, w);
        if (s.actor && roleNames.size && !roleNames.has(s.actor)) warn("STEP_ACTOR_MISSING", `step '${s.name}' actor '${s.actor}' is not a defined role (assignee will be skipped)`, sw);
        for (const [k, v] of Object.entries(s.field_permissions || {})) {
          if (!PERM_LEVELS.has(v)) err("STEP_PERM_LEVEL_BAD", `field_permissions['${k}'] = '${v}' (must be Editable|ReadOnly|Hidden|Mandatory)`, sw);
          if (permKeys.size && !permKeys.has(norm(k)) && !SYS_FIELDS.has(norm(k))) err("STEP_PERM_FIELD_MISSING", `field_permissions key '${k}' is not a field or child table on this flow`, sw);
        }
      });
    }
  }

  // pages reference roles
  for (const p of ir.pages || []) {
    if (p.role && !roleNames.has(p.role)) warn("PAGE_ROLE_MISSING", `page '${p.name}' role '${p.role}' not defined`, `page:${p.name}`);
  }
  // permissions reference roles + models
  for (const perm of ir.permissions || []) {
    if (!roleNames.has(perm.role)) err("PERM_ROLE_MISSING", `permission role '${perm.role}' not defined`, "permissions");
    if (perm.model && !formIds.has(perm.model)) err("PERM_MODEL_MISSING", `permission model '${perm.model}' not defined`, "permissions");
  }
  // journeys reference personas
  for (const j of ir.journeys || []) {
    if (j.persona && !personaIds.has(j.persona)) warn("JOURNEY_PERSONA_MISSING", `journey '${j.id || j.story}' persona '${j.persona}' not defined`, "journeys");
  }
  // automations (flow-stitches): source + target flows must exist; internal channel is emittable
  for (const a of ir.automations || []) {
    const where = `automation '${a.id || a.name}'`;
    if (!a.source?.flow || !formIds.has(a.source.flow)) err("AUTO_SOURCE_MISSING", `${where} source flow '${a.source?.flow}' not defined`, "automations");
    if (!a.action?.target_flow || !formIds.has(a.action.target_flow)) err("AUTO_TARGET_MISSING", `${where} target flow '${a.action?.target_flow}' not defined`, "automations");
    if (a.action && !["create", "update", "notify"].includes(a.action.type)) err("AUTO_TYPE_BAD", `${where} action.type must be create|update|notify`, "automations");
    if (a.source?.flow && a.action?.target_flow && a.source.flow === a.action.target_flow) warn("AUTO_SELF", `${where} stitches a flow to itself`, "automations");
    // field_map: keys are TARGET fields (must exist on target flow); values are SOURCE fields
    // (must exist on source flow) unless a literal or computed expression.
    const fm = a.action?.field_map;
    if (fm && typeof fm === "object") {
      const tgt = flowFieldSet(a.action.target_flow), src = flowFieldSet(a.source?.flow);
      for (const [k, v] of Object.entries(fm)) {
        if (tgt && !tgt.has(norm(k)) && !SYS_FIELDS.has(norm(k)))
          err("AUTO_MAP_TARGET_FIELD", `${where}: target field '${k}' not on flow '${a.action.target_flow}'`, "automations");
        if (src && isBareField(v) && !src.has(norm(v)) && !SYS_FIELDS.has(norm(v)))
          warn("AUTO_MAP_SOURCE_FIELD", `${where}: source field '${v}' not on flow '${a.source?.flow}' (mapped → '${k}')`, "automations");
      }
    }
  }

  return { ok: !issues.some((i) => i.level === "error"), issues };
}

/**
 * Coherence: does the app SOLVE the problem per persona? Light checks that the
 * journeys/personas map to artifacts (every persona has a page; every journey's flow exists).
 */
export function checkCoherenceIR(ir) {
  const issues = [];
  const pagesByRole = new Set((ir.pages || []).map((p) => p.role).filter(Boolean));
  for (const p of ir.personas || []) {
    // a persona usually maps to a role of the same/closely-related name
    if (ir.roles?.length && ir.pages?.length && ![...pagesByRole].some((r) => r && (r === p.name || r === p.id))) {
      issues.push({ level: "warn", code: "PERSONA_NO_LANDING", msg: `persona '${p.name}' has no role-landing page (dashboard)`, where: "coherence" });
    }
  }
  if ((ir.forms || []).length && !(ir.roles || []).length) issues.push({ level: "warn", code: "NO_ROLES", msg: "app has data but no roles — who uses it?", where: "coherence" });
  if ((ir.forms || []).length && !(ir.pages || []).length) issues.push({ level: "warn", code: "NO_PAGES", msg: "app has data but no pages — nothing is surfaced to users (build auto-adds a baseline; design richer pages with kf-experience-designer)", where: "coherence" });
  if ((ir.pages || []).length && !((ir.nav?.menus || []).length)) issues.push({ level: "warn", code: "NO_NAV", msg: "app has pages but no navigation — users can't reach them (build auto-adds a baseline)", where: "coherence" });
  for (const r of (ir.roles || [])) {
    const rn = r.name || r;
    if ((ir.pages || []).length && ![...pagesByRole].includes(rn)) issues.push({ level: "warn", code: "ROLE_NO_LANDING", msg: `role '${rn}' has no landing page`, where: "coherence" });
  }
  return issues;
}
