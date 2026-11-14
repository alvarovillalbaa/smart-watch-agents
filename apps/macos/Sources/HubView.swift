import AgentHubCore
import SwiftUI

struct HubView: View {
  @Bindable var store: HubStore
  @State private var connectionExpanded = false
  @State private var confirmForget = false
  @State private var query = ""
  private var visibleRuns: [AgentRun] { store.runs.filter { query.isEmpty || ($0.title + " " + $0.displayName).localizedCaseInsensitiveContains(query) } }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 6) { Text("WATCH AGENTS").font(.caption.weight(.semibold)).tracking(2).foregroundStyle(.secondary); Text("A little closer to your agents.").font(.system(size: 28, weight: .semibold, design: .rounded)) }
          Spacer()
          Button { Task { await store.refresh() } } label: { if store.busy { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.clockwise") } }.help("Read the current hub").disabled(!store.paired || store.busy)
        }
        Text(store.message).font(.callout).foregroundStyle(store.error ? Color.orange : Color.secondary).textSelection(.enabled)
        if store.paired {
          HStack(spacing: 12) { metric("Running", store.runningCount, "bolt"); metric("Decisions", store.approvalCount, "hand.raised"); metric("Follow-ups", store.followUpCount, "arrow.turn.down.right") }
          HStack { Text("Latest runs").font(.headline); Spacer(); if let date = store.fetchedAt { Text(date, style: .relative).font(.caption).foregroundStyle(.secondary); Text("ago").font(.caption).foregroundStyle(.secondary) } }
          TextField("Find a run or agent", text: $query).textFieldStyle(.roundedBorder)
          if store.runs.isEmpty { empty("No runs yet", "Your connected hub has no recent runs. New activity appears after a refresh.") }
          else if visibleRuns.isEmpty { empty("No matching runs", "Try another title or agent name.") }
          else { LazyVStack(spacing: 12) { ForEach(visibleRuns) { run in runCard(run) } } }
        }
        if !store.requests.isEmpty { requestSection }
        connectionSection
        VStack(alignment: .leading, spacing: 9) {
          Label("On your desktop", systemImage: "rectangle.3.group").font(.headline)
          Text("Add Watch Agents from macOS Edit Widgets. The widget reads the companion’s last snapshot; it cannot send an agent action. Keep the companion running for periodic reads.").font(.callout).foregroundStyle(.secondary)
          Toggle("Show recent run titles in the widget", isOn: $store.showWidgetTitles).onChange(of: store.showWidgetTitles) { store.widgetPreferencesChanged() }
          if let error = store.widgetError { Text(error).font(.caption).foregroundStyle(.orange) }
        }
        Text("A hub receipt means a command was queued. Execution is reported separately by your agent. Status comes from up to100 recent runs; this companion does not start an agent runtime.").font(.caption).foregroundStyle(.secondary)
      }.padding(28)
    }
    .frame(minWidth: 480, minHeight: 500)
    .tint(Color(red: 0.19, green: 0.40, blue: 0.29))
    .sheet(item: $store.review) { review in
      VStack(alignment: .leading, spacing: 18) {
        Text(review.kind == .approveHitl ? "Review this decision" : "Review this follow-up").font(.title2.bold())
        Text(review.label).font(.headline); Text(review.origin.absoluteString).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
        ScrollView { Text(review.text).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled) }.frame(minHeight: 160, maxHeight: 300)
        Text("Send once to this hub. If the response is lost, use the saved request to reconcile its original receipt.").font(.caption).foregroundStyle(.secondary)
        HStack { Button("Cancel") { store.review = nil }.keyboardShortcut(.cancelAction); Spacer(); Button(review.kind == .approveHitl ? "Approve and queue" : "Queue follow-up") { Task { await store.sendReview() } }.buttonStyle(.borderedProminent).disabled(store.busy) }
      }.padding(26).frame(width: 470)
    }
    .confirmationDialog("Forget this Mac’s local device data?", isPresented: $confirmForget, titleVisibility: .visible) {
      Button("Forget local data", role: .destructive) { store.forget() }; Button("Cancel", role: .cancel) {}
    } message: { Text("This removes local pairing, signing key and saved requests. It does not revoke the hub’s device or undo accepted commands. Uncertain requests will no longer be available to reconcile on this Mac.") }
  }
  private func metric(_ title: String, _ value: Int, _ symbol: String) -> some View {
    VStack(alignment: .leading, spacing: 8) { Image(systemName: symbol).foregroundStyle(.secondary); Text(value, format: .number).font(.system(size: 27, weight: .semibold, design: .rounded)); Text(title).font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, alignment: .leading).padding(16).background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
  }
  private func empty(_ title: String, _ text: String) -> some View { VStack(alignment: .leading, spacing: 6) { Text(title).font(.headline); Text(text).font(.callout).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, alignment: .leading).padding(20).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 14)) }
  private func runCard(_ run: AgentRun) -> some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack { Text(run.displayName).font(.caption.weight(.medium)).foregroundStyle(.secondary); Spacer(); Text(status(run.status)).font(.caption).foregroundStyle(run.status == .failed ? Color.orange : Color.secondary) }
      Text(run.title).font(.headline).textSelection(.enabled)
      if let summary = run.summary { Text(summary).font(.callout).foregroundStyle(.secondary).lineLimit(4) }
      HStack { if run.hitlId != nil { Button("Review decision") { store.choose(run, kind: .approveHitl) }.disabled(store.busy) }; if run.followUpStatus == "ready", run.followUpPrompt != nil { Button("Review follow-up") { store.choose(run, kind: .dispatchFollowUp) }.disabled(store.busy) }; Spacer(); Text(run.updatedAt, style: .relative).font(.caption).foregroundStyle(.secondary) }
    }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 14))
  }
  private func status(_ value: RunStatus) -> String { switch value { case .running: "Running"; case .awaiting_hitl: "Paused for a decision"; case .completed: "Completed"; case .failed: "Failed"; case .cancelled: "Cancelled" } }
  private var requestSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack { Text("Saved requests").font(.headline); Spacer(); Button("Clear acknowledged") { store.clearAcknowledged() }.disabled(store.busy || !store.requests.contains { $0.commandId != nil }) }
      ForEach(store.requests) { request in
        VStack(alignment: .leading, spacing: 6) {
          Text(request.label).font(.callout.bold()); Text("Original hub: " + request.origin.absoluteString).font(.caption).foregroundStyle(.secondary)
          if let id = request.commandId { Text("Acknowledged · " + id).font(.caption).textSelection(.enabled) }
          else { Text(request.error ?? "Saved before sending. Receipt is not yet confirmed.").font(.caption).foregroundStyle(.orange); Button("Reconcile original request") { Task { await store.retry(request) } }.disabled(store.busy) }
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 10))
      }
    }
  }
  private var connectionSection: some View {
    DisclosureGroup("Connection · " + store.origin, isExpanded: Binding(get: { connectionExpanded || !store.paired }, set: { connectionExpanded = $0 })) {
      VStack(alignment: .leading, spacing: 10) {
        Text("Use a one-time code from your own Watch Agents hub. HTTPS is required, except explicit localhost development.").font(.callout).foregroundStyle(.secondary)
        TextField("Hub origin · https://hub.example.com", text: $store.draftURL)
        TextField("Device name", text: $store.deviceLabel)
        SecureField("One-time pairing code", text: $store.pairingCode)
        HStack { Button(store.paired ? "Pair with this hub" : "Pair this Mac") { Task { await store.pair() } }.buttonStyle(.borderedProminent).disabled(!store.canPair || store.draftURL.isEmpty || store.pairingCode.isEmpty); Spacer(); Button("Forget local data…", role: .destructive) { confirmForget = true }.disabled(store.busy) }
      }.textFieldStyle(.roundedBorder).padding(.top, 10)
    }
  }
}
