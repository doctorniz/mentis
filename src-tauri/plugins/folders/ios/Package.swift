// swift-tools-version:5.9

import PackageDescription

let package = Package(
  name: "mentis-folders",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v17),
  ],
  products: [
    .library(name: "mentis-folders", type: .static, targets: ["mentis-folders"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "mentis-folders",
      dependencies: [.byName(name: "Tauri")],
      path: "Sources")
  ]
)
