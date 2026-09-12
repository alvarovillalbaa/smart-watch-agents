import SwiftUI
import AgentHubCore

public struct RunStatusBadge: View {
  public let status: RunStatus
  public init(status: RunStatus) { self.status = status }
  public var body: some View { Text(status.rawValue.replacingOccurrences(of: "_", with: " ")).font(.caption2).foregroundStyle(color).accessibilityLabel("Run status: \(status.rawValue)") }
  private var color: Color { switch status { case .running: .blue; case .awaiting_hitl: .orange; case .completed: .green; case .failed: .red; case .cancelled: .gray } }
}
