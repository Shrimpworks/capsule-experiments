#!/bin/sh
set -eu

experiment_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/build"

mkdir -p "$build_dir"

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

expect_pass() {
  label=$1
  requirement=$2
  target=$3
  if codesign --verify --strict -R="$requirement" "$target" 2>/dev/null; then
    printf 'PASS %s\n' "$label"
  else
    printf 'FAIL %s expected requirement match\n' "$label"
    return 1
  fi
}

expect_deny() {
  label=$1
  requirement=$2
  target=$3
  if codesign --verify --strict -R="$requirement" "$target" 2>/dev/null; then
    printf 'FAIL %s expected requirement denial\n' "$label"
    return 1
  else
    printf 'PASS %s denied\n' "$label"
  fi
}

build_role daemon daemon v1
build_role broker_v1 broker v1
build_role broker_v2 broker v2
build_role broker_impostor impostor v1
build_role broker_debug broker v1-debug

clang -Wall -Wextra -Werror \
  "$experiment_dir/Sources/peer_check.c" \
  -framework CoreFoundation \
  -framework Security \
  -o "$build_dir/peer_check"

codesign --force --sign - --identifier dev.capsule.gate-b.daemon "$build_dir/daemon"
codesign --force --sign - --identifier dev.capsule.gate-b.broker "$build_dir/broker_v1"
codesign --force --sign - --identifier dev.capsule.gate-b.broker "$build_dir/broker_v2"
codesign --force --sign - --identifier dev.capsule.gate-b.broker "$build_dir/broker_impostor"
codesign --force --sign - --identifier dev.capsule.gate-b.broker \
  --entitlements "$experiment_dir/Entitlements/debug.plist" "$build_dir/broker_debug"
cp "$build_dir/broker_v1" "$build_dir/broker_copy"
cp "$build_dir/broker_v1" "$build_dir/broker_unsigned"
codesign --remove-signature "$build_dir/broker_unsigned"

clang -Wall -Wextra -Werror \
  "$experiment_dir/Sources/runtime_status.c" \
  -framework CoreFoundation \
  -framework Security \
  -o "$build_dir/runtime_release"
cp "$build_dir/runtime_release" "$build_dir/runtime_debug"
codesign --force --sign - --identifier dev.capsule.gate-b.runtime "$build_dir/runtime_release"
codesign --force --sign - --identifier dev.capsule.gate-b.runtime \
  --entitlements "$experiment_dir/Entitlements/debug.plist" "$build_dir/runtime_debug"

identifier_requirement='identifier "dev.capsule.gate-b.broker"'
production_requirement='anchor apple generic and identifier "dev.capsule.gate-b.broker"'
no_debug_entitlement_requirement='identifier "dev.capsule.gate-b.broker" and entitlement["com.apple.security.get-task-allow"] absent'

expect_pass correct-identifier "$identifier_requirement" "$build_dir/broker_v1"
expect_deny wrong-identifier "$identifier_requirement" "$build_dir/daemon"
expect_deny unsigned-binary "$identifier_requirement" "$build_dir/broker_unsigned"
expect_pass identifier-only-impostor "$identifier_requirement" "$build_dir/broker_impostor"
expect_pass identifier-only-stale-build "$identifier_requirement" "$build_dir/broker_v2"
expect_pass copied-exact-binary "$identifier_requirement" "$build_dir/broker_copy"
expect_deny apple-chain-required-for-adhoc "$production_requirement" "$build_dir/broker_v1"
expect_pass release-build-has-no-debug-entitlement "$no_debug_entitlement_requirement" "$build_dir/broker_v1"
expect_deny debug-entitlement-rejected "$no_debug_entitlement_requirement" "$build_dir/broker_debug"

broker_v1_cdhash=$(codesign -d --verbose=4 "$build_dir/broker_v1" 2>&1 | sed -n 's/^CDHash=//p')
exact_build_requirement="cdhash H\"$broker_v1_cdhash\""
expect_pass exact-build-v1 "$exact_build_requirement" "$build_dir/broker_v1"
expect_deny exact-build-rejects-v2 "$exact_build_requirement" "$build_dir/broker_v2"
expect_pass exact-build-allows-copy "$exact_build_requirement" "$build_dir/broker_copy"

broker_v1_pid=''
broker_v2_pid=''
cleanup_peers() {
  if [ -n "$broker_v1_pid" ]; then
    kill "$broker_v1_pid" 2>/dev/null || true
    wait "$broker_v1_pid" 2>/dev/null || true
  fi
  if [ -n "$broker_v2_pid" ]; then
    kill "$broker_v2_pid" 2>/dev/null || true
    wait "$broker_v2_pid" 2>/dev/null || true
  fi
}
trap cleanup_peers EXIT HUP INT TERM

"$build_dir/broker_v1" --wait >/dev/null &
broker_v1_pid=$!
"$build_dir/broker_v2" --wait >/dev/null &
broker_v2_pid=$!

"$build_dir/peer_check" "$broker_v1_pid" "$exact_build_requirement" |
  rg -q '^peer.validity-status=0$'
printf 'PASS running exact-build-v1 peer\n'
if "$build_dir/peer_check" "$broker_v2_pid" "$exact_build_requirement" >/dev/null; then
  printf 'FAIL running stale-build peer unexpectedly matched\n'
  exit 1
else
  printf 'PASS running stale-build peer denied\n'
fi
cleanup_peers
broker_v1_pid=''
broker_v2_pid=''
trap - EXIT HUP INT TERM

runtime_release_output=$("$build_dir/runtime_release")
runtime_debug_output=$("$build_dir/runtime_debug")
printf '%s\n' "$runtime_release_output"
printf '%s\n' "$runtime_debug_output"
printf '%s\n' "$runtime_release_output" | rg -q '^seccode.dynamic-valid=true$'
printf '%s\n' "$runtime_release_output" | rg -q '^seccode.debugged=false$'
printf '%s\n' "$runtime_debug_output" | rg -q '^seccode.debugged=false$'

if [ "${1:-}" = "--with-debugger" ]; then
  debugger_output=$(lldb --batch -o 'process launch' "$build_dir/runtime_debug" 2>&1)
  debugger_status=$(printf '%s\n' "$debugger_output" | tr -d '\r' | sed -n '/^seccode\./p')
  printf '%s\n' "$debugger_status"
  printf '%s\n' "$debugger_status" | rg -q '^seccode.debugged=true$'
fi

clang -fobjc-arc -Wall -Wextra -Werror \
  "$experiment_dir/Sources/key_probe.m" \
  -framework Foundation \
  -framework Security \
  -framework LocalAuthentication \
  -o "$build_dir/key_probe"
key_output=$("$build_dir/key_probe")
printf '%s\n' "$key_output"
printf '%s\n' "$key_output" | rg -q '^access-group.unentitled-add=-34018 '
printf '%s\n' "$key_output" | rg -q '^secure-enclave.ephemeral-evidence-created=true$'
printf '%s\n' "$key_output" | rg -q '^secure-enclave.ephemeral-evidence-sign=true$'
printf '%s\n' "$key_output" | rg -q '^secure-enclave.ephemeral-approval-created=true$'
printf '%s\n' "$key_output" | rg -q '^secure-enclave.ephemeral-approval-noninteractive-sign=false$'
printf '%s\n' "$key_output" | rg -q '^secure-enclave.ephemeral-approval-sign-error=domain=com.apple.LocalAuthentication code=-1004 '
