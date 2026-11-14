import AgentHubWidgetModel
import SwiftUI
import WidgetKit

private struct StatusEntry: TimelineEntry { let date: Date; let snapshot: WidgetSnapshot; let unavailable: Bool }
private struct StatusProvider: TimelineProvider {
  func placeholder(in context: Context) -> StatusEntry { StatusEntry(date: Date(), snapshot: .unpaired, unavailable: false) }
  func getSnapshot(in context: Context, completion: @escaping (StatusEntry) -> Void) { completion(read()) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<StatusEntry>) -> Void) { let entry = read(); completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(300)))) }
  private func read() -> StatusEntry {
    do {
      let group = Bundle.main.object(forInfoDictionaryKey: "WatchAgentsGroupIdentifier") as? String ?? "group.dev.watchagents"
      return StatusEntry(date: Date(), snapshot: try WidgetSnapshotCache.shared(group: group).read(), unavailable: false)
    } catch { return StatusEntry(date: Date(), snapshot: .unpaired, unavailable: true) }
  }
}
private struct StatusView: View {
  let entry: StatusEntry
  @Environment(\.widgetFamily) private var family
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack { Label("Watch Agents", systemImage: "waveform.path").font(.caption.weight(.semibold)); Spacer(); if entry.snapshot.isStale(at: entry.date) { Image(systemName: "clock").foregroundStyle(.secondary).accessibilityLabel("Snapshot is stale") } }
      if entry.unavailable { Text("Open your companion").font(.headline); Text("The shared snapshot is unavailable.").font(.caption).foregroundStyle(.secondary) }
      else if !entry.snapshot.paired { Text("Your agents, nearby.").font(.headline); Text("Open the companion to pair your hub.").font(.caption).foregroundStyle(.secondary) }
      else {
        HStack(spacing: family == .systemSmall ? 12 : 30) { count(entry.snapshot.running, "Running"); count(entry.snapshot.approvals, "Decisions"); if family != .systemSmall { count(entry.snapshot.followUps, "Follow-ups") } }
        if family != .systemSmall, let title = entry.snapshot.recentTitles.first { Text(title).font(.caption).lineLimit(1) }
        if let fetched = entry.snapshot.fetchedAt { HStack(spacing: 3) { Text(entry.snapshot.isStale(at: entry.date) ? "Last read" : "Read"); Text(fetched, style: .relative); Text("ago") }.font(.caption2).foregroundStyle(.secondary) }
        else { Text("Waiting for the first read").font(.caption2).foregroundStyle(.secondary) }
      }
      Spacer(minLength: 0)
    }.containerBackground(for: .widget) { Color(red: 0.91, green: 0.94, blue: 0.89) }.widgetURL(URL(string: "watchagents://hub"))
  }
  private func count(_ value: Int, _ label: String) -> some View { VStack(alignment: .leading, spacing: 2) { Text(value, format: .number).font(.system(size: 28, weight: .semibold, design: .rounded)); Text(label).font(.caption2).foregroundStyle(.secondary) } }
}
@main
struct WatchAgentsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WatchAgentsStatus", provider: StatusProvider()) { StatusView(entry: $0) }
      .configurationDisplayName("Watch Agents")
      .description("The last recorded status of your personal agents. Open the companion for decisions.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}
