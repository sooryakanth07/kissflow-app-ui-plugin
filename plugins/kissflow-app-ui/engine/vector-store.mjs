// vector-store.mjs — the DUMB, fast, filterable store the gate writes into. We own extraction, so the
// store just holds {vector, payload} and does cosine + payload-filter search. Two backends, one contract:
//   KF_MEM_STORE=qdrant  → real Qdrant over REST (docker-compose.qdrant.yml)
//   KF_MEM_STORE=memory  → in-process (default; runs the proof with no Docker)
// pgvector is a drop-in third backend (same upsert/search contract, SQL underneath) — not needed for the proof.
import { createHash } from "node:crypto";
import { EMBED_DIM } from "./embed.mjs";

const uid = (s) => parseInt(createHash("md5").update(String(s)).digest("hex").slice(0, 12), 16); // stable numeric id

// filter shape (Qdrant-native): { must: [{ key, match:{value} }] }. matchPayload applies it in-process.
function matchPayload(payload, filter) {
  if (!filter || !filter.must) return true;
  return filter.must.every((c) => payload?.[c.key] === c.match?.value);
}
function cosine(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; } // vectors are pre-normalized

function memoryStore() {
  const P = new Map(); // id → { id, vector, payload }
  return {
    kind: "memory",
    async ensure() {},
    async upsert(points) { for (const p of points) P.set(p.id ?? uid(p.payload.text), { id: p.id ?? uid(p.payload.text), vector: p.vector, payload: p.payload }); },
    async search({ vector, filter, top_k = 12 }) {
      return [...P.values()].filter((p) => matchPayload(p.payload, filter))
        .map((p) => ({ id: p.id, score: +cosine(vector, p.vector).toFixed(4), payload: p.payload }))
        .filter((r) => r.score > 0.001).sort((a, b) => b.score - a.score).slice(0, top_k);
    },
    async count() { return P.size; },
    async health() { return { status: "ok", backend: "memory", points: P.size }; },
  };
}

function qdrantStore() {
  const base = (process.env.QDRANT_URL || "http://localhost:6333").replace(/\/$/, "");
  const coll = process.env.QDRANT_COLLECTION || "kf_memory";
  const key = process.env.QDRANT_API_KEY;
  const H = { "Content-Type": "application/json", ...(key ? { "api-key": key } : {}) };
  const call = async (m, p, b) => {
    const r = await fetch(base + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`qdrant ${m} ${p} → ${r.status} ${JSON.stringify(j).slice(0, 160)}`);
    return j;
  };
  return {
    kind: "qdrant",
    async ensure() {
      const ex = await call("GET", `/collections/${coll}`).then(() => true).catch(() => false);
      if (!ex) await call("PUT", `/collections/${coll}`, { vectors: { size: EMBED_DIM, distance: "Cosine" } });
    },
    async upsert(points) {
      await call("PUT", `/collections/${coll}/points`, { points: points.map((p) => ({ id: p.id ?? uid(p.payload.text), vector: p.vector, payload: p.payload })) });
    },
    async search({ vector, filter, top_k = 12 }) {
      const j = await call("POST", `/collections/${coll}/points/search`, { vector, limit: top_k, filter, with_payload: true });
      return (j.result || []).map((r) => ({ id: r.id, score: +r.score.toFixed(4), payload: r.payload }));
    },
    async count() { const j = await call("POST", `/collections/${coll}/points/count`, {}); return j.result?.count ?? 0; },
    async health() { return call("GET", "/healthz").then(() => ({ status: "ok", backend: "qdrant" })).catch(() => ({ status: "down", backend: "qdrant" })); },
  };
}

// pgvector backend — SAME contract, backed by Postgres + the `vector` extension. Unifies the shared
// memory with the control-plane's own Postgres (one Cloud SQL instance). Needs `pg` (npm i pg) and a
// connection string in PG_URL / DATABASE_URL; imported lazily so the offline proof stays dep-free.
function pgvectorStore() {
  const conn = process.env.PG_URL || process.env.DATABASE_URL;
  const table = process.env.PG_MEM_TABLE || "kf_memory";
  let pool = null;
  const q = async (sql, params) => { if (!pool) { const { default: pg } = await import("pg"); pool = new pg.Pool({ connectionString: conn }); } return pool.query(sql, params); };
  const vec = (a) => `[${a.join(",")}]`;
  const where = (org, filter) => {
    const cond = ["org = $2"], params = [null, org]; // $1 reserved for the query vector
    for (const c of (filter?.must || [])) if (c.key !== "org") { params.push(c.match.value); cond.push(`${c.key} = $${params.length}`); }
    return { clause: cond.join(" AND "), params };
  };
  return {
    kind: "pgvector",
    async ensure() {
      await q("CREATE EXTENSION IF NOT EXISTS vector");
      await q(`CREATE TABLE IF NOT EXISTS ${table} (id bigint PRIMARY KEY, org text, scope text, tier text, kind text, agent text, app text, impossible boolean, text text, embedding vector(${EMBED_DIM}))`);
      await q(`CREATE INDEX IF NOT EXISTS ${table}_emb ON ${table} USING ivfflat (embedding vector_cosine_ops)`).catch(() => {});
    },
    async upsert(points) {
      for (const p of points) {
        const pl = p.payload, id = p.id ?? uid(pl.text);
        await q(`INSERT INTO ${table} (id,org,scope,tier,kind,agent,app,impossible,text,embedding) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector)
                 ON CONFLICT (id) DO UPDATE SET text=EXCLUDED.text, tier=EXCLUDED.tier, embedding=EXCLUDED.embedding`,
          [id, pl.org, pl.scope, pl.tier, pl.kind, pl.agent || "", pl.app || "", !!pl.impossible, pl.text, vec(p.vector)]);
      }
    },
    async search({ vector, filter, top_k = 12 }) {
      const org = (filter?.must || []).find((c) => c.key === "org")?.match.value || "shared";
      const { clause, params } = where(org, filter);
      params[0] = vec(vector);
      const r = await q(`SELECT id, org, scope, tier, kind, agent, app, impossible, text, 1 - (embedding <=> $1::vector) AS score
                         FROM ${table} WHERE ${clause} ORDER BY embedding <=> $1::vector LIMIT ${Math.max(1, top_k | 0)}`, params);
      return r.rows.map((row) => ({ id: Number(row.id), score: +(+row.score).toFixed(4), payload: row }));
    },
    async count() { const r = await q(`SELECT count(*)::int AS n FROM ${table}`); return r.rows[0].n; },
    async health() { return q("SELECT 1").then(() => ({ status: "ok", backend: "pgvector" })).catch((e) => ({ status: "down", backend: "pgvector", error: e.message })); },
  };
}

export function makeStore() {
  const kind = (process.env.KF_MEM_STORE || "memory").toLowerCase();
  if (kind === "qdrant") return qdrantStore();
  if (kind === "pgvector" || kind === "postgres") return pgvectorStore();
  return memoryStore();
}
export { uid };
