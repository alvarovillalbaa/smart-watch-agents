# macOS companion and status widget

The small menu-bar companion pairs with your existing Watch Agents hub. It
reads up to100 recent runs while running, every60seconds, and when you choose
Refresh. The widget reads only its last recorded snapshot, with a five-minute
staleness indicator; WidgetKit controls when it refreshes. It never holds a
token/private key or contacts an agent. Counts cover the recorded recent runs,
not an all-time or currently executing runtime census. Titles are off by default.

Pairing and original-hub prepared requests live in this app's Keychain record.
Review a decision or the exact follow-up before queuing it. An uncertain request
stays available to reconcile with its original hub, even after pairing elsewhere.
A queued-command receipt is separate from actual agent execution. Local forget
removes saved requests/keys; it cannot revoke a remote device or undo a command.

Build with Xcode on macOS14+ and XcodeGen2.46.0. The generated project,
Info.plists and entitlements are derived from apps/macos/project.yml and ignored.
No package dependency is downloaded for the local Apple package. The single
entrypoint is script/build_and_run.sh (also the Codex Run action); it requires
your existing WATCH_AGENTS_TEAM_ID and accepts WATCH_AGENTS_APP_GROUP override.
It does not enroll an account or purchase a plan. Follow the local Storage Guard
before generating/building. It supports --debug, --logs, --telemetry and --verify.

The app and WidgetKit extension must use the same authorized App Group. The
script defaults to TEAMID.dev.watchagents. Apple's macOS Team-ID-prefixed group
format does not require a provisioning profile; a group.* identifier instead
needs the appropriate existing registration/profile. Do not invent a Team ID,
certificate or entitlement authorization. See [Apple's App Groups entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.application-groups)
and [macOS container access](https://developer.apple.com/documentation/xcode/accessing-app-group-containers).

Open the signed companion, pair your hub, then use macOS Edit Widgets to add
Watch Agents. Clicking its status opens the companion; it sends no automatic
action. A missing/unreadable shared snapshot is shown explicitly. The app's
“show titles” toggle changes only this snapshot, which contains no credentials.

CI separately qualifies the Apple package, unsigned app/widget compilation,
local ad-hoc bundle signatures, a DEBUG-only explicit storage probe, archive and
actual native signature accepted by the Node/PostgreSQL hub. App Group access
is recorded independently and may be refused on an identity-free runner. A
compiled/ad-hoc archive is not Developer-ID signing, notarization, a mounted
widget, Gatekeeper acceptance or a real user-device check. No bypass is offered.
