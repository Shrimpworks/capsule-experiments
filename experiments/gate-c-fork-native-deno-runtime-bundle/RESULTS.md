# Fork-native governed runtime-bundle result

Date: 2026-08-04

Decision: **PASSED — EXACT CLEAN CONSTRUCTION ONLY**

Runtime selection/admission: **IN_PROGRESS / UNSUPPORTED**. Unsigned, unpublished, not deployed,
and not composed with a libkrun/HVF guest.

## Question and answer

Can the exact merged governed fork commits construct a clean standalone Linux/arm64 Capsule
runtime bundle from empty task output/cache state, using connected digest-only prefetch followed by
network-disabled build, test, and evidence collection, while reproducing or explicitly superseding
the retained binary, snapshot, and 22-entry root known answers?

**Yes, for that exact construction question.** The governed `rusty_v8` archive reproduces the
owned CI oracle exactly. The Deno binary, snapshot, and root are internally reproducible and
explicitly supersede the older known answers under the declared fork-native input/profile set.
No difference was normalized or rewritten.

## Refs and locks

| Fork | Head | Merge | Upstream anchor | Tree |
| --- | --- | --- | --- | --- |
| `Shrimpworks/deno` | `9adb0b68b55bca81644827f1e7749a3acb091bed` | `ea18b9dc21ff8ebd19347be7095f47937ee14ec2` | `14eea3160ae5834476aa3b9d317b8d41d991b982` | `72edd0f7b5f83b918945860653714e344c8a303f` |
| `Shrimpworks/rusty_v8` | `80e863ddb942a4aa2b384e794fc23e35b9d2bb15` | `cbf56de2e1156b1cf1561fdbaea7172a0aa056f4` | `d305e6afa7736f6e298c30ae6646f7709ee9382b` | `d8950a7a1ee907761720b23d24eaa9b63aa33b10` |

The Deno source archive is `d117cc15…bd54`; the direct-workspace Cargo source bundle is
`1e96e49a…d1d4`; the exact Cargo lock is `4dd8f08c…389d`. The `rusty_v8` corresponding-source
archive is `8cf75b00…2eff`. Ref verification also closed all 20 recursive gitlinks, the 22-package
cross-tool closure, builder/source/output locks, merge parents, and stale-head rejection.

## Build method

The task began with absent output, Cargo source cache, V8 build volume, compiler cache, and root
directories. Connected phases fetched only declared digest-pinned inputs. Decisive build, fixed
tests, runtime tests, root assembly, mutation tests, tracing, and evidence collection ran in
network-disabled containers. Neither governed fork received Capsule experiment code or product
package changes; the Deno harness consumed the fork workspaces directly.

The clean `rusty_v8` volume build completed the ARM64 archive. Docker Desktop then exhausted its
virtual disk while compiling the fixed test. The completed raw archive already matched the oracle
and was verified before recovery. Only 4,078 disposable task-owned GN object intermediates
(390,904,352 bytes) were removed; unrelated Docker state was not pruned. The exact fork test,
QEMU ARM64 execution, collection, and release verifier then resumed with network disabled. The
final 11-file unsigned bundle passed its cap and closure checks.

The Deno build used 189 registry sources plus four exact path packages from the governed workspace.
Two four-logical-CPU trials failed closed: snapshots differed at two payload bytes plus their
checksum, and the binaries differed only at those embedded bytes and GNU build ID. Canonical target
paths and `setarch aarch64 -R` were verified, but four-thread V8 platform scheduling remained
sensitive on this host. The final profile declared one visible logical CPU pinned to CPU set 0;
fresh network-disabled A/B containers then produced byte-identical binary, snapshot, and bundle.
The built restored-`op_print` negative control and runtime corpus passed after a retained harness
path-variable resume; the already-built subjects were not changed.

## Artifact identities and comparison

| Subject | Current | Prior/oracle | Result |
| --- | --- | --- | --- |
| `rusty_v8` archive gzip | `1ae209c9…4cd2` | workflow 30925045754 `1ae209c9…4cd2` | equal |
| Deno binary | `56d3acef…2898` | `597baba6…6f5` | superseded |
| Snapshot | `4e896521…1a2c` | `ef5f1e78…fa0b` | superseded |
| 22-entry root gzip | `e847651b…62e8` | `b0e17261…79283` | superseded |

The local and oracle `rusty_v8` release bundles have 6 of 11 files byte-equal. The five different
files are fully attributed to elapsed time, host/build metadata, invocation/subject provenance,
and checksum/manifest cascades. Build metadata has 16 of 23 members equal; the seven differences
are host identity/timing, action-pool depth, and their deterministic graph/tool renderings. Both
comparisons report `comparison-closed`, no unexplained file, and no normalization.

The current root has the same 22 paths, modes, ownership, link target, and package bytes as the
prior root. Twenty entries are byte-identical. Only the current governed binary (80 bytes larger)
and snapshot (8 bytes larger) differ, increasing regular bytes from 71,871,122 to 71,871,210. That
fully accounts for the root manifest, tar, and gzip identity changes.

## Verification

The final link contains only:

1. `op_get_ext_import_meta_proto`
2. `op_get_extras_binding_object`
3. `op_set_captured_bootstrap`

The runtime observed the same ordered three-op registry and fixed JSON result. Sealed globals,
physical omission, no static/dynamic module request, `moduleLoader: none`, no inspector/extensions,
descriptor `[0,1,2]`, four syscall refusals, restored four-op refusal, exact ELF dynamic closure,
loader/file-open closure, and 14 root mutations all passed. The file trace observed no socket
syscall and no executable mapping after the host seal. Root and artifact caps passed.

Source/license/notice closure includes the Deno source archive, all 193 Cargo packages, all 189
registry checksums and license expressions, the full `rusty_v8` corresponding-source and notice
subjects, both V8 SBOM formats, Debian binary/source inputs, a complete CycloneDX 1.6 composition,
artifact checksums, and unsigned in-toto/SLSA provenance.

## Confidence and limitations

Confidence is high for exact same-host construction and the retained closed corpus. It is not an
independent-builder result: local V8, Deno A/B, and root A/B ran through the same Apple Silicon
Docker Desktop/LinuxKit host. The V8 build is an amd64-host-to-arm64 cross build; Deno/root execute
as Linux/arm64 containers. `--network none` applied to decisive containers, but the macOS host
remained connected and Docker isolation was not independently attested. CI run 30925045754 is only
a comparison oracle. No guest, signing service, release channel, deployment, or arbitrary workload
was exercised.

The next boundary is a separately authorized composed-profile task: place this exact unsigned root
inside the intended external-isolation mechanism, repeat admission-relevant evidence on an
independent builder/host, and make a separate runtime-selection decision. Until then
`RUNTIME-001` remains unsupported.
