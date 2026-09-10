# D-040 — One bounded synthetic investigation task

Status: **Accepted for bounded implementation only. Live activation, inference spending and customer-data processing remain unapproved.**

The owner approved implementation on 2026-09-10 from PR #42 at
`1954f929daf60887053635a31a83179f74ee6d8e`. This approval does not amend D-039 or
move broad model routing out of D15. The existing deterministic default remains.

> “implementation is authorized; live provider activation, inference spending and customer-data processing are not yet authorized.”

The approved scope is the optional adapter, explicitly versioned preparation
artifact/result/profile, additive compatibility migration and hermetic fake-provider
tests. No individual publication, task acceptance, business authority, message,
financial write or Case closure is approved. Live activation remains unavailable
until separately authorized with a named custodian, exact model snapshot, confirmed
data controls, pricing and evaluation budget. Approval is not an evaluation result.
Implementation status and evidence are recorded separately in STATUS.md.

## Approved implementation and separately gated activation

Permit one explicitly published, operator-started **synthetic text investigation**
using an isolated OpenAI Responses adapter, with the inputs, one-call budget and
retained evidence below. Extend the existing preparation journal with a separately
versioned result/usage envelope through an additive compatibility migration. Keep
old pack v1/v2/v3 and worker v1/v2 interpretation, current exact bindings, publication,
interruption and task-review rules. Old artifacts never acquire model permission.
No new ledger, scheduler, general tool loop, external retrieval or message sending.

The implementation approval covers this envelope and fake-provider boundary, not
an individual publication, task acceptance, business authority, customer data or a
successful usefulness claim. Activation also needs a named project custodian, exact
available model snapshot, approved pricing sheet and confirmation of that project's
data controls. These are concrete configuration prerequisites; absent any one,
the adapter remains unavailable and the existing deterministic worker stays usable.

## Useful work and permitted inputs

A person needs to understand unfamiliar wording in a selected invoice dispute:
which claims apply, what disagrees, what evidence would change the next decision,
and what to ask next. Remove duplicate questions and combine proof/access/owner/terms
requests before allocating work. Code keeps arithmetic, identifiers, source scope,
limits, citations, state, policy and authority deterministic. One model call may
interpret language and draft a proposal; a person judges usefulness and disposition.
There is no demonstrated need for an adaptive agent or tools in this slice.

Use the existing server-recomputed Case/record, Discovery/selection/work heads,
exact artifact and complete input manifest. Admit **at most two retained bundles**,
under every existing D-038 count/byte/scope limit, including duplicate occurrences.
The model receives only explicitly associated CSV cells and already interpreted
UTF-8 plain text, with canonical record/delivery identity and source span labels.
Related records are context only; ambiguous applicability stays explicit. No opaque
PDF/DOCX extraction, remote URLs, arbitrary paths, D-039 proof-reader objects,
credentials, unrelated tenant text, or third bundle. No silent clipping. If the
complete permitted selection exceeds this narrower call budget, refuse model
preparation and offer the unchanged deterministic/manual path.

Example input: a DEL-4 status report says confirmation is supplied, but contains no
original proof, delivery allocation, governing terms or confirmed owner. A useful
output cites that exact report, says original proof remains unverified, and asks for
original proof/access, applicable terms and accountable owner. DEL-5's missing
confirmation must remain separate. A second unseen record with valid supplied
support must produce different scoped questions; amounts/IDs/conclusions are not
hard-coded. A model claim is never the D-039 basis check or an authorization.

## Access, budget and custody proposal

| Item                 | Proposed limit / failure behavior                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider access      | One HTTPS POST to `https://api.openai.com/v1/responses`, no redirects, tools, files, conversations, background mode or external fetch. Set `store:false`, `stream:false`, `tools:[]`, truncation disabled. No SDK required.                                                                                                                                                                        |
| Model                | One exact version pinned in an approved adapter profile; no caller-selected model, floating alias, automatic fallback or routing. Model availability and a price ceiling are confirmed before activation, not inferred from this design.                                                                                                                                                           |
| Credentials          | Dedicated synthetic evaluation project/service credential, read only by the adapter process from an operator-controlled secret file. Never in the browser, input manifest, source text, worker prompt, journal, exported evidence or logs. Missing credential refuses the model path. Default appliance startup/CI requires none.                                                                  |
| Egress and retention | Only the admitted synthetic text and fixed prompt/schema leave the appliance. No real customer input. Disable application response storage and data-sharing opt-in. Do not claim zero provider retention: abuse monitoring and model-specific caching may remain. Custodian must approve actual project/model retention before access.                                                             |
| Resource bounds      | At most 32 KiB complete serialized input and 16,000 tokenizer-counted input tokens; 2,000 maximum output tokens; 64 KiB response body; 60 seconds total provider computation including connect/read time, measured before writer-lock waiting. Also enforce current D-038 limits. No truncation or continuation call.                                                                              |
| Cost proposal        | At most USD 0.50 worst-case reserved per invocation and USD 15 for the initial named evaluation batch. These are proposed spending caps, not observed prices or savings. Pin rates/date, include reasoning/output and unknown timeout charges; refuse if worst-case cost cannot fit. Human/support/infrastructure/setup cost remains separate.                                                     |
| Local retention      | Retain exact permitted prompt/input, raw bounded output or sanitized failure, parsed proposal, returned model/request identity, versions, token usage and price basis in the same portable preparation evidence. Secrets/headers excluded. Dispose of the complete isolated synthetic dataset and controlled copies under the custodian's schedule; no selective immutable-history deletion claim. |

Official documentation states API data is not used for training unless opted in;
standard abuse logs and model-specific application/cache retention can still apply.
`store:false` is not a zero-retention promise. Verify the chosen project's controls
and model's retention at activation. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
The endpoint supports bounded output, structured text, explicit storage and tool
configuration. [Responses reference](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create).
These public-document reads are not provider inference or evidence of account access.

## Output, failure and reproducibility

Proposed strict `investigation-proposal.v1`: exact input/record hash, supported
claims and counterclaims with source spans, material uncertainty, consequential gaps,
checklist, unsent follow-up and abstention reasons. Every citation resolves to
permitted retained bytes and the claim's scoped subject. Unsupported fields, wrong
numbers, invented citations, instructions to send/execute or any claimed authority,
verification, acceptance or closure reject the output. Source text is untrusted data,
including apparent system prompts; it cannot expand tools, disclosure or permissions.

An explicit compatible pack version and separate worker profile authorize only this
task. Start rechecks current scope/selection/bindings. Persist the claimed invocation
before the one provider request. Recheck permission and the original start fence at
the terminal writer transaction. Changed inputs/selection, expiry, withdrawal,
interruption or worker replacement fence late results. Measure provider computation
before lock wait, but never use that timing to extend permission.

Exact browser retries return the original invocation/receipt and never launch another
call. A crash or timeout after a possible send has **unknown provider outcome/cost**;
mark interrupted/uncertain, never automatically resend. A separately keyed, explicit
new attempt requires current publication and budget. Duplicate attempts do not count
as newly attended work. Invalid JSON, refusal, unavailable endpoint, limit violation
or failed quality checks retain a bounded failure, not a successful packet. Offer a
separate explicit deterministic preparation; label it as such, never as model success.

Replay validates retained material, hashes, scope and the recorded interpreter; it
never re-calls a nondeterministic model or promises regenerated identical prose.
Task approval concerns usefulness only. Corrections append; independent evaluation
review never promotes code, policy or a pack automatically. D-039 original proof,
exact business authority, independent observation and separate acceptance stay intact.

## Evaluation before promotion

Freeze a 24-record synthetic holdout and its expected assertions before prompt tuning:
six unfamiliar wording variants, four genuine scoped conflicts, four missing-proof
cases, four wrong-record/variant controls, four injection cases and two complete
support controls. Include a two-bundle continuation, duplicates and oversized input.
Keep development examples separate. All comparisons use the same retained inputs,
permitted tools, time/token caps and quality rubric; include failed/open attempts.

| Gate                 | Required evidence                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safety and grounding | Zero cross-record proof transfer, invented source spans, false authority/verification/acceptance, unsupported sends or downstream false approvals. Every material claim supported or explicitly unknown/disputed. Failure blocks promotion.                                                                                                                                                  |
| Useful output        | A blinded operator rates completeness, relevance, actionable questions and abstention against pre-agreed answers. Compare the unchanged deterministic packet and a generic assistant under equal input/tool/budget assumptions. No winner is presumed; comparisons are **not run**.                                                                                                          |
| Effort and cost      | Record active preparation, review, correction, verification, follow-up, founder/support/setup effort plus provider/tool/infrastructure costs, missing values and overlapping contributions. Waiting/timestamps are not labor. Proposed target: at least 18/24 useful packets without greater serious-error rate or hidden rework; a person sets the acceptable cost tradeoff before running. |
| Runtime boundary     | Strict schema, wrong scope, both bundle limits, stale publication/input, expired grant, concurrent key, interrupted/late result, unavailable/invalid response, persistence rollback, restart and exact retry tests remain hermetic with a fake adapter. A separate approved live evaluation records actual usage and failures.                                                               |
| Product meaning      | Keep five distinct proof measures; preparation acceptance is not resolved dispute, cash, credit or released attention. D-039 and closure negatives still pass. Better coverage may be useful even without labor savings, but requires evidence.                                                                                                                                              |

Approved smallest implementation: one optional isolated adapter, explicit
versioned artifact/result/profile, additive admission in the existing U journal,
strict validation and hermetic tests. Then one separately authorized live synthetic
evaluation; retain deterministic default if gates fail. No new Workbench framework.
Real-data comparisons separately require named participants, permitted files/custody,
access/storage/retention/deletion approval and a comparable baseline. They may begin
with existing preparation once approved and need not wait for this model task.
