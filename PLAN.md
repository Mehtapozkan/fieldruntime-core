# Delivery Plan

Each pull request must remain independently reviewable and leave the repository in
a passing state.

Delivery position: PR1–PR5 are merged. Public evaluation-preview preparation is in
progress; PR6 remains the next product milestone after release evidence passes.

| PR                                | Outcome                                                                                                                                          | Exit criteria                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1 — Constitution and scaffold     | Product boundary, monorepo, canonical Case schema, ECC contract, first fixture, tests, CI                                                        | Clean install and `pnpm validate` pass without credentials                             |
| 2 — Case and event engine         | Deterministic state machine, hash-chained case journal, idempotent case creation, explicit case-targeted WorkEvent attachment, and audit lineage | Journal replay, tamper, projection-drift, transition, and duplicate-event tests pass   |
| 3 — ECC pack runner               | Execute all 30 synthetic cases through qualification, evidence, conflicts, ownership, and decision packet                                        | Deterministic assertions pass and failures are explicit                                |
| 4 — Local appliance               | API, in-process worker, lossless PostgreSQL event store, immutable fixture catalog, `fr init ecc --demo`, and `fr up`                            | Fresh-volume demo creates, updates, restarts, replays, and deduplicates in CI          |
| 5 — Guided workbench              | Direct-to-case Case, Decision, Act & Verify, and Receipt experience with an explicitly non-authoritative guided simulation                       | Six-action walkthrough, accessibility, local-only browser, and appliance smoke pass    |
| Release prep — Evaluation preview | Apache 2.0 boundary, public governance and security files, pinned infrastructure, release checks, screenshot, and five-minute walkthrough        | Public-release audit and hosted appliance CI pass before repository visibility changes |
| 6 — Authority and verification    | Deterministic authority matrix, payload-bound approvals, simulated action gateway, independent read-back                                         | No bypass, self-verification, or duplicate-effect test passes                          |
| 7 — Provider adapters             | Bounded model, memory, agent-harness, and connector interfaces with mocks first                                                                  | Contract suites pass without provider payload leakage                                  |
| 8 — Receipts and economics        | Full receipt chain plus resolution-time, handoff, intervention, commitment, and verified-result measures                                         | Case is reconstructable and metrics are derivable from receipts                        |
| 9 — Correction and replay         | Append-only correction, branch, changed-fact replay, and learning candidate review                                                               | Original history remains unchanged and replay is reproducible                          |
| 10 — Evaluation release           | Installer, signed artifacts, SBOM, provenance, upgrade/uninstall docs                                                                            | Downloadable evaluation release with explicit non-production boundary                  |

Do not pull later-PR scope forward unless it is required to keep an earlier contract
executable or safely testable.
