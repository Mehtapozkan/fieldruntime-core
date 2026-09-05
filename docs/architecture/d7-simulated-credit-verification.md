# D-033 — One controlled simulated credit and independent read-back

Status: **Accepted** by explicit human approval of the reviewed design at
[527cfb6f44dac61e495f45559d170d0bbb50e8f2](https://github.com/Mehtapozkan/fieldruntime-core/blob/527cfb6f44dac61e495f45559d170d0bbb50e8f2/docs/architecture/d7-simulated-credit-verification.md).
D7-A was documentation only. D7-B merged in PR #23 at `6766d9d99569fbff0e95e8b8b91748c1c0646b7a`.
D7-C independent verification is implemented on the subsequent review branch;
D7-D Workbench controls remain unimplemented.

Base: main `ba340cc5135343e12820992cf4a7542cf7cc9c29` includes the normal merge of
[D6-D PR #21](https://github.com/Mehtapozkan/fieldruntime-core/pull/21), reviewed at
`1561329858d8340291dda505fdfe12291cece1c9`. PR #22 is updated from that main with
all D6-D code, tests and documentation retained. PR #22 passed the required checks,
including Workbench coverage, and merged at `f6dcddc03da8ee7c86cce76979aca751b2b0266d`.
The subsequent D7-B implementation follows this accepted boundary; see the
[operation API guide](../guides/simulated-credit-api.md).

The human operator accepted D6-D's supplied desktop/390px presentation at that head
on 2026-09-05. The two nonblocking Workbench follow-ups in STATUS/PLAN do not change
this boundary. D-033's separate approval is recorded below.

## Human approval

Approval source: the user's explicit instruction in this task on 2026-09-05,
recorded verbatim:

> I approve D-033 as specified in PR #22 at commit 527cfb6f44dac61e495f45559d170d0bbb50e8f2.
>
> This approves only the documented simulated Orchid credit boundary: server-recomputed authority, atomic source/action evidence, one-credit-per-Case duplicate prevention, concurrency ordering and a separate read-back verifier. Existing closure denial and legacy execution guards remain intact.

The same instruction requires protected merges of PR #21 and then updated PR #22
before implementing D7-B only, leaving its implementation PR open. D7-C supplies
independent verification; D7-D supplies Workbench controls. Neither is implemented
by D7-B. No release or deployment is authorized. This architectural acceptance
does not bypass repository protections. The operator subsequently changed the
solo-maintainer policy to zero required approving reviews while retaining required
PRs, passing `validate`, up-to-date branches, and force-push/deletion protections.

The enrollment and verification-clock details below clarify the existing scoped
grant, explicit install and atomic clock requirements in response to PR review;
they do not expand the accepted operation or relax its gates.

## Accepted decision

Use a single, versioned **simulated customer-credit operation** in the existing
loopback appliance. Its gateway may write a bounded synthetic source record only
after recomputing current authorization under the existing PostgreSQL writer lock.
Commit that source effect and its immutable action evidence together. A separately
identified verifier reads the committed source through a read-only path and records
what it observed; adapter success never proves the effect.

This is the narrow execution-proof boundary deferred by D-017, not permission to
promote arbitrary legacy `executed` records. D-013's closure denial remains.
The approval covers the ordering and one-credit-per-Case rule below, the two
supporting tables, and existing D6 consent for an exactly matching consequence **only after
the D7 catalog enrollment and fresh review**. D7 does not infer authority from old
receipts or add undisclosed financial terms.

## One operation, one operator story

**Approvals complete → Record simulated credit → Check simulated source →
Verified simulated credit, or an explained problem.**

Only `tenant_orchid`, `case_d6_workbench`,
`synthetic://accounts/orchid`, `scope_customer_ops`, `customer_credit`,
`financial_remedy`, and USD 1,500,000 minor units are enrolled in this first
profile. Other amounts, Cases, targets and operations fail closed. A modified
request still starts unapproved; an approved $12,000 replacement remains
unsupported by this initial $15,000 operation.

The existing D6 demo starts at C=1/`detected`. Explicit, idempotent D7 preparation
uses existing Case commands `detected → qualifying → enriching → needs_review`
(C=4 for that unchanged demo), before creating the fresh request. It does not
silently move a user's changed Case or activate the frozen ECC graph. A Case in
any other state needs explicit review/preparation; the effect gate requires
`needs_review` at the exact bound C. Action/verification supporting records do
not change the Case state, C, R or S. D7's progress is an operation view, not a
claim that the full Case lifecycle advanced.

Enroll two service identities and scoped registry records through the existing
controlled catalog install: `identity_d7_credit_executor` and
`identity_d7_credit_verifier`, with respective classes
`simulated_credit_executor` and `simulated_credit_verifier`. Use existing identity
and authority-record v0 shapes; add neither keys to D6's strict `actors` map nor
a public catalog editor. Scope both to this Case, customer-operations scope and
credit/consequence classes. Require active, unambiguous, rank-one records and
current canonical identities. Service identity or assignment alone is insufficient.

Also enroll `authority_d7_credit_evaluator` for the existing canonical service
`identity_d6_evaluator`, class `simulated_credit_evaluator`, with the same narrow
Case/action/consequence/organization scope, active rank-one requirement and
profile-bound source reference. The default D6 catalog has no evaluator authority
record. Its actor mapping alone must not satisfy D7's evaluator-grant check; the
D6 resolver's existing evaluator attribution semantics remain unchanged. Include
all three grants in the compiled profile and retained execution/verification inputs.

The compiled profile `orchid-simulated-credit.v1` defines the exact target, payload,
state allowlist, service identities, one-credit rule and verification predicate.
Its canonical bytes/hash are retained in action evidence. The service records'
`source_ref` names the exact versioned, hash-addressed profile; installation
validates this against compiled bytes. Any profile/identity/grant change updates
the catalog through its existing S+1 path. Missing or changed profile references
deny execution; startup never silently rewrites an existing catalog.

### Explicit enrollment on fresh and upgraded appliances

D7-B adds one fixed local command, `fr d7 enroll --demo`, using the existing safe
repository/Compose configuration and an internal compiled enrollment operation.
Run it explicitly after the schema migration and ordinary D6 catalog bootstrap,
on both fresh and existing preview databases. It accepts no catalog JSON, identity,
grant, policy, target or profile override; expose no catalog-edit HTTP endpoint.
The migration creates only the two tables below and does not enroll permissions.
`initializeCatalog` continues to preserve existing bytes on restart.

Reuse the existing catalog replacement transaction: under the singleton writer
lock, validate the complete current catalog/history, retain its non-D7 records
unchanged, add the two identities and three compiled grants, and commit one
hash-bound S+1 snapshot and clock/writer update atomically. No Case or review entry
changes. A reserved ID collision, partial or altered enrollment, inactive canonical
evaluator, or evidence of an earlier enrollment whose grants were subsequently
removed/revoked fails closed; this command must not reset policy or undo revocation.

If the exact enrolled records/profile are already present, return
`already_enrolled` without IDs, snapshot, S or clock/writer changes. Concurrent
enrollments serialize to one update and one no-op. A lost response/restart retry
checks canonical catalog history and the exact compiled records before returning
that no-op; it is not execution permission. Persistence failure rolls back the
entire enrollment. In the default example, bootstrap S=1 becomes S=2 once; older
requests become stale and fresh review must follow enrollment and Case preparation.

Enrollment advances S, conservatively invalidating pre-D7 requests. The operator
explicitly creates a fresh request at current C/S and collects Finance then
Executive approvals through unchanged D6 APIs. Default named-Finance policy
remains unchanged. Retained evidence, conflicts and the unconfirmed impact claim
remain visible. Ordinary page/packet/action reads initialize nothing.

## Exact effect and authorization envelope

The payload is exactly the retained D6 consequence, validated by a new strict
operation-specific payload schema. No memo, refund, bank transfer, tax, payment
method or other business field may be inferred:

```json
{
  "consequence_class": "financial_remedy",
  "account_ref": "synthetic://accounts/orchid",
  "amount_minor": 1500000,
  "currency": "USD"
}
```

The target is a record in the local simulated credit source, never a fetched URI:

```json
{
  "source": "simulated_credit_source.v1",
  "tenant_id": "tenant_orchid",
  "case_id": "case_d6_workbench",
  "account_ref": "synthetic://accounts/orchid",
  "operation": "customer_credit",
  "slot": "service_remedy"
}
```

The business uniqueness key is `(tenant_id, case_id, slot)`. It deliberately
excludes amount, request ID, attempt ID and idempotency key. A replacement request,
new key or another approval set cannot issue a second credit for this Case.
Precondition: this exact slot is absent. No balance arithmetic, adjustment,
reversal or compensation operation is included.

Recompute `H(payload)` and require equality with the request's consequence hash;
also compare the complete validated payload to retained material. The action
binding is `H({profile_hash, target, payload, precondition: "slot_absent"})`.
A server-recomputed `authorization-envelope.v1` retains at least:

| Binding         | Required bytes or references                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Case            | Tenant/Case ID, C, exact Case journal head, state, workflow identity/version, customer and organization scopes                                                       |
| Consent         | Full Authority Request v1/hash, R and review head hash, retained material/hash, consequence/payload hash, effective decision IDs and their complete supporting paths |
| Policy/catalog  | Policy ID `policy_d6_financial_remedy`, version `1.0.0`, recomputed content hash and selected `rule_d6_large`; S and catalog snapshot hash                           |
| Effect          | Strict target/payload, action binding, stable business slot, absence precondition, canonical command/key and attempt ID                                              |
| Principals/time | Server-selected executor, evaluator and their scoped authority evidence; evaluated/effect instant, UTC metadata, request expiry and supporting validity limits       |
| Reproduction    | Full trusted lifecycle/resolver inputs and result, profile bytes/hash, canonicalization, gateway, resolver, adapter and comparison implementation versions           |

`H(envelope)` is integrity evidence, not a bearer token. The server reconstructs
these inputs from canonical Case/review/catalog records, validates v1 inputs and
uses the repaired resolver's explicit v0 projection. It folds terminal decisions
before counting approvals. No client packet, hash, role, identity record, policy,
source content, historical `authorized` Boolean or caller-selected evaluation time
is an authority input. D6's read-response `action_permission: false` stays unchanged.

A read-only action view derives the exact proposal and expected bindings. The
proposed command is schematic (H values denote full recomputed hashes):

```json
{
  "schema_version": "simulated-credit-command.v1",
  "type": "simulated-credit.execute",
  "tenant_id": "tenant_orchid",
  "case_id": "case_d6_workbench",
  "authority_request_id": "request_d7_credit_001",
  "expected_case_version": 4,
  "expected_review_revision": 2,
  "expected_authority_state_revision": 2,
  "request_binding_hash": "H_request",
  "expected_action_binding_hash": "H_action",
  "idempotency_key": "orchid-credit-001",
  "correlation_id": "orchid-d7"
}
```

These are assertions compared with recomputed state, never grants. Unknown fields
(including supplied payload, target override, executor or authorization result)
fail strict validation. If even one binding differs, refresh and explicit new
submission are required; the server and browser never rebase an effect command.

## Smallest persistence and API additions

Reuse the existing worker, injected SQL pool/time/IDs, canonical JSON/SHA-256,
Case replay, Authority Request/Decision v1, scoped identity/authority contracts,
catalog snapshots and writer transaction. The existing Case `ActionProposal` and
`ActionReceipt` vocabulary can be reused as explicitly validated nested
descriptions/receipts; `request_hash` continues to mean the payload hash.
New evidence carries `authorization_envelope_hash` separately.

Legacy Case arrays and v0 journal entries cannot represent D6 R/S, source
observations or an execution envelope. Do not change their meaning or pretend
legacy receipts are sufficient. Add strict versioned command, action-journal,
envelope, verification-evidence and read-response contracts. Preserve every v0
schema/fixture and D6 v1 response; no schema/migration edits in D7-A.

One later checksum-bound migration adds only:

- `simulated_action_journal`: append-only JSONB entries with tenant/Case/slot,
  contiguous operation sequence, previous hash, attempt/verification IDs,
  command/key/fingerprint, attribution, exact bindings and immutable evidence.
  Full action evaluation inputs/profile and verification observations live in
  their entries; reference existing authority snapshots instead of another generic
  snapshot table. Sequence is supporting action history, not C or R.
- `simulated_credit_source`: the append-only resulting synthetic source state,
  unique business slot, canonical row/hash, credited amount/currency/account,
  originating attempt and recorded effect time. A source row must refer to its
  committed action entry. An action receipt need not have a source row: a silent
  adapter failure must be representable and detectable independently.

Use same-tenant foreign keys to Case/request/review heads, unique IDs and
command keys, JSONB/index agreement, hash-chain and semantic replay checks, and
UPDATE/DELETE/TRUNCATE denial. Use disjoint action/verification ID prefixes, as
D6 does for review IDs, without repurposing the Case-only emitted-ID registry.
Keep migration 0001/0002 checksums and Case history.
Do not overload `authority_snapshots`' closed kind/version vocabulary with action
records. Reads/restart replay verify historical bindings but never rerun effects.

Proposed bounded routes under the existing tenant/Case API: POST
`.../cases/{case_id}/simulated-credit-attempts`, POST
`.../cases/{case_id}/simulated-credit-attempts/{attempt_id}/verifications`,
and GET `.../cases/{case_id}/simulated-credit`. The first selects the executor,
the second the verifier; callers cannot choose identities or report success.
GET derives history and current informational eligibility from one read-only
repeatable snapshot, with no writer lock, IDs, clock update or durable changes.

## One transaction is the effect boundary

No queue, durable lease, background dispatcher, generic worker framework, outbox
or external network call is necessary for one source inside the same database.

For a new, well-formed execute command:

1. Begin the existing writer transaction; acquire the singleton lock, then hydrate
   and verify canonical Case/review/catalog/action history. Check an existing
   command key first. An exact duplicate returns its original historical
   disposition without reevaluation, IDs, clock updates or an effect.
2. Compare expected C/R/S, request/review heads, complete request/material/policy
   hashes, customer/scope/state, profile and action binding. Require open request,
   both current Finance/Executive approvals, no authority conflict, exact supporting
   paths and active evaluator/executor grants. Check the stable source slot absent.
   If a prior committed adapter invocation has no source row, require a retained
   independent absence observation for that latest invocation before invoking again.
   A denial before adapter invocation needs no source verification. Neither a
   timeout nor the adapter's own no-effect claim satisfies this retry prerequisite.
3. Sample injected UTC time **after waiting for the lock and immediately before
   effect issuance**. Reject time earlier than the prior sample/guard; never use a
   backdated evaluation. Recheck half-open validity windows and the durable clock floor
   (catalog guard, Case history and committed action/verification times). Evaluate
   authority at this final instant, not at page-read or transaction-start time.
4. Invoke only the transaction-scoped simulated source adapter with the exact
   validated target/payload and business slot. It can insert at most that slot and
   cannot launch deferred writes. Retain its acknowledgment as an unverified claim.
5. In the same transaction append the action attempt, envelope, trusted evaluation,
   result/versions, idempotent disposition, source insertion if any and clock-guard
   update. Validate persisted journal/binding integrity before commit. Advance the
   writer revision and existing clock guard, but not C, R or S. Extend the current
   guard-integrity calculation to include these committed entries; do not advance
   the catalog guard while replay still assumes only review/catalog writes exist.

Valid attributable denials/no-effect outcomes append a bounded action-attempt
receipt with an explicit reason and no source write, under their own action-key
namespace. They do not use D-014 or alter the Case. Same-key retry returns the same
denial; an explicit fresh command is needed after changed circumstances. Malformed
input, unsupported scope, integrity failure or regressing time append nothing.
Persistence exceptions roll back all writes; rollback failure evicts the connection.

A successful commit is the externally visible ordering point. The effect time is
the final authorization/issuance instant retained in the envelope, while the writer
lock prevents intervening Case/review/catalog mutations until commit. Expiry after
that instant does not retroactively undo an effect already issued; lock waits or
expiry at/before issuance deny it. This is deliberately not a promise that wall-clock
expiry can cancel an in-progress database commit.

No durable `executing` reservation is needed: a crash before commit leaves neither
effect nor committed attempt. A commit whose response is lost is **unknown to the
caller**, not failed. Preserve original bytes/key; retry resolves the committed
receipt first, or executes once if the transaction rolled back and authority is
still current. Database unavailability leaves the UI uncertain. Never use a new
key or claim success merely because a timeout elapsed.

Same committed key + different command conflicts. Different keys racing for the
same business slot cannot create a second effect. An existing slot blocks further
writes even after rejection, modification, expiry or a fresh request; its original
attempt/verification remain available. A mismatch is not repaired by issuing a
second credit. If the independent path proves the slot absent after a completed
attempt, an explicit fresh attempt may retry only with current C/R/S/authority and
the same unique slot. There is no automatic financial retry or compensation.

## Concurrent change examples

Assume a fresh D7 request Q at C=4/R=2/S=2, open, complete approvals, slot absent.
Each row is independent. Eligibility means permission at the effect boundary,
not a previously displayed status.

| Competing events                                       | Ordered result                                                                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execute with Q; then verify                            | Action evidence/source commit together; C=4/R=2/S=2. Separate verifier reads the slot and records a match. No Case closure.                                                             |
| Eligible reviewer rejects before execute wins the lock | R=3/rejected; execute denies. No credit.                                                                                                                                                |
| Execute wins, then eligible reviewer rejects           | One historical effect; rejection may still become R=3 and prevents future authority. No automatic reversal or suppression of rejection. Verification may inspect the historical effect. |
| Modify wins first                                      | Q superseded, replacement R=0; execute on Q denies. No approval transfer.                                                                                                               |
| Modify follows effect                                  | Q superseded and replacement unapproved; the existing credit slot blocks another effect even if the replacement later receives approvals.                                               |
| New evidence (or D-014 rejection) wins first           | C=5, Q stale: zero effect. A new request needs fresh approvals.                                                                                                                         |
| Catalog update wins first                              | S=3: Q cannot authorize, including unrelated changes. Restoring old bytes at S=4 cannot revive Q.                                                                                       |
| Case/catalog change follows effect                     | Historical effect remains; current authority becomes stale. Verification reports source facts separately from current review status.                                                    |
| Request or supporting grant expires while waiting      | Final issuance-time check denies; C/R/S equality is insufficient.                                                                                                                       |
| Two execute keys race, or retry after restart          | At most one source slot. Same key returns the original disposition; a new key cannot duplicate a committed credit.                                                                      |
| Final validation/SQL/commit fails before commit        | Entire transaction rolls back. If commit outcome is uncertain, retry the original command; no fabricated accepted result.                                                               |

## Independent verification and failure behavior

The verifier is `identity_d7_credit_verifier`, distinct from the recorded executor
and from any identity supplied by a caller. Check its current canonical status,
scope, unambiguous explicit grant and time. Do not let an executor self-select a
different label or reuse the adapter's database handle/response as an observation.
Independence here is a logical, tested identity/capability boundary inside one
synthetic appliance, not isolation from a privileged application/database owner.

An explicit verify command names a committed attempt, expected action-entry hash
and its own idempotency key. First resolve exact committed verification duplicates.
Otherwise open a **separate read-only connection/transaction**, query the simulated
source by canonical tenant/account/Case/slot, and retain the complete observed row
or authoritative absence, source row hash/version, query/reader version, observation
time and verifier identity. Do not manufacture a row by joining/copying the receipt.
Compare to the retained expected target, exact USD amount/currency and originating
attempt; require one committed row, correct scope and observation after effect.

Then persist the comparison in a short writer transaction: recheck current verifier
eligibility and source observation/operation head consistency. A changed source
between observation and recording is inconclusive and requires a new explicit
check. Retain the observation, comparison, expected action-entry/envelope hashes,
current verifier inputs/time/versions and result atomically with its journal entry
and idempotent disposition. No credit write is available to this path.
Inside that writer lock, recheck the verification idempotency key before consuming
time or IDs. For a new entry, sample final injected UTC time and require it to be
at least the observation time and durable Case/catalog/action/verification clock
floor. Recheck verifier eligibility at that instant, then atomically record the
entry, advance the writer revision and update the durable clock guard to that
recorded time. C/R/S do not advance. Guard-integrity replay includes committed
verification times; a regressing clock or failed persistence exposes neither a
new entry nor a guard update. Exact duplicates leave the guard unchanged.
A retry after lost verification response returns the same evidence; a fresh key
performs a new read. If persistence fails, no verified receipt is claimed: preserve
that verification key and resolve it against durable history before another read.
Verification is an explicit evidence-recording command;
opening/refreshing its GET view never records a new observation.

| Observation                                                                                          | Result and operator instruction                                                                                                                                |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact committed row matches                                                                          | `verified_simulated_effect`: “The simulated $15,000 credit was independently checked.”                                                                         |
| Adapter says success but slot absent, wrong amount/account/currency, wrong attempt or duplicate rows | `mismatch` with expected/observed differences; no verified claim. Inspect the discrepancy. Do not issue another credit for an occupied slot.                   |
| Read fails/times out, is malformed or source changes before evidence commit                          | `inconclusive` with reason; record only what was actually observed, never infer absence from an error. Explicit check retry; no action retry from this result. |
| Action commit outcome cannot yet be determined                                                       | `uncertain`; resolve the original action key against PostgreSQL before claiming an effect or attempting a new write.                                           |
| Executor is also verifier, or verifier revoked/expired/out of scope                                  | Reject verification; retain no successful proof.                                                                                                               |

An old request need not remain currently executable to inspect a historical effect.
After rejection/catalog change, the verifier uses its **current** read eligibility
while reporting the retained execution-time authority separately. Identity snapshots
record what was trusted then; do not invent retroactive status history.

Verifying that a synthetic credit row exists **does not verify the customer's
original interruption/impact claim**. Preserve that unknown and its evidence.
Neither result establishes customer acceptance, recovered revenue, commitment
completion, accepted outcome, full closure proof or a resolved Case.

## Implementation sequence and acceptance

D-033 is accepted and PRs #21 and #22 are merged, with all D6-D coverage retained.
D7-B is merged in PR #23; D7-C is implemented for review and D7-D remains next.
The accepted implementation sequence and acceptance requirements are:

1. **D7-B — bound operation and atomic simulated source.** Add the strict new
   contracts/pure envelope checks, the two-table checksum migration, scoped synthetic
   enrollment, action POST/GET and transaction-scoped adapter. No verifier success
   or UI action is available yet. Prove fresh install and upgrade preserve both
   Case/review histories; exact happy path, stale C/R/S, changed binding/payload/
   target/profile, expiry at lock release, revoked identity/grant, wrong scope,
   missing quorum and unresolved conflict; all deny before effect. Test both
   orderings against rejection/modification/evidence/catalog changes.
   Prove explicit enrollment on fresh and upgraded databases, no enrollment on
   startup/read/migration, S+1 exactly once across concurrency/restart, rollback,
   and denial of collisions, altered records or revocation reversal. Verify that
   the required evaluator grant is enrolled and bound; missing, revoked, expired
   or incorrectly scoped evaluator grants deny execution.
2. **D7-C — independent source read and retained proof.** Add the verifier POST,
   immutable observations/comparison and deterministic reconstruction. Prove
   different service identities, executor self-verification denial, separate
   read-only connection, acknowledgment ignored, absent/mismatched/wrong-scope
   rows, unavailable reads, observation races and explicit check retries. Keep
   closure blocked for both successful and incomplete verification.
   Prove verification after a later clock instant advances the guard atomically,
   duplicates do not, regressing recording times fail, and restart/rollback retain
   consistent guard and proof history. These are D7-C tests, not D7-B completion.
3. **D7-D — existing Workbench action/check controls.** Add only the proposed
   operator story, current-vs-historical labels and explicit retry/problem guidance.
   Browser state never grants permission. Exercise Finance → Executive → simulated
   action → independent check → reload on the real PostgreSQL/API path. Show that
   the original impact claim remains unverified and the Case unresolved.

In B/C require failure injection at every persistence boundary, crashes before and
after commit, same-key/different-bytes denial, two-key duplicate-effect prevention,
fresh requests after a prior credit, no partial source/receipt commit, failed rollback
eviction, and restart recovery. Replay must reject missing/tampered snapshots,
gaps, cross-tenant links and coherently rehashed false authorization/verification.
Replay compares retained source observations; it never calls the source writer or
substitutes today's catalog/time. A privileged rewrite of all unsigned data remains
outside the existing integrity guarantee.

Run repository validation, frozen ECC/negative control, real PostgreSQL/API,
Compose and appliance smokes on each implementation head. In D, require browser
coverage for explicit initialization, read-only refresh, exact uncertain retries,
stale consent and understandable mismatch/unavailable states. Reads leave durable
tables, IDs, C/R/S, action sequence and clock guard unchanged.

## Compatibility and non-goals

D-003/D-020/D-021 remain one canonical PostgreSQL store and serialized writer;
D-014 Case versions are unchanged. D-032 review lifecycle, exact C/R/S, read-only
previews and consent reconstruction remain intact. New action entries are
Case-bound supporting evidence, not a second mutable Case or review session.

D-017 currently denies every claimed executed Case action until a recomputed
envelope exists. D-033 accepts its smallest scoped implementation: an independently
validated simulated operation with a retained envelope. Keep legacy `case.v0`
executed-action denial and D-013 closure denial; any future promotion into Case
arrays needs its own explicit contract/proof change. Do not remove those guards
merely to make a demo pass. Frozen ECC activation/parity blockers (D-009/D-010)
remain; this pilot does not run that workflow graph.

The exact D-033 approval is the new gateway/service capability, atomic simulated
source/evidence boundary, issuance ordering and separate verifier described above.
No production authentication, external writes, connector/provider, new database,
generic worker infrastructure, live source verification, D8 outcome/economics,
release or deployment is approved or implemented by this decision record.
