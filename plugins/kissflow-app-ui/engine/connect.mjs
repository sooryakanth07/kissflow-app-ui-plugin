// connect.mjs — the Cowork/plugin side of the handshake. Exchanges a connect token for JIT scoped
// config and writes the runtime env so the pipeline is ready to build against the RIGHT project:
// Kissflow creds (dev), the project's shared-memory org, and its GCS artifact prefix. The token is
// OPAQUE to the session — no signing key here, no secrets in the URL.
//
//   node engine/connect.mjs --auto [--env .kf-env] [--base URL]   # browser handshake (OAuth-style device flow)
//   node engine/connect.mjs <connect-url|token> [--env .kf-env] [--base URL]        # attach (direction 1)
//   node engine/connect.mjs --new "<App name>" --identity <token> [--base URL]      # create (direction 2)
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const tokenFromUrl = (s) => (s && s.includes("/c/") ? s.split("/c/")[1] : s);

// core: POST /bootstrap → scoped config. Returns { mode, config }.
export async function connect({ token, base, mode, appName, identity }) {
  const b = base || process.env.CONTROL_PLANE_URL || "https://appbuilder.zingworks.com";
  const payload = mode === "create" ? { token: identity, mode: "create", appName } : { token: tokenFromUrl(token) };
  const r = await fetch(b + "/bootstrap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok) throw new Error(`bootstrap failed (${r.status}): ${j.error || "unknown"}`);
  return j;
}

// ── browser device-flow (the appbuilder control plane acts as the OAuth-style provider) ─────────
// Parks a connect request, sends the user's browser to appbuilder (sign-in → pick/create project →
// dev env → approve), and polls until the approval turns into scoped config. A loopback redirect
// snaps the browser back instantly when we can listen locally; polling alone covers headless/Cowork.
export async function connectAuto({ base, openBrowser = true, onVerify, pollMs } = {}) {
  const b = base || process.env.CONTROL_PLANE_URL || "https://appbuilder.zingworks.com";
  // best-effort loopback listener — purely an accelerator, polling is the source of truth
  let redirectUri = null, loop = null, approvedPing = () => {};
  // styled "connected" popup: dimmed backdrop + card + Continue → the project page in appbuilder
  const successPage = (q) => {
    const clean = (s) => String(s || "").replace(/[<>&"']/g, ""); // loopback is localhost, but never render raw query
    const proj = clean(q.get("project")), name = clean(q.get("name")) || proj || "your project";
    const base = clean(q.get("base")) || b;
    const appUrl = (/^https?:\/\//.test(base) ? base : b).replace(/\/$/, "") + (proj ? `/p/${encodeURIComponent(proj)}` : "/");
    return `<!doctype html><html><head><meta charset="utf-8"><title>Connected · appbuilder</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"Sora",system-ui,sans-serif;background:radial-gradient(60% 50% at 15% 0%,rgba(124,92,255,.14),transparent 60%),radial-gradient(50% 40% at 90% 10%,rgba(59,141,255,.12),transparent 60%),#f5f6fb;color:#151827}
@media(prefers-color-scheme:dark){body{background:radial-gradient(60% 50% at 15% 0%,rgba(124,92,255,.22),transparent 60%),#07080d;color:#eaecf6}.card{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12)}.sub{color:#8990ab}}
.card{background:#fff;border:1px solid #e7e9f2;border-radius:20px;padding:38px 42px;max-width:420px;text-align:center;box-shadow:0 30px 80px -24px rgba(20,23,45,.35);animation:pop .3s cubic-bezier(.2,.9,.3,1.2)}
.tick{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#7c5cff,#3b8dff);display:grid;place-items:center;margin:0 auto 18px;color:#fff;font-size:26px;box-shadow:0 10px 30px -8px rgba(124,92,255,.5)}
h1{font-size:22px;margin:0 0 8px;letter-spacing:-.02em}.sub{color:#666d85;font-size:14.5px;line-height:1.55;margin:0 0 26px}
.go{display:inline-block;padding:13px 26px;border-radius:12px;background:linear-gradient(135deg,#7c5cff,#3b8dff);color:#fff;text-decoration:none;font-weight:600;font-size:15px;box-shadow:0 10px 30px -8px rgba(124,92,255,.5)}
@keyframes pop{from{opacity:0;transform:scale(.94) translateY(10px)}to{opacity:1;transform:none}}</style></head>
<body><div class="card"><div class="tick">✓</div><h1>Session connected</h1>
<p class="sub">Your Cowork session is attached to <b>${name}</b> — credentials, memory and artifacts are scoped and ready. You can return to your session, or follow the project in appbuilder.</p>
<a class="go" href="${appUrl}">Continue to ${name} →</a></div></body></html>`;
  };
  try {
    loop = createServer((rq, rs) => { const q = new URL(rq.url, "http://x").searchParams; rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); rs.end(successPage(q)); approvedPing(); });
    await new Promise((res, rej) => { loop.once("error", rej); loop.listen(0, "127.0.0.1", res); });
    redirectUri = `http://127.0.0.1:${loop.address().port}/cb`;
  } catch { loop = null; }

  const r = await fetch(b + "/device/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirectUri }) });
  const start = await r.json();
  if (!r.ok) { loop?.close(); throw new Error(`device start failed (${r.status}): ${start.error || "unknown"}`); }

  (onVerify || ((url) => {
    console.log(`\n➜ Open this link to connect (sign in, pick your project):\n  ${url}\n`);
    if (openBrowser) { const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"; try { spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref(); } catch {} }
  }))(start.verifyUrl);

  const deadline = Date.now() + (start.expiresInSec || 900) * 1000;
  const interval = pollMs || (start.intervalSec || 3) * 1000;
  try {
    while (Date.now() < deadline) {
      const pr = await fetch(b + "/device/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: start.code }) });
      const j = await pr.json();
      if (pr.ok && j.status === "approved") return { mode: j.mode, config: j.config };
      if (!pr.ok) throw new Error(`poll failed (${pr.status}): ${j.error || "unknown"}`); // 404/410 = code gone — restart, don't spin
      await new Promise((res) => { const t = setTimeout(res, interval); approvedPing = () => { clearTimeout(t); res(); }; }); // loopback hit → poll immediately
    }
    throw new Error("connect timed out — re-run setup to get a fresh link");
  } finally { loop?.close(); }
}

// pull the NEWEST global + project memory from the control plane and materialize it as
// MEMORY-REMOTE.md — every session starts with the server's canon, not just the plugin-shipped file.
// Non-fatal: a failed sync never blocks connecting.
export async function syncMemory(config, outPath = "MEMORY-REMOTE.md") {
  try {
    const r = await fetch((config.controlPlaneUrl || "") + "/memory/sync", { headers: { Authorization: `Bearer ${config.apiToken}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    writeFileSync(outPath, j.md);
    return { counts: j.counts, outPath };
  } catch (e) { console.error(`memory sync skipped (${e.message})`); return null; }
}

// write the scoped config into the plugin's runtime env (the .kf-env the pipeline sources).
export function writeEnv(config, envPath = ".kf-env") {
  const k = config.kissflow || {};
  const u = config.user || {};
  const lines = [
    `# generated by connect.mjs — project ${config.projectName} (${config.projectId}), role ${config.role}${u.email ? `, user ${u.email}` : ""}`,
    `export KF_PROJECT_ID=${config.projectId}`,
    `export KF_PROJECT_NAME=${JSON.stringify(config.projectName || "")}`, // the working context — agents anchor questions/app naming to this
    `export KF_ROLE=${config.role}`,
    `export KF_USER_ID=${u.sub || ""}`,                         // who connected — for version/memory attribution
    `export KF_USER_EMAIL=${u.email || ""}`,
    `export CONTROL_PLANE_URL=${config.controlPlaneUrl || ""}`, // where builds register versions
    `export KF_API_TOKEN=${config.apiToken || ""}`,             // project-scoped bearer for those callbacks
    `export KF_MEM_STORE=${config.memStore}`,             // shared memory backend…
    `export KF_MEM_ORG=${config.memOrg}`,                 // …partitioned to THIS project's org
    `export KF_GCS_BUCKET=${config.gcs.bucket}`,
    `export KF_GCS_PREFIX=${config.gcs.prefix}`,          // artifacts scoped to this project
    `export KF_TARGET=${k.target || "dev"}`,              // pinned to dev
  ];
  if (k.configured === false) lines.push(`# ⚠ Kissflow dev creds NOT set for this project — configure them in the app (Dev environment)`);
  else lines.push(
    `export KISSFLOW_SUBDOMAIN=${k.subdomain}`,
    `export ACCOUNT_ID=${k.accountId}`,
    `export API_KEY=${k.apiKey}`,
    `export API_SECRET=${k.apiSecret}`,
  );
  writeFileSync(envPath, lines.join("\n") + "\n");
  return envPath;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const a = process.argv.slice(2);
  const flag = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const base = flag("--base"); const envPath = flag("--env") || ".kf-env";
  const bareToken = a.find((x) => !x.startsWith("--"));
  const { mode, config } = a.includes("--auto") || (!bareToken && !a.includes("--new"))
    ? await connectAuto({ base })
    : await connect(a.includes("--new")
        ? { mode: "create", appName: flag("--new"), identity: flag("--identity"), base }
        : { token: bareToken, base });
  writeEnv(config, envPath);
  const mem = await syncMemory(config);
  console.log(`✔ ${mode}: ${config.projectName} (${config.projectId}) as ${config.role}${config.user?.email ? ` (${config.user.email})` : ""}`);
  console.log(`  env → ${envPath} · memory org ${config.memOrg} · artifacts gs://${config.gcs.bucket}/${config.gcs.prefix}`);
  if (mem) console.log(`  memory → ${mem.outPath} (${mem.counts.global} global + ${mem.counts.project} project entries, fresh from the server)`);
  console.log(`  next: source ${envPath} && /author-app "<requirement>"`);
}
