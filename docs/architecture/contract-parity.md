# Contract Parity and Precedence

The upstream ECC build package contains useful but non-equivalent artifacts. This
document prevents silent normalization.

## Precedence for v0

1. `packages/ecc-pack/workflows/contract.v0.yaml` — lifecycle, qualification,
   truth hierarchy, resolution, and learning.
2. `packages/ecc-pack/workflows/decision-graph.v0.yaml` — node orchestration.
3. `packages/ecc-pack/contracts/authority-matrix.v0.yaml` — capability grants and
   human gates. The CSV is presentation-only.
4. `packages/contracts/schemas/case.v0.schema.json` — provider-neutral boundary
   shapes.
5. Cross-record invariant code — semantics JSON Schema cannot express safely.
6. PostgreSQL SQL under `reference/migrations-pending-reconciliation` — reference
   only until PR2 reconciles and tests it.

## Known differences

- The workflow requires `verifying -> resolved -> learning_review`, while the
  decision graph's accepted N9 path reaches N10, whose entered state is
  `learning_review`; no node explicitly enters `resolved`.
- JSON Approval uses `more_evidence`; SQL uses `requested_evidence`.
- JSON ActionProposal requires `payload` and permits `executing`; SQL stores
  `preview` and `operation` and has a different status set.
- JSON Outcome uses `achieved`, `partially_achieved`, `not_achieved`, or
  `safely_rejected` plus a required `accepted` boolean. SQL uses a different status
  vocabulary and omits that boolean.
- IntelligenceReceipt fields differ materially between JSON and SQL.
- JSON requires case severity, while SQL permits null and some evaluation cases
  expect null severity.
- SQL enables row-level security but defines no policies.
- JSON Schema alone cannot enforce cross-collection approval, receipt,
  verification, or closure semantics.

PR2 must reconcile these differences through an explicit decision and executable
tests before converting the reference SQL into a migration. Do not edit the
upstream copies to hide drift.

## Activation status

ECC v0.1.0 is shadow/evaluation-only. Graph edges currently skip or reverse
declared states, including paths from `needs_review` back to `enriching`, from
`needs_review` directly to `executing`, and from `verifying` directly to
`learning_review`. The graph has no node that enters `ready`, `resolved`, or
`failed`. Activation must fail closed until a new reconciled version is reviewed.
