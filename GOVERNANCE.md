# Governance

Field Runtime Core is governed as an Apache-2.0 evaluation project. Its purpose is
to increase an experienced operator's power to resolve consequential work while
keeping authority, verification, and learning governed.

This document governs the official repository. The Apache License 2.0 gives
everyone the rights stated in that license, including the right to fork; project
governance does not reduce those rights.

## Roles and responsibility

- **Contributors** report problems, propose changes, review work, and submit pull
  requests.
- **Maintainers** protect the product constitution, security boundary, license,
  release integrity, and quality of the official repository. Current maintainers
  are listed in [MAINTAINERS.md](MAINTAINERS.md).
- **The repository owner** appoints maintainers, resolves governance questions,
  approves releases, and has final responsibility for merge and repository
  settings.

`CODEOWNERS` requests review; it does not grant authority outside this governance
policy or guarantee that a change will be merged.

## How proposals become decisions

1. Open a proposal issue that states the problem, affected users, intended
   outcome, alternatives, and evidence that would show success.
2. Identify any effect on the product constitution, authority model, security
   boundary, public contract, licensing, or current milestone.
3. A maintainer may accept the proposal for implementation, request changes,
   defer it, or close it as out of scope. Acceptance of an idea is not acceptance
   of a particular implementation.
4. Submit a focused pull request linked to the proposal. Changes to product intent
   or architecture require an explicit decision record and human approval.
5. Maintainers merge only after required review and validation pass. Material
   decisions should leave a public rationale in the issue, pull request, or
   `DECISIONS.md`.

The [delivery plan](PLAN.md) describes intent, not a promise of scope or timing.
Maintainers may reorder work to address safety, integrity, licensing, or release
risks.

## Review and response expectations

Review is best effort and has no service level. Silence does not mean approval. If
a well-scoped issue has no response after 14 days, one concise follow-up is
reasonable. Maintainers evaluate product fit, boundary safety, tests, evidence,
maintainability, and effect on users; popularity alone does not determine a
decision.

## Conflicts and reconsideration

Participants must disclose a material personal, financial, or organizational
conflict relevant to a proposal or review. A conflicted maintainer should recuse
when another maintainer can decide. While the project has only one available
maintainer, the conflict should be recorded and independent review sought when
practical; final repository responsibility remains with the owner.

A contributor may request reconsideration once in the original thread by adding
new evidence or identifying a factual or process error. Repetition, private
lobbying, or harassment is not an appeal process.

Security and conduct reports follow [SECURITY.md](SECURITY.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), not the public proposal process.
