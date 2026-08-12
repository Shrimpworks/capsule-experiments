// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "CapsuleC6b1BrokerEvidence",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "capsule-c6b1-broker-evidence", targets: ["CapsuleC6b1BrokerEvidence"])
  ],
  targets: [
    .target(
      name: "CapsuleC6b1BrokerNativeShim",
      publicHeadersPath: "include"
    ),
    .executableTarget(
      name: "CapsuleC6b1BrokerEvidence",
      dependencies: ["CapsuleC6b1BrokerNativeShim"]
    ),
    .testTarget(
      name: "CapsuleC6b1BrokerEvidenceTests",
      dependencies: ["CapsuleC6b1BrokerEvidence"]
    ),
  ]
)
