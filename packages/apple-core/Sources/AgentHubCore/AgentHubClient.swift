import Foundation
import CryptoKit

public enum AgentHubError: LocalizedError { case invalidURL, unauthorized, server(String); public var errorDescription: String? { switch self { case .invalidURL: "Invalid hub URL"; case .unauthorized: "Device is not paired"; case .server(let message): message } } }

public struct AgentHubClient: Sendable {
  public let baseURL: URL
  public let token: String?
  public let signer: (any DeviceSigning)?
  private let session: URLSession

  public init(baseURL: URL, token: String? = nil, signer: (any DeviceSigning)? = nil, session: URLSession = .shared) { self.baseURL = baseURL; self.token = token; self.signer = signer; self.session = session }

  public func pair(code: String, label: String, platform: String = "watchos", pushToken: String? = nil, privacyMode: PrivacyMode = .redacted) async throws -> PairingResponse {
    guard let signer else { throw AgentHubError.unauthorized }
    var body: [String: Any] = ["code": code, "label": label, "platform": platform, "publicKeyPem": signer.publicKeyPEM, "privacyMode": privacyMode.rawValue]
    if let pushToken { body["pushToken"] = pushToken }
    return try await send(path: "/v1/devices/pair", method: "POST", body: body, signed: false)
  }
  public func runs(limit: Int = 20, state: RunStatus? = nil) async throws -> [AgentRun] {
    var path = "/v1/runs?limit=\(limit)"; if let state { path += "&state=\(state.rawValue)" }
    let response: RunsResponse = try await send(path: path, method: "GET", signed: false)
    return response.runs
  }
  public func metrics(days: Int = 7, timezone: String = TimeZone.current.identifier) async throws -> MetricsResponse {
    try await send(path: "/v1/metrics/runs/daily?days=\(days)&timezone=\(timezone.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "UTC")", method: "GET", signed: false)
  }
  public func approve(hitlID: String) async throws { let _: Empty = try await send(path: "/v1/hitl/\(Self.component(hitlID))/approve", method: "POST", body: [:], signed: true) }
  public func dispatchFollowUp(runID: String) async throws { let _: Empty = try await send(path: "/v1/runs/\(Self.component(runID))/follow-up/dispatch", method: "POST", body: [:], signed: true) }
  public func updatePushToken(_ pushToken: String?, privacyMode: PrivacyMode) async throws {
    var body: [String: Any] = ["privacyMode": privacyMode.rawValue]
    if let pushToken { body["pushToken"] = pushToken }
    let _: Empty = try await send(path: "/v1/devices/current/push", method: "PUT", body: body, signed: false)
  }

  private func send<T: Decodable>(path: String, method: String, body: [String: Any] = [:], signed: Bool) async throws -> T {
    guard let url = URL(string: path, relativeTo: baseURL) else { throw AgentHubError.invalidURL }
    var request = URLRequest(url: url); request.httpMethod = method; request.setValue("application/json", forHTTPHeaderField: "content-type")
    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
    if method != "GET" { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
    if signed {
      guard let signer else { throw AgentHubError.unauthorized }
      let nonce = UUID().uuidString.lowercased(), timestamp = String(Int(Date().timeIntervalSince1970))
      let hash = SHA256.hash(data: request.httpBody ?? Data()).map { String(format: "%02x", $0) }.joined()
      let message = ["watch-agents.action.v2", method, path, timestamp, nonce, hash].joined(separator: "\n")
      request.setValue("2", forHTTPHeaderField: "x-watch-protocol"); request.setValue(timestamp, forHTTPHeaderField: "x-watch-timestamp")
      request.setValue(nonce, forHTTPHeaderField: "x-watch-nonce"); request.setValue(try signer.signature(for: message), forHTTPHeaderField: "x-watch-signature")
    }
    let (data, response) = try await session.data(for: request); let status = (response as? HTTPURLResponse)?.statusCode ?? 500
    if status == 401 { throw AgentHubError.unauthorized }; guard (200..<300).contains(status) else { throw AgentHubError.server(String(data: data, encoding: .utf8) ?? "Request failed") }
    if T.self == Empty.self { return Empty() as! T }
    let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601; decoder.keyDecodingStrategy = .convertFromSnakeCase
    return try decoder.decode(T.self, from: data)
  }
  private static func component(_ value: String) -> String { value.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"))! }
}
private struct Empty: Decodable {}
