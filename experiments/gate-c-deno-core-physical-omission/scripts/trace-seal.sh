#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 BINARY OUTPUT_STRACE" >&2
  exit 2
fi

experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
fixtures=$experiment/fixtures
binary=$1
output=$2
image=sha256:b8483b5baafc8f085feb4a48ef34993b182de50d86ed03fd13b98b166e7a0ad6

if [ -e "$output" ]; then
  echo "refusing to replace trace: $output" >&2
  exit 1
fi
output_dir=$(dirname "$output")
test -d "$output_dir"
output_dir=$(CDPATH='' cd -- "$output_dir" && pwd)
output_name=$(basename "$output")

docker run --rm --platform linux/arm64 --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 1 \
  -v "$binary:/probe:ro" -v "$fixtures:/fixtures:ro" -v "$output_dir:/evidence" \
  --entrypoint /usr/bin/strace "$image" -f -qq -o "/evidence/$output_name" \
  -e trace=process,network,mmap,mprotect,prlimit64,prctl,seccomp,openat,close,write \
  /probe --source /fixtures/nominal.js --input /fixtures/input.json

active_line=$(rg -n 'CAPSULE_HOST_SEAL_ACTIVE' "$output" | cut -d: -f1)
test -n "$active_line"
post_seal=$(mktemp "${TMPDIR:-/tmp}/capsule-deno-post-seal.XXXXXX")
trap 'rm -f "$post_seal"' EXIT
tail -n "+$active_line" "$output" >"$post_seal"

if rg -q '(^|[[:space:]])(clone|clone3|execve|execveat|socket|socketpair)\(' "$post_seal"; then
  echo "prohibited process or socket syscall observed after seal" >&2
  exit 1
fi
if rg -q '(mmap|mprotect)\([^\n]*PROT_EXEC' "$post_seal"; then
  echo "executable mapping observed after seal" >&2
  exit 1
fi
rg -q 'openat\([^\n]*= -1 EMFILE' "$post_seal"

echo "post-seal trace contains no process, socket, or executable-mapping restoration"
