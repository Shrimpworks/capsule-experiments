#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
expected_commit=728df8125077d0db44265f6e997c72b81b65c015
expected_patch_sha256=584ce48548fe969684fe3c55e57fbf56e7dae40af28c241c24c47b138faf1283
patch_file="$experiment_dir/patches/0001-console-correctness.patch"
sanitizer_toolchain=nightly-2026-05-28
host_target=aarch64-apple-darwin

if [ ! -d "$source_dir/.git" ]; then
    printf 'missing retained local libkrun checkout: %s\n' "$source_dir" >&2
    exit 2
fi

actual_commit=$(git -C "$source_dir" rev-parse HEAD)
if [ "$actual_commit" != "$expected_commit" ]; then
    printf 'unexpected libkrun commit: got %s, want %s\n' \
        "$actual_commit" "$expected_commit" >&2
    exit 2
fi

actual_patch_sha256=$(shasum -a 256 "$patch_file" | awk '{print $1}')
if [ "$actual_patch_sha256" != "$expected_patch_sha256" ]; then
    printf 'unexpected console patch digest: got %s, want %s\n' \
        "$actual_patch_sha256" "$expected_patch_sha256" >&2
    exit 2
fi

task_tmp=$(mktemp -d /private/tmp/capsule-console-correctness.XXXXXX)
trap 'rm -rf "$task_tmp"' EXIT HUP INT TERM
source_copy="$task_tmp/libkrun"
mkdir -p "$source_copy"

git -C "$source_dir" archive "$expected_commit" | tar -x -C "$source_copy"
patch -d "$source_copy" -p1 --batch --forward <"$patch_file"

rustfmt --edition 2021 --check \
    "$source_copy/src/devices/src/virtio/console/device.rs" \
    "$source_copy/src/devices/src/virtio/console/port.rs" \
    "$source_copy/src/devices/src/virtio/console/port_io.rs" \
    "$source_copy/src/devices/src/virtio/console/process_tx.rs"

(
    cd "$source_copy"
    CARGO_NET_OFFLINE=true \
        CARGO_TARGET_DIR="$task_tmp/target-tests" \
        cargo test --offline -p krun-devices --lib
)

(
    cd "$source_copy"
    CARGO_NET_OFFLINE=true \
        CARGO_TARGET_DIR="$task_tmp/target-clippy" \
        cargo clippy --offline -p krun-devices --lib --no-deps -- \
        -D warnings -A deprecated
)

(
    cd "$source_copy"
    CARGO_NET_OFFLINE=true \
        CARGO_TARGET_AARCH64_APPLE_DARWIN_RUSTFLAGS=-Zsanitizer=address \
        CARGO_TARGET_DIR="$task_tmp/target-asan" \
        cargo +"$sanitizer_toolchain" test --target "$host_target" \
        --offline -p krun-devices --lib
)

coverage_raw="$task_tmp/coverage.json"
coverage_summary="$task_tmp/coverage-summary.json"
(
    cd "$source_copy"
    CARGO_NET_OFFLINE=true \
        CARGO_TARGET_DIR="$task_tmp/target-coverage" \
        cargo llvm-cov --offline -p krun-devices --lib \
        --json --output-path "$coverage_raw"
)
python3 "$experiment_dir/summarize-coverage.py" "$coverage_raw" "$coverage_summary"

repeat=1
while [ "$repeat" -le 25 ]; do
    (
        cd "$source_copy"
        CARGO_NET_OFFLINE=true \
            CARGO_TARGET_DIR="$task_tmp/target-tests" \
            cargo test --offline -p krun-devices --lib \
            virtio::console::port_io::output_wait_tests::shutdown_interrupts_a_blocked_output_wait \
            -- --exact >/dev/null 2>&1
    )
    repeat=$((repeat + 1))
done

run_mutation() {
    mutation_name=$1
    test_name=$2
    mutation_file="$experiment_dir/patches/mutations/$mutation_name.patch"
    mutation_log="$task_tmp/$mutation_name.log"
    patch -d "$source_copy" -p1 --batch --forward <"$mutation_file"
    if (
        cd "$source_copy"
        CARGO_NET_OFFLINE=true \
            CARGO_TARGET_DIR="$task_tmp/target-tests" \
            cargo test --offline -p krun-devices --lib "$test_name" -- --exact \
            >"$mutation_log" 2>&1
    ); then
        printf 'restoration mutation unexpectedly survived: %s\n' "$mutation_name" >&2
        sed -n '1,160p' "$mutation_log" >&2
        exit 1
    fi
    patch -d "$source_copy" -p1 --batch --reverse <"$mutation_file"
    printf 'mutation=%s result=CAUGHT\n' "$mutation_name"
}

run_mutation restore-malformed-control-acceptance \
    virtio::console::device::tests::control_descriptor_requires_one_exact_readable_object
run_mutation restore-unchecked-port-id \
    virtio::console::device::tests::port_index_rejects_unknown_identifiers
run_mutation restore-duplicate-start \
    virtio::console::device::tests::repeated_or_active_port_start_is_not_scheduled_twice
run_mutation restore-stop-blind-output-wait \
    virtio::console::port_io::output_wait_tests::shutdown_interrupts_a_blocked_output_wait

if [ -n "${CAPSULE_CONSOLE_EVIDENCE_DIR:-}" ]; then
    mkdir -p "$CAPSULE_CONSOLE_EVIDENCE_DIR"
    cp "$coverage_summary" "$CAPSULE_CONSOLE_EVIDENCE_DIR/coverage-summary.json"
fi

printf 'commit=%s\n' "$expected_commit"
printf 'patchSha256=%s\n' "$actual_patch_sha256"
printf 'stableRust=%s\n' "$(rustc --version)"
printf 'sanitizerRust=%s\n' "$(rustc +"$sanitizer_toolchain" --version)"
printf 'cargoLlvmCov=%s\n' "$(cargo llvm-cov --version)"
printf 'addressSanitizer=PASS\n'
printf 'clippyWarningsDeniedExceptKnownDeprecatedTryAccess=PASS\n'
printf 'shutdownRepetitions=25\n'
printf 'mutationsCaught=4\n'
sed -n '1,240p' "$coverage_summary"
printf 'result=PASS\n'
