# Device action protocol2

Last updated: 2026-11-14

Legacy openapi.yaml and commandMessage v1 remain historical. New server writes
require x-watch-protocol:2, a paired bearer token, x-watch-timestamp (decimal
Unix seconds), x-watch-nonce (lowercase UUIDv4), x-watch-signature (canonical
base64) and an empty JSON object body. Sign the exact received UTF-8 body hash,
not a parsed/re-serialized approximation. No action query string is accepted.

The UTF-8 signing message joins these six lines with LF and no final LF:

```text
watch-agents.action.v2
POST
/v1/hitl/<percent-encoded-id>/approve
<timestamp>
<nonce>
<lowercase SHA256 of exact request bytes>
```

The dispatch path is /v1/runs/<percent-encoded-id>/follow-up/dispatch. P-256,
SHA256, watchOS IEEE-P1363/raw64 signature; Wear OS ASN.1 DER. Validate curve and
format. New intents require time within300seconds. An already committed exact
signed nonce/message returns its original command even after that time window;
it never queues another action. Same device/nonce with another message conflicts.

Within one SQL transaction, claim the nonce, lock/check the target and source
run sequence/status, insert audit, enqueue one allowlisted command, change the
target and commit its receipt. Any error rolls back all five. A deferred FK
prevents a nonce receipt from committing without its command. Different new
nonces cannot approve/dispatch the same consumed target twice.

HITL/follow-up rows bind the event sequence that created them. Existing rows
without that binding are not actionable. Any newer source event makes an old
target stale; read views hide stale approval/ready controls. Legacy clients
must upgrade to sign protocol2. This is an intentional write compatibility
boundary; never silently downgrade to v1. Host clocks must be synchronized.

Migration runner applies immutable schema1 and migration2 explicitly, using a
transaction/advisory lock and stored file hashes. Server startup only verifies
the required migration; it does not migrate an existing database. Enrollment
validates supported platform/key/shape before atomically consuming a code and
inserting its device/audit record. Invalid enrollment leaves the code usable.
