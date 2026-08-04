# Selected FD-native custody evidence

These files retain compact development evidence for the governed raw-only FD API on 2026-08-02.
They are not backend-admission or installed App Sandbox evidence.

- `environment.txt`: exact host/tool/source/build/fixture identities.
- `source-audit.txt`: path-closure, ownership, raw-only, and positional-I/O source audit.
- `api-contract.txt`: 13/13 focused public C API and ownership/lifetime cases.
- `local-custody.json`: local descriptor, alias, mapping, fork/exec, reuse, replacement, and crash
  corpus.
- `guest-repeated.json`: four passing unsandboxed owned HVF guest runs.
- `app-sandbox-attempt.json`: retained pre-main ad-hoc signing limitation; no custody inference.
- `verification.txt`: patch application/reversal, composition, Rust, sanitizer, coverage, mutation,
  syntax, and shell audit summary.

The patch SHA-256 is
`48cdbc307b3fa1209fa0ec68fc3f817634af312983d68f0de259db86c0b43333`.
The fixed root digest is
`b442fe91619a2542c059038b66221923f15fd5fae5de98ae531415ae12586ef1`; every admitted/finalized
host descriptor, each FD-native guest run's `/dev/vda`, and every post-stop host descriptor matched
it. The fixed trusted guest probe SHA-256 is
`22a747a088ef9eafb6388ff50976d1e5ec2075115a3f0a41743c32e4f893c036`.
