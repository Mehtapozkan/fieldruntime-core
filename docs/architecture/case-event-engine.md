# Case and Event Engine

PR2 adds the smallest trusted runtime slice that can own a case without pretending
to own the enterprise systems around it. It is a pure, in-memory evaluation engine:
commands in, a result with deeply frozen state out. Applied commands and journaled
transition rejections return a new state; duplicates and conflicts preserve the
prior state.

## Three records, three responsibilities

| Record             | Responsibility                                       | Carries                                                                                |
| ------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `WorkEvent`        | Normalized reference to an inbound source occurrence | Source identity, time, scope, classification, content hash, and payload reference      |
| `CaseJournalEntry` | Hash-chained aggregate history                       | Case sequence/version, command attribution, causation, before/after hashes, and replay |
| `AuditEntry`       | Case-document projection of a journaled operation    | Operator-visible lineage tied back to the journal entry                                |

The Case document's `events` collection remains a collection of WorkEvents. It is
not overloaded as an event-sourcing log. The WorkEvent contract defines no field
for a raw provider payload. Adapters must retain those bodies outside the canonical
Case and place only an opaque external reference in `payload_ref`. PR2 validates the
declared `content_hash` format and fingerprints the complete normalized WorkEvent,
but it cannot independently recompute that content hash. Adapter validation remains
PR7 scope.

`occurred_at` crosses the command boundary as RFC 3339 with no more than
millisecond precision and is normalized to exact `.sssZ` UTC before every
fingerprint and stored copy. `source_timezone` is separately required and preserved
unchanged as `UTC`, a fixed `UTC+/-HH:MM` label, or an IANA-style timezone identifier.
The core validates its syntax; source adapters own registry validation. This prevents
equivalent offset spellings from creating different command/source identities when
their timezone metadata agrees, without discarding the source's business-time
context. Greater-than-millisecond precision is rejected rather than truncated.

## Command boundary

The engine supports case creation, explicitly targeted WorkEvent attachment, and
state transition. It owns initial state, case version, timestamps, journal IDs, and
audit IDs. Commands supply an expected case version, actor identity, tenant-scoped
idempotency key, and correlation ID. Optional causation must reference an earlier
entry in the same case journal.

Automatic candidate matching is intentionally absent. ECC's merge contract depends
on a configured time window, authority path, accepted material outcome, customer,
issue, workflow, and scope. The current Case schema does not encode every required
discriminator. Selecting a case anyway would turn an incomplete heuristic into an
authority decision. PR2 therefore attaches only to a case named by the caller.

## Deterministic commit semantics

- `case.create` always starts at `detected`, version `1`.
- `(tenant_id, idempotency_key)` identifies a semantic command. An exact retry
  returns its original result before checking a now-stale expected version.
- `(tenant_id, source, source_event_id)` identifies inbound source evidence. An
  exact same-key retry deduplicates. A replay under a fresh idempotency key fails as
  already processed; changed content or a different target case conflicts.
- A new mutation must match the current case version.
- WorkEvent tenant must match the command tenant and its scopes must be a subset of
  the case scopes.
- Stored WorkEvent time is canonical millisecond UTC and retains required source
  timezone metadata.
- Accepted attachments/transitions and attributed transition rejections increment
  the case version once. Conflicts and duplicates do not append.
- Time and IDs come only from injected dependencies and are not consumed by exact
  duplicates or conflicts.

Rejected transition attempts are journaled operational facts within the returned
engine state: state is unchanged, but `updated_at`, aggregate version, journal, and
audit projection advance together. That makes retry and investigation semantics
explicit.

## Journal and replay

Each journal entry contains contiguous sequence and case version numbers, actor,
correlation and optional causation, a canonical command fingerprint, the preceding
entry hash, case before/after hashes, and an event hash. Canonical JSON rejects
accessors, proxies, class instances, sparse arrays, non-finite numbers, executable
values, cycles, symbols, and prototype-sensitive keys before hashing.

Replay validates the journal schema, hash chain, chronology, causation topology,
audit-envelope linkage, source uniqueness, declared transitions, audit projection,
and Case invariants. It then reconstructs the aggregate without clocks, generated
IDs, provider calls, or models. Every new command first checks that stored
projections and indexes still agree with replayed history.

This is consistency and tamper detection inside the evaluation state, not durable
storage. The hash chain is unsigned and externally unanchored; a privileged writer
who can replace the whole state can recompute it. PR4 must commit the journal,
projection, idempotency record, and source-event identity in one PostgreSQL
transaction and enforce concurrent writers there.

## Fail-closed lifecycle boundary

The state table contains `verifying -> resolved`, but a legal edge alone is not
closure proof. PR2 rejects every requested transition to `resolved`. A later engine
must prove the authorized action or accepted no-action path, independent source
reread, commitment disposition, accepted evidenced outcome, correction capture,
and reconstructable audit before enabling that transition.

PR2 also fails closed on every Case document that claims an action is `executed`.
PR6 must define and recompute the versioned authorization envelope before declared
payload hashes, approvals, and receipts can prove execution.

The imported ECC v0.1.0 fixture remains a legacy snapshot: its version and audit
history are not sufficient to reconstruct its earlier lifecycle. PR2 replay claims
apply only to aggregates created through this engine, not to arbitrary imported
snapshots or the future full workflow.
