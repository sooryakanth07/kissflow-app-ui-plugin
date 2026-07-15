# kissflow-app-ui

A Claude Code plugin that takes an idea → a **real Kissflow app** — data models, roles,
workflows — **and** its UI, either as **native Kissflow pages** or a **custom shadcn React UI**.

It merges two pipelines:
- **Authoring** (from `kf-app-author`): a deterministic engine + agent team that turns a BRD
  into real Kissflow metadata (apps, forms/processes/cases/datasets, fields, formulas,
  references, roles, permissions, workflows) via `create-shell → draft → publish`.
- **Custom UI** (ours): a shadcn/Tailwind-v4 React app (`@kissflow/app-core` +
  `@kissflow/create-kf-app`) generated from the app's schema and deployed as the app's
  `Application` custom component (rendered in-Kissflow via `_is_custom_ui_enabled`).

## The end-to-end command
```
/build-app "<BRD or idea>" [--ui native|custom]
```
Authors the app → generates it in your dev account → asks **native pages or custom React UI** →
builds + deploys that UI. Pre-req: run `/author-setup` once — it stages the engine + reference and
**connects you to your appbuilder project** via a browser sign-in (scopes creds + shared memory to
the project and writes `.kf-env`). Local admin access keys
(`KISSFLOW_SUBDOMAIN/ACCOUNT_ID/API_KEY/API_SECRET`) remain a fallback for offline authoring.

## Connect & track builds
`/author-setup` links the session to a project on Kissflow's hosted **appbuilder**
(`appbuilder.zingworks.com`) through an OAuth-style device flow — the plugin is a *client*, it
hosts nothing. Every `/author-generate` (or `/build-app`) then registers the build as a **version**
in the app's Versions list via `engine/publish.mjs` (a no-op when authoring purely locally).

## How the two UI modes work
After the app + data models exist:
- **Native** — `kf-experience-designer` designs Kissflow pages; the engine's `buildPage`
  transformer creates them (needs `python3`).
- **Custom** — `kf-ux-architect` designs a Kissflow-agnostic **Experience Spec** (widgets bound
  to entities *by meaning*); `engine/cli.mjs resolve-experience` maps those binds to the app's
  real ids → `lib/ui-spec.json`; our `kf-ui-designer → kf-ui-builder → kf-ui-qa` render shadcn
  pages; `deploy-ui` uploads the bundle as the `Application` component and flips the flag.

## Commands
- **Whole app**: `/build-app` (express), or the staged authoring loop `/author-setup →
  /author-brief → /author-plan → /author-review → /author-refine → /author-preview →
  /author-generate` (+ `/author-status`, `/author-runs`, `/author-app`).
- **Add to an app**: `/add-flow`, `/add-board`, `/author-model`, `/author-roles`,
  `/author-seed`, `/author-reconcile`, `/author-understand`.
- **Custom UI for an existing app**: `/connect → /sync → /add-page → /run → /deploy`.

## Agents
- **Authoring** (write only to the IR `app-spec.json`, `kf-verifier`-gated): `kf-ba`,
  `kf-architect`, `kf-data-architect`, `kf-workflow-designer`, `kf-security-designer`,
  `kf-integration-analyst`, `kf-experience-designer` (native UI), `kf-coherence-critic`,
  `kf-verifier`, `kf-acceptance`, `kf-reconciler`, `kf-author`, `kf-seed`, `kf-comprehension`,
  `kf-ux-architect` + `kf-prototype-builder` (Experience Spec).
- **Custom UI** (consume `ui-spec.json`): `kf-ui-architect`, `kf-ui-designer`, `kf-ui-builder`,
  `kf-ui-qa` — shadcn/ui + Tailwind v4, semantic tokens only (see `agents/design-guidelines.md`,
  `agents/theming.md`).

## Reference
`engine/` (the deterministic metadata engine + `resolve.mjs`/`deploy-ui.mjs`), `reference/`
(the authoring playbooks — `CONCEPTS.md`, `LESSONS.md`, `EXPERIENCE-SPEC.md`, …), `docs/`
(pipeline guide), `MEMORY.md` (cross-run agent memory), `AGENTS.md` (the custom-UI pipeline
bundle). Two hard rules everywhere: **SDK/real data only — never fabricate**, and the pipeline
**learns** (agents read/update `lib/kf-preferences.md`).
