# Field Runtime Core — Product Constitution

Status: frozen v0 product boundary  
Initial workflow pack: Escalation and Commitment Control (ECC)

## Promise

Increase an experienced operator's power to resolve consequential work.

No consequential customer escalation should lose context, ownership, authority,
or a commitment—and every verified resolution should improve the next similar
case.

## Product category

Field Runtime Core is an **Enterprise Case Runtime**. It is not a chatbot, generic
agent builder, workflow designer, company brain, model router, or replacement for
systems of record.

Its unit of work is a complete case: evidence, contradictions, participants,
commitments, decision options, authority, approvals, actions, verification,
outcome, corrections, receipts, and replay lineage.

## Trusted core

Field Runtime Core is authoritative for:

- Case identity, state, version, and immutable event history.
- Evidence provenance, freshness, scope, and truth hierarchy.
- Decision flow, policy evaluation, authority, and approvals.
- Action proposals, approved payloads, idempotency, and execution receipts.
- Commitments, independent verification, accepted outcomes, and closure.
- Corrections, evaluation cases, replay, and approved learning promotion.

Models, agent harnesses, memory systems, work surfaces, and connectors remain
replaceable adapters outside the trusted core.

## Invariants

1. Models and agents may propose; they never authorize.
2. Identity, scope, state transitions, authority, idempotency, and closure are
   deterministic and attributable.
3. A connector's success response is not verification. Verification requires an
   independent read-back or separately identified verifier.
4. A case is resolved only after the authorized action or no-action decision is
   complete, current source state is verified, commitments are owned or complete,
   an accepted outcome is evidenced, corrections are captured, and the audit is
   reconstructable.
5. Same-rank authoritative conflicts require human review; they are never silently
   resolved by a model.
6. Facts require evidence. Inferences and recommendations must be labeled.
7. External effects are deny-by-default, payload-bound, idempotent, and receipted.
8. Corrections append replayable lineage; they do not rewrite history.
9. Learning promotion requires evaluation, replay, named approval, versioning,
   scope, and rollback. It is never automatic in v0.
10. Provider payloads and SDK types do not cross the adapter boundary.

## v0 evaluation scope

- Self-hosted, single-node evaluation appliance.
- TypeScript modular monolith and PostgreSQL canonical persistence contract.
- Synthetic cases and deterministic replay with no external credentials.
- ECC as the only workflow pack.
- Fixture connector, mock providers, simulated actions, and independent fixture
  read-back.
- Human approval simulation for consequential actions.
- Receipts for intelligence, policy, approval, action, verification, and outcome.
- Thirty synthetic evaluation cases.
- Live external writes disabled and absent from the evaluation path.

## Explicit non-goals for v0

- Generic agent or workflow builders.
- A company-wide knowledge brain or unrestricted enterprise search.
- Multi-agent swarms or agent-to-agent commerce.
- SaaS multi-tenancy, SSO, SCIM, or production identity federation.
- Live Slack, CRM, ticketing, or memory-system credentials.
- Autonomous financial, contractual, security, privacy, compliance, roadmap, or
  customer-communication authority.
- Microservices, Kafka, or a graph database.
- Production, compliance, security-certification, or availability claims.

## First workflow: ECC

The workflow handles a strategic customer escalation with possible contractual or
commercial commitment. It qualifies the event, creates one canonical case,
assembles current truth, exposes conflicts and ownership gaps, prepares a decision
packet, determines required authority, records approval, simulates the exact
approved action, verifies source state independently, records the accepted outcome,
and turns correction into a replayable evaluation candidate.

## First-run experience target

The guided evaluation should take under twelve minutes and open directly into one
synthetic case:

1. **Case:** four sources and one visible contradiction.
2. **Decision:** three proposed actions and one authority exception.
3. **Act and verify:** one intentional silent connector failure caught by
   independent read-back.
4. **Receipt:** evidence, authority, action, verification, accepted outcome,
   correction, and optional changed-fact replay.

No signup, API key, chatbot, empty dashboard, or blank workflow builder precedes
the case.

## Graduation of authority

1. Synthetic and replay only.
2. Live read-only.
3. Staged writes with exact target and payload preview.
4. Human-authorized writes.
5. Narrow, reversible, preapproved authority only after representative and held-out
   evaluations pass.

Financial, contractual, security, privacy, compliance, roadmap, and material
customer commitments remain human-authorized.

## v0 definition of done

- A clean install runs without external credentials.
- The ECC case contract and every evaluation fixture validate.
- Unauthorized actions and cross-scope retrievals remain zero.
- Duplicate external effects remain zero.
- No unapproved action can execute.
- Resolution without independent verification and a receipt is impossible.
- A material correction can be replayed without mutating the original history.
- The entire case can be reconstructed from its journal and receipts.
- Documentation clearly separates implemented behavior from planned behavior.
