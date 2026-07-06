---
description: From a BRD/idea, author a whole Kissflow app (data models + roles + workflows) AND build its UI — native Kissflow pages OR a custom shadcn React UI. The end-to-end express.
argument-hint: "<BRD or idea>" [--ui native|custom] [--dry-run]
---

`/build-app` is the **end-to-end** command: it authors a real Kissflow app from your
requirement, generates it, then builds its UI. It unifies the two halves of this plugin —
Dinesh's **authoring** pipeline (data models, roles, workflows) and our **custom-UI** pipeline
(a shadcn React app deployed as the app's `Application` component). The user picks the UI mode.

Pre-req: `/author-setup` has run (engine + reference staged; creds exported —
`KISSFLOW_SUBDOMAIN`, `KISSFLOW_ACCOUNT_ID`, `KISSFLOW_API_KEY`, `KISSFLOW_API_SECRET`). If the
engine or creds are missing, tell the user to run `/author-setup` and stop.

## Step 1 — Author the app (the data layer)
**If the BRD is a PDF, extract its text FIRST** — the Read tool can fail on subsetted-font PDFs
(returns glyph garbage). Get plain text before ingesting: `pdftotext <file> -` (poppler), or
`python3 -c "import pypdf,sys;print('\n'.join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))" <file>`
(`pip install pypdf` if missing). Feed the extracted text to the authoring chain.

Run the authoring chain (same as `/author-plan` / `/author-app`), each step `kf-verifier`-gated,
writing the IR blackboard `runs/current/app-spec.json`:
`kf-ba` → `kf-architect` → `kf-data-architect` → `kf-workflow-designer` →
`kf-security-designer` → `kf-coherence-critic`.
(Large BRD → run the staged `/author-brief` + `/author-plan` + `/author-review` loop first, then
resume here at Step 2.)

## Step 2 — Generate (create it in Kissflow)
Apply the IR to the dev account. **The UI mode changes what gets generated:**
- **Custom UI** (React overrides native rendering) → skip native pages:
  `node engine/cli.mjs apply runs/current/app-spec.json --no-pages`
- **Native UI** → full apply (builds baseline native pages + nav):
  `node engine/cli.mjs apply runs/current/app-spec.json`
- `--dry-run` → `build --out runs/current/preview` instead (nothing applied; show the plan).

Capture the **created app id** from the apply output (read-after-write via `explore`).

## Step 3 — Choose the UI mode
If `--ui` was not passed, ask (AskUserQuestion): **Native Kissflow pages** or
**Custom React UI (shadcn)**? Carry the choice (it also determined Step 2's `--no-pages`).

### 3a — NATIVE path (Dinesh's, already built)
`apply` (without `--no-pages`) already created baseline pages + nav. To design richer native
pages, run `kf-experience-designer` → `node engine/cli.mjs apply … ` (see `/author-page`), then
set the app `DefaultPage`. Done — the app opens on native Kissflow pages.

### 3b — CUSTOM path (our shadcn React UI)
1. **Design** the experience: spawn `kf-ux-architect` → writes the Kissflow-agnostic
   `runs/current/experience-spec.json` (semantic binds by meaning — see `reference/EXPERIENCE-SPEC.md`).
   (Optional: `kf-prototype-builder` renders the clickable prototype for review first.)
2. **Sync** the created app's real schema: run `kf:sync` (needs the app id + creds) →
   `lib/kf-schema.json` (real model/field/role ids).
3. **Resolve** semantic binds → real ids:
   `node engine/cli.mjs resolve-experience runs/current/experience-spec.json lib/kf-schema.json --out lib/ui-spec.json`
   (drops any widget whose entity/field doesn't resolve — never fabricates; review the warnings).
4. **Scaffold** the React project (if not already):
   `npx -y @abdul-kissflow/create-kf-app --target app --name <app-slug> --yes`; set its `.env`
   `KF_APP_ID` to the created app id.
5. **Generate pages** from `lib/ui-spec.json`: `kf-ui-designer` → `kf-ui-builder` → `kf-ui-qa`
   (per-page, fanned out; QA fix-loop) → shadcn pages in `src/pages/` + nav in `app-shell.jsx`.
6. **Build + deploy** as the app's Custom UI:
   `npm run zip` (produces `<project>.zip`, `manifest Category:"Application"`), then
   `node engine/cli.mjs deploy-ui <project>.zip --app <appId>` — creates/updates the
   `Category:"Application"` custom component, publishes it Live, and sets
   `_is_custom_ui_enabled: true` on the app.
   **Note:** programmatic **zip auto-upload is not wired yet** — the zip path fails fast. Deploy EITHER
   via **`--url <hosted-or-dev-URL>`** (recommended — point Custom UI at a hosted/dev URL, fully
   implemented) OR upload the zip **manually** in App Builder → Settings → Custom UI. (Dev iteration:
   point Custom UI at the `/run` dev-server URL — see `/deploy`.)

## Finish
Summarize: the app + data models + roles + workflows created (with the app id); the UI mode;
and for custom, the deployed `Application` component + that `_is_custom_ui_enabled` is on. Tell
the user to open the app inside Kissflow — the SDK initializes and (custom) the shadcn UI renders
with its widgets reading real data. Record any preference the user corrected in
`lib/kf-preferences.md` so the next run matches their taste.
