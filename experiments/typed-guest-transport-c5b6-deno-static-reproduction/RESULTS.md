# C5b6 results

## Status

- Exact independent Cargo acquisition: `PASSED`.
- Network-disabled deterministic static build A: `PASSED`.
- Network-disabled deterministic static build B: `PASSED`.
- A/B byte equality: `PASSED`.
- Runtime, libkrun, HVF, VM, and guest execution: `NOT_RUN`.
- Complete C5b composition and runtime/profile admission: `BLOCKED`.

## Observations

Both acquisitions contained 193 lock packages: 189 crates.io packages and four local path
packages, with no other source. Every vendored `.cargo-checksum.json` package checksum reconciled
to the matching lock entry. Both deterministic vendor archives were byte-equal.

| Material | Bytes | SHA-256 |
| --- | ---: | --- |
| Deno source archive | 32,352,414 | `7073152cccd4df42d5081ecec5c8ab36f8d6914039faa806060656d55a9e4cf3` |
| Cargo vendor archive | 70,134,953 | `1e96e49a516e4cf6a9ec79acae9a9eb3d0ee52b332695fa11476a97e1e50d1d4` |
| Fixed-fixture runtime binary | 68,496,520 | `e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77` |
| Snapshot | 699,988 | `4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c` |
| Deterministic runtime bundle | 20,981,992 | `ad908b8289c86f25c3413713fa3e60c4c8bb91fec0d52763e870d7a186865ee6` |

The binary is an AArch64 ELF and retains exactly the three governed built-in ops recorded in
`final-link-symbols.txt`. Those are static observations only.

## Scope correction

The historical offline build helper executed the candidate to verify its fixed known answer and
refusal behavior. That exceeded this task's explicit no-execution authorization and was not used.
The retained static-only script preserves source, lock, vendor, image, CPU, route, ASLR, wrapper,
fresh-output, compile, packaging, link-symbol, ELF, and exact-identity checks while removing every
candidate and mutation invocation.

The prior dynamic fixture/refusal evidence remains historical evidence; this result neither reruns
nor upgrades it. It establishes deterministic construction and static identity only.

## Decision

The exact governed Deno artifact is no longer a missing C5b input. A later composed-profile slice
may bind this immutable result with the separately governed libkrun/libkrunfw, init/root/launcher,
effect adapter, and controller artifacts. It must stop again before any runtime or guest execution.
