#!/bin/sh
set -eu

experiment_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/build"
service_label=dev.capsule.gate-b.license-free
domain="gui/$(id -u)"
plist="$build_dir/LaunchAgent.plist"

mkdir -p "$build_dir"
if launchctl print "$domain/$service_label" >/dev/null 2>&1; then
  echo "refusing to replace existing $domain/$service_label" >&2
  exit 1
fi

clang -fblocks -Wall -Wextra -Werror \
  -DBUILD='"v1"' "$experiment_dir/Sources/xpc_client.c" \
  -framework CoreFoundation -framework Security \
  -o "$build_dir/xpc_client_v1"
clang -fblocks -Wall -Wextra -Werror \
  -DBUILD='"v2"' "$experiment_dir/Sources/xpc_client.c" \
  -framework CoreFoundation -framework Security \
  -o "$build_dir/xpc_client_v2"
clang -fblocks -Wall -Wextra -Werror \
  "$experiment_dir/Sources/xpc_broker.c" -framework CoreFoundation -framework Security \
  -o "$build_dir/xpc_broker"

codesign --force --sign - --identifier dev.capsule.gate-b.xpc-client \
  "$build_dir/xpc_client_v1"
codesign --force --sign - --identifier dev.capsule.gate-b.xpc-client \
  "$build_dir/xpc_client_v2"
codesign --force --sign - --identifier dev.capsule.gate-b.xpc-broker \
  "$build_dir/xpc_broker"
cp "$build_dir/xpc_client_v1" "$build_dir/xpc_client_copy"
cp "$build_dir/xpc_client_v1" "$build_dir/xpc_client_unsigned"
codesign --remove-signature "$build_dir/xpc_client_unsigned"

client_hash=$(codesign -d --verbose=4 "$build_dir/xpc_client_v1" 2>&1 | sed -n 's/^CDHash=//p')
peer_requirement="cdhash H\"$client_hash\""

cp "$experiment_dir/LaunchAgent.plist" "$plist"
program_arguments="[\"$build_dir/xpc_broker\",\"cdhash H\\\"$client_hash\\\"\"]"
plutil -replace ProgramArguments -json "$program_arguments" "$plist"
plutil -replace StandardOutPath -string "$build_dir/xpc_broker.stdout" "$plist"
plutil -replace StandardErrorPath -string "$build_dir/xpc_broker.stderr" "$plist"

bootstrapped=false
cleanup() {
  if [ "$bootstrapped" = true ]; then
    launchctl bootout "$domain/$service_label" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT HUP INT TERM
launchctl bootstrap "$domain" "$plist"
bootstrapped=true

"$build_dir/xpc_client_v1"
echo 'PASS exact ad-hoc client accepted over live XPC'
"$build_dir/xpc_client_copy"
echo 'PASS exact copied client accepted over live XPC'
"$build_dir/xpc_client_v1" --malformed
echo 'PASS authenticated peer malformed operation denied by protocol'
"$build_dir/xpc_client_v1" --wrong-epoch
echo 'PASS authenticated peer wrong epoch denied by protocol'

if "$build_dir/xpc_client_v2"; then
  echo 'FAIL stale client unexpectedly accepted over live XPC' >&2
  exit 1
else
  echo 'PASS stale client denied by listener peer requirement'
fi
if "$build_dir/xpc_client_unsigned"; then
  echo 'FAIL unsigned client unexpectedly accepted over live XPC' >&2
  exit 1
else
  echo 'PASS unsigned client denied by listener peer requirement'
fi

cleanup
bootstrapped=false
trap - EXIT HUP INT TERM
if launchctl print "$domain/$service_label" >/dev/null 2>&1; then
  echo 'FAIL disposable launch service remained registered' >&2
  exit 1
fi
echo 'PASS disposable XPC LaunchAgent removed'
