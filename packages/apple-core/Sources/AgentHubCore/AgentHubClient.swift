import Foundation

public enum AgentHubError: LocalizedError { case invalidURL, unauthorized, server(String); public var errorDescription: String? { switch self { case .invalidURL: "Invalid hub URL"; case .unauthorized: "Device is not paired"; case .server(let message): message } } }

private final class DeviceTransportDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}
public struct AgentHubClient: Sendable {
  public let baseURL: URL
  public let token: String?
  public let signer: (any DeviceSigning)?
  private let session: URLSession

  private static let deviceSession: URLSession = { let config = URLSessionConfiguration.ephemeral; config.httpShouldSetCookies = false; config.urlCache = nil; config.urlCredentialStorage = nil; config.timeoutIntervalForRequest = 10; return URLSession(configuration: config, delegate: DeviceTransportDelegate(), delegateQueue: nil) }()
  public init(baseURL: URL, token: String? = nil, signer: (any DeviceSigning)? = nil, session: URLSession? = nil) { self.baseURL = baseURL; self.token = token; self.signer = signer; self.session = session ?? Self.deviceSession }

  public func pair(code: String, label: String, platform: String = "watchos", pushToken: String? = nil, privacyMode: PrivacyMode = .redacted) async throws -> PairingResponse {
    guard let signer else { throw AgentHubError.unauthorized }
    var body: [String: Any] = ["code": code, "label": label, "platform": platform, "publicKeyPem": signer.publicKeyPEM, "privacyMode": privacyMode.rawValue]
    if let pushToken { body["pushToken"] = pushToken }
    return try await send(path: "/v1/devices/pair", method: "POST", body: body)
  }
  public func runs(limit: Int = 20, state: RunStatus? = nil) async throws -> [AgentRun] {
    var path = "/v1/runs?limit=\(limit)"; if let state { path += "&state=\(state.rawValue)" }
    let response: RunsResponse = try await send(path: path, method: "GET")
    return response.runs
  }
  public func metrics(days: Int = 7, timezone: String = TimeZone.current.identifier) async throws -> MetricsResponse {
    try await send(path: "/v1/metrics/runs/daily?days=\(days)&timezone=\(timezone.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "UTC")", method: "GET")
  }
  public func prepareAction(kind: AgentHubActionKind, subject: String) throws -> AgentHubPreparedAction { guard let signer else { throw AgentHubError.unauthorized }; return try .prepare(kind: kind, subject: subject, signer: signer) }
  public func submitPreparedAction(_ action: AgentHubPreparedAction) async throws -> AgentHubActionReceipt { let value = try action.validated(); let receipt: AgentHubActionReceipt = try await send(path: value.path, method: "POST", prepared: value); guard UUID(uuidString: receipt.commandId) != nil else { throw AgentHubError.server("Hub returned an incompatible command receipt; reconcile the saved request") }; return receipt }
  public func approve(hitlID: String) async throws { _ = try await submitPreparedAction(prepareAction(kind: .approveHitl, subject: hitlID)) }
  public func dispatchFollowUp(runID: String) async throws { _ = try await submitPreparedAction(prepareAction(kind: .dispatchFollowUp, subject: runID)) }
  public func updatePushToken(_ pushToken: String?, privacyMode: PrivacyMode) async throws {
    var body: [String: Any] = ["privacyMode": privacyMode.rawValue]
    if let pushToken { body["pushToken"] = pushToken }
    let _: Empty = try await send(path: "/v1/devices/current/push", method: "PUT", body: body)
  }

  private func send<T: Decodable>(path: String, method: String, body: [String: Any] = [:], prepared: AgentHubPreparedAction? = nil) async throws -> T {
    guard let host = baseURL.host, !host.isEmpty, baseURL.user == nil, baseURL.password == nil, baseURL.query == nil, baseURL.fragment == nil, baseURL.path.isEmpty || baseURL.path == "/", baseURL.scheme == "https" || (baseURL.scheme == "http" && ["localhost","127.0.0.1"].contains(host)), path.hasPrefix("/v1/"), let url = URL(string: path, relativeTo: baseURL) else { throw AgentHubError.invalidURL }
    var request = URLRequest(url: url); request.httpMethod = method; request.setValue("application/json", forHTTPHeaderField: "content-type")
    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
    if method != "GET" { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
    if let prepared {
      request.setValue("2", forHTTPHeaderField: "x-watch-protocol"); request.setValue(prepared.timestamp, forHTTPHeaderField: "x-watch-timestamp")
      request.setValue(prepared.nonce, forHTTPHeaderField: "x-watch-nonce"); request.setValue(prepared.signature, forHTTPHeaderField: "x-watch-signature")
    }
    let (data, response) = try await session.data(for: request); let status = (response as? HTTPURLResponse)?.statusCode ?? 500
    guard data.count <= 8 * 1024 * 1024 else { throw AgentHubError.server("Hub response exceeds the device budget") }
    if status == 401 { throw AgentHubError.unauthorized }; guard (200..<300).contains(status) else { throw AgentHubError.server(String(data: data, encoding: .utf8) ?? "Request failed") }
    if T.self == Empty.self { return Empty() as! T }
    let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .custom { value in let container = try value.singleValueContainer(), text = try container.decode(String.self); let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; if let date = fractional.date(from: text) ?? ISO8601DateFormatter().date(from: text) { return date }; throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected an ISO-8601 date") }; decoder.keyDecodingStrategy = .convertFromSnakeCase
    return try decoder.decode(T.self, from: data)
  }
}
private struct Empty: Decodable {}
