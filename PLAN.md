# Delivery Plan

Each pull request must remain independently reviewable and leave the repository in
a passing state.

Delivery position: GitHub PRs #1–#7 are merged. The public source preview and
`v0.1.0-evaluation-preview.0` prerelease are published. PR #8 is the next planned
product milestone.

The numbers below match the actual GitHub pull-request sequence. Earlier planning
drafts labeled authority and verification “PR6.” That milestone is now PR #8
because GitHub PR #6 delivered public evaluation-preview readiness and PR #7
finalizes the launch boundary.

| GitHub PR                                | Status  | Outcome                                                                                                                                                   | Exit criteria                                                                                                             |
| ---------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| #1 — Constitution and scaffold           | Merged  | Product boundary, monorepo, canonical Case schema, ECC contract, first fixture, tests, and CI                                                             | Clean install and `pnpm validate` pass without credentials                                                                |
| #2 — Case and event engine               | Merged  | Deterministic state machine, hash-chained case journal, idempotent case creation, explicit case-targeted WorkEvent attachment, and audit lineage          | Journal replay, tamper, projection-drift, transition, and duplicate-event tests pass                                      |
| #3 — ECC pack runner                     | Merged  | Execute all 30 synthetic cases through qualification, evidence, conflicts, ownership, and decision packet                                                 | Deterministic assertions pass and failures are explicit                                                                   |
| #4 — Local appliance                     | Merged  | API, in-process worker, lossless PostgreSQL event store, immutable fixture catalog, `fr init ecc --demo`, and `fr up`                                     | Fresh-volume demo creates, updates, restarts, replays, and deduplicates in CI                                             |
| #5 — Guided workbench                    | Merged  | Direct-to-case Case, Decision, Act & Verify, and Receipt experience with an explicitly non-authoritative guided simulation                                | Six-action walkthrough, accessibility, local-only browser, and appliance smoke pass                                       |
| #6 — Public Evaluation Preview Readiness | Merged  | Apache 2.0 boundary, public governance and security files, pinned infrastructure, release checks, preview image, and five-minute walkthrough              | Public-release audit and hosted appliance CI pass before repository visibility changes                                    |
| #7 — Public Launch Finalization          | Merged  | Final public copy, release-state reconciliation, repository metadata and protection checks, anonymous-clone verification, and prerelease publication gate | Final `main` passes hosted CI and `pnpm release:check`; every checklist stop condition is clear before visibility changes |
| #8 — Authority and Verification          | Planned | Deterministic authority matrix, payload-bound approvals, simulated action gateway, and independent read-back                                              | No bypass, self-verification, unbound-payload, or duplicate-effect test passes                                            |
| #9 — Provider Adapters                   | Planned | Bounded model, memory, agent-harness, and connector interfaces with mocks first                                                                           | Contract suites pass without provider payload leakage or provider-owned canonical state                                   |
| #10 — Receipts and Economics             | Planned | Full receipt chain plus resolution-time, handoff, intervention, commitment, and verified-result measures                                                  | The case is reconstructable and metrics are derivable from immutable receipts                                             |
| #11 — Correction and Replay              | Planned | Append-only correction, branch, changed-fact replay, and governed learning-candidate review                                                               | Original history remains unchanged and replay is reproducible                                                             |
| #12 — Packaged Evaluation Release        | Planned | Installer, signed artifacts, SBOM, provenance, and upgrade/uninstall documentation                                                                        | Downloadable evaluation distribution retains the explicit non-production boundary                                         |

“Planned” does not mean implemented or committed to a release date. Do not pull
later-PR scope forward unless it is required to keep an earlier contract executable
or safely testable.
