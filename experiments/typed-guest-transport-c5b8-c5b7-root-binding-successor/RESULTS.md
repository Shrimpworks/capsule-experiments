# C5b8/C5b7 root-binding successor results

Status: `PASSED` for the exact deterministic, no-run successor scope.

## Construction result

- Exact retained C5b7 root: 100,663,296 bytes, SHA-256
  `5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775`.
- Exact sealed C5b8 input: 8,728 bytes, SHA-256
  `b15c4eb6abfbf0bf6ff6d1bf860081be0378273af7c14a9f9a24fd65ffe941ce`.
- Byte-equal successor objects: 7,776 bytes, SHA-256
  `3d5650a11c8cbf920357af7d7fabbb8880fc96197ad3baec52db34526191821e`.
- Byte-equal statically composed objects: 15,255 bytes, SHA-256
  `2eaaef8a5480e0e6f9d416afef7bc9d467f25c0c4f6122d8e365e90ab3e40d94`.
- Successor profile SHA-256:
  `c3ffb923949faed052e7b8bc79909fdaa874e619037d8b8ff96947c568568bfa`.
- No-run plan SHA-256:
  `7a17cf7a79f3e05866d13e343b559299e9dce236a8cd743155f62f7efb558436`.
- Source/input frame SHA-256 values:
  `02e3b77aea5c8d4f26487427db3b9dda2f983195f061fd63cd2fb217b5b22d99` and
  `4ffd2b04aacbf8d9210a0ee8b8525e8257c560a36b67b9dab4b21270d132c7da`.

The composite exports only the two sealed C5b8 entry points and the two C5b5-compatible successor
entry points. The renamed historical helpers remain private. Its undefined operation surface is
unchanged: two C5b3 functions, the single fixed C5b8 operation port, and the exact 13 historical
libkrun symbols. The retained objects were not loaded or executed.

## Refusal and mutation result

The executable repository double accepted the exact successor and observed one root operation
whose byte count was exactly 100,663,296. Before operation enrollment it refused both the complete
historical C5b5 profile and the historical size under the successor magic/version. It also refused
descriptor-size substitution, historical profile-digest substitution, plan substitution, and a
changed non-root immutable profile field.

Ten independent verifier mutations covered C5b7 size and digest substitution, sealed C5b8 object
substitution, successor-profile size substitution, caller-selected backend API smuggling, frame
binding substitution, plan substitution, historical-helper export, composed-object substitution,
and an undeclared archive member. Every mutated copy failed, and the original candidate passed
again after every case.

## Security-claim boundary

This is static compatibility and controlled-test evidence, not real execution evidence. It does
not load the retained dylib or runtime, invoke libkrun or HVF, launch a process/VM/guest, sign,
access Keychain or LocalAuthentication, register/install a service, clean non-temporary host paths,
or change product admission.

