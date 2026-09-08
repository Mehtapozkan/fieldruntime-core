# Synthetic invoice-dispute intake

D9-B merged in PR #30 and implements Accepted [D-034](../architecture/d9-assisted-intake-boundary.md).
D6–D8 and D9-A are merged; this importer is not in the historical evaluation
prerelease. **Real customer activation remains unapproved.** Use synthetic files only.

## Try it

Use Node 24, pnpm 11.24.0 and Docker Compose from the repository:

```sh
git switch main
pnpm install --frozen-lockfile
pnpm fr init ecc --demo
pnpm fr up
```

Open <http://127.0.0.1:3210/?view=intake>. No D7 enrollment is needed for intake.

1. **Use synthetic sample**, then **Prepare selected synthetic files**. Selecting
   files reads only; preparation explicitly retains original bytes and findings.
2. Inspect the two records, North/South entities, unknown business/export time and
   unconfirmed delivery claim. Counts describe this export, not the customer population.
3. **Review this candidate** for North. Choose **Create one coordination Case**,
   inspect the source and proposed links, write a reason and acknowledge gaps.
4. **Inspect exact commit**, review the consequence, then **Commit reviewed material**.
   This records a review occurrence and Case evidence, not an approved credit.
5. Reload or restart the appliance. **Reopen a preparation** exposes the same Case
   receipts, original sources and attribution. Rename/reimport unchanged files to
   recover original material without another Case event.

TXT/Markdown are inert plain text. PDF/PNG/JPEG are **retained only**; there is no
OCR or extracted-content claim. Citations offer original-byte downloads and
expandable hashes/locators. One CSV is limited to 1 MiB/2,000 rows/8 KiB per cell;
text to 512 KiB each; opaque support to 5 MiB each; 16 support files/20 MiB total.
The exact headers and input rules are in D-034. DOCX/XLSX/email/archives/URLs are unsupported.
Document associations explicitly name an allowed entity and record/invoice/order/
delivery ID. Exclusions and link selections require a retained reason. The API also
accepts reviewed links between cited objects; the UI offers the proposed links and exclusions.

Reported upstream owner/status/actor are source claims. A new Case has unconfirmed
canonical owner and fixed medium severity; an attachment preserves existing ownership
and severity. Ambiguous targets require an explicit coherent choice. Committed source
records cannot move between Cases. A changed export cannot silently replace evidence.

## API example and exact retries

After the appliance is running, use a fresh local directory for this example:

```sh
node scripts/intake-example.mjs prepare /tmp/fieldruntime-intake-example
node scripts/intake-example.mjs read /tmp/fieldruntime-intake-example
node scripts/intake-example.mjs inspect /tmp/fieldruntime-intake-example create
# Inspect the displayed material and saved selection.json before the explicit write:
node scripts/intake-example.mjs commit /tmp/fieldruntime-intake-example
node scripts/intake-example.mjs commit /tmp/fieldruntime-intake-example # exact duplicate
# Restart preserves the PostgreSQL volume:
docker compose restart core
node scripts/intake-example.mjs read /tmp/fieldruntime-intake-example
node scripts/intake-example.mjs commit /tmp/fieldruntime-intake-example # same receipt
```

`inspect` refuses to overwrite a saved command. After a **confirmed** conflict,
read current evidence and use another directory/selection with an explicit target
and fresh consent. For an uncertain response, keep the original directory and
retry `commit` unchanged. In the browser, IndexedDB retains only the exact pending
command/key before submission; localStorage retains a navigation ID. Clearing site
storage loses unconfirmed retry information, not canonical history. No new key is
chosen automatically. A confirmed receipt remains visible if its refresh fails.

The owner-approved D-034 amendment binds **every successful request key**, including
`already_retained` and `already_committed`, to its normalized request fingerprint and
original outcome/reference within the trusted tenant/intake scope and operation.
Exact retries return that original status (`prepared`, `committed` or the original
no-op status), not a new business receipt. A changed valid body under that key returns
`IDEMPOTENCY_CONFLICT`. A first no-op key binding is a metadata write; it advances
only writer metadata, never C/R/S, source versions, Cases, WorkEvents or business
receipts. Later exact retries write nothing. Inspection and exports stay read-only.

One outstanding intake command is shared across tabs. IndexedDB atomically claims
the slot before sending and clears only the exact completed command. If another tab
holds it, the new command is not sent: **Recover original submission** exposes the
saved bytes/key. Reload the other tab after completion to refresh its recovery state.
A late response cannot clear a newer command. No key replacement or resubmission is
automatic; clearing site data still loses local recovery information.

| Operation         | Endpoint                                      | Durable effect                                                            |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| Prepare           | `POST /v1/intake/preparations`                | Original scoped bytes/bundle or no-op key metadata; no Case/review/action |
| List/open         | `GET /v1/intake/bundles[/{id}]`               | None                                                                      |
| Inspect selection | `POST /v1/intake/selections/preview`          | None; consistent read-only snapshot, no issued preview                    |
| Commit one row    | `POST /v1/intake/commits`                     | Atomic Case/provenance receipt or no-op key metadata                      |
| Original artifact | `GET /v1/intake/artifacts/{64-hex-byte-hash}` | None; attachment download under full synthetic scope                      |
| Portable evidence | `GET /v1/intake/export`                       | None                                                                      |

Strict [contracts](../../packages/contracts/schemas/intake.v1.schema.json) reject
unknown fields, identities, classifications, scopes and success claims. The runtime
reconstructs consent and the generated v0 Case command. A hash supplied by the caller
is only a comparison binding. Normal Case commands cannot manufacture the reserved
`fieldruntime_intake` event without its atomic provenance receipt.

## Persistence and portable conformance

Migration **0005_synthetic_intake** adds only `intake_artifacts`, `intake_bundles` and
`intake_commits`, plus immutable-record and deferred Case/receipt pair constraints.
Migration **0006_intake_request_bindings** adds only an immutable, intake-specific
no-op command binding table. Original successful keys already reside in bundles
and receipts and remain binding on upgrade; no backfill duplicates them. Historical
no-op keys that were never retained cannot be recovered or retroactively reserved.
Migrations 0001–0005 and their checksums stay unchanged. `fr up` applies it to fresh
and existing preview volumes; stop the old process first and preserve a complete
private backup of the evaluation dataset if needed. No online/rolling migration or
downgrade is promised. Failed migration must be investigated, not checksum-edited.

```sh
curl --fail http://127.0.0.1:3210/v1/intake/export > /tmp/synthetic-intake-export.json
pnpm build
node scripts/check-intake-export.mjs /tmp/synthetic-intake-export.json
```

Versioned `intake-export.v2` retains the additional request bindings and the original
bytes, bundles, consent/receipts and the associated
existing Case engine state (journals/projections and replay indexes). The checker
recomputes bytes → pinned parser/mapping → material → v0 command → journal bindings.
The checker also accepts strict historical v1 exports, which have only original
retained-key guarantees. They cannot attest to unrecorded no-op keys. Never discard
v2 key metadata when moving current evidence. A test-only conformance fixture reconstructs an export in a fresh PostgreSQL schema,
restarts and exact-retries it. There is deliberately **no live restore endpoint**.
Unknown implementation/timezone versions fail closed; future upgrades must retain
compatible implementations or explicitly support their old replay semantics.

All reads use one repeatable read-only snapshot without the writer lock, ID allocation
or durable clock changes. Commit consumes one checked review time and advances C;
R/S do not advance. Intake Cases have no financial catalog or action enrollment.
They cannot inherit Orchid approvals. Existing D-032 stale-C tests remain required;
intake tests prove C4→C5 and no catalog/review mutation, not a new intake approval flow.

Original bytes, journals and controlled copies last for the isolated dataset's
lifetime. Complete disposal ends its replay. Selective journal erasure, automated
retention/access administration and protection against a complete privileged rewrite
are absent. Equal timestamps do not establish order between independent journals.
Real samples still need named custody, access, classification, retention, deletion
and export approval. Missing effort/population/acceptance measures are not zero;
reported disputed value is neither money saved nor recovered revenue.

## Acceptance evidence and handoff

Run after `pnpm build`, with a disposable local PostgreSQL service:

```sh
node --test tests/intake.test.mjs
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test scripts/intake-postgres.test.mjs
pnpm exec playwright install chromium
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test scripts/intake-browser.test.mjs
```

| D-034 vector | Executable evidence                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A1           | Real prepare/preview/create; existing owner/high severity C4→C5 attach; separate ingestion/review time; restart                          |
| A2           | Renamed files return original preparation; every successful key is bound; first no-op adds metadata only, exact retry writes nothing     |
| A3           | Reordered rows/headers change bytes/locators, preserve K/V/M and original receipts                                                       |
| A4           | Changed row/support appends evidence; contradictory reported revision requires acknowledgment; C advances                                |
| A5           | Same invoice across entities creates distinct roots; cross-entity/moved targets denied                                                   |
| A6           | Many-to-many references remain qualified; ambiguous target choice is explicit; no automatic match                                        |
| A7           | Partial/disappearing rows do not delete history or fabricate a complete denominator                                                      |
| A8           | Format/encoding/limits/hash/scope/authority injection denied; invalid rows inspectable but noncommittable                                |
| A9           | Failure between Case and receipt rolls back; lost COMMIT/HTTP response and failed rollback recover exactly                               |
| A10          | Concurrent duplicates converge; different material conflicts; changed/stale browser inspection cannot submit old consent                 |
| A11          | Exclusions/additive same-Case correction retain prior proof; no retargeting or transferred approvals                                     |
| A12          | Tampered bytes/derivations/bindings/anchors/versions fail reads/readiness; read-only snapshots, upgrade and portable restart conformance |

Actual local/final-head CI results are recorded in [STATUS](../../STATUS.md) and the
PR. These tests establish synthetic behavior, not customer outcomes or all Discovery requirements.
[Screenshots and visual/keyboard scope](../evidence/d9b/README.md).

[D10-A's proposed design](../architecture/d10-discovery-preparation-review.md) uses
these retained claims for a cited brief, missing-evidence questions and seven records/
six outputs. The snapshot does not establish a normal historical route; that stays
unknown until separately evidenced. D10-B is not implemented. No worker allocation, new authority,
closure rule or real-data activation follows automatically from successful intake.

The PR #30 retry repair adds focused checks for both operations: fresh no-op key →
changed valid body returns 409; exact/lost-response retry after restart returns the
original outcome; concurrent same-key commands, metadata rollback, backward clocks,
forged request/result references and 0005→0006 upgrade fail closed or preserve the
expected result. Six browser scenarios include atomic competing tab claims,
completion in one tab, conditional clearing after a late response and reload recovery.
[Final-head validation](../../STATUS.md#d9-b-implementation-and-validation) and the PR
record actual local versus CI results. D10-A is docs-only; Proposed D-035 needs approval.
