# Synthetic Discovery: inspect, correct and descriptively confirm

D10-A and Accepted [D-035](../architecture/d10-discovery-preparation-review.md)
merged in PR #31 at `222b2842b44efc1da219c1409d5111a55e62641a` after
[required CI passed](https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/34182770322).
**D10-B is implemented on this review branch, not merged or released.** It adds a
deterministic brief and immutable descriptive review in the existing intake interface.
It uses zero model calls. Real-customer activation remains unapproved.

## Short operator walkthrough

Use Node **24.19.0**, pnpm 11.24.0 and Docker Compose. From this branch:

```sh
git fetch origin
git switch feat/d10b-discovery-review
pnpm install --frozen-lockfile
pnpm fr init ecc --demo
pnpm fr up
```

Open <http://127.0.0.1:3210/?view=intake>. No enrollment is needed for Discovery.

1. Choose **Use synthetic sample**, then **Prepare selected synthetic files**.
   This explicitly retains the sample; opening the page does not initialize it.
2. **Open workflow brief** for the North record. Inspect the reported dispute,
   cited delivery note, uncertainty, unconfirmed owner and consequential question.
   The South invoice label is a separate entity-qualified record, not a duplicate Case.
3. To save review, choose **Review Case preparation**, explicitly choose a Case
   target, give a reason, acknowledge gaps, **Inspect exact commit**, then
   **Commit reviewed material**. Reopen **Open workflow brief**.
4. Answer Q1, leave it **Unknown**, mark it **Disputed**, or select R3 to correct
   the descriptive finding. Give a reason and optionally select source citations.
   **Save descriptive answer** retains an attributed annotation; its evidence type
   remains operator-reported. The refreshed source finding and correction stay distinct.
5. Expand **Confirm a description or improvement discussion**. After reviewing the
   saved material, select a purpose, give a reason and **Record descriptive confirmation**.
   The improvement disclosure shows removal, combination, parallelization and
   simplification hypotheses before work allocation. No work is dispatched.
6. Reload or `docker compose restart core`; reopen the same brief and descriptive
   history. Expand the original material, citations, actor and recorded time. Both
   confirmation purposes are descriptive: neither resolves a discrepancy, verifies
   a business event, installs policy, accepts an outcome or permits Case closure.

A new business intake preparation or any Case-version change makes prior answers
historical, including a rejected Case transition under D-014. A new annotation
requires fresh confirmation. On a conflict, refresh and explicitly review the new
inputs. **Use this answer in a new draft** only fills the form; save a new annotation
and confirm separately. Old answers and their original citations remain available.

After an uncertain submission, **Recover original submission** sends the same bytes
and key. One atomic IndexedDB slot covers intake and Discovery across tabs. A competing
tab cannot replace it or send after a failed claim; late completion cannot clear a newer
command. A confirmed receipt survives a failed refresh, with current applicability
explicitly unconfirmed. Keep site storage while recovery is pending. No automatic retries.

## Evidence-responsive scope

The brief contains R1–R7 and all six loop outputs, not a claim that complete Discovery
has occurred. Parsed customer, invoice, amounts, entity, coverage, links and locators
come from retained inputs. A second supported Cedar fixture uses INV-908, SHIP-22,
$4,200 and one row; no Orchid-specific conclusion or fixed count controls the projection.

| Supplied evidence                                                            | Derived description / next question                                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| No associated support                                                        | Missing from this upload; ask who can supply proof. Never infer non-delivery.                                   |
| Whole note `Delivery confirmation for SHIP-22 is supplied.`                  | The source reports confirmation; ask for the underlying record and inspection. Not independent verification.    |
| A confirmation note and `Delivery confirmation for SHIP-22 is not supplied.` | Conflicting source claims, both cited; ask which governing evidence can clarify them. No newer-source winner.   |
| Ambiguous, conditional or instruction-bearing prose                          | Show the cited excerpt and an interpretation question; do not infer confirmation or automatically assert a gap. |
| PDF/image retained without parsing                                           | Original bytes remain downloadable; no parsed-content claim.                                                    |

Interpretation v2 recognizes only whole trimmed plain-text statements matching the
selected record's delivery ID, including the original sample's two-sentence missing-
confirmation note. It does not classify arbitrary prose. Source excerpts are bounded;
full original bytes remain available. Additional activity records, scoped SOPs, approved
field/variant rules, owner responses, cohort/effort/cost evidence and customer acceptance
are still needed. Queue snapshots and ingestion/review times do not establish a route,
waiting duration, active effort or savings. D10 creates no independently verified fact.

## Delivery and record evidence scoping repair

Current briefs use the exact implementation tuple `discovery.invoice-dispute.v2`,
`discovery.questions.v2`, `discovery.source-claims.v2`. Each source claim retains its
entity-qualified record or delivery subject, applicable record key and matching explicit
source associations. Related customer/invoice records remain inspectable context; labels
alone cannot transfer evidence or make two dispute amounts contradictory. Explicit shared
record, invoice, order or delivery associations remain supported, including delivery
support retained in another bundle. Association is still reported, not independent proof.

| Synthetic input                                                                                                           | Before repair at `964bb722`                                        | Corrected current result                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| A: dispute-17 references DEL-4 and DEL-5; associated notes report DEL-4 confirmation and DEL-5 confirmation not supplied  | R3 incorrectly disputed the two deliveries                         | DEL-4 has reported confirmation; DEL-5 retains its reported gap. No cross-delivery conflict.                          |
| B: separate North disputes share Orchid/INV-101; $15,000/DEL-4 has no support, $2,500/DEL-5 has its own confirmation note | dispute-17 inherited the confirmation and an amount/owner conflict | dispute-17 keeps its evidence gap and own values. dispute-18 and its note remain context, not support for dispute-17. |
| Opposing notes concern DEL-4 on the same applicable record                                                                | Genuine conflict appeared                                          | DEL-4 remains disputed, with both notes cited; DEL-5's lack of support remains separate.                              |
| Two records explicitly share DEL-4 evidence                                                                               | Shared object association was permitted                            | Both records can cite the shared delivery note; their different dispute amounts remain distinct.                      |

An association to DEL-5 cannot establish a DEL-4 claim merely because both appear on a
record. Incompatible or uninterpretable content stays ambiguous. Finding citations cover
the asserted subject; all related source material remains expandable. Reordering rows,
artifacts or declared associations preserves the conclusions and applicability while
hashes and byte locators continue to identify the exact supplied bytes.

The wire envelopes remain v1; their strict schema now recognizes exactly the historical
v1 and corrected v2 implementation tuples. V1 claims keep their original shape, while
v2 requires scoped claim metadata. Unknown or mixed tuples fail closed. Replay dispatches
the retained tuple internally; clients cannot choose an interpreter. The pre-repair
[v1 export fixture](../../tests/fixtures/discovery/scoped-v1-export.json) contains an actual
API-recorded answer and confirmation. It reconstructs its original (incorrect) conflict
verbatim as historical material. Current v2 reads do not reuse that answer or confirmation.
Fresh review requires an explicit new annotation and separate confirmation. Original-key
retries still return the exact old receipt without writes; an unsent stale v1 preview
cannot become a new confirmation. Mixed v1/v2 histories reconstruct after restart/export.

The retained intake interpreter also binds timezone data: this fixture uses `2026b`
from Node 24.19.0, which CI pins. Node 24.20.0 supplies `2026c` and correctly rejects
that historical intake export. Use the recorded compatible runtime for replay; do not
rewrite version fields or hashes. A timezone-interpreter upgrade remains separate
from this Discovery projection repair.

This repair adds no migration and changes no applied checksum, including 0007. Existing
Case-wide concurrency, record-specific applicability, conservative business-input
invalidation, clock guards, read-only reads and closure/authority denial remain intact.

Focused reproduction/verification (the test host uses disposable synthetic schemas only):

```sh
pnpm build
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test --test-name-pattern='scoped evidence|scoped history' \
  scripts/discovery-postgres.test.mjs scripts/discovery-browser.test.mjs
node scripts/check-discovery-export.mjs tests/fixtures/discovery/scoped-v1-export.json
```

Before repair, A and B failed their expected assertions and the genuine-conflict control
passed (2 failures / 1 pass). The corrected regressions include both record inspections,
shared associations, ordering, changed delivery membership, historical exact retry and
mixed-version restart/export. Full validation and final-commit CI evidence are in PR #32.

These actual browser captures show the corrected summaries with their cited evidence
expanded; desktop and 390px were inspected. They demonstrate synthetic evidence scoping,
not customer usability or verified business outcomes.

| Corrected case           | Desktop                                                                | 390px                                                                 |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A — separate deliveries  | [Open](../assets/d10b/scoping/desktop-scoped-different-deliveries.png) | [Open](../assets/d10b/scoping/mobile-scoped-different-deliveries.png) |
| B — distinct disputes    | [Open](../assets/d10b/scoping/desktop-scoped-distinct-records.png)     | [Open](../assets/d10b/scoping/mobile-scoped-distinct-records.png)     |
| Same-delivery conflict   | [Open](../assets/d10b/scoping/desktop-scoped-same-delivery.png)        | [Open](../assets/d10b/scoping/mobile-scoped-same-delivery.png)        |
| Explicit shared delivery | [Open](../assets/d10b/scoping/desktop-scoped-shared-delivery.png)      | [Open](../assets/d10b/scoping/mobile-scoped-shared-delivery.png)      |

## Explicit API commands and portable evidence

First follow the [intake API example](synthetic-intake.md#api-example-and-exact-retries)
through its explicit Case commit in `/tmp/fieldruntime-intake-example`. Then:

```sh
node scripts/discovery-example.mjs read /tmp/fieldruntime-intake-example
cat > /tmp/discovery-answer.json <<'JSON'
{
  "operation": "annotate",
  "reason": "Describe the supplied gap without inferring non-delivery",
  "changes": [{
    "target_id": "Q1", "state": "unknown",
    "text": "The evidence owner and underlying delivery proof remain unconfirmed",
    "reason": "The note does not establish independent verification",
    "citation_ids": []
  }]
}
JSON
node scripts/discovery-example.mjs inspect /tmp/fieldruntime-intake-example /tmp/discovery-answer.json
# Inspect the printed brief and discovery-command.json before explicitly submitting:
node scripts/discovery-example.mjs submit /tmp/fieldruntime-intake-example
node scripts/discovery-example.mjs submit /tmp/fieldruntime-intake-example # exact original receipt
node scripts/discovery-example.mjs read /tmp/fieldruntime-intake-example
# Preserve the completed command; never move it while its result is uncertain.
mv /tmp/fieldruntime-intake-example/discovery-command.json /tmp/fieldruntime-intake-example/recorded-answer.json
cat > /tmp/discovery-confirm.json <<'JSON'
{"operation":"confirm","purpose":"discovery_description","reason":"The description accurately preserves the unresolved evidence and ownership gaps"}
JSON
node scripts/discovery-example.mjs inspect /tmp/fieldruntime-intake-example /tmp/discovery-confirm.json
# Inspect again; confirmation is a separate explicit write:
node scripts/discovery-example.mjs submit /tmp/fieldruntime-intake-example
docker compose restart core
node scripts/discovery-example.mjs submit /tmp/fieldruntime-intake-example # same retained result
node scripts/discovery-example.mjs read /tmp/fieldruntime-intake-example
node scripts/discovery-example.mjs export /tmp/fieldruntime-intake-example > /tmp/discovery-export.json
node scripts/check-discovery-export.mjs /tmp/discovery-export.json
```

`inspect` refuses to overwrite a saved command. The local example targets the first
sample row already committed to exactly one Case. For other rows use the Workbench
or explicit `record_key`/`case_id` with the [OpenAPI](../../packages/contracts/openapi/intake.v1.openapi.json).
The server validates [strict versioned contracts](../../packages/contracts/schemas/discovery.v1.schema.json)
and recomputes the material; supplied hashes are comparison bindings, never authority.

| Operation          | Endpoint                                                                | Canonical effect                                                                                                  |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Inspect brief      | `GET /v1/intake/bundles/{id}/discovery?record_key={key}[&case_id={id}]` | One consistent read-only snapshot; no writer lock, clock, ID or durable change. Case is optional for inspection.  |
| Annotate / confirm | `POST /v1/intake/bundles/{id}/discovery-reviews`                        | One immutable Case-linked descriptive entry and writer metadata; no C/R/S or intake business change.              |
| Export             | Same GET with `representation=export`                                   | Read-only, complete synthetic namespace: unchanged nested `intake-export.v2` and Discovery entries/versions/hash. |

Commands bind the exact bundle/record, Case version, original intake receipt, material
hash, descriptive revision and prior entry hash. The material binds a sorted manifest
of all retained intake business bundle/commit hashes and implementation versions.
Unrelated new business intake therefore conservatively invalidates the description.
Successful no-op intake-key metadata does not. Confirming unchanged material advances
its own revision without changing its material hash. Reads are never proof of human
screen inspection; entries record submitted consent material, not eyeball tracking.
The concurrency revision spans the Case, but applicability is checked against the
selected bundle/record's latest review. Reviewing another record on that Case cannot
make unchanged material stale or transfer its confirmation.

Same scoped operation/key/body returns the original result even when historical;
changed bodies return `IDEMPOTENCY_CONFLICT`. Fresh no-change annotations and already-
confirmed same material/purpose return non-success `NO_CHANGE` / `ALREADY_REVIEWED`
without claiming an unbound successful key. An uncertain result must use exact retry.

## Migration, replay and limitations

`0007_discovery_review.sql` adds one append-only `discovery_review_journal`, with
Case linkage, sequence/predecessor and operation/key uniqueness. It preserves checksums
0001–0006, original keys and all business histories. Entries atomically retain command,
trusted synthetic actor, reviewed/resulting material, sources, time, versions and result.
The existing writer lock serializes submissions; read-back reconstruction precedes commit.
Rollback includes the key/result, and failed rollback discards the connection.

Stop the old process and preserve a complete private evaluation backup before upgrading;
`pnpm fr up` builds this branch and applies the checksum-bound migration. No rolling
upgrade, downgrade, selective erasure or live restore endpoint is promised. The existing
D-034 dataset-lifetime retention/disposal boundary remains. Historical intake-only
exports still work but cannot attest to Discovery history.

Historical replay validates the referenced Case prefix and business manifest at the
recorded review time. Strictly earlier canonical changes cannot be omitted; legitimate
reviews before later Case changes survive. Clock guards prevent new Case/intake business
writes from being backdated across retained Discovery review. Equal timestamps alone
cannot order separate journals; exact anchors and per-chain sequences preserve known
order. Unknown implementation versions fail closed; a future version must preserve its
historical interpreter. Hashes and append-only controls do not defeat a full privileged
rewrite or substitute for an external anchor.

The conformance checker reconstructs bytes → intake → Case anchors → deterministic
brief → annotations/confirmations/results. Tests restore the exported evidence into a
fresh disposable PostgreSQL schema, then reconstruct after restart. Exporting does not
activate real data or create another canonical ledger.

## Acceptance and visual handoff

```sh
pnpm validate
pnpm eval:ecc
pnpm eval:ecc -- --negative-control # must fail its intended assertions
# Existing local test-host convention; disposable schemas, never existing Case edits:
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test scripts/discovery-postgres.test.mjs scripts/discovery-browser.test.mjs
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test scripts/intake-postgres.test.mjs scripts/intake-browser.test.mjs
docker compose config --quiet
git diff --check
```

The scripts use the existing disposable PostgreSQL/API host and test-only fault hooks;
no injection endpoint is exposed. T1–T12 and varied inputs cover supported findings,
unknown/disputed corrections, source conflicts, exact/stale bindings, no-op keys,
concurrency, lost responses, rollback, clock regression, tampered replay, export,
upgrade, read-only access, browser recovery and closure denial. The original positive
and strict-input API tests failed on merged main with 404s before implementation.

Final results and commit-specific CI are recorded in the implementation PR and STATUS.
Local PostgreSQL is 18.4; CI uses the appliance's pinned PostgreSQL 17.11. Docker is not
available on the local host, so Compose and container restart evidence must come from CI.
Screenshots are actual Chromium captures; they establish inspected layout, not customer
usability, productivity or completed business outcomes.

| State                                | Desktop                                           | 390px                                            |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------ |
| Initial review                       | [Open](../assets/d10b/desktop-initial.png)        | [Open](../assets/d10b/mobile-initial.png)        |
| Operator correction                  | [Open](../assets/d10b/desktop-correction.png)     | [Open](../assets/d10b/mobile-correction.png)     |
| Confirmed descriptions after restart | [Open](../assets/d10b/desktop-confirmed.png)      | [Open](../assets/d10b/mobile-confirmed.png)      |
| Changed inputs / stale review        | [Open](../assets/d10b/desktop-stale.png)          | [Open](../assets/d10b/mobile-stale.png)          |
| Uncertain submission                 | [Open](../assets/d10b/desktop-uncertain.png)      | [Open](../assets/d10b/mobile-uncertain.png)      |
| Confirmed receipt, failed refresh    | [Open](../assets/d10b/desktop-failed-refresh.png) | [Open](../assets/d10b/mobile-failed-refresh.png) |

Remaining: evidenced normal/exception routes, approved governing rules, representative
population, active effort/baseline/cost coverage, task usefulness and support evaluation,
customer acceptance and real outcomes. D11 retains reviewed Runtime Pack publication;
D12 retains worker integration. No production authentication, model/provider/agent,
connector, external action, economics dashboard, release, deployment or Case closure.
