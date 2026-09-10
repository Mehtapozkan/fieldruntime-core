# One imported-dispute result — synthetic API

[Accepted D-039](../architecture/d13-imported-dispute-result.md), approved at
`1f387d470a90dfe41df69335732b3c48c831750a`, is implemented on this review branch.
PR #40's D-038 implementation and actual second-packet acceptance remain intact.
This API PR is stacked on that open dependency; neither PR is merged by this task.
The historical evaluation prerelease is unchanged.

The supported result is **uphold Orchid's disputed DEL-4 portion without adjustment**.
USD 15,000 is disputed principal, never cash collected, a credit or savings. This
path checks original synthetic proof, obtains Morgan's exact authority, records a
justified no-financial-action decision, retains a person's reported disposition,
independently checks its source, and asks Robin to accept that exact result with
an owned payment-status follow-up. DEL-5 and the wider Case remain unresolved.

## Run the complete reproducible example

Check out `feat/d13-dispute-result-api`. Use Node 24.19.0, pnpm 11.24.0 and a disposable local PostgreSQL database. The test
host creates and drops isolated schemas; it never resets an evaluator's Case.
Its source transitions and fault injection are test-host facilities, absent from
the normal appliance API. These commands execute the real HTTP/store path:

```sh
pnpm install --frozen-lockfile
pnpm build
export D9_POSTGRES_URL='postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime'
export D039_CAPTURE_DIR="$PWD/d039-evidence"
node --test --test-name-pattern='BR1/BR6 API' scripts/dispute-result-postgres.test.mjs
node --test scripts/dispute-result-postgres.test.mjs
```

The first command imports dispute-17 and distinct dispute-18 into one Case, retains
the old accepted packet, supplies the DEL-4 status note through supported intake,
performs fresh descriptive review/publication and accepts the second packet. It
then performs the entire business path and restarts after business acceptance.
Exact retry returns the same receipt with no extra review. A later independent
POD retraction/AR reopen removes current success, then Robin records a linked reopen.

`D039_CAPTURE_DIR` contains the **actual** commands, receipts, original/disposition/
reversal source inputs, preparation export, and separate accepted/reopened views and
exports. These are executed synthetic records, unlike the preserved design example.
[Captured receipt examples](../examples/d039-runtime-receipts.json) include the actual
no-action, match, acceptance, negative check and reopen entries with export/file hashes.
The acceptance receipt binds the new result observation, decision, record, recipient,
commitments and O/head. Each export reconstructs its own cutoff; the accepted export
must not be presented as the later reopened state. To verify an export offline:

```sh
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises';
import { validateDisputeExport } from './dist/packages/runtime/src/dispute-result.js';
for (const file of ['accepted-export', 'reopened-export']) {
  const e = JSON.parse(await readFile(`d039-evidence/${file}.json`, 'utf8'));
  validateDisputeExport(e);
  console.log(file, e.hash, 'canonical history reconstructed');
}
NODE
```

## Use the appliance API explicitly

Start the selected source with `pnpm fr up`. First use the existing
[intake](synthetic-intake.md) and [continuation](challenge-follow-through.md)
mechanisms to commit the exact North / Orchid / dispute-17 / INV-101 / PO-9 / DEL-4 /
USD 1,500,000 minor-unit record. Copy its validated `case_id` and `record_key`.
Shared customer/invoice labels do not enroll another record. The fixed reader admits
one enrolled Case and this single allocation; a second Case or DEL-5 is refused.

```sh
export D039_CASE='case_REPLACE_WITH_RETURNED_ID'
export D039_RECORD='sha256:REPLACE_WITH_RETURNED_RECORD_KEY'
curl --fail-with-body --get 'http://127.0.0.1:3210/v1/intake/dispute-results' \
  --data-urlencode "case_id=$D039_CASE" --data-urlencode "record_key=$D039_RECORD" > view.json
node scripts/draft-dispute-result-command.mjs enroll view.json pending-enroll.json
cat pending-enroll.json
curl --fail-with-body -H 'Content-Type: application/json' \
  --data-binary @pending-enroll.json \
  'http://127.0.0.1:3210/v1/intake/dispute-results/commands' > enrollment-receipt.json
```

The offline draft helper never submits, refreshes, overwrites an existing command or
selects a replacement key for a retry. Fetch a new `view.json` and **inspect it**
before each deliberate new operation. Draft to a different file and submit explicitly
as above. Keep the original file/key after a timeout or 500: exact retry reconstructs
the original receipt if committed, or attempts the original command if absent.
A 409 means inspect the conflict and refresh before choosing a new command. Never
silently rebase an approval. A confirmed receipt is historical evidence even if the
following GET fails; it does not prove current eligibility.

| Explicit operation / helper arguments                 | Server behavior                                                                                                                                                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enroll`                                              | Bind exact committed subject to the fixed synthetic catalog and source purpose. Advances S and O; no inferred enrollment from a name.                                                                                         |
| `candidate`                                           | Append one new candidate. Earlier candidates remain inspectable and supply no transferred permission.                                                                                                                         |
| `basis_check`                                         | Current independent verifier reads original POD bytes, allocation, terms and complete grounds. Match, mismatch or inconclusive is retained; no authority is granted.                                                          |
| `request_authority`                                   | Server derives the exact basis/consequence and D6 request; R0. Immutable intake/preparation/source links remain separate from approval.                                                                                       |
| `review_authority view.json pending.json 'reason'`    | Morgan's named review. Set `D039_DECISION=reject`, `modify` or `escalate` for the supported interventions; default is approve. A modified request starts at R0 with no approvals.                                             |
| `no_action`                                           | Recheck exact C/R/S/O, source and resolver under the writer lock. Record `no_financial_action_recorded` semantics; no ActionReceipt or source write is fabricated.                                                            |
| `report view.json pending.json 'what was reported'`   | Synthetic reporter's claim: exact AR object/expected version, non-future occurrence/timezone, evidence reference and reason. Inspect/edit those human-reported fields before submission. They never become independent proof. |
| `result_check`                                        | Independently compare the current fixed source to the exact recorded decision, regardless of current execution eligibility. Ignore the report's success claim.                                                                |
| `accept view.json pending.json 'scope of acceptance'` | Robin accepts only the latest fresh matching result, exact outcome/decision and owned, future-due payment follow-up. Current recipient and authority prerequisites are checked again.                                         |
| `reject view.json pending.json 'reason'`              | Robin terminates an unaccepted candidate. An accepted result needs a linked reopen instead.                                                                                                                                   |
| `reopen view.json pending.json 'reason'`              | Robin links the original acceptance and a subsequent negative/inconclusive check, even when the old business basis is stale. Current intervention eligibility still applies.                                                  |

The normal fixture ships with original synthetic POD/terms and an **open** AR
record. The appliance can check that basis and record a report; its result check
will correctly say **mismatch** while AR remains open. No HTTP command edits that
source. Use the isolated test above for the controlled matched transition and later
reversal. Do not edit an evaluator's retained source/history to simulate success.
Workbench result controls and model integration are following builds, absent here.

GET with `representation=export` returns portable canonical evidence. Ordinary
GET/export uses one repeatable-read transaction: no writer lock, source preview,
IDs, clocks or durable writes. Reads do not refresh observations; an explicit POST
check is needed. [Strict operation schemas](../../packages/contracts/openapi/dispute-result.v1.yaml)
reject caller identities, source paths, observations, privileges and success flags.

## What is checked and retained

- **Proof:** original POD bytes/hash, custodian/issuer, exact record/object allocation,
  synthetic line-4 quantity 10, receipt/validity, N1 terms/clause/effectivity and complete
  grounds. A supplied “proof exists” statement cannot satisfy this check. An authoritative
  absent/different exact object is mismatch; failed, malformed, wrong-scope, incomplete
  or changing reads are inconclusive. No read error is evidence of absence.
- **Consent:** server-selected Morgan, distinct reporter, independent service verifier
  and Robin are runtime-controlled purpose profiles, not authentication. The repaired
  resolver checks the fixed one-named-Morgan/no-delegation policy. Enrollment changes
  only the intake tenant; the D6 Finance/Executive credit tenant is untouched.
- **Result:** AR 0→1 must link the prior exact hash/version and the committed no-action
  decision, move only `non_delivery` to disposed, retain POD/terms, and have zero
  adjustment/no associated credit. Added grounds, wrong attribution and unexpected
  transitions cannot establish success. This is not a complete cash/credit ledger audit.
- **History:** C/D/P/U never advance for result/review commands. Enrollment advances S.
  Authority create/review stays solely in the D6 journal/R; its new pinned command
  metadata retains the original result-command binding, inputs and exact retry receipt.
  O advances only for enrollment and business-result operations. A modification's
  two D6 entries persist atomically and do not append O. The combined read history
  labels each operation; a derived authority receipt's `sequence` is its bound O,
  not an additional O entry. Equal timestamps do not establish cross-journal order.
- **Replay:** original source bytes, comparisons, scoped identities/grants, catalog,
  exact Case/input heads, time and interpreter versions reconstruct after restart
  without fetching the source. Coherently altered positive proof or an obsolete Case
  prefix claimed after canonical change fails readiness/read/export. The fixture is
  logically independent; a privileged owner able to rewrite every trust anchor is
  outside this synthetic guarantee.

Basis and result observations have a fixed 15-minute freshness window. Historical
checks remain inspectable after expiry. A fresh check never carries old acceptance
onto a new observation; new exact business acceptance is explicit. Later mismatch
or reopen removes current accepted-disposition coverage; inconclusive/expired
coverage is unknown, not zero. Repeated acceptance/retries count one record, not
another success. A candidate rejected or reopened cannot revive.

Payment remains unknown and owned for follow-up; acceptance establishes no customer
payment or real agreement. `cash_collected`, `credits_issued`, `work_newly_attended_to`
and `human_attention_released` remain unknown. Only this synthetic accepted-dispute
count changes 1→0 after reversal, with the earlier cutoff preserved. Preparation
acceptance still means usefulness only. Existing Challenge calculators retain their
versions and do not automatically consume this new export. All effort/cost gaps and
Case closure denial remain.

## Migration and validation

`0011_dispute_result` is additive: one append-only result journal, indexes/parent/key
constraints, and admission of separately versioned dispute material in existing D6
snapshot/journal constraints. Migrations 0001–0010 and their checksums are unchanged.
Existing rows, Cases, intake successful-key bindings, preparation v1/v2 and old D6
replay remain intact. No history is backfilled and no imported record auto-enrolls.

Stop the appliance, back up the **complete** preview database using the existing
[backup/upgrade procedure](../../docs/operations/local-evaluation.md), then build/start
this branch with `pnpm fr up`. Startup applies the new checksum-bound migration;
readiness reconstructs all evidence. Fresh install and upgrade from 0010 are tested.
Do not downgrade a database containing new interpreter records. Restore a complete
pre-upgrade backup with matching source if rollback is necessary; never delete
individual journal rows or edit applied checksums.

[BR1–BR8](../architecture/d13-imported-dispute-result.md#smallest-implementation-after-approval-and-acceptance-scenarios)
are exercised in [the PostgreSQL/API suite](../../scripts/dispute-result-postgres.test.mjs):
retained two-packet success/reversal; wrong record/delivery/terms/grounds; expired or
revoked roles and changed C/S/R/source; denied injected privileges; terminal decisions;
exact lost-response retries, competing heads, rollback/read-back failure, migration,
restart and coherent tampering. The normal appliance smoke separately demonstrates
basis-read/restart/retry against the shipped fixed reader, without fault endpoints.
See [STATUS](../../STATUS.md) and the PR checks for actual final validation evidence.
