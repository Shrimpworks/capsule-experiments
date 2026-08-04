// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "GateA2Swift",
    platforms: [.macOS(.v15)],
    dependencies: [
        .package(url: "https://github.com/thecoolwinter/CBOR.git", exact: "1.1.2")
    ],
    targets: [
        .executableTarget(
            name: "GateA2Swift",
            dependencies: [.product(name: "CBOR", package: "CBOR")]
        )
    ]
)
