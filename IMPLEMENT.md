# Implementation Protocol

## Change loop

1. State the behavior and invariant being changed.
2. Add or update the contract before implementation.
3. Add a failing positive test and at least one relevant negative test.
4. Implement the smallest deterministic behavior that passes.
5. Run `pnpm validate` and `docker compose config --quiet`.
6. Update `STATUS.md`; add a decision only when architecture or product intent
   changes.

## Boundaries

- `packages/domain` contains provider-neutral deterministic rules.
- `packages/contracts` owns JSON Schema boundary contracts.
- `packages/ecc-pack` owns the versioned ECC workflow, decision graph, fixtures,
  and evaluation cases.
- Deployable applications may depend on domain and contracts. Domain code must not
  depend on applications, providers, connectors, or SDKs.
- PostgreSQL migrations will be the only path for persistent schema changes.
- A future action gateway is the only component allowed to invoke connector writes.

## Definition of a receipt

A receipt is immutable evidence that a bounded step occurred. It identifies the
case, actor or service identity, input or payload hash, policy or workflow version,
timestamp, status, and provider or verifier where applicable. Logs are useful but
are not receipts.

## Definition of verification

Verification is an independent observation of resulting source state against the
accepted outcome contract. It must not reuse the action adapter's success response
as proof.

## Dependency policy

- Keep the dependency surface small and exact-pinned in the lockfile.
- No dependency may introduce network access into tests.
- Provider SDKs belong only in their adapter packages.
- Database, model, connector, and clock access must be injected behind interfaces.
