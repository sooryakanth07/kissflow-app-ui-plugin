---
description: Add a BOARD (Kissflow Case flow — an unstructured/kanban workflow like a pipeline, task board, or service-request/onboarding case) to an existing app, plus its Kanban page. Runs the same full agent pipeline as /add-flow with the flow type fixed to board and the page on by default. Use for todos/tasks/projects and case use-cases.
argument-hint: "<what the board tracks>" [--app <appId>] [--target dev] [--no-page] [--seed N] [--yes] [--dry-run]
---

A board-scoped specialization of **`/add-flow`** — the SAME full agent pipeline (comprehend → BA →
architect → data → **board steps** → permissions → **Kanban page** → stitches → coherence → verify →
apply), with the flow type fixed to **board** and the page authored by default (a board's whole point is
its kanban surface). Use when the ask is a pipeline, task/todo board, project tracker, or a case use-case
(service requests, support tickets, onboarding, complaints) — i.e. an **unstructured** workflow the user
drags cards through, not a system-routed process.

Pre-req: `/author-setup` done; target app exists in dev. Read: `reference/PROCESS-VS-BOARD.md` and
`reference/BOARD-AND-KANBAN-PAGE.md` (the 7-step live recipe + every gotcha).

## Autonomous
The user names nothing — infer the board's fields, statuses, page, and stitches from the ask + the imported app and auto-invoke the agents (canonical order, verifier-gated). If the ask actually implies a fixed approval route, STOP and suggest `/add-flow --type process`. Otherwise proceed on best inference; record assumptions in open-questions.md. (Plugin-wide autonomy default — see MEMORY [global].)

## Do
Run `/add-flow "$ARGUMENTS" --type board --page` (unless `--no-page`) — the full pipeline, scoped to one
board. The board-specific specialist work inside that pipeline:
1. `kf-architect` confirms it's genuinely **unstructured** (if the ask implies fixed approval routing,
   STOP and suggest `/add-flow --type process` instead).
2. `kf-data-architect` → the card's fields.
3. Board **steps** (the `buildBoard` slice) → the status **columns** (`OutwardStatus` = every other status
   for free movement) + the 4 system swimlane states; add a system `Reopened`.
4. `kf-security-designer` → per-role permissions.
5. `kf-experience-designer` → the **Kanban page** (`buildKanbanPage`: header + a default **New \<Item\>**
   button that opens the create-form popup + the kanban, all CURRENT manifests, flow binding on the
   component containers).
6. `kf-integration-analyst` → any stitches (e.g. "on move to Approved, create a Payment").
7. Coherence + verify, then apply the **live board recipe** via `engine/board-live.mjs`:
   `applyBoardLive` (case shell → form + `Model::Appearance` → caseflow steps → Kanban caseview →
   **grant case members**) → `applyKanbanPage`. With `--seed N`, create N sample items so the board
   renders populated (`Summary` is the required title).

## [HARD] rules
- **`grant case members` is not optional** — `applyBoardLive` runs it; without it the board's views are
  hidden and the page shows "board view not found" despite a perfect board.
- CURRENT manifests only (`view/kanban`/`Kanban`, `view/form`/`Form`); component flow binding lives in the
  CONTAINER `Container::FieldMapping`, not `Data`. Popup container is `Type:"Popup"`.
- Board vs process is the workflow-shape decision, not styling — don't turn a real approval process into a
  board. Never auto-publish to prod.

## Output
Board + view + page ids, members granted, seeded item count, acceptance result — then how to refine or add
another. See `/add-flow` for the general (any-type) command.
