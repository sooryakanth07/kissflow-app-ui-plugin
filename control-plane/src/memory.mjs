// memory.mjs — server side of the memory proxy. Sessions never hold DB creds; they call
// /memory/* with their project token and THIS code embeds + reads/writes the shared kf_memory
// pool (pgvector). The embedder is a byte-for-byte copy of engine/embed.mjs's local hashing
// vectorizer (KEEP IN SYNC — same tokens → same vector on both sides, dim must match the
// vector(256) column; a real model needs EMBED_DIM set before first load).
import { createHash } from "node:crypto";

export const EMBED_DIM = +(process.env.EMBED_DIM || 256);

export function embedText(text) {
  const v = new Float32Array(EMBED_DIM);
  const toks = String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const t of toks) {
    if (t.length < 2) continue;
    const h = createHash("md5").update(t).digest();
    const idx = ((h[0] << 8) | h[1]) % EMBED_DIM;
    const sign = h[2] & 1 ? 1 : -1;
    v[idx] += sign;
  }
  let norm = 0; for (const x of v) norm += x * x; norm = Math.sqrt(norm) || 1;
  return Array.from(v, (x) => x / norm);
}

// risk-first ordering for recall briefs: impossibilities/gotchas before references (mirrors the
// engine broker's RANK so a proxied brief reads the same as a direct-store one).
const RANK = { "owner-confirmed": 4, "golden-verified": 3, reproduced: 2, "observed-once": 1 };

// SELF-SUSPICION / IMPOSSIBILITY QUARANTINE (mirror of engine/curation-gate.mjs — KEEP IN SYNC).
// "X is impossible/unsupported" claims silently stop every team; they are the class that caused the
// false-belief epidemic (LESSONS §17). Below owner-confirmed they enter the pool QUARANTINED:
// stored, listed as pending in sync, but excluded from recall until the owner confirms.
const IMPOSSIBLE_RE = /\b(can't|cannot|impossible|never works|not possible|unsupported|won't work|no way to)\b/i;
export function curateWrite(row, byAdmin) {
  const impossible = row.impossible || IMPOSSIBLE_RE.test(row.text);
  const confirmed = (RANK[row.tier] || 1) >= RANK["owner-confirmed"];
  // only the platform owner (admin token) may assert owner-confirmed; sessions can't self-promote
  const quarantined = impossible && !(byAdmin && confirmed);
  return { ...row, impossible, quarantined, verdict: quarantined ? "quarantined" : "accept" };
}
export function orderHits(hits) {
  return [...hits].sort((a, b) =>
    (b.impossible === true) - (a.impossible === true) ||
    (RANK[b.tier] || 0) - (RANK[a.tier] || 0) ||
    (b.score || 0) - (a.score || 0));
}

// render a memory-sync payload as the markdown file sessions materialize (MEMORY-REMOTE.md)
export function renderSyncMd({ global = [], project = [] }, org) {
  const day = (d) => { try { return new Date(d).toISOString().slice(0, 10); } catch { return String(d).slice(0, 10); } };
  // canon rows seeded from MEMORY.md already carry "- YYYY-MM-DD [scope] …" — don't double-prefix them
  const line = (m) => /^-?\s*\d{4}-\d{2}-\d{2}\s+\[/.test(m.text)
    ? `- ${m.text.replace(/^-\s*/, "")}`
    : `- ${day(m.created_at)} [${m.scope}${m.app ? `:${m.app}` : ""}${m.agent ? ` agent:${m.agent}` : ""}]${m.impossible ? " [impossibility]" : ""} ${m.text} [tier:${m.tier}]`;
  const live = (rows) => rows.filter((m) => !m.quarantined);
  const pending = [...global, ...project].filter((m) => m.quarantined);
  return `# MEMORY-REMOTE — synced from the control plane (org ${org})
# Read-only: refreshed on every connect. Write via \`node engine/memory.mjs remember "<lesson>"\`.

## Global (canonical, newest server copy)
${live(global).map(line).join("\n") || "- (none yet)"}

## This project (org-scoped: app + agent + user learnings)
${live(project).map(line).join("\n") || "- (none yet)"}
${pending.length ? `\n## ⚠ PENDING CONFIRMATION — impossibility claims in quarantine (challengeable; do NOT design against these)\n${pending.map(line).join("\n")}\n` : ""}`;
}
