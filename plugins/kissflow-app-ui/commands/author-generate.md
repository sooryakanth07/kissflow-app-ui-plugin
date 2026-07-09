---
description: STAGE 6 (build) — apply the current run's plan to the target Kissflow account, creating the real apps, flows, forms, fields, workflows, permissions and pages. Gated on a VALID IR (not on review). Supports --dry-run and --yes. This is the only stage that mutates Kissflow.
argument-hint: [--dry-run] [--yes] (operates on runs/current)
---

**Stage 6: build.** Turn the plan into a real Kissflow app. This is the destructive/irreversible step
(published Processes/Cases can't be un-published over REST), so treat it with care.

**Narrate progress** (esp. Cowork): emit a warm, plain line as you start building
(*"🚀 kf-author is building it live in Kissflow — creating and publishing every flow, page and role…"*)
and when acceptance runs (*"✅ kf-acceptance is test-driving each journey…"*), then a plain result
(*"✓ Live — 1 process, 3 dashboards; every journey passed."*). No jargon. See `author-app.md` (USER PROGRESS).
**End with the time taken** — close on the total wall-clock (*"⏱ Built in 1m57s."*) from
`node engine/timeline.mjs report runs/current`; it's the demo headline.

Pre-req: a current run with a **verified** `runs/current/app-spec.json`. Gate is *valid IR*, not
"review was done" — so the express/demo path can reach here directly.

## Do
1. **Verify** — `node engine/cli.mjs verify runs/current/app-spec.json`. Stop on any error.
2. **If review was skipped**, print exactly one line: *"⚠ No review taken — applying to dev directly."*
   (Check: no `runs/current/review.html` / no snapshots ⇒ skipped.) Don't block on it.
3. **Handle flags** in `$ARGUMENTS`:
   - `--dry-run` → `node engine/cli.mjs build runs/current/app-spec.json --out runs/current/preview`,
     show the manifest and STOP (build nothing).
   - No `--yes` and this is a full/non-express invocation → show the one-line build summary (N flows,
     forms, permissions) and ask for confirmation before applying.
   - `--yes` → apply without the extra prompt.
4. **Apply** — `node engine/cli.mjs apply runs/current/app-spec.json` (targets the account in your
   `KISSFLOW_*` env — keep this pointed at **dev**). If re-running a run that was already partly built,
   the engine's reuse mode maps to the existing gen→server ids (from the prior apply log in
   `generated/`) instead of duplicating — don't re-create from scratch.
5. **Record the build** — write `runs/current/generated/` with the apply log (gen→server id map,
   created flow/form/page ids, timestamps). Update `RUN.md`: stage=generated, generated=yes, target.
   `node engine/runs.mjs snapshot "generated → dev"`.
6. **Acceptance** — spawn `kf-acceptance` to smoke-check the built app against the journeys; report
   pass/fail per journey.

## Output
What was created (with real Kissflow ids), the acceptance result, and where the log lives
(`runs/current/generated/`). Next: *"Open it in Kissflow, or hand the run to Pipeline B — its Experience
Spec (`runs/current/prototype/`) translates to the live custom UI."*
