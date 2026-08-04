import CBOR
import CryptoKit
import Foundation

private let coseSign1Tag: UInt = 18
private let es256 = -7
private let contentType = "application/capsule.approval-grant+cbor;v=0"
private let testKeyID = Data("approval-test-key".utf8)

enum ProbeFailure: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case let .failed(message): message
        }
    }
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

    enum CodingKeys: Int, CodingKey {
        case objectType = 1
        case objectVersion = 2
        case installation = 3
        case epochDigest = 4
        case registration = 5
        case planDigest = 6
        case supervisor = 7
        case attemptNonce = 8
        case purpose = 9
        case audience = 10
        case issuedAt = 11
        case expiresAt = 12
    }

    init(
        objectType: String,
        objectVersion: UInt64,
        installation: Data,
        epochDigest: Data,
        registration: Data,
        planDigest: Data,
        supervisor: Data,
        attemptNonce: Data,
        purpose: String,
        audience: String,
        issuedAt: UInt64,
        expiresAt: UInt64
    ) {
        self.objectType = objectType
        self.objectVersion = objectVersion
        self.installation = installation
        self.epochDigest = epochDigest
        self.registration = registration
        self.planDigest = planDigest
        self.supervisor = supervisor
        self.attemptNonce = attemptNonce
        self.purpose = purpose
        self.audience = audience
        self.issuedAt = issuedAt
        self.expiresAt = expiresAt
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        objectType = try container.decode(String.self, forKey: .objectType)
        objectVersion = try container.decode(UInt64.self, forKey: .objectVersion)
        installation = try container.decode(CBORByteString.self, forKey: .installation).value
        epochDigest = try container.decode(CBORByteString.self, forKey: .epochDigest).value
        registration = try container.decode(CBORByteString.self, forKey: .registration).value
        planDigest = try container.decode(CBORByteString.self, forKey: .planDigest).value
        supervisor = try container.decode(CBORByteString.self, forKey: .supervisor).value
        attemptNonce = try container.decode(CBORByteString.self, forKey: .attemptNonce).value
        purpose = try container.decode(String.self, forKey: .purpose)
        audience = try container.decode(String.self, forKey: .audience)
        issuedAt = try container.decode(UInt64.self, forKey: .issuedAt)
        expiresAt = try container.decode(UInt64.self, forKey: .expiresAt)
    }
}

struct ProtectedHeaders: Codable, Equatable {
    let algorithm: Int
    let contentType: String
    let keyID: Data

    enum CodingKeys: Int, CodingKey {
        case algorithm = 1
        case contentType = 3
        case keyID = 4
    }
}

struct EmptyHeaders: Codable, Equatable {
    struct AnyCodingKey: CodingKey {
        let stringValue: String
        let intValue: Int?

        init?(stringValue: String) {
            self.stringValue = stringValue
            intValue = nil
        }

        init?(intValue: Int) {
            stringValue = String(intValue)
            self.intValue = intValue
        }
    }

    init() {}

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: AnyCodingKey.self)
        guard container.allKeys.isEmpty else {
            throw ProbeFailure.failed("unprotected headers are forbidden")
        }
    }

    func encode(to encoder: any Encoder) throws {
        _ = encoder.container(keyedBy: AnyCodingKey.self)
    }
}

struct Sign1Body: Codable, Equatable {
    let protected: Data
    let unprotected: EmptyHeaders
    let payload: Data
    let signature: Data

    init(protected: Data, unprotected: EmptyHeaders, payload: Data, signature: Data) {
        self.protected = protected
        self.unprotected = unprotected
        self.payload = payload
        self.signature = signature
    }

    init(from decoder: any Decoder) throws {
        var container = try decoder.unkeyedContainer()
        // CBOR 1.1.2's unkeyed generic decoder delegates directly to
        // `Data.init(from:)`, which expects a JSON-style byte array. Route
        // byte strings through the library's single-value specialization.
        protected = try container.superDecoder().singleValueContainer().decode(Data.self)
        unprotected = try container.decode(EmptyHeaders.self)
        payload = try container.superDecoder().singleValueContainer().decode(Data.self)
        signature = try container.superDecoder().singleValueContainer().decode(Data.self)
        guard container.isAtEnd else {
            throw ProbeFailure.failed("COSE_Sign1 body has extra fields")
        }
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.unkeyedContainer()
        try container.encode(protected)
        try container.encode(unprotected)
        try container.encode(payload)
        try container.encode(signature)
    }
}

struct CoseSign1: TaggedCBORItem, Equatable {
    static let tag = coseSign1Tag
    let body: Sign1Body

    init(body: Sign1Body) {
        self.body = body
    }

    init<Container: SingleValueDecodingContainer>(decodeTaggedDataUsing container: Container) throws {
        body = try container.decode(Sign1Body.self)
    }

    func encodeTaggedData<Container: SingleValueEncodingContainer>(using container: inout Container) throws {
        try container.encode(body)
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        try self.init(decodeTaggedDataUsing: container)
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try encodeTaggedData(using: &container)
    }
}

struct SignatureStructure: Encodable {
    let protected: Data
    let payload: Data

    func encode(to encoder: any Encoder) throws {
        var container = encoder.unkeyedContainer()
        try container.encode("Signature1")
        try container.encode(protected)
        try container.encode(Data())
        try container.encode(payload)
    }
}

struct GoVectors: Decodable {
    let payloadHex: String
    let protectedHex: String
    let valid: String
    let validComplementaryS: String
    let negative: [String: String]
}

struct Profile {
    let encoder = CBOREncoder()
    let decoder = CBORDecoder(
        rejectIndeterminateLengths: true,
        recursionDepth: 16,
        rejectIntKeys: false,
        rejectUnorderedMap: true,
        rejectUndefined: true,
        rejectNaN: true,
        rejectInf: true,
        singleTopLevelItem: true
    )
    let privateKey: P256.Signing.PrivateKey
    let publicKey: P256.Signing.PublicKey

    init() throws {
        let d = try requireData(base64URL: "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI")
        privateKey = try P256.Signing.PrivateKey(rawRepresentation: d)
        var x963 = Data([0x04])
        x963.append(try requireData(base64URL: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU"))
        x963.append(try requireData(base64URL: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"))
        publicKey = try P256.Signing.PublicKey(x963Representation: x963)
        guard privateKey.publicKey.x963Representation == publicKey.x963Representation else {
            throw ProbeFailure.failed("RFC fixture private/public key mismatch")
        }
    }

    func expectedGrant() -> ApprovalGrant {
        ApprovalGrant(
            objectType: "capsule.approval-grant",
            objectVersion: 0,
            installation: Data(repeating: 0x11, count: 16),
            epochDigest: Data(repeating: 0x22, count: 32),
            registration: Data(repeating: 0x33, count: 16),
            planDigest: Data(repeating: 0x44, count: 32),
            supervisor: Data(repeating: 0x55, count: 16),
            attemptNonce: Data(repeating: 0x66, count: 16),
            purpose: "capsule.plan.approve",
            audience: "capsule.execution-supervisor",
            issuedAt: 1_785_456_000,
            expiresAt: 1_785_456_300
        )
    }

    func payload() throws -> Data {
        try encoder.encode(expectedGrant())
    }

    func protected() throws -> Data {
        try encoder.encode(ProtectedHeaders(algorithm: es256, contentType: contentType, keyID: testKeyID))
    }

    func sign() throws -> Data {
        let protectedBytes = try protected()
        let payloadBytes = try payload()
        let signatureInput = try encoder.encode(
            SignatureStructure(protected: protectedBytes, payload: payloadBytes)
        )
        let signature = try privateKey.signature(for: signatureInput).rawRepresentation
        guard signature.count == 64 else {
            throw ProbeFailure.failed("CryptoKit did not produce 64-byte raw ES256")
        }
        return try encoder.encode(
            CoseSign1(
                body: Sign1Body(
                    protected: protectedBytes,
                    unprotected: EmptyHeaders(),
                    payload: payloadBytes,
                    signature: signature
                )
            )
        )
    }

    func verify(_ wire: Data) throws {
        let envelope = try decoder.decode(CoseSign1.self, from: wire)
        let canonical = try encoder.encode(envelope)
        guard canonical == wire else {
            throw ProbeFailure.failed("COSE_Sign1 is not canonical on wire")
        }
        guard envelope.body.protected == (try protected()) else {
            throw ProbeFailure.failed("protected header is outside the exact Capsule profile")
        }
        guard envelope.body.payload == (try payload()) else {
            throw ProbeFailure.failed("payload is non-canonical or outside the exact ApprovalGrant profile")
        }
        let decodedGrant = try decoder.decode(ApprovalGrant.self, from: envelope.body.payload)
        guard decodedGrant == expectedGrant(), try encoder.encode(decodedGrant) == envelope.body.payload else {
            throw ProbeFailure.failed("ApprovalGrant did not round-trip canonically")
        }
        guard envelope.body.signature.count == 64 else {
            throw ProbeFailure.failed("ES256 signature must be exactly 64-byte raw R || S")
        }
        let signatureInput = try encoder.encode(
            SignatureStructure(protected: envelope.body.protected, payload: envelope.body.payload)
        )
        let signature = try P256.Signing.ECDSASignature(rawRepresentation: envelope.body.signature)
        guard publicKey.isValidSignature(signature, for: signatureInput) else {
            throw ProbeFailure.failed("ES256 signature verification failed")
        }
    }
}

func requireData(base64URL: String) throws -> Data {
    guard let data = Data(base64URLEncoded: base64URL) else {
        throw ProbeFailure.failed("invalid base64url fixture")
    }
    return data
}

func loadVectors(path: String) throws -> GoVectors {
    try JSONDecoder().decode(GoVectors.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
}

func runSelfTest(profile: Profile, fixturePath: String) throws {
    let vectors = try loadVectors(path: fixturePath)
    guard try profile.payload().hexString() == vectors.payloadHex else {
        throw ProbeFailure.failed("Swift payload differs from Go")
    }
    guard try profile.protected().hexString() == vectors.protectedHex else {
        throw ProbeFailure.failed("Swift protected header differs from Go")
    }
    try profile.verify(try profile.sign())
    try profile.verify(try requireData(base64URL: vectors.valid))
    try profile.verify(try requireData(base64URL: vectors.validComplementaryS))
    for (name, encoded) in vectors.negative.sorted(by: { $0.key < $1.key }) {
        do {
            try profile.verify(try requireData(base64URL: encoded))
            throw ProbeFailure.failed("negative vector was accepted: \(name)")
        } catch ProbeFailure.failed(let message) where message == "negative vector was accepted: \(name)" {
            throw ProbeFailure.failed(message)
        } catch {
            print("rejected=\(name)")
        }
    }
    print("swiftPayloadMatchesGo=true")
    print("swiftProtectedMatchesGo=true")
    print("swiftVerifiesGo=true")
    print("swiftNegativeVectors=\(vectors.negative.count)")
}

let profile = try Profile()
let arguments = Array(CommandLine.arguments.dropFirst())
let command = arguments.first ?? "emit"

switch command {
case "emit":
    print(try profile.sign().base64URLEncodedString())
case "verify":
    guard arguments.count > 1 else {
        throw ProbeFailure.failed("verify requires at least one base64url envelope")
    }
    for encoded in arguments.dropFirst() {
        try profile.verify(try requireData(base64URL: encoded))
    }
    print("verified=\(arguments.count - 1)")
case "self-test":
    guard arguments.count == 2 else {
        throw ProbeFailure.failed("self-test requires the Go fixture path")
    }
    try runSelfTest(profile: profile, fixturePath: arguments[1])
default:
    throw ProbeFailure.failed("unknown command \(command)")
}

extension Data {
    init?(base64URLEncoded value: String) {
        guard value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else {
            return nil
        }
        var padded = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        padded.append(String(repeating: "=", count: (4 - padded.count % 4) % 4))
        guard let decoded = Data(base64Encoded: padded), decoded.base64URLEncodedString() == value else {
            return nil
        }
        self = decoded
    }

    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    func hexString() -> String {
        map { String(format: "%02x", $0) }.joined()
    }
}
