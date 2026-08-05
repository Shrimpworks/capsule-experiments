import AppKit

private struct InstallationFact {
    let label: String
    let value: String
}

@main
final class CapsuleStatusApp: NSObject, NSApplicationDelegate {
    private var window: NSWindow?

    static func main() {
        let application = NSApplication.shared
        let delegate = CapsuleStatusApp()
        application.setActivationPolicy(.regular)
        application.delegate = delegate
        application.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let facts = [
            InstallationFact(label: "Checkpoint", value: "I1A unsigned construction"),
            InstallationFact(label: "Profile", value: "capsule.macos-installation.no-guest/i0"),
            InstallationFact(label: "Bundle roles", value: "7 required roles assembled"),
            InstallationFact(label: "Intended development team", value: "3DDR84M4JS (inactive)"),
            InstallationFact(label: "Apple signing", value: "Inactive — no identity or profile"),
            InstallationFact(label: "Service registration", value: "Inactive"),
            InstallationFact(label: "Bootstrap and trust epoch", value: "Inactive"),
            InstallationFact(label: "Execution", value: "DISABLED"),
        ]

        let content = NSStackView()
        content.orientation = .vertical
        content.alignment = .leading
        content.spacing = 14
        content.edgeInsets = NSEdgeInsets(top: 28, left: 32, bottom: 28, right: 32)

        let title = NSTextField(labelWithString: "Capsule Setup Status")
        title.font = .systemFont(ofSize: 24, weight: .semibold)
        content.addArrangedSubview(title)

        let checkpoint = NSTextField(labelWithString: "UNSIGNED CONSTRUCTION CHECKPOINT")
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
            wrappingLabelWithString: "This shell cannot approve or run work. It has no activation controls, and execution remains permanently disabled in I1A."
        )
        refusal.font = .systemFont(ofSize: 13, weight: .semibold)
        refusal.textColor = .systemRed
        refusal.maximumNumberOfLines = 3
        content.addArrangedSubview(refusal)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 460),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Capsule — Unsigned Construction"
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
