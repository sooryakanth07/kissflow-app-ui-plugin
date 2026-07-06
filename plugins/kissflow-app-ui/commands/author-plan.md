---
description: STAGE 2 (propose) — from the run's domain brief, PROPOSE the full App-Spec (flow-types, data models, roles, workflows, permissions, pages) as reviewable suggestions with rationale, then snapshot it as version v1. Nothing is applied.
argument-hint: (operates on runs/current; add notes to steer, e.g. "keep it minimal")
---

**Stage 2: propose.** Turn the run's domain into a complete, *reviewable* plan. You write the IR and
explain every choice; you DO NOT apply anything.

Pre-req: `/author-brief` created a run with `runs/current/app-spec.json#domain`. If not, say so + stop.

## Do (canonical order, each step `kf-verifier`-gated)
Spawn the specialists in order — each writes its IR slice to `runs/current/app-spec.json`, coordinating
only through that blackboard:
1. `kf-architect` — flow-type map (Form/Process/Case/List), ER map, child-table splits, roles,
   journey→flow map, build order.
2. `kf-data-architect` — fields, references, formulas, aggregates, lookups, child tables.
3. `kf-workflow-designer` — process steps + assignees.
4. `kf-security-designer` — role × flow permission matrix + data scope (initiator + accessors per
   flow, data forms included).
5. `kf-experience-designer` — pages + nav + role landing.
Gate each with `node engine/cli.mjs verify runs/current/app-spec.json`; then `kf-coherence-critic`.

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
