# Kissflow Integration Catalog & Authoring (for the connector-based emitter)

Ground truth extracted from the platform source (`kissflow-xg`: connector fixtures, `integration/`,
`metadata/route/integration.py`) + live probes. This is the reference for `engine/integrations.mjs`
(the connector-based flow-stitch emitter). App-agnostic.

## Provisioning a CONNECTION — the "internal auth" mechanism (RESOLVED — live 200) ★
An account with zero connections was the one prerequisite blocking a wireable Trigger/Action. It is
**self-serve**: **`POST /integration/2/{acct}/connection/{connectorId}/{version}/SystemApiKey`** body
`{"Name": "..."}` → **200**, returns `{_id, Name, Connector:{_id,Version}}`. **RBAC `UserType:User`** — a
plain public API key can call it (that's the asymmetry: *listing/reading* connections is Integration-Admin/
MBAC and 403s, but *creating* a system-api-key connection is a normal-user action). **The platform mints its
OWN system key server-side** (`create_system_api_key_connection` → `session.create_system_api_key({Type:
SYSTEM})`) — the caller supplies **no credential**. This is exactly what the builder's "internal auth" step
does behind the scenes. Verified live: the Process connector (discovered at runtime from /subscription) → a system-key connection
("Kissflow Process Connection"). `engine/integrations.mjs`: `provisionSystemConnection()` +
`ensureConnections()` (list-then-provision-missing); `buildIntegrationDraft` attaches a provided connection
(`IsInternalAuth:false` + `Connection:{_id,Name}`) or falls back to steps-only (`IsInternalAuth:true` + `{}`).

## Discovering installed connectors (RESOLVED — live)
The account's available connectors: **`GET /connector/2/{acct}/subscription`** → 200, a list of
`{_id, Name, VersionName, Logo, TriggerCount, ActionCount}`. (The `/` and `/all` list routes return only
*custom* connectors and are usually empty; `/info` is 403 with a public key.) Each connector's real,
version-specific trigger/action ids: **`GET /connector/2/{acct}/{connectorId}/metadata/{version}`** → the
connector metadata blob (entities `Kind:"Trigger"|"Action"` with `Id`, `Name`, `Type`).

`engine/integrations.mjs` wires both: `resolveConnectors(client, acct)` (subscription → instance map keyed
by connector) and `fetchConnectorMeta(client, acct, id, version)` (live trigger/action ids). The instance
`{_id, Version, Logo}` is **account-specific — always discovered at runtime, never hardcoded.**

## System connectors + their trigger/action ids (Process verified live @ v3.7.5)
Trigger/action ids are connector-**version**-specific; prefer `fetchConnectorMeta`. Process (v3.7.5):

| Connector | Triggers (key ones) | Actions |
|---|---|---|
| **Kissflow Process** | `ItemCreated`, `DraftItemSubmitted`, **`ItemCompleted`** (completes workflow), `ItemAdvancesToNextStep`, `ItemRejected`, `ItemEntersToStep`, `ItemExitsToStep`, `SlaBreached`, `ItemSentBack`, `ItemWithdrawn`, `ItemReassigned` (17 total) | **`CreateAndSubmitItem`**, **`UpdateAnItem`**, `Action_-SkflzwKj` (Approve), `Action_Kh4Jb2AoG` (Search), `Action_GeneratePDF`, bulk-create, admin skip-complete (7 total) |
| **Kissflow Dataset** | (fetch live) | (5 actions) |
| **Kissflow Board** | (18) | (8) |
| **Kissflow Project** | (8) | (4) |
| **Webhooks** | `WebhookTrigger` | — |
| **Email** | — | `SendEmail` |
| **HTTP** | — | (6) |
| **Scheduler** | (4 scheduled) | — |

> ⚠️ Availability is per-account. On a typical account only **Process / Dataset / Board / Project +
> Email / Webhook / HTTP / Scheduler** are subscribed — there may be **no Case or Dataform connector**,
> so create/update into a Form/Case target isn't wireable until that connector is subscribed.
> `resolveConnectors` returns `_available` (the names present) so the emitter can flag unwireable stitches.

## Trigger events (source-flow lifecycle) → Process trigger id
`created → ItemCreated`, `submitted → DraftItemSubmitted`, `approved/completed → ItemCompleted`,
`updated → ItemAdvancesToNextStep`. (Older connector fixtures used `ProcessEvents`; live v3.7.5 uses the
granular ids above.)

## Draft-blob shape (fixture `appstore/tests/mock/metadata/Draft_Integration_001_A00.json`)
```
Root → Integration(Model) { "Integration::Trigger":[tId], "Integration::Action":[aId, …] }
Trigger { Kind:"Trigger", Type:"App", Name, Connector:{_id, Name, TriggerId, TriggerName, Version, Logo} }
Action  { Kind:"Action",  Type:"Create"|"Update", Name, Connector:{_id, Name, ActionId, ActionName, Version, Logo} }
FieldMapping { Kind:"FieldMapping", Type:"String"|"Object"|"Datetime", Name:<targetField>, FieldMapping?:<parentFmId> }
Property { Kind:"Property", Type:"Value", Name, FieldMapping:<fmId>, Value?:<sourceExpr> }
```
Objects (e.g. a User/Reference field) nest: a parent `FieldMapping{Type:"Object"}` + child `FieldMapping{Name:"_id", FieldMapping:<parent>}`.

## Authoring flow (verified against source + live)
1. `POST /flow/2/{acct}/integration?_application_id={app}` → creates the record (**200**, confirmed live).
2. `GET  /metadata/2/{acct}/integration/{id}/draft` → base draft blob (**200**, confirmed live).
3. `PUT  /metadata/2/{acct}/integration/{id}/draft` with the full Model+Trigger+Action+FieldMapping/Property blob.
4. `POST /metadata/2/{acct}/integration/{id}/publish`.
5. `PUT  /integration/2/{acct}/integration/{id}/on` — **turn on** (INTERNAL-auth route; 403 with a public
   key — activation likely requires the builder UI or internal auth). `/off` + `DELETE /…/{id}` are also internal.

**Turn-on rule:** an integration must have exactly **1 Trigger + ≥1 Action** or it can't turn on
(`InvalidIntegrationException`). Integration-admin (MBAC) is required for get-trigger/action-fields,
expression eval, and turn on/off.

## Draft schema — CONFIRMED from a golden-eval integration
(`KFSustainabilityApp/integration/4_Task_Creation_in_Goal_Task_Manag`, a real flow→flow integration.)
A Trigger/Action needs MORE than the connector — the required extras (missing → `DocValidationError
"Insufficient arguments"` on PUT draft):
- **`Connection: {_id, Name}`** — an account CONNECTION to that connector (e.g. "Kissflow Process Connection").
  ✅ **It exists** for system connectors (Process/Dataform/Board): a live `GET` of the connection returns
  **403, not 404** — it's present but READING it (and listing) is **Integration-Admin (MBAC)**-gated, which
  a plain public API key lacks (that's why `/connection` listed 0). The connection ref is also carried in
  **app metadata** — every integration's Trigger/Action stores `Connection:{_id,Name}`. So source it from
  an app export via `connectionsFromExport(exportDir, fs)` (verified: ITAM → process `Cn7vALgtsHcY`), or
  from an admin-scoped `resolveConnections()`.
- `IsInternalAuth: false`, `Integration: <root id>` (back-ref), `Connector.{Status, WebsiteURL}`.
- **Trigger binding:** `Trigger::FieldMapping` = `process_id` (source flow id, Property Value) [+ `step_id`
  for step triggers like `ItemEntersToStep`].
- **Action binding:** `Action::FieldMapping` = `process_id`/`case_id` (target flow id) + one FieldMapping
  per field; Property `Type` = `Value` (literal/id) | `Field` (a field ref) | `Expression`.

## Skeleton selection — the PLUGIN is the AI
`kf-integration-analyst` (Claude) reasons each stitch into an `ir.automations` entry; `resolveSkeleton()`
deterministically maps it to the connector trigger + action. **No runtime call to Kissflow's AI.** Given
the same intent, it produces the same skeleton Kissflow's own AI does — verified: *"Valuation completes →
update Market Value in NAV with Average Valuation"* → `resolveSkeleton` = **`ItemCompleted` + `UpdateAnItem`**,
and Kissflow's `/suggest/workflow` returned the identical pair. So the plugin owns skeleton authoring.

**Optional cross-check** (`suggestSkeleton()`): Kissflow's own AI, `POST /metadata/2/{acct}/integration/{id}/
suggest/workflow {AIPrompt}` — MBAC on the integration_id (callable with a normal key on an integration you
created, NOT behind the connection wall). Use it only to validate `resolveSkeleton` or fetch authoritative
connector metadata (Logo/Version); it is not a runtime dependency.

## Status
- ✅ **`resolveConnectors()` / `fetchConnectorMeta()` / `resolveConnections()` — DONE** (live-verified).
- ✅ **`buildIntegrationDraft()` — schema-complete** per the golden eval (Connector + Connection +
  IsInternalAuth + Integration back-ref + process_id[/step_id] + field-map graph). Needs `ctx.connections`.
- ✅ **`provisionSystemConnection()` / `ensureConnections()` — DONE** (live 200; platform-minted key, no
  credential). The connection prerequisite is now self-serve — `applyIntegration` provisions up front.
- ⏳ **`applyIntegration()`** — create→(provision)→draft→publish wired. Only `turn_on` remains internal-auth
  (403 with a public key) — activation via the builder UI or an admin-scoped key.

See `engine/integrations.mjs` (`CONNECTOR_CATALOG`, `resolveConnectors`, `fetchConnectorMeta`,
`buildIntegrationDraft`, `applyIntegration`).
