# Desktop client contract1

Last updated: 2026-11-14

New migration3 adds chrome/macos device kinds. Both use P-256 IEEE-P1363,
identical to the qualified WatchOS protocol2 wire representation; Wear remains
DER. Original migration2 and action-v2.md stay immutable. This is still the
single-owner pairing authority, not tenant roles or a read-only token scope.
The explicit migration command must be applied before new client enrollment.

Chrome is a ManifestV3 new-tab extension with no content script, background
runtime, browsing-history collection or SDK account. Network permissions let
it reach the user-configured HTTPS hub and explicit localhost development
origins; no public crawling/agent proxy. Pairing binds token and nonextractable
WebCrypto private key to that origin in its own IndexedDB. Failed input/storage
does not reset a prior pairing. Multiple tabs use a connection revision and
BroadcastChannel; another tab's newer pairing invalidates stale work.

Before an agent action, show the actual pending HITL/follow-up text and require
the user to choose the action. Persist its exact origin/token/path/body/signature
intent before sending. A lost response remains uncertain; explicit retry reuses
that saved request so the server returns the original command. New hub/context
must never receive the old intent. Acknowledgement in an old context remains
saved and displayed with that hub's origin. No automatic agent-action retry.

Forget-device-data is an explicit local credential/intent deletion, with a clear
notice that it cannot undo a command or revoke the hub's device record. No
claim of remote revocation. Labels/source content render literally. Public
preview is separately labelled authored data, with no pairing/agent action.

macOS is widget-first: a small pairing/refresh companion owns credentials and
an App Group snapshot, WidgetKit displays its recorded status/staleness and
opens the companion for deliberate actions. No secret is stored in the widget
snapshot. App Group signing/actual mounted-widget/device acceptance remain
separate from source/build/fixture proof and require their own observation.
