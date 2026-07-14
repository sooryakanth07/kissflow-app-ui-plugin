// embed.mjs — the ONE embeddings call the design needs (we own extraction; the store is dumb).
// Default: a deterministic local hashing embedder — no API key, no deps, same text → same vector — so
// the proof runs offline. Swap to a real model by setting EMBED_URL (OpenAI-compatible /embeddings)
// + EMBED_KEY + EMBED_MODEL; nothing else in the stack changes.
import { createHash } from "node:crypto";

export const EMBED_DIM = +(process.env.EMBED_DIM || 256);

// hashing vectorizer: tokens → bucket indices → L2-normalized dense vector. Real vector math (cosine
// works), deterministic, dependency-free. Good enough to prove hybrid retrieval; not a semantic model.
function localEmbed(text) {
  const v = new Float32Array(EMBED_DIM);
  const toks = String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const t of toks) {
    if (t.length < 2) continue;
    const h = createHash("md5").update(t).digest();
    const idx = ((h[0] << 8) | h[1]) % EMBED_DIM;
    const sign = h[2] & 1 ? 1 : -1;
    v[idx] += sign; // signed hashing reduces collisions
  }
  let norm = 0; for (const x of v) norm += x * x; norm = Math.sqrt(norm) || 1;
  return Array.from(v, (x) => x / norm);
}

// real embeddings via any OpenAI-compatible endpoint (OpenAI, Ollama, vLLM, TEI…).
async function remoteEmbed(texts) {
  const r = await fetch(process.env.EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.EMBED_KEY ? { Authorization: `Bearer ${process.env.EMBED_KEY}` } : {}) },
    body: JSON.stringify({ model: process.env.EMBED_MODEL || "text-embedding-3-small", input: texts }),
  });
  if (!r.ok) throw new Error(`embed ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).data.map((d) => d.embedding);
}

// embed(texts) → array of vectors. Always batched.
export async function embed(texts) {
  const arr = Array.isArray(texts) ? texts : [texts];
  if (process.env.EMBED_URL) return remoteEmbed(arr);
  return arr.map(localEmbed);
}
export const embedMode = () => (process.env.EMBED_URL ? `remote(${process.env.EMBED_MODEL || "default"})` : `local-hash(${EMBED_DIM}d)`);
