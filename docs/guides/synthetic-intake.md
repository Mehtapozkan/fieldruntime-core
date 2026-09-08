# Synthetic invoice-dispute intake

D9-B on this review branch implements Accepted [D-034](../architecture/d9-assisted-intake-boundary.md).
D6–D8 and D9-A are merged; this importer is not in the historical evaluation
prerelease. **Real customer activation remains unapproved.** Use synthetic files only.

## Try it

Use Node 24, pnpm 11.24.0 and Docker Compose from the repository:

```sh
git switch feat/d9b-synthetic-intake
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

| Operation         | Endpoint                                      | Durable effect                                                  |
| ----------------- | --------------------------------------------- | --------------------------------------------------------------- |
| Prepare           | `POST /v1/intake/preparations`                | Original scoped bytes + immutable bundle; no Case/review/action |
| List/open         | `GET /v1/intake/bundles[/{id}]`               | None                                                            |
| Inspect selection | `POST /v1/intake/selections/preview`          | None; consistent read-only snapshot, no issued preview          |
| Commit one row    | `POST /v1/intake/commits`                     | Atomic Case append, indexes, provenance and receipt             |
| Original artifact | `GET /v1/intake/artifacts/{64-hex-byte-hash}` | None; attachment download under full synthetic scope            |
| Portable evidence | `GET /v1/intake/export`                       | None                                                            |

Strict [contracts](../../packages/contracts/schemas/intake.v1.schema.json) reject
unknown fields, identities, classifications, scopes and success claims. The runtime
reconstructs consent and the generated v0 Case command. A hash supplied by the caller
is only a comparison binding. Normal Case commands cannot manufacture the reserved
`fieldruntime_intake` event without its atomic provenance receipt.

## Persistence and portable conformance

Migration **0005_synthetic_intake** adds only `intake_artifacts`, `intake_bundles` and
`intake_commits`, plus immutable-record and deferred Case/receipt pair constraints.
Migrations 0001–0004 and their checksums stay unchanged. `fr up` applies it to fresh
and existing preview volumes; stop the old process first and preserve a complete
private backup of the evaluation dataset if needed. No online/rolling migration or
downgrade is promised. Failed migration must be investigated, not checksum-edited.

```sh
curl --fail http://127.0.0.1:3210/v1/intake/export > /tmp/synthetic-intake-export.json
pnpm build
node scripts/check-intake-export.mjs /tmp/synthetic-intake-export.json
```

The export retains original bytes, bundles, consent/receipts and the associated
existing Case engine state (journals/projections and replay indexes). The checker
recomputes bytes → pinned parser/mapping → material → v0 command → journal bindings.
A test-only conformance fixture reconstructs an export in a fresh PostgreSQL schema,
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
| A2           | Renamed files return original preparation; exact/new-key same-material retries leave histories unchanged                                 |
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

Next bounded work is D10 Discovery: use these retained claims to prepare a cited
normal route, alternatives, missing-evidence questions and the seven Discovery
records/six loop outputs for operator review. No worker allocation, new authority,
closure rule or real-data activation follows automatically from successful intake.
