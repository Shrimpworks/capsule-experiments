# Results

## Decision

`PASSED` for the exact deterministic no-run libkrunfw recovery slice.

`BLOCKED` for the complete C5b executable successor, controlled execution, runtime/profile
admission, and product admission.

## Observations

| Object | Bytes | SHA-256 | Result |
| --- | ---: | --- | --- |
| Official release asset | 19,709,993 | `5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979` | Exact pinned input |
| `kernel.c` | 93,814,877 | `96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d` | Generated boot-kernel C bundle source |
| Build A dylib | 24,339,104 | `0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9` | Exact historical identity |
| Build B dylib | 24,339,104 | `0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9` | Byte-identical to A |

Both builds used Apple clang 21.0.0, Xcode 26.6, macOS SDK 26.5, GNU make 3.81, target arm64,
`MACOSX_DEPLOYMENT_TARGET=14.0`, `SOURCE_DATE_EPOCH=0`, `TZ=UTC`, `LC_ALL=C`, and `LANG=C`.
`sandbox-exec` successfully applied a deny-network policy to both builds. The compiler emitted the
same informational linker warning in each build about reducing `__DATA,__data` alignment from
`0x10000` to the platform segment maximum `0x4000`.

Static parsing and independent system-tool readback agree that the retained object is an arm64
Mach-O dylib with install name `libkrunfw.5.dylib`, minimum macOS 14.0, SDK 26.5, only
`/usr/lib/libSystem.B.dylib` as a dependency, `krunfw_get_kernel` and `krunfw_get_version` exports,
and one embedded ad-hoc code signature. The object was not loaded to obtain these facts.

Five bounded mutations were refused: archive byte, retained output byte, false independent-build
claim, forbidden separate-firmware role, and false preferred-form-source-complete claim.

## Limitations

- This is same-host, same-toolchain reproduction, not independent-builder provenance.
- The official prebuilt-source asset supplies generated `kernel.c`, not the full preferred-form
  Linux/kernel source/configuration/patch/tool closure. Source compliance and distribution remain
  `BLOCKED`.
- Static format and export evidence is not behavioral libkrun/HVF evidence.
- No extracted kernel is retained as runtime authority; no separate firmware role is introduced.
- No artifact was loaded, linked into another artifact, executed, signed with an identity or
  explicit signing command, installed, or admitted. The linker-generated ad-hoc signature is
  retained as a static construction fact.
