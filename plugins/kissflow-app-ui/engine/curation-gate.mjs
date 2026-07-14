// curation-gate.mjs — the TRUST layer in front of the shared (Mem0) memory.
//
// A memory layer (Mem0/Zep) gives you storage + retrieval + dedup. It does NOT decide whether a
// learning is TRUE ENOUGH to share with every team. That's this gate. Every write to the common pool
// passes through here first, so one wrong/private fact can't mislead everyone. Verdicts:
//   accept — promote to the shared pool now
//   queue  — hold in the confirm-queue until it earns promotion (reproduced / owner-confirmed)
//   local  — keep in the user's LOCAL memory only; never share (app-specific, private)
//   reject — malformed / empty
//
// Learning shape: { text, scope, tier, kind, claimsImpossible?, agent?, app?, org? }
//   scope ∈ global | reference | agent | app        (from the [scope] tag)
//   tier  ∈ observed-once | reproduced | golden-verified | owner-confirmed
//   kind  ∈ observation | interpretation             (raw fact vs. inferred claim)

export const TIER_RANK = { "observed-once": 1, reproduced: 2, "golden-verified": 3, "owner-confirmed": 4 };
const IMPOSSIBLE_RE = /\b(can't|cannot|impossible|never works|not possible|unsupported|won't work|no way to)\b/i;
export const detectImpossible = (text) => IMPOSSIBLE_RE.test(String(text || ""));

// normalize → dedup key (Mem0 dedups semantically; this is a cheap exact-ish guard + telemetry)
export function dedupKey(text) {
  return String(text || "").toLowerCase().replace(/\[[^\]]*\]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function curate(learning) {
  const L = learning || {};
  const text = String(L.text || "").trim();
  if (!text || text.length < 8) return v("reject", "empty or too short");

  const scope = (L.scope || "global").toLowerCase();
  const tier = (L.tier || "observed-once").toLowerCase();
  const kind = (L.kind || "interpretation").toLowerCase();
  const rank = TIER_RANK[tier] || 1;
  const key = dedupKey(text);
  const claimsImpossible = L.claimsImpossible ?? IMPOSSIBLE_RE.test(text);

  // 1. app-specific facts are PRIVATE — never enter the shared pool (federation rule).
  if (scope === "app") return v("local", "app-scoped — kept local, withheld from the shared pool", key);

  // 2. impossibility claims are the highest-risk (they STOP the whole team doing something) —
  //    quarantine until an owner confirms. (This is the class that caused the false-belief epidemic.)
  if (claimsImpossible && rank < TIER_RANK["owner-confirmed"])
    return v("queue", "impossibility claim — quarantined until owner-confirmed", key);

  // 3. interpretations (inferred, not observed) must be reproduced before they're shared.
  if (kind === "interpretation" && rank < TIER_RANK["golden-verified"])
    return v("queue", "interpretation below golden-verified — needs reproduction", key);

  // 4. a single raw observation isn't shareable yet — one run can be a fluke.
  if (rank <= TIER_RANK["observed-once"])
    return v("queue", "observed once — needs a second, independent reproduction", key);

  // 5. reproduced+ observations, or anything golden-verified / owner-confirmed, on a shareable scope.
  if ((scope === "global" || scope === "reference" || scope === "agent") && rank >= TIER_RANK.reproduced)
    return v("accept", `promoted (${scope}, ${tier})`, key);

  return v("queue", "did not meet the promotion bar", key);
}

function v(verdict, reason, key = null) { return { verdict, reason, ...(key ? { dedupKey: key } : {}) }; }
