# Follow one imported dispute in the Workbench

This review branch adds result controls to the existing intake/Case surface. It is
stacked on [PR #41](https://github.com/Mehtapozkan/fieldruntime-core/pull/41) at
`4a1f536fb7b6b441a968f518499235443930c723`, which depends on open
[PR #40](https://github.com/Mehtapozkan/fieldruntime-core/pull/40) at `1f387d47`.
None is merged by this assignment. The D-038 awaiting-review/accepted exports and
D-039 approval/API receipts are preserved. No new migration or runtime contract.

## Try the normal appliance

With Node 24.19.0, pnpm 11.24.0 and Docker available, use the review branch:

```sh
git fetch origin feat/d13-dispute-result-workbench
git switch feat/d13-dispute-result-workbench
pnpm install --frozen-lockfile
pnpm fr init ecc --demo
pnpm fr up
```

Open `http://127.0.0.1:3210/?view=intake`. Reuse the
[synthetic intake](synthetic-intake.md), [preparation](synthetic-preparation-worker.md)
and [two-bundle continuation](challenge-follow-through.md) walkthroughs to explicitly
commit North / Orchid / dispute-17 / INV-101 / PO-9 / DEL-4 and prepare its packet.
Opening a record, viewing its packet or refreshing never enrolls or submits work.
The worker's draft stays **unsent**; original proof, governing terms and ownership
are not established by task approval. Do not add a third bundle to simulate a proof
source; D-039's reader is a separate, fixed purpose.

1. Open the selected record's workflow brief and choose **Follow this dispute’s
   result**. Inspect the actual prepared excerpt, complete draft and scoped citations.
   Completed task review remains inspectable under **Preparation packet — review,
   correct or prepare again**. It does not approve the result.
2. Choose **Enroll this exact synthetic dispute**, then **Create result candidate**.
   Enrollment explicitly binds one Case/record and changes the authority catalog.
   A matching customer or invoice name alone is insufficient; DEL-5 is unsupported.
3. Choose **Check original proof and terms**. Inspect the fixed original POD,
   allocation, grounds and terms comparison. A retained statement that proof exists
   is not that independent check. Missing or contradictory proof blocks this path;
   inaccessible/malformed/changing reads are inconclusive, not absence.
4. Choose **Request business authority**. Morgan's named synthetic role reviews the
   exact consequence. Give a reason and **Approve no-adjustment decision**, or use
   reject/replace/escalate. Replacement gets fresh unapproved R0; selecting a role
   does not authenticate someone. **Record no-financial-action decision** only
   submits the exact inspected binding; it neither moves money nor changes source state.
5. Under **Report an outside-runtime disposition**, enter what was reported, its
   evidence reference and actual occurrence in UTC. Inspect the expected source
   object/version in technical evidence. **Record reported disposition** retains a
   human claim, never verification. It does not send the unsent follow-up.
6. **Check disposition source**. The shipped source is still **open**, so the normal
   result is **disposition mismatch**. Expected and observed values/time are visible.
   **Business acceptance unavailable** is intentional; no normal API/UI edits the
   source or supplies a success toggle. Inspect the problem and obtain evidence or
   choose a deliberate fresh check. A fresh check never renews business consent.

The independent check remains available for recorded decisions after current
business permission becomes stale or terminal, subject to its own current verifier
grant. Morgan's supported interventions remain accessible. Expired/revoked reviewer
permission still fails; the browser does not grant veto rights or bypass the server.

## Reproduce acceptance and negative paths safely

These tests use the real HTTP API and PostgreSQL store in disposable synthetic
schemas. Only the **test host** supplies matched/reversed/unavailable source fixtures.
They never change an evaluator's existing Case or add a production fault endpoint.

```sh
pnpm build
pnpm exec playwright install chromium
export D9_POSTGRES_URL='postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime'
export D039_UI_SCREENSHOTS="$PWD/d039-ui-evidence"
node --test scripts/dispute-result-browser.test.mjs
# Retain the original API, restart, integrity, upgrade and BR1–BR8 coverage:
node --test scripts/dispute-result-postgres.test.mjs
```

The acceptance fixture independently reads the expected AR transition and then lets
**Robin** accept only that exact observed disputed portion. The operator gives an
acceptance reason and a future UTC due time for **Morgan's payment-status follow-up**.
An uncertain response is recovered in another tab after restart with the same command
bytes/key and original receipt, without another review. A later independent mismatch
removes current acceptance; Robin explicitly reopens against that evidence. A later
inconclusive read leaves coverage unknown and cannot establish a reversal.

A new candidate starts without transferred approval or proof. Earlier acceptance and
its owned/due commitment remain historical evidence, not current permission. Another
candidate's check cannot label this one successful. Payment, DEL-5 and wider Case
obligations remain unresolved even at the synthetic accepted cutoff; no closure or
real customer agreement is established. The separate D7 credit path is not invoked.

## Recovery and inspection

Every result command uses the existing single IndexedDB recovery slot shared with
intake, Discovery, publication and preparation. Claim the slot **before** sending.
A competing tab cannot overwrite it or send another command when its claim fails.
Clearing compares the exact saved path/body. Reload/reopen preserves the original
command and record association; **Recover original submission** retries the same
bytes/key. No automatic financial/model retry or replacement key is generated.

A confirmed response is shown as a historical receipt even if the subsequent GET
fails. The newest matching check remains prominent, while **current eligibility is
unconfirmed**. A conflict shows its actual denial, requires refresh and inspection,
and leaves the next decision to a person. Browser storage retains navigation/retry
information only; clearing site data loses local recovery keys, not server history.

Read/export/expansion creates no durable rows, source observation or clock change.
The client checks journal/material hashes, exact subject, recorded attribution,
review bindings and positive-result consistency. Independently loaded Case/intake
anchors must reconcile before a new command; they do not become browser authority.
Technical history and original evidence remain expandable and downloadable.

## Evidence and remaining limits

The browser suite covers normal mismatch, separate acceptance/reopen, stale and
altered scope, expired review, current interventions/replacement, unavailable or
wrong-record evidence, confirmed-write refresh failure, cross-tab response loss,
restart and exact retry. Retained D6–D13 suites remain required. Screenshot and
final validation provenance are recorded in STATUS and the PR; an API test is not a
visual inspection or customer usability study. [Actual desktop/390px captures and
checksums](../evidence/d039-workbench/README.md) show the relevant states and controls.
The summary's **Next** link moves keyboard/mobile focus directly to the result controls.

Five measures remain separate: cash collected, disputes resolved, credits issued,
work newly attended to and human attention released. Only a current accepted
**synthetic** disposition can contribute one record here. Unknown is not zero;
principal is not savings; task usefulness is not a verified business outcome. Full
human/support effort, model/tool/infrastructure/setup costs and customer baseline
remain missing. Existing Challenge calculator versions are unchanged.

The [bounded investigation task](../architecture/d13-bounded-investigation-task.md)
is **Proposed**, with no provider calls/integration. A customer session still needs
named buyer/process owner/operator/custodian, approved supported files and custody,
access/storage/retention/deletion arrangements, and a comparable baseline under the
[activation protocol](challenge-customer-protocol.md). Existing preparation may be
compared once that separate boundary is approved; it need not wait for a model.
No real-customer processing, financial writes, release or deployment is included.
