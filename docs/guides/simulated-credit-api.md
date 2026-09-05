# D7-B: one bound simulated Orchid credit

D7-B implements the action half of Accepted [D-033](../architecture/d7-simulated-credit-verification.md).
It can record one **simulated $15,000 credit** for `tenant_orchid` /
`case_d6_workbench` / `synthetic://accounts/orchid`. The Workbench remains the D6
review experience. D7-C independent verification and D7-D action/check controls
are not implemented. A recorded credit does not verify the customer's impact
claim, establish recovered revenue, resolve the Case or permit closure.

## Explicit enrollment and preparation

After building/starting the existing local appliance:

```sh
pnpm fr init ecc --demo
pnpm fr up
pnpm fr d7 enroll --demo
```

Enrollment is a fixed local Compose command with no identity, policy, payload or
target overrides. It preserves D6's named-Finance policy and strict seat map, adds
two service identities and three narrowly scoped grants, and advances catalog S
once. The normal bootstrap does not enroll these permissions. Repeating enrollment
returns `already_enrolled` without durable changes. Partial, contradictory,
revoked, altered or removed prior enrollment fails closed; restart never resets it.

Use the [existing Case/review API](d6-authority-review.md) to explicitly prepare
the synthetic Case: `detected → qualifying → enriching → needs_review`. An unchanged
D6 demo moves C=1 to C=4. Create a **fresh** $15,000 request at that C and enrolled
S, then record Finance and Executive decisions. R moves 0→1→2; approvals do not
advance C. Prior requests become stale when C or S changes. Do not silently move
an already-changed Case or transfer approvals from a replacement.

For a reproducible fresh-operation demonstration, the checked-in script performs
those commands, reads back the authoritative packet, and submits the bound action:

```sh
node scripts/smoke-simulated-credit-api.mjs applied
# Restart both processes; preserve the database volume.
docker compose restart postgres
docker compose up --detach --wait postgres
docker compose restart core
docker compose up --detach --wait
node scripts/smoke-simulated-credit-api.mjs durable
```

The script deliberately requires an unused Orchid operation; it does not clear
history or rebase a changed Case. Its `durable` mode reconstructs the action/source
and retries the original command exactly. CI runs it after the existing D6 smokes
and separately runs the fresh/upgrade PostgreSQL tests.

## Read and submit

`GET /v1/tenants/tenant_orchid/cases/case_d6_workbench/simulated-credit` returns the
strict `simulated-credit-read-response.v1`: compiled profile and action binding,
immutable attempts, source row if any, and current **informational** eligibility
for the latest request. The current section is null before a request exists.
`current.bindings` supplies the exact C/R/S, request and action assertions for
explicit submission. Reads use one repeatable read-only snapshot and create no
records, IDs, clock updates or writer-lock acquisition.

Submit to `POST /v1/tenants/tenant_orchid/cases/case_d6_workbench/simulated-credit-attempts`:

```js
const command = {
  ...view.current.bindings, // validated server read of the exact reviewed request
  idempotency_key: "orchid-credit-001",
  correlation_id: "orchid-d7",
};
// Preserve these exact bytes/key before sending. Never refresh/rebase a retry.
```

The strict command contains `schema_version: "simulated-credit-command.v1"`,
`type: "simulated-credit.execute"`, tenant/Case/request IDs,
`expected_case_version`, `expected_review_revision`,
`expected_authority_state_revision`, `request_binding_hash`,
`expected_action_binding_hash`, key and correlation ID. Unknown fields, including
payload, target, identity, privileges, evaluation time, success or verification
flags, are rejected. Synthetic services and all authority inputs are server selected.

Under the existing writer transaction, the server revalidates canonical history,
recomputes authority using validated D6 v1→v0 adaptation, folds terminal decisions,
checks exact bindings/current policy, two distinct human reviewers and scoped
evaluator/executor grants, samples
UTC at issuance, and checks the stable credit slot. A read or historical receipt
never grants permission. The retained `authorization-envelope.v1` contains the
profile, only the bound Orchid Case head, request/material/review history, catalog, evaluated
result, service evidence, time and implementation versions. Replay reconstructs
these inputs from canonical history and never calls the adapter. The retained runtime
clock floor is a scalar control snapshot checked against canonical timestamps; no
unrelated Case identifiers or head hashes are exposed.

Historical replay also rejects a bound Case prefix if an omitted canonical Case
entry was recorded strictly before the claimed action issuance. This includes
changed evidence and D-014 version increments. Actions issued before later Case
changes remain reconstructable, including exact retries. Equal timestamps alone
cannot establish ordering across the separate Case/action journals: they retain
no shared per-entry writer sequence. Live writes remain serialized by the existing
lock; replay does not infer that a same-timestamp Case append preceded an action.

| Result              | Meaning                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 200 `applied`       | Atomic simulated action and any source row committed. Receipt remains unverified.                                                     |
| 200 `duplicate`     | Original historical disposition returned without IDs, reevaluation or writes.                                                         |
| 409 `denied`        | Attributable denial retained in action history; no effect, C/R/S change or Case event. Review reasons before an explicit new command. |
| 409 `conflict`      | Unknown request or same key with changed bytes; no append.                                                                            |
| 400                 | Malformed/unsupported command; no append.                                                                                             |
| 500 / lost response | Unconfirmed outcome. Preserve original command/key; exact retry resolves the committed receipt or evaluates once after rollback.      |

The transaction commits source/action evidence, clock guard and writer revision
together. Rejection, changed evidence/catalog or expiry before issuance denies the
action. If the action commits first, later permitted human intervention remains
available; the historical credit is not undone. A replacement starts unapproved.
A new key or replacement cannot create another credit for the same business slot.

`verification: "not_implemented"` and `closure_permission: false` are explicit.
The adapter acknowledgment is only a claim. Even a success report without a source
row is retained as unverified; it cannot justify another invocation without the
independent absence check reserved for D7-C. No verifier submission endpoint exists
in D7-B. Legacy execution and incomplete-proof closure guards remain intact.

## Migration, integrity and validation

Migration `0003_simulated_credit` adds only `simulated_action_journal` and
`simulated_credit_source`, with append-only triggers, same-tenant Case/review/catalog
references, indexed JSON agreement, a journal hash chain and the unique
`(tenant_id, case_id, slot)` business key. Source/action evidence has deferred
transactional pairing checks. 0001/0002 checksums, Case history, D6 schemas and the
frozen ECC corpus are unchanged. Migration does not grant permissions.

The API readiness check requires the new tables and successful semantic replay.
A privileged partial rewrite with recalculated hashes still fails when inconsistent
with canonical review. As in D6, there is no external signature/checkpoint proving
an entirely rewritten, internally coherent database's original history. Replay
uses retained synthetic inputs; no general identity-status-history system is added.

Run `pnpm validate`, both ECC modes, and real PostgreSQL/API coverage:

```sh
D6_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime node --test scripts/authority-postgres.test.mjs
D7_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime node --test scripts/simulated-credit-postgres.test.mjs
```

These suites do not silently skip missing PostgreSQL. CI additionally runs Compose,
source/action restart/retry smokes and all eight existing Workbench browser scenarios.
No production authentication, connectors, external writes, generic worker runtime
or economics are introduced.
