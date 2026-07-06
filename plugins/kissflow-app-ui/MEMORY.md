# kf-author — Agent Memory (AUTO-EVOLVING)

The plugin's **cross-run working memory**. Every kf-author agent **reads this first** and **appends**
to it whenever a run reveals something future runs must know — a gotcha, a user correction, an
override, a confirmed approach. This is the fast-moving log; durable, universally-true lessons get
**promoted** into `reference/LESSONS.md` (the curated knowledge base).

## How every agent uses this
- **READ first** — apply every entry tagged `[global]`, plus those matching the current app
  (`[app:<id>]`) or your own agent (`[agent:<name>]`). These override defaults.
- **WRITE on learning** — the moment you hit a non-obvious gotcha, the user corrects you, or you
  confirm a build rule future runs need, **append one line**:
  `- <today's date> [global|app:<id>|agent:<name>] <lesson, imperative, one line>`
  (use the date from your context). Keep it terse.
- **CONSOLIDATE** — merge duplicates; delete entries later proven wrong.
- **PROMOTE** — when an entry is durable + universal, move it into `reference/LESSONS.md` and leave a
  one-line pointer here.
- **DECAY** — memory ages out so agents stop paying attention tax on stale entries: `[app:*]`
  after 90 days, `[agent:*]` after 240, `[global]` + promoted stubs after 365 — measured from the
  NEWEST date in the entry. Re-verified a fact live? Append `(reaffirmed YYYY-MM-DD)` to reset its
  clock. Run `node engine/memory.mjs decay MEMORY.md` (use `--dry-run` to preview; `stats` for an
  age profile). Expired entries move to MEMORY-ARCHIVE.md — never deleted, resurrectable.


## RECORDING RULES — Trustworthy Memory, Phase 1 (2026-07-04)
Beliefs earn authority; they don't get it for free. When writing an entry:
- **Separate OBSERVATION from INTERPRETATION.** First record what actually happened — what was
  sent, what came back, which engine version was in the path. Then the claim, as a labeled
  inference with a tier tag: `[tier:observed-once|reproduced|golden-verified|owner-confirmed]`.
  Observations cannot rot; interpretations can and do (see the retired §1b "formula stripping").
- **SELF-SUSPICION RULE (mandatory for platform-limit claims).** Before recording "the platform
  can't/doesn't X", run the control experiment: does the builder UI or a golden export succeed
  where our API call failed? If yes → the class is ENGINE-DEFECT, not platform-limit. This rule
  would have prevented DEF-4, R7, and §1b.
- **IMPOSSIBILITY QUARANTINE.** Claims of the form "X is impossible/unsupported" silently degrade
  every future design and no error ever points at them. Tag them `[impossibility]`, add them to
  CONFIRM-QUEUE.md, and treat them as challengeable until `[tier:owner-confirmed]`. Any design
  decision that relies on one MUST say so in decisions.md (the review page surfaces these).
- **Cite lesson ids in decisions** (R7-style) — citations are what make contradiction propagate.
- **FEDERATION.** This MEMORY.md is the CANONICAL memory — it ships with the plugin and is
  REPLACED on plugin updates. Instance-specific learning goes to **MEMORY-LOCAL.md** (agents READ
  both, WRITE local only). Share what you learned: `node engine/memory.mjs contribute` extracts the
  global/agent-scoped slice (never [app:*] project knowledge) as MEMORY-CONTRIBUTION.md — submit it
  to the plugin repo; the platform owner reviews and merges. [impossibility] claims from the field
  enter CONFIRM-QUEUE.md as PENDING — they never self-promote.

## Entries
- 2026-06-30 [global] Published processes are IMMUTABLE over REST (PUT→403, DELETE→no-op) — bake all
  fields/formulas/aggregates/lookups/workflow in before publish; to change one, rebuild the app fresh. → LESSONS §1b
- 2026-06-30 [global] Process field FORMULAS strip on publish; FORM formulas survive. Don't rely on
  process-side field expressions; model process math in the workflow. → LESSONS §1b
- 2026-06-30 [global] Flow DELETE is async — wait/retry before recreating, else `FlowNameAlreadyExists`. → LESSONS §1b
- 2026-06-30 [global] `/flow/explore` is account-wide + eventually-consistent — check flow existence by
  EXACT id (`getDraft` 404), never by name (other apps' flows collide). → LESSONS §9
- 2026-06-30 [global] Avoid account-global master names (Currency, Project, Country) — they collide
  app-wide (`FlowNameAlreadyExists`) and dangle referrers; prefix them. → LESSONS §5
- 2026-06-30 [global] Formulas accept the FULL grammar (named functions IF/CONCATENATE/ROUND/DATEDIFF,
  comparison ops, strings, parens), not just arithmetic. → LESSONS §3
- 2026-06-30 [global] Aggregate field shape (verified vs ITAM export): field is ReadOnly + Widget
  "Aggregation" and links its QD via **Field::QueryDefinition** (not Aggregate::); QD =
  {Kind:QueryDefinition, LHSModel, FlowType, LookupField:[], AggregateField, AggregateType:"Sum"/"Count"
  title-case}. Wrong shape → FieldValidationException on publish. → LESSONS §3b
- 2026-06-30 [global] Pages composed of only kpi/chart/list cards are VIEW-ONLY — a requester page
  needs an `action` card (`{view:"action", source_flow}`) → buildPage emits an embedded create
  FormView so the role can RAISE the flow. kf-experience-designer must add it on requester pages. → LESSONS §3b
- 2026-06-30 [global] Create form must be HIDDEN behind a button — buildPage `action` card emits a
  worklist whose native "+ New" opens the create form as a popup; never an always-open FormView.
- 2026-06-30 [global] The agent derives, per flow INCLUDING data forms, who may INITIATE (→ create
  action) vs who may only ACCESS (→ read worklist), and gates pages by it. Every data form needs a
  home (page+nav) — reachable by accessors, creatable by initiators; never orphan a data form. → kf-security-designer/kf-experience-designer
- 2026-07-01 [global] EVERY reference IS a lookup — no separate "reference" concept in Kissflow. A
  `type:"Reference"` field with no `lookup` array still fetches ONE value (the target's display field,
  e.g. SPV.Fund → fund name); the `lookup` array only adds MORE columns. So "reference vs lookup" is
  wrong framing — it's single-field (default) vs multi-field lookup, and every `ref` is already a
  working lookup. Configure `lookup` when a screen needs the target's other attributes inline. → LESSONS §3b
- 2026-07-02 [global] The prototyper is TWO agents (split from kf-prototype): **kf-ux-architect**
  (senior product-design judgment — per-role information architecture + a curated set of RICH widgets
  chosen from each role's JOBS; no template dashboards; roles get genuinely different first screens) →
  enriched experience-spec.json; then **kf-prototype-builder** (generates the self-contained,
  SEED-DATA-driven clickable prototype: statcards+sparkline, area/donut/bar charts, approval queues
  with actions+avatars, kanban, timeline, progress lists, upcoming/calendar, worklist tables, and
  create-form POPUPS). Build ONE coherent deterministic seed dataset and drive every widget from it
  (same records across chart/list/queue) — never per-widget random filler, never empty widgets.
  Rich widget vocabulary + two-part flow are in reference/EXPERIENCE-SPEC.md. → [[project_kf_app_author]]
- 2026-07-02 [global] applyIR live-build fixes: (1) AGGREGATE-OVER-CHILD false
  "dangling cross-ref" — an aggregate's QueryDefinition LHSModel points at the EMBEDDED child-table
  Model (e.g. Payment.Total → Payment_Lines_A00) which lives IN the same blob, not a standalone flow;
  crossRefs() now skips LHSModel targets present in-blob (`!blob[lhs]`), else the parent process is
  wrongly skipped from publish. (2) ACCOUNT-GLOBAL NAME COLLISION — lists/forms named "Currency",
  "Project" (etc.) already exist account-wide → FlowNameAlreadyExists 04206 on create; applyIR PASS-1
  now RETRIES with an app-prefixed name (`<AppFirst2Words> <name>`) when the name isn't ours to reuse,
  so it creates a NEW app-scoped flow (refs resolve via gen→server, only display Name changes).
  Data-architect should still avoid global master names (LESSONS §5); engine is now resilient anyway. → [[project_kf_app_author]]
- 2026-07-02 [global] NATIVE PAGES — the baseline experience layer had 3 bugs that made pages/nav/create
  look broken live (all fixed, 54 tests): (1) buildPage card verbs are `kpi|list|chart|action` ONLY —
  `experience.mjs` emitting `table`/`form` silently dropped every data widget → labels-only pages; a
  `chart` card needs a real `filter.groupBy` field or it's dropped. (2) `flowInfo` must be keyed by BOTH
  flow id AND name (a card's `source_flow` may be either) or list/chart cards resolve nothing. (3) NAV
  STITCHING — never point every flow's submenu at a role home; each PROCESS flow needs its OWN worklist
  page and the submenu stitches to THAT page (else all menus collapse onto one page). (4) +New is NOT a
  table property (`showform` does nothing) — the create affordance is Button→Popup→FormView per the
  transformer's component catalog; buildPage's `action` card now emits that. Verified live.
- 2026-07-02 [global] FLOW-STITCH AUTOMATIONS — `kf-integration-analyst` uncovers "approve here → create/
  update there" stitches into an `ir.automations` slice; `buildAutomation` compiles each INTERNAL one to
  an Integration flow (Connector + Trigger + Action). `validateIR` verifies every field_map key/value vs the
  real schema (bad map → build fails). EXTERNAL stitches (email/SMS/ERP) are flagged, not built.
- 2026-07-02 [global] INTEGRATION AUTHORING over REST is PARTIAL (probed live, v7): the integration RECORD
  CAN be created — `POST /flow/2/{acct}/integration?_application_id=` → 200. WIRING IS exposed after all
  (found in kissflow-xg source): `GET/PUT /metadata/2/{acct}/integration/{id}/draft` (→200) then publish —
  same draft→publish pattern as pages (my earlier 404 was a wrong URL: it's flow-level `/integration/{id}/
  draft`, NOT app-nested). BUT the draft blob is CONNECTOR-BASED and complex (per fixture
  appstore/tests/mock/metadata/Draft_Integration_001_A00.json): Trigger/Action reference installed
  marketplace CONNECTOR INSTANCES (e.g. "Kissflow Process" `ActionId:CreateAndSubmitItem` `Version:2.0.0`
  +Logo; "Kissflow Case system" `CreateItem`) plus a `FieldMapping`→`Property` entity graph per field.
  Activation + delete are INTERNAL-ONLY routes (`/integration/2/{acct}/integration/{id}/on|off`, DELETE) →
  403 with a public key. NET to emit functional integrations the engine must: discover the account's
  installed connector-instance ids/versions, build the connector-based Trigger/Action + FieldMapping/Property
  graph, save_draft→publish; activation/cleanup likely still need the builder UI. Until that's built, keep
  DEFERRING and use the validated `automations` slice + review as the wire-up blueprint.
- 2026-07-02 [global] INTEGRATION EMITTER (engine/integrations.mjs) — LIVE RUN result: resolveConnectors +
  fetchConnectorMeta work (subscription route); buildIntegrationDraft assembles Integration+Trigger+Action+
  FieldMapping/Property. applyIntegration live steps: create 200, getDraft 200, **putDraft 400
  DocValidationError "Insufficient arguments"**, publish 200, turnOn 403 (internal). So the draft blob is
  still missing REQUIRED Trigger/Action args (likely a Connection ref + event/flow config + connector
  sub-fields) — the metadata/schema only documents CUSTOM-connector authoring, not the standard flow-
  integration draft. SUREST fix: build ONE integration in the Kissflow builder UI, GET
  /metadata/2/{acct}/integration/{id}/draft, and model buildIntegrationDraft on that exact blob. Also:
  create leaves an un-deletable record via public API (delete/turn-on are internal-auth) → test sparingly.
- 2026-07-02 [global] INTEGRATION DRAFT SCHEMA — CRACKED from golden-eval app exports (kf-framework/
  {KFSustainabilityApp,ProfServAppMetadata,ITAM}/integration/*/metadata — real flow→flow integrations).
  Required Trigger/Action extras beyond the connector: **Connection:{_id,Name}** (an account CONNECTION to
  the connector — the "Insufficient arguments" cause), IsInternalAuth, Integration back-ref,
  Connector.{Status,WebsiteURL}; trigger bound via Trigger::FieldMapping process_id[+step_id]; action via
  process_id/case_id + a FieldMapping/Property per field (Property.Type Value|Field|Expression).
  buildIntegrationDraft now emits all of this. HARD PREREQUISITE: the account must have a CONNECTION —
  GET /integration/2/{acct}/connection was EMPTY here, so wiring is blocked until one is provisioned
  (likely builder-UI/auth). Golden eval exports are the ground truth for connector/trigger/action shapes.
- 2026-07-02 [global] CONNECTIONS EXIST for system connectors — corrected: a live GET of a known
  connection id returns **403 (MBAC/Integration-Admin gated), NOT 404** — it's present, just not readable
  with a plain public key (hence the empty list). The connection ref lives in APP METADATA (each
  integration Trigger/Action carries `Connection:{_id,Name}`), so `connectionsFromExport(dir, fs)` harvests
  them from an app export (verified: ITAM → Process `Cn7vALgtsHcY`, Board, etc.). NET: the integration
  emitter's real blocker is AUTH SCOPE — connection-read + integration turn_on need Integration-Admin
  (MBAC), not a standard public API key. Source connection ids from app metadata; do turn_on via an
  admin credential or the builder UI.
- 2026-07-02 [global] AI SKELETON CREATOR (verified live) — Kissflow has a built-in AI that picks the
  trigger+action(s) from a prompt: POST /metadata/2/{acct}/integration/{id}/suggest/workflow {AIPrompt}.
  Auth = MBAC on the integration_id, so it WORKS with a normal API key on an integration YOU created
  (creator=admin) — NOT behind the connection MBAC wall. It returns triggers/actions + full connector
  metadata (Logo/Version). Live: "Valuation completes → update Market Value in NAV" → ItemCompleted +
  UpdateAnItem (matches our static catalog). Wired as `suggestSkeleton()`. So skeleton selection can be
  AI-driven; only connection-read + turn_on remain MBAC-gated. Also: save_draft on an integration you
  create returns 400 (schema), NOT 403 — so draft authoring is available with a normal key too.
- 2026-07-02 [global] INTEGRATION EMITTER — create→draft→publish SUCCEEDS live with a normal key once the
  Connection is included (create 200, putDraft 200, publish 200; only turn_on 403). BUT the published draft
  ERRORS in the builder ("There was an error / Reload" on trigger+action) because the blob is malformed vs
  the golden evals. THREE concrete gaps (from ITAM golden ItemCompleted→UpdateAnItem, same connection):
  (1) Connector.Version must be the version the CONNECTION is pinned to (ITAM conn Cn7vALgtsHcY = 3.2.1),
  NOT the live subscription version (3.7.5). (2) A source→target field map is Property `Type:"Field"`
  (structured binding, Value:null), NOT an expression string like `{{trigger.X}}`. (3) UPDATE actions need
  an LHSField/RHSField MATCH condition (which record to update). FIX PATH: clone the ITAM golden
  UpdateAnItem/CreateAndSubmitItem template exactly, parameterized by (source flow, target flow, field map,
  match field) — don't hand-guess the blob. Each live test also leaves an un-deletable record (test sparingly).
- 2026-07-02 [global] "AI skeleton" ≠ full draft. Kissflow's /suggest/workflow ONLY picks trigger+action
  (create_suggestion returns TriggersAndActions; it does NOT persist a draft) — which resolveSkeleton
  already replicates. The valid DRAFT is built by the BUILDER FRONTEND, which: fetches the target flow's
  FULL field schema and emits a FieldMapping PER field (Type = real field type; Object fields nest a `_id`
  child; Property is nested UNDER the field via `FieldMapping::Property`, attached only to MAPPED fields) +
  a form_id/process_id/instance_id target binding + LHSField/RHSField match for updates + the connection-
  pinned connector version. So a builder-valid emitter must enumerate the target schema into a typed
  FieldMapping graph — a real build, not a skeleton. Our emitter produces a correct skeleton; the builder
  errors on it because it lacks the full field graph. Pragmatic: emit skeleton, finish/activate in builder.
- 2026-07-02 [global] INTEGRATION FIELD-RESOLUTION is PLAN-GATED. The builder produces a valid draft
  (Output sample schemas + FULL target-field enumeration, ~58 FieldMappings) by calling a field resolver.
  The AI/agent resolver `POST /integration/2/{acct}/agent/connector/{cid}/{ver}/action/{aid}/fields/resolve`
  {connection_id, parent_values} → 403 "YourPlanNotSupport" (KISSFLOW_ERROR_00023) on this account. The
  non-agent `POST /integration/2/{acct}/{id}/detached/action/fields` {ActionMeta, ActionPayload} → 500
  (needs exact undocumented payload). NET: full auto-gen of a builder-valid draft is NOT reachable via the
  public API on this plan. Our emitter reliably does skeleton + create→draft→publish; finish field mappings
  + turn_on in the builder, OR upgrade the plan for the agent field resolver. Golden evals = ground truth.
- 2026-07-02 [global] CORRECTION — integration field-resolution is NOT plan-gated. The 403
  "YourPlanNotSupport" was the separate AI-AGENT product (`/agent/connector/.../fields/resolve`). The
  STANDARD builder resolver `POST /integration/2/{acct}/{integration_id}/detached/action/fields`
  {ActionMeta, ActionPayload} WORKS with a public key (200) — IF: (a) integration_id is a LIVE (not
  archived) integration you own, (b) ActionMeta is a full Action model (Kind/Type/Connector) with NO
  Connection (Kissflow Process connector uses INTERNAL auth → InternalAuthConnectionModel, no connection
  needed; passing a Connection._id that doesn't exist → 404 DocumentNotFound on IntegrationConnection).
  It returns the action's STATIC input fields (process_id, _id); the target's item fields are DYNAMIC
  (`_get_dynamic_fields` → perform_request to the Process API to list the flow's fields). The full field
  schema is also directly available: `GET /metadata/2/{acct}/process/{id}/draft` (Field entities Id/Name/
  Type). So replicating the builder IS possible with the public key — remaining: enumerate target fields +
  attach the Trigger `Output` sample (get_trigger_fields) + IsTested. This account has ZERO connections
  (empty /connection list was correct); internal-auth system connectors don't need one.
- 2026-07-02 [global] Connections are SELF-SERVE: POST /integration/2/{acc}/connection/{connectorId}/{version}/SystemApiKey {Name} → 200 (RBAC UserType:User — a plain public key works; LISTING connections is MBAC/403, CREATING is not). Platform mints its OWN system key server-side — caller supplies NO credential. This IS the builder's "internal auth". Verified live: the Process connector (discovered from /subscription) → a system-key connection. Emitter: provisionSystemConnection()/ensureConnections(); buildIntegrationDraft attaches it (IsInternalAuth:false+Connection) or falls back to steps-only. Only turn_on stays internal-auth (403 w/ public key → activate in builder).
- 2026-07-02 [global] Full integration field-mapping (buildIntegrationDraftFull): Trigger::FieldMapping process_id=Value:[srcFlowId] + Trigger.Output sample (drives builder Smart-mapping); Action::FieldMapping process_id=Value:[tgtFlowId] + per field {Name:<targetFieldId>, Type:fmType, Property Type:Field Field:`context.<triggerEntityId>.<srcFieldId>` | Type:Value for quoted literals}. Field refs resolve label→id via flow.fields. VERIFIED live: renders in builder Smart-field-mapping (NAV_A07 target + Average_Valuation source binding). CAVEAT: UpdateAnItem REQUIRES a record locator `_id` — an EMPTY _id → "Invalid payload sent". Emit _id ONLY when action.key_field names a source ref holding the target _id; else omit + flag `_unresolved` (user selects record / adds a Search step). CREATE stitches have no _id problem → fully complete.
- 2026-07-02 [global] CORRECT integration field-mapping = SERVER-RESOLVED, 2-pass (engine applyIntegrationResolved): (1) create + PUT skeleton whose trigger/action carry process_id (Value:[flowId]); (2) GET /integration/2/{acc}/{intId}/action/{actionEntityId}/fields (rbac User + mbac Admin → works for the creator; returns [{Name,Label,Type,IsRequired,IsDropdown}] for the picked process) — 200; (3) rebuild FieldMappings in GOLDEN shape from that schema (ENUMERATE every target field; Property only where mapped) + PUT full + publish. Hand-crafting FMs FAILS ("mapping failed"/"Invalid payload") because FMs need FieldId + Label + IsRequired + IsDropdown + (process_id:) SelectedDropdown:[{FieldId:flowId,FieldName}] + Trigger/Action back-ref, and system-field ids (process_id=Field008/ActionField002, _id=ActionField003) — all from the resolver, not guesswork. VERIFIED live in builder (user confirmed). See [[project_appsdk_kissflow_builder]].
- 2026-07-02 [global] Integration Action entity-level `Type` is ALWAYS "Create" — UpdateAnItem AND CreateAndSubmitItem both use Type:"Create" across every golden eval. The Connector.ActionId (not Type) distinguishes update vs create. Setting Type:"Update" makes the builder reject the config. (Fixed in buildIntegrationDraft.)
- 2026-07-02 [global] CREATE stitches map fully & cleanly (resolved schema has NO _id → nothing unresolved). UPDATE needs a record-locator _id (Property Type:Field → context.<trigger>.<refFieldId>) that only exists when the SOURCE flow has a field holding the TARGET instance id (golden: ESG Goal.Material_Assessment_Instance_ID). Emit _id only when automation.action.key_field names such a ref; else flag it (user picks record / adds a Search step). Verified live: create SPV_POA→Payment (26 fields, 0 unresolved), update Valuation→NAV (17 fields, _id flagged).
- 2026-07-02 [global] Flow-type CLASSIFICATION (Dinesh's rule — data-modeling primitives, not UX choices): PROCESS = structured workflow (system-routed sequential steps/approvals). BOARD (Kissflow Case flow) = data object with UNSTRUCTURED workflow — every step moved by the USER (free status movement): todos, tasks, projects, AND case use-cases (service requests, support, onboarding). DATAFORM/Form = no workflow (plain record). DATASET/List = reference option lists. So the data-architect MUST emit a Board for unstructured/case entities — not force them into Process or Form.
- 2026-07-02 [global] buildBoard(spec, appId, idmap) EXISTS (engine/builders.mjs) — golden-eval shape (ProfServ Projects/Enquiry/Tasks): Model FlowType:"Case" (via buildForm) + a SEPARATE CaseFlow blob {CaseFlow{Model,Type:Case,FlowType:CaseFlow,CaseFlow::Status[],CaseFlow::State[]} + Status{Name,Category:NotStarted|InProgress|Done|Closed|ReOpened,IsSystem,Resources[],OutwardStatus[],EntryRule/ExitRule/Rule[],SLADisabled} + 4 system States(Not started=default, Done=last)}. Unstructured ⇒ each Status.OutwardStatus = every OTHER status. spec.statuses=[{name,category?}] (defaults To Do→In Progress→Done); adds a system Reopened. buildApp routes flowType Board/Case (or a form declaring `statuses`) to buildBoard + emits the caseflow artifact. TODO(live): client.mjs applyIR publish loop only handles list/form/process/case — the "caseflow" artifact (statuses) still needs GET-draft→graft→PUT→publish wiring (caseflow is auto-created with the Case; id ~ <model>_A00).
- 2026-07-02 [global] LIVE board (Case) publish recipe — VERIFIED working for form+steps: (1) create shell POST /flow/2/{acc}/case/?_application_id={app} {Name,Description,Prefix,ItemType} → 200 (Prefix+ItemType REQUIRED; missing → 400 MissingRequiredFieldError); returns modelId + flow doc has _default_workflow_id = <model>_flow_A00 (the caseflow id). (2) FORM: GET/PUT /metadata/2/{acc}/case/{caseId}/draft (graft fields onto the server model draft — it ships default Summary/Description/Attachment; append your Model::Field + Model::Row) → POST .../publish. (3) BOARD STEPS: GET/PUT /metadata/2/{acc}/case/{caseId}/caseflow/{cfId}/draft (swap CaseFlow::Status + ::State for buildBoard's) → POST .../caseflow/{cfId}/publish. All 200, API-verified on a dev task board (columns To Do→In Progress→Blocked→Done→Reopened). (4) VIEW = KANBAN caseview (this is what makes it render as a BOARD, not a workflow): POST /flow/2/{acc}/case/{caseId}/caseview/ {Name, ViewType:"Kanban"} → 200 — creates the Kanban view AND auto-generates the full default view set (All/Assigned to me/Overdue/… all Kanban). WITHOUT a Kanban caseview the case shows as a WORKFLOW (status graph) + blank runtime. (The /caseview/default endpoint 500s — use the single create instead.) ViewCreateSchema = {Name(req), ViewType(req, OneOf), SharedWith?}. FULL live board = case shell + form(model draft) + board steps(caseflow) + Kanban caseview, all API-verified. TODO: codify into client.mjs applyIR (emit case+caseflow+caseview artifacts).
- 2026-07-02 [global] Kissflow PAGE component flow-binding lives in the COMPONENT-CONTAINER's `Container::FieldMapping` (each = FieldMapping{Name,Container,FieldMapping::Property:[Property{Type:"Value",Value}]}) — NOT the component's Data object (Data is display metadata only). Setting only Data.flow_id → runtime reads `undefined` (case/undefined, undefined_all). A CaseViewKanban board component needs its container to carry: flow_id=<caseId>, flow_type="case"(lowercase!), view_id=<caseview id e.g. <case>_all>, showform=true, filterParameters(Type:"FilterParam"). Component itself = {Script:{web:"view/kanban"}, Data:{manifest_id:"Kanban",category:"view",visualization_type:"kanban",flow_type:"Case",flow_id,view_id} — NOTE: "CaseViewKanban"/"case/views/kanban"/category:"Case" is the OLD/deprecated manifest (ProfServ golden) and RENDERS "board view not found"; the CURRENT manifest is "Kanban"/"view/kanban"/category:"view" (verified vs working Retail_Store Projects_Kanban page). Container also carries Container::EventMapping(on_card_click Redirection) + Container::VariableRef(_id) for click-to-open (optional) + Style {Value:{"Kanban.Height":{value:"100%"}}}}. Labels/Buttons bind text the same way: label→title/fontSize/color FieldMappings; button→caption/size + an EventMapping{Name:"on_click",Type:"OpenPopup"}. Page graph: Page→Body Container→child Containers(ref parent via `Container`, not Page; Body refs Page)→Component-container(Type:"Component")→leaf Component. Verified live building a deal-pipeline board + page in a dev app.
- 2026-07-02 [global] ROOT CAUSE of "board view not found" when embedding an API-created board in a page: the case had ZERO MEMBERS. A board's SYSTEM views (incl. _all) are only returned by get_my_shared_views() if the viewing user is_case_user (has case membership/permission) — else system_views=[] and the page component's view lookup fails. The Kissflow UI auto-grants app roles to the case on build; the API does NOT. FIX (final step of the live board recipe): POST /flow/2/{acc}/case/{caseId}/member/batch?_application_id={app} with a list of {_id:<roleId>, Name:<roleName>, Kind:"AppRole", Role:"Admin", Permission:[]} for the app's roles (GET /app_role/2/{acc}/list?_application_id={app}). Verified: members 0→10 flipped the case's CaseView field 0→10 and resolved the kanban. This was NOT the component manifest (though also fix that: current manifest is "Kanban"/"view/kanban"/category "view", NOT the deprecated "CaseViewKanban"/"case/views/kanban"/"Case"). Diagnosed by comparing case /member + CaseView of a working UI-built board (Retail_Store Projects_A00 = 9 members/9 views) vs mine (0/0).
- 2026-07-02 [global] Default "New <Item>" button for a kanban/board page (current manifests, verified vs Retail Operations page): BUTTON = Component{Script:{web:"general/button"},Data:{manifest_id:"Button",category:"general",subcategory:"system",visualization_type:"button"}} in a Container(Component) with Container::FieldMapping[caption,size:"medium",type:"primary",iconPosition:"left"] + Container::EventMapping[{Name:"on_click",Type:"OpenPopup",Property{Type:"Popup",Value:<popupId>}}]. POPUP = Popup{Script:{web:"general/popup"},Popup::Container:[popCont],Popup::Style}; popCont is a Container with **Type:"Popup"** (+ Popup:<popupId>) → Container::Container:[formCont]; formCont is Container(Component) → Container::Component:[form] + **Container::FieldMapping[flow_id, flow_type:"Case"]** (flow binding lives in the CONTAINER, not Data — same rule as kanban) + Container::EventMapping[on_submit,on_discard = JSAction Code `let c=await kf.app.page.getComponent("<kanbanId>");c.refresh();kf.app.page.popup.close()`]. FORM component = {Script:{web:"view/form"},Data:{manifest_id:"Form",category:"view",visualization_type:"form",flow_type:"Case",flow_id}} (NOT the deprecated "case/form"/category:"Case"). Register popup in Page::Popup. Gotchas that broke it first: popCont was Type:"Component" (must be "Popup"); form flow binding only in Data (must be in container FieldMapping); reordering body children mid-edit left a stray empty container (clean-rebuild the page instead).
- 2026-07-02 [global] CONSOLIDATED — Boards + Kanban pages are now codified: engine/builders.mjs `buildBoard` (Case model+CaseFlow) and `buildKanbanPage` (page graph: header + New-<Item> button + create-form popup + kanban, all CURRENT manifests + container-bound); engine/board-live.mjs `applyBoardLive` (7-step live: case shell→form+Appearance→steps→Kanban view→**grantCaseMembers**) + `applyKanbanPage` + `grantCaseMembers`. 122 tests pass. Full recipe + every gotcha in reference/BOARD-AND-KANBAN-PAGE.md; the Process-vs-Board-vs-Form-vs-Dataset decision + per-type build flow in reference/PROCESS-VS-BOARD.md. Verified end-to-end live (a deal-pipeline board + page + seeded items in a dev app).
- 2026-07-02 [global] NEW plugin commands: `/add-flow "<ask>" [--type process|board|form|dataset] [--app] [--page]` — adds ONE flow to an EXISTING app via the SAME full agent pipeline (kf-comprehension import → kf-ba → kf-architect classifies type per reference/PROCESS-VS-BOARD.md → kf-data-architect → workflow-designer(process)/board-steps(board) → kf-security-designer → kf-experience-designer(page) → kf-integration-analyst(stitches) → kf-coherence-critic → kf-verifier → kf-reconciler minimal-diff apply). Board apply routes through engine/board-live.mjs applyBoardLive (+applyKanbanPage). `/add-board` = board specialization (page on by default, --seed N to populate). NOT a single-agent shortcut — involves every relevant agent, canonical order, verifier-gated. commands/add-flow.md, commands/add-board.md.
- 2026-07-02 [global] AUTONOMY DEFAULT — the user never has to name agents, steps, or the flow type. From the requirement (+ the imported app) INFER intent and AUTO-INVOKE exactly the agents it needs, in canonical order, verifier-gated. Signals→agents: always kf-comprehension+kf-ba+kf-architect+kf-data-architect+kf-security-designer+kf-coherence-critic+kf-verifier+kf-reconciler; "approve/route/SLA/step"→process→+kf-workflow-designer; "pipeline/board/kanban/track/tickets/onboarding/drag"→board→+board-steps(buildBoard)+kf-experience-designer(Kanban page via buildKanbanPage/board-live.mjs); "list/master/lookup"→dataset/form→skip workflow; "on <event> create/update <flow>"→+kf-integration-analyst; "so <role> can see/work it"→+kf-experience-designer(page+nav). Skip irrelevant agents; add implied ones. Only STOP for a BLOCKING ambiguity after inference (record assumptions in open-questions.md) — never make the user drive the pipeline. Applies to /add-flow, /add-board, /author-app and any requirement stated in chat. Ref: reference/PROCESS-VS-BOARD.md.
- 2026-07-03 [global] Engine integrations = EXACTLY 1 Trigger + 1 Action; item-level trigger events only (no field-change trigger — updated maps to step-advance), field_map = source-field copy or quoted literal (NO arithmetic/increment), no per-child-row iteration/multi-create, no child-table-row updates, and Condition exists ONLY in the stub buildAutomation blob (live connector path emits none) — never design stitches that spawn N children, increment counters, fire on field edits, or set flags needing sibling-instance state; use aggregate/Count fields or pull-model creation (actor self-initiates from a scoped ledger view) instead.
- 2026-07-03 [global] addWorkflow HARDCODES per-step field permissions (Editable at StartEvent, ReadOnly at every later step, all columns) and ir.mjs permissions are flow-level only — NO mid-flow edit (approver comments, rates, child-table row edits) is buildable until addWorkflow/IR gain per-step permission overrides; verify this precondition before any workflow step that needs mid-flow data entry.
- 2026-07-03 [global] addAggregate emits QueryDefinition with LookupField:[] and NO filter param — only aggregates over an EMBEDDED child table are verified; a cross-flow aggregate (parent counting a referencing flow's instances) has no join condition as-built and cannot filter by status. Design gate signals as embedded filtered lists first, numeric aggregates only after verifying the join.
- 2026-07-03 [global] Engine builders do NOT compile reference filter criteria — enrichLookup consumes only autofill/sortBy; a `filter` on a Reference field is documentation, not enforcement (dependent/filtered lookups need lookup-column visibility + workflow-step discipline instead).
- 2026-07-03 [global] Selects ALWAYS materialize a backing List at build (buildApp auto-creates one named after the field when unwired) — "inline options, no list flows" is impossible; author explicit app-prefixed lists to control account-global names.
- 2026-07-03 [global] Reference-field `filter` intent is SILENTLY DROPPED by the builders (no compilation path; enrichLookup = autofill/sortBy only) — never rely on data-side reference filters for gates. (The other half of this lesson — QD FlowType hardcoded "Form" — is FIXED: builders now thread a flowTypes map and emit the target's real flow type, R15.)
- 2026-07-03 [global] data_model.views are design intent consumed by NOTHING in the build; page cards (experience.mjs) filter by status|groupBy only — per-record contextual lists need a buildPage extension. No conditional-required primitive exists (Field.Required is static); Kissflow native reject-comment prompt is the only mandatory-comment cover — verify at workflow step.
- 2026-07-03 [global] addWorkflow ignores `actor` on Start/EndEvent (no Resource emitted — initiator is whoever creates the item; assignees only on middle UserTasks) and StartEvent defaults Editable on ALL fields incl. child tables — ALWAYS override approver/outcome fields to ReadOnly at Start or the initiator can pre-fill decisions (e.g. fake an MD approval gate). Terminal user action needs its own UserTask before End.
- 2026-07-03 [global] Step-level `Mandatory` is UNCONDITIONAL at that step — use it only where the step exists to record that field (decision selects at approval steps); never to fake conditional-mandatory (reject comments/change reasons) — cover those via Kissflow's native Reject/Send-back mandatory-comment prompt (+ platform login = digital auth) and record the residual for waiver. Avoid Mandatory on Booleans (unchecked ≈ unset).
- 2026-07-03 [global] R11/R15 engine extensions landed + verified (122/122): workflow steps take field_permissions {field|child-table: Editable|ReadOnly|Hidden|Mandatory} (Mandatory = required-at-step; defaults unchanged), and reference QDs now emit the target's TRUE FlowType. Two authoring rules: (1) ALWAYS append a terminal "End" marker step — addWorkflow makes the LAST step a no-assignee EndEvent, so the last actionable step must not be final; (2) override aggregates to ReadOnly at Start for hygiene (default Editable grant is ignored by the Aggregation widget but is sloppy).
- 2026-07-03 [global] Live permission semantics (client.mjs): an ir.permissions entry = flow membership + report View on ALL reports (all-items read — scope is view-convention, not row security). Forms/Case: Editable→Member+[Delete], ReadOnly→Viewer; PROCESS: any entry→Member+[]=Initiate (NO read-only process membership — a ReadOnly process grant still lets the role raise the flow; gate "+ New" at the experience layer). fields[] on FlowPermission is artifact-only (never applied live) — don't author it as if it enforces.
- 2026-07-03 [global] PAGE-DRIVEN ACCESS AUTO-GRANT (client.mjs L285) can silently breach a view-gate: any flow referenced by a card/nav a role can see gets membership+report View at apply — a deliberate no-access cell (e.g. Marketing×plant-estimation) MUST be paired with an experience rule forbidding that flow on that role's surfaces.
- 2026-07-03 [global] PAGE-DRIVEN ACCESS AUTO-GRANT (client.mjs ~L285): applying pages grants the page's role Member[InitiateItems,View] on EVERY flow its cards reference (nav visibleTo submenus too) and every explicit permission gets report Member[View] = ALL items — so (1) a view-gated role must have ZERO cards/nav sourcing the gated flow on any of its surfaces, (2) data_scope (my-items etc.) is CONVENTION not enforcement live, (3) any process member can Initiate (single-level membership). Design gates accordingly; use email-notify stitches for cross-flow signals a gated role may not see.
- 2026-07-03 [global] FORM auto-grant ESCALATES viewers: page-driven access (client.mjs) grants Member+[Delete] (EDIT) on every FORM a page's role/nav-visibleTo references — NEVER put a form card (or nav visibleTo) on a read-only role's surface; read-only form access = native views via the explicit Viewer entry (its report View). Process cards only add the already-known Member[]=Initiate (SEC-1).
- 2026-07-03 [global] Nav submenus target PAGES ONLY (SubMenu→FieldMapping→Property Type:"Page"; PropertyTypes enum has no Flow/Report) — "nav → native flow report" is not compilable; deliver a nav page springboard + the role's report-View grant + an apply-checklist pin.
- 2026-07-03 [global] buildPage/transformer has NO Case component (DataformTable/FormView emit flow_type "Form"; catalog lacks Kanban) — never put a Board/Case card on an ir.pages page; a board's page = applyKanbanPage (board-live.mjs) at apply + hand-wired nav. Case auto-grant even uses the wrong URL family.
- 2026-07-03 [global] buildPage KPI cards are STATIC (icon+labels, no data binding, no live counts) — omit source_flow on them (flowsOf counts kpi cards → pointless auto-grants); never promise live KPI numbers.
- 2026-07-03 [global] ensureExperience auto-adds a worklist page per Process flow unless a non-landing page named EXACTLY like the flow exists — name each flow's focused sub-menu page exactly as the flow, and flag role dashboards landing:true, to keep the baseline generator silent.
- 2026-07-03 [global] PERSONA_NO_LANDING matcher (ir.mjs L141-146) compares page.role to persona.name/id with NO persona→role mapping — false-positives whenever role names differ from persona names; check landings manually and consider wiring architecture.roles[].from_personas into the check. Nav submenus target Pages ONLY (no Flow/Report Property type) — "nav→report" intents need a pointer page or apply-time pinning.
- 2026-07-03 [global] IR `notify` stitches are UNAPPLYABLE as-is on the live connector path: resolveSkeleton maps type:'notify' → PROCESS connector + CreateAndSubmitItem on the target flow (would CREATE a spurious item!), and the Email/SendEmail branch keys on /email/i.test(action.type) which valid IR ('notify' is the only allowed value) never satisfies — every notify stitch needs an apply-time shim to the email branch (or builder wiring: <trigger> + Email SendEmail; To/Subject/Body are builder-mapped anyway per buildIntegrationDraftFull). Fix candidates: route notify→email in resolveSkeleton, or accept 'notify' in the email test.
- 2026-07-03 [global] UpdateAnItem key_field on an Object-typed parent Reference: the emitter binds `context.<trigger>.<refFieldId>` with NO ._id subpath (integrations.mjs L313/L412) while the _id locator is String — pass the ref field as key_field, then NARROW to ._id in the builder Smart-mapping (same for Object→Text field_map copies, e.g. Plant → .Name); a validated stitch still needs this one-time builder pass.
- 2026-07-03 [global] NOTIFY-STITCH TRAP: ir.mjs only allows action.type create|update|notify, but resolveSkeleton maps notify → PROCESS connector + CreateAndSubmitItem and the /email/i branch is unreachable from valid IR — a notify automation applied naively CREATES a spurious item in its (mandatory) target_flow. Engine fix: extend the /email/i tests to /email|notify/i in buildIntegrationDraft/Full + applyIntegration key selection (+test). Until landed, HARD-GATE any apply containing a notify stitch. Also: buildAutomation stub Connector entity triggers a cosmetic ORPHAN_ENTITY warning on every automation build.
- 2026-07-03 [global] INT-C2 notify gap FIXED in engine (superseding the 2026-07-03 notify-shim lesson): resolveSkeleton + buildIntegrationDraft(/Full) + both apply paths now route type:'notify' → Email connector + SendEmail (verified live; /email|notify/i everywhere) — notify stitches apply without a shim; To/Subject/Body remain builder-mapped.
- 2026-07-03 [global] App/flow `Description` > 250 chars → bare HTTP 413 (no error body) on create. clampDesc in client.mjs createApp/createFlow now truncates at a word boundary — keep IR descriptions ≤250 or accept the "…".
- 2026-07-03 [global] Aggregate QD live-publish shape (npd-plm): REQUIRES `LHSRootModel` (parent model id) + `FlowType` of the PARENT flow (not "Form" default) + `AggregateField` EVEN FOR COUNT (defaults to child's first field — buildApp post-pass). Missing any → publish 500 QueryDefinitionValidationException naming the field. builders.mjs fixed + test updated.
- 2026-07-03 [global] client.mjs applyIR now creates `case` shells with Prefix+ItemType (was 400 MissingRequiredFieldError) — but the generic PASS-2 graft still doesn't do caseflow/statuses/kanban view; route boards through board-live.mjs applyBoardLive. applyBoardLive now takes (…, idmap, flowTypes) — passing {} leaves Reference QDs AND Select `ReferredList` as unresolved gen ids → model publish 500s with an OPAQUE MetadataError (diagnose by field-bisection; Document_Type/ReferredList was the npd-plm offender).
- 2026-07-03 [global] Case member/batch REJECTS Permission:["Delete"] (UnsupportedPermissionError) — case members are Role Member|Viewer|Admin with Permission:[] only. applyIR's form-style member payload is wrong for cases.
- 2026-07-03 [global] applyIR publish-failure report used to log the DRAFT body instead of the PUBLISH error (fixed) — if you see draft=200 publish=500 with a blob echo, re-POST the publish endpoint to get the real error.
- 2026-07-03 [global] CORRECTION (supersedes "integration author route is internal-only → defer live write"): integration CREATE + draft-map + PUBLISH all work with a standard public API key — applyIntegrationResolved ran end-to-end live (npd-plm s1 fully mapped incl. live resolveEntityFields=14, s5 email action w/ builder-deferred To/Subject/Body; both Status Live + IsActive:false). ONLY the on/off toggle and email-connection provisioning need Integration-Admin. Process/dataset/board/project CONNECTIONS were readable with the public key on this account. So: always CREATE integrations at apply (never auto-activate); INT-C1 ._id subpath still verified in builder before turn-on.
- 2026-07-03 [global] TIMELINE instrumentation — every run should have runs/<id>/timeline.jsonl: engine cli AUTO-stamps verify/build/apply start+end (set KF_ACTOR=<agent> so the span is attributed to you) and runs.mjs marks every snapshot; agents SHOULD bracket long work with `node engine/timeline.mjs start|end "<agent>" "<step>" --run <runDir>`; `node engine/timeline.mjs report <runDir>` prints total wall-clock + per-actor durations. Instrumentation is try/catch-silent — it can never break a build.
- 2026-07-04 [global] APPLY IS PARALLELIZED (client.mjs pMap): shells 5-wide, draft+publish 4-wide, permission grants 5-wide + per-flow report-list cache — measured on the P2P spec: apply 90s → 47s (shells 9→3s, bodies 14→3s, grants 21→3s). PASS-1→PASS-2 barrier retained (remap needs all server ids). Remaining costs: page/nav transformer spawns (~22s, next target: batch one python call) + API latency floor.
- 2026-07-04 [global] A PUBLISHED app cannot be archived over the public API (archive → 403; delete blocked without archive) — only never-published Draft apps clean up. Do NOT create throwaway apps casually on shared accounts; name unavoidable benchmarks clearly (e.g. "P2P Perf Benchmark", left on dev-lcncdemo 2026-07-04).
- 2026-07-04 [global] R7 SUPERSEDED — CROSS-FLOW PER-ITEM AGGREGATION IS EXPRESSIBLE and live-verified (P2P Suite: PR.Total Estimated Cost = SUM(Requisition Line Item.Line Total) joined per-item; PO.Order Amount likewise): QD {LHSModel:<target flow>, LHSModelApplicationId:<app>, FlowType:<target's type>, AggregateField, AggregateType, QueryDefinition::Criteria→Condition {LHSField:<target's ref field>, EQUAL_TO, RHSType:Field, RHSField:"_id"}} — NO LHSRootModel (that's only for embedded child tables). Golden source: ITAM Asset_Disposal "Repair costs until now". Engine: f.aggregate.match={field,equals?} emits this shape. IMPLICATION for npd-plm: the Plants-Routed advisory gate could become a REAL per-sheet count over plant-estimation.
- 2026-07-04 [global] DEF-4 **SOLVED** (supersedes the flatten/promote-to-form guidance): the graft dissolved child tables because addChildTable never declared the child on the parent via **Model::Model** — one line, found by diffing the golden Employee_Leave_Request export, live-verified on P2P Suite (PR req_lines + PO po_lines both runtime-visible with working LHSRootModel aggregates). Embedded child tables are FIRST-CLASS again; standalone line-item form + cross-flow match aggregate remains a valid ALTERNATIVE when rows must be referenced cross-flow. NOTE the runtime gate parse: /process/2/{acc}/{id}/allfields returns {"<flowId>": {Tables:[...]}} — keyed by flow id, NOT top-level Tables (a wrong parse reproduces the 'defect' after it's fixed).
- 2026-07-04 [global] **"Process formulas strip on publish" is FALSE — retire it** (confirmed by the platform owner; empirically: nothing was ever stripped — drafts retain Expressions through publish, and child-table column formulas are live-verified working on P2P Suite). The historical "stripping" observation traced to OUR early malformed Expression ASTs (the empty-node era), not platform behavior. Kissflow does not strip formulas; author process computed fields normally (engine compileFormula emits the golden shape). Update LESSONS §1b accordingly.
- 2026-07-04 [global] OWNER VERDICTS on the confirmation queue (Trustworthy Memory): **Q1 DENIED** — the platform SUPPORTS parallel branches + conditional skips in workflows [tier:owner-confirmed]; addWorkflow's Sequence-only output is an ENGINE GAP. **Q2 CONFIRMED** — no conditional-mandatory primitive exists [tier:owner-confirmed]; the R14 optional+convention pattern is the correct design. **Q3 DENIED** — row-level report scoping EXISTS [tier:owner-confirmed]; "report View = all items" was an engine/knowledge gap, and SEC-R2-style "scope is convention" waivers must be revisited once the engine learns the scoping shape. Discovery work queued for the branch and report-scope metadata shapes (golden exports / platform source / UI-built samples).
- 2026-07-04 [global] Q4 CONFIRMED by platform owner [tier:owner-confirmed]: integrations have NO field-change trigger — item-level events (created/submitted/completed/advances) are the full trigger vocabulary. Pull surfaces (scoped ledger views) remain the correct pattern for field-edit signals; do not design speculative edit-stitches.
- 2026-07-04 [global] Q6 CONFIRMED by platform owner [tier:owner-confirmed]: published apps cannot be archived/deleted via the public API — throwaway/benchmark apps on shared accounts are permanent; create them rarely and name them unmistakably.
