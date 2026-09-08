# D12-A: one useful preparation result

**Design only.** [Proposed D-037](../architecture/d12-bounded-preparation-worker.md)
is not Accepted and no worker/capture API is implemented. D11-B merged normally in
PR #34 at `6bfc94e24d2a2980b369fc0aea487e32313b5f78`, preserving reviewed head
`b284279c` and [passing required CI](https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/34279140329).
No open findings remained; main's required PR, strict up-to-date validation and
force-push/deletion protections were retained without bypass. Migration 0008 and
all earlier checksums/history/retry guarantees remain unchanged.

## What the operator gains

Today the operator can inspect a D10 brief and separately publish its D11 preparation
configuration. The operator still assembles a record-specific follow-up and task handoff.
The proposed worker assembles that work from the exact approved inputs in one explicit
call. It does not repeat the seven-record brief or merely announce that a pack is published.

| Existing material                                      | Proposed prepared output                                                                                                 | Work still requiring a person                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| North row plus explicitly associated DEL-4 note        | Cited evidence checklist for this dispute, with each missing prerequisite separated from observed source reports         | Obtain underlying proof and confirm evidence access/owners                  |
| Distinct North/South records and upload coverage       | Relevant-versus-context reconciliation; no transfer of DEL-5 evidence or contradiction between different dispute amounts | Establish governing source/variant rules if needed                          |
| Gap questions and reviewed S1–S4 template              | One deduplicated agenda and an unsent, inspectable follow-up draft                                                       | Choose recipients and any due date; communicate outside this appliance      |
| Existing applicable D10 confirmation and selected pack | Bound preparation result and explicit task review                                                                        | Judge usefulness; correct it; independently authorize any later consequence |

No measured effort reduction or autonomous activity follows from this design. The
benefit to test is whether assembling this packet reduces **total** preparation,
review and correction effort at comparable quality, including help and failed/open work.

## Populated synthetic result

The [JSON example](../examples/d12-preparation-worker.proposed.json) identifies actual
D11 source/basis hashes separately from proposed pack v2, worker and review records.
All proposed hashes cover complete reconstructable objects; the reproduction below
resolves the two compact entry recipes. They are not records accepted by today's API.

> **Orchid — North dispute-17 / INV-101**
>
> **Ready for task review: an evidence-request packet.** The queue reports $15,000
> in dispute. The DEL-4 note reports that confirmation is not supplied. This is not
> proof of non-delivery or a reason to approve a $15,000 credit.
>
> **Prepared:** scoped evidence checklist; separate South-record context; two
> consequential questions; an unsent follow-up draft. Existing descriptive review reused.
>
> **Proposed next step:** identify the delivery-evidence contact and governing terms
> owner, then collect the missing support. Taylor is only the source-reported upstream
> owner. No accountable business owner, recipient or due date has been established.
>
> **Disposition:** abstain pending proof and governing rule. Customer impact,
> accepted resolution and Case closure remain unproven.
>
> **Next action: Review prepared packet.** Synthetic task recipient: intake operator.

The draft combines the DEL-4 proof request and governing-terms/owner question. It is
never sent. The North record's $15,000 and South record's $2,500 describe different
subjects; the shared invoice label supplies context only.

| Claim                                                                             | Inspectable retained evidence                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| North dispute-17, Orchid, INV-101, $15,000, DEL-4, reported upstream owner Taylor | `orchid.csv`, record 1, byte range [236,352), citation `ae1db2dd…`; entity-qualified North record key               |
| Note reports missing supplied DEL-4 confirmation                                  | `note-17.txt`, byte range [0,73), citation `bdfdf67e…`; explicit association to North dispute-17                    |
| Two distinct records in this upload                                               | Both row citations `ae1db2dd…` and `d2bb5dfa…`, exact bundle hash and coverage membership; recurring cohort unknown |
| South dispute-18, $2,500, DEL-5                                                   | `orchid.csv`, record 2, byte range [352,456), citation `d2bb5dfa…`; related context, not North support              |
| Request owners/terms; withhold disposition conclusion                             | Labeled proposed preparation steps/unknowns, not source-established business rules                                  |

### Task review and a real change of basis

An eligible synthetic recipient can **Accept for preparation** (`task_review/approve`)
with the exact result hash and U/head. The reason in the example accepts a useful gap
packet for the next evidence conversation, not the dispute or credit. Reject closes
that task review; modify asks for an explicit corrected replacement; escalate records
an intervention and grants nothing. These are new purpose-limited D12 contracts,
not calls to the financial approval API. The service cannot accept its own work.

The example correction makes the unsent request explicitly ask for the evidence
contact and permitted retrieval route instead of implying an assigned recipient.
It retains the exact old result, JSON pointer, before/after, reason and citations.
The candidate input hash binds the retained manifest in `start_command.binding.basis.manifest`;
its referenced bundle and locators reconstruct the original bytes, not a caller narrative.
The synthetic evaluation candidate begins **not reviewed**. An independent eligible
human must review its exact input/expected-output case. Only after reviewed tests and
a normal code/profile change, fresh compatible pack publication and new invocation
can the corrected packet receive its own task review. Nothing promotes automatically.

If new information concerns the actual description, use the existing D10 path instead:

| Point                                                                  | C / D / P / U (illustrative) | Result and next action                                                                                                                            |
| ---------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 preparation configuration published                                 | 1 / 1 / 1 / 0                | Cannot execute a worker: shipped template forbids dispatch.                                                                                       |
| New fixed worker template/profile reviewed and v2 separately published | 1 / 1 / 2 / 0                | Existing descriptive review reused; explicit Start preparation is available if all current gates pass.                                            |
| Start, then valid gap packet committed                                 | 1 / 1 / 2 / 2                | One start and one result, with four bounded step proofs. Task review is pending; business disposition unresolved.                                 |
| Task accepted for preparation                                          | 1 / 1 / 2 / 3                | Historical task acceptance, no financial authority or Case closure.                                                                               |
| Operator learns a possible evidence contact and saves a D10 annotation | 1 / 2 / 2 / 3                | Pack and result lose current usability; original result/review preserved. This is an operator report, not supplied proof.                         |
| Fresh descriptive confirmation and separately published new artifact   | 1 / 3 / 3 / 3                | Explicit new run may use changed basis. Old task acceptance does not transfer. Real new bytes require D9 retention/commit first and may change C. |
| New run starts; publication withdrawn before result commit             | 1 / 3 / 4 / 5                | Terminal result is invalidated. No current packet acceptance or continuation; eligible withdrawal needs no fresh business basis.                  |

U is a proposed Case-local supporting history, not implemented Case state. Repeated
reads change none of these values. A pending invocation after restart needs inspection
and explicit interruption before a fresh command; exact retries return its original
reference and never resume work or select a replacement key silently.

## Proposed screen: one next action

Keep the existing white/cream intake view; no new dashboard or four-step animation.
At desktop use the existing two-column summary/action placement; at 390px place the
concise consequence, material uncertainty and current action together, then disclosures.
These are proposed layout instructions, not screenshots or a completed visual check.

```text
Orchid / North dispute-17 · $15,000 reported dispute
DEL-4 confirmation and governing terms remain unconfirmed.

[Recorded preparation summary]             [One primary next action]
Checklist · scoped comparison · draft       Review prepared packet
Business disposition: abstained             Synthetic task recipient

▸ Evidence and draft                         Reject / Modify / Escalate
▸ Completed descriptive review
▸ Selected publication / history            Withdraw / correct / recover
▸ Exact bindings, costs and proof readiness
```

Before a run: **Prepare disposition packet**. After valid completion: **Review prepared
packet**. After task acceptance: show accepted-for-preparation and the proposed human
evidence follow-up, not a fake Done/Resolved action. Missing publication/review: show
that prerequisite as the primary action. Pending/uncertain: recover the original
submission. Stale: inspect the change; no silent start or rebase. Failed/malformed:
explain SYSTEM_FAILURE and the permitted explicit recovery. Historical-only results
remain inspectable but cannot supply a current success label.

This carries both nonblocking D11 observations forward: collapse a completed descriptive
review behind its labeled disclosure, and replace the inactive publication form with
current selection plus expandable publication/intervention details. Keep withdrawal
accessible under its own eligibility rules. No automatic seat change; retain reject,
modify, escalate, correction, source citations and exact retry recovery. Keyboard order
must reach summary/action first, then disclosures; focus confirmed receipt/errors without
claiming current eligibility when refresh fails. No visual implementation occurs here.

## Reproduce the documentation example

Use Node 24.19.0/tzdata 2026b and existing dependencies. This command uses the existing
**disposable** PostgreSQL/API helper, creating and dropping only its random schema.
It runs D9/D10/D11 v1 only. Pack v2 and worker records are constructed **in memory as
proposals**, checked against this JSON, and explicitly rejected by today's v1 validator.
No evaluator history, D12 runtime, migrations or frozen fixtures are changed.

```sh
pnpm build
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:55432/postgres node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { intakeHost } from './tests/helpers/intake-postgres.mjs';
import { intakeInput } from './tests/helpers/intake.mjs';
import { discoveryPath, reviewPath, discoveryCommand } from './tests/helpers/discovery.mjs';
import { sha256Json, assertValidPreparationPackContract } from './dist/packages/contracts/src/index.js';
const x = JSON.parse(await readFile('docs/examples/d12-preparation-worker.proposed.json', 'utf8'));
for (const f of x.baseline.fixture_inputs) {
  assert.equal('sha256:' + createHash('sha256').update(await readFile(f.path)).digest('hex'), f.hash);
}
const cleanup = [];
try {
  const h = await intakeHost({ after: f => cleanup.push(f) });
  const v = await h.prepare(await intakeInput(x.baseline.prepare_key));
  const receipt = (await h.ok('/v1/intake/commits', await h.selection(v, 0, { key: x.baseline.commit_key }))).receipt;
  const dp = discoveryPath(v, receipt.case_id);
  await h.ok(reviewPath(v), discoveryCommand(await h.ok(dp), x.baseline.confirm_key, 'confirm'));
  const brief = await h.ok(dp);
  const path = '/v1/intake/preparation-packs/pack_synthetic_invoice_dispute_north?bundle_id=' + brief.binding.bundle_id + '&record_key=' + encodeURIComponent(brief.binding.record_key) + '&case_id=' + receipt.case_id;
  const view = await h.ok(path);
  const old = (await h.ok('/v1/intake/preparation-packs/pack_synthetic_invoice_dispute_north/selections/publication', {
    schema_version: 'pack-selection-command.v1', operation: 'publish', pack_id: view.pack_id,
    expected_selection_revision: 0, expected_selection_head: null,
    expected_publication_profile_hash: view.publication_profile_hash,
    artifact_hash: view.candidate_hash, expected_basis: view.candidate.binding,
    effective_until: '2026-09-07T17:00:00.000Z', effective_until_source_timezone: 'UTC',
    idempotency_key: x.baseline.publish_v1_key,
    reason: 'Synthetic documentation basis; does not authorize worker execution'
  })).entry;
  assert.equal(old.hash, x.baseline.actual_selection_head);
  assert.equal(old.artifact_hash, x.baseline.actual_artifact_hash);
  assert.equal(sha256Json(await h.ok(path + '&representation=export')), x.baseline.actual_export_hash);
  assert.deepEqual(old.artifact.sources, x.citation_catalog);
  assert.equal(sha256Json(x.worker_profile), x.worker_profile_hash);
  const proposed = structuredClone(old.artifact);
  delete proposed.version;
  proposed.template.template_id = x.proposed_pack_recipe.template_id;
  for (const [key, value] of Object.entries(x.proposed_pack_recipe.patches)) {
    const parts = key.split('.'); let parent = proposed;
    for (const part of parts.slice(0, -1)) parent = parent[part];
    parent[parts.at(-1)] = key === 'template.resource_limits.worker_limits' ? x.worker_limits : value;
  }
  proposed.version = 'pack-v2-' + sha256Json(proposed).slice(7);
  assert.equal(proposed.version, x.proposed_pack_recipe.version);
  assert.equal(sha256Json(proposed), x.proposed_pack_recipe.artifact_hash);
  assert.throws(() => assertValidPreparationPackContract('artifact', proposed));
  const selection = { ...x.proposed_publication.entry_without_artifact, artifact: proposed };
  assert.equal(selection.previous_entry_hash, old.hash);
  assert.equal(sha256Json(selection), x.proposed_publication.entry_hash);
  assert.deepEqual(x.start_command.binding.basis, proposed.binding);
  assert.equal(x.start_command.binding.selection_head, x.proposed_publication.entry_hash);
  assert.equal(x.started_entry.command_fingerprint, sha256Json(x.start_command));
  const { hash, ...started } = x.started_entry;
  assert.equal(hash, sha256Json(started));
  assert.equal(x.expected_result.started_entry_hash, hash);
  assert.equal(x.expected_result.binding_hash, sha256Json(x.start_command.binding));
  assert.equal(x.result_hash, sha256Json(x.expected_result));
  const terminal = { ...x.terminal_entry_recipe.entry_without_result, result: x.expected_result };
  assert.equal(sha256Json(terminal), x.terminal_entry_recipe.entry_hash);
  assert.equal(x.task_review_command.expected_work_head, x.terminal_entry_recipe.entry_hash);
  assert.equal(x.task_review_command.result_hash, x.result_hash);
  const delivery = brief.material.source_claims.filter(c => c.subject.kind === 'delivery' && c.subject.id === 'DEL-4' && c.applicable_record_key === brief.binding.record_key);
  assert.ok(delivery.some(c => c.meaning === 'source_reports_missing' && c.citation_ids.includes(x.expected_result.evidence_checklist[0].citation_ids[0])));
  assert.deepEqual(x.expected_result.coverage.record_keys, old.artifact.coverage.members.map(m => m.record_key));
  assert.equal(x.expected_result.disposition.recommended_credit_minor, null);
  assert.equal(x.expected_result.case_closure_permission, false);
  assert.equal(x.expected_result.proof_readiness.length, 5);
  assert.ok(x.expected_result.proof_readiness.every(m => m.status === 'unknown' && m.value === null));
  assert.equal(x.correction_example.before, x.expected_result.follow_up.requests[0].text);
  assert.equal(x.correction_example.candidate.test_input_hash, sha256Json(proposed.binding.manifest));
  const before = await h.snapshot();
  await h.restart();
  assert.equal(sha256Json(await h.ok(path + '&representation=export')), x.baseline.actual_export_hash);
  assert.deepEqual(await h.snapshot(), before);
  console.log('PASS: real D11 basis/restart; proposed hashes and scoped citations; v2 rejected by current runtime; five unknown measures; no D12 execution or acceptance test pass');
} finally { for (const close of cleanup.reverse()) await close(); }
JS
```

The full future W1–W10 acceptance design and smallest D12-B instructions are in D-037.
The implementation must additionally run varied inputs, races/failures/upgrade/browser
and all retained regression/ECC/appliance checks. Passing this example only validates
document consistency and existing D11 behavior. It cannot establish worker usefulness,
customer acceptance, measured effort, real issuance or a resolved Case.
