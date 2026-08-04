// Development-only Gate E probe. This is not a Capsule security boundary.
import Foundation
import Security
import XPC

struct ProbeResult: Codable {
    let language: String
    let validCodeRequirementStatus: Int32
    let malformedCodeRequirementStatus: Int32
    let sameTeamRequirementStatus: Int32
    let selfDynamicCodeValidityStatus: Int32
}

private func codeRequirementStatus(_ requirement: String) -> Int32 {
    let connection = xpc_connection_create(nil, nil)
    let status = requirement.withCString {
        xpc_connection_set_peer_code_signing_requirement(connection, $0)
    }
    xpc_connection_set_event_handler(connection) { _ in }
    xpc_connection_activate(connection)
    xpc_connection_cancel(connection)
    return status
}

private func sameTeamRequirementStatus(_ signingIdentifier: String) -> Int32 {
    let connection = xpc_connection_create(nil, nil)
    let status = signingIdentifier.withCString {
        xpc_connection_set_peer_team_identity_requirement(connection, $0)
    }
    xpc_connection_set_event_handler(connection) { _ in }
    xpc_connection_activate(connection)
    xpc_connection_cancel(connection)
    return status
}

private func selfDynamicCodeValidityStatus() -> Int32 {
    var code: SecCode?
    let copyStatus = SecCodeCopySelf(SecCSFlags(rawValue: 0), &code)
    guard copyStatus == errSecSuccess, let code else {
        return copyStatus
    }
    return SecCodeCheckValidity(code, SecCSFlags(rawValue: 0), nil)
}

@main
enum PlatformProbe {
    static func main() throws {
        let result = ProbeResult(
            language: "swift",
            validCodeRequirementStatus: codeRequirementStatus(
                "anchor apple generic and identifier \"com.example.capsule.peer\""
            ),
            malformedCodeRequirementStatus: codeRequirementStatus("this is not a code requirement"),
            sameTeamRequirementStatus: sameTeamRequirementStatus("com.example.capsule.peer"),
            selfDynamicCodeValidityStatus: selfDynamicCodeValidityStatus()
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        FileHandle.standardOutput.write(try encoder.encode(result))
        FileHandle.standardOutput.write(Data([0x0a]))

        guard result.validCodeRequirementStatus == 0 else {
            throw ProbeFailure("the SDK rejected a syntactically valid peer code requirement")
        }
        guard result.malformedCodeRequirementStatus != 0 else {
            throw ProbeFailure("the SDK accepted a malformed peer code requirement")
        }
        guard result.sameTeamRequirementStatus == 0 else {
            throw ProbeFailure("the SDK rejected a syntactically valid same-team requirement")
        }
    }
}

struct ProbeFailure: Error, CustomStringConvertible {
    let description: String

    init(_ description: String) {
        self.description = description
    }
}
