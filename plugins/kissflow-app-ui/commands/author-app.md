---
description: EXPRESS (one-shot) — take a requirement straight to a built app in dev, running brief → plan → generate back-to-back with no review pause. Accepts a BRD file, pasted requirement text, or a one-line ask. Best for demos and small/clear specs. For anything real, prefer the staged flow (/author-brief → /author-plan → /author-review → /author-refine → /author-preview → /author-generate).
argument-hint: "<BRD path | pasted requirement | one-line ask>" [--yes] [--dry-run]
---

**Express path.** Runs the whole pipeline end-to-end in one command — no stop to review. This trades
the safety of the staged loop for speed, so use it for demos or specs you already trust. The build is
still real and (for Processes/Cases) irreversible over REST.

Pre-req: `/author-setup` has staged `engine/` + `reference/` + `MEMORY.md`.

## Accept any input shape
`$ARGUMENTS` (minus the flags) may be a **BRD file path**, **pasted requirement text**, or a
**one-line ask** (e.g. *"a purchase request app with two-level approval"*). Detect which: an existing
file path → use it; otherwise treat the text as the requirement and write it verbatim to
`runs/current/brd.md` after creating the run. A one-liner is valid — just lean harder on assumptions +
open-questions, and if a **blocking** ambiguity remains, STOP and ask before generating (step 3).

## Do (brief → plan → generate, back-to-back on one run)
1. **Ingest** (= `/author-brief`) — create the run: `node engine/runs.mjs new <slug> <brd>` for a file,
   or `node engine/runs.mjs new <slug>` + write the pasted/one-line text to `runs/current/brd.md`.
   Spawn `kf-ba` (+`kf-comprehension` if large) → domain (personas, journeys, entities, rules) into
   `runs/current/app-spec.json#domain`; write `open-questions.md`. Metadata is sacrosanct — extract
   only what the requirement says or clearly implies.
2. **Plan** (= `/author-plan`) — run the specialist chain in canonical order, each verifier-gated:
   `kf-architect` → `kf-data-architect` → `kf-workflow-designer` → `kf-security-designer` →
   `kf-experience-designer`; then `kf-coherence-critic`. Log decisions;
   `node engine/runs.mjs snapshot "v1 — express plan"`.
3. **Show, briefly** — print the plan-at-a-glance + any high-risk decisions or unresolved questions.
   If a **blocking** ambiguity remains, STOP and ask rather than guess.
4. **Generate** (= `/author-generate`) — `node engine/cli.mjs verify`, print *"⚠ No review taken —
   applying to dev directly."*, then apply to dev. Honour `--dry-run` (stop at the manifest) and
   `--yes` (skip the confirm; otherwise show a one-line build summary and confirm). Write
   `runs/current/generated/`, snapshot "generated → dev", run `kf-acceptance`.

## [HARD] rules (same as the staged flow)
- IR blackboard is the only channel between agents; canonical order (roles → data → flow → permissions
  → nav/pages) never reordered; verifier-gated between steps.
- Never auto-publish to **prod** — express targets **dev** only.

## Output
One consolidated report: brief → plan-at-a-glance → what was built (real Kissflow ids) → acceptance
result. Then: *"Want to change anything? The run is saved — `/author-refine \"…\"` then
`/author-generate` again, or hand it to Pipeline B. For the next big spec, use the staged commands."*
