// publish.mjs — after a build, push a run's artifacts to the project's GCS prefix and REGISTER a version
// with the control plane, so it appears in the app's Versions list. Authenticated with the project-scoped
// KF_API_TOKEN that connect.mjs wrote into .kf-env. Called by author-generate (or manually).
//
//   node engine/publish.mjs <runDir> [--label "v3 — adds approvals"]
// env (from .kf-env): CONTROL_PLANE_URL, KF_API_TOKEN, KF_PROJECT_ID, KF_GCS_BUCKET, KF_GCS_PREFIX
//   KF_PUBLISH_UPLOAD = gcs | local | none (default: gcs if a bucket+gcloud exist, else none/register-only)
import { existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const runDir = process.argv[2] || "runs/current";
const flag = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const { CONTROL_PLANE_URL, KF_API_TOKEN, KF_PROJECT_ID, KF_GCS_BUCKET, KF_GCS_PREFIX = "" } = process.env;

// artifacts we know how to publish, mapped to a stable name in the version record
const ARTIFACTS = [
  ["app-spec.json", "ir"],
  ["prototype/index.html", "prototype"],
  ["review.html", "review"],
];

function hasGcloud() { try { execFileSync("gcloud", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } }

async function main() {
  if (!CONTROL_PLANE_URL || !KF_API_TOKEN || !KF_PROJECT_ID) {
    console.error("publish: not connected to a control plane (missing CONTROL_PLANE_URL/KF_API_TOKEN/KF_PROJECT_ID) — skipping. Run connect.mjs first.");
    process.exit(0); // non-fatal: local-only builds just skip publishing
  }
  const label = flag("--label") || `build ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const stamp = "v" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const mode = process.env.KF_PUBLISH_UPLOAD || (KF_GCS_BUCKET && hasGcloud() ? "gcs" : "none");

  // find which artifacts exist in this run
  const present = ARTIFACTS.filter(([rel]) => existsSync(join(runDir, rel)));
  const artifacts = {};
  for (const [rel, name] of present) {
    const uri = `gs://${KF_GCS_BUCKET}/${KF_GCS_PREFIX}versions/${stamp}/${rel}`;
    if (mode === "gcs") {
      execFileSync("gcloud", ["storage", "cp", join(runDir, rel), uri], { stdio: "inherit" });
      artifacts[name] = uri;
    } else if (mode === "local") {
      artifacts[name] = join(runDir, rel); // reference the local file
    } else {
      artifacts[name] = uri; // register the intended URI without uploading (register-only)
    }
  }
  if (mode === "gcs" && existsSync(join(runDir, "generated"))) {
    execFileSync("gcloud", ["storage", "cp", "-r", join(runDir, "generated"), `gs://${KF_GCS_BUCKET}/${KF_GCS_PREFIX}versions/${stamp}/`], { stdio: "inherit" });
    artifacts.generated = `gs://${KF_GCS_BUCKET}/${KF_GCS_PREFIX}versions/${stamp}/generated`;
  }

  // register the version with the control plane (project-scoped token)
  const r = await fetch(`${CONTROL_PLANE_URL}/projects/${KF_PROJECT_ID}/versions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KF_API_TOKEN}` },
    body: JSON.stringify({ label, artifacts }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`publish: version registration failed (${r.status}): ${j.error || ""}`); process.exit(1); }
  console.log(`✔ registered version "${label}" (upload: ${mode}) — ${Object.keys(artifacts).length} artifact(s) → project ${KF_PROJECT_ID}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
