# Status

Current milestone: PR4 — Local Appliance

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
- Canonical tenant identities at both corpus and adapter boundaries, including
  direct adapter calls that bypass corpus schema validation.
- Fail-closed rejection of malformed live rank-one authority state before proof
  selection.
- Same-rank account-owner conflict detection before deterministic owner routing.
- Owner selection restricted to live rank-one authoritative records.
- Customer acceptance bound to the exact authorized payload, independent
  verification evidence, and outcome receipt being closed.
- Authorized policy selection rejects duplicate or contradictory records for the
  same policy identity and version.
- Closure proof records bind to the evaluated trigger event identity, preventing
  same-tenant proof reuse across cases.
- Answer-only negative control with deliberately unsafe behavior and a reachable
  suite failure state.
- Public benchmark methodology with reproduction instructions and explicit limits.
- Lossless PostgreSQL JSONB projection and journal persistence with atomic
  idempotency, source-event identity, and globally disjoint journal/audit ID
  records.
- Singleton-writer serialization, projection compare-and-swap, deferred journal
  predecessor/causation/head topology, and append-only durable records for the
  single-node evaluation boundary.
- Checksum-bound transactional migration bootstrap and immutable ECC fixture
  catalog. The legacy Acme snapshot is served only as non-authoritative and
  non-replayable evaluation data.
- Loopback-only HTTP API for health, integrity-aware readiness, tenant-scoped case
  commands and reads, journal reads, and evaluation-fixture inspection.
- In-process transactional worker with a stable command-input error taxonomy;
  unexpected store and integrity failures remain sanitized server failures.
- Idempotent `fr init ecc --demo` safe manifest plus `fr up`, which verifies the
  repository root, selects the explicit Compose file, and forces simulation mode
  with external writes disabled.
- Multi-stage API image and Docker Compose appliance with loopback-only API and
  PostgreSQL ports, read-only application filesystem, health checks, and retained
  local volume.
- CI fresh-volume appliance smoke covering migration/bootstrap, real PostgreSQL
  create and projection update paths, service restarts, durable exact duplicates,
  case/journal reads, and append-only trigger enforcement.
- Canonical JSON rejection of PostgreSQL-incompatible null characters and unpaired
  Unicode surrogates before identity, hashing, or dependency consumption.

## Verified

- `pnpm install --frozen-lockfile`
- `pnpm validate`
- 113 tests pass, including the canonical Case fixture, all 30 evaluation schemas,
  idempotency and source-event conflicts, journal replay/tamper checks, projection
  drift, seed and WorkEvent time normalization, authority/verification negative
  cases, graph activation blockers, local database exposure checks, gold-boundary
  isolation, harness-owned gate observations, tenant/scope rejection, payload- and
  policy-bound closure proof, canonical tenant identity at the adapter boundary,
  malformed authority-state rejection, same-rank owner conflicts, authoritative
  owner selection, contradictory policy rejection, trigger-bound closure proof,
  outcome-bound customer acceptance,
  empty-corpus rejection, immutable receipt output, receipt-schema validation,
  corpus/gold bindings, deterministic receipt hashing, the negative-control gate,
  migration checksum behavior, immutable fixture loading, API safety/error
  semantics, CLI fail-closed behavior, atomic persistence rollback, update rollback,
  rollback-client eviction, concurrent writers, readiness integrity, and durable
  topology contracts.
- The deterministic ECC adapter passes 30/30 cases and 620/620 checks with every
  hard gate passing.
- The answer-only negative control fails 30/30 cases, scores 152/620 checks, and
  trips hard safety gates.
- `docker compose config --quiet` and the fresh-volume, restart, persistence, and
  append-only smoke are required by CI. Docker is unavailable in the current local
  build environment, so the live Compose evidence is produced by the CI runner.

## Known gaps

- The appliance is single-node and evaluation-only. Its singleton writer lock and
  whole-state integrity hydration favor auditability over throughput; it does not
  claim sharding, high availability, online migrations, backups, or production
  operations.
- The unauthenticated API is safe only inside the documented loopback appliance.
  Production identity federation, authorization, tenancy administration, and
  network deployment are not implemented.
- `fr up` intentionally runs only from a cloned Field Runtime Core repository root;
  a standalone installer and signed distributable remain PR10 scope.
- Event attachment requires an explicitly selected case. Automatic ECC candidate
  matching and ambiguous-merge handling are not implemented yet.
- No authority engine, action gateway, or independent verifier yet.
- Declared action payload hashes are not independently recomputed; every claimed
  executed action therefore fails closed in this milestone.
- No provider or live connector implementation.
- PostgreSQL image digest must be pinned before a distributable release.
- The drifted upstream normalized PostgreSQL SQL remains reference-only. PR4 uses
  its own lossless event-store migration; a normalized model still requires
  explicit parity reconciliation and conformance tests.
- ECC v0.1.0 is shadow/evaluation-only; activation is deliberately blocked.
- Public license and paid/open-core boundary are intentionally unresolved.
- Evaluation inputs and gold currently share the Core repository. The adapter
  cannot receive gold at runtime, but held-out and externally authored cases do not
  exist yet.
- The current result is synthetic and deterministic; it does not measure live
  providers, human usefulness, resolution economics, or production performance.

## Next

After PR4 review: PR5 builds the guided Case, Decision, Act & Verify, and Receipt
workbench against the local appliance without pulling production authority or live
connectors forward.
