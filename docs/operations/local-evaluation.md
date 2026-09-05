# Local Evaluation Operations

## Validate the repository

```bash
# Requires Node.js 24 and pnpm 11.24.0; see README for installation.
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
`http://127.0.0.1:3210/` for persistent Orchid review, then explicitly choose
**Start or reopen $15,000 review**. Opening the page creates nothing. See the
[Workbench walkthrough](../../apps/admin/README.md). The historical Acme fixture
story is separate at `/?view=legacy`; the published prerelease opens that older
story by default. Neither path needs signup or API keys.

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

The legacy walkthrough response and its browser controls are presentation-only. They are
schema-bound to the immutable fixture, but they do not create approvals, execute
actions, mutate authoritative cases, emit production receipts, or make an
external request. The persistent Orchid controls instead submit canonical review
commands through the [authority API](../guides/d6-authority-review.md), with visibly
synthetic seats. Both experiences keep external writes disabled.

The [simulated-credit API guide](../guides/simulated-credit-api.md) covers explicit
D7 enrollment, fresh review, bound action and this D7-C branch's independent
verification. Those action/check operations are not connected to Workbench controls.
For existing volumes, consult its migration and backup limits before upgrading;
startup preserves history and does not enroll new authority automatically.

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
