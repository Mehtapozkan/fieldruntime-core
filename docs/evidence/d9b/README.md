# D9-B visual handoff

These captures come from Chromium against the real local PostgreSQL/API fixture,
using the synthetic files in this branch. They capture implementation head `fa928ab0b5718f9c9311da6e72696fee97fa29e8`;
the later invalid-row reconciliation fix does not change these layouts. The PR
records the final validated source commit. Reproduce with:

```sh
D9_SCREENSHOT_DIR=docs/evidence/d9b \
D9_POSTGRES_URL=postgresql://fieldruntime:local-evaluation-only@127.0.0.1:5432/fieldruntime \
  node --test scripts/intake-browser.test.mjs
```

| State                            | Desktop / 390px capture                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Explicit preparation             | [Desktop initial](desktop-initial.png)                                             |
| Reviewed target and exact commit | [Desktop](desktop-review.png), [390px](mobile-review.png)                          |
| Lost response / exact recovery   | [390px uncertain](mobile-uncertain.png), [recovered receipt](mobile-committed.png) |
| Reconstructed history            | [Desktop after restart](desktop-reconstructed.png)                                 |
| Stale consent                    | [390px conflict](mobile-stale.png)                                                 |

The desktop and 390px review captures were visually inspected: reported amount,
entity, missing occurrence/delivery evidence, target, reason and explicit commit
remain readable; source bindings are expandable. Browser assertions check no
horizontal overflow, focus/keyboard navigation, deliberate writes, stale inspection,
reload/restart and exact lost-response recovery. A mobile navigation overlap found
in the first capture was corrected before these final captures.

This is a synthetic evaluation, not a screen-reader audit, Safari/Firefox test or
new-user effectiveness study. Longer source/history content still requires scrolling.
No customer result, saved effort, automatic completion or current permission is
inferred from a retained receipt. See the [walkthrough](../../guides/synthetic-intake.md).
