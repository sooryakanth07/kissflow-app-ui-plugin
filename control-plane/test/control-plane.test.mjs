// control-plane.test.mjs — proves the REAL ported app (src/server.mjs) behaves like the mock, against
// the in-memory db. Only the external Google redirect is bypassed: we mint session tokens directly with
// the same auth.mjs the app uses (so identity handling is real; just not the browser round-trip to Google).
//   node test/control-plane.test.mjs
import "./_env.mjs"; // test env defaults (ADMIN_TOKEN) — must precede src imports
import { createServer } from "node:http";
import { createHandler } from "../src/server.mjs";
import { makeDb } from "../src/db.mjs";
import { mintSession } from "../src/auth.mjs";
import { connect, connectAuto } from "../../engine/connect.mjs"; // the SAME Cowork-side bootstrap client

const PORT = 8091, BASE = `http://localhost:${PORT}`;
const api = async (p, { m = "GET", tok, body } = {}) => { const r = await fetch(BASE + p, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : fail++; console.log(`  ${c ? "✔" : "✗ FAIL —"} ${msg}`); };

async function main() {
  const db = makeDb({ db: { backend: "memory" } });
  await db.migrate();
  const srv = createServer(createHandler(db)).listen(PORT);
  await new Promise((r) => srv.once("listening", r));

  console.log("\n─── health + auth guard ───");
  ok((await api("/health")).json.db === "memory", "health reports db backend");
  ok((await api("/projects", { m: "POST", body: { name: "X" } })).status === 401, "no session → 401 (auth enforced)");

  // "logged in" users — sessions minted with the real signer (Google step is the only bypass)
  const alice = await db.upsertUser({ email: "alice@acme.com", name: "Alice" });
  const bob = await db.upsertUser({ email: "bob@acme.com" });
  const carol = await db.upsertUser({ email: "carol@acme.com" });
  const [aTok, bTok, cTok] = [alice, bob, carol].map(mintSession);

  console.log("\n─── DIRECTION 1: create project, dev-env, connect from Cowork ───");
  const proj = (await api("/projects", { m: "POST", tok: aTok, body: { name: "Refunds Dept" } })).json.project;
  ok(proj?.id && proj.mem_org?.startsWith("org_"), `project ${proj.id} (owner alice, memOrg ${proj.mem_org})`);
  await api(`/projects/${proj.id}/dev-env`, { m: "POST", tok: aTok, body: {} });
  const cu = (await api(`/projects/${proj.id}/connect-url`, { m: "POST", tok: aTok })).json;
  ok(cu.url?.includes("/c/") && !JSON.stringify(cu).includes("RESOLVE_FROM_SECRET"), "connect URL minted, no secrets in it");
  const attached = await connect({ token: cu.url, base: BASE });
  ok(attached.mode === "attach" && attached.config.role === "owner" && attached.config.memOrg === proj.mem_org, "Cowork attached as owner; scoped config carries the project memory org");
  ok(attached.config.user?.email === "alice@acme.com" && attached.config.user?.sub === alice.sub, "scoped config identifies WHO connected (sub + email)");
  const projAfter = await db.getProject(proj.id);
  ok(Boolean(projAfter.last_connect_at) && projAfter.last_connect_by === "alice@acme.com", "project records the connection (who + when) for the UI's connected badge");
  const ppage = await fetch(`${BASE}/p/${proj.id}`, { headers: { Authorization: `Bearer ${aTok}` } });
  ok((await ppage.text()).includes("✓ connected"), "project page shows the Connect section as connected");

  console.log("\n─── SECURITY: single-use connect token ───");
  let reuse; try { reuse = await connect({ token: cu.token, base: BASE }); } catch (e) { reuse = e.message; }
  ok(typeof reuse === "string" && /single-use|already used/.test(reuse), "second use rejected");

  console.log("\n─── MULTI-USER + RBAC ───");
  await api(`/projects/${proj.id}/members`, { m: "POST", tok: aTok, body: { email: "bob@acme.com", role: "builder" } });
  ok((await api(`/projects/${proj.id}/connect-url`, { m: "POST", tok: bTok })).status === 200, "builder Bob can mint a connect URL");
  ok((await api(`/projects/${proj.id}/connect-url`, { m: "POST", tok: cTok })).status === 403, "non-member Carol denied (RBAC)");

  console.log("\n─── DIRECTION 2: Carol starts a NEW app from Cowork → auto-created, auto-owner ───");
  const created = await connect({ mode: "create", appName: "My Garage", identity: cTok, base: BASE });
  ok(created.mode === "created" && created.config.role === "owner" && created.config.projectId.startsWith("my_garage_"), `auto-created ${created.config.projectId}, Carol owner`);
  ok(created.config.user?.email === "carol@acme.com", "created-mode config identifies the user (Carol)");
  ok((await api(`/projects/${created.config.projectId}/versions`, { tok: cTok })).status === 200, "Carol is a member of her new project");

  console.log("\n─── VERSIONS ───");
  await api(`/projects/${proj.id}/versions`, { m: "POST", tok: aTok, body: { label: "v1 — express build", artifacts: { review: `gs://kf/${proj.id}/v1/review.html` } } });
  const vs = (await api(`/projects/${proj.id}/versions`, { tok: aTok })).json.versions;
  ok(vs.length === 1 && vs[0].artifacts.review.includes(proj.id), `version registered & listed: "${vs[0].label}"`);

  console.log("\n─── REUSABLE DEV ENVIRONMENTS: set up once, pick per project ───");
  const envMade = (await api("/dev-envs", { m: "POST", tok: aTok, body: { name: "LCNC dev", subdomain: "dev-lcncdemo", accountId: "A1", apiKey: "AK_env", apiSecret: "AS_env_secret" } })).json.devEnv;
  ok(envMade?.id?.startsWith("env_") && envMade.secret_ref === undefined, "dev env created; secret ref not leaked to the client");
  ok((await api("/dev-envs", { tok: aTok })).json.devEnvs.length === 1, "owner lists their dev envs");
  ok((await api("/dev-envs", { tok: bTok })).json.devEnvs.length === 0, "envs are per-user (Bob sees none)");
  const proj2 = (await api("/projects", { m: "POST", tok: aTok, body: { name: "Env Backed App", devEnvId: envMade.id } })).json.project;
  ok(proj2.dev_env_id === envMade.id, "project created WITH a selected dev env");
  ok((await api("/projects", { m: "POST", tok: bTok, body: { name: "X", devEnvId: envMade.id } })).status === 403, "cannot create a project with someone else's env");
  const cu2 = (await api(`/projects/${proj2.id}/connect-url`, { m: "POST", tok: aTok })).json;
  const att2 = await connect({ token: cu2.url, base: BASE });
  ok(att2.config.kissflow?.apiSecret === "AS_env_secret" && att2.config.kissflow.devEnvId === envMade.id, "connect resolves creds through the reusable env");

  console.log("\n─── BROWSER DEVICE FLOW: /author-setup with no URL → appbuilder → back ───");
  // the plugin side runs for real (connectAuto = loopback + poll); the "browser" is simulated with
  // Alice's session hitting the same routes the approve page calls.
  const auto = connectAuto({ base: BASE, openBrowser: false, pollMs: 100, onVerify: async (verifyUrl) => {
    const code = verifyUrl.split("/connect/")[1];
    const page = await fetch(BASE + "/connect/" + code, { headers: { Authorization: `Bearer ${aTok}` } });
    ok(page.status === 200 && (await page.text()).includes("Connect your"), "approve page renders for a signed-in user");
    const deny = await api(`/connect/${code}/approve`, { m: "POST", tok: cTok, body: { projectId: proj.id } });
    ok(deny.status === 403, "non-member cannot approve onto someone else's project");
    const newProj = await api(`/connect/${code}/approve`, { m: "POST", tok: aTok, body: { name: "Fresh From Plugin" } });
    ok(newProj.status === 409 && newProj.json.needsDevEnv && newProj.json.projectId, "new project without dev env → 409 needsDevEnv (page then collects creds)");
    await api(`/projects/${newProj.json.projectId}/dev-env`, { m: "POST", tok: aTok, body: { subdomain: "dev-lcncdemo", accountId: "A1", apiKey: "K", apiSecret: "S" } });
    const appr = await api(`/connect/${code}/approve`, { m: "POST", tok: aTok, body: { projectId: newProj.json.projectId } });
    ok(appr.status === 200 && /^http:\/\/127\.0\.0\.1:\d+\/cb\?code=/.test(appr.json.redirect || ""), "approve succeeds after dev env; redirect points back at the plugin's loopback");
  } });
  const autoRes = await auto;
  ok(autoRes.config?.user?.email === "alice@acme.com" && autoRes.config?.kissflow?.apiSecret === "S" && autoRes.config.projectName === "Fresh From Plugin",
    "plugin receives scoped config: dev creds + WHO approved, for the project picked in the browser");
  ok((await api("/device/poll", { m: "POST", body: { code: "nope" } })).status === 404, "polling an unknown/redeemed code → 404 (single-use)");
  ok((await api("/device/start", { m: "POST", body: { redirectUri: "https://evil.example/cb" } })).status === 400, "non-loopback redirectUri rejected");

  console.log("\n─── MEMORY PROXY: hive read/write via project token; global sync at session start ───");
  const projTok = attached.config.apiToken; // the token a Cowork session actually holds
  ok((await api("/memory/write", { m: "POST", body: { text: "unauthenticated write attempt" } })).status === 401, "memory routes reject calls with no token");
  const gw = await api("/memory/write", { m: "POST", tok: process.env.ADMIN_TOKEN, body: { org: "global", scope: "global", tier: "owner-confirmed", text: "GLOBAL CANON: published processes accept post-publish field grafts via getDraft→putDraft→publish." } });
  const pw = await api("/memory/write", { m: "POST", tok: projTok, body: { scope: "app", app: "Refunds_A00", text: "APP LESSON: the Refunds flow requires a Fund reference before submit." } });
  ok(gw.json.inserted && pw.json.inserted, "admin writes global canon; a session writes app-scoped rows to its own org");
  const esc2 = await api("/memory/write", { m: "POST", tok: projTok, body: { scope: "global", text: "session trying to publish canon directly must be demoted" } });
  ok(esc2.status === 200 && esc2.json.inserted, "session 'global' write accepted but org-partitioned (no canon escalation)");
  const dup = await api("/memory/write", { m: "POST", tok: projTok, body: { scope: "app", app: "Refunds_A00", text: "APP LESSON: the Refunds flow requires a Fund reference before submit." } });
  ok(dup.json.inserted === false, "duplicate content dedups (idempotent writes)");
  const rc = await api("/memory/recall", { m: "POST", tok: projTok, body: { query: "post-publish field graft process" } });
  ok(rc.json.hits?.length >= 2 && rc.json.hits.some((h) => h.org === "global") && rc.json.hits.some((h) => h.org === proj.mem_org), "recall searches the project org AND global canon together");
  const sync = await api("/memory/sync", { tok: projTok });
  ok(sync.json.counts.global === 1 && sync.json.counts.project >= 2 && sync.json.md.includes("GLOBAL CANON") && sync.json.md.includes("APP LESSON"), "sync returns newest global + project memory as MEMORY-REMOTE.md content");
  const otherSync = await api("/memory/sync", { tok: created.config.apiToken }); // Carol's project
  ok(otherSync.json.counts.project === 0 && otherSync.json.counts.global === 1, "org partition holds: another project sees global canon but NOT Alice's app memory");

  console.log("\n─── OWNER EDITS a dev environment (rename + credential rotation) ───");
  ok((await api(`/dev-envs/${envMade.id}`, { m: "PUT", tok: bTok, body: { name: "hijack" } })).status === 403, "non-owner cannot edit a dev environment");
  const ren = await api(`/dev-envs/${envMade.id}`, { m: "PUT", tok: aTok, body: { name: "LCNC dev (renamed)" } });
  ok(ren.json.ok && ren.json.devEnv.name === "LCNC dev (renamed)" && ren.json.rotated === false, "rename without touching creds (rotated:false)");
  ok((await api("/dev-envs", { m: "POST", tok: aTok, body: { name: "half", subdomain: "dev-x", apiKey: "AK_only" } })).status === 400, "creating an env WITHOUT the secret is rejected (no more half-stored creds)");
  ok((await api(`/dev-envs/${envMade.id}`, { m: "PUT", tok: aTok, body: { apiKey: "AK_lonely" } })).status === 400, "rotating with only one half of the pair is rejected");
  const rot = await api(`/dev-envs/${envMade.id}`, { m: "PUT", tok: aTok, body: { apiKey: "AK_env2", apiSecret: "AS_env_secret_v2" } });
  ok(rot.json.rotated === true, "posting a new key pair rotates credentials");
  const cu3 = (await api(`/projects/${proj2.id}/connect-url`, { m: "POST", tok: aTok })).json;
  const att3 = await connect({ token: cu3.url, base: BASE });
  ok(att3.config.kissflow?.apiSecret === "AS_env_secret_v2" && att3.config.kissflow?.subdomain === "dev-lcncdemo", "next connect serves the ROTATED secret with the kept subdomain");

  console.log("\n─── OWNER DELETES: dev environments (guarded) and projects ───");
  ok((await api(`/dev-envs/${envMade.id}`, { m: "DELETE", tok: bTok })).status === 403, "non-owner cannot delete a dev environment");
  const inUse = await api(`/dev-envs/${envMade.id}`, { m: "DELETE", tok: aTok });
  ok(inUse.status === 409 && /in use/.test(inUse.json.error), "env delete is blocked while projects link it (409 lists them)");
  ok((await api(`/projects/${proj2.id}`, { m: "DELETE", tok: bTok })).status === 403, "non-owner cannot delete a project");
  ok((await api(`/projects/${proj2.id}`, { m: "DELETE", tok: aTok })).json.ok === true, "owner deletes the project (members/versions cascade)");
  ok((await api(`/p/${proj2.id}`, { tok: aTok })).status === 404, "deleted project is gone");
  const envDel = await api(`/dev-envs/${envMade.id}`, { m: "DELETE", tok: aTok });
  ok(envDel.json.ok === true && !(await api("/dev-envs", { tok: aTok })).json.devEnvs.some((e) => e.id === envMade.id), "env deletes cleanly once unlinked (secret removed best-effort)");

  console.log("\n─── SUSPICION CHECK: impossibility claims quarantine until owner-confirmed ───");
  const imp = await api("/memory/write", { m: "POST", tok: projTok, body: { scope: "app", app: "Refunds_A00", text: "Parallel branches are impossible in Kissflow workflows — the API cannot express them." } });
  ok(imp.json.verdict === "quarantined", "a session's impossibility claim is auto-detected and quarantined");
  const impRc = await api("/memory/recall", { m: "POST", tok: projTok, body: { query: "parallel branches workflow impossible" } });
  ok(!impRc.json.hits.some((h) => h.text.includes("Parallel branches are impossible")), "quarantined claims are EXCLUDED from recall (nobody designs against them)");
  const impSync = await api("/memory/sync", { tok: projTok });
  ok(impSync.json.md.includes("PENDING CONFIRMATION") && impSync.json.md.includes("Parallel branches are impossible"), "sync surfaces quarantined claims as pending-confirmation, clearly separated");
  const ownerImp = await api("/memory/write", { m: "POST", tok: process.env.ADMIN_TOKEN, body: { org: "global", scope: "global", tier: "owner-confirmed", text: "Native Decision Tables are unsupported on this plan (403 YourPlanNotSupport) — owner confirmed." } });
  ok(ownerImp.json.verdict === "accept", "owner-confirmed impossibilities (admin) pass the gate and circulate");

  console.log(`\n${fail === 0 ? "✔ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed\n`);
  srv.close();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
