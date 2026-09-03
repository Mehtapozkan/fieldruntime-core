# Five-Minute Field Runtime Evaluation

This walkthrough demonstrates why an enterprise runtime must retain the complete
case—not merely return an AI answer. The complete case keeps evidence, conflicts,
people, commitments, decision options, authority, actions, verification, outcomes,
corrections, and receipts together across a multiplayer workflow.

## Boundary

Synthetic case. Simulated authority. No external writes. No production receipt.
Run it only on the documented loopback appliance.

## Start

Requirements:

- Node.js 24.x and pnpm 11.x (Corepack may provide pnpm).
- Docker Engine or Docker Desktop with the Docker daemon running and Compose v2
  available through `docker compose`.
- Local ports `3210` and `5432` available.
- Permission to build images and start local containers.

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
   guided simulation rejects the effect and leaves the authoritative fixture open.
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

The preview does not provide production identity, live connectors, human approval,
external writes, high availability, or compliance certification. Deterministic
runtime authority, controlled action, independent verification, and receipt
controls are planned for D6–D8, not included in this preview. These Delivery labels
are not GitHub pull request numbers. GitHub PR #6 was the completed public
evaluation-preview readiness change.

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
