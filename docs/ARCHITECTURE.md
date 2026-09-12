# Architecture

```text
Hermes/OpenClaw runtime
  -> Agent Connector (HTTPS events; command polling)
    -> Control Plane + PostgreSQL
      -> APNs / FCM
      -> watchOS SwiftUI and Wear OS Compose clients
```

The connector is intentionally provider-neutral. A Hermes or OpenClaw wrapper
calls `emit()` for each lifecycle transition and supplies handlers for the only
two v1 commands: `approve_hitl` and `dispatch_follow_up`. This avoids relying
on undocumented runtime APIs and keeps local runtimes behind outbound traffic.

Actions are bound to a run or HITL identifier, a device-generated nonce, and a
P-256 signature. The service verifies the enrolled public key, queues the
command, and records an audit entry before the connector can execute it.

The shared Apple package contains models, client, identity, and SwiftUI pieces
that can be reused unchanged by future iOS and macOS apps. The equivalent
Android networking and signing code lives beside the Wear OS UI. The API and
event schemas are the cross-platform source of truth.
