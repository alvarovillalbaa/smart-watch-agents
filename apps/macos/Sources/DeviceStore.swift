import AgentHubCore
import Foundation
import Security

struct MacPairing: Codable { let origin: URL; let token: String; let deviceId: String; let publicKey: String }
struct MacSavedRequest: Codable, Identifiable {
  var id: String { action.nonce }
  let origin: URL
  let token: String
  let action: AgentHubPreparedAction
  let label: String
  var commandId: String?
  var error: String?
}
struct MacDeviceState: Codable {
  let version: Int
  var pairing: MacPairing?
  var requests: [MacSavedRequest]
  static var empty: Self { Self(version: 1, pairing: nil, requests: []) }
}
enum MacDeviceStore {
  private static let service = "dev.watch-agents.mac-device"
  private static var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "current"] }
  static func read() throws -> MacDeviceState {
    var attributes = query; attributes[kSecReturnData as String] = true
    var result: CFTypeRef?; let status = SecItemCopyMatching(attributes as CFDictionary, &result)
    if status == errSecItemNotFound { return .empty }
    guard status == errSecSuccess, let data = result as? Data else { throw NSError(domain: "WatchAgentsPairingRead", code: Int(status)) }
    let value = try JSONDecoder().decode(MacDeviceState.self, from: data)
    guard value.version == 1, value.requests.count <= 100 else { throw AgentHubError.server("Stored device data is invalid. It was not reset.") }
    for request in value.requests { _ = try request.action.validated() }
    return value
  }
  static func write(_ state: MacDeviceState) throws {
    let data = try JSONEncoder().encode(state)
    guard data.count <= 262144 else { throw AgentHubError.server("Clear acknowledged local receipts before saving more device data") }
    let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecItemNotFound {
      var attributes = query; attributes[kSecValueData as String] = data; attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      let added = SecItemAdd(attributes as CFDictionary, nil); guard added == errSecSuccess else { throw NSError(domain: "WatchAgentsPairingWrite", code: Int(added)) }
    } else if status != errSecSuccess { throw NSError(domain: "WatchAgentsPairingWrite", code: Int(status)) }
  }
  static func forget() throws {
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw NSError(domain: "WatchAgentsPairingForget", code: Int(status)) }
  }
}
