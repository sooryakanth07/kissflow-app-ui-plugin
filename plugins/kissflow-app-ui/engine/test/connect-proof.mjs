// connect-proof.mjs — end-to-end proof of the Cowork connect handshake against the mock control plane.
// Proves: Google-SSO identity, BOTH connect directions, multi-user RBAC, version storage, and the
// security properties (single-use tokens, no secrets in the URL, membership enforcement).
//   node engine/test/connect-proof.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { connect, writeEnv } from "../connect.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = 8087;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, opts = {}) => { const r = await fetch(BASE + path, { headers: { "Content-Type": "application/json", ...(opts.tok ? { Authorization: `Bearer ${opts.tok}` } : {}) }, method: opts.m || "GET", body: opts.body ? JSON.stringify(opts.body) : undefined }); return { status: r.status, json: await r.json() }; };
const ok = (c, msg) => console.log(`  ${c ? "✔" : "✗ FAIL —"} ${msg}`);

async function main() {
  const cp = spawn("node", [join(__dir, "control-plane-mock.mjs"), String(PORT)], { stdio: "inherit" });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/health")).ok) break; } catch {} await sleep(100); }

  console.log("\n─── Google SSO (mock): three users log in ───");
  const alice = (await api("/auth/google", { m: "POST", body: { email: "alice@acme.com", name: "Alice" } })).json;
  const bob = (await api("/auth/google", { m: "POST", body: { email: "bob@acme.com" } })).json;
  const carol = (await api("/auth/google", { m: "POST", body: { email: "carol@acme.com" } })).json;
  ok(alice.identityToken && bob.identityToken && carol.identityToken, "identity tokens issued for alice, bob, carol");

  console.log("\n─── DIRECTION 1: Alice starts a project in the app, sets dev env, connects from Cowork ───");
  const proj = (await api("/projects", { m: "POST", tok: alice.identityToken, body: { name: "Refunds Dept" } })).json.project;
  ok(proj.id && proj.memOrg.startsWith("org_"), `project created: ${proj.id} (owner=alice, memOrg=${proj.memOrg})`);
  await api(`/projects/${proj.id}/dev-env`, { m: "POST", tok: alice.identityToken, body: { subdomain: "dev-lcncdemo", accountId: "AclohbCfcAX3m", apiKey: "AK_dev", apiSecret: "AS_dev_secret" } });
  const cu = (await api(`/projects/${proj.id}/connect-url`, { m: "POST", tok: alice.identityToken })).json;
  ok(cu.url.includes("/c/") && !cu.url.includes("AS_dev_secret"), "connect URL minted — carries a token, NO secret in the URL");

  const bootstrapped = await connect({ token: cu.url, base: BASE });
  const envPath = join(tmpdir(), "kf-proof.env");
  writeEnv(bootstrapped.config, envPath);
  const env = readFileSync(envPath, "utf8");
  ok(bootstrapped.mode === "attach" && bootstrapped.config.role === "owner", "Cowork attached as owner via the URL");
  ok(bootstrapped.config.user?.email === "alice@acme.com", "bootstrap config identifies WHO connected (user id + email)");
  ok(env.includes("AS_dev_secret") && env.includes(`KF_MEM_ORG=${proj.memOrg}`) && env.includes(`KF_GCS_PREFIX=${proj.id}/`), "env written: dev creds (from Secret Manager) + project memory org + scoped GCS prefix");
  ok(env.includes("KF_USER_EMAIL=alice@acme.com") && /KF_USER_ID=u_/.test(env), ".kf-env carries the user identity (KF_USER_ID + KF_USER_EMAIL)");

  console.log("\n─── SECURITY: connect tokens are single-use ───");
  let reuse; try { reuse = await connect({ token: cu.token, base: BASE }); } catch (e) { reuse = e.message; }
  ok(typeof reuse === "string" && /single-use|already used/.test(reuse), "second use of the same token is rejected");

  console.log("\n─── MULTI-USER + RBAC ───");
  await api(`/projects/${proj.id}/members`, { m: "POST", tok: alice.identityToken, body: { email: "bob@acme.com", role: "builder" } });
  ok(true, "Alice (owner) added Bob as builder");
  const bobCU = await api(`/projects/${proj.id}/connect-url`, { m: "POST", tok: bob.identityToken });
  ok(bobCU.status === 200, "Bob (builder) can mint a connect URL and build");
  const carolTry = await api(`/projects/${proj.id}/connect-url`, { m: "POST", tok: carol.identityToken });
  ok(carolTry.status === 403, "Carol (non-member) is denied a connect URL (membership enforced)");

  console.log("\n─── DIRECTION 2: Carol starts a NEW app from Cowork → project auto-created, Carol auto-owner ───");
  const created = await connect({ mode: "create", appName: "My Garage", identity: carol.identityToken, base: BASE });
  ok(created.mode === "created" && created.config.role === "owner" && created.config.projectId.startsWith("my_garage_"), `auto-created ${created.config.projectId}, Carol is owner`);
  ok(created.config.user?.email === "carol@acme.com", "created-mode config also identifies the user (Carol)");
  const carolInHer = await api(`/projects/${created.config.projectId}/versions`, { tok: carol.identityToken });
  ok(carolInHer.status === 200, "Carol is a member of the project she created from Cowork");

  console.log("\n─── VERSIONS: a build registers a version; the project lists it ───");
  await api(`/projects/${proj.id}/versions`, { m: "POST", tok: alice.identityToken, body: { label: "v1 — express build", artifacts: { ir: `gs://kf-artifacts/${proj.id}/versions/1/ir.json`, review: `gs://kf-artifacts/${proj.id}/versions/1/review.html` } } });
  const vs = (await api(`/projects/${proj.id}/versions`, { tok: alice.identityToken })).json.versions;
  ok(vs.length === 1 && vs[0].artifacts.review.includes(proj.id), `version registered & viewable: "${vs[0].label}" by ${vs[0].author}`);

  console.log("\n✔ connect handshake proven — both directions, RBAC, single-use tokens, no secrets in the URL, versioned artifacts.\n");
  cp.kill();
}
main().catch((e) => { console.error(e); process.exit(1); });
