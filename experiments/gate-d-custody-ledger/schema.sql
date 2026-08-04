-- Development-only Gate D multi-process ledger spike.
-- This is not a frozen Capsule schema and must not be imported by product code.

PRAGMA application_id = 1128483908; -- ASCII "CCLD"
PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS attempt (
  attempt_id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  epoch_digest TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'indeterminate', 'succeeded', 'failed')),
  terminal_transcript_digest TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  CHECK (
    (state IN ('active', 'indeterminate') AND terminal_transcript_digest IS NULL)
    OR
    (state IN ('succeeded', 'failed') AND terminal_transcript_digest IS NOT NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS content_object (
  content_id TEXT PRIMARY KEY
    CHECK (length(content_id) = 64 AND content_id NOT GLOB '*[^0-9a-f]*'),
  sha256_hex TEXT NOT NULL
    CHECK (length(sha256_hex) = 64 AND sha256_hex NOT GLOB '*[^0-9a-f]*'),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  store_name TEXT NOT NULL UNIQUE
    CHECK (length(store_name) = 64 AND store_name NOT GLOB '*[^0-9a-f]*'),
  custody_state TEXT NOT NULL
    CHECK (custody_state IN ('available', 'quarantined', 'released', 'gc-eligible', 'deleted')),
  retain_until_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS content_handle (
  handle_id TEXT PRIMARY KEY
    CHECK (length(handle_id) = 64 AND handle_id NOT GLOB '*[^0-9a-f]*'),
  content_id TEXT REFERENCES content_object(content_id),
  installation_id TEXT NOT NULL,
  epoch_digest TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL REFERENCES attempt(attempt_id),
  direction TEXT NOT NULL CHECK (direction IN ('input', 'output')),
  operation TEXT NOT NULL,
  max_bytes INTEGER NOT NULL CHECK (max_bytes > 0),
  expected_sha256_hex TEXT,
  expected_size INTEGER CHECK (expected_size IS NULL OR expected_size >= 0),
  state TEXT NOT NULL
    CHECK (state IN ('issued', 'consumed', 'committed', 'quarantined', 'revoked', 'expired')),
  expires_at_ms INTEGER NOT NULL,
  tombstone_until_ms INTEGER NOT NULL,
  redemption_id TEXT UNIQUE,
  transfer_store_name TEXT,
  transfer_complete INTEGER NOT NULL DEFAULT 0 CHECK (transfer_complete IN (0, 1)),
  transfer_sha256_hex TEXT,
  transfer_size INTEGER CHECK (transfer_size IS NULL OR transfer_size >= 0),
  committed_sha256_hex TEXT,
  committed_size INTEGER CHECK (committed_size IS NULL OR committed_size >= 0),
  terminal_transcript_digest TEXT,
  quarantine_reason TEXT,
  updated_at_ms INTEGER NOT NULL,
  CHECK (tombstone_until_ms >= expires_at_ms),
  CHECK (
    (direction = 'input'
      AND operation = 'stage-input'
      AND content_id IS NOT NULL
      AND expected_sha256_hex IS NOT NULL
      AND expected_size IS NOT NULL
      AND transfer_store_name IS NULL)
    OR
    (direction = 'output'
      AND operation = 'collect-output'
      AND expected_sha256_hex IS NULL
      AND expected_size IS NULL)
  ),
  CHECK (
    (state IN ('issued', 'revoked', 'expired') AND redemption_id IS NULL)
    OR
    (state IN ('consumed', 'committed', 'quarantined') AND redemption_id IS NOT NULL)
  ),
  CHECK (
    transfer_complete = 0
    OR
    (direction = 'output'
      AND content_id IS NOT NULL
      AND transfer_store_name IS NOT NULL
      AND transfer_sha256_hex IS NOT NULL
      AND transfer_size IS NOT NULL)
  ),
  CHECK (
    (state = 'committed'
      AND direction = 'output'
      AND committed_sha256_hex IS NOT NULL
      AND committed_size IS NOT NULL
      AND terminal_transcript_digest IS NOT NULL)
    OR
    (state <> 'committed'
      AND committed_sha256_hex IS NULL
      AND committed_size IS NULL
      AND terminal_transcript_digest IS NULL)
  ),
  CHECK (
    (state = 'quarantined' AND quarantine_reason IS NOT NULL)
    OR
    (state <> 'quarantined' AND quarantine_reason IS NULL)
  )
) STRICT;

CREATE INDEX IF NOT EXISTS content_handle_attempt
  ON content_handle(installation_id, epoch_digest, registration_id, attempt_id);

CREATE INDEX IF NOT EXISTS content_handle_gc
  ON content_handle(state, expires_at_ms, tombstone_until_ms);

CREATE TABLE IF NOT EXISTS attempt_content (
  attempt_id TEXT NOT NULL REFERENCES attempt(attempt_id),
  content_id TEXT NOT NULL REFERENCES content_object(content_id),
  role TEXT NOT NULL CHECK (role IN ('input', 'output')),
  PRIMARY KEY (attempt_id, content_id, role)
) STRICT;

CREATE TABLE IF NOT EXISTS output_release (
  handle_id TEXT PRIMARY KEY REFERENCES content_handle(handle_id) ON DELETE CASCADE,
  terminal_transcript_digest TEXT NOT NULL,
  released_at_ms INTEGER NOT NULL
) STRICT;

CREATE TRIGGER IF NOT EXISTS content_handle_binding_insert
BEFORE INSERT ON content_handle
WHEN NOT EXISTS (
  SELECT 1 FROM attempt
   WHERE attempt_id = NEW.attempt_id
     AND installation_id = NEW.installation_id
     AND epoch_digest = NEW.epoch_digest
     AND registration_id = NEW.registration_id
)
BEGIN
  SELECT RAISE(ABORT, 'content handle attempt binding mismatch');
END;

CREATE TRIGGER IF NOT EXISTS content_handle_state_transition
BEFORE UPDATE OF state ON content_handle
WHEN NOT (
  OLD.state = NEW.state
  OR (OLD.state = 'issued' AND NEW.state IN ('consumed', 'revoked', 'expired'))
  OR (OLD.state = 'consumed' AND NEW.state IN ('committed', 'quarantined'))
)
BEGIN
  SELECT RAISE(ABORT, 'illegal content handle state transition');
END;

CREATE TRIGGER IF NOT EXISTS output_release_requires_committed_handle
BEFORE INSERT ON output_release
WHEN NOT EXISTS (
  SELECT 1 FROM content_handle
   WHERE handle_id = NEW.handle_id
     AND direction = 'output'
     AND state = 'committed'
     AND terminal_transcript_digest = NEW.terminal_transcript_digest
)
BEGIN
  SELECT RAISE(ABORT, 'output is not committed for this terminal transcript');
END;
