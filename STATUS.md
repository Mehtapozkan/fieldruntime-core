# Status

Current milestone: D7-D Workbench action and independent-check controls, implemented
on `feat/d7d-credit-workbench` for review. D6 review and D7-B/C APIs are merged.
PR #24 merged normally at `3936843fba4126bdb852e2ee5681de0f7162525a` from reviewed
head `f72a02566c3198d53f4f53e1154112eff5a12ebb`, with passing required checks and no
unresolved review threads. Normal protections were preserved without bypass.
The published `v0.1.0-evaluation-preview.0` remains the September 1 snapshot at
`3db1b4bf0304e67e1ef51be785d1f81b906016b3`, before D6/D7. Current source and this
review branch are not a new release. [Operator functionality table](README.md#what-works-today).

Release position: GitHub PRs #6 (Public Evaluation Preview Readiness), #12
(Public Launch Finalization), #14 (Automate the Evaluation Prerelease), and #15
(Align public roadmap to Case-first product architecture) are merged. The
repository and `v0.1.0-evaluation-preview.0` GitHub prerelease are public.
D6-A defines contracts and D6-B adds deterministic authority
resolution. PR #18 repaired the authority correctness defects. PR #19 is merged
at `76c9b472eabaff4e66ee4d5dd4ade6c144f95f7e`, including Accepted D-032 and its
explicit human approval. **D6-C [PR #20](https://github.com/Mehtapozkan/fieldruntime-core/pull/20)
is merged at `940462ec0a666975e3530763349bad89986cf457`**, from reviewed head
`21298695ed47f3239105cb832ae80bbb72699325` with passing required CI. Its addressed
reviewer-eligibility thread is resolved. **D6-D merged in PR #21 at
`ba340cc5135343e12820992cf4a7542cf7cc9c29`**, preserving reviewed head
`1561329858d8340291dda505fdfe12291cece1c9` and its passing CI. The Guided Workbench
now uses persistent synthetic request review and the runtime Decision Packet API.
No release or deployment accompanies this work. D7-B below supports only bounded
local simulated source writes; external writes remain disabled.

The human operator accepted the supplied desktop/390px visual review for
`1561329858d8340291dda505fdfe12291cece1c9` on 2026-09-05: “Accept the current
presentation for this milestone; no further UI redesign is required before merge.”
This records D6-D presentation acceptance, not a GitHub approving review or approval
of D-033. No additional visual checks or UI changes are claimed by D7-B/C.

The two retained D6-D UI follow-ups are implemented on this D7-D branch:

- Acknowledge an already-recorded approval using validated server history while
  preserving permitted reject/modify/escalate interventions. An old receipt must
  not imply current authorization or override the server's reviewer checks.
- Reduce mobile scrolling before the review controls while keeping the proposed
  consequence, uncertainty and reviewer progress readable. Preserve explicit
  consent, refresh and exact uncertain-response retries.

Neither follow-up blocked D6-D's merge or expands the D7 trust boundary.

## D7-C merged baseline

[D7-B PR #23](https://github.com/Mehtapozkan/fieldruntime-core/pull/23) merged normally
at `6766d9d99569fbff0e95e8b8b91748c1c0646b7a`, from reviewed head
`56490f9ac0cebbd244d2f77a92bf798a9d2ec5c0`. Required `validate` passed, the addressed
scope review was resolved, and no blocking review finding remained. Required PRs,
up-to-date checks and force-push/deletion protections were preserved without bypass.
The supplied obsolete-Case reproducer was rerun successfully before merge.

[PR #24](https://github.com/Mehtapozkan/fieldruntime-core/pull/24), now merged,
implements only Accepted D-033's D7-C:

- Strict attempt/hash/key-bound verification POST; fixed server-selected verifier
  with current canonical identity, profile-bound scope, grant and time checks.
  Caller identities/success claims and executor self-verification are rejected.
- A separate read-only source connection followed by a writer-locked authority,
  time and source/head consistency check. Exact source match is verified; absence
  or different values mismatch; failed/malformed/changing reads are inconclusive. A catalog change between
  observation and recording also requires a fresh check, including overlapping
  transactions and restoration of old catalog bytes at a newer S.
  Adapter acknowledgment supplies no verification evidence.
- Immutable observation, action/envelope bindings, verifier evidence, comparison
  and versions in the existing action journal. Atomic clock guard/idempotency,
  lost-response recovery and deterministic restart replay advance neither C/R/S.
  GET remains free of writer locks, IDs, clock changes or observations.
- Checksum migration 0004 extends that journal without a new table or rewriting
  prior history/checksums. Strict v1 action history stays replayable/verifiable;
  current v2 envelopes bind any retained absence evidence used for explicit retry.
- Only the latest verification's independent absence for the latest invocation
  can permit explicit re-invocation, subject to current authority. Errors, older
  absence, historical approval flags and occupied slots cannot permit another credit.

[The executable API guide](docs/guides/simulated-credit-api.md) demonstrates
Finance/Executive review → simulated action → independent source check → restart
and exact retries. D7-D below connects these existing APIs without changing their
contracts, persistence or accepted authority boundaries. Verification establishes only the
simulated credit effect, never customer impact, recovered revenue, acceptance,
commitment completion or Case closure. Legacy execution/closure guards remain.

Validation: `pnpm validate` passes **262 tests**; real local PostgreSQL/API passes
**63 D6 tests and 93 D7 tests**; all **eight Workbench browser scenarios** pass.
The D7 suite covers fresh/v1-action migration, current verifier eligibility,
mismatches, observation races, explicit absence retries, failed persistence,
backend termination, lost responses, restart, coherent proof tampering and the
preserved obsolete-Case/scope regressions. Local PostgreSQL/API restart reconstructs
both the action and independent proof. ECC passes **620/620**; its intended negative
control exits **1 at 152/620**, with assertion results rather than a crash. The supplied
PR23 reproducer and `git diff --check` pass.

The [implementation CI run](https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/33976520656)
passed those 262/63/93 tests, all eight browser scenarios, Compose configuration,
explicit enrollment and the container action/verification/restart smokes on
`0339ca623505598098490c38fee7dc29d476b975`. Its logs exposed one obsolete enrollment
message claiming verification was unimplemented; that wording is corrected in the
follow-up. Final-head CI evidence is recorded in PR #24. Docker is unavailable
locally; no local Compose pass is claimed. Automated code/security reviews of the
implementation head completed without posted findings.

Limits: this is logical verifier/connection separation in one credential-free
synthetic appliance, not isolation from its privileged database/application owner.
Negative verification can retain physical source drift through history-only
hydration; ordinary execution/GET/startup/readiness still fail on that corruption.
Positive proof and reusable absence must also agree with immutable source/action
history. Whole-history replay is for the bounded preview. Equal timestamps still
cannot order separate Case/action journals, and no external signature anchors a
complete privileged rewrite. D8 economics remain future work; no release,
deployment, production authentication, connector or external write is included.

## D7-B merged baseline

D7-A [PR #22](https://github.com/Mehtapozkan/fieldruntime-core/pull/22) merged normally
at `f6dcddc03da8ee7c86cce76979aca751b2b0266d`, preserving all merged D6-D code,
tests and documentation. [D-033](docs/architecture/d7-simulated-credit-verification.md)
remains **Accepted**, with the human approval of `527cfb6f` retained verbatim.
The operator's effective solo-maintainer rules were verified: required PRs,
`validate`, strict up-to-date branches, and force-push/deletion protections remain;
required approving reviews are zero. Neither merge used bypass. The combined
[PR #22 CI](https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/33956468801)
passed 250 repository tests, 63 PostgreSQL/API tests, eight Workbench scenarios,
Compose and appliance/restart checks before merge.

The merged D7-B baseline supplied:

- Strict versioned command, authorization envelope, action journal, source and
  read-response contracts. Existing v0/D6 v1 semantics and frozen ECC are unchanged.
- Checksum-bound migration 0003 for two append-only supporting tables. Existing
  Case/review history and 0001/0002 checksums are preserved on upgrade.
- Explicit idempotent `fr d7 enroll --demo`, preserving named-Finance policy and
  synthetic seats while installing narrowly scoped executor/verifier/evaluator
  records. One S increment invalidates old requests; startup never reenrolls.
- A bound $15,000 Orchid action API with current server-recomputed C/R/S, consent,
  policy, identity, scope and issuance-time checks. Atomic source/action persistence,
  one credit per Case, terminal interventions, exact retries and deterministic
  restart replay preserve Case/review revisions and closure denial.
- Consistent read-only operation views with informational eligibility and immutable
  history. No previews, IDs, writer locks or clock mutations on reads. Historical
  receipts remain distinct from current eligibility.

[The API guide](docs/guides/simulated-credit-api.md) includes the explicit preparation,
Finance/Executive review, action, verification and restart demonstration. D7-C is
merged above; D7-D Workbench controls are implemented on this review branch.
The Workbench preserves the accepted D6 review semantics. Adapter success
is never verification; repetition requires independent absence and current authority. Customer impact, Case resolution and recovered
revenue remain unproven. Legacy execution and incomplete-proof closure guards remain.

At PR #23's reviewed head, local repository validation passed **258 tests**, including preserved authority
repairs and Workbench coverage. The real local PostgreSQL D6 suite passed **63**.
The D7 suite passed **56 real PostgreSQL/API tests** covering fresh/upgrade
enrollment, atomic action/replacement boundaries,
current eligibility (including exact workflow identity/version and two distinct
human reviewers), terminal/concurrent
commands, duplicates, clock guards,
tampering, source/action rollback and restart retries. Operation envelopes retain
only the bound Orchid Case; unrelated Case identifiers/hashes are excluded, while
the runtime clock floor remains a validated scalar replay input. The local appliance action → PostgreSQL/API restart → exact retry smoke also passes.

The obsolete-Case replay defect was reproduced at `b5272ad` before changing the
implementation. Legitimate earlier-action controls passed, but coherent action/
source/index/hash/clock rewrites claiming issuance after canonical changed evidence
were accepted by replay, readiness, operation reads and restart. The repair rejects
an anchor that omits any Case entry recorded strictly before claimed issuance;
runtime coverage also checks D-014 version increments. Canonical Case/review/catalog
histories remain unchanged in the PostgreSQL forgery regression. Earlier actions,
including subsequent Case changes with equal timestamps, remain reconstructable
and exact retries cause no writes.
Equal timestamps cannot establish order across journals without a shared per-entry
writer sequence; this repair preserves that limitation and adds no sequence,
schema, migration or new trust boundary. Live command ordering still uses the lock.

ECC passes 620/620; its intended negative control exits 1 with 152/620 and a full
assertion receipt. Hosted PostgreSQL/Compose/browser evidence is linked in the
implementation PR. Docker is
unavailable locally; no local Compose pass is claimed. The accepted D6-D desktop
and 390px review is retained; D7-B makes no UI changes or new visual-check claims.

Known baseline limits: synthetic service context, whole-history replay suited to this bounded
preview, and no cryptographic external anchor
against a complete privileged rewrite of all canonical history. No production
identity-history system, external writes, connectors or generic workflow is added.

## D6-D implementation

- Explicit, idempotent demo initialization creates one synthetic Orchid credit
  Case through Case commands. Packet opening, refresh and revisit use only reads;
  they never initialize a demo or change durable history, IDs, C/R/S or clocks.
- The existing Workbench layout displays the exact $15K proposal/customer, retained
  evidence/provenance, conflicts, unknowns, recommendation, required approvals and
  recorded review history from API responses. Confirmed writes fetch the current
  packet by GET: Finance → verified progress → explicit Executive decision →
  verified completion → browser reload reconstructs the same request and decisions.
- The decision-first view leads with Orchid, the proposed credit, retained issue
  and material uncertainty. Review controls sit beside the concise summary;
  human-readable evidence and the bound policy explanation stay visible. Technical
  C/R/S, identifiers, hashes, source URIs and policy references are expandable.
  Awaiting review, the remaining reviewer, completion, terminal decisions and a
  changed Case requiring fresh review come from validated server results.
- A confirmed write followed by a failed read retains its historical receipt and
  requires refresh without offering another write retry. Conflicts still require
  explicit review/resubmission; uncertain writes retain exact commands. Seats are
  never switched automatically and their selection is not authentication.
- Server-enrolled synthetic seats remain labeled. Decisions send the reviewed
  request hash, C/R/S and correlation ID. Terminal interventions use independent
  server reviewer eligibility, not the whole-request `current.eligible` flag.
  Reject/modify/escalate collect reasons; modification opens an unapproved R0
  replacement. No client authority calculation or transferred approvals exist.
- Conflicts require explicit refresh and deliberate resubmission. An uncertain
  write retains its exact command/seat/key before transmission; reload and retry
  recover the historical receipt. Local storage now holds navigation and retry
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

## Other merged foundations

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
- Legacy Case `executed` records remain denied. The separate D7-B simulated
  operation recomputes a bound authorization envelope without relaxing that guard.
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

## Earlier D6 validation evidence (historical)

- D6-D adds 16 focused client/API regressions and a real PostgreSQL/HTTP client
  scenario. The PostgreSQL suite passes 63 tests locally, including no durable
  changes around repeated client reads, two-person approval, restart, lost commit
  acknowledgement and exact retry, evidence invalidation and unapproved renewal.
- Chromium exercises the actual appliance for initialization, approvals/reload,
  concurrent submissions, lost-response retries, all terminal decisions, replacement,
  changed evidence, ineligible reviewers and unsafe packet responses. CI runs
  `pnpm test:workbench` after PostgreSQL/API and restart appliance smokes. Final
  commit CI evidence is linked from the D6-D PR checks.
- Automated review identified an incoherent-response presentation defect: before
  repair, all 11 contradictory packet variants were accepted by browser validation.
  The client now rejects authorization flags that disagree with request C/S/time,
  terminal history, resolver outcome/reasons, requirement counts or recorded
  effective approval IDs. Valid and reordered packets still work. Chromium also
  tests a false completion flag while `action_permission` remains false.
- CI confirmed PostgreSQL/API and restart-smoke coverage but accumulated browser
  scenarios exceeded the preview's whole-history replay timeout. Independent
  browser scenarios now use fresh CI-owned disposable volumes; the primary
  approval/reload/evidence-change story runs together without resetting its history.
  All eight scenarios remain required. This is not a scalability claim or a runtime
  replay optimization.
- The operator correction reproduced three failing client/API regressions before
  implementation: confirmed-write progress, follow-up read failure, and a Case
  change between the accepted write and its read. These now pass, along with both
  reviewer orderings, unchanged exact retries and authorization-coherence negatives.
  Browser coverage checks readable consent, hidden technical identifiers, unchanged
  synthetic seat, keyboard focus/order and confirmed-write read failure. Final
  desktop/390px inspection and CI evidence are recorded in PR #21.

- `pnpm install --frozen-lockfile`
- `pnpm validate`
- `pnpm release:check` passes across current files, complete reachable Git
  history, required public-release artifacts, pinned container images, package
  metadata, and production dependency licenses.
- At D6-D, 250 tests passed, including 16 D6-D client/API regressions, 40 D6-C contract/lifecycle/replay tests and 16 D6-A identity, delegation, responsibility,
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
  general review application. D7-D retains pending commands in browser local storage
  across reopening; clearing site data loses those local keys. Committed history remains
  canonical and inspectable by request URL. Reads/decisions can take longer as
  whole-history integrity replay grows; requests time out visibly and fail closed.
- Strict v0 contracts, frozen ECC and Accepted D-032 remain intact. D7-B adds
  migration 0003; merged D7-C adds 0004. Complete closure proof remains
  unimplemented; D7-D connects the existing action/check APIs without a migration.

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
- A general Action Gateway is not implemented. The merged D7-B API supports only
  the enrolled Orchid credit; the merged D7-C verifier checks only its simulated
  source. No external writes are implemented.
- Legacy caller-declared executed Case actions still fail closed. The separate
  simulated operation recomputes exact payload/authority bindings server-side;
  those proofs do not authorize legacy Case arrays or complete closure.
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
- The legacy guided authority, connector response, read-back, recovery, receipt,
  outcome and learning trace remains presentation-only and isolated from runtime
  history. D7-D connects separate action/check controls to the implemented
  APIs; D8 outcome/economics receipts remain future work.
- Workbench review history is persistent but all actors, policy and evidence remain
  synthetic. Production identity and execution are outside D6-D.

## Public documentation and maintenance reconciliation

The D7-C documentation pass distinguished merged source, that review branch, the historical
published prerelease and future work. Its functionality table separates Workbench
review from the action/verification APIs and the legacy fixture screens. Quick-start
and operations links describe explicit initialization, enrollment and fresh review;
OPEN_CORE labels commercial services as potential offerings. Historical release
notes and accepted decision records are preserved. All 42 local Markdown links and
anchors across the affected docs and linked API/Workbench guides resolve; the
public-release audit passes with pnpm store access. Documented command names and
browser labels were checked against the implementation.

Dependabot [PR #13](https://github.com/Mehtapozkan/fieldruntime-core/pull/13) merged
separately at `e4130d5b81ff153ca7c3859aecee75c439c7e057` after its up-to-date required
[CI passed](https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/33975171883).
The pinned pnpm setup action now runs on Node 24; pnpm stays 11.24.0. Upstream
v4.4.0/v5.0.0 both resolve to the retained full SHA. Normal PR/status/branch
protections were preserved. This maintenance merge is included in D7-C before
final validation and adds no product capability.

Final combined-commit validation and PostgreSQL/API, restart, Compose and Workbench
CI evidence are recorded in PR #24. Docker is unavailable locally; no local Compose
pass or new visual inspection is claimed by this documentation pass.

## D7-D implemented for review

The existing white/cream Workbench now connects review → simulated action →
independent source check. Server history supplies progress; verified effect,
mismatch and inconclusive states remain distinct. The proposal, uncertainty and
reviewers stay visible; identifiers and authority evidence are expandable.
Already-recorded approval is acknowledged without suppressing permitted terminal
interventions, and mobile controls use a compact two-column reviewer/decision row.

Enrollment stays the explicit existing CLI command. Case preparation uses deliberate
existing transitions only along the original unchanged preparation sequence, then
requires a fresh request and fresh review. No new API, contract or migration is
introduced. C/R/S, terminal rules, immutable material and closure denial are unchanged.
Execution submits the exact displayed binding. Verification independently targets a
committed attempt and remains available after stale approval or terminal review.
A confirmed receipt survives a failed refresh; neither adapter success nor a committed
mismatch/inconclusive result is displayed as successful verification.

Review correction: a reproduced second-attempt/failed-refresh sequence previously
showed the first attempt's absence mismatch after the newer action was confirmed.
The page and verifier command now select the newest confirmed attempt and only its
matching proof. Accepted action context remains in memory across subsequent checks;
reopening reconstructs server history. Exact retries keep confirmed receipts visible
even when the packet read fails. Additional regressions reject contradictory source
attribution and prevent reordered history from hiding a later inconclusive check.
No current permission is derived from these retained historical receipts.

Operator-clarity pass from `d74deb4`: three browser assertions reproduced the
expanded completed form and refresh errors displacing confirmed mismatch/inconclusive
headings. Confirmed results now lead the page, with check time and expected/observed
values. Refresh failure and current eligibility appear separately. A later
inconclusive check cannot inherit an earlier match, and a newer attempt cannot use
an older attempt's proof. Completed review collapses behind keyboard-accessible
“Review or intervene” without switching seats or removing permitted interventions.
Duplicate result/uncertainty copy is removed; retry mechanics, verifier selection
and receipt internals are expandable. Retained material and citations are unchanged.
This pass changes presentation, browser tests and documentation only; Accepted
D-033, command/retry logic, runtime contracts, migrations and dependencies are unchanged.

Local storage contains navigation and exact pending commands, never authority or
accepted history. Separate per-command retry records survive reload/reopening;
confirmed writes are followed only by read-only refresh. Financial retries remain
explicit, require latest independent absence and current authority, and cannot
bypass an occupied slot. Clearing browser site data loses retry information; durable
server history remains. Synthetic seats are not production authentication.

Local validation passes: `pnpm validate` **262 tests**; real PostgreSQL/API
**63 D6 tests and 113 D7 tests** (the latter includes 12 new client/API regressions
and eight new Chromium scenarios). The retained eight D6-D browser scenarios pass.
ECC passes **620/620**; its negative control exits **1 at 152/620** from intended
assertion failures. The local action/check smoke passes before and after API
restart, reconstructing the same credit and independent proof. `git diff --check`
passes. Scope, obsolete-Case replay, current eligibility, observation races,
rollback, retry and closure regressions remain covered.

Desktop/390px captures and the executable walkthrough are in the
[visual handoff](docs/guides/d7-workbench-handoff.md). Actual Chromium interaction
checks cover focus/order, visible uncertainty, reviewer acknowledgment and preserved
interventions, reload/reopening, stale evidence, exact pending retries, mismatch,
unavailable reads and a confirmed write with failed refresh. The primary walkthrough
has no horizontal overflow at 390px. Screenshots show synthetic retained test data;
they do not demonstrate external effects or customer-impact proof.

Docker is unavailable locally (`docker compose config --quiet` exits 127); no local
Compose pass is claimed. Required CI runs PostgreSQL/API, eight D7-D browser scenarios,
all retained D6-D browser groups, Compose configuration and container appliance/
restart smokes. Its timeout allows the added browser coverage; no check is removed.
Final commit and CI evidence are recorded in the open implementation PR. No release
or deployment is included.

## Next

Review D7-D with final API/browser/CI evidence; leave its PR open and unmerged.
D8 then addresses accepted outcome/economics receipts. Neither a credit nor a source
check proves customer impact, accepted outcome or recovered revenue. Incomplete
proof continues to block closure. Case formation/import and Operational Legibility
(D9–D10) precede general workers. No live connectors, production authentication,
external actions, release or deployment are supplied by this milestone.
