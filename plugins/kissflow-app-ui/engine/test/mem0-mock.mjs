// mem0-mock.mjs — a tiny stand-in for a Mem0 server so the proof runs with NO Docker / NO LLM key.
// Implements the same REST contract mem0-client.mjs calls (add/search/health). Relevance is a cheap
// keyword-overlap score (real Mem0 uses embeddings) — enough to demonstrate top-K scoped retrieval.
//   node engine/test/mem0-mock.mjs [port]      (default 8000)
import { createServer } from "node:http";
const PORT = +(process.argv[2] || 8000);
const MEM = []; // { id, text, org, agent, app, metadata }
let seq = 0;
const toks = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));
const score = (q, t) => { const a = toks(q), b = toks(t); let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size || 1); };

const body = (req) => new Promise((res) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { res(JSON.parse(d || "{}")); } catch { res({}); } }); });
const send = (r, code, obj) => { r.writeHead(code, { "Content-Type": "application/json" }); r.end(JSON.stringify(obj)); };

createServer(async (req, res) => {
  if (req.url === "/health") return send(res, 200, { status: "ok", memories: MEM.length });
  const b = await body(req);
  if (req.method === "POST" && req.url.startsWith("/memories")) {
    const text = b.text || (b.messages || []).map((m) => m.content).join(" ");
    // trivial "dedup": same org + same normalized text → update, else insert
    const norm = String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const ex = MEM.find((m) => m.org === (b.user_id || "shared") && m._norm === norm);
    if (ex) { ex.text = text; return send(res, 200, { id: ex.id, event: "UPDATE" }); }
    const m = { id: "m" + ++seq, text, _norm: norm, org: b.user_id || "shared", agent: b.agent_id || "", app: (b.metadata || {}).app || "", metadata: b.metadata || {} };
    MEM.push(m); return send(res, 200, { id: m.id, event: "ADD" });
  }
  if (req.method === "POST" && req.url.startsWith("/search")) {
    const org = b.user_id || "shared", agent = b.agent_id || "", k = b.top_k || 20;
    const cand = MEM.filter((m) => m.org === org && (!agent || !m.agent || m.agent === agent));
    const results = cand.map((m) => ({ id: m.id, memory: m.text, score: +score(b.query, m.text).toFixed(3), metadata: m.metadata }))
      .filter((r) => r.score > 0).sort((a, z) => z.score - a.score).slice(0, k);
    return send(res, 200, { results });
  }
  send(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`mem0-mock listening on http://localhost:${PORT} (${MEM.length} memories)`));
