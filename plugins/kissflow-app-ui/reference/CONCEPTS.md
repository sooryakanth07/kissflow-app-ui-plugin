# Kissflow Apps — concepts &amp; context (what the metadata MEANS)

The structural catalogs (`APP_METADATA_MODEL.md`, `METADATA_ATTRIBUTES_*`) say *how* metadata is
shaped. This doc says *what it means* — the product semantics an app builder works in, so the
`kf-author` agent designs apps that make sense, not just blobs that parse. Concepts drawn from
the Kissflow community **Apps &amp; Portals** docs (community.kissflow.com/category/apps-portals).

## The big picture
A Kissflow **App** is a low-code container that organizes three things — **data**, **workflow**,
and **user interface** — into one interconnected unit. You model data as flows, automate it with
processes/cases, and surface it on pages built from components. Everything is gated by roles.

## Building blocks → metadata object → meaning

| Product concept | Metadata object | What it means to a builder | Relates to |
|---|---|---|---|
| **Application** | `Application` doc + structure blob | The app shell: name, theme, languages, navigation, the set of flows &amp; pages | contains everything |
| **Dataform / Form** | `Form` flow + Model blob | Data entry &amp; storage — a record type with typed fields. The app's "tables". | fields, views; referenced by pages, processes |
| **Process** | `Process` flow + Model + `Workflow` | Multi-step automation (approvals, routing). Each step = an `Activity` with an assignee role. | a form-like model + steps; surfaced via My Items/My Tasks |
| **Case / Board** | `Case` flow + `CaseFlow` (Status/State) | A status-tracked Kanban canvas for tracking work (enquiries, projects, tasks). Statuses = board columns. | board `caseview`; statuses drive transitions (`OutwardStatus`) |
| **List / Dataset** | `List` flow (`ListItems`) / Dataset | A data collection that **feeds reference &amp; select fields**. Lists = simple option sets; datasets = richer tables. | `Select.ReferredList`, `Reference.LHSModel` |
| **Field** | `Field` entity | One column of a record — typed (Text/Number/Currency/Date/Select/User/Reference/…), optionally computed (Expression) or looked-up (QueryDefinition). | the model's schema |
| **Computed value** | `Expression` + `Node` tree | A formula on a field (totals, ids, lookups). The visible logic of the data model. | reads other fields / referenced models |
| **View / Report** | `FormView`/`CaseView` + `Report` blob | Saved ways to look at a flow's data — filtered lists, boards, and charts/pivots for dashboards. | bound by page components |
| **Page** | `Page` schema blob | The UI canvas. A container tree that **hosts components**; the only thing an end-user navigates to. | components, app variables, events |
| **Component** | `Component` entity (22+ types) | A reusable UI element placed on a page — Card, Label, Button, Table, charts, Kanban, Gallery, embedded Form, Custom. Binds to a flow/report via `Data{flow_id, report_id, view_id}`. | a flow/report/variable |
| **App Variables &amp; Parameters** | App-variables doc + `VariableRef` | Dynamic state passed across pages/components — computed counts a card shows, page input params. Populated by on-load JS (`kf.api` + `kf.app.setVariable`). | components read them; events set them |
| **Navigation / Menu** | `Navigation` blob (Menu/SubMenu) | The routing that links pages into user journeys (role-aware). | pages |
| **Roles &amp; Permissions** | `app_role` + permission objects | Access control: who can view/edit which flow, field, step, or status. The role is referenced by `_id`. | gates flows, fields, steps, pages |
| **Integration / Connector** | `Integration` flow + blob | Trigger→Action automations bridging flows and external systems (create item on completion, run script, notify). | flows, external APIs |
| **Custom Component** | `CustomComponent` manifest + bundle | A bespoke React widget (zip of index.html/js using the global `kf` SDK) placed on a page like any component. | pages (via `Data.component_id`) |
| **Theme** | `Application.Theme` | Branding — colour palette + custom colours used by pages/components. | all UI |
| **Portal** | parallel to Application | An external-facing app variant (portal roles, public access). | mirrors app structure |

## How they connect (the mental model)
- A **page** hosts **components**; each data component **binds to** a process / form / case / dataset /
  report (by `flow_id` + `view_id`/`report_id`).
- A **dataset/list** feeds the **reference/select fields** of forms — so build masters/lists first.
- A **case** is a board whose **statuses** are the columns; moving a card = a status transition.
- A **process** routes a record through **steps**, each owned by a **role**.
- **App variables** carry computed numbers from an on-load script into KPI **cards**.
- **Navigation** wires pages into role-specific journeys; **roles** gate every layer.

## Why this matters for authoring — and the canonical order
Build **who → what → build → secure → present** (the Dinesh-specified order):
1. **Roles** first — data models &amp; permissions reference them.
2. **Data models &amp; relationships** — entities, references, and **child tables** — designed before
   committing to flow defs; create the lists/datasets masters here so reference/select fields have targets.
3. **Dataform / Workflow / Case** — create the flows (a referenced model before the one referencing it).
4. **Role permissions** — field/step/status, keyed by role `_id`.
5. **Nav &amp; pages** last — surface the flows, role-aware.

A structurally valid blob that ignores these relationships (a Reference field with no target list, a
card bound to no report, a status with no transitions) parses but is a broken app. **Build meaning,
not just shape — and in this order, so every reference resolves.**
