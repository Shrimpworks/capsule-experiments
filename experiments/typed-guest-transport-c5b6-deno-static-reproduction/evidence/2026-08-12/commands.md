# C5b6 command boundary

The exact task-owned roots were:

- `/private/tmp/capsule-c2b-fixed-fixture-runtime-v2-a`
- `/private/tmp/capsule-c2b-fixed-fixture-runtime-v2-b`

Each root was created with the canonical `prepare-runtime-stage.sh`. The full connected acquisition
form, run separately with `ROOT` set to each exact path above, was:

```sh
docker run --rm --platform linux/arm64 --read-only --cap-drop ALL \
  --security-opt no-new-privileges --security-opt seccomp=unconfined \
  --memory 10g --cpus 1 --cpuset-cpus 0 \
  --mount type=bind,src="$ROOT",dst=/workspace -w /workspace \
  -e SOURCE_DATE_EPOCH=0 -e TZ=UTC -e LC_ALL=C -e LANG=C \
  rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1 \
  /bin/sh -c './scripts/prefetch-runtime.sh > acquisition.log 2>&1'
```

The decisive build form, run separately with `ROOT` and `LABEL` set to the exact A/B path and
label, was:

```sh
docker run --name "capsule-c5b6-build-$LABEL" --platform linux/arm64 --network none \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --security-opt seccomp=unconfined --memory 10g --cpus 1 --cpuset-cpus 0 \
  --mount type=bind,src="$ROOT",dst=/workspace -w /workspace \
  -e GOVERNED_NETWORK_MODE=none -e SOURCE_DATE_EPOCH=0 -e TZ=UTC -e LC_ALL=C -e LANG=C \
  rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1 \
  /bin/sh -c "./scripts/build-runtime-static-only.sh > build-$LABEL.log 2>&1"
```

The historical `build-runtime-offline.sh` was not invoked because it executes the candidate.
No command in this run loaded or executed a produced runtime, libkrun, HVF, VM, or guest.
