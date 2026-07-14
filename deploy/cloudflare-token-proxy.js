// cloudflare-token-proxy.js — Cloudflare Worker that fronts appbuilder.zingworks.com and calls the
// (private) Cloud Run service with a Google-signed ID token. This is the org-compliant answer to
// "allUsers is blocked": Cloud Run stays private, run.invoker is granted to ONE service account
// (a specific member — allowed by domain-restricted-sharing), and this Worker mints that SA's ID token.
//
// Worker vars/secrets:
//   RUN_URL  (var)    = https://appbuilder-831023735360.asia-south1.run.app   (the Cloud Run URL)
//   SA_KEY   (secret) = the full JSON of a key for appbuilder-invoker@kf-app-builder-p001.iam.gserviceaccount.com
// Route: appbuilder.zingworks.com/*  → this Worker.

let cached = { token: null, exp: 0 };
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function importPk(pem) {
  const b = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", raw.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function idToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.exp - 60 > now) return cached.token;
  const key = JSON.parse(env.SA_KEY);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({ iss: key.client_email, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, target_audience: env.RUN_URL });
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, await importPk(key.private_key), new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + b64url(sig);
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const j = await r.json();
  if (!j.id_token) throw new Error("token exchange failed: " + JSON.stringify(j));
  cached = { token: j.id_token, exp: now + 3500 };
  return j.id_token;
}

export default {
  async fetch(request, env) {
    let token;
    try { token = await idToken(env); } catch (e) { return new Response("proxy auth error: " + e.message, { status: 502 }); }
    const url = new URL(request.url);
    const target = env.RUN_URL.replace(/\/$/, "") + url.pathname + url.search;
    const headers = new Headers(request.headers);
    headers.delete("host"); // let fetch set Host to the run.app host (Cloud Run routes by it)
    headers.set("Authorization", "Bearer " + token);
    const resp = await fetch(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body, redirect: "manual" });
    return new Response(resp.body, { status: resp.status, headers: resp.headers });
  },
};
