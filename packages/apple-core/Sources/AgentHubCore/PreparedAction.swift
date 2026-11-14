import CryptoKit
import Foundation

public enum AgentHubActionKind: String, Codable, Sendable { case approveHitl = "approve_hitl", dispatchFollowUp = "dispatch_follow_up" }
public struct AgentHubActionReceipt: Codable, Sendable, Equatable { public let commandId: String }
public struct AgentHubPreparedAction: Codable, Sendable, Equatable {
  public let schema: String
  public let version: Int
  public let kind: AgentHubActionKind
  public let subject: String
  public let nonce: String
  public let timestamp: String
  public let signature: String
  public var path: String {
    let component = subject.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"))!
    return kind == .approveHitl ? "/v1/hitl/\(component)/approve" : "/v1/runs/\(component)/follow-up/dispatch"
  }
  public func validated() throws -> Self {
    guard schema == "watch-agents.prepared-action", version == 2, !subject.isEmpty, subject.count <= 1000, UUID(uuidString: nonce) != nil, nonce == nonce.lowercased(), timestamp.range(of: "^[1-9][0-9]{9,11}$", options: .regularExpression) != nil, let bytes = Data(base64Encoded: signature), bytes.count == 64, bytes.base64EncodedString() == signature else { throw AgentHubError.server("Saved action is invalid; no request was sent") }
    return self
  }
  static func prepare(kind: AgentHubActionKind, subject: String, signer: any DeviceSigning) throws -> Self {
    let nonce = UUID().uuidString.lowercased(), timestamp = String(Int(Date().timeIntervalSince1970))
    let draft = Self(schema: "watch-agents.prepared-action", version: 2, kind: kind, subject: subject, nonce: nonce, timestamp: timestamp, signature: "")
    let hash = SHA256.hash(data: Data("{}".utf8)).map { String(format: "%02x", $0) }.joined()
    let message = ["watch-agents.action.v2", "POST", draft.path, timestamp, nonce, hash].joined(separator: "\n")
    return try Self(schema: draft.schema, version: draft.version, kind: kind, subject: subject, nonce: nonce, timestamp: timestamp, signature: signer.signature(for: message)).validated()
  }
}
