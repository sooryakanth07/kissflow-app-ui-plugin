# Revision worklist — from owner-denied beliefs (2026-07-04)

## From Q1 denial (parallel branches + conditional skips EXIST)
- [ ] DISCOVER the branch/skip metadata shape: UI-build a sample process with a parallel branch + a
      conditional skip on dev, export/GET its ProcessDef, diff vs our Sequence emission.
- [ ] ENGINE: extend addWorkflow (+ ir schema + validators + tests) to author branches/skips.
- [ ] RE-ARCHITECT candidates: npd-plm multi-plant estimation (child-process pattern → parallel
      branches per plant?) — B1/B2 decisions cite the denied belief; p2p D7 "declines are terminal —
      no send-back anyway" and W-R3 "mismatch reaches Finance (Sequence-only)".
- [ ] Workflow-designer agent guidance: stop citing sequence-only as a hard constraint.

## From Q3 denial (row-level report scoping EXISTS)
- [ ] DISCOVER the scoping shape: UI-configure a my-items-scoped report on dev, GET/export, diff.
- [ ] ENGINE: emit scoped report access from security.data_scope (today scope is convention only).
- [ ] REVISIT waivers: npd-plm R1 (plant-scope leak), SEC-1 residuals; p2p SEC-R2/SEC-R5.

## Q2 confirmed — no action; R14 pattern is canon (tier owner-confirmed).

## From soorya's Inventory field report (PLUGIN-FIXES.md, 2026-07-03 · triaged 2026-07-14)
A1–A4 + B landed upstream 2026-07-14 (env unification incl. KF_* aliases + KISSFLOW_DOMAIN, .env
autoloader, host log, putListItems + applyIR PASS 1b). Remaining, by value:
- [ ] **E3 · addWorkflow conditions + multiple terminals** — entry-guards/skips and a second
  (Rejected) terminal are design-intent only; every item routes linearly. Single most valuable
  engine gap (already owner-confirmed as platform-supported, Q1). Fixture: Inventory movement guards.
- [ ] **D · resolve-experience entity matching** — kf-ux-architect binds IR slugs; resolve.mjs matches
  live schema NAMES → all widgets dropped. Fix: pass the IR id→live-name map into resolve (or match
  alias index of id+name+slug). Also: keep widgets whose single bind.field is DERIVED (carry as
  measure-hint) instead of hard-dropping.
- [ ] **F · unstaffed-actor satisfiability** — verifier/coherence must flag workflow steps whose actor
  role has 0 members at go-live (submit hard-fails "no assignee"); consider fallback assignee or
  apply-time warning.
- [ ] **E1 · dataset apply** — multi-field "dataset" flows are silently never applied; either implement
  or make the architect/validator auto-promote to Form + warn.
- [ ] **C · deploy-ui upload leg** — the zip upload URL is a guessed stub (404); wire the real endpoint
  or fail fast with manual App Builder steps. (Stray empty component CCDlET0l4kH4 left on the app.)
- [ ] **G1 · UI foundation guidance** — don't blank a dashboard on a secondary flow's permission error
  (scope error state to core flows; degrade secondary to empty).
- [ ] **H1 · $CLAUDE_PLUGIN_ROOT empty in Bash** — author-setup should self-resolve the plugin root
  (glob ~/.claude/plugins/cache) when the var is unset.
- [ ] **H2 · PDF BRD ingestion** — bundle/document a text-extraction path (pypdf) for PDF BRDs.
