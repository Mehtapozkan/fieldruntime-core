# Local Evaluation Operations

## Validate the repository

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate
docker compose config --quiet
```

## Start the appliance

Docker with Compose is required. Run the commands from the cloned
`fieldruntime-core` repository root:

```bash
pnpm fr init ecc --demo
pnpm fr up
docker compose ps
```

Initialization creates only `.fieldruntime/project.json` and is idempotent. It
refuses to replace contradictory or unsafe configuration. `fr up` verifies the
repository surface, selects its explicit `compose.yaml`, forces simulation mode
and external writes off, builds the API image, applies the checksum-bound migration,
loads the immutable ECC fixture, and waits for readiness.

When startup succeeds, the CLI prints the workbench URL. Open
`http://127.0.0.1:3210/` to begin directly in the Acme case. There is no signup,
API key, blank dashboard, or setup step before the four-stage walkthrough.

Both published ports are loopback-only:

- API: `http://127.0.0.1:3210`
- PostgreSQL: `127.0.0.1:5432`

The configured database user and password are for an isolated evaluation machine
only. Do not reuse them in a shared or production environment.

## Inspect the appliance

```bash
curl http://127.0.0.1:3210/healthz
curl http://127.0.0.1:3210/readyz
curl http://127.0.0.1:3210/v0/evaluation-fixtures/ecc/case_acme_sso_001
curl http://127.0.0.1:3210/v0/evaluation-walkthroughs/ecc/walkthrough_acme_sso_001
```

`/healthz` reports process liveness only. `/readyz` additionally verifies the
exact migration and fixture hashes, the singleton writer lock, and complete
PostgreSQL replay/projection integrity. The fixture response is labeled
`authoritative: false` and `replayable: false`; authoritative cases enter through
the tenant-scoped command endpoint defined by the OpenAPI contract.

The walkthrough response and browser controls are presentation-only. They are
schema-bound to the immutable fixture, but they do not create approvals, execute
actions, mutate authoritative cases, emit production receipts, or make an
external request. The workbench remains visibly labeled `Synthetic`,
`Guided simulation`, and `External writes off` throughout.

Useful diagnostics:

```bash
docker compose ps
docker compose logs core postgres
```

Internal errors are sanitized at the HTTP boundary. Use the local container logs
for diagnosis; do not expect database details in API responses.

## Stop or reset

Stop the service without deleting its volume:

```bash
docker compose down
```

To delete all local evaluation case data and start from a fresh database, remove
the named volume explicitly:

```bash
docker compose down --volumes
```

Volume deletion is irreversible unless the volume was backed up. It does not touch
enterprise systems because the appliance has no connectors or external
credentials.

No command in this document connects to an enterprise system or performs an
external business-system write. Docker may pull the declared public base images
when they are not already present locally.
