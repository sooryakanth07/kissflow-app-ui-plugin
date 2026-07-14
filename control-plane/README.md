# control-plane — mirrored for reference (we do NOT host this)

This is the **server side** of the hosted appbuilder system — the Node + Postgres service (plus the
sibling `deploy/` GCP/Cloudflare scripts and the `docker-compose.*.yml` files) that runs
**`appbuilder.zingworks.com`**. It is **owned and deployed by Dinesh** on his GCP project; this copy
lives here only so we can co-develop against a shared source of truth.

**The `kissflow-app-ui` plugin never runs this code.** The plugin only ships the *client* scripts
(`engine/connect.mjs`, the `engine/memory*.mjs` proxy layer, `engine/publish.mjs`), which talk to the
already-deployed backend over HTTP:

- `CONTROL_PLANE_URL` defaults to `https://appbuilder.zingworks.com`
- `connect.mjs --auto` runs the browser device-flow and writes `.kf-env` (scoped project creds + token)
- `publish.mjs` registers each build as a version, so it shows up in the app's **Versions** list

So installing the plugin → `/author-setup` → connect → build tracking works **without** any of the
files in this directory. Touch these only when co-developing the backend with Dinesh; the canonical
copy remains in his `kf-app-author` repo. This directory sits at the repo root, **outside**
`plugins/kissflow-app-ui/`, so it is never part of the published plugin package.

See `deploy/token-proxy-README.md` for the Cloud Run + Cloudflare Worker deployment topology.
