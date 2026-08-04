#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$experiment_dir/.runs"
run_dir=$(mktemp -d "$experiment_dir/.runs/controller-crash.XXXXXX")
controller="$experiment_dir/.build/controller"
identity="$experiment_dir/.build/process-identity"
runner="$experiment_dir/.build/capsule-krun-runner"
disk="$experiment_dir/.build/alpine-3.22-root.ext4"
launcher=/usr/local/libexec/capsule-guest-launcher

controller_pid=
runner_pid=

cleanup() {
    if [ -n "$controller_pid" ]; then
        kill -KILL "$controller_pid" >/dev/null 2>&1 || true
    fi
    if [ -n "$runner_pid" ]; then
        kill -KILL "$runner_pid" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT INT TERM

wait_for_pattern() {
    file=$1
    pattern=$2
    count=0
    while ! grep -q "$pattern" "$file" 2>/dev/null; do
        count=$((count + 1))
        if [ "$count" -ge 100 ]; then
            printf 'timeout waiting for %s in %s\n' "$pattern" "$file" >&2
            return 1
        fi
        sleep 0.05
    done
}

run_case() {
    phase=$1
    expected_record=$2
    expected_runner=$3
    record="$run_dir/$phase.json"
    log="$run_dir/$phase.log"
    controller_pid=
    runner_pid=

    CAPSULE_CONTROLLER_PAUSE="$phase" "$controller" \
        "$record" "$identity" "$runner" "$disk" \
        "$launcher" /bin/sh -c \
        'echo GUEST_STARTED; while true; do sleep 1; done' \
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
        "$identity" "$runner_pid" >"$run_dir/$phase.identity"
        grep -q '^codeRequirement=valid$' "$run_dir/$phase.identity"
        kill -TERM "$runner_pid"
        sleep 0.25
        ! kill -0 "$runner_pid" 2>/dev/null
    else
        ! kill -0 "$runner_pid" 2>/dev/null
        ! grep -q '^GUEST_STARTED$' "$log"
    fi

    printf 'phase=%s record=%s runnerAfterCrash=%s result=PASS\n' \
        "$phase" "$expected_record" "$expected_runner"
    runner_pid=
}

run_case before-record absent gone
run_case after-record present gone
run_case after-go present alive

printf 'evidenceDir=%s\n' "$run_dir"
