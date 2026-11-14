# Narrow macOS signing repair — accepted

[Run43604637783](https://github.com/alvarovillalbaa/smart-watch-agents/actions/runs/43604637783),
job132476533190, source2cb912571e80b5ed2dd5254729f34c91fd399771, passed.
The18 native source/package inputs are byte-identical to compiled611fc4c.
The exact525952B original compiled ZIP was verified against its frozen hash,
unpacked, then re-signed with resolved values from its actual built Info.plist.
The focused repair ran no Swift suite or HTTP case and performed no rebuild.
Permanent push CI remains enabled separately. No private certificate, paid
account, existing hub/database or local runtime was used.

Actual signed entitlements match inspected effective values: both app and
widget sandbox enabled, both group.dev.watchagents; network.client only on the
companion. Both real ad-hoc signatures verify. The DEBUG-only headless app probe
passed actual Keychain persistence/original-origin saved request/oversize
preservation/local forget under the changed signature context. Actual App Group
snapshot write/read/default title redaction and guarded owned-file removal
PASSED. Both exact Keychain services are absent afterward. This corrects the
signing observation only; the first literal-variable refusal remains false in
macos-v1 and was not overwritten. No sandbox or trust setting was disabled.

Original artifact557663B, SHA256
6709cd5df2b6113247d80252a5785dd684f33896e34204ca94b2ef7a94039b1a,
matches provider digest. All207 before/after/copied source inputs match their
Git blobs. All15 commands'30 full streams match hashes/lengths, leaders reaped,
groups absent, no timeout. Owned5792825B scratch removed. Actual new11-file
app/embedded-widget ZIP525925B has SHA256
bafb93e16ede36e4a5eeeaac78e8bfbbd17359d5afa5b1e0c56752dee61a915a.
Archive paths/modes/member hashes are retained in package-manifest.json.

The app was invoked only through its explicit headless DEBUG storage flag.
This is not a normal native-window launch, mounted WidgetKit acceptance,
Developer-ID signing, notarization, Gatekeeper acceptance, device/push or real
agent execution. The artifact is an ad-hoc debug inspection build, not a
notarized installer. Normal source builds use the documented existing signing
team and matching App Group. Temporary418348456 is disabled for retirement;
its final narrow recipe is kept inert, permanent CI unchanged.
