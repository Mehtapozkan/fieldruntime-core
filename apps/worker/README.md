# Worker

In-process transactional services for the local appliance. There is deliberately
no queue or separately deployed background daemon in PR4.

`TransactionalCaseWorker` gives command-input failures a stable public taxonomy
and delegates accepted work to `PostgresCaseStore`. Bootstrap applies checksum-bound
migrations under a PostgreSQL advisory lock, loads the immutable ECC evaluation
fixture, and refuses changed migration or fixture identities. Readiness verifies
the exact migration and fixture hashes; the API also asks the store to hydrate and
validate all durable state plus the singleton writer lock.

`createGuidedWalkthroughRecord` validates the immutable PR5 presentation fixture
and binds every displayed evidence item, action, payload hash, authority role,
attempt, verifier, and trace reference to the canonical Acme evaluation fixture.
It is not persisted as authoritative case history.

The worker has no model, connector, credential, or external-write capability.
