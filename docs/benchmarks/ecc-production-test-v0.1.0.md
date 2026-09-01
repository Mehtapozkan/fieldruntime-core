# Field Runtime Production Test — ECC v0.1.0

Status: reference evaluation foundation

Corpus: 30 synthetic Escalation and Commitment Control cases

External credentials and writes: none

## What this test proves

The test checks whether the deterministic ECC reference adapter can turn fragmented
case inputs into the expected qualification, ownership, conflict, evidence,
authority, state, commitment, closure, and learning decisions.

It evaluates the same case through two independent surfaces:

- Primary expected outcomes, such as owner, approvals, conflicts, and final state.
- Named behavioral assertions, including authority, isolation, grounding,
  idempotency, verification, and learning-safety sentinels.

Expected outcomes and assertions are removed from the subject before it crosses the
adapter boundary. A changed answer key therefore changes the score without changing
adapter behavior.

## Reference result

| Adapter                            | Cases |  Checks | Hard safety gates | Verdict  |
| ---------------------------------- | ----: | ------: | ----------------- | -------- |
| Field Runtime deterministic ECC v0 | 30/30 | 337/337 | Pass              | **Pass** |
| Answer-only negative control       |  0/30 | 152/337 | Fail              | **Fail** |

The negative control represents a system that treats every trigger as a case,
returns an answer, skips conflicts and approvals, writes immediately, and claims
resolution. Its purpose is to prove that the benchmark has a reachable failure
state. It scores 45.1% on individual checks but fails every case and the hard
safety gates.

## Hard gates

Any applicable failure in these assertions makes the run fail regardless of its
average score:

- Unauthorized action count
- Unauthorized retrieval count
- External writes in the no-write evaluation boundary
- Duplicate external effects
- Cross-customer evidence leakage
- Protected-data or secret exposure
- Source content changing policy
- Automatic or unapproved learning promotion

## Reproduce

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm eval:ecc -- --subject-version=<commit-sha>
```

Emit a machine-readable receipt:

```bash
corepack pnpm eval:ecc -- --json --subject-version=<commit-sha>
corepack pnpm eval:ecc -- --receipt=eval-receipt.json --subject-version=<commit-sha>
```

Run the negative control:

```bash
corepack pnpm eval:ecc -- --negative-control
```

The negative-control command exits nonzero by design.

## Receipt contract

Every run emits a versioned receipt containing:

- Adapter and evaluated subject version
- Start and completion time
- Per-case and per-check results
- Explicit hard-gate status
- Pass/fail verdict
- Deterministic SHA-256 receipt hash

The receipt must satisfy
`packages/ecc-pack/evals/production-test-receipt.v1.schema.json`.

## What this does not prove

This is an evaluation foundation, not an enterprise deployment benchmark.

- The cases are synthetic and committed in the same repository as the reference
  adapter.
- The gold answer is hidden at the runtime adapter boundary, but it is not an
  externally held-out dataset.
- Each category currently has one case, so the result does not establish
  statistical generalization.
- No model, live connector, human decision, durable database, action gateway, or
  independent verifier runs in this milestone.
- Resolution-time, handoff, intervention, commitment, and cost-per-accepted-outcome
  measures begin after their receipt-producing components exist.
- The evaluation harness has not yet received an independent adversarial audit.

The future public `fieldruntime-evals` repository should pin the exact Core
commit, add held-out and customer-authored cases, run multiple adapters on the same
bar, and publish both regressions and weak results.
