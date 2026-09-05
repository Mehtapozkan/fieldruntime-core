# Delivery Plan

Each pull request must remain independently reviewable and leave the repository in
a passing state.

Delivery position: GitHub PRs #1–#6, #12, and #14 are merged. The public source
preview and `v0.1.0-evaluation-preview.0` prerelease are published. PR #19 merged
Accepted D-032. D6-C merged in [PR #20](https://github.com/Mehtapozkan/fieldruntime-core/pull/20)
at `940462ec`. D6-D is implemented in [PR #21](https://github.com/Mehtapozkan/fieldruntime-core/pull/21)
at `1561329858`, with passing checks and its addressed thread resolved, but the
required approving review is not recorded. It remains unmerged. The human operator
accepted [D-033](docs/architecture/d7-simulated-credit-verification.md) at `527cfb6f`
on 2026-09-05. D7-A records that acceptance in PR #22; no D7 runtime behavior is
implemented. D7-B begins only after both PRs merge through repository protections.

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
| D6 — Governed Case Session                           | In progress | Authoritative identity, delegation, and business authority; exact Case owner, delegated worker, authority owner, and verifier; payload-bound approvals; deterministic authority resolution                                                                                  | The Decision Packet is runtime-backed, approvals bind the exact payload, and authority resolution fails closed                                             |
| D7 — Controlled Action + Independent Verification    | Planned     | Staged action through a deny-by-default Action Gateway with idempotency and preconditions; independent verification through a separate identity and read path; simulated effects only                                                                                       | Bypass, self-verification, unbound-payload, precondition, and duplicate-effect negative tests pass                                                         |
| D8 — Receipts + Economics + Failure Theater          | Planned     | Reconstructable authority, action, verifier, and outcome lineage plus human intervention, wait/handoff time, and cost per accepted outcome; unsafe paths fail visibly                                                                                                       | A Case is reconstructable, economics derive from receipts, and unsafe authority/action/verification demonstrations fail closed                             |
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

Remaining D6 work is the normal protected merge of PR #21 after its required
approving review. The implementation preserves explicit refresh/resubmission and
exact uncertain retries. Production authentication, identity history, external
catalog sources and general workflows remain outside this synthetic step.

The human operator accepted the desktop/390px presentation at `1561329858` on
2026-09-05; no further UI redesign is a D6-D merge prerequisite. Keep two
nonblocking follow-ups for the existing Workbench: acknowledge an already-recorded
approval without suppressing permitted interventions, and reduce mobile scrolling
before review controls. Preserve server authority, visible uncertainty and exact
consent/retry behavior. These follow-ups do not gate D7-B/C. D-033 was separately
accepted by the human operator.

## D7-A accepted implementation boundary

[D-033](docs/architecture/d7-simulated-credit-verification.md) is Accepted; its
implementation is pending.
The smallest operation is Orchid's exact $15,000 simulated credit, with a fresh
D7-bound approval request, one atomic PostgreSQL effect/receipt commit, and a
separate verifier read. This docs-only branch is based on current main; no D6-D
code is copied or prematurely reported as merged.

After PR #21 merges, update PR #22 from main while preserving all D6-D code,
tests and documentation. Rerun repository and PostgreSQL/API validation including
the restored Workbench/browser coverage. Merge #22 only when its own reviews and
required checks pass. Then deliver D7-B only in an open implementation PR; D7-C
and D7-D remain later steps:

1. D7-B: strict operation/envelope contracts, scoped synthetic catalog enrollment,
   minimal migration, action API and atomic source/receipt persistence.
2. D7-C: independent verifier identity/read path, immutable observations and
   comparison/replay proof, including unavailable/mismatched read-back.
3. D7-D: existing Workbench action/check controls with explicit conflict/retry and
   historical/current labels, verified through the real appliance.

Each PR carries the acceptance tests in D-033. External writes, production
identity, connectors, a generic worker framework and D8 economics remain out of
scope. A verified credit does not prove customer impact or permit Case closure.

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
