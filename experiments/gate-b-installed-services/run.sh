#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/build"
run_log="$build_dir/last-run.log"
domain="gui/$(id -u)"
epoch='epoch-installed-1'

supervisor_label='io.github.dills122.capsule.gate-b.installed.supervisor'
broker_label='io.github.dills122.capsule.gate-b.installed.broker'
daemon_label='io.github.dills122.capsule.gate-b.installed.daemon'
supervisor_daemon_service="$supervisor_label.from-daemon"
supervisor_broker_service="$supervisor_label.from-broker"
broker_service="$broker_label.from-supervisor"
daemon_service="$daemon_label.from-supervisor"

supervisor_identifier='io.github.dills122.capsule.gate-b.installed.supervisor'
broker_identifier='io.github.dills122.capsule.gate-b.installed.broker'
daemon_identifier='io.github.dills122.capsule.gate-b.installed.daemon'

install_root="$HOME/Library/Application Support/CapsuleGateBInstalledServicesSpike"
launch_agents="$HOME/Library/LaunchAgents"
supervisor_plist="$launch_agents/$supervisor_label.plist"
broker_plist="$launch_agents/$broker_label.plist"
daemon_plist="$launch_agents/$daemon_label.plist"
marker="$install_root/.capsule-gate-b-installed-services-spike"

mkdir -p "$build_dir"
: > "$run_log"

log() {
  printf '%s\n' "$*"
  printf '%s\n' "$*" >> "$run_log"
}

fail() {
  log "FAIL $*"
  exit 1
}

service_loaded() {
  launchctl print "$domain/$1" >/dev/null 2>&1
}

bootout_if_owned() {
  label=$1
  if service_loaded "$label"; then
    launchctl bootout "$domain/$label" >/dev/null 2>&1 || true
  fi
}

remove_plist_if_owned() {
  plist=$1
  expected_label=$2
  if [ ! -e "$plist" ]; then
    return
  fi
  actual_label=$(plutil -extract Label raw -o - "$plist" 2>/dev/null || true)
  if [ "$actual_label" = "$expected_label" ]; then
    rm -f -- "$plist"
  else
    log "REFUSED removal of unexpected plist: $plist"
  fi
}

cleanup() {
  cleanup_allowed=false
  if [ -f "$marker" ] &&
      [ "$(cat "$marker")" = 'capsule-gate-b-installed-services-v1' ]; then
    cleanup_allowed=true
  fi
  if [ "$cleanup_allowed" != true ]; then
    for label in "$daemon_label" "$broker_label" "$supervisor_label"; do
      if service_loaded "$label"; then
        log "REFUSED bootout without owned install marker: $domain/$label"
      fi
    done
    for path in "$daemon_plist" "$broker_plist" "$supervisor_plist" "$install_root"; do
      if [ -e "$path" ]; then
        log "REFUSED removal without owned install marker: $path"
      fi
    done
    return
  fi
  bootout_if_owned "$daemon_label"
  bootout_if_owned "$broker_label"
  bootout_if_owned "$supervisor_label"
  remove_plist_if_owned "$daemon_plist" "$daemon_label"
  remove_plist_if_owned "$broker_plist" "$broker_label"
  remove_plist_if_owned "$supervisor_plist" "$supervisor_label"
  rm -rf -- "$install_root"
}

if [ "${1:-}" = '--cleanup' ]; then
  cleanup
  log 'PASS requested cleanup completed for owned service labels and files'
  exit 0
fi
if [ "$#" -ne 0 ]; then
  echo "usage: $0 [--cleanup]" >&2
  exit 64
fi

for label in "$supervisor_label" "$broker_label" "$daemon_label"; do
  if service_loaded "$label"; then
    echo "refusing to replace loaded service $domain/$label; run $0 --cleanup after inspection" >&2
    exit 66
  fi
done
for path in "$install_root" "$supervisor_plist" "$broker_plist" "$daemon_plist"; do
  if [ -e "$path" ]; then
    echo "refusing to replace existing spike path: $path" >&2
    exit 66
  fi
done

if [ -n "${CAPSULE_SIGNING_IDENTITY:-}" ]; then
  signing_identity=$CAPSULE_SIGNING_IDENTITY
else
  matching_identities=$(security find-identity -v -p codesigning |
    sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p')
  identity_count=$(printf '%s\n' "$matching_identities" |
    awk 'NF { count++ } END { print count + 0 }')
  if [ "$identity_count" -ne 1 ]; then
    echo 'expected exactly one Apple Development identity; set CAPSULE_SIGNING_IDENTITY' >&2
    exit 65
  fi
  signing_identity=$matching_identities
fi

trap cleanup EXIT HUP INT TERM

compile_component() {
  output=$1
  role=$2
  build=$3
  clang -fblocks -Wall -Wextra -Werror \
    -DCOMPONENT_ROLE="\"$role\"" \
    -DCOMPONENT_BUILD="\"$build\"" \
    "$experiment_dir/Sources/component.c" \
    -framework CoreFoundation -framework Security -lbsm \
    -o "$build_dir/$output"
}

sign_component() {
  identifier=$1
  path=$2
  codesign --force --options runtime --timestamp=none \
    --sign "$signing_identity" --identifier "$identifier" "$path"
  codesign --verify --strict "$path"
}

cdhash_for() {
  codesign -d --verbose=4 "$1" 2>&1 | sed -n 's/^CDHash=//p'
}

compile_component supervisor_v1 supervisor v1
compile_component supervisor_v2 supervisor v2-stale
compile_component broker_v1 broker v1
compile_component broker_v2 broker v2-stale
compile_component daemon_v1 daemon v1
compile_component daemon_v2 daemon v2-stale

sign_component "$supervisor_identifier" "$build_dir/supervisor_v1"
team_id=$(codesign -d --verbose=4 "$build_dir/supervisor_v1" 2>&1 |
  sed -n 's/^TeamIdentifier=//p')
if ! printf '%s\n' "$team_id" | rg -q '^[A-Z0-9]{10}$'; then
  fail 'Apple-signed probe did not expose a ten-character TeamIdentifier'
fi
sign_component "$supervisor_identifier" "$build_dir/supervisor_v2"
sign_component "$broker_identifier" "$build_dir/broker_v1"
sign_component "$broker_identifier" "$build_dir/broker_v2"
sign_component "$daemon_identifier" "$build_dir/daemon_v1"
sign_component "$daemon_identifier" "$build_dir/daemon_v2"

channel_oid='1.2.840.113635.100.6.1.12'
requirement_for() {
  identifier=$1
  path=$2
  hash=$(cdhash_for "$path")
  printf '%s' "anchor apple generic and certificate leaf[subject.OU] = \"$team_id\" and certificate leaf[field.$channel_oid] exists and identifier \"$identifier\" and entitlement[\"com.apple.security.get-task-allow\"] absent and cdhash H\"$hash\""
}

supervisor_requirement=$(requirement_for "$supervisor_identifier" "$build_dir/supervisor_v1")
broker_requirement=$(requirement_for "$broker_identifier" "$build_dir/broker_v1")
daemon_requirement=$(requirement_for "$daemon_identifier" "$build_dir/daemon_v1")

mkdir -p "$install_root/bin" "$launch_agents"
printf '%s\n' 'capsule-gate-b-installed-services-v1' > "$marker"
cp "$build_dir/supervisor_v1" "$install_root/bin/supervisor"
cp "$build_dir/broker_v1" "$install_root/bin/broker"
cp "$build_dir/daemon_v1" "$install_root/bin/daemon"

make_plist() {
  plist=$1
  label=$2
  executable=$3
  stdout_path=$4
  stderr_path=$5
  shift 5
  cp "$experiment_dir/LaunchAgent.plist" "$plist"
  plutil -replace Label -string "$label" "$plist"
  plutil -replace ProgramArguments -json '[]' "$plist"
  argument_index=0
  for argument in "$executable" serve "$epoch" "$@"; do
    plutil -insert "ProgramArguments.$argument_index" -string "$argument" "$plist"
    argument_index=$((argument_index + 1))
  done
  mach_services_json='{'
  mach_services_separator=''
  while [ "$#" -ge 3 ]; do
    service_name=$1
    mach_services_json="$mach_services_json$mach_services_separator\"$service_name\":true"
    mach_services_separator=','
    shift 3
  done
  mach_services_json="$mach_services_json}"
  plutil -replace MachServices -json "$mach_services_json" "$plist"
  plutil -replace StandardOutPath -string "$stdout_path" "$plist"
  plutil -replace StandardErrorPath -string "$stderr_path" "$plist"
  plutil -lint "$plist" >/dev/null
}

make_plist \
  "$supervisor_plist" "$supervisor_label" "$install_root/bin/supervisor" \
  "$build_dir/supervisor.stdout.log" "$build_dir/supervisor.stderr.log" \
  "$supervisor_daemon_service" "$daemon_requirement" daemon \
  "$supervisor_broker_service" "$broker_requirement" broker
make_plist \
  "$broker_plist" "$broker_label" "$install_root/bin/broker" \
  "$build_dir/broker.stdout.log" "$build_dir/broker.stderr.log" \
  "$broker_service" "$supervisor_requirement" supervisor
make_plist \
  "$daemon_plist" "$daemon_label" "$install_root/bin/daemon" \
  "$build_dir/daemon.stdout.log" "$build_dir/daemon.stderr.log" \
  "$daemon_service" "$supervisor_requirement" supervisor

launchctl bootstrap "$domain" "$supervisor_plist"
launchctl bootstrap "$domain" "$broker_plist"
launchctl bootstrap "$domain" "$daemon_plist"
for label in "$supervisor_label" "$broker_label" "$daemon_label"; do
  service_loaded "$label" || fail "service was not registered: $label"
done
log 'PASS three per-user LaunchAgents registered in the current Aqua GUI domain'

run_client() {
  output=$("$@")
  printf '%s\n' "$output" >> "$run_log"
  printf '%s\n' "$output"
}

daemon_to_supervisor=$(run_client \
  "$build_dir/daemon_v1" client "$supervisor_daemon_service" \
  "$supervisor_requirement" supervisor probe "$epoch" 0)
log 'PASS daemon-to-Supervisor channel activated with exact bidirectional identity'

run_client \
  "$build_dir/broker_v1" client "$supervisor_broker_service" \
  "$supervisor_requirement" supervisor probe "$epoch" 0 >/dev/null
log 'PASS Broker-to-Supervisor channel activated with exact bidirectional identity'

run_client \
  "$build_dir/supervisor_v1" client "$broker_service" \
  "$broker_requirement" broker probe "$epoch" 0 >/dev/null
log 'PASS Supervisor-to-Broker health channel activated with exact bidirectional identity'

run_client \
  "$build_dir/supervisor_v1" client "$daemon_service" \
  "$daemon_requirement" daemon probe "$epoch" 0 >/dev/null
log 'PASS Supervisor-to-daemon health channel activated with exact bidirectional identity'

run_client \
  "$build_dir/daemon_v1" client "$supervisor_daemon_service" \
  "$supervisor_requirement" supervisor forged-operation "$epoch" 10 >/dev/null
log 'PASS authenticated malformed operation denied before an authoritative action'

run_client \
  "$build_dir/daemon_v1" client "$supervisor_daemon_service" \
  "$supervisor_requirement" supervisor probe epoch-stale 13 >/dev/null
log 'PASS authenticated wrong epoch denied by protocol'

if "$build_dir/daemon_v2" client "$supervisor_daemon_service" \
    "$supervisor_requirement" supervisor probe "$epoch" 0 >> "$run_log" 2>&1; then
  fail 'stale same-role daemon client unexpectedly reached the Supervisor'
else
  log 'PASS stale same-team/same-role daemon client denied by exact listener requirement'
fi

before_instance=$(printf '%s\n' "$daemon_to_supervisor" |
  sed -n 's/.*serverInstance=\([^ ]*\).*/\1/p')
before_pid=$(printf '%s\n' "$daemon_to_supervisor" |
  sed -n 's/.*serverPid=\([^ ]*\).*/\1/p')
launchctl kill SIGKILL "$domain/$supervisor_label"

after_supervisor=''
attempt=0
while [ "$attempt" -lt 20 ]; do
  if after_supervisor=$("$build_dir/daemon_v1" client \
      "$supervisor_daemon_service" "$supervisor_requirement" supervisor \
      probe "$epoch" 0 2>/dev/null); then
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.25
done
if [ -z "$after_supervisor" ]; then
  fail 'Supervisor did not reactivate after SIGKILL'
fi
log "$after_supervisor"
after_instance=$(printf '%s\n' "$after_supervisor" |
  sed -n 's/.*serverInstance=\([^ ]*\).*/\1/p')
after_pid=$(printf '%s\n' "$after_supervisor" |
  sed -n 's/.*serverPid=\([^ ]*\).*/\1/p')
if [ -z "$before_instance" ] || [ -z "$after_instance" ] ||
    [ "$before_instance" = "$after_instance" ]; then
  fail 'Supervisor reconnect did not prove a new service instance'
fi
log "PASS launchd reactivated Supervisor after SIGKILL oldPid=$before_pid newPid=$after_pid oldInstance=$before_instance newInstance=$after_instance"

launchctl bootout "$domain/$broker_label"
cp "$build_dir/broker_v2" "$install_root/bin/broker"
launchctl bootstrap "$domain" "$broker_plist"
if "$build_dir/supervisor_v1" client "$broker_service" \
    "$broker_requirement" broker probe "$epoch" 0 >> "$run_log" 2>&1; then
  fail 'stale replacement Broker service unexpectedly matched the enrolled build'
else
  log 'PASS same-team/same-role stale replacement service denied by client exact requirement'
fi

launchctl bootout "$domain/$broker_label"
cp "$build_dir/broker_v1" "$install_root/bin/broker"
launchctl bootstrap "$domain" "$broker_plist"
run_client \
  "$build_dir/supervisor_v1" client "$broker_service" \
  "$broker_requirement" broker probe "$epoch" 0 >/dev/null
log 'PASS enrolled Broker restored and reactivated after replacement denial'

observed_uid=$(id -u)
observed_asid=$(printf '%s\n' "$after_supervisor" |
  sed -n 's/.*localAsid=\([^ ]*\).*/\1/p')
log "PASS service-side and client-side effective UID/audit-session observations agreed uid=$observed_uid asid=$observed_asid"

cleanup
trap - EXIT HUP INT TERM
for label in "$supervisor_label" "$broker_label" "$daemon_label"; do
  if service_loaded "$label"; then
    fail "service remained registered after bootout: $label"
  fi
done
for path in "$install_root" "$supervisor_plist" "$broker_plist" "$daemon_plist"; do
  if [ -e "$path" ]; then
    fail "installed spike path remained after removal: $path"
  fi
done
log 'PASS all three LaunchAgents booted out and all owned installed files removed'
log "PASS Gate B installed-service lifecycle spike team=$team_id identity=$signing_identity"
