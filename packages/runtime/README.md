# Runtime

Pure, deterministic case and journal behavior for the Field Runtime trusted core.

PR2 accepts three commands:

- `case.create` creates a `detected`, version-1 case from an allowed seed and one
  normalized trigger WorkEvent.
- `case.attach_work_event` attaches a source event to an explicitly selected case
  after tenant, scope, source-identity, idempotency, and version checks.
- `case.transition` derives the current state from trusted history and applies only
  a declared transition. Rejected attempts are also attributed journal facts.

Create and attachment commands require source timezone context on each WorkEvent.
The runtime converts an RFC 3339 `occurred_at` value to exact millisecond UTC before
idempotency, source-event comparison, hashing, journaling, or projection. Equivalent
instant spellings therefore have the same identity when their supplied timezone
metadata is the same; the original `source_timezone` label remains attached.

Every accepted or journaled rejection returns a new deeply frozen engine state.
Journal entries carry a contiguous sequence, aggregate version, command
fingerprint, actor, correlation/causation, case before/after hashes, predecessor
hash, and their own event hash. Replay validates those fields and rebuilds the case
without calling a clock or ID generator. Commands first verify that stored
projections and indexes still agree with journal history.

Rejected transition attempts advance the aggregate version because the attempt and
its audit projection are committed facts, even though the business state is
unchanged. Conflicts and exact duplicates append nothing and consume no injected
time or IDs.
An already-processed source event presented under a fresh idempotency key returns a
conflict rather than creating an unjournaled duplicate alias.

This package is in-memory and credential-free. The caller must atomically replace
the returned state; the package does not claim process-safe concurrency or durable
immutability. PostgreSQL persistence, APIs, workers, automatic ECC case matching,
authority evaluation, closure proof, and action execution remain later milestones.

See the [case engine architecture](../../docs/architecture/case-event-engine.md) for
the trust, replay, and persistence boundaries.
