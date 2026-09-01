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

## Distribution

The intended product is a downloadable, self-hosted Field Runtime Core with
installable workflow packs. The first pack is ECC. Licensing and the commercial
open-core boundary are deliberately unresolved; no public license is granted by
this scaffold.
