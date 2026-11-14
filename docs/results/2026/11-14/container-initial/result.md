# Initial actual container qualification — incomplete

[Run43605123086](https://github.com/alvarovillalbaa/smart-watch-agents/actions/runs/43605123086)
at d92671cc6b36bff30d4558269107641d8982fe7b failed. Actual image built from the
committed Dockerfile/lock; B01 passed UID1000, Node24.22.3 and locked pg8.22.0.
Explicit disposable PostgreSQL16 migration succeeded and API logged listening.
The host health observer failed while the fixture-only internal Docker network
was active. B02 remains false; it did not reach pairing/read checks. No claim
of production host-port acceptance is made from this result.

All owned two containers, one volume, one network and task image were removed;
after lists are empty. Parent owned4955410B source scratch removed; source
unchanged, subprocess leaders reaped/groups absent. Original49078B ZIP SHA256
7bc4a9daa330786eb7a02ebd2048192f1935553174b0bc38803c804e2ba30d53
matches the provider. Original streams/receipts/vectors are retained, not edited.

The exact correction is release-checks-v2.md: retain real internal-network HTTP
proof and separately check the unmodified production Compose host-port context.
No network guard, domain assertion or sandbox is disabled to obtain a pass.
