# Five-Minute Field Runtime Evaluation

This is the **legacy Acme fixture walkthrough**. Its action, verification, outcome
and receipt screens illustrate the product contract; they do not call the runtime
action/verification APIs or retain human decisions. They never become authoritative
because newer APIs exist alongside them.

For the working persistent Orchid review, start with the
[current-source quick start](../../README.md#try-current-source) and
[Workbench walkthrough](../../apps/admin/README.md). The default page lets you
explicitly initialize the proposed $15,000 credit review, record Finance/Executive
decisions and reload canonical history. Execution controls remain unavailable.

## Start the legacy story

On the current appliance choose **Legacy action simulation**, or open
<http://127.0.0.1:3210/?view=legacy>. Opening either page creates no runtime history.
Use only the documented loopback appliance: synthetic case, simulated authority,
no external writes and no production receipt.

To reproduce the **published September 1 prerelease** instead, follow
[README's release-tag selection and fresh-volume instructions](../../README.md#distribution)
before using the historical installation guide. That version opens the Acme story by default and predates persistent D6 review and
D7 action/verification APIs. Merges to main do not update the release.

## The six-action story

1. **Open the decision.** Four synthetic sources describe one Acme Aero escalation.
   Slack and Linear say the fix shipped; current engineering state says it did not.
2. **Reveal authority.** The model can prepare options. Different consequences
   require different named people; no approval is recorded.
3. **Open Act & Verify.** Inspect the exact synthetic customer-update target,
   payload hash, and idempotency identity.
4. **Run the simulation.** The fixture connector reports success.
5. **Reveal safe recovery.** Independent read-back finds no customer update, so the
   guided simulation rejects the effect and leaves the fixture unchanged.
   A bounded retry verifies only the exact simulated effect.
6. **Open the receipt.** Reconstruct evidence, recommendation, authority, payload,
   connector response, independent observation, rejection, recovery, and
   correction.

![Guided Workbench Act and Verify stage](../assets/guided-workbench-preview.svg)

## What this demonstrates

- The answer is not the outcome.
- A connector acknowledgement is not verification.
- Authority follows the consequence, not the model.
- A failed effect remains visible and recoverable.
- The case can be reconstructed without trusting provider logs.

## What this does not prove

The legacy story cannot prove that a runtime decision, source effect, independent
check or accepted outcome occurred. Current main separately implements persistent
synthetic review and the bounded credit API; PR #24 adds independent verification
for review. [The API guide](simulated-credit-api.md) demonstrates those operations.
Workbench action/check controls remain pending, and complete Case closure stays
blocked. No path provides production authentication, real connectors, external
writes, customer-impact proof, recovered revenue or high-availability guarantees.

## Stop and clean up

Stop the containers while retaining the local evaluation database:

```bash
docker compose down
```

To delete the local evaluation database volume and start fresh next time:

```bash
docker compose down --volumes
```

Volume deletion is irreversible unless you made a backup. It affects only the
local evaluation appliance; this preview has no enterprise connectors or external
credentials.
