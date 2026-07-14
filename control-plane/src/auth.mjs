// auth.mjs — "Google SSO only" via plain OAuth 2.0 (no Identity Platform), plus our own signed tokens.
//   session token → after login; identifies the user on every API call (cookie or Bearer). HMAC, our secret.
//   connect token → project-scoped, single-use, short-lived; what a Cowork session exchanges at /bootstrap.
// Google id_token (RS256) is verified against Google's JWKS with `jose`. Session/connect tokens are our
// own HMAC — no external verification, opaque to the session.
import { createHmac, randomUUID } from "node:crypto";
import { cfg } from "./config.mjs";

const nowSec = () => Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const unb64 = (s) => JSON.parse(Buffer.from(s, "base64url").toString());
const hmac = (s) => createHmac("sha256", cfg.sessionSecret).update(s).digest("base64url");

export function sign(payload) { const body = b64(payload); return body + "." + hmac(body); }
export function verify(token) {
  const [body, sig] = String(token).split(".");
  if (!body || !sig || hmac(body) !== sig) throw Object.assign(new Error("bad token signature"), { code: 401 });
  const p = unb64(body);
  if (p.exp < nowSec()) throw Object.assign(new Error("token expired"), { code: 401 });
  return p;
}
export const mintSession = (user, ttl = 8 * 3600) => sign({ typ: "identity", sub: user.sub, email: user.email, exp: nowSec() + ttl });
export const mintConnect = ({ projectId, sub, role, ttl = 600 }) => sign({ typ: "connect", jti: randomUUID(), projectId, sub, role, exp: nowSec() + ttl });
// project-scoped API token — handed to a Cowork session in the bootstrap config so it can call back
// (e.g. register versions) authenticated to ONE project, without a user cookie.
export const mintProjectToken = ({ projectId, role, ttl = 8 * 3600 }) => sign({ typ: "session", projectId, role, exp: nowSec() + ttl });
export function requireSession(token) { const p = verify(token); if (p.typ !== "identity") throw Object.assign(new Error("not a session token"), { code: 401 }); return p; }

// ── Google OAuth 2.0 (jose imported lazily so the app/tests load without it) ────
let _jwks = null;
async function jwks() { if (!_jwks) { const { createRemoteJWKSet } = await import("jose"); _jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")); } return _jwks; }

export function googleAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: cfg.google.clientId, redirect_uri: cfg.google.redirectUri, response_type: "code",
    scope: "openid email profile", state, access_type: "online", prompt: "select_account",
    ...(cfg.allowedDomain ? { hd: cfg.allowedDomain } : {}),
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}

// exchange the auth code for tokens, verify the id_token, return the Google identity.
export async function exchangeCode(code) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.google.clientId, client_secret: cfg.google.clientSecret, redirect_uri: cfg.google.redirectUri, grant_type: "authorization_code" }),
  });
  const tok = await r.json();
  if (!r.ok || !tok.id_token) throw Object.assign(new Error("code exchange failed: " + (tok.error || r.status)), { code: 401 });
  const { jwtVerify } = await import("jose");
  const { payload } = await jwtVerify(tok.id_token, await jwks(), { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: cfg.google.clientId });
  if (cfg.allowedDomain && payload.hd !== cfg.allowedDomain) throw Object.assign(new Error("domain not allowed"), { code: 403 });
  if (!payload.email_verified) throw Object.assign(new Error("email not verified"), { code: 403 });
  return { sub: payload.sub, email: payload.email, name: payload.name };
}
