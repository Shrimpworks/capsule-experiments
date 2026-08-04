# Direct Apple Containerization backend spike

Status: development-only disposable research. Product packages must not import this code.

This experiment follows the Apple Container CLI/API Gate C failure by exercising the pinned
lower-level `apple/containerization` 0.33.3 package directly. It asks how much of the required
Supervisor backend can be built and tested locally without Apple Developer Program membership.

The retained decision and exact observations are in [`RESULTS.md`](RESULTS.md).

## Safety and scope

- The executable accepts state only under `/private/tmp/capsule-direct-*` and refuses to reuse an
  existing path.
- The guest receives an exact OCI image digest, no network interface, no Unix-socket relay, a
  read-only root, a bounded tmpfs, uid/gid 1000, no capabilities, and `no_new_privileges`.
- The checked-in entitlement is used only for local ad-hoc signing. It is not a Developer ID,
  provisioning, notarization, distribution, or production-entitlement result.
- The public test image, kernel, generated EXT4 files, and temporary content stores are not Capsule
  trust material.
- The `hold` mode is intentionally long-running for controller-crash injection. Resolve and verify
  its exact PID before sending a signal.

Owner: Capsule architecture / direct Containerization spike owner.

Removal/replacement condition: remove after a reviewed backend ADR either adopts a separately
reviewed and adversarially tested adapter (including its focused Containerization patch) or pivots
to another backend. Retain only neutral attack fixtures after that decision.

## Reproduce

Clone the exact upstream source and audit the expected API shape:

```sh
git clone --branch 0.33.3 --depth 1 \
  https://github.com/apple/containerization.git \
  /private/tmp/capsule-containerization-0.33.3
./audit-source.sh /private/tmp/capsule-containerization-0.33.3
```

Apply and audit the retained experimental PID-limit surface before building the current probe:

```sh
git -C /private/tmp/capsule-containerization-0.33.3 apply --check \
  "$PWD/patches/containerization-0.33.3-pids-limit.patch"
git -C /private/tmp/capsule-containerization-0.33.3 apply \
  "$PWD/patches/containerization-0.33.3-pids-limit.patch"
./audit-pids-patch.sh /private/tmp/capsule-containerization-0.33.3
```

The patch is experiment evidence, not an adopted fork or production dependency. It exposes the
already-supported OCI/vminitd PID control through `LinuxContainer.Configuration`; it has not been
reviewed or accepted upstream.

Build the current PID-enabled probe with the patched local exact checkout, then ad-hoc sign the
disposable binary. The manifest retains an exact remote dependency for provenance, but the current
probe intentionally will not compile against unmodified 0.33.3 because `pidsLimit` is the surface
under test:

```sh
CAPSULE_CONTAINERIZATION_SOURCE=/private/tmp/capsule-containerization-0.33.3 \
  swift build --product direct-probe
codesign --force --sign - --entitlements direct-probe.entitlements \
  .build/debug/direct-probe
```

The non-VM probes need no entitlement:

```sh
.build/debug/direct-probe configuration
.build/debug/direct-probe storage /private/tmp/capsule-direct-storage-UNIQUE
```

The runtime probes require a locally installed compatible kernel and fresh, unique state paths:

```sh
.build/debug/direct-probe run /path/to/vmlinux \
  /private/tmp/capsule-direct-state-UNIQUE
.build/debug/direct-probe flood /path/to/vmlinux \
  /private/tmp/capsule-direct-flood-state-UNIQUE
.build/debug/direct-probe pids-user /path/to/vmlinux \
  /private/tmp/capsule-direct-pids-user-UNIQUE
.build/debug/direct-probe pids-root /path/to/vmlinux \
  /private/tmp/capsule-direct-pids-root-UNIQUE
.build/debug/direct-probe hold /path/to/vmlinux \
  /private/tmp/capsule-direct-hold-state-UNIQUE \
  /private/tmp/capsule-direct-hold-ready-UNIQUE
```

`hold` writes the exact controller PID and container ID to the ready file. The crash test then
requires independent process inspection, an exact controller `SIGKILL`, and confirmation that the
newly associated Virtualization XPC helper disappeared while an unrelated control helper remained.
This destructive step is intentionally not hidden inside a general runner.
