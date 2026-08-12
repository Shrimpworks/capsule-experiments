import CryptoKit
import Foundation
import Testing

@testable import CapsuleC6b1BrokerEvidence

private let experimentRoot = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .deletingLastPathComponent()
  .deletingLastPathComponent()

@Test func verifiesClosedUnsignedFixture() throws {
  let result = try FixtureVerifier(experimentRoot: experimentRoot).verify()
  #expect(result.status == "PASSED")
  #expect(result.artifactCount == 13)
  #expect(result.durableAuthorityOwner == "execution-supervisor")
}

@Test func authorizationSubstitutionsRefuse() throws {
  let url = experimentRoot.appendingPathComponent("fixtures/key-authorization.json")
  let original = try Data(contentsOf: url)
  let verifier = FixtureVerifier(experimentRoot: experimentRoot)
  for (field, replacement) in [
    ("teamId", "WRONGTEAM"),
    ("brokerRole", "capsule.role.daemon/v0"),
    ("requestedAccessGroup", "3DDR84M4JS.wrong"),
    ("purpose", "capsule.plan.execute"),
    ("audience", "capsule.execution-daemon"),
    ("contextPolicy", "reused"),
  ] {
    var object = try #require(JSONSerialization.jsonObject(with: original) as? [String: Any])
    object[field] = replacement
    let candidate = try JSONSerialization.data(withJSONObject: object)
    #expect(throws: EvidenceError.self) { try verifier.verifyAuthorization(candidate) }
  }
  for field in ["active", "noFallback"] {
    var object = try #require(JSONSerialization.jsonObject(with: original) as? [String: Any])
    object[field] = false
    let candidate = try JSONSerialization.data(withJSONObject: object)
    #expect(throws: EvidenceError.self) { try verifier.verifyAuthorization(candidate) }
  }
  for field in ["privateKeyPresent", "credentialPresent"] {
    var object = try #require(JSONSerialization.jsonObject(with: original) as? [String: Any])
    object[field] = true
    let candidate = try JSONSerialization.data(withJSONObject: object)
    #expect(throws: EvidenceError.self) { try verifier.verifyAuthorization(candidate) }
  }
}

@Test func retainedPublicKeyRejectsMessageAndSignatureMutation() throws {
  let authorization = try #require(
    JSONSerialization.jsonObject(
      with: Data(
        contentsOf: experimentRoot.appendingPathComponent("fixtures/key-authorization.json"))
    ) as? [String: Any]
  )
  let x = try hex(try #require(authorization["publicKeyX"] as? String))
  let y = try hex(try #require(authorization["publicKeyY"] as? String))
  let key = try P256.Signing.PublicKey(x963Representation: Data([4]) + x + y)
  let signatureBytes = try Data(
    contentsOf: experimentRoot.appendingPathComponent("fixtures/signature.raw"))
  let signature = try P256.Signing.ECDSASignature(rawRepresentation: signatureBytes)
  var message = try Data(
    contentsOf: experimentRoot.appendingPathComponent("fixtures/sig-structure.cbor"))
  #expect(key.isValidSignature(signature, for: message))
  message[message.startIndex] ^= 1
  #expect(!key.isValidSignature(signature, for: message))
  var changedSignature = signatureBytes
  changedSignature[changedSignature.startIndex] ^= 1
  let mutated = try P256.Signing.ECDSASignature(rawRepresentation: changedSignature)
  let originalMessage = try Data(
    contentsOf: experimentRoot.appendingPathComponent("fixtures/sig-structure.cbor"))
  #expect(!key.isValidSignature(mutated, for: originalMessage))
}

@Test func interactionConsumesOneSignBudgetAndRejectsLateCallbacks() throws {
  let message = try Data(
    contentsOf: experimentRoot.appendingPathComponent("fixtures/sig-structure.cbor"))
  let signature = try Data(
    contentsOf: experimentRoot.appendingPathComponent("fixtures/signature.raw"))
  var signer = RetainedSignatureDouble(
    expectedMessageDigest: sha256Hex(message), signature: signature)
  var harness = InteractionHarness()
  let generation = try harness.begin()
  try harness.authenticationSucceeded(generation: generation)
  #expect(try harness.sign(generation: generation, message: message, signer: &signer) == signature)
  #expect(signer.calls == 1)
  #expect(harness.signBudget == 0)
  #expect(!harness.contextActive)
  #expect(throws: EvidenceError.self) {
    try harness.sign(generation: generation, message: message, signer: &signer)
  }
  try harness.submitted(generation: generation)
  try harness.supervisorCommitted(generation: generation)
  try harness.replied(generation: generation)
  #expect(harness.state == .replied)
  #expect(throws: EvidenceError.self) { try harness.cancel(generation: generation) }
  #expect(throws: EvidenceError.self) {
    try harness.authenticationSucceeded(generation: generation - 1)
  }
}

@Test func cancellationClearsContextAndBudget() throws {
  var harness = InteractionHarness()
  let generation = try harness.begin()
  try harness.cancel(generation: generation)
  #expect(harness.state == .canceled)
  #expect(harness.signBudget == 0)
  #expect(!harness.contextActive)
}

@Test func signingFailureClearsContextAndBudget() throws {
  let message = try Data(
    contentsOf: experimentRoot.appendingPathComponent("fixtures/sig-structure.cbor"))
  let signature = try Data(
    contentsOf: experimentRoot.appendingPathComponent("fixtures/signature.raw"))
  var signer = RetainedSignatureDouble(
    expectedMessageDigest: sha256Hex(message), signature: signature)
  var harness = InteractionHarness()
  let generation = try harness.begin()
  try harness.authenticationSucceeded(generation: generation)
  var changed = message
  changed[changed.startIndex] ^= 1
  #expect(throws: EvidenceError.self) {
    try harness.sign(generation: generation, message: changed, signer: &signer)
  }
  #expect(harness.state == .failed)
  #expect(harness.signBudget == 0)
  #expect(!harness.contextActive)
}
