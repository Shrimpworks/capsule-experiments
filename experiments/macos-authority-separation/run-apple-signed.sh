#!/bin/sh
set -eu

experiment_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
channel=${1:-}

case "$channel" in
  development)
    identity_prefix='Apple Development:'
    channel_oid='1.2.840.113635.100.6.1.12'
    ;;
  developer-id)
    identity_prefix='Developer ID Application:'
    channel_oid='1.2.840.113635.100.6.1.13'
    ;;
  *)
    echo "usage: $0 development|developer-id" >&2
    exit 64
    ;;
esac

if [ -n "${CAPSULE_SIGNING_IDENTITY:-}" ]; then
  signing_identity=$CAPSULE_SIGNING_IDENTITY
else
  matching_identities=$(security find-identity -v -p codesigning |
    sed -n "s/.*\"\($identity_prefix[^\"]*\)\".*/\1/p")
  identity_count=$(printf '%s\n' "$matching_identities" |
    awk 'NF { count++ } END { print count + 0 }')
  if [ "$identity_count" -ne 1 ]; then
    echo "expected exactly one $identity_prefix identity; set CAPSULE_SIGNING_IDENTITY" >&2
    exit 65
  fi
  signing_identity=$matching_identities
fi

if ! security find-identity -v -p codesigning |
    sed -n 's/.*"\([^"]*\)".*/\1/p' |
    rg -Fxq -- "$signing_identity"; then
  echo "signing identity is not valid: $signing_identity" >&2
  exit 65
fi

channel_slug=$(printf '%s' "$channel" | tr -c 'a-z0-9-' '-')
build_dir="$experiment_dir/build/apple-signed-$channel_slug"
service_name="io.github.dills122.capsule.gate-b.$channel_slug"
domain="gui/$(id -u)"
plist="$build_dir/LaunchAgent.plist"

broker_identifier='io.github.dills122.capsule.gate-b.broker'
daemon_identifier='io.github.dills122.capsule.gate-b.daemon'
client_identifier='io.github.dills122.capsule.gate-b.client'

mkdir -p "$build_dir"
if launchctl print "$domain/$service_name" >/dev/null 2>&1; then
  echo "refusing to replace existing $domain/$service_name" >&2
  exit 66
fi

build_role() {
  output=$1
  role=$2
  build=$3
  clang -Wall -Wextra -Werror \
    -DROLE="\"$role\"" \
    -DBUILD="\"$build\"" \
    "$experiment_dir/Sources/role.c" \
    -o "$build_dir/$output"
}

sign_path() {
  identifier=$1
  path=$2
  codesign --force --options runtime --timestamp=none \
    --sign "$signing_identity" --identifier "$identifier" "$path"
}

sign_path_with_entitlements() {
  identifier=$1
  entitlements=$2
  path=$3
  codesign --force --options runtime --timestamp=none \
    --sign "$signing_identity" --identifier "$identifier" \
    --entitlements "$entitlements" "$path"
}

expect_pass() {
  label=$1
  requirement=$2
  target=$3
  if codesign --verify --strict -R="$requirement" "$target" 2>/dev/null; then
    printf 'PASS %s\n' "$label"
  else
    printf 'FAIL %s expected requirement match\n' "$label" >&2
    return 1
  fi
}

expect_deny() {
  label=$1
  requirement=$2
  target=$3
  if codesign --verify --strict -R="$requirement" "$target" 2>/dev/null; then
    printf 'FAIL %s expected requirement denial\n' "$label" >&2
    return 1
  else
    printf 'PASS %s denied\n' "$label"
  fi
}

build_role broker_v1 broker v1
build_role broker_v2 broker v2
build_role wrong_role daemon v1
build_role broker_debug broker v1-debug
cp "$build_dir/broker_v1" "$build_dir/broker_unsigned"
codesign --remove-signature "$build_dir/broker_unsigned"

sign_path "$broker_identifier" "$build_dir/broker_v1"
team_id=$(codesign -d --verbose=4 "$build_dir/broker_v1" 2>&1 |
  sed -n 's/^TeamIdentifier=//p')
if ! printf '%s\n' "$team_id" | rg -q '^[A-Z0-9]{10}$'; then
  echo "signed probe did not expose a valid TeamIdentifier" >&2
  exit 67
fi

release_requirement="anchor apple generic and certificate leaf[subject.OU] = \"$team_id\" and certificate leaf[field.$channel_oid] exists and identifier \"$broker_identifier\""
no_debug_requirement="$release_requirement and entitlement[\"com.apple.security.get-task-allow\"] absent"

sign_path "$broker_identifier" "$build_dir/broker_v2"
sign_path "$daemon_identifier" "$build_dir/wrong_role"
sign_path_with_entitlements "$broker_identifier" \
  "$experiment_dir/Entitlements/debug.plist" "$build_dir/broker_debug"
cp "$build_dir/broker_v1" "$build_dir/broker_copy"

expect_pass apple-chain-team-channel-role "$release_requirement" "$build_dir/broker_v1"
expect_deny same-team-wrong-role "$release_requirement" "$build_dir/wrong_role"
expect_deny unsigned-peer "$release_requirement" "$build_dir/broker_unsigned"
expect_pass release-identity-allows-stale-build "$release_requirement" "$build_dir/broker_v2"
expect_pass copied-exact-binary "$release_requirement" "$build_dir/broker_copy"
expect_pass hardened-runtime-no-debug "$no_debug_requirement" "$build_dir/broker_v1"
expect_deny debug-entitlement-rejected "$no_debug_requirement" "$build_dir/broker_debug"

broker_v1_cdhash=$(codesign -d --verbose=4 "$build_dir/broker_v1" 2>&1 |
  sed -n 's/^CDHash=//p')
exact_broker_requirement="$no_debug_requirement and cdhash H\"$broker_v1_cdhash\""
expect_pass exact-build-v1 "$exact_broker_requirement" "$build_dir/broker_v1"
expect_deny exact-build-rejects-stale-v2 "$exact_broker_requirement" "$build_dir/broker_v2"
expect_pass exact-build-allows-copy "$exact_broker_requirement" "$build_dir/broker_copy"

clang -Wall -Wextra -Werror \
  "$experiment_dir/Sources/peer_check.c" \
  -framework CoreFoundation -framework Security \
  -o "$build_dir/peer_check"

broker_v1_pid=''
broker_v2_pid=''
bootstrapped=false
cleanup() {
  if [ "$bootstrapped" = true ]; then
    launchctl bootout "$domain/$service_name" >/dev/null 2>&1 || true
  fi
  if [ -n "$broker_v1_pid" ]; then
    kill "$broker_v1_pid" 2>/dev/null || true
    wait "$broker_v1_pid" 2>/dev/null || true
  fi
  if [ -n "$broker_v2_pid" ]; then
    kill "$broker_v2_pid" 2>/dev/null || true
    wait "$broker_v2_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT HUP INT TERM

"$build_dir/broker_v1" --wait >/dev/null &
broker_v1_pid=$!
"$build_dir/broker_v2" --wait >/dev/null &
broker_v2_pid=$!
"$build_dir/peer_check" "$broker_v1_pid" "$exact_broker_requirement" |
  rg -q '^peer.validity-status=0$'
printf 'PASS running exact-build-v1 peer\n'
if "$build_dir/peer_check" "$broker_v2_pid" "$exact_broker_requirement" >/dev/null; then
  echo 'FAIL running stale-build peer unexpectedly matched' >&2
  exit 1
else
  echo 'PASS running stale-build peer denied'
fi
kill "$broker_v1_pid" "$broker_v2_pid"
wait "$broker_v1_pid" 2>/dev/null || true
wait "$broker_v2_pid" 2>/dev/null || true
broker_v1_pid=''
broker_v2_pid=''

clang -fblocks -Wall -Wextra -Werror \
  -DSERVICE_NAME="\"$service_name\"" -DBUILD='"v1"' \
  "$experiment_dir/Sources/xpc_client.c" \
  -framework CoreFoundation -framework Security \
  -o "$build_dir/xpc_client_v1"
clang -fblocks -Wall -Wextra -Werror \
  -DSERVICE_NAME="\"$service_name\"" -DBUILD='"v2"' \
  "$experiment_dir/Sources/xpc_client.c" \
  -framework CoreFoundation -framework Security \
  -o "$build_dir/xpc_client_v2"
clang -fblocks -Wall -Wextra -Werror \
  -DSERVICE_NAME="\"$service_name\"" -DBUILD='"wrong-role"' \
  "$experiment_dir/Sources/xpc_client.c" \
  -framework CoreFoundation -framework Security \
  -o "$build_dir/xpc_client_wrong_role"
clang -fblocks -Wall -Wextra -Werror \
  -DSERVICE_NAME="\"$service_name\"" \
  "$experiment_dir/Sources/xpc_broker.c" \
  -framework CoreFoundation -framework Security \
  -o "$build_dir/xpc_broker"

cp "$build_dir/xpc_client_v1" "$build_dir/xpc_client_unsigned"
codesign --remove-signature "$build_dir/xpc_client_unsigned"
sign_path "$client_identifier" "$build_dir/xpc_client_v1"
sign_path "$client_identifier" "$build_dir/xpc_client_v2"
sign_path "$daemon_identifier" "$build_dir/xpc_client_wrong_role"
sign_path "$broker_identifier" "$build_dir/xpc_broker"
cp "$build_dir/xpc_client_v1" "$build_dir/xpc_client_copy"

client_hash=$(codesign -d --verbose=4 "$build_dir/xpc_client_v1" 2>&1 |
  sed -n 's/^CDHash=//p')
broker_hash=$(codesign -d --verbose=4 "$build_dir/xpc_broker" 2>&1 |
  sed -n 's/^CDHash=//p')
client_requirement="anchor apple generic and certificate leaf[subject.OU] = \"$team_id\" and certificate leaf[field.$channel_oid] exists and identifier \"$client_identifier\" and entitlement[\"com.apple.security.get-task-allow\"] absent and cdhash H\"$client_hash\""
server_requirement="anchor apple generic and certificate leaf[subject.OU] = \"$team_id\" and certificate leaf[field.$channel_oid] exists and identifier \"$broker_identifier\" and entitlement[\"com.apple.security.get-task-allow\"] absent and cdhash H\"$broker_hash\""

cp "$experiment_dir/LaunchAgent.plist" "$plist"
plutil -replace Label -string "$service_name" "$plist"
plutil -replace MachServices -json "{\"$service_name\":true}" "$plist"
plutil -replace ProgramArguments -json '[]' "$plist"
plutil -insert ProgramArguments.0 -string "$build_dir/xpc_broker" "$plist"
plutil -insert ProgramArguments.1 -string "$client_requirement" "$plist"
plutil -replace StandardOutPath -string "$build_dir/xpc_broker.stdout" "$plist"
plutil -replace StandardErrorPath -string "$build_dir/xpc_broker.stderr" "$plist"

launchctl bootstrap "$domain" "$plist"
bootstrapped=true
client_server_args="--server-requirement"

"$build_dir/xpc_client_v1" $client_server_args "$server_requirement"
echo 'PASS exact Apple-signed client and server accepted over live XPC'
"$build_dir/xpc_client_copy" $client_server_args "$server_requirement"
echo 'PASS exact copied client accepted over live XPC'
"$build_dir/xpc_client_v1" --malformed $client_server_args "$server_requirement"
echo 'PASS authenticated malformed operation denied by protocol'
"$build_dir/xpc_client_v1" --wrong-epoch $client_server_args "$server_requirement"
echo 'PASS authenticated wrong epoch denied by protocol'

for denied in xpc_client_v2 xpc_client_wrong_role xpc_client_unsigned; do
  if "$build_dir/$denied" $client_server_args "$server_requirement"; then
    echo "FAIL $denied unexpectedly accepted over live XPC" >&2
    exit 1
  else
    echo "PASS $denied denied by listener peer requirement"
  fi
done

launchctl bootout "$domain/$service_name"
bootstrapped=false
if launchctl print "$domain/$service_name" >/dev/null 2>&1; then
  echo 'FAIL disposable Apple-signed XPC service remained registered' >&2
  exit 1
fi

trap - EXIT HUP INT TERM
printf 'PASS Apple-signed Gate B matrix channel=%s team=%s identity=%s\n' \
  "$channel" "$team_id" "$signing_identity"
