#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_app="$experiment_dir/.build/CapsuleP04AInstalledTopology.app"
run_dir="$experiment_dir/.runs"
run_log="$run_dir/last-run.log"
install_app="$HOME/Applications/CapsuleP04AInstalledTopology.app"
label='com.capsulecorp.spike.p0-4a-installed-topology.supervisor'
service='com.capsulecorp.spike.p0-4a-installed-topology.supervisor.from-client'
domain="gui/$(id -u)"
epoch='p0-4a-epoch-placeholder'
fallback_plist="$run_dir/fallback-launch-agent.plist"
marker="$run_dir/.installed-by-p0-4a"
registration_mode=none

mkdir -p "$run_dir"
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
  launchctl print "$domain/$label" >/dev/null 2>&1
}

cleanup() {
  if [ "$registration_mode" = smappservice ] && [ -x "$install_app/Contents/MacOS/capsule-topology-registrar" ]; then
    "$install_app/Contents/MacOS/capsule-topology-registrar" unregister >>"$run_log" 2>&1 || true
  elif [ "$registration_mode" = launchctl-fallback ] && service_loaded; then
    launchctl bootout "$domain/$label" >>"$run_log" 2>&1 || true
  fi
  if [ -f "$marker" ] && [ "$(cat "$marker")" = "$install_app" ] && [ -d "$install_app" ]; then
    if python3 "$experiment_dir/topology_manifest.py" verify "$install_app" \
        --verify-signature >>"$run_log" 2>&1; then
      rm -rf -- "$install_app"
      rm -f -- "$marker"
    else
      log 'REFUSED cleanup of changed installed app'
    fi
  fi
}

if [ "${1:-}" = '--cleanup' ]; then
  if [ -x "$install_app/Contents/MacOS/capsule-topology-registrar" ]; then
    "$install_app/Contents/MacOS/capsule-topology-registrar" unregister >>"$run_log" 2>&1 || true
  fi
  if service_loaded; then
    launchctl bootout "$domain/$label" >>"$run_log" 2>&1 || true
  fi
  if [ -f "$marker" ] && [ "$(cat "$marker")" = "$install_app" ] &&
      [ -d "$install_app" ] && [ ! -L "$install_app" ]; then
    if python3 "$experiment_dir/topology_manifest.py" verify "$install_app" \
        --verify-signature >>"$run_log" 2>&1; then
      rm -rf -- "$install_app"
      rm -f -- "$marker"
    else
      log 'REFUSED requested cleanup of changed installed app'
      exit 1
    fi
  fi
  exit 0
fi
if [ "$#" -ne 0 ]; then
  echo "usage: $0 [--cleanup]" >&2
  exit 64
fi
trap cleanup EXIT HUP INT TERM

test -d "$build_app"
if service_loaded; then
  fail "refusing pre-existing service $domain/$label"
fi
if [ -e "$install_app" ]; then
  fail "refusing pre-existing install path $install_app"
fi
mkdir -p "$HOME/Applications"
ditto "$build_app" "$install_app"
printf '%s\n' "$install_app" > "$marker"
python3 "$experiment_dir/topology_manifest.py" verify "$install_app" \
  --verify-signature | tee -a "$run_log"
cp "$install_app/Contents/Resources/Manifests/topology-manifest.json" \
  "$run_dir/installed-topology-manifest.json"
log 'INSTALLED-BYTE-READBACK PASS exact closed component manifest verified after copy'

registrar="$install_app/Contents/MacOS/capsule-topology-registrar"
register_status=0
"$registrar" register >"$run_dir/smappservice-register.log" 2>&1 || register_status=$?
cat "$run_dir/smappservice-register.log" >> "$run_log"
if [ "$register_status" -eq 0 ]; then
  registration_mode=smappservice
  log 'SERVICE-REGISTRATION PASS embedded SMAppService LaunchAgent registration succeeded'
else
  registration_mode=launchctl-fallback
  log "SERVICE-REGISTRATION GAP SMAppService rejected this local signing/session context status=$register_status"
  cp "$install_app/Contents/Library/LaunchAgents/$label.plist" "$fallback_plist"
  plutil -remove BundleProgram "$fallback_plist"
  plutil -insert Program -string \
    "$install_app/Contents/MacOS/capsule-topology-supervisor" "$fallback_plist"
  plutil -lint "$fallback_plist" >/dev/null
  launchctl bootstrap "$domain" "$fallback_plist"
  log 'SERVICE-ACTIVATION FALLBACK current-user launchctl bootstrapped the exact embedded plist with only BundleProgram resolved; this is not SMAppService evidence'
fi

service_loaded || fail 'per-user Supervisor service is not registered'
launchctl print "$domain/$label" > "$run_dir/launchctl-service.txt"
launchctl kickstart "$domain/$label"
count=0
while ! launchctl print "$domain/$label" 2>/dev/null | grep -q 'state = running' &&
    [ "$count" -lt 200 ]; do
  count=$((count + 1))
  sleep 0.02
done
launchctl print "$domain/$label" > "$run_dir/launchctl-service-running.txt"
grep -q 'state = running' "$run_dir/launchctl-service-running.txt" ||
  fail 'registered per-user Supervisor did not start after explicit kickstart'
log 'SERVICE-ACTIVATION PASS exact registered per-user Supervisor started without host-root authority; initial Mach lookup auto-activation remains unproven'

identity_fields() {
  path=$1
  identifier=$(codesign -d --verbose=4 "$path" 2>&1 | sed -n 's/^Identifier=//p')
  team=$(codesign -d --verbose=4 "$path" 2>&1 | sed -n 's/^TeamIdentifier=//p')
  cdhash=$(codesign -d --verbose=4 "$path" 2>&1 | sed -n 's/^CDHash=//p')
  if [ -n "$team" ] && [ "$team" != 'not set' ]; then
    channel_oid='1.2.840.113635.100.6.1.12'
    printf '%s' "anchor apple generic and certificate leaf[subject.OU] = \"$team\" and certificate leaf[field.$channel_oid] exists and identifier \"$identifier\" and entitlement[\"com.apple.security.get-task-allow\"] absent and cdhash H\"$cdhash\""
  else
    printf '%s' "identifier \"$identifier\" and cdhash H\"$cdhash\""
  fi
}

client="$install_app/Contents/MacOS/capsule-topology-client"
stale_client="$experiment_dir/.build/capsule-topology-client-stale"
supervisor="$install_app/Contents/MacOS/capsule-topology-supervisor"
supervisor_requirement=$(identity_fields "$supervisor")

run_client() {
  output=$1
  shift
  "$@" >"$output" 2>&1
  cat "$output" >> "$run_log"
}

run_client "$run_dir/service-first.log" "$client" client "$service" \
  "$supervisor_requirement" supervisor probe "$epoch" 0
first_pid=$(sed -n 's/.*serverPid=\([0-9][0-9]*\).*/\1/p' "$run_dir/service-first.log")
first_instance=$(sed -n 's/.*serverInstance=\([^ ]*\).*/\1/p' "$run_dir/service-first.log")
test -n "$first_pid"
test -n "$first_instance"
grep -q 'serverIdentity=true messageIdentity=true euidValid=true asidValid=true' \
  "$run_dir/service-first.log"
log "PROCESS-IDENTITY PASS exact bidirectional code requirement, live message identity, EUID, and audit session pid=$first_pid"

stale_status=0
"$stale_client" client "$service" "$supervisor_requirement" supervisor probe \
  "$epoch" 0 >"$run_dir/stale-client-negative.log" 2>&1 || stale_status=$?
cat "$run_dir/stale-client-negative.log" >> "$run_log"
test "$stale_status" -eq 2
grep -q 'result=peer-denied' "$run_dir/stale-client-negative.log"
log 'MIXED-LIVE-COMPONENT PASS same-identifier stale client with different CDHash was denied'

launchctl kill SIGKILL "$domain/$label"
count=0
while kill -0 "$first_pid" 2>/dev/null && [ "$count" -lt 200 ]; do
  count=$((count + 1))
  sleep 0.02
done
launchctl kickstart "$domain/$label"
run_client "$run_dir/service-after-crash.log" "$client" client "$service" \
  "$supervisor_requirement" supervisor probe "$epoch" 0
second_pid=$(sed -n 's/.*serverPid=\([0-9][0-9]*\).*/\1/p' "$run_dir/service-after-crash.log")
second_instance=$(sed -n 's/.*serverInstance=\([^ ]*\).*/\1/p' "$run_dir/service-after-crash.log")
test -n "$second_pid"
test -n "$second_instance"
test "$second_pid" != "$first_pid"
test "$second_instance" != "$first_instance"
log "CRASH-RECONNECT PASS explicit per-user kickstart plus a fresh XPC connection reached a new Supervisor pid=$second_pid instance=$second_instance"

spctl_status=0
spctl --assess --type execute --verbose=4 "$install_app" \
  >"$run_dir/gatekeeper.log" 2>&1 || spctl_status=$?
cat "$run_dir/gatekeeper.log" >> "$run_log"
if [ "$spctl_status" -eq 0 ] && grep -q 'source=Notarized Developer ID' "$run_dir/gatekeeper.log"; then
  log 'DISTRIBUTION OBSERVATION same-host Gatekeeper accepted a notarized Developer ID app'
else
  log "DISTRIBUTION GAP no complete notarized/Gatekeeper-accepted package evidence status=$spctl_status"
fi

signing_team=$(codesign -d --verbose=4 "$supervisor" 2>&1 | sed -n 's/^TeamIdentifier=//p')
if [ -z "$signing_team" ] || [ "$signing_team" = 'not set' ]; then
  log 'SIGNING GAP no Apple-issued code-signing identity was available; exact CDHash checks used ad-hoc identities and cannot establish Team enrollment'
fi
log "RUN COMPLETE registrationMode=$registration_mode backendAdmitted=false"
