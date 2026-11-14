import Foundation
import Testing
@testable import AgentHubWidgetModel

@Suite struct WidgetSnapshotTests {
  @Test func defaultSnapshotHasNoPrivateSourceTitles() throws {
    let snapshot = try WidgetSnapshot(paired: true, fetchedAt: Date(timeIntervalSince1970: 1_700_000_000), running: 2, approvals: 1, titles: ["Authored private title"], showTitles: false)
    let text = String(data: try JSONEncoder().encode(snapshot), encoding: .utf8)!
    #expect(!text.contains("Authored private title")); #expect(snapshot.recentTitles.isEmpty)
    #expect(!text.contains("token")); #expect(!text.contains("privateKey")); #expect(!text.contains("origin"))
  }
  @Test func explicitTitlesAreBoundedAndLiteral() throws {
    let snapshot = try WidgetSnapshot(paired: true, titles: [String(repeating: "界", count: 300), "<script>literal</script>", "Third", "Fourth"], showTitles: true)
    #expect(snapshot.recentTitles.count == 3); #expect(snapshot.recentTitles[0].count == 160); #expect(snapshot.recentTitles[1] == "<script>literal</script>")
  }
  @Test func freshnessDistinguishesOldFutureAndFailedReads() throws {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    #expect(!(try WidgetSnapshot(paired: true, fetchedAt: now)).isStale(at: now))
    #expect((try WidgetSnapshot(paired: true, fetchedAt: now.addingTimeInterval(-301))).isStale(at: now))
    #expect((try WidgetSnapshot(paired: true, fetchedAt: now.addingTimeInterval(301))).isStale(at: now))
    #expect((try WidgetSnapshot(paired: true, fetchedAt: now, readFailed: true)).isStale(at: now))
    #expect(WidgetSnapshot.unpaired.isStale(at: now))
  }
  @Test func actualFileRoundTripAndPrivatePermissions() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("watch-agents-widget-" + UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cache = WidgetSnapshotCache(directory: directory), snapshot = try WidgetSnapshot(paired: true, fetchedAt: Date(timeIntervalSince1970: 1_700_000_000), running: 3, followUps: 2)
    #expect(try cache.read() == .unpaired); try cache.write(snapshot); #expect(try cache.read() == snapshot)
    let permissions = try FileManager.default.attributesOfItem(atPath: directory.appendingPathComponent("watch-agents-snapshot.json").path)[.posixPermissions] as? NSNumber
    #expect(permissions?.intValue == 0o600)
  }
  @Test func corruptOversizedAndSymlinkCacheIsNeverReset() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("watch-agents-widget-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appendingPathComponent("watch-agents-snapshot.json"), target = directory.appendingPathComponent("owned-target.txt"), cache = WidgetSnapshotCache(directory: directory)
    try Data("invalid".utf8).write(to: file); #expect(throws: (any Error).self) { try cache.read() }; #expect(try String(contentsOf: file, encoding: .utf8) == "invalid")
    try Data(repeating: 65, count: 65537).write(to: file); #expect(throws: (any Error).self) { try cache.read() }; #expect(try Data(contentsOf: file).count == 65537)
    try FileManager.default.removeItem(at: file); try Data("Keep authored target".utf8).write(to: target); try FileManager.default.createSymbolicLink(at: file, withDestinationURL: target)
    #expect(throws: (any Error).self) { try cache.read() }; #expect(throws: (any Error).self) { try cache.write(.unpaired) }; #expect(try String(contentsOf: target, encoding: .utf8) == "Keep authored target")
  }
}
