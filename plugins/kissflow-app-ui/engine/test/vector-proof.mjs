// vector-proof.mjs — the reforged loop: candidate learnings → CURATION GATE → embed → VECTOR STORE,
// then HYBRID recall + a typed BRIEF via the memory-broker. No Mem0 LLM, no Docker, no API key
// (in-proc store + local hashing embedder). Swap to real infra with:
//   KF_MEM_STORE=qdrant QDRANT_URL=… EMBED_URL=… EMBED_KEY=…  node engine/test/vector-proof.mjs
import { remoteMemory } from "../memory-remote.mjs";
import { memoryBroker } from "../memory-broker.mjs";
import { makeStore } from "../vector-store.mjs";

const CANDIDATES = [
  { text: "Kissflow process/case forms can be created but cannot be deleted or archived via the REST API — only in the UI.", scope: "global", tier: "owner-confirmed", kind: "observation" },
  { text: "A nav submenu entry silently fails to build unless it has BOTH a name and a page field.", scope: "global", tier: "golden-verified", kind: "observation" },
  { text: "Duplicate app display names return FlowNameAlreadyExists (400) on apply — names must be unique per account.", scope: "reference", tier: "reproduced", kind: "observation" },
  { text: "You can never build an approval step that also sends a Slack message — the platform can't do it.", scope: "global", tier: "observed-once", kind: "interpretation" },
  { text: "The refunds app probably needs a compliance dashboard because finance apps usually have one.", scope: "global", tier: "observed-once", kind: "interpretation" },
  { text: "My_Garage_A00 uses Unsplash car photos on the garage landing page.", scope: "app", tier: "golden-verified", kind: "observation", app: "My_Garage_A00" },
];

async function main() {
  const store = makeStore();                                   // shared instance so read sees writes (in-proc)
  const mem = remoteMemory({ org: "acme", store, queuePath: "/tmp/kf-vec-queue.jsonl", localPath: "/tmp/kf-vec-local.md" });

  console.log(`\n─── CONTRIBUTE (gate → embed → ${store.kind} store) ───\n`);
  const led = await mem.contribute(CANDIDATES);
  const icon = { accept: "🟢", queue: "🟡", local: "🔵", reject: "⚪" };
  for (const e of led) console.log(`${icon[e.verdict]} ${e.action.padEnd(16)} ${e.reason}\n     "${e.text.slice(0, 74)}${e.text.length > 74 ? "…" : ""}"`);
  console.log(`\n   pool now holds ${await store.count()} shared memories (app-scoped + quarantined excluded)`);

  const broker = memoryBroker({ org: "acme", store });
  console.log(`\n─── RECALL — hybrid retrieval + typed BRIEF ───`);
  const b1 = await broker.brief("I'm about to publish a process — anything to know before I build?", { top_k: 5 });
  console.log("\n" + b1.brief);

  console.log("─── FILTERED recall (payload filter, not just semantic): scope=reference only ───");
  const b2 = await broker.retrieve("app naming rules on apply", { top_k: 5, filters: { scope: "reference" } });
  for (const h of b2) console.log(`   ${h.score}  [${h.payload.scope}] ${h.payload.text.slice(0, 70)}`);

  console.log("\n─── SCOPE proof: the garage (app-scoped) fact must NOT be retrievable from the shared pool ───");
  const g = await broker.retrieve("does my garage app use real car photos", { top_k: 5 });
  console.log(g.some((h) => /garage/i.test(h.payload.text)) ? "   ✗ LEAK — garage fact found" : "   ✔ not in shared pool (kept local by the gate)");
  console.log("");
}
main().catch((e) => { console.error(e); process.exit(1); });
