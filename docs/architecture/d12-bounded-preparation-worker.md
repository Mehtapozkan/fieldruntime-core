# D-037 — One bounded synthetic preparation worker and its proof

Status: **Accepted — no D12 runtime, contract registration or migration implemented.**
Based on main `6bfc94e24d2a2980b369fc0aea487e32313b5f78`, the normal merge of PR #34
at reviewed head `b284279c`. [D-036](d11-reviewed-runtime-pack.md) remains Accepted.
The [worked packet and operator path](../guides/d12-preparation-worker-design.md)
and [populated contract example](../examples/d12-preparation-worker.proposed.json)
are design evidence, not worker receipts. The [canonical specification](../product/workflow-discovery.md)
and its existing 19-entry matrix remain the product plan.

## Human approval — 2026-09-08

The repository owner explicitly approved the corrected design in PR #37 at
`7ac9f9db69ea0b609ae084a046f0d4f42021f201`:

> I approve the narrow D-037 design in PR #37 at `7ac9f9db69ea0b609ae084a046f0d4f42021f201`.
>
> This approval covers the fixed synthetic worker and purpose-specific reviewer profiles, explicitly worker-capable pack v2, bounded deterministic execution, and one supporting journal for the specified task/proof/correction history. It does not approve an individual publication, task acceptance, financial action, real-customer processing or Case closure.

The same instruction authorizes one D12-B implementation PR after this design merges
through normal repository protections. This acceptance records that human instruction;
it does not establish implemented functionality. The worked example and W1–W10 remain
design/acceptance requirements until exercised by implementation.

## Accepted decision

Approve only a synchronous, server-selected deterministic worker that reads an exact
synthetic invoice-dispute basis and produces one cited preparation packet. Approve
its separate execution/recipient profile, a new fixed preparation-template version,
and **one append-only PostgreSQL supporting journal** for starts, terminal results,
interruptions, purpose-limited task reviews, corrections, evaluation-candidate reviews
and manual synthetic proof notes. None is a Case transition or business authority.
The approval above covers these additions; individual publication and task review remain separate commands.

No model access is proposed: zero model calls, adaptive loops, external tools,
network retrieval, messages, financial actions or worker-selected code. A model has
no demonstrated benefit for the supported structured rows and literal scoped claims.
An alternative needing model access must separately justify input custody, provider,
retention, tools, budgets and unseen quality gates. No dormant provider route or agent
loop belongs in D12-B. Real-customer activation remains separately unapproved.

## Useful result beyond D10 and D11

D10 already describes the workflow, cites evidence and asks gap questions. D11 already
binds that description to an explicitly published preparation configuration. Neither
executes S1–S4 or retains a task result/recipient review. D12 removes the manual assembly
of a **record-specific disposition-or-gap packet**: a subject/evidence checklist,
comparable-claim reconciliation, one deduplicated follow-up agenda, an unsent draft
request, blocked disposition options and their missing prerequisites. It records
which code and inputs produced that output, and lets a synthetic recipient accept
its preparation usefulness or request a correction. This is not a new workflow brief.

For North dispute-17 the useful outcome is a gap packet: request DEL-4 confirmation
and governing terms before choosing a disposition. It cannot recommend a $15,000
credit. A complete, accurately scoped gap packet may pass the **preparation task**
while the dispute, customer impact and Case remain unresolved. No time saving is
claimed until comparable active effort and quality are measured.

## Reuse and the exact compatibility change

Reuse original intake bytes/locators/record keys and successful-key metadata, D10
v1/v2 replay, the corrected pack claim/coverage projection, Case anchors, D11 selection
history, canonical hashing/strict validators and the existing writer transaction,
read-only snapshots, clock guards, immutable export and IndexedDB claim patterns.
Use the existing intake Workbench and its evidence/history expansions.

There is a concrete version barrier: the shipped
[fixed template](../../packages/contracts/src/preparation-template.v1.json) says
`worker_dispatch: false`, and strict pack v1 accepts only that template. **An existing
v1 publication cannot start this worker.** The smallest amendment proposed here is:

- Add fixed `invoice-dispute-preparation.v2`, preserving the four steps, scoped
  citations and disabled business rules. Its resource section permits only the named
  in-process preparation worker; `worker_dispatch: true` means this one bounded call,
  not a scheduler or arbitrary worker dispatch. Model calls/loops/external tools remain zero.
- Add `preparation-pack.v2` binding the exact worker-profile hash. Use explicit
  publication command/entry/read/export v2 branches for this artifact, retaining
  the v1 handlers, histories and hashes. Selection P remains the same stream.
- The complete new template/profile content is part of the reviewed artifact; no
  caller override, broad configuration editor or hidden sidecar permission. Pack v2
  current-use checks additionally require the supported current worker profile.
- Reuse an applicable completed D10 review; changing only the execution template
  does not require an identical D10 confirmation. It **does** require a new artifact
  and separate D11 publication. Source/description changes still require fresh D10
  review first. Withdrawal retains D-036's own current-reviewer/exact-head gates,
  including for stale, expired or unsupported-for-current-use artifacts.

The D11 v1 statements that capture is unimplemented stay historical; v2 explicitly
references the proposed D12 capture contracts. Unknown interpreters fail closed.
Keep Node 24.19.0/tzdata 2026b and original images for other interpreter archives;
no conversion or silent repair of the upstream D10 loop helper is proposed.

## Identity, binding and limits

One fixed runtime-controlled profile, `synthetic_preparation_worker.v1`, selects
service `identity_disposition_worker_demo` and implementation `disposition-code.v1`.
Its grant is `prepare_disposition_packet`, active only in the declared UTC interval,
for tenant_intake_demo and the selected North record. Read scope must cover the whole
bound bundle, including South coverage/context; South facts do not become North proof.
The existing human `identity_intake_operator` is the synthetic task recipient; a new
purpose-specific grant permits task review/correction/proof notes only. Publication
remains `identity_pack_reviewer_demo` under D-036. Seat selection is not authentication.

The server obtains identities/grants from this fixed canonical profile, checks strict
identity references, contradictory copies before filtering, tenant/kind/status/scope,
not-before/expiry and profile content hash. The service cannot review its own task or
promote a correction. A publication grant alone is not a worker or task-review grant.
Current identity checks do not invent retroactive identity status history.

A start command binds exactly:

| Binding                | Required canonical references                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject                | Tenant, Case ID/C/journal head; entity, selected record key and source revision. Shared invoice/customer text is never identity.                                                                                  |
| Inputs                 | Full D11 artifact binding: bundle/hash, business input hashes, intake receipt, D10 D/head/material/confirmation, scopes and all interpreter versions. Source bytes and claim/coverage locators remain resolvable. |
| Preparation permission | Pack ID, version, artifact hash, selected P/head and publication-profile hash; exact worker-profile hash and supported worker implementation/version.                                                             |
| Command/history        | Operation-scoped idempotency key, expected Case-local work revision U/head and optional exact interrupted/rejected run being replaced. No caller identity, success flag or policy body.                           |

C, D and P are distinct from U and authority-request R/catalog S. The worker neither
consumes nor grants financial authority and must not copy an R/S authorization label
into its result. Changes to D10 review invalidate its preparation basis; independent
financial review is shown only through the existing live API when relevant. Commands
advance U and internal writer coordination only, never C/D/P/R/S. D-014 stays intact.

Limits are the lower of current intake limits and **one selected record, one retained
bundle, 200 coverage rows, 20 associated support artifacts, 2 MiB of parsed UTF-8
content, 64 distinct questions, 256 KiB result and four fixed steps**. Refuse overflow
without silently truncating evidence or coverage. One invocation has a five-second
computation deadline (not an operator SLA); schema/hash/read validation and database
commit latency are recorded separately. No external reads, implicit OCR, parsing of
retained-only documents or recursive searches. Inspect opaque metadata only; missing
content blocks claims needing it. Check bounds before copying material into the worker.

## S1–S4 and result acceptance by the runtime

| Step                  | Work and required output                                                                                                                                                                  | Stop/intervention                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| S1 bind/inspect       | Validate immutable input manifest and exact byte locators; construct selected subject index and separately bound upload coverage.                                                         | Corrupt/unavailable/out-of-scope/unsupported inputs: stop. An unavailable read is not absence.                                |
| S2 compare/ask        | Compare only the same record/field or explicitly associated entity/delivery. Retain competing claims. Deduplicate questions by subject and missing prerequisite; draft one unsent agenda. | Unknown proof/terms/owner remain visible; genuine conflict prevents adjudication, not a useful gap packet.                    |
| S3 reuse human review | Reference the exact currently applicable D10 confirmation. Identify reported versus accountable owners; suggest recipient roles without assigning them.                                   | If new information is necessary, stop this basis and use D10 correction/fresh review/publication. Never confirm for a person. |
| S4 assemble           | Produce cited checklist, blocked/available preparation options, unsent draft, primary intervention and other blockers, and exact review target.                                           | Stop at task packet. No message, credit proposal with invented amount rationale, source effect, acceptance or closure.        |

Run only the fixed module in one disposable Node worker thread within the appliance;
the parent enforces the computation deadline and terminates the thread on timeout.
This is a bounded call, not a worker pool or code-loading API. Tests deny ambient
network/file access in the module and require deterministic output; no production
sandbox or arbitrary third-party code execution is claimed.

The worker port is `prepare(immutable_input) -> untrusted_result`; it has no database,
clock, ID allocator, command gateway or network handle. Runtime validation recomputes
subject applicability, locators, coverage, required gaps and fixed output structure;
a plausible text or self-consistent hash alone is insufficient. Unsupported conclusions
are rejected. Every factual clause cites its scoped source; proposed questions/options
are labeled as proposals. Source reports remain distinct from independent verification.

Terminal computation outcomes are `prepared_gap_packet`, `prepared_packet`,
`abstained`, `invalidated`, `failed` or `interrupted`. The current template has no
business disposition rule: even a prepared packet cannot approve settlement/credit.
A failed parser is SYSTEM_FAILURE, not MISSING_EVIDENCE. Use the canonical six reasons
only when supported: AUTHORITY, JUDGMENT, MISSING_EVIDENCE, MISSING_KNOWLEDGE,
NOVEL_CASE, SYSTEM_FAILURE; otherwise primary reason is null (“Reason unconfirmed”).
Retain other blockers and evidence/step references. Confidence alone proves none.

## Persistence, concurrency and recovery

Propose one additive `preparation_work_journal`, using existing PostgreSQL transaction
and integrity patterns. Immutable JSON plus relational indexes for tenant/Case/U,
entry/hash/predecessor, invocation, operation/key/fingerprint and times; exact existing
Case/pack/input anchors are references, not a second blob or Case ledger. Add a new
checksum-bound migration after 0008; do not edit earlier checksums. No queue, lease
service, scheduler, mutable task aggregate or background recovery sweep.

1. Under the writer lock, check integrity, key binding, exact U/head, full current
   Case/D/P/basis/pack compatibility and both publication/worker eligibility at server
   time. Append `started`, retaining command, trusted manifest/profile, actor/version,
   evaluation time, computation budget and stable invocation reference. One nonterminal invocation
   per Case; competing fresh keys fail without writing. Failed eligibility does not
   create a successful start/key. The original successful key always binds this receipt.
   While pending, other U mutations except interruption are refused; D10 corrections,
   D11 withdrawal and business decisions retain their independent permitted paths.
2. Release the lock. After start commit, the runtime parent starts its monotonic
   computation timer and invokes the worker on the immutable snapshot. On receiving
   completion, **before waiting for the writer lock**, the parent records completion
   time/elapsed duration and checks the five-second budget. The worker cannot supply
   those values. Timeout terminates the thread; late output is discarded. Retain the
   parent's UTC start/completion and monotonic elapsed/budget verdict with the terminal
   entry; time spent validating or waiting for the database is recorded separately.
   No work resumes automatically on startup. GET shows only the recorded start.
3. Before retaining a result, reacquire the lock and recheck the exact started U/head,
   C/D/P/input/profile/identity/scope/effectivity and current durable clock guard. Recheck
   the retained parent computation-budget verdict, not terminal time against that
   computation deadline. Publication/identity expiry is still checked at this **current
   terminal evaluation time**, so permission lost while waiting prevents acceptance.
   If an
   interruption already terminated this invocation, discard the late result without
   appending another terminal entry. Otherwise append one
   terminal result with its content/hash, conformance findings, input/permission evidence,
   implementation versions, parent timing evidence and evaluation times atomically. If permission/basis changed,
   append `invalidated` with the historical draft/evidence if readable and valid, never an
   accepted current result. Malformed worker output records bounded failure diagnostics,
   not trusted claims. Recheck row/JSON/hash reconstruction before commit.
4. The POST response is always the original **start receipt/reference**, not a mutable
   promise of completion. After a confirmed response, a read obtains terminal state.
   Exact retries return that receipt without recomputing, writing or renewing permission,
   even after completion/expiry/revocation. A duplicate arriving mid-call sees the same
   reference and a pending read. Changed body under the bound key conflicts.

This ordering is explicit: if withdrawal, evidence/review/profile change or expiry
wins before the terminal transaction, no currently accepted result can follow. If a
valid result commits first, it remains legitimate historical preparation; later change
makes current usability false. Rollback to the same artifact changes P, so an old
invocation cannot revive. Equal timestamps do not order journals; retain exact input,
selection and internal writer-order anchors at start and completion, rejecting omitted
strictly earlier canonical changes. Do not substitute latest state for historical replay.

For example, 1 second of computation followed by 7 seconds waiting for the writer
lock remains within the computation budget. Accept only if current C/D/P, profiles,
identity, scope and effectivity still pass when the lock is acquired. The same wait
crossing pack expiry yields `invalidated`; a 5,001 ms computation yields a timeout
failure even with no lock wait. UTC rollback fails the durable clock checks; replay
retains the parent's original timing evidence, never a newly measured replay duration.

A crash after `started` leaves a pending invocation, not a fabricated completion.
On reload retry the original bytes/key to recover its reference, then inspect. An
eligible operator may explicitly interrupt that exact pending invocation/U/head even
if its pack is now stale. This terminal append fences any late result. A **fresh,
explicit** start uses a new key, current basis and `replaces_invocation`; no transferred
acceptance. This deliberately avoids automatic resumed execution or a lease framework.
A crash before start commit creates nothing; a lost final acknowledgment is recovered
by original-key lookup plus GET. Inject failures at both transactions and result/index
insertion; partial state cannot become completed. Preserve IndexedDB atomic claim and
compare-and-clear across tabs; never replace or resend a different command after claim failure.

Exact retry lookup preserves the original outcome; disclosure still requires the
current reader and full scope. Denied disclosure never replaces that outcome or
creates a fresh execution. Revoked worker eligibility does not by itself revoke an
otherwise eligible human reader.

All candidate/result/history/export reads use one consistent read-only snapshot and
current authorized reader context; no writer lock, clock update or reserved ID. Recheck
scope before disclosing history. Interrupted/invalidated results remain historical,
subject to read access, and cannot inherit another run's review. Export nests unchanged
D11/D10/intake archives with U history, original versions and trusted snapshots. Replay
reconstructs each event and fixed code result under its recorded version; coherent
forgeries of source association, head, result or index fail readiness/read/export.

## Task review, correction and the five proof measures

The following are proposed **strict, separate-purpose** commands in the same journal;
no changes to AuthorityDecision v0/v1 or Case Outcome/Correction/LearningCandidate are
implied. Unknown fields/duplicate keys/unsupported versions are rejected.

| Operation           | Current gate and retained meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task_review`       | Exact invocation/result hash, expected U/head, eligible human recipient and reason. `approve` means “accept this packet for preparation”; additionally require currently usable result/basis. `reject`, `modify`, `escalate` can record an intervention on stale historical material under their own current recipient/scope/head checks. They never restore work eligibility. Each closes that result's review; no later approval revives it. Modify references a proposed correction/replacement; escalation sends nothing. |
| `correction`        | Exact original run/result/claim (including JSON pointer), before/after, evidence/limits, actor, primary reason and knowledge-bearing or authority-only classification; append, never edit a packet. A result-only wording correction needs a fresh worker version/test and run, not changed source facts. A source/description correction must use D9/D10, fresh descriptive review and separate pack publication first.                                                                                                      |
| `evaluation_review` | Exact correction/hash and synthetic input/expected-output case hash, candidate revision, independent eligible human reviewer, decision/reason and test references. Initially `not_reviewed`; only a recorded decision can say accepted/rejected for evaluation. Acceptance selects a regression candidate, never promotes code, template, policy or authority. Authority-only corrections cannot teach reduced approvals.                                                                                                     |
| `proof_note`        | Manual synthetic evidence for one of the canonical five measures or a named cost category: exact Case/record/run/result, measure-definition version, cohort/period/coverage, source/locator/time, value/unit or explicit unknown, method/owner, observed/estimated/hypothesis/synthetic label, and any superseded/reversal/reopen reference. One bounded note, no metrics engine. Missing evidence cannot be posted as verified business proof.                                                                               |
| `interrupt`         | Current eligible task operator, exact pending invocation and U/head. Independent of stale pack or expired execution grant; the operator's own grant must be current. No new execution permission.                                                                                                                                                                                                                                                                                                                             |

The correction schema is `purpose_limited_preparation_correction.v1`, matching the
fixed v2 template’s minimum-capture reference. Its commands carry `schema_version`,
operation/purpose, exact invocation and
binding/result hashes, expected U/head, target pointer, before/after, classification,
primary reason, explanation, relevant citations/evidence limits and idempotency key.
The server resolves the invocation's tenant/Case/record and attributes the current
eligible human; client actor fields are forbidden. The immutable entry retains that
actor/profile, command/fingerprint and time. Its derived candidate begins unreviewed.
The [complete example](../examples/d12-preparation-worker.proposed.json) binds correction
U3 → U4 to the preceding task-review entry and supplies the separate exact-head,
independent evaluation-review command. Candidate status/actor/next-step prose are
server evidence or documentation, never extra client fields allowed by a strict command.

Every first successful operation binds its tenant/Case/operation/key to the exact body
and original receipt; exact retry never writes. Competing U heads conflict. Reviews,
corrections and notes do not change C/D/P/R/S. Preserve negative, rejected, superseded
and reopened evidence. Task acceptance is not D10 descriptive confirmation, publication,
effect verification, customer acceptance, financial authority or Case resolution.

Minimum correction path: record original/replacement proposal → human review of an
explicit synthetic evaluation candidate → retained and unseen tests → manually reviewed
code/template diff → fresh supported worker/template version and separate publication
when that binding changes → new invocation and task review. Never patch history,
promote a candidate automatically or change the frozen ECC corpus. The bounded
implementation may use existing test files and normal PR review; no training pipeline
or general Operational CI is needed. D16 owns broader tooling.

The [five proof definitions](../product/workflow-discovery.md#five-separate-proof-measures)
are required planning definitions now. D12's proposed notes capture only explicitly
reported synthetic evidence and readiness; they do not establish a customer measurement
service. D13 owns customer comparisons/reporting after data-boundary approval. A packet
may list all five as unknown. Zero model calls is a verifiable execution fact; human,
infrastructure, support/setup costs remain unknown unless actually recorded.

## Contract/API surface and implementation handoff

Use strict v1 envelopes for worker input/result, start command, purpose-specific
commands, journal/read/export, and the explicit pack v2 compatibility branches above.
The populated JSON uses these proposed names without registering them in the runtime.
Reuse `IdentityReference`, source citations, D11 basis and existing canonical hashes
by validation/adaptation; do not put incomplete proof into the strict Case `Outcome`.
A proposal must not fabricate its required verifier or `verified_at`.

Proposed minimal routes within the existing appliance:

- GET `/v1/intake/preparation-work?case_id=…&record_key=…` for candidate, current eligibility,
  original starts/results and history; `representation=export` for portable reconstruction.
- POST `/v1/intake/preparation-work/commands` with a strict operation-specific union:
  start, interrupt, task_review, correction, evaluation_review or proof_note. The server
  chooses the corresponding fixed synthetic actor; callers cannot submit identities
  or worker results. The internal worker port is replaceable without exposing execution
  code or result acceptance to browser input.

Smallest **D12-B implementation PR, after this accepted design merges**:

1. Add the strict envelopes, fixed zero-model worker/recipient profile and pack v2
   template/compatibility while preserving v1. Require fresh publication; no silent upgrade.
2. Add one supporting journal/migration and start/terminal/current-read path with the
   fences above. Keep immutable source bytes in existing stores. Implement interruption
   plus explicit fresh retry, not a durable scheduler.
3. Execute S1–S4 to produce the worked checklist/agenda/draft packet. Add task review,
   one correction/evaluation-candidate path and bounded manual synthetic proof notes
   in the same history. Code changes still travel through normal reviewed PRs.
4. Reuse the intake panel for the primary next action and result inspection; keep the
   two D11 presentation fixes and recovery accessible. Run the acceptance table below
   through actual PostgreSQL/API and relevant browser paths before claiming completion.

Replaceability means another conformant deterministic implementation can consume the
same input/result port under an explicitly changed server profile/version. Its new
profile hash requires new compatible artifact/publication and invocation; old entries
retain their old interpreter and result. A known implementation still must pass independent
runtime conformance checks. No client can choose arbitrary code or impersonate a worker.

## Acceptance required before D12-B is complete

These are **future acceptance tests**, not implementation results of this design PR.
Reuse existing disposable PostgreSQL/API helpers, browser driver and fixture variations.

| ID                       | Required assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 useful result         | Existing synthetic rows/note yield the worked checklist, deduplicated questions, unsent draft and explicit disposition abstention. S3 reuses D10 confirmation; four step proofs bind the same basis. A useful gap packet is task-reviewable but no customer outcome is asserted.                                                                                                                                                                                                                                                         |
| W2 scoped truth          | PR32 A/B, same-delivery, shared-object and reversed order controls: relevant citations for every clause and full coverage; independent records never transfer proof or create false conflict. Opaque/ambiguous/missing support stays explicit. Unavailable read is SYSTEM_FAILURE, not absence.                                                                                                                                                                                                                                          |
| W3 permission            | v1 packs, unpublished/stale/withdrawn/expired v2, wrong subject/read scope, unknown/revoked/contradictory identity, wrong purpose and caller privileges/results are denied. No worker self-review. Valid same-subject conflicts produce a gap packet, never adjudication.                                                                                                                                                                                                                                                                |
| W4 races                 | Change C (including D-014 rejection), D, business input, P, publication/worker profile, scope or expiry between start and result. Result invalidates or remains historical after later change; no current use/approval. No-op intake key bookkeeping alone does not stale basis. Equal timestamps use retained order/anchors.                                                                                                                                                                                                            |
| W5 retries/restart       | Same-key and same-U races, lost start/final response, rollback at insert/commit, crash pending, explicit interruption/fenced late result/fresh start. Original key returns original receipt after restart with no write or repeated computation; no double-counted result. Cross-tab original bytes survive and cannot be overwritten or wrongly cleared.                                                                                                                                                                                |
| W6 review/correction     | Accept a cited gap packet for preparation; reject/modify/escalate retain purpose/reason and terminal review state. Stale acceptance denied; historical interventions permitted under current human grants. Reject missing/altered correction envelope fields, stale U/head and changed-body key reuse; exact retry survives restart. Correct mistaken wording, review its evaluation candidate, then new version/publication/run; no transferred acceptance or automatic promotion. New source facts additionally require D9/D10 review. |
| W7 proof measures        | Five distinct units/cohorts/periods with coverage/unknowns; synthetic credit never cash; import alone never newly attended. Deduplicate overlap; reversals/reopens and negative attention changes remain visible. Include failed/open work and all attributable human/cost categories; missing is not zero. Notes confer no verified business outcome or closure.                                                                                                                                                                        |
| W8 replay/replaceability | Fresh install and upgrade after 0008 preserve checksums, Case/review/selection histories, v1/v2 Discovery and successful keys. Restart/export reconstruct old/new worker versions. Reject coherent output/citation/index/obsolete-prefix forgery; incompatible timezone/history fails closed. Replace code via profile/version/publication without rewriting old results.                                                                                                                                                                |
| W9 boundedness/clarity   | Test input/result/time limits, deterministic abstention, zero model/network calls and no background resumption. A fast computation plus >5s writer wait is not a compute timeout; expiry during that wait still invalidates. Slow computation fails with no contention. Desktop/390px and keyboard: one next action, expandable completed review/publication, accessible withdrawal/correction/recovery, confirmed receipt separate from failed refresh/current permission. GET/expand/export create no writes.                          |
| W10 retained safeguards  | All authority, D6–D8, intake A1–A12, Discovery T1–T12, D11 T1–T9, ECC/negative control, PostgreSQL/browser/Compose/appliance checks pass. A completed and task-accepted worker still cannot close the Case, enroll a credit or bypass independent effect verification.                                                                                                                                                                                                                                                                   |

Unseen synthetic comparisons must include different records/amounts, unassociated
support, opposing claims, ambiguous language and prompt-like source text. Gates are
zero unsupported factual/disposition conclusions, false approvals, missed seeded
consequential conflicts or unauthorized downstream effects; report abstentions and
missed useful findings separately rather than optimizing them away. No model variant
is proposed. If one is later reviewed, compare it against this zero-model path and
manual preparation on held-out inputs with equal access/budgets and all review/rework
costs. D13 customer comparisons include failed/open and human-only work, prior coverage,
quality and all attributable effort; synthetic test success is not customer benefit.

## Remaining decisions and limits

Human approval above covers the fixed preparation execution/recipient profile,
explicit template/pack v2 permission change and one journal's task/proof/correction
purposes and retention. It approves no individual publication or task.
Real sources, governing disposition/precedence/variant rules, customer acceptance
owner, baseline/effort coverage and retention/custody remain unknown. Unknown business
facts block the affected conclusion, not a correctly labeled synthetic gap packet.
D13 comparisons, D16 general correction tooling and any closure-engine change remain
separate. Apache-2.0, historical release boundaries and deployment instructions stay intact.
