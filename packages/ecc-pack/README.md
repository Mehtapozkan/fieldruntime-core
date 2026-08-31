# Escalation and Commitment Control

Versioned workflow assets for the first Field Runtime Core evaluation pack.

- `workflows/contract.v0.yaml` defines qualification, truth hierarchy, states,
  approvals, rollout, stop conditions, resolution, and learning.
- `workflows/decision-graph.v0.yaml` defines the governed decision path.
- `evals/ecc.v0.jsonl` contains 30 synthetic evaluation cases.
- `fixtures/acme-sso-needs-review.case.json` is a canonical schema-valid case
  snapshot used by PR1 contract tests.

All actions are simulated. No file in this pack contains live credentials.
