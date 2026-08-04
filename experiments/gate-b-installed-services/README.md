# Gate B Installed Per-User Services Spike

Status: development-only disposable experiment. It is not a product service, production security
boundary, or receipt evidence.

Owner: Capsule architecture spike. Remove or replace it when the packaged product services pass the
same matrix on every supported macOS and distribution channel.

## Bounded question

Can three independently Apple Development-signed components be registered as unprivileged per-user
LaunchAgents, activate through narrow XPC Mach services, authenticate both ends of every test
channel by exact code identity, survive a service crash by reconnecting to a fresh instance, reject
stale replacements and bad protocol messages, and remove all launchd/install state cleanly?

This spike does not launch a guest, use an operational key, implement a durable epoch, or grant the
daemon backend authority.

## Topology

The Supervisor exposes two separate Mach services so that daemon and Broker traffic do not share a
single broad listener requirement:

```text
daemon v1 --exact channel--> Supervisor.from-daemon
Broker v1 --exact channel--> Supervisor.from-broker
Supervisor v1 --health-----> Broker.from-supervisor
Supervisor v1 --health-----> daemon.from-supervisor
```

Both sides install an exact Apple-team/channel/identifier/no-debug/CDHash requirement before XPC
activation. The receiver additionally derives `SecCode` from the actual XPC message. The health
channels carry only the test `probe` operation; they do not represent new product authority.

## Run

Requirements:

- macOS with an active Aqua login session;
- Xcode command-line tools;
- one valid Apple Development signing identity (or set `CAPSULE_SIGNING_IDENTITY` explicitly);
- no existing spike labels or paths listed below.

Run without `sudo`:

```sh
./experiments/gate-b-installed-services/run.sh
```

The script temporarily creates:

- `~/Library/Application Support/CapsuleGateBInstalledServicesSpike`;
- three exact plists under `~/Library/LaunchAgents/`; and
- three launchd labels beginning `io.github.dills122.capsule.gate-b.installed`.

It refuses to replace any existing path or loaded label. Its exit trap boots out owned services and
removes only a marker-validated install root and exact-label plists. If the shell itself is killed,
inspect first and then run:

```sh
./experiments/gate-b-installed-services/run.sh --cleanup
```

Derived binaries and logs remain ignored under `build/`. The source and scripts are the durable
reproduction artifact; `RESULTS.md` separates observation from inference.
