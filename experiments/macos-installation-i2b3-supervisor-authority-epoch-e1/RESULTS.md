# E1 preflight results

Date: 2026-08-11

## Result

C3b/E1 is `BLOCKED` before platform mutation. The exact E0 input and owner-host facts passed
preflight. The required legacy negative provisioning profile was not present in the bounded
authorized locations, and the task forbade substituting or silently regenerating it.

The parent installed owner-lock G3/I2B remains `BLOCKED`. ADR-0045 remains `Proposed`. Product
admission remains `BLOCKED`.

## Evidence classification

| Observation | Class | Disposition |
| --- | --- | --- |
| E0 merge and manifest match the authorized immutable input | repository readback | `PASSED` |
| Host, OS, architecture, toolchain, EUID, and Aqua session match | exact-host preflight observation | `PASSED` |
| Authorized external evidence root and leaf were absent | exact-host preflight observation | `PASSED` |
| Exact selected legacy profile bytes were available | exact-profile availability | `BLOCKED` |
| E1-01 through E1-12 and E1-14 through E1-15 | unexecuted | `BLOCKED` |
| App Sandbox identity separation | unobserved | `BLOCKED` |
| Installed owner lock or product admission | unsupported | `BLOCKED` |

## Stop and no-effect receipt

The stop occurred before the first authorized external mutation. No external evidence directory,
portal resource, App ID, profile, signature, installation, process, container, sentinel, service,
Keychain item, protected root, owner, store, runtime, backend, VM, guest, approval, or attempt was
created or changed by this task. The exact authorized C3b/E1 external evidence leaf remained absent
at final readback; a separate parallel task had independently created a distinct leaf under the
shared root. The Coordinator remained unlaunched and E1-13 remained excluded.

No raw profile, device identifier, credential, private key, broad identity inventory, or broad
profile inventory was retained.

## Decision

Do not continue E1 from this authorization. Restore or explicitly reacquire the exact selected
legacy profile through an owner-controlled non-repository path; verify its UUID and CMS SHA-256
before use; then issue a fresh authorization that repeats every original scope and stop condition.
Do not use a newly generated profile as a silent replacement.
