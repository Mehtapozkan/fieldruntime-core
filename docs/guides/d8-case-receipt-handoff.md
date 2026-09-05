# D8-A Case progress and evidence receipt

D7 is merged in PR #25 at `f49dd71e3d1d8a393729690437d6f568b7473238`.
This review branch adds a read-only receipt within the existing **History** view.
It replaces the separate review/action history lists, without another ledger,
runtime contract, migration or authority rule. The proposed $15,000 credit is not
recovered revenue, saved money or proof of customer impact.

## Try the receipt

Use Node 24, pnpm 11.24.0 and Docker Compose on this PR's source:

```sh
pnpm install --frozen-lockfile
pnpm fr init ecc --demo
pnpm fr up
pnpm fr d7 enroll --demo
```

1. Open <http://127.0.0.1:3210/>. Explicitly **Start or reopen $15,000 review**.
   Follow the original Case's three preparation steps, then create a fresh request.
   Never reset existing history or transfer approvals from a changed Case.
2. Open **History**. Read the proposal and material uncertainty. Expand **Proposed
   work** for cited evidence and retained consent material, or **Human review** for
   the bound policy and canonical synthetic attribution.
3. **Open review and action controls**. Record Finance approval, then inspect the
   refreshed packet, explicitly select Executive and approve. Return to History
   to see which recorded decisions apply in the latest reconciled review.
4. Explicitly **Record simulated credit**, then **Check simulated source**. History
   shows the action and its own independent observation, including expected versus
   observed values. Expand stages for exact request/attempt bindings, identity and
   recorded time. Adapter acknowledgment is never verification.
5. Reload the receipt URL; the selected stage/request are navigation only. Restart
   the core with `docker compose restart core`, wait for `/readyz` to return ready,
   and refresh. The same records reconstruct from canonical PostgreSQL history.
6. Use **Changed evidence** to attach the retained update. Old approvals remain
   inspectable but no longer effective. A fresh request needs fresh consent.
   Earlier requests are linked; historical action and check evidence remains.

Opening, refreshing, expanding or revisiting the receipt performs no durable
writes. The link back to controls preserves the selected synthetic seat; it does
not authenticate a person. Separate reads can disagree during concurrent changes:
**Incomplete or stale view** preserves recorded evidence and asks for refresh,
without manufacturing current permission or silently resubmitting anything.
Equal timestamps do not establish order across separate journals.

## Screenshots

These are actual Chromium captures from the branch's served Workbench and real
PostgreSQL/API test fixtures, at 1440px desktop and 390px mobile. The immutable PR
commit containing these files associates the captures with that source; the PR
records its full final SHA and CI evidence. Fixed synthetic times are fixture data.
Each PNG is downloadable from its GitHub file page. No image is a design mockup.

| Recorded state                                  | Desktop                                                           | 390px                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Awaiting review                                 | [View](../assets/d8a/01-awaiting-review-desktop.png)              | [View](../assets/d8a/01-awaiting-review-mobile.png)              |
| Finance approved                                | [View](../assets/d8a/02-finance-approved-desktop.png)             | [View](../assets/d8a/02-finance-approved-mobile.png)             |
| Approvals complete                              | [View](../assets/d8a/03-approvals-complete-desktop.png)           | [View](../assets/d8a/03-approvals-complete-mobile.png)           |
| Credit recorded                                 | [View](../assets/d8a/04-credit-recorded-desktop.png)              | [View](../assets/d8a/04-credit-recorded-mobile.png)              |
| Independently checked                           | [View](../assets/d8a/05-independently-checked-desktop.png)        | [View](../assets/d8a/05-independently-checked-mobile.png)        |
| Mismatch; refresh unavailable                   | [View](../assets/d8a/06-mismatch-refresh-unavailable-desktop.png) | [View](../assets/d8a/06-mismatch-refresh-unavailable-mobile.png) |
| Changed evidence                                | [View](../assets/d8a/07-changed-evidence-desktop.png)             | [View](../assets/d8a/07-changed-evidence-mobile.png)             |
| Later inconclusive check                        | [View](../assets/d8a/08-later-inconclusive-desktop.png)           | [View](../assets/d8a/08-later-inconclusive-mobile.png)           |
| Independently loaded views disagree             | [View](../assets/d8a/09-inconsistent-reads-desktop.png)           | [View](../assets/d8a/09-inconsistent-reads-mobile.png)           |
| Unapproved replacement; earlier action retained | [View](../assets/d8a/10-unapproved-replacement-desktop.png)       | [View](../assets/d8a/10-unapproved-replacement-mobile.png)       |

The receipt preserves the existing cream/white layout. Summary stages retain the
proposal, uncertainty, attributed progress, source observation and next operator
action. Full technical evidence is expandable. Keyboard interaction checks cover
focus and Enter expansion, return to controls and reload. Captures are checked for
horizontal overflow; this is not a general accessibility audit or a Safari/Firefox
compatibility claim.

## Reproduce checks and captures

After `pnpm build` and `pnpm exec playwright install chromium`, use a disposable
local PostgreSQL test instance. Fixtures create/drop only their own isolated schemas:

```sh
D7_WORKBENCH_BROWSER=1 \
D7_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
D8_SCREENSHOT_DIR="$PWD/docs/assets/d8a" \
node --test scripts/simulated-credit-postgres.test.mjs
```

The suite retains D7 acceptance and extends the affected paths for read-only
receipt reconstruction, exact retry deduplication, replacement/history, changed
approvals, newer attempts, later inconclusive checks and confirmed evidence after
failed refresh. A real HTTP interleaving proves mixed Case/review reads remain
incomplete. Browser fault injection for unavailable reads exists only in the test
host; it is not an operator endpoint.

[STATUS](../../STATUS.md) and the implementation PR distinguish actual local tests
from final-head CI. Docker is unavailable in the local editing environment, so
Compose/container restart evidence must come from the required hosted appliance
job. PostgreSQL/API restart and Chromium checks run locally against real PostgreSQL.

## Remaining limits

This is an evidence receipt, not an accepted-outcome or economics receipt. Customer
impact, acceptance and Case closure remain unproven. No elapsed interval is called
processing time or savings; no labor, cost, ROI or autonomy figure is invented.
Requests are navigated through known request/predecessor/action references; this
is not an exhaustive request search or a cross-journal total-order ledger. A GET
is a snapshot, not a live subscription or current permission.

The legacy Acme fixture walkthrough stays separate from persistent Orchid. Current
source remains Apache-2.0; the published September 1 evaluation prerelease is a
historical version and is not updated by this PR. External writes, production
authentication, connectors, workers and remaining D8 work stay outside this change.
