# Results

## Decision

`PASSED` for the exact C5b2 governed-input closure. The available current-source libkrun and final
runner packet is now independently bound by bytes, format, platform, dependency, export, import,
and accepted-header ABI facts.

`BLOCKED` for a complete executable successor, controlled C5b execution, and runtime/profile
admission. The task did not convert identity-only historical evidence into artifact bytes.

## Bound inputs

| Input | Bytes | SHA-256 | Result |
| --- | ---: | --- | --- |
| Accepted `libkrun.h` | 54,658 | `dce44d1d70ab770b1089e57646e025281a4137fe5052b9dd8eaefb80c01a1bd8` | Bound; C17 audit passes |
| ABI audit source | 2,512 | `419256ea91de9b5e5323e1f1d6d42afb0a5fa85a8835d0d0404734af0ee92356` | Bound |
| Unsigned `libkrun.1.dylib` | 4,393,448 | `055d9d18dc964fec4aba21948c4a344cb7a51cb48a2c70017484b718eae12f9f` | Bound; static inspection only |
| Final runner source | 7,917 | `5a5560fa667390253bf504d7c045fcbcc304fa5829b22a8acf1fff00a8e37eb9` | Bound |
| Unsigned final runner | 100,488 | `a30e3f7cba5f480b6e164536854749b5e1ba3349f20af6c9c8e5d2590bffe1ad` | Bound; static inspection only |
| C2B v4 materialized profile | 10,301 | `198688bacd50aaee4f57b4cd7c56cea6b939c10aa220fbbeba7d315de820d1fd` | Bound |

The verifier parses Mach-O load commands and symbol tables directly. It confirms arm64 format,
minimum macOS/SDK values, unsigned state, exact dependency closure, all 13 reviewed libkrun
exports, and the runner's exact 13-symbol libkrun import closure. A separate `otool`/`nm`/`file`
readback agrees without loading either artifact.

The historical C2B closure's exact report, libkrunfw Mach-O readback, and kernel-extraction receipt
are also retained. They confirm the known identities, `libkrunfw.5.dylib` role, macOS 14.0/SDK
26.5 metadata, embedded signature observation, and derived kernel size. They do not supply or
authenticate the absent large bytes for a new composite.

## Honest blocker map

| Role | Retained identity | Byte status | Disposition |
| --- | --- | --- | --- |
| Governed `deno_core` executable | 68,496,520 bytes; `e781a902...0a77` | Absent | `BLOCKED` |
| `libkrunfw` boot-kernel carrier | 24,339,104 bytes; `0b14f4b8...6e9` | Absent | `BLOCKED` |
| Extracted kernel | 24,117,248 bytes; `b50a4165...22d` | Absent | `EVIDENCE_ONLY`; not a runtime input |
| Separate firmware | No artifact identity | Intentionally absent | `INAPPLICABLE` under ADR-0041 |
| Complete controlled-test controller | No reviewed source or bytes | Absent | `BLOCKED` |

Because those roles remain unresolved, the composite manifest, runtime root, and controller fields
remain explicit `null`, and `executable` remains `false`. The C5b1 hard-stop controller is not
misrepresented as a run controller.

Seven mutations refuse a libkrun byte change, runner byte change, invented runtime binding,
invented libkrunfw binding, forbidden separate-firmware authority, invented controller path, and
false executable claim.

## Limitations

- Static format and ABI agreement is not behavioral libkrun/HVF evidence.
- This packet does not reproduce the absent governed runtime or libkrunfw bytes.
- The retained libkrun dylib exports APIs outside Capsule's selected runner surface; authority is
  constrained by the exact runner import/call contract, not by claiming the library omits them.
- No composed root, lifecycle controller, process, VM, guest, signed artifact, installed profile,
  or product consumer exists here.
