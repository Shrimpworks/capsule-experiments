#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"
run_dir="$experiment_dir/.runs"
run_log="$run_dir/last-run.log"
domain="gui/$(id -u)"
label='com.capsulecorp.spike.libkrun-installed-recovery.supervisor'
identifier='com.capsulecorp.spike.libkrun-installed-recovery'
install_app="$HOME/Applications/CapsuleKrunInstalledRecoverySpike.app"
corrupt_app="$HOME/Applications/CapsuleKrunInstalledRecoveryCorruptSpike.app"
launch_agents="$HOME/Library/LaunchAgents"
launch_plist="$launch_agents/$label.plist"
service_root="$HOME/Library/Application Support/CapsuleKrunInstalledRecoverySpike"
marker="$service_root/.capsule-installed-recovery-spike"
state_dir="$service_root/state"
installed_backup="$service_root/installed-v1-backup.app"
replaced_v2="$service_root/replaced-v2.app"
runner="$install_app/Contents/MacOS/capsule-krun-runner"
root_disk="$install_app/Contents/Resources/root.ext4"
corrupt_runner="$corrupt_app/Contents/MacOS/capsule-krun-runner"
corrupt_root="$corrupt_app/Contents/Resources/root.ext4"
identity_helper="$service_root/bin/process-identity"
supervisor="$service_root/bin/supervisor"
update_swapped=false

mkdir -p "$run_dir"

log() {
  printf '%s\n' "$*"
  printf '%s\n' "$*" >> "$run_log"
}

fail() {
  log "FAIL $*"
  exit 1
}

service_loaded() {
  launchctl print "$domain/$label" >/dev/null 2>&1
}

owned_install() {
  test -f "$marker" && test ! -L "$marker" &&
    grep -qx 'version=capsule-libkrun-installed-recovery-v1' "$marker" &&
    grep -qx "identifier=$identifier" "$marker"
}

marker_value() {
  key=$1
  sed -n "s/^$key=//p" "$marker"
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

validate_owned_app() {
  app=$1
  app_runner=$2
  app_root=$3
  runner_key=$4
  root_key=$5
  if [ ! -e "$app" ]; then
    return 0
  fi
  if [ ! -d "$app" ] || [ -L "$app" ]; then
    log "REFUSED cleanup of non-directory or symlink app $app"
    return 1
  fi
  if ! codesign --verify --deep --strict "$app" >/dev/null 2>&1 ||
      [ "$(sha256_file "$app_runner")" != "$(marker_value "$runner_key")" ] ||
      [ "$(sha256_file "$app_root")" != "$(marker_value "$root_key")" ]; then
    log "REFUSED cleanup of changed app $app"
    return 1
  fi
}

validate_owned_file() {
  path=$1
  key=$2
  if [ ! -e "$path" ]; then
    return 0
  fi
  if [ ! -f "$path" ] || [ -L "$path" ] ||
      [ "$(sha256_file "$path")" != "$(marker_value "$key")" ]; then
    log "REFUSED cleanup of changed file $path"
    return 1
  fi
}

restore_v1_if_needed() {
  if [ "$update_swapped" = true ] && [ -d "$installed_backup" ]; then
    if [ -d "$install_app" ]; then
      mv "$install_app" "$replaced_v2" 2>/dev/null || true
    fi
    mv "$installed_backup" "$install_app" 2>/dev/null || true
    update_swapped=false
  fi
}

cleanup() {
  restore_v1_if_needed
  if ! owned_install; then
    log 'REFUSED cleanup because the exact install marker is absent'
    return 1
  fi
  if [ -f "$state_dir/active.json" ] && service_loaded; then
    launchctl kickstart "$domain/$label" >/dev/null 2>&1 || true
    count=0
    while [ -f "$state_dir/active.json" ] && [ "$count" -lt 200 ]; do
      count=$((count + 1))
      sleep 0.05
    done
  fi
  if [ -f "$state_dir/active.json" ]; then
    log 'REFUSED destructive cleanup while an active record remains unresolved'
    return 1
  fi
  validate_owned_app "$install_app" "$runner" "$root_disk" runnerSha256 rootSha256 || return 1
  validate_owned_app "$corrupt_app" "$corrupt_runner" "$corrupt_root" \
    corruptRunnerSha256 corruptRootSha256 || return 1
  validate_owned_file "$supervisor" supervisorSha256 || return 1
  validate_owned_file "$identity_helper" identityHelperSha256 || return 1
  if service_loaded; then
    if ! launchctl bootout "$domain/$label" >/dev/null 2>&1; then
      log "REFUSED cleanup because bootout failed for $domain/$label"
      return 1
    fi
  fi
  if service_loaded; then
    log "REFUSED cleanup because service remains loaded at $domain/$label"
    return 1
  fi
  if [ -f "$launch_plist" ]; then
    actual_label=$(plutil -extract Label raw -o - "$launch_plist" 2>/dev/null || true)
    if [ "$actual_label" = "$label" ]; then
      rm -f -- "$launch_plist"
    else
      log "REFUSED removal of unexpected LaunchAgent plist $launch_plist"
      return 1
    fi
  fi
  rm -rf -- "$install_app" "$corrupt_app" "$service_root"
  log 'CLEANUP removed only marker-owned installed apps, LaunchAgent, and Supervisor state'
  return 0
}

if [ "${1:-}" = '--cleanup' ]; then
  if cleanup; then
    exit 0
  fi
  exit 1
fi
if [ "$#" -ne 0 ]; then
  echo "usage: $0 [--cleanup]" >&2
  exit 64
fi

: > "$run_log"

on_signal() {
  status=$1
  trap - EXIT HUP INT TERM
  cleanup || true
  exit "$status"
}

trap cleanup EXIT
trap 'on_signal 129' HUP
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

test -d "$build_dir/CapsuleKrunInstalledRecovery.app"
test -d "$build_dir/CapsuleKrunInstalledRecoveryV2.app"
test -d "$build_dir/CapsuleKrunInstalledRecoveryCorrupt.app"
test -x "$build_dir/supervisor"
test -x "$build_dir/process-identity"

if service_loaded; then
  fail "refusing to replace loaded service $domain/$label"
fi
for path in "$install_app" "$corrupt_app" "$service_root" "$launch_plist"; do
  if [ -e "$path" ]; then
    fail "refusing to replace pre-existing path $path"
  fi
done

mkdir -p "$service_root/bin" "$state_dir" "$launch_agents"
ditto "$build_dir/CapsuleKrunInstalledRecovery.app" "$install_app"
ditto "$build_dir/CapsuleKrunInstalledRecoveryCorrupt.app" "$corrupt_app"
cp "$build_dir/supervisor" "$supervisor"
cp "$build_dir/process-identity" "$identity_helper"
codesign --verify --deep --strict "$install_app"
codesign --verify --deep --strict "$corrupt_app"
codesign --verify --strict "$supervisor"
codesign --verify --strict "$identity_helper"

expected_identifier=$(codesign -d --verbose=4 "$runner" 2>&1 | sed -n 's/^Identifier=//p')
expected_team=$(codesign -d --verbose=4 "$runner" 2>&1 | sed -n 's/^TeamIdentifier=//p')
expected_cdhash=$(codesign -d --verbose=4 "$runner" 2>&1 | sed -n 's/^CDHash=//p')
test "$expected_identifier" = "$identifier"
test -n "$expected_team"
test -n "$expected_cdhash"
printf '%s\n' \
  'version=capsule-libkrun-installed-recovery-v1' \
  "identifier=$identifier" \
  "runnerSha256=$(sha256_file "$runner")" \
  "rootSha256=$(sha256_file "$root_disk")" \
  "corruptRunnerSha256=$(sha256_file "$corrupt_runner")" \
  "corruptRootSha256=$(sha256_file "$corrupt_root")" \
  "supervisorSha256=$(sha256_file "$supervisor")" \
  "identityHelperSha256=$(sha256_file "$identity_helper")" > "$marker"

cp "$experiment_dir/LaunchAgent.plist.in" "$launch_plist"
/usr/libexec/PlistBuddy -c "Set :StandardOutPath $service_root/supervisor.stdout.log" "$launch_plist"
/usr/libexec/PlistBuddy -c "Set :StandardErrorPath $service_root/supervisor.stderr.log" "$launch_plist"
argument_index=0
for argument in \
  "$supervisor" "$state_dir" "$identity_helper" "$runner" "$root_disk" \
  "$expected_identifier" "$expected_team" "$expected_cdhash" \
  /usr/local/libexec/capsule-guest-launcher /bin/sh -c \
  'while true; do sleep 1; done'; do
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments:$argument_index string $argument" "$launch_plist"
  argument_index=$((argument_index + 1))
done
plutil -lint "$launch_plist" >/dev/null
launchctl bootstrap "$domain" "$launch_plist"
service_loaded || fail 'LaunchAgent did not bootstrap'
cp "$launch_plist" "$run_dir/LaunchAgent-abandon-true.plist"
launchctl print "$domain/$label" > "$run_dir/launchctl-abandon-true.txt"
log "INSTALL PASS domain=$domain label=$label team=$expected_team cdhash=$expected_cdhash"

assessment_status=0
assessment=$(spctl --assess --type execute --verbose=4 "$install_app" 2>&1) || assessment_status=$?
printf '%s\n' "$assessment" >> "$run_log"
if [ "$assessment_status" -eq 0 ] &&
    printf '%s\n' "$assessment" | grep -q 'source=Notarized Developer ID'; then
  syspolicy_check distribution "$install_app" >> "$run_log" 2>&1
  log 'GATEKEEPER PASS same-machine notarized/stapled app accepted'
elif [ "${CAPSULE_ALLOW_UNNOTARIZED:-0}" = 1 ] &&
    printf '%s\n' "$assessment" | grep -q 'source=Unnotarized Developer ID'; then
  syspolicy_status=0
  syspolicy_check distribution "$install_app" >> "$run_log" 2>&1 || syspolicy_status=$?
  log "GATEKEEPER NEGATIVE expected unnotarized rejection spctlStatus=$assessment_status syspolicyStatus=$syspolicy_status"
else
  fail "Gatekeeper assessment failed or had unexpected source: $assessment"
fi

run_bounded() {
  output=$1
  shift
  "$@" > "$output" 2>&1 &
  bounded_pid=$!
  elapsed=0
  while kill -0 "$bounded_pid" 2>/dev/null && [ "$elapsed" -lt 200 ]; do
    elapsed=$((elapsed + 1))
    sleep 0.05
  done
  if kill -0 "$bounded_pid" 2>/dev/null; then
    kill -TERM "$bounded_pid" 2>/dev/null || true
    terminate_elapsed=0
    while kill -0 "$bounded_pid" 2>/dev/null && [ "$terminate_elapsed" -lt 100 ]; do
      terminate_elapsed=$((terminate_elapsed + 1))
      sleep 0.05
    done
    if kill -0 "$bounded_pid" 2>/dev/null; then
      kill -KILL "$bounded_pid" 2>/dev/null || true
    fi
    wait "$bounded_pid" 2>/dev/null || true
    bounded_status=124
    return
  fi
  if wait "$bounded_pid"; then
    bounded_status=0
  else
    bounded_status=$?
  fi
}

run_bounded "$run_dir/component-storage-positive.log" \
  "$runner" "$root_disk" /usr/local/libexec/capsule-guest-launcher \
  /bin/sh -c 'echo INSTALLED_GUEST_BOOTED'
test "$bounded_status" -eq 0 || fail "component-owned root smoke exited $bounded_status"
grep -q 'root=component-bundle-block-ro' "$run_dir/component-storage-positive.log"
grep -q '^INSTALLED_GUEST_BOOTED$' "$run_dir/component-storage-positive.log"
log 'STORAGE PASS installed sandboxed runner produced the exact guest marker from its sealed bundle root without an exception or app group'

outside_disk="$experiment_dir/../gate-c-libkrun-hvf/.build/alpine-3.22-root.ext4"
run_bounded "$run_dir/outside-storage-negative.log" \
  "$runner" "$outside_disk" /usr/local/libexec/capsule-guest-launcher /bin/true
test "$bounded_status" -ne 0 || fail 'sandboxed runner unexpectedly opened outside component storage'
grep -Eq 'Error configuring virtio-blk|krun_add_disk\(root\)|krun_start_enter' \
  "$run_dir/outside-storage-negative.log"
log "STORAGE-NEGATIVE PASS outside component root denied status=$bounded_status"

run_bounded "$run_dir/corrupt-disk-negative.log" \
  "$corrupt_runner" "$corrupt_root" /usr/local/libexec/capsule-guest-launcher /bin/true
grep -q 'mount KRUN_BLOCK_ROOT_DEVICE: Invalid argument' \
  "$run_dir/corrupt-disk-negative.log" || fail 'corrupt root did not produce the expected mount failure'
if [ "$bounded_status" -eq 0 ]; then
  corrupt_disk_classification=fail-open-exit-status
  log 'CORRUPT-DISK COUNTEREVIDENCE mount failed but runner exit status was 0'
else
  corrupt_disk_classification=failed-closed
  log "CORRUPT-DISK PASS failed closed status=$bounded_status"
fi

wait_for_pattern() {
  file=$1
  pattern=$2
  count=0
  while ! grep -q "$pattern" "$file" 2>/dev/null; do
    count=$((count + 1))
    [ "$count" -lt 400 ] || fail "timeout waiting for $pattern in $file"
    sleep 0.05
  done
}

wait_for_new_pattern() {
  file=$1
  first_line=$2
  pattern=$3
  count=0
  while ! tail -n "+$first_line" "$file" 2>/dev/null | grep -q "$pattern"; do
    count=$((count + 1))
    [ "$count" -lt 400 ] || fail "timeout waiting for new $pattern in $file"
    sleep 0.05
  done
}

wait_for_active() {
  count=0
  while [ ! -s "$state_dir/active.json" ]; do
    count=$((count + 1))
    [ "$count" -lt 400 ] || fail 'timeout waiting for durable active record'
    sleep 0.05
  done
}

wait_for_no_active() {
  count=0
  while [ -e "$state_dir/active.json" ]; do
    count=$((count + 1))
    [ "$count" -lt 400 ] || fail 'timeout waiting for exact terminal recovery'
    sleep 0.05
  done
}

start_and_reparent() {
  case_name=$1
  launchctl kickstart "$domain/$label"
  wait_for_active
  runner_pid=$(plutil -extract identity.pid raw -o - "$state_dir/active.json")
  wait_for_pattern "$service_root/supervisor.stderr.log" "CAPSULE_KRUN_AUTHORIZED pid=$runner_pid"
  if [ "$case_name" = 'restart-loop-1' ]; then
    run_bounded "$run_dir/concurrent-supervisor-negative.log" \
      "$supervisor" "$state_dir" "$identity_helper" "$runner" "$root_disk" \
      "$expected_identifier" "$expected_team" "$expected_cdhash" \
      /usr/local/libexec/capsule-guest-launcher /bin/sh -c \
      'while true; do sleep 1; done'
    test "$bounded_status" -ne 0 || fail 'concurrent Supervisor unexpectedly acquired the store'
    grep -q 'another Supervisor holds' "$run_dir/concurrent-supervisor-negative.log"
    kill -0 "$runner_pid"
    log 'CONCURRENT-SUPERVISOR PASS exclusive store lease refused a second launcher'
  fi
  launchctl kill SIGKILL "$domain/$label"
  count=0
  while [ "$(ps -p "$runner_pid" -o ppid= 2>/dev/null | tr -d ' ')" != 1 ]; do
    count=$((count + 1))
    [ "$count" -lt 200 ] || fail "runner $runner_pid did not reparent to launchd"
    sleep 0.05
  done
  "$identity_helper" "$runner_pid" > "$run_dir/$case_name.reparented.identity"
  grep -q "^path=$runner$" "$run_dir/$case_name.reparented.identity"
  log "REPARENT PASS case=$case_name runnerPid=$runner_pid ppid=1"
}

recover_active() {
  case_name=$1
  attempt=$(plutil -extract attempt raw -o - "$state_dir/active.json")
  launchctl kickstart "$domain/$label"
  wait_for_no_active
  terminal="$state_dir/terminal-$attempt.json"
  test -s "$terminal" || fail "missing terminal record for $attempt"
  test "$(plutil -extract phase raw -o - "$terminal")" = 'reaped-exact'
  log "RECOVERY PASS case=$case_name attempt=$attempt"
}

for loop in 1 2 3; do
  start_and_reparent "restart-loop-$loop"
  recover_active "restart-loop-$loop"
done

start_and_reparent corrupt-record
cp "$state_dir/active.json" "$state_dir/active.saved.json"
plutil -replace identity.startUsec -integer 1 "$state_dir/active.json"
error_lines=$(wc -l < "$service_root/supervisor.stderr.log" | tr -d ' ')
launchctl kickstart "$domain/$label"
wait_for_new_pattern "$service_root/supervisor.stderr.log" "$((error_lines + 1))" \
  'live PID identity does not match durable record'
test -f "$state_dir/active.json"
kill -0 "$runner_pid"
mv "$state_dir/active.saved.json" "$state_dir/active.json"
recover_active corrupt-record-restored
log "CORRUPT-RECORD PASS refused recovery and preserved runner authority boundary priorErrorLines=$error_lines"

start_and_reparent update-replacement
mv "$install_app" "$installed_backup"
ditto "$build_dir/CapsuleKrunInstalledRecoveryV2.app" "$install_app"
update_swapped=true
update_error_lines=$(wc -l < "$service_root/supervisor.stderr.log" | tr -d ' ')
launchctl kickstart "$domain/$label"
wait_for_new_pattern "$service_root/supervisor.stderr.log" "$((update_error_lines + 1))" \
  'recovery unresolved:'
test -f "$state_dir/active.json"
kill -0 "$runner_pid"
restore_v1_if_needed
recover_active update-replacement-restored
log 'UPDATE-REPLACEMENT PASS replacement was unresolved; restoring exact enrolled bytes allowed exact reap'

start_and_reparent identity-helper-failure
chmod 000 "$identity_helper"
helper_error_lines=$(wc -l < "$service_root/supervisor.stderr.log" | tr -d ' ')
launchctl kickstart "$domain/$label"
wait_for_new_pattern "$service_root/supervisor.stderr.log" "$((helper_error_lines + 1))" \
  'recorded runner absent or unreadable; absence is not teardown evidence'
test -f "$state_dir/active.json"
kill -0 "$runner_pid"
chmod 0755 "$identity_helper"
recover_active identity-helper-restored
log 'IDENTITY-HELPER-FAILURE PASS transient helper failure remained unresolved and did not signal the runner'

printf '%s\n' occupied > "$state_dir/active.json.tmp"
failure_log_lines=$(wc -l < "$service_root/supervisor.stderr.log" | tr -d ' ')
launchctl kickstart "$domain/$label"
wait_for_new_pattern "$service_root/supervisor.stderr.log" "$((failure_log_lines + 1))" \
  'durable record before start:'
test ! -e "$state_dir/active.json"
rm -f -- "$state_dir/active.json.tmp"
log "PERSISTENCE-FAILURE PASS preexisting temp record prevented G authorization priorErrorLines=$failure_log_lines"

launchctl bootout "$domain/$label"
plutil -replace AbandonProcessGroup -bool false "$launch_plist"
launchctl bootstrap "$domain" "$launch_plist"
launchctl kickstart "$domain/$label"
wait_for_active
runner_pid=$(plutil -extract identity.pid raw -o - "$state_dir/active.json")
attempt=$(plutil -extract attempt raw -o - "$state_dir/active.json")
wait_for_pattern "$service_root/supervisor.stderr.log" "CAPSULE_KRUN_AUTHORIZED pid=$runner_pid"
launchctl kill SIGKILL "$domain/$label"
count=0
while kill -0 "$runner_pid" 2>/dev/null; do
  count=$((count + 1))
  [ "$count" -lt 200 ] || fail "runner $runner_pid survived despite AbandonProcessGroup=false"
  sleep 0.05
done
launchctl kickstart "$domain/$label"
wait_for_no_active
abandon_terminal="$state_dir/terminal-$attempt.json"
test "$(plutil -extract phase raw -o - "$abandon_terminal")" = \
  'gone-exact-process-absent'
log "LAUNCHD-GROUP NEGATIVE PASS AbandonProcessGroup=false removed runnerPid=$runner_pid and exact absence was terminalized"

terminal_count=$(find "$state_dir" -maxdepth 1 -name 'terminal-attempt-*.json' -type f | wc -l | tr -d ' ')
test "$terminal_count" -eq 7
reaped_count=0
gone_count=0
for terminal_record in "$state_dir"/terminal-attempt-*.json; do
  case "$(plutil -extract phase raw -o - "$terminal_record")" in
    reaped-exact) reaped_count=$((reaped_count + 1)) ;;
    gone-exact-process-absent) gone_count=$((gone_count + 1)) ;;
    *) fail "unexpected terminal phase in $terminal_record" ;;
  esac
done
test "$reaped_count" -eq 6
test "$gone_count" -eq 1

evidence_dir="$run_dir/evidence"
if [ -d "$evidence_dir/state" ]; then
  previous_state="$evidence_dir/state-previous-$(date -u '+%Y%m%dT%H%M%SZ')"
  mv "$evidence_dir/state" "$previous_state"
fi
mkdir -p "$evidence_dir/state"
cp "$state_dir"/terminal-attempt-*.json "$evidence_dir/state/"
cp "$launch_plist" "$evidence_dir/LaunchAgent-final.plist"
cp "$run_dir/LaunchAgent-abandon-true.plist" "$evidence_dir/LaunchAgent-abandon-true.plist"
cp "$run_dir/launchctl-abandon-true.txt" "$evidence_dir/launchctl-abandon-true.txt"
shasum -a 256 "$evidence_dir/LaunchAgent-abandon-true.plist" \
  > "$evidence_dir/launch-profile-sha256.txt"
codesign -d --verbose=4 "$install_app" > "$evidence_dir/app-codesign.txt" 2>&1
codesign -d --entitlements - "$install_app" > "$evidence_dir/app-entitlements.plist" 2>&1
codesign -d --verbose=4 "$runner" > "$evidence_dir/runner-codesign.txt" 2>&1
shasum -a 256 "$runner" "$root_disk" > "$evidence_dir/installed-sha256.txt"
launchctl print "$domain/$label" > "$evidence_dir/launchctl-final.txt"
sw_vers > "$evidence_dir/sw-vers.txt"
uname -a > "$evidence_dir/uname.txt"
pmset -g assertions > "$evidence_dir/power-assertions.txt"
log "EVIDENCE retained=$evidence_dir"
log "SUMMARY harness=PASS corruptDiskSafety=$corrupt_disk_classification exactReapedCycles=$reaped_count exactAbsentCycles=$gone_count cleanMachineEvidence=false sleepWakeExecuted=false logoutLoginExecuted=false"

trap - EXIT HUP INT TERM
cleanup
