---
description: Add ONE new flow (process | board | form | dataset) to an EXISTING app, running the SAME full agent pipeline as a fresh build — comprehend the live app → classify the flow type → data → workflow/steps → permissions → nav/page → stitches → coherence → verify → apply as a minimal diff. Auto-picks Process vs Board vs Form vs Dataset from the ask.
argument-hint: "<what the flow does>" [--type process|board|form|dataset] [--app <appId>] [--target dev] [--page] [--yes] [--dry-run]
---

Add a single flow to an app that already exists, via the **IR blackboard + engine + the full specialist
chain** — never by hand-building blobs, and never as a narrow one-agent shortcut. This is the same
creation pipeline as `/author-app`, scoped to ONE flow and its integration into the live app, and landed
as an ownership-aware minimal diff.

Pre-req: `/author-setup` staged `engine/` + `reference/` + `MEMORY.md`; the target app exists in dev.
Read first: `reference/PROCESS-VS-BOARD.md` (the type decision + per-type build flow),
`reference/CONCEPTS.md`, and — for a board — `reference/BOARD-AND-KANBAN-PAGE.md`.

## Accept any input shape
`$ARGUMENTS` (minus flags) is a natural-language description of the flow ("a deal pipeline the investment
team drags through sourcing → due diligence → close", "a purchase request with two-level approval", "a
vendor master"). `--type` forces the flow type; omit it to let the architect classify.

## Autonomous — YOU pick and invoke the agents, from the requirement
The user does NOT name agents, steps, or the flow type, and never has to. **From `$ARGUMENTS` + the
imported app alone, infer the flow type and which agents the requirement needs, then spawn them —
automatically, in canonical order, without asking the user to choose.** Skip the agents the requirement
doesn't need; add the ones it implies. Only STOP to ask when a genuinely **blocking** ambiguity survives
inference (e.g. structured-vs-unstructured truly undecidable) — otherwise proceed on best inference and
record the assumption in `open-questions.md`.

Requirement signal → what you auto-run:
- **Always**: `kf-comprehension` (import the app), `kf-ba` (domain), `kf-architect` (classify + place),
  `kf-data-architect` (fields), `kf-security-designer` (permissions), `kf-coherence-critic`,
  `kf-verifier`, `kf-reconciler`.
- "approve / review then / route to / sign-off / SLA / step 1 … step 2" → **process** → + `kf-workflow-designer`.
- "pipeline / board / kanban / track / tickets / requests / backlog / onboarding / drag between columns /
  assign & pick up" → **board** → + the board-steps slice (`buildBoard`) + `kf-experience-designer` (Kanban page).
- "a list of / master / options for / lookup values" → **dataset/form** → skip workflow + board steps.
- ask or imported app implies "on <event> create/update <another flow>" → + `kf-integration-analyst` (stitches).
- "so <role> can see/work it" / a new landing or queue → + `kf-experience-designer` (page + nav).

This is the plugin-wide default (see MEMORY `[global]`): **infer intent → invoke the right agents; don't
make the user drive the pipeline.**

## Do (the full pipeline, scoped to one flow)
1. **Comprehend the live app** (= `/author-understand`) — spawn `kf-comprehension`: `node engine/cli.mjs
   import` the target app into `lib/app-spec.json` (existing flows, fields, roles, statuses, pages,
   references). The new flow must integrate with what's THERE — this is the context every downstream agent
   reads. Create/resume a run; snapshot "imported <app>".
2. **Ingest the ask** (= `/author-brief`) — spawn `kf-ba`: turn `$ARGUMENTS` into the domain delta for
   this flow (its entity, the persona(s) who use it, the journey, the business rules) into
   `app-spec.json#domain`; write `open-questions.md`. Metadata is sacrosanct — only what the ask says or
   clearly implies.
3. **Classify + place** (= architecture) — spawn `kf-architect`: decide the flow TYPE per
   `PROCESS-VS-BOARD.md` (structured workflow → **process**; unstructured/case → **board**; no workflow →
   **form**; option list → **dataset**) unless `--type` forces it; map its ER links to existing flows
   (references, child tables), and which persona journeys it joins. Record the decision + rationale.
4. **Specialist chain, verifier-gated, in canonical order** — each writes only its IR slice:
   - `kf-data-architect` → fields, types, references (target + lookup/hidden + filter), child tables,
     computed formulas. Referenced masters must already exist in the imported app.
   - **process** → `kf-workflow-designer` (steps: StartEvent → role-owned UserTasks → EndEvent, per-field
     permissions); **board** → the board's **statuses** (columns, `OutwardStatus`=all-others) + the 4
     system states (the `buildBoard` slice); **form/dataset** → skip.
   - `kf-security-designer` → per-role permissions for the new flow (scoped consistently: created-by /
     assignee / team).
   - `kf-experience-designer` → how the flow is SURFACED for each role: a worklist/board page + nav entry
     (a board → a Kanban page via `buildKanbanPage`; a process → My Items/My Tasks queues). Skip page
     authoring unless `--page` or the journey needs a landing.
   - `kf-integration-analyst` → any cross-flow STITCHES the new flow implies (its approval/completion
     creating/updating an existing flow, or an existing flow feeding it) → the `automations` slice
     (internal only; external flagged). See `engine/integrations.mjs`.
   Then `kf-coherence-critic` — the new flow gives every relevant persona a meaningful landing, its
   dashboard/queue is in-scope, no orphan status/field/page, and it doesn't break existing coherence.
5. **Verify** — spawn `kf-verifier`: `node engine/cli.mjs verify lib/app-spec.json`. Fix dangling refs,
   undefined formula identifiers, orphan child tables, statuses no role reaches BEFORE applying.
6. **Plan + apply as a MINIMAL DIFF** — front with `kf-reconciler` (= `/author-reconcile`) so it lands as
   an ownership-aware diff against the live app (never clobbers dev-owned edits):
   - **form / process / dataset** → `node engine/cli.mjs build … --apply --target <env>` (create-shell →
     draft → publish; the `applyIR` path).
   - **board** → the live board recipe via `engine/board-live.mjs applyBoardLive` (case shell → form +
     `Model::Appearance` → caseflow steps → Kanban caseview → **grant case members**), then — if `--page`
     or the experience step authored one — `applyKanbanPage`. Seed a few items only if asked.
   Honour `--dry-run` (stop at the manifest) and `--yes` (skip the confirm; else show a one-line build
   summary + confirm). Snapshot "added <flow> → <app>"; run `kf-acceptance` on the new flow's journey.

## [HARD] rules
- Same rails as the full build: the IR blackboard is the only channel between agents; canonical order
  (roles → data → flow → permissions → nav/pages → stitches) is never reordered; verifier-gated between
  steps. **Involve every relevant agent — do not shortcut to a single-agent edit.**
- The flow-type decision is a data-modeling call (workflow shape), not a UX one — follow
  `PROCESS-VS-BOARD.md`. A board is NOT a "kanban-styled process".
- **Board completeness (or it silently 404s in pages):** a board build MUST end with **granting case
  members** (`applyBoardLive` does this) — without it the runtime hides the board's views. Use CURRENT
  page manifests only (`view/kanban`/`Kanban`, `view/form`/`Form`); the flow binding goes in the
  component's CONTAINER `Container::FieldMapping`, not `Data`. See `BOARD-AND-KANBAN-PAGE.md`.
- Never auto-publish to **prod**; `--target` defaults to **dev**. Process/Case creation is irreversible
  over REST — confirm unless `--yes`.

## Output
One report: imported-app context → flow TYPE + why → the per-agent slices written → verify status →
what was built (real Kissflow ids: flow, view, page, members granted) → acceptance result. Then:
*"Refine with `/author-refine \"…\"` then re-apply, or add another flow with `/add-flow`."*
