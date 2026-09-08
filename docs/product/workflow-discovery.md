# Workflow Discovery and the narrow MVP

Status: **required product direction; future contracts and builds proposed**.
This is the canonical specification for Discovery, Business Loop requirements and
the reconciled MVP. The [single requirement/gaps matrix](requirements-implementation-matrix.md)
records implementation evidence and open questions. [PLAN](../../PLAN.md) owns the
delivery sequence. No planning statement changes the frozen [constitution](../../PRODUCT_SPEC.md),
accepted authority decisions or current synthetic data boundary.

## Source and precedence

Consolidated on 2026-09-07 from the user's ten-point Workflow Discovery instruction
(recovered from “Presentation feedback”), revised Discovery specification,
Business Loops Product/Engineering Handoff and September 7 reconciled roadmap.
The ten-point instruction replaces the two earlier Discovery addenda; the roadmap
resolves timing conflicts while retaining their requirements. This Markdown is
the maintained product specification, rather than a second proposed runtime.

Source document fingerprints, for identifying the reviewed versions:

- `Field_Runtime_Workflow_Discovery_Product_Spec-2.docx`:
  `sha256:637a171576aba61b052d6efa29cc5efbede786b707880c278e44d5c82b510dc4`.
- `Field_Runtime_Business_Loops_Product_Engineering_Handoff_2026-09-06(2).docx`:
  `sha256:68a8249c145ae1a9e6a0cb8729700e2913df84875b09ca23ad73e758b0646d93`.
- `Field_Runtime_MVP_Roadmap_and_Codex_Handoff_2026-09-07.docx`:
  `sha256:25b9ca769680eb9b03302f569934536729c57cdb051175c5d789602b125580c3`.

The local Business Loops file without `(2)` and the revised Discovery download
were checked against the attachments: their document text agrees. Article-derived
strategy is product rationale, not Field Runtime performance or PMF evidence.
Reported third-party gains and the 30/26/4 illustration are not product results.

## Product objective and boundary

Make one recurring revenue-critical assignment useful enough that an operator
brings another batch. Discovery explains current work; Builder approves its
redesign; the runtime performs bounded work; Operational Observability compares
actual behavior and outcomes with the reviewed contract. A faster agent inside an
unchanged process is insufficient evidence of success.

The candidate first customer assignment is **prepare and coordinate evidence-backed
dispositions for commercial invoice disputes**, inside order-to-cash/Revenue ECC:
reconstruct the Case, reconcile records, explain options and blockers, obtain the
required decision, and follow the result to agreed evidence. Confirm one queue,
buyer, accountable process owner, operator and close event with a design partner
before freezing its operating contract. This is a planning candidate, not a second
active pack or permission to feed real data into the current appliance. See
[D-034 — accepted synthetic scope](../architecture/d9-assisted-intake-boundary.md).

Case remains the atomic unit of accountable business state. A Business Loop
describes recurring Cases sharing a trigger, objective, population, operating
contract and verified close event. A reviewed Case Family label may identify known
work; it does not confer policy or permission. No Loop registry, parallel Case
model, loop orchestrator, second authority engine or generic agent harness is
required. Preserve coherent upstream Cases and their systems of record; form
candidates only when the upstream work is fragmented (D-027–D-031).

## Operator journey

1. Select one queue, boundary and time window. Start with a supported full queue
   export and supporting case documents, emails, SOPs and policies. Show unsupported
   formats, missing fields and population coverage before a process map. Existing
   customer agents are not required; connectors come later.
2. Propose Case matches, timelines, routes, handoffs, exceptions and variants.
   Every finding opens its sources. Preserve many-to-many invoice/order/delivery
   relationships and uncertain links; do not flatten them into a false linear Case.
   Reviewed split/merge/correction needs append-only lineage before implementation.
3. Generate a short interview agenda from actual gaps. Begin with the Case owner,
   experienced operator, approver and relevant upstream/downstream owners; expand
   for variants or disagreement, without a fixed company-wide interview quota.
4. Show documented, observed and proposed routes separately. Review the baseline,
   bottleneck and redesigned work before allocating execution.
5. An appropriately authorized owner reviews workflow, source and policy changes
   in Builder. Publish a versioned Organization Runtime Pack with evidence needs,
   authority, step/worker contracts, outcome proof, evaluations and approval history.
   Draft findings never silently become executable policy.
6. Show work actually completed, what can proceed, what needs attention, its owner
   and the next action. Queue admission, an approval click and an attempted action
   do not by themselves establish progress, completion or reduced human attention.

### Seven maintained Discovery records

| ID  | Record and required content                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Happy path and workflow boundary:** workflow ID/version, trigger, eligible population, owner, scope/effective dates, steps, controls, outcome and required proof. Preserve documented, observed and proposed routes, including a normal Case and variants.                                                                       |
| R2  | **Exceptions and error exposure:** types, unique eligible population denominator, routes, owners, delays, rework, direct loss/penalty or other exposure and assumptions. Include human-only, failed and unresolved Cases; disclose overlapping exception types.                                                                    |
| R3  | **Upstream/downstream dependencies:** prerequisites, linked business objects, off-system work, owners, readiness signals, deadlines, downstream commitments, critical waits and failure propagation. Separate observed blocking from confirmed or unknown causes.                                                                  |
| R4  | **Field-level systems of record:** fact/field, entity, source precedence, freshness, conflict rule, policy reference, scope, effective period and approver. Preserve both values and timestamps; newer never automatically wins. Unresolved consequential conflicts block affected decisions/actions while Discovery can continue. |
| R5  | **Local variants:** region, legal entity, subsidiary and acquisition lineage, applicable workflow/policy differences, precedence, effective periods and reviewer. Ambiguous applicability cannot expand authority; show the ambiguity.                                                                                             |
| R6  | **Time, effort and handoffs:** Case/step and exception start/end semantics, source/ingestion/recording times, timezone, active effort, waiting, handoff owners and causes, coverage, concurrent work and reopen rules. Apply the measurement definitions below.                                                                    |
| R7  | **Task-specific operator readiness and support:** self-assessment, demonstrated task review, preferred assistance, corrections, training/support and ownership. Technical skill, business ownership and organizational/legal authority are separate. No hidden employee ability score.                                             |

Interview prompts must connect to actual Cases: a recent normal Case, typical
exception and costly failure; work done off-system; what a timestamp means; which
source was trusted and why; who acted versus who could authorize; removable or
parallel steps and the control that must survive; what the person would delegate,
review or retain and what support is needed. Save notes and asynchronous
corrections with source, scope and disagreements. Recording is optional and
explicitly chosen. Operators can inspect and correct their representation.

Evidence type (**observed, operator-reported, inferred**) and review state
(**draft, confirmed, approved for a stated purpose**) are independent. Confirming
historical practice does not approve future policy. Findings retain claim, source
references, affected Cases/steps, scope, coverage, confidence rationale, reviewer,
open questions and correction history. Customer knowledge, authority mappings and
improvements remain customer-scoped and exportable with provenance, versions and
access controls; reusable templates do not carry private knowledge across customers.

### Six loop-readiness outputs

D10 adds these to the same reviewed workflow, without replacing R1–R7:

- **Trigger:** what begins this recurring work and defines intake eligibility.
- **Objective:** the business result owed by the workflow.
- **Population:** comparable recurring Cases, boundary, window and denominator.
- **Close Event:** authoritative independent evidence that this particular job ended.
- **Human Intervention Map:** where and why people were needed, with evidence.
- **Correction Path:** what contributions must be retained for reviewed evaluation.

## Redesign before allocation

First remove, combine, parallelize or simplify steps while preserving required
controls; retain the steps that remain necessary. Then choose the simplest adequate
execution mechanism: deterministic code for explicit rules; bounded model assistance
for contained ambiguity; an agent loop only for necessary adaptive steps; a person
for required judgment. Deterministic code can consume wrong data or contain bugs.

For each choice record its reason, accountable owner, dependencies, expected
measurable change, implementation effort, verification/review effort, error
consequence and preserved control, or the control change needing approval.
Rank reducible critical-path delay by business/commitment impact, affected volume,
error exposure, evidence access, owner readiness and feasibility. Handoff count
alone is insufficient. A faster comparison does little if a missing statement or
approval still controls completion. Keep dependencies that cannot yet be removed
visible; consider shared evidence, feeds and parallel collection where justified.

Execution and authorization are separate choices. Future applicable step contracts
must define inputs, outputs/schema, evidence, prerequisites/readiness, deadlines,
allowed actions, execution mechanism, separate authority mode with identity/scope/
limits/policy version, abstention/fallback, exception owner, independent verifier,
evaluation references and thresholds. Agent loops additionally bind tools,
steps/time/cost budgets and stopping conditions. Read/propose, execution under
explicit policy and named human approval are contract choices requiring review;
none widens current D-033. All-code and AI-prepared consequential actions use the
same applicable controls. Confidence, worker type, historical sample size and a
model's yes/no recommendation never grant authority.

For invoice disputes, structured invoice/PO/receipt comparisons may use code;
ambiguous supporting material may need one bounded model task; commercial
trade-offs require a person. Missing delivery evidence, a CRM/contract conflict
and legal-entity-specific approval must remain visible. Gathering evidence in
parallel must retain the applicable approval and independent proof. A posted
credit is not cash collection.

## Decision Packet and human attention

Lead with the proposed disposition, amount/context, cited evidence, options,
consequences, material uncertainty, applicable authority and next decision. Keep
the intervention beside the summary, with chronology and technical detail
expandable. Display completed preparation only when evidenced. Synthetic seats
remain labeled and never imply authentication.

Map wording to the existing **approve, reject, modify, escalate** contracts; “request
evidence” or “route” does not silently introduce another API decision type. Preserve
fresh consent after changes, exact pending command retries, terminal decisions,
unapproved replacement and independent historical verification. Historical receipts
and current eligibility stay distinct. Reconcile independently loaded projections;
mixed or stale reads produce incomplete information, not invented progress.

| Primary intervention reason | Required explanation                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| AUTHORITY                   | Applicable policy/commitment boundary and eligible reviewer needed.                                     |
| JUDGMENT                    | Evidence-backed interpretation or trade-off; options and consequences.                                  |
| MISSING_EVIDENCE            | Absent, conflicting or unresolved required fact, source and owner.                                      |
| MISSING_KNOWLEDGE           | Missing usable rule, precedent or domain guidance; appropriate owner.                                   |
| NOVEL_CASE                  | Material departure from known patterns, evidenced or operator-confirmed. No novelty engine is required. |
| SYSTEM_FAILURE              | Tool, source, worker or runtime failure; recovery separate from new-action permission.                  |

Use one evidenced primary current reason, preserving other material blockers in
the packet. Unknown is **Reason unconfirmed**, not a seventh business reason. Do
not infer JUDGMENT, MISSING_KNOWLEDGE or NOVEL_CASE merely from a missing approval
or low confidence. Reasons explain attention; they never grant authority.

The website's illustrative 30/26/4 population is separate from the one persistent
Orchid Case and the frozen 30-case ECC evaluation. Do not create a multi-Case
workload or prescribe a result to preserve that story. Counts require actual
fixture/state membership, denominator and current attention conditions. Reduce an
attention count only when validated state shows the Case no longer needs attention,
not on Approve. The source's reason summary and example table disagree (the table
includes novelty); preserve the evidence rather than forcing its illustrative split.

## Four distinct achievements

| Achievement                   | Evidence required and limit                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packet accepted               | Identified customer operator accepts the packet for its stated task/version. Preparation value only; not action permission or dispute resolution.                            |
| Action effect verified        | Separate observation matches the exact action/attempt and target. D7 implements only a simulated Orchid credit effect.                                                       |
| Business close event verified | Workflow-defined authoritative evidence proves the agreed objective, such as an accepted resolution in its source or matched cash when that is the objective.                |
| Case resolved                 | Complete action/accepted-no-action, independent verification, commitments, accepted outcome, correction and reconstructable audit proof. D-013 still denies runtime closure. |

D10 discovers the business close event. D11 proposes its binding to existing
`Outcome`, evidence, commitment and verifier concepts (the current schema does not
define an `OutcomeEvent` contract). Required semantics include expected outcome/name,
authoritative source/scope, observation method, status/time, evidence/receipt
references, acceptance owner, applicability, freshness and reopen rules. D12 adds
only the reviewed proof needed by the workflow. Any closure-engine amendment needs
an explicit decision and human approval; planning cannot reinterpret D-033 proof.

## Correction and reviewed improvement

Retain what changed, why, supporting evidence/context, authority-only versus
knowledge-bearing intervention, responsible actor, Case/step/pack version and
evaluation-candidate status. Append lineage; never rewrite originals or hide durable
business state in browser storage. Current `Correction`/`LearningCandidate` schema
concepts do not establish capture or promotion behavior. D11 reconciles the smallest
versioned addition if needed; D12 implements minimum reviewed capture.

Start with a manual reviewed path: correction → reviewed evaluation case → proposed
pack/configuration change → representative unseen plus regression cases → applicable
named approval → versioned promotion with rollback. Show “Captured for evaluation”
only after actual capture. An authority-only intervention cannot relax future
approvals. No automatic training, policy mutation, threshold change, cross-customer
reuse or self-promotion. D16 later productizes branch/replay and Operational CI.

## Measurement definitions and missing evidence

Baseline before intervention: agree cohort, sources, process owner, observation
period, event semantics, variants and method. Collect missing baseline inputs before
changing the workflow. Record concurrent staffing, integration and process changes
and attribute gains to the combined intervention where appropriate. D8-B defines
measurements; it adds no telemetry. Missing economics must not indefinitely block D9.

| Measure                                       | Definition and disclosure before a claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exception share                               | Unique eligible Cases leaving the defined happy path / all eligible Cases in the same cohort. Multiple exceptions count once overall; type counts may overlap. An exception-selected 25-Case sample reports overall rate unavailable.                                                                                                                                                                                                                                                                               |
| Exception handling time                       | Detection to defined verified resolution, with resolved sample count and meaningful median/p90; separately show unresolved count and open age.                                                                                                                                                                                                                                                                                                                                                                      |
| Case/step elapsed time                        | Defined end minus start; specify calendar/business time, timezone, reopen rule and coverage. Source occurrence, ingestion and journal recording are distinct events.                                                                                                                                                                                                                                                                                                                                                |
| Active effort and waiting                     | Directly captured or explicitly estimated person-minutes, method/owner and coverage, split into preparation, review, correction and verification. Approval waiting is separate. Tab-open time, edit timestamps and test-run duration are not labor. Deduplicate a person's overlapping active intervals; concurrent people may add person-minutes. Use the union of active intervals for elapsed decomposition, not summed person-minutes. Overlapping waits are not additive time saved; causes need confirmation. |
| Human attention per verified business outcome | All attributable active human minutes for the stated cohort/window, including failed and unresolved work, / distinct independently verified business outcomes. Report cohort, verified/open counts, open age and effort coverage. Zero verified outcomes means unavailable, not zero.                                                                                                                                                                                                                               |
| Preparation value                             | Active effort to an operator-accepted packet, with task/version and population, separately from business outcome measures. Follow open Cases to their agreed outcome window.                                                                                                                                                                                                                                                                                                                                        |
| Capacity and delay                            | Cases completed/progressed, current blockers, throughput and elapsed intervals separately. Match scope, variants, Case mix and observation periods against baseline; do not infer gains from synthetic counts.                                                                                                                                                                                                                                                                                                      |
| Cost per accepted or verified outcome         | State the exact denominator; packet acceptance cannot silently replace business acceptance. Include model/tool/compute, operator preparation/review/correction/verification, support, founder assistance and attributable delivery/setup costs. Separate one-time setup and incremental recurring costs with allocation/rate assumptions, failed/reworked Cases and coverage.                                                                                                                                       |
| Quality and economic value                    | Track false approvals, missed exceptions, abstention/fallback, mismatch, downstream consequences and rework. Separate direct loss/penalties, realized value, accelerated cash, protected-value estimates and opportunity hypotheses. Invoice principal, delayed cash and credit value are not automatically revenue, loss or savings.                                                                                                                                                                               |

All estimates retain method and owner. Distinguish measured, observed, estimated,
inferred and hypothetical results; unknown is not measured zero. Compare like-for-like
cohorts with counts and uncertainty. Lower attention or faster review cannot
compensate for unsafe decisions. The [D8-B readiness table](../guides/d8-failure-walkthrough.md#measurement-readiness)
lists current recorded facts versus missing measurements.

Operational Observability should reuse Case IDs, event semantics and metric
contracts. New routes, delays, source disagreements or verification failures open
Case-linked findings; owners confirm causes, evaluate proposed changes and approve
new pack versions. Compare the next cohort with baseline. This future feedback
path recommends improvements but cannot authorize action or claim an outcome.

## Customer proof and acceptance

During D9–D10, use approved exports/documents with a named buyer/process owner and
operators for assisted reconstruction and packet review. Observe corrections and
whether the packet finds consequential discrepancies and clarifies the next action.
Track setup and founder help. A proposed usability experiment is a useful packet
within ten minutes after supported upload, with helper/setup time reported
separately; this is not a service promise or implemented capability.

During D11–D12, repeat a reviewed template and one useful worker on fresh comparable
Cases. The worker must discover the supported interface, obtain scoped work, gather
evidence/reconcile/draft within limits without per-tool prompting, submit evidence,
understand denial, abstain, recover exact retry and inspect results through the API
without UI dependence. Replace it without losing Case history. Reuse suitable
parsing/event-analysis and worker infrastructure; no general agent harness.

Compare the assignment with the manual process and a generic agent using comparable
inputs, tools and time/cost budgets. Assess completeness, consequential errors,
decision quality, recovery, rework, total human effort and delivery cost. Pre-agree
a meaningful effort/throughput target and quality constraints with the buyer.
If review/rework consumes the gain, narrow or improve the assignment before adding
modules. Historical example quantity does not justify autonomy.

D13 packages the 25-Case Challenge and **Operating Capacity Map**: reconstructed
Cases with provenance/unknowns; demonstrated versus estimated machine-progressable
work; human-required Cases by reason; blockers/owners; verified close coverage;
attention and cost with coverage; and the proposed code/model/agent/human/authority
allocation. Preserve denominator, failed and unresolved Cases. Offer a focused paid
next batch or bounded 30-day evaluation; connected shadow work remains D17–D18.

The proposed early customer gate is **two design partners return with another real
batch and one agrees to paid continuation**. It is an experiment target, not PMF.
Repeat delivery without founder preparation scaling proportionally with Case count;
otherwise simplify intake/template. Praise, downloads and stars do not prove buyer
value. Keep the usable Apache-2.0 reference path; potential managed services are
not implemented offerings. Recruitment/interviews can begin alongside the build,
but real-data evaluation first requires its permitted data/access boundary.

Later acceptance must demonstrate all seven records on one reviewed workflow,
cited or labeled findings/interviews, reproducible baseline calculations, preserved
conflicts/unresolved Cases, operator corrections, rejected unapproved rule promotion
and replay of normal, exception, variant and failure Cases. Also require an all-code
zero-model-call path, bounded AI proposal requiring approval, uncertainty abstention,
authority bypass/stale-consent denial and agent completion unable to close without
full proof. Preserve false-approval, missed-exception and downstream-consequence
checks on representative unseen Cases. Offline evaluation, independent effect
verification, customer acceptance and economic improvement remain separate evidence.

## Scope and next build

D8-B retains its five demonstrations and validation; this reconciliation adds only
documents, measurement definitions and gaps. D8-C is now **merged in PR #28**: read-only progress,
blocker/owner/next-action and “Why you?” presentation using current validated reads.
Reuse the existing Workbench; unknown reasons stay unconfirmed, stale/mixed reads
stay incomplete, and no count, correction or outcome is invented. Preserve all
four review decisions, permitted interventions, exact retries, consent and closure
denial. Test keyboard/mobile behavior and stale, mismatch, inconclusive and failed
refresh states. Inspect website ownership separately; record a separate copy/status
follow-up, with no website change, release or deployment in this assignment.

D9-A specifies minimal intake/provenance/time semantics and the permitted data
boundary in the single [D-034 — accepted synthetic scope](../architecture/d9-assisted-intake-boundary.md).
D9-A was design only; D9-B merged in PR #30 with one queue export plus supporting documents,
reviewed matching and repeat-import handling. Proposed intake content must preserve
Case/business-object references, source record and event IDs, activity, actor/role,
source status, occurrence and ingestion times, timezone, content/provenance bindings
and matching uncertainty. These are contract-reconciliation requirements, not new
fields silently added to strict WorkEvent v0. [D10-A / Accepted D-035](../architecture/d10-discovery-preparation-review.md)
now makes one bounded preparation/review design concrete; its narrow synthetic review
boundary is approved and merged in PR #31. D10-B now implements the bounded synthetic
brief, all seven record views/six outputs and descriptive review on its review branch;
[actual scope and evidence](../guides/synthetic-discovery.md) do not complete the broader
R1–R7 requirements or establish business outcomes. D10 supplies all records, interviews,
baseline and redesign; D11 reviews one template/pack; D12 supplies one useful
replaceable worker, bounded proof and minimum reviewed correction capture; D13
packages customer proof. Assisted D9–D12 evaluations need not wait for every later
module. D14 distribution, D15 broad routing, D16 Operational CI, D17 connectors,
D18 connected shadow operation, D19 enterprise controls and D20 production writes
remain gated future work. No enterprise-wide process mining, workforce scoring,
novelty engine, general attention allocator, nested loops or autonomous policy.

Every implementation handoff must report requirement IDs, changed files/contracts,
actual user behavior, validation evidence, gaps and next dependencies. Update the
matrix instead of creating another backlog. Any product-intent, first-workflow,
data, authority or closure change needs its explicit decision and human approval.
