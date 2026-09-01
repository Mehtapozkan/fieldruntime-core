# Field Runtime Core

Field Runtime Core is an Apache-2.0-licensed, self-hosted evaluation preview of an
**Enterprise Case Runtime**: a governed layer designed to carry consequential work
from scattered evidence to an authorized, independently verified outcome.

Most AI systems stop at an answer or a completed task. Consequential work does not.
It crosses systems and people, accumulates contradictory evidence and commitments,
and requires authority that changes with the consequence. Field Runtime keeps that
work together as one complete case: evidence, conflicts, participants, commitments,
decision options, authority, approvals, exact actions, independent verification,
outcomes, corrections, receipts, and replay lineage.

The goal is to increase an experienced operator's power without transferring
control to a model or provider. Models and agents may propose; named people retain
authority. Canonical case state and deterministic controls stay in the runtime,
while models, agent harnesses, memory systems, work surfaces, and connectors remain
replaceable adapters. Organizations can change providers without surrendering the
case history, operating rules, or learning they created.

> **Evaluation Preview** — Synthetic cases. Simulated authority. No external
> writes. Not production software. Production authority must be earned.

![Field Runtime Guided Workbench](docs/assets/guided-workbench-preview.svg)

The first-run story is direct-to-case: four synthetic sources disagree, the model
proposes, named people retain authority, a fixture connector reports success, and
a simulated independent read-back finds no matching update. The walkthrough shows
why the effect must be rejected and the case kept open.

[Run the five-minute evaluation](docs/guides/5-minute-evaluation.md) ·
[Read the security boundary](SECURITY.md) · [See the open-core boundary](OPEN_CORE.md)

## Evaluation preview boundary

This repository is an **evaluation foundation**, not a production release. It is
local-first, synthetic, deterministic in its implemented runtime slice, and makes
no external writes. It needs no model API key or enterprise credentials.

Implemented in the current evaluation foundation:

- A TypeScript and pnpm monorepo foundation.
- The canonical Field Runtime Case and CaseJournalEntry JSON Schemas.
- The Escalation and Commitment Control (ECC) workflow contract and decision graph.
- Thirty synthetic evaluation cases and one schema-valid canonical case fixture.
- A scored ECC Production Test with a gold-isolated adapter boundary,
  machine-readable hash-addressed receipts, hard safety gates, and a failing
  answer-only negative control.
- Deterministic case-state transition helpers.
- A pure case engine with idempotent creation, explicitly targeted event attachment,
  optimistic version checks, and fail-closed transitions.
- A schema-validated, hash-chained case journal with deterministic replay, audit
  projection, and projection-drift detection.
- Durable PostgreSQL projection, journal, idempotency, source-identity, and emitted-ID
  persistence with atomic commands, compare-and-swap projection updates, and
  append-only controls.
- A loopback-only HTTP API, in-process transactional worker, checksum-bound
  migrations, and immutable evaluation-fixture catalog.
- A fail-closed `fr` CLI plus Docker Compose appliance for the ECC demo.
- A direct-to-case guided workbench that makes the complete ECC story visible as
  an explicitly synthetic, non-authoritative simulation.
- Contract, fixture, transition, idempotency, journal, persistence, API, CLI, and
  adversarial tests.

Planned, not implemented yet: automatic ECC case matching, authoritative approval
evaluation, controlled action execution, runtime-enforced independent read-back,
live connectors, identity federation, high availability, and production operations.

## Target product boundary

| Layer              | What it does                                                     | Typical authority                                     |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Copilot            | Produces an answer or insight                                    | Advisory, with optional tool grants                   |
| Automation         | Runs an expected procedure                                       | Predefined path only                                  |
| Standalone agent   | Completes a bounded task                                         | Bounded task grant                                    |
| Field Runtime Core | Retains the complete case through an authorized, verified result | Deterministic policy plus attributable human approval |

Field Runtime is not another agent. Its product contract is the governed runtime
around agents and systems of record that retains the case through uncertainty,
handoffs, approval, action, independent verification, and correction.

Models and agents may extract, synthesize, and recommend. They cannot authorize,
execute, verify their own work, or promote learning inside the trusted core.

The current preview makes that contract inspectable with synthetic fixtures and a
guided simulation. The deterministic authority, action, and verification controls
needed to enforce the complete contract at runtime are planned for GitHub PR #8;
they are not implemented in this release candidate.

## Quick start

Repository validation requires Node.js 24 and pnpm 11.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate

# Run the 30-case Field Runtime Production Test
pnpm eval:ecc -- --subject-version=<commit-sha>
```

The local appliance additionally requires Docker with Compose. From the cloned
repository root:

```bash
pnpm fr init ecc --demo
pnpm fr up

# Open http://127.0.0.1:3210/ in a browser
curl http://127.0.0.1:3210/readyz
curl http://127.0.0.1:3210/v0/evaluation-fixtures/ecc/case_acme_sso_001
```

`fr up` refuses contradictory configuration and directories that are not the
Field Runtime Core repository root. The API and PostgreSQL ports are bound to
loopback, the runtime is fixed to simulation mode, and external writes are
disabled. The bundled credentials are local-evaluation credentials only.

See [local evaluation operations](docs/operations/local-evaluation.md) for API
routes, shutdown, data retention, and troubleshooting.

For the complete six-action product story, use the
[five-minute evaluation](docs/guides/5-minute-evaluation.md).

## Repository map

```text
apps/api/                Loopback-only local evaluation API
apps/admin/              Guided Case → Decision → Act & Verify → Receipt workbench
apps/worker/             In-process transactional command and bootstrap services
packages/domain/         Deterministic domain vocabulary and state rules
packages/contracts/      Canonical boundary schemas
packages/runtime/        Pure engine plus PostgreSQL persistence boundary
packages/cli/            Fail-closed local appliance CLI
packages/ecc-pack/       ECC workflow, decision graph, fixtures, and evals
docs/benchmarks/         Published evaluation methodology and honest limitations
docs/                    Architecture, security, and operations
tests/                   Cross-package contract tests
```

Read `PRODUCT_SPEC.md`, `AGENTS.md`, and `STATUS.md` before changing product
behavior. Architecture decisions live in `DECISIONS.md`.

## Public roadmap

These numbers match the actual GitHub pull-request sequence. Earlier planning
drafts called authority and verification “PR6”; GitHub PR #6 became the public
release-readiness change, so authority and verification is now PR #8.

| GitHub PR                                | Status  | Scope                                                                                                                                                     |
| ---------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #6 — Public Evaluation Preview Readiness | Merged  | Apache 2.0 boundary, governance and security files, pinned infrastructure, release checks, preview image, and first-run guide                             |
| #7 — Public Launch Finalization          | Merged  | Final public copy, release-state reconciliation, repository metadata and protection checks, anonymous-clone verification, and prerelease publication gate |
| #8 — Authority and Verification          | Planned | Deterministic authority matrix, payload-bound approvals, simulated action gateway, and runtime-enforced independent read-back                             |
| #9 — Provider Adapters                   | Planned | Bounded model, memory, agent-harness, and connector interfaces, beginning with mocks and contract tests                                                   |
| #10 — Receipts and Economics             | Planned | Full receipt chain plus resolution-time, handoff, intervention, commitment, and verified-result measures                                                  |
| #11 — Correction and Replay              | Planned | Append-only correction, branching, changed-fact replay, and governed learning-candidate review                                                            |
| #12 — Packaged Evaluation Release        | Planned | Installer, signed artifacts, SBOM, provenance, and documented upgrade and uninstall paths                                                                 |

Planned means planned, not present in this evaluation preview. See [`PLAN.md`](PLAN.md)
for exit criteria and [`STATUS.md`](STATUS.md) for the implemented boundary.

## Distribution

Field Runtime Core source is publicly distributed under the
[Apache License 2.0](LICENSE). The first workflow pack is ECC. The
`v0.1.0-evaluation-preview.0` source release is published as a GitHub prerelease
after completing the [repository checklist](docs/releases/public-repository-checklist.md)
and hosted CI.

This source release is clone-based. Signed artifacts, a standalone installer,
SBOM, provenance, upgrades, and uninstall flows remain a later milestone. See
[`OPEN_CORE.md`](OPEN_CORE.md), [`TRADEMARKS.md`](TRADEMARKS.md), and the
[`v0.1.0 evaluation preview`](docs/releases/v0.1.0-evaluation-preview.md) notes.

## About Field Runtime

Field Runtime is the company behind this project. Its broader product vision is:
**run your company on intelligence you own.** Start with one decision-heavy
workflow, assemble the evidence, keep the decision with the right person,
coordinate action to a verified outcome, and carry reviewed learning into the next
case—without replatforming or model lock-in. Your data and learning remain yours.

Field Runtime Core is the inspectable, evaluation-only foundation for that vision;
it is not the production platform or a hosted Field Runtime service. Learn more at
[fieldruntime.ai](https://fieldruntime.ai).
