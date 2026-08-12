# E0 construction results

Date: 2026-08-11

## Result

C3a deterministic E0 fixture materialization is `PASSED` in its exact unsigned, no-launch scope.
The parent installed owner-lock G3/I2B, E1 identity-separation observation, and product admission
remain `BLOCKED`. ADR-0045 remains `Proposed`.

## Method and observations

The packet was constructed from Capsule commit
`88f3a2c1f968b1aa604ce14a2db4389822e5b193` on arm64 macOS 26.5.2 build `25F84` using Xcode 26.6
build `17F113`, SDK 26.5, and Apple clang 21.0.0 (`clang-2100.1.1.101`).

Observed construction results:

- current Supervisor, stable legacy Supervisor, and current Coordinator sources compiled without
  warnings under `-Wall -Wextra -Werror`;
- two clean builds produced byte-and-mode-equal bundle trees;
- all three outputs are arm64 Mach-O executables with neither `LC_UUID` nor
  `LC_CODE_SIGNATURE`;
- the exact source root is absent from all three artifacts;
- the current and legacy artifacts remain byte-distinct and contain their exact fixed role,
  bundle-identifier, and sentinel constants;
- Info plists and requested-entitlement projections match their checked-in sources byte for byte;
- the LaunchAgent input is disabled, not run at load, not kept alive, and retains the one exact
  epoch-one Mach service in an inactive declaration;
- current profile UUIDs/digests, certificate/CDHash/requirement values, container URL digests, and
  production protocol/state bindings remain explicitly unresolved; and
- no built artifact was executed and no Apple/platform authority surface was accessed.

The independent verifier checks the complete closed manifest plus semantic known answers. Its
mutation corpus retained 23 refusals covering missing/extra bytes, closed-map violations,
authority sequence zero/two, stable-ID substitution, wrong Team/group/service, host-path
injection, active profile/process/Coordinator/LaunchAgent projections, unsafe entitlement,
artifact substitution, JSON cap-plus-one, symlink, and closed-file-cap violations.

## Artifact identities

The canonical identities are recorded in [`manifest.json`](manifest.json). The verifier prints the
current manifest digest and the exact three executable digests after every successful run. The
manifest excludes only itself to avoid a self-hash cycle; the immutable Git commit binds the
manifest bytes.

## Evidence classification

| Claim | Class | Disposition |
| --- | --- | --- |
| Checked-in packet is closed and internally consistent | local construction evidence | `PASSED` |
| Unsigned artifacts reproduce under the recorded toolchain | local construction observation | `PASSED` |
| Stable legacy identity cannot access the epoch-one private container | inference requiring E1 | `BLOCKED` |
| Exact current profiles, signed requirements, effective entitlements, and CDHashes | unavailable before authorized provisioning/signing | `BLOCKED` |
| App Sandbox denial and exact cleanup on the named Mac | unexecuted platform observation | `BLOCKED` |
| Installed owner lock or product admission | unsupported by E0 | `BLOCKED` |

## Limitations

- Reproducibility is retained for the exact recorded compiler/SDK pair, not cross-Xcode equality.
- The probe source is compiled but deliberately not launched; no runtime behavior is claimed.
- No raw provisioning profile or private credential is present.
- The legacy profile is frozen as public metadata only and was not read or used.
- The inactive descriptor is not a production schema or authority object.
- E1-13 foreign-container consent remains excluded and needs its own authorization if ever run.
- Apple Development evidence, if later obtained, cannot establish Developer ID, notarization,
  distribution, clean-host, update, runtime, backend, VM, guest, or product-admission behavior.

## Decision

Use this immutable packet as the construction input to a separately authorized C3b/E1 task. Do
not begin E1 until the archive PR is merged and the exact archive commit and manifest digest are
read back. Do not accept ADR-0045 or start Keychain/service/root work from this result alone.
