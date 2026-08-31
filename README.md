# Field Runtime Core

Field Runtime Core is a self-hosted enterprise case runtime for consequential work.
It carries a complete case from fragmented evidence through an authorized decision,
controlled action, independent verification, receipt, correction, and replay.

> Local scaffold validation requires no credentials. Production authority must be
> earned.

## Current release boundary

This repository is an **evaluation foundation**, not a production release. It is
local-first, synthetic, deterministic where authority is involved, and makes no
external writes. It needs no model API key or enterprise credentials.

Implemented in this first scaffold:

- A TypeScript and pnpm monorepo foundation.
- The canonical Field Runtime Case JSON Schema.
- The Escalation and Commitment Control (ECC) workflow contract and decision graph.
- Thirty synthetic evaluation cases and one schema-valid canonical case fixture.
- Deterministic case-state transition helpers.
- Contract, fixture, and transition tests.
- PostgreSQL local-evaluation configuration and CI.

Planned, not implemented yet: case persistence, authority evaluation, controlled
action execution, independent read-back verification, the guided workbench, live
connectors, identity federation, high availability, and production operations.

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
```

Start only the local evaluation database:

```bash
docker compose up -d postgres
docker compose ps
```

The Compose credentials are intentionally local-only. Do not reuse them in a
shared or production environment.

## Repository map

```text
apps/                    Reserved deployable surfaces
packages/domain/         Deterministic domain vocabulary and state rules
packages/contracts/      Canonical boundary schemas
packages/ecc-pack/       ECC workflow, decision graph, fixtures, and evals
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
