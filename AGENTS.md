# Agent Instructions

These instructions apply to the entire repository.

## Read before changing code

Read, in order:

1. `PRODUCT_SPEC.md`
2. `STATUS.md`
3. `DECISIONS.md`
4. `PLAN.md`
5. `IMPLEMENT.md`

Then inspect the affected package and tests. Treat the product constitution as
frozen. A change to product intent, trust boundary, security invariant, first
workflow, persistence choice, or non-goal requires an explicit decision record and
human approval.

## Non-negotiable invariants

- Models and agents may propose; they never authorize.
- Authority, identity, scope, state transitions, idempotency, and closure are
  deterministic.
- Actions default to simulation. No external credentials or writes belong in v0.
- Verification is an independent read-back, never the action adapter response.
- Resolved means authorized or accepted no-action, independently verified,
  receipted, and accepted.
- Events and receipts are immutable.
- Corrections append replayable lineage instead of rewriting history.
- PostgreSQL is the canonical persistence target; do not silently substitute
  SQLite.
- Provider SDKs stay outside domain packages.
- Prefer one modular deployable over microservices, queues, or graph databases.
- Do not claim production readiness, compliance, or enterprise safety from the
  evaluation release.

## Engineering rules

- Validate every boundary payload.
- Use UTC internally and preserve source timezone metadata.
- Inject clocks and ID generation into deterministic logic.
- Never execute raw model output or allow retrieved content to expand authority.
- Bind approvals to the exact payload hash and policy version.
- Use idempotency keys and attempt lineage for every effect.
- Keep tests free of external credentials and network calls.
- Add negative tests for every authority or state transition feature.
- Do not weaken tests, authorization, or acceptance criteria to make CI pass.

## Required validation

Before handing off a change, run:

```bash
pnpm validate
docker compose config --quiet
```

Update `STATUS.md` with what actually works, commands run, known gaps, and the next
milestone. Record architectural decisions in `DECISIONS.md`.
