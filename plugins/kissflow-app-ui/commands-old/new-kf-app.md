---
description: Scaffold a new Kissflow App UI project and start building. Usage: /kissflow-app-ui:new-kf-app <project-name>
---

Scaffold and build a new Kissflow custom App UI.

Arguments: `$ARGUMENTS` — the project name (kebab-case). If it's missing, infer one from
the request or ask. (The Kissflow App ID isn't needed to scaffold — only later for data sync.)

Then run the full flow:

1. **Scaffold:**
   `npx -y @kissflow/create-kf-app --target app --name <project-name> --yes`
2. **Install:** `cd <project-name> && npm install`
3. **Onboard:** read `CLAUDE.md`, `agents/design-guidelines.md`, and `agents/kissflow-sdk.md`.
4. **Sync data:** set up `.env` from `.env.example` (it needs the app's `KF_DOMAIN`,
   `KF_ACCOUNT_ID`, `KF_APP_ID`, and a `KF_ACCESS_KEY_ID`/`KF_ACCESS_KEY_SECRET` pair —
   ask the user for these), run `npm run kf:sync`, then read `lib/kf-context.md` for the
   app's data models, fields, and roles.
5. **Build** the UI the user asked for, following `agents/design-guidelines.md` — design
   fresh for the app's domain (do not reskin the bundled demo), modern and polished.

Finally, tell the user to run `npm run dev` and paste `https://localhost:3000` into their
Kissflow app's **Settings → Custom UI**.
