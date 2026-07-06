---
description: Author or amend ONE data model (form/process/case/dataset) through the IR + engine flow — write/update its slice in lib/app-spec.json, verify, then dry-run build and apply on approval. A scoped slice of the full pipeline.
argument-hint: <type form|process|case|dataset> "<Model Name>" [fields…] [--target <env>]
---

Author a single model via the **IR blackboard** + **engine**, not by hand-building blobs. This is a
scoped use of the pipeline — it writes one flow into `lib/app-spec.json` and applies it as a minimal
diff.

Pre-req: `engine/cli.mjs` exists; IR at `lib/app-spec.json`. Reference:
`kf-author-plugin/reference/` (CONCEPTS.md, OBSERVED_OBJECTS.md, APP_METADATA_MODEL.md).

1. **Parse** `$ARGUMENTS` into a model intent: type, name, fields (name, type, required?, reference →
   target model, computed → formula string). Confirm with the user.
2. **Spawn `kf-data-architect`** to write/extend the `data_model` slice for this flow (fields, types,
   references with lookup/hidden + filter, child tables, computed formulas). Referenced masters must
   already exist in the IR / live app (else author them first, or run `/author-app`). Never author
   system fields (inherited from FormBase).
3. **Verify**: spawn `kf-verifier` (`node engine/cli.mjs verify lib/app-spec.json`) — fix dangling
   references, undefined formula identifiers, orphan child tables before proceeding.
4. **Dry-run + apply**: `node engine/cli.mjs build lib/app-spec.json --out <dir>` → show the plan; on
   approval, `… --apply --target <env>`. For an existing app, front it with **kf-reconciler**
   (`/author-reconcile`) so it lands as a minimal, ownership-aware diff.

Never auto-publish to prod. Report the flow id + field list + verify status.
