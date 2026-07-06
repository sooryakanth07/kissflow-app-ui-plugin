# Kissflow Boards (Case flows) + embedding a Kanban on a Page — the complete recipe

Ground truth from the platform source (`kissflow-xg`) + diffing a live UI-built board
(`Retail_Store_Management` → `Projects_A00` / `Projects_Kanban_S` page) against an API-built one.
Every step below is live-verified. This is what `engine/builders.mjs` `buildBoard`/`buildKanbanPage`
and the live helpers in `engine/board-live.mjs` emit. **App-agnostic.**

## What a Board IS (Dinesh's rule — a data-modeling primitive, not a UX choice)
- **Process** = STRUCTURED workflow (system-routed sequential steps / approvals).
- **Board** (Kissflow **Case** flow) = data object with an **UNSTRUCTURED** workflow — the user moves
  each card between status columns freely: todos, tasks, projects, AND case use-cases (service
  requests, support, onboarding). `FlowType:"Case"` internally; the product calls it "Board".
- **Dataform/Form** = no workflow. **Dataset/List** = reference option lists.
So the data-architect MUST emit a Board for unstructured / case entities — not force them into Process/Form.

## The 7-step live recipe (ALL required — skipping any leaves a broken board)
1. **Case shell** — `POST /flow/2/{acc}/case/?_application_id={app}` `{Name, Description, Prefix, ItemType}`
   → 200, returns `modelId`. `Prefix` + `ItemType` are REQUIRED (missing → 400 MissingRequiredFieldError).
   The flow doc's `_default_workflow_id` = `{modelId}_flow_A00` (the caseflow id).
2. **Form (the case model's fields)** — `GET/PUT /metadata/2/{acc}/case/{caseId}/draft` → `POST .../publish`.
   The starter model already ships default `Summary` (title, REQUIRED on item create) / `Description` /
   `Attachment`. Graft your fields: append their entities + your `Model::Field` ids + top-level
   `Model::Row`. **Add `Model::Appearance`** (an `Appearance` + `Style` pair) — every UI-built board model
   carries it; `buildForm` omits it and the board is structurally incomplete without it.
3. **Board steps (the status columns)** — `GET/PUT /metadata/2/{acc}/case/{caseId}/caseflow/{cfId}/draft`
   → `POST .../caseflow/{cfId}/publish`. Swap `CaseFlow::Status` + `CaseFlow::State`:
   - **Status** = a column: `{Id, Kind:"Status", Name, Category:NotStarted|InProgress|Done|Closed|ReOpened,
     IsSystem, Resources:[], OutwardStatus:[…], EntryRule:[], ExitRule:[], Rule:[], SLADisabled:false}`.
     UNSTRUCTURED ⇒ each Status's `OutwardStatus` lists **every other** status (free movement). Add a
     system `Reopened`.
   - **State** = the 4 fixed system swimlanes: `Not started`(default), `In progress`, `On hold`, `Done`(last).
4. **Kanban caseview** — `POST /flow/2/{acc}/case/{caseId}/caseview/` `{Name, ViewType:"Kanban"}` → 200.
   Also auto-creates the system view set (`{caseId}_all`, assigned_to_me, …). WITHOUT a Kanban caseview
   the case shows as a workflow/status graph (`_default_view_id:null`) and the runtime is blank.
   The view's schema (`GET .../caseview/{viewId}/schema`) auto-carries `GroupBy:{Column:"_status_id"}` +
   `Visualization:"Kanban"` — nothing to author there. (`/caseview/default` 500s — use the single create.)
5. **Grant case members** ⭐ THE STEP EVERYONE MISSES — `POST /flow/2/{acc}/case/{caseId}/member/batch?_application_id={app}`
   with the app's roles: `[{_id:<roleId>, Name:<roleName>, Kind:"AppRole", Role:"Admin", Permission:[]}]`
   (roles from `GET /app_role/2/{acc}/list?_application_id={app}`). **A board's SYSTEM views (incl.
   `_all`) are only returned by `get_my_shared_views()` if the viewer is a case-user (has case
   membership).** No members → `is_case_user:false` → system views hidden → a page embed shows
   **"The {caseId}_all board view is not found"** even though the case, view, and schema are all perfect.
   The Kissflow UI auto-grants roles on build; the API does NOT. (Diagnosed: working board = 9 members /
   9 registered views in the case's `CaseView` field; API-built = 0 / 0.)
6. **Page shell** — `POST /flow/2/{acc}/application/{appId}/page/` `{Name}` → `GET/PUT
   /metadata/2/{acc}/application/{appId}/page/{pageId}/draft` → `POST .../publish`. (Page metadata is
   APP-scoped.)
7. **Embed the Kanban component** — see the page-graph shapes below.

## Page component shapes (CURRENT manifests — the deprecated ones RENDER "board view not found")
The runtime reads a component's **flow binding from its CONTAINER's `Container::FieldMapping`**, NOT the
component's `Data` (Data is display metadata). This is the #1 gotcha and applies to kanban AND form.

**Kanban** (verified vs Retail `Projects_Kanban_S`):
```
Component  { Script:{web:"view/kanban"},
             Data:{manifest_id:"Kanban", category:"view", visualization_type:"kanban",
                   flow_type:"Case", flow_id:<caseId>, view_id:<caseId>_all} }
its Container(Type:"Component")  Container::FieldMapping (the REAL binding):
   flow_type="Case", flow_id=<caseId>, view_id=<caseId>_all, showform=false, filterParameters(Type:"FilterParam")
   Container::Style { Value:{ "Kanban.Height":{value:"100%"} } }
   (optional) Container::EventMapping on_card_click(Type:"Redirection") + Container::VariableRef(_id) — click-to-open
```
> ⛔ DEPRECATED (from the ProfServ golden eval — DO NOT USE): `Script:{web:"case/views/kanban"}`,
> `manifest_id:"CaseViewKanban"`, `category:"Case"`. The current runtime can't load it → "board view not found".

**Default "New \<Item\>" button + create-form popup** (verified vs Retail `Operations` page):
```
Button   { Script:{web:"general/button"}, Data:{manifest_id:"Button", category:"general",
           subcategory:"system", visualization_type:"button"} }
 its Container  Container::FieldMapping[ caption:"New <Item>", size:"medium", type:"primary", iconPosition:"left" ]
                Container::EventMapping[ {Name:"on_click", Type:"OpenPopup", Property{Type:"Popup", Value:<popupId>}} ]
Popup    { Script:{web:"general/popup"}, Popup::Container:[popCont], Popup::Style }   (register in Page::Popup)
 popCont  Container with **Type:"Popup"** (+ Popup:<popupId>) → Container::Container:[formCont]
 formCont Container(Type:"Component") → Container::Component:[form]
          Container::FieldMapping[ flow_id:<caseId>, flow_type:"Case" ]   ← binding in the CONTAINER
          Container::EventMapping[ on_submit, on_discard = JSAction, Property{Type:"Code", Value:
            `let c = await kf.app.page.getComponent("<kanbanId>"); c.refresh(); kf.app.page.popup.close()` } ]
Form     { Script:{web:"view/form"}, Data:{manifest_id:"Form", category:"view",
           visualization_type:"form", flow_type:"Case", flow_id:<caseId>} }
```
> ⛔ DEPRECATED form: `Script:{web:"case/form"}`, `category:"Case"`. Current is `view/form` / `manifest_id:"Form"` / `category:"view"`.

## Page graph nesting (Page → Body → …)
`Page{Page::Container:[Body], Page::Component:[flat list of all leaf components], Page::Popup:[…]}`.
`Body` Container (`Type:"Body"`) refs `Page`; every **child** container refs its parent via `Container`
(not `Page`). Component-container `Type:"Component"` holds ONE leaf Component. Every container carries a
`Container::Style`. **Don't reorder Body children mid-edit** — it leaves a stray empty container; rebuild
the page graph from scratch.

## Item create (to seed a board)
`POST /case/2/{acc}/{caseId}?_application_id={app}` with field values — `Summary` is REQUIRED (the item
title). New items land in the first status. Move a card: `PUT /case/2/{acc}/{caseId}/{itemId}/{statusId}/move`.

## Endpoint quick-reference
| Purpose | Method + path |
|---|---|
| create case shell | `POST /flow/2/{acc}/case/?_application_id={app}` `{Name,Description,Prefix,ItemType}` |
| model (form) draft/publish | `GET/PUT /metadata/2/{acc}/case/{caseId}/draft` · `POST …/publish` |
| caseflow (steps) draft/publish | `GET/PUT /metadata/2/{acc}/case/{caseId}/caseflow/{cfId}/draft` · `POST …/publish` |
| kanban caseview | `POST /flow/2/{acc}/case/{caseId}/caseview/` `{Name,ViewType:"Kanban"}` |
| view schema (verify) | `GET /metadata/2/{acc}/case/{caseId}/caseview/{viewId}/schema` |
| **grant case members** | `POST /flow/2/{acc}/case/{caseId}/member/batch?_application_id={app}` |
| app roles | `GET /app_role/2/{acc}/list?_application_id={app}` |
| page shell/draft/publish | `POST /flow/2/{acc}/application/{appId}/page/` · `GET/PUT/POST /metadata/2/{acc}/application/{appId}/page/{pageId}/{draft|publish}` |
| item create | `POST /case/2/{acc}/{caseId}?_application_id={app}` (`Summary` required) |

See `engine/builders.mjs` (`buildBoard`, `buildKanbanPage`) and `engine/board-live.mjs`
(`applyBoardLive`, `grantCaseMembers`, `applyKanbanPage`).
