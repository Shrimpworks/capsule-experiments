import CBOR
import CryptoKit
import Foundation

private let coseSign1Tag: UInt = 18
private let es256 = -7
private let maxEnvelopeBytes = 4_096
private let maxProtectedBytes = 256
private let maxPayloadBytes = 2_048
private let maxSafeInteger: UInt64 = 9_007_199_254_740_991

enum Kind: String, Codable {
    case approvalGrant = "approval-grant"
    case enforcementTranscript = "enforcement-transcript"

    var contentType: String {
        switch self {
        case .approvalGrant: "application/capsule.approval-grant+cbor;v=0"
        case .enforcementTranscript: "application/capsule.enforcement-transcript+cbor;v=0"
        }
    }

    var keyID: Data {
        Data((self == .approvalGrant ? "approval-test-key" : "supervisor-test-key").utf8)
    }
}

enum ProbeFailure: Error, CustomStringConvertible {
    case failed(String)
    var description: String { if case let .failed(message) = self { message } else { "failure" } }
}

private struct CBORByteString: Decodable {
    let value: Data
    init(from decoder: any Decoder) throws {
        value = try decoder.singleValueContainer().decode(Data.self)
    }
}

struct ApprovalGrant: Codable, Equatable {
    let objectType: String
    let objectVersion: UInt64
    let installation: Data
    let epochDigest: Data
    let registration: Data
    let planDigest: Data
    let supervisor: Data
    let attemptNonce: Data
    let purpose: String
    let audience: String
    let issuedAt: UInt64
    let expiresAt: UInt64

    enum CodingKeys: Int, CodingKey, CaseIterable {
        case objectType = 1, objectVersion = 2, installation = 3, epochDigest = 4
        case registration = 5, planDigest = 6, supervisor = 7, attemptNonce = 8
        case purpose = 9, audience = 10, issuedAt = 11, expiresAt = 12
    }

    init(objectType: String, objectVersion: UInt64, installation: Data, epochDigest: Data,
         registration: Data, planDigest: Data, supervisor: Data, attemptNonce: Data,
         purpose: String, audience: String, issuedAt: UInt64, expiresAt: UInt64) {
        self.objectType = objectType; self.objectVersion = objectVersion; self.installation = installation
        self.epochDigest = epochDigest; self.registration = registration; self.planDigest = planDigest
        self.supervisor = supervisor; self.attemptNonce = attemptNonce; self.purpose = purpose
        self.audience = audience; self.issuedAt = issuedAt; self.expiresAt = expiresAt
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard c.allKeys.count == CodingKeys.allCases.count else { throw ProbeFailure.failed("ApprovalGrant field set") }
        objectType = try c.decode(String.self, forKey: .objectType)
        objectVersion = try c.decode(UInt64.self, forKey: .objectVersion)
        installation = try c.decode(CBORByteString.self, forKey: .installation).value
        epochDigest = try c.decode(CBORByteString.self, forKey: .epochDigest).value
        registration = try c.decode(CBORByteString.self, forKey: .registration).value
        planDigest = try c.decode(CBORByteString.self, forKey: .planDigest).value
        supervisor = try c.decode(CBORByteString.self, forKey: .supervisor).value
        attemptNonce = try c.decode(CBORByteString.self, forKey: .attemptNonce).value
        purpose = try c.decode(String.self, forKey: .purpose)
        audience = try c.decode(String.self, forKey: .audience)
        issuedAt = try c.decode(UInt64.self, forKey: .issuedAt)
        expiresAt = try c.decode(UInt64.self, forKey: .expiresAt)
    }
}

struct EnforcementTranscript: Codable, Equatable {
    let objectType: String
    let objectVersion: UInt64
    let installation: Data
    let epochDigest: Data
    let registration: Data
    let attemptID: Data
    let planDigest: Data
    let eventRoot: Data
    let purpose: String
    let audience: String
    let terminalState: String
    let teardownState: String
    let finishedAt: UInt64

    enum CodingKeys: Int, CodingKey, CaseIterable {
        case objectType = 1, objectVersion = 2, installation = 3, epochDigest = 4
        case registration = 5, attemptID = 6, planDigest = 7, eventRoot = 8
        case purpose = 9, audience = 10, terminalState = 11, teardownState = 12, finishedAt = 13
    }

    init(objectType: String, objectVersion: UInt64, installation: Data, epochDigest: Data,
         registration: Data, attemptID: Data, planDigest: Data, eventRoot: Data,
         purpose: String, audience: String, terminalState: String, teardownState: String,
         finishedAt: UInt64) {
        self.objectType = objectType; self.objectVersion = objectVersion; self.installation = installation
        self.epochDigest = epochDigest; self.registration = registration; self.attemptID = attemptID
        self.planDigest = planDigest; self.eventRoot = eventRoot; self.purpose = purpose
        self.audience = audience; self.terminalState = terminalState; self.teardownState = teardownState
        self.finishedAt = finishedAt
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard c.allKeys.count == CodingKeys.allCases.count else { throw ProbeFailure.failed("EnforcementTranscript field set") }
        objectType = try c.decode(String.self, forKey: .objectType)
        objectVersion = try c.decode(UInt64.self, forKey: .objectVersion)
        installation = try c.decode(CBORByteString.self, forKey: .installation).value
        epochDigest = try c.decode(CBORByteString.self, forKey: .epochDigest).value
        registration = try c.decode(CBORByteString.self, forKey: .registration).value
        attemptID = try c.decode(CBORByteString.self, forKey: .attemptID).value
        planDigest = try c.decode(CBORByteString.self, forKey: .planDigest).value
        eventRoot = try c.decode(CBORByteString.self, forKey: .eventRoot).value
        purpose = try c.decode(String.self, forKey: .purpose)
        audience = try c.decode(String.self, forKey: .audience)
        terminalState = try c.decode(String.self, forKey: .terminalState)
        teardownState = try c.decode(String.self, forKey: .teardownState)
        finishedAt = try c.decode(UInt64.self, forKey: .finishedAt)
    }
}

struct ProtectedHeaders: Codable, Equatable {
    let algorithm: Int
    let contentType: String
    let keyID: Data
    enum CodingKeys: Int, CodingKey, CaseIterable { case algorithm = 1, contentType = 3, keyID = 4 }

    init(algorithm: Int, contentType: String, keyID: Data) {
        self.algorithm = algorithm; self.contentType = contentType; self.keyID = keyID
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard c.allKeys.count == CodingKeys.allCases.count else { throw ProbeFailure.failed("protected field set") }
        algorithm = try c.decode(Int.self, forKey: .algorithm)
        contentType = try c.decode(String.self, forKey: .contentType)
        keyID = try c.decode(CBORByteString.self, forKey: .keyID).value
    }
}

struct EmptyHeaders: Codable, Equatable {
    struct AnyKey: CodingKey { let stringValue: String; let intValue: Int?
        init?(stringValue: String) { self.stringValue = stringValue; intValue = nil }
        init?(intValue: Int) { stringValue = String(intValue); self.intValue = intValue }
    }
    init() {}
    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        guard c.allKeys.isEmpty else { throw ProbeFailure.failed("unprotected headers forbidden") }
    }
    func encode(to encoder: any Encoder) throws { _ = encoder.container(keyedBy: AnyKey.self) }
}

struct Sign1Body: Codable, Equatable {
    let protected: Data
    let unprotected: EmptyHeaders
    let payload: Data
    let signature: Data
    init(protected: Data, unprotected: EmptyHeaders, payload: Data, signature: Data) {
        self.protected = protected; self.unprotected = unprotected; self.payload = payload; self.signature = signature
    }
    init(from decoder: any Decoder) throws {
        var c = try decoder.unkeyedContainer()
        protected = try c.superDecoder().singleValueContainer().decode(Data.self)
        unprotected = try c.decode(EmptyHeaders.self)
        payload = try c.superDecoder().singleValueContainer().decode(Data.self)
        signature = try c.superDecoder().singleValueContainer().decode(Data.self)
        guard c.isAtEnd else { throw ProbeFailure.failed("COSE body count") }
    }
    func encode(to encoder: any Encoder) throws {
        var c = encoder.unkeyedContainer()
        try c.encode(protected); try c.encode(unprotected); try c.encode(payload); try c.encode(signature)
    }
}

struct CoseSign1: TaggedCBORItem, Equatable {
    static let tag = coseSign1Tag
    let body: Sign1Body
    init(body: Sign1Body) { self.body = body }
    init<Container: SingleValueDecodingContainer>(decodeTaggedDataUsing c: Container) throws { body = try c.decode(Sign1Body.self) }
    func encodeTaggedData<Container: SingleValueEncodingContainer>(using c: inout Container) throws { try c.encode(body) }
    init(from decoder: any Decoder) throws { try self.init(decodeTaggedDataUsing: decoder.singleValueContainer()) }
    func encode(to encoder: any Encoder) throws { var c = encoder.singleValueContainer(); try encodeTaggedData(using: &c) }
}

struct SignatureStructure: Encodable {
    let protected: Data; let payload: Data
    func encode(to encoder: any Encoder) throws {
        var c = encoder.unkeyedContainer()
        try c.encode("Signature1"); try c.encode(protected); try c.encode(Data()); try c.encode(payload)
    }
}

struct Corpus: Decodable { let cases: [CorpusCase] }
struct CorpusCase: Decodable { let name: String; let profile: Kind; let expectation: String; let wire: String }

struct Profile {
    let encoder = CBOREncoder()
    let decoder = CBORDecoder(rejectIndeterminateLengths: true, recursionDepth: 12,
                              rejectIntKeys: false, rejectUnorderedMap: true,
                              rejectUndefined: true, rejectNaN: true, rejectInf: true,
                              singleTopLevelItem: true)
    let privateKey: P256.Signing.PrivateKey
    let publicKey: P256.Signing.PublicKey

    init() throws {
        privateKey = try P256.Signing.PrivateKey(rawRepresentation: requireData(base64URL: "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI"))
        var x963 = Data([0x04])
        x963.append(try requireData(base64URL: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU"))
        x963.append(try requireData(base64URL: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"))
        publicKey = try P256.Signing.PublicKey(x963Representation: x963)
    }

    func expectedApproval() -> ApprovalGrant {
        ApprovalGrant(objectType: "capsule.approval-grant", objectVersion: 0,
                      installation: Data(repeating: 0x11, count: 16), epochDigest: Data(repeating: 0x22, count: 32),
                      registration: Data(repeating: 0x33, count: 16), planDigest: Data(repeating: 0x44, count: 32),
                      supervisor: Data(repeating: 0x55, count: 16), attemptNonce: Data(repeating: 0x66, count: 16),
                      purpose: "capsule.plan.approve", audience: "capsule.execution-supervisor",
                      issuedAt: 1_785_456_000, expiresAt: 1_785_456_300)
    }

    func expectedTranscript() -> EnforcementTranscript {
        EnforcementTranscript(objectType: "capsule.enforcement-transcript", objectVersion: 0,
                              installation: Data(repeating: 0x11, count: 16), epochDigest: Data(repeating: 0x22, count: 32),
                              registration: Data(repeating: 0x33, count: 16), attemptID: Data(repeating: 0x77, count: 16),
                              planDigest: Data(repeating: 0x44, count: 32), eventRoot: Data(repeating: 0x88, count: 32),
                              purpose: "capsule.execution.attest", audience: "capsule.receipt-composer",
                              terminalState: "completed", teardownState: "destroyed", finishedAt: 1_785_456_360)
    }

    func payload(_ kind: Kind) throws -> Data {
        switch kind { case .approvalGrant: try encoder.encode(expectedApproval()); case .enforcementTranscript: try encoder.encode(expectedTranscript()) }
    }
    func protected(_ kind: Kind) throws -> Data { try encoder.encode(ProtectedHeaders(algorithm: es256, contentType: kind.contentType, keyID: kind.keyID)) }

    func sign(_ kind: Kind) throws -> Data {
        let p = try protected(kind); let payload = try payload(kind)
        let input = try encoder.encode(SignatureStructure(protected: p, payload: payload))
        let signature = try privateKey.signature(for: input).rawRepresentation
        return try encoder.encode(CoseSign1(body: Sign1Body(protected: p, unprotected: EmptyHeaders(), payload: payload, signature: signature)))
    }

    func verify(_ kind: Kind, _ wire: Data) throws {
        guard !wire.isEmpty, wire.count <= maxEnvelopeBytes else { throw ProbeFailure.failed("envelope byte bound") }
        let envelope = try decoder.decode(CoseSign1.self, from: wire)
        guard try encoder.encode(envelope) == wire else { throw ProbeFailure.failed("noncanonical envelope") }
        let body = envelope.body
        guard !body.protected.isEmpty, body.protected.count <= maxProtectedBytes else { throw ProbeFailure.failed("protected byte bound") }
        guard !body.payload.isEmpty, body.payload.count <= maxPayloadBytes else { throw ProbeFailure.failed("payload byte bound") }
        guard body.signature.count == 64 else { throw ProbeFailure.failed("signature length") }
        let headers = try decoder.decode(ProtectedHeaders.self, from: body.protected)
        guard try encoder.encode(headers) == body.protected else { throw ProbeFailure.failed("noncanonical protected") }
        guard headers.algorithm == es256, headers.contentType == kind.contentType, headers.keyID == kind.keyID,
              headers.keyID.count > 0, headers.keyID.count <= 64, headers.contentType.utf8.count <= 96 else {
            throw ProbeFailure.failed("protected confusion")
        }
        switch kind {
        case .approvalGrant:
            let grant = try decoder.decode(ApprovalGrant.self, from: body.payload)
            guard try encoder.encode(grant) == body.payload else { throw ProbeFailure.failed("noncanonical ApprovalGrant") }
            try validate(grant)
            guard grant == expectedApproval() else { throw ProbeFailure.failed("ApprovalGrant binding mismatch") }
        case .enforcementTranscript:
            let transcript = try decoder.decode(EnforcementTranscript.self, from: body.payload)
            guard try encoder.encode(transcript) == body.payload else { throw ProbeFailure.failed("noncanonical transcript") }
            try validate(transcript)
            guard transcript == expectedTranscript() else { throw ProbeFailure.failed("transcript binding mismatch") }
        }
        guard validScalar(body.signature.prefix(32)), validScalar(body.signature.suffix(32)) else { throw ProbeFailure.failed("invalid signature scalar") }
        let input = try encoder.encode(SignatureStructure(protected: body.protected, payload: body.payload))
        let signature = try P256.Signing.ECDSASignature(rawRepresentation: body.signature)
        guard publicKey.isValidSignature(signature, for: input) else { throw ProbeFailure.failed("signature verification") }
    }

    private func validate(_ g: ApprovalGrant) throws {
        guard g.objectType == "capsule.approval-grant", g.objectVersion == 0, g.purpose == "capsule.plan.approve",
              g.audience == "capsule.execution-supervisor", g.installation.count == 16, g.epochDigest.count == 32,
              g.registration.count == 16, g.planDigest.count == 32, g.supervisor.count == 16, g.attemptNonce.count == 16,
              g.issuedAt <= maxSafeInteger, g.expiresAt <= maxSafeInteger, g.expiresAt > g.issuedAt else {
            throw ProbeFailure.failed("ApprovalGrant shape")
        }
    }

    private func validate(_ t: EnforcementTranscript) throws {
        guard t.objectType == "capsule.enforcement-transcript", t.objectVersion == 0, t.purpose == "capsule.execution.attest",
              t.audience == "capsule.receipt-composer", t.installation.count == 16, t.epochDigest.count == 32,
              t.registration.count == 16, t.attemptID.count == 16, t.planDigest.count == 32, t.eventRoot.count == 32,
              t.terminalState == "completed", t.teardownState == "destroyed", t.finishedAt <= maxSafeInteger else {
            throw ProbeFailure.failed("EnforcementTranscript shape")
        }
    }
}

func validScalar<S: DataProtocol>(_ scalar: S) -> Bool {
    let bytes = Array(scalar)
    guard bytes.count == 32, bytes.contains(where: { $0 != 0 }) else { return false }
    let order: [UInt8] = [0xff,0xff,0xff,0xff,0x00,0x00,0x00,0x00,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,
                          0xbc,0xe6,0xfa,0xad,0xa7,0x17,0x9e,0x84,0xf3,0xb9,0xca,0xc2,0xfc,0x63,0x25,0x51]
    return bytes.lexicographicallyPrecedes(order)
}

func requireData(base64URL: String) throws -> Data {
    guard let data = Data(base64URLEncoded: base64URL) else { throw ProbeFailure.failed("invalid base64url") }
    return data
}

let profile = try Profile()
let arguments = Array(CommandLine.arguments.dropFirst())
switch arguments.first {
case "emit":
    guard arguments.count == 2, let kind = Kind(rawValue: arguments[1]) else { throw ProbeFailure.failed("emit KIND") }
    print(try profile.sign(kind).base64URLEncodedString())
case "verify":
    guard arguments.count >= 3, let kind = Kind(rawValue: arguments[1]) else { throw ProbeFailure.failed("verify KIND ENVELOPE...") }
    for encoded in arguments.dropFirst(2) { try profile.verify(kind, try requireData(base64URL: encoded)) }
    print("swift-verified=\(kind.rawValue):\(arguments.count - 2)")
case "self-test":
    guard arguments.count == 2 else { throw ProbeFailure.failed("self-test CORPUS") }
    let corpus = try JSONDecoder().decode(Corpus.self, from: Data(contentsOf: URL(fileURLWithPath: arguments[1])))
    var accepted = 0; var rejected = 0
    for testCase in corpus.cases {
        do {
            try profile.verify(testCase.profile, try requireData(base64URL: testCase.wire))
            if testCase.expectation == "reject" { throw ProbeFailure.failed("negative accepted \(testCase.name)") }
            accepted += 1
        } catch {
            if testCase.expectation == "accept" { throw ProbeFailure.failed("positive rejected \(testCase.name): \(error)") }
            if case ProbeFailure.failed(let message) = error, message == "negative accepted \(testCase.name)" { throw error }
            rejected += 1
        }
    }
    print("swift-corpus=accepted:\(accepted),rejected:\(rejected)")
default:
    throw ProbeFailure.failed("usage: emit KIND | verify KIND ENVELOPE... | self-test CORPUS")
}

extension Data {
    init?(base64URLEncoded value: String) {
        guard value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { return nil }
        var padded = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        padded.append(String(repeating: "=", count: (4 - padded.count % 4) % 4))
        guard let decoded = Data(base64Encoded: padded), decoded.base64URLEncodedString() == value else { return nil }
        self = decoded
    }
    func base64URLEncodedString() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
