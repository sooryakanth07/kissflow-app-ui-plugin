#!/usr/bin/env node
// capture-screens.mjs — headless-screenshot each screen of a self-contained prototype into
// <out>/thumbs/*.png + manifest.json, so `review.mjs` embeds the REAL screens (InVision-style
// Screens review) in the Pages & Nav tab instead of wireframe mocks.
//
//   node engine/capture-screens.mjs <prototype.html> [--out <dir>] [--roles slug:Name:Label,…]
//
// Role discovery: reads `window.ROLES = [{slug,name,title}]` from the shadcn-kit prototype (the
// standard pipeline output); falls back to `<section id="rv-<slug>">` sections. Each screen is
// captured by injecting the prototype's own `switchRole(slug)` before </body>.
//
// LOCAL/DEV ONLY: needs headless Chrome (set CHROME=/path to override the macOS default). In a
// headless sandbox with no Chrome, this is a no-op — review.mjs then falls back to wireframes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const proto = process.argv[2];
if (!proto || !existsSync(proto)) { console.error("usage: capture-screens.mjs <prototype.html> [--out <dir>] [--roles slug:Name,…]"); process.exit(1); }
const outArg = (process.argv.indexOf("--out") >= 0) ? process.argv[process.argv.indexOf("--out") + 1] : join(dirname(proto), "thumbs");
const rolesArg = (process.argv.indexOf("--roles") >= 0) ? process.argv[process.argv.indexOf("--roles") + 1] : "";

// locate Chrome (macOS default + common linux names + $CHROME)
const CANDIDATES = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean);
function chromeBin() {
  for (const c of CANDIDATES) {
    if (c.includes("/") && existsSync(c)) return c;
    const w = spawnSync("which", [c], { encoding: "utf8" }); if (w.status === 0 && w.stdout.trim()) return w.stdout.trim();
  }
  return null;
}
const CHROME = chromeBin();
if (!CHROME) { console.error("capture-screens: no headless Chrome found — skipping (review falls back to wireframes). Set CHROME=/path to enable."); process.exit(0); }

const html = readFileSync(proto, "utf8");
// screens: from --roles, else window.ROLES, else rv-<slug> sections
let screens = [];
if (rolesArg) {
  screens = rolesArg.split(",").map((s) => { const [slug, name, label] = s.split(":"); return { slug, name: label || name || slug, role: name || slug }; });
} else {
  const m = html.match(/window\.ROLES\s*=\s*(\[[\s\S]*?\]);/);
  if (m) {
    try { const R = eval(m[1]); screens = R.map((r) => ({ slug: r.slug, name: r.title || r.name || r.slug, role: r.name || r.slug })); } catch { /* fall through */ }
  }
  if (!screens.length) {
    const secs = [...html.matchAll(/id="rv-([a-z0-9-]+)"/gi)].map((x) => x[1]);
    screens = [...new Set(secs)].map((slug) => ({ slug, name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), role: slug }));
  }
}
if (!screens.length) { console.error("capture-screens: no roles/screens found in the prototype (no window.ROLES or rv-* sections)."); process.exit(0); }

mkdirSync(outArg, { recursive: true });
const tmp = join(tmpdir(), "kf-cap-" + basename(proto).replace(/\W/g, ""));
mkdirSync(tmp, { recursive: true });
const manifest = { screens: [] };
for (const s of screens) {
  const injected = html.replace(/<\/body>/i, `<script>try{window.switchRole&&switchRole(${JSON.stringify(s.slug)})}catch(e){}</script></body>`);
  const tf = join(tmp, s.slug + ".html"); writeFileSync(tf, injected);
  const png = join(outArg, s.slug + ".png");
  const r = spawnSync(CHROME, ["--headless", "--disable-gpu", "--ignore-certificate-errors",
    "--screenshot=" + png, "--window-size=1400,1500", "--virtual-time-budget=8000", "file://" + tf],
    { encoding: "utf8", timeout: 60000 });
  if (existsSync(png)) { manifest.screens.push({ file: s.slug + ".png", name: s.name, role: s.role }); process.stdout.write("  ✓ " + s.name + "\n"); }
  else process.stdout.write("  ✗ " + s.name + " (capture failed)\n");
}
if (manifest.screens.length) { writeFileSync(join(outArg, "manifest.json"), JSON.stringify(manifest, null, 2)); console.log(`captured ${manifest.screens.length}/${screens.length} screens → ${outArg}`); }
else console.error("capture-screens: nothing captured.");
