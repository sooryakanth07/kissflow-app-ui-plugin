# Experience Spec — the Kissflow-agnostic UX contract (Pipeline A ↔ Pipeline B)

The **Experience Spec** is a small, declarative description of *what each role sees and does* — nav +
pages + widgets — expressed **without any Kissflow artifact constraint**. It is the bridge between the
two pipelines:

- **Pipeline A (kf-author)** produces it via TWO agents: **`kf-ux-architect`** designs the richest
  per-role experience (nav + curated rich widgets, from each role's jobs — not a template), and
  **`kf-prototype-builder`** renders it as a clickable, **seed-data-driven** prototype so the team can
  *see the intended UX* before anything is built.
- **Pipeline B (kf-framework)** consumes it: the same nav/pages/widgets become the live custom React
  UI, with each widget's `bind` resolved to real Kissflow flows/fields/reports.

## Rich widget vocabulary
Design for a best-in-class SaaS product — compose from these `type`s (the builder renders each richly):
`statcard` (value + trend delta + sparkline) · `area`/`line` (trend over time) · `donut` (distribution
+ legend) · `bar` (comparison) · `queue` (approval list w/ avatars + Approve/View actions) · `kanban`
(stage pipeline) · `timeline` (activity feed) · `progress` (labelled bars) · `upcoming`/`calendar`
(dated items) · `table` (worklist: status tags, owner avatars, `+ New`, clickable rows) · `record`
(detail panel) · `action` (opens the create form as a **popup**). Prefer a few high-signal, well-composed
widgets over many thin ones; roles must get genuinely different first screens.

**Seed data:** the builder generates ONE coherent, deterministic seed dataset and drives every widget
from it (the same records flow across chart, list, and queue) — never per-widget random filler, never
empty widgets.

Both runtimes are flexible React runtimes, so a prototype of intent **translates 1:1 in structure**.
Only the *data values* may degrade going live (Kissflow REST can return sparse process items); the
layout, nav, per-role pages and widget types carry over exactly.

## Why bindings are semantic, not Kissflow ids

Widgets bind to **IR entities and their attributes by meaning** (`entity`, `field`, `measure`, `dim`,
`scope`) — never to a Kissflow `flow_id`/`view_id`. The prototype fills those bindings from mock data;
Pipeline B maps the same semantic bindings onto the real flow/report ids once the app is generated.
This is what makes the artifact translatable across both runtimes.

## Schema

```jsonc
{
  "app":   "L2D Settle",
  "roles": [
    {
      "role":    "Fund Manager",
      "landing": "fm-dashboard",          // page id this role lands on
      "nav": [                            // role-specific menu (ORDER matters)
        { "page": "fm-dashboard", "label": "Overview",  "icon": "grid" },
        { "page": "funds",        "label": "Funds",     "icon": "layers" },
        { "page": "payouts",      "label": "Payouts",   "icon": "banknote" }
      ]
    }
  ],
  "pages": [
    {
      "id":       "fm-dashboard",
      "role":     "Fund Manager",         // which role this page is for (pages are role-scoped)
      "title":    "Fund Overview",
      "archetype":"dashboard",            // dashboard | list | record | form | kanban | report
      "widgets": [
        { "type":"kpi",   "title":"Active Funds",  "bind":{ "entity":"Fund",    "measure":"count", "scope":"all" },                 "span":3 },
        { "type":"kpi",   "title":"AUM",           "bind":{ "entity":"Fund",    "measure":"sum",   "field":"corpus", "scope":"all" }, "span":3 },
        { "type":"chart", "title":"Payouts / mo",  "bind":{ "entity":"Payout",  "measure":"sum",   "field":"amount", "dim":"month" }, "span":6 },
        { "type":"table", "title":"Recent Funds",  "bind":{ "entity":"Fund",    "scope":"all", "columns":["name","corpus","status"] }, "span":12 },
        { "type":"action","title":"New Fund",      "bind":{ "entity":"Fund",    "action":"create" },                                 "span":3 }
      ]
    }
  ]
}
```

### Field reference

| key | meaning |
|---|---|
| `roles[].role` / `.landing` / `.nav` | the role, the page it opens on, and its ordered menu |
| `pages[].role` | pages are **role-scoped** — the same entity can have different pages per role |
| `pages[].archetype` | picks the layout/rendering: `dashboard`, `list`, `record`, `form`, `kanban`, `report` |
| `widget.type` | `kpi` · `chart` · `table` · `record` · `form` · `kanban` · `action` · `text` |
| `widget.bind.entity` | **IR entity name** (semantic — the translation anchor) |
| `widget.bind.field` | attribute of that entity (for measure/column/form) |
| `widget.bind.measure` | `count` · `sum` · `avg` · `min` · `max` (with `field`) |
| `widget.bind.dim` | group-by dimension for charts (`month`, a category field, …) |
| `widget.bind.scope` | data slice: `all` · `mine` · `team` · a role-scope name from `security` |
| `widget.bind.action` | `create` · `open` · a workflow transition — makes the widget interactive |
| `widget.span` | 1–12 column grid width (the prototype/live UI pack rows to fill 12) |

## Where it comes from (Pipeline A)

`kf-prototype` derives the Experience Spec from the run's IR:
- **roles + nav** ← `security` (who can do what) + `experience` (landing/nav) — every role gets a menu
  that reflects its *actual* access, not just a dashboard.
- **pages** ← per-role journeys: a landing dashboard, a list per entity the role touches, a
  record/form per entity it creates or acts on, a kanban for any Process the role advances.
- **widget bindings** ← `data_model` (entities/fields/aggregates) + `workflow` (actions/transitions).

Write it to `runs/current/prototype/experience-spec.json`; render the React prototype alongside it in
`runs/current/prototype/`.

## Where it goes (Pipeline B)

Hand `runs/current/prototype/experience-spec.json` to the kf-framework generator. It maps each
`bind.entity` → the generated flow, `bind.field` → real field ids, `measure`/`dim` → a report or
client aggregate, and renders the live theme. Structure is preserved; only live data is substituted.
