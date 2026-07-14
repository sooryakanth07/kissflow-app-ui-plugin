// Live Kissflow client + two-pass apply. Uses global fetch (Node 18+).
// Credentials from env: KISSFLOW_SUBDOMAIN, KISSFLOW_ACCOUNT_ID, KISSFLOW_API_KEY, KISSFLOW_API_SECRET.
//
// Hard-won live facts (verified on lcncdemo 2026-06-25):
//  - app-association is a QUERY PARAM on create: POST /flow/2/{acct}/{type}/?_application_id={app}
//    (body _application_id is silently dropped). Confirm via GET /flow/2/{acct}/explore.
//  - create returns 200 even when it drops fields → READ-AFTER-WRITE is mandatory.
//  - server assigns _id from Name → capture it and remap references (two-pass).
//  - metadata body: PUT /metadata/2/{acct}/{type}/{id}/draft → POST .../publish.

import { buildApp } from "./builders.mjs";
import { validateBlob, errors as blobErrors } from "./validators.mjs";
import { slug, eid } from "./util.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));

// Compile a page INTERMEDIATE through Kissflow's REAL transformer.py (via page_transform.py).
// Returns the rendering-correct page metadata, or null on failure. There is NO JS mirror.
function transformPageReal(intermediate, applicationId, pageId, log) {
  const input = JSON.stringify({ intermediate, applicationId, pageId });
  const r = spawnSync("python3", [join(ENGINE_DIR, "page_transform.py")], { input, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) { if (log) log(`  page transformer error: ${(r.stderr || r.error?.message || "").slice(0, 160)}`); return null; }
  try { return JSON.parse(r.stdout); } catch (e) { if (log) log(`  page transformer bad output: ${e.message}`); return null; }
}

// Cross-flow references a blob points at (ReferredList for selects, LHSModel for
// references). These resolve to OTHER flows, so validateBlob (within-blob only) can't
// check them — a dangling one is the usual cause of the opaque publish 500.
function crossRefs(blob) {
  const refs = new Set();
  for (const e of Object.values(blob)) {
    if (!e || e.Kind !== "Field") continue;
    if (e.ReferredList) refs.add(e.ReferredList);
    for (const qid of e["Field::QueryDefinition"] || []) {
      const lhs = blob[qid]?.LHSModel;
      // in-blob Model = an EMBEDDED child table (aggregate over line-items), not a cross-flow ref
      if (lhs && lhs !== "User" && !blob[lhs]) refs.add(lhs);
    }
  }
  return [...refs];
}

// Flow-type → member-grant contract, single source of truth for both the IR-permission and the
// page-driven access paths. Board is a Case flow server-side; both use the "case" family and
// Permission:[] ONLY (Delete is rejected on cases). Getting "Board" wrong here → grants POST to the
// /form/ endpoint → 404, boards render memberless (hire-onboarding 2026-07-05).
export function flowGrant(flowType, { editable = true, admin = false } = {}) {
  const t = flowType || "Form";
  if (t === "Process") return { family: "process", role: "Member", permission: [] };
  if (t === "Case" || t === "Board")
    return { family: "case", role: admin && editable ? "Admin" : editable ? "Member" : "Viewer", permission: [] };
  return { family: "form", role: editable ? "Member" : "Viewer", permission: editable ? ["Delete"] : [] };
}

// Read Kissflow REST creds from env for ONE environment. prefix "" = the default/dev account
// (the engine's KISSFLOW_* names or the UI-tooling KF_* names); prefix "PROD_" = the production
// account. App creation is triggered against prod (Kissflow replicates it to dev); all other work
// runs against dev.
function readCreds(env, prefix = "") {
  const p = prefix;
  const acc = env[`KISSFLOW_${p}ACCOUNT_ID`] || env[`KF_${p}ACCOUNT_ID`];
  const key = env[`KISSFLOW_${p}API_KEY`] || env[`KF_${p}ACCESS_KEY_ID`];
  const secret = env[`KISSFLOW_${p}API_SECRET`] || env[`KF_${p}ACCESS_KEY_SECRET`];
  // Host: a full-domain override (…DOMAIN) wins — needed for non-*.kissflow.com hosts
  // (QA/self-hosted). Otherwise fall back to <subdomain>.kissflow.com.
  const domain = env[`KISSFLOW_${p}DOMAIN`] || env[`KF_${p}DOMAIN`];
  const sub = env[`KISSFLOW_${p}SUBDOMAIN`] || env[`KF_${p}SUBDOMAIN`];
  if (!acc || !key || !secret || (!domain && !sub))
    throw new Error(`Set KISSFLOW_${p}ACCOUNT_ID/API_KEY/API_SECRET (or KF_${p}ACCOUNT_ID/KF_${p}ACCESS_KEY_ID/KF_${p}ACCESS_KEY_SECRET) and KISSFLOW_${p}DOMAIN/KF_${p}DOMAIN (or KISSFLOW_${p}SUBDOMAIN) in env`);
  const host = domain ? domain.replace(/^https?:\/\//, "").replace(/\/+$/, "") : `${sub}.kissflow.com`;
  return { acc, host, key, secret };
}

function buildClient({ acc, host, key, secret }) {
  const base = `https://${host}`;
  const headers = { "X-Access-Key-Id": key, "X-Access-Key-Secret": secret, "Content-Type": "application/json" };
  // RESILIENT call: retry transient network failures + 5xx/429 with backoff, and NEVER throw —
  // a single hiccup among the hundreds of apply calls must not abort the run (which would skip
  // everything downstream, e.g. nav + role Preference). A hard failure returns {status:-1}.
  const call = async (method, path, body) => {
    const MAX = 4;
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
        const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
        if ([429, 502, 503, 504].includes(r.status) && attempt < MAX) { await new Promise((s) => setTimeout(s, 500 * (attempt + 1))); continue; }
        return { status: r.status, body: j };
      } catch (e) {
        if (attempt < MAX) { await new Promise((s) => setTimeout(s, 500 * (attempt + 1))); continue; }
        return { status: -1, body: { error: "fetch failed", message: String(e?.message || e) } };
      }
    }
  };
  // Kissflow rejects Description > 250 chars with a bare HTTP 413 (no error body) — clamp at a word boundary
  const clampDesc = (s) => { s = String(s || ""); if (s.length <= 250) return s; const cut = s.slice(0, 249); return cut.slice(0, Math.max(cut.lastIndexOf(" "), 200)) + "…"; };
  return { base, acc, call,
    createApp: (Name, Description = "") => call("POST", `/flow/2/${acc}/application/`, { Name, Description: clampDesc(Description) }),
    // cases REQUIRE Prefix + ItemType on create (missing → 400 MissingRequiredFieldError)
    createFlow: (type, Name, appId, Description = "") => call("POST", `/flow/2/${acc}/${type}/?_application_id=${appId}`,
      type === "case"
        ? { Name, Description: clampDesc(Description), Prefix: Name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "CSE", ItemType: "Item" }
        : { Name, Description: clampDesc(Description) }),
    getDraft: (type, id) => call("GET", `/metadata/2/${acc}/${type}/${id}/draft`),
    putDraft: (type, id, blob) => call("PUT", `/metadata/2/${acc}/${type}/${id}/draft`, blob),
    publish: (type, id) => call("POST", `/metadata/2/${acc}/${type}/${id}/publish`, {}),
    // Lists don't use the metadata draft/publish path — their option values are saved via the
    // runtime save-items handler: POST /flow/2/{acc}/list/{id}/items {ListItems:[...]} (verified
    // live 2026-07-03; wrong shapes 400 "Unknown field", top-level array 403, metadata path 404).
    putListItems: (id, items) => call("POST", `/flow/2/${acc}/list/${id}/items`, { ListItems: items }),
    // roles associate via BODY _application_id (NOT the query param flows use); list: /app_role/2/{acc}/list?_application_id=
    createRole: (Name, appId) => call("POST", `/app_role/2/${acc}/`, { Name, _application_id: appId }),
    explore: () => call("GET", `/flow/2/${acc}/explore`),
    // app existence checks (used to await the prod→dev replication): a direct GET-by-id, plus the
    // app list as a fallback for hosts that don't expose GET application/{id}.
    getApp: (id) => call("GET", `/flow/2/${acc}/application/${id}`),
    listApps: () => call("POST", `/flow/2/${acc}/explore/?exclude_app_flows=true`, {}),
    deleteFlow: (type, id) => call("DELETE", `/flow/2/${acc}/${type}/${id}`),
    deleteApp: (id) => call("DELETE", `/flow/2/${acc}/application/${id}`),
  };
}

// The default client talks to the DEV account (KISSFLOW_*/KF_* names) — used for everything except
// creating the app shell.
export function clientFromEnv() { return buildClient(readCreds(process.env, "")); }
// The PROD client — used ONLY to create the app shell, which Kissflow then replicates to dev.
export function clientForProd() { return buildClient(readCreds(process.env, "PROD_")); }
// Are prod creds configured? Absent ⇒ single-account mode (create the app in the current account).
function prodCredsPresent(env = process.env) {
  return Boolean(
    (env.KISSFLOW_PROD_ACCOUNT_ID || env.KF_PROD_ACCOUNT_ID) &&
    (env.KISSFLOW_PROD_API_KEY || env.KF_PROD_ACCESS_KEY_ID) &&
    (env.KISSFLOW_PROD_API_SECRET || env.KF_PROD_ACCESS_KEY_SECRET) &&
    (env.KISSFLOW_PROD_DOMAIN || env.KF_PROD_DOMAIN || env.KISSFLOW_PROD_SUBDOMAIN || env.KF_PROD_SUBDOMAIN),
  );
}
export function maybeProdClient() { return prodCredsPresent() ? clientForProd() : null; }

// After the app is created in PROD, Kissflow replicates it to dev with the SAME _id after a short
// delay. Poll dev until the app exists there before building anything into it. (createApp on prod
// alone is assumed to trigger replication; if a prod publish turns out to be required, publish
// before calling this — the timeout below then surfaces the missing replication clearly.)
async function waitForAppInDev(dev, appId, { timeoutMs = 120000, intervalMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (let n = 1; Date.now() < deadline; n++) {
    const byId = await dev.getApp(appId);
    if (byId.status >= 200 && byId.status < 300) return true;
    const list = await dev.listApps(); // fallback if GET application/{id} isn't exposed
    if (Array.isArray(list.body) && list.body.some((a) => a?._id === appId)) return true;
    if (n === 1 || n % 3 === 0) console.log(`  … waiting for app ${appId} to replicate to dev (check ${n})`);
    await new Promise((s) => setTimeout(s, intervalMs));
  }
  return false;
}

// Replace every occurrence of my generated ids with server ids (longest-first to avoid
// substring clobbering). Remaps Root, Model back-refs, LHSModel, ReferredList in one pass.
function remap(blob, genToServer) {
  let s = JSON.stringify(blob);
  for (const [gen, srv] of Object.entries(genToServer).sort((a, b) => b[0].length - a[0].length)) {
    if (gen && srv && gen !== srv) s = s.split(gen).join(srv);
  }
  return JSON.parse(s);
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), " ", ...a); // timestamped — enables per-phase timing analysis of an apply

// bounded-concurrency map: apply phases are dominated by API round-trips on INDEPENDENT artifacts —
// measured on the P2P build (2026-07-03): shells 9s, bodies 14s, permissions 35s, all serial.
// Runs fn over items with at most `limit` in flight, preserving result order.
async function pMap(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Two-pass live apply of an IR. Returns a report.
 * Pass 1: create app + all flow shells (lists, forms/processes) WITH app-association → server ids.
 * Pass 2: per flow, GET starter draft, graft remapped blob (refs → server ids), PUT draft, publish.
 * Then read-after-write verify via explore.
 */
export async function applyIR(ir, opts = {}) {
  const c = clientFromEnv();
  const acc = c.acc;
  const { artifacts } = buildApp(ir);
  const report = { app: null, created: [], published: [], roles: [], errors: [], verified: {} };

  // RESUME CHECKPOINT — a re-invoked apply (e.g. after a bash-timeout kill in Cowork) loads this and
  // SKIPS work already done instead of re-publishing. Written incrementally via persist() below.
  // opts.stateFile is set by the CLI to runs/<>/apply-state.json (dir of the IR).
  const stateFile = opts.stateFile;
  const ckpt =
    stateFile && existsSync(stateFile)
      ? (() => { try { return JSON.parse(readFileSync(stateFile, "utf8")); } catch { return {}; } })()
      : {};
  const published = new Set(ckpt.published || []);
  const listItemsDone = new Set(ckpt.listItemsDone || []);
  const caseflowDone = new Set(ckpt.caseflowDone || []);
  const membersDone = new Set(ckpt.membersDone || []);

  // app — create new, OR reuse an existing app for an INCREMENTAL apply (add pages/permissions/nav
  // onto an already-built app). Reuse mode takes a caller-supplied genToServer so it never depends on
  // the ambiguous account-wide explore (which can't tell two same-named flows from different apps apart).
  const appName = ir.app?.name || "Untitled App";
  const POLL = { timeoutMs: 120000, intervalMs: 3000 };
  let appId;
  let appIsInDev = false;
  if (opts.reuse?.appId || ckpt.appId) {
    appId = opts.reuse?.appId || ckpt.appId; report.app = appId; report.reused = true;
    appIsInDev = ckpt.appInDev ?? true;
    log(`reuse app ${appId}${ckpt.appId && !opts.reuse?.appId ? " (checkpoint)" : ""}`);
    // Resumed after a prod-create that never confirmed dev replication → wait for it now.
    if (ckpt.appId && !opts.reuse?.appId && !ckpt.appInDev) {
      if (!(await waitForAppInDev(c, appId, POLL))) { report.errors.push(`app ${appId} did not replicate to dev within ${POLL.timeoutMs}ms`); return report; }
      appIsInDev = true;
    }
  } else {
    // APP CREATION is triggered against PROD; Kissflow replicates it to dev with the SAME _id. Only
    // the shell is born in prod — every flow/page/role below is built in dev (the client `c`).
    const prod = maybeProdClient();
    if (prod) {
      const ra = await prod.createApp(appName, ir.app?.description || "");
      if (ra.status >= 300 || !ra.body?._id) { report.errors.push(`prod app create failed: ${ra.status}`); return report; }
      appId = ra.body._id; report.app = appId; report.appCreatedInProd = true;
      log(`app ${appId} created in prod (${prod.base}) — awaiting dev replication`);
      // Checkpoint the id BEFORE the wait so a crash mid-replication resumes without re-creating in prod.
      if (stateFile) { try { writeFileSync(stateFile + ".tmp", JSON.stringify({ appId, appInDev: false })); renameSync(stateFile + ".tmp", stateFile); } catch { /* best-effort */ } }
      if (!(await waitForAppInDev(c, appId, POLL))) { report.errors.push(`app ${appId} did not replicate to dev within ${POLL.timeoutMs}ms`); return report; }
      appIsInDev = true; log(`app ${appId} present in dev`);
    } else {
      // No prod creds → single-account mode: create directly in the configured (dev) account.
      console.warn("no PROD creds (KISSFLOW_PROD_*/KF_PROD_*) set — creating the app in the current account, skipping the prod-first replication flow");
      const ra = await c.createApp(appName, ir.app?.description || "");
      if (ra.status >= 300 || !ra.body?._id) { report.errors.push(`app create failed: ${ra.status}`); return report; }
      appId = ra.body._id; report.app = appId; appIsInDev = true; log(`app ${appId}`);
    }
  }

  // roles — REUSE existing app roles by name (every app ships default Admin + User; don't dup them)
  const existingRoles = await c.call("GET", `/app_role/2/${acc}/list?_application_id=${appId}`);
  const roleByName = {};
  for (const er of (Array.isArray(existingRoles.body) ? existingRoles.body : (existingRoles.body?.Data || []))) roleByName[er.Name] = er._id;
  for (const r of artifacts.filter((a) => a.type === "role")) {
    if (roleByName[r.doc.Name]) { report.roles.push({ name: r.doc.Name, status: 200, id: roleByName[r.doc.Name], reused: true }); log(`role ${r.doc.Name} → reused`); continue; }
    const rr = await c.createRole(r.doc.Name, appId);
    report.roles.push({ name: r.doc.Name, status: rr.status, id: rr.body?._id });
    log(`role ${r.doc.Name} → ${rr.status}`);
  }

  // Seed the remap with ROLE ids: workflow step assignees (Resource.Value) and permission entities
  // use generated role ids (eid("Ro", name)); remap them to the real server role ids.
  const genToServer = {}; const flowMeta = []; const liveIds = new Set();
  for (const r of report.roles) if (r.id) genToServer[eid("Ro", r.name)] = r.id;
  // ALSO map the IR-PROVIDED role ids (kf-architect assigns e.g. "role-dept-head") → server id, by
  // name. buildApp puts `r.id || eid("Ro",name)` into workflow-step assignees (Resource.Value); when
  // the IR carries explicit role ids, ONLY this form appears there, and without this mapping it never
  // remaps → published process has an unresolvable assignee → 400 "no assignee for next step"
  // (hire-onboarding 2026-07-05: all 6 process journeys dead at step 2).
  {
    const serverRoleByName = {}; for (const r of report.roles) if (r.id) serverRoleByName[r.name] = r.id;
    for (const r of ir.roles || []) if (r.id && serverRoleByName[r.name] && r.id !== serverRoleByName[r.name]) genToServer[r.id] = serverRoleByName[r.name];
  }
  // RESUME: seed created-flow ids from the checkpoint so PASS 1 skips re-creating them (and the body
  // pass skips ones already in `published`). pageServerByName is declared here (used by both the page
  // pass and persist()). persist() atomically snapshots progress (temp+rename → safe under pMap).
  Object.assign(genToServer, ckpt.genToServer || {});
  for (const v of Object.values(ckpt.genToServer || {})) liveIds.add(v);
  const pageServerByName = { ...(ckpt.pageServerByName || {}), ...(opts.reuse?.pageServerByName || {}) };
  const persist = () => {
    if (!stateFile) return;
    try {
      writeFileSync(stateFile + ".tmp", JSON.stringify({ appId, appInDev: appIsInDev, genToServer, pageServerByName, published: [...published], listItemsDone: [...listItemsDone], caseflowDone: [...caseflowDone], membersDone: [...membersDone], appPublished: report.appPublished || false }));
      renameSync(stateFile + ".tmp", stateFile);
    } catch { /* checkpoint is best-effort — never break apply */ }
  };
  if (opts.reuse?.genToServer) {
    // INCREMENTAL: flows already exist — use the supplied gen→server map (never the ambiguous explore).
    Object.assign(genToServer, opts.reuse.genToServer);
    for (const v of Object.values(opts.reuse.genToServer)) liveIds.add(v);
    log(`reuse: ${Object.keys(opts.reuse.genToServer).length} flow ids from map (skip flow create + body push)`);
  } else {
  // account-wide flow ids (so a colliding/global list e.g. "Currency" can be reused, and
  // cross-refs validated against what actually exists)
  const ex0 = await c.explore();
  const accountFlows = Array.isArray(ex0.body) ? ex0.body : [];
  const idByName = new Map(accountFlows.map((f) => [f.Name, f._id]));
  for (const f of accountFlows) liveIds.add(f._id);

  // PASS 1 — create shells for lists + flows, capturing server ids (reuse/prefix on name collision).
  const appPrefix = (ir.app?.name || "App").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  const accept = (a, serverId, note) => { genToServer[a.id] = serverId; liveIds.add(serverId); report.created.push({ type: a.type, gen: a.id, server: serverId, ...(note || {}) }); if (a.blob) flowMeta.push({ type: a.type, gen: a.id, server: serverId }); };
  await pMap(artifacts.filter((x) => ["list", "form", "process", "case"].includes(x.type)), 5, async (a) => {
    const name = a.shell?.Name || a.doc?.Name || a.id;
    if (genToServer[a.id]) { // created in a prior run (checkpoint) — skip the API call, still register
      liveIds.add(genToServer[a.id]);
      if (a.blob) flowMeta.push({ type: a.type, gen: a.id, server: genToServer[a.id] });
      log(`shell ${a.type} ${a.id} → ${genToServer[a.id]} (checkpoint, skip create)`);
      return;
    }
    const cr = await c.createFlow(a.type, name, appId, a.shell?.Description || "");
    let serverId = cr.body?._id;
    if (cr.status >= 300 || !serverId) {
      if (cr.body?.type === "FlowNameAlreadyExists" && idByName.has(name)) {
        accept(a, idByName.get(name), { reused: true });
        log(`shell ${a.type} ${a.id} → ${idByName.get(name)} (reused existing)`);
        return;
      }
      // account-global name (e.g. "Currency", "Project") we don't own — retry app-scoped/prefixed so
      // it's a NEW flow of ours; refs resolve via gen→server, so only the display Name changes.
      if (cr.body?.type === "FlowNameAlreadyExists") {
        const alt = `${appPrefix} ${name}`.slice(0, 60);
        const cr2 = await c.createFlow(a.type, alt, appId, a.shell?.Description || "");
        if (cr2.status < 300 && cr2.body?._id) {
          accept(a, cr2.body._id, { renamed: alt });
          log(`shell ${a.type} ${a.id} → ${cr2.body._id} (renamed "${alt}" — global name "${name}" was taken)`);
          return;
        }
      }
      report.errors.push(`${a.type} ${a.id} create failed: ${cr.status} ${JSON.stringify(cr.body).slice(0, 80)}`);
      return;
    }
    accept(a, serverId);
    log(`shell ${a.type} ${a.id} → ${serverId}`);
  });
  persist(); // checkpoint: shells created

  // PASS 1b — list items: lists are created as shells in PASS 1 but carry no blob (skipped by the
  // body pass). Their option values live in the artifact `.doc.ListItems` and must be saved via the
  // runtime save-items handler, or every Select backed by the list is empty (required Selects then
  // become unsatisfiable — no record can be created, even by a real user in the Kissflow UI).
  for (const a of artifacts.filter((x) => x.type === "list")) {
    const server = genToServer[a.id];
    const items = a.doc?.ListItems || a.shell?.ListItems;
    if (!server || !Array.isArray(items) || !items.length) continue;
    if (listItemsDone.has(server)) continue; // checkpoint: already saved
    const li = await c.putListItems(server, items);
    if (li.status < 300) { report.listItems = report.listItems || []; report.listItems.push({ id: server, count: items.length }); listItemsDone.add(server); }
    else report.errors.push(`list items ${server}: ${li.status} ${JSON.stringify(li.body).slice(0, 120)}`);
    log(`list-items ${server} → ${li.status} (${items.length})`);
  }
  persist(); // checkpoint: list items saved

  // PASS 2 — bodies: graft remapped blob onto the server starter draft, then publish.
  // Parallel (4-wide): flows are independent; genToServer/liveIds are complete after the PASS-1 barrier.
  await pMap(flowMeta, 4, async (fm) => {
    if (published.has(fm.server)) { log(`body ${fm.server} → skip (published, checkpoint)`); return; }
    const my = artifacts.find((x) => x.id === fm.gen);
    const starter = await c.getDraft(fm.type, fm.server);
    if (starter.status >= 300) { report.errors.push(`getDraft ${fm.server} → ${starter.status}`); return; }
    const remapped = remap(my.blob, genToServer);
    const merged = { ...starter.body };
    for (const [k, v] of Object.entries(remapped)) {
      if (k === "Root") continue;
      merged[k] = k === fm.server ? { ...starter.body[fm.server], ...v, Id: fm.server } : v;
    }
    merged.Root = fm.server;
    // VALIDATE BEFORE PUBLISH — turn the opaque 500 into a legible diagnostic
    const within = blobErrors(validateBlob({ label: fm.server, blob: merged }));
    const dangling = crossRefs(merged).filter((r) => !liveIds.has(r));
    if (within.length || dangling.length) {
      report.errors.push(`${fm.server}: not published — ${within.map((i) => i.code).join(",")}${dangling.length ? " dangling cross-ref(s): " + dangling.join(", ") : ""}`);
      log(`body ${fm.server} → SKIPPED (invalid: ${within.length} structural, ${dangling.length} dangling refs: ${dangling.join(",")})`);
      return;
    }
    const pd = await c.putDraft(fm.type, fm.server, merged);
    const pub = pd.status < 300 ? await c.publish(fm.type, fm.server) : { status: -1 };
    if (pub.status < 300) { report.published.push(fm.server); published.add(fm.server); persist(); }
    else report.errors.push(`${fm.type} ${fm.server}: draft=${pd.status} publish=${pub.status} ${JSON.stringify(pd.status >= 300 ? pd.body : pub.body).slice(0, 300)}`);
    log(`body ${fm.server} → draft ${pd.status}, publish ${pub.status}`);
  });
  persist(); // checkpoint: bodies published

  // PASS 2.5 — CASEFLOW STATUSES for board flows. buildBoard emits a separate `caseflow` artifact
  // (the designed lifecycle statuses); the case's model publish above does NOT carry them, so without
  // this the board keeps the default New/In-progress/Closed and every designed status is unreachable
  // (hire-onboarding 2026-07-05: all 6 board journeys blocked). Swap statuses on the case's caseflow
  // draft, mirroring applyBoardLive. Runs after the model is published (statuses reference the model).
  for (const cf of artifacts.filter((a) => a.type === "caseflow")) {
    const caseServer = genToServer[cf.parentModel];
    if (!caseServer) { report.errors.push(`caseflow ${cf.id}: parent case ${cf.parentModel} not created`); continue; }
    if (caseflowDone.has(caseServer)) continue; // checkpoint: statuses already published
    const meta = await c.call("GET", `/flow/2/${acc}/case/${caseServer}?_application_id=${appId}`);
    const cfId = meta.body?._default_workflow_id;
    if (!cfId) { report.errors.push(`caseflow ${cf.id}: no _default_workflow_id on ${caseServer}`); continue; }
    const cfd = (await c.call("GET", `/metadata/2/${acc}/case/${caseServer}/caseflow/${cfId}/draft`)).body;
    if (!cfd?.Root) { report.errors.push(`caseflow ${caseServer}: draft unreadable`); continue; }
    const remapped = remap(cf.blob, genToServer);
    const scf = cfd[cfd.Root], mye = remapped[remapped.Root];
    for (const id of [...(scf["CaseFlow::Status"] || []), ...(scf["CaseFlow::State"] || [])]) delete cfd[id];
    for (const id of [...(mye["CaseFlow::Status"] || []), ...(mye["CaseFlow::State"] || [])]) cfd[id] = remapped[id];
    scf["CaseFlow::Status"] = mye["CaseFlow::Status"] || []; scf["CaseFlow::State"] = mye["CaseFlow::State"] || [];
    const pd = await c.call("PUT", `/metadata/2/${acc}/case/${caseServer}/caseflow/${cfId}/draft`, cfd);
    const pub = pd.status < 300 ? await c.call("POST", `/metadata/2/${acc}/case/${caseServer}/caseflow/${cfId}/publish`, {}) : { status: -1 };
    log(`caseflow ${caseServer} → statuses ${(mye["CaseFlow::Status"] || []).length}, draft ${pd.status}, publish ${pub.status}`);
    if (pub.status >= 300) report.errors.push(`caseflow ${caseServer}: draft=${pd.status} publish=${pub.status}`);
    else caseflowDone.add(caseServer);
  }
  persist(); // checkpoint: caseflow statuses
  } // end flow create/push (skipped in reuse mode)

  // PAGES + app finalize: create a page per IR page, set DefaultPage, publish the app so it's
  // end-user-runnable. (Page-graph content is a follow-up; shells make the app valid + visible.)
  let firstPage = null;
  // pageServerByName is declared earlier (seeded from checkpoint + reuse mode)
  for (const p of artifacts.filter((a) => a.type === "page")) {
    const pname = p.shell?.Name || p.id;
    let sid = pageServerByName[pname];
    if (sid) { firstPage = firstPage || sid; log(`page ${p.id} → ${sid} (exists, skip create + content)`); continue; }
    const pr = await c.call("POST", `/flow/2/${acc}/application/${appId}/page/`, { Name: pname });
    if (pr.status >= 300 || !pr.body?._id) { report.errors.push(`page ${p.id} create failed: ${pr.status}`); continue; }
    sid = pr.body._id; firstPage = firstPage || sid;
    pageServerByName[pname] = sid;
    report.created.push({ type: "page", gen: p.id, server: sid });
    // build + publish the page CONTENT via Kissflow's REAL transformer (page_transform.py).
    // Flow refs in the intermediate are gen ids → remap to server ids before transforming.
    if (p.intermediate) {
      const pbase = `/metadata/2/${acc}/application/${appId}/page/${sid}`; // page metadata is APP-SCOPED
      const inter = remap(p.intermediate, genToServer);
      const meta = transformPageReal(inter, appId, sid, log);
      if (!meta) { report.errors.push(`page ${sid}: transformer failed`); log(`page ${p.id} → ${sid}, transformer FAILED`); continue; }
      const pd = await c.call("PUT", `${pbase}/draft`, meta);
      const pub = pd.status < 300 ? await c.call("POST", `${pbase}/publish`, {}) : { status: -1 };
      if (pub.status < 300) report.published.push(sid);
      else report.errors.push(`page ${sid}: content draft=${pd.status} publish=${pub.status} ${JSON.stringify(pd.body).slice(0, 80)}`);
      log(`page ${p.id} → ${sid}, content draft ${pd.status}, publish ${pub.status}`);
    }
  }
  persist(); // checkpoint: pages created
  if (firstPage && !opts.reuse && !ckpt.appPublished) {
    const am = await c.call("GET", `/metadata/2/${acc}/application/${appId}/draft`);
    if (am.status < 300 && am.body?.Root) {
      am.body[am.body.Root].DefaultPage = firstPage;
      await c.call("PUT", `/metadata/2/${acc}/application/${appId}/draft`, am.body);
      const ap = await c.call("POST", `/metadata/2/${acc}/application/${appId}/publish`, {});
      report.appPublished = ap.status < 300;
      log(`app finalize: DefaultPage=${firstPage}, publish ${ap.status}`);
      persist();
    }
  } else if (ckpt.appPublished) { report.appPublished = true; }
  // ROLE MAPPING — grant each role member access to its mapped flows (the flow's `member` list).
  // member = {_id, Name, Kind:"AppRole", Role:"Member", Permission}. Process flows get
  // InitiateItems+Delete (can raise + manage requests); forms get Delete (full access).
  const roleIdByName = {};
  for (const r of report.roles) if (r.id) roleIdByName[r.name] = r.id;
  // Case AND Board classify as the "case" family server-side (Board is a Case flow with a Kanban
   // view). Missing "Board" here → grants POST to /form/… → 404, and the board renders with zero
   // members (hire-onboarding 2026-07-05). Boards additionally need Permission:[] (Delete rejected).
  const fam = (t) => (t === "Process" ? "process" : (t === "Case" || t === "Board") ? "case" : "form");
  report.members = [];
  // report lists were re-fetched for EVERY role×flow pair (measured: 3× per flow on P2P) — cache per flow
  const reportListCache = new Map();
  const reportsOf = async (fam2, serverFlow) => {
    if (!reportListCache.has(serverFlow)) {
      const r = await c.call("GET", `/flow/2/${acc}/${fam2}/${serverFlow}/report?_application_id=${appId}`);
      reportListCache.set(serverFlow, Array.isArray(r.body) ? r.body : []);
    }
    return reportListCache.get(serverFlow);
  };
  await pMap(ir.permissions || [], 5, async (perm) => {
    const permKey = `${perm.role}|${perm.model}`;
    if (membersDone.has(permKey)) return; // checkpoint: already granted
    const roleId = roleIdByName[perm.role];
    const fSpec = (ir.forms || []).find((f) => (f.id || f.name) === perm.model);
    const serverFlow = fSpec && genToServer[fSpec.id || `${slug(fSpec.name)}_A00`];
    if (!roleId || !serverFlow) return;
    const ft = fSpec.flowType || "Form";
    // member object MUST carry _application_id in the body (not just the query param), and Role is
    // Member (edit) or Viewer (read). Valid permissions by flow type: Process → InitiateItems|View;
    // Form → Delete|View.
    const editable = (perm.level || "Editable") !== "ReadOnly";
    // Case/Board owner (sole mover / coordinator) → Admin; see flowGrant + security slice intent.
    const admin = /admin|owner|sole mover|coordinat/i.test(perm.intent || "");
    // What makes a table/list COMPONENT render data is the flow's REPORT access, granted below.
    const g = flowGrant(ft, { editable, admin });
    const member = { _id: roleId, Name: perm.role, _application_id: appId, Role: g.role, Permission: g.permission, Kind: "AppRole" };
    const m = await c.call("POST", `/flow/2/${acc}/${g.family}/${serverFlow}/member/batch?_application_id=${appId}`, [member]);
    report.members.push({ role: perm.role, model: perm.model, status: m.status });
    log(`access ${perm.role} → ${perm.model} (${g.family}) ${m.status}`);
    // REPORT "View report" access — THIS is what makes a table/list component render data.
    // Verified from the UI: Role:Member, Permission:["View"] (= "View report"; [] = No access,
    // "ManageReports" → UnsupportedPermissionError). Reports accept Role "Member"/"Admin" only.
    for (const rep of await reportsOf(g.family, serverFlow)) {
      const rm = await c.call("POST", `/flow/2/${acc}/${g.family}/${serverFlow}/report/${rep._id}/member/batch?_application_id=${appId}`,
        [{ _id: roleId, Name: perm.role, _application_id: appId, Role: "Member", Permission: ["View"], Kind: "AppRole" }]);
      if (rm.status < 300) log(`  report ${rep.Name} → ${perm.role} View report`);
    }
    membersDone.add(permKey); persist();
  });
  persist(); // checkpoint: permissions granted

  // NAV + ROLE PREFERENCE — the trifecta that makes a role actually see its app. Without the
  // role's Preference{DefaultPage,DefaultNavigation} the role renders BLANK regardless of access.
  // Build nav LAST (creating pages regenerates the app nav and wipes custom VisibleTo).
  if (Object.keys(pageServerByName).length) {
    // PAGE-DRIVEN ACCESS — grant each page's role access to EVERY flow its components reference,
    // not just what the IR permissions list (a dashboard often shows a flow the role wasn't
    // explicitly granted, e.g. an Admin console showing the PO process → else "no access to
    // this component"). Process → Member[InitiateItems,View]; Form → Member[Delete]; + reports.
    const flowServerByName = {};
    for (const f of ir.forms || []) { const sid = genToServer[f.id || `${slug(f.name)}_A00`]; if (sid) flowServerByName[f.name] = { id: sid, type: f.flowType || "Form" }; }
    const pageByName = {}; for (const p of ir.pages || []) pageByName[p.name] = p;
    const flowsOf = (pn) => [...new Set((pageByName[pn]?.cards || []).map((c2) => c2.source_flow).filter(Boolean))];
    // (role → flows) access pairs: a role needs access to every flow on a page it can SEE — that's
    // its own dashboard (page.role) AND every nav sub-menu it's VisibleTo (process-organized nav).
    const want = [];
    for (const p of ir.pages || []) if (p.role) want.push({ role: p.role, flows: flowsOf(p.name) });
    for (const m of (ir.nav?.menus) || []) for (const sub of m.submenus || []) for (const r of (sub.visibleTo || sub.roles || [])) want.push({ role: r, flows: flowsOf(sub.page) });
    const doneAcc = new Set();
    for (const w of want) {
      const role = roleIdByName[w.role]; if (!role) continue;
      for (const fn of w.flows) {
        const f = flowServerByName[fn]; if (!f) continue;
        const key = role + "::" + f.id; if (doneAcc.has(key)) continue; doneAcc.add(key);
        const fCase = f.type === "Case" || f.type === "Board";
        const fm = f.type === "Process" ? "process" : fCase ? "case" : "form";
        const perms = (f.type === "Process" || fCase) ? [] : ["Delete"]; // Process Initiate/Case member=[] ; Form edit=["Delete"]
        await c.call("POST", `/flow/2/${acc}/${fm}/${f.id}/member/batch?_application_id=${appId}`, [{ _id: role, Name: w.role, _application_id: appId, Role: "Member", Permission: perms, Kind: "AppRole" }]);
        // report "View report" (Permission:["View"]) — required for the page's table to show data
        const reps = await c.call("GET", `/flow/2/${acc}/${fm}/${f.id}/report?_application_id=${appId}`);
        for (const rep of (Array.isArray(reps.body) ? reps.body : [])) await c.call("POST", `/flow/2/${acc}/${fm}/${f.id}/report/${rep._id}/member/batch?_application_id=${appId}`, [{ _id: role, Name: w.role, _application_id: appId, Role: "Member", Permission: ["View"], Kind: "AppRole" }]);
      }
    }
    const am = await c.call("GET", `/metadata/2/${acc}/application/${appId}/draft`);
    const b = am.body;
    if (am.status < 300 && b?.Root) {
      const nav = Object.values(b).find((e) => e && e.Kind === "Navigation");
      const menu = Object.values(b).find((e) => e && e.Kind === "Menu");
      if (nav && menu) {
        // clear ALL existing menus + submenus, then rebuild fresh
        for (const sm of Object.values(b).filter((e) => e && e.Kind === "SubMenu")) {
          for (const fid of sm["SubMenu::FieldMapping"] || []) { for (const pid of b[fid]?.["FieldMapping::Property"] || []) delete b[pid]; delete b[fid]; }
          delete b[sm.Id];
        }
        for (const me of Object.values(b).filter((e) => e && e.Kind === "Menu" && e.Id !== menu.Id)) delete b[me.Id];
        let n = 0, mc = 0;
        const addSub = (menuEnt, name, pageName, roles) => {
          const page = pageServerByName[pageName]; if (!page) return false;
          const smId = `SubMenu_kfa${++n}`, fmId = `FieldMapping_kfa${n}`, prId = `Property_kfa${n}`;
          b[smId] = { Id: smId, Kind: "SubMenu", Name: name, Menu: menuEnt.Id, VisibleTo: roles, "SubMenu::FieldMapping": [fmId] };
          b[fmId] = { Id: fmId, Kind: "FieldMapping", Name: "Page", SubMenu: smId, "FieldMapping::Property": [prId] };
          b[prId] = { Id: prId, Kind: "Property", Type: "Page", Value: page, FieldMapping: fmId };
          menuEnt["Menu::SubMenu"].push(smId);
          return true;
        };
        if (ir.nav && Array.isArray(ir.nav.menus) && ir.nav.menus.length) {
          // PROCESS-ORGANIZED nav: a Menu per ir.nav.menus entry → sub-menus (My Requests/Approvals)
          const menuIds = [];
          for (const mSpec of ir.nav.menus) {
            const menuId = mc === 0 ? menu.Id : `Menu_kfa${mc}`;
            const mEnt = mc === 0 ? menu : { Id: menuId, Kind: "Menu", Navigation: nav.Id }; mc++;
            mEnt.Name = mSpec.name; mEnt["Menu::SubMenu"] = []; b[menuId] = mEnt;
            const seen = new Set();
            for (const sub of mSpec.submenus || []) {
              const roles = [...new Set((sub.visibleTo || sub.roles || []).map((r) => roleIdByName[r]).filter(Boolean))];
              if (addSub(mEnt, sub.name, sub.page, roles)) roles.forEach((r) => seen.add(r));
            }
            mEnt.VisibleTo = [...seen];
            if (mEnt["Menu::SubMenu"].length) menuIds.push(menuId);
          }
          nav["Navigation::Menu"] = menuIds;
        } else {
          // fallback: one menu, a submenu per role dashboard
          menu.Name = menu.Name || "Home"; menu["Menu::SubMenu"] = []; menu.VisibleTo = Object.values(roleIdByName);
          for (const irPage of ir.pages || []) { const role = roleIdByName[irPage.role]; if (role) addSub(menu, irPage.name, irPage.name, [role]); }
          nav["Navigation::Menu"] = [menu.Id];
        }
        const nd = await c.call("PUT", `/metadata/2/${acc}/application/${appId}/draft`, b);
        const np = nd.status < 300 ? await c.call("POST", `/metadata/2/${acc}/application/${appId}/publish`, {}) : { status: -1 };
        log(`nav: ${(nav["Navigation::Menu"] || []).length} menus / ${n} sub-menus, draft ${nd.status} publish ${np.status}`);
        // role Preference{DefaultPage, DefaultNavigation} — DefaultPage = the role's landing dashboard
        // (a page flagged `landing`/`dashboard` for this role, else any page for it).
        report.preferences = [];
        for (const [roleName, roleId] of Object.entries(roleIdByName)) {
          const landing = (ir.pages || []).find((p) => p.role === roleName && (p.landing || p.dashboard)) || (ir.pages || []).find((p) => p.role === roleName);
          const page = landing && pageServerByName[landing.name];
          if (!page) continue;
          const pf = await c.call("PUT", `/app_role/2/${acc}/${roleId}?_application_id=${appId}`,
            { Name: roleName, Preference: { DefaultPage: page, DefaultNavigation: nav.Id }, _application_id: appId });
          report.preferences.push({ role: roleName, page: landing.name, status: pf.status });
          log(`role pref ${roleName} → home ${landing.name} ${pf.status}`);
        }
      }
    }
  }

  // FLOW-STITCH AUTOMATIONS — CREATED live (draft-mapped + published) but NEVER activated.
  // Verified npd-plm 2026-07-03: create + trigger/action wiring + best-effort field maps + publish all
  // work with a standard public API key via applyIntegrationResolved; ONLY the on/off toggle and
  // email-connection provisioning need Integration-Admin. Unmappable bindings (e.g. email To/Subject/
  // Body) are reported and finished in the builder; every integration ships IsActive:false — an admin
  // reviews the mapping (INT-C1 ._id subpaths) and turns it on. Idempotent: existing names are skipped.
  const autos = artifacts.filter((a) => a.type === "integration");
  if (autos.length) {
    const { resolveConnectors, resolveConnections, applyIntegrationResolved } = await import("./integrations.mjs");
    let ictx = null;
    try {
      const connectors = await resolveConnectors(c, acc);
      let connections;
      try { connections = await resolveConnections(c, acc); } catch { /* connection-read may need Integration-Admin */ }
      const flows = {};
      for (const f of ir.forms || []) {
        const key = f.id || f.name;
        const server = genToServer[key] || genToServer[`${slug(f.name)}_A00`];
        if (!server) continue;
        flows[key] = { id: server, display: f.name, fields: (f.fields || []).map((x) => ({ id: x.id || slug(x.name), name: x.name, type: x.type })) };
      }
      // flowTypeOf: resolveSkeleton keys the CONNECTOR off the flow's type (Board/Case → Kissflow Board
      // connector, Process → Kissflow Process). Without it everything defaulted to Process — a create into
      // a Board target would wire CreateAndSubmitItem on the WRONG connector (hire-onboarding AR-8, 2026-07-05).
      const flowTypeOf = (ref) => { const f = (ir.forms || []).find((x) => (x.id || x.name) === ref || x.name === ref || x.id === ref); return f?.flowType || "Process"; };
      ictx = { flows, connectors, flowTypeOf, connections: connections && Object.keys(connections).some((k) => !k.startsWith("_")) ? connections : undefined };
    } catch (e) { log(`automations: connector resolution failed (${String(e.message || e).slice(0, 80)}) — all deferred to builder`); }
    const existing = await c.call("GET", `/flow/2/${acc}/integration?_application_id=${appId}`);
    const existingByName = new Map((Array.isArray(existing.body) ? existing.body : existing.body?.Data || []).map((i) => [i.Name, i._id]));
    report.automations = [];
    for (const a of autos) {
      const name = a.shell?.Name;
      if (existingByName.has(name)) { report.automations.push({ name, id: existingByName.get(name), status: "exists" }); log(`automation ${name} → ${existingByName.get(name)} (already exists — skipped)`); continue; }
      if (!ictx) { report.automations.push({ name, status: "deferred" }); continue; }
      const rep = await applyIntegrationResolved(c, acc, appId, a.automation, ictx);
      const ok = (rep.steps?.publish || 500) < 300;
      report.automations.push({ name, id: rep.id, status: ok ? "created (inactive)" : "partial", steps: rep.steps, unresolved: rep.unresolved });
      log(`automation ${name} → ${rep.id || "?"} ${ok ? "created+published, IsActive:false — review mapping & turn on in builder" : "PARTIAL " + JSON.stringify(rep.steps)}${rep.unresolved ? " · deferred mappings: " + rep.unresolved.join(", ") : ""}`);
    }
  }

  // READ-AFTER-WRITE verify via explore (create returns 200 even when it drops fields)
  const ex = await c.explore();
  if (Array.isArray(ex.body)) {
    const mine = ex.body.filter((f) => f._application_id === appId);
    report.verified = { nestedInApp: mine.length, flows: mine.map((f) => `${f._id}(${f.Status})`) };
  }
  return report;
}
