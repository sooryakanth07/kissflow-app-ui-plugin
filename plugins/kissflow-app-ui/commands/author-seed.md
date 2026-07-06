---
description: Populate an app with data — import master/reference records (CSV → dataform import), migrate legacy records via the runtime API, and seed the acceptance sandbox. Mapping + validation + dedup + dry-run; idempotent; masters before referencers; never auto-loads to prod.
argument-hint: --target <env> [path to CSV / records] [flow id or name]
---

Spawn **kf-seed** to fill the built schema with real/representative data. A correct schema is useless
until its lists/datasets are populated and reference fields have targets.

Pre-req: the schema exists (via `/author-app` or `/author-reconcile`); IR at `lib/app-spec.json`;
`engine/cli.mjs` exists.

1. **Identify targets** from `data_model`: the lists/datasets (masters/option sets) and any forms
   needing starting records; plus whatever **kf-acceptance** scenarios require.
2. **Map** source columns → target fields (type coercion, reference resolution: legacy name →
   dataset record `_id`); record the mapping.
3. **Validate & dedup** — required/types/referential integrity; detect duplicates by a natural key;
   report rejects with reasons.
4. **Dry-run** — preview counts (insert/update/skip/reject), write nothing, get approval.
5. **Load idempotently** — CSV import or runtime API keyed by the natural key (re-run updates, never
   duplicates); **masters before referencing forms**.
6. **Sandbox seed** — for acceptance, load exactly the reference + starting records the scenarios
   need; isolate/tear down test records.

Output: the `seed` IR slice (sources, mappings, validation, per-flow load counts, dedup key). Never
auto-load to prod without explicit approval; sandbox data stays out of prod.
