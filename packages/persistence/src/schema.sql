CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS world_state (
  id INT PRIMARY KEY DEFAULT 1,
  day INT NOT NULL DEFAULT 0,
  economy JSONB NOT NULL DEFAULT '{}',
  headline TEXT NOT NULL DEFAULT ''
);
INSERT INTO world_state (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS citizens (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, occupation TEXT NOT NULL,
  age INT NOT NULL, traits JSONB NOT NULL, wealth NUMERIC NOT NULL DEFAULT 0,
  reputation NUMERIC NOT NULL DEFAULT 0, tier INT NOT NULL DEFAULT 1,
  created_day INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY, citizen_id TEXT NOT NULL REFERENCES citizens(id),
  kind TEXT NOT NULL, description TEXT NOT NULL,
  progress NUMERIC NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS relationships (
  citizen_id TEXT NOT NULL REFERENCES citizens(id),
  other_id TEXT NOT NULL,
  trust NUMERIC NOT NULL, friendship NUMERIC NOT NULL, influence NUMERIC NOT NULL,
  PRIMARY KEY (citizen_id, other_id)
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY, citizen_id TEXT NOT NULL REFERENCES citizens(id),
  day INT NOT NULL, type TEXT NOT NULL, importance INT NOT NULL,
  summary TEXT NOT NULL, embedding vector(64),
  zg_root_hash TEXT, zg_tx_hash TEXT
);
CREATE INDEX IF NOT EXISTS memories_citizen_idx ON memories (citizen_id);

ALTER TABLE memories ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS interventions (
  id text PRIMARY KEY,
  world_id text NOT NULL,
  user_id text NOT NULL,
  type text NOT NULL,
  target_citizen_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_day int
);
CREATE INDEX IF NOT EXISTS interventions_status_idx ON interventions (status);

CREATE TABLE IF NOT EXISTS beliefs (
  id TEXT PRIMARY KEY, citizen_id TEXT NOT NULL REFERENCES citizens(id),
  statement TEXT NOT NULL, confidence NUMERIC NOT NULL,
  source_memory_ids JSONB NOT NULL DEFAULT '[]', updated_day INT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY, citizen_id TEXT NOT NULL REFERENCES citizens(id),
  goal_id TEXT, day INT NOT NULL, reasoning TEXT NOT NULL, action TEXT NOT NULL,
  target_id TEXT, brain_provider TEXT NOT NULL, brain_model TEXT NOT NULL,
  meta JSONB
);

CREATE TABLE IF NOT EXISTS decision_memories (
  decision_id TEXT NOT NULL, memory_id TEXT NOT NULL, weight NUMERIC NOT NULL,
  PRIMARY KEY (decision_id, memory_id)
);
CREATE TABLE IF NOT EXISTS decision_beliefs (
  decision_id TEXT NOT NULL, belief_id TEXT NOT NULL, weight NUMERIC NOT NULL,
  PRIMARY KEY (decision_id, belief_id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, day INT NOT NULL, type TEXT NOT NULL,
  actor_id TEXT NOT NULL, target_id TEXT, decision_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}', zg_root_hash TEXT, zg_tx_hash TEXT
);
CREATE INDEX IF NOT EXISTS events_actor_idx ON events (actor_id);
CREATE INDEX IF NOT EXISTS events_day_idx ON events (day);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY, decision_id TEXT NOT NULL, trace JSONB NOT NULL,
  zg_root_hash TEXT, zg_tx_hash TEXT
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
  founder_id TEXT NOT NULL, treasury NUMERIC NOT NULL DEFAULT 0,
  reputation NUMERIC NOT NULL DEFAULT 0, goal TEXT NOT NULL DEFAULT '',
  created_day INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS memberships (
  org_id TEXT NOT NULL REFERENCES organizations(id),
  citizen_id TEXT NOT NULL,
  role TEXT NOT NULL, joined_day INT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, citizen_id)
);
CREATE INDEX IF NOT EXISTS memberships_citizen_idx ON memberships (citizen_id);

CREATE TABLE IF NOT EXISTS narratives (
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, kind TEXT NOT NULL,
  day INT NOT NULL, text TEXT NOT NULL,
  zg_root_hash TEXT, zg_tx_hash TEXT, created_day INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS narratives_subject_idx ON narratives (subject_id);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free', api_key_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'public', population_cap INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO worlds (id,name,owner_id,visibility,population_cap)
  VALUES ('genesis','Genesis',NULL,'public',1000) ON CONFLICT (id) DO NOTHING;
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS world_id TEXT NOT NULL DEFAULT 'genesis';
CREATE INDEX IF NOT EXISTS citizens_world_idx ON citizens (world_id);

-- Wallet auth: a user may sign in by email OR by wallet, so email/password are optional.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_idx ON users (wallet_address) WHERE wallet_address IS NOT NULL;
CREATE TABLE IF NOT EXISTS wallet_nonces (
  address TEXT PRIMARY KEY, nonce TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);

-- Row-Level Security: the app connects directly via DATABASE_URL as the table
-- owner, which bypasses non-forced RLS. Enabling RLS with no policies is deny-all
-- for Supabase's PostgREST anon/authenticated API (the only external surface),
-- closing the rls_disabled_in_public / sensitive_columns_exposed exposure with
-- zero impact on the app. All DB access is via the direct connection.
ALTER TABLE world_state        ENABLE ROW LEVEL SECURITY;
ALTER TABLE citizens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE beliefs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_memories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_beliefs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE traces             ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships        ENABLE ROW LEVEL SECURITY;
ALTER TABLE narratives         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE worlds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_nonces      ENABLE ROW LEVEL SECURITY;
