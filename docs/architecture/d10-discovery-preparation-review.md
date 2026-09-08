# D-035 — Bounded Discovery preparation and descriptive review

Status: **Accepted for narrow synthetic implementation. Real-customer activation remains unapproved.**
D10-A is documentation only. D10-B is authorized after PR #31 merges normally;
the records, APIs and screen below are not implemented by this approval update.

## Human approval and proposal history

On 2026-09-07 (operator local date), the human owner instructed:

> I approve D-035’s narrow synthetic descriptive-review boundary and authorize D10-B after PR #31 merges normally.
>
> This approval covers immutable, Case-linked descriptive answers, corrections and confirmations; exact bindings and retry recovery; the specified conservative input invalidation; one supporting PostgreSQL history; and portable provenance. Confirmation grants no business authority, outcome acceptance or closure permission. Real-customer activation remains unapproved.

The current PR head was verified as `814b415e8c80b4b81c9c2ccbc4abdeec244d2365`.
The [initial proposal](https://github.com/Mehtapozkan/fieldruntime-core/blob/cd9fdf94c5452130d3c8cf76a3f120c6a28d6cb0/docs/architecture/d10-discovery-preparation-review.md)
and [consent/stale-answer clarification](https://github.com/Mehtapozkan/fieldruntime-core/blob/814b415e8c80b4b81c9c2ccbc4abdeec244d2365/docs/architecture/d10-discovery-preparation-review.md)
remain immutable proposal history. The same instruction requires the T1–T3 input-
variation clarification below. This approval adds no customer-data permission, policy,
outcome acceptance, Runtime Pack publication, worker integration or closure boundary.
The remaining design examples describe the accepted scope, not implemented APIs.
The [canonical specification](../product/workflow-discovery.md) remains the product
specification; the [single 19-entry matrix](../product/requirements-implementation-matrix.md)
remains the requirement/gaps record. This is its bounded design, not another roadmap.

Starting point: PR #30 merged normally at `ca9543289894fffdaa40ecfe794d83addc2c19de`,
preserving reviewed head `9d250707458adfdc481a6c9259608f5d6d3f4cc7` and
[passing CI](https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/34177310405).
[Accepted D-034 and its key amendment](d9-assisted-intake-boundary.md) remain intact.
Only the fixed synthetic invoice-dispute profile is in scope; real customer activation
is unapproved. No model/provider, worker, new pack, external action or closure permission.

## Purpose and accepted decision

Help one operator explain what prevents an evidence-backed invoice-dispute disposition,
correct that explanation and review a feasible improvement. Prepare from retained inputs
using deterministic code; label every inference and missing fact. Do not claim to have
discovered a historical process from a queue snapshot.

**Accepted boundary:** allow the server-selected synthetic intake operator to append
Case-linked Discovery answers, corrections and confirmations for the stated purpose
of descriptive workflow review. Retain their exact material, source/Case bindings,
attribution, versions and retry result in one immutable supporting PostgreSQL history.
Brief reads remain derived and read-only. Confirmation never creates executable policy,
an Authority Decision, action permission, customer acceptance or a resolved Case.

The approved addition is that durable, typed descriptive-review boundary.
D-034 retains source material and intake consent, but does not define structured
interview answers or confirmation of a workflow description. D-032's approval journal
has consequential-request lifecycle semantics and must not be repurposed. D-035 neither
changes those decisions nor accepts any future source-precedence rule.

## One operator experience and populated example

Use **Open retained material → Workflow brief → Answer missing-evidence questions →
Correct a finding → Review proposed improvement** in the existing intake Workbench.
Keep its cream layout, candidate selection, source disclosures and exact recovery
banner. Replace repeated selected-row summaries with the brief; keep other candidates
and historical intake receipts expandable. Do not add a dashboard or progress counter.

Select the north row as the focal assignment; show the south row as a scope discrepancy,
not a second automated workload. Saving Discovery review requires a prior explicit
D9 create/attach receipt for that selected Case. Before that, brief inspection works
and the next action points to the existing intake review controls. Opening never
creates a Case or a review. Existing Cases are never retargeted or merged automatically.

### Retained evidence, not invented business results

The following values were checked with the implemented `prepareIntake` against
[orchid.csv](../../tests/fixtures/intake/orchid.csv) and
[note-17.txt](../../tests/fixtures/intake/note-17.txt), using
[the existing example input](../../tests/helpers/intake.mjs). This checks the proposed
example's source facts, not a Discovery implementation or a human usability result.

| Citation | Exact retained material                                                                                                                                                                                                                                        | What it supports and does not support                                                                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1       | CSV SHA-256 `e03a128dc0e3e022eda175f197de6b8dd463d87ea5da1a196d80f2aa6c05d0b3`; 456 bytes. Record 1, line 2, byte span `[236,352)`. Fields `legal_entity_id`, `invoice_id`, `amount_minor`, `upstream_case_id`, `upstream_owner`, `order_ids`, `delivery_ids`. | North `dispute-17/r1`, Orchid, `INV-101`, reported disputed amount **$15,000 USD**, reported `open`, upstream `AR-77`, reported owner Taylor, `PO-9`/`DEL-4`. These are source claims, not an approved credit, canonical owner, event sequence or verified delivery. |
| E2       | Same CSV/hash; record 2, line 3, byte span `[352,456)`.                                                                                                                                                                                                        | South `dispute-18/r1`, Orchid, `INV-101`, reported disputed amount **$2,500 USD**, `PO-10`/`DEL-5`; upstream Case and owner are unknown. Same invoice label does not establish the same entity-qualified object or Case.                                             |
| E3       | Text SHA-256 `16c8f0c2de6a68e220ea5588703d6e382ab75a03d4aa278190b9a0fd482863e3`; 73 bytes, content line 1, bytes `[0,73)` including final LF. Association to north/dispute-17 is reported.                                                                     | “Customer disputes delivery DEL-4. Delivery confirmation is not supplied.” This is inspectable parsed text, not independent proof of non-delivery.                                                                                                                   |
| E4       | Bundle `coverage` and record `measurement_gaps` from the same fixed input.                                                                                                                                                                                     | Two distinct valid records, zero duplicates/invalid rows; population count/window and source occurrence/snapshot times unknown; active effort unmeasured. Two rows are not a denominator for all invoice disputes.                                                   |

**Proposed brief:** “Orchid / North — prepare an evidence-backed disposition for the
reported $15,000 dispute. The supplied note says delivery confirmation is not supplied.
Obtain or identify delivery proof before recommending a disposition. South's $2,500
record is a different entity-qualified dispute despite the same invoice label.”
The objective and next step are proposals for review, not a policy assertion.

Initial supported finding F1: **Keep North and South distinct** (E1/E2). Initial finding
F2: **The supplied note reports a delivery-evidence gap** (E3); the product does not
claim delivery failed. F3: **Historical route, elapsed time and effort are not established**
(E1/E2/E4). Display the normal route as **Not yet evidenced**, not as a generated happy path.
The proposed route is: confirm entity/Case → gather delivery and governing terms →
reconcile → obtain the separately required disposition decision → independently inspect
the agreed outcome. The documented and observed routes remain separate and incomplete.

**Synthetic review example, proposed test inputs only:** after explicit north intake
commit, Case C=1 and Discovery revision=0. The server-selected `identity_intake_operator`
answers Q1 below: “The note does not prove failed delivery; ask the warehouse evidence
owner for DEL-4 confirmation. Taylor's process ownership is still unconfirmed.”
Save as revision 1, `operator-reported`, with a reason and E1/E3 references. Correcting
an injected draft “DEL-4 was not delivered” retains that old claim and the correction;
it cannot overwrite E3. Reload the brief, then explicitly confirm its description at
revision 2, including unresolved fields. Label **Reviewed for Discovery — delivery proof
still needed**. Case remains C=1, unresolved, with canonical owner still null in a
newly created intake Case. This is neither a real interview nor a recorded review today.

### Compact proposed layout

Desktop uses the existing summary/control columns; mobile puts the next action before
expanded records. These wireframes are design proposals, not browser screenshots or
visual-test evidence. Technical bindings remain expandable.

```text
Orchid / North — $15,000 reported dispute
Objective: prepare an evidence-backed disposition [Proposed]
Delivery confirmation not supplied in the note [E3].
South's INV-101 is a separate $2,500 dispute [E1,E2].

Supported findings                     Next: clarify delivery evidence
Entity distinction [E1,E2]              Q1: Who can supply DEL-4 proof?
Delivery gap reported [E3]              [Answer / Unknown / Disputed]
Route and effort unknown [E4]           [Save answers]
Owner: Taylor reported;                 [Correct a finding]
accountability unconfirmed              [Review proposed improvement]

[Sources & conflicting claims] [R1–R7 and six outputs]
[Recorded descriptive reviews] [Technical bindings]
Synthetic review. No action or closure authority.
```

```text
390px proposed order
Orchid / North
$15,000 reported dispute
Prepare an evidenced disposition [Proposed]
Delivery proof is missing from this note.
South record is separate. [Sources]
Owner: unconfirmed (Taylor reported)
Next: identify DEL-4 evidence owner
[Answer Q1] [Unknown / Disputed]
[Save answers] [Correct finding]
[Review proposed improvement]
[Findings, sources & history ▸]
```

After confirmed save, GET the current brief and show only verified server history.
Keep a confirmed receipt if refresh fails; show current applicability as unconfirmed.
After stale conflict require refresh, inspect differences and explicit resubmission.
Uncertain submission offers only **Recover original submission**, with original bytes/key.
Focus moves to the saved-result or error heading; labels, source disclosures and controls
must work by keyboard. Never switch synthetic identity automatically or claim authentication.

## Seven records, consequential questions and needed evidence

This maps the example to R1–R7 in the existing specification, not to completed capabilities.
Owner names below are proposed accountable roles to confirm. Reported Taylor/Alex/Sam
remain source text, separate from canonical actors and business authorization.

| Record                       | Initial account and gap-driven question                                                                                                                                                                                                                                                                                      | Additional evidence / accountable role                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 boundary and normal route | Objective above is proposed; only queue snapshots observed. **Q2:** “For North AR-77, what starts this assignment, what ends it, and can you supply one normal completed Case with its actual steps and controls?” Keep documented, observed and proposed routes in separate lanes, with version, scope and effective dates. | Dated SOP/operating instruction and a separately attributed normal-Case activity record with event semantics, plus operator confirmation. Queue/process owner; Taylor is only a reported lead.                                                                                                                                                                                          |
| R2 exceptions and exposure   | Delivery dispute is reported, not a classified population-wide exception. **Q3:** “Is this the full eligible queue for a defined window? Show a typical exception and a costly failure, including still-open work.” No exception rate or loss amount can be computed from E4.                                                | Cohort inclusion/exclusion rules, full export manifest, duplicate/reopen rules, normal route, exception labels with owners, failed/human-only/open Cases, direct loss/penalty evidence and assumptions. Queue owner + measurement/finance owner.                                                                                                                                        |
| R3 dependencies              | E1 links PO-9/DEL-4 as claims; E3 identifies missing supplied confirmation. **Q1:** “Which owner/source can provide delivery proof, by what agreed date, and what cannot proceed without it?” **Q4:** “What work occurs off-system, and who receives the disposition downstream?” No inferred causal waiting duration.       | Delivery observation/document, order/invoice records, handoff acknowledgment, readiness/deadline semantics, governing terms and downstream commitment/acceptance evidence. Warehouse evidence owner + AR operator + downstream owner, all unconfirmed. Preserve many-to-many links.                                                                                                     |
| R4 field precedence          | No approved field-precedence rule exists. **Q5:** “For delivery status, disputed amount and settlement terms in North, which source governs which field, during what period, and who approves that rule?”                                                                                                                    | Proposed field rows: delivery status → delivery source, disputed amount → scoped queue/invoice reconciliation, settlement terms → governing contract. Each needs entity/scope, competing values and source times, freshness, policy reference, effective period and named approver. These are candidates, not installed ranks. Data/policy owners must resolve consequential conflicts. |
| R5 variants                  | E1/E2 prove entity-qualified labels differ, not that policy differs. **Q6:** “Do North and South use different controls? Which region, subsidiary or acquisition lineage applies, and since when?”                                                                                                                           | Entity mapping and applicable dated local policies with overlap/precedence and reviewer. Region, subsidiary, acquisition and policy applicability are unknown; invoice label and newer policy date cannot select a winner. Entity policy owners.                                                                                                                                        |
| R6 time/effort/handoffs      | E4 has no business start, end or effort. **Q7:** “What does each source timestamp mean; who actively worked, waited or handed off, and what was reopened?” No ingestion-to-review interval becomes labor time.                                                                                                               | Dated activity/handoff observations, timezone/calendar, reopen semantics; separately recorded or explicitly estimated person-effort intervals with method, owner, coverage and overlapping work. Operator + source/measurement owner. Event logs outside D9's profile are not silently accepted as queue CSV.                                                                           |
| R7 readiness/support         | No task-specific demonstration or support preference is retained. **Q8:** “Using these citations, can you distinguish missing proof from non-delivery, review the entity link, and describe what you would delegate, review or retain? What help is needed?”                                                                 | Voluntary task-specific self-assessment and a demonstrated review/correction, preferred assistance, support/training owner and follow-up. Distinguish skill, accountability and legal authority. No employee score, company-wide interview quota or inferred readiness. No audio recording in D10-B.                                                                                    |

Order the initial agenda Q1 → Q2/Q5 → Q3/Q7 → Q6/Q8/Q4 by its consequence for this
packet, not a fixed questionnaire completion quota. Answers may remain unknown or
disputed. A requested due date is a proposal until agreed; an owner label is not an assignment.
Persist only explicitly submitted notes/corrections, never background recording.

Every finding carries four independent dimensions: process view
`documented | observed | proposed`; evidence type `observed | operator-reported | inferred`;
claim state `supported | unknown | disputed`; review state `draft | confirmed` for a
stated descriptive purpose. Observing a CSV cell means the source reports that value,
not that the business fact is verified. Human answers/corrections are operator-reported;
confirmation cannot upgrade them to observed fact. “Approved for a stated purpose”
remains a separate future approval concept, not an executable D10-B status.

Keep claim, evidence/excerpt and locator, affected Case/step/field, entity/scope,
coverage, confidence rationale, recorded actor/time, questions and correction lineage.
For a later conflicting source, display both values/times and keep the field disputed.
An operator may confirm the description of that disagreement without resolving it.
Unresolved consequential rules block a proposed handoff to execution; Discovery itself
can continue. D11 must review actual policy/precedence changes separately.

## Six loop outputs on the same brief

| Output                 | Populated proposed value and remaining qualification                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger                | An entity-qualified reported invoice dispute arrives for review. Actual source occurrence/start semantics require Q2/Q7; intake commit time is not dispute start.                                                                                                                           |
| Objective              | Prepare and coordinate an evidence-backed disposition for North AR-77. Business owner and acceptance criterion require confirmation.                                                                                                                                                        |
| Population             | Recurring eligible invoice disputes in the agreed entity/window. This upload contains two distinct records in two entities; denominator/window and comparability remain unknown. No Loop registry or 25-Case denominator is invented.                                                       |
| Close Event            | Candidate: an agreed disposition accepted by the accountable owner/customer and independently evidenced in its governing source. Whether settlement or matched cash is the actual objective is unresolved. A credit row, Discovery confirmation and Case closure are distinct achievements. |
| Human Intervention Map | MISSING_EVIDENCE: DEL-4 proof (E3), owner unconfirmed. MISSING_KNOWLEDGE: proposed gap in applicable source/terms rules, subject to Q5. AUTHORITY: no intake financial enrollment; Discovery cannot nominate an authorized approver. Other reasons remain unconfirmed unless evidenced.     |
| Correction Path        | Append operator correction with original claim, reason, source and actor; retain disagreements. Candidate for later reviewed evaluation, not automatic learning or promotion. D11/D12 define that handoff; D16 supplies broader tooling.                                                    |

## Redesign before choosing who performs work

First test the design with the owner. No current route has been observed, so all changes
below are **hypotheses**, not claims that an existing step is wasteful or removed.

| Proposed change                                                             | Retained work, mechanism and reason                                                                                                                                                                                                                               | Owner, control, feasibility and measurement                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove duplicate copying of the same source values into another summary.    | Deterministic code reuses parsed cells, citations and exact entity keys. It can still be wrong if source data or mapping is wrong; discrepancy review remains.                                                                                                    | AR operator reviews mapped fields. Feasible with current bytes/versions; compare attributable preparation/rework effort, not keyboard or tab-open time.                                                           |
| Combine repeated evidence requests into one missing-evidence agenda.        | Code lists structural gaps; a person verifies consequential questions and accountable recipients. Optional later bounded model may draft a concise comparison of selected text, with citations, schema, abstention and human review. D10-B uses zero model calls. | Process owner retains judgment; no automatic email/task assignment. Assess completeness and missed questions, support effort and error consequences before adopting.                                              |
| Gather delivery proof and governing terms in parallel when independent.     | People obtain permitted evidence in D10-B. An adaptive agent is **not needed** for a fixed retained bundle. Only a later task with justified iterative search might warrant one, under D11/D12 reviewed read/propose tools, budgets and stopping conditions.      | Warehouse/data owners must confirm dependencies and access. Preserve source checks and disposition authorization; assess union of critical waits, not sum of overlapping waits. Evidence availability is unknown. |
| Simplify review to the consequential differences, preserving full evidence. | Code prepares the comparison; a person corrects meaning, resolves scope questions and separately exercises any authorized business judgment. Keep approval and independent proof outside preparation.                                                             | Proposed process/policy owner, not imported Taylor as authority. Review effort and false/missed findings are measured alongside delay; a shorter screen is not proof of lower total effort.                       |

Investigate missing delivery evidence first because it may block a material disposition
and has a concrete evidence-owner path; that priority is a hypothesis, not a measured
bottleneck. Confirm whether governing terms or an approval wait is actually critical.
Do not prioritize faster amount formatting over the missing proof. Rank only after
cohort/owner confirmation: reducible critical-path delay, affected volume, business or
commitment impact, error exposure, access, owner readiness, implementation effort and
review/verification cost. Keep unknowns unscored; invoice principal and proposed credits
are neither savings nor evidence of exposure realized.

Before intervention, agree the cohort, dates/event semantics, variants, process owner,
normal-route definition, baseline collection and comparison method. Retain failed,
human-only and unresolved Cases and open age; an exception-selected sample has no
overall exception rate. Unique exception share uses all eligible Cases, with overlapping
type counts disclosed. Active effort needs person/method/coverage: deduplicate overlapping
intervals for one person, allow concurrent people to contribute person-minutes, and use
interval unions for elapsed decomposition. Overlapping waits cannot be added as saved time.
Source/ingestion/recording differences are not active effort. No start/end means elapsed
unavailable, not zero. Reopen rules and business versus calendar time must be stated.

Include human preparation/review/correction/verification, support/founder help,
model/tool/compute and attributable setup/delivery costs, with rates/allocation and
coverage. D10-B's zero model calls do not imply zero operating cost. Separate packet
acceptance from independently verified business outcomes; zero such outcomes makes cost
or attention per outcome unavailable. Use fresh comparable cohorts and quality checks
before claiming improvement; disclose simultaneous staffing/process changes. D10-B
records descriptions, not measured economics or baseline telemetry.

## Reuse and exact implementation gaps

| Existing surface                                                                                                                                                                                             | Reuse and limit for D10                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Intake contracts](../../packages/contracts/schemas/intake.v1.schema.json), [OpenAPI](../../packages/contracts/openapi/intake.v1.openapi.json)                                                               | Bundle records/cells/locators, artifact hashes/interpretation, versions and coverage; view candidates, targets, prior bindings and commit receipts. No field is silently added to strict intake or v0 contracts.                                                                   |
| [Intake mapper](../../packages/runtime/src/intake.ts)                                                                                                                                                        | `prepareIntake`, `readIntakeView`, `buildIntakeMaterial`, `previewIntake`, `adaptIntakeCommand`. Reuse structured facts and gaps; these functions do not infer historical paths, read PDF text, measure effort or establish source precedence.                                     |
| [PostgreSQL intake store](../../packages/runtime/src/postgres-intake-store.ts), [integrity/export](../../packages/runtime/src/intake-integrity.ts)                                                           | Existing byte custody, original/no-op key bindings, read-only snapshot transaction and reconstruction. Immutable source references can be reused without copying bytes into another store.                                                                                         |
| [Case engine](../../packages/runtime/src/case-engine.ts), [Case schema](../../packages/contracts/schemas/case.v0.schema.json), [journal](../../packages/contracts/schemas/case-journal-entry.v0.schema.json) | Exact Case C/head and intake receipt anchors. `intake.material_reviewed` is an operator review event. Current Case status/owner is canonical; imported owner/status is reported. No new Case aggregate, historical backfill or mutation of unused Case evidence/correction arrays. |
| [Worker boundary](../../apps/worker/src/intake-service.ts), [API handler](../../apps/api/src/handler.ts)                                                                                                     | Existing in-process request validation, trusted synthetic context and sanitized errors. This plumbing is not an autonomous worker or interview service.                                                                                                                            |
| [Intake Workbench](../../apps/admin/public/intake-workbench.js), [client](../../apps/admin/public/intake-client.js), [History projection](../../apps/admin/public/authority-client.js)                       | Reuse layout/disclosures and validated server reads; preserve historical versus current applicability and mixed-read denial. Reuse IndexedDB atomic claim/conditional clear, with explicit dispatch for known command types. Do not store review truth in browser storage.         |
| [Intake tests](../../scripts/intake-postgres.test.mjs), [browser tests](../../scripts/intake-browser.test.mjs), [D8 readiness note](../guides/d8-failure-walkthrough.md#measurement-readiness)               | Extend existing disposable test hosts and fixtures outside frozen ECC. Keep A1–A12, successful-key/no-op metadata, upgrade/export and two-tab coverage; reuse measurement definitions, not invented measurements.                                                                  |

Additional supporting evidence can be deliberately retained as bounded TXT/Markdown
through the existing intake API, preserving who is claimed to have said what, scope,
date/meaning and disagreements. It remains plain reported text. For PDF/PNG/JPEG,
only artifact-level references are available: any human transcription must be a
separately retained operator-reported source linked to the original, never parser/OCR
output. DOCX, spreadsheets, email containers and event-log profiles remain unsupported;
no new parser or provider is implied. A later event profile needs its own explicit
contract before observational route/timing calculations can be automated.

Free-form intake notes alone are a simpler interim alternative: retain and inspect them
through D9 today. They cannot provide trusted structured confirmation/reviewer status,
exact finding correction lineage or stale descriptive-review checks. Recommended D10-B
adds only that missing review boundary. Do not encode trusted confirmations in uploaded
text, reuse D6 approvals, or mutate intake receipts to simulate the feature.

## Proposed contracts, binding and persistence

All names and payloads in this section are design examples, **not callable APIs**.
After PR #31 merges normally, add strict versioned Discovery contracts; preserve intake v1,
export v1/v2 and all v0 contracts. Use bounded deterministic templates/structural
findings plus exact text excerpts for this profile. Do not synthesize a semantic claim
from arbitrary prose or opaque files. Version templates, extraction rules and projection;
future model output is an untrusted cited proposal outside D10-B.

Proposed minimal surface through the existing intake runtime/API boundary:

- `GET /v1/intake/bundles/{id}/discovery?case_id={id}` returns `discovery-brief.v1`:
  exact input manifest, primary Case/record, findings/questions, R1–R7, six outputs,
  proposed improvement, immutable review history, current applicability and gaps.
  Case selection is optional for inspection, required for a write. A separate known
  `representation=export` value returns the export envelope described below.
- `POST /v1/intake/bundles/{id}/discovery-reviews` accepts a strict command union:
  `annotate` (bounded answers/corrections with reasons/citations) or `confirm`
  (no simultaneous edits; exact description for `discovery_description` or
  `improvement_discussion`). No `approve`, arbitrary actor, source rank, policy,
  Case state, authority result or implementation-version input is accepted.

`material_hash` binds a canonical `material` object: source manifest, findings, questions,
R1–R7, six outputs, proposed improvement and applicable annotation lineage. Exclude the
response envelope's history list, current-applicability calculation, read time, its own
hash, future record time/IDs and confirmation receipts. These exclusions avoid circular
or time-varying consent. The command separately checks exact Discovery revision and prior
entry hash. A confirmation may advance that revision without changing its reviewed
content hash; later edits change the content and cannot inherit confirmation.
This avoids a self-staling confirmation while preserving exact optimistic concurrency.

The server manifest includes the selected original bundle/hash and record key/revision,
original artifact/excerpt locators, exact primary Case C/journal head and intake receipt
anchor, template/parser/projection versions, and a canonical sorted set of all retained
business bundle/commit hashes in the trusted synthetic intake namespace. This deliberately
conservative set catches new preparations even before Case attachment. It excludes
no-op command bookkeeping: a fresh successful no-op key does not change business inputs.
No new catalog or global business revision is necessary. New unrelated business intake
may conservatively require fresh review; selective dependency invalidation is deferred.

Example confirmation after saving an answer at revision 1 (symbolic hashes refer to
the immediately preceding validated read; they are not literal accepted hash values):

```json
{
  "schema_version": "discovery-review-command.v1",
  "operation": "confirm",
  "case_id": "CASE_FROM_INTAKE_RECEIPT",
  "expected_case_version": 1,
  "expected_intake_receipt_hash": "H(original_intake_receipt)",
  "expected_discovery_revision": 1,
  "expected_previous_entry_hash": "H(answer_entry)",
  "expected_material_hash": "H(current_brief_material)",
  "purpose": "discovery_description",
  "reason": "The description preserves missing delivery proof and unconfirmed ownership.",
  "idempotency_key": "discovery-north-confirm-1"
}
```

`annotate` binds the same inputs and explicitly names existing question/finding IDs,
answer state (`answered | unknown | disputed`), text, proposed correction and selected
citations. Enforce field/type/length limits before hashing: at most 32 changed items,
2,000 characters per answer/reason, 16 valid citations per item and 128 KiB per command.
The server validates selectors against retained bytes and full artifact scopes and
derives evidence type; caller assertions cannot promote a claim to observed/authoritative.
Saving annotations retains their resulting material as draft. Confirm only after a
read-only refresh displays that exact result; never silently confirm an unseen rewrite.

Use one append-only `discovery_review_journal` supporting table in the existing
PostgreSQL database, keyed to an existing Case. Retain tenant/Case, sequence, entry
ID/hash, predecessor hash, operation/key/fingerprint, server actor/time, input manifest,
submitted changes, exact resulting/reviewed material, result and implementation versions.
Canonical JSONB plus only required FK/unique/index/hash columns; no separate mutable
session, workflow registry, packet table or blob store. One additive checksum-bound
migration after 0006; never edit 0001–0006. An empty new history leaves old exports,
Case/intake/review/action evidence and original-key guarantees intact.

Under the existing writer transaction/lock: validate trusted synthetic actor and full
scope; resolve an original exact-key retry; load/replay source and history; compare all
bindings, current Case and manifest; check clock; append the entry/result and writer
metadata atomically; verify read-back before commit. Use scoped operation/key uniqueness
and per-Case sequence/predecessor constraints; immutable triggers reject mutation.
No partial annotation batch. Failed commit rolls back the key, result and metadata;
failed rollback discards the connection. Retain checked UTC time, source-time meanings
and applicable Case/intake/Discovery clock floor. Equal timestamps do not order separate
journals; use each chain's sequence and exact referenced anchors.

Exact retry returns the recorded outcome/reference without new writes, even when later
inputs are stale; it is historical evidence only. Changed body under a bound key returns
`IDEMPOTENCY_CONFLICT`. A fresh key with no annotation change or an already-confirmed
same material/purpose returns a **non-success** `NO_CHANGE` / `ALREADY_REVIEWED`, without
claiming a successful unbound key. If future design adds successful no-ops, it must retain
their bindings; it cannot repeat PR #30's defect. D-034 prepare/commit behavior is unchanged.

Reads use one consistent read-only database snapshot: no writer lock, persisted preview,
ID reservation, revision increment or clock update. Discovery entries advance only their
review sequence/writer metadata, never C/R/S. Business evidence corrections still use
explicit D9 same-Case intake attachment, advancing C; descriptive notes do not rewrite
business evidence. D10-B supports only intake Cases, with no D-033 enrollment or financial
permission. No authority evaluator consumes Discovery confirmations or proposed rules.

Current applicability requires the exact material/manifest and Case bindings to remain
valid. Any Case-version change, including D-014 rejection, new business intake, new
annotation content or template version makes the older description historical. Retain
old answers and confirmations visibly; do not transfer them automatically. If the source/
Case/template manifest changes, rebuild the current draft from its source-derived material;
old annotations remain historical. Carrying an answer forward requires an explicit new
annotation against the refreshed binding, then a separate confirmation. New evidence
requires explicit selection, refresh and fresh consent. Integrity failure/mixed projections
produce incomplete information, not an apparently reconciled brief. A read is never proof
that someone inspected a screen; the entry records what they submitted/confirmed.

Portable `discovery-export.v1` contains an unmodified nested `intake-export.v2`, required
Discovery entries/material/versions and an envelope hash, generated in the same read-only
snapshot. Do not add fields to existing exports or copy bytes into another durable store.
The conformance reader checks original bytes → intake → Case anchors → versioned brief →
annotations/confirmation/result and key bindings in a fresh disposable instance. Missing
inputs/unknown versions/tampering fail; no live restore endpoint. Historical intake v1/v2
alone cannot attest to Discovery reviews. Preserve full artifact scope, dataset-lifetime
retention and complete disposal limits; no external anchor defeats a full privileged rewrite.

Browser storage holds navigation and exact pending commands only. Reuse the atomic
IndexedDB slot for intake/Discovery, with explicit dispatch for those known command
types, compare-before-clear and no send after failed claim. Reopening another view must
offer recovery of the original operation, not submit it to the wrong endpoint. No automatic
retry, replacement key, silent rebase, authoritative local draft or multi-command inbox.

## Smallest D10-B implementation and acceptance

After PR #31 merges normally, one focused D10-B PR will implement the fixed-profile
deterministic brief, short gap agenda and typed descriptive review above in the existing
Workbench/API. An operator can inspect cited findings, save unknown/disputed answers,
correct a claim, explicitly confirm the description or improvement discussion, and reopen
that history after restart. They cannot establish an observed normal route from a snapshot,
publish source rules, allocate live workers, authorize a credit or close a Case.

Proposed files: strict `packages/contracts/schemas/discovery-*.v1.schema.json` and
OpenAPI/validators; a bounded `packages/runtime/src/discovery.ts` projection and supporting
store; the next migration and API bootstrap/handler/intake worker; existing intake client
and Workbench modules. Reuse `intake-integrity.ts`, canonical hashing, transaction helpers,
disposable PostgreSQL host and browser fixture. No dependency, provider or new framework.
Keep annotation correction local to Discovery; generic Case correction/evaluation promotion
remains D11/D12/D16, not an implementation shortcut here.

| Test                                 | Required actual runtime/API/PostgreSQL and browser evidence in D10-B                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 Supported brief / R1–R3           | Prepare existing sample; read without writes; E1–E4 agree with bytes/locators. Two entities remain distinct; normal/documented route and denominator remain unknown. Both uncommitted rows stay in coverage. Identical source bindings under internal collection reordering reproduce the same material; changed original bytes retain different provenance. No model calls. A second supported synthetic input changes customer identifiers, amounts and evidence conditions; findings and counts derive from inputs, never Orchid constants. |
| T2 Evidence limits / R1/R6           | Snapshot and review timestamps cannot create historical transitions, elapsed work or effort. Retained-only PDF/image never yields parsed text; invalid excerpt/foreign artifact and unsupported event profile fail. Additional operator transcript is labelled reported. A source reporting delivery confirmation remains a source claim, never an independently verified fact.                                                                                                                                                                |
| T3 Questions/readiness / R2/R3/R7    | Missing delivery, owner, population, time and precedence generate the relevant agenda; answered/unknown/disputed remain distinct. Demonstrated task correction differs from self-assessment and authority. No hidden score or unchosen recording. Changing the supplied delivery material changes the agenda; ambiguous prose produces a cited excerpt and review question, not a fixed delivery-gap conclusion.                                                                                                                               |
| T4 Source/variant conflicts / R4/R5  | Add a conflicting retained source and an ambiguous variant. Show both values/times/scopes; newer data and operator confirmation do not install precedence or authorize a decision. Keep Discovery available with the blocker.                                                                                                                                                                                                                                                                                                                  |
| T5 Correction and confirmation / L4  | C=1, revision 0 → answer/correction revision 1 → GET → confirm revision 2; C/R/S and intake business history unchanged. Before/after/reason/actor/citations survive restart. A confirmed disputed description remains disputed; corrected source material needs explicit D9 attachment.                                                                                                                                                                                                                                                        |
| T6 Stale review / P2/P3              | Change Case C (also D-014), prepare new relevant business material, append another answer or change template between read/write: reject stale bindings without writes. Historical receipt remains, current confirmation is false; refresh and explicit resubmission required. Fresh no-op intake key metadata alone does not stale the manifest.                                                                                                                                                                                               |
| T7 Concurrency and retry / I1        | Same original key/body races return one entry/result; changed body conflicts; competing revisions give one success. Lost response → restart → exact retry has no second entry/write. Fresh-key no-change is a non-success. Inject insert/read-back/commit failure and clock regression; no half-result or reserved successful key without its result.                                                                                                                                                                                          |
| T8 Read integrity and export / I1/P6 | Repeated open/expand/GET/export leave every durable table and clock unchanged. Altered hashes, citations, Case anchors, actor/result or coherent subsets fail replay/readiness/read. Fresh installation and upgrade preserve 0001–0006; full export/reconstruction restores exact history/keys, legacy intake-only export claims no Discovery review.                                                                                                                                                                                          |
| T9 Browser recovery / P3             | Two tabs compete across intake and Discovery; loser sends nothing; late completion cannot clear a newer command. Reload recovers exact bytes/key. Confirmed save with failed refresh keeps receipt but unconfirmed current applicability; mixed reads cannot show reviewed-current. Keyboard/390px keep objective, uncertainty and next control readable.                                                                                                                                                                                      |
| T10 Redesign/measurement / P1/P5/R6  | Proposed changes precede mechanism allocation. Missing full cohort/effort/cost and unresolved Cases block numerical improvement claims. Overlapping waits are not summed, absent effort is not zero, and $15,000/$2,500 are reported dispute values, not savings.                                                                                                                                                                                                                                                                              |
| T11 Authority/closure / P2/L3/B1     | Inject actor, rank, policy, success flag and document instructions; none becomes trusted context. Confirmation/proposed precedence cannot change authority, enrollment, Case ownership/state, commitments, outcomes or closure. Retain repaired resolver, D6–D8 and frozen ECC/negative-control regressions.                                                                                                                                                                                                                                   |
| T12 Full handoff / L1                | All seven records and six outputs are present with supported/unknown/disputed status; review history reconstructs but no “Discovery complete”, approved pack or business-outcome label appears merely because a form was saved.                                                                                                                                                                                                                                                                                                                |

**T1–T3 input-variation control (required by the approval instruction):** reuse the
supported intake profile with a second synthetic customer, different entity-qualified
identifiers and amounts. Exercise no supplied delivery support, a note reporting delivery
confirmation, contradictory notes, and prose whose meaning cannot be established
deterministically. Show the corresponding sources/questions, deriving actual counts
and values from retained input. Preserve four distinct meanings: missing supplied evidence;
a source reporting an event/outcome; conflicting source claims; independently verified
fact. This Discovery slice creates none of the fourth kind. No hard-coded Orchid
conclusion, fixed demonstration count or success label may make the tests pass.

Run repository validation, all retained intake A1–A12/retry/upgrade/browser checks,
D6–D8 PostgreSQL/API and Workbench regressions, ECC/negative control, Compose and appliance
restart CI on that implementation head. Inspect the actual desktop/390px experience then.
D10-A's documentation/source checks are not substitutes for any of T1–T12.

Remaining after this slice: evidenced normal/exception/failure routes on a representative
cohort, approved source/variant rules, reliable event/effort/cost collection, actual
operator usefulness and support, customer acceptance and business outcomes. D11 publishes
one reviewed Runtime Pack and approves applicable rules/contracts; D12 integrates one
useful bounded worker and minimum approved proof. D13 measures customer comparison;
no economics dashboard or process-mining platform is added now.

## Compatibility and unresolved questions

D-003/D-020/D-021 supply PostgreSQL, immutable lineage and the existing writer boundary.
D-027/D-028 keep the Case canonical and preserve upstream identities. D-029/D-031 keep
reported practice and derived material below authority. D-014/D-032 exact Case changes
still stale authority requests; this design neither changes their revisions nor consumes
Discovery confirmation as permission. D-013/D-017/D-033 keep action/closure guards.
D-034's no-op keys, full artifact scope, parser limits and dataset disposal remain intact.

The canonical roadmap reserves general intervention/correction promotion for D11/D12.
The accepted clarification is **descriptive Discovery annotations in D10-B only**,
not runtime Case corrections, policy approval or learning capture. The owner approved
that narrow addition and its one supporting history above. The original smaller
alternative remains documented: read-only brief plus plain intake notes, explicitly
lacking typed confirmation/correction status. It is not a substitute for the now-authorized
D10-B review implementation.

Unresolved business questions are the Q1–Q8 agenda, not blockers to synthetic design.
Architecture approval covers this descriptive-review scope, conservative input
invalidation and portable history. Real evaluation still needs D-034's named
customer/custodian/files/people/location/access/classification/retention/export/deletion
approval. The published prerelease remains historical; Apache-2.0, existing release
instructions and deployment restrictions are unchanged.
