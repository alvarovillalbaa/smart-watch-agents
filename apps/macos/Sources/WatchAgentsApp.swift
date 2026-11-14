import AgentHubWidgetModel
import AppKit
import SwiftUI

@main
struct WatchAgentsApp: App {
  @State private var store = HubStore()
  init() {
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("--qualify-storage") {
      StorageQualification.run()
    }
    #endif
  }
  var body: some Scene {
    MenuBarExtra("Watch Agents", systemImage: "waveform.path") {
      MenuStatus(store: store)
        .task { await store.start() }
    }
    .menuBarExtraStyle(.window)
    Window("Watch Agents", id: "hub") {
      HubView(store: store)
        .task { await store.start() }
        .onOpenURL { url in if url.scheme == "watchagents" { NSApp.activate(ignoringOtherApps: true) } }
    }
    .defaultSize(width: 580, height: 690)
    .windowResizability(.contentMinSize)
    .handlesExternalEvents(matching: ["hub"])
  }
}

private struct MenuStatus: View {
  @Bindable var store: HubStore
  @Environment(\.openWindow) private var openWindow
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Label("WATCH AGENTS", systemImage: "waveform.path").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
      Text(store.paired ? "Your agents, at a glance." : "Connect your personal hub.").font(.title3.weight(.semibold))
      HStack(spacing: 22) { count("Running", store.runningCount); count("Decisions", store.approvalCount); count("Follow-ups", store.followUpCount) }
      if let date = store.fetchedAt { Text("Last read \(date, style: .relative) ago").font(.caption).foregroundStyle(.secondary) }
      Text(store.message).font(.caption).foregroundStyle(store.error ? Color.orange : Color.secondary).lineLimit(3)
      Button(store.paired ? "Open hub" : "Set up connection") { openWindow(id: "hub"); NSApp.activate(ignoringOtherApps: true) }.buttonStyle(.borderedProminent)
      HStack { Button("Refresh", systemImage: "arrow.clockwise") { Task { await store.refresh() } }.disabled(!store.paired || store.busy); Spacer(); Button("Quit") { NSApp.terminate(nil) } }
        .font(.caption)
    }.padding(20).frame(width: 300)
  }
  private func count(_ title: String, _ value: Int) -> some View { VStack(alignment: .leading, spacing: 2) { Text(value, format: .number).font(.title2.monospacedDigit().weight(.semibold)); Text(title).font(.caption).foregroundStyle(.secondary) } }
}
