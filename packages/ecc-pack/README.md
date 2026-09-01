# Escalation and Commitment Control

Versioned workflow assets for the first Field Runtime Core evaluation pack.

- `workflows/contract.v0.yaml` defines qualification, truth hierarchy, states,
  approvals, rollout, stop conditions, resolution, and learning.
- `workflows/decision-graph.v0.yaml` defines the governed decision path.
- `evals/ecc.v0.jsonl` contains 30 synthetic evaluation cases.
- `src/production-test.ts` runs those cases through a gold-isolated adapter
  boundary and emits scored, hash-addressed receipts.
- `evals/production-test-receipt.v1.schema.json` is the machine-readable receipt
  contract.
- `fixtures/acme-sso-needs-review.case.json` is a canonical schema-valid case
  snapshot used by baseline contract tests.
- `fixtures/acme-sso-guided-walkthrough.v0.json` is the schema-bound, immutable
  presentation trace used by the PR5 workbench. It demonstrates a silent simulated
  connector failure and independent read-back without creating an authoritative
  case mutation or production receipt.

All actions are simulated. No file in this pack contains live credentials.

Run the Field Runtime Production Test:

```bash
corepack pnpm eval:ecc -- --subject-version=<commit-sha>
```

The reference deterministic adapter must pass every case and hard gate. The
committed answer-only negative control must fail:

```bash
corepack pnpm eval:ecc -- --negative-control
```

See `docs/benchmarks/ecc-production-test-v0.1.0.md` for methodology, results,
limitations, and reproduction instructions.
