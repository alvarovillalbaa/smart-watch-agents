# Watch Agents

An open-source, self-hosted control hub for Hermes and OpenClaw agent runs.
It includes independent watchOS and Wear OS apps, a secure control-plane API,
and a small event connector that agent runtimes use to report runs and receive
bound HITL approvals or follow-up prompts.

## What ships

- `services/control-plane`: PostgreSQL-backed API, pairing, audit log, metrics,
  deterministic follow-up drafts, and agent command queue.
- `packages/agent-connector`: JavaScript SDK for Hermes/OpenClaw lifecycle
  events and command polling.
- `packages/apple-core`: reusable Swift models, client, secure signing, and UI
  pieces for watchOS, iOS, and macOS.
- `apps/watchos`: native SwiftUI watch app source and XcodeGen project spec.
- `apps/wearos`: native Kotlin/Compose Wear OS app.

## Quick start

1. Copy `.env.example` to `.env`, set a real bootstrap and connector secret,
   and set `HUB_PUBLIC_URL` to a TLS URL reachable by the watches.
2. Run `docker compose up --build`.
3. Register an agent with `npm run hubctl -- agent add hermes Hermes`.
4. Start `npm run demo` to ingest a sample Hermes run and HITL request.
5. Create a watch pairing code with `npm run hubctl -- pair create`.

For simulator-only local development, use `http://localhost:8787`; real watches
require a publicly reachable HTTPS endpoint. See [docs/INSTALL.md](docs/INSTALL.md).

## Security model

The hub is single-owner in v1. A watch enrolls a P-256 public key using a
short-lived pairing code. Every HITL approval and follow-up dispatch carries a
fresh signed nonce and is audited. Notification content defaults to redacted;
the owner may opt into summaries per device.

## License

[MIT](LICENSE)
