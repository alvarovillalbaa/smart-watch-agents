# Security

Watch Agents intentionally does not accept arbitrary remote agent commands.
The only actions are approval of an existing, unexpired HITL request and
dispatch of the server-stored follow-up draft for an existing run.

- Keep `HUB_BOOTSTRAP_SECRET`, connector tokens, APNs keys, and Firebase
  service accounts outside Git.
- Terminate TLS at a maintained reverse proxy and expose only the hub API.
- Connector payloads must contain summaries and safe artifact URLs, never
  credentials, raw tool input, or unredacted private data.
- Rotate connector tokens if an agent host is compromised. Pairing codes expire
  after ten minutes and can be used once.
- New writes require [protocol2](../contracts/action-v2.md): enrolled P-256,
  exact request-body hash, method/path, timestamp and recorded nonce. Admission,
  source-sequence checks, audit, command and target transition commit in one
  SQL transaction. Identical committed intent retries return the original
  command. New intents older than300seconds, stale/expired/consumed subjects,
  invalid signatures and another message using the same nonce are refused.
- Configure distinct bootstrap/connector secrets before serving. Enrollment
  validates the platform/key before atomically consuming its one-time code.
  Server start verifies explicit immutable migration versions/hashes.

This source is being qualified with disposable authored data. It is not a live
service security assessment, production migration or independent audit. The
single-owner hub still needs operator TLS/network controls, backup/retention,
rate limiting, device lifecycle/revocation and actual notification/device
acceptance; protocol work does not establish those boundaries.
