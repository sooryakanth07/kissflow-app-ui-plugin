---
description: STAGE 2 (propose) — from the run's domain brief, PROPOSE the full App-Spec (flow-types, data models, roles, workflows, permissions, pages) as reviewable suggestions with rationale, then snapshot it as version v1. Nothing is applied.
argument-hint: (operates on runs/current; add notes to steer, e.g. "keep it minimal")
---

**Stage 2: propose.** Turn the run's domain into a complete, *reviewable* plan. You write the IR and
explain every choice; you DO NOT apply anything.

**Narrate progress** (esp. Cowork): as you enter each specialist's stage, emit ONE warm, plain-language
line that NAMES the agent and says what it's crafting — no jargon — so the user watches a team build
their app (e.g. *"🔁 kf-workflow-designer is building the approval steps…"*, *"🔐 kf-security-designer
is setting who can see and do what…"*). See the message list in `author-app.md` (USER PROGRESS).

Pre-req: `/author-brief` created a run with `runs/current/app-spec.json#domain`. If not, say so + stop.

## Do (dependency-ordered WAVES, each step `kf-verifier`-gated)
Spawn the specialists by dependency, not one long serial chain — each writes its IR slice to
`runs/current/app-spec.json`, coordinating only through that blackboard. Independent slices run
CONCURRENTLY (measured: data∥workflow cut the plan stage ~40% on the express profile, 2026-07-07).
1. `kf-architect` — flow-type map (Form/Process/Case/List), ER map, child-table splits, roles,
   journey→flow map, build order. **(everything below depends on this — must finish first.)**
2. **PARALLEL wave** — `kf-data-architect` (fields, references, formulas, aggregates, lookups, child
   tables) **∥** `kf-workflow-designer` (process steps + assignees). Both depend ONLY on the
   architecture and touch DIFFERENT keys, so run them at the same time. MERGE DISCIPLINE: each writes
   its slice to `runs/current/slices/{data,workflow}.json` as its source of truth, then merges only
   its own keys into app-spec.json with an mtime-guarded read-modify-write (retry if the file changed
   under it). Barrier: wait for BOTH before wave 3.
3. `kf-security-designer` — role × flow permission matrix + data scope (needs BOTH data fields and
   workflow steps → runs after the wave-2 barrier).
4. `kf-experience-designer` — pages + nav + role landing (needs security's data scopes → after 3).
Gate each with `node engine/cli.mjs verify runs/current/app-spec.json`; then `kf-coherence-critic`.
(kf-integration-analyst, when the app has cross-flow stitches, joins the wave-2 barrier and can run
∥ kf-security-designer — same slice-file merge.)

## Record EVERY significant decision
Append to `runs/current/decisions.md` — one entry per non-obvious choice: `### <topic> — <decision>` ·
**Why** (traces to a journey/rule) · **Alternatives** (rejected + why) · **Status:** `proposed`.

## Snapshot v1
`node engine/runs.mjs snapshot "v1 — initial plan"` — freezes the IR + decisions as version v1.

## Output
The **plan at a glance** (flow / process / form / list / role / page / permission counts + formulas /
aggregates / lookups), the count of decisions + the 3–5 highest-stakes ones inline, and any coherence
issue. Next: *"See it all with `/author-review`, change anything with `/author-refine \"…\"`, or when
confident `/author-preview` then `/author-generate`."*
