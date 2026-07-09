#!/usr/bin/env node
// kf-author engine CLI. Dependency-free.
//   node cli.mjs validate <ir.json>          — validate the App-Spec IR (shape + cross-refs)
//   node cli.mjs verify   <ir.json>          — IR validation + coherence checks
//   node cli.mjs build    <ir.json> [--out d]— compile IR → metadata blobs (DRY-RUN: writes to d/)
//   node cli.mjs check    <appExportDir>     — run validators over a real export folder
//   node cli.mjs import   <appExportDir>     — load an export → (partial) IR-ish summary

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { validateIR, checkCoherenceIR } from "./ir.mjs";
import { ensureExperience } from "./experience.mjs";
import { buildApp } from "./builders.mjs";
import { stamp as tlStamp } from "./timeline.mjs";
import { dirname as tlDirname } from "node:path";
// auto-timing: every verify/build/apply stamps the run's timeline.jsonl (actor = $KF_ACTOR or "engine");
// failures are silent — instrumentation never breaks the pipeline.
const tl = (irPath, step, ev) => { try { tlStamp(tlDirname(irPath), process.env.KF_ACTOR || "engine", step, ev); } catch { /* never fatal */ } };
import { loadApp, allBlobs } from "./loader.mjs";
import { validateBlob, errors, warnings } from "./validators.mjs";

// Minimal, zero-dep .env loader — the engine reads process.env but nothing populates it.
// Loads (cwd) .env then inventory/.env; already-set real env vars always win.
for (const f of [".env", "inventory/.env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trimStart().startsWith("#")) continue;
      const k = m[1]; let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch { /* no such file — fine */ }
}

const [cmd, arg, ...rest] = process.argv.slice(2);
const flag = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
const hasFlag = (n) => rest.includes(n);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const report = (issues) => {
  for (const i of issues) console.log(`  ${i.level === "error" ? "✗" : "•"} [${i.code}] ${i.msg}${i.where ? "  (" + i.where + ")" : ""}`);
  console.log(`\n  ${errors(issues).length} errors, ${warnings(issues).length} warnings`);
};

if (!cmd || cmd === "help") {
  console.log("kf-author engine — validate | verify | build [--no-pages] | check | import | resolve-experience | deploy-ui");
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
    // --no-pages: CUSTOM-UI mode — build app + models + roles + workflows WITHOUT native pages/nav.
    if (hasFlag("--no-pages")) { ir.pages = []; console.log("no-pages: skipping experience layer — no native pages/nav will be built"); }
    else {
      const exp = ensureExperience(ir); // GUARANTEE: every build has pages + nav + role landings
      if (exp.added.length) console.log(`experience: auto-added baseline (${exp.added.length}) — ${exp.added.join(", ")}\n(design richer pages via kf-experience-designer to override)`);
    }
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
    // --no-pages: CUSTOM-UI mode — apply app + models + roles + workflows only. Skip the experience layer.
    if (hasFlag("--no-pages")) { ir.pages = []; console.log("no-pages: skipping experience layer — no native pages/nav will be applied"); }
    else {
      const exp = ensureExperience(ir); // GUARANTEE: every applied app has pages + nav + role landings
      if (exp.added.length) console.log(`experience: auto-added baseline (${exp.added.length}) — ${exp.added.join(", ")}`);
    }
    const v = validateIR(ir);
    if (!v.ok) { console.log("IR invalid — fix before applying:"); report(v.issues); tl(arg, "apply", "end"), process.exit(1); }
    const { applyIR } = await import("./client.mjs");
    console.log(`\nAPPLY (LIVE) — ${ir.app?.name} → ${(process.env.KISSFLOW_DOMAIN || process.env.KF_DOMAIN) || `${process.env.KISSFLOW_SUBDOMAIN}.kissflow.com`}`);
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

  if (cmd === "resolve-experience") {
    const [expPath, schemaPath] = [arg, rest[0]];
    if (!expPath || !schemaPath || schemaPath.startsWith("--")) {
      console.error("usage: node cli.mjs resolve-experience <experience-spec.json> <kf-schema.json> [--out lib/ui-spec.json]");
      process.exit(1);
    }
    const { resolveExperience } = await import("./resolve.mjs");
    const experienceSpec = readJson(expPath);
    const kfSchema = readJson(schemaPath);
    const { uiSpec, warnings: warns } = resolveExperience(experienceSpec, kfSchema);
    const out = flag("--out", join(process.cwd(), "lib/ui-spec.json"));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(uiSpec, null, 2));
    const widgetCount = uiSpec.pages.reduce((n, p) => n + p.widgets.length, 0);
    const droppedWidgets = warns.filter((w) => w.widget).length;
    const droppedPages = warns.filter((w) => w.page && !w.widget).length;
    console.log(`\nresolve-experience → ${out}`);
    console.log(`  app:     ${uiSpec.app.name} (theme: ${uiSpec.app.theme})`);
    console.log(`  roles:   ${uiSpec.roles.length}`);
    console.log(`  pages:   ${uiSpec.pages.length} resolved${droppedPages ? `, ${droppedPages} dropped` : ""}`);
    console.log(`  widgets: ${widgetCount} resolved${droppedWidgets ? `, ${droppedWidgets} dropped` : ""}`);
    if (warns.length) {
      console.error(`\n${warns.length} warning(s):`);
      for (const w of warns) console.error(`  • ${w.page ? `[${w.page}] ` : ""}${w.widget ? `"${w.widget}": ` : ""}${w.reason}`);
    } else {
      console.error("\nno warnings — every bind resolved to a real id.");
    }
    process.exit(0);
  }

  if (cmd === "deploy-ui") {
    // node cli.mjs deploy-ui <zipPath> --app <appId> [--name "App UI"] [--url <devUrl>] [--open]
    // Deploys the built React zip (or a dev URL) as the app's Application custom component + enables Custom UI.
    const appId = flag("--app");
    const url = flag("--url");
    const name = flag("--name");
    const zipPath = arg && !arg.startsWith("--") ? arg : undefined;
    if (!appId || (!zipPath && !url)) {
      console.error("usage: node cli.mjs deploy-ui <zipPath> --app <appId> [--name \"App UI\"] [--url <devUrl>] [--open]");
      console.error("  ZIP mode : node cli.mjs deploy-ui dist/app-ui.zip --app APP123   (upload+trigger+poll — blob upload is TODO(live-verify))");
      console.error("  URL mode : node cli.mjs deploy-ui --app APP123 --url https://localhost:3000 --open   (simple, reliable — no blob upload; --open launches the app)");
      console.error("  requires env: KISSFLOW_ACCOUNT_ID/API_KEY/API_SECRET (or KF_*) + KISSFLOW_DOMAIN/KF_DOMAIN");
      process.exit(1);
    }
    const { deployUI } = await import("./deploy-ui.mjs");
    console.log(`\nDEPLOY-UI (LIVE) — app ${appId} → ${(process.env.KISSFLOW_DOMAIN || process.env.KF_DOMAIN) || `${process.env.KISSFLOW_SUBDOMAIN}.kissflow.com`}  [mode: ${url ? "url" : "zip"}]`);
    const rep = await deployUI({ appId, zipPath, url, name });
    console.log("\n=== DEPLOY-UI REPORT ===");
    console.log(`component id: ${rep.componentId}`);
    console.log(`mode: ${rep.mode}`);
    console.log(`app url: ${rep.appUrl}`);
    if (rep.warnings.length) { console.log("warnings:"); rep.warnings.forEach((w) => console.log("  • " + w)); }
    // --open: launch the app in the default browser (platform-aware). Best-effort — never fatal.
    if (hasFlag("--open") && rep.appUrl) {
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
      const oArgs = process.platform === "win32" ? ["/c", "start", "", rep.appUrl] : [rep.appUrl];
      try {
        const { spawn } = await import("node:child_process");
        spawn(opener, oArgs, { stdio: "ignore", detached: true }).unref();
        console.log(`opened ${rep.appUrl} in your default browser`);
      } catch (e) { console.log(`could not open the browser (${e.message}) — visit ${rep.appUrl}`); }
    }
    process.exit(0);
  }

  console.log(`unknown command: ${cmd}`);
  process.exit(1);
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
