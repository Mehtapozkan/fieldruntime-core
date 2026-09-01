# Five-Minute Field Runtime Evaluation

This walkthrough demonstrates why an enterprise runtime must retain the complete
case—not merely return an AI answer.

## Boundary

Synthetic case. Simulated authority. No external writes. No production receipt.
Run it only on the documented loopback appliance.

## Start

Requirements: Node.js 24, pnpm 11, and Docker with Compose.

```bash
git clone https://github.com/Mehtapozkan/fieldruntime-core.git
cd fieldruntime-core
corepack enable
pnpm install --frozen-lockfile
pnpm fr init ecc --demo
pnpm fr up
```

Open <http://127.0.0.1:3210/>.

## The six-action story

1. **Open the decision.** Four synthetic sources describe one Acme Aero escalation.
   Slack and Linear say the fix shipped; current engineering state says it did not.
2. **Reveal authority.** The model can prepare options. Different consequences
   require different named people; no approval is recorded.
3. **Open Act & Verify.** Inspect the exact synthetic customer-update target,
   payload hash, and idempotency identity.
4. **Run the simulation.** The fixture connector reports success.
5. **Reveal safe recovery.** Independent read-back finds no customer update, so the
   runtime rejects the effect and keeps the authoritative case open. A bounded
   retry verifies only the exact simulated effect.
6. **Open the receipt.** Reconstruct evidence, recommendation, authority, payload,
   connector response, independent observation, rejection, recovery, and
   correction.

![Guided Workbench Act and Verify stage](../assets/guided-workbench-preview.svg)

## What this proves

- The answer is not the outcome.
- A connector acknowledgement is not verification.
- Authority follows the consequence, not the model.
- A failed effect remains visible and recoverable.
- The case can be reconstructed without trusting provider logs.

## What this does not prove

The preview does not provide production identity, live connectors, human approval,
external writes, high availability, or compliance certification. PR6 replaces the
guided authority and verification story with deterministic runtime controls while
keeping external writes off.
