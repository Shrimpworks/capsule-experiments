#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
    printf 'usage: %s RAW_DISK MAX_BYTES DESTINATION\n' "$0" >&2
    exit 64
fi
disk=$1
max_bytes=$2
destination=$3
experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
parser_image=${CAPSULE_EXT4_PARSER_IMAGE:-ubuntu@sha256:0e0a0fc6d18feda9db1590da249ac93e8d5abfea8f4c3c0c849ce512b5ef8982}

case "$max_bytes" in
    ''|*[!0-9]*) printf 'invalid max bytes\n' >&2; exit 64 ;;
esac
if [ ! -f "$disk" ]; then
    printf 'not a regular raw disk: %s\n' "$disk" >&2
    exit 65
fi
case "$destination" in
    /*) ;;
    *) printf 'destination must be absolute\n' >&2; exit 64 ;;
esac
if [ -e "$destination" ]; then
    printf 'refusing to overwrite destination: %s\n' "$destination" >&2
    exit 65
fi

# Docker Desktop did not consistently expose newly created nested worktree directories to its
# file-sharing VM. Copy the already bounded raw disk into a unique parser inbox below the build
# directory that is visible to Docker; expose only that inbox to the parser.
parser_stage=$(mktemp -d "$experiment_dir/.build/parser-stage.XXXXXX")
cleanup() {
    rm -rf "$parser_stage"
}
trap cleanup EXIT INT TERM
cp "$disk" "$parser_stage/output.raw"
chmod 0444 "$parser_stage/output.raw"

parser() {
    docker run --rm --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges --pids-limit 32 --memory 128m --cpus 0.5 \
        --mount "type=bind,src=$parser_stage/output.raw,dst=/input/output.raw,readonly" \
        "$parser_image" "$@"
}

# Parse only after the VMM has stopped. This lsof check is diagnostic, not lifecycle authority.
if lsof "$disk" 2>/dev/null | grep -q .; then
    printf 'EGRESS_REJECT reason=disk-still-open\n' >&2
    exit 66
fi
if ! parser /usr/sbin/e2fsck -fn /input/output.raw >"$destination.e2fsck.tmp" 2>&1; then
    mv "$destination.e2fsck.tmp" "$destination.rejected.e2fsck"
    printf 'EGRESS_REJECT reason=filesystem-check\n' >&2
    exit 67
fi
stat_output=$(parser /usr/sbin/debugfs -R 'stat /result/data.json' /input/output.raw 2>&1) || {
    rm -f "$destination.e2fsck.tmp"
    printf 'EGRESS_REJECT reason=missing-declared-slot\n' >&2
    exit 68
}
type=$(printf '%s\n' "$stat_output" | sed -n 's/^Inode: .*Type: \([^ ]*\).*/\1/p')
links=$(printf '%s\n' "$stat_output" | sed -n 's/^Links: \([0-9][0-9]*\).*/\1/p')
size=$(printf '%s\n' "$stat_output" | sed -n 's/^.*Size: \([0-9][0-9]*\).*$/\1/p' | head -1)
blocks=$(printf '%s\n' "$stat_output" | sed -n 's/^Links: .*Blockcount: \([0-9][0-9]*\).*/\1/p')
mode=$(printf '%s\n' "$stat_output" | sed -n 's/^Inode: .*Mode:  *\([0-7][0-7]*\).*/\1/p')
owner=$(printf '%s\n' "$stat_output" | sed -n 's/^User:  *\([0-9][0-9]*\) *Group:  *\([0-9][0-9]*\).*/\1:\2/p')
acl=$(printf '%s\n' "$stat_output" | sed -n 's/^File ACL: \([0-9][0-9]*\).*/\1/p')
if [ "$type" != regular ] || [ "$links" != 1 ]; then
    rm -f "$destination.e2fsck.tmp"
    printf 'EGRESS_REJECT reason=unsafe-type-or-links type=%s links=%s\n' "$type" "$links" >&2
    exit 69
fi
if [ -z "$size" ] || [ "$size" -gt "$max_bytes" ]; then
    rm -f "$destination.e2fsck.tmp"
    printf 'EGRESS_REJECT reason=output-limit size=%s max=%s wouldTruncate=true release=false\n' "${size:-unknown}" "$max_bytes" >&2
    exit 70
fi
if [ -z "$blocks" ] || [ "$((blocks * 512))" -lt "$size" ]; then
    rm -f "$destination.e2fsck.tmp"
    printf 'EGRESS_REJECT reason=sparse-file size=%s allocatedBytes=%s\n' "$size" "$((blocks * 512))" >&2
    exit 72
fi
if [ "$mode" != 0600 ] || [ "$owner" != 65534:65534 ] || [ "$acl" != 0 ] || \
    printf '%s\n' "$stat_output" | grep -q '^Extended attributes:'; then
    rm -f "$destination.e2fsck.tmp"
    printf 'EGRESS_REJECT reason=hostile-metadata mode=%s owner=%s acl=%s\n' "$mode" "$owner" "$acl" >&2
    exit 73
fi

destination_dir=$(dirname -- "$destination")
mkdir -p "$destination_dir"
docker run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --pids-limit 32 --memory 128m --cpus 0.5 \
    --mount "type=bind,src=$parser_stage,dst=/stage" \
    "$parser_image" /usr/sbin/debugfs -R 'dump /result/data.json /stage/extracted.tmp' /stage/output.raw >/dev/null 2>&1
if [ ! -f "$parser_stage/extracted.tmp" ] || [ -L "$parser_stage/extracted.tmp" ] || \
    [ "$(stat -f %HT "$parser_stage/extracted.tmp")" != 'Regular File' ] || \
    [ "$(stat -f %z "$parser_stage/extracted.tmp")" -ne "$size" ]; then
    rm -f "$destination.e2fsck.tmp"
    printf 'EGRESS_REJECT reason=extraction-postcondition\n' >&2
    exit 71
fi
chmod 0400 "$parser_stage/extracted.tmp"
mv "$parser_stage/extracted.tmp" "$destination"
mv "$destination.e2fsck.tmp" "$destination.e2fsck"
printf 'EGRESS_ACCEPT bytes=%s sha256=%s parserImage=%s\n' "$size" \
    "$(shasum -a 256 "$destination" | awk '{print $1}')" "$parser_image"
