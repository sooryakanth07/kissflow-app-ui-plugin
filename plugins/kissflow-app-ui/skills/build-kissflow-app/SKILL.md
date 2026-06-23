---
name: build-kissflow-app
description: Scaffold and build a custom UI for a Kissflow app. Use whenever the user wants to create a new Kissflow App UI / custom UI project, start a custom UI for a Kissflow app, or build screens/pages for a Kissflow app. Drives scaffolding (via create-kf-app), onboarding (data-model sync + reading the project docs), and then building the requested UI — so the user never runs the CLI by hand.
---

# Build a Kissflow App UI

Use this when the user wants to **create or build a custom UI for a Kissflow app**.
Own the whole flow end-to-end; the user should not have to run the scaffolder manually.

## 1. Project name

You only need a **project name** (kebab-case, e.g. `leave-tracker`) to scaffold — infer
one from the request if obvious, otherwise ask. (The Kissflow App ID is NOT needed to
scaffold; it's only used later for data sync — see step 4.)

## 2. Scaffold (non-interactive)

From the directory where the project should live, run:

```bash
npx -y @sooryakanth/create-kf-app --target app --name <project-name> --yes
```

This creates `./<project-name>/` — a Vite + React app on `@sooryakanth/app-ui` with
folder-based routing, a layout, the SDK wired up, and the agent docs.

## 3. Install + onboard yourself

```bash
cd <project-name>
npm install
```

Then read the project's own guidance (it's written for you):
- `CLAUDE.md` — role, routing, layouts, conventions.
- `agents/design-guidelines.md` — **read before building UI** (design tokens, do/don't, anti-reskin rules).
- `agents/kissflow-sdk.md` — the SDK API (`useKf`, `kf.app.getDataform/getProcess/getBoard`, `kf.client`, `kf.formatter`).

## 4. Sync the app's data models

The UI must be built against the app's real data. Set up `.env` from `.env.example` —
it needs `KF_DOMAIN`, `KF_ACCOUNT_ID`, `KF_APP_ID`, and a `KF_ACCESS_KEY_ID` /
`KF_ACCESS_KEY_SECRET` pair. **Ask the user for these** (including the App ID and access
keys) if you don't have them. Then:

```bash
npm run kf:sync          # → writes lib/kf-context.md + lib/kf-schema.json
```

**Read `lib/kf-context.md`** — the available dataforms/processes, their fields, and the
app's roles. Build against these ids; don't invent them. (If keys aren't available yet,
you can still build, but tell the user the data models are unknown until they run kf:sync.)

## 5. Build the UI

Build what the user asked for, following `agents/design-guidelines.md`:
- The bundled **Acme CRM demo is a wiring reference — delete it and design fresh** for
  this app's domain. Don't reskin it.
- Use the data models/fields/roles from `lib/kf-context.md` and the SDK from
  `agents/kissflow-sdk.md`.
- Aim for a modern, polished look (tokens, whitespace, real hover/empty/loading states).

## 6. Preview

`npm run dev` serves over `https://localhost:3000`. Tell the user to open that URL once
to accept the self-signed cert, then paste it into their Kissflow app's
**Settings → Custom UI** (toggle on) to see it live — or `npm run zip` to upload a bundle.
