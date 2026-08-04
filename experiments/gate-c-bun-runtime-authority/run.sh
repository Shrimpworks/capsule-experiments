#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
image='oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04'
expected_image_id='sha256:bc9f668f713165b415f680bdffb9077f3355886fc1aa8a087f2fe258da0c7a58'
expected_bun_sha256='37141662ebed915a2ab89313156e455e2a1374395f5f6760d06407f49406f086'
run_root=${CAPSULE_P0_RUN_ROOT:-"$experiment_dir/.runs"}
run_id=$(date -u '+%Y%m%dT%H%M%SZ')-$$
output_dir="$run_root/$run_id"

mkdir -p "$output_dir"

image_id=$(docker image inspect "$image" --format '{{.Id}}')
if [ "$image_id" != "$expected_image_id" ]; then
  printf 'unexpected image ID: got %s, want %s\n' "$image_id" "$expected_image_id" >&2
  exit 2
fi

common_args="--rm --pull=never --network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 256m --cpus 1 --user 65534:65534 --mount type=bind,src=$experiment_dir/probes,dst=/probe,readonly --tmpfs /work:rw,nosuid,nodev,noexec,size=16m --entrypoint /bin/sh"

run_case() {
  case_name=$1
  shift
  stdout="$output_dir/$case_name.stdout"
  stderr="$output_dir/$case_name.stderr"
  status_file="$output_dir/$case_name.status"
  set +e
  # shellcheck disable=SC2086
  docker run $common_args "$image" -c 'cp -R /probe/. /work/; mkdir -p /work/node_modules; cp -R /work/local-packages/. /work/node_modules/; cp /work/dot-env /work/.env; cd /work; exec 3</work/fd-sentinel.txt; exec "$@"' sh "$@" >"$stdout" 2>"$stderr"
  status=$?
  set -e
  printf '%s\n' "$status" >"$status_file"
}

docker run --rm --pull=never --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user 65534:65534 --entrypoint /bin/sh "$image" \
  -c '/usr/local/bin/bun --revision; sha256sum /usr/local/bin/bun; id; cat /proc/version' \
  >"$output_dir/environment.txt"

observed_bun_sha256=$(awk '/\/usr\/local\/bin\/bun$/ { print $1 }' "$output_dir/environment.txt")
if [ "$observed_bun_sha256" != "$expected_bun_sha256" ]; then
  printf 'unexpected Bun digest: got %s, want %s\n' "$observed_bun_sha256" "$expected_bun_sha256" >&2
  exit 2
fi

run_case nominal /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin CAPSULE_FIXED_ENV=1 \
  /usr/local/bin/bun --no-addons --no-macros --no-env-file --no-install --config=/dev/null \
  /work/capability-probe.ts

run_case execve /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin CAPSULE_FIXED_ENV=1 \
  /usr/local/bin/bun --no-addons --no-macros --no-env-file --no-install --config=/dev/null \
  /work/execve-probe.ts

run_case config-restored /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin CAPSULE_P0_INHERITED=launcher-env \
  /usr/local/bin/bun /work/config-probe.ts

run_case config-denied /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin \
  /usr/local/bin/bun --no-env-file --config=/dev/null /work/config-probe.ts

run_case macro-restored /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin \
  /usr/local/bin/bun --no-env-file --no-install --config=/dev/null /work/macro-entry.ts

run_case macro-denied /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin \
  /usr/local/bin/bun --no-macros --no-env-file --no-install --config=/dev/null /work/macro-entry.ts

run_case addon-restored /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin \
  /usr/local/bin/bun --no-env-file --no-install --config=/dev/null /work/addon-probe.ts

run_case addon-denied /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin \
  /usr/local/bin/bun --no-addons --no-env-file --no-install --config=/dev/null /work/addon-probe.ts

run_case package-denied /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin \
  /usr/local/bin/bun --no-env-file --no-install --config=/dev/null /work/missing-package-probe.ts

run_case package-restored /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin \
  /usr/local/bin/bun --install=fallback --no-env-file --config=/dev/null /work/missing-package-probe.ts

run_case inspector-cli /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin \
  /usr/local/bin/bun --inspect=127.0.0.1:39231 --no-env-file --no-install --config=/dev/null \
  /work/inspector-probe.ts

run_case inspector-env /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin BUN_INSPECT=127.0.0.1:39232 \
  /usr/local/bin/bun --no-env-file --no-install --config=/dev/null /work/inspector-probe.ts

{
  printf 'image=%s\n' "$image"
  printf 'imageId=%s\n' "$image_id"
  printf 'bunSha256=%s\n' "$observed_bun_sha256"
  for status_file in "$output_dir"/*.status; do
    case_name=$(basename "$status_file" .status)
    printf '%s=%s\n' "$case_name" "$(cat "$status_file")"
  done
} >"$output_dir/summary.txt"

printf 'Gate C P0-0 raw evidence: %s\n' "$output_dir"
cat "$output_dir/summary.txt"
