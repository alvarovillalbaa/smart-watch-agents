# Package-network observation correction2

Initial43605123086 built the actual locked Node24/pg image as UID1000 and
explicitly migrated disposable PG successfully. The API logged listening, but
the host could not read its port while a fixture-only internal Docker network
was applied. B01 passed; B02 did not. Keep the exact initial result negative.

Retain the internal-network requirement and check its real HTTP client from a
separate one-off container on that network. Then remove and verify absence of
that entire owned context. Reuse the same built image, create a fresh disposable
context with the unmodified production Compose network, and separately check
actual host-loopback port publication. PG remains unpublished in both contexts.
This does not disable the network check or broaden existing-data authority.

The second context runs only health/refused anonymous admin/one-time enrollment/
empty authenticated read; no agent event/command/model/provider call. Record
readiness errors, both configurations/logs and owned teardown. A fresh image
build is necessary because the initial owned image was correctly removed; its
already accepted B01 dependency is retained but not counted as a new case.
No unchanged21-case action, six installed-Chrome or twelve-native replay.
