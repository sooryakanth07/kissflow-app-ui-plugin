---
description: Run the app UI — offline mock, live dev data, and the role switcher.
---

Start the app dev server so the user can preview the generated UI.

Steps:

1. Start it (HTTPS on port 3000):
   ```bash
   npm run dev
   ```
   Run it in the background and report the URL (`https://localhost:3000`).

2. Explain the two dev modes (decided automatically):
   - **Offline mock** — if there's no `.env`, the app boots a mock seeded from
     `lib/kf-schema.json` so the UI renders without Kissflow. Good for fast layout work.
   - **Live dev** — with `.env` admin keys present, a dev-server proxy (`/__kf/*`)
     attaches the key server-side and the app reads/writes REAL data from the connected
     app. The chip shows "live dev".
   - In both, the bottom-right **role switcher** simulates roles; components a role
     can't access show a "Restricted" block.

3. Note the limits honestly:
   - Native forms / `openForm` and stage-changing drag-drop only persist **inside
     Kissflow** (set this dev URL as the app's Custom UI). On localhost they're a
     reconstructed/optimistic preview.

Suggest `/deploy` when the UI is ready.
