# Guided Workbench Boundary

## D6-D persistent synthetic review

The default `/` view now connects to the existing D6-C authority API under Accepted
D-032. An explicit, idempotent action creates one synthetic Orchid Case and its
credit request. Packet, required approvals, history and current eligibility are
rendered from runtime responses. Submission binds the reviewed request hash and
C/R/S; a conflict requires explicit refresh and resubmission. The browser stores
only navigation and the exact pending command for an uncertain-response retry.

Reads never initialize the demo or invoke a write. PostgreSQL's existing read-only
snapshot remains the packet boundary. Decisions use the server-selected synthetic
seat, strict commands and current eligibility checks. No local flag, preview or
historical receipt can authorize an action. Eligible terminal interventions remain
available when another requirement is unresolved; a replacement starts at R0.
Retained evidence can be attached through Case commands to demonstrate C-version
invalidation without introducing a catalog editor or changing Case semantics.

The browser does not claim that consent bindings prove screen inspection. Approval
completion is shown as **execution unavailable**. Action Gateway, independent
runtime verification and closure proof remain unimplemented. No new runtime
contract, persistence aggregate or trust boundary is introduced by this adapter.

See the [Workbench walkthrough and checks](../../apps/admin/README.md).

## Legacy fixture simulation (`/?view=legacy`)

GitHub PR #5 made the existing evaluation appliance understandable without
granting new authority.

The browser loads two same-origin, immutable evaluation records:

- The canonical Acme Case fixture supplies evidence, conflicts, participants,
  commitments, decision options, targets, payloads, and declared hashes.
- The guided-walkthrough fixture supplies the synthetic failure, independent
  read-back, recovery, correction, and receipt-preview narrative.

`createGuidedWalkthroughRecord` validates both documents and binds every displayed
identity and hash before the API starts. The browser rechecks declared identities,
cross-record hash equality, and safety flags; it does not cryptographically
recompute response-body hashes. It closes the workbench if either record is
missing, unsafe, or drifted.

The workbench performs only two same-origin GET requests. Its six controls change
ephemeral browser presentation state; they do not call the case-command endpoint,
record approval, invoke an action gateway, mutate PostgreSQL, emit a production
receipt, or contact an external origin.

The first simulated attempt deliberately separates an adapter identity from an
independent verifier identity. The adapter reports success, the verifier reads no
matching customer update, and the walkthrough rejects that effect. The recovery
preserves attempt lineage and becomes accepted only inside the guided simulation
after the independent read-back matches. This effect-acceptance gate does not claim
that deployment was verified or that the case can close; the authoritative fixture
remains `needs_review`.

D6-C/D6-D add separate persistent synthetic requests and payload-bound approvals;
they never promote this fixture history. D7–D8 must supply authority envelopes,
an idempotent simulated effect ledger,
runtime-enforced independent verification, and reconstructable receipts. GitHub PR
#6 was the public evaluation-preview readiness change; it did not add those
controls. The PR #5 data is a replaceable work-surface adapter, not part of the
trusted core.
