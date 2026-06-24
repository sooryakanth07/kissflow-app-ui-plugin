---
description: Connect to a Kissflow app — collect domain/account/app + admin access keys and write .env.
argument-hint: [domain] [accountId] [appId]
---

Connect this app project to a Kissflow app by creating `.env`
(the file kf-sync / the live proxy read).

Workflow — collect ALL of the connection info before doing anything else:

1. Ask the user (in your message, list them and wait for the reply) for these five
   values. Pre-fill any provided in `$ARGUMENTS` (order: domain, accountId, appId) and
   only ask for what's missing. These are **server-to-server admin access keys** —
   keep them out of git.
   - `KF_DOMAIN` — e.g. `yourco-dev.kissflow.com` (no protocol)
   - `KF_ACCOUNT_ID`
   - `KF_APP_ID` — the application id (e.g. `Retail_Store_Management_A00`)
   - `KF_ACCESS_KEY_ID`
   - `KF_ACCESS_KEY_SECRET`  (Profile → My settings → API authentication → Access keys)

   Do not proceed to write `.env` until you have all five (or the four needed to look
   up the App ID — see step 2). Tell the user they can paste them all at once.

2. If the user doesn't know the App ID, you can list apps after you have the other
   four: `GET https://{KF_DOMAIN}/flow/2/{KF_ACCOUNT_ID}/explore` with headers
   `X-Access-Key-Id` / `X-Access-Key-Secret`, then filter `Type === "Application"`
   and let them pick.

3. Write `.env` with exactly those five keys (it is gitignored — never commit
   it). Confirm with `git check-ignore .env`.

4. Confirm the connection works: `npm run kf:sync` should reach the
   app. If it 401/403s, the key likely lacks admin scope — tell the user to mint the
   key from a Super Admin or a service account with Admin on the app.

Then suggest running `/sync` next.
