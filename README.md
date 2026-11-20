# Watch Agents

<!-- project-family:start -->
> **Project family:** [OS Apps](https://github.com/alvarovillalbaa#os-apps) · **Area:** Agent companions
<!-- project-family:end -->

An open-source, self-hosted control hub for Hermes and OpenClaw agent runs.
Check the work in a Chrome new tab or a small macOS companion and status widget.
Review a decision or stored follow-up before choosing the next move. The hub
also includes watchOS/Wear OS source and an event connector for your runtime.

[Explore the authored preview](https://watch-agents-alvaro.vercel.app) ·
[Set up your hub](docs/INSTALL.md) · [Security and scope](docs/SECURITY.md)

[Public desktop/390/320 preview checks passed](docs/results/2026/11-14/site-narrow/result.md).

## What ships

- `services/control-plane`: PostgreSQL-backed API, pairing, audit log, metrics,
  deterministic follow-up drafts, and agent command queue.
- `packages/agent-connector`: JavaScript SDK for Hermes/OpenClaw lifecycle
  events and command polling.
- `packages/apple-core`: reusable Swift models, client, secure signing, and UI
  pieces for watchOS, iOS, and macOS.
- `apps/watchos`: native SwiftUI watch app source and XcodeGen project spec.
- `apps/wearos`: native Kotlin/Compose Wear OS app.
- `apps/chrome`: ManifestV3 new-tab client with pairing, source status/review,
  signed requests and original-hub retry. Six actual packaged browser identities
  [accepted across two runs](docs/results/2026/11-14/chrome-narrow/result.md);
  [developer setup](docs/references/chrome-setup.md).
- `apps/macos`: compact menu-bar companion with Keychain pairing and saved
  original-hub requests; WidgetKit reads a private, title-redacted-by-default
  App Group status snapshot. [Mac setup](docs/references/macos-setup.md).
- `site`: public landing and explicitly authored webpage preview. It cannot
  pair a device or control an agent; it is separate from the installed extension.

## Quick start

1. Copy `.env.example` to `.env`, set a real bootstrap and connector secret,
   and set `HUB_PUBLIC_URL` to a TLS URL reachable by the watches.
2. Follow the explicit database migration and Compose startup in
   [docs/INSTALL.md](docs/INSTALL.md).
3. Register an agent with `docker compose exec -T api node scripts/hubctl.mjs agent add hermes Hermes`.
4. Configure its event connector with your hub URL and connector token. The
   optional authored demo requires Node and explicit fixture environment values.
5. Create a one-time device code with `docker compose exec -T api node scripts/hubctl.mjs pair create`, then pair your client.

For simulator-only local development, use `http://localhost:8787`; real watches
require a publicly reachable HTTPS endpoint. See [docs/INSTALL.md](docs/INSTALL.md).

## Security model

The hub is single-owner. A watch enrolls a P-256 public key using a
short-lived pairing code. Every HITL approval and follow-up dispatch carries a
protocol2 signature over exact request bytes/path/time/nonce. Its SQL receipt,
source-bound subject, audit and queued command commit atomically; exact retry
returns the original command. Notification content defaults to redacted;
the owner may opt into summaries per device.

The [protocol2 prerequisite](docs/results/2026/11-14/action-v2/result.md) passed
actual Swift/CryptoKit-to-Node interoperability and21 HTTP/PostgreSQL cases.
[Native qualification](docs/results/2026/11-14/macos-v1/result.md) passed12
Swift cases, real app/embedded-widget compilation, actual Keychain and the new
macos device's native-wire HTTP receipt. A [narrow signing repair](docs/results/2026/11-14/macos-signing-v1/result.md)
then proved actual correctly entitled App Group snapshot access; its original
literal-variable failure is retained. The [final native bundle](docs/results/2026/11-14/macos-final/result.md)
also passed actual build/signature/storage checks after the read-error recovery
fix. [Container B01–B03](docs/results/2026/11-14/container-network-initial/result.md)
passed actual locked/non-root image, internal-network HTTP and production
Compose loopback checks. Its final cache-metadata collector failed; the original
CI remains failed and a separate stream-verified proof records those outcomes.

No existing hub, database or agent was changed. Normal native-window/mounted-
widget, Developer-ID/notarization/Gatekeeper, Kotlin compilation, physical
watches/push and production hub/TLS/runtime acceptance remain unverified.
The ad-hoc debug Mac archive is an inspection build. Legacy schema/API stay
historical; source/build/fixture proof is not physical-device proof.

## License

[MIT](LICENSE)
