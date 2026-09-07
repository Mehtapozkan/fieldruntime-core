# D7-B/C: simulated Orchid credit and independent verification

D7-B/C implement the action and independent read-back portions of Accepted [D-033](../architecture/d7-simulated-credit-verification.md).
It can record one **simulated $15,000 credit** for `tenant_orchid` /
`case_d6_workbench` / `synthetic://accounts/orchid`. The merged Workbench connects
review, [action/check controls](../../apps/admin/README.md) and the D8-A evidence receipt. A recorded or
independently verified simulated credit does not verify the customer's impact
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
those commands, reads back the authoritative packet, submits the bound action,
and records an independent verification:

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
and independent proof, then retries both original commands exactly. CI runs it after the existing D6 smokes
and separately runs the fresh/upgrade PostgreSQL tests.

## Read and submit

`GET /v1/tenants/tenant_orchid/cases/case_d6_workbench/simulated-credit` returns the
strict `simulated-credit-read-response.v2`: compiled profile and action binding,
immutable `attempts` and `verifications`, source row if any, and current **informational** eligibility
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
never grants permission. The retained `authorization-envelope.v2` contains the
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

## Explicit independent verification

An action receipt is `verification: "unverified"`. The adapter acknowledgment is
only a claim. POST to
`/v1/tenants/tenant_orchid/cases/case_d6_workbench/simulated-credit-attempts/{attempt_id}/verifications`.
This executable example requires a committed invocation from the preceding steps:

```sh
node --input-type=module <<'JS'
const base = 'http://127.0.0.1:3210';
const path = '/v1/tenants/tenant_orchid/cases/case_d6_workbench/simulated-credit';
const viewResponse = await fetch(base + path);
if (!viewResponse.ok) throw new Error('Read failed; no trusted operation view');
const view = await viewResponse.json();
const attempt = view.attempts.filter(e => e.outcome === 'simulated_action_recorded').at(-1);
if (!attempt) throw new Error('A committed invocation is required');
const command = {
  schema_version: 'simulated-credit-verification-command.v1',
  type: 'simulated-credit.verify',
  tenant_id: 'tenant_orchid', case_id: 'case_d6_workbench',
  attempt_id: attempt.id, expected_action_entry_hash: attempt.event_hash,
  idempotency_key: 'orchid-explicit-check-001', correlation_id: 'orchid-d7'
};
console.log('Preserve this command for exact retry:', JSON.stringify(command));
const response = await fetch(base + path + '-attempts/' + attempt.id + '/verifications', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command)
});
console.log(response.status, await response.json());
JS
```

The command is strict: no actor, identity records, policy, source data, evaluation
time or success claim. The runtime selects `identity_d7_credit_verifier`, checks its
current canonical status and unambiguous profile-bound scoped grant, and rejects
executor self-verification. It may inspect an older effect after human rejection,
Case changes or catalog changes; that does not restore current execution permission.

A dedicated pool opens a separate read-only repeatable transaction. It checks read
eligibility and queries the actual source by tenant/Case/slot; it deliberately does
not filter away an incorrectly attributed account. The observation retains the full
source tuple, indexed attribution, row hash, reader/query versions, catalog and
operation frontier, identity and UTC time. No receipt join or adapter acknowledgment
supplies the observed row. A failed read retains an unavailable observation, with
no rows/hash; its timestamp is the start of the failed read attempt. Non-JSON data
is recorded as malformed, never converted to authoritative absence.

Under the writer lock the runtime checks the key again, rechecks current verifier
eligibility/time, rereads source for consistency, then atomically appends proof and
advances the existing clock/writer guard. Verification advances neither C, R nor S.
Catalog changes between observation and recording conservatively make the result
inconclusive, even if the current verifier remains eligible. A read can overlap an
uncommitted catalog write with an earlier issuance timestamp; replay does not invent
commit ordering from those timestamps. An older catalog/read-position claim can
never produce positive proof across that change. A fresh explicit check is required.
Its `action_entry_hash` and `envelope_hash` bind the exact original action; the
verification entry hash binds its complete observation, authority and comparison.

| Retained comparison         | Meaning and next step                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verified_simulated_effect` | Exactly one matching account/Case/slot/amount/currency/origin exists and agrees with retained action history. The simulated credit effect was checked.                                               |
| `mismatch`                  | An authoritative read found absence or different values/attribution. Inspect the discrepancy. An occupied slot always blocks another credit.                                                         |
| `inconclusive`              | Read unavailable/malformed, source, operation head or catalog changed, or positive observation contradicts immutable source history. An explicit fresh verification key is needed for another check. |

HTTP 200 `applied` means the comparison was committed, including mismatches and
inconclusive results. It does not itself mean verification succeeded. `duplicate`
returns the original historical proof with no new read, clock sample, ID or write.
409 denies ineligible verification or an unknown/uninvoked/altered attempt binding,
or conflicts on changed command bytes. 400 rejects malformed input. A 500 or lost
response is unconfirmed: retry the **same bytes/key**. Do not infer source absence.

Only `absence_proven: true` from the latest verification of the latest committed
invocation can enable an **explicit fresh execution command**, still subject to all
current C/R/S, policy, identity, scope and expiry checks. That fact must agree with
both independent and writer-side reads and retained source history. A subsequent
inconclusive check supersedes earlier absence; an old invocation's absence cannot
permit repetition of a newer one. The new envelope binds the retained proof hash.
No automatic financial retries or compensation are implemented.

A source-corruption diagnostic can append negative/inconclusive evidence using a
narrow history-only hydration path: it still validates all canonical Case, review,
catalog, action and verification history, but observes physical source separately.
Ordinary GET, execution, startup and readiness continue to fail on physical
source/action drift. This can make a corrupted appliance unready even though the
verification POST retained its discrepancy; the POST receipt/exact retry and database
history retain the evidence. This path cannot grant execution or manufacture absence
when immutable history says the slot was occupied.

Historical proof never establishes customer impact, acceptance, recovered revenue,
commitment completion or a resolved Case. `closure_permission: false`, legacy
execution guards and incomplete-proof closure denial remain intact.

## Migration, integrity and validation

Migration `0003_simulated_credit` adds only `simulated_action_journal` and
`simulated_credit_source`, with append-only triggers, same-tenant Case/review/catalog
references, indexed JSON agreement, a journal hash chain and the unique
`(tenant_id, case_id, slot)` business key. Source/action evidence has deferred
transactional pairing checks. New checksum-bound `0004_credit_verification` extends
that journal's allowed versions/ID prefixes and adds a generated action-hash foreign
key; it creates no table and rewrites no Case, review or action evidence. v1 contracts
and v1 action replay semantics remain strict; migrated execution writes v2 envelopes
and entries with the explicit absence-proof binding. Historical v1 actions remain
verifiable. All 0001/0002/0003 checksums and frozen ECC fixtures are unchanged.
Neither migration grants permissions. Back up the local preview volume before an
upgrade; rollback to a binary that only knows 0003 is not supported after new entries.

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
source/action/verification PostgreSQL and API restart/retry smokes and all eight existing Workbench browser scenarios.
No production authentication, connectors, external writes, generic worker runtime
or economics are introduced.
