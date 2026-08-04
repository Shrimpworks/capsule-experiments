import CryptoKit
import Foundation

enum ProbeFailure: Error {
    case failed(String)
}

func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() {
        throw ProbeFailure.failed(message)
    }
}

let x = Data(base64URLEncoded: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU")!
let y = Data(base64URLEncoded: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0")!
var x963 = Data([0x04])
x963.append(x)
x963.append(y)
let publicKey = try P256.Signing.PublicKey(x963Representation: x963)
let d = Data(base64URLEncoded: "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI")!
let privateKey = try P256.Signing.PrivateKey(rawRepresentation: d)
try require(privateKey.publicKey.x963Representation == publicKey.x963Representation, "RFC public/private key mismatch")

let rfcProtected = "eyJhbGciOiJFUzI1NiJ9"
let rfcPayload = "eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ"
let rfcRaw = Data(base64URLEncoded: "DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSApmWQxfKTUJqPP3-Kg6NU1Q")!
try require(rfcRaw.count == 64, "RFC 7515 ES256 signature was not 64 bytes")
let rfcSignature = try P256.Signing.ECDSASignature(rawRepresentation: rfcRaw)
try require(
    publicKey.isValidSignature(rfcSignature, for: Data("\(rfcProtected).\(rfcPayload)".utf8)),
    "CryptoKit did not verify RFC 7515 Appendix A.3"
)
print("rfc7515RawES256=true")

let protected = "eyJhbGciOiJFUzI1NiIsImN0eSI6ImFwcGxpY2F0aW9uL2NhcHN1bGUuYXBwcm92YWwtZ3JhbnQramNzIiwia2lkIjoiYXBwcm92YWwtdGVzdC1rZXkiLCJ0eXAiOiJjYXBzdWxlLnNpZ25lZC1vYmplY3QrandzIiwidiI6MX0"
let payload = "eyJhdHRlbXB0Tm9uY2UiOiJub25jZV8wMSIsImF1ZGllbmNlIjoiY2Fwc3VsZS5leGVjdXRpb24tc3VwZXJ2aXNvciIsImVwb2NoRGlnZXN0Ijoic2hhMjU2OmVwb2NoXzA3IiwiZXBvY2hOdW1iZXIiOiI3IiwiZXhwaXJlc0F0IjoiMjAyNi0wOC0wMVQwMDowMDowMFoiLCJpbnN0YWxsYXRpb25JZCI6Imluc3RhbGxhdGlvbl8wMSIsImlzc3VlZEF0IjoiMjAyNi0wNy0zMVQwMDowMDowMFoiLCJvYmplY3RUeXBlIjoiY2Fwc3VsZS5hcHByb3ZhbC1ncmFudCIsIm9iamVjdFZlcnNpb24iOjEsInBsYW5EaWdlc3QiOiJzaGEyNTY6cGxhbl8wMSIsInB1cnBvc2UiOiJjYXBzdWxlLnBsYW4uYXBwcm92ZSIsInJlZ2lzdHJhdGlvbklkIjoicmVnaXN0cmF0aW9uXzAxIiwic3VwZXJ2aXNvcklkIjoic3VwZXJ2aXNvcl8wMSJ9"
let signingInput = Data("\(protected).\(payload)".utf8)
let producerSamples = [
    "go": "DaqyOPFIZ9U-XG0IrKd5ZcjCFvox8i6ZWj9tsfzrNAl6WVLGUfGBXPdFxb9AFSE9Djqz1J_t9LaQREEjmjLtjg",
    "typescript": "LSCN7b_1R_tZdE6QXFXzPschWn2NzpFaoY4CpGWuCn8NIOtLzSOIUOdlkadE0IsFkPBHOc4X2eYQIerAUvrcjQ",
    "swift": "494GGzCWpNisKMQTBIk31tktRgief6ambc2QlDwb2B_47MxkIHOqbVxCh0n6i-j1feEAVlTXnCd6my8Uwz19Gw",
]
for (producer, encoded) in producerSamples {
    let raw = Data(base64URLEncoded: encoded)!
    try require(raw.count == 64, "\(producer) producer did not emit fixed-width raw ES256")
    let signature = try P256.Signing.ECDSASignature(rawRepresentation: raw)
    try require(publicKey.isValidSignature(signature, for: signingInput), "CryptoKit rejected \(producer)-produced JWS")
}
let retainedRaw = Data(base64URLEncoded: producerSamples["go"]!)!
let complementRaw = Data(base64URLEncoded: "DaqyOPFIZ9U-XG0IrKd5ZcjCFvox8i6ZWj9tsfzrNAmFpq04rg5-pAi6OkC_6t7CrqxG2Qcpqc5jdYmfYjA3ww")!
let retainedSignature = try P256.Signing.ECDSASignature(rawRepresentation: retainedRaw)
let complementSignature = try P256.Signing.ECDSASignature(rawRepresentation: complementRaw)
try require(publicKey.isValidSignature(retainedSignature, for: signingInput), "CryptoKit rejected retained Go JWS")
try require(publicKey.isValidSignature(complementSignature, for: signingInput), "CryptoKit rejected high/low-S complement")
print("crossLanguageProfileJWS=true")
print("highAndLowSAccepted=true")
let swiftProducedSignature = try privateKey.signature(for: signingInput).rawRepresentation
try require(swiftProducedSignature.count == 64, "CryptoKit producer did not emit fixed-width raw ES256")
print("swiftProducedSignature=\(swiftProducedSignature.base64URLEncodedString())")

let der = retainedSignature.derRepresentation
let fromDER = try P256.Signing.ECDSASignature(derRepresentation: der)
try require(publicKey.isValidSignature(fromDER, for: signingInput), "CryptoKit DER conversion failed")
try require(der.count != 64, "unexpected test DER length")
print("cryptoKitDERLength=\(der.count)")
print("profileRejectsDERByLength=true")

let duplicate = Data(#"{"a":1,"a":2}"#.utf8)
let duplicateObject = try JSONSerialization.jsonObject(with: duplicate) as! [String: Any]
try require(duplicateObject.count == 1, "Foundation did not collapse the duplicate key as expected")
print("foundationCollapsesDuplicateKeys=true")
print("foundationDuplicateValue=\(duplicateObject["a"] ?? "nil")")

let jcsInput = Data(#"{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001]}"#.utf8)
let jcsObject = try JSONSerialization.jsonObject(with: jcsInput)
let foundationJSON = try JSONSerialization.data(withJSONObject: jcsObject, options: [.sortedKeys, .withoutEscapingSlashes])
let expectedJCS = Data(#"{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}"#.utf8)
print("foundationJSON=\(String(decoding: foundationJSON, as: UTF8.self))")
print("foundationMatchesRFC8785=\(foundationJSON == expectedJCS)")

let loneSurrogate = Data(#"{"x":"\ud800"}"#.utf8)
let loneSurrogateRejected = (try? JSONSerialization.jsonObject(with: loneSurrogate)) == nil
let invalidUTF8 = Data([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d])
let invalidUTF8Rejected = (try? JSONSerialization.jsonObject(with: invalidUTF8)) == nil
print("foundationRejectsLoneSurrogate=\(loneSurrogateRejected)")
print("foundationRejectsInvalidUTF8=\(invalidUTF8Rejected)")

extension Data {
    init?(base64URLEncoded value: String) {
        var padded = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        padded.append(String(repeating: "=", count: (4 - padded.count % 4) % 4))
        self.init(base64Encoded: padded)
    }

    func base64URLEncodedString() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
