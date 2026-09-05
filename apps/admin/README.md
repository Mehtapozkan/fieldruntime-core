# Guided Workbench

D6-D connects the existing layout to the persistent synthetic authority API in
[Accepted D-032](../../docs/architecture/d6-authority-request-lifecycle.md).
Start the local appliance with `pnpm fr init ecc --demo` and `pnpm fr up`, then
open <http://127.0.0.1:3210/>. Opening the page creates nothing.

## Primary walkthrough

1. Choose **Start or reopen $15,000 review**. This explicit action idempotently
   creates `case_d6_workbench` through Case commands, then its authority request.
   It uses retained Orchid intake evidence, separate from the frozen Acme fixture.
2. Inspect the exact USD credit and customer reference, cited source content,
   provenance/hash, conflicts, unknowns and recommendation. Expand **Exact request
   binding** for the request ID/hash and policy reference. C, R and S are visible.
3. Select **Finance · synthetic seat** and **Approve**, then record the decision.
   The historical receipt appears; further decisions require **Refresh packet**.
4. Refresh and inspect Finance's recorded approval. Select **Executive · synthetic
   seat**, approve, then refresh. The packet says **Approvals complete — execution
   unavailable**. C stays unchanged and R advances from 0 to 1 to 2.
5. Reload the browser and open **Review history**. The same request, decisions,
   immutable consent material and retained evaluation evidence reconstruct from
   PostgreSQL. The request URL is also a read-only revisit link.

Synthetic seats select server-enrolled identities; this is not authentication.
The default large-credit policy requires named Finance plus Executive. Selecting
Business or Finance delegate does not make that seat eligible for this request.
Execution and Case closure remain unavailable even after both approvals.

## Decisions and interruptions

- **Reject**, **Modify** and **Escalate** require a reason. Modify also selects a
  different server-defined credit proposal. Its receipt/history links to an atomic
  replacement at R0, with no transferred approvals. Terminal history never revives.
- An open request's whole-route `current.eligible` does not gate every reviewer.
  The server independently decides whether the chosen seat may intervene, including
  when another authority requirement is unresolved.
- A submission binds the exact displayed request hash, C/R/S and request correlation
  ID. Conflicts explain the changed Case, review or catalog revision. Refresh and
  deliberate resubmission are required; no approval is silently rebased.
- A timeout, lost response, 5xx or malformed success is **unconfirmed**. The original
  command bytes, seat and idempotency key are saved before sending. Reload then
  **Retry exact command** recovers the historical receipt without another vote.
  Do not clear the tab's session storage while a command is unconfirmed. Closing
  the tab may lose retry information; the server's committed history remains.
- Packet reads may fail or become stale after evaluation. The prior view is labeled
  unconfirmed and cannot submit until a successful refresh. The server rechecks
  current eligibility at submission regardless of any previous read.

## Demonstrate changed evidence

After both approvals, open **Changed evidence** and choose **Attach evidence ·
invalidate prior approvals**. This submits the retained synthetic operations
update through the existing Case-command API. Refresh: C advances, the old request
reports `stale_case`, and its historical approvals are no longer effective. Choose
**Create fresh $15,000 request**, inspect both cited sources and collect both
approvals again. The update is attached once; the demonstration never rewrites or
deletes Case history. Retrying initialization also preserves existing history.

## Boundary and implementation

`authority-client.js` manages API calls, presentation checks, navigation and exact
retries. `authority-workbench.js` renders server packets using the existing vanilla
HTML/CSS layout. No browser reducer grants authority. Session storage contains only
request navigation and a pending command, never a packet, accepted receipt or
authorization flag. Reads use only existing GET endpoints; they do not initialize
the demo, persist previews, reserve IDs, update clocks or acquire the writer lock.

The server validates v1 contracts and reconstructs canonical evidence. Browser
response checks protect presentation; they are not cryptographic verification or a
replacement for server authorization. All assets and requests stay same-origin
under the existing no-inline CSP. There are no production browser dependencies,
new endpoints, contracts, migrations, catalog editor or external effects.

Packet acceptance checks that lifecycle, C/S/time, authorization/eligibility flags,
resolver outcome/reasons, requirement counts and recorded effective approvals agree.
Contradictory projections fail closed instead of displaying completed approvals.

**Last response · historical receipt** is separate from current eligibility.
Retaining consent bindings does not prove that a human read the screen.

## Legacy simulation

**Legacy action simulation** opens `/?view=legacy`: the original Acme Case →
Decision → Act & Verify → Receipt walkthrough. It retains its immutable fixtures,
six local presentation actions and explicit non-authoritative labels. It records
no approval and its simulated effects/receipts never enter persistent review.
The home link returns to the persistent experience.

## Verification

`pnpm validate` includes client/API regressions for initialization, exact binding,
refresh, reload, terminal decisions, eligibility and uncertain retries. The explicit
PostgreSQL suite additionally executes the client against real HTTP transactions,
compares every durable table and emitted-ID count around reads, and verifies
restart/retry after a lost commit acknowledgement.

Run Chromium against a **separate disposable appliance** after build/start:

```sh
pnpm exec playwright install chromium
pnpm test:workbench
```

The seven browser tests run once against a database that has not run this Workbench
demo; they intentionally retain its Case/history. They cover the primary flow,
reload, concurrent reviewers, uncertain responses, terminal interventions,
replacement, changed evidence, ineligible seats and unsafe responses. Use a separate
instance for another full run; do not delete existing data to reset it. CI installs
the browser driver and runs independent scenario groups against fresh CI-owned
Compose volumes, with the primary approval/reload/evidence-change story kept
together. This prevents unrelated fixtures from accumulating whole-history replay
cost; it does not assert scalability. All seven browser scenarios, existing
appliance checks and frozen ECC checks remain required. Playwright is a development
dependency.
