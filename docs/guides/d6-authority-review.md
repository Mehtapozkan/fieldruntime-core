# Synthetic D6 authority review API

D6-C implements [Accepted D-032](../architecture/d6-authority-request-lifecycle.md)
inside the local evaluation appliance. PostgreSQL retains request history and
consent material; the packet is a read-only derived response. This API uses
runtime-enrolled synthetic seats, not production authentication. Run only on the
existing loopback appliance. Every response denies action permission. D6-D connects
the [Guided Workbench](../../apps/admin/README.md) to this API; the legacy action
simulation remains separate at `/?view=legacy`.

## Reproduce the complete path

After the documented `pnpm install --frozen-lockfile`, `pnpm fr init ecc --demo`
and `pnpm fr up`, run this once in an evaluation database that has not run this
D6 demo. It creates its own Case through `/v0/.../case-commands`, without importing
or modifying the frozen ECC fixture:

```sh
node scripts/smoke-authority-api.mjs applied
docker compose restart postgres
docker compose up --detach --wait postgres
docker compose restart core
docker compose up --detach --wait
node scripts/smoke-authority-api.mjs durable
```

The first phase creates `case_d6_compose_demo`, creates a $15K request, records
Finance at R=1 and Executive at R=2, and checks current authorization. Both phases
assert C=1/R=2/S=1 and one Case journal entry. The second reconstructs the same
material, decisions and evaluation snapshots after restart, then retries the
original commands and compares their historical receipts. The local comparison
file `.fieldruntime/d6-review-demo.json` is test evidence, never an authority input.
Do not delete an existing database to rerun the demo; use a separate disposable
evaluation instance. The integration suite below isolates its own test schemas.

## Commands and reads

The new [OpenAPI contract](../../packages/contracts/openapi/authority-review.v1.yaml)
and strict `authority-*.v1` JSON Schemas describe the boundary. Existing v0 readers,
Case arrays, fixtures and Case-version semantics are unchanged.

First read the current catalog revision:

```sh
curl -s http://127.0.0.1:3210/v1/tenants/tenant_orchid/authority-catalog
```

For an existing runtime-created synthetic Case at C=1/S=1, create a request:

```json
{
  "type": "authority.request.create",
  "tenant_id": "tenant_orchid",
  "case_id": "case_d6_demo",
  "expected_case_version": 1,
  "expected_authority_state_revision": 1,
  "proposal_key": "credit_15000",
  "idempotency_key": "request:demo",
  "correlation_id": "d6-demo"
}
```

POST this to `/v1/tenants/tenant_orchid/authority-requests`. The server selects the
operator, consequence template, policy, canonical identities/authority/delegations,
evaluator and evidence. Available proposals are `credit_4000`, `credit_7000`,
`credit_12000` and `credit_15000` (USD amounts). The synthetic policy routes $4K to
Business, $7K to named Finance, and the larger amounts to named Finance plus
Executive. Default Finance is an explicit named principal; a delegate is eligible
only if the runtime-controlled catalog explicitly routes the requirement to it.

Use the returned `receipt.authority_request_id` to GET
`/v1/tenants/tenant_orchid/authority-requests/{id}/packet`. GET without `/packet`
returns the same versioned response. These operations use one repeatable-read,
read-only database snapshot and one runtime evaluation time. They acquire no
writer lock and create no IDs, records, previews, clock updates or revision changes.

Finance submits the following to
`/v1/tenants/tenant_orchid/authority-requests/{id}/decisions/finance`, substituting
the **exact** ID and full request hash from that read:

```json
{
  "type": "authority.request.decide",
  "tenant_id": "tenant_orchid",
  "case_id": "case_d6_demo",
  "authority_request_id": "request_RETURNED_ID",
  "expected_case_version": 1,
  "expected_review_revision": 0,
  "expected_authority_state_revision": 1,
  "request_binding_hash": "sha256:RETURNED_64_HEX_DIGITS",
  "decision": "approve",
  "idempotency_key": "finance:demo",
  "correlation_id": "d6-demo"
}
```

Refresh, then Executive submits to `/decisions/executive` with expected R=1 and a
new key. C and S remain 1. Synthetic seat names (`business`, `finance`, `executive`,
`finance_delegate`) select server-owned identity records; callers cannot supply
identity records, privileges, policy, authority, evidence, decision IDs, evaluation
time or authorization results. Unknown properties fail strict validation before
projection. The adapter validates the complete v1 request/decision and explicitly
projects only unchanged v0 fields into the repaired resolver.

`reject`, `modify` and `escalate` require `reason`. `modify` also requires a
different `replacement_proposal_key`; the runtime reserves a new request ID and
commits the old terminal decision and replacement R=0 together. No approvals
transfer. Rejection vetoes the entire request even after both approvals; escalation
terminates without granting authority. An explicitly eligible reviewer may veto,
modify or escalate while another requirement is unresolved. `approve` still
requires an unambiguous authority path and no unresolved authority conflict.

Responses use HTTP 200 for `applied` and exact `duplicate`, 409 for concurrency,
lifecycle, eligibility or idempotency conflicts, and 400 for invalid input. Internal
storage/integrity failures are sanitized as 500; readiness fails closed. A race
loser must refresh and explicitly resubmit under a new key; the server never
rebases stale submissions. Same committed key and identical command/seat returns
its original receipt before freshness checks, without new IDs or clock updates.

## Eligibility and reconstruction

- C is the exact Case journal version, including D-014 transition rejections.
- R starts at zero and advances only for accepted human decisions.
- S changes only when the runtime-controlled catalog changes. Case/review writes
  do not change S; restoring old catalog bytes advances S again. There is no public
  catalog editing API and startup never resets an existing catalog.

Any C or S mismatch makes old approvals ineffective. Expiry, canonical identity,
policy, scope and one complete supporting authority/delegation path are checked at
submission; catalog equality never replaces time checks. Requests expire one hour
after creation in this synthetic profile. The durable clock guard advances only
on committed review/catalog writes, with Case history also providing a write-time
floor; regressing runtime time cannot restore eligibility.

`history` and `historical_evaluations` reconstruct immutable consent material,
exact prior R, trusted input/time/result and pinned implementation versions.
`current` is a separate informational result as of `evaluated_at`.
`current.eligible` describes the whole request's approval route; reviewer eligibility
for a veto is independently checked at submission. A historical `authorized`
receipt, successful packet read or complete approval set is never an executable
action token (`action_permission` is always false). Preserving consent content does
not prove that a person inspected a screen.

Evidence content is compiled synthetic data selected by canonical Case WorkEvent
reference **and content hash**. Unknown references, missing content and mismatched
hashes fail closed. Source events, provenance, hashes, times, freshness basis,
conflicts, unknowns and recommendation are retained at request creation. There is
no identity-status timeline: snapshots record what the runtime trusted then;
historical delegation-approver attribution retains PR #18's explicit semantics.

## Migration and persistence checks

Startup applies checksum-bound `0002_authority_request_review` after unchanged
`0001_local_appliance`. It adds `authority_request_journal`, `authority_snapshots`
and `authority_catalog`, leaving existing Case tables and migration checksums
intact. No v0 approvals are promoted. The original migration checksum is still
verified on every startup; divergent applied bytes fail readiness/bootstrap.

Request/catalog writes use the existing singleton transaction lock. SQL enforces
unique revisions/IDs/idempotency, same-tenant references, predecessor links and
deferred atomic replacement links; append-only triggers deny UPDATE/DELETE/TRUNCATE.
The store rehydrates and replays persisted content before commit. Snapshot hashes,
canonical JSONB/index agreement, catalog chains, terminal folds and deterministic
results are checked again during reads and restart. Rollback exposes no partial
write; failed rollback evicts the connection. Hashes are unsigned and externally
unanchored. Whole-history replay favors auditability over throughput; this is not
a production-scale storage design. Future semantic changes must preserve dispatch
to retained implementation versions or fail closed, not reinterpret old evidence.

Run the explicit real-PostgreSQL suite after building and starting local Compose:

```sh
D6_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test scripts/authority-postgres.test.mjs
```

It fails rather than skips if PostgreSQL is missing. CI runs it against pinned
PostgreSQL 17, including fresh/preview-upgrade paths, actual HTTP requests, C/R/S
races, terminal states, time windows, payload injection, restart/idempotency,
read-only snapshot behavior, tampering, append-only/deferred constraints and
persistence/rollback failures. The appliance smoke also restarts the actual
PostgreSQL and API containers. No closure proof, Action Gateway, external writes
is enabled by this implementation. D6-D adds browser/API coverage through
`pnpm test:workbench`, using this same persistence boundary without new migrations.
