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
- Device action signatures use an enrolled P-256 key and fresh nonce. The hub
  writes an immutable audit record before queueing an agent command.
