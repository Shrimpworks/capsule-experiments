-- Development-only Gate D contract sketch. Not a frozen Capsule schema.
--
-- The product store should use a reviewed SQLite integration, explicit
-- transactions, foreign-key enforcement, integrity checks, and a pinned
-- journal/synchronous configuration. This file captures the minimum rows and
-- legal state transitions established by the spike.

PRAGMA foreign_keys = ON;

CREATE TABLE content_object (
  content_id TEXT PRIMARY KEY
    CHECK (length(content_id) = 64 AND content_id NOT GLOB '*[^0-9a-f]*'),
  kind TEXT NOT NULL CHECK (kind IN ('input', 'output')),
  sha256_hex TEXT NOT NULL
    CHECK (length(sha256_hex) = 64 AND sha256_hex NOT GLOB '*[^0-9a-f]*'),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  custody_state TEXT NOT NULL
    CHECK (custody_state IN ('available', 'quarantined', 'released', 'gc-eligible', 'deleted')),
  retain_until_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE content_handle (
  handle_id TEXT PRIMARY KEY
    CHECK (length(handle_id) = 64 AND handle_id NOT GLOB '*[^0-9a-f]*'),
  content_id TEXT REFERENCES content_object(content_id),
  installation_id TEXT NOT NULL,
  epoch_digest TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  direction TEXT NOT NULL
    CHECK (direction IN ('broker-to-supervisor', 'supervisor-to-broker')),
  operation TEXT NOT NULL,
  max_bytes INTEGER NOT NULL CHECK (max_bytes > 0),
  expected_sha256_hex TEXT,
  expected_size INTEGER CHECK (expected_size IS NULL OR expected_size >= 0),
  state TEXT NOT NULL
    CHECK (state IN ('issued', 'consumed', 'committed', 'quarantined', 'revoked', 'expired')),
  expires_at_ms INTEGER NOT NULL,
  tombstone_until_ms INTEGER NOT NULL,
  redemption_id TEXT UNIQUE,
  committed_sha256_hex TEXT,
  committed_size INTEGER CHECK (committed_size IS NULL OR committed_size >= 0),
  updated_at_ms INTEGER NOT NULL,
  CHECK (tombstone_until_ms >= expires_at_ms),
  CHECK (
    (direction = 'broker-to-supervisor'
      AND content_id IS NOT NULL
      AND expected_sha256_hex IS NOT NULL
      AND expected_size IS NOT NULL)
    OR
    (direction = 'supervisor-to-broker'
      AND content_id IS NULL
      AND expected_sha256_hex IS NULL
      AND expected_size IS NULL)
  ),
  CHECK (
    (state IN ('issued', 'revoked', 'expired') AND redemption_id IS NULL)
    OR
    (state IN ('consumed', 'committed', 'quarantined') AND redemption_id IS NOT NULL)
  ),
  CHECK (
    (state = 'committed' AND committed_sha256_hex IS NOT NULL AND committed_size IS NOT NULL)
    OR
    (state <> 'committed' AND committed_sha256_hex IS NULL AND committed_size IS NULL)
  )
) STRICT;

CREATE INDEX content_handle_attempt
  ON content_handle(installation_id, epoch_digest, registration_id, attempt_id);

CREATE INDEX content_handle_gc
  ON content_handle(state, expires_at_ms, tombstone_until_ms);

CREATE TRIGGER content_handle_state_transition
BEFORE UPDATE OF state ON content_handle
WHEN NOT (
  OLD.state = NEW.state
  OR (OLD.state = 'issued' AND NEW.state IN ('consumed', 'revoked', 'expired'))
  OR (OLD.state = 'consumed' AND NEW.state IN ('committed', 'quarantined'))
)
BEGIN
  SELECT RAISE(ABORT, 'illegal content handle state transition');
END;

CREATE TABLE output_release (
  handle_id TEXT PRIMARY KEY REFERENCES content_handle(handle_id),
  terminal_transcript_digest TEXT NOT NULL,
  released_at_ms INTEGER NOT NULL
) STRICT;

CREATE TRIGGER output_release_requires_committed_handle
BEFORE INSERT ON output_release
WHEN NOT EXISTS (
  SELECT 1
    FROM content_handle
   WHERE handle_id = NEW.handle_id
     AND direction = 'supervisor-to-broker'
     AND state = 'committed'
)
BEGIN
  SELECT RAISE(ABORT, 'output is not committed for release');
END;
