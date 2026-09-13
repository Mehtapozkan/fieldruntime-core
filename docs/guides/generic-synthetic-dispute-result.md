# Generic synthetic dispute result seam

D-041 adds an explicitly enrolled v2 profile to the existing D-039 lifecycle.
It supports a synthetic no-adjustment disposition for an existing canonical Case
and exact committed intake record. It adds no Case ledger, result ledger, workflow
engine, contract-language interpreter, model request, financial write or business
message. D-039 v1 remains a separate unchanged interpretation.

## Supported public boundary

Import the compiled public `dist/packages/runtime/src/index.js` entrypoint after
`pnpm build` (the source package is `@fieldruntime/runtime`). Platform consumers
must not import private store, command, source-parser or journal functions.

- `normalizeSyntheticDisputeProfile(profile)` validates and freezes trusted host
  configuration. It does not enroll a Case or authorize a command.
- `createSyntheticDisputeRuntime({ pool, profile, source, actorIdentityId, now })`
  binds one immutable profile and its read-only source to the existing PostgreSQL
  store. The host owns the pool, authenticated/synthetic session context, clock and
  source port. These options are never supplied in business command JSON.
- `runtime.enroll(command)` is explicit **host-only setup**. It retains the exact
  profile and its hash in the existing result journal and adds scoped identities,
  policy and grants to the existing authority catalog. Do not mount this method as
  an ordinary business command endpoint. Re-enrollment cannot replace the profile.
- `runtime.submit(command)` accepts only strict `dispute-result-command.v2`
  operations; it rejects `enroll`. It checks the host-selected actor against the
  named role. Commands contain exact heads/hashes, decisions/reasons and bounded
  reports/commitments, never profile, policy, roles, paths, URLs, credentials,
  verifier identity, source bytes, success flags or a source mutation handle.
- `runtime.read()` returns the current validated lifecycle and retained history.
  Reads do not observe the external source or append history.
- `runtime.export()` returns privileged `dispute-result-export.v5` audit material,
  including retained profile, canonical Case/intake/preparation evidence, authority
  snapshots/journal, result journal and exact result heads. It is not worker input.
- `runtime.workerInput()` is a separate read projection of already committed
  record versions and associated retained support. It excludes future/uncommitted
  evidence, the profile's expected external result, source bytes/port, verifier
  state and result/acceptance history. Never feed `read()` or `export()` to workers.
- `validateSyntheticDisputeExport(value)` verifies the complete portable history
  and returns an immutable audit envelope, granting no live permission.
- `replaySyntheticDisputeExport(value, caseId, recordKey, at)` validates and derives
  the historical read at the explicitly supplied canonical UTC time.

Public types are `SyntheticDisputeRuntime`, `SyntheticDisputeRuntimeOptions` and
`SyntheticDisputeSourcePort`. The existing public D6 command method deliberately
rejects v2 result authority material; only the configured result boundary can
construct that internal command. No low-level result mutation/store is exported.

The contracts entrypoint exports `assertValidSyntheticDisputeContract(kind, value)`
for profile, subject, command, source, raw, observation, comparison, basis, entry,
receipt, read and export shapes, and `assertValidSyntheticDisputeAuthorityContract`
for command, journal, material, evaluation and read shapes. Schema validation alone
is not enrollment or semantic replay validation.

## Trusted enrollment

`synthetic-dispute-profile.v1` binds:

- `subject`: synthetic tenant, existing `case_id` and `record_key`, entity,
  customer/dispute/invoice/order/delivery identifiers, disputed minor units and
  currency. All retained versions of the record must agree on these immutable
  fields and the canonical Case must agree on customer and organization scope.
- `evidence_refs`: exact retained bundle/artifact hashes, document IDs and original
  locators, including reviewed support associations to this record. The exact
  governing term must also be retained as bound text with its original byte hash.
- Approved authority `policy`, exact ID/version/content hash and one amount/currency
  rule requiring one named decision owner, without delegation or preparer approval.
- Six distinct active named identities: operator, decision owner, action reporter,
  independent service verifier, business recipient and evaluation service. Grants
  are scoped to this Case, disposition and the explicit effectivity window.
- The only supported disposition, `uphold_invoice_no_adjustment`, and one named
  synthetic source profile/object/proof/terms contract and exact governing term.

Every v2 command binding, result entry and basis carries the immutable profile hash.
Existing same-ID identities and policies cannot be overwritten during enrollment.
Changing the shared authority catalog advances S and requires current review; old
consent is never silently transferred. This remains the credential-free synthetic
intake tenant and its supported entity scopes, not general tenant administration.

## Read-only source

The host passes exactly `{ profileId, read(): Promise<Uint8Array> }`. No default v2
filesystem reader or network client is added. The source ID must match the profile;
no mutation method is accepted. A trusted host can implement a local synthetic
fixture read. This is logical separation, not isolation from a privileged host that
controls all configuration, source and database bytes.

`synthetic-dispute-source.v2` retains two independently obtained reads. Its `pod`
field is explicitly v2 governed proof references/validity, not a reinterpretation
of the historical v1 carrier POD bytes. Terms and result objects bind the exact
subject and allowlisted IDs. The result starts open; a positive result requires
`deduction_withdrawn`, no adjustment/credit, complete disposed grounds, a source
version increment, prior-state hash/version and the exact no-action decision hash.
The fixture driver changes its own synthetic state outside Core after the report;
Core cannot perform that mutation.

Both reads must agree. Unavailable, malformed, wrong-attribution and changing
sources are inconclusive. Reliable mismatch is distinct. Reported success supplies
no observation proof. A matching observation creates an unaccepted outcome;
separate named recipient consent binds the fresh result and owned payment follow-up.
Later reliable mismatch removes current accepted success and permits explicit
linked reopen. Inconclusive evidence leaves coverage unknown and cannot support
reversal. Reopen retains original history; Case closure remains denied.

## Reused interpreter and persistence

The existing `applyDisputeCommand` lifecycle and D6 resolver implement transitions,
exact retry, authority review, stale heads, observation, acceptance and reopen.
Version dispatch supplies only the new subject/profile, source interpretation and
strict material envelopes. The existing writer transaction, clock guards and
journal reconstruction retain atomicity and replay. Authority receipts remain in
D6; result receipts remain in `dispute_result_journal`.

Migration **0015_synthetic_dispute_profile** only admits the explicit v2 versions
in the existing result journal, authority journal and authority-snapshot constraints.
No new table or backfill is needed. Applied 0001–0014 files/checksums and data stay
intact. Fresh installation and actual v1-history upgrade/restart are tested.
Export v5 adds result heads so omission of a retained journal tail is rejected.
Mixed v1/v2 exports reconstruct events chronologically, retaining each historical
Case prefix and clock floor. Later Cases cannot retroactively invalidate earlier
v1 authority; earlier Case evidence cannot be omitted to lower a recorded clock.
Pure v1 exports continue to use their existing ordering and interpreter.
It has no external signature against a complete privileged rewrite; preserve the
original export hash as the artifact identity.

V1 schemas, constants, source fixture/reader/comparator, profile, receipts, previous
export versions and interpreter versions remain intact. Existing v1 histories
continue replaying and exact retries return their original receipts. V2 does not
rename the $400 Case to Orchid or weaken the $15,000 contract.

## Case Lab fixture and regression commands

The versioned [fixture](../../tests/fixtures/synthetic-dispute/case-lab.v1.json)
uses a distinct customer, dispute, invoice, order and delivery. Invoice USD 10,000;
payment USD 9,600; disputed amount USD 400 / 40000 minor units. The reason is a
reported late delivery. On **2026-09-07 UTC**, arrival is **14:43**, the supplied
fixed deadline is **15:00**, and unloading completes at **15:27**. The governing
synthetic term measures arrival. The regression asserts the exact timestamps and
ordering; none is generated or inferred during execution.

The fixture supplies the evidence and approved policy. Core validates their trusted
bindings and governs the result; it does not interpret arbitrary contract language.
Four initial documents, two later shipment/customer documents, then the governing
term are released explicitly. The source result and acceptance never enter that
worker-facing projection.

```sh
pnpm validate
docker compose config --quiet
pnpm eval:ecc
pnpm eval:ecc -- --negative-control --receipt /tmp/generic-negative.json
# The preceding negative control must exit 1 with all 30 cases completed.
# Use a disposable local PostgreSQL database with the existing test conventions:
node --test scripts/synthetic-dispute-postgres.test.mjs
node --test scripts/dispute-result-postgres.test.mjs scripts/dispute-result-browser.test.mjs
```

Set `D9_POSTGRES_URL` to the disposable local evaluation database before PostgreSQL
tests; the test helper requires loopback and creates/drops only its own schema.
CI runs the new regression alongside all retained suites, Compose and appliance
restart checks. `STATUS.md` and the handoff record actual results, not planned passes.

## Platform dependency and stop

No Platform file, pin, PR or receipt implementation is changed. Platform remains
`NOT_CORE_BACKED` until a separately instructed integration pins the reviewed new
Core commit, retains/commits this scenario through canonical intake, enrolls the
profile and uses this public boundary with durable PostgreSQL, named actor context
and the independent source port. The seam supplies synthetic lifecycle capability;
it does not prove a customer result, measured business value or complete Case closure.
Stop after the separate open draft Core PR and handoff. No Case Receipt work begins.
