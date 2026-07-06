// board-live.mjs — LIVE multi-endpoint apply for Boards (Case flows) + embedding a Kanban on a Page.
// The pure entity-graph shapes come from builders.mjs (buildBoard, buildKanbanPage); this drives the live
// sequence. `client` is a clientFromEnv()-style object with `.call(method, path, body) -> {status, body}`.
// Every step + gotcha is documented in reference/BOARD-AND-KANBAN-PAGE.md and reference/PROCESS-VS-BOARD.md.
// App-agnostic.
import { buildBoard, buildKanbanPage } from "./builders.mjs";

// Grant the app's roles CASE MEMBERSHIP — REQUIRED, else the board's system views (incl. <caseId>_all) are
// hidden from the runtime and a page embed shows "board view not found". The Kissflow UI does this on build;
// the API does not. Roles from /app_role/list, batch-added as AppRole/Admin.
export async function grantCaseMembers(client, acc, appId, caseId, { role = "Admin" } = {}) {
  const r = await client.call("GET", `/app_role/2/${acc}/list?_application_id=${appId}`);
  const roles = Array.isArray(r.body) ? r.body : (r.body?.Data || []);
  const members = roles.filter((x) => x?._id).map((x) => ({ _id: x._id, Name: x.Name, Kind: "AppRole", Role: role, Permission: [] }));
  if (!members.length) return { status: "no-roles", added: 0 };
  const m = await client.call("POST", `/flow/2/${acc}/case/${caseId}/member/batch?_application_id=${appId}`, members);
  return { status: m.status, added: m.status < 300 ? members.length : 0 };
}

// Full live BOARD apply: case shell → form(model)+Appearance → steps(caseflow) → Kanban view → MEMBERS.
// boardSpec: { name, description?, prefix?, itemType?, viewName?, fields:[…], statuses:[{name,category}] }
// (same shape buildBoard takes). Returns a per-step status report incl. caseId/viewId. Never throws mid-way
// on a non-2xx — surfaces the status so the caller can inspect.
export async function applyBoardLive(client, acc, appId, boardSpec, idmap = {}, flowTypes = {}) {
  const rep = { name: boardSpec.name, steps: {} };
  const prefix = boardSpec.prefix || boardSpec.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "BRD";
  const cr = await client.call("POST", `/flow/2/${acc}/case/?_application_id=${appId}`, { Name: boardSpec.name, Description: boardSpec.description || "", Prefix: prefix, ItemType: boardSpec.itemType || "Item" });
  rep.steps.create = cr.status; const caseId = cr.body?._id; rep.caseId = caseId;
  if (cr.status >= 300 || !caseId) { rep.error = JSON.stringify(cr.body).slice(0, 160); return rep; }
  const cfId = (await client.call("GET", `/flow/2/${acc}/case/${caseId}?_application_id=${appId}`)).body?._default_workflow_id;
  rep.caseflowId = cfId;
  // idmap/flowTypes: without them Reference QDs and Select ReferredList ids stay UNRESOLVED gen ids
  // → the model publish 500s (opaque MetadataError; npd-plm dir 2026-07-03). Pass the app's map.
  const board = buildBoard({ ...boardSpec, id: caseId, flowType: "Case" }, appId, idmap, flowTypes);

  // FORM — graft fields (+ Model::Appearance) onto the server model draft
  const md = (await client.call("GET", `/metadata/2/${acc}/case/${caseId}/draft`)).body;
  const sm = md[md.Root], myM = board.blob[board.blob.Root];
  for (const [k, v] of Object.entries(board.blob)) { if (k === "Root" || v?.Kind === "Model") continue; md[k] = v; }
  sm["Model::Field"] = [...sm["Model::Field"], ...myM["Model::Field"]];
  sm["Model::Row"] = [...sm["Model::Row"], ...myM["Model::Row"]];
  sm["Model::Appearance"] = myM["Model::Appearance"];
  rep.steps.formPut = (await client.call("PUT", `/metadata/2/${acc}/case/${caseId}/draft`, md)).status;
  rep.steps.formPublish = (await client.call("POST", `/metadata/2/${acc}/case/${caseId}/publish`, {})).status;

  // STEPS — swap the caseflow Statuses/States for buildBoard's
  const cfd = (await client.call("GET", `/metadata/2/${acc}/case/${caseId}/caseflow/${cfId}/draft`)).body;
  const scf = cfd[cfd.Root], myCfe = board.caseflow.blob[board.caseflow.blob.Root];
  for (const id of [...(scf["CaseFlow::Status"] || []), ...(scf["CaseFlow::State"] || [])]) delete cfd[id];
  for (const id of [...myCfe["CaseFlow::Status"], ...myCfe["CaseFlow::State"]]) cfd[id] = board.caseflow.blob[id];
  scf["CaseFlow::Status"] = myCfe["CaseFlow::Status"]; scf["CaseFlow::State"] = myCfe["CaseFlow::State"];
  rep.steps.stepsPut = (await client.call("PUT", `/metadata/2/${acc}/case/${caseId}/caseflow/${cfId}/draft`, cfd)).status;
  rep.steps.stepsPublish = (await client.call("POST", `/metadata/2/${acc}/case/${caseId}/caseflow/${cfId}/publish`, {})).status;

  // KANBAN VIEW
  rep.steps.view = (await client.call("POST", `/flow/2/${acc}/case/${caseId}/caseview/`, { Name: boardSpec.viewName || boardSpec.name, ViewType: "Kanban" })).status;
  rep.viewId = `${caseId}_all`;

  // MEMBERS — the step that makes the board's views resolve in a page
  const gm = await grantCaseMembers(client, acc, appId, caseId);
  rep.steps.members = gm.added;
  return rep;
}

// Create a PAGE and embed the board's Kanban (+ default New-<Item> button). Uses buildKanbanPage.
// pageSpec: { name, caseId, viewId?, title?, subtitle?, itemLabel?, newButton? }
export async function applyKanbanPage(client, acc, appId, pageSpec) {
  const rep = { name: pageSpec.name, steps: {} };
  const pr = await client.call("POST", `/flow/2/${acc}/application/${appId}/page/`, { Name: pageSpec.name });
  rep.steps.create = pr.status; const pageId = pr.body?._id; rep.pageId = pageId;
  if (pr.status >= 300 || !pageId) { rep.error = JSON.stringify(pr.body).slice(0, 160); return rep; }
  const draft = (await client.call("GET", `/metadata/2/${acc}/application/${appId}/page/${pageId}/draft`)).body;
  const blob = buildKanbanPage({ title: pageSpec.name, ...pageSpec, pageId }, draft);
  const pd = await client.call("PUT", `/metadata/2/${acc}/application/${appId}/page/${pageId}/draft`, blob);
  rep.steps.put = pd.status; if (pd.status >= 300) rep.putBody = JSON.stringify(pd.body).slice(0, 160);
  rep.steps.publish = (await client.call("POST", `/metadata/2/${acc}/application/${appId}/page/${pageId}/publish`, {})).status;
  return rep;
}
