# Install Watch Agents

## Hub

Copy `.env.example` to `.env`, generate unique `HUB_BOOTSTRAP_SECRET` and
`HUB_CONNECTOR_TOKEN` values, configure a public TLS URL, then run:

```sh
docker compose up -d postgres
docker compose build api
docker compose run --rm --no-deps api npm --workspace @watch-agents/control-plane run migrate
docker compose up -d api
```

Put Caddy, Traefik, or your existing TLS proxy in front of port 8787. Never
expose PostgreSQL. For push delivery, provide an APNs `.p8` key via
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

Register each runtime with `npm run hubctl -- agent add hermes my-hermes` or
`npm run hubctl -- agent add openclaw my-openclaw`. Configure its connector with
the public URL and connector token. Create one-time device codes with
`npm run hubctl -- pair create`.

## Apple Watch

Install Xcode and XcodeGen (`brew install xcodegen`), then run `xcodegen` in
`apps/watchos`. Set the signing team and a unique bundle identifier, enable Push
Notifications, install on a paired Apple Watch, and enter the hub URL and code.

## Wear OS

Open `apps/wearos` in Android Studio, set `HUB_URL` in the pairing screen,
place your Firebase `google-services.json` in `apps/wearos/app/`, provide the
Firebase service-account JSON to the hub, and deploy to a Wear OS 3+ device or
emulator.
