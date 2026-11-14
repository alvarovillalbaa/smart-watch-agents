#if DEBUG
import AgentHubCore
import AgentHubWidgetModel
import Foundation
import Security

// Explicit headless qualification entrypoint in DEBUG builds only. Never runs
// during ordinary app launch. It refuses pre-existing items before ownership.
enum StorageQualification {
  static func run() -> Never {
    var result: [String: Any] = ["schema": "watch-agents.mac-storage-evidence", "version": 1, "passed": false]
    var ownsDevice = false, ownsIdentity = false
    do {
      for service in ["dev.watch-agents.mac-device", "dev.watch-agents.identity"] {
        let status = SecItemCopyMatching([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary, nil)
        guard status == errSecItemNotFound else { throw NSError(domain: "ExistingKeychainItemMustNotBeTouched", code: Int(status)) }
      }
      ownsDevice = true; ownsIdentity = true
      let identity = try DeviceIdentity(), again = try DeviceIdentity()
      guard identity.publicKeyPEM == again.publicKeyPEM else { throw AgentHubError.server("Keychain identity did not persist") }
      let original = URL(string: "https://first.authored.example.test")!, other = URL(string: "https://second.authored.example.test")!
      let client = AgentHubClient(baseURL: original, signer: identity), prepared = try client.prepareAction(kind: .approveHitl, subject: "authored /批准")
      let saved = MacSavedRequest(origin: original, token: "authored-original-token", action: prepared, label: "Authored decision")
      var state = MacDeviceState.empty
      state.pairing = MacPairing(origin: original, token: "authored-original-token", deviceId: UUID().uuidString, publicKey: identity.publicKeyPEM); state.requests = [saved]
      try MacDeviceStore.write(state)
      var restored = try MacDeviceStore.read()
      guard restored.requests.first?.action == prepared, restored.pairing?.origin == original else { throw AgentHubError.server("Device state did not persist") }
      restored.pairing = MacPairing(origin: other, token: "authored-other-token", deviceId: UUID().uuidString, publicKey: identity.publicKeyPEM)
      try MacDeviceStore.write(restored); restored = try MacDeviceStore.read()
      guard restored.pairing?.origin == other, restored.requests.first?.origin == original, restored.requests.first?.token == "authored-original-token", restored.requests.first?.action == prepared else { throw AgentHubError.server("Saved intent lost its original context") }
      result["keychainRoundTripAndOriginalContext"] = true
      var tooLarge = restored; tooLarge.requests = [MacSavedRequest(origin: original, token: String(repeating: "x", count: 270000), action: prepared, label: "Authored oversize")]
      var refused = false; do { try MacDeviceStore.write(tooLarge) } catch { refused = true }
      guard refused, try MacDeviceStore.read().requests.first?.action == prepared else { throw AgentHubError.server("Refused storage mutation changed a saved request") }
      result["oversizePreservedPriorState"] = true
      try MacDeviceStore.forget(); try DeviceIdentity.forgetLocalIdentity()
      guard try MacDeviceStore.read().pairing == nil else { throw AgentHubError.server("Local forget left pairing data") }
      result["localForget"] = true
      do {
        let group = Bundle.main.object(forInfoDictionaryKey: "WatchAgentsGroupIdentifier") as? String ?? "group.dev.watchagents"
        let cache = try WidgetSnapshotCache.shared(group: group)
        let file = cache.directory.appendingPathComponent("watch-agents-snapshot.json")
        guard !FileManager.default.fileExists(atPath: file.path) else { throw AgentHubError.server("Existing shared snapshot must not be touched") }
        let snapshot = try WidgetSnapshot(paired: true, fetchedAt: Date(timeIntervalSince1970: 1_700_000_000), running: 2, approvals: 1, titles: ["Authored private title"])
        try cache.write(snapshot)
        let bytes = try Data(contentsOf: file)
        do {
          guard try cache.read() == snapshot, !String(decoding: bytes, as: UTF8.self).contains("Authored private title") else { throw AgentHubError.server("Shared snapshot round trip differed") }
          result["appGroupSnapshot"] = true
        } catch { if (try? Data(contentsOf: file)) == bytes { try FileManager.default.removeItem(at: file) }; throw error }
        guard try Data(contentsOf: file) == bytes else { throw AgentHubError.server("Shared snapshot changed before cleanup") }
        try FileManager.default.removeItem(at: file); result["ownedSharedSnapshotRemoved"] = !FileManager.default.fileExists(atPath: file.path)
      } catch { result["appGroupSnapshot"] = false; result["appGroupError"] = String(describing: error) }
      result["passed"] = true
    } catch { result["error"] = String(describing: error) }
    if ownsDevice { do { try MacDeviceStore.forget() } catch { result["cleanupError"] = String(describing: error); result["passed"] = false } }
    if ownsIdentity { do { try DeviceIdentity.forgetLocalIdentity() } catch { result["cleanupError"] = String(describing: error); result["passed"] = false } }
    for service in ["dev.watch-agents.mac-device", "dev.watch-agents.identity"] where ownsDevice && ownsIdentity {
      let status = SecItemCopyMatching([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary, nil)
      if status != errSecItemNotFound { result["cleanupError"] = "Owned Keychain item is not absent"; result["passed"] = false }
    }
    result["ownedKeychainItemsAbsent"] = ownsDevice && ownsIdentity && result["cleanupError"] == nil
    if let bytes = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]) { FileHandle.standardOutput.write(bytes); FileHandle.standardOutput.write(Data("\n".utf8)) }
    exit(result["passed"] as? Bool == true ? 0 : 1)
  }
}
#endif
