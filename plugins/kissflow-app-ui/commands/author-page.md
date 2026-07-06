---
description: Author a page / role experience through the IR + engine flow — write the experience slice (landing, nav, DERIVED dashboard, pages) in lib/app-spec.json, verify coherence, then dry-run build and apply on approval.
argument-hint: "<Page or Role Name>" [layout / journey description] [--target <env>]
---

Author a page or a role's landing/dashboard via the **IR blackboard** + **engine**. Pages come last
in the canonical order (they surface the flows, role-aware), and **dashboards are DERIVED** from
role × data-scope × workflow × reports — never authored standalone.

Pre-req: `engine/cli.mjs` exists; IR at `lib/app-spec.json` with `data_model`, `workflow`, and
`security` already present (a page binds to existing flows/reports/roles). Reference:
`kf-author-plugin/reference/` (CONCEPTS.md, OBSERVED_OBJECTS.md §9, APP_METADATA_MODEL.md).

1. **Parse** `$ARGUMENTS` into intent: which role/persona this serves and which journey step(s) it
   supports. Confirm.
2. **Spawn `kf-experience-designer`** to write/extend the `experience` slice: the page(s), the
   role-aware nav, the meaningful landing, and the DERIVED dashboard tiles (each tile = `{flow_id,
   report/view, scope, source_journey}`, filtered by `security.data_scope`). All `flow_id`/
   `report_id`/role refs must already exist in the IR.
3. **Verify**: spawn `kf-verifier` then `kf-coherence-critic` (`node engine/cli.mjs verify
   lib/app-spec.json`) — dashboard relevance + scope, no nav to unreachable pages, no tile bound to a
   missing report, journey has a landing. Fix before proceeding.
4. **Dry-run + apply**: `node engine/cli.mjs build lib/app-spec.json --out <dir>` → show the plan; on
   approval `… --apply --target <env>`. For an existing app, front it with **kf-reconciler**.

**Alternative (richer UI):** hand the page to **kf-app-builder** (`/add-page`) for a themed React
Custom-UI page instead of the native page graph. Never auto-publish to prod.
