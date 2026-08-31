# Activation Status

ECC v0.1.0 is imported as an immutable **shadow/evaluation-only** workflow pack.
It must not be activated for runtime execution yet.

Activation blockers:

- Several decision-graph edges do not conform to the workflow state transition
  contract.
- No graph node explicitly enters `ready`, `resolved`, or `failed`.
- A rejected learning candidate has no persistent terminal-state mapping.
- The authority CSV has no code legend or quorum semantics; the YAML is primary,
  and unknown or missing authority must deny.
- Several fixture expectations describe outcomes without the full verifier,
  evidence, receipt, reread, or audit tuple needed for runtime proof.
- JSON Schema and the reference PostgreSQL SQL require explicit reconciliation.

`tests/workflow.test.mjs` keeps these blockers visible. PR2 must introduce a new
version rather than mutating this imported baseline, then obtain explicit approval
before marking it active.
