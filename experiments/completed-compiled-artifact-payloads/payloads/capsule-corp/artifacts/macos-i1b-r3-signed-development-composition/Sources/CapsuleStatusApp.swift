import AppKit
import ServiceManagement

private struct InstallationFact {
    let label: String
    let value: String
}

private func serviceStatusName(_ status: SMAppService.Status) -> String {
    switch status {
    case .notRegistered: return "not-registered"
    case .enabled: return "enabled"
    case .requiresApproval: return "requires-approval"
    case .notFound: return "not-found"
    @unknown default: return "unknown"
    }
}

private func service(_ name: String) -> SMAppService {
    SMAppService.agent(plistName: name)
}

private func runCommand(_ argument: String) -> Int32? {
    let daemon = service("com.capsulecorp.capsule.daemon.plist")
    let supervisor = service("com.capsulecorp.capsule.supervisor.plist")
    switch argument {
    case "--probe-source-validator":
        guard capsule_run_private_scratch_cleanup("com.capsulecorp.capsule.broker") == 0 else {
            return 70
        }
        return Int32(capsule_run_source_validator_probe())
    case "--print-disabled-status":
        guard capsule_run_private_scratch_cleanup("com.capsulecorp.capsule.broker") == 0 else {
            return 70
        }
        print("{\"role\":\"broker-status-app\",\"execution\":\"disabled\",\"attempts\":\"disabled\",\"backend\":\"absent\",\"guest\":\"absent\",\"privateScratchCleanup\":\"passed\"}")
        return 0
    case "--service-status":
        print("{\"daemon\":\"\(serviceStatusName(daemon.status))\",\"supervisor\":\"\(serviceStatusName(supervisor.status))\",\"execution\":\"disabled\"}")
        return 0
    case "--register-services":
        do {
            try daemon.register()
            try supervisor.register()
            print("{\"daemon\":\"\(serviceStatusName(daemon.status))\",\"supervisor\":\"\(serviceStatusName(supervisor.status))\",\"execution\":\"disabled\"}")
            return 0
        } catch {
            fputs("Capsule service registration refused\n", stderr)
            return 70
        }
    case "--unregister-services":
        var failed = false
        do { try daemon.unregister() } catch { failed = true }
        do { try supervisor.unregister() } catch { failed = true }
        print("{\"daemon\":\"\(serviceStatusName(daemon.status))\",\"supervisor\":\"\(serviceStatusName(supervisor.status))\",\"execution\":\"disabled\"}")
        return failed ? 70 : 0
    default:
        return nil
    }
}

@main
final class CapsuleStatusApp: NSObject, NSApplicationDelegate {
    private var window: NSWindow?

    static func main() {
        if CommandLine.arguments.count == 2 {
            guard let result = runCommand(CommandLine.arguments[1]) else {
                fputs("Capsule status app refuses unknown operation\n", stderr)
                exit(64)
            }
            exit(result)
        }
        if CommandLine.arguments.count != 1 {
            fputs("Capsule status app refuses unexpected arguments\n", stderr)
            exit(64)
        }
        let application = NSApplication.shared
        let delegate = CapsuleStatusApp()
        application.setActivationPolicy(.regular)
        application.delegate = delegate
        application.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let facts = [
            InstallationFact(label: "Checkpoint", value: "I1B / Source Validator R3"),
            InstallationFact(label: "Profile", value: "capsule.macos-installation.no-guest/i0"),
            InstallationFact(label: "Bundle roles", value: "7 exact execution-disabled roles"),
            InstallationFact(label: "Development team", value: "3DDR84M4JS"),
            InstallationFact(label: "Distribution", value: "Apple Development only"),
            InstallationFact(label: "Bootstrap and trust epoch", value: "Absent"),
            InstallationFact(label: "Runtime / backend / guest", value: "Absent / absent / absent"),
            InstallationFact(label: "Execution", value: "DISABLED"),
        ]

        let content = NSStackView()
        content.orientation = .vertical
        content.alignment = .leading
        content.spacing = 14
        content.edgeInsets = NSEdgeInsets(top: 28, left: 32, bottom: 28, right: 32)

        let title = NSTextField(labelWithString: "Capsule Development Setup Status")
        title.font = .systemFont(ofSize: 24, weight: .semibold)
        content.addArrangedSubview(title)

        let checkpoint = NSTextField(labelWithString: "SIGNED DEVELOPMENT CHECKPOINT — EXECUTION DISABLED")
        checkpoint.font = .systemFont(ofSize: 13, weight: .bold)
        checkpoint.textColor = .systemOrange
        content.addArrangedSubview(checkpoint)

        for fact in facts {
            let row = NSStackView()
            row.orientation = .horizontal
            row.alignment = .firstBaseline
            row.spacing = 12

            let label = NSTextField(labelWithString: fact.label)
            label.font = .systemFont(ofSize: 13, weight: .medium)
            label.textColor = .secondaryLabelColor
            label.widthAnchor.constraint(equalToConstant: 190).isActive = true

            let value = NSTextField(labelWithString: fact.value)
            value.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
            value.maximumNumberOfLines = 2
            value.lineBreakMode = .byWordWrapping

            row.addArrangedSubview(label)
            row.addArrangedSubview(value)
            content.addArrangedSubview(row)
        }

        let refusal = NSTextField(
            wrappingLabelWithString: "This development shell cannot approve or execute work. It exposes no attempt, runtime, backend, guest, bootstrap, key, or authority-store operation."
        )
        refusal.font = .systemFont(ofSize: 13, weight: .semibold)
        refusal.textColor = .systemRed
        refusal.maximumNumberOfLines = 3
        content.addArrangedSubview(refusal)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 700, height: 480),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Capsule — Signed Development Checkpoint"
        window.contentView = content
        window.center()
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        self.window = window
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
