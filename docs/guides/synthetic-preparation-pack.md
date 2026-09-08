# Publish one synthetic preparation pack

D11-A / corrected Accepted [D-036](../architecture/d11-reviewed-runtime-pack.md)
merged in PR #33 at `940a95bf62463ba3c42a0e6221b9e6849f523410`, after the approval-recording
head `3c93f6f6` passed [required CI](https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/34270252563).
The reviewed local correction `100b6818` was published as identical-tree `3ba7f800`;
both findings were resolved. Normal merge preserved repository protections.

**D11-B is implemented on this review branch, not in the historical prerelease.**
It installs one fixed preparation template and one synthetic North publication stream.
An operator can inspect, publish, compare, withdraw, roll back and export that configuration.
It does not execute the four-step assignment. D12 still owns useful worker execution
and separately reviewed minimum proof/correction capture. Customer activation remains unapproved.

## Workbench walkthrough

Use the [current-source setup](../../README.md#try-current-source), checking out
`feat/d11b-preparation-pack` before building while this PR is open. At
<http://127.0.0.1:3210/?view=intake>:

1. Explicitly prepare the synthetic sample, inspect the North record's Case target,
   acknowledge gaps and commit it. Open its workflow brief using the existing
   [intake/Discovery steps](synthetic-discovery.md#short-operator-walkthrough).
2. Record a workflow-description confirmation if one is not currently applicable.
   Unknown delivery proof and ownership may remain unknown. **Preparation pack** reuses
   that exact review; opening the panel creates no confirmation or selection entry.
3. Inspect the scoped delivery finding, upload coverage and expandable citations.
   The DEL-4 claim cites its associated note. The two-record count cites both rows.
   Proposed objectives/process rules have no fabricated source proof. The source
   report is not independent verification or justification for a credit.
4. Supply **Selection reason**, choose **Preparation expiry (UTC)** and acknowledge
   the exact candidate. Choose **Publish for preparation**. The separate, server-selected
   synthetic preparation publisher is a demo profile, not authenticated sign-in.
   Confirmed publication and current eligibility are shown separately.
5. Reload or restart the appliance. Inspect the same selection history and export.
   No worker, credit, verification, Case/review/catalog change or closure follows publication.
6. Add genuinely new information through **Answer or correct the recorded description**.
   Saving it makes the old pack stale. Review the fresh description and confirm it,
   inspect **Exact changes from the selected pack**, then publish the new artifact separately.
   Old material and approval remain historical; no approval transfers.
7. **Withdraw selected pack** remains available under its own current reviewer/head
   checks when business inputs changed or pack effectivity expired. It selects nothing.
   **Selection history and guarded rollback** offers an explicit new publication of
   retained material only when its exact basis is still current. It does not restore old permission.

One atomic IndexedDB slot is shared with intake and Discovery. A competing tab cannot
replace an unresolved command or send after a failed claim. **Recover original submission**
uses the exact saved body/key after reload, restart or lost response. A late completion
cannot clear another command. A confirmed receipt survives failed refresh; current selection
then shows unavailable. After a confirmed conflict, refresh, inspect and explicitly consent
again. No automatic replacement key or retry.

## Executable API path

The existing explicit intake and Discovery example scripts remain the first steps.
Use a new local directory; retained command files are never overwritten. Inspection
writes a local retry file only, not PostgreSQL. Read/export operations are read-only.

```sh
pnpm build
mkdir -p /tmp/d11-example
node scripts/intake-example.mjs prepare /tmp/d11-example
node scripts/intake-example.mjs inspect /tmp/d11-example create
# Inspect selection.json and the exact preview before committing.
node scripts/intake-example.mjs commit /tmp/d11-example
cat > /tmp/d11-example/description.json <<'JSON'
{"operation":"confirm","purpose":"discovery_description","reason":"Synthetic description retains missing DEL-4 proof and unknown accountable owner; no authority"}
JSON
node scripts/discovery-example.mjs inspect /tmp/d11-example /tmp/d11-example/description.json
# Inspect discovery-command.json and its material before submitting.
node scripts/discovery-example.mjs submit /tmp/d11-example
node scripts/preparation-pack-example.mjs read /tmp/d11-example > /tmp/d11-example/pack-read.json
```

Create explicit publication notes. Select a future expiry within the synthetic grant
(January 1, 2026 inclusive to January 1, 2027 exclusive); expired grants deny publication
and withdrawal. This example proposes one hour from the server's evaluated time:

```sh
node --input-type=module <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
const v = JSON.parse(await readFile('/tmp/d11-example/pack-read.json', 'utf8'));
await writeFile('/tmp/d11-example/publication.json', JSON.stringify({
  operation: 'publish', reason: 'Reviewed scoped preparation; consequential rules remain disabled',
  effective_until: new Date(Date.parse(v.evaluated_at) + 3600000).toISOString(),
  effective_until_source_timezone: 'UTC'
}), { flag: 'wx' });
JS
node scripts/preparation-pack-example.mjs inspect /tmp/d11-example /tmp/d11-example/publication.json
# Inspect the candidate, changes and pack-command.json before explicit publication.
node scripts/preparation-pack-example.mjs submit /tmp/d11-example
docker compose restart core
node scripts/preparation-pack-example.mjs submit /tmp/d11-example # exact original receipt, no write
node scripts/preparation-pack-example.mjs export /tmp/d11-example > /tmp/d11-example/pack-export.json
node scripts/check-preparation-pack-export.mjs /tmp/d11-example/pack-export.json
```

For a **fresh** command, preserve the completed command file under a historical name
only after its outcome is confirmed; inspect again with an explicit new note. Withdrawal
notes contain only `operation: "withdraw"` and `reason`; no basis or expiry is accepted.
Rollback notes additionally select a retained `artifact_hash` and new expiry. Neither the
script nor API silently rebases. Keep an uncertain original file for exact retry.

The narrow [OpenAPI](../../packages/contracts/openapi/intake.v1.openapi.json) exposes:

| Operation                                                                                                  | Contract and checks                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/v1/intake/preparation-packs/pack_synthetic_invoice_dispute_north?bundle_id=…&record_key=…&case_id=…` | One consistent read-only candidate, comparison, current selection and immutable history. Add `representation=export` for portable evidence.                                                                                                                |
| POST `…/selections/publication`                                                                            | Strict `pack-selection-command.v1`: operation, pack ID, exact expected selection revision/head, current profile hash, artifact hash, reason and key. Publish/rollback also bind the exact basis and new expiry/timezone. The server recomputes everything. |
| POST `…/selections/intake`                                                                                 | Existing intake seat cannot make a fresh publication decision. The separate publication role is required.                                                                                                                                                  |

No caller profile, identity, rule, privilege, authorization result or unknown field is
accepted. Duplicate JSON keys (including escaped aliases) are rejected. A first successful
command atomically retains one selection entry and exact retry result. A changed body under
its operation-scoped key conflicts. Fresh identical publish is a **non-success `NO_CHANGE`**;
it does not reserve a key. An exact retry is historical even after supersession or grant expiry.

## Persistence and interpretation

Migration **0008_preparation_pack_selection** adds one append-only supporting journal,
column/hash/chain/key checks and a cross-input clock guard. Every 0001–0007 checksum is
unchanged. Case C, Discovery D, authority R/S and business histories are unchanged by
selection commands; only selection P and the existing internal writer coordinator advance.
Existing preview databases upgrade additively. Follow the existing backup instructions;
there is no destructive down-migration or export-restore endpoint.

The container is now pinned to Node 24.19.0 / tzdata 2026b, matching the already-required
fixture and native replay environment. The previous Docker digest actually selected
24.20.0; the cross-process appliance export check exposed that mismatch. Before upgrading
a locally built preview, export and inspect its retained timezone-version marker using
its original image. Archives made with another interpreter are **not silently converted**:
keep that image and volume for reconstruction. The tested additive upgrade covers 2026b
Discovery v1/v2 histories; mixed or unavailable timezone interpreters remain fail-closed.

Published entries retain the artifact, exact command/result, canonical input references,
profile/identity snapshot, evaluation time and implementation versions in one transaction.
Rollback/withdraw reference retained artifacts. Original bytes are reused, not duplicated.
Replay reconstructs relevant historical prefixes and rejects omitted strictly earlier input
or obsolete Case anchors while preserving legitimate earlier publication. **Equal timestamps
do not establish cross-journal order**; exact retained anchors remain necessary. Current
identity/grant checks do not retroactively rewrite historical grants; there is no general
identity-status history or production authentication.

The runtime artifact is `preparation-pack.v1` with a deterministic content-addressed
`pack-v1-<digest>` version; read previews reserve no sequential version. The frozen
[approved design example](../examples/d11-invoice-dispute-pack.proposed.json) remains its
original unregistered illustrative format/hash. Its normative steps/rules/resources are
carried into the strict fixed [template](../../packages/contracts/src/preparation-template.v1.json);
example-specific subject data comes from the bound canonical material. The runtime envelope
adds explicit coverage membership, confirmation/profile bindings and reconstruction references.
This is an explicit versioned implementation, not reinterpretation of that example.

Historical Discovery v1/v2 material and exports remain unchanged, including the known old
loop-helper citation fallback. The pack projection derives its own relevant claim citations
and upload coverage; it does not silently fix retained Discovery semantics. Node **24.19.0 /
tzdata 2026b** remains required. Unknown interpreters fail closed. Whole-history validation is
for this bounded synthetic evaluation; no throughput or multi-pack production claim is made.

## Acceptance and visual evidence

Run after `pnpm build`, using a disposable loopback PostgreSQL database (each test owns
and drops a random schema):

```sh
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:55432/postgres \
  node --test scripts/preparation-pack-postgres.test.mjs scripts/preparation-pack-browser.test.mjs
node --test tests/preparation-pack.test.mjs
# Explicit appliance-only control; creates synthetic material and saves retry evidence:
node scripts/smoke-preparation-pack-api.mjs applied /tmp/d11-appliance-evidence.json
docker compose restart postgres core
node scripts/smoke-preparation-pack-api.mjs durable /tmp/d11-appliance-evidence.json
```

| D-036 gate | Executed coverage                                                                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1/T3/T4   | Deterministic fixed template; all six citations; A/B/same-delivery/shared-object/order controls; unrelated upload coverage; opaque/missing/ambiguous support; current description reused.                                                     |
| T2/T5      | Strict injection/duplicate-key denial; unknown/revoked/expired/conflicting/wrong-scope reviewer; exact Case/D/profile/template/business bindings; no-op metadata excluded from staleness; current expiry; read/write races and fresh consent. |
| T6/T7      | Same-key/head conflicts; failed insert/commit rollback; lost acknowledgment, cross-tab claim and restart; stale/expired withdrawal; unauthorized/stale-head denial; guarded rollback; immutable superseded evidence.                          |
| T8         | Fresh install and 0007 upgrade; retained v1/v2 archives/retries; coherent citation/hash/index and obsolete-prefix tamper denial; readiness/read rejection; clocks and no writer lock on reads.                                                |
| T9         | Existing intake panel, explicit publication and correction/fresh review; unavailable state after failed or mixed reads; desktop/390px captures and keyboard traversal; all retained suites stay required.                                     |

[Desktop and 390px captures](../screenshots/d11b/README.md) show proposed, published,
stale and withdrawn states. The browser tests capture the real PostgreSQL/API path,
not a mockup. Visual inspection checked readable proposal/uncertainty/control text and
no horizontal overflow. Keyboard coverage traverses reason, native expiry fields,
consent and publication, opens citations and checks receipt focus. Screen-reader and
non-Chromium assistive-technology audits were not performed.

Local PostgreSQL 18.4 coverage is distinct from required CI PostgreSQL 17.11 and Docker
Compose/appliance evidence. See [STATUS](../../STATUS.md) and the PR checks for actual
final results. No measurement of labor, saved time, revenue, customer acceptance or real
impact is established. D12 is next; worker dispatch and general correction/promotion
remain unimplemented.
