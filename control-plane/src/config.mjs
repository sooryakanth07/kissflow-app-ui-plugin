// config.mjs — all runtime config from env (Cloud Run injects these; secrets come from Secret Manager
// via --set-secrets, which surface AS env vars, so nothing here reads Secret Manager directly).
export const cfg = {
  port: +(process.env.PORT || 8080),
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 8080}`,
  sessionSecret: process.env.SESSION_SECRET || "dev-session-secret-change-me", // prod: a Secret Manager value
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "831023735360-0fk1l73r5egbdtif4qppdv4og48mrqtg.apps.googleusercontent.com",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "", // prod: from Secret Manager (google-oauth-client-secret)
    redirectUri: process.env.OAUTH_REDIRECT_URI || `http://localhost:${process.env.PORT || 8080}/auth/google/callback`,
  },
  allowedDomain: process.env.ALLOWED_DOMAIN || "", // e.g. "kissflow.com" → restrict SSO to that Workspace domain
  db: {
    backend: process.env.DB_BACKEND || (process.env.PG_URL || process.env.DATABASE_URL || process.env.PG_PASSWORD ? "pg" : "memory"),
    // explicit URL wins; else assemble from parts. On Cloud Run the password arrives as PG_PASSWORD
    // (from Secret Manager) and the DB is reached over the Cloud SQL unix socket (INSTANCE_CONNECTION_NAME).
    url: process.env.PG_URL || process.env.DATABASE_URL || (process.env.PG_PASSWORD
      ? `postgresql://${process.env.PG_USER || "kfapp"}:${encodeURIComponent(process.env.PG_PASSWORD)}@/${process.env.PG_DB || "kfapp"}?host=${process.env.PG_SOCKET || "/cloudsql/" + (process.env.INSTANCE_CONNECTION_NAME || "")}`
      : ""),
  },
  gcsBucket: process.env.KF_GCS_BUCKET || "kf-app-builder-p001-artifacts",
  memStore: process.env.KF_MEM_STORE || "pgvector", // sessions point their shared memory at the same Postgres
  adminToken: process.env.ADMIN_TOKEN || "", // shared secret for the /admin bulk-import (seed) path; empty = disabled
};
