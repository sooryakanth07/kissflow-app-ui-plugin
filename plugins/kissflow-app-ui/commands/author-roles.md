---
description: Author roles and their permission matrices through the IR + engine flow — write the role list + security slice in lib/app-spec.json, verify (no lockouts), then dry-run build and apply on approval.
argument-hint: "<Role Name>" [users…] [groups…] [--target <env>]
---

Author roles + permissions via the **IR blackboard** + **engine**. Roles come first in the canonical
order (data models & permissions reference them by `_id`), and permissions carry the cross-cutting
**data scope** that views and dashboards reuse.

Pre-req: `engine/cli.mjs` exists; IR at `lib/app-spec.json`. Reference:
`kf-author-plugin/reference/` (CONCEPTS.md, OBSERVED_OBJECTS.md, APP_METADATA_MODEL.md).

1. **Parse** `$ARGUMENTS` into role specs (name, optional users/groups). Confirm. If deriving roles
   from personas, the role list belongs in the `architecture` slice (spawn `kf-architect`).
2. **Spawn `kf-security-designer`** to write the `security` slice: the role list + field/step/status
   permission matrices keyed by role `_id`, plus the data scope (`my-items`/`my-team`/`all`) per
   role×flow — the canonical scope dashboards/views must consume.
3. **Verify**: spawn `kf-verifier` (`node engine/cli.mjs verify lib/app-spec.json`) — the permission
   satisfiability check: no role locked out of a step it must act on, no flow with zero viewers, every
   step has an actor. Fix lockouts before proceeding.
4. **Dry-run + apply**: `node engine/cli.mjs build lib/app-spec.json --out <dir>` → show the plan; on
   approval `… --apply --target <env>`. For an existing app, front it with **kf-reconciler**.

Never auto-publish to prod. Report the role ids, the data-scope map, and satisfiability status.
