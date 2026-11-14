ALTER TABLE hitl_requests ADD COLUMN source_sequence INTEGER CHECK (source_sequence > 0);
ALTER TABLE follow_up_drafts ADD COLUMN source_sequence INTEGER CHECK (source_sequence > 0);

CREATE TABLE device_actions (
  device_id TEXT NOT NULL REFERENCES devices(id),
  nonce UUID NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  command_id TEXT NOT NULL UNIQUE REFERENCES commands(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, nonce)
);
