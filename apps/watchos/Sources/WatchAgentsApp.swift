import SwiftUI
import Observation
import AgentHubCore
import AgentHubUI
import WatchKit
import UserNotifications

extension Notification.Name { static let watchAgentsPushTokenChanged = Notification.Name("watchAgentsPushTokenChanged") }

final class WatchAppDelegate: NSObject, WKExtensionDelegate {
  func applicationDidFinishLaunching() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in
      DispatchQueue.main.async { WKExtension.shared().registerForRemoteNotifications() }
    }
  }
  func didRegisterForRemoteNotifications(withDeviceToken deviceToken: Data) { PushTokenStore.current = deviceToken.map { String(format: "%02x", $0) }.joined(); NotificationCenter.default.post(name: .watchAgentsPushTokenChanged, object: nil) }
}
enum PushTokenStore { static var current: String? { get { UserDefaults.standard.string(forKey: "apnsToken") } set { UserDefaults.standard.set(newValue, forKey: "apnsToken") } } }

@main
struct WatchAgentsApp: App {
  @WKExtensionDelegateAdaptor(WatchAppDelegate.self) private var appDelegate
  @State private var store = HubStore()
  var body: some Scene { WindowGroup { RootView().environment(store) } }
}

@MainActor @Observable
final class HubStore {
  var runs: [AgentRun] = []
  var metrics: MetricsResponse?
  var error: String?
  var isLoading = false
  var hubURL = UserDefaults.standard.string(forKey: "hubURL") ?? ""
  var token = UserDefaults.standard.string(forKey: "deviceToken") ?? ""
  private let identity = try? DeviceIdentity()

  var isPaired: Bool { URL(string: hubURL) != nil && !token.isEmpty }
  private var client: AgentHubClient? { guard let url = URL(string: hubURL) else { return nil }; return AgentHubClient(baseURL: url, token: token.isEmpty ? nil : token, signer: identity) }

  func refresh() async {
    guard let client else { return }; isLoading = true; defer { isLoading = false }
    do { async let fetchedRuns = client.runs(); async let fetchedMetrics = client.metrics(); runs = try await fetchedRuns; metrics = try await fetchedMetrics; error = nil } catch { self.error = error.localizedDescription }
  }
  func pair(code: String, privacy: PrivacyMode) async throws {
    guard let client else { throw AgentHubError.invalidURL }
    let response = try await client.pair(code: code, label: "Apple Watch", pushToken: PushTokenStore.current, privacyMode: privacy)
    token = response.token; UserDefaults.standard.set(token, forKey: "deviceToken"); UserDefaults.standard.set(hubURL, forKey: "hubURL")
    await refresh()
  }
  func approve(_ id: String) async { guard let client else { return }; do { try await client.approve(hitlID: id); await refresh() } catch { self.error = error.localizedDescription } }
  func followUp(_ run: AgentRun) async { guard let client else { return }; do { try await client.dispatchFollowUp(runID: run.id); await refresh() } catch { self.error = error.localizedDescription } }
  func updatePushToken() async { guard let client else { return }; try? await client.updatePushToken(PushTokenStore.current, privacyMode: .redacted) }
}

struct RootView: View {
  @Environment(HubStore.self) private var store
  var body: some View {
    TabView {
      DashboardView().tabItem { Label("Hub", systemImage: "dot.radiowaves.left.and.right") }
      HistoryView().tabItem { Label("Runs", systemImage: "clock") }
      MetricsView().tabItem { Label("Metrics", systemImage: "chart.bar") }
      SettingsView().tabItem { Label("Setup", systemImage: "gear") }
    }.task(id: store.isPaired) { await store.refresh() }
      .onReceive(NotificationCenter.default.publisher(for: .watchAgentsPushTokenChanged)) { _ in Task { await store.updatePushToken() } }
  }
}

struct DashboardView: View {
  @Environment(HubStore.self) private var store
  var body: some View { List { if !store.isPaired { ContentUnavailableView("Pair your hub", systemImage: "link", description: Text("Enter a public hub URL and pairing code in Setup.")) } else { Section("Active") { ForEach(store.runs.filter { $0.status == .running || $0.status == .awaiting_hitl }) { RunRow(run: $0) } }; Section("Needs approval") { ForEach(store.runs.filter { $0.hitlId != nil }) { run in Button("Approve \(run.hitlLabel ?? run.title)") { Task { await store.approve(run.hitlId!) } }.tint(.orange) } } } }.refreshable { await store.refresh() }.alert("Watch Agents", isPresented: .constant(store.error != nil), actions: { Button("OK") { store.error = nil } }, message: { Text(store.error ?? "") }) }
}

struct HistoryView: View {
  @Environment(HubStore.self) private var store
  var body: some View { List(store.runs) { run in NavigationLink { RunDetailView(run: run) } label: { RunRow(run: run) } }.refreshable { await store.refresh() } }
}
struct RunRow: View { let run: AgentRun; var body: some View { VStack(alignment: .leading) { Text(run.title).lineLimit(2); HStack { RunStatusBadge(status: run.status); Text(run.displayName).font(.caption2).foregroundStyle(.secondary) } } } }
struct RunDetailView: View {
  @Environment(HubStore.self) private var store
  let run: AgentRun
  var body: some View { ScrollView { VStack(alignment: .leading, spacing: 10) { Text(run.title).font(.headline); RunStatusBadge(status: run.status); if let summary = run.summary { Text(summary) }; if let id = run.hitlId { Button("Approve") { Task { await store.approve(id) } }.buttonStyle(.borderedProminent).tint(.orange) }; if run.followUpPrompt != nil && run.followUpStatus == "ready" { Button("Run follow-up") { Task { await store.followUp(run) } }.buttonStyle(.borderedProminent) } } }.navigationTitle("Run") }
}
struct MetricsView: View {
  @Environment(HubStore.self) private var store
  var body: some View { List { Section("Last \(store.metrics?.days ?? 7) days") { ForEach(store.metrics?.series ?? []) { point in HStack { Text(point.day); Spacer(); Text("\(point.count)").monospacedDigit() } } } }.refreshable { await store.refresh() } }
}
struct SettingsView: View {
  @Environment(HubStore.self) private var store
  @State private var code = ""; @State private var privacy: PrivacyMode = .redacted
  var body: some View { Form { TextField("Hub URL", text: $store.hubURL).textInputAutocapitalization(.never); SecureField("Pairing code", text: $code); Picker("Notification detail", selection: $privacy) { Text("Redacted").tag(PrivacyMode.redacted); Text("Summary").tag(PrivacyMode.summary) }; Button(store.isPaired ? "Re-pair" : "Pair watch") { Task { do { try await store.pair(code: code, privacy: privacy) } catch { store.error = error.localizedDescription } } }; if store.isPaired { Button("Refresh") { Task { await store.refresh() } } } }.navigationTitle("Setup") }
}
