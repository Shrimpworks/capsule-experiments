# Selected P0-1 evidence

- `environment.txt`: host/tool/build identities and artifact digests.
- `source-audit.txt`: pinned consumer/open and positional-I/O checks.
- `local-custody.json`: descriptor lifetime, alias, mapping, pathname, `CLOEXEC`, FD reuse, and
  bounded crash/recovery observations.
- `guest-nojournal.*`: passing unsandboxed full-guest run for the comparable no-journal root.
- `guest-journal-control.*`: expected negative showing a journaled guest block view can differ from
  unchanged host bytes even though both libkrun opens attach the correct object.
- `app-sandbox-attempt.*`: bounded pre-main failure on a host with no valid code-signing identity.

Generated raw roots, app bundles, dylibs, decoys, and additional reruns are intentionally ignored;
the scripts reconstruct them from the exact pins recorded here.
