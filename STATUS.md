# Status

Current milestone: PR2 — Case and event engine

## Implemented

- Product constitution and v0 trust boundary.
- pnpm and TypeScript monorepo foundation.
- Canonical Case and CaseJournalEntry JSON Schemas.
- ECC workflow contract, decision graph, 30-case evaluation set, and first canonical
  fixture.
- Deterministic case-state transition helpers.
- Pure case command engine returning deeply frozen state with injected time and ID
  dependencies.
- Idempotent case creation and explicitly targeted WorkEvent attachment.
- Optimistic case versions, tenant/scope enforcement, and deterministic conflict
  results.
- Schema-validated, hash-chained case journal with replay and projection-drift
  detection.
- Attributed audit projection for creation, attachment, accepted transitions, and
  rejected transition attempts.
- Fail-closed resolution until the complete closure-proof engine is implemented.
- Fail-closed executed-action invariant until the authorization-envelope proof
  engine is implemented.
- Contract, workflow, fixture, and transition tests.
- Local PostgreSQL Compose configuration and credential-free CI foundation.

## Verified

- `pnpm install --frozen-lockfile`
- `pnpm validate`
- 40 tests pass, including the canonical Case fixture, all 30 evaluation schemas,
  idempotency and source-event conflicts, journal replay/tamper checks, projection
  drift, authority/verification negative cases, graph activation blockers, and
  local database exposure checks.
- Docker's native `compose config` check remains in CI; Docker is unavailable in
  the current build environment.

## Known gaps

- The engine is an in-memory evaluation component. It does not provide durable or
  concurrent persistence, an API, worker, CLI, or workbench yet.
- Event attachment requires an explicitly selected case. Automatic ECC candidate
  matching and ambiguous-merge handling are not implemented yet.
- No authority engine, action gateway, or independent verifier yet.
- Declared action payload hashes are not independently recomputed; every claimed
  executed action therefore fails closed in this milestone.
- No provider or live connector implementation.
- PostgreSQL image digest must be pinned before a distributable release.
- Upstream JSON, graph, and PostgreSQL contracts have documented parity gaps that
  must be reconciled before the reference SQL becomes a PR4 migration.
- ECC v0.1.0 is shadow/evaluation-only; activation is deliberately blocked.
- Public license and paid/open-core boundary are intentionally unresolved.

## Next

After PR2 review: PR3 runs the shadow ECC evaluation pack through deterministic
qualification, evidence, conflict, ownership, and decision-packet behavior.
