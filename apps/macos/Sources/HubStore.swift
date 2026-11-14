import AgentHubCore
import AgentHubWidgetModel
import Foundation
import Observation
import WidgetKit

struct MacReview: Identifiable { let id = UUID(); let kind: AgentHubActionKind; let subject: String; let label: String; let text: String; let origin: URL; let epoch: Int }
@MainActor @Observable
final class HubStore {
  var runs: [AgentRun] = []
  var metrics: MetricsResponse?
  var message = "Pair your own hub to begin."
  var error = false
  var busy = false
  var draftURL = ""
  var pairingCode = ""
  var deviceLabel = "My Mac"
  var review: MacReview?
  var fetchedAt: Date?
  var widgetError: String?
  var showWidgetTitles = UserDefaults.standard.bool(forKey: "showWidgetTitles")
  private var device: MacDeviceState?
  private var epoch = 0
  private var started = false
  private var polling: Task<Void, Never>?
  var paired: Bool { device?.pairing != nil }
  var canPair: Bool { device != nil && !busy }
  var origin: String { device?.pairing?.origin.absoluteString ?? "Not paired" }
  var requests: [MacSavedRequest] { device?.requests ?? [] }
  var runningCount: Int { runs.filter { $0.status == .running }.count }
  var approvalCount: Int { runs.filter { $0.hitlId != nil }.count }
  var followUpCount: Int { runs.filter { $0.followUpStatus == "ready" }.count }
  static var group: String { Bundle.main.object(forInfoDictionaryKey: "WatchAgentsGroupIdentifier") as? String ?? "group.dev.watchagents" }
  func start() async {
    guard !started else { return }; started = true
    do { device = try MacDeviceStore.read(); draftURL = device?.pairing?.origin.absoluteString ?? ""; if paired { await refresh() } }
    catch { message = "macOS could not read this device’s pairing. Existing data was not reset. " + error.localizedDescription; self.error = true }
    polling = Task { [weak self] in while !Task.isCancelled { do { try await Task.sleep(for: .seconds(60)) } catch { break }; guard let self else { break }; if self.paired && !self.busy { await self.refresh(announce: false) } } }
  }
  private func url(_ text: String) throws -> URL {
    guard let value = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), let host = value.host, !host.isEmpty, value.user == nil, value.password == nil, value.query == nil, value.fragment == nil, value.path.isEmpty || value.path == "/", value.scheme == "https" || (value.scheme == "http" && ["localhost", "127.0.0.1"].contains(host)) else { throw AgentHubError.invalidURL }
    return value
  }
  func pair() async {
    guard canPair, var next = device else { return }; busy = true; defer { busy = false }
    do {
      let origin = try url(draftURL), identity = try DeviceIdentity(), client = AgentHubClient(baseURL: origin, signer: identity)
      let result = try await client.pair(code: pairingCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(), label: deviceLabel, platform: "macos")
      next.pairing = MacPairing(origin: origin, token: result.token, deviceId: result.deviceId, publicKey: identity.publicKeyPEM)
      do { try MacDeviceStore.write(next) } catch { throw AgentHubError.server("Hub accepted device enrollment, but macOS could not save it. Previous pairing is preserved; check the original hub before creating another code.") }
      epoch += 1; device = next; runs = []; metrics = nil; fetchedAt = nil; review = nil; pairingCode = ""; message = "This Mac is paired with " + origin.absoluteString; error = false
    } catch { message = error.localizedDescription; self.error = true; return }
    busy = false; await refresh()
  }
  func refresh(announce: Bool = true) async {
    guard !busy, let pairing = device?.pairing else { return }; busy = true; let context = epoch; defer { busy = false }
    do {
      let client = AgentHubClient(baseURL: pairing.origin, token: pairing.token)
      async let values = client.runs(limit: 100); async let counts = client.metrics()
      let (newRuns, newMetrics) = try await (values, counts); guard context == epoch else { return }
      runs = newRuns; metrics = newMetrics; fetchedAt = Date(); review = nil; if announce { message = "Read from " + pairing.origin.absoluteString + ". Showing up to100 recent runs."; error = false }; updateWidget()
    } catch { if context == epoch { message = error.localizedDescription + ". The previous view is preserved."; self.error = true; updateWidget(readFailed: true) } }
  }
  func choose(_ run: AgentRun, kind: AgentHubActionKind) {
    guard !busy, let origin = device?.pairing?.origin else { return }
    if kind == .approveHitl, let id = run.hitlId { review = MacReview(kind: kind, subject: id, label: run.hitlLabel ?? run.title, text: [run.hitlDescription ?? "No approval description was supplied.", "Risk: " + (run.hitlRisk ?? "not supplied")].joined(separator: "\n\n"), origin: origin, epoch: epoch) }
    if kind == .dispatchFollowUp, let prompt = run.followUpPrompt, run.followUpStatus == "ready" { review = MacReview(kind: kind, subject: run.id, label: run.title, text: prompt, origin: origin, epoch: epoch) }
  }
  func sendReview() async {
    guard !busy, let selected = review, selected.epoch == epoch, let pairing = device?.pairing, pairing.origin == selected.origin, var next = device else { return }
    busy = true; defer { busy = false }
    do {
      guard next.requests.count < 100 else { throw AgentHubError.server("Clear acknowledged local receipts before saving more requests") }
      let identity = try DeviceIdentity(); guard identity.publicKeyPEM == pairing.publicKey else { throw AgentHubError.server("The device key changed. Pair this Mac again before sending a new request.") }
      let client = AgentHubClient(baseURL: pairing.origin, token: pairing.token, signer: identity), action = try client.prepareAction(kind: selected.kind, subject: selected.subject)
      let request = MacSavedRequest(origin: pairing.origin, token: pairing.token, action: action, label: selected.label)
      next.requests.append(request); try MacDeviceStore.write(next); device = next; review = nil
      busy = false; await retry(request)
    } catch { message = error.localizedDescription; self.error = true }
  }
  func retry(_ saved: MacSavedRequest) async {
    guard !busy, saved.commandId == nil, device?.requests.contains(where: { $0.id == saved.id }) == true else { return }; busy = true; let context = epoch; defer { busy = false }
    do {
      let result = try await AgentHubClient(baseURL: saved.origin, token: saved.token).submitPreparedAction(saved.action)
      if var next = device, let index = next.requests.firstIndex(where: { $0.id == saved.id }) { next.requests[index].commandId = result.commandId; next.requests[index].error = nil; do { try MacDeviceStore.write(next); device = next } catch { throw AgentHubError.server("Original hub acknowledged command \(result.commandId), but macOS could not save its receipt. Retry the same saved request to reconcile it.") } }
      message = "Original hub \(saved.origin.absoluteString) acknowledged command \(result.commandId)."; error = false
      if context == epoch && device?.pairing?.origin == saved.origin { busy = false; await refresh(announce: false) }
    } catch {
      if var next = device, let index = next.requests.firstIndex(where: { $0.id == saved.id }) { next.requests[index].error = error.localizedDescription; do { try MacDeviceStore.write(next); device = next } catch {} }
      message = error.localizedDescription + ". Keep this saved request to reconcile its original hub; changing views cannot undo an accepted command."; self.error = true
    }
  }
  func clearAcknowledged() {
    guard !busy, var next = device else { return }; next.requests.removeAll { $0.commandId != nil }
    do { try MacDeviceStore.write(next); device = next } catch { message = error.localizedDescription; self.error = true }
  }
  func widgetPreferencesChanged() { UserDefaults.standard.set(showWidgetTitles, forKey: "showWidgetTitles"); updateWidget() }
  private func updateWidget(readFailed: Bool = false) {
    do {
      let value = try WidgetSnapshot(paired: paired, fetchedAt: fetchedAt, running: runningCount, approvals: approvalCount, followUps: followUpCount, titles: runs.prefix(3).map(\.title), showTitles: showWidgetTitles, readFailed: readFailed)
      try WidgetSnapshotCache.shared(group: Self.group).write(value); WidgetCenter.shared.reloadTimelines(ofKind: "WatchAgentsStatus"); widgetError = nil
    } catch { widgetError = "The shared widget container is unavailable. A correctly signed App Group build is required; this read does not prove widget installation." }
  }
  func forget() {
    guard !busy else { return }
    do { try MacDeviceStore.forget(); device = .empty; epoch += 1; runs = []; metrics = nil; fetchedAt = nil; review = nil; pairingCode = ""; draftURL = ""; try DeviceIdentity.forgetLocalIdentity(); updateWidget(); message = "Local pairing, keys and requests were forgotten. Hub devices and queued commands were not revoked or undone."; error = false }
    catch { message = "macOS could not complete local forgetting: " + error.localizedDescription; self.error = true }
  }
}
