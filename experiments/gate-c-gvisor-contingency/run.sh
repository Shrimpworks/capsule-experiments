#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME="${CAPSULE_RUNTIME:-runsc}"
BASE_IMAGE='oven/bun@sha256:5148f6742ac31fac28e6eab391ab1f11f6dfc0c8512c7a3679b374ec470f5982'
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
IMAGE="capsule-gate-c-gvisor-spike:${RUN_ID}"
LABEL="io.capsule.spike.attempt=${RUN_ID}"
CREATED_IDS=()
BUILT_IMAGE=false
CONTROLLER_PID=''
STATE_FILE=''

cleanup() {
  local id
  if [[ -n "$CONTROLLER_PID" ]]; then
    kill -9 "$CONTROLLER_PID" >/dev/null 2>&1 || true
    wait "$CONTROLLER_PID" 2>/dev/null || true
  fi
  if [[ -n "$STATE_FILE" && -s "$STATE_FILE" ]]; then
    id="$(tr -d '\n' <"$STATE_FILE")"
    if [[ "$id" =~ ^[0-9a-f]{64}$ ]]; then
      docker rm -f "$id" >/dev/null 2>&1 || true
    fi
  fi
  for id in "${CREATED_IDS[@]:-}"; do
    if [[ -n "$id" ]]; then
      docker rm -f "$id" >/dev/null 2>&1 || true
    fi
  done
  if [[ "$BUILT_IMAGE" == true ]]; then
    docker image rm "$IMAGE" >/dev/null 2>&1 || true
  fi
  if [[ -n "$STATE_FILE" ]]; then
    rm -f "$STATE_FILE"
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  printf 'BLOCKED: docker client is absent\n' >&2
  exit 2
fi

RUNTIMES="$(docker info --format '{{json .Runtimes}}')"
RUNTIME_NAMES="$(docker info --format '{{range $name, $_ := .Runtimes}}{{$name}} {{end}}')"
if ! grep -q "\"${RUNTIME}\":" <<<"$RUNTIMES"; then
  printf 'BLOCKED: requested runtime %q is not registered; available runtimes: %s\n' \
    "$RUNTIME" "$RUNTIME_NAMES" >&2
  exit 2
fi

if ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  printf 'BLOCKED: pinned fixture base is not cached: %s\n' "$BASE_IMAGE" >&2
  printf 'This harness intentionally does not pull implicitly.\n' >&2
  exit 2
fi

docker build --pull=false --tag "$IMAGE" "$SCRIPT_DIR" >/dev/null
BUILT_IMAGE=true

COMMON=(
  --runtime "$RUNTIME"
  --label "$LABEL"
  --network none
  --read-only
  --user 65532:65532
  --cap-drop ALL
  --security-opt no-new-privileges=true
  --memory 128m
  --memory-swap 128m
  --pids-limit 32
  --cpus 0.5
  --tmpfs '/tmp:rw,nosuid,nodev,noexec,size=8388608,mode=0700,uid=65532,gid=65532'
  --tmpfs '/output:rw,nosuid,nodev,noexec,size=1048576,mode=0700,uid=65532,gid=65532'
)

run_attached() {
  local mode="$1"
  local name="capsule-${RUN_ID}-${mode}"
  LAST_ID="$(docker create --name "$name" "${COMMON[@]}" "$IMAGE" "$mode")"
  CREATED_IDS+=("$LAST_ID")
  [[ "$(docker inspect --format '{{.HostConfig.Runtime}}' "$LAST_ID")" == "$RUNTIME" ]] || \
    fail "engine did not retain runtime $RUNTIME"
  [[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$LAST_ID")" == 'none' ]] || \
    fail 'engine did not retain network=none'
  [[ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$LAST_ID")" == 'true' ]] || \
    fail 'engine did not retain a read-only root'
  LAST_OUTPUT="$(docker start --attach "$LAST_ID")"
}

printf 'runtime=%s\n' "$RUNTIME"
printf 'runtimeRegistered=true\n'
printf 'image=%s\n' "$BASE_IMAGE"

run_attached baseline
BASELINE="$LAST_OUTPUT"
printf 'baseline=%s\n' "$BASELINE"
grep -q '"uid":65532' <<<"$BASELINE" || fail 'guest did not run as uid 65532'
grep -q '"gid":65532' <<<"$BASELINE" || fail 'guest did not run as gid 65532'
grep -q '"noNewPrivs":"1"' <<<"$BASELINE" || fail 'NoNewPrivs was not 1'
grep -q '"capEff":"0000000000000000"' <<<"$BASELINE" || fail 'effective capabilities were not empty'
grep -q '"capPrm":"0000000000000000"' <<<"$BASELINE" || fail 'permitted capabilities were not empty'
grep -q '"rootWrite":"denied:' <<<"$BASELINE" || fail 'read-only root write unexpectedly succeeded'
grep -q '"memoryMax":"134217728"' <<<"$BASELINE" || fail 'memory.max was not 128 MiB'
grep -q '"pidsMax":"32"' <<<"$BASELINE" || fail 'pids.max was not 32'
grep -q '"cpuMax":"50000 100000"' <<<"$BASELINE" || fail 'cpu.max was not 0.5 CPU'

run_attached network
NETWORK="$LAST_OUTPUT"
printf 'network=%s\n' "$NETWORK"
grep -q '"tcp":"connected"' <<<"$NETWORK" && fail 'external TCP unexpectedly connected'
grep -q '"dns":"resolved"' <<<"$NETWORK" && fail 'external DNS unexpectedly resolved'

PIDS_NAME="capsule-${RUN_ID}-pids"
PIDS_ID="$(docker create --name "$PIDS_NAME" "${COMMON[@]}" --entrypoint /bin/sh "$IMAGE" \
  -c 'while :; do sleep 30 & done')"
CREATED_IDS+=("$PIDS_ID")
set +e
PIDS_OUTPUT="$(docker start --attach "$PIDS_ID" 2>&1)"
PIDS_START_STATUS=$?
set -e
PIDS_STATE="$(docker inspect --format 'exit={{.State.ExitCode}} configured={{.HostConfig.PidsLimit}}' \
  "$PIDS_ID")"
printf 'pids=%s startStatus=%s output=%s\n' "$PIDS_STATE" "$PIDS_START_STATUS" "$PIDS_OUTPUT"
[[ "$PIDS_STATE" == 'exit=2 configured=32' ]] || fail 'PID attack did not exit at pids.max=32'
grep -Eqi "cannot fork|can't fork|fork.*Resource temporarily unavailable" <<<"$PIDS_OUTPUT" || \
  fail 'PID attack did not report external fork denial'

run_attached storage
STORAGE="$LAST_OUTPUT"
printf 'storage=%s\n' "$STORAGE"
grep -q '"result":"denied:ENOSPC"' <<<"$STORAGE" || fail 'output tmpfs did not report ENOSPC'

run_attached cpu
CPU="$LAST_OUTPUT"
printf 'cpu=%s\n' "$CPU"
grep -q '"cpuMax":"50000 100000"' <<<"$CPU" || fail 'CPU probe did not observe exact quota'

MEMORY_NAME="capsule-${RUN_ID}-memory"
MEMORY_ID="$(docker create --name "$MEMORY_NAME" "${COMMON[@]}" "$IMAGE" memory)"
CREATED_IDS+=("$MEMORY_ID")
docker start --attach "$MEMORY_ID" >/dev/null 2>&1 || true
MEMORY_STATE="$(docker inspect --format 'exit={{.State.ExitCode}} oom={{.State.OOMKilled}}' "$MEMORY_ID")"
printf 'memory=%s\n' "$MEMORY_STATE"
[[ "$MEMORY_STATE" == 'exit=137 oom=true' ]] || fail 'memory attack was not classified as cgroup OOM kill'

OUTPUT_NAME="capsule-${RUN_ID}-output"
OUTPUT_ID="$(docker create --name "$OUTPUT_NAME" "${COMMON[@]}" \
  --log-driver local --log-opt max-size=64k --log-opt max-file=1 --log-opt compress=false \
  "$IMAGE" output)"
CREATED_IDS+=("$OUTPUT_ID")
docker start "$OUTPUT_ID" >/dev/null
docker wait "$OUTPUT_ID" >/dev/null
OUTPUT_CONFIG="$(docker inspect --format '{{json .HostConfig.LogConfig}}' "$OUTPUT_ID")"
OUTPUT_BYTES="$(docker logs "$OUTPUT_ID" 2>/dev/null | wc -c | tr -d ' ')"
printf 'outputConfig=%s retainedBytes=%s fixtureBytes=524288\n' "$OUTPUT_CONFIG" "$OUTPUT_BYTES"
(( OUTPUT_BYTES <= 65536 )) || fail 'local log driver retained more than its configured rotation size'

STATE_FILE="$(mktemp -t capsule-gvisor-controller.XXXXXX)"
CONTROLLER_NAME="capsule-${RUN_ID}-controller"
(
  trap - EXIT INT TERM
  id="$(docker run --detach --name "$CONTROLLER_NAME" "${COMMON[@]}" "$IMAGE" stubborn)"
  printf '%s\n' "$id" >"$STATE_FILE"
  while :; do sleep 30; done
) &
CONTROLLER_PID=$!

for _ in {1..100}; do
  [[ -s "$STATE_FILE" ]] && break
  sleep 0.05
done
[[ -s "$STATE_FILE" ]] || fail 'controller did not persist the container ID'
RECOVERY_ID="$(tr -d '\n' <"$STATE_FILE")"
CREATED_IDS+=("$RECOVERY_ID")
KILLED_CONTROLLER_PID="$CONTROLLER_PID"
kill -9 "$CONTROLLER_PID"
wait "$CONTROLLER_PID" 2>/dev/null || true
CONTROLLER_PID=''

ENUMERATED="$(docker ps --filter "label=$LABEL" --filter "id=$RECOVERY_ID" --format '{{.ID}}')"
printf 'controllerCrash=pid:%s durableId:%s enumerated:%s\n' \
  "$KILLED_CONTROLLER_PID" "$RECOVERY_ID" "$ENUMERATED"
[[ "$RECOVERY_ID" == "$ENUMERATED"* ]] || fail 'container was not enumerable by durable ID and label'

docker stop --time 1 "$RECOVERY_ID" >/dev/null
CANCEL_STATE="$(docker inspect --format 'running={{.State.Running}} exit={{.State.ExitCode}}' "$RECOVERY_ID")"
printf 'cancellation=%s\n' "$CANCEL_STATE"
[[ "$CANCEL_STATE" == 'running=false exit=137' ]] || fail 'stubborn process tree was not force-killed'

rm -f "$STATE_FILE"
STATE_FILE=''
printf 'PASS: runtime=%s completed the bounded OCI control harness\n' "$RUNTIME"
