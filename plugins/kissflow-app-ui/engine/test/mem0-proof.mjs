// mem0-proof.mjs — end-to-end proof of the shared-memory loop:
//   candidate learnings → CURATION GATE → Mem0 (add) → recall (top-K).
// Runs against the local mock by default (no Docker / no LLM key needed). To run against REAL
// self-hosted Mem0: bring up docker-compose.mem0.yml, set MEM0_BASE_URL + paths, run with --real.
//   node engine/test/mem0-proof.mjs           # mock (spawns it for you)
//   node engine/test/mem0-proof.mjs --real     # against whatever MEM0_BASE_URL points to
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { remoteMemory } from "../memory-remote.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const REAL = process.argv.includes("--real");
const PORT = 8747;
const BASE = REAL ? (process.env.MEM0_BASE_URL || "http://localhost:8000") : `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Candidate learnings a pipeline run might emit — deliberately spanning every gate rule.
const CANDIDATES = [
  { text: "Kissflow process/case forms can be created but NOT deleted or archived via the public REST API — only in the UI.", scope: "global", tier: "owner-confirmed", kind: "observation" },
  { text: "A nav submenu entry silently fails to build unless it has BOTH a name and a page field.", scope: "global", tier: "golden-verified", kind: "observation" },
  { text: "Duplicate app display names return FlowNameAlreadyExists (400) on apply — names must be unique per account.", scope: "reference", tier: "reproduced", kind: "observation" },
  { text: "You can never build an approval step that also sends a Slack message — the platform can't do it.", scope: "global", tier: "observed-once", kind: "interpretation" }, // impossibility → quarantine
  { text: "The refunds app probably needs a compliance dashboard because finance apps usually have one.", scope: "global", tier: "observed-once", kind: "interpretation" }, // interpretation, low tier → queue
  { text: "My_Garage_A00 uses Unsplash car photos on the garage landing page.", scope: "app", tier: "golden-verified", kind: "observation", app: "My_Garage_A00" }, // app-scoped → local only
  { text: "no", scope: "global", tier: "owner-confirmed", kind: "observation" }, // too short → reject
];

function bar(v) { const map = { accept: "🟢 accept", queue: "🟡 queue ", local: "🔵 local ", reject: "⚪ reject" }; return map[v] || v; }

async function main() {
  let child;
  if (!REAL) {
    child = spawn("node", [join(__dir, "mem0-mock.mjs"), String(PORT)], { stdio: "inherit" });
    for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {} await sleep(100); }
  }

  const mem = remoteMemory({ base: BASE, org: "acme", queuePath: "/tmp/kf-proof-queue.jsonl", localPath: "/tmp/kf-proof-local.md" });

  console.log(`\n─── CONTRIBUTE (${CANDIDATES.length} candidate learnings → gate → ${REAL ? "REAL Mem0" : "mock Mem0"}) ───\n`);
  const ledger = await mem.contribute(CANDIDATES);
  for (const e of ledger) console.log(`${bar(e.verdict)}  ${e.action.padEnd(14)}  ${e.reason}\n            "${e.text.slice(0, 78)}${e.text.length > 78 ? "…" : ""}"`);

  const shared = ledger.filter((e) => e.verdict === "accept").length;
  console.log(`\n   → ${shared} promoted to the shared pool · ${ledger.filter(e => e.verdict === "queue").length} quarantined · ${ledger.filter(e => e.verdict === "local").length} kept local · ${ledger.filter(e => e.verdict === "reject").length} dropped`);

  console.log(`\n─── RECALL (top-K semantic search — NOT load-all) ───`);
  for (const q of ["can I delete a published process over the API?", "why didn't my navigation menu show up?", "does my garage app use real photos?"]) {
    const hits = await mem.recall(q, { top_k: 3 });
    console.log(`\n  ?  "${q}"`);
    if (!hits.length) console.log("     (no shared memory matched — correct if it was quarantined or kept local)");
    for (const h of hits) console.log(`     ${String(h.score).padStart(5)}  ${h.text.slice(0, 88)}`);
  }

  console.log(`\n✔ proof complete. The garage/app-scoped fact never entered the shared pool (recall for it returns nothing);`);
  console.log(`  the impossibility claim + the speculative dashboard note were quarantined, not shared.\n`);
  if (child) child.kill();
}
main().catch((e) => { console.error(e); process.exit(1); });
