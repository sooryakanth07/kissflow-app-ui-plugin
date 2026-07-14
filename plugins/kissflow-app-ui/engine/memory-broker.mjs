// memory-broker.mjs — the READ intelligence. Instead of a raw top-K grep, the broker does HYBRID
// retrieval (payload filter + semantic) and returns a TYPED BRIEF: gotchas/impossibilities first, then
// references, grouped and deduped — what actually matters for THIS task. The calling agent reads the
// brief, not the whole pool. (The synthesis here is deterministic + cheap; set an LLM seam later if
// you want prose. The value is the retrieval + typing, which is the agentic part.)
import { makeStore } from "./vector-store.mjs";
import { embed, embedMode } from "./embed.mjs";

const RANK = { "owner-confirmed": 4, "golden-verified": 3, reproduced: 2, "observed-once": 1 };

export function memoryBroker(opts = {}) {
  const store = opts.store || makeStore();
  const org = opts.org || process.env.KF_MEM_ORG || "shared";

  // hybrid retrieval. `filters` narrows by payload (scope/kind/app…) BEFORE semantic ranking.
  async function retrieve(task, { top_k = 12, filters = {}, agent } = {}) {
    await store.ensure();
    const [qv] = await embed(task || "");
    const must = [{ key: "org", match: { value: org } }];
    for (const [k, val] of Object.entries(filters)) if (val != null) must.push({ key: k, match: { value: val } });
    if (agent) must.push({ key: "agent", match: { value: agent } });
    return store.search({ vector: qv, filter: { must }, top_k });
  }

  // brief(task) → { hits, brief } — a compact, typed digest ordered by risk then relevance.
  async function brief(task, { top_k = 12, filters = {}, agent } = {}) {
    const hits = await retrieve(task, { top_k, filters, agent });
    if (!hits.length) return { hits, brief: "" };
    const seen = new Set();
    const rows = hits.filter((h) => { const k = (h.payload.text || "").toLowerCase().slice(0, 60); return seen.has(k) ? false : seen.add(k); })
      .map((h) => ({ text: h.payload.text, scope: h.payload.scope, tier: h.payload.tier, kind: h.payload.kind, imp: !!h.payload.impossible, score: h.score }));
    // risk-first ordering: impossibility flags, then by tier, then relevance.
    rows.sort((a, b) => (b.imp - a.imp) || ((RANK[b.tier] || 0) - (RANK[a.tier] || 0)) || (b.score - a.score));
    const line = (r) => `- ${r.imp ? "⛔ " : ""}${r.text}  _(${r.scope}·${r.tier}, ${r.score})_`;
    const gotchas = rows.filter((r) => r.imp || r.kind === "observation");
    const refs = rows.filter((r) => !r.imp && r.kind !== "observation");
    const parts = [`# Memory brief — ${rows.length} relevant (store: ${store.kind}, embed: ${embedMode()})`];
    if (gotchas.length) parts.push("\n## Watch out / verified\n" + gotchas.map(line).join("\n"));
    if (refs.length) parts.push("\n## Reference\n" + refs.map(line).join("\n"));
    return { hits, brief: parts.join("\n") + "\n" };
  }

  return { retrieve, brief, store };
}
