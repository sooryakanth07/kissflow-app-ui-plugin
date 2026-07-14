// Connector-based integration emitter — STUBS.
//
// Compiles an `ir.automations` flow-stitch into a real Kissflow Integration (connector-based
// Trigger + Action + FieldMapping/Property graph) and applies it via the metadata draft→publish
// flow. Everything here is SCAFFOLDING with explicit TODOs: the shapes/endpoints below are taken
// from the kissflow-xg source (connector fixtures + metadata/route/integration.py), but the
// account-specific connector-INSTANCE ids/versions must be discovered at runtime before this can
// produce a valid, turn-on-able integration.
//
// Authoring flow (verified against source + live):
//   1. POST  /flow/2/{acct}/integration?_application_id={app}                → create the record (200)
//   2. GET   /metadata/2/{acct}/integration/{id}/draft                        → fetch the draft blob (200)
//   3. PUT   /metadata/2/{acct}/integration/{id}/draft   {Model+Trigger+Action+FieldMapping/Property}
//   4. POST  /metadata/2/{acct}/integration/{id}/publish
//   5. PUT   /integration/2/{acct}/integration/{id}/on                        → turn on (INTERNAL auth; may need UI)
//   Rule: an integration needs exactly 1 Trigger + >=1 Action to turn on (InvalidIntegrationException).
//
// Draft blob shape (from fixture appstore/tests/mock/metadata/Draft_Integration_001_A00.json):
//   Root → Integration(Model) { "Integration::Trigger":[tId], "Integration::Action":[aId,...] }
//   Trigger { Kind:"Trigger", Type:"App", Name, Connector:{_id, Name, TriggerId, TriggerName, Version, Logo} }
//   Action  { Kind:"Action",  Type:"Create"|"Update", Name, Connector:{_id, Name, ActionId, ActionName, Version, Logo} }
//   FieldMapping { Kind:"FieldMapping", Type:"String"|"Object"|"Datetime", Name:<targetField>, FieldMapping?:<parentFmId> }
//   Property { Kind:"Property", Type:"Value", Name, FieldMapping:<fmId>, Value?:<sourceExpr> }

// ── CATALOG — Kissflow SYSTEM connectors ────────────────────────────────────────────────────────
// Trigger/Action ids below are the LIVE ones (Kissflow Process connector v3.7.5, verified via
// GET /connector/2/{acct}/{connectorId}/metadata/{version}). They are version-specific — prefer
// enriching from `fetchConnectorMeta()` at runtime; these are the fallbacks/most-used ids.
// The installed instance {_id, Version, Logo} is ACCOUNT-SPECIFIC → resolved by resolveConnectors().
export const CONNECTOR_CATALOG = {
  process: {
    match: /kissflow process/i,
    triggers: { created: "ItemCreated", submitted: "DraftItemSubmitted", completed: "ItemCompleted",
      advances: "ItemAdvancesToNextStep", rejected: "ItemRejected", withdrawn: "ItemWithdrawn",
      entersStep: "ItemEntersToStep", exitsStep: "ItemExitsToStep", sentBack: "ItemSentBack", slaBreached: "SlaBreached" },
    actions: { createSubmit: "CreateAndSubmitItem", update: "UpdateAnItem", approve: "Action_-SkflzwKj", search: "Action_Kh4Jb2AoG" },
  },
  dataset: { match: /kissflow dataset/i, triggers: {}, actions: {} },   // enrich via fetchConnectorMeta
  // Board (Case-flow) connector — live-verified ids (hire-onboarding AR-8, 2026-07-05): a board item
  // "created" fires ItemSubmitted (boards have no draft stage), status moves fire StatusUpdated, and
  // creating INTO a board is CreateItem (NOT the process CreateAndSubmitItem). Other ids unverified —
  // enrich via fetchConnectorMeta rather than guessing.
  board: { match: /kissflow board/i,
    triggers: { created: "ItemSubmitted", advances: "StatusUpdated", completed: "ItemCompleted" },
    actions: { create: "CreateItem" } },
  project: { match: /kissflow project/i, triggers: {}, actions: {} },
  webhook: { match: /webhook/i, triggers: { webhook: "WebhookTrigger" }, actions: {} },
  email: { match: /^email$/i, triggers: {}, actions: { send: "SendEmail" } },
  http: { match: /^http$/i, triggers: {}, actions: {} },
  scheduler: { match: /scheduler/i, triggers: {}, actions: {} },
};
// NOTE (this account): only Process/Dataset/Board/Project + Email/Webhook/HTTP/Scheduler are subscribed —
// there is NO Case or Dataform connector, so a create/update into a Form/Case target can't be wired here
// until that connector is subscribed. resolveConnectors() reflects what's actually installed.

// Trigger EVENTS map: automation `source.event` → the Process connector trigger key.
export const EVENT_TO_TRIGGER = { created: "created", submitted: "submitted", approved: "completed", completed: "completed", updated: "advances", rejected: "rejected" };

// Map a flowType → connector-catalog key.
export function connectorKeyFor(flowType) {
  const t = String(flowType || "Form").toLowerCase();
  if (t === "process") return "process";
  if (t === "dataset") return "dataset";
  if (t === "board") return "board";
  if (t === "case") return "case";     // no case connector installed on some accounts — resolveConnectors flags it
  return "dataform";                    // Form / Dataform — likewise may be unavailable
}

// ── resolve the account's installed connector INSTANCES (ids + versions + logos) — REAL ──────────
// GET /connector/2/{acct}/subscription → the account's available connectors. Returns a map keyed by
// catalog key: { process:{ _id, version, logo, name }, dataset:{…}, … }. `client` = clientFromEnv().
export async function resolveConnectors(client, acc) {
  const r = await client.call("GET", `/connector/2/${acc}/subscription`);
  if (r.status >= 300) throw new Error(`resolveConnectors: GET subscription → ${r.status}`);
  const list = Array.isArray(r.body) ? r.body : (r.body?.Data || r.body?.data || []);
  const out = {};
  for (const [key, def] of Object.entries(CONNECTOR_CATALOG)) {
    const c = list.find((x) => def.match.test(String(x.Name || "")));
    if (c) out[key] = { _id: c._id, version: c.VersionName || c.Version, logo: c.Logo, name: c.Name, triggerCount: c.TriggerCount, actionCount: c.ActionCount };
  }
  out._available = list.map((x) => x.Name);
  return out;
}

// Resolve the account's connector CONNECTIONS (required on every Trigger/Action).
// GET /integration/2/{acct}/connection → [{_id, Name, Connector/ConnectorId}]. Returns a map keyed by
// catalog key. NOTE: a connection must be PROVISIONED first (an account with none can't wire a Trigger/
// Action → "Insufficient arguments" on PUT draft). Connections may require the builder UI / auth to create.
export async function resolveConnections(client, acc) {
  const r = await client.call("GET", `/integration/2/${acc}/connection`);
  if (r.status >= 300) throw new Error(`resolveConnections → ${r.status}`);
  const list = Array.isArray(r.body) ? r.body : (r.body?.Data || r.body?.data || []);
  const out = { _count: list.length };
  for (const [key, def] of Object.entries(CONNECTOR_CATALOG)) {
    const c = list.find((x) => def.match.test(String(x.Name || x.Connector?.Name || "")));
    if (c) out[key] = { _id: c._id, Name: c.Name };
  }
  return out;
}

// Provision a SYSTEM-API-KEY connection for a connector. THE PLATFORM MINTS ITS OWN KEY server-side — no
// credential is ever supplied by the caller. This is exactly what the builder's "internal auth" step does
// behind the scenes, and it is the prerequisite an account with zero connections was missing.
//   POST /integration/2/{acct}/connection/{connectorId}/{version}/SystemApiKey  { Name }
// RBAC: UserType:User → a NORMAL public API key can call it (unlike LISTING/READING connections, which is
// Integration-Admin/MBAC and returns 403 — that mismatch is why `/connection` listed 0 yet the wall existed).
// Server flow (kissflow-xg connection_service): create_system_api_key_connection → session.create_system_api_key
// ({Type:SYSTEM}) mints a system key → wrapped as a Connection. Call once per connector, reuse {_id, Name}.
// Returns {_id, Name, connector:{_id, Version}} or throws.
export async function provisionSystemConnection(client, acc, connectorId, version, name) {
  const r = await client.call("POST", `/integration/2/${acc}/connection/${connectorId}/${version}/SystemApiKey`, { Name: name });
  if (r.status >= 300) throw new Error(`provisionSystemConnection ${connectorId}/${version} → ${r.status}: ${JSON.stringify(r.body).slice(0, 160)}`);
  return { _id: r.body?._id, Name: r.body?.Name, connector: { _id: r.body?.Connector?._id, Version: r.body?.Connector?.Version } };
}

// Ensure a connection exists for the connectors an automation USES. Pass `keys` (the catalog keys actually
// wired — e.g. ['process'] for a Process→Process stitch); omit to attempt all present. Tries the (MBAC-gated)
// live list first; for any needed key still missing, PROVISIONS a system-api-key connection. Fault-tolerant:
// a connector that doesn't support system-api keys (Webhooks/HTTP/Email/Scheduler → 500/error) is SKIPPED,
// not fatal — that step falls back to steps-only/internal auth. Returns { <catalogKey>: {_id, Name} }.
export async function ensureConnections(client, acc, connectors, { label = "Connection", keys } = {}) {
  let existing = {}; try { existing = await resolveConnections(client, acc); } catch { /* MBAC-gated list → provision */ }
  const wanted = keys && keys.length ? [...new Set(keys)] : Object.keys(connectors || {}).filter((k) => !k.startsWith("_"));
  const out = {};
  for (const key of wanted) {
    const c = connectors?.[key]; if (!c?._id || !c?.version) continue;
    if (existing[key]?._id) { out[key] = existing[key]; continue; }
    try { out[key] = await provisionSystemConnection(client, acc, c._id, c.version, `${c.name || key} ${label}`); }
    catch (e) { out[`_skipped_${key}`] = String(e.message || e).slice(0, 100); } // connector w/o system-api → steps-only
  }
  return out;
}

// Harvest connector CONNECTIONS from an app-metadata export (they ARE in metadata: every integration's
// Trigger/Action carries `Connection:{_id,Name}` + `Connector:{Name}`). Use this when the live connection
// list is gated (connection read is Integration-Admin/MBAC — a public key gets 403, not 404: the
// system-connector connection exists, it's just not readable). Returns a map keyed by catalog key.
// exportDir = an app export root (contains integration/<name>/metadata/*.json).
export function connectionsFromExport(exportDir, fs) {
  const out = {};
  const glob = (dir) => { let r = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) r = r.concat(glob(p)); else if (e.name.endsWith(".json")) r.push(p); } return r; };
  let files = []; try { files = glob(`${exportDir}/integration`); } catch { return out; }
  for (const f of files) {
    let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
    for (const v of Object.values(d)) {
      if (!v || (v.Kind !== "Trigger" && v.Kind !== "Action") || !v.Connector || !v.Connection?._id) continue;
      const cn = v.Connector.Name || "";
      // capture the connection AND the connector version/logo it is PINNED to (must match, else builder errors)
      for (const [key, def] of Object.entries(CONNECTOR_CATALOG)) if (def.match.test(cn) && !out[key]) out[key] = {
        _id: v.Connection._id, Name: v.Connection.Name,
        connector: { _id: v.Connector._id, Version: v.Connector.Version, Logo: v.Connector.Logo, Status: v.Connector.Status || "Published", WebsiteURL: v.Connector.WebsiteURL || "https://kissflow.com" } };
    }
  }
  return out;
}

// SKELETON selection — the PLUGIN is the AI here. `kf-integration-analyst` reasons each stitch into an
// `ir.automations` entry; this deterministically resolves it to the connector trigger + action (no
// runtime call to Kissflow's AI). Given the same intent, this returns the same skeleton Kissflow's own
// AI does (verified: approved/completed → ItemCompleted; update → UpdateAnItem; create → CreateAndSubmitItem).
export function resolveSkeleton(automation, ctx = {}) {
  const ftype = (flow) => (ctx.flowTypeOf ? ctx.flowTypeOf(flow) : "Process"); // steps-only: default Process
  const srcKey = connectorKeyFor(ftype(automation.source.flow));
  // notify = email semantics: SendEmail via the email connector. Routing it at the process connector
  // would resolve to CreateAndSubmitItem and CREATE A SPURIOUS ITEM in the target flow on every trigger.
  const tgtKey = automation.action.type === "notify" ? "email" : connectorKeyFor(ftype(automation.action.target_flow));
  const cat = CONNECTOR_CATALOG[srcKey], tcat = CONNECTOR_CATALOG[tgtKey];
  const triggerId = (cat?.triggers || {})[EVENT_TO_TRIGGER[automation.source.event] || "created"] || cat?.triggers?.created;
  const actionId = automation.action.type === "notify" ? (tcat?.actions?.send || "SendEmail")
    : automation.action.type === "update" ? (tcat?.actions?.update || "UpdateAnItem") : (tcat?.actions?.createSubmit || tcat?.actions?.create || "CreateAndSubmitItem");
  return { srcKey, tgtKey, triggerId, actionId };
}

// OPTIONAL cross-check against Kissflow's OWN AI (not used at runtime — the plugin is the primary author).
// POST /metadata/2/{acct}/integration/{integrationId}/suggest/workflow { AIPrompt }. Useful to validate
// `resolveSkeleton` picked the same trigger/action, or to fetch authoritative connector metadata (Logo).
export async function suggestSkeleton(client, acc, integrationId, aiPrompt) {
  const r = await client.call("POST", `/metadata/2/${acc}/integration/${integrationId}/suggest/workflow`, { AIPrompt: aiPrompt });
  if (r.status >= 300) throw new Error(`suggestSkeleton → ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}`);
  const ta = r.body?.Data?.TriggersAndActions || {};
  return { triggers: ta.Triggers || [], actions: ta.Actions || [] };
}

// Fetch a connector's real trigger/action definitions (version-specific ids + input fields).
// GET /connector/2/{acct}/{connectorId}/metadata/{version} → the connector metadata blob.
export async function fetchConnectorMeta(client, acc, connectorId, version) {
  const r = await client.call("GET", `/connector/2/${acc}/${connectorId}/metadata/${version}`);
  if (r.status >= 300) throw new Error(`fetchConnectorMeta ${connectorId}/${version} → ${r.status}`);
  const ents = Object.values(r.body).filter((e) => e && (e.Kind === "Trigger" || e.Kind === "Action"));
  return {
    triggers: ents.filter((e) => e.Kind === "Trigger").map((e) => ({ id: e.Id || e._id, name: e.Name })),
    actions: ents.filter((e) => e.Kind === "Action").map((e) => ({ id: e.Id || e._id, name: e.Name, type: e.Type })),
  };
}

let _seq = 0;
const _eid = (p) => `${p}_${(++_seq).toString(36)}${Math.abs((_seq * 2654435761) % 1e6).toString(36)}`;
// a source value is a quoted literal → Value; otherwise a source-field/computed ref → Expression.
const _isLiteral = (v) => /^['"]/.test(String(v ?? "").trim());
const _unquote = (v) => String(v ?? "").trim().replace(/^['"]|['"]$/g, "");
const _slug = (s) => String(s ?? "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, ""); // field-id fallback

// A synthetic sample item for a Trigger's Output — the shape the builder's "Smart field mapping" reads
// to offer the trigger's fields as sources. System fields (fixed placeholders) + one per business field.
const _USER = { _id: "Us000000000", Name: "Sample", Kind: "User" };
const _sampleVal = (type) => { const t = fmType(type); return t === "Number" ? 0 : t === "Date" ? "2024-01-01T00:00:00-00:00" : t === "Object" ? _USER : t === "Boolean" ? false : "Text data"; };
function _sampleOutput(fields) {
  const o = { _id: "SampleInstance001", Name: "Sample", _flow_name: "Sample", _application_id: "Sample",
    _flow_type: "Sample", _status: "Sample", _current_step: "Sample", _stage: 1, _is_deleted: false, _doc_version: "1",
    _created_by: _USER, _modified_by: _USER, _current_assigned_to: [_USER],
    _created_at: "2024-01-01T00:00:00-00:00", _modified_at: "2024-01-01T00:00:00-00:00", _completed_at: "2024-01-01T00:00:00-00:00" };
  for (const f of fields || []) if (f.id && !(f.id in o)) o[f.id] = _sampleVal(f.type);
  return o;
}

// Kissflow field type → integration FieldMapping Type (golden-eval: String/Number/Date/Object/Boolean).
export function fmType(kfType) {
  const t = String(kfType || "").toLowerCase();
  if (/currency|number|decimal|integer/.test(t)) return "Number";
  if (/datetime|date/.test(t)) return "Date";
  if (/reference|user|lookup|object/.test(t)) return "Object";
  if (/yesno|boolean|checkbox/.test(t)) return "Boolean";
  return "String";
}

// Build one FieldMapping (+ nested Property) — golden-eval shape. opts:
//   { mtype, value }      → Property Type:"Value" (a literal / id, e.g. process_id)
//   { mtype, field }      → Property Type:"Field", Field:"context.<stepId>.<srcField>" (a source binding)
//   { mtype, parent }     → a nested child FieldMapping (e.g. Object._id), no Property
function _fm(blob, name, opts = {}) {
  const fmId = _eid("FieldMapping");
  blob[fmId] = { Id: fmId, Kind: "FieldMapping", Type: opts.mtype || "String", Name: name, ...(opts.parent ? { FieldMapping: opts.parent } : {}) };
  if (opts.value !== undefined || opts.field !== undefined) {
    const prId = _eid("Property");
    blob[fmId]["FieldMapping::Property"] = [prId];
    blob[prId] = opts.value !== undefined
      ? { Id: prId, Kind: "Property", FieldMapping: fmId, Type: "Value", Value: Array.isArray(opts.value) ? opts.value : [opts.value], Name: name }
      : { Id: prId, Kind: "Property", FieldMapping: fmId, Type: "Field", Field: opts.field, Name: name };
  }
  return fmId;
}

// Assemble an integration STEP SKELETON: a Trigger step + an Action step (Create / Update / Email …),
// with the connector + trigger/action SELECTED but nothing else. NO connection, NO flow binding, NO
// field mappings — the user chooses the flow, authenticates the connection, and maps the fields in the
// builder afterwards (or via Kissflow's Smart field mapping). This is the "AI-to-skeleton" output.
// ctx: { connectors: <resolveConnectors()> }  (connections/fields not required)
export function buildIntegrationDraft(automation, ctx) {
  const root = _eid("Integration"), tId = _eid("Trigger"), aId = _eid("Action");
  let { srcKey, tgtKey, triggerId, actionId } = resolveSkeleton(automation, ctx); // plugin-authored skeleton
  if (/email|notify/i.test(automation.action.type)) { tgtKey = "email"; actionId = "SendEmail"; } // email/notify step
  const srcC = ctx.connectors?.[srcKey], tgtC = ctx.connectors?.[tgtKey];
  if (!srcC) throw new Error(`no connector for source '${srcKey}'; available: ${ctx.connectors?._available?.join(", ")}`);
  if (!tgtC) throw new Error(`no connector for target '${tgtKey}'; available: ${ctx.connectors?._available?.join(", ")}`);
  const conn = (c, extra) => ({ _id: c._id, Name: c.name, Version: c.version, Logo: c.logo, Status: "Published", WebsiteURL: "https://kissflow.com", ...extra });
  // A provisioned connection (ctx.connections, from ensureConnections/provisionSystemConnection) pre-satisfies
  // the auth step: attach {_id,Name} and drop IsInternalAuth. Absent one, fall back to the steps-only default
  // (IsInternalAuth:true + empty Connection) — still SAVES + renders green; user auths in the builder.
  const srcConn = ctx.connections?.[srcKey], tgtConn = ctx.connections?.[tgtKey];
  const auth = (cn) => cn?._id ? { IsInternalAuth: false, Connection: { _id: cn._id, Name: cn.Name } } : { IsInternalAuth: true, Connection: {} };

  const blob = { Root: root };
  blob[root] = { Id: root, Kind: "Integration", FlowType: "Integration", Name: automation.name,
    Description: automation.rationale || "", "Integration::Trigger": [tId], "Integration::Action": [aId] };
  // TRIGGER STEP — connector + event. With a connection the auth step is pre-satisfied; without one the
  // steps-only minimum still saves and the user picks the flow / auths / maps fields in the builder.
  blob[tId] = { Id: tId, Kind: "Trigger", Type: "App", Name: `When an item ${triggerId}`,
    ...auth(srcConn), Integration: root,
    Connector: conn(srcC, { TriggerId: triggerId, TriggerName: triggerId }), "Trigger::FieldMapping": [] };
  // ACTION STEP — connector + action. The entity-level Type is ALWAYS "Create" (verified across every
  // golden eval — UpdateAnItem AND CreateAndSubmitItem both use Type:"Create"; the Connector.ActionId, not
  // this Type, distinguishes update vs create). Setting Type:"Update" makes the builder reject the config.
  blob[aId] = { Id: aId, Kind: "Action", Type: "Create",
    Name: actionId, ...auth(tgtConn), Integration: root,
    Connector: conn(tgtC, { ActionId: actionId, ActionName: actionId }), "Action::FieldMapping": [] };
  return blob;
}

// Resolve an automation field reference (a label OR a field id) against a flow's field list. Matches by id
// first, then by case-insensitive Name/label. Returns {id, name, type} or null.
function _resolveField(flow, ref) {
  const r = String(ref ?? "").trim(); if (!r || !flow?.fields) return null;
  const byId = flow.fields.find((f) => (f.id || f._id) === r);
  if (byId) return { id: byId.id || byId._id, name: byId.name || byId.Name, type: byId.type || byId.Type };
  const lc = r.toLowerCase();
  const byName = flow.fields.find((f) => String(f.name || f.Name || "").toLowerCase() === lc);
  return byName ? { id: byName.id || byName._id, name: byName.name || byName.Name, type: byName.type || byName.Type } : null;
}

// FULL field-mapped draft: the step skeleton PLUS the process bindings and per-field mappings, so the
// integration is fully configured (not just steps). Builds on buildIntegrationDraft (connector + auth) then:
//   • Trigger: `process_id` = [source flow id]  + an Output sample (drives the builder's smart field mapping)
//   • Action:  `process_id` = [target flow id]  + one FieldMapping per field_map entry
//       - source ref (a field label/id)      → Property Type:"Field"  Field:`context.<trigger>.<srcFieldId>`
//       - quoted literal ('x' / "x")         → Property Type:"Value"  Value:[literal]
//       - update + action.key_field (a source ref holding the target's _id) → `_id` Field-binding
// ctx additionally needs `flows` = { <flowName>: { id:"<process id>", fields:[{id,name,type}] } }. Field refs
// that don't resolve are collected on `blob._unresolved` (non-fatal) so the caller can flag them, not crash.
export function buildIntegrationDraftFull(automation, ctx) {
  const blob = buildIntegrationDraft(automation, ctx); // connector + auth + empty mapping arrays
  const tId = Object.keys(blob).find((k) => blob[k]?.Kind === "Trigger");
  const aId = Object.keys(blob).find((k) => blob[k]?.Kind === "Action");
  const isEmail = /email|notify/i.test(automation.action.type), isUpdate = /update/i.test(automation.action.type);
  const srcFlow = ctx.flows?.[automation.source.flow];
  if (!srcFlow?.id) throw new Error(`buildIntegrationDraftFull: no flow id for source '${automation.source.flow}' (pass ctx.flows)`);
  const unresolved = [];

  // TRIGGER binding: which source flow fires + a sample Output so the builder can offer its fields as sources.
  const tFm = _fm(blob, "process_id", { mtype: "String", value: [srcFlow.id] });
  blob[tFm].Trigger = tId;
  blob[tId]["Trigger::FieldMapping"] = [tFm];
  blob[tId].Output = _sampleOutput(srcFlow.fields);
  if (isEmail) { blob._unresolved = ["email action: map To/Subject/Body in the builder"]; return blob; }

  const tgtFlow = ctx.flows?.[automation.action.target_flow];
  if (!tgtFlow?.id) throw new Error(`buildIntegrationDraftFull: no flow id for target '${automation.action.target_flow}' (pass ctx.flows)`);
  const aFms = [];
  const pFm = _fm(blob, "process_id", { mtype: "String", value: [tgtFlow.id] }); blob[pFm].Action = aId; aFms.push(pFm);
  if (isUpdate) { // UpdateAnItem needs a record locator (_id): bind it from a source ref ONLY if the stitch
    // names one via action.key_field. An EMPTY _id makes the payload invalid, so when no locator is known we
    // omit _id and flag it — the user selects the record (or a Search step is added) in the builder.
    const keyRef = automation.action.key_field ? _resolveField(srcFlow, automation.action.key_field) : null;
    if (keyRef) { const idFm = _fm(blob, "_id", { mtype: "String", field: `context.${tId}.${keyRef.id}` }); blob[idFm].Action = aId; aFms.push(idFm); }
    else unresolved.push(`update record-locator (_id): set action.key_field (a source field holding the target _id) or select the record / add a Search step in the builder`);
  }
  for (const [tRef, sRef] of Object.entries(automation.action.field_map || {})) {
    const tf = _resolveField(tgtFlow, tRef); if (!tf) { unresolved.push(`target:${tRef}`); continue; }
    let fm;
    if (_isLiteral(sRef)) fm = _fm(blob, tf.id, { mtype: fmType(tf.type), value: _unquote(sRef) });
    else { const sf = _resolveField(srcFlow, sRef); if (!sf) { unresolved.push(`source:${sRef}→${tRef}`); continue; } fm = _fm(blob, tf.id, { mtype: fmType(tf.type), field: `context.${tId}.${sf.id}` }); }
    blob[fm].Action = aId; aFms.push(fm);
  }
  blob[aId]["Action::FieldMapping"] = aFms;
  if (unresolved.length) blob._unresolved = unresolved;
  return blob;
}

// LIVE field resolution — the authoritative field schema for a SAVED draft's trigger/action entity (its
// process_id must already be set). GET /integration/2/{acc}/{integrationId}/{trigger|action}/{entityId}/fields
// → [{Name, Label, Type, IsRequired, IsDropdown, FieldId}]. This is exactly what the builder calls after you
// pick a process; you MUST build FieldMappings from it rather than hand-craft them — the system fields
// (process_id/_id) and per-field Label/Type/IsRequired come from here, not from guesswork. rbac User + mbac
// Admin (the integration's creator qualifies with a normal key).
export async function resolveEntityFields(client, acc, integrationId, kind, entityId) {
  const seg = /trigger/i.test(kind) ? "trigger" : "action";
  const r = await client.call("GET", `/integration/2/${acc}/${integrationId}/${seg}/${entityId}/fields`);
  if (r.status >= 300) throw new Error(`resolveEntityFields ${seg}/${entityId} → ${r.status}`);
  return Array.isArray(r.body) ? r.body : (r.body?.Data || r.body?.data || []);
}

// Rewrite an entity's FieldMapping graph from a RESOLVED schema, in golden-eval shape: ENUMERATE every field
// (each becomes a FieldMapping with FieldId/Label/Type/IsRequired[/IsDropdown+AutoRefresh] + a back-ref);
// attach a Property ONLY where `bindings[fieldName]` says so. Purges the entity's prior FMs/Properties first.
//   bindings[name] = { value:[...] , selectedDropdown?:[{FieldId,FieldName}] }  → Property Type:"Value"
//                  | { field:"context.<trigger>.<srcFieldId>" }                 → Property Type:"Field"
// sysFieldId supplies the version-specific ids the resolver returns as null (process_id/_id/case_id).
const _SYS_FIELD_ID = { Trigger: { process_id: "Field008", case_id: "Field002" }, Action: { process_id: "ActionField002", _id: "ActionField003", case_id: "ActionField002" } };
function _applyResolvedMappings(blob, entityId, kind, schema, bindings) {
  for (const k of Object.keys(blob)) { const e = blob[k]; if (e && e.Kind === "FieldMapping" && e[kind] === entityId) { for (const p of e["FieldMapping::Property"] || []) delete blob[p]; delete blob[k]; } }
  const list = [];
  for (const f of schema) {
    const name = f.Name, fmId = _eid("FieldMapping");
    const fm = { Id: fmId, Kind: "FieldMapping", Type: f.Type || "String", FieldId: f.FieldId || _SYS_FIELD_ID[kind]?.[name] || name, Label: f.Label || name, Name: name, IsRequired: !!f.IsRequired, [kind]: entityId };
    if (f.IsDropdown) { fm.IsDropdown = true; fm.AutoRefresh = true; }
    const b = bindings[name];
    if (b) {
      if (b.selectedDropdown) fm.SelectedDropdown = b.selectedDropdown;
      const pr = _eid("Property"); fm["FieldMapping::Property"] = [pr];
      blob[pr] = b.field !== undefined
        ? { Id: pr, Kind: "Property", FieldMapping: fmId, Type: "Field", Field: b.field, Name: name }
        : { Id: pr, Kind: "Property", FieldMapping: fmId, Type: "Value", Value: Array.isArray(b.value) ? b.value : [b.value], Name: name };
    }
    blob[fmId] = fm; list.push(fmId);
  }
  blob[entityId][`${kind}::FieldMapping`] = list;
}

// FULL live apply with SERVER-RESOLVED field mappings — the correct, builder-faithful path. Two-pass:
//   pass 1: create + PUT a skeleton whose trigger/action carry process_id (so the server can resolve fields)
//   → resolve the action's fields live → rebuild the action FieldMappings in golden shape (all fields
//   enumerated, Property on process_id[+_id for update]+each mapped field) → pass 2: PUT full + publish.
// Works for BOTH update and create — create simply has no `_id` field in the resolved schema, so there's no
// record-locator to bind (the one thing that makes update domain-dependent). ctx: { connectors, connections?,
// flows:{<name>:{id, display?, fields:[{id,name,type}]}} }.
export async function applyIntegrationResolved(client, acc, appId, automation, ctx) {
  const rep = { name: automation.name, mode: "resolved", steps: {} };
  try {
    if (ctx.provisionConnections !== false && !ctx.connections && ctx.connectors) {
      const sk = resolveSkeleton(automation, ctx);
      const keys = /email|notify/i.test(automation.action.type) ? [sk.srcKey] : [sk.srcKey, sk.tgtKey];
      try { ctx = { ...ctx, connections: await ensureConnections(client, acc, ctx.connectors, { keys }) }; } catch { /* fall back to internal auth */ }
    }
    const cr = await client.call("POST", `/flow/2/${acc}/integration?_application_id=${appId}`, { Name: automation.name, Type: "Integration", _application_id: appId });
    rep.steps.create = cr.status; const id = cr.body?._id; rep.id = id;
    if (cr.status >= 300 || !id) return rep;
    const dr = await client.call("GET", `/metadata/2/${acc}/integration/${id}/draft`);
    const draft = buildIntegrationDraftFull(automation, ctx); delete draft._unresolved;
    const serverRoot = dr.body?.Root;
    if (serverRoot && serverRoot !== draft.Root) {
      const r = draft[draft.Root]; delete draft[draft.Root]; const localRoot = draft.Root; draft.Root = serverRoot;
      draft[serverRoot] = { ...r, Id: serverRoot, _application_id: appId };
      for (const k in draft) if (draft[k] && draft[k].Integration === localRoot) draft[k].Integration = serverRoot;
    }
    const tId = Object.keys(draft).find((k) => draft[k]?.Kind === "Trigger");
    const aId = Object.keys(draft).find((k) => draft[k]?.Kind === "Action");
    const p1 = await client.call("PUT", `/metadata/2/${acc}/integration/${id}/draft`, draft);
    rep.steps.putSkeleton = p1.status;
    if (p1.status >= 300) { rep.putBody = JSON.stringify(p1.body).slice(0, 160); return rep; }
    const srcFlow = ctx.flows[automation.source.flow];
    // TRIGGER: golden-shape process_id (Value + SelectedDropdown) + an Output sample for smart mapping
    _applyResolvedMappings(draft, tId, "Trigger",
      [{ Name: "process_id", Label: "Choose a process", Type: "String", IsRequired: true, IsDropdown: true }],
      { process_id: { value: [srcFlow.id], selectedDropdown: [{ FieldId: srcFlow.id, FieldName: srcFlow.display || automation.source.flow }] } });
    draft[tId].Output = _sampleOutput(srcFlow.fields);
    if (!/email|notify/i.test(automation.action.type)) {
      const tgtFlow = ctx.flows[automation.action.target_flow];
      const schema = await resolveEntityFields(client, acc, id, "Action", aId); // live target-field schema
      rep.steps.resolvedFields = schema.length;
      const bindings = { process_id: { value: [tgtFlow.id], selectedDropdown: [{ FieldId: tgtFlow.id, FieldName: tgtFlow.display || automation.action.target_flow }] } };
      if (/update/i.test(automation.action.type)) { // update-only: bind the record locator if the stitch names one
        const keyRef = automation.action.key_field ? _resolveField(srcFlow, automation.action.key_field) : null;
        if (keyRef) bindings._id = { field: `context.${tId}.${keyRef.id}` };
        else (rep.unresolved = rep.unresolved || []).push("update record-locator (_id): set action.key_field or bind in builder");
      }
      for (const [tRef, sRef] of Object.entries(automation.action.field_map || {})) {
        const tf = _resolveField(tgtFlow, tRef); if (!tf) { (rep.unresolved = rep.unresolved || []).push(`target:${tRef}`); continue; }
        if (_isLiteral(sRef)) bindings[tf.id] = { value: _unquote(sRef) };
        else { const sf = _resolveField(srcFlow, sRef); if (!sf) { (rep.unresolved = rep.unresolved || []).push(`source:${sRef}`); continue; } bindings[tf.id] = { field: `context.${tId}.${sf.id}` }; }
      }
      _applyResolvedMappings(draft, aId, "Action", schema, bindings);
    }
    const p2 = await client.call("PUT", `/metadata/2/${acc}/integration/${id}/draft`, draft);
    rep.steps.putFull = p2.status; if (p2.status >= 300) rep.putBody = JSON.stringify(p2.body).slice(0, 160);
    const pub = await client.call("POST", `/metadata/2/${acc}/integration/${id}/publish`, {});
    rep.steps.publish = pub.status;
  } catch (e) { rep.error = String(e.message || e); }
  return rep;
}

// Apply one integration live: create → get draft → put draft → publish → (attempt) turn_on.
// Returns a per-step status report; never throws (captures errors per step).
export async function applyIntegration(client, acc, appId, automation, ctx) {
  const rep = { name: automation.name, steps: {} };
  try {
    // Provision connections up front (platform mints its own key; no credential supplied) unless the caller
    // passed ctx.connections or opted out with ctx.provisionConnections === false (steps-only build).
    if (ctx.provisionConnections !== false && !ctx.connections && ctx.connectors) {
      const sk = resolveSkeleton(automation, ctx);
      const keys = /email|notify/i.test(automation.action.type) ? [sk.srcKey] : [sk.srcKey, sk.tgtKey]; // email/notify needs no system-api conn
      try { ctx = { ...ctx, connections: await ensureConnections(client, acc, ctx.connectors, { keys }) }; rep.steps.connections = Object.keys(ctx.connections).filter((k) => !k.startsWith("_")).length; }
      catch (e) { rep.steps.connections = `err:${String(e.message || e).slice(0, 80)}`; }
    }
    const cr = await client.call("POST", `/flow/2/${acc}/integration?_application_id=${appId}`, { Name: automation.name, Type: "Integration", _application_id: appId });
    rep.steps.create = cr.status; const id = cr.body?._id; rep.id = id;
    if (cr.status >= 300 || !id) return rep;
    const dr = await client.call("GET", `/metadata/2/${acc}/integration/${id}/draft`);
    rep.steps.getDraft = dr.status;
    // FULL field-mapped draft when the caller supplies flow schemas (ctx.flows); else the steps-only skeleton.
    const draft = ctx.flows ? buildIntegrationDraftFull(automation, ctx) : buildIntegrationDraft(automation, ctx);
    if (draft._unresolved) { rep.unresolved = draft._unresolved; delete draft._unresolved; }
    // preserve the server-created root id/_application_id from the fetched draft
    const serverRoot = dr.body?.Root;
    if (serverRoot && serverRoot !== draft.Root) {
      const r = draft[draft.Root]; delete draft[draft.Root]; const localRoot = draft.Root; draft.Root = serverRoot;
      draft[serverRoot] = { ...r, Id: serverRoot, _application_id: appId };
      for (const k in draft) if (draft[k] && draft[k].Integration === localRoot) draft[k].Integration = serverRoot; // fix back-refs
    }
    const pd = await client.call("PUT", `/metadata/2/${acc}/integration/${id}/draft`, draft);
    rep.steps.putDraft = pd.status; rep.putDraftBody = pd.status >= 300 ? JSON.stringify(pd.body).slice(0, 160) : undefined;
    const pub = await client.call("POST", `/metadata/2/${acc}/integration/${id}/publish`, {});
    rep.steps.publish = pub.status;
    const on = await client.call("PUT", `/integration/2/${acc}/integration/${id}/on`, {});
    rep.steps.turnOn = on.status; // 403 expected with a public key (internal-auth route)
  } catch (e) { rep.error = String(e.message || e); }
  return rep;
}
