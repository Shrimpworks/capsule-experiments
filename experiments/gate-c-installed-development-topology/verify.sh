#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
app="$experiment_dir/.build/CapsuleP04AInstalledTopology.app"
run_dir="$experiment_dir/.runs"
missing="$run_dir/missing.app"
mixed="$run_dir/mixed.app"
unexpected="$run_dir/unexpected.app"

test -d "$app"
mkdir -p "$run_dir"
python3 "$experiment_dir/topology_manifest.py" verify "$app" --verify-signature
python3 "$experiment_dir/topology_manifest.py" evidence-tsv "$app" \
  > "$run_dir/installed-components.generated.tsv"
diff -u "$experiment_dir/evidence/2026-08-02/installed-components.tsv" \
  "$run_dir/installed-components.generated.tsv"
manifest_sha=$(shasum -a 256 \
  "$app/Contents/Resources/Manifests/topology-manifest.json" | awk '{print $1}')
grep -qx "installedManifestSha256=$manifest_sha" \
  "$experiment_dir/evidence/2026-08-02/environment.txt"

copy_case() {
  destination=$1
  if [ -e "$destination" ]; then
    rm -rf -- "$destination"
  fi
  ditto "$app" "$destination"
}

expect_refusal() {
  name=$1
  case_app=$2
  log="$run_dir/$name.log"
  status=0
  python3 "$experiment_dir/topology_manifest.py" verify "$case_app" \
    --verify-signature >"$log" 2>&1 || status=$?
  if [ "$status" -ne 78 ]; then
    printf 'expected refusal status 78 for %s, got %s\n' "$name" "$status" >&2
    sed -n '1,80p' "$log" >&2
    exit 1
  fi
  grep -q '^REFUSED ' "$log"
  printf 'negative=%s result=refused\n' "$name"
}

copy_case "$missing"
rm -f -- "$missing/Contents/MacOS/capsule-guest-launcher-placeholder"
expect_refusal missing-component "$missing"

copy_case "$mixed"
cp "$experiment_dir/.build/capsule-topology-client-stale" \
  "$mixed/Contents/MacOS/capsule-topology-client"
expect_refusal mixed-component "$mixed"

copy_case "$unexpected"
cp "$experiment_dir/fixtures/root.placeholder" \
  "$unexpected/Contents/Resources/Runtime/undeclared-root"
expect_refusal unexpected-component "$unexpected"

runner="$app/Contents/Helpers/CapsuleTopologyRunner.app/Contents/MacOS/capsule-topology-runner"
control_runner="$experiment_dir/.build/descriptor-runner-control"
root="$app/Contents/Resources/Runtime/root.placeholder"
identity="$app/Contents/MacOS/capsule-process-identity"
sandbox_status=0
"$experiment_dir/.build/descriptor-launcher" "$runner" "$root" exact \
  >"$run_dir/app-sandbox-descriptor.log" 2>&1 || sandbox_status=$?
if [ "$sandbox_status" -eq 0 ]; then
  grep -q 'descriptorSet=exact' "$run_dir/app-sandbox-descriptor.log"
  grep -q 'descriptorProbe=pass guestStarted=false' "$run_dir/app-sandbox-descriptor.log"
  printf 'app-sandbox-descriptor=pass\n'
else
  printf 'app-sandbox-descriptor=environmental-gap status=%s\n' "$sandbox_status" |
    tee "$run_dir/app-sandbox-gap.txt"
fi

positive_log="$run_dir/descriptor-control-positive.log"
"$experiment_dir/.build/descriptor-launcher" "$control_runner" "$root" exact \
  >"$positive_log" 2>&1 &
launcher_pid=$!
runner_pid=''
count=0
while [ -z "$runner_pid" ] && [ "$count" -lt 100 ]; do
  count=$((count + 1))
  runner_pid=$(sed -n 's/^runnerPid=\([0-9][0-9]*\).*/\1/p' "$positive_log" | head -1)
  [ -n "$runner_pid" ] || sleep 0.02
done
test -n "$runner_pid"
"$identity" "$runner_pid" > "$run_dir/descriptor-runner.identity"
wait "$launcher_pid"
grep -q 'descriptorSet=exact' "$positive_log"
grep -q 'descriptorProbe=pass guestStarted=false' "$positive_log"
grep -q '^codeValidity=valid$' "$run_dir/descriptor-runner.identity"
printf 'descriptor-positive=pass pid=%s\n' "$runner_pid"

descriptor_status=0
"$experiment_dir/.build/descriptor-launcher" "$control_runner" "$root" extra \
  >"$run_dir/descriptor-extra-negative.log" 2>&1 || descriptor_status=$?
test "$descriptor_status" -eq 78
grep -q 'descriptor-refused unexpectedFd=8' "$run_dir/descriptor-extra-negative.log"
printf 'descriptor-extra=refused\n'

python3 -m unittest discover -s "$experiment_dir/tests" -p 'test_*.py'
printf 'verification=pass backendAdmitted=false\n'
