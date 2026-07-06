// experience.mjs — deterministic guarantee that EVERY build has pages + nav + a role landing.
// No app ships without an experience layer. If an agent (kf-experience-designer) already designed
// pages/nav, those win untouched; this only fills what's MISSING (a role with no landing, or absent
// nav), deriving a sensible baseline from roles + permissions. Idempotent and pure-ish (mutates +
// returns the ir, plus the list of what it auto-added). Zero deps.

const roleNames = (ir) => (ir.roles || []).map((r) => r.name || r);
const isProcess = (ir, model) => (ir.forms || []).some((f) => f.name === model && (f.flowType || "Form") === "Process");

// A field the chart can group by — a Select/status/stage/category dimension. Charts silently drop in
// buildPage unless `filter.groupBy` resolves to a real field id, so only emit a chart when one exists.
function groupByField(ir, model) {
  const f = (ir.forms || []).find((x) => x.name === model);
  const fld = (f?.fields || []).find((fl) => /select|choice|dropdown/i.test(fl.type || "") || /status|stage|type|category|state/i.test(fl.name || ""));
  return fld?.name;
}

// role → accessible models, and the subset the role can edit/initiate (from the permission matrix)
function accessMaps(ir) {
  const acc = {}, edit = {};
  for (const p of (ir.permissions || [])) {
    (acc[p.role] = acc[p.role] || []).push(p.model);
    if (/edit|manage|initi/i.test(p.level || "")) (edit[p.role] = edit[p.role] || new Set()).add(p.model);
  }
  return { acc, edit };
}

// a role's landing page = KPIs for its top areas + a work queue + an initiate form + an approvals list
function landingFor(role, ir, acc, edit) {
  const models = [...new Set(acc[role] || [])];
  const procs = models.filter((m) => isProcess(ir, m));
  const canEdit = edit[role] || new Set();
  // Card verbs MUST match buildPage's vocabulary: kpi | list | chart | action (NOT "table"/"form",
  // which buildPage has no handler for and would silently drop → a labels-only page).
  const cards = [];
  models.slice(0, 3).forEach((m) => cards.push({ view: "kpi", label: m, source_flow: m, metric: "count" }));
  if (procs[0]) {
    const gb = groupByField(ir, procs[0]);
    if (gb) cards.push({ view: "chart", label: procs[0] + " by " + gb, source_flow: procs[0], metric: "count", filter: { groupBy: gb } });
  }
  if (procs[0]) cards.push({ view: "list", label: "My " + procs[0], source_flow: procs[0], scope: "my-items" });
  const initProc = procs.find((p) => canEdit.has(p));
  if (initProc) cards.push({ view: "action", label: "New " + initProc, source_flow: initProc, scope: "my-items" });
  if (procs[1]) cards.push({ view: "list", label: "Approvals — " + procs[1], source_flow: procs[1], scope: "all" });
  if (!cards.length && models[0]) cards.push({ view: "list", label: models[0], source_flow: models[0], scope: "all" });
  return { name: role + " Home", role, landing: true, description: role + "'s landing — work + KPIs across " + models.length + " area(s).", cards, _auto: true };
}

// A shared worklist page for one process flow: a "New <flow>" create button (Button→Popup→FormView)
// plus the flow's worklist. Each flow gets its OWN page so nav can stitch each menu to a distinct
// destination (never all collapsing onto one home page). Not a role landing → role:null.
function flowPageFor(f) {
  return { name: f.name, role: null, landing: false, description: `${f.name} — raise a new request and track items.`,
    cards: [{ view: "action", label: f.name, source_flow: f.name, scope: "my-items" }], _auto: true };
}

/**
 * Guarantee an experience layer. Returns { ir, added:[] }.
 * - Every role gets a landing dashboard (existing role pages kept; only missing ones added).
 * - Every process flow gets its OWN worklist page (create + list), shared across accessing roles.
 * - If nav is absent: a Home menu (role → its dashboard) + one menu per process flow → THAT FLOW's
 *   page (accessing roles). This is the stitching fix — flow menus point at flow pages, not a home.
 */
export function ensureExperience(ir) {
  const roles = roleNames(ir);
  const { acc, edit } = accessMaps(ir);
  const added = [];
  const pages = Array.isArray(ir.pages) ? ir.pages.slice() : [];
  const procFlows = (ir.forms || []).filter((x) => (x.flowType || "Form") === "Process");
  const rolesFor = (name) => roles.filter((r) => (acc[r] || []).includes(name));

  // 1. role home dashboards (differentiated by each role's own accessible flows)
  const hasLanding = (role) => pages.some((pg) => pg.role === role && (pg.landing || pg.dashboard));
  for (const r of roles) {
    if (hasLanding(r)) continue;
    pages.push(landingFor(r, ir, acc, edit));
    added.push("page:" + r + " Home");
  }
  // 2. one worklist page per process flow (only if some role can access it, and not already present)
  const hasFlowPage = (name) => pages.some((pg) => pg.name === name && !pg.landing && !pg.dashboard);
  for (const f of procFlows) {
    if (!rolesFor(f.name).length || hasFlowPage(f.name)) continue;
    pages.push(flowPageFor(f));
    added.push("flowpage:" + f.name);
  }
  ir.pages = pages;

  // 3. nav — Home (each role → its own dashboard) + a menu per flow → the flow's OWN page
  if (!(ir.nav && Array.isArray(ir.nav.menus) && ir.nav.menus.length)) {
    const landingName = (role) => (pages.find((p) => p.role === role && (p.landing || p.dashboard)) || pages.find((p) => p.role === role) || {}).name || role + " Home";
    const menus = [{ name: "Home", submenus: roles.map((r) => ({ name: r, page: landingName(r), visibleTo: [r] })) }];
    for (const f of procFlows) {
      const who = rolesFor(f.name);
      if (who.length) menus.push({ name: f.name, submenus: [{ name: "Open " + f.name, page: f.name, visibleTo: who }] });
    }
    ir.nav = { menus };
    added.push("nav:" + menus.length + " menus");
  }
  return { ir, added };
}
