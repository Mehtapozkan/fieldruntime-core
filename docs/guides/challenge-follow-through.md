# D13 follow-through: supplied evidence, fresh review, proposed improvement

PR #39's completed Challenge report at `859b0fe9` remains intact and unmerged.
This continuation adds one executable synthetic rehearsal and a proposed next slice.
It does not restart D13, complete customer comparison or advance to D14.

## What the operator can do now

Start with Orchid / dispute-17 / DEL-4 and its actual unsent request. A person
supplies a new local TXT note, explicitly associated with `entity_north`, record
`dispute-17`; the literal text is `Delivery confirmation for DEL-4 is supplied.`
This is a **synthetic source report**, not an independently inspected proof of delivery.
The existing CSV is retained with the new support as a new bundle. The operator
previews and explicitly attaches that material to the same Case, confirms the new
Discovery description and separately publishes the changed v2 preparation artifact.

The rehearsal also retains dispute-18 / DEL-5 in that Case. Both records share
Orchid / INV-101; that label never transfers DEL-4 evidence to dispute-18.

| Stage                       | Actual supported result                                                                            | Permission / next action                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Original preparation        | A cited DEL-4 gap packet and unsent request; one synthetic task-usefulness approval                | No message, verified delivery, credit or resolved dispute                                                                                                                      |
| New note retained           | Exact bytes, hash, source locator and record association; Discovery reports confirmation for DEL-4 | Conservative business-input invalidation makes the earlier preparation historical even before attachment; C has not changed yet                                                |
| New material attached       | Explicit new intake receipt and Case event; C advances                                             | Old command binding is rejected; original packet/review stays unchanged                                                                                                        |
| Fresh description confirmed | D advances; new source report is inspectable; terms, ownership and underlying proof still unknown  | Confirmation is descriptive, not publication or business authority                                                                                                             |
| Separate v2 publication     | New artifact and selection P; old selection remains historical                                     | A fresh start is still subject to resource/identity/binding checks                                                                                                             |
| Fresh start submitted       | **400 `WORK_INPUT_LIMIT`**, no start/terminal entry or transferred approval                        | Pack cites two retained bundles; Accepted D-037 permits one. A person can inspect the fresh brief and continue manually. Do not erase history or omit citations to make it run |
| Restart and exact retries   | Original start, task approval and intake receipt reconstruct without another write                 | Historical success never renews permission. Case remains `detected`, outcome/financial records absent                                                                          |

In this exact fixture, C advances **2 → 3**, descriptive D **1 → 2** and selection
P **1 → 2**; U stays **3** after the refused fresh start. The CSV row's
`source_revision` stays unchanged: the new bundle/support, material hash, intake
receipt and Case/description/selection bindings carry the change. Row revision alone
must never authorize a refreshed packet. The literal TXT form is recognized by the
pinned parser; arbitrary text remains ambiguous rather than being model-interpreted.

The read currently reports `can_start` before this input-bound check. It is not a
promise that POST will succeed. The proposed slice below must expose this resource
blocker before inviting preparation. No runtime eligibility or limit is changed here.
The denied fresh submission is a test/API diagnostic, **not a committed invocation
receipt**. Counts remain two records, one Case, one started invocation and one
historically task-accepted packet. Newly attended work and business outcomes are unknown.

## Execute and inspect

Use the same Node 24.19.0 / tz 2026b, pnpm 11.24.0 and explicitly disposable local
PostgreSQL setup as the [existing Challenge rehearsal](challenge-report.md).
The test owns and drops only its random schema. No evaluator Case history is changed.

```sh
pnpm install --frozen-lockfile
pnpm build
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  D13_FOLLOW_THROUGH_DIR=/tmp/fieldruntime-follow-through \
  node --test --test-name-pattern='D13 follow-through' scripts/challenge-postgres.test.mjs
```

Open `before/report.html`, then `after/report.html` in that output directory.
Each retains its own exact archive, manifest and report; use the existing offline
CLI to reproduce either. `follow-through.json` includes the supplied input, exact
intake receipt, original task receipts, fresh description, proposed start binding
and both denial responses. Inspect:

- `/observation/original_delivery`: DEL-4 `not_supplied` in the original packet.
- `/observation/supplied_claims` and `/observation/sources`: the new DEL-4 claim,
  explicit record association, citation IDs, bundle/hash, excerpt and byte locator.
- `/other_record/material/source_claims`: filter `applicable_record_key` to
  `/observation/other_record_key`; no supplied-confirmation claim applies to DEL-5.
- `/observation/before_binding` and `/observation/proposed_binding`: exact old/new
  Case/description/publication/source anchors. U does not advance for a denied start.
- `/stale_start` and `/blocked_start`: expected refusals; unexpected acceptance fails
  the test. `/fresh_description` is new material, not a rewritten historical packet.

A supplied note saying confirmation exists does not mean the underlying original
was retrieved, inspected or independently verified. No worker searches or sends.

## Make the access boundary visible

| Evidence / task                         | Available capability and evidence                                                                        | Human next action                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Retained CSV and associated TXT         | Parsed locally with pinned rules; exact bytes/citations in export                                        | Inspect record/delivery association, freshness and source wording                                                  |
| Original confirmation referenced by TXT | Not present as independently verified original; retrieval unattempted and external retrieval unsupported | Identify the evidence owner, permitted access route and original document; supply only approved supported material |
| PDF/image, if supplied later            | Retained-only; no implicit OCR or parsed contents                                                        | Inspect through an approved human process; do not infer contents from filename                                     |
| Terms / disposition rule                | Not established by the fixed template; absence of a field is not proof terms do not exist elsewhere      | Obtain applicable contract/rule, entity/effectivity and accountable reviewer                                       |
| Accountable owner                       | Queue reports Taylor for dispute-17; that is not a grant or confirmed acceptance owner                   | Confirm who can access evidence and who can make the business decision                                             |
| Request delivery / follow-up            | Draft only; no external messaging tool or sent receipt                                                   | A person decides recipient, permission and sending outside this runtime; do not mark it sent here                  |

## Existing versus missing contracts

| Progress                                     | Existing canonical path                                                                                                                                                                | What it cannot establish / missing boundary                                                                                                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence arrival and Case attachment         | `intake-prepare.v1`, review/selection preview, `intake-selection.v1`, immutable bundle/commit, Case `WorkEvent`; [intake API](../../packages/contracts/openapi/intake.v1.openapi.json) | Association and source reports, not authenticity, independent observation or disposition; never guess a Case from invoice labels                                                                               |
| Descriptive answer/correction                | `discovery-review-command.v1` annotate/confirm, exact input/Case/D bindings and export                                                                                                 | Historical practice is not executable policy; genuinely new facts require new material/review                                                                                                                  |
| Preparation permission                       | Strict pack v2 and selection publish/withdraw/rollback under D-036/D-037                                                                                                               | New permission cannot reuse stale description; current one-bundle resource limit blocks this fresh run                                                                                                         |
| Packet usefulness / correction               | Preparation start/result, task review, correction/evaluation review and export in the existing U journal                                                                               | Task approval is not business/customer acceptance; evaluation review never promotes code or policy                                                                                                             |
| Reported progress and proof readiness        | `preparation-proof-note.v1`, exact run/result, source, time, coverage, unknown/value and correction/reversal/overlap references                                                        | Synthetic attributed notes are not independent outcome proof or a verified source-read contract                                                                                                                |
| Financial proposal/approval                  | D6 exact Authority Request/Decision contracts exist for their server-controlled synthetic workflow                                                                                     | Imported disputes have no reviewed disposition policy/profile/proposal path. Do **not** enroll or map this Case into D7's separate Orchid-credit demo by customer name                                         |
| Independent business observation             | D7 has an attempt-bound read-back of its own simulated credit source                                                                                                                   | No general delivery/dispute/receivable observation contract, verifier/read adapter or approved external access exists for this imported Case                                                                   |
| Business disposition and customer acceptance | Canonical v0 `Outcome` requires evidence, verifier and verification time; generic Case transitions do not fill them                                                                    | No complete supported command for this imported dispute's authoritative disposition, independent observation and customer acceptance. Never fabricate those required fields or use task review as a substitute |
| Closure                                      | D-013 rejects `resolved` without complete proof; D-014 retains attributable transition rejection                                                                                       | Missing authorized action/no-action, independent outcome proof, commitment ownership/completion and acceptance cannot be bypassed by intake/status text                                                        |

Before implementing an imported-dispute outcome path, a separate proposed decision
must name: exact Case/record/input and governing terms; allowed dispositions
(payment, settlement, credit or no action) and their own payload-bound authority;
source/observation scope, expected-versus-observed comparison, independent verifier,
observation time and mismatch/inconclusive handling; eligible customer acceptor,
exact outcome/observation accepted, rejection/reopen/reversal; revision, idempotency,
replay and custody rules. Existing tables may suffice, but their approval purposes
cannot be silently broadened. **None of that boundary is implemented or approved here.**

## One proposed improvement — decision remains with a person

**Proposal:** combine the initial evidence request into one human-reviewed preflight
agenda: exact delivery/original-proof location, permitted inspection route, evidence
owner, applicable terms and business decision owner. Where independent, a person
can request proof and clarify terms/ownership in parallel. Preserve source-specific
review and financial authorization; sending remains outside this worker.

**Cited observation and coverage:** the original packet's DEL-4 checklist and both
CSV record locators show two synthetic disputed deliveries without associated proof.
The new note's exact association supplies a DEL-4 status report but leaves the
original proof and governing/ownership questions open. Before/after exported drafts,
Discovery findings and the canonical intake/task receipts supply the evidence.
These are **two records on one Case, one original preparation**, not two independent
Cases or a measured recurring rate. The repeatable constraint is a hypothesis:
receiving a status-only answer can leave another round of human access/ownership
clarification. The fixed template's inability to establish terms is also a product
limit; it is not proof of a customer's process defect.

| Decision factor        | Proposed assessment, not a measured result                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Affected cohort        | Subsequent comparable North invoice-dispute records lacking original delivery proof and/or an accountable evidence/terms owner; disclose exclusions and missing source inputs                  |
| Expected benefit       | Fewer avoidable clarification rounds and a more decision-ready evidence set; magnitude and business impact unknown                                                                             |
| Cost                   | Preflight preparation, recipient reading, review/correction, permission checks and founder/support/training effort; tool/infrastructure/setup costs separately recorded, all currently unknown |
| Feasibility            | A person can use the existing draft and local supported intake today. No connector or automated send is needed. Worker re-preparation on two cited bundles requires Proposed D-038             |
| Alternatives           | Keep sequential requests (less initial burden); request only original proof first; use the existing combined agenda with manual follow-through; defer if ownership/access is unavailable       |
| Unresolved assumptions | Same owner can answer or route questions; combined agenda is not too burdensome; parallel requests are independent and permitted; useful quality survives; no extra sensitive data collected   |
| Human choice           | Process owner may accept a bounded experiment, revise or reject it. No process change, individual pack or business authority is approved by this document                                      |

Pre-register the **next comparable batch** before results: same eligibility, input
cut-off, evidence sufficiency strata, task quality and time/tool/cost budget. Compare
sequential versus combined/parallel human-reviewed requests; counterbalance order
and disclose repeated-Case learning. Use the [manual/generic-assistant protocol](challenge-customer-protocol.md)
for any third arm with identical allowed inputs and tool access. Neither comparison
has run. Keep failed, open, denied and human-only work in the denominator. Measure
quality/omissions, clarification rounds, task acceptance, all active preparation,
review, correction, verification and support effort, and elapsed/wait time separately.
Agree the observation window and decision threshold with the process owner first;
missing measurements stay unknown. A 25-Case exception sample gives no overall rate.

Cash collected, disputes resolved, credits issued, work newly attended to and human
attention released remain five distinct measures. Preserve negative results,
reversals/reopens and overlap, with all attributable human/model/tool/infrastructure/
support/setup costs. Preparation effort per accepted packet is not effort per
verified business outcome; this rehearsal has no verified-outcome denominator.
Imported evidence or another preparation is not newly attended work; credit amount
is not cash/savings. The ten-minute useful-packet target remains an experiment.

## Smallest next implementation and acceptance

Within today's accepted boundary, this PR implements only the executable rehearsal,
read-only before/after exports and contract/improvement handoff. It preserves the
completed report, five-measure calculation rules and original failure coverage.

[Proposed D-038](../architecture/d13-bounded-follow-through.md) is the precise approval
needed for worker re-preparation across the two retained bundles. After approval,
one small implementation PR should add the explicit compatible version and resource
preflight, reuse existing review/publication/start/recovery and expose the existing
fresh brief/packet in the Workbench. No new dashboard, outcome journal, connector,
manual-message tracking or D14 work is required.

| Scenario             | Current executable assertion / next implementation gate                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1 supplied evidence | Exact DEL-4/record association and new citation; DEL-5 does not inherit it; source report stays independently unverified                                                                                                       |
| F2 stale consent     | Retention invalidates prior current use; attachment advances C; stale-bound command denied without writes; old packet/review unchanged                                                                                         |
| F3 fresh review      | New descriptive confirmation and separate publication required; now assert `WORK_INPUT_LIMIT` on two bundles. Proposed v3 must prepare only after explicit current permission                                                  |
| F4 history/retry     | Old export reproduces unchanged; original commands return original receipts after restart without another write/attempt; rejected fresh start fabricates no result                                                             |
| F5 boundaries        | One Case remains detected; no outcome, action receipt or proposal; task usefulness never grants business authority/closure; original Challenge retains failed/open work and negative proof notes                               |
| F6 proposed v3 only  | Two-bundle positive control; third bundle and aggregate overflow denied before start; v1/v2 remain unchanged; stale/conflicting sources retained; current U/C/D/P, identity, interruption, exact retry and replay gates remain |
| F7 improvement proof | Human chooses experiment; comparable batch includes negative/open work and complete effort/cost/quality coverage. No automated promotion, savings or customer outcome inferred from rehearsal                                  |

Real-customer work still needs named participants, approved files/processing/custody/
access/retention/deletion and a baseline. Synthetic seat selection is not authentication.
Apache-2.0, the historical prerelease and existing merge/release/deployment instructions
are unchanged. PR #39 remains open; this is not a merge or deployment request.
