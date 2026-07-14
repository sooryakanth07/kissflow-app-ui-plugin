#!/usr/bin/env bash
# deploy-control-plane.sh — build + deploy the control plane to Cloud Run. Runs Cloud Build from source.
# PREREQS (Owner-only, one-time): the runtime SA must have roles/cloudsql.client and secretAccessor on
# google-oauth-client-secret + pg-app-password; and the OAuth secret VALUE must be populated.
#   bash deploy/deploy-control-plane.sh
set -euo pipefail
PROJECT="${PROJECT:-kf-app-builder-p001}"
REGION="${REGION:-asia-south1}"
SA="kf-control-plane@${PROJECT}.iam.gserviceaccount.com"
CONN="${PROJECT}:${REGION}:kf-pg"
SVC="${SVC:-appbuilder}"
# The public front is the custom domain (via the LB). Point BASE_URL / OAuth redirect there so login and
# connect links are on the branded host. Override with PUBLIC_URL=... to use the run.app URL instead.
URL="${PUBLIC_URL:-https://appbuilder.zingworks.com}"
echo "▶ public URL: $URL"

gcloud run deploy "$SVC" \
  --source control-plane --quiet \
  --project "$PROJECT" --region "$REGION" \
  --service-account "$SA" \
  --add-cloudsql-instances "$CONN" \
  --allow-unauthenticated \
  --set-env-vars "DB_BACKEND=pg,PG_USER=kfapp,PG_DB=kfapp,INSTANCE_CONNECTION_NAME=${CONN},KF_MEM_STORE=pgvector,KF_GCS_BUCKET=${PROJECT}-artifacts,GOOGLE_CLIENT_ID=831023735360-0fk1l73r5egbdtif4qppdv4og48mrqtg.apps.googleusercontent.com,ALLOWED_DOMAIN=kissflow.com,BASE_URL=${URL},OAUTH_REDIRECT_URI=${URL}/auth/google/callback,ADMIN_TOKEN=${ADMIN_TOKEN}" \
  --set-secrets "GOOGLE_CLIENT_SECRET=google-oauth-client-secret:latest,PG_PASSWORD=pg-app-password:latest,SESSION_SECRET=session-secret:latest"

REAL=$(gcloud run services describe "$SVC" --project "$PROJECT" --region "$REGION" --format='value(status.url)')
echo "▶ deployed. Cloud Run URL (behind the LB): $REAL"
echo "▶ public URL (BASE_URL): $URL"
echo "▶ ADD this to the OAuth client's Authorized redirect URIs (console):  ${URL}/auth/google/callback"
# NOTE: create a SESSION_SECRET secret first (any strong random), else drop it from --set-secrets and rely on the default (dev only):
#   openssl rand -base64 32 | gcloud secrets create session-secret --data-file=- --replication-policy=automatic
