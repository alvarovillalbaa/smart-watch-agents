CREATE TABLE IF NOT EXISTS agents (
  key TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('hermes', 'openclaw')),
  external_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  follow_up_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  agent_key TEXT NOT NULL REFERENCES agents(key),
  source_run_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'awaiting_hitl')),
  sequence INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  artifact_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (agent_key, source_run_id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hitl_requests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  label TEXT NOT NULL,
  description TEXT,
  risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  approved_by TEXT
);

CREATE TABLE IF NOT EXISTS follow_up_drafts (
  run_id TEXT PRIMARY KEY REFERENCES runs(id),
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'dispatched')),
  dispatched_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('watchos', 'wearos')),
  public_key_pem TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  push_token TEXT,
  privacy_mode TEXT NOT NULL DEFAULT 'redacted' CHECK (privacy_mode IN ('redacted', 'summary')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pairing_codes (
  code TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  agent_key TEXT NOT NULL REFERENCES agents(key),
  run_id TEXT REFERENCES runs(id),
  type TEXT NOT NULL CHECK (type IN ('approve_hitl', 'dispatch_follow_up')),
  body JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'acknowledged', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  run_id TEXT REFERENCES runs(id),
  hitl_id TEXT REFERENCES hitl_requests(id),
  payload JSONB NOT NULL,
  delivered_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
