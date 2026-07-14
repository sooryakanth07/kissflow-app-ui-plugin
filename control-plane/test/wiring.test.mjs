// wiring.test.mjs — proves the three plugin↔control-plane gaps are closed, end-to-end:
//   1) connect.mjs writes the callback env (CONTROL_PLANE_URL + KF_API_TOKEN)
//   2) a real build (engine/publish.mjs) registers a version that shows in the app
//   3) per-project Kissflow creds set via the app flow back through /bootstrap
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHandler } from "../src/server.mjs";
import { makeDb } from "../src/db.mjs";
import { mintSession } from "../src/auth.mjs";
import { connect, writeEnv } from "../../engine/connect.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = 8093, BASE = `http://localhost:${PORT}`;
const api = async (p, { m = "GET", tok, body } = {}) => { const r = await fetch(BASE + p, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? "✔" : "✗ FAIL —"} ${m}`); };

async function main() {
  const db = makeDb({ db: { backend: "memory" } });
  const srv = createServer(createHandler(db)).listen(PORT);
  await new Promise((r) => srv.once("listening", r));

  const alice = await db.upsertUser({ email: "alice@acme.com", name: "Alice" });
  const aTok = mintSession(alice);
  const proj = (await api("/projects", { m: "POST", tok: aTok, body: { name: "Wired App" } })).json.project;

  console.log("\n─── GAP 3: dev-env creds set in the app flow back through bootstrap ───");
  await api(`/projects/${proj.id}/dev-env`, { m: "POST", tok: aTok, body: { subdomain: "dev-lcncdemo", accountId: "AclohbCfcAX3m", apiKey: "AK_real", apiSecret: "AS_real_secret" } });
  const cu = (await api(`/projects/${proj.id}/connect-url`, { m: "POST", tok: aTok })).json;
  const boot = await connect({ token: cu.url, base: BASE });
  ok(boot.config.kissflow.apiKey === "AK_real" && boot.config.kissflow.apiSecret === "AS_real_secret", "real per-project Kissflow creds returned by /bootstrap (not a placeholder)");

  console.log("\n─── GAP 1: connect.mjs writes the callback env ───");
  const envPath = join(mkdtempSync(join(tmpdir(), "kfw-")), ".kf-env");
  writeEnv(boot.config, envPath);
  const env = readFileSync(envPath, "utf8");
  ok(/CONTROL_PLANE_URL=http/.test(env) && /KF_API_TOKEN=\S/.test(env), "env has CONTROL_PLANE_URL + KF_API_TOKEN (builds can call back)");
  ok(env.includes("AS_real_secret") && env.includes(`KF_MEM_ORG=${proj.mem_org}`), "env also carries dev creds + the project memory org");

  console.log("\n─── GAP 2: a real build (engine/publish.mjs) registers a version ───");
  const runDir = mkdtempSync(join(tmpdir(), "kfrun-"));
  writeFileSync(join(runDir, "app-spec.json"), JSON.stringify({ domain: {} }));
  writeFileSync(join(runDir, "review.html"), "<html>review</html>");
  // async spawn (NOT spawnSync) — the control plane runs in THIS process, so we must not block the loop
  const pub = await new Promise((resolve) => {
    let out = ""; const c = spawn("node", [join(__dir, "..", "..", "engine", "publish.mjs"), runDir, "--label", "v1 — first build"],
      { env: { ...process.env, CONTROL_PLANE_URL: BASE, KF_API_TOKEN: boot.config.apiToken, KF_PROJECT_ID: proj.id, KF_GCS_BUCKET: "kf-artifacts", KF_GCS_PREFIX: proj.gcs_prefix, KF_PUBLISH_UPLOAD: "none" } });
    c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d)); c.on("close", (code) => resolve({ code, out }));
  });
  ok(pub.code === 0 && /registered version/.test(pub.out), `publish.mjs registered the version (${(pub.out || "").trim().split("\n").pop()})`);
  const vs = (await api(`/projects/${proj.id}/versions`, { tok: aTok })).json.versions;
  ok(vs.length === 1 && vs[0].label === "v1 — first build" && /^cowork:/.test(vs[0].author) && vs[0].artifacts.review.includes(proj.gcs_prefix), "version now appears in the app's list, authored by the Cowork session, with GCS artifact URIs");

  console.log(`\n${fail === 0 ? "✔ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed\n`);
  srv.close(); process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
