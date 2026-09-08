# Delivery Plan

Each pull request must remain independently reviewable and leave the repository in
a passing state.

Delivery position: GitHub PRs #1–#6, #12, #14 and #19 are merged. D6-C merged
in PR #20 at `940462ec`; D6-D merged in PR #21 at
`ba340cc5135343e12820992cf4a7542cf7cc9c29` with passing required checks. The human
operator accepted [D-033](docs/architecture/d7-simulated-credit-verification.md)
at `527cfb6f`. D7-A PR #22 merged normally at
`f6dcddc03da8ee7c86cce76979aca751b2b0266d` with full D6-D coverage. D7-B PR #23 merged normally at `6766d9d99569fbff0e95e8b8b91748c1c0646b7a`
from reviewed head `56490f9a` after required checks. D7-C PR #24 merged at `3936843fba4126bdb852e2ee5681de0f7162525a`
from reviewed head `f72a0256` with passing required checks. D7-D PR #25 merged normally
at `f49dd71e3d1d8a393729690437d6f568b7473238`, preserving reviewed head `2f3434fe`
and passing checks. D8-A merged in PR #26 at
`4ce7175556b2a0ecf954ec5a57677a591050db2c` from reviewed head `e1caeb28`, with passing
checks and its finding resolved. D8-B’s failure walkthrough and measurement-readiness
note merged in PR #27 at `1039912ca7eaea2239366f5de8c07b0e44c7df81`, preserving
reviewed head `d86b2a9e` and passing required checks. D8-C’s bounded operator-attention
presentation merged in PR #28 at `555ac0214b006350b049d96567cb98b92ebc25f8` from
reviewed head `1f2d9a2d`, with passing required checks and its finding resolved.
D9-A’s minimum synthetic intake/provenance design is Accepted for synthetic
implementation at reviewed head `e5e8273c`. The owner authorized D9-B; real customer
activation remains unapproved. PR #29 merged normally at `f96d6cc7`; D9-B PR #30
merged normally at `ca9543289894fffdaa40ecfe794d83addc2c19de` from reviewed head
`9d250707`, with required CI passing and all findings resolved. The approved retry
amendment, successful no-op key bindings, cross-tab recovery and migration compatibility
are preserved. D10-A / Accepted D-035 merged normally in PR #31 at
`222b2842b44efc1da219c1409d5111a55e62641a` after approval-head CI passed.
D10-B merged normally in PR #32 at `953d49ece70f7828935bb0f4636299d7601f16d5`
from reviewed head `4f86e2f5`, with required checks passing and both findings resolved.
It provides deterministic cited preparation and
Case-linked descriptive review with exact retry/stale-input/replay controls. The
[walkthrough](docs/guides/synthetic-discovery.md) states the actual scope and gaps.
The canonical specification and all 19 matrix entries remain the product plan.
D11-A / corrected Accepted D-036 merged normally in PR #33 at `940a95bf` after
approval-head CI passed. **D11-B merged normally in PR #34 at `6bfc94e24d2a2980b369fc0aea487e32313b5f78`**, from reviewed `b284279c` with passing required checks and no open findings: one fixed
preparation template, separate publication profile, immutable selection history,
current-basis publication/rollback and eligible stale-pack withdrawal. Its compact
intake panel reuses current descriptive review and exposes correction → fresh review →
separate publication. [Walkthrough and acceptance evidence](docs/guides/synthetic-preparation-pack.md).
[D12-A / Proposed D-037](docs/architecture/d12-bounded-preparation-worker.md) now specifies one zero-model preparation worker and minimum proof/correction capture. It is design only, pending approval. No worker execution, consequential-rule activation, real data, release or deployment.

The published `v0.1.0-evaluation-preview.0` is a historical snapshot at `3db1b4bf`,
before D6/D7; merges do not update it. This plan describes current source and future
work. [README's functionality table](README.md#what-works-today) separates Workbench,
API, review-branch and release availability.

## Canonical product requirements

Use [Workflow Discovery and the narrow MVP](docs/product/workflow-discovery.md)
and its [single requirement/gaps matrix](docs/product/requirements-implementation-matrix.md).
They consolidate the ten-point Discovery instruction, all seven records, Business
Loops handoff and September 7 roadmap. Required product direction is distinct from
proposed contracts and implementation. Case stays atomic; no Loop Platform.

The next customer assignment candidate is evidence-backed commercial invoice-dispute
disposition, within Revenue/ECC, confirmed with one queue owner and operator before
freezing its contract. [D-034](docs/architecture/d9-assisted-intake-boundary.md) is
Accepted for synthetic implementation: customer activation and any first-workflow
change still need explicit review; the
synthetic appliance is not an approved customer-data service. Baseline definitions
come now; absent ROI does not block intake planning. Early assisted D9–D12 evaluations
can run only within an approved data boundary, without waiting for every later module.

## Delivery labels and GitHub pull requests

Delivery labels D6–D20 describe the stable capability sequence. They are **not**
GitHub pull request numbers. Automated dependency updates and other repository work
can consume GitHub numbers, so the actual pull request for a delivery item may have
a different number. Each delivery item will link its GitHub pull request when
implementation begins; merged GitHub history is never renumbered.

## Why Case Formation moved earlier

Software agents usually inherit structured work state from repositories, issues,
branches, permissions, tests, and CI. Business operations often begin instead with
fragmented messages, files, events, records, and tacit context. Canonical Case
formation or safe Case import must therefore precede general agent execution. Case
Formation is optional when a trusted upstream Case already exists, and observed
historical behavior alone never establishes business authority.

| Item                                                           | Status      | Outcome                                                                                                                                                                                    | Exit criteria                                                                                                                                                                     |
| -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub #1 — Constitution and scaffold                          | Merged      | Product boundary, monorepo, canonical Case schema, ECC contract, first fixture, tests, and CI                                                                                              | Clean install and `pnpm validate` pass without credentials                                                                                                                        |
| GitHub #2 — Case and event engine                              | Merged      | Deterministic state machine, hash-chained case journal, idempotent case creation, explicit case-targeted WorkEvent attachment, and audit lineage                                           | Journal replay, tamper, projection-drift, transition, and duplicate-event tests pass                                                                                              |
| GitHub #3 — ECC pack runner                                    | Merged      | Execute all 30 synthetic cases through qualification, evidence, conflicts, ownership, and decision packet                                                                                  | Deterministic assertions pass and failures are explicit                                                                                                                           |
| GitHub #4 — Local appliance                                    | Merged      | API, in-process worker, lossless PostgreSQL event store, immutable fixture catalog, `fr init ecc --demo`, and `fr up`                                                                      | Fresh-volume demo creates, updates, restarts, replays, and deduplicates in CI                                                                                                     |
| GitHub #5 — Guided workbench                                   | Merged      | Direct-to-case Case, Decision, Act & Verify, and Receipt experience with an explicitly non-authoritative guided simulation                                                                 | Six-action walkthrough, accessibility, local-only browser, and appliance smoke pass                                                                                               |
| GitHub #6 — Preview Readiness                                  | Merged      | Apache 2.0 boundary, public governance and security files, pinned infrastructure, release checks, preview image, and five-minute walkthrough                                               | Public-release audit and hosted appliance CI pass before repository visibility changes                                                                                            |
| GitHub #12 — Public Launch Finalization                        | Merged      | Final public copy, release-state reconciliation, repository metadata and protection checks, anonymous-clone verification, and prerelease publication gate                                  | Final `main` passes hosted CI and `pnpm release:check`; every checklist stop condition is clear before visibility changes                                                         |
| GitHub #14 — Automated Evaluation Prerelease                   | Merged      | Automate the evaluation prerelease while retaining the repository's explicit preview boundary                                                                                              | The published prerelease remains tied to validated source and release checks                                                                                                      |
| D6 — Governed Case Session                                     | Merged      | Authoritative identity, delegation, and business authority; exact Case owner, delegated worker, authority owner, and verifier; payload-bound approvals; deterministic authority resolution | The Decision Packet is runtime-backed, approvals bind the exact payload, and authority resolution fails closed                                                                    |
| D7 — Controlled Action + Independent Verification              | Merged      | Bounded Orchid credit, independent verification and Workbench action/check controls merged in PRs #23–#25                                                                                  | Bypass, self-verification, unbound-payload, precondition, and duplicate-effect negative tests pass                                                                                |
| D8 — Receipts + Measurement Readiness + Failure Demonstrations | In progress | D8-A/B/C merged; accepted-outcome and measured-economics capabilities remain planned                                                                                                       | Reconstruct evidence and assert unsafe paths; distinguish missing effort/outcomes/economics from measured results; no new closure permission                                      |
| D9 — Intake + Case Formation                                   | Merged      | D9-A/B merged; synthetic preparation, source retention, reviewed create/attach, successful-key bindings, cross-tab recovery and portable replay                                            | No duplicate Cases/events; uncertain links, source versions and missing population remain explicit; portable provenance; existing upstream Case ownership preserved               |
| D10 — Discovery + Readiness + Redesign                         | Incomplete  | D10-B merged: bounded seven-record/six-output descriptive review; full route, baseline, interview and redesign evidence still incomplete                                                   | One operator-reviewed workflow; every finding cited or labeled, preserved source/variant conflicts, valid measurement coverage and named controls/owners                          |
| D11 — Reviewed Runtime Builder                                 | Merged      | D11-A/B merged; Accepted D-036 implements one preparation pack and separate publication/withdrawal/rollback with replay                                                                    | Reproducible pack; draft/contradictory rules cannot execute; approved diffs and rollback; any changed trust/closure boundary has human approval                                   |
| D12 — One Useful Replaceable Worker                            | Proposed    | Evidence gathering, reconciliation and drafts within reviewed read/propose scope; bounded execution, independent proof and minimum manual reviewed correction capture                      | API-only scoped work/denial/abstention/exact retry/result inspection; replace worker without losing history; code-only and human-approved AI controls; no unsupported closure     |
| D13 — 25-Case Challenge + Customer Proof                       | Planned     | Operating Capacity Map, valid manual/generic-agent comparison, total human attention and delivery costs, paid continuation experiment; bounded 30-day evaluation when ready                | Report coverage, quality, failed/open Cases and uncertainty; two partners return with a second batch and one paid continuation is a proposed target, not PMF or a measured result |
| D14 — One-Command / Self-Serve Distribution                    | Planned     | Zero-install or one-command try path and polished `/try` experience for Case Formation and the Challenge                                                                                   | A new evaluator can reach the bounded experience through a documented, low-friction distribution path                                                                             |
| D15 — Worker / Model Routing + Intelligence Receipts           | Planned     | Route by task, risk, authority, cost, capability, warm state, and verified outcomes while keeping provider and model replaceable                                                           | Routing choices are receipted, policy-bounded, evaluated, and independent of canonical Case ownership                                                                             |
| D16 — Correction + Branch + Replay / Operational CI            | Planned     | Correction lineage, changed-fact replay, evaluated learning candidates, approval before promotion, and rollback                                                                            | Original history remains unchanged, replay is reproducible, and no learning candidate promotes without approval                                                                   |
| D17 — Read-Only Real-World Connectors                          | Planned     | Representative email plus CRM and ERP/accounting connectors, read-only first, with preserved provenance and no unrestricted credentials exposed to workers                                 | Connector contracts preserve evidence lineage and prevent worker access to unrestricted credentials                                                                               |
| D18 — Shadow-Mode Production Test                              | Planned     | Run one real recurring workflow without production writes; compare Field Runtime output with the human process                                                                             | Accepted completion, interventions, authority gaps, cycle time, and economics are measured against live shadow evidence                                                           |
| D19 — Multiplayer Enterprise Coordination + Control            | Planned     | Human, agent, and service identities; delegation; team coordination; policy/control views; cost, audit, and fleet health after trusted runtime and shadow evidence                         | Enterprise coordination is attributable, policy-bounded, and supported by trusted-runtime and shadow-mode evidence                                                                |
| D20 — Progressive Governed Action                              | Planned     | Narrow production writes with explicit authority, reversible or preconditioned actions where possible, a kill switch, independent verification, and evidence-based authority expansion     | Each production effect is narrowly authorized, controlled, independently verified, recoverable where possible, and backed by evaluation evidence                                  |

## D6-C delivery boundary

[Accepted D-032](docs/architecture/d6-authority-request-lifecycle.md) is implemented
with separate C/R/S revisions, strict v1 adapters, immutable PostgreSQL review
history/snapshots, additive migration 0002, terminal decisions and atomic
replacement. Request/packet reads have no durable side effects. The
[API demonstration and migration guide](docs/guides/d6-authority-review.md) covers
Case creation, Finance/Executive approval, restart and reconstruction. Real
PostgreSQL CI exercises upgrade/fresh installation, races, failures, tampering,
read-only snapshots and idempotent retries.

## D6-D delivery boundary

The [Guided Workbench](apps/admin/README.md) now provides explicit idempotent demo
initialization, runtime packet/evidence review, Finance and Executive approval,
explicit refresh/resubmission and restart/reload reconstruction. Reject, modify
and escalate use existing contracts; replacements start without approvals. Pending
command bytes/keys survive reload for exact retries. Retained evidence demonstrates
Case-version invalidation and explicit fresh review. Reads cause no durable writes;
local state never grants authority. Legacy simulated action/receipt history stays
separate, and execution/closure remain blocked.

PR #21 passed repository validation, real PostgreSQL/API, Compose and
appliance/browser acceptance checks before normal merge. It introduced no
runtime contracts or migrations. Production authentication, identity history,
external catalog sources and general workflows remain outside this synthetic step.
D7-B/C below supply the bounded action and independent verification APIs. Complete
closure proof remains unimplemented. D7-D below connects the action/check controls.

The human operator accepted the desktop/390px presentation at `1561329858` on
2026-09-05; no further UI redesign is a D6-D merge prerequisite. D7-D implements the two
retained follow-ups for the existing Workbench: acknowledge an already-recorded
approval without suppressing permitted interventions, and reduce mobile scrolling
before review controls. Preserve server authority, visible uncertainty and exact
consent/retry behavior. These follow-ups do not gate D7-B/C. D-033 was separately
accepted by the human operator.

## D7 delivery under Accepted D-033

[D-033](docs/architecture/d7-simulated-credit-verification.md) remains Accepted.
PR #22 merged after the restored repository, PostgreSQL/API, Compose and Workbench
checks passed, preserving the effective solo-maintainer protections without bypass.

1. **D7-B — merged in PR #23:** strict operation/envelope contracts, fixed
   synthetic enrollment, migration 0003, read-only action views, current bound
   action API, atomic source/action evidence, duplicate prevention and replay.
   [API examples and migration notes](docs/guides/simulated-credit-api.md).
   Reviewed replay/scope repairs, PostgreSQL, appliance and Workbench CI passed.
2. **D7-C — merged in PR #24:** strict verification POST, dedicated read-only
   source connection, current scoped verifier checks, immutable observations and
   deterministic proof replay. Migration 0004 extends the existing journal without
   changing prior checksums/history. Exact retries, observation races and failed
   persistence remain fail closed. Only latest retained independent absence plus
   current authority permits explicit fresh execution; occupied slots always block.
   Required repository, PostgreSQL/API, restart, Compose and Workbench CI passed.
3. **D7-D — merged in PR #25:** existing Workbench action/check controls,
   deliberate preparation and enrollment, exact persistent retries, separate
   execution/verification eligibility and visible historical receipts. Review →
   action → source check uses the existing API; mismatch, inconclusive and changed
   evidence paths remain explicit. Required repository, PostgreSQL/API,
   desktop/390px browser, restart, Compose and appliance checks passed before merge.
   No runtime contract or migration changes; closure and external effects stay blocked.

Each step carries D-033's applicable acceptance tests. Action supporting history
advances neither C, R nor S. External writes, production identity, connectors,
generic worker infrastructure and D8 economics remain out of scope. A simulated
credit does not prove customer impact or permit Case closure.

## D8-A delivery boundary

Merged in PR #26: replace the existing History lists with one compact Case
progress and evidence receipt. Reuse the existing validated Case, request, action
and verification reads. Expand each stage for its retained material, canonical
synthetic identity, exact bindings and recorded time. No new ledger, contract,
migration, authority calculation or worker is introduced.

Acceptance covers read-only open/refresh/expansion, reload and restart, exact retry
without double counting, changed approvals, unapproved replacements, earlier
request/attempt history, later inconclusive checks and failed refresh with retained
evidence. Reconcile explicit revisions and anchors; if independent views disagree,
show incomplete information. Preserve journal ordering without inferring order
across equal timestamps. Historical evidence never grants current permission.

## D8-B delivery boundary

Merged in PR #27: a [five-scenario failure walkthrough](docs/guides/d8-failure-walkthrough.md)
using existing PostgreSQL/API fixtures, fault hooks and Node test selection. One
legitimate match accompanies stale-consent denial, silent adapter failure caught
by read-back, unavailable-read inconclusive proof and exact response-loss retry.
Diagnostic excerpts expose commands, receipt hashes, synthetic attribution, observed
source and recovery without a new runner, ledger, API or fault-control surface.

Retain all authority, action, verification, browser, replay and closure tests. Expected
negative outcomes pass assertions; unexpected authorization or duplicate effects
fail. Fixtures create/drop only their own disposable schemas. Current runtime and
frozen ECC behavior remain unchanged.

The September 7 reconciliation adds only documentation, measurement definitions
and a missing-evidence inventory; no D8-C/D9 implementation, runtime contracts,
migrations or telemetry. Source specifications and conflicts are consolidated in
the canonical specification/matrix above. Actual effort, baseline, cost, customer
acceptance and business impact remain missing; unknown is not zero. Outcome proof
belongs in D10 definition, D11 reviewed contracts and D12's minimum approved proof.
D-013 and D-033 remain unchanged; measured economics stays unimplemented.

## Next bounded builds

1. **D8-C — merged in PR #28:** the existing packet now shares History’s
   reconciliation check, distinguishes the recorded Case owner from required
   reviewers, and explains the selected synthetic seat’s bound policy. Existing
   reviewer badges and recorded action/check headings remain the compact milestones;
   History retains the full five-stage evidence receipt. No second dashboard or
   progress record. Mixed reads cannot display earlier approvals as current. The
   generic reviewer card is replaced by “Why you?” beside controls plus expandable
   policy evidence. No runtime contract, authority rule or persistence changes.
   [Workbench walkthrough and before/after captures](apps/admin/README.md#d8-c-operator-attention-and-visual-review).
2. **D9-A/B — merged in PRs #29/#30:** [Accepted D-034](docs/architecture/d9-assisted-intake-boundary.md)
   and its amendment are implemented: scoped bytes/derivations, explicit intake review
   occurrence, atomic Case/provenance, durable successful keys and safe cross-tab recovery.
   [Walkthrough and A1–A12 evidence](docs/guides/synthetic-intake.md). No nullable v0 fields,
   automatic matching, policy enrollment, transferred approval or real customer activation.
   Whole-dataset disposal ends replay; selective erasure is absent.
3. **D10-A — merged in PR #31:** [Accepted D-035](docs/architecture/d10-discovery-preparation-review.md)
   and its human approval preserve the narrow descriptive boundary and varied-input
   acceptance criteria. Documentation alone did not implement Discovery.
4. **D10-B — merged in PR #32:** the existing intake Workbench/API now prepares
   a cited brief, all seven records and six loop outputs, consequential questions and
   redesign hypotheses, with zero model calls. Operators explicitly save unknown/disputed
   answers, correct findings and confirm a stated descriptive purpose. One additive
   history retains exact Case/input/revision bindings, attribution, retries and portable
   reconstruction. Stale answers remain historical; carry-forward requires explicit new
   annotation and confirmation. [T1–T12 walkthrough and limits](docs/guides/synthetic-discovery.md).
   Full normal/exception routes, governing source/variant rules, population/effort/cost
   coverage, customer acceptance and measured usefulness remain incomplete.
5. **D11-A/B merged in PRs #33/#34:** [Accepted D-036](docs/architecture/d11-reviewed-runtime-pack.md)
   supplies a populated four-step preparation pack, separately scoped publication role,
   exact input/version bindings, selection/supersession/rollback and T1–T9 gates.
   The corrected example derives claim-level citations, keeps withdrawal independent of
   stale business basis, and reuses current D10 review. Genuine correction stales the
   old pack until fresh descriptive review and separate publication of a new version.
   The upstream D10 loop-citation fallback remains a documented gap; fixing that helper
   later must preserve recorded v1/v2 interpretation. No extra planning stage is added.
   The owner approved corrected local `100b6818` (published as identical-tree `3ba7f800`).
   D11-B implements one pack review/publication path with T1–T9 evidence; no worker
   or consequential-rule execution. A Discovery confirmation never installs policy or
   authorizes execution.
6. **D12-A — design proposed, no implementation:** [D-037](docs/architecture/d12-bounded-preparation-worker.md)
   and its [worked example](docs/guides/d12-preparation-worker-design.md) propose a scoped
   checklist, reconciliation, gap agenda and unsent draft from S1–S4. Smallest D12-B,
   after approval: explicit template/pack v2, fixed zero-model worker/profile, one supporting
   journal, exact start/result fences and retries, task review, reviewed correction/evaluation
   candidate and manual synthetic proof notes in the existing intake view. Existing v1 packs
   do not permit dispatch; new publication is required, with current D10 review reused.
   W1–W10 cover useful output, truth/scope, races, replay/replacement, proof/closure and UI.
   Completed review/publication details become expandable while withdrawal/correction/recovery
   stay accessible. No scheduler, provider or general agent framework. Broader tooling stays D16.

The [five proof measures](docs/product/workflow-discovery.md#five-separate-proof-measures)
are defined now: matched cash, accepted dispute dispositions, posted credits, newly
attended work and signed human attention released. They retain separate evidence,
units/cohorts/coverage, reversals/reopens and uncertainty. Minimum synthetic capture
requires D-037 approval; D13 comparisons include failed/open work and all attributable
human/model/tool/infrastructure/support/setup costs. Unknown is not zero; overlapping
measures never become one value score. No measured customer benefit is claimed.

Customer learning accompanies D9–D12: assisted packet sessions, then a comparable
fresh batch against manual and generic-agent alternatives with equal input/tool/
budget assumptions, quality gates and all preparation/review/correction/verification
and founder effort recorded. D13 packages the Challenge and paid continuation;
connected live shadow operation remains D17–D18, production writes D20. Keep the
proposed ten-minute useful-packet and two-returning-partners/one-paid targets as
experiments. They are not completion, PMF or release claims.

## Operational Legibility Gate

Before D12 is promoted as a usable worker runtime, D9–D10 must demonstrate:

- source provenance;
- uncertainty preservation;
- conflict detection;
- no invented authority;
- repeatable Case candidate formation or safe existing-Case import; and
- a human-review path for ambiguity.

“Planned” does not mean implemented or committed to a release date. D9–D20 are not
part of the current evaluation preview. Do not pull later-delivery scope forward
unless it is required to keep an earlier contract executable or safely testable.
