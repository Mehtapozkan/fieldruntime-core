# Status

Current milestone: v0.1.0 Evaluation Preview release candidate

Release position: GitHub PRs #6 (Public Evaluation Preview Readiness), #12
(Public Launch Finalization), #14 (Automate the Evaluation Prerelease), and #15
(Align public roadmap to Case-first product architecture) are merged. The
repository and `v0.1.0-evaluation-preview.0` GitHub prerelease are public. D6 is
in progress; D6-A defines contracts and does not complete the governed runtime.

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
- Direct-to-case browser workbench served from the existing loopback appliance with
  no signup, API key, blank dashboard, third-party asset, or external request.
- Six-action Case, Decision, Act & Verify, and Receipt walkthrough that makes the
  Acme evidence conflict, multiplayer authority route, exact payload boundary,
  silent connector failure, independent read-back, effect rejection, safe recovery,
  correction, and learning preview visible without typing or JSON knowledge.
- Strict guided-walkthrough contract and immutable companion fixture bound to the
  canonical Acme fixture hash, evidence, decision options, authority roles, action
  IDs, payload hashes, idempotency key, attempt lineage, verifier identities, and
  reconstructable nine-step trace.
- Presentation boundary fixed to synthetic simulation, zero external effects, no
  authority grant, no authoritative case mutation, no replay claim, and no
  production receipt. Missing, unsafe, or drifted walkthrough data fails closed.
- Exact static-route allowlist with raw MIME-correct responses, strict no-inline
  same-origin CSP, traversal denial, no-referrer, nosniff, and same-origin browser
  isolation.
- Responsive, keyboard-operable workbench with semantic landmarks, explicit focus
  handling, live announcements, reduced-motion behavior, contrast gates, and a
  maximum six deliberate interactions through the guided path.
- `fr up` now prints `http://127.0.0.1:3210/` after the appliance reaches readiness.
- Apache License 2.0 source boundary with explicit trademark and open-core terms;
  every workspace package remains registry-private to prevent accidental publish.
- Public contribution, conduct, vulnerability-reporting, third-party-license, and
  release-boundary documentation.
- Five-minute first-run guide and committed Guided Workbench preview.
- Automated public-release check for required artifacts, high-confidence secrets
  in tracked files and history, approved production dependency licenses, package
  metadata, and exact PostgreSQL image pinning.
- PostgreSQL 17.11 Alpine and Node.js 24 Bookworm Slim images pinned to their
  multi-platform OCI digests.
- Dependabot coverage for pnpm, Docker, and GitHub Actions dependencies.
- Provider-neutral, tenant-scoped identity references for attributable human,
  agent, and service identities; display and role metadata remain
  non-authoritative.
- Versioned contracts for exact-Case responsibility, scoped delegation,
  consequence-bound Authority Requests, approval/decision envelopes, and explicit
  fail-closed Authority Resolution Results.
- Contract-level invariants for tenant isolation, independent executor/verifier
  identities, coherent delegation windows, agent authority denial, same-rank
  conflict preservation, and immutable request/decision/result bindings.
- Synthetic D6-A vectors for the $15K/$10K authority threshold, recorded Finance
  approval with Executive Sponsor authority still required, expired and stale
  delegations, same-rank conflict, stale Case state, and agent self-approval denial.

## Verified

- `pnpm install --frozen-lockfile`
- `pnpm validate`
- `pnpm release:check` passes across 135 current files, complete reachable Git
  history, required public-release artifacts, pinned container images, package
  metadata, and production dependency licenses.
- 152 tests pass, including 16 D6-A identity, delegation, responsibility,
  immutable authority-binding, lifecycle, conflict, and agent-authority tests;
  the canonical Case fixture; all 30 evaluation schemas;
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
  rollback-client eviction, concurrent writers, readiness integrity, durable
  topology contracts, walkthrough schema and cross-bindings, simulation safety,
  reducer gating, six-action journey, local-only browser behavior, accessible
  static structure, security headers, exact asset routing, and traversal denial.
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
  a standalone installer and signed distributable remain D14 scope.
- Event attachment currently requires an explicitly selected Case. Automatic Case
  formation, candidate matching, and ambiguous-merge handling are not implemented.
- Importing or mapping an existing external Case while preserving its upstream
  system of record is not implemented.
- Operational Legibility evaluation is not implemented.
- The deterministic authority resolution engine is not implemented; D6-B must
  consume the D6-A contracts and fail closed when no unique authority is proven.
- The Decision Packet is not backed by authoritative D6 authority evaluation.
- The action gateway is not implemented.
- The independent runtime verifier is not implemented.
- Declared action payload hashes are not independently recomputed; every claimed
  executed action therefore fails closed in this milestone.
- No general worker runtime or provider adapter implementation.
- No live connector implementation.
- The drifted upstream normalized PostgreSQL SQL remains reference-only. PR4 uses
  its own lossless event-store migration; a normalized model still requires
  explicit parity reconciliation and conformance tests.
- ECC v0.1.0 is shadow/evaluation-only; activation is deliberately blocked.
- The preview is source-clone distribution only. Signed artifacts, installers,
  SBOM, provenance, upgrade, and uninstall flows remain D14 scope.
- Evaluation inputs and gold currently share the Core repository. The adapter
  cannot receive gold at runtime, but held-out and externally authored cases do not
  exist yet.
- The current result is synthetic and deterministic; it does not measure live
  providers, human usefulness, resolution economics, or production performance.
- The guided authority, connector response, read-back, recovery, receipt, and
  learning trace is presentation-only. D6–D8 must replace it with
  deterministic authority envelopes, a simulated action gateway, and
  runtime-enforced independent verification before those controls can mutate an
  authoritative case.
- Authority shown in the Guided Workbench remains simulated until later D6/D7
  work.

## Next

D6-B — Deterministic Authority Resolution is next: consume the D6-A contracts to
resolve explicit policy, delegation, and registry evidence without silently
choosing authority. Runtime-backed Decision Packet work follows within D6.

The immediate engineering order remains D6 → D7 → D8 → D9 → D10 → D11 → D12.
This roadmap alignment does not displace the trusted-kernel priority, add live
connectors or external writes, or implement any of those planned capabilities.
