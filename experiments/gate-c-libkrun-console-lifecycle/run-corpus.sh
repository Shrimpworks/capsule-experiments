#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
run_root=${CAPSULE_RUN_ROOT:-$experiment_dir/.runs}
mkdir -p "$run_root"
run_dir=$(mktemp -d "$run_root/corpus.XXXXXX")
controller="$experiment_dir/.build/controller"
identity="$experiment_dir/.build/process-identity"
runner="$experiment_dir/.build/capsule-krun-console-runner"
disk="$experiment_dir/.build/alpine-3.22-root.ext4"
launcher=/usr/local/libexec/capsule-guest-launcher

for required in "$controller" "$identity" "$runner" "$disk"; do
    if [ ! -e "$required" ]; then
        printf 'missing build input: %s\n' "$required" >&2
        exit 2
    fi
done

"$experiment_dir/collect-environment.sh" >"$run_dir/environment.txt"
cp "$experiment_dir/.build/runtime-manifest.txt" "$run_dir/runtime-manifest.txt"

run_case() {
    case_name=$1
    shift
    case_dir="$run_dir/$case_name"
    mkdir -p "$case_dir"
    "$controller" --record "$case_dir/attempt.json" \
        --summary "$case_dir/summary.json" --identity "$identity" \
        --runner "$runner" --disk "$disk" --attempt "$case_name" "$@" \
        >"$case_dir/controller.log" 2>&1
    test -f "$case_dir/summary.json"
    printf 'case=%s outcome=%s termination=%s result=PASS\n' \
        "$case_name" \
        "$(jq -r .outcome "$case_dir/summary.json")" \
        "$(jq -r .termination "$case_dir/summary.json")"
}

run_case quiet-completion --profile vcpu1-mem128 --wall 2s --grace 250ms \
    --capture-limit 4096 --capture-mode drain -- \
    "$launcher" /bin/sh -c 'printf "quiet-complete\n"'

for memory in 32 48; do
    run_case "profile-probe-vcpu1-mem$memory" \
        --profile "probe-vcpu1-mem$memory" \
        --wall 2s --grace 200ms --capture-limit 4096 --capture-mode drain -- \
        "$launcher" /bin/cat /sys/devices/system/cpu/online /proc/meminfo
    grep -q 'Kernel panic - not syncing: System is deadlocked on memory' \
        "$run_dir/profile-probe-vcpu1-mem$memory/profile-probe-vcpu1-mem$memory.stderr.capture"
    printf 'profile=probe-vcpu1-mem%s expected=kernel-memory-panic supported=false\n' \
        "$memory"
done

run_case profile-probe-vcpu1-mem96 --profile probe-vcpu1-mem96 \
    --wall 2s --grace 200ms --capture-limit 4096 --capture-mode drain -- \
    "$launcher" /bin/sh -c \
    'cat /sys/devices/system/cpu/online /proc/meminfo; sleep 1'
test "$(jq -r .exitCode \
    "$run_dir/profile-probe-vcpu1-mem96/summary.json")" -eq 0
test "$(jq -r .stdout.observedBytes \
    "$run_dir/profile-probe-vcpu1-mem96/summary.json")" -eq 0
printf 'profile=probe-vcpu1-mem96 expected=silent-zero-exit-without-workload-evidence supported=false\n'

for memory in 64 128 256; do
    run_case "profile-vcpu1-mem$memory" --profile "vcpu1-mem$memory" \
        --wall 2s --grace 200ms --capture-limit 4096 --capture-mode drain -- \
        "$launcher" /bin/sh -c \
        'cat /sys/devices/system/cpu/online /proc/meminfo; sleep 1'
    grep -q '^MemTotal:' \
        "$run_dir/profile-vcpu1-mem$memory/profile-vcpu1-mem$memory.stdout.capture"
    ! grep -q 'Kernel panic' \
        "$run_dir/profile-vcpu1-mem$memory/profile-vcpu1-mem$memory.stderr.capture"
done

run_case profile-vcpu2-mem256 --profile vcpu2-mem256 --wall 2s --grace 200ms \
    --capture-limit 4096 --capture-mode drain -- \
    "$launcher" /bin/sh -c \
    'cat /sys/devices/system/cpu/online /proc/meminfo; sleep 1'
grep -q '^0-1$' \
    "$run_dir/profile-vcpu2-mem256/profile-vcpu2-mem256.stdout.capture"

invalid_dir="$run_dir/unsupported-profile"
mkdir -p "$invalid_dir"
set +e
"$runner" --profile vcpu0-mem64 "$disk" /bin/true \
    >"$invalid_dir/stdout" 2>"$invalid_dir/stderr"
invalid_status=$?
set -e
test "$invalid_status" -eq 78
grep -q '^unsupported exact profile: vcpu0-mem64$' "$invalid_dir/stderr"
printf 'case=unsupported-profile exit=%s result=PASS\n' "$invalid_status"

run_case sustained-output-flood --profile vcpu1-mem64 --wall 1s --grace 200ms \
    --runner-termination ignore --capture-limit 4096 --capture-mode drain -- \
    "$launcher" /bin/sh -c \
    'i=0; while :; do printf "stdout-%08d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n" "$i"; printf "stderr-%08d-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy\n" "$i" >&2; i=$((i+1)); done'

run_case pipe-backpressure --profile vcpu1-mem64 --wall 700ms --grace 200ms \
    --runner-termination ignore --capture-limit 4096 --capture-mode stall \
    --reader-stall 1500ms -- \
    "$launcher" /bin/sh -c 'while :; do printf "backpressure-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n"; done'

run_case reader-stall-resume --profile vcpu1-mem64 --wall 3s --grace 250ms \
    --capture-limit 4096 --capture-mode stall --reader-stall 350ms -- \
    "$launcher" /bin/sh -c \
    'i=0; while [ "$i" -lt 20000 ]; do printf "stall-%08d-xxxxxxxxxxxxxxxx\n" "$i"; i=$((i+1)); done'

run_case console-close --profile vcpu1-mem64 --wall 2s --grace 200ms \
    --capture-limit 4096 --capture-mode close --reader-stall 350ms -- \
    "$launcher" /bin/sh -c 'while :; do printf "console-close\n"; done'

run_case wall-timeout-forced --profile vcpu1-mem64 --wall 650ms --grace 200ms \
    --runner-termination ignore --capture-limit 4096 --capture-mode drain -- \
    "$launcher" /bin/sh -c 'while :; do :; done'

run_case cancellation-graceful --profile vcpu1-mem64 --wall 5s \
    --cancel-after 650ms --grace 3s --runner-termination graceful \
    --capture-limit 4096 --capture-mode drain -- \
    "$launcher" /bin/sh -c 'while :; do sleep 1; done'

run_case wedged-analogue --profile vcpu1-mem64 --wall 700ms --grace 200ms \
    --runner-termination ignore --capture-limit 4096 --capture-mode stall \
    --reader-stall 1500ms -- \
    "$launcher" /bin/sh -c \
    'while :; do printf "wedged-output-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n"; done'

concurrent_dir="$run_dir/concurrent-attempts"
mkdir -p "$concurrent_dir/a" "$concurrent_dir/b"
"$controller" --record "$concurrent_dir/a/attempt.json" \
    --summary "$concurrent_dir/a/summary.json" --identity "$identity" \
    --runner "$runner" --disk "$disk" --attempt concurrent-a \
    --profile vcpu1-mem64 --wall 4s --cancel-after 600ms --grace 250ms \
    --runner-termination ignore --capture-limit 4096 --capture-mode drain -- \
    "$launcher" /bin/sh -c 'while :; do :; done' \
    >"$concurrent_dir/a/controller.log" 2>&1 &
controller_a=$!
"$controller" --record "$concurrent_dir/b/attempt.json" \
    --summary "$concurrent_dir/b/summary.json" --identity "$identity" \
    --runner "$runner" --disk "$disk" --attempt concurrent-b \
    --profile vcpu1-mem64 --wall 4s --grace 250ms \
    --capture-limit 4096 --capture-mode drain -- \
    "$launcher" /bin/sh -c 'sleep 2; printf "b-complete\n"' \
    >"$concurrent_dir/b/controller.log" 2>&1 &
controller_b=$!
wait "$controller_a"
wait "$controller_b"
test "$(jq -r .outcome "$concurrent_dir/a/summary.json")" = cancelled
test "$(jq -r .outcome "$concurrent_dir/b/summary.json")" = exited
printf 'case=concurrent-attempts a=cancelled b=exited result=PASS\n'

"$experiment_dir/test-controller-crashes.sh" "$run_dir" \
    >"$run_dir/controller-crashes.log"

test "$(jq -r .stdout.truncated "$run_dir/sustained-output-flood/summary.json")" = true
grep -q '\[CAPSULE_TRUNCATED ' \
    "$run_dir/sustained-output-flood/sustained-output-flood.stdout.capture"
test "$(jq -r .termination "$run_dir/wall-timeout-forced/summary.json")" = forced-kill
test "$(jq -r .identityVerifiedBeforeKill "$run_dir/wall-timeout-forced/summary.json")" = true
test "$(jq -r .termination "$run_dir/wedged-analogue/summary.json")" = forced-kill
test "$(jq -r .outcome "$run_dir/console-close/summary.json")" = console-error

find "$run_dir" -name '*.capture' -type f -print | while IFS= read -r capture; do
    size=$(stat -f %z "$capture")
    if [ "$size" -gt 4352 ]; then
        printf 'capture exceeded fixed disk bound: %s (%s bytes)\n' "$capture" "$size" >&2
        exit 1
    fi
done

find "$run_dir" -name summary.json -type f -print | sort | \
    xargs jq -s '{
        cases: map({attempt, outcome, termination, runnerPid, profile,
            wallLimitMillis, cancelAfterMillis, graceMillis, elapsedMillis,
            controlReadyMillis, deadlineActionMillis, deadlineOvershootMillis,
            teardownMillis, identityVerifiedAtStart,
            identityVerifiedBeforeTerm, identityVerifiedBeforeKill,
            exitCode, exitSignal, runnerUserCpuMillis, runnerSystemCpuMillis,
            runnerMaxRssBytes, controllerMaxRssBytes, stdout, stderr}),
        maxima: {
            runnerMaxRssBytes: (map(.runnerMaxRssBytes) | max),
            controllerMaxRssBytes: (map(.controllerMaxRssBytes) | max),
            retainedBytesPerStream: (map([.stdout.retainedBytes, .stderr.retainedBytes] | max) | max),
            observedBytesPerStream: (map([.stdout.observedBytes, .stderr.observedBytes] | max) | max),
            teardownMillis: (map(.teardownMillis) | max)
        }
    }' >"$run_dir/corpus-summary.json"

printf 'corpus=PASS\n'
printf 'evidenceDir=%s\n' "$(basename "$run_dir")"
