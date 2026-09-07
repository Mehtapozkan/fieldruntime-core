# Guided Workbench

The existing white/cream Workbench connects persistent review to the bounded
simulated credit and independent-check APIs. D6, D7 and D8-A's read-only Case
progress and evidence receipt are merged. D8-B’s
[test-fixture failure walkthrough](../../docs/guides/d8-failure-walkthrough.md)
merged in PR #27. D8-C operator-attention presentation merged in PR #28.
[D9-A intake design](../../docs/architecture/d9-assisted-intake-boundary.md) is
Accepted for synthetic implementation; intake controls are not implemented yet.
Real customer activation remains unapproved.
Accepted [D-032](../../docs/architecture/d6-authority-request-lifecycle.md)
and [D-033](../../docs/architecture/d7-simulated-credit-verification.md) are unchanged.
Opening, refreshing or revisiting creates no durable records.

## Primary walkthrough

From the selected source, with Node 24, pnpm 11.24.0 and Docker Compose:

```sh
pnpm install --frozen-lockfile
pnpm fr init ecc --demo
pnpm fr up
pnpm fr d7 enroll --demo
```

Enrollment is explicit and idempotent. It installs the fixed synthetic operation
and verifier grants; it is not a catalog editor or production authentication.
For existing databases, read the [API migration and backup notes](../../docs/guides/simulated-credit-api.md).
Do not discard existing history to reset this demo.

1. Open <http://127.0.0.1:3210/> and choose **Start or reopen $15,000 review**.
   This idempotently creates the Orchid Case/request through the existing API.
2. For the original unprepared Case, use the three explicit **Prepare Case**
   steps (qualification, enrichment, review readiness). These change C and make
   older requests stale. Then **Create fresh $15,000 request**. A changed Case is
   never silently moved and no approvals transfer. If enrollment happened after
   review began, refresh and create a fresh request for the changed catalog too.
3. Inspect **Orchid / $15,000 proposed credit**, the customer report, retained
   conflicts and unknowns. The report does not independently establish customer
   impact or justify the amount. The bound policy requires named Finance plus
   Executive for credits above $10,000; Business and Finance delegate cannot fill
   those seats in this demo. “Why you?” explains the selected seat’s bound policy; the Case owner is
   separately recorded, not inferred from the required reviewer. Technical bindings,
   source URIs and the complete bound policy are expandable.
4. Record **Finance · synthetic seat / Approve**. The confirmed response triggers
   a read-only refresh: **Finance approved — Executive needed**. Finance's recorded
   approval is acknowledged; reject/modify/escalate remain available when permitted.
   Inspect the refreshed packet, explicitly select **Executive** and approve.
   The browser never switches reviewer automatically. R advances, C does not.
   Completed review collapses behind **Review or intervene**. Open it to inspect
   the recorded approval or choose a permitted reject, modify or escalate decision;
   the selected seat remains unchanged.
5. **Approvals complete; credit not recorded** is distinct from an effect. Choose
   **Record simulated credit**. The server recomputes authority against the exact
   displayed request and C/R/S; a previous read never grants execution permission.
6. **Simulated credit recorded; independent check needed** is not verification.
   Choose **Check simulated source**. A separate server-selected verifier reads the
   source independently of the adapter acknowledgment. Only an exact match becomes
   **Simulated credit independently checked**. The visible result still says that
   customer impact is unconfirmed and the Case remains unresolved.
7. Open **History → Case progress and evidence**. The five stages summarize proposal and
   uncertainty, attributed decisions, action, independent observation and remaining
   gaps. Expand any stage for retained evidence, canonical synthetic identity,
   bindings and recorded time. **Open review and action controls** returns to the
   existing controls without changing the selected reviewer.
8. Reload or reopen the receipt URL. The selected view is navigation only; decisions,
   action and checks reconstruct from PostgreSQL, including after appliance restart.
   Earlier requests are linked, and earlier attempts/checks remain historical.
   **Incomplete or stale view** means separate reads did not reconcile: refresh to
   inspect current state, without resubmitting or granting permission.

A modified proposal starts without approvals. The fixed operation supports only
Orchid's $15,000 credit; another proposal is reviewable but cannot execute through
this operation. A source slot already containing a credit prevents another credit.

## Decisions and interruptions

- **Reject**, **Modify** and **Escalate** require reasons; Modify also selects a
  different server-defined proposal. Terminal requests never revive. Whole-request
  eligibility does not suppress independently eligible terminal interventions.
- An execution conflict retains the submitted binding and explains the server's
  rejection. Refresh, inspect changes and explicitly consent again. No automatic
  rebase, resubmission, changed-Case transition or approval transfer occurs.
- An action/check timeout, lost response, 5xx or malformed acknowledgment is
  **unconfirmed**. Exact bytes and keys are saved **before** sending. Reload or
  reopen in the same browser profile, then **Retry exact command**. A duplicate
  returns its original receipt rather than recording another effect or check.
  Do not clear site storage while a response is uncertain. Separate pending-command
  records prevent another tab from overwriting an outstanding retry.
- A confirmed write followed by a failed GET retains its receipt and reports that
  current state could not be refreshed. It is not retried as an uncertain write.
  A newer confirmed attempt is shown with its own check; an older absence result
  cannot replace it when refresh fails. No receipt alone becomes current execution
  permission.
- **Last confirmed check: credit mismatch** leads with the check time and expected
  versus observed values, even when the following refresh fails. Refresh failure
  and unconfirmed current eligibility appear separately; historical evidence never
  grants permission. A later inconclusive check supersedes an earlier match.
  Retry-key mechanics, verifier selection and full receipts remain available under
  **Technical action and verification evidence**. Authoritative
  absence is distinct from an unavailable read. **Check inconclusive** explains
  unreadable, unavailable or changing evidence; it is never successful verification.
  **Check simulated source again** is a deliberate new check with a new key.
- Historical effects can be checked after approvals go stale or the request is
  rejected. The server checks current verifier eligibility separately from execution.
- **Record fresh simulated attempt** is offered only after the latest independent
  absence evidence for the latest invocation and current execution eligibility.
  A check never automatically retries a financial action. An occupied slot blocks
  another credit regardless of a previous absence result.

## Demonstrate changed evidence

After approval, open **Changed evidence** and choose **Attach evidence · invalidate
prior approvals**. This uses the retained operations update through Case commands.
The read-only refresh shows **Case changed — fresh review needed**; historical
approvals are no longer effective. Create a fresh request, inspect both retained
sources and collect fresh approvals. The update is attached once. If a credit
already exists, new review still cannot create a second credit; independent
verification of the earlier effect remains available.

## Implementation and boundary

`authority-client.js` handles the existing API, navigation and exact retries;
`credit-client.js` checks operation evidence and explicit command bindings;
`authority-workbench.js` renders them in the existing vanilla HTML/CSS layout.
Browser checks protect presentation; only the runtime authorizes and replays.
Local storage contains navigation/pending commands, not packets, authority flags
or accepted history. Reads have no writer locks, IDs, clock updates or previews.
All assets/requests remain same-origin under the existing no-inline CSP. There are
no new runtime contracts, endpoints, migrations, production browser dependencies,
external effects or authentication. Retained consent does not prove screen reading.

The **Legacy action simulation** link opens `/?view=legacy`, the separate Acme
fixture illustration. Its action/verification/outcome screens never enter Orchid's
runtime history. Simulated credit does not prove customer impact, acceptance,
recovered revenue or Case resolution. D8 economics and complete closure remain
unimplemented; legacy execution and incomplete-proof closure guards remain intact.

## Validation

`pnpm validate` retains the review/client and frozen ECC regressions. Real PostgreSQL
acceptance additionally runs the Workbench client through HTTP, checks read-only
snapshots, exact retries after restart, stale bindings and terminal historical checks.
The D7-D Chromium scenarios use the same API/assets and isolated PostgreSQL schemas;
fault injection exists only in the test host:

```sh
pnpm build
pnpm exec playwright install chromium
D7_WORKBENCH_BROWSER=1 \
D7_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
node --test scripts/simulated-credit-postgres.test.mjs
```

The database must be a local disposable test instance; tests create/drop only their
own randomly named schemas. To run only the new browser group, add
`--test-name-pattern='D7-D browser:'` before the filename. Optional
`D7_SCREENSHOT_DIR=/absolute/output/path` saves the action/control screenshots;
`D8_SCREENSHOT_DIR=/absolute/output/path` saves desktop/390px receipt screenshots.

The existing eight D6-D Playwright scenarios remain required via
`pnpm test:workbench`, against their own disposable appliance. CI installs Chromium,
runs real PostgreSQL/API and D7-D browser tests, then the retained Compose/appliance,
restart and D6-D browser groups. See [STATUS](../../STATUS.md) and the implementation
PR for final commit evidence and local limitations. [Desktop/390px visual handoff](../../docs/guides/d7-workbench-handoff.md).

[Case receipt walkthrough, screenshots and limits](../../docs/guides/d8-case-receipt-handoff.md)
covers the D8-A read-only presentation. Recorded elapsed intervals are not processing
time or savings; no economics or accepted-outcome proof is supplied.

## D8-C operator attention and visual review

This is one presentation pass over the existing validated projections (requirements
L2/P3). The proposal, material uncertainty, linked evidence, reviewer badges,
recorded action/check headings and five-stage History receipt already supplied the
milestones and remain. No duplicate progress component or completion percentage.
The generic **Why these reviewers** card is replaced by concise **Why you?** beside
the selected seat and expandable **Bound reviewer policy · historical consent**.

Use the primary walkthrough above. Finance approval leaves **Executive** as the next
reviewer without switching seats. Completed approvals expose the explicit credit
command while **Review or intervene** retains all permitted decisions. Record and
check are separate steps; even an independent match leaves impact, acceptance and
Case closure unproven. “Case owner” comes from reconciled Case/identity evidence;
unknown ownership is Unconfirmed. A required reviewer is not assigned ownership.
A denial belongs to its exact request and reviewed revisions. A fresh request or
later review revision shows its own required reviewers; earlier denials remain in
History and cannot hide that next action.

**Current information incomplete** means independently loaded views did not
reconcile. Earlier recorded decisions remain in History but cannot supply current
approval badges or reviewer/owner claims. A confirmed mismatch remains prominent
when refresh fails; inspect expected/observed evidence, then refresh current state.
An uncertain submission still recovers its original command with **Retry exact
command**. Reads, disclosures and seat selection cause no durable changes.

Before captures below are from main `1039912ca7eaea2239366f5de8c07b0e44c7df81`
(the merged reviewed D8-B source). After captures are from the D8-C implementation
in the commit containing these files; the PR records its full final SHA and CI.
Actual Chromium uses the appliance API/assets and isolated real PostgreSQL fixtures,
with fixed synthetic timestamps. Each PNG is downloadable from its GitHub file page.

| State                              | Desktop                                                                   | 390px                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Before: initial review             | [View](../../docs/assets/d8c/before-review-desktop.png)                   | [View](../../docs/assets/d8c/before-review-mobile.png)                   |
| Before: Finance approved           | [View](../../docs/assets/d8c/before-finance-desktop.png)                  | [View](../../docs/assets/d8c/before-finance-mobile.png)                  |
| After: initial review              | [View](../../docs/assets/d8c/01-review-desktop.png)                       | [View](../../docs/assets/d8c/01-review-mobile.png)                       |
| After: Finance approved            | [View](../../docs/assets/d8c/02-finance-approved-desktop.png)             | [View](../../docs/assets/d8c/02-finance-approved-mobile.png)             |
| After: approvals complete          | [View](../../docs/assets/d8c/03-approvals-complete-desktop.png)           | [View](../../docs/assets/d8c/03-approvals-complete-mobile.png)           |
| After: credit recorded             | [View](../../docs/assets/d8c/04-credit-recorded-desktop.png)              | [View](../../docs/assets/d8c/04-credit-recorded-mobile.png)              |
| After: independently checked       | [View](../../docs/assets/d8c/05-independently-checked-desktop.png)        | [View](../../docs/assets/d8c/05-independently-checked-mobile.png)        |
| After: mismatch and failed refresh | [View](../../docs/assets/d8c/07-mismatch-refresh-unavailable-desktop.png) | [View](../../docs/assets/d8c/07-mismatch-refresh-unavailable-mobile.png) |
| After: changed evidence            | [View](../../docs/assets/d8c/08-changed-evidence-desktop.png)             | [View](../../docs/assets/d8c/08-changed-evidence-mobile.png)             |
| After: inconsistent reads          | [View](../../docs/assets/d8c/09-inconsistent-reads-desktop.png)           | [View](../../docs/assets/d8c/09-inconsistent-reads-mobile.png)           |

To reproduce only the existing browser scenarios, after the documented build and
Chromium install, use the same disposable test database setup as above:

```sh
D7_WORKBENCH_BROWSER=1 \
D7_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
D7_SCREENSHOT_DIR="$PWD/d8c-captures" \
node --test --test-name-pattern='D7-D browser:' scripts/simulated-credit-postgres.test.mjs
```

The fixed test-host faults are not normal appliance endpoints. Tests assert the
full review/action/check/reopen story, retained mismatch, later inconclusive result,
newer denied attempt, mixed reads and exact uncertain retries. Keyboard assertions
cover reviewer → decision → submit, Enter disclosures, focus retention and unchanged
seat selection. Snapshots compare durable tables before/after read/expansion.
Inspection at 1440px and 390px confirms readable proposal, material uncertainty,
reviewer progress and controls without horizontal overflow. Mobile still requires
vertical scrolling. Final validation results are recorded in STATUS/PR; no
screen-reader, Safari/Firefox, real-user effectiveness or economic measurement is
claimed.
