// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Envelop",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "Envelop", targets: ["EnvelopApp"]),
        .library(name: "EnvelopCore", targets: ["EnvelopCore"]),
        .library(name: "EnvelopBLE", targets: ["EnvelopBLE"]),
    ],
    targets: [
        .target(name: "EnvelopCore"),
        .target(name: "EnvelopBLE", dependencies: ["EnvelopCore"]),
        .executableTarget(name: "EnvelopApp", dependencies: ["EnvelopCore", "EnvelopBLE"]),
        .testTarget(name: "EnvelopCoreTests", dependencies: ["EnvelopCore"]),
    ]
)
