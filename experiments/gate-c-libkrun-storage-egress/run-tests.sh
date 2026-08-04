#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"
runs_dir="$experiment_dir/.runs"
manifest="$build_dir/fixtures.manifest"
runner="$build_dir/capsule-storage-runner"
probe=/usr/local/libexec/capsule-storage-probe
parser_image=${CAPSULE_EXT4_PARSER_IMAGE:-ubuntu@sha256:0e0a0fc6d18feda9db1590da249ac93e8d5abfea8f4c3c0c849ce512b5ef8982}

for required in "$manifest" "$runner" "$build_dir/root.ext4" "$build_dir/source.ext4" \
    "$build_dir/input.ext4" "$build_dir/scratch-template.ext4"; do
    if [ ! -f "$required" ]; then
        printf 'missing build input: %s\n' "$required" >&2
        exit 2
    fi
done
if [ -e "$runs_dir" ]; then
    printf 'refusing to overwrite retained run directory: %s\n' "$runs_dir" >&2
    exit 2
fi
mkdir -p "$runs_dir"

value() {
    sed -n "s/^$1=//p" "$manifest"
}
sha() {
    shasum -a 256 "$1" | awk '{print $1}'
}
verify_fixture() {
    path=$1
    expected=$2
    actual=$(sha "$path")
    if [ "$actual" != "$expected" ]; then
        printf 'DIGEST_REJECT path=%s expected=%s actual=%s\n' "$path" "$expected" "$actual" >&2
        return 1
    fi
    printf 'DIGEST_ACCEPT path=%s sha256=%s\n' "$path" "$actual"
}
prepare_attempt() {
    attempt=$1
    attempt_dir="$runs_dir/$attempt"
    if [ -e "$attempt_dir" ]; then
        printf 'REUSE_REJECT attempt=%s reason=attempt-directory-exists\n' "$attempt" >&2
        return 1
    fi
    mkdir "$attempt_dir"
    cp "$build_dir/scratch-template.ext4" "$attempt_dir/scratch.ext4.tmp"
    chmod 0600 "$attempt_dir/scratch.ext4.tmp"
    mv "$attempt_dir/scratch.ext4.tmp" "$attempt_dir/scratch.ext4"
    {
        printf 'attempt=%s\n' "$attempt"
        printf 'state=prepared\n'
        printf 'scratchBytes=%s\n' "$(stat -f %z "$attempt_dir/scratch.ext4")"
        printf 'initialSha256=%s\n' "$(sha "$attempt_dir/scratch.ext4")"
    } > "$attempt_dir/lifecycle.manifest"
    printf '%s\n' "$attempt_dir/scratch.ext4"
}
mark_state() {
    attempt=$1
    state=$2
    printf 'state.%s=%s\n' "$state" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$runs_dir/$attempt/lifecycle.manifest"
}
wait_for_log() {
    process=$1
    log=$2
    pattern=$3
    for _ in $(jot 200 1); do
        if [ -f "$log" ] && grep -q "$pattern" "$log"; then
            return 0
        fi
        if ! kill -0 "$process" 2>/dev/null; then
            return 1
        fi
        sleep 0.05
    done
    return 1
}
run_attempt() {
    attempt=$1
    mode=$2
    scratch=$(prepare_attempt "$attempt")
    {
        verify_fixture "$build_dir/root.ext4" "$(value rootSha256)"
        verify_fixture "$build_dir/source.ext4" "$(value sourceDiskSha256)"
        verify_fixture "$build_dir/input.ext4" "$(value inputDiskSha256)"
    } >> "$runs_dir/$attempt/digests.log"
    mark_state "$attempt" issued
    set +e
    "$runner" "$build_dir/root.ext4" "$build_dir/source.ext4" "$build_dir/input.ext4" \
        "$scratch" "$probe" "$mode" "$(value sourcePayloadSha256)" \
        "$(value inputPayloadSha256)" > "$runs_dir/$attempt/console.log" 2>&1
    status=$?
    set -e
    printf '%s\n' "$status" > "$runs_dir/$attempt/runner.exit"
    if [ "$status" -ne 0 ]; then
        printf 'attempt %s mode %s failed status=%s\n' "$attempt" "$mode" "$status" >&2
        return 1
    fi
    completion=$(printf '%s' "$mode" | tr '[:lower:]' '[:upper:]')
    if ! grep -q "PROBE_${completion}_COMPLETE" "$runs_dir/$attempt/console.log"; then
        printf 'attempt %s mode %s lacked guest completion evidence despite runner status=%s\n' \
            "$attempt" "$mode" "$status" >&2
        return 1
    fi
    if ! grep -q 'PROBE_STORAGE_UNMOUNTED' "$runs_dir/$attempt/console.log"; then
        printf 'attempt %s mode %s lacked trusted storage-unmount evidence\n' "$attempt" "$mode" >&2
        return 1
    fi
    mark_state "$attempt" runner_stopped
    {
        verify_fixture "$build_dir/source.ext4" "$(value sourceDiskSha256)"
        verify_fixture "$build_dir/input.ext4" "$(value inputDiskSha256)"
    } >> "$runs_dir/$attempt/digests.log"
    printf 'finalScratchSha256=%s\n' "$(sha "$scratch")" >> "$runs_dir/$attempt/lifecycle.manifest"
    mark_state "$attempt" consumed
}

{
    verify_fixture "$build_dir/root.ext4" "$(value rootSha256)"
    verify_fixture "$build_dir/source.ext4" "$(value sourceDiskSha256)"
    verify_fixture "$build_dir/input.ext4" "$(value inputDiskSha256)"
    verify_fixture "$build_dir/scratch-template.ext4" "$(value scratchTemplateSha256)"
} > "$runs_dir/preflight-digests.log"

run_attempt valid valid
"$experiment_dir/inspect-output.sh" "$runs_dir/valid/scratch.ext4" 4096 \
    "$runs_dir/valid/extracted.json" > "$runs_dir/valid/extraction.log" 2>&1
mark_state valid extracted

run_attempt truncation valid
set +e
"$experiment_dir/inspect-output.sh" "$runs_dir/truncation/scratch.ext4" 8 \
    "$runs_dir/truncation/should-not-exist.json" > "$runs_dir/truncation/extraction.log" 2>&1
truncation_status=$?
set -e
if [ "$truncation_status" -ne 70 ] || [ -e "$runs_dir/truncation/should-not-exist.json" ]; then
    printf 'bounded extraction negative failed status=%s\n' "$truncation_status" >&2
    exit 1
fi
mark_state truncation egress_rejected

run_attempt hostile hostile
set +e
"$experiment_dir/inspect-output.sh" "$runs_dir/hostile/scratch.ext4" 4096 \
    "$runs_dir/hostile/should-not-exist.json" > "$runs_dir/hostile/extraction.log" 2>&1
hostile_status=$?
set -e
if [ "$hostile_status" -ne 69 ] || [ -e "$runs_dir/hostile/should-not-exist.json" ]; then
    printf 'hostile extraction negative failed status=%s\n' "$hostile_status" >&2
    exit 1
fi
mkdir -p "$build_dir/parser-evidence"
cp "$runs_dir/hostile/scratch.ext4" "$build_dir/parser-evidence/hostile.ext4"
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --pids-limit 32 --memory 128m --cpus 0.5 \
    --mount "type=bind,src=$build_dir/parser-evidence/hostile.ext4,dst=/input/output.raw,readonly" \
    "$parser_image" sh -ceu '
        /usr/sbin/debugfs -R "ls -p /result" /input/output.raw
        for name in data.json hardlink symlink fifo socket hostile-mode; do
            /usr/sbin/debugfs -R "stat /result/$name" /input/output.raw
        done
        /usr/sbin/debugfs -R "ea_list /result/hostile-mode" /input/output.raw
    ' > "$runs_dir/hostile/offline-inspection.log" 2>&1
mark_state hostile egress_rejected

run_attempt quota quota
if [ "$(stat -f %z "$runs_dir/quota/scratch.ext4")" -ne "$(value scratchBytes)" ]; then
    printf 'quota raw disk changed host size\n' >&2
    exit 1
fi
set +e
"$experiment_dir/inspect-output.sh" "$runs_dir/quota/scratch.ext4" 67108864 \
    "$runs_dir/quota/should-not-exist.json" > "$runs_dir/quota/extraction.log" 2>&1
quota_status=$?
set -e
if [ "$quota_status" -ne 72 ] || [ -e "$runs_dir/quota/should-not-exist.json" ]; then
    printf 'sparse extraction negative failed status=%s\n' "$quota_status" >&2
    exit 1
fi
cp "$runs_dir/quota/scratch.ext4" "$build_dir/parser-evidence/quota.ext4"
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --pids-limit 32 --memory 128m --cpus 0.5 \
    --mount "type=bind,src=$build_dir/parser-evidence/quota.ext4,dst=/input/output.raw,readonly" \
    "$parser_image" sh -ceu '
        /usr/sbin/debugfs -R "stat /result/data.json" /input/output.raw
        /usr/sbin/debugfs -R "stat /fill" /input/output.raw
    ' > "$runs_dir/quota/offline-inspection.log" 2>&1

# A changed immutable input is rejected before VMM creation.
mkdir "$runs_dir/input-mutation"
cp "$build_dir/input.ext4" "$runs_dir/input-mutation/input-mutated.ext4"
chmod 0600 "$runs_dir/input-mutation/input-mutated.ext4"
printf X | dd of="$runs_dir/input-mutation/input-mutated.ext4" bs=1 seek=65536 conv=notrunc status=none
set +e
verify_fixture "$runs_dir/input-mutation/input-mutated.ext4" "$(value inputDiskSha256)" \
    > "$runs_dir/input-mutation/verification.log" 2>&1
mutation_status=$?
set -e
if [ "$mutation_status" -eq 0 ]; then
    printf 'mutated input unexpectedly passed digest verification\n' >&2
    exit 1
fi
printf 'runnerStarted=false\n' >> "$runs_dir/input-mutation/verification.log"

# Directly inject a special inode into a raw image to emulate filesystem corruption or a more
# privileged hostile guest; the declared slot must still fail closed during offline inspection.
mkdir "$runs_dir/special-device"
cp "$build_dir/scratch-template.ext4" "$build_dir/parser-evidence/special-device.ext4"
chmod 0600 "$build_dir/parser-evidence/special-device.ext4"
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --pids-limit 32 --memory 128m --cpus 0.5 \
    --mount "type=bind,src=$build_dir/parser-evidence/special-device.ext4,dst=/input/output.raw" \
    "$parser_image" sh -ceu '
        /usr/sbin/debugfs -w -R "mkdir /result" /input/output.raw
        printf "cd /result\nmknod data.json c 1 3\n" | /usr/sbin/debugfs -w /input/output.raw
        /usr/sbin/debugfs -R "stat /result/data.json" /input/output.raw
    ' > "$runs_dir/special-device/injection.log" 2>&1
cp "$build_dir/parser-evidence/special-device.ext4" "$runs_dir/special-device/scratch.ext4"
set +e
"$experiment_dir/inspect-output.sh" "$runs_dir/special-device/scratch.ext4" 4096 \
    "$runs_dir/special-device/should-not-exist.json" > "$runs_dir/special-device/extraction.log" 2>&1
special_status=$?
set -e
if [ "$special_status" -ne 69 ]; then
    printf 'special-file extraction negative failed status=%s\n' "$special_status" >&2
    exit 1
fi

# Runner crash/timeout cleanup: terminate the exact VMM PID, wait for absence, then delete only its
# explicit disposable disk and retain the lifecycle record.
crash_scratch=$(prepare_attempt crash-cleanup)
mark_state crash-cleanup issued
"$runner" "$build_dir/root.ext4" "$build_dir/source.ext4" "$build_dir/input.ext4" \
    "$crash_scratch" "$probe" crash "$(value sourcePayloadSha256)" \
    "$(value inputPayloadSha256)" > "$runs_dir/crash-cleanup/console.log" 2>&1 &
crash_pid=$!
printf 'runnerPid=%s\n' "$crash_pid" >> "$runs_dir/crash-cleanup/lifecycle.manifest"
if ! wait_for_log "$crash_pid" "$runs_dir/crash-cleanup/console.log" PROBE_READY_CRASH; then
    printf 'crash probe never reached ready point\n' >&2
    kill "$crash_pid" 2>/dev/null || true
    wait "$crash_pid" 2>/dev/null || true
    exit 1
fi
kill -KILL "$crash_pid"
set +e
wait "$crash_pid" 2>/dev/null
crash_status=$?
set -e
printf 'runnerExit=%s\n' "$crash_status" >> "$runs_dir/crash-cleanup/lifecycle.manifest"
if kill -0 "$crash_pid" 2>/dev/null; then
    printf 'exact crash runner remained live\n' >&2
    exit 1
fi
mark_state crash-cleanup runner_absent
printf 'preCleanupSha256=%s\n' "$(sha "$crash_scratch")" >> "$runs_dir/crash-cleanup/lifecycle.manifest"
rm "$crash_scratch"
mark_state crash-cleanup scratch_deleted
if [ -e "$crash_scratch" ]; then
    printf 'crash scratch cleanup failed\n' >&2
    exit 1
fi

# Exercise the same storage reconciliation on a wall-time expiry using graceful host SIGTERM of
# the exact runner. Artifact extraction remains forbidden and the disposable disk is removed.
timeout_scratch=$(prepare_attempt timeout-cleanup)
mark_state timeout-cleanup issued
"$runner" "$build_dir/root.ext4" "$build_dir/source.ext4" "$build_dir/input.ext4" \
    "$timeout_scratch" "$probe" crash "$(value sourcePayloadSha256)" \
    "$(value inputPayloadSha256)" > "$runs_dir/timeout-cleanup/console.log" 2>&1 &
timeout_pid=$!
printf 'runnerPid=%s\n' "$timeout_pid" >> "$runs_dir/timeout-cleanup/lifecycle.manifest"
if ! wait_for_log "$timeout_pid" "$runs_dir/timeout-cleanup/console.log" PROBE_READY_CRASH; then
    printf 'timeout probe never reached ready point\n' >&2
    kill -KILL "$timeout_pid" 2>/dev/null || true
    wait "$timeout_pid" 2>/dev/null || true
    exit 1
fi
sleep 0.25
kill -TERM "$timeout_pid"
set +e
wait "$timeout_pid" 2>/dev/null
timeout_status=$?
set -e
printf 'runnerExit=%s\n' "$timeout_status" >> "$runs_dir/timeout-cleanup/lifecycle.manifest"
if kill -0 "$timeout_pid" 2>/dev/null; then
    printf 'exact timeout runner remained live\n' >&2
    exit 1
fi
mark_state timeout-cleanup runner_absent
printf 'preCleanupSha256=%s\n' "$(sha "$timeout_scratch")" >> "$runs_dir/timeout-cleanup/lifecycle.manifest"
rm "$timeout_scratch"
mark_state timeout-cleanup scratch_deleted

# Demonstrate the host-side mutation caveat explicitly. libkrun read-only makes the device
# guest-read-only; it does not make a same-user backing file immutable against another host process.
live_scratch=$(prepare_attempt live-input-mutation)
live_source="$runs_dir/live-input-mutation/source.ext4"
cp "$build_dir/source.ext4" "$live_source"
chmod 0600 "$live_source"
live_source_before=$(sha "$live_source")
"$runner" "$build_dir/root.ext4" "$live_source" "$build_dir/input.ext4" \
    "$live_scratch" "$probe" crash "$(value sourcePayloadSha256)" \
    "$(value inputPayloadSha256)" > "$runs_dir/live-input-mutation/console.log" 2>&1 &
live_pid=$!
if ! wait_for_log "$live_pid" "$runs_dir/live-input-mutation/console.log" PROBE_READY_CRASH; then
    printf 'live-mutation probe never reached ready point\n' >&2
    kill -KILL "$live_pid" 2>/dev/null || true
    wait "$live_pid" 2>/dev/null || true
    exit 1
fi
printf Y | dd of="$live_source" bs=1 seek=69632 conv=notrunc status=none
live_source_after=$(sha "$live_source")
if [ "$live_source_before" = "$live_source_after" ]; then
    printf 'live source mutation did not alter raw digest\n' >&2
    exit 1
fi
kill -KILL "$live_pid"
set +e
wait "$live_pid" 2>/dev/null
live_status=$?
set -e
rm "$live_scratch"
{
    printf 'runnerExit=%s\n' "$live_status"
    printf 'beforeSha256=%s\n' "$live_source_before"
    printf 'afterSha256=%s\n' "$live_source_after"
    printf 'postStopDigestMismatch=true\n'
} >> "$runs_dir/live-input-mutation/lifecycle.manifest"

# Attempt identity cannot be issued twice, and fresh later attempts already proved marker absence.
set +e
prepare_attempt valid > "$runs_dir/reuse-negative.log" 2>&1
reuse_status=$?
set -e
if [ "$reuse_status" -eq 0 ]; then
    printf 'reuse prevention failed\n' >&2
    exit 1
fi

# App Sandbox allows only the exact declared raw disk paths in this spike. The production design
# must replace temporary absolute exceptions with component-owned container storage.
cp "$build_dir/scratch-template.ext4" "$build_dir/sandbox-scratch.ext4"
chmod 0600 "$build_dir/sandbox-scratch.ext4"
allowed_runner="$build_dir/CapsuleStorageSpike.app/Contents/MacOS/capsule-storage-runner"
denied_runner="$build_dir/CapsuleStorageSpikeDenied.app/Contents/MacOS/capsule-storage-runner"
"$allowed_runner" "$build_dir/root.ext4" "$build_dir/source.ext4" "$build_dir/input.ext4" \
    "$build_dir/sandbox-scratch.ext4" "$probe" valid "$(value sourcePayloadSha256)" \
    "$(value inputPayloadSha256)" > "$runs_dir/app-sandbox-allowed.log" 2>&1
set +e
"$denied_runner" "$build_dir/root.ext4" "$build_dir/source.ext4" "$build_dir/input.ext4" \
    "$build_dir/sandbox-scratch.ext4" "$probe" valid "$(value sourcePayloadSha256)" \
    "$(value inputPayloadSha256)" > "$runs_dir/app-sandbox-denied.log" 2>&1
denied_status=$?
set -e
if [ "$denied_status" -eq 0 ]; then
    printf 'sandbox no-authority control unexpectedly ran\n' >&2
    exit 1
fi
codesign -d --entitlements - "$build_dir/CapsuleStorageSpike.app" \
    > "$runs_dir/app-sandbox-entitlements.plist" 2>&1

{
    printf 'result=pass\n'
    printf 'validExtractionSha256=%s\n' "$(sha "$runs_dir/valid/extracted.json")"
    printf 'truncationRejectExit=%s\n' "$truncation_status"
    printf 'hostileRejectExit=%s\n' "$hostile_status"
    printf 'specialRejectExit=%s\n' "$special_status"
    printf 'sparseRejectExit=%s\n' "$quota_status"
    printf 'mutationRejectExit=%s\n' "$mutation_status"
    printf 'reuseRejectExit=%s\n' "$reuse_status"
    printf 'timeoutRunnerExit=%s\n' "$timeout_status"
    printf 'liveMutationDetected=true\n'
    printf 'sandboxDeniedExit=%s\n' "$denied_status"
    printf 'sourceDiskFinalSha256=%s\n' "$(sha "$build_dir/source.ext4")"
    printf 'inputDiskFinalSha256=%s\n' "$(sha "$build_dir/input.ext4")"
} > "$runs_dir/SUMMARY.txt"
cat "$runs_dir/SUMMARY.txt"
