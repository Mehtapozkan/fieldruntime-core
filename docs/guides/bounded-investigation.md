# Optional investigation: implementation handoff

Accepted D-040 authorizes this implementation and hermetic tests only. This review
branch is stacked on PR #42 at `1954f929daf60887053635a31a83179f74ee6d8e`.
PRs #40–#42 remain dependencies; none is merged by this assignment. Existing
D-038 acceptance evidence and D-039 result/Workbench controls are preserved.

The normal appliance still uses deterministic preparation. The optional port can
interpret unfamiliar scoped reports, propose contradictions and consequential gaps,
consolidate evidence/access/owner/terms questions and prepare an **unsent** draft.
Its output is unreviewed. Exact quotations establish citation conformance, not
correctness of the interpretation. A person must inspect and review the exact result.
The hermetic transport tests are not evidence that a live model is useful.

## Executable synthetic API rehearsal

Use Node 24 and the repository's pinned pnpm. Install with
`pnpm install --frozen-lockfile`, then `pnpm build`. Start the existing disposable
PostgreSQL appliance as described in [the API guide](synthetic-dispute-result.md).
Run against a local disposable PostgreSQL database; the helper creates and removes
its own schema and never modifies an evaluator's Cases:

```sh
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  D040_HANDOFF_DIR=/tmp/fieldruntime-investigation \
  node --test --test-name-pattern='explicit v4 publication' scripts/investigation-postgres.test.mjs

D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test scripts/investigation-postgres.test.mjs
```

The first command performs real HTTP calls and PostgreSQL transactions: supported
synthetic intake → descriptive confirmation → explicit pack v4 publication → start
→ fake response → retained unreviewed packet → separate task approval → restart →
exact retries. It writes the actual command, start receipt, awaiting-review view,
task-review command/receipt and post-acceptance view/export to the chosen directory.
No provider call, spending or customer outcome is demonstrated.

The existing routes are reused:

| Operation        | Exact command/read binding                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Candidate/read   | `GET /v1/intake/preparation-packs/pack_synthetic_invoice_dispute_north?bundle_id=…&record_key=…&case_id=…`; read-only                                                                |
| Publish          | `POST …/selections/publication`, `pack-selection-command.v4`; exact candidate hash/basis, selection head, publication profile and current eligible reviewer                          |
| Start            | `POST /v1/intake/preparation-work/commands`, `preparation-work-command.v3`; exact server candidate binding, Case-wide U/head, previous Case invocation and original key              |
| Inspect/export   | `GET /v1/intake/preparation-work?case_id=…&record_key=…[&representation=export]`; no reservation, writer lock or durable changes                                                     |
| Review/intervene | Existing purpose-specific command, with explicit `.v3` for investigation history; original invocation/result hash and exact U/head. Approval establishes preparation usefulness only |

`tests/helpers/investigation.mjs` injects `syntheticInvestigationContext()` and
`hermeticInvestigationPort()` **on the disposable server**. Client commands cannot
select a model, provide credentials, change scope or supply successful output.
There is no environment switch, network transport, credential loader, normal source
editor or activation endpoint. `liveInvestigationPort()` always refuses. Default
startup, Workbench and CI require no credentials. The Workbench can validate the
new history; it does not expose an investigation activation control.

## Retained evidence, limits and recovery

Pack v4 binds the separate `disposition-investigation.v1` profile. Input/result/journal/
read/export v3 retain prompt version, exact full scoped text, canonical identities,
request hash, raw bounded response or sanitized failure, model/request attribution,
usage when supplied and parent timing. Deterministic code still owns identifiers,
arithmetic, source applicability, policy and authority. No D-039 proof-source object
is sent to the adapter. Related invoice labels cannot transfer evidence. Record association alone does not
make a note evidence for every delivery on that record: a delivery citation requires
its explicit source association or exact identifier in the text. Those identifiers
are scope tags, not verified claims or a prose interpretation.

At most two complete bundles are admitted. Every D-038 row, artifact, byte and full
read-scope check remains, including duplicate occurrences. The request additionally
has a 32 KiB byte limit and a 16,000-token limit. This fake profile conservatively
counts one UTF-8 byte as one token; it makes **no tokenizer claim for a live model**.
No source is clipped. The response is at most 64 KiB, with at most 2,000 reported
output tokens. The parent enforces 60 seconds before writer-lock waiting and rechecks
permission at the terminal transaction. Oversized raw output is represented by its
byte count/hash and failure, rather than retained unbounded content.

The deterministic draft, request list and their citations remain together. The
model's alternative draft and scoped claim/gap spans are retained separately in
`result.investigation.proposal`; no baseline citation is attached as support for
changed prose. Inspect this unreviewed proposal in the receipt/export. The existing
Workbench still displays the deterministic draft; a live-model presentation is not
enabled by this adapter implementation.

Duplicate JSON keys are rejected before parsing, including nested proposal fields.
The synthetic interpreter admits conservative descriptive clauses and bounded
requests for evidence, access, ownership or terms; imperative dispatch, embedded
obligations and text outside that subset fail closed. This can reject harmless
wording too; use explicit deterministic/person preparation rather than treating the
guard as a general language-understanding or semantic-correctness check. Source
quotations remain data. Human interpretation review is still required.

Each committed start reserves one call and 50 USD minor units in the named hermetic
batch, up to 30 calls/1,500 minor units. These are **synthetic budget reservations,
not actual expenditure**. They live in the existing U journal, with an explicit
previous-reservation hash and ordinal across Cases, including equal timestamps.
The writer lock serializes capacity claims. Tests may lower caps; clients cannot.
No refund/reset mechanism is added: every committed start keeps its full reservation,
including an uncertain or failed call. Known fake usage and unknown usage are distinct;
actual spend and unmeasured human/support/infrastructure/setup costs remain null.

The start commits before a single transport invocation. Exact retries return the
original start receipt without another call or write, even after restart, timeout,
interruption or a lost acknowledgment. A crash after start may leave it pending;
startup never resumes it. Inspect and explicitly interrupt before any separately
keyed new attempt. A later response cannot cross the interruption fence. A failed
terminal commit leaves no fabricated packet. Successful historical receipts never
renew current permission. Deterministic fallback requires explicit current v3 pack
publication and a fresh invocation; it is never labelled model success.

Migration `0012_bounded_investigation.sql` only extends the supported-version checks
in the existing selection/work journals. It adds no table and changes no applied
migration checksum or old entry. Fresh and pre-0012 upgrade tests preserve old
business/work histories. Work export v3 includes older versions; D-039 export v2 is
only a compatibility envelope admitting that work export. Its business commands,
authority, observation and acceptance semantics remain v1. Replay checks retained
input/response interpretation and never reruns the provider. Historical Challenge
reports retain their pinned implementation; no old report is rewritten.

## Evaluation and activation handoff

The [24-record holdout and rubric](../../evaluations/investigation/v1/README.md) were
committed before the prompt implementation (`93ec9ada`, formatted-byte checksum
correction `d5bd8e22`), separately from development examples.
`SHA256SUMS` binds the formatted source bytes. The fixture hash check is not a
usefulness evaluation. Deterministic preparation, optional investigation and a
generic assistant have **not** been compared. The frozen rubric specifies comparable
inputs/tools/budgets, blinded task-quality review, serious-error gates, failed/open
work and all human/support/cost measurements. No winner, savings or achieved target
is claimed; five business proof measures remain separate and unknown when unmeasured.

Before any live synthetic call, the owner must separately authorize a named custodian,
exact available model snapshot and tokenizer, endpoint/credential custody, confirmed
project egress/retention controls, dated price schedule/worst-case calculation and a
named evaluation budget. The approved implementation does not itself activate those
arrangements. Real-customer processing needs its own named participants, permitted
files/access/storage/retention/deletion arrangements and comparable baseline.
D-039 payment obligations, DEL-5 separation and Case closure denial remain intact.

## Subsequent evaluation-readiness branch

The [readiness handoff](investigation-evaluation-readiness.md) adds executable
fixture v2, mock-tested HTTP comparison versions and a deterministic baseline.
The fake v1 implementation described above remains historical and unchanged;
its 30-call reservation profile is not silently reused for a 48-call comparison.
Live activation and both model evaluations remain unavailable/not run.
