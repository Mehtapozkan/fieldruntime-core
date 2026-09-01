# Contributing to Field Runtime Core

Field Runtime Core is an Enterprise Case Runtime for consequential work.
Contributions are welcome when they preserve the product constitution and the
evaluation-preview trust boundary.

## Before you start

1. Read `PRODUCT_SPEC.md`, `AGENTS.md`, `STATUS.md`, `DECISIONS.md`, `PLAN.md`, and
   `IMPLEMENT.md`.
2. Search existing issues and choose the closest issue form. Do not file a public
   issue for a vulnerability or sensitive conduct report.
3. Open or reference a proposal before changing a contract, invariant,
   architecture decision, public boundary, or milestone. Wait for maintainer
   direction before investing heavily in a material change.
4. Disclose any personal, financial, or organizational conflict relevant to the
   proposal or review.

The review process and decision authority are defined in
[GOVERNANCE.md](GOVERNANCE.md). Review and support are best effort; a proposal or
pull request has no guaranteed response or merge timeline.

## Pull requests

- Link the issue or explain why the change is self-contained.
- Describe the observable outcome, not only the files changed.
- Keep the change small and independently reviewable.
- Add a negative test for every authority, state-transition, scope, or effect
  boundary.
- Update documentation and decision records when behavior or architecture changes.
- Separate implemented behavior from planned behavior and state remaining gaps.
- Respond to review without rewriting or hiding discussion history.

Run before requesting review:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate
docker compose config --quiet
```

If Docker is unavailable, say so explicitly and provide the validation that did
run. CI evidence does not turn the evaluation preview into production software.

## Non-negotiable boundaries

- Models and agents may propose; they never authorize.
- A connector response is not independent verification.
- External credentials and writes do not belong in the evaluation path.
- Provider SDKs do not cross the adapter boundary.
- PostgreSQL remains the canonical persistence target.
- Documentation must distinguish implemented behavior from planned behavior.

## Contribution license and data

Unless you explicitly state otherwise, a contribution intentionally submitted for
inclusion is licensed under Apache License 2.0, consistent with section 5 of that
license. Do not submit code, data, fixtures, trademarks, or media you do not have
the right to license.

Use synthetic fixtures only. Never submit customer data, secrets, credentials,
private prompts, personal information, or proprietary provider payloads. By
submitting a pull request, you represent that you have the right to submit its
contents under the stated contribution terms.
