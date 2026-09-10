# Same-dispute Workbench: captured review evidence

Actual Chromium screenshots from `scripts/dispute-result-browser.test.mjs` against
disposable PostgreSQL 18.4/API fixtures, generated from this PR's implementation tree.
The final commit association and final-head CI are in the PR description. No mockup,
image generation or source-state editor was used. Viewport captures use 1440×1000
and 390×844; controls captures show the complete existing control group at that width.
The complete page captures are also supplied in the downloadable handoff.

Only the first two rows use the normal shipped source. The first has both retained
D-038 preparation packets and separate task acceptance. Other rows isolate result
states with the supported test host; their explicit “No prepared packet” message is
accurate, not a missing result carried over from another record. A matched test fixture
is not available via a normal appliance success toggle and is not customer evidence.

| State                                                  | Desktop                                           | 390px                                            | Narrow controls                                      |
| ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Actual prepared work; deliberate enrollment            | [View](prepared-work-1440-viewport.png)           | [View](prepared-work-390-viewport.png)           | [Controls](prepared-work-390-controls.png)           |
| Shipped source: mismatch; acceptance unavailable       | [View](normal-source-mismatch-1440-viewport.png)  | [View](normal-source-mismatch-390-viewport.png)  | [Controls](normal-source-mismatch-390-controls.png)  |
| Disposable matched-source fixture; separate acceptance | [View](accepted-result-1440-viewport.png)         | [View](accepted-result-390-viewport.png)         | [Controls](accepted-result-390-controls.png)         |
| Newest confirmed mismatch retained after GET failure   | [View](mismatch-refresh-failed-1440-viewport.png) | [View](mismatch-refresh-failed-390-viewport.png) | [Controls](mismatch-refresh-failed-390-controls.png) |
| Unavailable source; unknown result                     | [View](inconclusive-result-1440-viewport.png)     | [View](inconclusive-result-390-viewport.png)     | [Controls](inconclusive-result-390-controls.png)     |
| Expired authority; acceptance is historical            | [View](stale-acceptance-1440-viewport.png)        | [View](stale-acceptance-390-viewport.png)        | [Controls](stale-acceptance-390-controls.png)        |
| Reliable reversal followed by explicit reopening       | [View](reopened-result-1440-viewport.png)         | [View](reopened-result-390-viewport.png)         | [Controls](reopened-result-390-controls.png)         |

Inspected: readable proposal, actual unsent request, uncertainty, expected/observed
comparison, source-check time, current next action and payment owner/due commitments.
The narrow view wraps without horizontal overflow; its direct next-action link reaches
controls without traversing the entire comparison. Supporting sources and all historical
receipts remain expandable. Keyboard checks exercised the skip link, Tab movement,
Enter on the draft disclosure and the next-action anchor. No Safari, screen-reader,
assistive-technology certification or customer usability study is claimed.

[Executable walkthrough](../../guides/dispute-result-workbench.md).
Reproduce with its build/PostgreSQL commands and `D039_UI_SCREENSHOTS`.
Hashes in [SHA256SUMS](SHA256SUMS) bind the unedited PNGs here. Browser rendering is
platform-dependent; screenshot byte equality is not an authority/replay assertion.
