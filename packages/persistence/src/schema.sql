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
