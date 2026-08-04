import Containerization
import ContainerizationOCI
import CryptoKit
import Foundation
import Virtualization

private enum ProbeError: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case let .failed(message): message
        }
    }
}

private enum HoldPhase: String, CaseIterable {
    case manager
    case object
    case created
    case started
    case exited
    case stopped
}

private final class BoundedWriter: @unchecked Sendable, Writer {
    private let lock = NSLock()
    private let limit: Int
    private var storage = Data()

    init(limit: Int) {
        self.limit = limit
    }

    func write(_ data: Data) throws {
        try lock.withLock {
            guard storage.count <= limit - data.count else {
                throw ProbeError.failed("guest output exceeded the bounded writer")
            }
            storage.append(data)
        }
    }

    func close() {}

    func snapshot() -> String {
        lock.withLock { String(decoding: storage, as: UTF8.self) }
    }
}

private struct ReadyRecord: Codable {
    let controllerPID: Int32
    let containerID: String?
    let label: String
    let phase: String
    let stateRoot: String
    let guestOutput: String?
}

@main
private struct IdentityRecoveryProbe {
    private static let statePrefixes = [
        "/private/tmp/capsule-gate-c-identity-",
        "/tmp/capsule-gate-c-identity-",
    ]
    private static let rootMarker = "capsule-gate-c-identity-recovery-v1\n"
    private static let runRootMarker = "capsule-gate-c-identity-recovery-run-v1\n"
    private static let imageReference =
        "docker.io/oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04"
    private static let initfsReference = "ghcr.io/apple/containerization/vminit:0.33.3"

    static func main() async throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        switch arguments.first ?? "identity" {
        case "identity":
            try identityProbe()
        case "init-root":
            guard arguments.count == 2 else {
                throw ProbeError.failed("init-root requires STATE_ROOT")
            }
            try initializeRoot(checkedURL(arguments[1], mustExist: false))
        case "mark-run-root":
            guard arguments.count == 2 else {
                throw ProbeError.failed("mark-run-root requires RUN_ROOT")
            }
            try markRunRoot(checkedURL(arguments[1], mustExist: true))
        case "hold":
            guard arguments.count == 6, let phase = HoldPhase(rawValue: arguments[4]) else {
                throw ProbeError.failed(
                    "hold requires KERNEL STATE_ROOT READY_FILE PHASE LABEL; phase is manager|object|created|started|exited|stopped"
                )
            }
            try await hold(
                kernel: URL(fileURLWithPath: arguments[1]).standardizedFileURL,
                stateRoot: checkedURL(arguments[2], mustExist: true),
                readyFile: checkedURL(arguments[3], mustExist: false),
                phase: phase,
                label: checkedLabel(arguments[5])
            )
        case "reconcile":
            guard arguments.count == 3 else {
                throw ProbeError.failed("reconcile requires KERNEL STATE_ROOT")
            }
            try await reconcile(
                kernel: URL(fileURLWithPath: arguments[1]).standardizedFileURL,
                stateRoot: checkedURL(arguments[2], mustExist: true)
            )
        case "cleanup":
            guard arguments.count == 2 else {
                throw ProbeError.failed("cleanup requires STATE_ROOT")
            }
            try cleanup(checkedURL(arguments[1], mustExist: true))
        case "cleanup-run-root":
            guard arguments.count == 2 else {
                throw ProbeError.failed("cleanup-run-root requires RUN_ROOT")
            }
            try cleanupRunRoot(checkedURL(arguments[1], mustExist: true))
        default:
            throw ProbeError.failed("unknown command \(arguments[0])")
        }
    }

    private static func identityProbe() throws {
        let first = VZGenericMachineIdentifier()
        let recreated = VZGenericMachineIdentifier(dataRepresentation: first.dataRepresentation)
        let second = VZGenericMachineIdentifier()
        guard let recreated else {
            throw ProbeError.failed("failed to recreate VZGenericMachineIdentifier")
        }
        printJSON([
            "firstDigest": digest(first.dataRepresentation),
            "firstEqualsRecreated": first.isEqual(recreated),
            "firstEqualsSecond": first.isEqual(second),
            "identifierBytes": first.dataRepresentation.count,
            "semantic": "guest-virtual-hardware-identity",
        ])
    }

    private static func initializeRoot(_ stateRoot: URL) throws {
        guard !FileManager.default.fileExists(atPath: stateRoot.path) else {
            throw ProbeError.failed("refusing to reuse existing root \(stateRoot.path)")
        }
        try FileManager.default.createDirectory(at: stateRoot, withIntermediateDirectories: false)
        try Data(rootMarker.utf8).write(to: markerURL(stateRoot), options: [.atomic])
        printJSON(["initialized": stateRoot.path])
    }

    private static func markRunRoot(_ runRoot: URL) throws {
        let contents = try FileManager.default.contentsOfDirectory(
            at: runRoot,
            includingPropertiesForKeys: nil
        )
        guard contents.isEmpty else {
            throw ProbeError.failed("refusing to mark non-empty run root")
        }
        try Data(runRootMarker.utf8).write(to: runMarkerURL(runRoot), options: [.atomic])
        printJSON(["markedRunRoot": runRoot.path])
    }

    private static func hold(
        kernel: URL,
        stateRoot: URL,
        readyFile: URL,
        phase: HoldPhase,
        label: String
    ) async throws {
        try validateRoot(stateRoot)
        guard FileManager.default.isReadableFile(atPath: kernel.path) else {
            throw ProbeError.failed("kernel is not readable")
        }
        guard !FileManager.default.fileExists(atPath: readyFile.path) else {
            throw ProbeError.failed("refusing to reuse ready file")
        }

        var manager = try await ContainerManager(
            kernel: Kernel(path: kernel, platform: .linuxArm),
            initfsReference: initfsReference,
            root: stateRoot,
            network: nil
        )
        if phase == .manager {
            try announce(phase, label: label, stateRoot: stateRoot, readyFile: readyFile)
            await holdForever()
        }

        let containerID = "capsule-id-\(label)"
        let writer = BoundedWriter(limit: 65_536)
        let container = try await manager.create(
            containerID,
            reference: imageReference,
            rootfsSizeInBytes: 256 * 1_048_576,
            readOnly: true,
            networking: false
        ) { configuration in
            configuration.cpus = 1
            configuration.memoryInBytes = 256 * 1_048_576
            configuration.interfaces = []
            configuration.sockets = []
            configuration.process.arguments = [
                "/usr/local/bin/bun",
                "-e",
                managementVsockProbe(hold: phase == .started),
            ]
            configuration.process.workingDirectory = "/tmp"
            configuration.process.user = User(uid: 1000, gid: 1000)
            configuration.process.noNewPrivileges = true
            configuration.process.capabilities = LinuxCapabilities()
            configuration.process.rlimits = [
                LinuxRLimit(kind: .numberOfProcesses, limit: 16),
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
        if phase == .object {
            try announce(
                phase,
                label: label,
                stateRoot: stateRoot,
                readyFile: readyFile,
                containerID: containerID
            )
            await holdForever()
        }

        try await container.create()
        if phase == .created {
            try announce(
                phase,
                label: label,
                stateRoot: stateRoot,
                readyFile: readyFile,
                containerID: containerID
            )
            await holdForever()
        }

        try await container.start()
        try await waitForMarker(writer, marker: "probeComplete", timeoutSeconds: 15)
        if phase == .started {
            try announce(
                phase,
                label: label,
                stateRoot: stateRoot,
                readyFile: readyFile,
                containerID: containerID,
                guestOutput: writer.snapshot()
            )
            await holdForever()
        }

        _ = try await container.wait(timeoutInSeconds: 20)
        if phase == .exited {
            try announce(
                phase,
                label: label,
                stateRoot: stateRoot,
                readyFile: readyFile,
                containerID: containerID,
                guestOutput: writer.snapshot()
            )
            await holdForever()
        }

        try await container.stop()
        try manager.delete(containerID)
        try announce(
            phase,
            label: label,
            stateRoot: stateRoot,
            readyFile: readyFile,
            containerID: containerID,
            guestOutput: writer.snapshot()
        )
        await holdForever()
    }

    private static func reconcile(kernel: URL, stateRoot: URL) async throws {
        try validateRoot(stateRoot)
        guard FileManager.default.isReadableFile(atPath: kernel.path) else {
            throw ProbeError.failed("kernel is not readable")
        }
        _ = try await ContainerManager(
            kernel: Kernel(path: kernel, platform: .linuxArm),
            initfsReference: initfsReference,
            root: stateRoot,
            network: nil
        )
        let containers = stateRoot.appendingPathComponent("containers", isDirectory: true)
        let names = (try? FileManager.default.contentsOfDirectory(
            at: containers,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ))?.map(\.lastPathComponent).sorted() ?? []
        printJSON([
            "artifactContainerIDs": names,
            "artifactCount": names.count,
            "managerRestarted": true,
            "runtimeEnumerationPerformed": false,
            "reason": "ContainerManager 0.33.3 exposes no public list/open/reconnect running-container API",
        ])
    }

    private static func cleanup(_ stateRoot: URL) throws {
        try validateRoot(stateRoot)
        try FileManager.default.removeItem(at: stateRoot)
        printJSON(["removed": stateRoot.path])
    }

    private static func cleanupRunRoot(_ runRoot: URL) throws {
        try validateRunRoot(runRoot)
        let stateRoot = runRoot.appendingPathComponent("state", isDirectory: true)
        guard !FileManager.default.fileExists(atPath: stateRoot.path) else {
            throw ProbeError.failed("refusing run-root cleanup while state root exists")
        }
        try FileManager.default.removeItem(at: runRoot)
        printJSON(["removedRunRoot": runRoot.path])
    }

    private static func announce(
        _ phase: HoldPhase,
        label: String,
        stateRoot: URL,
        readyFile: URL,
        containerID: String? = nil,
        guestOutput: String? = nil
    ) throws {
        let record = ReadyRecord(
            controllerPID: ProcessInfo.processInfo.processIdentifier,
            containerID: containerID,
            label: label,
            phase: phase.rawValue,
            stateRoot: stateRoot.path,
            guestOutput: guestOutput
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(record)
        try data.write(to: readyFile, options: [.atomic])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }

    private static func waitForMarker(
        _ writer: BoundedWriter,
        marker: String,
        timeoutSeconds: Int
    ) async throws {
        for _ in 0..<(timeoutSeconds * 10) {
            if writer.snapshot().contains(marker) {
                return
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        throw ProbeError.failed("timed out waiting for guest marker; output=\(writer.snapshot())")
    }

    private static func holdForever() async -> Never {
        while true {
            try? await Task.sleep(for: .seconds(60))
        }
    }

    private static func managementVsockProbe(hold: Bool) -> String {
        let suffix = hold ? "await Bun.sleep(600000);" : ""
        return #"""
        import { dlopen, FFIType, ptr } from "bun:ffi";
        import { existsSync, readFileSync } from "node:fs";
        const api=dlopen("libc.so.6",{
          socket:{args:[FFIType.i32,FFIType.i32,FFIType.i32],returns:FFIType.i32},
          connect:{args:[FFIType.i32,FFIType.ptr,FFIType.u32],returns:FFIType.i32},
          bind:{args:[FFIType.i32,FFIType.ptr,FFIType.u32],returns:FFIType.i32},
          getsockname:{args:[FFIType.i32,FFIType.ptr,FFIType.ptr],returns:FFIType.i32},
          getsockopt:{args:[FFIType.i32,FFIType.i32,FFIType.i32,FFIType.ptr,FFIType.ptr],returns:FFIType.i32},
          fcntl:{args:[FFIType.i32,FFIType.i32,FFIType.i32],returns:FFIType.i32},
          poll:{args:[FFIType.ptr,FFIType.u64,FFIType.i32],returns:FFIType.i32},
          close:{args:[FFIType.i32],returns:FFIType.i32}
        });
        function address(cid,port){const b=new Uint8Array(16);const v=new DataView(b.buffer);v.setUint16(0,40,true);v.setUint32(4,port,true);v.setUint32(8,cid,true);return b;}
        function local(){const fd=api.symbols.socket(40,1,0);if(fd<0)return {socket:fd};const a=address(0xffffffff,0xffffffff);const br=api.symbols.bind(fd,ptr(a),16);const n=new Uint8Array(16);const l=new Uint8Array(4);new DataView(l.buffer).setUint32(0,16,true);const gr=api.symbols.getsockname(fd,ptr(n),ptr(l));api.symbols.close(fd);return {bind:br,get:gr,cid:new DataView(n.buffer).getUint32(8,true),port:new DataView(n.buffer).getUint32(4,true)};}
        function connect(cid){const fd=api.symbols.socket(40,1,0);if(fd<0)return {cid,socket:fd};api.symbols.fcntl(fd,4,2048);const a=address(cid,1024);const cr=api.symbols.connect(fd,ptr(a),16);const p=new Uint8Array(8);const pv=new DataView(p.buffer);pv.setInt32(0,fd,true);pv.setInt16(4,4,true);const pr=api.symbols.poll(ptr(p),1,150);const e=new Uint8Array(4);const l=new Uint8Array(4);new DataView(l.buffer).setUint32(0,4,true);const gr=api.symbols.getsockopt(fd,1,4,ptr(e),ptr(l));const se=new DataView(e.buffer).getInt32(0,true);api.symbols.close(fd);return {cid,connect:cr,poll:pr,revents:pv.getInt16(6,true),getsockopt:gr,socketError:se,connected:pr>0&&gr===0&&se===0};}
        const own=local();const cids=[0,1,2];if(Number.isInteger(own.cid)&&own.cid>2&&own.cid<0xffffffff)cids.push(own.cid);for(let i=3;i<=16;i++)if(!cids.includes(i))cids.push(i);
        let proc="unavailable";try{proc=readFileSync("/proc/net/vsock","utf8")}catch(e){proc=String(e)}
        console.log(JSON.stringify({probe:"management-vsock",uid:process.getuid(),gid:process.getgid(),device:existsSync("/dev/vsock"),proc,own,port:1024,connections:cids.map(connect)}));
        console.log("probeComplete");api.close();
        """# + suffix
    }

    private static func checkedURL(_ path: String, mustExist: Bool) throws -> URL {
        let url = URL(fileURLWithPath: path).standardizedFileURL
        let matchingPrefix = statePrefixes.first { url.path.hasPrefix($0) }
        guard let matchingPrefix, url.path.count > matchingPrefix.count else {
            throw ProbeError.failed(
                "refusing path outside /private/tmp/capsule-gate-c-identity-*: \(url.path)"
            )
        }
        if mustExist, !FileManager.default.fileExists(atPath: url.path) {
            throw ProbeError.failed("path does not exist: \(url.path)")
        }
        return url
    }

    private static func checkedLabel(_ label: String) throws -> String {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-")
        guard (1...32).contains(label.count), label.unicodeScalars.allSatisfy(allowed.contains) else {
            throw ProbeError.failed("label must be 1-32 lowercase ASCII letters, digits, or hyphens")
        }
        return label
    }

    private static func validateRoot(_ stateRoot: URL) throws {
        let marker = markerURL(stateRoot)
        guard FileManager.default.isReadableFile(atPath: marker.path) else {
            throw ProbeError.failed("missing state-root marker")
        }
        let data = try Data(contentsOf: marker)
        guard data == Data(rootMarker.utf8) else {
            throw ProbeError.failed("invalid state-root marker")
        }
    }

    private static func validateRunRoot(_ runRoot: URL) throws {
        let marker = runMarkerURL(runRoot)
        guard FileManager.default.isReadableFile(atPath: marker.path) else {
            throw ProbeError.failed("missing run-root marker")
        }
        let data = try Data(contentsOf: marker)
        guard data == Data(runRootMarker.utf8) else {
            throw ProbeError.failed("invalid run-root marker")
        }
    }

    private static func markerURL(_ stateRoot: URL) -> URL {
        stateRoot.appendingPathComponent(".capsule-gate-c-identity-root", isDirectory: false)
    }

    private static func runMarkerURL(_ runRoot: URL) -> URL {
        runRoot.appendingPathComponent(".capsule-gate-c-identity-run-root", isDirectory: false)
    }

    private static func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private static func printJSON(_ value: Any) {
        let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        print(String(decoding: data, as: UTF8.self))
    }
}
