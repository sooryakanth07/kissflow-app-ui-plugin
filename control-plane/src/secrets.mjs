// secrets.mjs — per-project Kissflow dev creds, stored OUT of Postgres. Two backends:
//   memory → in-process (local/test)
//   gcp    → Secret Manager (one secret per project, name derived from the dev_env_ref)
// The gcp READ path uses the runtime SA token (metadata server) — the SA has secretAccessor. The WRITE
// path (storing a project's creds) needs secretVersionAdder on the SA; if absent, creds are provisioned
// out-of-band and only read here. Local dev uses the memory backend, fully functional.
const backend = process.env.SECRETS_BACKEND || (process.env.K_SERVICE ? "gcp" : "memory"); // K_SERVICE ⇒ Cloud Run
const PROJECT = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "kf-app-builder-p001";
const store = new Map();
const secretName = (ref) => String(ref).replace(/[^a-zA-Z0-9-]/g, "-"); // "secret/<id>/kissflow" → flat name

async function gcpToken() {
  const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  return (await r.json()).access_token;
}

export const secrets = {
  backend,
  async put(ref, obj) {
    if (backend === "memory") { store.set(ref, obj); return; }
    const tok = await gcpToken(), name = secretName(ref), base = `https://secretmanager.googleapis.com/v1/projects/${PROJECT}`;
    // create the secret container (ignore already-exists), then add a version with the JSON payload
    await fetch(`${base}/secrets?secretId=${name}`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ replication: { automatic: {} } }) }).catch(() => {});
    const data = Buffer.from(JSON.stringify(obj)).toString("base64");
    const r = await fetch(`${base}/secrets/${name}:addVersion`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ payload: { data } }) });
    if (!r.ok) throw new Error(`secret write failed (${r.status}) — runtime SA needs secretmanager.admin on the project (deploy/owner-grants.sh step 5)`);
  },
  // best-effort delete (owner removed the env/project) — a failure never blocks the caller
  async del(ref) {
    if (backend === "memory") { store.delete(ref); return; }
    try {
      const tok = await gcpToken(), name = secretName(ref);
      await fetch(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${name}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}` } });
    } catch {}
  },
  async get(ref) {
    if (backend === "memory") return store.get(ref) || null;
    const tok = await gcpToken(), name = secretName(ref);
    const r = await fetch(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${name}/versions/latest:access`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) return null;
    const j = await r.json();
    try { return JSON.parse(Buffer.from(j.payload.data, "base64").toString()); } catch { return null; }
  },
};
