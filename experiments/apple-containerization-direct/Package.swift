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
    name: "capsule-apple-containerization-direct-probe",
    platforms: [.macOS("15.0")],
    products: [
        .executable(name: "direct-probe", targets: ["DirectProbe"]),
    ],
    dependencies: [
        containerizationDependency,
        .package(url: "https://github.com/apple/swift-system.git", from: "1.6.4"),
    ],
    targets: [
        .executableTarget(
            name: "DirectProbe",
            dependencies: [
                .product(name: "Containerization", package: "containerization"),
                .product(name: "ContainerizationEXT4", package: "containerization"),
                .product(name: "ContainerizationOCI", package: "containerization"),
                .product(name: "SystemPackage", package: "swift-system"),
            ]
        ),
    ]
)
