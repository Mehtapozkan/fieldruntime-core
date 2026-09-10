import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  validateDisputeReceipt,
  draftDisputeCommand,
  disputeHistory,
  intakeHash,
} from "../apps/admin/public/intake-client.js";
import { assertValidDisputeResultContract } from "../dist/packages/contracts/src/index.js";
const example = JSON.parse(
  await readFile(
    new URL("../docs/examples/d039-runtime-receipts.json", import.meta.url),
  ),
);
test("Result presentation validates retained real receipts; altered commands, actor and proof fail closed", async () => {
  for (const receipt of Object.values(example.receipts)) {
    await validateDisputeReceipt(receipt, receipt.entry.command);
    const altered = structuredClone(receipt);
    altered.entry.data.kind = "accept";
    if (receipt.entry.operation !== "accept")
      await assert.rejects(
        validateDisputeReceipt(altered, receipt.entry.command),
      );
    const wrongActor = structuredClone(receipt);
    wrongActor.entry.actor.identity_id = "identity_intake_operator";
    const body = structuredClone(wrongActor.entry);
    delete body.hash;
    wrongActor.entry.hash = await intakeHash(body);
    await assert.rejects(
      validateDisputeReceipt(wrongActor, receipt.entry.command),
    );
    const command = structuredClone(receipt.entry.command);
    command.binding.record_key = "sha256:" + "f".repeat(64);
    await assert.rejects(validateDisputeReceipt(receipt, command));
  }
});
test("Result command preparation pins exact record/review/observation; caller role/success inputs are not copied", async () => {
  const d = example.receipts.no_action.entry,
    check = example.receipts.independent_match.entry,
    accept = example.receipts.accept.entry;
  const v = {
    binding: accept.command.binding,
    candidate_hash: accept.command.candidate_hash,
    history: [d, check],
    authority: {
      ...d.command.review,
      review_revision: d.command.review.expected_review_revision,
      material: { basis: d.data.basis },
    },
  };
  const fields = {
    reason: "Explicit synthetic consent",
    due_at: "2026-09-08T16:06:00.000Z",
    identity: "caller",
    authorized: true,
  };
  for (const operation of ["no_action", "result_check", "accept"]) {
    const c = await draftDisputeCommand(v, operation, fields, "key-original");
    assertValidDisputeResultContract("command", c);
    assert.deepEqual(c.binding, v.binding);
    assert.equal(c.identity, undefined);
    assert.equal(c.authorized, undefined);
    assert.equal(c.idempotency_key, "key-original");
    if (operation === "accept") {
      assert.equal(c.observation_hash, check.hash);
      assert.equal(c.decision_hash, d.hash);
    }
  }
  const next = { ...v, candidate_hash: "sha256:" + "e".repeat(64) };
  assert.deepEqual(disputeHistory(next), []);
  assert.equal(
    (await draftDisputeCommand(next, "result_check", {}, "new-key"))
      .decision_hash,
    undefined,
  );
});
