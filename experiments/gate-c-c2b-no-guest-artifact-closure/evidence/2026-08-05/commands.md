# Commands

Placeholders below name controlled local checkouts/inputs; source-ref evidence binds their exact
commits, trees, sizes, and digests.

```sh
scripts/prepare-stage.sh STAGE_A HARNESS LIBKRUN VENDOR LIBKRUNFW_RELEASE RUNTIME_BUNDLE ROOT_INPUTS
scripts/prepare-stage.sh STAGE_B HARNESS LIBKRUN VENDOR LIBKRUNFW_RELEASE RUNTIME_BUNDLE ROOT_INPUTS
```

Each macOS build was invoked with an empty process environment except fixed tool paths and builder
variables, inside:

```sh
sandbox-exec -p '(version 1)(allow default)(deny network*)' env -i \
  PATH=FIXED_PATH HOME=STAGE/home TMPDIR=STAGE/tmp RUSTUP_HOME=PINNED_RUSTUP \
  CAPSULE_BUILD_NETWORK_MODE=none \
  /bin/sh STAGE/harness/scripts/build-macos-artifacts.sh STAGE
```

Each Linux/arm64 build was invoked as:

```sh
docker run --rm --network none --platform linux/arm64 --cap-drop ALL \
  --security-opt no-new-privileges --env CAPSULE_BUILD_NETWORK_MODE=none \
  --workdir /workspace --mount type=bind,src=STAGE,dst=/workspace \
  sha256:7cf1e580ef5539f03b58560753e8ab84c8c360960d99dff714004aa98f203977 \
  /bin/sh /workspace/harness/scripts/build-linux-artifacts.sh
```

Verification:

```sh
node scripts/generate-fixtures.mjs check
cargo fmt --all -- --check
cargo check --workspace --locked
STAGE_A=... STAGE_B=... node scripts/verify-evidence.mjs
diff -qr STAGE_A/out STAGE_B/out
```

No command called `krun_start_enter`, entered HVF, created a VM/guest, executed the governed runtime,
signed/notarized/published an artifact, or contacted a runtime service.
