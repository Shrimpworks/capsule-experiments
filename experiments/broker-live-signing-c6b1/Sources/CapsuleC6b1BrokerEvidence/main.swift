import CapsuleC6b1BrokerNativeShim
import Foundation

let arguments = CommandLine.arguments
let root: URL
if let index = arguments.firstIndex(of: "--fixture-root"), arguments.indices.contains(index + 1) {
  root = URL(fileURLWithPath: arguments[index + 1], isDirectory: true)
} else {
  root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
}

do {
  let result = try FixtureVerifier(experimentRoot: root).verify()
  let nativeScope = String(cString: capsule_c6b1_native_scope())
  let output: [String: Any] = [
    "status": result.status,
    "fixtureCompositeSha256": result.fixtureCompositeSha256,
    "artifactCount": result.artifactCount,
    "signer": result.signer,
    "durableAuthorityOwner": result.durableAuthorityOwner,
    "nativeScope": nativeScope,
  ]
  let data = try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
  print(String(decoding: data, as: UTF8.self))
} catch {
  FileHandle.standardError.write(Data("verification failed: \(error)\n".utf8))
  exit(1)
}
