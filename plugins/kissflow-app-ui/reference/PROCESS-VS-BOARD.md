# Process vs Board vs Form vs Dataset — how to decide, and the build flow for each

The FIRST decision the architect (`kf-architect`) makes for every entity is **which flow type**. It's a
data-modeling decision (not a UX one), driven by the entity's *workflow shape*.

## The decision (ask in this order)
1. **Does it just hold data / feed a dropdown?**
   - Reference option list (Country, Category, Status list) → **Dataset / List** (`buildList`).
2. **Does it have a workflow (does the record move through stages)?** — If NO → **Dataform / Form**
   (`FlowType:"Form"`, `buildForm`). A plain record with fields, no routing (a master, a config, a log).
3. **If it HAS a workflow — is the workflow STRUCTURED or UNSTRUCTURED?**
   - **STRUCTURED** — the system routes it through a fixed sequence of steps, each owned by a role, with
     approvals / send-backs / SLAs. The path is deterministic ("submitted → manager approval → finance →
     done"). → **PROCESS** (`FlowType:"Process"`, `buildForm` + `addWorkflow`).
   - **UNSTRUCTURED** — a person moves each item between statuses freely; there's no enforced routing, the
     columns are just states of work. Todos, tasks, projects, pipelines, AND case management (service
     requests, support tickets, onboarding, complaints). → **BOARD** (Kissflow Case, `FlowType:"Case"`,
     `buildBoard`).

Signals for BOARD over PROCESS: "kanban", "pipeline", "track", "tickets", "requests", "backlog",
"drag between columns", "assign and pick up", "no fixed approval chain". Signals for PROCESS: "approve",
"review then", "route to", "sign-off", "SLA", "step 1 … step 2".

| | Dataset/List | Form/Dataform | **Process** | **Board (Case)** |
|---|---|---|---|---|
| workflow | none | none | **structured** (routed steps) | **unstructured** (user-moved statuses) |
| FlowType | List | `Form` | `Process` | `Case` |
| builder | `buildList` | `buildForm` | `buildForm` + `addWorkflow` | `buildBoard` |
| routing owner | — | — | the system (ProcessDef/Activity) | the user (Status/OutwardStatus) |
| surfaced as | select/reference source | table / form | My Items / My Tasks queues | Kanban board |

## Build flow — PROCESS
1. Create shell `POST /flow/2/{acc}/process/?_application_id={app}` `{Name, Description}`.
2. Model draft: fields + layout (+ child tables, references, computed) → **inline** ProcessDef/Activity
   (`addWorkflow`: StartEvent → UserTask(s) with an AppRole `Resource` + per-field `Permission` → EndEvent)
   + `Model::Appearance` + `Button::Row`. `PUT …/draft` → `POST …/publish`.
3. Permissions (per role × model), pages (worklist / dashboard), automations.
   *(This is the `client.mjs applyIR` path today; `type:"process"`.)*

## Build flow — BOARD (Case) — the 7 live steps
1. **Case shell** `POST /flow/2/{acc}/case/?_application_id={app}` `{Name, Description, Prefix, ItemType}`.
2. **Form**: graft fields onto the case model draft (keep default Summary/Description/Attachment) +
   `Model::Appearance` → publish.
3. **Board steps**: swap the caseflow `CaseFlow::Status` (columns, `OutwardStatus`=all-others) +
   `CaseFlow::State` (4 system swimlanes) → publish.
4. **Kanban caseview** `POST /flow/2/{acc}/case/{caseId}/caseview/` `{Name, ViewType:"Kanban"}`.
5. **Grant case members** `POST /flow/2/{acc}/case/{caseId}/member/batch` with the app roles (AppRole/Admin)
   — WITHOUT THIS the board's views are hidden from the runtime ("board view not found").
6. **Page** shell + graft the Kanban component (+ optional New-item button + create-form popup).
7. Publish. Seed items via `POST /case/2/{acc}/{caseId}` (`Summary` required).

Full metadata shapes + gotchas: **`reference/BOARD-AND-KANBAN-PAGE.md`**. Flow-type classification is also in
`reference/CONCEPTS.md`. Builders: `engine/builders.mjs` (`buildBoard`, `buildKanbanPage`); live apply:
`engine/board-live.mjs` (`applyBoardLive`, `grantCaseMembers`, `applyKanbanPage`).
