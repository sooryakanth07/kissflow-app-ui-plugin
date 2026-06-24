---
description: Sync the connected app — pull schema, roles, per-role access, pages, and distill page specs.
---

Pull everything Claude needs to understand the connected app, then summarize it.

This command takes **no options and asks no questions** — just run it end to end.

Steps:

1. Run both sync tools from the project root:
   ```bash
   npm run kf:sync && npm run kf:import
   ```
   - `kf:sync` writes `lib/kf-schema.json` + `kf-context.md` (data models +
     fields, roles, per-role access, and pages).
   - `kf:import` writes `lib/pages/*.json` (one distilled spec per app page).

2. If either fails on a flow type, it skips it with a warning — note any skipped
   flows. (Case flows are supported; integrations/portals/lists are skipped.)

3. Read `lib/kf-context.md` and give the user a short summary:
   - how many data models (and their types: Process / Form / Case),
   - the roles and which models each can access,
   - the pages found (with their input parameters).

4. Tell the user they can now `/add-page <pageId>` to generate a React page for any
   page in `lib/pages/`, or `/run` to preview with mock/live data.

Re-run `/sync` whenever the app's models, roles, or pages change.
