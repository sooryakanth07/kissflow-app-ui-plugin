// control-plane-mock.mjs — stand-in for the hosted app (Cloud Run + Identity Platform + Firestore +
// Secret Manager) so the connect handshake runs with no cloud. Models the security properties that
// matter: Google-SSO identity, org-partitioned projects, membership/RBAC, short-lived SINGLE-USE
// connect tokens that carry NO secrets, and just-in-time scoped config on bootstrap.
//   node engine/test/control-plane-mock.mjs [port]      (default 8080)
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";

const PORT = +(process.argv[2] || 8080);
const SECRET = "mock-control-plane-signing-key";      // real: KMS-managed; tokens are opaque to sessions
const nowSec = () => Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const unb64 = (s) => JSON.parse(Buffer.from(s, "base64url").toString());
const hmac = (s) => createHmac("sha256", SECRET).update(s).digest("base64url");
function sign(payload) { const body = b64(payload); return body + "." + hmac(body); }
function verify(token) {
  const [body, sig] = String(token).split(".");
  if (!body || !sig || hmac(body) !== sig) throw Object.assign(new Error("bad signature"), { code: 401 });
  const p = unb64(body);
  if (p.exp < nowSec()) throw Object.assign(new Error("token expired"), { code: 401 });
  return p;
}

// ── in-memory "Firestore" + "Secret Manager" ──────────────────────────────────
const users = new Map();      // sub → { sub, email, name }
const projects = new Map();   // id → { id, name, ownerSub, memOrg, gcsPrefix, devEnvRef, createdAt }
const members = [];           // { projectId, sub, role }
const versions = new Map();   // projectId → [ { seq, label, author, artifacts, ts } ]
const secrets = new Map();    // devEnvRef → { subdomain, accountId, apiKey, apiSecret }  (Secret Manager stand-in)
const consumed = new Set();   // consumed connect-token jtis (single-use enforcement)

const memberOf = (projectId, sub) => members.find((m) => m.projectId === projectId && m.sub === sub);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

function createProject(name, ownerSub) {
  const id = slug(name) + "_" + randomUUID().slice(0, 4);
  const p = { id, name, ownerSub, memOrg: "org_" + id, gcsPrefix: id + "/", devEnvRef: "secret/" + id + "/kissflow", createdAt: nowSec() };
  projects.set(id, p);
  members.push({ projectId: id, sub: ownerSub, role: "owner" });
  versions.set(id, []);
  return p;
}

// the JIT scoped config a Cowork session gets — the ONLY place secrets are handed out (short-lived).
function scopedConfig(project, role, user) {
  const dev = secrets.get(project.devEnvRef) || { subdomain: "dev-lcncdemo", accountId: "AclohbCfcAX3m", apiKey: "DEV_KEY_PLACEHOLDER", apiSecret: "DEV_SECRET_PLACEHOLDER" };
  return {
    projectId: project.id, projectName: project.name, role,
    user: user ? { sub: user.sub, email: user.email || null, name: user.name || null } : null,
    memStore: process.env.KF_MEM_STORE || "memory", memOrg: project.memOrg,     // shared pool, org-partitioned
    gcs: { bucket: "kf-artifacts", prefix: project.gcsPrefix, token: "scoped-gcs-" + randomUUID().slice(0, 8) }, // downscoped to this prefix
    kissflow: { ...dev, target: "dev" },   // pinned to dev; real hardening = broker proxy, secret never leaves server
    expiresInSec: 3600,
  };
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
const body = (req) => new Promise((res) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { res(d ? JSON.parse(d) : {}); } catch { res({}); } }); });
const send = (r, code, obj) => { r.writeHead(code, { "Content-Type": "application/json" }); r.end(JSON.stringify(obj)); };
function auth(req) { // Bearer identity token → req user (Google-SSO stand-in)
  const h = req.headers.authorization || "";
  const p = verify(h.replace(/^Bearer /, ""));
  if (p.typ !== "identity") throw Object.assign(new Error("not an identity token"), { code: 401 });
  return p;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    const b = ["POST", "PUT"].includes(req.method) ? await body(req) : {};

    if (path === "/health") return send(res, 200, { status: "ok", projects: projects.size });

    // Google SSO (mock): exchange a Google identity for our session identity token.
    if (req.method === "POST" && path === "/auth/google") {
      if (!b.email) return send(res, 400, { error: "email required (mock Google identity)" });
      let u = [...users.values()].find((x) => x.email === b.email);
      if (!u) { u = { sub: "u_" + randomUUID().slice(0, 8), email: b.email, name: b.name || b.email.split("@")[0] }; users.set(u.sub, u); }
      return send(res, 200, { identityToken: sign({ typ: "identity", sub: u.sub, email: u.email, exp: nowSec() + 3600 }), user: u });
    }

    // everything below needs an authenticated user
    let me;
    if (path !== "/bootstrap") me = auth(req);

    // create a project from the APP (direction-1 origin), owner = caller
    if (req.method === "POST" && path === "/projects") {
      const p = createProject(b.name || "Untitled App", me.sub);
      return send(res, 200, { project: p });
    }

    // set the dev env ONCE (Kissflow creds → Secret Manager stand-in)
    let m = path.match(/^\/projects\/([^/]+)\/dev-env$/);
    if (req.method === "POST" && m) {
      const p = projects.get(m[1]); if (!p) return send(res, 404, { error: "no project" });
      if (memberOf(p.id, me.sub)?.role !== "owner") return send(res, 403, { error: "owner only" });
      secrets.set(p.devEnvRef, { subdomain: b.subdomain, accountId: b.accountId, apiKey: b.apiKey, apiSecret: b.apiSecret });
      return send(res, 200, { ok: true, devEnvRef: p.devEnvRef });   // returns the REF, never the secret
    }

    // mint a unique connect URL for an existing project (direction 1) — short-lived, single-use, no secrets
    m = path.match(/^\/projects\/([^/]+)\/connect-url$/);
    if (req.method === "POST" && m) {
      const p = projects.get(m[1]); if (!p) return send(res, 404, { error: "no project" });
      const role = memberOf(p.id, me.sub)?.role;
      if (!role || role === "viewer") return send(res, 403, { error: "builder or owner only" });
      const token = sign({ typ: "connect", jti: randomUUID(), projectId: p.id, sub: me.sub, role, exp: nowSec() + 600 });
      return send(res, 200, { url: `http://localhost:${PORT}/c/${token}`, token, expiresInSec: 600 });
    }

    // invite another user (multi-user)
    m = path.match(/^\/projects\/([^/]+)\/members$/);
    if (req.method === "POST" && m) {
      const p = projects.get(m[1]); if (!p) return send(res, 404, { error: "no project" });
      if (memberOf(p.id, me.sub)?.role !== "owner") return send(res, 403, { error: "owner only" });
      let u = [...users.values()].find((x) => x.email === b.email);
      if (!u) { u = { sub: "u_" + randomUUID().slice(0, 8), email: b.email, name: b.email.split("@")[0] }; users.set(u.sub, u); }
      if (!memberOf(p.id, u.sub)) members.push({ projectId: p.id, sub: u.sub, role: b.role || "builder" });
      return send(res, 200, { ok: true, member: { email: u.email, role: b.role || "builder" } });
    }

    // register / list versions (artifacts live in GCS; here we index them)
    m = path.match(/^\/projects\/([^/]+)\/versions$/);
    if (m && (req.method === "POST" || req.method === "GET")) {
      const p = projects.get(m[1]); if (!p) return send(res, 404, { error: "no project" });
      if (!memberOf(p.id, me.sub)) return send(res, 403, { error: "not a member" });
      const list = versions.get(p.id);
      if (req.method === "GET") return send(res, 200, { versions: list });
      const v = { seq: list.length + 1, label: b.label || `v${list.length + 1}`, author: me.email, artifacts: b.artifacts || {}, ts: nowSec() };
      list.push(v);
      return send(res, 200, { version: v });
    }

    // THE HANDSHAKE — a Cowork session exchanges a token for scoped config. Two directions:
    if (req.method === "POST" && path === "/bootstrap") {
      const p = verify(b.token);
      if (p.typ === "connect") {                       // direction 1: attach to an existing project
        if (consumed.has(p.jti)) return send(res, 409, { error: "connect token already used (single-use)" });
        consumed.add(p.jti);
        const project = projects.get(p.projectId); if (!project) return send(res, 404, { error: "no project" });
        if (!memberOf(project.id, p.sub)) return send(res, 403, { error: "not a member of this project" });
        return send(res, 200, { mode: "attach", config: scopedConfig(project, p.role, users.get(p.sub) || { sub: p.sub }) });
      }
      if (p.typ === "identity" && b.mode === "create") { // direction 2: start a NEW app from Cowork
        const project = createProject(b.appName || "New App", p.sub);   // auto-create + auto-own
        return send(res, 200, { mode: "created", config: scopedConfig(project, "owner", users.get(p.sub) || { sub: p.sub, email: p.email }) });
      }
      return send(res, 400, { error: "unusable token for bootstrap" });
    }

    send(res, 404, { error: "not found", path });
  } catch (e) {
    send(res, e.code || 500, { error: e.message });
  }
}).listen(PORT, () => console.log(`control-plane-mock on http://localhost:${PORT}`));
