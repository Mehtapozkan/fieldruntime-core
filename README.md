# Field Runtime Core

Field Runtime Core is a self-hosted enterprise case runtime for consequential work.
It carries a complete case from fragmented evidence through an authorized decision,
controlled action, independent verification, receipt, correction, and replay.

> Local scaffold validation requires no credentials. Production authority must be
> earned.

## Current release boundary

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
- A pure in-memory case engine with idempotent creation, explicitly targeted event
  attachment, optimistic version checks, and fail-closed transitions.
- A schema-validated, hash-chained case journal with deterministic replay, audit
  projection, and projection-drift detection.
- Contract, fixture, transition, idempotency, journal, and adversarial tests.
- PostgreSQL local-evaluation configuration and CI.

Planned, not implemented yet: durable case persistence, automatic ECC case
matching, authority evaluation, controlled action execution, independent read-back
verification, the guided workbench, live connectors, identity federation, high
availability, and production operations.

## Product boundary

| Layer              | What it does                                                | Typical authority                                     |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| Copilot            | Produces an answer or insight                               | Advisory, with optional tool grants                   |
| Automation         | Runs an expected procedure                                  | Predefined path only                                  |
| Standalone agent   | Completes a bounded task                                    | Bounded task grant                                    |
| Field Runtime Core | Carries the complete case to an authorized, verified result | Deterministic policy plus attributable human approval |

Field Runtime is not another agent. It is the governed runtime around agents and
systems of record that retains the case through uncertainty, handoffs, approval,
action, independent verification, and correction.

Models and agents may extract, synthesize, and recommend. They cannot authorize,
execute, verify their own work, or promote learning inside the trusted core.

## Quick start

Requirements: Node.js 24, pnpm 11, and optionally Docker for PostgreSQL.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate

# Run the 30-case Field Runtime Production Test
pnpm eval:ecc -- --subject-version=<commit-sha>
```

Start only the local evaluation database:

```bash
docker compose up -d postgres
docker compose ps
```

The Compose credentials are intentionally local-only. Do not reuse them in a
shared or production environment. PR2 does not use this database; it is reserved
for the PR4 local appliance.

## Repository map

```text
apps/                    Reserved deployable surfaces
packages/domain/         Deterministic domain vocabulary and state rules
packages/contracts/      Canonical boundary schemas
packages/runtime/        Pure case command, journal, replay, and integrity engine
packages/ecc-pack/       ECC workflow, decision graph, fixtures, and evals
docs/benchmarks/         Published evaluation methodology and honest limitations
docs/                    Architecture, security, and operations
tests/                   Cross-package contract tests
```

Read `PRODUCT_SPEC.md`, `AGENTS.md`, and `STATUS.md` before changing product
behavior. Architecture decisions live in `DECISIONS.md`.

## Distribution

The intended product is a downloadable, self-hosted Field Runtime Core with
installable workflow packs. The first pack is ECC. Licensing and the commercial
open-core boundary are deliberately unresolved; no public license is granted by
this scaffold.
