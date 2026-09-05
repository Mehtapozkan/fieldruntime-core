# D7-D visual handoff

The captures below come from the actual Workbench served by the appliance API and
an isolated **real PostgreSQL** database. They use the fixed synthetic test clock
`2026-09-06T16:00:00.000Z`. The implementation PR description associates these files
with its exact head commit. They are source-review artifacts, not a release or
proof of a real credit, customer impact or Case resolution.

[Executable operator walkthrough](../../apps/admin/README.md): explicit enrollment
→ initialize Orchid → prepare the original Case → fresh request → Finance approval
→ Executive approval → record simulated credit → check simulated source → reload.

| State                                                            | Desktop (1440px)                                                  | Mobile (390px)                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Proposed credit, uncertainty and initial review controls         | [View](../assets/d7d/01-review-desktop.png)                       | [View](../assets/d7d/01-review-mobile.png)                       |
| Finance recorded; Executive needed                               | [View](../assets/d7d/02-finance-approved-desktop.png)             | [View](../assets/d7d/02-finance-approved-mobile.png)             |
| Approvals complete; credit not recorded                          | [View](../assets/d7d/03-approvals-complete-desktop.png)           | [View](../assets/d7d/03-approvals-complete-mobile.png)           |
| Simulated action recorded; independent check needed              | [View](../assets/d7d/04-credit-recorded-desktop.png)              | [View](../assets/d7d/04-credit-recorded-mobile.png)              |
| Independent source match; impact unconfirmed and Case unresolved | [View](../assets/d7d/05-independently-checked-desktop.png)        | [View](../assets/d7d/05-independently-checked-mobile.png)        |
| Unavailable source read; check inconclusive                      | [View](../assets/d7d/06-inconclusive-desktop.png)                 | [View](../assets/d7d/06-inconclusive-mobile.png)                 |
| Confirmed absence mismatch; subsequent refresh unavailable       | [View](../assets/d7d/07-mismatch-refresh-unavailable-desktop.png) | [View](../assets/d7d/07-mismatch-refresh-unavailable-mobile.png) |
| Changed evidence; approvals stale and fresh consent needed       | [View](../assets/d7d/08-changed-evidence-desktop.png)             | [View](../assets/d7d/08-changed-evidence-mobile.png)             |
| Different observed amount; retained mismatch                     | [View](../assets/d7d/09-wrong-amount-desktop.png)                 | [View](../assets/d7d/09-wrong-amount-mobile.png)                 |

The seven D7-D Chromium scenarios exercise the full journey, reopening with exact
pending bytes/keys, historical verification after rejection, source absence and
explicit financial retry, newer confirmed attempts during failed refresh, changed
evidence, unavailable reads and a different
observed amount. Fault injection is confined to the test host. The existing eight
D6-D scenarios retain keyboard focus/order, stale submission, concurrent review,
terminal/replacement, ineligible-seat and failed-refresh coverage. All reads remain
free of durable changes.

Visual inspection checks the proposal, uncertainty, reviewer progress and control
labels at desktop and 390px. Technical IDs/hashes/source URIs remain expandable.
Disabled controls are visibly muted; recorded approvals are acknowledged without
removing permitted interventions. On mobile, reviewer and decision fields share a
row and predecessor navigation sits in History. Some scrolling remains; this is
one existing Case experience, not a multi-case dashboard.

Only Chromium was exercised here. No Safari/Firefox, screen-reader audit,
production authentication, real connector or external action is claimed. Docker
is unavailable locally; container/Compose evidence belongs to the PR's required CI.
Use [STATUS](../../STATUS.md) and the PR checks for validation evidence.
