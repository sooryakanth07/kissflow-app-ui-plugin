// resolve.mjs — deterministic resolver bridging an Experience Spec (semantic,
// binds by MEANING) + a kf-schema.json (the name→id source produced by kf-sync)
// into a ui-spec.json (the shape kf-ui-architect.md writes and kf-ui-designer /
// kf-ui-builder consume). Zero dependencies, no network, pure data transform.
//
//   resolveExperience(experienceSpec, kfSchema) → { uiSpec, warnings }
//
// HARD RULE — never fabricate: if a widget's `entity`/`field` does not resolve to
// a REAL id in kfSchema, the widget is DROPPED and a warning is recorded. A page
// with no resolvable widgets is dropped too. We never invent an id or keep a
// dangling bind.

// ---- Experience `widget.type` vocabulary → ui-spec `type` intent enum --------
// The ui-spec `type` enum (from kf-ui-architect.md) is a data-shape intent:
//   hero | kpi | kpirow | stat | gauge | progress | barchart | hbars | linechart
//   | areachart | donut | segmentbar | stackedbar | funnel | kanban | table
//   | feed | timeline | map | form | callout | panel
// The Experience Spec's rich vocab maps to the closest such intent; chart-kind /
// action hints that don't survive the type mapping are carried into `props`.
const TYPE_MAP = {
  kpi:       { type: "kpi" },
  statcard:  { type: "kpi" },
  chart:     { type: "linechart", props: { chartKind: "line" } }, // generic → line
  area:      { type: "areachart", props: { chartKind: "area" } },
  line:      { type: "linechart", props: { chartKind: "line" } },
  bar:       { type: "barchart",  props: { chartKind: "bar" } },
  donut:     { type: "donut",     props: { chartKind: "donut" } },
  table:     { type: "table" },
  queue:     { type: "table",     props: { variant: "queue" } },
  kanban:    { type: "kanban" },
  timeline:  { type: "timeline" },
  upcoming:  { type: "timeline",  props: { variant: "upcoming" } },
  calendar:  { type: "timeline",  props: { variant: "calendar" } },
  progress:  { type: "progress" },
  record:    { type: "panel",     props: { variant: "record" } },
  form:      { type: "form" },
  action:    { type: "form",      props: { variant: "action" } },
  text:      { type: "callout" },
};

// ---- scope → SDK view --------------------------------------------------------
//   mine → myitems, team → mytasks (approver worklist), all → allitems,
//   any other (a named role-scope) → allitems (a sensible default).
function scopeToView(scope) {
  switch (scope) {
    case "mine": return "myitems";
    case "team": return "mytasks";
    case "all":  return "allitems";
    case undefined:
    case null:   return undefined;
    default:     return "allitems";
  }
}

// A chart type needs a dim (group-by) to render; everything below is best-effort.
const isChartType = (t) => ["linechart", "areachart", "barchart", "donut"].includes(t);

// ---- schema index helpers ----------------------------------------------------
function slug(s) {
  return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Index every model + field under multiple keys (name / id / slug) so a bind can
// resolve whether the Experience Spec named the entity by its IR slug, the live
// name, or the live id. `fieldsByName` is multi-keyed too (lookup by name still works).
function indexSchema(kfSchema) {
  const models = [];
  const modelsByKey = new Map(); // name | id | slug(name) → entry
  for (const m of kfSchema.dataModels || []) {
    const fieldsByName = new Map(); // name | id | slug(name) → field
    for (const f of [...(m.fields || []), ...(m.systemFields || [])]) {
      for (const k of [f.name, f.id, slug(f.name)]) if (k) fieldsByName.set(k, f);
    }
    const entry = { model: m, fieldsByName, mslug: slug(m.name) };
    models.push(entry);
    for (const k of [m.name, m.id, slug(m.name)]) if (k) modelsByKey.set(k, entry);
  }
  const rolesByName = new Map();
  for (const r of kfSchema.roles || []) for (const k of [r.name, r.id, slug(r.name)]) if (k) rolesByName.set(k, r);
  return { models, modelsByKey, rolesByName };
}

// Resolve a bind.entity (an IR name/slug/id) → a live model entry. Exact match on
// name/id/slug first; then a tolerant match for the common app-prefix rename
// (IR "item" → live "Inventory Item"): the entity slug equals, is a suffix of, or
// is the head of exactly ONE live model's slug. Ambiguous → { ambiguous } so the
// caller drops with a clear reason (never guess between two models).
function resolveEntity(entity, index) {
  const exact = index.modelsByKey.get(entity) || index.modelsByKey.get(slug(entity));
  if (exact) return { entry: exact };
  const es = slug(entity);
  if (!es) return null;
  let hits = index.models.filter((m) => m.mslug === es || m.mslug.endsWith("-" + es) || es.endsWith("-" + m.mslug));
  if (hits.length === 0) {
    const contains = index.models.filter((m) => m.mslug.includes(es) || es.includes(m.mslug));
    if (contains.length === 1) hits = contains;
  }
  if (hits.length === 1) return { entry: hits[0] };
  if (hits.length > 1) return { ambiguous: hits.map((h) => h.model.name) };
  return null;
}

// Resolve an array of field NAMES to a { names, ids } pair, dropping any that
// don't exist on the model. Returns null-ish when nothing resolves.
function resolveFields(names, fieldsByName) {
  const ids = [], labels = [], missing = [];
  for (const n of names || []) {
    const f = fieldsByName.get(n);
    if (f) { ids.push(f.id); labels.push(n); }
    else missing.push(n);
  }
  return { ids, labels, missing };
}

// ---- the core: resolve ONE widget → ui-spec widget (or a drop-warning) -------
function resolveWidget(widget, idx, page, index) {
  const warn = (reason) => ({ warning: { page: page.id, widget: widget.title || widget.type || `#${idx}`, reason } });
  const bind = widget.bind || {};

  // 1) entity is mandatory and must resolve to a real model (name / slug / id, with
  //    tolerant app-prefix matching).
  if (!bind.entity) return warn(`widget "${widget.title || widget.type}" has no bind.entity`);
  const er = resolveEntity(bind.entity, index);
  if (!er) return warn(`entity "${bind.entity}" not found in kf-schema.dataModels — dropped (never fabricate)`);
  if (er.ambiguous) return warn(`entity "${bind.entity}" is ambiguous (matches ${er.ambiguous.join(", ")}) — dropped`);
  const { model, fieldsByName } = er.entry;

  // 2) type → ui-spec intent.
  const mapped = TYPE_MAP[widget.type] || { type: "panel" };
  const uiType = mapped.type;

  // 3) binding — real ids only.
  const binding = { flowType: model.type, flowId: model.id };

  // 3a) single field. A field that resolves → its real id. A field that does NOT
  //     resolve is treated as a DERIVED value (computed client-side from real fields —
  //     e.g. "On-Hand Qty", "Valuation") — keep the widget and carry a hint, rather
  //     than hard-dropping. This is not fabrication (same as bind.measure/dim hints);
  //     the entity is still real, only the metric is derived.
  let derivedField;
  if (bind.field) {
    const f = fieldsByName.get(bind.field);
    if (f) binding.field = f.id;
    else derivedField = bind.field;
  }

  // 3b) columns / fields list.
  if (bind.columns) {
    const r = resolveFields(bind.columns, fieldsByName);
    if (!r.ids.length) return warn(`none of columns [${bind.columns.join(", ")}] exist on entity "${bind.entity}" — dropped`);
    binding.fields = r.ids;
  }

  // 3c) dim (group-by) — used as groupField for kanban / charts.
  let dimLabel;
  if (bind.dim) {
    const f = fieldsByName.get(bind.dim);
    if (f) { binding.groupField = f.id; dimLabel = bind.dim; }
    // a dim like "month" is a time bucket, not a field — keep it as a hint only.
    else dimLabel = bind.dim;
  }

  // 3d) scope → view.
  const view = scopeToView(bind.scope);
  if (view) binding.view = view;

  // 4) props — human labels + non-id hints the React builder computes client-side.
  const props = { ...(mapped.props || {}) };
  if (widget.title) props.label = widget.title;
  if (bind.measure) props.agg = bind.measure;            // count|sum|avg|min|max
  if (dimLabel) props.dim = dimLabel;                    // month | category field name
  if (bind.action) props.action = bind.action;           // create | open | transition
  if (binding.field) props.fieldLabel = bind.field;      // real field → human label
  if (derivedField) { props.derived = derivedField; if (!props.label) props.label = derivedField; }
  if (binding.fields) props.columns = resolveFields(bind.columns, fieldsByName).labels;
  if (bind.scope) props.scope = bind.scope;

  const out = { type: uiType, binding };
  if (widget.title) out.title = widget.title;
  if (typeof widget.span === "number") out.span = widget.span;
  if (Object.keys(props).length) out.props = props;
  return { widget: out };
}

// ---- the whole transform -----------------------------------------------------
export function resolveExperience(experienceSpec, kfSchema) {
  const warnings = [];
  const index = indexSchema(kfSchema);

  // roles: name → id (where the ui-spec wants ids), with per-role model access.
  const roles = (experienceSpec.roles || []).map((r) => {
    const kfRole = index.rolesByName.get(r.role);
    const id = kfRole ? kfRole.id : r.role; // fall back to the name if unmatched
    if (!kfRole) warnings.push({ page: null, widget: null, reason: `role "${r.role}" not found in kf-schema.roles — using name as id` });
    return {
      id,
      name: r.role,
      landing: r.landing,                                  // role's default route
      nav: (r.nav || []).map((n) => ({ page: n.page, label: n.label, icon: n.icon })),
      access: [],                                          // filled below from pages
    };
  });
  const roleByName = new Map(roles.map((r) => [r.name, r]));

  // pages.
  const pages = [];
  for (const page of experienceSpec.pages || []) {
    const widgets = [];
    for (let i = 0; i < (page.widgets || []).length; i++) {
      const res = resolveWidget(page.widgets[i], i, page, index);
      if (res.warning) { warnings.push(res.warning); continue; }
      widgets.push(res.widget);
      // record model access for the page's role.
      const role = roleByName.get(page.role);
      if (role && res.widget.binding?.flowId && !role.access.includes(res.widget.binding.flowId)) {
        role.access.push(res.widget.binding.flowId);
      }
    }

    if (!widgets.length) {
      warnings.push({ page: page.id, widget: null, reason: `page "${page.id}" has no resolvable widgets — page dropped (never fabricate)` });
      continue;
    }

    // nav entry for this page (from its role's nav, by page id).
    const role = roleByName.get(page.role);
    const navEntry = role?.nav.find((n) => n.page === page.id);

    pages.push({
      id: page.id,
      route: page.id === (role?.landing) ? "index" : page.id,
      title: page.title,
      archetype: page.archetype,
      roles: page.role ? [role ? role.id : page.role] : ["*"],
      nav: navEntry ? { label: navEntry.label, icon: navEntry.icon } : { label: page.title },
      widgets,
    });
  }

  const uiSpec = {
    app: {
      id: kfSchema.app?.id,
      name: experienceSpec.app || kfSchema.app?.name,
      theme: experienceSpec.theme || experienceSpec.app?.theme || "violet",
    },
    roles: roles.map((r) => ({ id: r.id, name: r.name, landing: r.landing, access: r.access })),
    pages,
  };

  return { uiSpec, warnings };
}

export { TYPE_MAP, scopeToView };
