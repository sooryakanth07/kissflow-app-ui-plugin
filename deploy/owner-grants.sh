#!/usr/bin/env bash
# owner-grants.sh — the ONE-TIME actions that need Owner (or secretmanager.admin +
# resourcemanager.projectIamAdmin + Cloud SQL admin). Everything a restricted Editor could do is
# already done. After this runs, `bash deploy/deploy-control-plane.sh` will deploy successfully.
#   bash deploy/owner-grants.sh
set -euo pipefail
PROJECT="${PROJECT:-kf-app-builder-p001}"
SA="kf-control-plane@${PROJECT}.iam.gserviceaccount.com"

# 1) session-signing secret (random, one-time)
openssl rand -base64 32 | gcloud secrets create session-secret --data-file=- \
  --replication-policy=automatic --project "$PROJECT" 2>/dev/null && echo "  created session-secret" \
  || echo "  session-secret already exists — skipping"

# 2) OAuth client secret VALUE. ROTATE it first (Console → APIs & Services → Credentials → the OAuth
#    client → reset secret), then paste when prompted (input hidden, not stored in shell history).
read -rsp "  Paste ROTATED Google OAuth client secret: " OAUTH; echo
printf '%s' "$OAUTH" | gcloud secrets versions add google-oauth-client-secret --data-file=- --project "$PROJECT" >/dev/null
unset OAUTH
echo "  OAuth secret value stored"

# 3) let the runtime SA READ the three secrets it needs at boot
for S in google-oauth-client-secret pg-app-password session-secret; do
  gcloud secrets add-iam-policy-binding "$S" --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" --project "$PROJECT" >/dev/null
  echo "  granted secretAccessor on $S"
done

# 4) let the runtime SA connect to Cloud SQL (project-level — this is the binding a plain Editor cannot do)
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${SA}" \
  --role="roles/cloudsql.client" --condition=None -q >/dev/null
echo "  granted cloudsql.client"

# 5) let the runtime SA manage the PER-PROJECT Kissflow-creds secrets (the dev-env form in the app
#    creates secret-<project>-kissflow on demand, adds versions, and reads them back at bootstrap).
#    Without this, saving a dev env in the UI fails: "secret write failed (403)".
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.admin" --condition=None -q >/dev/null
echo "  granted secretmanager.admin (per-project dev-env secrets)"

echo "✔ done. Next: bash deploy/deploy-control-plane.sh   (then add <URL>/auth/google/callback to the OAuth client's redirect URIs)"
