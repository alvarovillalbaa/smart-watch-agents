import Foundation

public enum WidgetSnapshotError: Error { case invalid, tooLarge, unsafeFile, sharedContainerUnavailable }
public struct WidgetSnapshot: Codable, Sendable, Equatable {
  public let schema: String
  public let version: Int
  public let paired: Bool
  public let fetchedAt: Date?
  public let running: Int
  public let approvals: Int
  public let followUps: Int
  public let recentTitles: [String]
  public let readFailed: Bool
  public static var unpaired: Self { try! Self(paired: false) }
  public init(paired: Bool, fetchedAt: Date? = nil, running: Int = 0, approvals: Int = 0, followUps: Int = 0, titles: [String] = [], showTitles: Bool = false, readFailed: Bool = false) throws {
    guard [running, approvals, followUps].allSatisfy({ (0...100).contains($0) }), fetchedAt?.timeIntervalSince1970.isFinite ?? true else { throw WidgetSnapshotError.invalid }
    guard paired || (fetchedAt == nil && running == 0 && approvals == 0 && followUps == 0) else { throw WidgetSnapshotError.invalid }
    self.schema = "watch-agents.widget-snapshot"; self.version = 1; self.paired = paired; self.fetchedAt = fetchedAt
    self.running = running; self.approvals = approvals; self.followUps = followUps
    self.recentTitles = showTitles ? titles.prefix(3).map { String($0.prefix(160)) } : []; self.readFailed = readFailed
  }
  public func validated() throws -> Self {
    guard schema == "watch-agents.widget-snapshot", version == 1, recentTitles.count <= 3, recentTitles.allSatisfy({ $0.count <= 160 }), paired || recentTitles.isEmpty else { throw WidgetSnapshotError.invalid }
    _ = try Self(paired: paired, fetchedAt: fetchedAt, running: running, approvals: approvals, followUps: followUps, readFailed: readFailed)
    return self
  }
  public func isStale(at now: Date = Date()) -> Bool { readFailed || (fetchedAt.map { now.timeIntervalSince($0) > 300 || now.timeIntervalSince($0) < -300 } ?? true) }
}

public struct WidgetSnapshotCache: Sendable {
  public let directory: URL
  public init(directory: URL) { self.directory = directory }
  public static func shared(group: String) throws -> Self {
    guard let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { throw WidgetSnapshotError.sharedContainerUnavailable }
    return Self(directory: directory)
  }
  private var file: URL { directory.appendingPathComponent("watch-agents-snapshot.json") }
  private func checkFile() throws -> Bool {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory) else {
      if (try? file.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true { throw WidgetSnapshotError.unsafeFile }
      return false
    }
    let values = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey])
    guard values.isSymbolicLink != true, values.isRegularFile == true, !isDirectory.boolValue else { throw WidgetSnapshotError.unsafeFile }
    guard (values.fileSize ?? 65537) <= 65536 else { throw WidgetSnapshotError.tooLarge }; return true
  }
  public func read() throws -> WidgetSnapshot {
    guard try checkFile() else { return .unpaired }
    let bytes = try Data(contentsOf: file); guard bytes.count <= 65536 else { throw WidgetSnapshotError.tooLarge }
    let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(WidgetSnapshot.self, from: bytes).validated()
  }
  public func write(_ snapshot: WidgetSnapshot) throws {
    _ = try snapshot.validated()
    let existed = FileManager.default.fileExists(atPath: directory.path)
    if existed { let values = try directory.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]); guard values.isDirectory == true, values.isSymbolicLink != true else { throw WidgetSnapshotError.unsafeFile } }
    else { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700]) }
    _ = try checkFile()
    let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601; encoder.outputFormatting = [.sortedKeys]
    let bytes = try encoder.encode(snapshot); guard bytes.count <= 65536 else { throw WidgetSnapshotError.tooLarge }
    try bytes.write(to: file, options: .atomic); try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
  }
}
