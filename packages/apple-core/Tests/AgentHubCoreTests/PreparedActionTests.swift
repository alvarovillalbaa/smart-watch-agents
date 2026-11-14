import CryptoKit
import Foundation
import Testing
@testable import AgentHubCore

private final class RequestFixture: @unchecked Sendable {
  private let lock = NSLock()
  private var requests: [URLRequest] = []
  func append(_ value: URLRequest) { lock.lock(); defer { lock.unlock() }; requests.append(value) }
  func all() -> [URLRequest] { lock.lock(); defer { lock.unlock() }; return requests }
}
private final class PreparedProtocol: URLProtocol, @unchecked Sendable {
  static let captured = RequestFixture()
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    Self.captured.append(request)
    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 202, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
    let body = request.url!.path == "/v1/runs" ? "{\"runs\":[{\"id\":\"authored\",\"title\":\"Authored\",\"status\":\"running\",\"provider\":\"hermes\",\"display_name\":\"Authored\",\"started_at\":\"2026-11-14T12:00:00.123Z\",\"updated_at\":\"2026-11-14T12:00:01Z\"}]}" : "{\"commandId\":\"00000000-0000-4000-8000-000000000002\"}"
    client?.urlProtocol(self, didLoad: Data(body.utf8)); client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
private final class PreparedSigner: DeviceSigning, @unchecked Sendable {
  let key = P256.Signing.PrivateKey()
  var publicKeyPEM: String { key.publicKey.pemRepresentation }
  func signature(for message: String) throws -> String { try key.signature(for: Data(message.utf8)).rawRepresentation.base64EncodedString() }
}
@Suite(.serialized)
struct PreparedActionTests {
  private func fixture() -> (AgentHubClient, URLSession) {
    let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [PreparedProtocol.self]
    let session = URLSession(configuration: config)
    return (AgentHubClient(baseURL: URL(string: "https://authored.example.test")!, token: "authored-device-fixture", signer: PreparedSigner(), session: session), session)
  }
  @Test func savedRequestRoundTripRetainsItsActualWireOnRetry() async throws {
    let (client, session) = fixture(); defer { session.invalidateAndCancel() }
    let prepared = try client.prepareAction(kind: .approveHitl, subject: "saved /批准")
    let restored = try JSONDecoder().decode(AgentHubPreparedAction.self, from: JSONEncoder().encode(prepared)); #expect(try restored.validated() == prepared)
    let first = try await client.submitPreparedAction(prepared), second = try await client.submitPreparedAction(restored)
    #expect(first == second)
    let requests = PreparedProtocol.captured.all().filter { $0.url?.absoluteString.contains("saved%20%2F") == true }; #expect(requests.count == 2)
    for name in ["x-watch-protocol","x-watch-timestamp","x-watch-nonce","x-watch-signature"] { #expect(requests[0].value(forHTTPHeaderField: name) == requests[1].value(forHTTPHeaderField: name)) }
  }
  @Test func malformedSavedSignatureCannotBeSubmitted() async throws {
    let (client, session) = fixture(); defer { session.invalidateAndCancel() }
    let action = try client.prepareAction(kind: .approveHitl, subject: "authored")
    var object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(action)) as? [String:Any]); object["signature"] = "invalid"
    let invalid = try JSONDecoder().decode(AgentHubPreparedAction.self, from: JSONSerialization.data(withJSONObject: object))
    let before = PreparedProtocol.captured.all().count; await #expect(throws: (any Error).self) { try await client.submitPreparedAction(invalid) }; #expect(PreparedProtocol.captured.all().count == before)
  }
  @Test func bothPostgresFractionalAndWholeSecondDatesDecode() async throws {
    let (client, session) = fixture(); defer { session.invalidateAndCancel() }
    let runs = try await client.runs(); #expect(runs.count == 1); #expect(runs[0].updatedAt > runs[0].startedAt)
  }
  @Test func credentialBearingOrRemotePlaintextHubIsRefusedBeforeTransport() async throws {
    let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [PreparedProtocol.self]; let session = URLSession(configuration: config); defer { session.invalidateAndCancel() }
    let before = PreparedProtocol.captured.all().count
    for text in ["http://authored.example.test", "https://owner:authored@example.test", "https://authored.example.test/prefix", "https://authored.example.test?query=1"] { let client = AgentHubClient(baseURL: URL(string: text)!, token: "authored-fixture", session: session); await #expect(throws: (any Error).self) { try await client.runs() } }
    #expect(PreparedProtocol.captured.all().count == before)
  }
}
