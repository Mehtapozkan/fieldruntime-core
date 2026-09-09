# Bounded synthetic preparation worker

D12-B is implemented on this review branch under [Accepted D-037](../architecture/d12-bounded-preparation-worker.md).
PR #37 merged at `7b3b3e125591212a6392504298d9b467f1e2f464` after required checks.
This page describes implemented synthetic behavior, not the historical evaluation prerelease.
No real-customer activation, model calls, external tools/messages or business authority.

## Try the useful result

Use Node 24.19.0 / tzdata 2026b, pnpm 11.24.0 and the existing
[local appliance setup](5-minute-evaluation.md). Build the current source, then use
**Synthetic intake** (`/?view=intake`):

1. Explicitly prepare the bundled synthetic CSV and associated delivery note. Review
   North's record and explicitly create/attach its Case. Open its workflow brief.
2. Inspect the source reports and unknowns. Confirm the current description for
   **Workflow description**; an already-applicable confirmation is reused.
3. Inspect the fixed v2 candidate, give a selection reason/expiry and separately
   **Publish for preparation**. An old v1 publication never gains dispatch permission.
4. Select **Prepare evidence-request packet**. This explicit command runs the fixed
   worker once; reads never start work. Inspect the checklist, scoped reconciliation
   and **unsent follow-up**. Orchid's DEL-4 note reports missing confirmation; that
   neither proves non-delivery nor justifies its reported $15,000 disputed amount.
5. Give a task-review reason and **Accept preparation packet**, reject, request
   modification or escalate. Task acceptance means usefulness for preparation only.
   Accountable business owner, governing terms, original impact and closure remain unknown.
6. Reload: starts, results, task reviews, corrections and proof notes reconstruct from
   PostgreSQL. Completed description/publication sections remain expandable, including
   correction and withdrawal. New material needs fresh description and publication.

Cedar/SHIP-22 and multi-delivery fixtures produce different cited questions and
conflict/gap states; names, amounts, deliveries and conclusions are not fixture responses.
A positive source report is still not independent business verification.

## Executable API/restart control

On a **disposable synthetic appliance**, with the current source built:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm fr init ecc --demo
pnpm fr up
handoff_dir=$(mktemp -d)
node scripts/smoke-preparation-pack-api.mjs applied "$handoff_dir/pack.json"
node scripts/smoke-preparation-work-api.mjs applied "$handoff_dir/pack.json" "$handoff_dir/work.json"
docker compose restart postgres
docker compose up --detach --wait postgres
docker compose restart core
docker compose up --detach --wait
node scripts/smoke-preparation-pack-api.mjs durable "$handoff_dir/pack.json"
node scripts/smoke-preparation-work-api.mjs durable "$handoff_dir/pack.json" "$handoff_dir/work.json"
```

The scripts use ordinary APIs and preserve exact commands and receipts in new files.
They assert gap preparation, no credit recommendation, task acceptance, restart/export
reconstruction and exact retries. They contain no fault controls. Do not run fixture
initialization against an evaluator's existing dataset as a cleanup or replacement.

The strict [OpenAPI](../../packages/contracts/openapi/intake.v1.openapi.json) and
[work contracts](../../packages/contracts/schemas/preparation-work.v1.schema.json)
are authoritative shapes. With an explicitly published pack, GET
`/v1/intake/preparation-work?case_id=CASE&record_key=RECORD` returns exact current
`candidate_binding`, Case-local `work_revision` U and `work_head`. Submit:

```js
const command = {
  schema_version: "preparation-work-command.v1",
  operation: "start",
  binding: view.candidate_binding,
  expected_work_revision: view.work_revision,
  expected_work_head: view.work_head,
  replaces_invocation: view.invocations.at(-1)?.invocation_id ?? null,
  idempotency_key: "operator-chosen-original-key",
};
// POST /v1/intake/preparation-work/commands with JSON.stringify(command)
```

Save the exact bytes/key **before sending**. The response is the original immutable
**start receipt**, even when computation has completed. GET the terminal result;
a start receipt alone is not successful preparation. Exact retry returns that same
receipt without recomputing, writing or renewing permission. A lost response keeps
its original key; a deliberate fresh run uses a new key and exact replacement lineage.
One atomic IndexedDB slot protects intake, Discovery, publication and work commands
across tabs. A conflicting claim cannot send or overwrite; clear compares command identity.

A task review binds the exact invocation/result hash and latest U/head:

```js
const run = view.invocations.at(-1);
const review = {
  schema_version: "preparation-task-review.v1",
  operation: "task_review",
  purpose: "preparation_usefulness",
  invocation_id: run.invocation_id,
  result_hash: run.result_hash,
  expected_work_revision: view.work_revision,
  expected_work_head: view.work_head,
  decision: "approve",
  reason: "Useful scoped evidence request; business facts remain unknown",
  idempotency_key: "operator-chosen-review-key",
};
```

Reject/modify/escalate close that task review; modify also requires
`replacement_proposal`. Historical intervention uses its own current human eligibility;
stale execution does not grant acceptance. An interrupted run cannot accept a late result.
A pending run after crash does **not** resume: recover the original receipt, explicitly
interrupt with reason/U/head, then inspect fresh permission before a new invocation.

## Correction and lightweight proof

The wording correction panel binds the original first evidence request, before/after,
input/result, relevant citations, reason and U/head. The API also supports exact pointers
into the retained checklist, reconciliation or draft. This appends a proposal, never
edits original output. The independent evaluation reviewer can accept/reject its
explicit synthetic test candidate; no code/template/policy is automatically promoted.
A reviewed code change still needs supported implementation/profile version, fresh
publication and a new run/task review. Source changes additionally go through D9/D10.
The retained v1 interpreter and a separately bound v2 wording variant exercise replay
and replacement; the appliance selects v1. Clients cannot choose worker code.

**Proof readiness & separate costs** contains the five unknown readiness measures,
manual notes and full coverage/lineage. [Example note](../examples/d12-proof-note.v1.json)
is an explicit _unknown_ synthetic observation, suitable for the strict JSON input;
edit only facts actually supported by the supplied synthetic evidence. API `proof_note`
binds that note to exact invocation/input/result and U/head. It also accepts notes on
failed terminal runs. No telemetry or measurement calculation is inferred from elapsed
runtime timestamps. Source references are attributed reports, not independently verified
business proof; portable exports retain the note, not otherwise-unretained source files.

Cash, resolved disputes, credits, newly attended work and signed active attention remain
separate. Import alone is not newly attended work; credit is not cash. Missing is null,
not zero. Negative attention, reversals/reopens, exclusions, overlap and failed/open work
remain visible. No aggregate sums are offered, so overlapping/superseded notes cannot
inflate a displayed total. Model/tool, infrastructure, human, support and setup costs
are separate, with recurring/one-time treatment and unknowns. Broader customer proof is D13.

## Persistence, bounds and compatibility

Migration **0009_preparation_work** extends only the allowed v1/v2 discriminator in
the existing selection table and adds **one append-only preparation_work_journal**,
including indexed bindings and clock guards. Migrations 0001–0008 are byte-for-byte
unchanged. Normal appliance startup applies and checksum-checks 0009 atomically;
existing datasets keep their Case/review/selection histories and successful keys.
Take the existing dataset backup before upgrading; do not delete/reinitialize its volume.
No new restore or rollback-migration facility is supplied.

Legacy pack v1 and Discovery v1/v2 replay keep their original interpretation. Strict
v0/v1 contracts and frozen ECC are unchanged. v2 is validated explicitly, requires a
fresh publication, and binds the server worker profile. Work changes U and internal
writer coordination only, never C/D/P/R/S. The full conservative manifest still detects
business-input changes; the one-bundle bound counts material actually supplied to the
worker, not unrelated canonical invalidation hashes. Multi-bundle source material is
refused rather than truncated.

Limits: one record/bundle, 200 coverage rows, 20 associated support artifacts, 2 MiB
parsed UTF-8, 64 questions, 256 KiB result, four fixed steps, five seconds computation.
A disposable fixed Node worker thread has bounded heap and receives only canonical
inputs. Its trusted code imports no network/filesystem clients and makes no external
calls; this is not a hostile-code sandbox or generic worker host. Parent timing stops
before output validation/writer-lock waiting; those durations are separate. Exact
identity/scope/selection/input/effectivity checks run again under the terminal lock.
Reads/exports use repeatable-read snapshots without writer locks or durable writes.

Replay reconstructs canonical scoped output and retained start/current evaluation
inputs, actor profiles and versions. Coherently altered output, timing, index or obsolete
input prefixes fail readiness/read/export. A legitimate result before later Case changes
survives as history. Equal timestamps alone never order independent journals.
Dataset disposal ends replay; retained content is necessary for historical reconstruction.

## Acceptance and evidence

`node --test scripts/preparation-work-postgres.test.mjs scripts/preparation-work-browser.test.mjs`
requires the same local PostgreSQL URL and installed Chromium as the retained suites:

```bash
pnpm exec playwright install chromium
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  D12_SCREENSHOT_DIR=/tmp/d12-captures \
  node --test scripts/preparation-work-postgres.test.mjs scripts/preparation-work-browser.test.mjs
```

| D-037 gate | Implemented evidence                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1/W2      | Orchid + varied Cedar, scoped PR32 delivery/record/shared-object controls, ordering, source reports/gaps/conflicts and abstention; visible citations                   |
| W3/W4      | Strict caller denial, v1 prohibition, exact inputs and current identities/scopes/effectivity; description/Case/selection/profile changes, including during computation |
| W5         | Concurrent commands, exact retry/lost responses/restart, insert/commit failures, pending crash, interruption/late fence; real two-tab recovery                         |
| W6         | Four terminal task decisions, exact correction, independent evaluation, no promotion/acceptance transfer and new worker version/publication                            |
| W7         | Five distinct measures, separate costs, unknown/negative/overlap/reversal/reopen evidence, no business-history changes                                                 |
| W8         | Fresh/0008 upgrade, v1/v2 preservation, original exports, coherent forgery and legitimate earlier history                                                              |
| W9         | Input/output/time limits; >5s lock wait versus computation; unavailable input, read-only inspection, desktop/390px and keyboard                                        |
| W10        | Retained authority, action/verification, intake, Discovery, pack, ECC, browser and appliance suites remain required                                                    |

Actual final-head local/CI results and screenshot handoff are recorded in STATUS and
the implementation PR. Docker unavailability must not be described as a local Compose
pass. No customer effort savings, impact, acceptance, financial effect or closure is proved.
