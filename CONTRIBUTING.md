# Contributing to Field Runtime Core

Field Runtime Core is an Enterprise Case Runtime for consequential work. Keep every
change inside the product constitution and evaluation-only trust boundary.

## Before opening a pull request

1. Read `PRODUCT_SPEC.md`, `AGENTS.md`, `STATUS.md`, `DECISIONS.md`, `PLAN.md`, and
   `IMPLEMENT.md`.
2. Open or reference an issue for behavior that changes a contract, invariant, or
   milestone.
3. Keep the change small and independently reviewable.
4. Add a negative test for every authority, state-transition, scope, or effect
   boundary.
5. Run:

   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   pnpm validate
   docker compose config --quiet
   ```

## Non-negotiable boundaries

- Models and agents may propose; they never authorize.
- A connector response is not independent verification.
- External credentials and writes do not belong in the evaluation path.
- Provider SDKs do not cross the adapter boundary.
- PostgreSQL remains the canonical persistence target.
- Documentation must distinguish implemented behavior from planned behavior.

## Contribution license

Unless you explicitly state otherwise, a contribution intentionally submitted for
inclusion is licensed under Apache License 2.0, consistent with section 5 of that
license. Do not submit code, data, fixtures, or media you do not have the right to
license.

Synthetic fixtures only. Never submit customer data, secrets, private prompts, or
proprietary provider payloads.
