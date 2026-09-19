// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NexusPilotMacHost",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "nexuspilot-macos-host", targets: ["LnwjudMacHost"]),
    ],
    targets: [
        .executableTarget(name: "LnwjudMacHost"),
        .testTarget(name: "LnwjudMacHostTests", dependencies: ["LnwjudMacHost"]),
    ]
)
