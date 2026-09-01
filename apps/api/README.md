# API

Loopback-only HTTP boundary for the synthetic local evaluation appliance. The API
provides process health, fail-closed readiness, tenant-scoped case commands and
reads, immutable journal reads, and the explicitly non-authoritative ECC demo
fixture. PR5 also serves the same-origin guided workbench and its schema-bound
walkthrough record from the same loopback port.

The process imports the transactional worker in-process; it is one modular
deployable, not a network of services. Startup requires simulation mode, external
writes disabled, and an authenticated PostgreSQL URL targeting loopback or the
Compose `postgres` service. Binding to `0.0.0.0` is accepted only for that internal
Compose path; Compose publishes the service on `127.0.0.1:3210`.

Static workbench routes are an exact allowlist with a no-inline, same-origin CSP.
The browser performs only same-origin evaluation GETs; it cannot issue case
commands, grant authority, create receipts, or perform external writes.

The contract is
[`local-appliance.v0.yaml`](../../packages/contracts/openapi/local-appliance.v0.yaml).
Unexpected storage and integrity failures are returned as sanitized `500` or
fail readiness with `503`; command-input failures are sanitized `400` responses.
