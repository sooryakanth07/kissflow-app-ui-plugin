-- pg-schema.sql — ONE Postgres database (Cloud SQL) serves the whole control plane AND the shared
-- memory. pgvector replaces both Firestore (metadata) and Qdrant (vectors). Apply once:
--   psql "$PG_URL" -f engine/pg-schema.sql
CREATE EXTENSION IF NOT EXISTS vector;

-- ── control plane (was Firestore) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  sub        text PRIMARY KEY,          -- Google identity subject
  email      text UNIQUE NOT NULL,
  name       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id          text PRIMARY KEY,          -- slug + suffix
  name        text NOT NULL,
  owner_sub   text REFERENCES users(sub),
  mem_org     text NOT NULL,             -- shared-memory partition for this project
  gcs_prefix  text NOT NULL,             -- artifacts live under gs://<bucket>/<gcs_prefix>
  dev_env_ref text,                      -- Secret Manager resource name (Kissflow secret) — never the secret itself
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  sub        text REFERENCES users(sub),
  role       text NOT NULL CHECK (role IN ('owner','builder','viewer')),
  PRIMARY KEY (project_id, sub)
);

CREATE TABLE IF NOT EXISTS versions (
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  seq        int NOT NULL,
  label      text,
  author     text,
  artifacts  jsonb,                      -- { ir, prototype, review, generated } → gs:// URIs
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (project_id, seq)
);

-- ── shared memory (was Qdrant) — matches vector-store.mjs pgvector backend ────
-- NOTE: vector(256) matches the local hashing embedder (EMBED_DIM=256). For real embeddings set
-- EMBED_DIM to the model's size (e.g. 1536) BEFORE first load — the dimension is fixed per column.
CREATE TABLE IF NOT EXISTS kf_memory (
  id         bigint PRIMARY KEY,
  org        text,                       -- = projects.mem_org (tenant/project partition)
  scope      text,                       -- global | reference | agent | app | user
  tier       text,                       -- observed-once | reproduced | golden-verified | owner-confirmed
  kind       text,                       -- observation | interpretation
  agent      text,
  app        text,
  impossible boolean,
  text       text,
  embedding  vector(256)
);
CREATE INDEX IF NOT EXISTS kf_memory_emb ON kf_memory USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS kf_memory_org ON kf_memory (org);

-- browser device-flow: a Cowork/CLI session parks a pending request; the user approves it in the
-- appbuilder UI (sign-in → pick/create project → dev env) and the session polls it into scoped config.
CREATE TABLE IF NOT EXISTS connect_requests (
  code         text PRIMARY KEY,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
  redirect_uri text,                      -- loopback-only redirect back to the CLI (optional)
  project_id   text,
  sub          text,
  role         text,
  created_at   timestamptz DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

-- reusable dev environments: set up ONCE, linked to any number of projects. Creds live in Secret
-- Manager (secret_ref); this row is only the pointer + display metadata.
CREATE TABLE IF NOT EXISTS dev_envs (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  owner_sub  text REFERENCES users(sub),
  subdomain  text NOT NULL,
  account_id text,
  secret_ref text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS dev_env_id text REFERENCES dev_envs(id);

-- Cowork connection status: stamped whenever a session redeems a connect token / device approval
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_connect_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_connect_by text;

-- memory proxy: recency for sync + dedup-by-content upserts
ALTER TABLE kf_memory ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- suspicion check: impossibility claims are quarantined (excluded from recall) until owner-confirmed
ALTER TABLE kf_memory ADD COLUMN IF NOT EXISTS quarantined boolean DEFAULT false;
