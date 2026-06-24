---
description: Build and package the app UI for upload to Kissflow's Custom UI.
---

Build the app UI and package it for Kissflow.

Workflow — ask the target first:

0. Ask the user (AskUserQuestion) where to deploy:
   - **Dev** — point the app's Custom UI at the running dev server URL (fast iteration;
     live data via the proxy). No upload needed — they paste the dev URL in Kissflow.
   - **Prod** — build + zip the static bundle and upload it to the app's Custom UI
     (self-contained, no dev server). Use this for a real release.
   Carry the choice through the steps below.

Steps:

1. **Dev target** → don't zip. Make sure the dev server is running (`/run`), and tell
   the user to set that HTTPS URL as the app's **Custom UI** in Kissflow. Skip to step 3.

   **Prod target** → build + zip:
   ```bash
   npm run zip
   ```
   This runs the production build and produces `<your-project>.zip`
   (the `dist/` bundle + a `manifest.json` of `{ Category: "Page", Framework: "React" }`).
   If the build fails, fix the errors and re-run before continuing.

2. Tell the user how to publish (this part is manual — Kissflow has no publish API):
   - In the Kissflow App Builder for the connected app → **Settings → Custom UI**.
   - **Prod**: upload the generated `<your-project>.zip`. **Dev**: set the dev-server URL.
   - Open the app inside Kissflow. Now it runs in the Kissflow iframe → the **real SDK**
     initializes → native forms (`openForm`), validations, field permissions, and
     drag-drop stage changes all work for real.

3. Remind them: anything that was a dev-only preview on localhost (native forms,
   stage-changing drag-drop) becomes fully functional once running inside Kissflow.

Re-run `/deploy` after each change to repackage; the Custom UI just stores the bundle.
