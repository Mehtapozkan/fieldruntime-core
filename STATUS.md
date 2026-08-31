# Status

Current milestone: PR1 — Constitution and scaffold

## Implemented

- Product constitution and v0 trust boundary.
- pnpm and TypeScript monorepo foundation.
- Canonical Case JSON Schema import.
- ECC workflow contract, decision graph, 30-case evaluation set, and first canonical
  fixture.
- Deterministic case-state transition helpers.
- Contract, workflow, fixture, and transition tests.
- Local PostgreSQL Compose configuration and credential-free CI foundation.

## Verified

- `pnpm install --frozen-lockfile`
- `pnpm validate`
- 12 tests pass, including the canonical Case fixture, all 30 evaluation schemas,
  authority/verification negative cases, graph activation blockers, and local
  database exposure checks.
- Docker's native `compose config` check remains in CI; Docker is unavailable in
  the current build environment.

## Known gaps

- No runtime persistence, API, worker, CLI, or workbench yet.
- No authority engine, action gateway, or independent verifier yet.
- No provider or live connector implementation.
- PostgreSQL image digest must be pinned before a distributable release.
- Upstream JSON, graph, and PostgreSQL contracts have documented parity gaps that
  PR2 must reconcile before the SQL becomes a migration.
- ECC v0.1.0 is shadow/evaluation-only; activation is deliberately blocked.
- Public license and paid/open-core boundary are intentionally unresolved.

## Next

PR2: deterministic case and event engine with immutable journal, idempotent
create/merge, state transition enforcement, and audit lineage.
