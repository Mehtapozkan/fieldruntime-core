# Synthetic investigation comparison: conditional activation

This branch is stacked on PR #43 at `42170005f960abbc3d56cd0c8932cdd0587c00fe`.
PRs #40–#43 remain open dependencies. The normal appliance is still deterministic.
This implementation prepares an experiment; it does not establish that a model is
useful. The frozen v2 comparison is now conditionally approved. Account/custody/storage
and complete input-accounting gates are still pending; no live requests have been
sent. Customer processing remains unapproved. The original readiness evidence below
is preserved; the activation connection is described in the final section.

## What can be run now

Use Node 24, the pinned pnpm and a disposable local PostgreSQL database. No provider
credential is needed. The test host creates/removes its own schemas; it never
modifies an evaluator's existing Cases.

```sh
pnpm install --frozen-lockfile
pnpm build
node scripts/investigation-comparison.mjs --check-fixtures
node scripts/investigation-comparison.mjs --plan
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node scripts/investigation-comparison.mjs --baseline /tmp/investigation-baseline
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test scripts/investigation-readiness-postgres.test.mjs
```

Choose a new output directory each time. The baseline imports exact bytes, attaches
both bundles where specified, confirms the synthetic descriptive review, separately
publishes deterministic pack v3, explicitly prepares, exports, restarts and retries
the exact original command. All 24 local cases produced `prepared_awaiting_review`;
none was scored or task-accepted. Inspection of H17/H23/H24 found generic requests
for confirmation, terms and ownership even where a scoped report or supplied
excerpt exists. Those limitations are retained for blind review; the deterministic
worker was not tuned to this holdout. Provider calls: zero. Failed/open preparations
remain in `summary.json` and cause a nonzero demonstration exit, not silent exclusion.
The comparison runner and blinded exports distinguish a retained terminal failure
from an open invocation using its terminal entry hash, and retain the recorded
outcome. Invalid recovery exports stop the run for inspection.

`review/` contains producer-blinded labels, actual output text, source bytes and
associations, and empty quality/effort/cost fields. `coordinator/` contains the
blinding key, canonical exports, exact start commands/receipts and call plan.
It also contains both complete candidate request bodies per fixture, checked
against the source allowlist and byte budget. Their illustrative baseline bindings
are not executable permission; the real start must recompute the published binding. Do not
give the coordinator key to the reviewer. A partial baseline-only export cannot
conceal that the other arms are not run; final blinding requires all three arms.
Output structure/prose may still let a reviewer infer an approach; blinding is
producer-label concealment, not a guarantee of indistinguishability. Formatting conceals producer metadata only; it does not rewrite an answer or fill
missing output. The generic arm is the same model with a short generic instruction
and the same response shape, permitted sources and limits; it is not a claim about
every generic assistant product. No model-quality result is reported.

Model CLI selections (`--bounded-investigation`, `--generic-assistant`) currently
refuse before creating a host or reading credentials. Their serializer, interpreter,
shared reservations and export path, including the fixed three-arm runner in
`scripts/lib/investigation-comparison-runner.mjs`, are exercised with mocked HTTP through the
actual runtime/API/PostgreSQL path. Live activation will require a separately
reviewed configuration/credential connection; an environment variable is not enough.

## Exact fixtures and fair comparison

[Executable v2](../../evaluations/investigation/v2/manifest.json) and its
[correction record](../../evaluations/investigation/v2/CHANGES.md) were frozen in
local `42d5179` before baseline execution or prompt implementation on this branch,
published unchanged as `232524cfa8f3145d3db3ec0ec1d7090308438687`.
The [rubric](../../evaluations/investigation/v2/rubric.json) and separate
[expected assertions](../../evaluations/investigation/v2/expected.json) are checksummed.
The loader reads only the manifest and source files. Expected answers never enter
intake, runtime material or prompts. Frozen v1 remains byte-for-byte unchanged.

H17 now has DEL-17A and DEL-17B, with a report explicitly associated only with B.
H23 contains actual synthetic delivery, terms and owner excerpts. H24 contains
separately allocated A/B delivery excerpts across two bundles and terms/owner text.
These are retained source reports, not independent delivery verification. H15/H16
contain actual related-record/other-entity material, without transferring it into
the selected record's model input. All identifiers, source bytes and associations
are inspectable; assertions cannot stand in for missing fixture material.
Freeze-note erratum: the frozen `CHANGES.md` overincludes H10 in its two-bundle
list. The checksummed manifest and executable H10 both use one bundle; H07 and
H24 use two. No fixture, expected assertion or frozen checksum is changed by this
clarification.

All arms use the same retained permitted selection. The unchanged deterministic
worker also retains its existing structured coverage/context; model arms receive
only the scoped material produced by `investigationMaterial`, never extra evidence
or expected answers. Raw retained sources remain available to the reviewer to judge
applicability. Resource-negative variants are separate from the 24 admissible quality
cases. No failed, refused, interrupted, timed-out or open attempted case is dropped
from a model denominator. There are no automatic replacement calls or prompt tuning
against these held-out answers. Development mocks are separate test helpers.

## Versioning and persistence

| Material                            | Readiness version                  | Historical interpretation                                                              |
| ----------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| Published pack                      | v5                                 | v1–v4 unchanged; old publication grants no new permission                              |
| Worker/profile/input/result/history | v4, `disposition-investigation.v2` | work v1–v3, including fake-provider v1, unchanged                                      |
| HTTP evidence                       | `investigation-evidence.v2`        | raw mock HTTP, exact request/model/status/usage, separate unchanged proposal validator |
| Result export                       | v3 compatibility envelope          | D-039 business commands/authorization/acceptance remain unchanged                      |

Migration `0013_investigation_comparison.sql` extends only the existing selection
and work journal version checks. No table or second ledger is added. Apply through
normal appliance startup after backup; no old migration, entry, Case, C/R/S or
receipt is edited. New exports admit old histories and replay the correct interpreter.
The existing Workbench remains the deterministic default; comparison review uses
exports, with no model activation or catalog editor in the browser.
The provider-facing output schema uses local references, closed required objects
and explicit literal types; the historical proposal validator is unchanged.
Mock HTTP checks do not establish live provider acceptance or semantic correctness.

The same writer transaction commits one reservation before the HTTP callback.
The comparison refuses any record, source byte hash, identity or association outside
the exact frozen fixture manifest. A fresh key cannot reserve a second send for the
same fixture/arm, including after failure or uncertainty. Both arms and all Cases share `synthetic-comparison-v2`, with an ordinal and previous
reservation-entry hash. Exact retries return the original receipt with no new send
or write. A lost response, crash, refusal or failure consumes its full slot. Startup
never resumes a send. Interruption fences late results; terminal permission remains
current. Reads/previews/exports reserve nothing. A valid citation is not proof of a
correct interpretation; the conservative v1 proposal grammar remains an admitted
language subset and can reject harmless prose. That rejection is a visible failure.

## Original activation request — superseded by the conditional approval below

Approve only the frozen synthetic v2 comparison, after confirming every open item:

| Item               | Concrete proposal / remaining confirmation                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custodian          | Mehtap Özkan, proposed; explicit acceptance of credential custody and project controls still required                                                                                                                                                                                                                                       |
| Blinded reviewer   | Mehtap Özkan, proposed; confirm role or name a separate person before unblinding. A custodian/reviewer combination limits independence and must be disclosed                                                                                                                                                                                |
| Provider/model     | OpenAI Responses, exact `gpt-4.1-mini-2025-04-14`; account availability and project rate limits unconfirmed                                                                                                                                                                                                                                 |
| Tokenizer          | `tiktoken 0.12.0`, `o200k_base`, proposed exact local tokenizer. Current code uses a conservative 12,000 serialized UTF-8 byte allowance plus 4,000 reserved framing tokens, not an exact tokenizer measurement. Confirm the pinned tokenizer and complete schema/framing count before activation; refuse over 16,000 input tokens          |
| Access             | Dedicated synthetic-only project/service credential in an operator-owned secret file readable only by the adapter process. No credential exists in fixtures, browser, journal, exports or CI. File location, permissions and custodian are not yet confirmed                                                                                |
| Calls              | 24 bounded-investigation + 24 generic-assistant = 48 possible sends; deterministic arm 0. One send per key; no automatic retries and **zero additional fresh retry slots**. Uncertain outcomes keep the slot. Any extra run requires a new reviewed budget, not a reset                                                                     |
| Limits             | Same model/material, 16,000 input and 2,000 output tokens, 60 seconds before writer-lock waiting; complete input only, two bundles; 60,000 raw HTTP body bytes within the 65,536 retained envelope ceiling                                                                                                                                  |
| Pricing            | Standard uncached input $0.40 / million tokens, output $1.60 / million, checked 2026-09-10. Worst case per send: `(16000×0.40 + 2000×1.60)/1000000 = $0.0096`; 48 = **$0.4608**. No cached/batch discount assumed                                                                                                                           |
| Durable ceiling    | Round conservatively to **$0.02 per send; $0.96 total** in the existing U journal. Covers both model arms and unknown outcomes. This is a proposed reservation, not expenditure. Actual charges remain unknown until provider usage/billing evidence exists; taxes/account-specific charges must fit the approved total or block activation |
| Data controls      | Only exact synthetic scoped UTF-8 text, fixed instructions and output schema. `store:false`, `stream:false`, `background:false`, no tools/conversation/files/redirects. Confirm no data-sharing opt-in, actual project retention/cache settings, region and access controls; do not claim zero retention                                    |
| Retention/deletion | Proposed local isolated evaluation DB plus encrypted controlled exports for 30 days after review, then custodian deletes the complete isolated dataset/copies. Confirm location, access list, backups and deletion method. This is not selective deletion from immutable shared histories                                                   |
| Approval target    | This PR's final head, v2 checksums, exact profile/prompts and 48-call plan; no real customers, messages, financial actions or automatic promotion                                                                                                                                                                                           |

Official sources: [model snapshot/features/pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini),
[Responses request and response fields](https://developers.openai.com/api/reference/cli/resources/responses/methods/create),
[Structured Outputs schema format](https://developers.openai.com/api/docs/guides/structured-outputs),
[project data controls and retention](https://developers.openai.com/api/docs/guides/your-data),
[pinned tokenizer model mapping](https://github.com/openai/tiktoken/blob/0.12.0/tiktoken/model.py).
`store:false` does not itself remove abuse-monitoring or model-cache retention.
Public documentation does not establish this account's controls, access or pricing.
No account or credential was inspected for this work.

## Review and product meaning

A reviewer scores completeness, relevance, actionability and abstention 0–2, with
serious-error disqualification and the predeclared experimental 18/24 usefulness
target. Record actual preparation, review, correction, verification, follow-up,
founder/support and setup effort separately; retain failures and overlapping work.
Model, tool, infrastructure, setup, human and support costs remain separate nullable
fields. Missing is not zero; timestamps are not labor time. No costs or effort were
measured in this baseline beyond recorded runtime timestamps.

Cash collected, disputes resolved, credits issued, work newly attended to and human
attention released remain five separate unknown business measures. Task usefulness
is not a verified effect. D-039 exact authorization, independent observation,
business acceptance, payment commitments, DEL-5 separation and closure denial are
unchanged. A real-customer session still requires named participants, approved data
arrangements and a comparable baseline. D13 continues; D14 is not started here.

## Conditional activation handoff

The owner's approval of `7144571` permits only the 48 planned model-arm slots and
USD 0.96 total. The earlier fake contracts/call plan remain historical, including
`mock_http_only` and `reported_by_mock_http`. Live pack v6/work v5/evidence v3 bind
the confirmed non-secret activation record hash and require separate publication.
`0014_investigation_activation.sql` extends the two existing version constraints;
apply normally after backup. No table, backfill, budget reset or checksum edit.
Old mock slots in the same journal remain consumed. Never copy/reset the isolated
database to obtain another slot. The custodian controls the complete dataset.

The dedicated credential file must be absolute, owned by the adapter's OS user,
regular, unlinked elsewhere and inaccessible to group/others. Symlinks and unsafe
files fail closed. Only the adapter reads it, after prerequisite validation and a
committed reservation. It sends one non-streaming fixed-endpoint POST without
redirects, tools or retries. Exceptions are sanitized; a credential echo is not
retained. Neither browser/API commands nor environment variables enable live use.

The exact-pinned local encoder is `tiktoken` JS/WASM 1.0.22 (`o200k_base`). Its full
token sequences match official Python `tiktoken` 0.12.0 on all 48 illustrative
request bodies: at most **3,448 local tokens / 10,446 UTF-8 bytes**. The
[cross-check](../evidence/investigation-readiness/tokenizer-cross-check.json) and
[offline vectors](../../tests/fixtures/investigation-tokenizer-vectors.json) retain
that evidence. Actual published bindings are recomputed and counted at execution.
The frozen 12,000-byte ceiling plus 4,000 framing allowance is conservative
accounting, **not an exact Responses/schema framing count**. Official
[token-counting guidance](https://developers.openai.com/api/docs/guides/token-counting)
states that exact counting includes additional structural tokens. No counting or
inference request has been made. The owner subsequently approved up to 48 additional non-inference count requests,
with no retries and the unchanged total dollar ceiling. The remaining count-pricing
and data-control prerequisites must be verified before either request type.

Live receipts retain returned model/response identity and usage as
`reported_by_provider`, with an uncached price estimate in USD millionths. Actual
billing stays null until evidenced; an estimate is not a charged amount. Missing
response/usage preserves the full two-cent reservation and unknown cost. Replay
uses retained responses and the versioned interpreter, never another provider call.

The [counted activation v2 template](../examples/d040-counted-activation-pending.json) deliberately
contains null prerequisites and cannot activate the adapter. The previous
[activation v1 template](../examples/d040-activation-pending.json) is historical;
the coordinator requires v2. Keep the completed
non-secret record and credential file separate.

After the project and storage facts are explicitly confirmed, and the clean final
activation head has passing CI, the coordinator command is:

```sh
D040_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime_d040_v2 \
  node scripts/investigation-live-comparison.mjs --execute-confirmed \
  /approved/private/activation.json /approved/private/project-credential \
  /approved/private/existing-deterministic-baseline /approved/private/comparison
```

These are placeholders, **not confirmed locations or a command executed here**.
Use the existing baseline's exact validated archives; it is not rerun or tuned.
The dedicated loopback database retains the fixed `d040_live_comparison_v2` schema
and existing U journal across coordinator restarts. The directory binds the baseline,
activation hash and validated head. An operational `RUNNING` file prevents a second
coordinator; after a crash, inspect the journal and exact original keys before a
person removes that file for recovery. Recovery does not resend committed starts.
Do not delete the database or choose another key to recover uncertainty. The
coordinator never auto-removes this fence or starts replacement runs.

`review/` holds shuffled labels, actual output and supporting sources, with scores,
effort and costs blank. `coordinator/` separately holds the mapping, original commands,
canonical exports, reservations, usage and failures. Mehtap Özkan is both custodian
and reviewer: do not inspect producer mappings while scoring, and disclose that
combined roles and recognizable output styles limit blinding/independence.
Failures/refusals/open attempts remain in the denominator; no customer/business
outcome, measured labor saving or winner is implied. The normal appliance stays
unchanged. D-039 payment obligations, DEL-5, all five measures and closure denial
remain intact. All 19 requirement IDs and the revised D13 sequence are preserved.

Pending confirmations are the actual dedicated project/model/rates and charges;
data sharing/retention/cache/region/access; local credential path and custody;
isolated database/export access and encryption, backups and complete deletion 30
days after review; and complete input-accounting treatment. Public docs do not fill
those blanks. No provider requests, credentials or spending are used for CI.

Activation regression command (fake credentials/HTTP only):

```sh
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test scripts/investigation-activation-postgres.test.mjs
```

The local PostgreSQL 18.4 run passes all 10 tests: live attribution, preserved mock
history/upgrade, exact restart retries, shared reservations, concurrent starts,
failed start/terminal writes, lost acknowledgment, timeout, late-result fencing,
coherent proof tampering and private-file custody. This is hermetic transport
evidence; final-head PostgreSQL 17/Compose/appliance CI is linked from the PR.

### W5 response-window regression

PR #44's `8538e9a` appliance run failed while waiting 12 seconds for the third
A command response, before the existing 15-second browser request deadline. Its
API A→B→A control passed. The repaired test allows 20 seconds for the response
observer and deliberately delivers the third response at least 12.5 seconds after
the request. The real server still commits normally; product timeouts and worker
budgets are unchanged. All record, replacement, fresh-review, restart and exact
retry assertions remain. This tests response latency, not measured human effort.

```sh
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test --test-name-pattern='D12 W5 browser shared-Case' \
  scripts/preparation-work-browser.test.mjs
```

The unmodified local control passed; the controlled delayed response failed before
the repair at 12 seconds despite HTTP 200, then passed after the repair. Required
full CI on the resulting head is linked in the PR; a partial run is not a pass.

### Approved counting connection and guided account setup

The owner's additional allowance is at most 48 non-inference token-count POSTs,
one per frozen fixture/model arm, alongside the existing 48 inference slots. No
retries, repair requests, replacement runs or increase to USD 0.96. Both arms use
`gpt-4.1-mini-2025-04-14`; frozen inputs/prompts/schema/baseline remain unchanged.

Config `comparison-activation.v2` adds only `counting.max_calls: 48`, `retries: 0`,
an explicitly confirmed `max_charge_usd_micros_per_call` and non-secret
`pricing_and_data_controls` evidence. The last two fields start null. Unknown is
not free. Complete worst-case pricing must include counting and any other charges
within the existing two cents per fixture/arm and 96 cents overall. Public token
rates bound inference at $0.4608; count charges are not documented by the reviewed
endpoint guide and must be confirmed independently. No pricing or storage approval
is inferred from the additional call allowance.

After the existing durable start reservation, the adapter sends one fixed-endpoint
POST to `/v1/responses/input_tokens`. Its body is the actual inference request's
`model`, `instructions`, `input`, `text` (complete output schema), `tools`,
`tool_choice` and `truncation`. Generation/transport-only options are omitted from
counting; the inference body remains unchanged. The count must be strict valid
JSON with unique fields, successful status, the expected object type and a positive
integer no greater than 16,000. Before inference, a fresh validated read must still
show the exact pending invocation/start hash and unchanged candidate binding. This
read-only check stops known interruptions or changed inputs after counting; it is
not an atomic permission lease, and the runtime still fences late terminal results.
The existing 60-second worker budget covers both
requests. No count response or error grants authority.

Private `coordinator/counts/` evidence binds the exact original request and count
payload hashes, payload, local time, status and bounded raw response. Exclusive
files are synced before the count attempt and before inference. This is supporting
coordinator evidence, not another ledger. The existing start journal/key is the
no-resend boundary; restart or exact retry never invokes either request again.
Uncertain count outcomes retain the full reservation; no inference is sent after
failed evidence persistence, missing/invalid counts, cancellation or an exceeded
limit. Existing live/mock receipts and runtime interpreters are unchanged. Their legacy
`provider_calls_permitted` field does not enumerate the new count requests; use the
coordinator count evidence alongside inference reservations for the complete request
account. Count billing remains unknown until evidenced. No new
migration, dependency, model loop or appliance activation endpoint is added.

For guided setup, start at [Projects](https://platform.openai.com/settings/organization/projects):
select or create a dedicated synthetic project, record its ID, inspect project
model permissions, members/service accounts and key restrictions, then inspect
organization Data controls and Billing. Report the non-secret values actually
shown; an unavailable control is unknown. Keep sharing disabled for this project.
The [official project/key guide](https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-with-projects)
and [sharing guide](https://help.openai.com/en/articles/10306912) explain these controls.
No Playground inference or unplanned API probe is needed. Save the dedicated key
in an owner-only local regular file and provide only its path. Close the secret
display before screenshots; never put credentials in chat, logs, Git or exports.

The owner explicitly requested inspection and guidance rather than certifying
unseen settings. Project pricing/model/data facts, credential custody and isolated
storage/access/backup/cloud-sync/deletion are still unconfirmed. Current local
inspection and the precise storage proposal live in the private handoff, not in
public Git. Combined custodian/reviewer roles remain recorded; human scores and
effort stay blank until provided. Final-head mocked PostgreSQL/API and full CI
results belong in the PR; tests are not a completed live comparison.
