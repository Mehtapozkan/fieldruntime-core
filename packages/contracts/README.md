# Contracts

Canonical JSON Schema boundary contracts plus deterministic cross-record
invariants. The JSON Schema is the v0 boundary source of truth. Database parity is
tracked separately and must not be assumed.

The two event-shaped contracts have different jobs:

- `WorkEvent` inside the Case schema is normalized inbound source evidence.
- `CaseJournalEntry` is authoritative aggregate history with case sequence/version,
  attribution, correlation/causation, before/after hashes, and a predecessor hash.

A stored WorkEvent uses an exact millisecond UTC `occurred_at` value and carries
required `source_timezone` metadata (`UTC`, a `UTC+/-HH:MM` fixed-offset label, or
an IANA-style timezone identifier). The runtime normalizes the source instant
before any command, source-event, journal, or projection fingerprint while
preserving the supplied timezone label unchanged. Inputs with more than millisecond
precision fail closed instead of silently losing evidence precision.

The core validates timezone syntax; source adapters remain responsible for checking
named identifiers against the relevant timezone registry and confirming that each
supplied label agrees with its instant.

Stored workflow effective windows and case deadlines also use exact millisecond
UTC. Field-specific `effective_from_source_timezone`,
`effective_to_source_timezone`, and `due_at_source_timezone` metadata preserves
the supplied labels. The latter two timezone fields are required only when their
optional instant is non-null; adapters validate label/instant coherence.

`src/validators.ts` compiles strict Ajv 2020 validators with own-property checking.
`src/invariants.ts` enforces tenant, case, workflow, scope, approval, receipt, and
resolution relationships that JSON Schema cannot express.

All public validators and invariants first canonicalize untrusted input without
invoking accessors or proxy traps. Claimed `executed` actions fail closed in PR2:
matching caller-declared hashes are not proof until the PR6 authority engine defines
and recomputes the versioned authorization envelope.
