# Actual package/network cases accepted; collector failure retained

[Run43605608554](https://github.com/alvarovillalbaa/smart-watch-agents/actions/runs/43605608554)
at dfa13ff6753f65a1a7dbb6b88381ee27342a2f11 remains FAILED. Its B01, B02 and
B03 actual checks all passed: locked non-root runtime, real internal-network
HTTP client and separately the unmodified production Compose host-loopback
health/refusal/enrollment/empty authenticated read. Both contexts used new owned
disposable PostgreSQL databases; internal resources were removed and absence
verified before the ordinary-network context. PG never published a host port.
Host readiness recorded one initial connection reset, then200/ok. No real
agent/provider/model/account or existing database action occurred.

The final metadata collector asked Docker's image store for node:24-alpine.
BuildKit had used it without retaining a named image there, so that inspection
failed; its stdout did return the actual PG digest. The complete build log
already recorded the exact resolved Node base and exported final image ID.
Preserve the failed original. tests/scripts/audit-container.py validates the
original provider-matching ZIP, every stream, all source vectors/Git blobs,
only expected exits and actual B01–B03 observations, then produces separate
derived-proof-v2.json from those existing bytes. No new Docker or HTTP execution
is needed. This accepts the proven package boundary without relabelling CI green.

Original66167B ZIP SHA256
8670c0ab134c967691980557c3d89581ca3e19701ecb53c11409493c0ccde03d.
Node base116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5;
PG basef377d590e5474681d4d7838635031a2b50647923b7abfa803ce9b5ff35d5c663.
Actual174061200B image5442dfa0206fbc947f965389349fbff2b297c43df7b7956699ab63f20df588df
was inspected and its task-owned tag removed. Both final containers, volume and
network removed with empty after lists. Captured final image inspection confirms
absence. Parent owned scratch removed. No unrelated Docker resource was pruned.

The image is source-build/self-hosted delivery, not a published registry image,
production TLS/hub deployment, real agent execution or physical device proof.
Default major-version base tags can change; the observed digests identify this
actual qualification. The original earlier internal-host-port failure also stays
retained. Temporary release control retires after this evidence audit.
