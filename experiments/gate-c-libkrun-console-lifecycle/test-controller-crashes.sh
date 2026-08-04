#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
run_root=${1:-$experiment_dir/.runs}
mkdir -p "$run_root"
run_dir=$(mktemp -d "$run_root/controller-crash.XXXXXX")
controller="$experiment_dir/.build/controller"
identity="$experiment_dir/.build/process-identity"
runner="$experiment_dir/.build/capsule-krun-console-runner"
disk="$experiment_dir/.build/alpine-3.22-root.ext4"
launcher=/usr/local/libexec/capsule-guest-launcher

controller_pid=
runner_pid=

cleanup() {
    if [ -n "$controller_pid" ]; then
        kill -KILL "$controller_pid" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT INT TERM

wait_for_pattern() {
    file=$1
    pattern=$2
    count=0
    while ! grep -q "$pattern" "$file" 2>/dev/null; do
        count=$((count + 1))
        if [ "$count" -ge 200 ]; then
            printf 'timeout waiting for %s in %s\n' "$pattern" "$file" >&2
            return 1
        fi
        sleep 0.025
    done
}

run_case() {
    phase=$1
    expected_record=$2
    expected_runner=$3
    case_dir="$run_dir/$phase"
    mkdir -p "$case_dir"
    record="$case_dir/attempt.json"
    summary="$case_dir/summary.json"
    log="$case_dir/controller.log"
    controller_pid=
    runner_pid=

    CAPSULE_CONTROLLER_PAUSE="$phase" \
        CAPSULE_CONTROLLER_PAUSE_DELAY=750ms "$controller" \
        --record "$record" --summary "$summary" --identity "$identity" \
        --runner "$runner" --disk "$disk" --attempt "crash-$phase" \
        --profile vcpu1-mem128 --wall 10s --grace 200ms \
        --capture-limit 4096 --capture-mode drain -- \
        "$launcher" /bin/sh -c 'while :; do sleep 1; done' \
        >"$log" 2>&1 &
    controller_pid=$!
    wait_for_pattern "$log" "CONTROLLER_PAUSED phase=$phase"
    runner_pid=$(sed -n 's/.*runnerPid=\([0-9][0-9]*\).*/\1/p' "$log" | head -1)
    case "$runner_pid" in
        ''|*[!0-9]*)
            printf 'invalid runner PID in %s\n' "$log" >&2
            return 1
            ;;
    esac

    kill -KILL "$controller_pid"
    wait "$controller_pid" 2>/dev/null || true
    controller_pid=
    sleep 0.25

    if [ "$expected_record" = present ]; then
        test -f "$record"
    else
        test ! -e "$record"
    fi

    if [ "$expected_runner" = alive ]; then
        kill -0 "$runner_pid"
        "$controller" recover --record "$record" --identity "$identity" \
            --summary "$case_dir/recovery.json" --grace 200ms
        ! kill -0 "$runner_pid" 2>/dev/null
    else
        ! kill -0 "$runner_pid" 2>/dev/null
    fi

    printf 'phase=%s record=%s runnerAfterCrash=%s result=PASS\n' \
        "$phase" "$expected_record" "$expected_runner"
}

run_case before-record absent gone
run_case after-record present gone
run_case after-go present alive

flood_dir="$run_dir/after-go-flood"
mkdir -p "$flood_dir"
CAPSULE_CONTROLLER_PAUSE=after-go \
    CAPSULE_CONTROLLER_PAUSE_DELAY=750ms "$controller" \
    --record "$flood_dir/attempt.json" --summary "$flood_dir/summary.json" \
    --identity "$identity" --runner "$runner" --disk "$disk" \
    --attempt crash-after-go-flood --profile vcpu1-mem128 \
    --wall 10s --grace 200ms --capture-limit 4096 --capture-mode drain -- \
    "$launcher" /bin/sh -c \
    'while :; do printf "crash-flood-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n"; done' \
    >"$flood_dir/controller.log" 2>&1 &
controller_pid=$!
wait_for_pattern "$flood_dir/controller.log" 'CONTROLLER_PAUSED phase=after-go'
runner_pid=$(jq -r .pid "$flood_dir/attempt.json")
kill -KILL "$controller_pid"
wait "$controller_pid" 2>/dev/null || true
controller_pid=
sleep 0.5
"$controller" recover --record "$flood_dir/attempt.json" \
    --identity "$identity" --summary "$flood_dir/recovery.json" --grace 200ms
test "$(jq -r .outcome "$flood_dir/recovery.json")" = recovered-absent
printf 'phase=after-go-flood record=present runnerAfterCrash=gone-via-console-error result=PASS\n'

printf 'evidenceDir=%s\n' "$(basename "$run_dir")"
