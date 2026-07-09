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
6. **Go live on the LOCAL dev server + build the shippable zip.** This is the default finish —
   enable Custom UI against the running dev server so the user sees the app immediately, and leave
   the production zip for a manual upload:
   a. **Start the dev server** in the **background** (the Custom UI iframe loads it):
      `npm run dev` → HTTPS on `https://localhost:3000` (see `/run`). Give it a moment to boot.
   b. **Enable Custom UI + point it at the dev server + open the app:**
      `node engine/cli.mjs deploy-ui --app <appId> --url https://localhost:3000 --open`
      — creates/updates the `Category:"Application"` custom component, publishes it Live, sets
      `_is_custom_ui_enabled: true`, and **opens the app in the default browser**. The app now
      renders straight from the running dev server (edit a page → hot-reload in Kissflow).
   c. **Build the shippable bundle:** `npm run zip` → `<project>.zip`
      (`manifest Category:"Application"`). **Leave it for the user to upload MANUALLY** — programmatic
      zip upload isn't wired. To ship a self-contained build later, they upload the zip in
      App Builder → Settings → Custom UI (Zip); until then the app runs off the dev-server URL.
   ⚠️ The dev URL is `https://localhost` — the browser must trust the scaffold's local cert
   (`cert/localhost.*`); accept it once if prompted, or the iframe stays blank.

## Finish
Summarize: the app + data models + roles + workflows created (with the app id); the UI mode; and
for custom, that **Custom UI is enabled + pointed at the local dev server** and the app was
**opened in the browser** (keep `npm run dev` running to see it), plus `<project>.zip` is ready for
a **manual** production upload (Settings → Custom UI → Zip). Record any preference the user
corrected in `lib/kf-preferences.md` so the next run matches their taste.
