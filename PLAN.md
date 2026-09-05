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
note are implemented for review on this branch. No release or deployment is included.

The published `v0.1.0-evaluation-preview.0` is a historical snapshot at `3db1b4bf`,
before D6/D7; merges do not update it. This plan describes current source and future
work. [README's functionality table](README.md#what-works-today) separates Workbench,
API, review-branch and release availability.

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

| Item                                                 | Status      | Outcome                                                                                                                                                                                                                                                                     | Exit criteria                                                                                                                                              |
| ---------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub #1 — Constitution and scaffold                | Merged      | Product boundary, monorepo, canonical Case schema, ECC contract, first fixture, tests, and CI                                                                                                                                                                               | Clean install and `pnpm validate` pass without credentials                                                                                                 |
| GitHub #2 — Case and event engine                    | Merged      | Deterministic state machine, hash-chained case journal, idempotent case creation, explicit case-targeted WorkEvent attachment, and audit lineage                                                                                                                            | Journal replay, tamper, projection-drift, transition, and duplicate-event tests pass                                                                       |
| GitHub #3 — ECC pack runner                          | Merged      | Execute all 30 synthetic cases through qualification, evidence, conflicts, ownership, and decision packet                                                                                                                                                                   | Deterministic assertions pass and failures are explicit                                                                                                    |
| GitHub #4 — Local appliance                          | Merged      | API, in-process worker, lossless PostgreSQL event store, immutable fixture catalog, `fr init ecc --demo`, and `fr up`                                                                                                                                                       | Fresh-volume demo creates, updates, restarts, replays, and deduplicates in CI                                                                              |
| GitHub #5 — Guided workbench                         | Merged      | Direct-to-case Case, Decision, Act & Verify, and Receipt experience with an explicitly non-authoritative guided simulation                                                                                                                                                  | Six-action walkthrough, accessibility, local-only browser, and appliance smoke pass                                                                        |
| GitHub #6 — Preview Readiness                        | Merged      | Apache 2.0 boundary, public governance and security files, pinned infrastructure, release checks, preview image, and five-minute walkthrough                                                                                                                                | Public-release audit and hosted appliance CI pass before repository visibility changes                                                                     |
| GitHub #12 — Public Launch Finalization              | Merged      | Final public copy, release-state reconciliation, repository metadata and protection checks, anonymous-clone verification, and prerelease publication gate                                                                                                                   | Final `main` passes hosted CI and `pnpm release:check`; every checklist stop condition is clear before visibility changes                                  |
| GitHub #14 — Automated Evaluation Prerelease         | Merged      | Automate the evaluation prerelease while retaining the repository's explicit preview boundary                                                                                                                                                                               | The published prerelease remains tied to validated source and release checks                                                                               |
| D6 — Governed Case Session                           | Merged      | Authoritative identity, delegation, and business authority; exact Case owner, delegated worker, authority owner, and verifier; payload-bound approvals; deterministic authority resolution                                                                                  | The Decision Packet is runtime-backed, approvals bind the exact payload, and authority resolution fails closed                                             |
| D7 — Controlled Action + Independent Verification    | Merged      | Bounded Orchid credit, independent verification and Workbench action/check controls merged in PRs #23–#25                                                                                                                                                                   | Bypass, self-verification, unbound-payload, precondition, and duplicate-effect negative tests pass                                                         |
| D8 — Receipts + Economics + Failure Theater          | In progress | D8-A receipt merged; D8-B reproducible failure walkthrough and measurement-readiness note implemented for review; accepted-outcome and measured economics planned                                                                                                           | A Case is reconstructable, economics derive from receipts, and unsafe authority/action/verification demonstrations fail closed                             |
| D9 — Intake + Case Formation                         | Planned     | Canonical intake for email, file, form, event, queue row, and human submission; provenance-preserving evidence links; related-signal linking; uncertainty-preserving Case candidates and existing-Case import                                                               | Repeatable candidate formation and safe mapping of upstream Cases both preserve provenance, ambiguity, conflicts, unknowns, and system-of-record ownership |
| D10 — Case Discovery + Operational Legibility        | Planned     | Reconstruct representative historical work; distinguish authoritative fact, approved policy, cited memory, extraction, and inference; expose missing evidence/conflicts and classify operability                                                                            | Evaluation reports agent-workable, human-judgment-required, authority-blocked, evidence-blocked, and unclear-outcome work without inferring authority      |
| D11 — Runtime Builder                                | Planned     | Human review of discovered or imported actors, systems, evidence sources, Case classes, authority references, commitments, actions, and outcome contracts; compile a versioned Organization Runtime Pack                                                                    | A reviewed Runtime Pack is reproducible without turning implementation into bespoke BPMN consulting                                                        |
| D12 — Work Agent Runtime                             | Planned     | Bounded Worker Adapter Contract and Broker; one reference worker, Hermes first unless evidence rejects it; Worker Packs and BYO-agent/harness compatibility; optional QM/OpenClaw adapters                                                                                  | Replaceable workers operate on governed Cases and cannot own canonical Case state                                                                          |
| D13 — 25-Case Challenge                              | Planned     | A 3–5 day self-serve-or-assisted entry product using representative historical queues, Cases, or signals to measure reconstructability, operability, gaps, effort, cycle-time opportunity, and economics; credit it toward a Production Test where commercially appropriate | Results report Case reconstructability, workload classes, authority/evidence gaps, human hours, cycle-time opportunity, and estimated economics            |
| D14 — One-Command / Self-Serve Distribution          | Planned     | Zero-install or one-command try path and polished `/try` experience for Case Formation and the Challenge                                                                                                                                                                    | A new evaluator can reach the bounded experience through a documented, low-friction distribution path                                                      |
| D15 — Worker / Model Routing + Intelligence Receipts | Planned     | Route by task, risk, authority, cost, capability, warm state, and verified outcomes while keeping provider and model replaceable                                                                                                                                            | Routing choices are receipted, policy-bounded, evaluated, and independent of canonical Case ownership                                                      |
| D16 — Correction + Branch + Replay / Operational CI  | Planned     | Correction lineage, changed-fact replay, evaluated learning candidates, approval before promotion, and rollback                                                                                                                                                             | Original history remains unchanged, replay is reproducible, and no learning candidate promotes without approval                                            |
| D17 — Read-Only Real-World Connectors                | Planned     | Representative email plus CRM and ERP/accounting connectors, read-only first, with preserved provenance and no unrestricted credentials exposed to workers                                                                                                                  | Connector contracts preserve evidence lineage and prevent worker access to unrestricted credentials                                                        |
| D18 — Shadow-Mode Production Test                    | Planned     | Run one real recurring workflow without production writes; compare Field Runtime output with the human process                                                                                                                                                              | Accepted completion, interventions, authority gaps, cycle time, and economics are measured against live shadow evidence                                    |
| D19 — Multiplayer Enterprise Coordination + Control  | Planned     | Human, agent, and service identities; delegation; team coordination; policy/control views; cost, audit, and fleet health after trusted runtime and shadow evidence                                                                                                          | Enterprise coordination is attributable, policy-bounded, and supported by trusted-runtime and shadow-mode evidence                                         |
| D20 — Progressive Governed Action                    | Planned     | Narrow production writes with explicit authority, reversible or preconditioned actions where possible, a kill switch, independent verification, and evidence-based authority expansion                                                                                      | Each production effect is narrowly authorized, controlled, independently verified, recoverable where possible, and backed by evaluation evidence           |

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

Implemented for review: a [five-scenario failure walkthrough](docs/guides/d8-failure-walkthrough.md)
using existing PostgreSQL/API fixtures, fault hooks and Node test selection. One
legitimate match accompanies stale-consent denial, silent adapter failure caught
by read-back, unavailable-read inconclusive proof and exact response-loss retry.
Diagnostic excerpts expose commands, receipt hashes, synthetic attribution, observed
source and recovery without a new runner, ledger, API or fault-control surface.

Retain all authority, action, verification, browser, replay and closure tests. Expected
negative outcomes pass assertions; unexpected authorization or duplicate effects
fail. Fixtures create/drop only their own disposable schemas. Current runtime and
frozen ECC behavior remain unchanged.

Next: establish accepted-outcome evidence and collect comparable operational data
before measured economics. Active human effort, baseline, operating costs, customer
acceptance and real impact are missing. No elapsed interval is labor time or savings;
unknown values are not zero. D8 economics and complete Case closure remain planned.

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
