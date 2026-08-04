import Containerization
import ContainerizationEXT4
import ContainerizationOCI
import Foundation
import SystemPackage

private enum ProbeError: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case let .failed(message): message
        }
    }
}

private final class BoundedWriter: @unchecked Sendable, Writer {
    private let lock = NSLock()
    private let limit: Int
    private var storage = Data()
    private var overflowed = false
    let overflowEvents: AsyncStream<Void>
    private let overflowContinuation: AsyncStream<Void>.Continuation

    init(limit: Int) {
        self.limit = limit
        (overflowEvents, overflowContinuation) = AsyncStream.makeStream()
    }

    func write(_ data: Data) throws {
        try lock.withLock {
            let remaining = limit - storage.count
            guard data.count <= remaining else {
                if remaining > 0 {
                    storage.append(data.prefix(remaining))
                }
                overflowed = true
                overflowContinuation.yield()
                throw ProbeError.failed("guest output exceeded the bounded writer")
            }
            storage.append(data)
        }
    }

    func close() {}

    func snapshot() -> (text: String, bytes: Int, overflowed: Bool) {
        lock.withLock {
            (String(decoding: storage, as: UTF8.self), storage.count, overflowed)
        }
    }
}

private struct RuntimeArguments {
    let kernel: URL
    let stateRoot: URL
    let readyFile: URL?
    let hold: Bool
    let flood: Bool
    let pidsAttack: Bool
    let rootProcess: Bool
}

@main
private struct DirectProbe {
    private static let imageReference =
        "docker.io/oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04"
    private static let initfsReference = "ghcr.io/apple/containerization/vminit:0.33.3"

    static func main() async throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        switch arguments.first ?? "configuration" {
        case "configuration":
            try printConfigurationProbe()
        case "storage":
            guard arguments.count == 2 else {
                throw ProbeError.failed("storage requires a /private/tmp/capsule-direct-* directory")
            }
            try printStorageProbe(root: checkedTemporaryURL(arguments[1]))
        case "run", "hold", "flood", "pids-user", "pids-root":
            guard arguments.count == (arguments[0] == "hold" ? 4 : 3) else {
                throw ProbeError.failed("run requires KERNEL STATE_ROOT; hold also requires READY_FILE")
            }
            let readyFile = arguments[0] == "hold"
                ? try checkedTemporaryURL(arguments[3])
                : nil
            let runtime = RuntimeArguments(
                kernel: URL(fileURLWithPath: arguments[1]),
                stateRoot: try checkedTemporaryURL(arguments[2]),
                readyFile: readyFile,
                hold: arguments[0] == "hold",
                flood: arguments[0] == "flood",
                pidsAttack: arguments[0] == "pids-user" || arguments[0] == "pids-root",
                rootProcess: arguments[0] == "pids-root"
            )
            try await runContainer(runtime)
        default:
            throw ProbeError.failed("unknown command \(arguments[0])")
        }
    }

    private static func printConfigurationProbe() throws {
        var configuration = LinuxContainer.Configuration()
        harden(&configuration, hold: false, writer: BoundedWriter(limit: 65_536))
        printJSON([
            "configuredCPU": configuration.cpus,
            "configuredMemoryBytes": configuration.memoryInBytes,
            "configuredPidsLimit": configuration.pidsLimit ?? -1,
            "interfaces": configuration.interfaces.count,
            "sockets": configuration.sockets.count,
            "noNewPrivileges": configuration.process.noNewPrivileges,
            "capabilityBoundingCount": configuration.process.capabilities.bounding.count,
            "capabilityEffectiveCount": configuration.process.capabilities.effective.count,
            "rlimitCount": configuration.process.rlimits.count,
            "uid": configuration.process.user.uid,
            "gid": configuration.process.user.gid,
        ])
    }

    private static func printStorageProbe(root: URL) throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
        let requested: [UInt64] = [32, 64, 127, 128, 129, 256].map { $0 * 1_048_576 }
        var rows: [[String: Any]] = []
        for bytes in requested {
            let url = root.appendingPathComponent("ext4-\(bytes).img")
            let formatter = try EXT4.Formatter(FilePath(url.path), minDiskSize: bytes)
            try formatter.close()
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            let actual = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
            rows.append([
                "requestedBytes": bytes,
                "actualBytes": actual,
                "exact": actual == bytes,
            ])
        }
        printJSON(["storage": rows])
    }

    private static func runContainer(_ arguments: RuntimeArguments) async throws {
        guard FileManager.default.isReadableFile(atPath: arguments.kernel.path) else {
            throw ProbeError.failed("kernel is not readable")
        }
        try FileManager.default.createDirectory(
            at: arguments.stateRoot,
            withIntermediateDirectories: false
        )

        var manager = try await ContainerManager(
            kernel: Kernel(path: arguments.kernel, platform: .linuxArm),
            initfsReference: initfsReference,
            root: arguments.stateRoot,
            network: nil
        )
        let containerID = "capsule-direct-\(UUID().uuidString.lowercased().prefix(12))"
        let writer = BoundedWriter(limit: 65_536)
        let container = try await manager.create(
            containerID,
            reference: imageReference,
            rootfsSizeInBytes: 256 * 1_048_576,
            readOnly: true,
            networking: false
        ) { configuration in
            harden(
                &configuration,
                hold: arguments.hold,
                flood: arguments.flood,
                pidsAttack: arguments.pidsAttack,
                rootProcess: arguments.rootProcess,
                writer: writer
            )
        }
        defer {
            try? manager.delete(containerID)
        }

        try await container.create()
        try await container.start()

        let overflowWatchdog = Task {
            for await _ in writer.overflowEvents {
                try? await container.kill(.kill)
                return
            }
        }
        defer {
            overflowWatchdog.cancel()
        }

        let stats = try await container.statistics(categories: [.process, .memory, .cpu, .memoryEvents])
        if let readyFile = arguments.readyFile {
            let ready = "controllerPID=\(ProcessInfo.processInfo.processIdentifier) containerID=\(containerID)\n"
            try Data(ready.utf8).write(to: readyFile, options: [.atomic])
        }

        let exitStatus = try await container.wait()
        try await container.stop()
        let output = writer.snapshot()
        printJSON([
            "containerID": containerID,
            "exitStatus": String(describing: exitStatus),
            "outputPrefix": String(output.text.prefix(512)),
            "outputBytes": output.bytes,
            "outputOverflowed": output.overflowed,
            "pidsCurrent": jsonInteger(stats.process?.current),
            "pidsLimit": jsonInteger(stats.process?.limit),
            "memoryLimitBytes": jsonInteger(stats.memory?.limitBytes),
            "oomKills": jsonInteger(stats.memoryEvents?.oomKill),
        ])
    }

    private static func harden(
        _ configuration: inout LinuxContainer.Configuration,
        hold: Bool,
        flood: Bool = false,
        pidsAttack: Bool = false,
        rootProcess: Bool = false,
        writer: BoundedWriter
    ) {
        let workload = if hold {
            "sleep 600"
        } else if flood {
            "yes X | head -c 1048576 || true; sleep 600"
        } else if pidsAttack {
            """
            bun -e 'let children=[];let denied=-1;for(let i=0;i<64;i++){try{children.push(Bun.spawn(["/bin/sleep","2"]));}catch(e){denied=i;console.log(`forkDeniedAt=${i}`);break}}console.log(`forkStarted=${children.length}`);await Promise.all(children.map((p)=>p.exited));if(denied<0)process.exit(42)'
            printf 'pids.events='; tr '\n' ',' < /sys/fs/cgroup/pids.events; echo
            """
        } else {
            "sleep 2"
        }
        configuration.cpus = 1
        configuration.memoryInBytes = 256 * 1_048_576
        configuration.pidsLimit = 16
        configuration.interfaces = []
        configuration.sockets = []
        configuration.process.arguments = [
            "/bin/sh",
            "-c",
            """
            set -eu
            printf 'uid=%s gid=%s\\n' "$(id -u)" "$(id -g)"
            grep '^NoNewPrivs:' /proc/self/status
            printf 'pids.max='; cat /sys/fs/cgroup/pids.max
            if [ -e /sys/class/net/eth0 ]; then echo 'eth0=present'; else echo 'eth0=absent'; fi
            if touch /capsule-root-write-probe 2>/dev/null; then echo 'rootWrite=unexpected'; else echo 'rootWrite=denied'; fi
            touch /tmp/capsule-tmp-write-probe
            echo 'tmpWrite=allowed'
            \(workload)
            """,
        ]
        configuration.process.workingDirectory = "/tmp"
        let processID: UInt32 = rootProcess ? 0 : 1000
        configuration.process.user = User(uid: processID, gid: processID)
        configuration.process.noNewPrivileges = true
        configuration.process.capabilities = LinuxCapabilities()
        configuration.process.rlimits = [
            LinuxRLimit(kind: .numberOfProcesses, limit: pidsAttack ? 256 : 16),
            LinuxRLimit(kind: .openFiles, limit: 64),
            LinuxRLimit(kind: .fileSize, limit: 1_048_576),
        ]
        configuration.process.stdout = writer
        configuration.process.stderr = writer
        configuration.mounts.append(
            .any(
                type: "tmpfs",
                source: "tmpfs",
                destination: "/tmp",
                options: ["nosuid", "noexec", "nodev", "mode=1777", "size=16777216"]
            )
        )
    }

    private static func checkedTemporaryURL(_ path: String) throws -> URL {
        let url = URL(fileURLWithPath: path).standardizedFileURL
        guard url.path.hasPrefix("/private/tmp/capsule-direct-") else {
            throw ProbeError.failed("refusing path outside /private/tmp/capsule-direct-*")
        }
        guard !FileManager.default.fileExists(atPath: url.path) else {
            throw ProbeError.failed("refusing to reuse existing path \(url.path)")
        }
        return url
    }

    private static func printJSON(_ value: Any) {
        let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        print(String(decoding: data, as: UTF8.self))
    }

    private static func jsonInteger(_ value: UInt64?) -> Any {
        if let value {
            return NSNumber(value: value)
        }
        return NSNull()
    }
}
