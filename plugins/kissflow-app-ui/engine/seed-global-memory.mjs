// seed-global-memory.mjs — push the canonical MEMORY.md entries into the control plane's shared
// pool as org "global", so every connecting session syncs the NEWEST canon (not just whatever the
// installed plugin shipped). Idempotent: the server dedups by content hash — re-running after new
// entries only inserts the new ones. Admin-token gated (publishing canon is the platform owner's act).
//
//   CONTROL_PLANE_URL=https://appbuilder.zingworks.com ADMIN_TOKEN=… \
//     node engine/seed-global-memory.mjs [path/to/MEMORY.md]
import { readFileSync } from "node:fs";
import { parseMemory } from "./memory.mjs";

const BASE = process.env.CONTROL_PLANE_URL, TOK = process.env.ADMIN_TOKEN;
if (!BASE || !TOK) { console.error("need CONTROL_PLANE_URL + ADMIN_TOKEN"); process.exit(1); }
const file = process.argv[2] || "MEMORY.md";

const { items } = parseMemory(readFileSync(file, "utf8"));
let inserted = 0, skipped = 0, held = 0;
for (const it of items) {
  if (it.raw !== undefined) continue;
  const scopeTag = String(it.scope || "global");
  if (scopeTag.startsWith("app:")) { held++; continue; }   // project knowledge never enters global canon
  const text = it.lines.join(" ").replace(/\s+/g, " ").trim();
  const tier = (text.match(/\[tier:([a-z-]+)\]/i) || [])[1] || "owner-confirmed"; // canon default: reviewed by the owner
  const body = {
    org: "global",
    scope: scopeTag.startsWith("agent:") ? "agent" : "global",
    agent: scopeTag.startsWith("agent:") ? scopeTag.slice(6) : undefined,
    tier, kind: "interpretation",
    impossible: /\[impossibility\]/i.test(text),
    text,
  };
  const r = await fetch(BASE + "/memory/write", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOK}` }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error(`✗ ${r.status} ${j.error} — ${text.slice(0, 60)}…`); continue; }
  j.inserted ? inserted++ : skipped++;
}
console.log(`✔ global memory seeded from ${file}: ${inserted} inserted, ${skipped} already known, ${held} app-scoped withheld`);
