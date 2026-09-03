# Contracts

Canonical JSON Schema boundary contracts plus deterministic cross-record
invariants. The JSON Schema is the v0 boundary source of truth. Database parity is
tracked separately and must not be assumed.

`guided-walkthrough.v0.schema.json` defines the synthetic PR5 browser narrative.
Its safety constants prohibit authority effects, external writes, replay, and
production-receipt claims. Worker-side cross-binding checks keep the narrative
attached to exact fixture evidence, actions, hashes, attempts, and verifier
identities.

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

The D6-A authority boundary adds six provider-neutral contracts:

- `identity-reference.v0.schema.json` distinguishes attributable human, agent,
  and service identities while keeping display and directory metadata
  non-authoritative.
- `case-responsibility.v0.schema.json` binds case owner, delegated worker,
  authority owner, executor, and verifier independently to one exact Case version.
- `delegation-grant.v0.schema.json` records explicit scope, effective time,
  lifecycle state, provenance, and creation/approval attribution.
- `authority-request.v0.schema.json` binds a requested authority class to one
  tenant, Case, Case version, proposed consequence hash, and correlation lineage.
- `authority-decision.v0.schema.json` records approve, reject, modify, or escalate
  decisions against that exact immutable request boundary.
- `authority-resolution-result.v0.schema.json` represents success or explicit
  fail-closed outcomes without silently selecting authority.

The D6-B resolver adds two provider-neutral input contracts:

- `authority-policy.v0.schema.json` represents a small deterministic threshold
  policy with explicit authority requirements, policy identity/version, rank,
  lifecycle, effective window, and evidence source.
- `authority-record.v0.schema.json` binds one human principal to an authority
  class, rank, explicit scope, lifecycle, effective window, and authoritative
  source.

`authority-resolution-result.v0.schema.json` now carries structured satisfied and
outstanding authority requirements so downstream D6-C work can render the exact
policy, eligible principals, decisions, delegations, and source evidence used.

`src/authority-contracts.ts` adds cross-tenant, independent-verifier,
delegation-window, agent-authority, same-rank-conflict, policy-window, authority-
record, requirement-count, and immutable-binding checks that JSON Schema alone
cannot express. Policy and authority contracts deliberately stay smaller than a
general policy language.

All public validators and invariants first canonicalize untrusted input without
invoking accessors or proxy traps. Claimed `executed` actions fail closed in PR2:
matching caller-declared hashes are not proof until the authority engine planned
for D6 defines and recomputes the versioned authorization envelope.

Canonical strings also reject the null character and unpaired Unicode surrogates.
Those values are representable in JavaScript but not losslessly accepted by the
canonical PostgreSQL JSONB target; rejecting them before hashing prevents an
engine/persistence split.

`openapi/local-appliance.v0.yaml` defines the loopback-only evaluation API and
keeps its non-production authority boundary explicit.
