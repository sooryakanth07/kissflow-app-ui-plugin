// Validators — the verification layer. Each returns an array of issues
// { level: "error"|"warn", code, msg, where }. Operate on loaded export models
// OR on builder output (same blob shape).

import { entities, index, danglingRefs, orphans, statusGraph, relations, isEntityGraph } from "./graph.mjs";

const SYSTEM_FIELDS = new Set([
  "_id", "Name", "_created_by", "_modified_by", "_created_at", "_modified_at", "_is_deleted",
  "_deleted_at", "_deleted_by", "_flow_name", "_application_id", "_flow_type", "_doc_version",
  "_visited", "_is_draft", "_is_public_form", "_expire_at",
]);

// ---------- STRUCTURAL ----------
/** A metadata blob must: have a Root that resolves, every `::` ref resolve, every entity have Id+Kind. */
export function checkStructural(blob, where = "") {
  const issues = [];
  if (!blob || typeof blob !== "object") return [{ level: "error", code: "BLOB_EMPTY", msg: "blob missing/invalid", where }];
  // Root must point at a present object (true for both entity-graphs and view/property-bag blobs).
  if (!blob.Root) issues.push({ level: "error", code: "NO_ROOT", msg: "blob has no Root", where });
  else if (!blob[blob.Root] || typeof blob[blob.Root] !== "object") issues.push({ level: "error", code: "ROOT_MISSING", msg: `Root '${blob.Root}' has no object`, where });
  // Entity-graph rules apply ONLY to graph blobs (Model/CaseFlow/Page/CasePermission/Navigation),
  // not to view/report/integration property-bag blobs.
  if (!isEntityGraph(blob)) return issues;
  for (const { from, rel, to } of danglingRefs(blob)) {
    issues.push({ level: "error", code: "DANGLING_REF", msg: `${from}.${rel} → '${to}' does not exist`, where });
  }
  for (const e of entities(blob)) {
    if (e.Id == null) issues.push({ level: "warn", code: "NO_ID", msg: `entity missing Id`, where });
    else if (e.Kind == null) issues.push({ level: "warn", code: "NO_KIND", msg: `entity '${e.Id}' missing Kind`, where });
  }
  return issues;
}

/** Field-level checks on a form/model blob: types known, no authored system fields, columns resolve. */
const KNOWN_FIELD_TYPES = new Set([
  "Text", "Textarea", "Number", "Currency", "Date", "DateTime", "Email", "Boolean", "Select",
  "Multiselect", "MultiSelect", "DropdownList", "Checkbox", "CheckList", "StarRating", "Slider",
  "Reference", "ReferenceList", "RemoteLookup", "Aggregation", "SequenceNumber", "Geolocation",
  "User", "MultiUser", "UserList", "UserActor", "UserAndGroup", "UserAndGroupList", "Attachment", "Image",
  "Table", "TableField",
]);
export function checkFields(blob, where = "") {
  const issues = [];
  const ids = index(blob);
  for (const e of entities(blob)) {
    if (e.Kind !== "Field") continue;
    if (SYSTEM_FIELDS.has(e.Id)) issues.push({ level: "error", code: "SYSTEM_FIELD_AUTHORED", msg: `system field '${e.Id}' must not be authored`, where });
    if (e.Type && !KNOWN_FIELD_TYPES.has(e.Type)) issues.push({ level: "warn", code: "UNKNOWN_FIELD_TYPE", msg: `field '${e.Id}' type '${e.Type}' not in catalog`, where });
    if (e.Column && !ids.has(e.Column)) issues.push({ level: "error", code: "FIELD_NO_COLUMN", msg: `field '${e.Id}' Column '${e.Column}' missing`, where });
    // a Reference/User field should carry a QueryDefinition
    if (["Reference", "ReferenceList", "User", "MultiUser", "UserList"].includes(e.Type) && !e["Field::QueryDefinition"]) {
      issues.push({ level: "warn", code: "REF_NO_QUERYDEF", msg: `reference field '${e.Id}' has no Field::QueryDefinition`, where });
    }
  }
  return issues;
}

// ---------- BEHAVIORAL ----------
/** Caseflow: every status reachable from the initial; every status can reach a terminal; no transition to a missing status. */
export function checkCaseflow(caseflowBlob, where = "") {
  const issues = [];
  const g = statusGraph(caseflowBlob);
  if (!g.statuses.length) return issues;
  if (!g.initial) issues.push({ level: "error", code: "NO_INITIAL_STATUS", msg: "no NotStarted/initial status", where });
  if (!g.terminals.length) issues.push({ level: "warn", code: "NO_TERMINAL_STATUS", msg: "no Closed/Done terminal status", where });
  // forward reachability from initial
  const fwd = new Set([g.initial].filter(Boolean));
  const q = [...fwd];
  while (q.length) for (const t of g.out.get(q.shift()) || []) if (!fwd.has(t)) { fwd.add(t); q.push(t); }
  for (const s of g.statuses) {
    if (s.Id !== g.initial && !fwd.has(s.Id)) issues.push({ level: "warn", code: "UNREACHABLE_STATUS", msg: `status '${s.Id}' unreachable from initial`, where });
  }
  // backward: can each status reach a terminal?
  const rev = new Map(g.statuses.map((s) => [s.Id, []]));
  for (const [from, tos] of g.out) for (const to of tos) rev.get(to)?.push(from);
  const canEnd = new Set(g.terminals);
  const q2 = [...canEnd];
  while (q2.length) for (const p of rev.get(q2.shift()) || []) if (!canEnd.has(p)) { canEnd.add(p); q2.push(p); }
  for (const s of g.statuses) {
    if (!canEnd.has(s.Id)) issues.push({ level: "warn", code: "STATUS_NO_EXIT", msg: `status '${s.Id}' cannot reach a terminal`, where });
  }
  return issues;
}

// ---------- COHERENCE (IR-level; light blob-level orphan check here) ----------
/** Orphan entities (unreachable from Root) — usually a modeling mistake. */
export function checkOrphans(blob, where = "") {
  return orphans(blob).map((id) => ({ level: "warn", code: "ORPHAN_ENTITY", msg: `entity '${id}' unreachable from Root`, where }));
}

/** Run the appropriate validators for a labelled blob (auto-detects caseflow vs model). */
export function validateBlob({ label, blob }) {
  const issues = [...checkStructural(blob, label)];
  const root = blob[blob.Root];
  const kind = root?.Kind;
  if (kind === "Model") issues.push(...checkFields(blob, label));
  if (kind === "CaseFlow") issues.push(...checkCaseflow(blob, label));
  issues.push(...checkOrphans(blob, label));
  return issues;
}

export const errors = (issues) => issues.filter((i) => i.level === "error");
export const warnings = (issues) => issues.filter((i) => i.level === "warn");
