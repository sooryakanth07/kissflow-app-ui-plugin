#!/usr/bin/env node
// kf-author engine CLI. Dependency-free.
//   node cli.mjs validate <ir.json>          — validate the App-Spec IR (shape + cross-refs)
//   node cli.mjs verify   <ir.json>          — IR validation + coherence checks
//   node cli.mjs build    <ir.json> [--out d]— compile IR → metadata blobs (DRY-RUN: writes to d/)
//   node cli.mjs check    <appExportDir>     — run validators over a real export folder
//   node cli.mjs import   <appExportDir>     — load an export → (partial) IR-ish summary

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateIR, checkCoherenceIR } from "./ir.mjs";
import { ensureExperience } from "./experience.mjs";
import { buildApp } from "./builders.mjs";
import { stamp as tlStamp } from "./timeline.mjs";

// Zero-dep .env autoloader (A3, Inventory build): the engine is often run next to a scaffold .env
// or a sourced .kf-env — load ./.env and ./.kf-env if present; already-set env always wins.
for (const f of [".env", ".kf-env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)=("?)(.*)\2\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
    }
  } catch { /* no file — fine */ }
}
import { dirname as tlDirname } from "node:path";
// auto-timing: every verify/build/apply stamps the run's timeline.jsonl (actor = $KF_ACTOR or "engine");
// failures are silent — instrumentation never breaks the pipeline.
const tl = (irPath, step, ev) => { try { tlStamp(tlDirname(irPath), process.env.KF_ACTOR || "engine", step, ev); } catch { /* never fatal */ } };
import { loadApp, allBlobs } from "./loader.mjs";
import { validateBlob, errors, warnings } from "./validators.mjs";

const [cmd, arg, ...rest] = process.argv.slice(2);
const flag = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const report = (issues) => {
  for (const i of issues) console.log(`  ${i.level === "error" ? "✗" : "•"} [${i.code}] ${i.msg}${i.where ? "  (" + i.where + ")" : ""}`);
  console.log(`\n  ${errors(issues).length} errors, ${warnings(issues).length} warnings`);
};

if (!cmd || cmd === "help") {
  console.log("kf-author engine — validate | verify | build | check | import");
  process.exit(0);
}

try {
  if (cmd === "validate" || cmd === "verify") {
    tl(arg, cmd, "start");
    const ir = readJson(arg);
    const res = validateIR(ir);
    const issues = cmd === "verify" ? [...res.issues, ...checkCoherenceIR(ir)] : res.issues;
    console.log(`\nIR: ${ir.app?.name || "(unnamed)"}`);
    report(issues);
    tl(arg, cmd, "end");
    process.exit(errors(issues).length ? 1 : 0);
  }

  if (cmd === "build") {
    tl(arg, "build", "start");
    const ir = readJson(arg);
    const exp = ensureExperience(ir); // GUARANTEE: every build has pages + nav + role landings
    if (exp.added.length) console.log(`experience: auto-added baseline (${exp.added.length}) — ${exp.added.join(", ")}\n(design richer pages via kf-experience-designer to override)`);
    const v = validateIR(ir);
    if (!v.ok) { console.log("IR invalid — fix before building:"); report(v.issues); tl(arg, "build", "end"), process.exit(1); }
    const { appId, artifacts } = buildApp(ir);
    const out = flag("--out", join(process.cwd(), "kf-build-out"));
    mkdirSync(out, { recursive: true });
    console.log(`\nPLAN — app ${appId}: ${artifacts.length} artifacts (DRY-RUN → ${out})`);
    let issues = [];
    for (const a of artifacts) {
      const dir = join(out, a.type); mkdirSync(dir, { recursive: true });
      if (a.doc) writeFileSync(join(dir, `${a.id}.doc.json`), JSON.stringify(a.doc, null, 2));
      if (a.shell) writeFileSync(join(dir, `${a.id}.shell.json`), JSON.stringify(a.shell, null, 2));
      if (a.blob) {
        writeFileSync(join(dir, `${a.id}.blob.json`), JSON.stringify(a.blob, null, 2));
        issues = issues.concat(validateBlob({ label: a.id, blob: a.blob }));
      }
      console.log(`  + ${a.type.padEnd(6)} ${a.id}`);
    }
    console.log("\nvalidation of generated metadata:");
    report(issues);
    console.log("\n(use --apply --target <env> to publish — gated; not implemented in dry-run build)");
    tl(arg, "build", "end"), process.exit(errors(issues).length ? 1 : 0);
  }

  if (cmd === "apply") {
    tl(arg, "apply", "start");
    const ir = readJson(arg);
    const exp = ensureExperience(ir); // GUARANTEE: every applied app has pages + nav + role landings
    if (exp.added.length) console.log(`experience: auto-added baseline (${exp.added.length}) — ${exp.added.join(", ")}`);
    const v = validateIR(ir);
    if (!v.ok) { console.log("IR invalid — fix before applying:"); report(v.issues); tl(arg, "apply", "end"), process.exit(1); }
    const { applyIR } = await import("./client.mjs");
    const _host = process.env.KISSFLOW_DOMAIN || process.env.KF_DOMAIN || ((process.env.KISSFLOW_SUBDOMAIN || process.env.KF_SUBDOMAIN || "").includes(".") ? (process.env.KISSFLOW_SUBDOMAIN || process.env.KF_SUBDOMAIN) : `${process.env.KISSFLOW_SUBDOMAIN || process.env.KF_SUBDOMAIN}.kissflow.com`);
    console.log(`\nAPPLY (LIVE) — ${ir.app?.name} → ${_host}`);
    const rep = await applyIR(ir);
    console.log("\n=== REPORT ===");
    console.log(`app: ${rep.app}`);
    console.log(`roles: ${rep.roles.map((r) => r.name + "(" + r.status + ")").join(", ")}`);
    console.log(`created shells: ${rep.created.length}  published: ${rep.published.length}`);
    console.log(`verified nested in app: ${rep.verified.nestedInApp}`);
    if (rep.verified.flows) console.log(`  ${rep.verified.flows.join(", ")}`);
    if (rep.errors.length) { console.log("errors:"); rep.errors.forEach((e) => console.log("  ✗ " + e)); }
    tl(arg, "apply", "end"), process.exit(rep.errors.length ? 1 : 0);
  }

  if (cmd === "check" || cmd === "import") {
    if (!existsSync(arg)) { console.log(`no such folder: ${arg}`); process.exit(1); }
    const app = loadApp(arg);
    const blobs = allBlobs(app);
    console.log(`\n${arg}: ${app.forms.length} forms, ${app.cases.length} cases, ${app.processes.length} processes, ${app.pages.length} pages, ${app.lists.length} lists, ${blobs.length} blobs`);
    if (cmd === "check") {
      let issues = [];
      for (const b of blobs) issues = issues.concat(validateBlob(b));
      report(issues);
      process.exit(errors(issues).length ? 1 : 0);
    }
    process.exit(0);
  }

  console.log(`unknown command: ${cmd}`);
  process.exit(1);
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
