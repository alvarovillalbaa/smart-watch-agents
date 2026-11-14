# Desktop/new-tab hub and its protocol prerequisite

Last updated: 2026-11-14

Owner source: actual parent Notion311a1ee8bd06805caa21c5306dd315ac, unverified
14November snapshot, last edit3November. The explicit brief asks for WatchOS,
widget-first macOS and Chrome new-tab views of personal Hermes/OpenClaw agents.
Current public31KiB repository already has watchOS/Wear OS apps, native shared
Apple code, a PostgreSQL control plane and connector. macOS widgets and Chrome
new-tab clients are missing. Extend this owner; no duplicate app repository.

First dependency is the actual action contract. Source currently verifies a
device signature but never records nonces and commits action/queue/audit in
separate database calls. Signed v1 does not bind request bytes or time. These
source findings do not claim exploitation of any live service. Bootstrap auth
also compares two possibly undefined values; require configured secrets before
serving. Pairing currently consumes its code before validating platform/key.

1. Add explicit versioned migration/protocol2 and transactional action receipt,
   stale source binding, validated atomic enrollment. Preserve old schema/API
   as historical contracts; no live database is touched.
2. Update existing Apple/Wear request signing together and qualify meaningful
   actual PostgreSQL/HTTP concurrency/rollback/retry/refusal fixtures. Native
   signing/compilation remains a separate boundary. Keep failures and streams.
3. Add the missing widget-first macOS and Chrome new-tab clients using the
   qualified contract. Use app-owned pairing/device storage, visible loading/
   empty/error/stale states, explicit approvals and safe source rendering.
4. Publish installable artifacts/docs, run focused browser/native checks in
   bounded remote environments, retire temporary controls and verify source.

No hosted customer hub, private runtime, provider token, Apple/Google account,
paid push service or live agent action is implicit. The software milestone is
not production deployment, store/signing or actual device notification proof.
Native/web source/build and fixture acceptance stay separate. No change to
closed other-product checks or their pending access/capacity gates.
