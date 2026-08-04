#!/bin/sh
set -eu

experiment_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$experiment_dir/../.." && pwd)
capsule_tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/capsule-gate-d.XXXXXX")
trap 'rm -rf "$capsule_tmp_dir"' EXIT HUP INT TERM

cd "$repo_dir"

GOCACHE="$capsule_tmp_dir/go-cache" \
  go test -race ./experiments/gate-d-content-custody -count=1 -v
GOCACHE="$capsule_tmp_dir/go-cache" \
  go test ./experiments/gate-d-content-custody -count=20

clang -Wall -Wextra -Werror -std=c17 \
  "$experiment_dir/xpc-probe/xpc_fd_probe.c" \
  -o "$capsule_tmp_dir/xpc-fd-probe"
"$capsule_tmp_dir/xpc-fd-probe"

schema_db="$capsule_tmp_dir/custody-state.sqlite"
sqlite3 "$schema_db" < "$experiment_dir/custody-state.sql"

input_content_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
input_handle_id=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
output_handle_id=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
digest_hex=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd

sqlite3 "$schema_db" <<SQL
PRAGMA foreign_keys = ON;
INSERT INTO content_object VALUES (
  '$input_content_id', 'input', '$digest_hex', 4, 'available', 2000, 1000
);
INSERT INTO content_handle (
  handle_id, content_id, installation_id, epoch_digest, registration_id,
  attempt_id, direction, operation, max_bytes, expected_sha256_hex,
  expected_size, state, expires_at_ms, tombstone_until_ms, updated_at_ms
) VALUES (
  '$input_handle_id', '$input_content_id', 'install', 'epoch', 'registration',
  'attempt', 'broker-to-supervisor', 'stage-input', 4, '$digest_hex',
  4, 'issued', 2000, 3000, 1000
);
UPDATE content_handle
   SET state = 'consumed', redemption_id = 'redemption-input', updated_at_ms = 1100
 WHERE handle_id = '$input_handle_id' AND state = 'issued';
INSERT INTO content_handle (
  handle_id, installation_id, epoch_digest, registration_id, attempt_id,
  direction, operation, max_bytes, state, expires_at_ms,
  tombstone_until_ms, updated_at_ms
) VALUES (
  '$output_handle_id', 'install', 'epoch', 'registration', 'attempt',
  'supervisor-to-broker', 'collect-output', 64, 'issued', 2000, 3000, 1000
);
SQL

if sqlite3 "$schema_db" \
  "UPDATE content_handle SET state='issued', redemption_id=NULL WHERE handle_id='$input_handle_id';" \
  >/dev/null 2>&1; then
  echo "FAIL illegal consumed-to-issued transition was accepted" >&2
  exit 1
fi

if sqlite3 "$schema_db" \
  "INSERT INTO output_release VALUES ('$output_handle_id', 'transcript', 1500);" \
  >/dev/null 2>&1; then
  echo "FAIL output release before commit was accepted" >&2
  exit 1
fi

sqlite3 "$schema_db" <<SQL
UPDATE content_handle
   SET state = 'consumed', redemption_id = 'redemption-output', updated_at_ms = 1200
 WHERE handle_id = '$output_handle_id' AND state = 'issued';
UPDATE content_handle
   SET state = 'committed', committed_sha256_hex = '$digest_hex',
       committed_size = 4, updated_at_ms = 1300
 WHERE handle_id = '$output_handle_id' AND state = 'consumed';
INSERT INTO output_release VALUES ('$output_handle_id', 'transcript', 1500);
SQL

echo "PASS custody SQLite constraints and release gate"
