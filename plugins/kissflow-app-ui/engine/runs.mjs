#!/usr/bin/env node
// runs.mjs — per-BRD RUN directories + versioned snapshots for the staged authoring pipeline.
// A "run" is one BRD's authoring session; every review-worthy state (a /author-plan or /author-refine)
// is snapshotted as an immutable version under versions/vN/ (IR + decisions + review.html + prototype/
// + CHANGES.md). runs/.current names the active run. Zero deps.
//
//   node runs.mjs new <slug> [brdPath]   → create runs/<slug>/ (dedup), copy BRD, make it current
//   node runs.mjs snapshot ["note"]      → snapshot the current run's working files → versions/vN/
//   node runs.mjs list                   → list runs (* = current) + version counts
//   node runs.mjs use <slug>             → set the current run
//   node runs.mjs current                → print the current run's dir
//   node runs.mjs status                 → the current run's stage + version ladder
import { mkdirSync, cpSync, readdirSync, existsSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const RUNS = "runs";
const [cmd, arg] = [process.argv[2], process.argv[3]];
const slugify = (s) => String(s).toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "app";
const curFile = join(RUNS, ".current");
const readCur = () => { try { return readFileSync(curFile, "utf8").trim(); } catch { return null; } };
const dirOf = (s) => join(RUNS, s);
const versionsOf = (s) => (existsSync(join(dirOf(s), "versions")) ? readdirSync(join(dirOf(s), "versions")).filter((v) => /^v\d+$/.test(v)).sort((a, b) => +a.slice(1) - +b.slice(1)) : []);
// working files copied into each snapshot (the BRD stays at the run root, not per-version)
const WORKING = ["app-spec.json", "decisions.md", "open-questions.md", "review.html", "prototype"];

if (cmd === "new") {
  mkdirSync(RUNS, { recursive: true });
  const brd = process.argv[4];
  let base = slugify(arg || (brd ? brd.split("/").pop() : "app")), slug = base, i = 2;
  while (existsSync(dirOf(slug))) slug = `${base}-${i++}`;
  const dir = dirOf(slug);
  mkdirSync(join(dir, "versions"), { recursive: true });
  if (brd && existsSync(brd)) cpSync(brd, join(dir, "brd." + (brd.split(".").pop() || "txt").toLowerCase()));
  writeFileSync(join(dir, "RUN.md"), `# Run: ${slug}\n\n- stage: **brief**\n- target: dev\n- generated: no\n\n## Versions\n`);
  writeFileSync(curFile, slug);
  console.log(dir);
} else if (cmd === "snapshot") {
  const slug = readCur(); if (!slug) { console.error("runs: no current run — run `runs.mjs new` first"); process.exit(1); }
  const dir = dirOf(slug), v = `v${versionsOf(slug).length + 1}`, vdir = join(dir, "versions", v);
  mkdirSync(vdir, { recursive: true });
  for (const f of WORKING) { const src = join(dir, f); if (existsSync(src)) cpSync(src, join(vdir, f), { recursive: true }); }
  writeFileSync(join(vdir, "CHANGES.md"), `# ${v}\n\n${arg || "(snapshot)"}\n`);
  appendFileSync(join(dir, "RUN.md"), `- **${v}** — ${(arg || "snapshot").split("\n")[0]}\n`);
  try { const { stamp } = await import("./timeline.mjs"); stamp(dir, "runs", `snapshot ${v} — ${(arg || "snapshot").split("\n")[0]}`, "mark"); } catch { /* never fatal */ }
  console.log(join(vdir));
} else if (cmd === "list") {
  mkdirSync(RUNS, { recursive: true });
  const cur = readCur();
  const runs = readdirSync(RUNS).filter((d) => existsSync(join(RUNS, d, "RUN.md")));
  if (!runs.length) console.log("(no runs yet — /author-brief creates one)");
  for (const s of runs) console.log(`${s === cur ? "* " : "  "}${s}  (${versionsOf(s).length} versions)`);
} else if (cmd === "use") {
  if (!existsSync(dirOf(arg))) { console.error("runs: no such run: " + arg); process.exit(1); }
  writeFileSync(curFile, arg); console.log("current → " + arg);
} else if (cmd === "current") {
  const s = readCur(); if (!s) { console.error("runs: no current run"); process.exit(1); } console.log(dirOf(s));
} else if (cmd === "status") {
  const s = readCur(); if (!s) { console.error("runs: no current run"); process.exit(1); }
  process.stdout.write(readFileSync(join(dirOf(s), "RUN.md"), "utf8"));
  console.log("\nversions: " + (versionsOf(s).join(", ") || "(none)"));
} else {
  console.error("usage: runs.mjs new <slug> [brd] | snapshot [\"note\"] | list | use <slug> | current | status");
  process.exit(1);
}
