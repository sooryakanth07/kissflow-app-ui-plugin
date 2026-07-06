// Entity-graph helpers for Kissflow metadata blobs.
//
// A blob is a flat object keyed by entity Id, with a `Root` pointer and meta keys
// (PublishedAt / _meta_version / CurrentVersion). Relations are any key containing
// "::" whose value is an array of child entity ids. This module is format-agnostic —
// it works for form/case/page/caseflow blobs alike.

const META_KEYS = new Set(["Root", "PublishedAt", "_meta_version", "CurrentVersion", "_last_saved_at", "force_delete_status"]);

// Blobs whose Root object is a true Id-keyed entity GRAPH (Parent::Child relations).
// Views (FormView/CaseView/DatasetView/ProjectView), reports, and integration blobs
// are property-bags with a Root pointer — NOT entity graphs — and must not be checked
// with the graph rules.
export const GRAPH_KINDS = new Set(["Model", "CaseFlow", "Page", "CasePermission", "Navigation"]);

/** True if the blob is a Root→entity graph (vs. a view/property-bag blob). */
export function isEntityGraph(blob) {
  const root = blob?.Root ? blob[blob.Root] : null;
  return !!root && GRAPH_KINDS.has(root.Kind);
}

/** All entity objects in a blob (skips meta keys + non-object values). */
export function entities(blob) {
  const out = [];
  for (const [k, v] of Object.entries(blob)) {
    if (META_KEYS.has(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(v);
  }
  return out;
}

/** Map of id -> entity. */
export function index(blob) {
  const m = new Map();
  for (const e of entities(blob)) if (e.Id != null) m.set(e.Id, e);
  return m;
}

/** The relation keys ("X::Y") on an entity and their id arrays. */
export function relations(entity) {
  const rels = [];
  for (const [k, v] of Object.entries(entity)) {
    if (k.includes("::") && Array.isArray(v)) rels.push([k, v]);
  }
  return rels;
}

/** Every (fromId, relationKey, toId) edge in the blob. */
export function edges(blob) {
  const out = [];
  for (const e of entities(blob)) {
    for (const [rel, ids] of relations(e)) {
      for (const to of ids) out.push({ from: e.Id, rel, to });
    }
  }
  return out;
}

/** Relation references that point at an id NOT present as an entity in the blob. */
export function danglingRefs(blob) {
  const ids = index(blob);
  const bad = [];
  for (const { from, rel, to } of edges(blob)) {
    if (!ids.has(to)) bad.push({ from, rel, to });
  }
  return bad;
}

/** Entities reachable from Root by following `::` relations (BFS). */
export function reachableFromRoot(blob) {
  const ids = index(blob);
  const seen = new Set();
  const root = blob.Root;
  if (!root || !ids.has(root)) return seen;
  const q = [root];
  seen.add(root);
  while (q.length) {
    const cur = ids.get(q.shift());
    for (const [, refs] of relations(cur)) {
      for (const to of refs) if (ids.has(to) && !seen.has(to)) { seen.add(to); q.push(to); }
    }
  }
  return seen;
}

/** Entities not reachable from Root (orphans) — excludes Root meta. */
export function orphans(blob) {
  const reach = reachableFromRoot(blob);
  return entities(blob).filter((e) => e.Id != null && !reach.has(e.Id)).map((e) => e.Id);
}

/** Build a status transition graph from a caseflow blob (Status entities + OutwardStatus). */
export function statusGraph(caseflowBlob) {
  const statuses = entities(caseflowBlob).filter((e) => e.Kind === "Status");
  const byId = new Map(statuses.map((s) => [s.Id, s]));
  const out = new Map(statuses.map((s) => [s.Id, (s.OutwardStatus || []).filter((t) => byId.has(t))]));
  const initial = statuses.find((s) => s.Category === "NotStarted") || statuses[0];
  const terminals = statuses.filter((s) => s.Category === "Closed" || s.Category === "Done").map((s) => s.Id);
  return { statuses, byId, out, initial: initial?.Id, terminals };
}
