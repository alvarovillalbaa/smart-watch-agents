import CryptoKit
import Foundation
import Security

public protocol DeviceSigning: Sendable {
  var publicKeyPEM: String { get }
  func signature(for message: String) throws -> String
}

public final class DeviceIdentity: DeviceSigning, @unchecked Sendable {
  private static let keychainService = "dev.watch-agents.identity"
  private let key: P256.Signing.PrivateKey

  public init() throws {
    if let raw = Self.readKey(), let existing = try? P256.Signing.PrivateKey(rawRepresentation: raw) {
      key = existing
    } else {
      let generated = P256.Signing.PrivateKey()
      try Self.saveKey(generated.rawRepresentation)
      key = generated
    }
  }

  public var publicKeyPEM: String {
    // ASN.1 SubjectPublicKeyInfo prefix for an uncompressed NIST P-256 key.
    let prefix = Data([0x30,0x59,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x03,0x42,0x00])
    let der = prefix + key.publicKey.x963Representation
    let encoded = der.base64EncodedString(options: [.lineLength64Characters])
    return "-----BEGIN PUBLIC KEY-----\n\(encoded)\n-----END PUBLIC KEY-----"
  }

  public func signature(for message: String) throws -> String {
    try key.signature(for: Data(message.utf8)).rawRepresentation.base64EncodedString()
  }

  private static func readKey() -> Data? {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService, kSecReturnData as String: true]
    var item: CFTypeRef?; guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
    return item as? Data
  }
  private static func saveKey(_ data: Data) throws {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService, kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw NSError(domain: "AgentHub", code: Int(status)) }
  }
}
