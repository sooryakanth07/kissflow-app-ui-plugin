// deploy-ui.mjs — deploy our built React bundle as an app's Application custom component and
// enable Custom UI, over access-key REST. Reuses clientFromEnv() from client.mjs (same auth +
// resilient call()). Zero dependencies — Node 18+ globals only (fetch/FormData/Blob) + node:fs.
//
// Two modes:
//   ZIP mode  (default): the programmatic zip upload leg is NOT wired (no confirmed upload API) — it
//              FAILS FAST with an actionable message telling you to use --url mode or upload the zip
//              manually in App Builder → Settings → Custom UI. The create/reuse-component step still
//              runs. Set DEPLOY_UI_FORCE_ZIP=1 to still ATTEMPT the experimental (unverified) upload.
//   --url mode (SIMPLE, certain): point the component manifest at a dev URL (scripts.web + Source:"Url"),
//              publish {Source:"Url"}, delete stale, set the flag. No blob upload. Reliable, recommended.
//
// Frontend references mirrored (READ-ONLY):
//   application/web/src/service/index.js .......... exact endpoints (component/custom/*)
//   builder/settings/custom_ui/component.utils.ts . publishUrlComponent (URL mode end-to-end)
//   builder/settings/custom_ui/zip.upload.tsx ..... ensure/activate/delete-stale Application component
//   builder/custom_components/wizard/editor/zip.uploader.jsx . upload → trigger → poll status loop
//   builder/custom_components/helpers.js .......... updateScriptUrl (manifest scripts.web + Source)

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { clientFromEnv } from "./client.mjs";

const CATEGORY_APPLICATION = "Application"; // CUSTOM_COMPONENT_TYPES.APPLICATION
const FRAMEWORK_REACT = "React";
const SOURCE_ZIP = "Zip"; // COMPONENT_EDITOR_CONSTANTS.ZIP
const SOURCE_URL = "Url"; // COMPONENT_EDITOR_CONSTANTS.URL
const LAYOUT_WEB = "web"; // COMPONENT_MODAL_CONSTANTS.WEB.ID (manifest scripts.web target)
// upload/status Status values — COMPONENT_EDITOR_CONSTANTS.STATUS
const STATUS = { STARTED: "Started", INPROGRESS: "InProgress", COMPLETED: "Completed", FAILED: "Failed" };

const log = (...a) => console.log("  ", ...a);
// Any of the frontend's list responses can be a bare array OR {Data:[...]} — normalize.
const asList = (b) => (Array.isArray(b) ? b : Array.isArray(b?.Data) ? b.Data : []);

/**
 * Deploy the app's Application custom component.
 * @param {object} o
 * @param {string} o.appId
 * @param {string} [o.zipPath]  path to the built React zip (ZIP mode)
 * @param {string} [o.url]      dev URL (URL mode — no blob upload)
 * @param {string} [o.name]     component name (default "App custom UI bundle")
 * @returns {Promise<{componentId:string, mode:string, steps:object, warnings:string[]}>}
 */
export async function deployUI(o = {}) {
  const c = clientFromEnv();
  const acc = c.acc;
  const appId = o.appId;
  if (!appId) throw new Error("--app <appId> is required");
  const mode = o.url ? "url" : "zip";
  if (mode === "zip" && !o.zipPath) throw new Error("zip mode requires <zipPath> (or pass --url <devUrl>)");
  const name = o.name || "App custom UI bundle";
  const cbase = `/application/2/${acc}/${appId}/component/custom`; // component/custom base path
  const steps = {}; const warnings = [];

  // 1) LIST existing custom components, filter to Category:"Application".  (frontend: getCustomComponents
  //    → GET …/component/custom/list?Category=Application). We also accept the plain …/component/custom/
  //    collection endpoint as a fallback, then filter locally by Category.  [live-verified endpoint]
  log(`[1/6] list Application components`);
  let listed = await c.call("GET", `${cbase}/list?page_number=1&page_size=300&Category=${CATEGORY_APPLICATION}`);
  if (listed.status >= 300) listed = await c.call("GET", `${cbase}/`);
  if (listed.status >= 300) { log(`  list failed: ${listed.status} ${JSON.stringify(listed.body).slice(0, 200)}`); throw new Error(`list components failed: ${listed.status}`); }
  const apps = asList(listed.body).filter((x) => x?.Category === CATEGORY_APPLICATION);
  steps.list = { status: listed.status, found: apps.length };
  log(`  found ${apps.length} existing Application component(s)`);

  // 2) REUSE or CREATE.  Only one Application component is allowed per app — reuse its _id if present,
  //    else POST …/component/custom/ with {Name,Category:"Application",Framework:"React"}.  [live-verified]
  let componentId = apps[0]?._id;
  if (componentId) { steps.component = { status: "reused", id: componentId }; log(`[2/6] reuse component ${componentId}`); }
  else {
    log(`[2/6] create Application component "${name}"`);
    const cr = await c.call("POST", `${cbase}/`, { Name: name, Description: "", Category: CATEGORY_APPLICATION, Framework: FRAMEWORK_REACT, Layout: LAYOUT_WEB, _application_id: appId });
    componentId = cr.body?._id;
    if (cr.status >= 300 || !componentId) { log(`  create failed: ${cr.status} ${JSON.stringify(cr.body).slice(0, 200)}`); throw new Error(`create component failed: ${cr.status}`); }
    steps.component = { status: "created", id: componentId };
    log(`  created ${componentId}`);
  }

  // 3) SOURCE — either upload the zip (ZIP mode) or point the manifest at the dev URL (URL mode).
  if (mode === "url") { steps.source = await pointAtUrl(c, cbase, componentId, o.url); }
  else { steps.source = await uploadZip(c, cbase, componentId, o.zipPath, warnings); }

  // 4) PUBLISH the component to Live.  (frontend: publishComponent → POST …/{id}/publish {Source}).  [live-verified]
  log(`[4/6] publish component (Source:"${mode === "url" ? SOURCE_URL : SOURCE_ZIP}")`);
  const pub = await c.call("POST", `${cbase}/${componentId}/publish`, { Source: mode === "url" ? SOURCE_URL : SOURCE_ZIP });
  steps.publish = { status: pub.status };
  if (pub.status >= 300) { log(`  publish failed: ${pub.status} ${JSON.stringify(pub.body).slice(0, 200)}`); throw new Error(`publish failed: ${pub.status}`); }
  log(`  published ${pub.status}`);

  // 5) DELETE stale — re-list and remove any OTHER Application components so the runtime's live-list
  //    call finds exactly one.  (frontend: deleteStaleApplicationComponents).  [live-verified]
  log(`[5/6] delete stale Application components`);
  let relisted = await c.call("GET", `${cbase}/list?page_number=1&page_size=300&Category=${CATEGORY_APPLICATION}`);
  if (relisted.status >= 300) relisted = await c.call("GET", `${cbase}/`);
  const stale = asList(relisted.body).filter((x) => x?.Category === CATEGORY_APPLICATION && x._id !== componentId);
  steps.deleteStale = [];
  for (const s of stale) {
    const d = await c.call("DELETE", `${cbase}/${s._id}`);
    steps.deleteStale.push({ id: s._id, status: d.status });
    log(`  deleted ${s._id} → ${d.status}`);
  }
  if (!stale.length) log(`  none`);

  // 6) ENABLE Custom UI — set the app flag. (frontend updateApp → updateApplication("application",…) →
  //    PUT /flow/2/{acc}/application/{appId} {_is_custom_ui_enabled:true}).  [live-verified]
  log(`[6/6] enable Custom UI flag on app ${appId}`);
  const flag = await c.call("PUT", `/flow/2/${acc}/application/${appId}`, { _is_custom_ui_enabled: true });
  steps.enableFlag = { status: flag.status };
  if (flag.status >= 300) { warnings.push(`enable-flag failed: ${flag.status} ${JSON.stringify(flag.body).slice(0, 120)}`); log(`  flag failed: ${flag.status}`); }
  else log(`  Custom UI enabled ${flag.status}`);

  // The app's runtime URL — opening it lands on the custom UI (bare app root redirects to /ui).
  const appUrl = `${c.base}/view/application/${appId}`;
  return { componentId, mode, steps, warnings, appUrl };
}

// URL mode — SIMPLE + CERTAIN. Mirror publishUrlComponent + updateScriptUrl: read the draft manifest,
// set scripts.web = url, Source = "Url" (drop ZipFileName), save it back. Save endpoint mirrors the
// frontend's saveComponent (PUT …/component/custom/{id} {Manifest}); if that's rejected we fall back to
// the manifest/draft PUT. Publishing happens in the shared step 4.  [live-verified endpoints]
async function pointAtUrl(c, cbase, componentId, url) {
  log(`[3/6] point manifest at dev URL: ${url}`);
  const got = await c.call("GET", `${cbase}/${componentId}/manifest/draft`);
  if (got.status >= 300) { log(`  get manifest failed: ${got.status}`); throw new Error(`get manifest failed: ${got.status}`); }
  const manifest = got.body && typeof got.body === "object" ? { ...got.body } : {};
  const scripts = { ...(manifest.scripts || {}) };
  scripts.web = url;              // updateScriptUrl: newManifest[SCRIPTS][WEB] = scriptUrl
  delete scripts.ZipFileName;     // updateScriptUrl (URL source): drop ZipFileName
  manifest.scripts = scripts;
  manifest.Source = SOURCE_URL;   // updateScriptUrl: newManifest[SOURCE] = source
  // saveComponent shape first; manifest/draft PUT as fallback (some deployments accept only the latter).
  let saved = await c.call("PUT", `${cbase}/${componentId}`, { Manifest: manifest });
  if (saved.status >= 300) {
    log(`  saveComponent PUT ${saved.status} — falling back to manifest/draft PUT`);
    saved = await c.call("PUT", `${cbase}/${componentId}/manifest/draft`, manifest);
  }
  if (saved.status >= 300) { log(`  save manifest failed: ${saved.status} ${JSON.stringify(saved.body).slice(0, 200)}`); throw new Error(`save manifest failed: ${saved.status}`); }
  log(`  manifest updated ${saved.status} (scripts.web set, Source:"Url")`);
  return { status: saved.status, url };
}

// ZIP mode — the programmatic zip-upload endpoint is NOT confirmed against a live account and the
// best-effort guess 404s. By default we FAIL FAST with an actionable message (don't attempt the
// unproven upload). Set DEPLOY_UI_FORCE_ZIP=1 to still attempt the experimental upload below.
async function uploadZip(c, cbase, componentId, zipPath, warnings) {
  if (!process.env.DEPLOY_UI_FORCE_ZIP) {
    throw new Error(
      "Programmatic zip upload is not wired yet (no confirmed Kissflow upload API — the experimental " +
      "endpoint 404s). The Application custom component was created/reused" +
      (componentId ? ` (id ${componentId})` : "") + ", but the bundle was NOT uploaded. To deploy:\n" +
      "  1) RECOMMENDED — use --url mode: re-run with `--url <hosted-or-dev-URL>` to point Custom UI at\n" +
      "     a hosted/dev URL (fully implemented, reliable), OR\n" +
      "  2) Upload the zip MANUALLY in Kissflow: App Builder → Settings → Custom UI → upload the zip.\n" +
      "  (To attempt the experimental/unverified programmatic upload anyway, set DEPLOY_UI_FORCE_ZIP=1.)"
    );
  }
  log(`[3/6] upload zip (DEPLOY_UI_FORCE_ZIP — experimental/unverified): ${zipPath}`);
  const bytes = readFileSync(zipPath);
  const fileName = basename(zipPath);

  // TODO(live-verify): blob upload via access-key REST — mirror zip.uploader.jsx; verify endpoint +
  // payload against a live dev account. The browser flow uses the platform file-picker
  // (kfplatform/filePicker → validateEntireFiles) to push the bytes to a blob store keyed by
  // prefix `/{appId}/component/{componentId}`, THEN calls triggerComponentUpload(componentId, uploadedFiles)
  // with the picker's response, THEN polls getComponentUploadStatus. Over access-key REST there is no
  // picker, so we push the raw zip as multipart/form-data to the component's upload endpoint and pass
  // whatever it returns to the trigger. The upload URL + field name below are a best guess and MUST be
  // confirmed live (candidates: `${cbase}/${componentId}/upload`, `${cbase}/${componentId}/blob`,
  // or a platform `/files/2/...` presign+PUT). Fail loudly with the server message if it 4xx/5xx.
  const uploadPath = `${cbase}/${componentId}/upload`;
  let uploadResp = null;
  try {
    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type: "application/zip" }), fileName);
    const r = await fetch(c.base + uploadPath, {
      method: "POST",
      headers: {
        "X-Access-Key-Id": process.env.KISSFLOW_API_KEY || process.env.KF_ACCESS_KEY_ID,
        "X-Access-Key-Secret": process.env.KISSFLOW_API_SECRET || process.env.KF_ACCESS_KEY_SECRET,
        // NOTE: no Content-Type — fetch sets the multipart boundary for FormData automatically.
      },
      body: fd,
    });
    const text = await r.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
    log(`  upload POST ${uploadPath} → ${r.status}`);
    if (r.status >= 300) {
      const msg = typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300);
      log(`  upload FAILED: ${r.status} ${msg}`);
      throw new Error(`zip upload failed (TODO(live-verify) endpoint ${uploadPath}): ${r.status} ${msg}`);
    }
    uploadResp = body;
  } catch (e) {
    // Re-throw with the loud, actionable message (the endpoint is the unverified part).
    throw new Error(`zip upload leg failed — this is the TODO(live-verify) step. ${String(e?.message || e)}`);
  }

  // trigger the component to ingest the just-uploaded blob (frontend: triggerComponentUpload).  [endpoint confident]
  log(`  trigger ingest`);
  const trig = await c.call("POST", `${cbase}/${componentId}/trigger`, uploadResp);
  if (trig.status >= 300) {
    // frontend also has a /trigger/bundle variant — try it before giving up.
    log(`  /trigger ${trig.status} — trying /trigger/bundle`);
    const tb = await c.call("POST", `${cbase}/${componentId}/trigger/bundle`, uploadResp || {});
    if (tb.status >= 300) throw new Error(`trigger failed: ${trig.status}/${tb.status} ${JSON.stringify(tb.body).slice(0, 200)}`);
  }

  // poll upload/status until Completed / Failed (frontend polls every 3s).  [endpoint confident]
  log(`  poll upload/status`);
  const status = await pollUploadStatus(c, cbase, componentId, warnings);
  return { status: "uploaded", uploadPath, finalStatus: status };
}

async function pollUploadStatus(c, cbase, componentId, warnings, { intervalMs = 3000, maxTries = 40 } = {}) {
  for (let i = 0; i < maxTries; i++) {
    const r = await c.call("GET", `${cbase}/${componentId}/upload/status`);
    // 204 / empty body = no upload in progress (matches the frontend's isEmpty(data) check).
    const s = r.body && typeof r.body === "object" ? r.body.Status : undefined;
    if (s === STATUS.COMPLETED) { log(`  upload status: Completed`); return STATUS.COMPLETED; }
    if (s === STATUS.FAILED) {
      const msg = JSON.stringify(r.body).slice(0, 300);
      log(`  upload status: Failed — ${msg}`);
      throw new Error(`zip validation Failed: ${msg}`);
    }
    if (![STATUS.STARTED, STATUS.INPROGRESS].includes(s)) {
      // unknown/empty — record and stop rather than loop forever.
      warnings.push(`upload/status returned no recognized Status (got ${JSON.stringify(s)}); assuming done`);
      log(`  upload status: ${JSON.stringify(s)} (no in-progress marker — stopping poll)`);
      return s || "unknown";
    }
    log(`  upload status: ${s} — retry in ${intervalMs}ms (${i + 1}/${maxTries})`);
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  warnings.push("upload/status did not reach Completed within poll window");
  return "timeout";
}
