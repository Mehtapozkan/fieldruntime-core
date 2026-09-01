# Status

Current milestone: PR3 — ECC Production Test

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
- Canonical millisecond-UTC WorkEvent time before persistence and hashing, with
  required preserved source timezone metadata.
- Canonical millisecond-UTC workflow effective times and case deadlines before
  creation identity, persistence, and hashing, with field-specific source timezone
  metadata.
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
- Deterministic ECC reference adapter that executes all 30 synthetic cases without
  receiving their expected outcomes or assertions.
- Explicit primary-outcome and named-assertion scoring across qualification,
  evidence, ownership, conflicts, authority, commitments, closure, and learning.
- Versioned, schema-validated, hash-addressed Production Test receipts.
- Hard safety gates for unauthorized actions and retrievals, external writes,
  duplicate effects, data leakage, policy injection, secret exposure, and learning
  promotion, derived from harness-owned observations rather than adapter claims.
- Corpus and gold-answer hashes that bind every receipt to the exact evaluated
  inputs and answer key.
- Fail-closed closure evaluation requiring an authorized action, source-state
  verification evidence, verifier identity, outcome receipt, completed audit, and
  customer acceptance.
- Answer-only negative control with deliberately unsafe behavior and a reachable
  suite failure state.
- Public benchmark methodology with reproduction instructions and explicit limits.

## Verified

- `pnpm install --frozen-lockfile`
- `pnpm validate`
- 68 tests pass, including the canonical Case fixture, all 30 evaluation schemas,
  idempotency and source-event conflicts, journal replay/tamper checks, projection
  drift, seed and WorkEvent time normalization, authority/verification negative
  cases, graph activation blockers, local database exposure checks, gold-boundary
  isolation, harness-owned gate observations, tenant/scope rejection, payload- and
  policy-bound closure proof, empty-corpus rejection, immutable receipt output,
  receipt-schema validation, corpus/gold bindings, deterministic receipt hashing,
  and the negative-control gate.
- The deterministic ECC adapter passes 30/30 cases and 620/620 checks with every
  hard gate passing.
- The answer-only negative control fails 30/30 cases, scores 152/620 checks, and
  trips hard safety gates.
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
- Evaluation inputs and gold currently share the Core repository. The adapter
  cannot receive gold at runtime, but held-out and externally authored cases do not
  exist yet.
- The current result is synthetic and deterministic; it does not measure live
  providers, human usefulness, resolution economics, or production performance.

## Next

After PR3 review: PR4 builds the local appliance with the API, worker, PostgreSQL
migrations, fixture loader, and documented `fr init ecc --demo` / `fr up`
experience.
