# Supervisor owner-lock boundary experiment

Status: development-only local semantics harness; not a Capsule product component or security
boundary.

Owner: Capsule Execution Supervisor maintainers.

This experiment defensively tests the backend-independent per-installation single-Supervisor
ownership primitive using only mode-restricted files and child processes created under one owned
temporary directory on the current macOS host. It creates no service, LaunchAgent, helper,
credential, runtime, backend, or guest and touches no unrelated process.

Run:

```sh
./experiments/supervisor-owner-lock-boundary/run.sh
```

The retained result, selected contract, limitations, and removal condition are recorded in
[`RESULTS.md`](RESULTS.md). Derived temporary files and processes are removed by the harness.
