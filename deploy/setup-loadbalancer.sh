#!/usr/bin/env bash
# setup-loadbalancer.sh — Global external HTTPS LB → serverless NEG → Cloud Run 'appbuilder', with a
# Google-managed cert for appbuilder.zingworks.com. You then point Cloudflare DNS at the LB's static IP.
# All compute.* creates are Editor-permitted (no setIamPolicy needed).
set -euo pipefail
PROJECT="${PROJECT:-kf-app-builder-p001}"
REGION="${REGION:-asia-south1}"
DOMAIN="${DOMAIN:-appbuilder.zingworks.com}"
SVC="${SVC:-appbuilder}"
gcloud config set project "$PROJECT" >/dev/null

gcloud services enable compute.googleapis.com --project "$PROJECT"

# 1) serverless NEG → the Cloud Run service
gcloud compute network-endpoint-groups create appbuilder-neg --region="$REGION" \
  --network-endpoint-type=serverless --cloud-run-service="$SVC" 2>/dev/null || echo "  neg exists"

# 2) global backend service + attach the NEG
gcloud compute backend-services create appbuilder-be --global --load-balancing-scheme=EXTERNAL_MANAGED 2>/dev/null || echo "  backend exists"
gcloud compute backend-services add-backend appbuilder-be --global \
  --network-endpoint-group=appbuilder-neg --network-endpoint-group-region="$REGION" 2>/dev/null || echo "  backend already attached"

# 3) Google-managed TLS cert for the domain (provisions once DNS points here)
gcloud compute ssl-certificates create appbuilder-cert --global --domains="$DOMAIN" 2>/dev/null || echo "  cert exists"

# 4) url-map → https proxy (with cert)
gcloud compute url-maps create appbuilder-lb --default-service=appbuilder-be 2>/dev/null || echo "  url-map exists"
gcloud compute target-https-proxies create appbuilder-https-proxy \
  --url-map=appbuilder-lb --ssl-certificates=appbuilder-cert 2>/dev/null || echo "  https-proxy exists"

# 5) reserve a global static IP + forwarding rule on 443
gcloud compute addresses create appbuilder-ip --global 2>/dev/null || echo "  ip exists"
gcloud compute forwarding-rules create appbuilder-fr --global \
  --target-https-proxy=appbuilder-https-proxy --ports=443 --address=appbuilder-ip \
  --load-balancing-scheme=EXTERNAL_MANAGED 2>/dev/null || echo "  fwd-rule exists"

# 6) HTTP→HTTPS redirect (port 80) so plain http also works
printf 'kind: compute#urlMap\nname: appbuilder-http-redirect\ndefaultUrlRedirect:\n  httpsRedirect: true\n  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT\n' > /tmp/appbuilder-redirect.yaml
gcloud compute url-maps import appbuilder-http-redirect --source=/tmp/appbuilder-redirect.yaml --global -q 2>/dev/null || echo "  redirect url-map exists"
gcloud compute target-http-proxies create appbuilder-http-proxy --url-map=appbuilder-http-redirect 2>/dev/null || echo "  http-proxy exists"
gcloud compute forwarding-rules create appbuilder-fr-http --global \
  --target-http-proxy=appbuilder-http-proxy --ports=80 --address=appbuilder-ip \
  --load-balancing-scheme=EXTERNAL_MANAGED 2>/dev/null || echo "  http fwd-rule exists"

IP=$(gcloud compute addresses describe appbuilder-ip --global --format='value(address)')
echo ""
echo "════════════════════════════════════════════════════════════════"
echo " LB static IP: $IP"
echo " Cloudflare → add an A record:  ${DOMAIN}  →  ${IP}"
echo "   • Set DNS-ONLY (grey cloud) FIRST so Google can validate + issue the managed cert (10-60 min)."
echo "   • Once the cert is ACTIVE you may flip to PROXIED (orange) with SSL mode Full (strict)."
echo "════════════════════════════════════════════════════════════════"
echo " cert status:  gcloud compute ssl-certificates describe appbuilder-cert --global --format='value(managed.status)'"
