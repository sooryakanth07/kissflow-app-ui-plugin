// seed-projects.mjs — bulk-push local apps into a hosted control plane as projects + versions, via the
// admin import path (shared ADMIN_TOKEN — bypasses Google SSO for seeding). Uploads each app's review /
// prototype / IR to the project's GCS prefix, then registers a version.
//
//   CONTROL_PLANE_URL=https://appbuilder.zingworks.com ADMIN_TOKEN=… OWNER_EMAIL=dinesh@kissflow.com \
//   KF_GCS_BUCKET=kf-app-builder-p001-artifacts  node engine/seed-projects.mjs
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const BASE = process.env.CONTROL_PLANE_URL, TOK = process.env.ADMIN_TOKEN;
const OWNER = process.env.OWNER_EMAIL || "dinesh@kissflow.com";
const BUCKET = process.env.KF_GCS_BUCKET || "kf-app-builder-p001-artifacts";
if (!BASE || !TOK) { console.error("need CONTROL_PLANE_URL + ADMIN_TOKEN"); process.exit(1); }

// curated local apps → display names (only pushed if the dir has a review.html)
const APPS = [
  { dir: "runs/npd-plm", name: "RKCSL NPD / PLM" },
  { dir: "runs/hire-onboarding", name: "Employee Hire → Onboarding" },
  { dir: "runs/old-car", name: "My Garage" },
  { dir: "runs/p2p-agents", name: "Procure-to-Pay" },
  { dir: "lib", name: "IT Asset Management System" },
];
const pick = (dir, names) => names.map((n) => join(dir, n)).find((p) => existsSync(p));
const api = async (path, body, opts = {}) => {
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOK }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → ${r.status} ${j.error || ""}`);
  return j;
};
const stamp = "v" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);

for (const app of APPS) {
  const review = pick(app.dir, ["review.html", "it-asset-review.html"]);
  const proto = pick(app.dir, ["prototype/index.html"]);
  const ir = pick(app.dir, ["app-spec.json"]);
  if (!review && !proto && !ir) { console.log(`⏭  ${app.name}: no artifacts, skipping`); continue; }
  try {
    const { project } = await api("/admin/project", { ownerEmail: OWNER, name: app.name });
    const prefix = `${project.gcs_prefix}versions/${stamp}/`;
    const artifacts = {};
    for (const [local, key, dest] of [[review, "review", "review.html"], [proto, "prototype", "prototype.html"], [ir, "ir", "app-spec.json"]]) {
      if (!local) continue;
      const uri = `gs://${BUCKET}/${prefix}${dest}`;
      execFileSync("gcloud", ["storage", "cp", local, uri], { stdio: "pipe" });
      artifacts[key] = uri;
    }
    const { version } = await api(`/projects/${project.id}/versions`, { label: `imported ${new Date().toISOString().slice(0, 10)}`, author: "admin-import", artifacts });
    console.log(`✔ ${app.name} → project ${project.id}, version v${version.seq} (${Object.keys(artifacts).join(", ")})`);
  } catch (e) { console.log(`✗ ${app.name}: ${e.message}`); }
}
console.log("\ndone.");
