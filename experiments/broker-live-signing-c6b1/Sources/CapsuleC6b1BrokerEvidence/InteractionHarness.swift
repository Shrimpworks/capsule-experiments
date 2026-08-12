import Foundation

enum InteractionState: String, Equatable {
  case idle = "IDLE"
  case fetched = "FETCHED"
  case rendered = "RENDERED"
  case authorizing = "AUTHORIZING"
  case authorized = "AUTHORIZED"
  case signing = "SIGNING"
  case signedLocalOK = "SIGNED_LOCAL_OK"
  case submitting = "SUBMITTING"
  case supervisorCommitted = "SUPERVISOR_COMMITTED"
  case replied = "REPLIED"
  case canceled = "CANCELED"
  case refused = "REFUSED"
  case failed = "FAILED"
}

struct RetainedSignatureDouble {
  let expectedMessageDigest: String
  let signature: Data
  private(set) var calls = 0

  mutating func sign(_ message: Data) throws -> Data {
    guard calls == 0 else { throw EvidenceError.forbidden("second-sign-call") }
    guard sha256Hex(message) == expectedMessageDigest else {
      throw EvidenceError.mismatch("signing-message")
    }
    calls += 1
    return signature
  }
}

struct InteractionHarness {
  private(set) var state: InteractionState = .idle
  private(set) var generation: UInt64 = 0
  private(set) var signBudget = 0
  private(set) var contextActive = false

  mutating func begin() throws -> UInt64 {
    guard state == .idle else { throw EvidenceError.forbidden("busy") }
    generation += 1
    state = .fetched
    state = .rendered
    state = .authorizing
    contextActive = true
    signBudget = 1
    return generation
  }

  mutating func authenticationSucceeded(generation observed: UInt64) throws {
    try requireCurrent(observed)
    guard state == .authorizing, contextActive else {
      throw EvidenceError.forbidden("authentication-state")
    }
    state = .authorized
  }

  mutating func sign(
    generation observed: UInt64, message: Data, signer: inout RetainedSignatureDouble
  ) throws -> Data {
    try requireCurrent(observed)
    guard state == .authorized, contextActive, signBudget == 1 else {
      throw EvidenceError.forbidden("sign-state-or-budget")
    }
    signBudget = 0
    state = .signing
    do {
      let signature = try signer.sign(message)
      contextActive = false
      state = .signedLocalOK
      return signature
    } catch {
      contextActive = false
      state = .failed
      throw error
    }
  }

  mutating func submitted(generation observed: UInt64) throws {
    try requireCurrent(observed)
    guard state == .signedLocalOK, !contextActive else {
      throw EvidenceError.forbidden("submit-state")
    }
    state = .submitting
  }

  mutating func supervisorCommitted(generation observed: UInt64) throws {
    try requireCurrent(observed)
    guard state == .submitting else { throw EvidenceError.forbidden("commit-state") }
    state = .supervisorCommitted
  }

  mutating func replied(generation observed: UInt64) throws {
    try requireCurrent(observed)
    guard state == .supervisorCommitted else { throw EvidenceError.forbidden("reply-state") }
    state = .replied
  }

  mutating func cancel(generation observed: UInt64) throws {
    try requireCurrent(observed)
    guard ![.replied, .canceled, .refused, .failed].contains(state) else {
      throw EvidenceError.forbidden("terminal-cancel")
    }
    contextActive = false
    signBudget = 0
    state = .canceled
  }

  private func requireCurrent(_ observed: UInt64) throws {
    guard observed == generation else { throw EvidenceError.forbidden("stale-generation") }
  }
}
