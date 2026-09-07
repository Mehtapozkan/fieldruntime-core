# D-034 — Minimum synthetic invoice-dispute intake and provenance

Status: **Proposed**. D9-A design only; no human approval, importer, endpoint,
active schema, migration or customer-data processing is recorded. This updates the
existing D-034, first prepared during D8-B. It is the **single intake proposal**;
[the canonical specification](../product/workflow-discovery.md),
[requirement/gaps matrix](../product/requirements-implementation-matrix.md) and
[PLAN](../../PLAN.md) retain Discovery, Business Loops and delivery requirements.
Primary coverage: I1; supporting R1/R2/R3/R5/R6, P2/P6 and L4. Examples below are
synthetic design vectors, not passing importer tests or customer findings.

## Recommended decision and one journey

Approve, separately from any real-data permission, one synthetic commercial
invoice-dispute queue within Revenue/ECC: **choose export and documents → inspect
coverage, source claims and proposed matches → review one candidate → explicitly
create a Case or attach evidence → reopen the retained material and commit receipt**.
Case candidates are derived proposals, not a second canonical Case aggregate.
No automatic Case creation, source transition reconstruction or action follows upload.

Reuse strict Case, WorkEvent and CaseJournalEntry v0. Add only the versioned intake
material/selection/receipt boundary below, with bounded PostgreSQL source retention.
An explicit intake commit produces a **new operator-review occurrence**, represented
as a WorkEvent whose source is Field Runtime intake. It does not pretend that a
queue snapshot is a historical dispute event. Source times remain separately
qualified in the retained material. This explicit adapter convention is part of
what D-034 asks a human to approve; it is not already implemented.

Keep ECC shadow-only and the frozen corpus unchanged. Do not create another pack,
extend Orchid's D-033 action enrollment to imported Cases, import approvals or
construct a D6 catalog from documents. D9-B ends at inspectable proposals and
explicit Case creation/attachment. Discovery interviews, source-precedence rules,
worker execution, business outcomes and closure remain later work.

## Existing behavior and the actual gaps

Inspected at merged main `555ac0214b006350b049d96567cb98b92ebc25f8`:

- [Case schema](../../packages/contracts/schemas/case.v0.schema.json): WorkEvent
  requires occurrence/timezone; EvidenceRef occurrence is optional. Neither retains
  original bytes, a parser identity, ingestion time or a coverage manifest.
- [Case engine](../../packages/runtime/src/case-engine.ts): `case.create` accepts
  only tenant/workflow/Case seed plus one trigger event; `case.attach_work_event`
  adds one event to an explicit Case. Neither command appends `evidence_refs`.
  WorkEvent `payload_ref` is opaque; its declared hash is format-checked, not fetched
  or recomputed. Do not describe an existing evidence-attachment API that is absent.
- [Journal](../../packages/contracts/schemas/case-journal-entry.v0.schema.json) and
  [store](../../packages/runtime/src/postgres-store.ts): preserve whole Case replay,
  exact versions, immutable source identity and atomic append bundles under the
  singleton writer. Existing store execution owns its transaction; an intake wrapper
  cannot safely call it and then save provenance in a second transaction.
- [Engine tests](../../tests/runtime-engine.test.mjs) already cover source/time
  normalization, exact duplicates, fresh-key already-processed conflicts, changed
  content, scope, versions and replay. [Store tests](../../tests/postgres-store.test.mjs)
  cover rollback and persistence integrity. These establish reusable primitives,
  not import, matching, byte custody or deletion behavior.

## First supported input profile

The runtime selects a fixed synthetic profile `invoice-dispute-intake.v1`: tenant
`tenant_intake_demo`, scopes explicitly enrolled for this demo, source system
`synthetic_ar_queue`, legal entities `entity_north` and `entity_south`, and existing
ECC shadow workflow metadata. A caller selects this profile, not arbitrary tenant,
scopes, policy, actor records or mapping code. Validate each claimed entity against
its allowlist; document contents cannot enlarge it. The profile maps each entity
to Case scopes and any pre-established upstream/Case references. A same-customer
label alone cannot establish an entity-coherent target. The importing actor is a
server-selected synthetic operator, clearly labelled; this is not authentication.

| Input                                   | Parse or retain                                                      | Exact first limit and behavior                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One `.csv` queue                        | Parse the fixed columns below                                        | At most 1 MiB, 2,000 data records, 8 KiB per decoded cell. Strict UTF-8, optional initial BOM, comma separator, one header, LF or CRLF. Double-quoted cells may contain commas/newlines; doubled quotes escape quotes. Reject inconsistent column counts, duplicate/unknown headers, broken quotes, NUL and invalid UTF-8. Header order may vary; field names are exact. |
| `.txt`, `.md` support                   | Parse as plain UTF-8 text; Markdown is not executed/rendered as HTML | At most 512 KiB each, optional BOM. Preserve bytes and escaped text. No embedded URL retrieval, instructions, scripts or templates are executed.                                                                                                                                                                                                                         |
| `.pdf`, `.png`, `.jpg`, `.jpeg` support | Retain bytes for deliberate download/inspection only                 | At most 5 MiB each; require extension, supplied media type and basic file signature to agree. This is not full format validation or malware certification. No PDF text extraction, OCR, decryption or image interpretation; readability is unconfirmed, with no inline active-document embedding.                                                                        |
| Other inputs                            | Unsupported                                                          | No XLS/XLSX, DOC/DOCX, EML/MSG, HTML, archives, remote URLs or recursive directories. Explicit denial; no provider fallback.                                                                                                                                                                                                                                             |

One bundle has at most 16 support files and 20 MiB total, including the queue.
Enforce streaming limits before allocation/persistence. Names are display metadata,
never storage paths or record identities. A support file requires an operator-supplied
stable document ID and explicit proposed row or business-object associations.
Retain those association claims with their provenance; names alone cannot match a
Case. No archive expansion, symlinks, credential use or filesystem/URI dereferencing.

CSV headers (all present; optional values may be empty):

- Required nonempty row values: `source_record_id`, `legal_entity_id`,
  `customer_ref`, `invoice_id`, `amount_minor`, `currency`, `source_status`.
- Optional claims: `source_version`, `activity`, `reported_actor`, `reported_role`,
  `upstream_case_id`, `upstream_owner`, `order_ids`, `delivery_ids`,
  `source_occurred_at`, `source_timezone`.

Identifiers are case-sensitive nonempty strings of at most 128 characters, without
leading/trailing whitespace or control characters; no fuzzy normalization.
`amount_minor` is a nonnegative safe integer written in base 10; currency is `USD`
for this synthetic profile. Amount is reported disputed value, not an authorized
credit or economic result. `order_ids`/`delivery_ids` are semicolon-separated unique
IDs (maximum 20 each); preserve the arrays, not one fabricated chain. Other optional
text is capped by the cell limit. A supplied occurrence requires its timezone;
empty occurrence requires empty timezone and means **unknown**, not zero or now.

The first profile pins `csv.invoice-dispute.v1`, `text.utf8.v1` and
`mapping.invoice-dispute.v1`; opaque documents have derivation `none`, not empty
extracted text. Store these implementation IDs and the timezone runtime version.
Changing a parser/mapping requires a new profile version and explicit reinterpretation.

The upload form additionally records optional source export time/timezone, declared
population count/window and `full | partial | unknown` coverage. These are labelled
operator/source claims. Even `full` plus a count is not independently verified
population completeness. Missing values remain null with gap codes.

Fatal format/limit or invalid bundle metadata, contradictory duplicate source keys, declared-byte-hash mismatch
or out-of-scope input rejects the entire preparation: zero retained input/Case writes.
Other semantic row errors (missing identity, invalid amount or time) remain inspectable
in a successfully retained, syntactically valid bundle but cannot be committed.
Valid rows can be reviewed independently; rejected/uncommitted rows remain in coverage.
Do not log raw cells, filenames, document text or uploaded instructions on rejection.

## Minimum proposed contracts and field mapping

Use new, strict versioned **intake** contracts, not extra fields in v0:

1. `intake-bundle.v1`: immutable server context/profile version, ingestion timestamp,
   retention recording time, artifact byte references/hashes/sizes, complete parsed records, parser/mapping
   versions, source-time claims, associations, coverage and validation results.
2. `intake-selection.v1`: exact bundle/hash, one primary row/material key, selected
   support and reviewed object links, explicit target/create choice, expected Case
   version and prior intake binding, required acknowledgments/reason, idempotency key.
   No client-computed normalized content, identities or authorization flags.
3. `intake-commit.v1`: immutable normalized consent material, exact selection/hash,
   server actor/time/profile, adapted v0 command, Case journal ID/hash/result and
   predecessor intake binding. `intake-view.v1` is the derived read response containing
   coverage, per-row findings, proposals and linked recorded commits; no durable view.

All IDs and hashes are recomputed/validated server-side. Unknown properties fail
closed. Input arrays are bounded, set-like arrays sort canonically, semantic
objects use the existing `canonicalJson`/`sha256Json`; artifact hashes are SHA-256
of the **original received bytes**, before BOM, newline or encoding transformations.

| Required material                             | Existing field reused                                                                           | Minimum proposed intake field / reason                                                                                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trusted tenant, import scope, profile         | Case/WorkEvent `tenant_id`, `scope_ids`, workflow reference                                     | Bundle `profile_id`, `profile_version`, runtime-selected tenant/scopes; uploaded tenant/scope claims never become context.                                                                                                                                |
| Source system/record/version                  | WorkEvent `source`, `source_event_id`; EvidenceRef `source`, `version`                          | Record `source_system`, `source_record_id`, `reported_source_version`, computed `source_revision`; original record identity is not a runtime event identity.                                                                                              |
| Legal entity, invoice/order/delivery/customer | Case `customer_ref`, `issue_fingerprint`, scope; Case IDs for explicit links                    | Typed `business_objects[]` and `relationships[]` with entity, source namespace, kind, ID, citation and reported/reviewed state. Existing Case fields cannot encode many-to-many source relationships.                                                     |
| Coherent upstream Case/owner                  | Existing target Case ID/owner remain untouched                                                  | `upstream_case_ref`, `reported_owner`; source owner claims do not create canonical identity records.                                                                                                                                                      |
| Activity, reported actor/role, source status  | WorkEvent `event_type`/actor describe the actual intake occurrence                              | Record `reported_activity`, `reported_actor`, `reported_role`, `reported_status` remain untrusted claims, never credentials or Case state transitions.                                                                                                    |
| Original bytes and citations                  | WorkEvent `payload_ref`, `content_hash`; EvidenceRef `resource_uri`, `content_hash`             | Artifact `byte_hash`, `byte_length`, `media_type`; record/document locator. Optional `declared_hash` is labelled and compared, never substituted for computed bytes.                                                                                      |
| Stable locators                               | EvidenceRef URI/excerpt                                                                         | CSV artifact hash + 1-based logical record ordinal (header excluded), physical line span, zero-based half-open byte span, field/header; text byte/line spans; opaque documents use artifact-only locator. Row number without artifact hash is not stable. |
| Derivation                                    | No existing parser/mapping identity                                                             | `parser_version`, `mapping_version`, `derived_hash`, `derived_from` with original artifact and locators. Pin implementations for replay; changed parser/mapping produces a new explicit interpretation, never overwrites old text.                        |
| Four time meanings                            | WorkEvent occurrence/timezone; EvidenceRef optional occurrence/retrieval; journal `recorded_at` | Separate source occurrence and export/snapshot time objects plus runtime `ingested_at`. A retrieval timestamp alone cannot document ingestion.                                                                                                            |
| Matching/coverage/validation                  | No existing matching or population contract                                                     | `match_candidates`, cited reasons, reviewed links, `coverage`, per-record findings and measurement gaps; these do not grant policy or merge authority.                                                                                                    |
| Review attribution/idempotency                | Command actor/key, expected Case version, journal hashes                                        | Selection binding + intake receipt; actor comes from server, imported actor stays evidence. No new authority engine.                                                                                                                                      |

Reuse EvidenceRef shape **inside retained intake material** for citations. Set
`authority_rank: 5` and `freshness_status: unknown` in this profile; uploaded ranks
are rejected. Document rank does not authorize. Do not populate the Case's unused
`evidence_refs` array through an undocumented mutation. The WorkEvent points to the
retained intake material; the intake view expands its evidence. Imported support
does not thereby become a supported D6 policy/evidence-catalog entry.

## Time and snapshot semantics

| Time                 | Source and rule                                                                                                                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source occurrence    | Only an explicit, correctly parsed source claim with coherent offset/timezone. Keep raw value/label, canonical instant and `reported` qualification. It does not prove the source event happened. Empty is unknown; date-only, excess precision, impossible date or incoherent timezone is a validation finding, not a guessed instant. |
| Snapshot/export time | Optional source/form claim about the queue snapshot, with the same validation. No event-per-status reconstruction; `open` followed by `closed` proves only two reported snapshots.                                                                                                                                                      |
| Actual ingestion     | Injected server UTC time when the complete bounded bytes finish arriving, retained on first successful bundle preparation. Restart/exact retry returns that original value. Failed upload has no successful ingestion receipt.                                                                                                          |
| Journal recording    | Existing injected engine UTC time when the explicit reviewed intake is committed. It is neither upload time nor the dispute's start.                                                                                                                                                                                                    |

The adapter must validate IANA zone existence and offset coherence at the supplied
instant, rejecting ambiguous local times without an explicit offset. Pin and retain
the timezone-validation/parser runtime version. Preserve the raw timezone and time
claim. Do not round higher-than-millisecond input into an event. Missing occurrence,
export time, cohort window or denominator creates an explicit measurement gap.
Timestamp differences are not active effort or time saved.

For **every** committed row, v0 WorkEvent describes `intake.material_reviewed` at the
server's successful review-commit time (`source: fieldruntime_intake`, timezone
`UTC`). Its actor is the server-selected synthetic reviewer. Its payload is the
immutable reviewed material with the separately labelled original source claims.
Even a row with a valid historical source occurrence uses this convention; D9-B
is not a historical-event reconstruction engine. The visible timeline says
“Material reviewed into Case”, not “Dispute opened”. Event and journal times may
coincide; they have different meanings. Unknown source time stays unknown.

This retains v0's required occurrence semantics without making it nullable or
putting snapshot state into Case lifecycle fields. The alternative—requiring a real
source occurrence before _any_ Case commit—would leave typical current-state exports
inspection-only. The explicit review-occurrence adapter is the recommended minimal
addition. Creating WorkEvent/Case v1 merely to make occurrence nullable is unnecessary.

## Identity, matching and repeat imports

Define `H` as canonical JSON SHA-256, except byte hashes as above. All identity keys
are tenant/scope-bound; filenames, input order and ingestion/journal times are excluded
from logical record identity. No global cross-customer content deduplication.

- **Bundle identity:** H(profile/version, source snapshot/population claims, sorted
  artifact roles/document IDs/byte hashes/association claims). Same bytes renamed
  reuse the original retained bundle. Reordered CSV rows have new bytes/bundle and
  new locators, but can contain the same logical records.
- **Record key K:** (trusted tenant, intake scope, source system, legal entity,
  record kind, source record ID). Invoice identity separately includes entity and
  source namespace; invoice number alone never identifies a dispute or Case.
- **Source revision V:** H(all decoded source cells keyed by header, source snapshot
  time). Preserve reported source version as one of those cells; it is opaque, not
  a sortable sequence or permission to overwrite. Physical row order/locator is
  excluded. Same reported version with different V is a retained contradiction.
- **Reviewed material key M:** H(K, V, sorted support document identities/byte hashes,
  reviewed relationships, parser/mapping versions). Target Case, command key, physical
  locators, filename and ingest time are excluded. A changed support document or
  reviewed interpretation is new material even if the queue row is unchanged.
- **Consent hash:** H(`review_material`), containing the selected bundle/hash,
  K/V/M, full normalized source/support material and original artifact locators,
  profile/parser/mapping versions, reviewed links, target/create choice, expected
  Case C, prior intake binding, acknowledgments and reason. Exclude its own hash,
  command key, generated IDs, future review time and journal/result fields to avoid
  circular bindings. The command fingerprint separately binds the complete submitted
  selection, including expected consent hash and idempotency key. This exact material,
  not M alone, is what the operator reviews.

One source record K has one committed Case target in D9-B. Its first binding is
retained; subsequent versions propose attachment to that Case, never a second
creation. A coherent upstream Case key is (scope, source, entity, upstream Case ID).
Existing bindings take priority as candidate references, not automatic commits.
For a proposed creation, derive a stable legal Case ID from the scoped upstream Case
key when present, otherwise K; it does not depend on a filename, row order or source
revision. A concurrent creation of that root cannot create another Case.
An explicit matching target preserves the upstream system of record and its reported
owner, and preserves an existing canonical Case owner. For an upstream Case not yet
mapped locally, propose one local coordination Case referencing it; do not import
its status, approvals or fabricated journal history. New canonical owner is null
unless the fixed synthetic profile has an explicit identity mapping. Show reported
upstream ownership separately and unknown canonical ownership as Unconfirmed.

Exact key matches may be suggested with citations. Similar invoice numbers, inferred
customer equivalence, ambiguous matches and many-to-many object links require
explicit review; no score silently selects a Case. A selected match must be coherent
with tenant/entity/customer and existing K/upstream bindings. Unknown associations
remain unknown; the operator may exclude uncertain support with a retained reason,
not assert its truth. If the primary Case target is ambiguous, commit is blocked.

Only one primary queue record and one target Case per commit. Other records remain
independent candidates; supporting documents can cite multiple objects. Do not split
one source record across Cases or auto-merge Cases to accommodate a many-to-many graph.
Two uncommitted records may be deliberately assigned the same coherent Case; separate
commits bind their own material and expected versions.

Before commit, correct proposed links/exclusions explicitly; bind the final choice,
reason and prior reviewed selection hash where present. No mutable review-session
aggregate or draft-keystroke history is needed. After commit, new material can append
an additive correction to the **same** Case, citing the earlier receipt and reason;
it does not retract old evidence or designate a new authoritative truth. Wrong-target
retargeting, moving events, committed Case split/merge and deleting an old association
are **unsupported** in D9-B. Surface the disputed link and block its target-changing
commit; preserve history for a later approved repair. No broad correction/promotion
framework, automatic learning or transferred approvals.

## Retention, transactions and reconstruction

**Explicit preparation is a write.** Receive into bounded process memory with no filesystem spool,
validate scope/format and compute all hashes/derived data. On success,
record a separate server `retained_at` under the lock (not the ingestion time) and
atomically retain the source bytes and immutable bundle under the existing writer
boundary. On failure roll back and discard temporary bytes; a process crash cannot leave a
partially retained bundle. Never call an upload a
read-only preview. A prepared bundle survives restart but creates no Case, review,
action or authority-catalog entry. GET/open/refresh/expansion reads one consistent
read-only database snapshot: no writer lock, preview persistence, IDs or clock updates.
Candidates are derived from retained material plus current Case/binding reads.

Proposed minimum storage is three supporting tables in the **same PostgreSQL**:
scoped immutable `intake_artifacts` (bounded `bytea`), `intake_bundles` (canonical
JSONB, preparation identity/key, first ingestion and retention times) and `intake_commits` (canonical
JSONB, material/record/upstream bindings and Case-journal foreign key). No new database,
blob service, queue or candidate/packet aggregate. Scoped artifact hashes, semantic
bundle identity and (tenant, M) have unique indexes. Retain original display names
in the first bundle; a no-op reimport need not record a filename alias.

Use one additive checksum-bound migration in D9-B, after current 0004. Preserve all
old migration checksums and Case/review/action histories. A narrow transaction-owned
Case-append helper may be extracted from `PostgresCaseStore`; both existing commands
and intake must retain its validation, SQL constraints and replay checks. Do not
call the transaction-owning `execute` twice or write a receipt after Case commit.

For `commitIntake(selection)`:

1. Under the existing singleton writer lock, first resolve an exact stored key/body
   retry. Return the original receipt without a new clock/ID or Case version. Reusing
   the key for changed selection returns `IDEMPOTENCY_CONFLICT`.
2. Load/recompute bundle, byte hashes, derivations, selected material/consent hash,
   server context and target binding. Recheck entity/scope, missing/contradictory required
   fields, reviewed target and required acknowledgments. Do not accept a client's
   “validated”, “approved”, actor, normalized payload or hash as authority.
3. Enforce one K/upstream mapping to a target and unique M. A fresh command key for
   material already committed returns `ALREADY_COMMITTED` plus the original receipt;
   no alias row, new WorkEvent or new permission. This historical no-op is resolved
   before current Case C/prior-binding checks, and does not accept a new reason or
   fresh consent. A different target conflicts. For **new** material, check expected
   Case C and prior intake binding hash (null for first binding) before consuming
   time/IDs or invoking the engine.
4. Construct and validate one v0 WorkEvent and existing create/attach command, with
   fixed adapter source, deterministic source-event ID derived from M, server actor,
   the reviewed material hash/reference, and one checked commit instant.
   Apply the pure engine. Creation starts C=1; attachment advances C once. Any new C
   invalidates earlier Authority Requests under D-032; R/S do not advance here.
5. Persist the engine append bundle, source/idempotency indexes and intake commit
   evidence atomically. Check JSONB/index/byte/Case-journal agreement before commit.
   Maintain the existing writer revision. The intake clock floor is the maximum
   retained intake write time and applicable canonical Case/review/action times;
   derive it under the lock from retained records, with no new clock service or
   authority-catalog enrollment. A backwards clock fails. Rollback includes both provenance binding and Case append;
   failed rollback discards the connection. Existing D-014 semantics are unchanged.

Commit atomicity is **per reviewed record**, not the whole export. A second row
failure does not undo a previously confirmed row; coverage and per-row receipts say
so. There is no batch-success flag implying every row committed. A lost response
retains the original exact command/key locally for retry; a new key is not recovery.
Concurrent duplicate preparation/material commit converges under unique indexes and
the writer lock. Distinct commands against the same C/binding require refresh and
new explicit consent after the first succeeds. No silent rebasing or partial row writes.

Reconstruct original bytes → pinned parser/mapping → records/locators/coverage →
reviewed material → v0 command → existing journal/result. Recompute hashes and compare
stored indexes, K/upstream uniqueness, predecessor links and Case anchors; fail closed
on missing bytes, tampering, unknown implementation version or conflicting history.
Current proposals additionally reconcile current Case C/bindings. Preserve journal
sequence; equal timestamps cannot establish cross-journal order. Historical receipt
replay does not grant current authorization. Include intake reference/byte integrity
in appliance readiness and intake read/commit paths; the unchanged standalone v0
journal replay still checks its own journal rather than fetching opaque payloads.
Never advertise full source reconstruction from journal-only validation.
No external signature protects a complete
privileged rewrite. Inspection/read integrity failures are not absence evidence.

## Synthetic contract examples

The queue below is exactly 456 UTF-8 bytes with LF after every line, no BOM:
`sha256:e03a128dc0e3e022eda175f197de6b8dd463d87ea5da1a196d80f2aa6c05d0b3`.
Both rows lack business occurrence time; `INV-101` belongs to different entities.

```csv
source_record_id,source_version,legal_entity_id,customer_ref,invoice_id,amount_minor,currency,source_status,activity,reported_actor,reported_role,upstream_case_id,upstream_owner,order_ids,delivery_ids,source_occurred_at,source_timezone
dispute-17,r1,entity_north,Orchid,INV-101,1500000,USD,open,queue_snapshot,Alex,AR analyst,AR-77,Taylor,PO-9,DEL-4,,
dispute-18,r1,entity_south,Orchid,INV-101,250000,USD,open,queue_snapshot,Sam,AR analyst,,,PO-10,DEL-5,,
```

Document `note-17` is parsed plain text, exactly 73 UTF-8 bytes including final LF:
`sha256:16c8f0c2de6a68e220ea5588703d6e382ab75a03d4aa278190b9a0fd482863e3`.
Its association to dispute-17/DEL-4 is reported until reviewed, not verified delivery.

```text
Customer disputes delivery DEL-4. Delivery confirmation is not supplied.
```

These JSON fragments show proposed fields, not currently accepted API payloads.
`H(...)` below denotes the server-recomputed canonical binding, not a literal hash.
The first row's CSV locator is artifact hash + record 1, line 2, bytes [236,352).

```json
{
  "source_record_id": "dispute-17",
  "reported_source_version": "r1",
  "reported_activity": "queue_snapshot",
  "reported_actor": "Alex",
  "reported_role": "AR analyst",
  "reported_status": "open",
  "source_occurrence": {
    "raw": null,
    "instant": null,
    "timezone": null,
    "quality": "unknown"
  },
  "source_snapshot": {
    "raw": "2026-09-07T09:00:00-07:00",
    "instant": "2026-09-07T16:00:00.000Z",
    "timezone": "America/Los_Angeles",
    "quality": "reported"
  },
  "ingested_at": "2026-09-07T16:05:00.000Z",
  "upstream_case_ref": {
    "source": "synthetic_ar_queue",
    "entity": "entity_north",
    "id": "AR-77"
  },
  "reported_owner": "Taylor",
  "measurement_gaps": [
    "source_occurrence_unknown",
    "population_unconfirmed",
    "active_effort_unmeasured"
  ]
}
```

Example selection: exact bundle/hash; row 1 and note-17; reviewed links
INV-101→PO-9 and PO-9→DEL-4, qualified `reported`; target `case_intake_ar77` at C=4;
expected prior intake binding null; acknowledgment of missing delivery confirmation
and unknown occurrence; reason “Attach this snapshot to the existing AR-77 mapping”;
key `intake-review-001`. Server reconstructs and hashes that material. The v0 event
has `source_event_id = intake:<M>`, `event_type = intake.material_reviewed`,
`occurred_at = 2026-09-07T16:10:00.000Z`, `source_timezone = UTC`, server synthetic
actor, scoped `payload_ref = intake://<commit-material-id>` and computed content hash.
The receipt embeds `review_material` and its hash separately from its adapted
command and journal/result fields, so no hash depends on itself. The existing attach
command then records C=5 and the journal anchor in the receipt.
Source occurrence remains null; 16:10 is the review occurrence, not the dispute start.
The direct v0 adaptation adds no field and does not insert an EvidenceRef into Case.

A selection fragment for that example uses the following fixed shape (hash
expressions are explanatory placeholders). The server reconstructs all normalized
material; it rejects any added client `actor`, `tenant_id`, `authorized` or payload.
Create uses `{ "mode": "create", "expected_case_version": 0 }`; the server supplies
Case ID/seed from the reviewed scoped identity. Attach requires the exact Case ID.
Selection of one row/support set is bounded by the prepared bundle, with reviewed
object links and acknowledgment IDs validated against its findings. The read view
can derive the consent hash for those explicit choices without retaining a preview.

```json
{
  "schema_version": "intake-selection.v1",
  "bundle_id": "intake_bundle_demo_1",
  "expected_bundle_hash": "H(bundle)",
  "record_key": "H(K)",
  "expected_source_revision": "V",
  "expected_material_key": "M",
  "support_document_ids": ["note-17"],
  "reviewed_links": [
    {
      "entity": "entity_north",
      "from": "invoice:INV-101",
      "to": "order:PO-9",
      "qualification": "reported"
    },
    {
      "entity": "entity_north",
      "from": "order:PO-9",
      "to": "delivery:DEL-4",
      "qualification": "reported"
    }
  ],
  "target": {
    "mode": "attach",
    "case_id": "case_intake_ar77",
    "expected_case_version": 4
  },
  "expected_prior_intake_binding": null,
  "acknowledgments": [
    "source_occurrence_unknown",
    "delivery_confirmation_missing"
  ],
  "reason": "Attach this snapshot to the existing AR-77 mapping",
  "expected_consent_hash": "H(review_material)",
  "idempotency_key": "intake-review-001"
}
```

## D9-B acceptance vectors (future tests, not executed here)

Start each independent vector with disposable synthetic PostgreSQL fixtures; retain
its history across the stated restart. Use the existing test host, no normal-API
fault controls. All results below are requirements for D9-B implementation.

| Vector                                    | Before → input / attempted operation                                                                                                                    | Expected result and permitted recovery                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 Legitimate snapshot/control            | Above bundle; reviewer attaches north row to existing coherent C=4 Case                                                                                 | Sources, unknown time, owner claim and coverage inspectable before write. One explicit commit → C=5, same Case owner, one review WorkEvent, immutable receipt. Restart reconstructs bytes/derived material/journal. No action, review approval or closure.                   |
| A2 Identical / renamed reimport           | Same files and claims; rename local CSV, new preparation key; then try same material with a new commit key                                              | Original bundle/material references, original ingestion/receipt; `ALREADY_RETAINED` / `ALREADY_COMMITTED`, no alias or Case/event/version duplication. Exact original key/body retry returns original result; same key with changed body conflicts.                          |
| A3 Reordered rows / headers               | Reverse the two rows or reorder columns without changing cells/claims                                                                                   | New byte hash, bundle and locators; same K/V/M per row, two distinct entity identities. Previously committed material links original receipts; no duplicate Case/event. New transport evidence is not a historical-event delta.                                              |
| A4 Changed source content                 | dispute-17 r1 amount changes; or r2 source status changes; or note bytes change                                                                         | New V or M, old material retained. Same declared r1 with different cells shows contradiction; reviewer must acknowledge both with reason. Propose same-Case attachment, never newer-wins truth. Explicit append C+1 stales approvals; unchanged prior receipt remains.       |
| A5 Same invoice across entities           | North and south both INV-101; caller tries to conflate them                                                                                             | Distinct object/K/root identities. Cross-entity target denied; same number is insufficient matching evidence. Correct scoped candidates remain inspectable.                                                                                                                  |
| A6 Ambiguous / many-to-many               | Row references two orders and three deliveries; two possible Cases                                                                                      | All edges/citations/unknowns retained; no flattening or automatic winner. Ambiguous primary target blocks commit. Review coherent target or exclude uncertain support with reason; moving committed events/splitting a committed Case remains denied.                        |
| A7 Partial export / disappearing row      | Later export omits dispute-18, declares partial or unknown population                                                                                   | Show present, valid/invalid, unmatched, committed and uncommitted record counts plus claimed population/window and gaps. Omission is not deletion, closure, payment, or proof a dispute ceased. No changes to absent Case. No exception rate without a valid denominator.    |
| A8 Invalid / unsupported / injected input | Broken CSV, wrong encoding/limit/media signature, DOCX/ZIP, scope escape, URL fetch, claimed actor/role/policy or “approve credit” document instruction | Fatal preparation errors retain no bytes/Case changes; semantic invalid rows remain noncommittable with findings. Unknown boundary properties denied. Document text remains inert evidence, actor claims never become identities, source hashes/ranks never grant authority. |
| A9 Interrupted commit / lost response     | Inject failure after Case append before intake receipt, then disconnect after successful COMMIT                                                         | First rolls back Case, indexes and commit evidence together; retained prepared bundle remains inspectable. Exact retry may complete once. Lost success response returns the same receipt after restart with no new C/time/IDs.                                               |
| A10 Concurrent duplicate / stale consent  | Two commits for same M or different rows against the same C; changed selected payload/hash or prior binding                                             | Same-key exact duplicate returns original; fresh-key same M already committed; different target conflicts. For distinct changes first valid write wins, second gets version/binding conflict without writes. Refresh/review/resubmit explicitly, never rebase.               |
| A11 Correction / support-only change      | Correct proposed link before commit; later corrected note or same-source new mapping interpretation                                                     | Final reviewed selection/reason retained. Additive same-Case material references prior receipt, advances C and transfers no approval. Retarget/split/merge denied with explanation; old evidence is not edited or silently retracted.                                        |
| A12 Integrity / reads / compatibility     | Alter bytes, row locators, derived text, parser version, index or receipt/Case anchor coherently in subsets; open/refresh/restart                       | Recompute and fail closed on disagreement. Repeated reads leave durable tables, writer revision, C/R/S, clock and IDs unchanged. Fresh install and upgrade retain old checksums/history and D8 regressions. No claim to detect complete privileged rewrite.                  |

Counts distinguish physical rows, duplicate logical rows, distinct K, validation,
matching and commit coverage; do not add overlapping categories as a population.
Identical duplicate K/V rows within one export collapse to one candidate with all
locators retained; conflicting K versions in one export are a fatal ambiguous export.
A full export still needs a confirmed population definition before measurements.

## Real customer activation and deletion boundary

**Synthetic design approval is not permission for real samples.** Real activation
requires a separate, completed customer-scoped approval of all fields below. Unknown
facts do not block synthetic D9-A design. They do block real ingestion; do not ask
an operator to test the public loopback appliance with unapproved customer files.

| Required fact / recommended arrangement                                                                                       | Current state                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer/data custodian, buyer, queue/process owner, operator and incident contact; purpose, population window and ECC fit    | All unnamed / unresolved. Confirm that the assignment remains ECC; otherwise propose the exact workflow amendment.                                                                                                                                                                                                                          |
| Exact permitted file manifest, classifications, source/export permissions and permitted people (including assisted evaluator) | Unresolved. Export-only, minimized customer-authorized copies; redact identifiers/free text not needed for the task before transfer. Each derivative retains private provenance to its custodian-held original; do not label redacted bytes as original bytes.                                                                              |
| Private location and access                                                                                                   | Unresolved. Recommend one customer-dedicated encrypted local machine/account and isolated evaluation database, OS access restricted to named people, loopback only, no shared public demo, cloud sync, public CI or provider uploads. Synthetic seats do not enforce these access controls. Verify the named arrangement before activation. |
| Retention and deletion                                                                                                        | Unapproved recommendation: delete the complete evaluation copy within 30 days of evaluation end and no later than 90 days after first ingestion, earlier on custodian instruction; any extension needs explicit approval. No indefinite retention promise.                                                                                  |
| Backups, caches, downloads, portable exports                                                                                  | Inventory before activation. Recommend no unattended copies/sync/backups of this evaluation dataset; if required, bind encryption, access, expiry and deletion to the same approved schedule. Named custodian controls delivered exports and downstream copies; document their separate custody/deletion obligations.                       |

Immutable evidence is retained **for the life of the isolated evaluation dataset**.
Full deletion means disposing of that entire dataset: source bytes, derived text,
intake manifests/receipts, Case/review/action journals, indexes, temporary files,
known caches/downloads and controlled backups. Do not delete only a blob and claim
fully reconstructable history remains. No retained source hash or customer identifier
is promised as a non-sensitive substitute. After disposal, this copy has no replay.
The custodian may keep an explicitly approved portable copy under its own policy.
A private deletion record may identify the disposed dataset and method without
copying content; its custody/retention must also be agreed.

D9-B does not implement selective journal erasure, multi-customer hosting or a general
retention service. If row-level deletion, immutable legal retention, shared-dataset
isolation, backup removal or required access controls cannot fit the complete-dataset
boundary, **do not activate real data**. Prepare a separate amendment for that need;
never promise both complete deletion and indefinite replay of the same private copy.
Existing synthetic migration/journal append-only rules remain unchanged.

Portable export is a deliberate scoped operation: source bytes, artifact/record
locators and hashes, pinned parser/mapping versions, coverage/findings, reviewed
links and commit lineage, with associated existing Case journals. Validate it in a
new disposable synthetic test instance for reconstruction, never overwrite an
existing Case database. This is an export/conformance test, not a general live
restore endpoint. Downloadable data remains private; exporting grants no execution
permission. No customer content in public repository fixtures, logs, screenshots,
website uploads or reusable templates. No connector credentials, external writes,
provider requests, customer communication or automatic file fetching.

## Approval points and compatibility

1. **Technical/synthetic decision:** approve the bounded input profile, versioned
   intake material/selection/receipt, explicit review-occurrence v0 adapter, per-record
   atomic provenance+Case commit, deterministic reimport/binding rules and retention
   for the evaluation dataset's life. This authorizes only a subsequent synthetic
   D9-B implementation when separately instructed; it approves no real sample.
2. **Real-data activation amendment:** name and approve the exact customer/files,
   people/access/location, redaction, retention/deletion/export arrangements above,
   and confirm the customer's ECC assignment. This remains unresolved and cannot be
   inferred from approval of item 1 or a useful synthetic demonstration.

D-001/D-007/D-027 keep one canonical Case and ECC; D-028 preserves upstream ownership.
D-011/D-018/D-019 keep WorkEvent occurrence and timezone semantics: only the new,
explicitly named review-occurrence adapter convention is proposed. D-012 stays
explicit-target; D-016 still returns already-processed for raw v0 fresh-key replays.
Intake's separate no-op `ALREADY_COMMITTED` result never changes that engine rule.
D-003/D-015/D-020/D-021 require atomic PostgreSQL persistence; the supporting byte
custody and commit evidence need the proposed additive migration, not reference SQL.
D-029/D-031 keep claims/derived text below authority. D-032/D-014 keep exact C/R/S
and journal semantics. D-013/D-017/D-033 keep execution/closure guards unchanged.
D-005/D-023 and the frozen constitution do **not** authorize real samples: item 2
is the smallest explicit data-boundary amendment, not production authentication.
No accepted decision is silently rewritten by this Proposed record.

## Exact D9-B handoff after approval

One synthetic import, existing appliance/Workbench layout: explicit preparation,
read-only coverage/provenance/candidates, review one target, commit through existing
Case commands, inspect receipt and safe reimport. Imported Cases get no action or
approval policy. Retain D8 Orchid review/action/check/History unchanged.

| Work                                                                         | Affected files (proposed, not added by D9-A)                                                                                                                        | Acceptance gate                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Versioned intake shapes + deterministic bytes/CSV/text/identity/time adapter | `packages/contracts/schemas/intake-*.v1.schema.json`, contract validators/invariants/index; `packages/runtime/src/intake.ts`; synthetic fixtures outside frozen ECC | Strict field mapping and format limits, A2–A8; byte and derived provenance; source claims cannot supply tenant/identity/authority.                                                                                 |
| Atomic supporting persistence and replay                                     | `packages/runtime/src/postgres-intake-store.ts`, narrow reuse of `postgres-store.ts`, next checksum migration and migration registry                                | A1/A9/A10/A12 on real PostgreSQL: fresh/upgrade, exact retry, failures, restart, tampering and unchanged old history.                                                                                              |
| Existing runtime/API + Workbench intake view                                 | `apps/worker/src/command-service.ts`, `apps/api/src/handler.ts`/`server.ts`, new versioned OpenAPI intake document; existing admin assets/navigation                | Explicit prepare/read/commit and private artifact/export reads, no normal fault API, no automatic Case mutation. A1/A5–A11 and read-only expansion/reload. Inspect desktop/390px/keyboard without a new dashboard. |
| Conformance and documentation                                                | Focused intake unit tests, existing PostgreSQL test-host pattern, focused browser scenarios; contract/runtime/admin READMEs, STATUS/PLAN/matrix                     | All A1–A12 become executable assertions. Required repository/Compose/appliance checks and retained D6–D8/ECC/negative-control remain. Clearly separate synthetic results from customer outcomes.                   |

No D9-B code is part of D9-A. No general upload framework, matching model, event miner,
OCR/provider, correction framework, worker, real connector, economics or release.
The named real-data facts above and future customer operating contract remain open;
synthetic parsing, identity, time, atomicity and failure semantics are specified here.
