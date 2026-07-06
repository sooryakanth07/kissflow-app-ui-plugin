// Load a Kissflow app export folder into a structured model.
//
// Export layout (the object model): each object is a folder with `flow/<id>.json`
// (the doc) and `metadata/<id>.json` (the entity-graph blob); sub-objects nest
// (form→formview, case→caseflow/casepermission/caseview, process→report,
// application→page). This loader is also the foundation of reconcile-import.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const dirs = (p) => (existsSync(p) ? readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory()) : []);

/** Read the single json file inside a `flow/` or `metadata/` leaf, if present. */
function leaf(objDir, sub) {
  const d = join(objDir, sub);
  if (!existsSync(d)) return null;
  const f = readdirSync(d).find((x) => x.endsWith(".json"));
  return f ? readJson(join(d, f)) : null;
}

/** Load one flow object (form/process/case/list/integration/page) → {id, doc, blob, sub}. */
function loadObject(objDir, id) {
  const obj = { id, doc: leaf(objDir, "flow"), blob: leaf(objDir, "metadata"), sub: {} };
  // nested sub-objects (formview, caseflow, casepermission, caseview, report, page…)
  for (const d of readdirSync(objDir)) {
    if (d === "flow" || d === "metadata") continue;
    const subDir = join(objDir, d);
    if (!statSync(subDir).isDirectory()) continue;
    obj.sub[d] = dirs(subDir).map((sid) => loadObject(join(subDir, sid), sid));
  }
  return obj;
}

/** Load a whole app export folder → { app, forms, lists, processes, cases, integrations, pages, … }. */
export function loadApp(root) {
  const out = { root, forms: [], lists: [], processes: [], cases: [], integrations: [], pages: [], customcomponents: [], application: null };
  const typeMap = { form: "forms", list: "lists", process: "processes", case: "cases", integration: "integrations", customcomponent: "customcomponents", analyticsview: "analyticsviews" };
  for (const type of readdirSync(root).filter((d) => existsSync(join(root, d)) && statSync(join(root, d)).isDirectory())) {
    const typeDir = join(root, type);
    if (type === "application") {
      const appId = dirs(typeDir)[0];
      if (appId) {
        const appDir = join(typeDir, appId);
        out.application = loadObject(appDir, appId);
        // pages live under application/<appId>/page/<pageId>
        const pageDir = join(appDir, "page");
        if (existsSync(pageDir)) out.pages = dirs(pageDir).map((pid) => loadObject(join(pageDir, pid), pid));
      }
      continue;
    }
    const bucket = typeMap[type];
    if (!bucket) continue;
    out[bucket] = dirs(typeDir).map((id) => loadObject(join(typeDir, id), id));
  }
  return out;
}

/** Flatten every metadata blob in an app (with a label) for blanket structural checks. */
export function allBlobs(app) {
  const out = [];
  const walk = (obj, label) => {
    if (!obj) return;
    if (obj.blob) out.push({ label: `${label}/${obj.id}`, blob: obj.blob });
    for (const [k, arr] of Object.entries(obj.sub || {})) for (const s of arr) walk(s, `${label}/${obj.id}/${k}`);
  };
  for (const f of app.forms) walk(f, "form");
  for (const p of app.processes) walk(p, "process");
  for (const c of app.cases) walk(c, "case");
  for (const pg of app.pages) walk(pg, "page");
  for (const i of app.integrations) walk(i, "integration");
  return out;
}
