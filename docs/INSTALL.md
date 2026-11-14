# Install Watch Agents

## Hub

Use Node24 for direct scripts, or Docker Compose for the complete hub. Copy
`.env.example` to `.env`, generate distinct random32+character
`HUB_BOOTSTRAP_SECRET` and `HUB_CONNECTOR_TOKEN`, and a unique hex-only
`HUB_DB_PASSWORD` (for example, `openssl rand -hex 32`). Configure your public
TLS URL, then run:

```sh
docker compose up -d postgres
docker compose build api
docker compose run --rm --no-deps api npm --workspace @watch-agents/control-plane run migrate
docker compose up -d api
```

The API binds127.0.0.1:8787 on the Docker host. Put your existing TLS proxy on
that host in front of it; a containerized proxy needs its own explicit shared
network. PostgreSQL has no published port. The image installs the committed npm
lock with lifecycle scripts off and runs as the node user. It does not
automatically migrate an existing database. For push delivery, provide an APNs `.p8` key via
`APNS_PRIVATE_KEY` (with escaped newlines) and a Firebase service-account JSON
string in `FCM_SERVICE_ACCOUNT_JSON`.

The migration command explicitly changes only the database selected by
DATABASE_URL. Back up an existing installation before applying it. Server
startup verifies immutable migration hashes and refuses an old schema; it does
not silently apply an upgrade. Existing approval/follow-up rows without a source
event sequence become non-actionable. Upgrade Apple/Wear clients with the
server: new writes require [action protocol2](../contracts/action-v2.md), and
there is no silent downgrade. Use separate bootstrap/connector secrets of at
least32characters and synchronize host/device clocks. No production migration
or real-device upgrade is implied by this source change.

Migration3 adds Chrome/macOS device kinds with the same raw P-256 signature
format as WatchOS. See [desktop contract1](../contracts/desktop-clients-v1.md)
and the [Chrome developer setup](references/chrome-setup.md). Packaged Chrome and
native qualification have their own receipts; see the README for precise scope.

Register each runtime with `npm run hubctl -- agent add hermes my-hermes` or
`npm run hubctl -- agent add openclaw my-openclaw`. Configure its connector with
the public URL and connector token. Create one-time device codes with
`npm run hubctl -- pair create`.

## Chrome and macOS

Use the [Chrome setup](references/chrome-setup.md) for the unpacked new-tab
extension. The public webpage is only an authored preview; it cannot pair or
control a hub. The [Mac setup](references/macos-setup.md) covers the menu-bar
companion, matching App Group, widget installation and existing signing team.
The ad-hoc debug CI archive is an inspection build, not a notarized installer.

## Apple Watch

Install Xcode and XcodeGen (`brew install xcodegen`), then run `xcodegen` in
`apps/watchos`. Set the signing team and a unique bundle identifier, enable Push
Notifications, install on a paired Apple Watch, and enter the hub URL and code.

## Wear OS

Open `apps/wearos` in Android Studio, set `HUB_URL` in the pairing screen,
place your Firebase `google-services.json` in `apps/wearos/app/`, provide the
Firebase service-account JSON to the hub, and deploy to a Wear OS 3+ device or
emulator.
