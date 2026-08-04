// swift-tools-version: 6.2

import Foundation
import PackageDescription

let localSource = ProcessInfo.processInfo.environment["CAPSULE_CONTAINERIZATION_SOURCE"]
let containerizationDependency: Package.Dependency = if let localSource {
    .package(name: "containerization", path: localSource)
} else {
    .package(url: "https://github.com/apple/containerization.git", exact: "0.33.3")
}

let package = Package(
    name: "capsule-gate-c-identity-recovery",
    platforms: [.macOS("15.0")],
    products: [
        .executable(name: "identity-recovery-probe", targets: ["IdentityRecoveryProbe"]),
    ],
    dependencies: [
        containerizationDependency,
    ],
    targets: [
        .executableTarget(
            name: "IdentityRecoveryProbe",
            dependencies: [
                .product(name: "Containerization", package: "containerization"),
                .product(name: "ContainerizationOCI", package: "containerization"),
            ]
        ),
    ]
)
