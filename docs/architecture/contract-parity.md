# Contract Parity and Precedence

The upstream ECC build package contains useful but non-equivalent artifacts. This
document prevents silent normalization.

## Precedence for v0

1. `packages/ecc-pack/workflows/contract.v0.yaml` — lifecycle, qualification,
   truth hierarchy, resolution, and learning.
2. `packages/ecc-pack/workflows/decision-graph.v0.yaml` — node orchestration.
3. `packages/ecc-pack/contracts/authority-matrix.v0.yaml` — capability grants and
   human gates. The CSV is presentation-only.
4. `packages/contracts/schemas/case.v0.schema.json` — provider-neutral Case
   boundary shapes.
5. `packages/contracts/schemas/case-journal-entry.v0.schema.json` — structural PR2
   journal boundary.
6. Runtime replay and engine-state integrity code — hash-chain, ordering,
   fingerprint, transition, projection, and index semantics the journal schema
   cannot prove.
7. Cross-record invariant code — semantics JSON Schema cannot express safely.
8. `packages/runtime/migrations/0001_local_appliance.sql` — lossless PR4
   persistence for the runtime contracts; it does not redefine their business
   vocabulary.
9. PostgreSQL SQL under `reference/migrations-pending-reconciliation` — upstream
   reference only until its normalized model is reconciled and tested.

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
- The runtime enforces source identity by tenant, source, and source-event ID. The reference
  SQL also makes the separate WorkEvent `id` a global primary key and has no column
  for the Case contract's required `source_timezone`.
- The reference SQL has no columns for the JSON contract's
  `effective_from_source_timezone`, `effective_to_source_timezone`, or
  `due_at_source_timezone` fields.
- JSON Schema alone cannot enforce cross-collection approval, receipt,
  verification, or closure semantics.

PR4 does not convert the drifted normalized reference SQL into an authoritative
migration. Instead, its event store preserves the validated Case and journal
documents losslessly in JSONB and adds relational identities, topology, and
append-only constraints required for atomic execution. Source timezone labels are
therefore retained without inventing a second business contract. The reference
SQL remains untouched and non-authoritative until every difference above has an
explicit reconciliation and executable conformance test; do not edit the upstream
copy to hide drift.

## Activation status

ECC v0.1.0 is shadow/evaluation-only. Graph edges currently skip or reverse
declared states, including paths from `needs_review` back to `enriching`, from
`needs_review` directly to `executing`, and from `verifying` directly to
`learning_review`. The graph has no node that enters `ready`, `resolved`, or
`failed`. Activation must fail closed until a new reconciled version is reviewed.
