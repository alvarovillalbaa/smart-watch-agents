import CryptoKit
import Foundation
import Testing
@testable import AgentHubCore

private final class Captured: @unchecked Sendable {
  private let lock = NSLock()
  private var requests: [URLRequest] = []
  func append(_ request: URLRequest) { lock.lock(); defer { lock.unlock() }; requests.append(request) }
  func last() -> URLRequest? { lock.lock(); defer { lock.unlock() }; return requests.last }
}
private final class FixtureProtocol: URLProtocol, @unchecked Sendable {
  static let captured = Captured()
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    Self.captured.append(request)
    let response = HTTPURLResponse(url: request.url!, statusCode: 202, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data("{\"commandId\":\"00000000-0000-4000-8000-000000000001\"}".utf8)); client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
private final class FixtureSigner: DeviceSigning, @unchecked Sendable {
  let key = P256.Signing.PrivateKey()
  var publicKeyPEM: String { key.publicKey.pemRepresentation }
  func signature(for message: String) throws -> String { try key.signature(for: Data(message.utf8)).rawRepresentation.base64EncodedString() }
}

@Suite(.serialized)
struct ActionProtocolTests {
  private func capturedAction(_ run: (AgentHubClient) async throws -> Void) async throws -> (URLRequest, FixtureSigner, String) {
    let signer = FixtureSigner(), config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [FixtureProtocol.self]
    let session = URLSession(configuration: config); defer { session.invalidateAndCancel() }
    let client = AgentHubClient(baseURL: URL(string: "https://authored.example.test")!, token: "authored-device-fixture", signer: signer, session: session)
    try await run(client)
    let request = try #require(FixtureProtocol.captured.last())
    let nonce = try #require(request.value(forHTTPHeaderField: "x-watch-nonce")), timestamp = try #require(request.value(forHTTPHeaderField: "x-watch-timestamp"))
    #expect(request.value(forHTTPHeaderField: "x-watch-protocol") == "2")
    #expect(nonce == nonce.lowercased()); #expect(UUID(uuidString: nonce) != nil)
    #expect(abs((Double(timestamp) ?? 0) - Date().timeIntervalSince1970) < 10)
    let requestURL = try #require(request.url)
    let path = try #require(URLComponents(url: requestURL, resolvingAgainstBaseURL: false)?.percentEncodedPath)
    let body = request.httpBody ?? Data()
    // URLSession may deliver the body as a stream to a protocol implementation.
    let bytes: Data
    if let stream = request.httpBodyStream {
      stream.open(); defer { stream.close() }; var data = Data(), buffer = [UInt8](repeating: 0, count: 1024)
      while stream.hasBytesAvailable { let count = stream.read(&buffer, maxLength: buffer.count); if count <= 0 { break }; data.append(contentsOf: buffer.prefix(count)) }; bytes = data
    } else { bytes = body }
    #expect(String(data: bytes, encoding: .utf8) == "{}")
    let hash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    let message = ["watch-agents.action.v2", "POST", path, timestamp, nonce, hash].joined(separator: "\n")
    let encoded = try #require(request.value(forHTTPHeaderField: "x-watch-signature")), signature = try P256.Signing.ECDSASignature(rawRepresentation: try #require(Data(base64Encoded: encoded)))
    #expect(signer.key.publicKey.isValidSignature(signature, for: Data(message.utf8)))
    return (request, signer, String(data: bytes, encoding: .utf8)!)
  }
  @Test func nativeApprovalSignsExactBodyAndEncodedPath() async throws {
    let (request, signer, body) = try await capturedAction { try await $0.approve(hitlID: "native /批准") }
    #expect(request.url!.absoluteString.contains("native%20%2F%E6%89%B9%E5%87%86"))
    if let output = ProcessInfo.processInfo.environment["WATCH_AGENTS_VECTOR_OUT"] {
      let path = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.percentEncodedPath
      let headers = Dictionary(uniqueKeysWithValues: ["x-watch-protocol", "x-watch-timestamp", "x-watch-nonce", "x-watch-signature"].map { ($0, request.value(forHTTPHeaderField: $0)!) })
      let vector: [String: Any] = ["schema": "watch-agents.native-action-vector", "version": 2, "publicKeyPem": signer.publicKeyPEM, "path": path, "body": body, "headers": headers]
      try JSONSerialization.data(withJSONObject: vector, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: output), options: .withoutOverwriting)
    }
  }
  @Test func nativeFollowUpEncodesItsRunIdentifier() async throws {
    let (request, _, _) = try await capturedAction { try await $0.dispatchFollowUp(runID: "hermes:a:run/1") }
    #expect(request.url!.absoluteString.hasSuffix("/v1/runs/hermes%3Aa%3Arun%2F1/follow-up/dispatch"))
  }
}
