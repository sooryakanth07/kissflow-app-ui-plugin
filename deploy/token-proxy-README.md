# Token proxy — serve appbuilder.zingworks.com when `allUsers` is blocked org-wide

`allUsers` (public Cloud Run) is refused by the org's domain-restricted-sharing policy. Instead of making
Cloud Run public, we keep it **private** and put a **Cloudflare Worker** in front that authenticates each
call to Cloud Run with a Google **ID token** minted from a dedicated service account. Granting
`run.invoker` to that ONE service account is a *specific member* — which the org policy allows (unlike
`allUsers`). Our app still does its own Google login on top; the token proxy only satisfies Cloud Run's
invocation IAM.

```
browser → appbuilder.zingworks.com (Cloudflare, proxied) → Worker (adds SA ID token) → Cloud Run (private)
```
The Load Balancer is no longer on the path (the Worker calls the run.app URL directly); you can delete the
LB later to save the forwarding-rule cost.

## 1. Grant the invoker SA `run.invoker` — OWNER runs this (specific member, org-allowed)
```bash
gcloud run services add-iam-policy-binding appbuilder --region=asia-south1 --project kf-app-builder-p001 \
  --member="serviceAccount:appbuilder-invoker@kf-app-builder-p001.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```
(The SA `appbuilder-invoker` already exists.)

## 2. Create a key for the SA (you run this; the key never passes through me)
```bash
gcloud iam service-accounts keys create appbuilder-invoker-key.json \
  --iam-account=appbuilder-invoker@kf-app-builder-p001.iam.gserviceaccount.com
```
Keep `appbuilder-invoker-key.json` safe; you'll paste its contents into Cloudflare, then delete it locally.

## 3. Deploy the Worker (Cloudflare dashboard, easiest)
1. Workers & Pages → Create → **Worker** → name it `appbuilder-proxy` → paste `deploy/cloudflare-token-proxy.js` → Deploy.
2. Worker → **Settings → Variables**:
   - `RUN_URL` (plaintext var) = `https://appbuilder-831023735360.asia-south1.run.app`
   - `SA_KEY` (**Encrypt** / secret) = the entire contents of `appbuilder-invoker-key.json`
3. Worker → **Settings → Triggers → Routes** → Add route: `appbuilder.zingworks.com/*` (zone `zingworks.com`).
4. **DNS** (Cloudflare): ensure `appbuilder.zingworks.com` is a **Proxied (orange)** record so the route
   fires. Any proxied A record works — e.g. point it at `192.0.2.1` (dummy) or the old LB IP; the Worker
   intercepts before origin.

(Or with wrangler: `wrangler deploy`, `wrangler secret put SA_KEY`, set `RUN_URL` var + the route in `wrangler.toml`.)

## 4. Verify
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://appbuilder.zingworks.com/health   # → 200
```
Then open `https://appbuilder.zingworks.com` → the sign-in page → Google login (the redirect URI is already
registered).

## Security note
`SA_KEY` is a long-lived credential held as a Cloudflare secret. The keyless alternative is **Workload
Identity Federation** (Cloudflare OIDC → GCP), which avoids the SA key entirely but needs a WIF pool +
provider set up; the Worker would fetch a token via the WIF exchange instead of signing a JWT. Start with
the key for speed; move to WIF for hardening.
