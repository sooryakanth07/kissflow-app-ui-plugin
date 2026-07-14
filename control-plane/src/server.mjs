// server.mjs — the control-plane HTTP app. Same routes as the mock, now backed by the real db + Google
// OAuth. `createHandler(db)` returns the request handler so tests can drive it with an in-memory db.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { cfg } from "./config.mjs";
import { makeDb } from "./db.mjs";
import { sign, verify, mintSession, mintConnect, mintProjectToken, requireSession, googleAuthUrl, exchangeCode } from "./auth.mjs";
import { secrets } from "./secrets.mjs";
import { embedText, orderHits, renderSyncMd, curateWrite } from "./memory.mjs";
import { landingPage, dashboardPage, projectPage, connectApprovePage } from "./ui.mjs";

const send = (r, code, obj, headers = {}) => { r.writeHead(code, { "Content-Type": "application/json", ...headers }); r.end(JSON.stringify(obj)); };
const html = (r, body, headers = {}) => { r.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...headers }); r.end(body); };
const redirect = (r, url, headers = {}) => { r.writeHead(302, { Location: url, ...headers }); r.end(); };
const body = (req) => new Promise((res) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { res(d ? JSON.parse(d) : {}); } catch { res({}); } }); });
const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=").map(decodeURIComponent)).filter((x) => x[0]));
function sessionOf(req) { // session from Bearer (API/Cowork) or cookie (browser)
  const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");
  const c = cookies(req);
  return requireSession(bearer || c.kf_session || "");
}

// the ONLY place secrets/scoped access are handed to a Cowork session (short-lived).
// `user` = who redeemed the token (from the connect/identity token's sub) — the session needs it for
// attribution (versions, memory writes) without a second round-trip.
// Creds resolve via the project's linked REUSABLE dev env (dev_env_id → dev_envs.secret_ref),
// falling back to the legacy per-project secret (dev_env_ref) for pre-migration projects.
async function resolveDevEnvCreds(db, project) {
  if (project.dev_env_id) {
    const env = await db.getDevEnv(project.dev_env_id);
    if (env) { const c = await secrets.get(env.secret_ref); if (c) return c; }
  }
  return project.dev_env_ref ? await secrets.get(project.dev_env_ref) : null;
}
const devEnvConfigured = (p) => Boolean(p.dev_env_id || p.dev_env_ref);
async function scopedConfig(project, role, user, db) {
  const creds = await resolveDevEnvCreds(db, project);
  return {
    projectId: project.id, projectName: project.name, role,
    user: user ? { sub: user.sub, email: user.email || null, name: user.name || null } : null,
    controlPlaneUrl: cfg.baseUrl,                      // where the session calls back (register versions…)
    apiToken: mintProjectToken({ projectId: project.id, role }), // project-scoped bearer for those callbacks
    memStore: cfg.memStore, memOrg: project.mem_org,
    gcs: { bucket: cfg.gcsBucket, prefix: project.gcs_prefix },
    kissflow: creds
      ? { devEnvId: project.dev_env_id || null, subdomain: creds.subdomain, accountId: creds.accountId, apiKey: creds.apiKey, apiSecret: creds.apiSecret, target: "dev" }
      : { devEnvId: project.dev_env_id || null, configured: false, target: "dev" },
    expiresInSec: 3600,
  };
}

// fetch a gs:// object via the runtime SA (has objectAdmin on the bucket). Cloud Run only.
async function gcsFetch(uri) {
  const m = uri.match(/^gs:\/\/([^/]+)\/(.+)$/); if (!m) return null;
  let tok = ""; try { const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } }); tok = (await r.json()).access_token; } catch {}
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${m[1]}/o/${encodeURIComponent(m[2])}?alt=media`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
  return r.ok ? await r.text() : null;
}

export function createHandler(db) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, cfg.baseUrl);
      const path = url.pathname;
      const b = ["POST", "PUT"].includes(req.method) ? await body(req) : {};

      if (path === "/health") return send(res, 200, { status: "ok", db: db.kind });

      // ── Google SSO (OAuth 2.0) ──────────────────────────────────────────────
      if (req.method === "GET" && path === "/auth/google/login") {
        const state = randomUUID();
        return redirect(res, googleAuthUrl(state), { "Set-Cookie": `kf_oauth_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax` });
      }
      if (req.method === "GET" && path === "/auth/google/callback") {
        const code = url.searchParams.get("code"), state = url.searchParams.get("state");
        if (!code || state !== cookies(req).kf_oauth_state) return send(res, 400, { error: "bad oauth state" });
        const gid = await exchangeCode(code);
        const user = await db.upsertUser(gid);
        const token = mintSession(user);
        // browser gets a cookie + redirect home; the token is also usable as a Bearer for the CLI/Cowork.
        return redirect(res, cfg.baseUrl + "/", { "Set-Cookie": `kf_session=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax` });
      }
      if (req.method === "GET" && path === "/auth/logout")
        return redirect(res, cfg.baseUrl + "/", { "Set-Cookie": "kf_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax" });

      // UI landing (before the auth gate): signed-out → landing/sign-in page; signed-in → dashboard.
      if (req.method === "GET" && path === "/") {
        let u = null; try { u = sessionOf(req); } catch {}
        if (!u) return html(res, landingPage());
        // env rows carry a MASKED key hint (last 4 of the key id, never the secret) so the edit
        // modal can show that credentials exist — the blank write-only fields read as "empty" otherwise
        const envs = await Promise.all((await db.listDevEnvsForUser(u.sub)).map(async (e) => {
          const c = await secrets.get(e.secret_ref);
          return { ...e, keyHint: c?.apiKey ? String(c.apiKey).slice(-4) : null,
            credState: c?.apiKey && c?.apiSecret ? "ok" : c?.apiKey || c?.apiSecret ? "partial" : "none" };
        }));
        return html(res, dashboardPage(u, await db.listProjectsForUser(u.sub), envs));
      }

      // ── everything below needs a user session, EXCEPT /bootstrap and version-writes (which carry
      // their own connect/project tokens from a Cowork session). Bad/stale cookies bounce browsers to
      // login rather than hard-erroring; API clients (Bearer) still get a clean 401.
      const isVersionWrite = req.method === "POST" && /^\/projects\/[^/]+\/versions$/.test(path);
      const isAdmin = path.startsWith("/admin/");
      const isDevice = path.startsWith("/device/"); // CLI side of the browser flow — the code IS the credential
      const isMemory = path.startsWith("/memory/"); // memory proxy — project token (Cowork session) or admin

      // ── memory proxy: the hive lives HERE. Sessions authenticate with the project-scoped token
      // from bootstrap (typ:"session"); the admin token may write cross-org (e.g. seed "global").
      if (isMemory) {
        const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");
        let org = null, byAdmin = false;
        if (cfg.adminToken && bearer === cfg.adminToken) { byAdmin = true; org = b.org || "global"; }
        else {
          let tk; try { tk = verify(bearer); } catch { return send(res, 401, { error: "memory: project token or admin token required" }); }
          if (tk.typ !== "session" || !tk.projectId) return send(res, 401, { error: "memory: not a project token" });
          const proj = await db.getProject(tk.projectId);
          if (!proj) return send(res, 404, { error: "memory: unknown project" });
          org = proj.mem_org;
        }
        if (req.method === "POST" && path === "/memory/write") {
          if (!b.text || String(b.text).length < 8) return send(res, 400, { error: "text (≥8 chars) required" });
          let row = { org, scope: b.scope || "global", tier: b.tier || "observed-once", kind: b.kind || "interpretation",
            agent: b.agent || null, app: b.app || null, impossible: !!b.impossible, text: String(b.text), embedding: embedText(b.text) };
          if (!byAdmin && row.scope === "global" && org !== "global") row.scope = "app"; // sessions can't publish canon — org-partitioned only
          row = curateWrite(row, byAdmin); // suspicion check: impossibility claims quarantine until owner-confirmed
          const r = await db.memUpsert(row);
          return send(res, 200, { ...r, verdict: row.verdict });
        }
        if (req.method === "POST" && path === "/memory/recall") {
          const hits = await db.memSearch([org, "global"], embedText(b.query || ""), { scope: b.scope, app: b.app, agent: b.agent, top_k: b.top_k || 12 });
          return send(res, 200, { hits: orderHits(hits).map(({ embedding, ...h }) => h) });
        }
        if (req.method === "GET" && path === "/memory/sync") {
          const all = await db.memList([org, "global"]);
          const payload = { global: all.filter((m) => m.org === "global"), project: all.filter((m) => m.org === org) };
          return send(res, 200, { org, counts: { global: payload.global.length, project: payload.project.length },
            md: renderSyncMd(payload, org), fetchedAt: new Date().toISOString() });
        }
        return send(res, 404, { error: "unknown memory route" });
      }

      let me;
      if (path !== "/bootstrap" && !isVersionWrite && !isAdmin && !isDevice) {
        try { me = sessionOf(req); }
        catch (e) {
          const isBrowser = req.method === "GET" && !req.headers.authorization;
          if (isBrowser) return redirect(res, cfg.baseUrl + "/auth/google/login", { "Set-Cookie": "kf_session=; HttpOnly; Path=/; Max-Age=0" });
          throw e;
        }
      }

      // project detail UI
      let mm;
      if (req.method === "GET" && (mm = path.match(/^\/p\/([^/]+)$/))) {
        const project = await db.getProject(mm[1]); if (!project) return send(res, 404, { error: "no project" });
        if (!(await db.getMember(project.id, me.sub))) return send(res, 403, { error: "not a member" });
        const linkedEnv = project.dev_env_id ? await db.getDevEnv(project.dev_env_id) : null;
        return html(res, projectPage(me, project, await db.listMembers(project.id), await db.listVersions(project.id), await db.listDevEnvsForUser(me.sub), linkedEnv));
      }

      // ── reusable dev environments: set up ONCE, pick per project ───────────
      if (req.method === "GET" && path === "/dev-envs")
        return send(res, 200, { devEnvs: await db.listDevEnvsForUser(me.sub) });
      if (req.method === "POST" && path === "/dev-envs") {
        if (!b.subdomain || !b.apiKey || !b.apiSecret) return send(res, 400, { error: "subdomain + access key id + access key secret are all required" });
        const env = await db.createDevEnv({ name: b.name, ownerSub: me.sub, subdomain: b.subdomain, accountId: b.accountId });
        await secrets.put(env.secret_ref, { subdomain: b.subdomain, accountId: b.accountId, apiKey: b.apiKey, apiSecret: b.apiSecret });
        return send(res, 200, { devEnv: { ...env, secret_ref: undefined } });
      }

      let md;
      // owner edits an env: metadata (name/subdomain/account) and/or credential rotation. The secret
      // payload carries subdomain+account too, so any change re-writes it as a merged new version;
      // blank key/secret = keep the current ones.
      if (req.method === "PUT" && (md = path.match(/^\/dev-envs\/([^/]+)$/))) {
        const env = await db.getDevEnv(md[1]); if (!env) return send(res, 404, { error: "no such dev environment" });
        if (env.owner_sub !== me.sub) return send(res, 403, { error: "owner only" });
        if ((b.apiKey || b.apiSecret) && !(b.apiKey && b.apiSecret)) return send(res, 400, { error: "rotate with the FULL key pair — access key id AND secret together" });
        const updated = await db.updateDevEnv(env.id, { name: b.name || null, subdomain: b.subdomain || null, account_id: b.accountId || null });
        const cur = (await secrets.get(env.secret_ref)) || {};
        await secrets.put(env.secret_ref, {
          subdomain: b.subdomain || cur.subdomain || env.subdomain,
          accountId: b.accountId || cur.accountId || env.account_id,
          apiKey: b.apiKey || cur.apiKey,
          apiSecret: b.apiSecret || cur.apiSecret,
        });
        return send(res, 200, { ok: true, devEnv: { ...updated, secret_ref: undefined }, rotated: !!(b.apiKey || b.apiSecret) });
      }
      if (req.method === "DELETE" && (md = path.match(/^\/dev-envs\/([^/]+)$/))) {
        const env = await db.getDevEnv(md[1]); if (!env) return send(res, 404, { error: "no such dev environment" });
        if (env.owner_sub !== me.sub) return send(res, 403, { error: "owner only" });
        const using = await db.projectsUsingEnv(env.id);
        if (using.length) return send(res, 409, { error: `in use by ${using.length} project(s): ${using.map((p) => p.name).join(", ")} — relink them first`, projects: using });
        await secrets.del(env.secret_ref); // creds leave Secret Manager with the env
        await db.deleteDevEnv(env.id);
        return send(res, 200, { ok: true, deleted: env.id });
      }

      if (req.method === "POST" && path === "/projects") {
        if (b.devEnvId) { // creating with a selected dev env — validate it's the caller's
          const env = await db.getDevEnv(b.devEnvId);
          if (!env || env.owner_sub !== me.sub) return send(res, 403, { error: "not your dev environment" });
        }
        const p = await db.createProject(b.name || "Untitled App", me.sub);
        if (b.devEnvId) { await db.setProjectDevEnv(p.id, b.devEnvId); p.dev_env_id = b.devEnvId; }
        return send(res, 200, { project: p });
      }

      // admin bulk-import (seed) — shared secret, bypasses Google SSO. Creates a project owned by ownerEmail.
      if (req.method === "POST" && path === "/admin/project") {
        if (!cfg.adminToken || (req.headers.authorization || "") !== "Bearer " + cfg.adminToken) return send(res, 401, { error: "admin token required" });
        const owner = await db.upsertUser({ email: b.ownerEmail, name: (b.ownerEmail || "admin").split("@")[0] });
        const project = await db.createProject(b.name || "Imported App", owner.sub);
        return send(res, 200, { project });
      }
      if (req.method === "POST" && path === "/admin/delete-project") {
        if (!cfg.adminToken || (req.headers.authorization || "") !== "Bearer " + cfg.adminToken) return send(res, 401, { error: "admin token required" });
        const deleted = await db.deleteProject({ id: b.projectId, name: b.name });
        return send(res, 200, { deleted });
      }

      let m;
      // owner deletes a project: memberships + versions cascade; legacy per-project secret is
      // best-effort removed. Reusable dev envs, GCS artifacts and hive memories survive on purpose.
      if (req.method === "DELETE" && (m = path.match(/^\/projects\/([^/]+)$/))) {
        const p = await db.getProject(m[1]); if (!p) return send(res, 404, { error: "no project" });
        if ((await db.getMember(p.id, me.sub))?.role !== "owner") return send(res, 403, { error: "owner only" });
        if (p.dev_env_ref) await secrets.del(p.dev_env_ref);
        const n = await db.deleteProject({ id: p.id });
        return send(res, 200, { ok: true, deleted: n });
      }

      if ((m = path.match(/^\/projects\/([^/]+)\/dev-env$/)) && req.method === "POST") {
        const p = await db.getProject(m[1]); if (!p) return send(res, 404, { error: "no project" });
        if ((await db.getMember(p.id, me.sub))?.role !== "owner") return send(res, 403, { error: "owner only" });
        // link an EXISTING reusable dev env…
        if (b.devEnvId) {
          const env = await db.getDevEnv(b.devEnvId);
          if (!env || env.owner_sub !== me.sub) return send(res, 403, { error: "not your dev environment" });
          await db.setProjectDevEnv(p.id, env.id);
          return send(res, 200, { ok: true, devEnvId: env.id, configured: true });
        }
        // …or create a new reusable env from raw creds (Secret Manager, never Postgres) and link it
        if ((b.subdomain || b.apiKey || b.apiSecret) && !(b.subdomain && b.apiKey && b.apiSecret))
          return send(res, 400, { error: "subdomain + access key id + access key secret are all required" });
        if (b.subdomain || b.apiKey) {
          const env = await db.createDevEnv({ name: b.name || b.subdomain, ownerSub: me.sub, subdomain: b.subdomain, accountId: b.accountId });
          await secrets.put(env.secret_ref, { subdomain: b.subdomain, accountId: b.accountId, apiKey: b.apiKey, apiSecret: b.apiSecret });
          await db.setProjectDevEnv(p.id, env.id);
          return send(res, 200, { ok: true, devEnvId: env.id, configured: true });
        }
        // legacy no-creds "mark configured" (kept for the old UI path/tests)
        const ref = "secret/" + p.id + "/kissflow";
        await db.setDevEnvRef(p.id, ref);
        return send(res, 200, { ok: true, devEnvRef: ref, configured: false });
      }
      if ((m = path.match(/^\/projects\/([^/]+)\/connect-url$/)) && req.method === "POST") {
        const p = await db.getProject(m[1]); if (!p) return send(res, 404, { error: "no project" });
        const role = (await db.getMember(p.id, me.sub))?.role;
        if (!role || role === "viewer") return send(res, 403, { error: "builder or owner only" });
        const token = mintConnect({ projectId: p.id, sub: me.sub, role });
        return send(res, 200, { url: `${cfg.baseUrl}/c/${token}`, token, expiresInSec: 600 });
      }
      if ((m = path.match(/^\/projects\/([^/]+)\/members$/)) && req.method === "POST") {
        const p = await db.getProject(m[1]); if (!p) return send(res, 404, { error: "no project" });
        if ((await db.getMember(p.id, me.sub))?.role !== "owner") return send(res, 403, { error: "owner only" });
        const u = await db.upsertUser({ email: b.email, name: b.email?.split("@")[0] });
        await db.addMember(p.id, u.sub, b.role || "builder");
        return send(res, 200, { ok: true, member: { email: u.email, role: b.role || "builder" } });
      }
      if ((m = path.match(/^\/projects\/([^/]+)\/versions$/)) && (req.method === "GET" || req.method === "POST")) {
        const p = await db.getProject(m[1]); if (!p) return send(res, 404, { error: "no project" });
        if (req.method === "GET") { // UI list — user session member
          if (!me || !(await db.getMember(p.id, me.sub))) return send(res, 403, { error: "not a member" });
          return send(res, 200, { versions: await db.listVersions(p.id) });
        }
        // POST register — a Cowork session's project token for THIS project, a member's user session, or the admin token
        const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");
        let author = null;
        try { const tk = verify(bearer);
          if (tk.typ === "session" && tk.projectId === p.id) author = "cowork:" + (tk.role || "builder");
          else if (tk.typ === "identity" && (await db.getMember(p.id, tk.sub))) author = tk.email;
        } catch {}
        if (!author && cfg.adminToken && bearer === cfg.adminToken) author = b.author || "admin-import";
        if (!author) return send(res, 403, { error: "not authorized to register versions for this project" });
        const v = await db.addVersion(p.id, { label: b.label, author, artifacts: b.artifacts || {} });
        return send(res, 200, { version: v });
      }

      // serve a version's artifact (review/prototype HTML, ir json) — member-gated, streamed from GCS
      if ((m = path.match(/^\/projects\/([^/]+)\/versions\/(\d+)\/([a-z]+)$/)) && req.method === "GET") {
        const p = await db.getProject(m[1]); if (!p) return send(res, 404, { error: "no project" });
        if (!me || !(await db.getMember(p.id, me.sub))) return send(res, 403, { error: "not a member" });
        const v = (await db.listVersions(p.id)).find((x) => String(x.seq) === m[2]); if (!v) return send(res, 404, { error: "no such version" });
        const uri = (v.artifacts || {})[m[3]]; if (!uri) return send(res, 404, { error: "no such artifact" });
        if (/^https?:\/\//.test(uri)) return redirect(res, uri);
        const body = uri.startsWith("gs://") ? await gcsFetch(uri) : (existsSync(uri) ? readFileSync(uri, "utf8") : null);
        if (body == null) return send(res, 404, { error: "artifact not available yet (build may not have uploaded it)" });
        res.writeHead(200, { "Content-Type": m[3] === "ir" ? "application/json" : "text/html; charset=utf-8" });
        return res.end(body);
      }

      // ── browser device-flow: the plugin parks a request, the user approves it in THIS app ────────
      // POST /device/start {redirectUri?} → { code, verifyUrl } (no auth — the code is the credential)
      if (req.method === "POST" && path === "/device/start") {
        const ru = b.redirectUri || null;
        if (ru && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(ru)) return send(res, 400, { error: "redirectUri must be a loopback address" });
        const r = await db.createConnectReq(ru);
        return send(res, 200, { code: r.code, verifyUrl: `${cfg.baseUrl}/connect/${r.code}`, expiresInSec: 900, intervalSec: 3 });
      }
      // POST /device/poll {code} → pending | approved(+scoped config, single-use) | gone
      if (req.method === "POST" && path === "/device/poll") {
        const r = await db.getConnectReq(b.code || "");
        if (!r) return send(res, 404, { error: "unknown or already-redeemed code" });
        if (new Date(r.expires_at) < new Date()) { await db.deleteConnectReq(r.code); return send(res, 410, { error: "connect request expired — start again" }); }
        if (r.status !== "approved") return send(res, 200, { status: "pending" });
        const project = await db.getProject(r.project_id);
        const user = (await db.getUser(r.sub)) || { sub: r.sub };
        await db.deleteConnectReq(r.code); // single-use: config is handed out exactly once
        if (!project) return send(res, 404, { error: "project vanished before redemption" });
        await db.markConnected(project.id, user.email || user.sub);
        return send(res, 200, { status: "approved", mode: "attach", config: await scopedConfig(project, r.role, user, db) });
      }
      // GET /connect/{code} — the approval page (session-gated; browsers bounce through Google SSO)
      if (req.method === "GET" && (m = path.match(/^\/connect\/([^/]+)$/))) {
        const r = await db.getConnectReq(m[1]);
        if (!r || new Date(r.expires_at) < new Date() || r.status !== "pending")
          return html(res, connectApprovePage(me, null, [], null)); // renders the "link expired" state
        const projects = (await db.listProjectsForUser(me.sub)).filter((p) => p.role !== "viewer");
        return html(res, connectApprovePage(me, r.code, projects, r.redirect_uri, await db.listDevEnvsForUser(me.sub)));
      }
      // POST /connect/{code}/approve {projectId | name} — bind the request to a project (dev env required)
      if (req.method === "POST" && (m = path.match(/^\/connect\/([^/]+)\/approve$/))) {
        const r = await db.getConnectReq(m[1]);
        if (!r || r.status !== "pending" || new Date(r.expires_at) < new Date()) return send(res, 410, { error: "connect request expired — restart setup in the plugin" });
        let project, role;
        if (b.projectId) {
          project = await db.getProject(b.projectId); if (!project) return send(res, 404, { error: "no project" });
          role = (await db.getMember(project.id, me.sub))?.role;
          if (!role || role === "viewer") return send(res, 403, { error: "builder or owner only" });
        } else {
          project = await db.createProject(b.name || "New App", me.sub); role = "owner";
        }
        if (b.devEnvId && !devEnvConfigured(project)) { // approve-with-env: link the picked reusable env in one call
          const env = await db.getDevEnv(b.devEnvId);
          if (!env || env.owner_sub !== me.sub) return send(res, 403, { error: "not your dev environment" });
          await db.setProjectDevEnv(project.id, env.id); project.dev_env_id = env.id;
        }
        if (!devEnvConfigured(project)) return send(res, 409, { error: "dev environment not configured for this project", needsDevEnv: true, projectId: project.id });
        await db.approveConnectReq(r.code, { projectId: project.id, sub: me.sub, role });
        const back = r.redirect_uri ? `${r.redirect_uri}?code=${r.code}&project=${encodeURIComponent(project.id)}&name=${encodeURIComponent(project.name)}&base=${encodeURIComponent(cfg.baseUrl)}` : null;
        return send(res, 200, { ok: true, projectId: project.id, projectName: project.name, redirect: back });
      }

      // ── the handshake ───────────────────────────────────────────────────────
      if (req.method === "POST" && path === "/bootstrap") {
        const p = verify(b.token);
        if (p.typ === "connect") {
          if (!(await db.consumeToken(p.jti))) return send(res, 409, { error: "connect token already used (single-use)" });
          const project = await db.getProject(p.projectId); if (!project) return send(res, 404, { error: "no project" });
          if (!(await db.getMember(project.id, p.sub))) return send(res, 403, { error: "not a member" });
          const user = (await db.getUser(p.sub)) || { sub: p.sub };
          await db.markConnected(project.id, user.email || user.sub);
          return send(res, 200, { mode: "attach", config: await scopedConfig(project, p.role, user, db) });
        }
        if (p.typ === "identity" && b.mode === "create") {
          const project = await db.createProject(b.appName || "New App", p.sub);
          const user = (await db.getUser(p.sub)) || { sub: p.sub, email: p.email };
          await db.markConnected(project.id, user.email || user.sub);
          return send(res, 200, { mode: "created", config: await scopedConfig(project, "owner", user, db) });
        }
        return send(res, 400, { error: "unusable token for bootstrap" });
      }

      send(res, 404, { error: "not found", path });
    } catch (e) {
      send(res, e.code || 500, { error: e.message });
    }
  };
}

// ── boot ────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const db = makeDb(cfg);
  await db.migrate();
  createServer(createHandler(db)).listen(cfg.port, () => console.log(`kf-control-plane on ${cfg.baseUrl} (db: ${db.kind}, sso: google-oauth)`));
}
