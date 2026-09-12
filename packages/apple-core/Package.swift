// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "AgentHubCore",
  platforms: [.macOS(.v14), .iOS(.v17), .watchOS(.v10)],
  products: [
    .library(name: "AgentHubCore", targets: ["AgentHubCore"]),
    .library(name: "AgentHubUI", targets: ["AgentHubUI"])
  ],
  targets: [
    .target(name: "AgentHubCore"),
    .target(name: "AgentHubUI", dependencies: ["AgentHubCore"]),
    .testTarget(name: "AgentHubCoreTests", dependencies: ["AgentHubCore"])
  ]
)
