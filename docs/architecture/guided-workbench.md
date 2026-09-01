# Guided Workbench Boundary

PR5 makes the existing evaluation appliance understandable without granting new
authority.

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

PR6 must replace these presentation observations with deterministic authority
envelopes, payload-bound approvals, an idempotent simulated effect ledger, and
runtime-enforced independent verification. The PR5 data is a replaceable work
surface adapter, not part of the trusted core.
