#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
probe=${1:-"$experiment_dir/.build/debug/identity-recovery-probe"}
kernel=${2:-"$HOME/Library/Application Support/com.apple.container/kernels/vmlinux-6.18.15-186"}
helper_path='/System/Library/Frameworks/Virtualization.framework/Versions/A/XPCServices/com.apple.Virtualization.VirtualMachine.xpc/Contents/MacOS/com.apple.Virtualization.VirtualMachine'

test -x "$probe"
test -r "$kernel"
codesign --verify --strict "$probe"

run_root=$(mktemp -d /private/tmp/capsule-gate-c-identity-run.XXXXXX)
state_root="$run_root/state"
"$probe" mark-run-root "$run_root"
"$probe" init-root "$state_root"

is_owned_controller_pid() {
  pid=$1
  command=$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)
  case "$command" in
    "$probe hold "*) return 0 ;;
    *) return 1 ;;
  esac
}

cleanup_on_exit() {
  for pid in ${owned_pids:-}; do
    if kill -0 "$pid" 2>/dev/null && is_owned_controller_pid "$pid"; then
      kill -KILL "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup_on_exit EXIT INT TERM

helper_pids() {
  /bin/ps -axo pid=,command= | awk -v helper="$helper_path" '$0 ~ helper { print $1 }' | sort -n
}

snapshot_helpers() {
  helper_pids > "$1"
}

assert_pid_alive() {
  kill -0 "$1" 2>/dev/null || {
    echo "expected PID $1 to remain alive" >&2
    exit 1
  }
}

wait_ready() {
  ready=$1
  pid=$2
  count=0
  while [ ! -s "$ready" ]; do
    assert_pid_alive "$pid"
    count=$((count + 1))
    if [ "$count" -ge 600 ]; then
      echo "controller $pid did not become ready" >&2
      exit 1
    fi
    sleep 0.2
  done
}

launch_controller() {
  label=$1
  phase=$2
  expected_new_helpers=$3
  before="$run_root/helpers-before-$label"
  after="$run_root/helpers-after-$label"
  ready="$run_root/ready-$label.json"
  log="$run_root/controller-$label.log"
  snapshot_helpers "$before"
  "$probe" hold "$kernel" "$state_root" "$ready" "$phase" "$label" >"$log" 2>&1 &
  launched_pid=$!
  owned_pids="${owned_pids:-} $launched_pid"
  wait_ready "$ready" "$launched_pid"
  snapshot_helpers "$after"
  helper_delta=$(comm -13 "$before" "$after" || true)
  delta_count=$(printf '%s\n' "$helper_delta" | awk 'NF { count++ } END { print count+0 }')
  test "$delta_count" -eq "$expected_new_helpers" || {
    echo "expected $expected_new_helpers new helper(s) for $label, observed $delta_count: $helper_delta" >&2
    exit 1
  }
  launched_helper=$helper_delta
  printf 'launch label=%s phase=%s controller=%s helper=%s\n' \
    "$label" "$phase" "$launched_pid" "${launched_helper:-none}"
}

kill_controller() {
  pid=$1
  helper=${2:-}
  if ! is_owned_controller_pid "$pid"; then
    echo "refusing to signal PID $pid: it is not a live experiment controller" >&2
    exit 1
  fi
  kill -KILL "$pid"
  wait "$pid" 2>/dev/null || true
  if [ -n "$helper" ]; then
    count=0
    while kill -0 "$helper" 2>/dev/null; do
      count=$((count + 1))
      if [ "$count" -ge 100 ]; then
        echo "helper $helper survived controller $pid for 20 seconds" >&2
        exit 1
      fi
      sleep 0.2
    done
  fi
  printf 'controllerKilled=%s helperGone=%s\n' "$pid" "${helper:-not-created}"
}

baseline="$run_root/helpers-baseline"
snapshot_helpers "$baseline"
printf 'baselineHelpers=%s\n' "$(tr '\n' ',' < "$baseline")"

# Three concurrent VMs establish an experiment-owned unrelated-helper control.
launch_controller control started 1
control_pid=$launched_pid
control_helper=$launched_helper
launch_controller multi-a started 1
a_pid=$launched_pid
a_helper=$launched_helper
launch_controller multi-b started 1
b_pid=$launched_pid
b_helper=$launched_helper

kill_controller "$a_pid" "$a_helper"
assert_pid_alive "$control_pid"
assert_pid_alive "$control_helper"
assert_pid_alive "$b_pid"
assert_pid_alive "$b_helper"
"$probe" reconcile "$kernel" "$state_root"

kill_controller "$b_pid" "$b_helper"
assert_pid_alive "$control_pid"
assert_pid_alive "$control_helper"
kill_controller "$control_pid" "$control_helper"

# Crash at the remaining lifecycle boundaries. A VM exists only from created through exited.
for case_spec in object:0 created:1 exited:1 stopped:0; do
  phase=${case_spec%%:*}
  expected=${case_spec##*:}
  label="boundary-$phase"
  launch_controller "$label" "$phase" "$expected"
  boundary_pid=$launched_pid
  boundary_helper=$launched_helper
  kill_controller "$boundary_pid" "$boundary_helper"
done

"$probe" reconcile "$kernel" "$state_root"
final_helpers="$run_root/helpers-final"
snapshot_helpers "$final_helpers"
printf 'preexistingHelpersNoLongerPresent=%s\n' \
  "$(comm -23 "$baseline" "$final_helpers" | tr '\n' ',' || true)"

trap - EXIT INT TERM
owned_pids=
"$probe" cleanup "$state_root"
"$probe" cleanup-run-root "$run_root"
printf 'liveIdentityRecoverySuite=PASS\n'
