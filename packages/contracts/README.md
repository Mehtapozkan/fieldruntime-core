# Contracts

Canonical JSON Schema boundary contracts plus deterministic cross-record
invariants. The JSON Schema is the v0 boundary source of truth. Database parity is
tracked separately and must not be assumed.

The two event-shaped contracts have different jobs:

- `WorkEvent` inside the Case schema is normalized inbound source evidence.
- `CaseJournalEntry` is authoritative aggregate history with case sequence/version,
  attribution, correlation/causation, before/after hashes, and a predecessor hash.

`src/validators.ts` compiles strict Ajv 2020 validators with own-property checking.
`src/invariants.ts` enforces tenant, case, workflow, scope, approval, receipt, and
resolution relationships that JSON Schema cannot express.

All public validators and invariants first canonicalize untrusted input without
invoking accessors or proxy traps. Claimed `executed` actions fail closed in PR2:
matching caller-declared hashes are not proof until the PR6 authority engine defines
and recomputes the versioned authorization envelope.
