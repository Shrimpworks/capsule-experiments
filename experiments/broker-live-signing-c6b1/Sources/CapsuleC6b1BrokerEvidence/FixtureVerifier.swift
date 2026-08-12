import CryptoKit
import Foundation

enum EvidenceError: Error, Equatable, CustomStringConvertible {
  case malformed(String)
  case mismatch(String)
  case forbidden(String)

  var description: String {
    switch self {
    case .malformed(let value): return "MALFORMED:\(value)"
    case .mismatch(let value): return "MISMATCH:\(value)"
    case .forbidden(let value): return "FORBIDDEN:\(value)"
    }
  }
}

struct FixtureManifest: Decodable {
  struct Artifact: Decodable {
    let path: String
    let bytes: Int
    let sha256: String
  }

  struct Clock: Decodable {
    let issuedAt: UInt64
    let expiresAt: UInt64
    let liveUsePermitted: Bool
  }

  let objectType: String
  let objectVersion: Int
  let scope: String
  let capsuleCorpCommit: String
  let fixtureClock: Clock
  let replayIdentity: String
  let approvalLinearizationPoint: String
  let brokerDurableAuthority: Bool
  let candidateValuesOnly: [String]
  let fallbackPermitted: Bool
  let artifacts: [Artifact]
  let compositeSha256: String
}

struct FixtureVerification: Encodable {
  let status: String
  let fixtureCompositeSha256: String
  let artifactCount: Int
  let signer: String
  let durableAuthorityOwner: String
}

struct FixtureVerifier {
  static let capsuleCorpCommit = "88f3a2c1f968b1aa604ce14a2db4389822e5b193"

  let experimentRoot: URL

  func verify() throws -> FixtureVerification {
    let manifestData = try data("fixtures/manifest.json")
    let manifest = try JSONDecoder().decode(FixtureManifest.self, from: manifestData)
    guard manifest.objectType == "capsule.c6b1.fixture-manifest", manifest.objectVersion == 0 else {
      throw EvidenceError.malformed("fixture-manifest-type")
    }
    guard manifest.capsuleCorpCommit == Self.capsuleCorpCommit else {
      throw EvidenceError.mismatch("capsule-corp-commit")
    }
    guard manifest.scope == "unsigned-no-credential-no-install-no-product-consumer",
      manifest.replayIdentity == "canonical-payload+resolved-signer-authorization-identity",
      manifest.approvalLinearizationPoint == "supervisor-durable-submit-approval-commit",
      !manifest.brokerDurableAuthority,
      !manifest.fallbackPermitted,
      !manifest.fixtureClock.liveUsePermitted,
      manifest.fixtureClock.expiresAt - manifest.fixtureClock.issuedAt == 300
    else {
      throw EvidenceError.forbidden("authority-or-live-use-boundary")
    }
    guard
      manifest.candidateValuesOnly == [
        "kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly",
        "kSecKeyAlgorithmECDSASignatureMessageRFC4754SHA256",
      ]
    else {
      throw EvidenceError.mismatch("candidate-values")
    }
    for artifact in manifest.artifacts {
      let content = try data(artifact.path)
      guard content.count == artifact.bytes else {
        throw EvidenceError.mismatch("size:\(artifact.path)")
      }
      guard sha256Hex(content) == artifact.sha256 else {
        throw EvidenceError.mismatch("sha256:\(artifact.path)")
      }
    }

    try verifyProjection()
    let authorization = try verifyAuthorization(data("fixtures/key-authorization.json"))
    try verifySupervisorSeam()
    try verifyKnownAnswer(publicX: authorization.x, publicY: authorization.y)

    return FixtureVerification(
      status: "PASSED",
      fixtureCompositeSha256: manifest.compositeSha256,
      artifactCount: manifest.artifacts.count,
      signer: "retained-public-test-vector-no-private-key",
      durableAuthorityOwner: "execution-supervisor"
    )
  }

  func verifyAuthorization(_ content: Data) throws -> (x: Data, y: Data) {
    guard let object = try JSONSerialization.jsonObject(with: content) as? [String: Any] else {
      throw EvidenceError.malformed("authorization-json")
    }
    func string(_ key: String) throws -> String {
      guard let value = object[key] as? String else {
        throw EvidenceError.malformed("authorization:\(key)")
      }
      return value
    }
    guard try string("objectType") == "capsule.c6b1.test-key-authorization",
      (object["objectVersion"] as? Int) == 0,
      try string("authorityClass") == "public-test-vector-only-not-installed-authority",
      try string("teamId") == "3DDR84M4JS",
      try string("brokerRole") == "capsule.role.approval-broker/v0",
      try string("requestedAccessGroup")
        == "3DDR84M4JS.com.capsulecorp.capsule.broker.approval.epoch-7",
      try string("purpose") == "capsule.plan.approve",
      try string("audience") == "capsule.execution-supervisor",
      try string("contextPolicy") == "fresh-nonreused-one-sign-budget",
      (object["active"] as? Bool) == true,
      (object["noFallback"] as? Bool) == true,
      (object["privateKeyPresent"] as? Bool) == false,
      (object["credentialPresent"] as? Bool) == false
    else {
      throw EvidenceError.forbidden("authorization-policy")
    }
    guard (object["accessControlRequired"] as? [String]) == ["userPresence", "privateKeyUsage"]
    else {
      throw EvidenceError.mismatch("access-control")
    }
    let x = try hex(try string("publicKeyX"))
    let y = try hex(try string("publicKeyY"))
    guard x.count == 32, y.count == 32 else {
      throw EvidenceError.malformed("public-key-coordinate")
    }
    let coseKey = try data("fixtures/cose-key.cbor")
    guard coseKey.count == 77, sha256Hex(coseKey) == (try string("kid")),
      sha256Hex(coseKey) == (try string("coseKeySha256"))
    else {
      throw EvidenceError.mismatch("cose-key-or-kid")
    }
    return (x, y)
  }

  private func verifyProjection() throws {
    guard
      let object = try JSONSerialization.jsonObject(with: data("fixtures/projection.json"))
        as? [String: Any],
      object["objectType"] as? String == "capsule.c6b1.broker-projection-fixture",
      object["objectVersion"] as? Int == 0,
      object["planDigest"] as? String == sha256Hex(try data("fixtures/execution-plan.cbor")),
      object["registrationId"] as? String == String(repeating: "77", count: 16),
      object["installationId"] as? String == String(repeating: "11", count: 16),
      object["epochDigest"] as? String == String(repeating: "22", count: 32),
      object["supervisorId"] as? String == String(repeating: "55", count: 16),
      let source = object["source"] as? [String: Any],
      source["contentDigest"] as? String == sha256Hex(try data("fixtures/main.mjs")),
      source["manifestDigest"] as? String == sha256Hex(try data("fixtures/source-manifest.cbor")),
      source["escapedExactContent"] as? String
        == "export default function (value) { return value; }\\n",
      let inline = object["inlineJson"] as? [String: Any],
      inline["contentBytesShown"] as? Bool == false,
      let interaction = object["interaction"] as? [String: Any],
      interaction["approvalEligible"] as? Bool == false,
      interaction["focusIsApprovalEvidence"] as? Bool == false,
      interaction["syntheticInputIsApprovalEvidence"] as? Bool == false
    else {
      throw EvidenceError.mismatch("projection")
    }
  }

  private func verifySupervisorSeam() throws {
    guard
      let object = try JSONSerialization.jsonObject(
        with: data("interfaces/supervisor-seam-v0.json")) as? [String: Any],
      object["protocol"] as? String == "capsule.c6b1.supervisor-evidence-seam/v0",
      object["authorityOwner"] as? String == "execution-supervisor",
      object["brokerAuthority"] as? String == "bounded-process-memory-only",
      object["productConsumer"] as? Bool == false,
      object["installedListener"] as? Bool == false,
      let operations = object["operations"] as? [[String: Any]],
      operations.map({ $0["name"] as? String }) == [
        "FetchRegisteredPlanV0", "SubmitApprovalV0", "RequestAttemptV0",
      ],
      operations[1]["linearizationPoint"] as? String == "supervisor-durable-approval-commit",
      operations[1]["brokerJournalPermitted"] as? Bool == false,
      operations[2]["secondAttemptPermitted"] as? Bool == false
    else {
      throw EvidenceError.forbidden("supervisor-seam")
    }
  }

  private func verifyKnownAnswer(publicX: Data, publicY: Data) throws {
    let rawPublicKey = Data([0x04]) + publicX + publicY
    let key = try P256.Signing.PublicKey(x963Representation: rawPublicKey)
    let signatureBytes = try data("fixtures/signature.raw")
    guard signatureBytes.count == 64 else { throw EvidenceError.malformed("signature-size") }
    let signature = try P256.Signing.ECDSASignature(rawRepresentation: signatureBytes)
    let message = try data("fixtures/sig-structure.cbor")
    guard key.isValidSignature(signature, for: message) else {
      throw EvidenceError.mismatch("signature")
    }

    let protectedHeader = try data("fixtures/protected-header.cbor")
    let payload = try data("fixtures/approval-payload.cbor")
    let envelope = try data("fixtures/approval-envelope.cose")
    guard CBOR.signatureStructure(protectedHeader: protectedHeader, payload: payload) == message,
      CBOR.envelope(protectedHeader: protectedHeader, payload: payload, signature: signatureBytes)
        == envelope
    else {
      throw EvidenceError.mismatch("cose-composition")
    }
  }

  private func data(_ path: String) throws -> Data {
    do { return try Data(contentsOf: experimentRoot.appendingPathComponent(path)) } catch {
      throw EvidenceError.malformed("missing:\(path)")
    }
  }
}

func sha256Hex(_ content: Data) -> String {
  SHA256.hash(data: content).map { String(format: "%02x", $0) }.joined()
}

func hex(_ value: String) throws -> Data {
  guard value.count.isMultiple(of: 2) else { throw EvidenceError.malformed("hex-length") }
  var result = Data(capacity: value.count / 2)
  var index = value.startIndex
  while index < value.endIndex {
    let next = value.index(index, offsetBy: 2)
    guard let byte = UInt8(value[index..<next], radix: 16) else {
      throw EvidenceError.malformed("hex-byte")
    }
    result.append(byte)
    index = next
  }
  return result
}

enum CBOR {
  static func signatureStructure(protectedHeader: Data, payload: Data) -> Data {
    array([text("Signature1"), bytes(protectedHeader), bytes(Data()), bytes(payload)])
  }

  static func envelope(protectedHeader: Data, payload: Data, signature: Data) -> Data {
    tag(18, array([bytes(protectedHeader), map([]), bytes(payload), bytes(signature)]))
  }

  private static func length(_ major: UInt8, _ value: Int) -> Data {
    precondition(value >= 0)
    if value < 24 { return Data([(major << 5) | UInt8(value)]) }
    if value <= 0xff { return Data([(major << 5) | 24, UInt8(value)]) }
    if value <= 0xffff {
      let number = UInt16(value).bigEndian
      return Data([(major << 5) | 25]) + withUnsafeBytes(of: number) { Data($0) }
    }
    let number = UInt32(value).bigEndian
    return Data([(major << 5) | 26]) + withUnsafeBytes(of: number) { Data($0) }
  }

  private static func bytes(_ value: Data) -> Data { length(2, value.count) + value }
  private static func text(_ value: String) -> Data {
    let content = Data(value.utf8)
    return length(3, content.count) + content
  }
  private static func array(_ values: [Data]) -> Data {
    length(4, values.count) + values.reduce(Data(), +)
  }
  private static func map(_ values: [Data]) -> Data {
    length(5, values.count) + values.reduce(Data(), +)
  }
  private static func tag(_ value: Int, _ content: Data) -> Data { length(6, value) + content }
}
