# Synthetic investigation comparison: ready for activation review

This branch is stacked on PR #43 at `42170005f960abbc3d56cd0c8932cdd0587c00fe`.
PRs #40–#43 remain open dependencies. The normal appliance is still deterministic.
This implementation prepares an experiment; it does not establish that a model is
useful. **Live activation, credentials, spending and customer processing are not
approved.** The live factory refuses before reading a credential or sending HTTP.

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

## Proposed activation request — not approved

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
