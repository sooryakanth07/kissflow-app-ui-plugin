// db.mjs — the data layer, ONE interface, two backends:
//   pg      → Cloud SQL Postgres (prod). Runs schema.sql at startup; the SAME db holds pgvector memory.
//   memory  → in-process maps (tests + local). Lets the route logic be proven without a live database.
// Interface: upsertUser, getUser, getUserByEmail, createProject, getProject, addMember, getMember,
//            listMembers, setDevEnvRef, addVersion, listVersions, consumeToken (single-use connect tokens),
//            createConnectReq/getConnectReq/approveConnectReq/deleteConnectReq (browser device-flow),
//            createDevEnv/getDevEnv/listDevEnvsForUser/setProjectDevEnv (reusable dev environments).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
const projShape = (name, ownerSub) => {
  const id = slug(name) + "_" + randomUUID().slice(0, 4);
  return { id, name, owner_sub: ownerSub, mem_org: "org_" + id, gcs_prefix: id + "/", dev_env_ref: null, dev_env_id: null, created_at: new Date().toISOString() };
};
const devEnvShape = ({ name, ownerSub, subdomain, accountId }) => {
  const id = "env_" + slug(name || subdomain) + "_" + randomUUID().slice(0, 4);
  return { id, name: name || subdomain, owner_sub: ownerSub, subdomain, account_id: accountId || null, secret_ref: `devenv/${id}/kissflow`, created_at: new Date().toISOString() };
};

// stable content id for memory rows (dedup: same org+text → same id → upsert is a no-op)
const memId = (org, text) => {
  const h = createHash("md5").update(`${org}|${text}`).digest("hex");
  return Number(BigInt("0x" + h.slice(0, 12))); // 48 bits — safe in bigint AND JS number
};
const cosine = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }; // vectors are L2-normalized

const reqShape = (redirectUri, ttlSec = 900) => ({
  code: randomUUID(), status: "pending", redirect_uri: redirectUri || null,
  project_id: null, sub: null, role: null,
  created_at: new Date().toISOString(), expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
});

function memoryDb() {
  const users = new Map(), projects = new Map(), members = [], versions = new Map(), consumed = new Set(), connectReqs = new Map(), devEnvs = new Map(), kfMem = [];
  return {
    kind: "memory",
    async migrate() {},
    async upsertUser({ sub, email, name }) { let u = [...users.values()].find((x) => x.email === email); if (!u) { u = { sub: sub || "u_" + randomUUID().slice(0, 8), email, name }; users.set(u.sub, u); } return u; },
    async getUser(sub) { return users.get(sub) || null; },
    async getUserByEmail(email) { return [...users.values()].find((x) => x.email === email) || null; },
    async createProject(name, ownerSub) { const p = projShape(name, ownerSub); projects.set(p.id, p); members.push({ project_id: p.id, sub: ownerSub, role: "owner" }); versions.set(p.id, []); return p; },
    async getProject(id) { return projects.get(id) || null; },
    async addMember(projectId, sub, role) { if (!members.find((m) => m.project_id === projectId && m.sub === sub)) members.push({ project_id: projectId, sub, role }); },
    async getMember(projectId, sub) { return members.find((m) => m.project_id === projectId && m.sub === sub) || null; },
    async listMembers(projectId) { return members.filter((m) => m.project_id === projectId).map((m) => ({ ...m, email: users.get(m.sub)?.email })); },
    async listProjectsForUser(sub) { return members.filter((m) => m.sub === sub).map((m) => ({ ...projects.get(m.project_id), role: m.role })).filter((p) => p.id); },
    async setDevEnvRef(projectId, ref) { const p = projects.get(projectId); if (p) p.dev_env_ref = ref; },
    async createDevEnv(spec) { const e = devEnvShape(spec); devEnvs.set(e.id, e); return e; },
    async getDevEnv(id) { return devEnvs.get(id) || null; },
    async listDevEnvsForUser(sub) { return [...devEnvs.values()].filter((e) => e.owner_sub === sub); },
    async setProjectDevEnv(projectId, devEnvId) { const p = projects.get(projectId); if (p) p.dev_env_id = devEnvId; },
    async markConnected(projectId, by) { const p = projects.get(projectId); if (p) { p.last_connect_at = new Date().toISOString(); p.last_connect_by = by || null; } },
    // ── memory pool (hive) ──────────────────────────────────────────────────
    async memUpsert(row) {
      const id = memId(row.org, row.text);
      if (kfMem.find((m) => m.id === id)) return { id, inserted: false };
      kfMem.push({ id, created_at: new Date().toISOString(), quarantined: false, ...row });
      return { id, inserted: true, quarantined: !!row.quarantined };
    },
    async memSearch(orgs, vector, { scope, app, agent, top_k = 12 } = {}) {
      return kfMem
        .filter((m) => !m.quarantined && orgs.includes(m.org) && (!scope || m.scope === scope) && (!app || m.app === app) && (!agent || m.agent === agent))
        .map((m) => ({ ...m, score: cosine(vector, m.embedding || []) }))
        .sort((a, b) => b.score - a.score).slice(0, top_k);
    },
    async memList(orgs) { return kfMem.filter((m) => orgs.includes(m.org)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))); },
    async addVersion(projectId, v) { const list = versions.get(projectId) || []; const rec = { seq: list.length + 1, ...v, created_at: new Date().toISOString() }; list.push(rec); versions.set(projectId, list); return rec; },
    async listVersions(projectId) { return versions.get(projectId) || []; },
    async consumeToken(jti) { if (consumed.has(jti)) return false; consumed.add(jti); return true; },
    async createConnectReq(redirectUri) { const r = reqShape(redirectUri); connectReqs.set(r.code, r); return r; },
    async getConnectReq(code) { return connectReqs.get(code) || null; },
    async approveConnectReq(code, { projectId, sub, role }) { const r = connectReqs.get(code); if (r) Object.assign(r, { status: "approved", project_id: projectId, sub, role }); return r || null; },
    async deleteConnectReq(code) { connectReqs.delete(code); },
    async deleteProject({ id, name }) {
      let n = 0;
      for (const [k, p] of [...projects]) if ((id && p.id === id) || (name && p.name === name)) { projects.delete(k); versions.delete(k); for (let i = members.length - 1; i >= 0; i--) if (members[i].project_id === k) members.splice(i, 1); n++; }
      return n;
    },
  };
}

function pgDb(url) {
  let pool = null;
  const q = async (sql, params) => { if (!pool) { const { default: pg } = await import("pg"); pool = new pg.Pool({ connectionString: url }); } return pool.query(sql, params); };
  const one = (r) => r.rows[0] || null;
  return {
    kind: "pg",
    async migrate() {
      const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "schema.sql"), "utf8");
      await q(schema);
      await q(`CREATE TABLE IF NOT EXISTS consumed_tokens (jti text PRIMARY KEY, at timestamptz DEFAULT now())`);
    },
    async upsertUser({ sub, email, name }) {
      const s = sub || "u_" + randomUUID().slice(0, 8);
      return one(await q(`INSERT INTO users (sub,email,name) VALUES ($1,$2,$3)
        ON CONFLICT (email) DO UPDATE SET name=COALESCE(EXCLUDED.name, users.name) RETURNING *`, [s, email, name || null]));
    },
    async getUser(sub) { return one(await q(`SELECT * FROM users WHERE sub=$1`, [sub])); },
    async getUserByEmail(email) { return one(await q(`SELECT * FROM users WHERE email=$1`, [email])); },
    async createProject(name, ownerSub) {
      const p = projShape(name, ownerSub);
      await q(`INSERT INTO projects (id,name,owner_sub,mem_org,gcs_prefix,dev_env_ref) VALUES ($1,$2,$3,$4,$5,$6)`, [p.id, p.name, p.owner_sub, p.mem_org, p.gcs_prefix, p.dev_env_ref]);
      await q(`INSERT INTO memberships (project_id,sub,role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`, [p.id, ownerSub]);
      return p;
    },
    async getProject(id) { return one(await q(`SELECT * FROM projects WHERE id=$1`, [id])); },
    async addMember(projectId, sub, role) { await q(`INSERT INTO memberships (project_id,sub,role) VALUES ($1,$2,$3) ON CONFLICT (project_id,sub) DO UPDATE SET role=EXCLUDED.role`, [projectId, sub, role]); },
    async getMember(projectId, sub) { return one(await q(`SELECT * FROM memberships WHERE project_id=$1 AND sub=$2`, [projectId, sub])); },
    async listMembers(projectId) { return (await q(`SELECT m.*, u.email FROM memberships m JOIN users u ON u.sub=m.sub WHERE m.project_id=$1`, [projectId])).rows; },
    async listProjectsForUser(sub) { return (await q(`SELECT p.*, m.role FROM projects p JOIN memberships m ON m.project_id=p.id WHERE m.sub=$1 ORDER BY p.created_at DESC`, [sub])).rows; },
    async setDevEnvRef(projectId, ref) { await q(`UPDATE projects SET dev_env_ref=$2 WHERE id=$1`, [projectId, ref]); },
    async createDevEnv(spec) {
      const e = devEnvShape(spec);
      await q(`INSERT INTO dev_envs (id,name,owner_sub,subdomain,account_id,secret_ref) VALUES ($1,$2,$3,$4,$5,$6)`, [e.id, e.name, e.owner_sub, e.subdomain, e.account_id, e.secret_ref]);
      return e;
    },
    async getDevEnv(id) { return one(await q(`SELECT * FROM dev_envs WHERE id=$1`, [id])); },
    async listDevEnvsForUser(sub) { return (await q(`SELECT * FROM dev_envs WHERE owner_sub=$1 ORDER BY created_at`, [sub])).rows; },
    async setProjectDevEnv(projectId, devEnvId) { await q(`UPDATE projects SET dev_env_id=$2 WHERE id=$1`, [projectId, devEnvId]); },
    async markConnected(projectId, by) { await q(`UPDATE projects SET last_connect_at=now(), last_connect_by=$2 WHERE id=$1`, [projectId, by || null]); },
    // ── memory pool (hive) — pgvector ───────────────────────────────────────
    async memUpsert(row) {
      const id = memId(row.org, row.text);
      const r = await q(`INSERT INTO kf_memory (id,org,scope,tier,kind,agent,app,impossible,text,embedding,quarantined)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11) ON CONFLICT (id) DO NOTHING`,
        [id, row.org, row.scope || "global", row.tier || "observed-once", row.kind || "interpretation",
         row.agent || null, row.app || null, !!row.impossible, row.text, JSON.stringify(row.embedding), !!row.quarantined]);
      return { id, inserted: r.rowCount > 0, quarantined: !!row.quarantined };
    },
    async memSearch(orgs, vector, { scope, app, agent, top_k = 12 } = {}) {
      const cond = [`org = ANY($2)`, `NOT quarantined`]; const params = [JSON.stringify(vector), orgs]; let n = 3;
      if (scope) { cond.push(`scope=$${n++}`); params.push(scope); }
      if (app) { cond.push(`app=$${n++}`); params.push(app); }
      if (agent) { cond.push(`agent=$${n++}`); params.push(agent); }
      params.push(top_k);
      return (await q(`SELECT id,org,scope,tier,kind,agent,app,impossible,text,created_at,
        1 - (embedding <=> $1::vector) AS score FROM kf_memory WHERE ${cond.join(" AND ")}
        ORDER BY embedding <=> $1::vector LIMIT $${n}`, params)).rows;
    },
    async memList(orgs) {
      return (await q(`SELECT id,org,scope,tier,kind,agent,app,impossible,text,created_at,quarantined
        FROM kf_memory WHERE org = ANY($1) ORDER BY created_at`, [orgs])).rows;
    },
    async addVersion(projectId, v) {
      return one(await q(`INSERT INTO versions (project_id,seq,label,author,artifacts)
        VALUES ($1,(SELECT COALESCE(MAX(seq),0)+1 FROM versions WHERE project_id=$1),$2,$3,$4) RETURNING *`,
        [projectId, v.label, v.author, JSON.stringify(v.artifacts || {})]));
    },
    async listVersions(projectId) { return (await q(`SELECT * FROM versions WHERE project_id=$1 ORDER BY seq`, [projectId])).rows; },
    async consumeToken(jti) { try { await q(`INSERT INTO consumed_tokens (jti) VALUES ($1)`, [jti]); return true; } catch { return false; } },
    async createConnectReq(redirectUri) {
      const r = reqShape(redirectUri);
      await q(`INSERT INTO connect_requests (code,status,redirect_uri,expires_at) VALUES ($1,$2,$3,$4)`, [r.code, r.status, r.redirect_uri, r.expires_at]);
      return r;
    },
    async getConnectReq(code) { return one(await q(`SELECT * FROM connect_requests WHERE code=$1`, [code])); },
    async approveConnectReq(code, { projectId, sub, role }) {
      return one(await q(`UPDATE connect_requests SET status='approved', project_id=$2, sub=$3, role=$4 WHERE code=$1 RETURNING *`, [code, projectId, sub, role]));
    },
    async deleteConnectReq(code) { await q(`DELETE FROM connect_requests WHERE code=$1`, [code]); },
    async deleteProject({ id, name }) {
      const r = await q(`DELETE FROM projects WHERE ($1::text IS NOT NULL AND id=$1) OR ($2::text IS NOT NULL AND name=$2)`, [id || null, name || null]);
      return r.rowCount; // memberships + versions cascade (ON DELETE CASCADE)
    },
  };
}

export function makeDb(cfg) { return cfg.db.backend === "pg" ? pgDb(cfg.db.url) : memoryDb(); }
