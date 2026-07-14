#!/usr/bin/env node
// memory.mjs — DECAY & hygiene for the shared agent memory (MEMORY.md).
//
// Policy: entries age out of the working log so agents stop paying attention tax on stale
// knowledge — but nothing is ever deleted: expired entries move to MEMORY-ARCHIVE.md with an
// annotation, so history stays auditable and an entry can be resurrected if it proves current.
//
// Decay windows by scope (days, measured from the entry's NEWEST date — the original date or any
// `(reaffirmed YYYY-MM-DD)` marker an agent appended after re-verifying the fact live):
//   [app:<id>]   90   — project knowledge; stale soon after the engagement goes quiet
//   [agent:<x>] 240   — role guidance; medium-lived, superseded by evolving agent definitions
//   [global]    365   — platform truths; long-lived but not eternal (platforms change)
//   promoted stubs (pointers into LESSONS/playbooks) share the 365-day window — their content
//   already lives in the curated layer, the stub only aids discovery.
//
// CLI:
//   node engine/memory.mjs stats    [MEMORY.md]
//   node engine/memory.mjs decay    [MEMORY.md] [--now YYYY-MM-DD] [--dry-run] [--archive FILE]
//   node engine/memory.mjs reaffirm "<substring>" [MEMORY.md] [--now YYYY-MM-DD]
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const DECAY_DAYS = { app: 90, agent: 240, global: 365, stub: 365 };

const DATE_RE = /^- (\d{4}-\d{2}-\d{2}) \[([^\]]+)\]/;
const REAFFIRM_RE = /reaffirmed (\d{4}-\d{2}-\d{2})/g;
const STUB_RE = /(?:→|->)\s*(?:promoted|see)?\s*(?:reference\/)?(?:LESSONS|[A-Z-]+\.md|playbook)/i;

// Parse MEMORY.md into { prologue: [lines before the first entry], items: [entry|raw] }.
// An entry = `- YYYY-MM-DD [scope] …` plus its indented/wrapped continuation lines.
export function parseMemory(text) {
  const lines = String(text).split(/\r?\n/);
  const prologue = [], items = [];
  let cur = null, seenEntry = false;
  const flush = () => { if (cur) { items.push(cur); cur = null; } };
  for (const line of lines) {
    const m = line.match(DATE_RE);
    if (m) {
      flush(); seenEntry = true;
      cur = { date: m[1], scope: m[2], lines: [line] };
    } else if (cur && (/^\s{2,}\S/.test(line) || (line.trim() !== "" && !line.startsWith("- ") && !line.startsWith("#")))) {
      cur.lines.push(line); // wrapped continuation
    } else if (!seenEntry) {
      prologue.push(line);
    } else {
      flush(); items.push({ raw: line });
    }
  }
  flush();
  return { prologue, items };
}

export function scopeKind(entry) {
  const text = entry.lines.join("\n");
  if (STUB_RE.test(text)) return "stub";
  if (entry.scope.startsWith("app:")) return "app";
  if (entry.scope.startsWith("agent:")) return "agent";
  return "global";
}

export function lastDate(entry) {
  let latest = entry.date;
  const text = entry.lines.join("\n");
  for (const m of text.matchAll(REAFFIRM_RE)) if (m[1] > latest) latest = m[1];
  return latest;
}

const daysBetween = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / 86400000);

// Apply decay: returns { out, archiveOut, kept, archived } — pure, testable.
export function applyDecay(text, nowStr, windows = DECAY_DAYS) {
  const { prologue, items } = parseMemory(text);
  const keep = [], archived = [];
  for (const it of items) {
    if (it.raw !== undefined) { keep.push(it); continue; }
    const kind = scopeKind(it);
    const age = daysBetween(lastDate(it), nowStr);
    if (age > (windows[kind] ?? windows.global)) archived.push({ ...it, kind, age });
    else keep.push(it);
  }
  const render = (arr) => arr.map((it) => (it.raw !== undefined ? it.raw : it.lines.join("\n"))).join("\n");
  const out = [...prologue, render(keep)].join("\n").replace(/\n{3,}/g, "\n\n");
  const archiveOut = archived.map((it) => `${it.lines.join("\n")}\n  ^ archived ${nowStr} (decay: ${it.kind} entry, ${it.age}d since last affirmation)`).join("\n");
  return { out, archiveOut, kept: keep.filter((i) => i.raw === undefined).length, archived };
}

// Append a reaffirmation marker to the first entry containing `needle` — resets its decay clock.
export function reaffirmEntry(text, needle, nowStr) {
  const { prologue, items } = parseMemory(text);
  let hit = null;
  for (const it of items) {
    if (it.raw !== undefined) continue;
    if (it.lines.join("\n").includes(needle)) { hit = it; break; }
  }
  if (!hit) return { out: text, hit: null };
  hit.lines[hit.lines.length - 1] = hit.lines[hit.lines.length - 1].replace(/\s*$/, "") + ` (reaffirmed ${nowStr})`;
  const render = (arr) => arr.map((it) => (it.raw !== undefined ? it.raw : it.lines.join("\n"))).join("\n");
  return { out: [...prologue, render(items)].join("\n"), hit };
}

// FEDERATION — many installs, one canonical memory.
// Canonical MEMORY.md ships with the plugin and is REPLACED on update; each instance appends its
// own learning to MEMORY-LOCAL.md (agents read both, write local only). `contribute` extracts the
// shareable slice of local memory — global/agent-scoped entries, never [app:*] project knowledge —
// as a provenance-stamped file the user submits to the plugin repo; the platform owner reviews it
// in the Memory Console (impossibility claims land in the confirmation queue, never self-promote).
export function extractContribution(localText, nowStr) {
  const { items } = parseMemory(localText);
  const share = [], held = [];
  for (const it of items) {
    if (it.raw !== undefined) continue;
    (scopeKind(it) === "app" ? held : share).push(it);
  }
  const body = share.map((e) => e.lines.join("\n")).join("\n");
  const header = `# Memory contribution — generated ${nowStr}\n# scope filter: global/agent/stub only (${held.length} app-scoped entries withheld as project-private)\n# review: platform owner merges into canonical MEMORY.md; [impossibility] claims go to CONFIRM-QUEUE.md as PENDING\n\n`;
  return { out: header + body + "\n", shared: share.length, withheld: held.length };
}

// read canonical + local overlay as one text (agents and tools see the union)
export function readMemoryUnion(file, fs = { readFileSync, existsSync }) {
  let text = fs.readFileSync(file, "utf8");
  const local = file.replace(/MEMORY\.md$/, "MEMORY-LOCAL.md");
  if (local !== file && fs.existsSync(local)) text += "\n" + fs.readFileSync(local, "utf8");
  return text;
}

// control-plane memory PROXY — the path for connected Cowork sessions (they hold a project token,
// never DB creds). recall → POST /memory/recall; remember → POST /memory/write. The SERVER embeds.
const proxyCfg = () => (process.env.CONTROL_PLANE_URL && process.env.KF_API_TOKEN
  ? { base: process.env.CONTROL_PLANE_URL, token: process.env.KF_API_TOKEN } : null);
async function proxyCall(path, body) {
  const { base, token } = proxyCfg();
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// remember(text) — the WRITE path: hive via the proxy when connected, else MEMORY-LOCAL.md.
export async function remember(text, { scope = "app", tier, kind, agent, app, impossible } = {}) {
  if (proxyCfg()) {
    try { return { via: "proxy", ...(await proxyCall("/memory/write", { text, scope, tier, kind, agent, app, impossible })) }; }
    catch (e) { console.error(`remember: proxy unavailable (${e.message}) — appending MEMORY-LOCAL.md`); }
  }
  const line = `- ${new Date().toISOString().slice(0, 10)} [${app ? `app:${app}` : scope}] ${text}\n`;
  writeFileSync("MEMORY-LOCAL.md", (existsSync("MEMORY-LOCAL.md") ? readFileSync("MEMORY-LOCAL.md", "utf8") : "") + line);
  return { via: "local-file" };
}

// recall(query) — the READ path the plugin pulls memory into context with. Order: (1) control-plane
// proxy when connected (freshest global + org pool), (2) direct shared pool when configured
// (KF_MEM_STORE=qdrant|memory, or MEM0_BASE_URL), (3) the local MEMORY.md union. Any remote failure
// degrades to the next tier, never blocks.
export async function recall(query, { file = "MEMORY.md", top_k = 12, org, agent = "" } = {}) {
  if (proxyCfg()) {
    try {
      const { hits } = await proxyCall("/memory/recall", { query, top_k, agent: agent || undefined });
      if (hits?.length) return hits.map((h) => `- [${h.scope}${h.app ? `:${h.app}` : ""}]${h.impossible ? " [impossibility]" : ""} ${h.text} [tier:${h.tier}]`).join("\n");
    } catch (e) { console.error(`recall: memory proxy unavailable (${e.message}) — trying direct store / file`); }
  }
  if (process.env.KF_MEM_STORE || process.env.MEM0_BASE_URL) {
    try {
      const { remoteMemory } = await import("./memory-remote.mjs");
      const { brief } = await remoteMemory({ org }).brief(query || "", { top_k, agent });
      if (brief) return brief;                    // typed, risk-first digest (broker)
      // pool empty/unseeded → fall through to the file union
    } catch (e) {
      console.error(`recall: shared pool unavailable (${e.message}) — falling back to ${file}`);
    }
  }
  return existsSync(file) ? readMemoryUnion(file) : "";
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const has = (name) => args.includes(name);
  const positional = args.slice(1).filter((a, i, arr) => !a.startsWith("--") && arr[i - 1] !== "--now" && arr[i - 1] !== "--archive");
  const now = flag("--now") || new Date().toISOString().slice(0, 10);

  if (cmd === "recall") {
    // node engine/memory.mjs recall "<task/query>" [--k 12] [--org acme] [--file MEMORY.md]
    const out = await recall(positional[0] || "", { file: flag("--file") || "MEMORY.md", top_k: +(flag("--k") || 12), org: flag("--org") || undefined });
    process.stdout.write(out);
  } else if (cmd === "remember") {
    // node engine/memory.mjs remember "<lesson>" [--scope app|global|agent|user] [--app <id>] [--agent <name>] [--tier <t>] [--impossible]
    const r = await remember(positional[0] || "", { scope: flag("--scope") || "app", app: flag("--app") || undefined,
      agent: flag("--agent") || undefined, tier: flag("--tier") || undefined, impossible: has("--impossible") });
    console.log(`remembered via ${r.via}${r.inserted === false ? " (already known — deduped)" : ""}`);
  } else if (cmd === "contribute") {
    const local = positional[0] || "MEMORY-LOCAL.md";
    const outFile = flag("--out") || "MEMORY-CONTRIBUTION.md";
    if (!existsSync(local)) { console.log(`no ${local} — nothing locally learned yet`); process.exit(0); }
    const { out, shared, withheld } = extractContribution(readFileSync(local, "utf8"), now);
    writeFileSync(outFile, out);
    console.log(`${outFile}: ${shared} shareable entr${shared === 1 ? "y" : "ies"} (${withheld} app-scoped withheld) — submit as a PR/issue to the plugin repo`);
  } else if (cmd === "stats") {
    const file = positional[0] || "MEMORY.md";
    const { items } = parseMemory(readMemoryUnion(file));
    const entries = items.filter((i) => i.raw === undefined);
    const byKind = {}, buckets = { "≤30d": 0, "31-90d": 0, "91-240d": 0, "241-365d": 0, ">365d": 0 };
    for (const e of entries) {
      const k = scopeKind(e); byKind[k] = (byKind[k] || 0) + 1;
      const age = daysBetween(lastDate(e), now);
      buckets[age <= 30 ? "≤30d" : age <= 90 ? "31-90d" : age <= 240 ? "91-240d" : age <= 365 ? "241-365d" : ">365d"]++;
    }
    console.log(`${file}: ${entries.length} entries`);
    console.log("by scope:", JSON.stringify(byKind));
    console.log("by age  :", JSON.stringify(buckets));
    const due = applyDecay(readFileSync(file, "utf8"), now);
    console.log(`decay due now: ${due.archived.length}`);
  } else if (cmd === "decay") {
    const file = positional[0] || "MEMORY.md";
    const archiveFile = flag("--archive") || file.replace(/\.md$/, "-ARCHIVE.md");
    const text = readFileSync(file, "utf8");
    const { out, archiveOut, kept, archived } = applyDecay(text, now);
    if (!archived.length) { console.log(`nothing to decay (${kept} entries all within their windows)`); process.exit(0); }
    console.log(`decaying ${archived.length} entr${archived.length > 1 ? "ies" : "y"} (keeping ${kept}):`);
    for (const a of archived) console.log(`  - [${a.kind} · ${a.age}d] ${a.lines[0].slice(0, 100)}`);
    if (has("--dry-run")) { console.log("(dry-run — no files written)"); process.exit(0); }
    const header = existsSync(archiveFile) ? "" : `# Agent memory — ARCHIVE\n\nEntries that aged out of MEMORY.md (decay policy: app ${DECAY_DAYS.app}d · agent ${DECAY_DAYS.agent}d · global/stub ${DECAY_DAYS.global}d, from the newest date in the entry). Never deleted — resurrect by moving an entry back and reaffirming it.\n\n`;
    writeFileSync(archiveFile, (existsSync(archiveFile) ? readFileSync(archiveFile, "utf8") + "\n" : header) + archiveOut + "\n");
    writeFileSync(file, out);
    console.log(`archived → ${archiveFile}`);
  } else if (cmd === "console") {
    // MEMORY CONSOLE — one management page over the whole memory system: entries (scope/tier/age),
    // the confirmation queue with verdict buttons, the revision worklist, and a copy-out of every
    // action taken, to be applied by a session (same interaction model as the review page).
    const file = positional[0] || "MEMORY.md";
    const outFile = flag("--out") || "memory-console.html";
    const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const { items } = parseMemory(readMemoryUnion(file));
    const entries = items.filter((i) => i.raw === undefined);
    const IMP = /\[impossibility\]|not (?:expressible|buildable|supported)|no (?:engine |platform )?primitive|cannot be|unenforceable|sequence-only/i;
    const TIER = /\[tier:([a-z-]+)\]/;
    const entryCard = (e, i) => {
      const text = e.lines.join("\n");
      const tier = (text.match(TIER) || [])[1] || (/(SUPERSEDED|RECLASSIFIED|CORRECTED|FALSE — retire)/i.test(text) ? "superseded" : "untiered");
      const age = daysBetween(lastDate(e), now);
      const kind = scopeKind(e);
      const imp = IMP.test(text) && tier !== "superseded";
      return `<div class="e" data-scope="${kind}" data-tier="${tier}" data-imp="${imp ? 1 : 0}" id="e${i}">
        <div class="eh"><span class="chip s-${kind}">${esc(e.scope)}</span><span class="chip t-${esc(tier)}">${esc(tier)}</span>${imp ? '<span class="chip imp">⚠ impossibility</span>' : ""}<span class="age">${e.date} · ${age}d</span>
          <span class="acts"><button data-a="reaffirm">✓ reaffirm</button><button data-a="correct">✎ correct</button><button data-a="retire">🗑 retire</button></span></div>
        <div class="eb">${esc(text.replace(/^- \d{4}-\d{2}-\d{2} \[[^\]]+\]\s*/, ""))}</div>
        <textarea class="note" placeholder="note (why / correction)…"></textarea></div>`;
    };
    let queueHtml = "";
    try {
      const q = readFileSync("CONFIRM-QUEUE.md", "utf8");
      const rows = q.split("\n").filter((l) => /^\| Q\d/.test(l)).map((l) => l.split("|").map((c) => c.trim()));
      queueHtml = rows.map((r) => {
        const pending = /PENDING/.test(r[5] || "");
        return `<div class="q" id="${esc(r[1])}"><b>${esc(r[1])}</b> <span class="qc">${esc(r[2])}</span>
          ${pending ? '<span class="acts"><button data-a="confirm">✓ confirm</button><button data-a="deny">✗ deny</button></span><textarea class="note" placeholder="verdict note…"></textarea>' : `<span class="verdict">${esc((r[5] || "").replace(/\*/g, "").slice(0, 90))}</span>`}</div>`;
      }).join("");
    } catch { queueHtml = "<p class=dim>no CONFIRM-QUEUE.md</p>"; }
    let worklist = "";
    try { worklist = `<pre>${esc(readFileSync("REVISION-WORKLIST.md", "utf8"))}</pre>`; } catch { worklist = "<p class=dim>no REVISION-WORKLIST.md</p>"; }
    const byScope = {}; const byTier = {};
    for (const e of entries) { byScope[scopeKind(e)] = (byScope[scopeKind(e)] || 0) + 1; const t = (e.lines.join(" ").match(TIER) || [])[1] || "untiered"; byTier[t] = (byTier[t] || 0) + 1; }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Memory Console</title><style>
      :root{--ink:#171c2b;--mut:#525d76;--line:#e3e7f1;--acc:#5b50e8;--warn:#c47a12;--ok:#0e9f6e;--rose:#d64575;--bg:#fbfcfe;--card:#fff}
      body{font-family:"Avenir Next",Seravek,system-ui,sans-serif;margin:0;background:var(--bg);color:var(--ink);font-size:15.5px;line-height:1.55}
      main{max-width:960px;margin:0 auto;padding:36px 24px 80px}
      h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;border-top:1px solid var(--line);padding-top:18px}
      .stats{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13.5px}.stat b{font-size:17px}
      .bar{position:sticky;top:0;background:var(--bg);padding:10px 0;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--line);z-index:5;flex-wrap:wrap}
      select,input{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:8px}
      button{font:inherit;font-size:12.5px;font-weight:700;border:1px solid var(--line);background:var(--card);border-radius:8px;padding:4px 10px;cursor:pointer}
      button:hover{border-color:var(--acc)}button.on{background:var(--acc);color:#fff;border-color:var(--acc)}
      #copy{margin-left:auto;background:var(--acc);color:#fff;border-color:var(--acc);padding:8px 16px}
      .e,.q{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:10px 0}
      .e[data-state]{border-color:var(--warn)}
      .eh{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
      .chip{font-family:ui-monospace,monospace;font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px;border:1px solid var(--line)}
      .s-global{color:var(--acc);border-color:var(--acc)}.s-app{color:var(--warn);border-color:var(--warn)}.s-agent{color:var(--ok);border-color:var(--ok)}.s-stub{color:var(--mut)}
      .t-owner-confirmed{background:#e7f6ef;color:var(--ok);border-color:var(--ok)}.t-superseded{background:#fdeef3;color:var(--rose);border-color:var(--rose);text-decoration:line-through}
      .chip.imp{color:var(--warn);border-color:var(--warn);background:#fdf6e7}
      .age{color:var(--mut);font-size:12px}.acts{margin-left:auto;display:flex;gap:6px}
      .eb{font-size:14px;color:var(--mut);overflow-wrap:anywhere}.qc{color:var(--mut);font-size:14px}
      .verdict{display:block;font-size:12.5px;color:var(--ok);margin-top:4px}
      .note{display:none;width:100%;margin-top:8px;font:inherit;font-size:13px;border:1px solid var(--warn);border-radius:8px;padding:8px;box-sizing:border-box}
      .e[data-state] .note,.q[data-state] .note{display:block}
      pre{background:#f2f4fa;border:1px solid var(--line);border-radius:10px;padding:14px;font-size:12.5px;overflow-x:auto}.dim{color:var(--mut)}
      .hidden{display:none}</style></head><body><main>
      <h1>Memory Console</h1><div class="dim">canonical home: kf-author-plugin repo · generated ${now} from ${esc(file)} · take actions below, then <b>Copy actions</b> and paste to a session to apply</div>
      <div class="stats"><div class="stat"><b>${entries.length}</b> entries</div>${Object.entries(byScope).map(([k, v]) => `<div class="stat"><b>${v}</b> ${k}</div>`).join("")}${Object.entries(byTier).filter(([k]) => k !== "untiered").map(([k, v]) => `<div class="stat"><b>${v}</b> ${esc(k)}</div>`).join("")}</div>
      <h2>Confirmation queue</h2>${queueHtml}
      <h2>Entries</h2>
      <div class="bar"><select id="fscope"><option value="">all scopes</option><option>global</option><option>app</option><option>agent</option><option>stub</option></select>
      <button id="fimp">⚠ impossibility only</button><input id="ftext" placeholder="filter text…" style="flex:1;min-width:160px"><button id="copy">Copy actions</button></div>
      <div id="list">${entries.map(entryCard).join("")}</div>
      <h2>Revision worklist</h2>${worklist}
      <script>
      const st={};
      document.addEventListener("click",(ev)=>{const b=ev.target.closest("button[data-a]");if(!b)return;const card=b.closest(".e,.q");
        if(card.dataset.state===b.dataset.a){delete card.dataset.state;delete st[card.id];}else{card.dataset.state=b.dataset.a;st[card.id]=b.dataset.a;}
        card.querySelectorAll("button[data-a]").forEach(x=>x.classList.toggle("on",x.dataset.a===card.dataset.state));});
      const apply=()=>{const sc=document.getElementById("fscope").value,imp=document.getElementById("fimp").classList.contains("on"),t=document.getElementById("ftext").value.toLowerCase();
        document.querySelectorAll("#list .e").forEach(e=>{const ok=(!sc||e.dataset.scope===sc)&&(!imp||e.dataset.imp==="1")&&(!t||e.textContent.toLowerCase().includes(t));e.classList.toggle("hidden",!ok)});};
      document.getElementById("fscope").onchange=apply;document.getElementById("ftext").oninput=apply;
      document.getElementById("fimp").onclick=(e)=>{e.target.classList.toggle("on");apply()};
      document.getElementById("copy").onclick=()=>{const lines=["# Memory management actions — apply via a kf-author session",""];
        document.querySelectorAll("[data-state]").forEach(c=>{const note=(c.querySelector(".note")||{}).value||"";const head=(c.querySelector(".eb,.qc")||{}).textContent||c.id;
          lines.push("["+c.dataset.state.toUpperCase()+"] "+(c.id||"")+" — "+head.slice(0,110)+(note?" :: "+note:""));});
        navigator.clipboard.writeText(lines.join("\n")).then(()=>{const b=document.getElementById("copy");b.textContent="Copied ✓";setTimeout(()=>b.textContent="Copy actions",1500)});};
      </script></main></body></html>`;
    writeFileSync(outFile, html);
    console.log(`console → ${outFile} (${entries.length} entries)`);
  } else if (cmd === "reaffirm") {
    const needle = positional[0];
    const file = positional[1] || "MEMORY.md";
    if (!needle) { console.error('usage: memory.mjs reaffirm "<substring>" [MEMORY.md] [--now d]'); process.exit(1); }
    const { out, hit } = reaffirmEntry(readFileSync(file, "utf8"), needle, now);
    if (!hit) { console.log(`no entry contains: ${needle}`); process.exit(1); }
    writeFileSync(file, out);
    console.log(`reaffirmed (${now}): ${hit.lines[0].slice(0, 100)}`);
  } else {
    console.log("usage: node engine/memory.mjs stats|decay|reaffirm …  (see file header)");
  }
}
