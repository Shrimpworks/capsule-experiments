# Exact commands

The absolute stage paths are task-owned empty-state paths. Both decisive builds used:

```sh
./scripts/prepare-runtime-stage.sh DENO RUSTY_V8_BUNDLE /private/tmp/capsule-c2b-fixed-fixture-runtime-v2-{a|b} v2-{a|b}
docker run --rm --platform linux/arm64 --network bridge ... sh scripts/prefetch-runtime.sh
docker run --rm --platform linux/arm64 --network none --read-only --cap-drop ALL --security-opt no-new-privileges --security-opt seccomp=unconfined --memory 10g --cpus 1 --cpuset-cpus 0 --tmpfs /tmp:rw,nosuid,nodev -e GOVERNED_NETWORK_MODE=none -v STAGE:/workspace -w /workspace rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1 sh scripts/build-runtime-offline.sh
```

Restoration validation used the same builder restrictions and `--network none` with `scripts/test-runtime-restoration-offline.sh`. No guest command was run.
