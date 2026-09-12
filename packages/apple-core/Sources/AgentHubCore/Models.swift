import Foundation

public enum RunStatus: String, Codable, Sendable { case running, completed, failed, cancelled, awaiting_hitl }
public enum AgentProvider: String, Codable, Sendable { case hermes, openclaw }
public enum PrivacyMode: String, Codable, Sendable { case redacted, summary }

public struct AgentRun: Codable, Identifiable, Sendable {
  public let id: String
  public let title: String
  public let summary: String?
  public let status: RunStatus
  public let provider: AgentProvider
  public let displayName: String
  public let startedAt: Date
  public let updatedAt: Date
  public let hitlId: String?
  public let hitlLabel: String?
  public let hitlRisk: String?
  public let hitlExpiresAt: Date?
  public let followUpPrompt: String?
  public let followUpStatus: String?
}

public struct DailyRunCount: Codable, Identifiable, Sendable {
  public let day: String
  public let count: Int
  public var id: String { day }
}

public struct RunsResponse: Codable, Sendable { public let runs: [AgentRun] }
public struct MetricsResponse: Codable, Sendable { public let timezone: String; public let days: Int; public let series: [DailyRunCount] }
public struct PairingResponse: Codable, Sendable { public let deviceId: String; public let token: String }
