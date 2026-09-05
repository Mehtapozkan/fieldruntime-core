# D-032 — Authority Request review history and exact-version lifecycle

Status: **Proposed**. Documentation only; requires explicit human approval before
contract, runtime, or migration implementation. Inspected main: `29fd0a7`, including
merged PR #18. D6-C remains unimplemented.

## Decision requested

Approve an immutable Authority Request with its own append-only review history in
canonical PostgreSQL. A recorded decision advances **request review revision R**,
never **Case version C**. A Decision Packet is a derived read model. Approvals
become effective only after folding the entire request history and checking current
eligibility; a stored `authorized` result is historical evidence, not permission.

For synthetic D6, bind each request to one runtime-controlled authority-catalog
revision **S**. Any catalog change requires a new request and fresh approvals.
This deliberately conservative choice avoids selective approval carry-forward,
per-record dependency tracking, and identity status history. An unrelated catalog
change can require unnecessary review; that is a deliberate tradeoff of this
proposal. S is distinct from `runtime_writer_lock.revision`: Case and
review writes must not change S. Restoring old catalog content advances S again.

## Existing behavior and compatibility

- [Request v0](../../packages/contracts/schemas/authority-request.v0.schema.json)
  binds request/tenant/Case identity, exact Case version, consequence hash and
  correlation; policy reference and evidence references are optional.
  [Decision v0](../../packages/contracts/schemas/authority-decision.v0.schema.json)
  requires the policy reference and supports `approve`, `reject`, `modify`, and
  `escalate`; only `modify` requires a replacement request ID. Neither defines a
  durable review revision or terminal-state fold.
- The [repaired resolver](../../packages/domain/src/authority-resolution.ts)
  counts valid approvals and ignores other decision dispositions. Calling it with
  an unfiltered historical approval list would miss a later rejection. D6-C needs
  a lifecycle gate before calling it, without weakening its exact-version checks.
- The [Case engine](../../packages/runtime/src/case-engine.ts),
  [PostgreSQL store](../../packages/runtime/src/postgres-store.ts), and
  [migration](../../packages/runtime/migrations/0001_local_appliance.sql) currently
  require Case journal sequence = Case version. D-014 includes attributed
  transition rejections. An approval cannot be inserted into that journal without
  advancing C and making its own request stale.
- Preserve D-014 and D-018/D-019 time semantics. Any Case-version change, including
  a rejected transition, stales the request even if business fields look identical.
  Do not introduce a second business version or ignore audit-only Case events.
- Extend D-015/D-020/D-021's atomic persistence, replay and singleton-writer pattern
  to the request stream; do not change the Case stream. D-027's Case-first model
  remains intact: request histories are tenant/Case-bound supporting records.
  D-004/D-029/D-031 still prohibit inferred authority or evidence laundering.
- `case.v0`'s legacy `approvals` and `decision_packets` arrays are not aliases for
  these records. Leave the frozen schema/corpus and existing Case responses intact;
  expose the new derived view through an explicit new API contract. D-009/D-010
  prohibit silently repurposing those arrays or activating the frozen ECC pack.
  D-013/D-017/D-023/D-025 remain: no closure/action permission or Workbench authority
  change is delivered here.

There is no required amendment to an accepted decision under this design. Putting
review entries in `case_journal` while keeping C unchanged would contradict D-014,
the Case journal contract and its SQL/replay invariants. Amending those is broader
than necessary; approve the separate request stream instead. D-032 is the explicit
new persistence/lifecycle boundary requiring human approval, including its catalog
invalidation rule and terminal decision meanings below.

## State and lifecycle rules

Creation records the immutable request at R=0; its creation-entry hash is the
review head. Each accepted decision appends exactly one entry at R+1. No command
edits a prior request or decision. Lifecycle is folded from creation and decisions:

| Decision on an open, eligible request | Meaning and next state                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approve`                             | Consent to the exact immutable binding. Remain `open`; count at most one approval per principal toward the policy's requirements. Both approvals can make the current derived result `authorized`, without closing the request or changing C.                             |
| `reject`                              | Veto the entire request, not just one requirement. State becomes terminal `rejected`; all its approvals cease to be effective, including an earlier complete set. Require a reason.                                                                                       |
| `modify`                              | Withdraw the old binding and atomically create a different request ID at R=0, with changed proposed work/material/policy and recomputed bindings. Old state becomes terminal `superseded`. Require reason and `replacement_authority_request_id`; no approval transfers.  |
| `escalate`                            | Close this attempt as terminal `escalated`, with a reason identifying the unresolved review need. Count no authority from it. Resumption requires a new request under an explicit policy route and fresh approvals; escalation cannot invent an approver or expand scope. |

These are business decisions, distinct from a rejected API command or D-014's
rejected Case transition. Active, runtime-enrolled synthetic human reviewers may
decide for a requirement for which current explicit policy/authority makes them
eligible; ownership, display roles, service or agent identities do not suffice.
This human-review runtime profile is narrower than v0's non-agent contract and
does not change that existing validator.
`approve` additionally requires an unambiguous valid authority path and no unresolved
authority conflict. An explicitly eligible reviewer may reject/modify/escalate
while another requirement is unresolved; ambiguity never grants reviewer identity.

No new decision is accepted after a terminal disposition. Stale, expired or
catalog-mismatched requests also accept no new decisions and contribute zero
effective approvals. They remain reconstructable; a new `create` may reference
them as a predecessor, without changing their history. A rejected/superseded/
escalated request cannot be reopened by such a link. Replacement lineage is acyclic,
same-tenant/same-Case, and is not an authority grant.

Eligibility is derived separately from lifecycle. Report terminal state first,
then binding/expiry/current-authority failures with explicit reason codes. A Case
version cannot decrease, S cannot be reused, and the immutable request expiry
cannot be extended. Only runtime time is permitted for current evaluation;
backdated `asOf` belongs exclusively to historical replay and can never revive a
request. Reject a regressing runtime clock rather than treating it as fresh time.
Compare current evaluation time with durable prior evaluation/recording times;
historical replay times never update that current-time guard.

## Minimal contract and API additions (proposed, not schema files)

Introduce explicit **Authority Request v1**, **Authority Decision v1**, and a
versioned request-journal/read-response envelope in a later implementation. Keep
v0 readers/fixtures unchanged; do not add undeclared fields to strict v0 payloads
or automatically enroll old v0 decisions as persistent approvals.

The future lifecycle adapter must enforce v1 bindings before projecting the
unchanged v0 fields into the repaired resolver. Preserve that exact projection in
the evaluation inputs. Do not send a v1 object to today's strict v0 validator or
treat a bare resolver result as the new lifecycle envelope.

| Contract            | Minimum binding or addition                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request v1          | Retain all v0 identity, exact C, consequence and lineage fields. Require `policy_reference`; add `policy_content_hash`, `case_journal_head_hash`, `review_material_hash`, `authority_state_revision`, `authority_snapshot_hash`, and `expires_at` with source timezone. Optional `predecessor_authority_request_id` records fresh-attempt lineage.                                   |
| Review material     | Immutable, hash-addressed canonical JSON containing the exact consequence body and the evidence actually presented: ordered/specified content, source IDs/versions, hashes, provenance, source times/timezones, freshness basis, conflicts and unknowns. Preserve any recommendation or explanation used for consent. No reference-only URL may stand in for missing review content. |
| Decision v1         | Preserve v0 exact bindings and replacement semantics; add `request_binding_hash`, `presented_review_revision` and `presented_view_hash`. The runtime constructs actor identity, decision time and lineage from the controlled synthetic submission context.                                                                                                                          |
| Journal envelope    | Request ID, R, event ID/type, predecessor hash, canonical command/fingerprint, idempotency key, actor/correlation/causation, recorded time/timezone, evaluation input/result hashes, evaluator implementation identifier, and event hash. Replacement creation and old `modify` entry cross-reference each other.                                                                    |
| Evaluation snapshot | Retain the full trusted resolver inputs: replayed Case at its head, request/consequence, responsibilities, policies, identities, authority records, delegations, prior decisions at the recorded R, evaluator identity and exact `asOf`/timezone. Retain the result and pinned evaluator/projection implementation versions needed to reproduce it.                                  |

Hashes use the existing canonical JSON/SHA-256 contract over complete versioned
content. `request_binding_hash` covers the whole v1 request; policy name/version
alone cannot hide changed content. Hashes are integrity bindings, not substitutes
for retained bytes or trust. Request material, policy and authority snapshots must
be durably available before a request/decision can reference them. Evaluation
snapshots are immutable evidence, not a separately editable Decision Basis or
review-session aggregate.

Propose three bounded operations through the existing worker/API surface:
`authority.request.create`, `authority.request.decide`, and a request/packet read.
Create checks expected C and S. Decide supplies expected C, expected R, expected S,
request binding hash, the presented view hash, disposition, reason/replacement
input, and a tenant-scoped idempotency key. Reads return immutable request/history
plus a derived packet containing C/R/S, eligibility, current requirements, source
bindings, and evaluated time. The Case projection itself is unchanged.

The presented view is reproducible structured review content, not a persisted
authoritative packet: material + request + prior decisions at R + displayed
requirements/eligibility + evaluation time + projection version. Retain its bytes
or all pinned deterministic inputs and verify its hash. At submit, verify the view
was issued from trusted runtime state; do not accept client-supplied policy,
identity, evidence or authorization results. Recheck at submission time even if
the view matched when issued. Changed revisions/content require refresh, not
silent client-side rebasing. A read result and a successful decision receipt are
never executable action tokens.

Issuing a review view retains its immutable evaluation/presentation snapshot under
the writer lock, without advancing C or R. A submission references that retained
view; reconstructing a plausible hash client-side does not establish issuance.
This is review evidence, not a mutable or independently authoritative packet.

### Concrete contract fragment

The following is schematic v1 data, **not valid v0 JSON**. `H_*` denotes the
recomputed `sha256:` hash of retained content; unchanged tenant, actor and lineage
fields are omitted here for brevity.

```json
{
  "schema_version": "authority-request.v1",
  "authority_request_id": "request_credit_001",
  "case_id": "case_falcon_credit_001",
  "case_version": 7,
  "proposed_consequence_hash": "H_credit_15000",
  "policy_reference": {
    "policy_id": "policy_financial_remedy",
    "policy_version": "1.0.0"
  },
  "policy_content_hash": "H_policy_v1",
  "case_journal_head_hash": "H_case_7",
  "review_material_hash": "H_material_1",
  "authority_state_revision": 12,
  "authority_snapshot_hash": "H_catalog_12",
  "expires_at": "2026-09-06T17:00:00.000Z",
  "expires_at_source_timezone": "UTC"
}
```

Finance submits `decide(request_credit_001, approve, expected C=7/R=0/S=12,
request_binding_hash=H_request_1, presented_view_hash=H_view_0, key=finance_1)`.
The runtime records Decision v1 with `case_version=7`, `presented_review_revision=0`
and `decided_at=2026-09-06T16:06:00.000Z`, appends review entry R=1, and returns
`applied, open, approval_required, outstanding=[executive_sponsor]`. Its historical
evaluation inputs include the exact submitted/recorded decision and prior R=0
history; Executive's later evaluation consumes the resulting R=1 history.

## Atomicity, current eligibility and replay

Use the existing PostgreSQL database and singleton writer lock for Case writes,
review writes **and catalog changes**. Add one append-only request journal whose
R=0 row owns the immutable request and later rows own decisions; derive the head
and lifecycle rather than introducing a mutable session/head aggregate. Add a
tenant-scoped immutable snapshot table and one runtime-owned current catalog
revision/hash record. No request projection table is required for this local
boundary. Physical tables/constraints require a later checksum-bound migration;
do not repurpose the pending-reconciliation SQL.

The catalog contains synthetic identity, policy, authority and delegation records.
Its durable revision is monotonic and increments only on a controlled catalog
update, under the same lock. Preserve snapshots used by reviews; no identity-status
timeline, backfill, provider, public catalog-edit API or production authentication
is proposed. A snapshot records what the runtime trusted then, not when an identity
was actually revoked. Preserve PR #18's historical delegation-approver semantics;
current evaluator, reviewer, delegator and delegate eligibility remains explicit.

For each new write, inside one transaction:

1. Validate boundary payload and tenant/synthetic actor context; hydrate and verify
   Case/request/catalog integrity. Find an exact committed idempotent result before
   freshness checks. Returning that historical receipt grants no current permission.
2. Compare expected C/R/S to the locked current heads. Require request C = current C
   and request S = current S. Verify Case head, policy content and review material
   bindings and submitted view. Require `requested_at <= now < expires_at`.
3. Fold terminal dispositions **before** collecting approvals. Evaluate current
   approved policy, identity, scope, authority ranks/conflicts, effective windows,
   expiry and revocation using runtime-owned records and injected UTC time. Recheck
   every counted approval at its recorded instant and now using one complete
   supporting path. Catalog equality alone does not replace time checks.
4. Atomically persist decision/creation, its evidence and evaluation snapshots,
   idempotent disposition, replacement pair if any, and reserved IDs. Verify the
   persisted result by rehydration before commit. C and the Case journal stay
   unchanged. A rollback exposes none of the append; a failed rollback discards
   the client as the current store does.

Enforce unique `(tenant, request, R)`, event/decision IDs, and `(tenant, authority
idempotency key)` across creation and review entries; this authority-command key
namespace does not change existing Case idempotency semantics. Enforce same-tenant
Case/request/snapshot/predecessor/replacement references, contiguous hash chains,
canonical JSONB/index agreement and append-only UPDATE/DELETE/TRUNCATE denial.
An accepted business rejection is an `applied` review command. Malformed input,
version conflicts, ineligible attempts and duplicate commands append nothing.

Same key + same canonical command returns its original entry/disposition after
restart, without new IDs or decisions. Same committed key + different content
conflicts. A fresh key reusing a decision ID conflicts; a fresh decision ID from an
already-counted principal cannot add another vote. A submission that lost a revision
race must refresh and explicitly resubmit under a new key; do not retry it against
a newer view automatically. Retry after an uncertain commit uses the original key
and bytes. The duplicate receipt may say historically authorized; only a separate
fresh eligibility result may describe current authority.

Replay folds request entries in R order, verifies bindings and re-runs the pinned
evaluator over retained inputs/time without consulting today's catalog or clock.
It must reject gaps, reordered entries, false but coherently rehashed transitions,
missing/tampered snapshots, identity/tenant drift and terminal revival. Case replay
remains unchanged. Historical packet reconstruction includes the exact prior R
seen by the reviewer; today's packet is a separate derived view. Hash chains remain
unsigned and externally unanchored, as in the existing appliance.

## Required scenarios

Each row starts independently from request Q bound to C=7/S=12, open at R=0,
requiring distinct Finance and Executive approvals. Unless stated otherwise, all
records are valid and time is before Q's fixed expiry. C=7 here is reconstructed
from runtime Case history, not imported from the non-replayable legacy fixture.

| Sequence                                                                                   | Case C    | Request review R    | Eligibility and expected result                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | --------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finance approves, then Executive refreshes and approves                                    | 7 → 7 → 7 | Q: 0 → 1 → 2        | S stays 12. Finance remains effective at R=1; Executive completes the two requirements at R=2. `authorized` only as of that evaluation; request stays open.                                                                                                                       |
| Finance approves; new evidence is attached; Executive submits                              | 7 → 8     | Q: 0 → 1 → 1        | Exact C mismatch: `stale_case`, zero effective approvals; reject submit. Create Q2 at C=8/R=0 with new material and collect both approvals afresh.                                                                                                                                |
| Finance approves; a Case transition is rejected under D-014                                | 7 → 8     | Q: 0 → 1 → 1        | Same stale result even though business state did not change; no audit-only exception.                                                                                                                                                                                             |
| Finance approves; policy v2 is installed, or v1 bytes change                               | 7         | Q: 0 → 1 → 1        | S: 12 → 13. `authority_state_changed`, zero effective approvals, even if the policy ID/version strings were reused. The policy content hash also differs. Q2/R=0 must bind validated approved content and collect fresh approvals; contradictory policy copies still fail closed. |
| Finance delegate approves; its grant is revoked/replaced, or its identity becomes inactive | 7         | Q: 0 → 1 → 1        | S: 12 → 13; Q is excluded. Historical approval remains inspectable. Restoring old bytes at S=14 cannot revive Q. Create a new request only if current eligibility succeeds.                                                                                                       |
| Finance delegate approves; its grant naturally expires without a catalog write             | 7         | Q: 0 → 1 → 1        | S stays 12; time check excludes that approval. Q is not currently authorized; a later-effective grant cannot rescue the old decision. At Q's own expiry all approvals are ineffective and new decisions are denied.                                                               |
| Finance approves; eligible Executive rejects                                               | 7         | Q: 0 → 1 → 2        | Terminal `rejected`, zero effective approvals. Later approve and fresh-key replay attempts cannot reopen Q. The same veto also applies after both approvals at R=2: reject advances to R=3 and invalidates the complete set.                                                      |
| Finance approves; eligible Executive modifies $15K to $12K                                 | 7         | Q: 0 → 1 → 2; Q2: 0 | One transaction supersedes Q and creates Q2 with new consequence/material hashes. Q has zero effective approvals; Q2 has no inherited Finance approval. Failure creates neither half.                                                                                             |
| Eligible reviewer escalates                                                                | 7         | Q: 0 → 1            | Terminal `escalated`; no authority. A new policy-routed request needs fresh review.                                                                                                                                                                                               |
| Finance and Executive simultaneously submit expected R=0                                   | 7         | Q: 0 → 1            | Singleton lock gives one applied decision; loser gets `review_revision_conflict` and no append. After refresh/new key at expected R=1, loser may append R=2; both then count. No predetermined winner.                                                                            |
| Double-click or retry after commit and restart                                             | 7         | Q: 0 → 1 → 1        | Same key/bytes returns original receipt once; no extra vote. Changed bytes with that key conflict. If rollback happened before commit, retry applies once at R=1. If C or S changed after commit, duplicate still returns history but current eligibility is false.               |

## Implementation acceptance criteria, after approval

1. Add versioned contract tests for complete snapshot/material/policy binding,
   absent v1 fields, v0 non-promotion, terminal dispositions and replacement lineage.
2. Execute every scenario above with C/R/S assertions; retain all 42 repaired
   resolver tests, including named principals, direct/delegated authority,
   contradictory IDs, cited-grant timing and input-order equivalence.
3. Extend the [runtime replay tests](../../tests/runtime-engine.test.mjs) pattern:
   deterministic replay and packet reconstruction, tampering/gaps/coherent rehash
   rejection, terminal revival denial and exact duplicate behavior without clocks
   or IDs. Prove current evaluation does not reuse historical authorization.
4. Extend the [store tests](../../tests/postgres-store.test.mjs) pattern and real
   PostgreSQL CI smoke: simultaneous reviewers, review-vs-Case/catalog races,
   failure at every persistence step, atomic replacement, restart retries,
   append-only constraints, snapshot drift and failed-rollback client eviction.
5. Keep existing Case version/journal tests and ECC corpus/gold unchanged; run
   `pnpm validate`, positive/negative ECC evaluations, Compose config and the
   appliance smoke. Test regressing/current-vs-historical clocks and expiry edges.

Acceptance of this document authorizes only the stated D6 contract/lifecycle
direction. Runtime/schema/migration work needs its own reviewable implementation
PR. No providers, connectors, external writes, new database, generic workflow
framework, action execution, release or deployment is included.
