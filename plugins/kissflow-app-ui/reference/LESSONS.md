# kf-author — Field Lessons (READ FIRST)

Hard-won operational knowledge that is **not** fully enforceable by the engine/validators. Agents
must apply these; the verifier catches what it can, but these prevent the mistakes up front.
Ordered by how often they bite.

## 1. Type Form vs Process UPFRONT — conversion is destructive
A **Form** cannot gain a workflow later. If a flow has any approval / review / multi-actor lifecycle,
type it `flowType: "Process"` from the start. Converting a published Form → Process means **delete +
recreate** (`DELETE /flow/2/{acct}/form/{id}?_application_id={app}` works → then create as `process`),
which loses the flow's data and re-wires every reference to it. Decide once, in `kf-architect`.

## 1b. A PUBLISHED process is IMMUTABLE over REST — get it right before publish
Once a process is published you CANNOT change it via the API: `PUT …/process/{id}/draft` → **403**,
and `DELETE …/process/{id}` is a **no-op** (the flow survives). So a process's fields, formulas,
aggregates, lookups, and workflow must ALL be baked in before the first publish. There is no in-place
path to change a published process — rebuild the whole app fresh (a new app) with everything correct.
Corollaries:
- **Forms ARE editable** (`PUT …/form/{id}/draft` works) — retrofit forms freely; only processes freeze.
- **Process field formulas STRIP on publish.** A computed field's `Expression` survives on a *form*
  but is dropped when a *process* publishes (open issue — process computed fields use a different
  placement). `QueryDefinition`-based fields (references / lookups / **aggregates**) DO survive process
  publish. So don't rely on process *formulas* yet; aggregates/lookups on processes are fine.
- **Flow DELETE is async**: it returns OK but the name stays reserved briefly — an immediate re-create
  hits `FlowNameAlreadyExists`. Wait/retry before recreating.

## 2. Never author a `Name` field
`Name` is a Kissflow system field (auto-created). Authoring one is rejected
(`SYSTEM_FIELD_AUTHORED`). Use a specific label: `Vendor Name`, `Member Name`, `Party Name`.

## 3. Formulas are the full Kissflow grammar — but only for in-form math
`computed`/`formula` accepts the whole grammar (verified vs real exports + the engine's function
library): infix `+ - * /`, comparison `= < > >= <= !=`, parentheses/precedence, `"string literals"`,
and **named functions** — `IF(cond, a, b)`, `CONCATENATE(...)`, `ROUND(x, n)`,
`DATEDIFF(d1, d2, "Month")`, `SUM(...)`, `ISBLANK(...)`, etc. (60+, categorised
String/Number/Date/Currency/Logical). Operators are stored as the symbol (`Value:"*"`, the engine
resolves `*`→MULOPER); functions as `Value:"IF"` + `Category`. Operands are field **names or ids**
(resolved within the field's own model, so child-table formulas bind to their own columns). Examples:
`Land_area * SQM_price`, `Contract_Amount * Down_Payment / 100`,
`(FV_per_unit - Contribution) / Contribution * 100`, `IF(Completion_rate >= 100, "Done", "Open")`.
DO NOT formula-ize **cross-flow or GP-sourced** values (NAV roll-ups, budget actuals, fund cash) —
those are integration/workflow logic, not field expressions; leave them plain.

## 3b. Rich lookups & aggregate fields
- **EVERY reference IS a lookup — there is no separate "reference" concept in Kissflow.** A
  `type:"Reference"` field with NO `lookup` array is still a lookup; it just fetches ONE value: the
  target's **display field** (e.g. `SPV.Fund` shows the fund's name). The link + the display value
  always work without any `lookup` config. The `lookup` array only adds **more columns** on top of
  that default one. So don't think "reference vs lookup" (two things) — think "single-field lookup
  (default) vs multi-field lookup". Corollary: an IR "lookup count" that only tallies fields with an
  explicit `lookup:[]` UNDERCOUNTS — every `ref` field is already a functioning lookup. When a
  reference should surface more than the name (list rows, dashboards, transactions needing the
  target's attributes inline), CONFIGURE `lookup` with those extra fields; otherwise the bare
  reference (name only) is correct and complete.
- **Lookup** (`Field::QueryDefinition`): a Reference field pulls columns from its target. It can pull
  MANY (`LookupField:[{Id,Name,Type}]`) and `AutoFill:true` copies them into this form's own fields
  — that's the deck's "enter Vendor ID → auto-fill Name/Bank/IBAN". IR: `reference` field +
  `lookup:[{name,type},…], autofill:true, sortBy, filter`. ⚠️ The engine's *default* lookup picks the
  target's first field — wrong for a back-referencing child (Third Parties' first field is its own
  `Fund` link). Specify `lookup` explicitly with a real display field first.
- **Aggregate** (field ReadOnly + Widget "Aggregation", QD via `Field::QueryDefinition`, AggregateType title-case e.g. "Sum"): total/count a child table. IR:
  `{ type:"Currency"|"Number", aggregate:{ fn:"SUM|COUNT|AVG|MIN|MAX|UNIQUE_COUNT",
  over:"<child-table form>", field:"<column>" } }` → emits `{AggregateType, AggregateField, LHSModel}`
  + widget "Aggregation". NOT a formula (formulas are per-row; aggregates sum across child rows).

## 4. Child tables may reuse field names freely
Two child tables under one parent can both have `Vendor ID` / `Amount` / `date`. The engine
namespaces colliding child-field ids automatically (else one's QueryDefinition is orphaned). Keep
the human label identical; the engine makes the internal ids unique.

## 5. Avoid account-global master names
Generic names — `Currency`, `Project`, `Country`, `Status` — collide across the **whole account**
(`FlowNameAlreadyExists`) and leave their referrers dangling (unpublishable). Prefix app masters
(`<App> Currency`) or deliberately reuse a shared dataset. NOTE: the client only auto-reuses a
colliding flow when `/flow/explore` surfaces it by exact name — large accounts may not surface every
flow, so the reuse can silently miss. Prefixing is the safe default.

## 6. The "role sees nothing" trifecta
A role only experiences its app when **all three** exist: (a) role `Preference`
{DefaultPage, DefaultNavigation}, (b) a nav `SubMenu.VisibleTo` entry, (c) flow/report member access.
Miss one → blank screen. `applyIR` wires all three; if you fix up by hand, do all three.

## 7. Child-table columns need per-step permissions
In a process, a child-table (Type:Model) column with no `Activity::Permission` is **hidden in the
form**. `addWorkflow` grants child-table columns step permissions alongside field columns — keep that.

## 8. Build order (large apps), each step gated by `kf-verifier`
roles → masters/lists → data models + child tables → **formulas** → workflows (processes) →
permissions → nav/pages. Referenced models precede referencers. Build into drafts, dry-run, show the
plan; never auto-publish to prod.

## 9. Apply is resilient but not idempotent on the app shell
`applyIR` retries + never-throws per call, and reuses existing flows/roles by name. But re-running it
aborts on an existing **app name** (`createApp`). So post-apply fixups (a failed flow, a renamed
master, a Form→Process conversion) are **surgical** — create/patch the specific flows + republish,
don't re-run the whole apply.
- **`/flow/2/{acct}/explore` is account-wide + eventually-consistent.** It lists EVERY app's flows
  (so other apps' "Contract"/"Vendor"/"Currency" collide by name) and lags after create/delete.
  NEVER decide "does this flow exist in my app?" by name-matching explore — check by **exact id** via
  `GET …/{type}/{genId}/draft` (404 = gone). Build the ref remap from explore by name only with care;
  a generic master name can map you to a *different app's* flow.

## 10. The validators ARE the memory — run `engine verify` before every apply
`SYSTEM_FIELD_AUTHORED · DANGLING_REF · ORPHAN_ENTITY · REF_NO_QUERYDEF · UNREACHABLE_STATUS ·
NO_TERMINAL_STATUS · UNKNOWN_FIELD_TYPE …` gate the build. A clean `0 errors` build is the contract;
warnings are findings to resolve, not ignore.

## Runtime (kf-framework UI) — REST surface, for the UI phase
Process list is REST-listable only via `/process/2/{acct}/{id}/myitems` (other builder views →
404); add `&_response_type=full` to get status/stage/dates. Business-field values for processes
render only inside the Kissflow runtime (the integration key sees a sparse projection). The custom
React UI composes dashboards by **GQM** (role intent → metrics) + **Kimball** (each flow = a star:
instances=facts, amount=measure, Reference/Select=dimensions, date=time axis).
