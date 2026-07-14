#!/usr/bin/env bash
# provision-gcp.sh — stand up the control-plane SUBSTRATE for the hosted kf-app-builder on GCP.
# REVIEW BEFORE RUNNING. Idempotent-ish (re-running skips what exists). Creates billable resources.
# It does NOT deploy the app (that's step 2, once the real control plane is containerized) and it does
# NOT put the OAuth secret in the repo — you add that value yourself (see step 6).
#
#   PROJECT=kf-app-builder-p001 REGION=us-central1 bash deploy/provision-gcp.sh
set -euo pipefail

PROJECT="${PROJECT:-kf-app-builder-p001}"
REGION="${REGION:-us-central1}"                 # pick your region; asia-south1 (Mumbai) if you want India-local
BUCKET="gs://${PROJECT}-artifacts"              # prototypes / reviews / versioned build artifacts
RUN_SA="kf-control-plane"                       # runtime service account for Cloud Run (least privilege)
SA_EMAIL="${RUN_SA}@${PROJECT}.iam.gserviceaccount.com"
REPO="kf-images"                                # Artifact Registry docker repo
OAUTH_SECRET="google-oauth-client-secret"       # Secret Manager entry (VALUE added in step 6, not here)

gcloud config set project "$PROJECT"
echo "▶ project=$PROJECT region=$REGION"

# 1) Enable the APIs the control plane needs.
gcloud services enable \
  run.googleapis.com sqladmin.googleapis.com storage.googleapis.com \
  secretmanager.googleapis.com identitytoolkit.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com iam.googleapis.com

# 2) Cloud SQL for Postgres + pgvector — ONE database for BOTH the control-plane metadata (projects,
#    memberships, versions) AND the shared memory vectors (replaces Firestore AND Qdrant).
PG_INSTANCE="${PG_INSTANCE:-kf-pg}"
PG_DB="${PG_DB:-kfapp}"
PG_USER="${PG_USER:-kfapp}"
PG_TIER="${PG_TIER:-db-f1-micro}"               # shared-core, cheapest (~\$8-10/mo). Bump for load.
gcloud sql instances create "$PG_INSTANCE" --database-version=POSTGRES_16 --tier="$PG_TIER" \
  --region="$REGION" --storage-size=10GB --storage-type=SSD 2>/dev/null \
  || echo "  sql instance exists — skipping"
gcloud sql databases create "$PG_DB" --instance="$PG_INSTANCE" 2>/dev/null || echo "  db exists — skipping"
# DB password → generated and stored in Secret Manager (never printed/committed). App user, not superuser.
gcloud secrets create pg-app-password --replication-policy=automatic 2>/dev/null || true
if ! gcloud secrets versions access latest --secret=pg-app-password >/dev/null 2>&1; then
  PW="$(openssl rand -base64 24)"; printf '%s' "$PW" | gcloud secrets versions add pg-app-password --data-file=-
fi
PW="$(gcloud secrets versions access latest --secret=pg-app-password)"
gcloud sql users create "$PG_USER" --instance="$PG_INSTANCE" --password="$PW" 2>/dev/null \
  || gcloud sql users set-password "$PG_USER" --instance="$PG_INSTANCE" --password="$PW" 2>/dev/null || true
echo "  → apply schema (pgvector + tables) via the proxy or a client:  psql \"\$PG_URL\" -f engine/pg-schema.sql"
echo "    CREATE EXTENSION vector is in the schema; Cloud SQL Postgres supports pgvector natively."

# 3) GCS bucket — artifacts. Uniform access, NO public access (served via signed URLs / the app).
gcloud storage buckets create "$BUCKET" --location="$REGION" --uniform-bucket-level-access \
  --public-access-prevention 2>/dev/null || echo "  bucket exists — skipping"

# 4) Artifact Registry — holds the control-plane container image.
gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" \
  --description="kf control plane images" 2>/dev/null || echo "  repo exists — skipping"

# 5) Runtime service account + LEAST-PRIVILEGE roles (Firestore, this bucket only, read secrets).
gcloud iam service-accounts create "$RUN_SA" --display-name="kf control plane runtime" 2>/dev/null \
  || echo "  SA exists — skipping"
# bucket + secret bindings are RESOURCE-level (Editor can do these).
gcloud storage buckets add-iam-policy-binding "$BUCKET" --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin" >/dev/null
for S in "$OAUTH_SECRET" pg-app-password; do
  gcloud secrets add-iam-policy-binding "$S" --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null 2>&1 || echo "  (secret $S binding needs the secret to exist)"
done
# cloudsql.client is PROJECT-level → needs an Owner (Editor cannot setIamPolicy). Run as Owner:
echo "  ▶ OWNER must grant the runtime SA Cloud SQL access:"
echo "    gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:${SA_EMAIL} --role=roles/cloudsql.client"

# 6) Secret Manager — create the OAuth client-secret ENTRY (empty). You add the VALUE yourself so it
#    never lands in this repo or scrollback. Run THIS line manually with the freshly-rotated secret:
gcloud secrets create "$OAUTH_SECRET" --replication-policy=automatic 2>/dev/null \
  || echo "  secret entry exists — skipping"
echo "  → add the value yourself:  printf '%s' 'YOUR_ROTATED_CLIENT_SECRET' | gcloud secrets versions add $OAUTH_SECRET --data-file=-"

# 7) Identity Platform — enable Google as the ONLY sign-in provider. Enabling the API is done in (1);
#    configuring the Google IdP with your client_id + client_secret is a REST call (below), run with the
#    secret pulled from Secret Manager so it isn't typed inline. client_id is public; the secret is not.
cat <<'NOTE'
  ▶ Configure Google SSO (run after step 6 populates the secret):
    CID=831023735360-0fk1l73r5egbdtif4qppdv4og48mrqtg.apps.googleusercontent.com
    CSECRET=$(gcloud secrets versions access latest --secret=google-oauth-client-secret)
    TOKEN=$(gcloud auth print-access-token)
    curl -s -X PATCH \
      "https://identitytoolkit.googleapis.com/admin/v2/projects/kf-app-builder-p001/defaultSupportedIdpConfigs/google.com?updateMask=enabled,clientId,clientSecret" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"enabled\":true,\"clientId\":\"$CID\",\"clientSecret\":\"$CSECRET\"}"
    # (if it 404s, create instead: POST …/defaultSupportedIdpConfigs?idpId=google.com )
NOTE

echo "✔ substrate provisioned. NEXT (step 2): containerize the control plane (port of engine/test/control-plane-mock.mjs to a real Firestore/GCS/Secret Manager app) and deploy:"
echo "    gcloud run deploy kf-control-plane --source . --region $REGION --service-account $SA_EMAIL --no-allow-unauthenticated"
