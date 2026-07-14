// memory-remote.mjs — the shared/central memory adapter the plugin calls instead of loading MEMORY.md
// wholesale when a common pool is configured (MEM0_BASE_URL or KF_MEM_STORE set).
//
//   recall(query)      → memory-broker: HYBRID (payload filter + semantic) top-K, typed brief. Never load-all.
//   contribute(cands)  → each candidate passes the CURATION GATE; only 'accept' is embedded + upserted,
//                        'queue' → confirm-queue, 'local' → local overlay, 'reject' → dropped.
//
// The store is a DUMB vector DB we drive (Qdrant / in-proc / pgvector) — extraction/dedup/typing live in
// the gate + broker, which we own and version, not in the store. (Mem0 remains swappable via mem0-client.)
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { curate, detectImpossible } from "./curation-gate.mjs";
import { makeStore, uid } from "./vector-store.mjs";
import { memoryBroker } from "./memory-broker.mjs";
import { embed } from "./embed.mjs";

export function remoteMemory(opts = {}) {
  const org = opts.org || process.env.KF_MEM_ORG || "shared";
  const store = opts.store || makeStore();
  const broker = memoryBroker({ store, org });
  const queuePath = opts.queuePath || "runs/confirm-queue.jsonl";
  const localPath = opts.localPath || "MEMORY-LOCAL.md";
  const append = (path, line) => { const prev = existsSync(path) ? readFileSync(path, "utf8") : ""; writeFileSync(path, prev + line + "\n"); };

  return {
    // TOP-K hybrid retrieval as {text,score,meta} — memory.mjs recall() formats these for context.
    async recall(query, { agent = "", top_k = 12, filters = {} } = {}) {
      const hits = await broker.retrieve(query, { top_k, agent, filters });
      return hits.map((h) => ({ text: h.payload.text, score: h.score, meta: h.payload }));
    },
    // the richer read: a typed, risk-first brief (gotchas/impossibilities first).
    brief: (query, o) => broker.brief(query, o),

    // gate → route. Returns a per-candidate ledger so the caller can show what happened.
    async contribute(candidates = []) {
      const ledger = [];
      const toEmbed = [];
      for (const c of candidates) {
        const g = curate(c);
        if (g.verdict === "accept") toEmbed.push({ c, g });
        else if (g.verdict === "queue") { append(queuePath, JSON.stringify({ ...c, reason: g.reason })); ledger.push({ ...g, action: "→confirm-queue", text: c.text }); }
        else if (g.verdict === "local") { append(localPath, `- ${c.text}  <!-- ${c.scope} · kept local -->`); ledger.push({ ...g, action: "→local only", text: c.text }); }
        else ledger.push({ ...g, action: "dropped", text: c.text });
      }
      if (toEmbed.length) {
        await store.ensure();
        const vecs = await embed(toEmbed.map((e) => e.c.text));
        await store.upsert(toEmbed.map((e, i) => ({
          id: uid(org + "|" + e.g.dedupKey),           // stable id → re-contribute updates, not duplicates
          vector: vecs[i],
          payload: { text: e.c.text, org, scope: e.c.scope, tier: e.c.tier, kind: e.c.kind, agent: e.c.agent || "", app: e.c.app || "", impossible: detectImpossible(e.c.text) },
        })));
        for (const { c, g } of toEmbed) ledger.push({ ...g, action: "embedded→shared", text: c.text });
      }
      return ledger;
    },
  };
}
