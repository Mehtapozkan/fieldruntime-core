# Guided Workbench

The existing white/cream Workbench connects persistent review to the bounded
simulated credit and independent-check APIs. D6, D7 and D8-A's read-only Case
progress and evidence receipt are merged. This D8-B review branch adds only the
[test-fixture failure walkthrough](../../docs/guides/d8-failure-walkthrough.md).
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
   those seats in this demo. Technical bindings and source URIs are expandable.
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
