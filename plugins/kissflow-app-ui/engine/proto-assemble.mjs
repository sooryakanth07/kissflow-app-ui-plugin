#!/usr/bin/env node
// proto-assemble.mjs — deterministic assembler for PARALLEL prototype generation.
//
// The clickable prototype used to be one agent writing ~100KB serially (26+ min, stall-prone).
// New protocol: a SHELL part (full document: CSS system, Inter, seed dataset, role switcher, and
// one `<!-- @PART:role-<slug> -->` marker per role) is generated first; then N role-dashboard
// parts are generated CONCURRENTLY (one agent each, fast emission tier); this assembler splices
// them into the final single-file prototype. Nothing is templated — every part is generated fresh
// per app — the assembler is a build step, not a design.
//
//   node engine/proto-assemble.mjs <partsDir> [--out index.html]
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export const MARKER_RE = /<!--\s*@PART:([a-z0-9_-]+)\s*-->/gi;

// pure: splice parts into the shell; report what happened (testable).
// Part <script> blocks are EXTRACTED and re-appended before </body> — parts land above the shell's
// bottom script (which defines SEED + helpers), so leaving their scripts in place makes them run
// before their dependencies exist. Deferred re-append guarantees ordering for every part, guarded
// or not (Finance rendered empty in the first assembled run for exactly this reason).
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
export function assemble(shell, parts) {
  const used = [], missing = [], deferred = [];
  const out0 = shell.replace(MARKER_RE, (m, name) => {
    const key = name.toLowerCase();
    if (parts[key] === undefined) { missing.push(key); return `<!-- missing part: ${key} -->`; }
    used.push(key);
    return parts[key].replace(SCRIPT_RE, (sc) => { deferred.push(`<!-- part:${key} script (deferred by assembler) -->\n${sc}`); return `<!-- script deferred: ${key} -->`; });
  });
  const inject = deferred.length ? deferred.join("\n") + "\n" : "";
  const out = /<\/body>/i.test(out0) ? out0.replace(/<\/body>/i, inject + "</body>") : out0 + inject;
  const unused = Object.keys(parts).filter((k) => !used.includes(k));
  return { out, used, missing, unused, deferredScripts: deferred.length };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const dir = process.argv[2];
  const oi = process.argv.indexOf("--out");
  const outFile = oi >= 0 ? process.argv[oi + 1] : join(dir, "..", "index.html");
  if (!dir || !existsSync(join(dir, "shell.html"))) {
    console.error("usage: proto-assemble.mjs <partsDir>  (needs shell.html + role-*.html parts)");
    process.exit(1);
  }
  const shell = readFileSync(join(dir, "shell.html"), "utf8");
  const parts = {};
  for (const f of readdirSync(dir)) {
    if (f === "shell.html" || !f.endsWith(".html")) continue;
    parts[f.replace(/\.html$/, "").toLowerCase()] = readFileSync(join(dir, f), "utf8");
  }
  const { out, used, missing, unused } = assemble(shell, parts);
  if (missing.length) { console.error(`FAIL: shell wants parts not present: ${missing.join(", ")}`); process.exit(1); }
  writeFileSync(outFile, out);
  console.log(`assembled ${outFile} (${Math.round(out.length / 1024)}KB) from shell + ${used.length} parts${unused.length ? ` · UNUSED parts: ${unused.join(", ")}` : ""}`);
}
