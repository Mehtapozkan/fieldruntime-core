# Status

Current milestone: v0.1.0 Evaluation Preview release candidate

Release position: GitHub PRs #6 (Public Evaluation Preview Readiness), #12
(Public Launch Finalization), #14 (Automate the Evaluation Prerelease), and #15
(Align public roadmap to Case-first product architecture) are merged. The
repository and `v0.1.0-evaluation-preview.0` GitHub prerelease are public. D6 is
in progress; D6-A defines contracts and D6-B adds deterministic authority
resolution. PR #18 repaired the authority correctness defects. PR #19 is merged
at `76c9b472eabaff4e66ee4d5dd4ade6c144f95f7e`, including Accepted D-032 and its
explicit human approval. **D6-C [PR #20](https://github.com/Mehtapozkan/fieldruntime-core/pull/20)
is merged at `940462ec0a666975e3530763349bad89986cf457`**, from reviewed head
`21298695ed47f3239105cb832ae80bbb72699325` with passing required CI. Its addressed
reviewer-eligibility thread is resolved. **D6-D is implemented for review**:
the Guided Workbench now uses persistent synthetic request review and the runtime
Decision Packet API. The D6-D PR remains unmerged; no release, deployment, external
writes or D7 execution is included.

## D6-D implementation

- Explicit, idempotent demo initialization creates one synthetic Orchid credit
  Case through Case commands. Packet opening, refresh and revisit use only reads;
  they never initialize a demo or change durable history, IDs, C/R/S or clocks.
- The existing Workbench layout displays the exact $15K proposal/customer, retained
  evidence/provenance, conflicts, unknowns, recommendation, required approvals and
  recorded review history from API responses. Finance → refresh → Executive →
  refresh → browser reload reconstructs the same request and decisions.
- Server-enrolled synthetic seats remain labeled. Decisions send the reviewed
  request hash, C/R/S and correlation ID. Terminal interventions use independent
  server reviewer eligibility, not the whole-request `current.eligible` flag.
  Reject/modify/escalate collect reasons; modification opens an unapproved R0
  replacement. No client authority calculation or transferred approvals exist.
- Conflicts require explicit refresh and deliberate resubmission. An uncertain
  write retains its exact command/seat/key before transmission; reload and retry
  recover the historical receipt. Local session storage holds navigation and retry
  information only. No unconfirmed success is displayed as a recorded decision.
- Retained operations evidence can be attached via Case commands to advance C,
  invalidate prior approvals visibly and offer an explicit fresh request requiring
  fresh review. Historical receipts stay distinct from current eligibility.
- Approval completion says **Approvals complete — execution unavailable**. Case
  closure remains blocked. The Acme action/receipt simulation is isolated at
  `/?view=legacy`; frozen fixtures and its presentation reducer are unchanged.
- No runtime/schema/migration changes. Two fixed browser modules reuse existing
  API routes and CSP. Playwright is a pinned development-only test dependency.
- [Walkthrough, retry behavior and browser checks](apps/admin/README.md).

## D6-C implementation

- Strict request/decision/command/journal/read v1 contracts and explicit validated
  projection into the repaired v0 resolver. Existing v0 schemas, Case arrays,
  D-014 and frozen ECC corpus/gold remain unchanged.
- Additive checksum-bound migration `0002_authority_request_review` retains
  immutable review/evaluation snapshots, a separate request journal and the
  runtime-controlled catalog. `0001_local_appliance` and Case history are intact.
- Create, approve, reject, modify and escalate through the existing worker/HTTP
  boundary. Decisions advance R, never C; C or S changes invalidate old requests.
  Rejection and escalation terminate; modification atomically supersedes the old
  request and creates a fresh R=0 binding with no inherited approvals.
- Server-selected synthetic actors, policy, authority, delegations and evidence;
  strict commands reject client-supplied authority inputs. Current identity, scope,
  policy, complete delegation paths, expiry and clock guards are rechecked under
  the existing writer transaction. Duplicate receipts remain historical evidence.
- Request/packet reads use one read-only repeatable snapshot: no writer lock,
  preview persistence, ID reservation, revision increment or clock update. Consent
  material and accepted evaluation evidence survive restart without claiming that
  a human inspected a screen.
- SQL constraints, immutable hash bindings and deterministic replay check journal,
  catalog, snapshots, replacement pairs and JSONB/index agreement. Failed writes
  roll back; failed rollback discards the client.
- Reviewer eligibility validates the reviewer's complete authority path before
  per-principal approval deduplication or quota selection. Finance and its delegate
  can independently reject, modify or escalate after the other fills a permitted
  approval slot. The default named-Finance restriction is unchanged; unresolved
  conflicts still block approval and invalid reviewers gain no intervention rights.
- New evaluations record `authority-resolution.d6c.v2`; retained v1 evaluations
  replay with their original eligibility calculation. Both supported versions are
  explicit in the v1 evidence contracts. No tables, migrations, endpoints or
  client-controlled version selection were added for this repair.
- [API examples, reproducible demo and migration notes](docs/guides/d6-authority-review.md).

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
- Browser workbench served from the existing loopback appliance with
  no signup, API key, blank dashboard, third-party asset, or external request.
- Separate legacy six-action Case, Decision, Act & Verify, and Receipt walkthrough that makes the
  Acme evidence conflict, multiplayer authority route, exact payload boundary,
  silent connector failure, independent read-back, effect rejection, safe recovery,
  correction, and learning preview visible without typing or JSON knowledge.
- Strict guided-walkthrough contract and immutable companion fixture bound to the
  canonical Acme fixture hash, evidence, decision options, authority roles, action
  IDs, payload hashes, idempotency key, attempt lineage, verifier identities, and
  reconstructable nine-step trace.
- Legacy presentation boundary fixed to synthetic simulation, zero external effects, no
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
- Pure, provider-neutral deterministic authority resolution over an exact Case,
  Authority Request, consequence hash, approved rank-one threshold policy,
  authority records, scoped delegations, and prior Authority Decisions.
- Threshold, named-principal, delegated, and multi-approver evaluation with
  machine-readable satisfied and outstanding requirements plus exact policy,
  authority, delegation, and approval evidence references.
- Explicit fail-closed authority outcomes for missing or malformed policy,
  contradictory policy, missing or ambiguous authority, expired or revoked
  delegation, stale Case state, cross-tenant records, hash drift, and invalid
  self-approval.
- Same-rank authority conflicts remain unresolved even after sufficient approvals
  arrive; explicit named principals and legitimate two-person policies still work.
- Contradictory copies of one authority-record or delegation ID fail closed before
  status, scope, or effective-time filtering; identical copies remain harmless.
- Delegated approvals require a cited grant and its own supporting authority
  record to be valid at both evaluation and decision time. An uncited grant or
  another delegator's authority cannot fill a gap in that path.
- Evaluator attribution matches the active canonical identity. Delegation approval
  attribution requires a known tenant/kind-matching principal with an active
  recorded identity, while preserving historical attribution when that principal
  is currently inactive or revoked.

## Verified

- D6-D adds 12 focused client/API regressions and a real PostgreSQL/HTTP client
  scenario. The PostgreSQL suite passes 63 tests locally, including no durable
  changes around repeated client reads, two-person approval, restart, lost commit
  acknowledgement and exact retry, evidence invalidation and unapproved renewal.
- Chromium exercises the actual appliance for initialization, approvals/reload,
  concurrent submissions, lost-response retries, all terminal decisions, replacement,
  changed evidence, ineligible reviewers and unsafe packet responses. CI runs
  `pnpm test:workbench` after PostgreSQL/API and restart appliance smokes. Final
  commit CI evidence is linked from the D6-D PR checks.

- `pnpm install --frozen-lockfile`
- `pnpm validate`
- `pnpm release:check` passes across current files, complete reachable Git
  history, required public-release artifacts, pinned container images, package
  metadata, and production dependency licenses.
- 246 tests pass, including 12 D6-D client/API regressions, 40 D6-C contract/lifecycle/replay tests and 16 D6-A identity, delegation, responsibility,
  immutable authority-binding, lifecycle, conflict, and agent-authority tests;
  42 D6-B threshold, multi-approval, prior-decision, delegation, ambiguity,
  policy-selection, tenant, agent, evidence-lineage, immutability, and input-order
  tests;
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
- Authority correctness repairs were reproduced against main `5285f8c7`: all 30
  original resolver tests passed and nine new regressions failed on assertions,
  covering every reported defect. After repair, all 58 focused authority contract
  and resolver tests pass, including named/direct/delegated/two-person positives,
  contradictory status/time/scope copies, exact delegation timing and supporting
  records, canonical identity attribution, historical identities, and reversed
  input ordering.
- `pnpm validate` passes using Node 24.19.0 and pinned pnpm 11.24.0. Local HTTP
  tests require loopback access outside the sandbox; the sandbox-only attempt
  failed with `listen EPERM`, then the complete run passed with that access.
- `git diff --check` passes.
- The reviewer defect was reproduced before implementation changes at PR #20
  head `cf8088dd`: in each of the runtime and PostgreSQL/API suites, 6/18 new
  cases failed with `reviewer_ineligible`. All three terminal decisions failed
  after the other eligible reviewer approved, in both reviewer orderings. All
  before-approval cases and the alternate decision-ID ordering passed. After the
  correction, all 18 cases pass in each suite, with terminal authorization removal,
  unapproved replacements, restart reconstruction and duplicate-retry checks.
- New negative cases preserve named-Finance policy and reject unrelated, revoked,
  expired and out-of-scope reviewers after the slot is filled. Eligibility also
  remains independent of same-principal decision deduplication, input ordering and
  outstanding quorum. A pre-fix mixed-requirement history and the existing local
  PostgreSQL request's three v1 journal entries reconstruct under the corrected
  runtime without changing recorded evidence.
- 63 explicit API/PostgreSQL integration tests pass locally against an isolated
  PostgreSQL 18.4 instance: fresh installation, preview migration without Case
  loss, two-person review/restart, strict inputs, C/R/S races, expiry, terminal
  states, immutable read snapshots, rollback at each persistence step, uncertain
  commit retry, failed-rollback eviction and tampering/SQL constraints.
- CI runs the same suite on pinned PostgreSQL 17 and the actual Compose
  create → Finance → Executive → PostgreSQL/API restart → reconstruction demo.
  [CI run 33943965085](https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/33943965085)
  passed all 37 initial PostgreSQL scenarios, Compose config and both appliance
  smoke phases at `841adfe6`. CI runs the complete 62-scenario suite on the corrected
  PR #20 head: [CI run 33945510666](https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/33945510666)
  passed at `21298695`. D6-D extends this coverage with the Workbench path and
  browser checks on its own final commit.
- The deterministic ECC adapter passes 30/30 cases and 620/620 checks with every
  hard gate passing.
- The answer-only negative control fails 30/30 cases, scores 152/620 checks, and
  trips hard safety gates. `pnpm eval:ecc -- --negative-control` exits 1 for its
  intended assertion failures, with a complete evaluation receipt, not a crash or
  setup failure. The frozen corpus and gold hashes are unchanged.
- `docker compose config --quiet` and the fresh-volume, restart, persistence, and
  append-only smoke are required by CI. Docker is unavailable in the current local
  build environment, so the live Compose evidence is produced by the CI runner.

## Known gaps

- D6-D is a bounded synthetic credit review, not production authentication or a
  general review application. Retry information uses tab session storage; closing
  the tab can lose an unconfirmed command's local key. Committed history remains
  canonical and inspectable by request URL. Reads/decisions can take longer as
  whole-history integrity replay grows; requests time out visibly and fail closed.
- D6-D adds no migration. Existing preview history, strict v0 contracts, frozen ECC
  fixtures and Accepted D-032 semantics remain intact. The next milestone is D7:
  controlled simulated action and independent verification, with a separately
  reviewed implementation before any execution or complete closure proof.

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
- The runtime-backed packet uses one compiled synthetic catalog/profile. There is
  no public catalog editor, live identity verification, production authentication
  or automatic import of legacy approvals. Unsupported evidence references or
  content hashes fail closed rather than fetching external content.
- Catalog authoring remains internal. The v0 conflict-result contract requires
  distinct source citations; conflicting records sharing only one source reference
  fail closed with a validation error rather than a reviewable conflict packet.
- Historical evaluations pin engine/resolver/projection versions; future semantic
  upgrades must retain their implementation or fail closed. No general version
  dispatch/history framework is introduced in this step.
- Identity references have no effective-dated status history. Historical
  delegation approval attribution verifies stable identity and its recorded
  status; this repair does not infer retroactive revocation from current status
  or add live identity verification.
- The action gateway is not implemented.
- The independent runtime verifier is not implemented.
- No external writes are implemented.
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
- The legacy guided authority, connector response, read-back, recovery, receipt, and
  learning trace is presentation-only. D7–D8 must supply
  deterministic authority envelopes, a simulated action gateway, and
  runtime-enforced independent verification before those controls can mutate an
  authoritative case.
- Workbench review history is persistent but all actors, policy and evidence remain
  synthetic. Production identity and execution are outside D6-D.

## Next

Review the D6-D Workbench implementation and its final-commit PostgreSQL/API,
Compose, appliance-smoke and browser evidence before merging. D7 is the next
controlled simulated Action Gateway and independent verification milestone;
incomplete proof still cannot close a Case. No later capability is enabled by a
review approval. D6-D does not release or deploy the changes.

The immediate engineering order remains D6 → D7 → D8 → D9 → D10 → D11 → D12.
This roadmap alignment does not displace the trusted-kernel priority, add live
connectors or external writes, or implement any of those planned capabilities.
