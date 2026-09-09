# D-039 — One synthetic imported-dispute result and separate business acceptance

Status: **Proposed — no implementation or approval of this boundary.**

D-038 preparation at `b67cfaf0` is preserved. Its accepted second packet is useful
preparation, not an authorized disposition, verified delivery or business acceptance.
This decision proposes one next bounded D13 API slice; it does not start D14.
The [worked example](../examples/d13-dispute-result.proposed.json) distinguishes
actual preparation bindings from hypothetical source records and future commands.

## Decision requested

Approve only a **synthetic no-adjustment disposition** for one explicitly selected,
already imported North invoice-dispute record, with a fixed source reader, separate
decision/verifier/business-recipient profiles, and one append-only PostgreSQL
supporting result journal. Reuse the existing Case, D6 request/review/resolver and
persistence/retry patterns. New result contracts must be strict and versioned.

This would let a person authorize “uphold this disputed portion without adjustment,”
record a reported off-runtime disposition, independently check the synthetic source,
and separately accept that exact result. It does not authorize any individual
decision, change customer terms, issue credit, collect cash, send a message or close
a Case. D-013/D-017, D-033's separate credit tenant, D-034 activation gate and D-038's
two-bundle ceiling remain unchanged. Do not implement this boundary before approval.

## One disposition, with evidence prerequisites

**Proposed path:** `uphold_invoice_no_adjustment`, confined to the selected disputed
portion. For the worked example this is North / Orchid / dispute-17 / INV-101 /
PO-9 / DEL-4 / USD 1,500,000 minor units. That is the reported **disputed amount**,
not the total invoice balance, cash recovered or an amount to credit.
Dispute-18 / DEL-5 remains separate even though it shares the Case and invoice label.

Required before a no-action decision can be authorized and recorded:

| Prerequisite     | Exact evidence and rule                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivery         | Original POD object and bytes, issuer/custodian, source revision, recipient/receipt event, delivered line/quantity and explicit dispute–invoice–order–delivery allocation. The authoritative delivery source must mark the original valid and not rescinded. A TXT saying proof exists, filename, queue status or task confirmation is insufficient.                                  |
| Governing terms  | Exact applicable terms object/version/hash, clause, entity/account/order scope and effectivity at the relevant delivery/disposition times. The proposed synthetic clause permits no adjustment only for matched delivery and no other active dispute ground. This clause is an invented test rule, **not a fact established by current inputs** or a contract interpretation service. |
| Complete grounds | A complete authoritative record-specific grounds view confirms that non-delivery is the only ground being disposed. Unknown quantity/quality/price claims or conflicting allocation/terms block this path. Do not infer absence from omitted fields.                                                                                                                                  |
| Decision owner   | Proposed server-controlled **Morgan, synthetic North AR decision owner**, with a current canonical human identity and named scoped `invoice_dispute_no_adjustment` authority. Queue-reported Taylor and the preparation operator do not inherit this grant.                                                                                                                           |
| Authorization    | New fixed policy/content reference and exact consequence hash, existing D6 C/R/S checks and repaired resolver. One named Morgan approval, no delegation or preparer self-approval. The profile admits only this no-adjustment operation; amounts remain context and cannot select a credit or write-off.                                                                              |

The present two-bundle handoff has **none of the original-POD, governing-terms or
business-grant proof above**. Its next permitted action remains human evidence/access/
owner clarification. A missing prerequisite is a blocker, not a successful disposition.

## Sources and the new trust boundary

The smallest implementation would use one fixed **local synthetic fixture reader**,
not a connector. It independently reads allowlisted POD/allocation, terms and AR
dispute objects from versioned fixture files. Normal command payloads cannot contain
source observations, fixture paths, verifier identities or success flags. No normal
API edits this source. The test host alone selects controlled states, including
unavailable/malformed/change/reversal cases. This is logical separation in one
evaluation appliance, not protection against a privileged owner rewriting everything.

Explicit synthetic enrollment binds the committed intake Case/record and exact
entity/customer/object tuple to the fixture objects and named profiles. Matching
“Orchid” or INV-101 is never enrollment. It uses the existing runtime-controlled
authority catalog and advances that tenant's S; imports never enroll automatically.
The old D6/D7 tenant, named-Finance policy and credit source remain untouched.

These proof-source objects are **not extra preparation bundles** and cannot become
worker inputs by citation or an alternative upload route. D-038 keeps every existing
bundle, limit, occurrence count and read-scope check. Any later material entering
preparation must use existing intake and will be refused if its complete input
exceeds two bundles. This proposed reader has only the named business-proof purpose;
it grants no external access, arbitrary file read, general retrieval or worker capacity.
Do not widen the frozen ECC fixture catalog to store these objects.

The reader returns exact object ID/version/hash/bytes, full declared scope/coverage,
source event time/timezone and trusted observation time. A separate current
`identity_dispute_verifier` service grant permits only these reads for the enrolled
Case/record. It must differ from the preparer, decision owner, action reporter and
business recipient. Identity/grant/scope/effectivity are rechecked before reading
and under the writer lock. Revoked/expired/self-verifying actors are rejected.

Two explicit checks reuse the same narrow reader:

1. **Basis check:** inspect original delivery, allocation and terms. Only an exact,
   complete, current match can support a new disposition authority request.
2. **Result check:** ignore a person's reported success; read the AR disposition
   and recheck its governing POD/terms. Compare the enrolled subject tuple, disputed
   portion/currency, `upheld_no_adjustment`, zero adjustment for this disposition,
   no associated credit IDs, and the exact authorized decision reference.
   This is not a complete cash/credit-ledger audit.

An authoritative absence or different value for the exact requested object is
**mismatch**. A failed/unavailable/malformed/incomplete read, wrong read scope or
changing source is **inconclusive**. A correctly attributed row naming another
delivery is a mismatch; a response attributed to another record is unusable,
inconclusive evidence for this record. A read error is never absence.
Both results retain evidence and explain recovery; neither creates verified proof.

Read all required source objects under one fixture revision, then compare that
revision/hash again under the existing writer lock. Any change or read failure
makes the check inconclusive; no partial positive result survives. Retain every
trusted observation, comparison, rule/version, identity/grant snapshot and evaluation
time atomically. Replay compares retained bytes under the original interpreter;
it does not re-fetch a source or reinterpret an old match using new rules.
Replay must also reject obsolete Case/support prefixes when canonical newer entries
predate the claimed decision; validating an internally coherent old prefix is not
enough. Retain canonical identity/grant snapshots at the recorded evaluation time.
Later revocation blocks new permission without inventing retroactive identity rules.
Ordinary GET/export reads use a consistent database snapshot and produce no
observations, durable clock updates, IDs or journal writes.

## Binding, lifecycle and command contract

The server derives a strict `dispute-result-basis.v1`: exact tenant/Case/C/head,
entity-qualified record and business objects, original intake receipt/bundle hashes
and the complete current business-intake manifest (not no-op request-key metadata),
preparation invocation/result/review links **as history only**, complete source
object revisions/hashes, basis observation, terms/clause and policy ID/version/content.
It computes the no-adjustment payload and expected result; caller hashes or historical
approval flags never grant permission. Any changed Case event, including D-014, or
changed S/business-intake/source/terms invalidates new use of the old basis. D/P/U are retained
provenance, not a substitute for business authority.

Propose a fixed 15-minute freshness window for basis/result observations and new
business consent in this synthetic slice; also enforce source-specific validity and
non-future times. This is a test policy, not a customer SLA. Expiry leaves historical
evidence intact but requires an explicit fresh check before new permission or
acceptance. An old observation is not proof that the source is still unchanged.

The expected outside disposition changes AR version 0 to 1. That change makes the
old request unusable for **another decision**, but does not erase the valid O3
no-action receipt. A result check and separate business acceptance may follow that
receipt only if the independent source proves the narrow `open` →
`upheld_no_adjustment` transition from the exact prior AR hash/version, with the
same subject, no adjustment, no credit and the exact decision reference. Original
POD/terms must remain unchanged and valid; the complete grounds view must move only
the authorized non-delivery ground to disposed, with no additional active grounds.
The example retains both AR versions and this lineage. Acceptance binds the **new
result-source head**, not the obsolete pre-disposition AR head, and requires current
C/S, prerequisite evidence, recipient eligibility and fresh observation. Missing
lineage/coverage is inconclusive; an unexpected transition or added ground is mismatch.
Neither condition permits acceptance. This operation-specific rule never renews
execution authority or allows a changed POD, terms, subject or amount to pass.

The new material adapter must have its own pinned interpretation version; old D6
material/evaluations continue replaying under their recorded versions.

Use one Case-wide supporting result revision/head **O**, with record-specific
applicability. O never replaces C, R, S or another record's identity. Each strict
operation binds the expected O/head and its applicable exact immutable references:

| Proposed operation             | Checks and durable result                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bind candidate / check basis   | Select an already committed record; fixed sources and full read scope. Append candidate or independent observation; no authority or business acceptance.                                                                                                                                                                              |
| Request authority              | Current C/S/source/basis and successful basis proof. A bounded new material adapter creates an existing Authority Request v1 with immutable consent and separate R. It does not reinterpret the current credit-only create payload.                                                                                                   |
| Review authority               | Existing D6 approve/reject/modify/escalate semantics, current eligibility, exact request and C/R/S. A replacement gets no approvals.                                                                                                                                                                                                  |
| Record justified no-action     | Exact O/head and request/R, current C/S, source/POD/terms and resolver authorization under the writer transaction. Record `no_financial_action_recorded`; do not fabricate an executed ActionReceipt or assert an external effect.                                                                                                    |
| Report off-runtime disposition | Current reporting grant, exact recorded no-action reference and source object/version claimed by the human, reported occurrence/timezone, evidence and reason. Append **reported**, never verified. No API writes the AR source.                                                                                                      |
| Check result                   | Bind the committed no-action/report reference and expected O/head. Current verifier permission is independent of current execution permission: historical work remains checkable after authority becomes stale or rejected. Independently compare current source; append match/mismatch/inconclusive.                                 |
| Accept/reject business result  | Current recipient grant, exact candidate outcome, latest matching result observation, no-action/reference, current C/S and unchanged disposition prerequisites, the exact expected AR transition/new source head, and O/head. A task approval cannot satisfy this operation. Record accepted or rejected with reason and commitments. |
| Reopen/reverse                 | Current scoped recipient or decision-owner intervention grant, exact affected result/acceptance and O/head, reason and evidence. Allow intervention despite stale business basis; never revive an expired/revoked grant. Append lineage and remove current accepted-result status.                                                    |

Authority creation/review keeps its existing R history and does not append O; the
new material adapter checks the current result basis/head at submission. Result
operations advance O only, not C/D/P/U/R/S. Recording a step against an unchanged
basis does not itself invalidate that basis; changed inputs, invalidating observations,
supersession or interventions do. A competing O/head change yields a conflict and
requires explicit refresh, not automatic retry or an observation against a new basis.

Every write uses the existing transaction, singleton lock, durable clock guard,
atomic entry/index/integrity validation and scoped key/fingerprint pattern.
Exact retries return the **original returned receipt**, even after staleness, without
new review, observation, authority or renewed permission. A different command under
the same key conflicts. Concurrent commands cannot silently rebase. Uncertain
responses retain original bytes/key through the existing atomic browser claim;
a fresh check is explicit and uses a new key. No background retry or financial effect.

Immutable snapshots live with their supporting journal entries or reused hash-addressed
authority snapshots; no mutable outcome aggregate or second Case ledger. Proposed
migration adds **one `dispute_result_journal` table** for this bounded evidence and
its relational identity/head/key indexes. Do not overload the purpose-limited U
journal, credit journal or existing CHECK constraints. Applied migrations stay intact.
This migration and the new catalog/source purposes are part of the approval request.

## Separate business acceptance and reversal

Proposed **Robin, synthetic Orchid dispute recipient**, is a separate named canonical
human with current `accept_invoice_dispute_disposition` scope for this record.
Selecting the seat is not authentication. Morgan authorizes the decision; Robin
accepts its business result. The service verifies; none inherits another purpose.

A successful result can yield an existing-shape v0 `Outcome` projection with
`type: invoice_dispute_no_adjustment`, `status: achieved`, `accepted: false`,
exact evidence IDs, verifier ID and verified time. Unknown/inconclusive outcomes
cannot be forced into required verified fields. Separate acceptance produces a new
versioned evidence record binding that outcome hash, observation and decision; only
then may its current derived view say accepted. Do not mutate the canonical Case's
Outcome arrays or add a generic Case transition in this slice.

Acceptance states the exact disputed portion and disposition, remaining commitments,
their confirmed owners/due times and completion or transfer evidence. The example
still owes a payment-status follow-up; it does not claim cash, cleared receivables
or payment. Unknown mandatory acceptance/commitment ownership blocks acceptance.
The acceptance grant is only for the dispute disposition, never the whole shared Case.

Rejection is terminal for that candidate. Correction needs a new basis, fresh
authorization where affected, a new source check and new acceptance. A later
mismatch/inconclusive check removes the **current verified** label while retaining
the earlier match and acceptance as history. A reliable source reversal/reopen
removes it from the current accepted-dispute numerator; append the explicit linked
intervention, preserve the original count at its historical cutoff, and do not
count the repeat as another resolved dispute. Inconclusive or expired observations
make current coverage unknown, not an invented zero or reversal. Current source changes cannot silently
carry old acceptance forward. Equal timestamps establish no cross-journal order;
exact anchors and the writer transaction determine live command order.

Even an accepted, source-checked no-adjustment result leaves **Case closure denied**.
DEL-5, other commitments, customer impact, correction/audit completeness and all
D-013 closure obligations are separate. No closure-engine amendment is requested.

## Worked path and controls — proposed, not executed

The JSON example binds the actual second preparation at C3/D2/P2/U6 and its returned
acceptance receipt. All business fixtures, identities, times and events below are
**hypothetical future test inputs**, not evidence already available from D-038.

| Step                                           | Expected state and operator meaning                                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current handoff                                | DEL-4 source report supplied; original proof/terms/business owner absent. No business result or authority. DEL-5 unchanged.                                                                                                                                        |
| Synthetic enrollment and evidence              | Explicit enrollment creates the new fixed catalog S1. Original POD-4/allocation and TERMS-N1 are now available only in the proposed source fixture. C3 and the two preparation bundles remain unchanged.                                                           |
| O1 candidate → O2 basis match                  | Exact DEL-4 allocation, received quantities, recipient and applicable clause match. No other active ground according to the complete fixture view. UI: “Evidence checked — business decision needed.”                                                              |
| R0 request → R1 Morgan approval → O3 no-action | Server recomputes exact no-adjustment consequence and current eligibility. No money moves.                                                                                                                                                                         |
| O4 reported disposition → O5 result match      | A synthetic human reports outside-runtime recording. Independent AR source read confirms the exact decision reference, record, amount context and no-adjustment disposition. UI: “Synthetic source checked — business acceptance needed.”                          |
| O6 Robin acceptance                            | Exact O5 result accepted, payment-status follow-up owned/due, DEL-5 remains open. One synthetic accepted dispute disposition; no verified payment or Case resolution.                                                                                              |
| O7 new source check → O8 reopen                | Source revision retracts POD validity and reopens dispute-17. O7 is mismatch; historical success no longer labels the current result verified. O8 links the prior acceptance. Current accepted-dispute count becomes 0; one reopened record, not a second success. |

Wrong-record DEL-5 proof cannot satisfy DEL-4. Changing C/S/terms or revoking Morgan
before O3 denies no-action recording without a partial result. The present status-only
TXT fails original-proof prerequisites. Unavailable reads are inconclusive, never a
no-credit/absence finding. A stale or ineligible Robin cannot accept. No proposed
source/action event is claimed to have occurred by the current implementation.

## Existing versus missing implementation

| Reuse inspected in repository                                                                                                                                                                           | Missing addition requiring this decision                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Case/WorkEvent/EvidenceRef/Commitment/Outcome v0](../../packages/contracts/schemas/case.v0.schema.json), [Case engine](../../packages/runtime/src/case-engine.ts), immutable intake bytes/associations | Exact scoped business basis/expected result, admitted original-proof/terms semantics and supported result commands. v0 shapes alone supply neither verification nor acceptance operations.              |
| [Authority request/review](../../packages/runtime/src/authority-review.ts), [resolver](../../packages/domain/src/authority-resolution.ts), catalog/S, terminal rules                                    | A new fixed intake-tenant no-adjustment material/profile adapter and purpose grants. Current `synthetic-authority.ts` is credit-only for tenant_orchid; it cannot authorize this imported Case by name. |
| [Credit verification](../../packages/runtime/src/credit-verification.ts), [transaction/store pattern](../../packages/runtime/src/postgres-credit-verification-store.ts)                                 | Same independent-read/retained-comparison pattern for the new exact POD/terms/AR fixture objects; do not call or widen the D7 credit operation.                                                         |
| [Work history/replay](../../packages/runtime/src/preparation-work.ts), atomic recovery, [proof notes](../guides/synthetic-preparation-worker.md)                                                        | Separate result/observation/acceptance/reversal contracts and one supporting journal; task review/proof notes are not business authority or independent proof.                                          |
| [Challenge report](../guides/challenge-report.md) and five measure definitions                                                                                                                          | A later explicitly versioned projection may consume the new validated result export. Historical calculators/receipts keep their interpretation; this design changes no reported totals.                 |

## Smallest implementation after approval and acceptance scenarios

One API-only PR: strict basis/command/observation/comparison/receipt/read/export
contracts; the fixed synthetic enrollment/material adapter; one supporting journal
and additive migration; one allowlisted fixture reader; no-action/report/check and
separate business review/intervention. Reuse the existing runtime boundary and
recovery primitives. A derived read view supplies the compact operator story;
Workbench controls may follow, without another dashboard. No general OutcomeEvent,
scheduler, connector, financial write or arbitrary-source framework.

| ID                             | Required actual PostgreSQL/API assertion for that future PR                                                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BR1 success                    | Import same Case/record, retain both packets, independent original-proof/terms check, exact D6 approval, no-action receipt, reported action, independent result with exact AR 0→1 lineage, separate acceptance without renewing old execution permission. Zero financial effects; DEL-5 unchanged; closure denied. |
| BR2 wrong subject              | Same invoice/customer with another record/delivery, wrong entity, partial allocation and explicitly shared delivery controls. Only applicable complete evidence can count.                                                                                                                                         |
| BR3 stale authority            | Case/D-014, catalog/identity/grant/terms/source change before submission and during observation/writer wait; expected AR transition cannot excuse changed grounds/POD/terms. No stale no-action or acceptance; historical check still allowed under current verifier grant.                                        |
| BR4 missing or uncertain proof | Status-only note, missing original bytes, absent terms, conflicting grounds, unavailable/malformed/incomplete/changing observation. Denial/mismatch/inconclusive are distinct; no error becomes absence.                                                                                                           |
| BR5 review separation          | Old/new task acceptance, preparer/decider/reporter self-verification and unauthorized recipient fail; business rejection terminal; new candidate gets no transferred approvals.                                                                                                                                    |
| BR6 reversal                   | Later authoritative retraction/reopen, later inconclusive check and rejected/reversed result preserve original history while removing current success. Deduplicate record/period coverage.                                                                                                                         |
| BR7 persistence/recovery       | Fresh/upgrade migration, failures at insert/commit/read-back, concurrent shared-Case commands, exact lost-response retries after restart, stale-head denial, source races and coherently altered proof. GET/export does not write; replay is deterministic.                                                        |
| BR8 product safeguards         | All five measures, commitments/unknowns, old interpreters/migrations/ECC, D6–D13 coverage, two-bundle preflight and authority/closure guards unchanged. No assumed D7 enrollment.                                                                                                                                  |

Cash collected remains unknown; this operation issues no credit, which does not prove
the complete credits-issued measure is zero. Only the synthetic accepted-disposition
measure can be 1 then 0/reopened under the proposed definition. Newly attended work
and attention released remain unknown without prior coverage and comparable effort.
Include failed/open work, negatives, reversals, overlap, human preparation/review/
correction/verification/support effort and model/tool/infrastructure/setup costs.
Neither packet count nor disputed principal is savings.

**Open decisions before any real use:** actual delivery/terms/AR systems of record,
authenticity/custody, precise contract interpretation, delegated decision and recipient
authority, completeness/freshness windows, commitment policy, cohort/baseline and
approved data/access/retention/deletion arrangements. Synthetic design approval cannot
answer these for a customer. BR1–BR8 are proposed tests, not implementation evidence.

## Reproduce the document checks

This checks only example hashes, references and existing policy/identity shapes.
It does not execute the proposed business operations or satisfy BR1–BR8.

```sh
pnpm build
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha256Json, assertValidAuthorityPolicy, assertValidIdentityReference } from './dist/packages/contracts/src/index.js';
const e = JSON.parse(await readFile('docs/examples/d13-dispute-result.proposed.json', 'utf8'));
const { example_hash, ...body } = e;
assert.equal(example_hash, sha256Json(body));
assert.equal(e.status, 'Proposed');
assert.equal(e.business_scenarios_executed, false);
const q = e.hypothetical_only;
assertValidAuthorityPolicy(q.policy);
q.identities.forEach(assertValidIdentityReference);
let previous = null;
for (const [i, entry] of q.proposed_journal.entries()) {
  const { hash, ...content } = entry;
  assert.equal(hash, sha256Json(content));
  assert.equal(entry.sequence, i + 1);
  assert.equal(entry.previous_entry_hash, previous);
  previous = hash;
}
assert.equal(q.ar_result_source.decision_reference, q.no_action_record.hash);
assert.equal(q.ar_result_source.prior_source_hash, sha256Json(q.ar_basis_source));
assert.equal(q.ar_result_source.prior_source_version, q.ar_basis_source.source_version);
assert.deepEqual(q.ar_result_source.disposed_grounds, q.disposition_payload.grounds);
assert.deepEqual(q.ar_result_source.other_active_grounds, []);
assert.equal(q.result_observation.data.source_heads.ar, sha256Json(q.ar_result_source));
for (const [key, value] of Object.entries(q.result_observation.data.expected))
  assert.deepEqual(q.result_observation.data.observed[key], value);
assert.equal(q.business_acceptance.observation_hash, q.result_observation.hash);
assert.equal(q.business_acceptance.outcome_hash, sha256Json(q.outcome_projection_before_acceptance));
assert.equal(q.business_acceptance.expected_result_head, q.proposed_journal[4].hash);
assert.equal(q.later_reversal.subject.record_key, e.actual_preparation_evidence.subject.record_key);
assert.equal(e.preserved_limits.preparation_retained_bundles, 2);
console.log('Proposed example hashes/references checked; business behavior is not implemented.');
NODE
```
