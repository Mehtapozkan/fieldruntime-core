# Synthetic Challenge report and Operating Capacity Map

D13's first bounded delivery is an offline, read-only report over one validated
preparation export (historical v1; current v1/v2). It does not ingest customer data, mutate the appliance,
create a second ledger, or grant permission. D12 preparation is merged; customer
comparisons and real-data activation remain unapproved/not run.

## Current resource-aware reports — challenge-report.v2

The continuation branch accepts `challenge-input.v2` with the same four fields below
and a replay-validated v1/v2 export. It uses the current fixed synthetic profile and
shared read-only preflight. A known resource-blocked record is not startable. Next actions use the current
view too: an old pack-v2 publication requires separate v3 publication, even when its
historical report said preparation was startable. All
bundle/row/support/parsed-byte/question occurrences are checked, while business
coverage still deduplicates record identities. The report creates local output files,
never appliance records. Snapshot eligibility is not live permission.

Use the [continuation command](challenge-follow-through.md#implemented-two-bundle-continuation-review-branch)
to obtain a v2 manifest/archive. Existing report v1 calculation code and rehearsal are
unchanged; their exact historic reports must be reproduced with the pinned source
commit, Node/tz, implementation digest, original manifest and archive. For example,
use source `639889f677a83a522996dd241d5082ddbadfc1bf` for its follow-through handoff.
A new build has a different implementation digest and must not claim the same old
report hash. The CLI refuses a v1 manifest for new-version history. Creating a new v2
report is explicit and never rewrites an old report or reinterprets its conclusions.

## Historical calculation contract — challenge-report.v1

Input: one complete preparation export and a strict manifest with only
`schema_version: challenge-input.v1`, `archive_hash`, `evaluated_at` (canonical UTC,
no earlier than any retained entry), and `cohort: all_retained_records`.
No caller-supplied totals, eligibility, actors, or success flags are accepted.
The archive is schema/hash validated and its nested Case, intake, Discovery,
publication and work histories replayed before calculation. A content hash proves
internal consistency, not the origin or completeness of a customer export.

All retained record identities are included, including uncommitted, invalid,
out-of-worker-scope, open, failed and interrupted work. Distinct source revisions
and Case attachments remain inspectable. Multiple Case attachments do not acquire
an invented cross-Case order; ambiguous record summaries say incomplete. Selection
and work applicability are reconstructed using the bundled synthetic profile at
`evaluated_at`, labelled snapshot-only, never live permission. A source revision
retained but not committed remains visible beside the committed material.

Rows without a record identity stay separate unidentified source material, deduplicated
only by their exact retained artifact/locator. They cannot become invented business
records, eligible coverage or a population denominator. Identifiable invalid rows
also remain inspectable without Discovery projection or preparation permission.

Counts use sets of canonical record keys and Case IDs. Attempts are `started`
entries, not command submissions; exact retry returns the same entry. A completed
preparation requires an exact terminal result with a prepared outcome. Acceptance
is an `approve` task-review of that invocation, not proof of business success.
Latest record status follows Case journal sequence, never equal timestamps across
journals. Every earlier attempt/review remains linked. Coverage means preparation
of retained records, not population completeness, prior unattended work or an
exception rate. An exception-selected sample cannot establish the overall rate.

Five measures remain separate with their original units, coverage, attribution,
source, qualification and correction/reversal/reopen/overlap references. No
cross-note sums: existing bounded notes lack globally reconciled outcome identities,
complete coverage and person-level non-overlap evidence. Aggregate values therefore
remain null, including when a synthetic note reports zero or a negative number.
Unknown is not zero. Superseded and reversed observations remain evidence, not
silently netted or discarded. Cost categories remain separate. Preparation effort
per accepted packet and effort per independently verified outcome are unavailable
without complete active-effort inputs and the respective denominator; timestamps
and parent computation measurements are not labor time or time saved.

The output binds archive hash, manifest, calculation ID, implementation digest,
Node/tz interpreter and synthetic profile hash. Stable JSON/HTML is reproducible
with these exact files and versions. A changed archive/manifest requires explicit
regeneration, not refreshed permission. Links point into the included evidence
archive and packet/source/receipt disclosures, not to a disposable live database.

## Reproduce the synthetic rehearsal

Use current source, Node **24.19.0** / tz **2026b**, pnpm **11.24.0** and a local
disposable PostgreSQL database. The test host creates an isolated randomly named
schema, runs existing migrations and drops that schema afterward. Never name a
customer database. It does not mutate an evaluator's existing Case history. Faults
exist only in the existing test host, not the appliance API.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec playwright install chromium
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  D13_REPORT_DIR=/tmp/fieldruntime-challenge \
  node --test scripts/challenge-postgres.test.mjs
```

If using the repository's disposable appliance, `pnpm fr init ecc --demo` and
`pnpm fr up` establish the database at that URL; Docker must be installed. Existing
[appliance instructions](5-minute-evaluation.md) and release/deployment permissions
are unchanged. Point the test at an explicitly disposable local database. The test
runs **actual intake, review, publication and preparation APIs**: retain eight
synthetic records → explicitly attach seven to three Cases → confirm six scoped
descriptions → publish v2 → prepare/review → retain five-measure readiness notes →
exercise failure/interruption/unfinished work → export → restart → reconstruct.
Fixture clocks/values are scripted; this is not a runtime throughput or labor test.

Open `/tmp/fieldruntime-challenge/report.html`. Its compact map links the records;
each includes its actual draft, uncertainty, exact attempts/reviews and relevant
source citations. Downloads contain the complete archive, manifest and report JSON.
Earlier reviews and packets are historical. The report is offline; use the existing
[Workbench](synthetic-preparation-worker.md) for deliberate current-state operations.
An exported `started` invocation requires explicit recovery/interruption there;
report generation cannot resume it.

Recompute from the **same retained inputs**, without PostgreSQL or any API call:

```sh
node scripts/challenge-report.mjs \
  /tmp/fieldruntime-challenge/archive.json \
  /tmp/fieldruntime-challenge/manifest.json \
  /tmp/fieldruntime-challenge-recomputed
cmp /tmp/fieldruntime-challenge/report.json \
  /tmp/fieldruntime-challenge-recomputed/report.json
```

The output directory must be new/empty; existing files are not overwritten. The
same build/interpreter and files must produce identical report bytes. New snapshots
must have their own explicit manifest/hash; hashes are not authorization or proof
that a dataset is complete. Store portable reports under the same custody and
retention arrangement as their source archive; they contain the retained material.

## Expected assertions and worked sample

- **8** unique retained records, **3** attached Cases, **7** invocation attempts.
- **3** records have substantive preparation; **4** prepared attempts include a
  repeat. **2** accepted packets belong to **one** distinct record. Neither establishes
  previously unattended work or a business outcome.
- Latest record states include task accepted, task rejected, awaiting review,
  failed, interrupted, started/unresolved and two not prepared. One uncommitted
  North record and one South record outside the worker scope remain visible.
- DEL-4 has no supplied confirmation; DEL-5 has a scoped source report; DEL-6 has
  opposing associated reports. Claims never transfer merely because an invoice
  label matches. Governing terms and accountable ownership remain unconfirmed.
- Exact retry after later work and restart returns its original receipt with no
  added attempt or write. The unfinished invocation remains unfinished after restart.
- Invalid retained rows without identities remain distinct source material and do
  not crash the report or inflate identified-record coverage.
- Export/report generation leave all canonical tables unchanged and use no writer
  lock. Changed archive bindings, tampered entries, caller totals and backdated
  evaluation fail instead of producing a plausible report.
- Five proof measures remain separate and unknown in aggregate. Original unknown,
  negative attention, reversal/reopen and overlap notes remain inspectable; costs
  have separate categories. No verified-outcome denominator or labor ratio is invented.

The [sample account](../examples/d13-challenge-report.md) is an operator-readable
summary, not a substitute for its exact exported receipts. The executable rehearsal
creates the inspectable full report and screenshots. Required CI runs this same
PostgreSQL/browser check along with retained D6–D12, ECC and appliance safeguards.
The [customer protocol](challenge-customer-protocol.md) defines comparisons and the
specific real-data decisions still required. D13 customer proof/economics remain
incomplete; no release or deployment is performed by the report tool.

## Continue with supplied evidence

The completed report remains unchanged. [D13 follow-through](challenge-follow-through.md)
adds a separate executable Orchid evidence-arrival scenario, exact historical/current
bindings and one human improvement proposal. It documents the accepted one-bundle
worker limit and Proposed D-038; it does not invent a second prepared packet or a
business outcome. Customer comparisons and D14 remain later work.
