import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assertValidPreparationWorkContract } from "../dist/packages/contracts/src/index.js";
import * as pack from "../dist/packages/runtime/src/preparation-pack.js";
const example = JSON.parse(
  await readFile(
    new URL(
      "../docs/examples/d12-preparation-worker.proposed.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("D12 W3/W6 strict approved command envelopes reject client privileges and altered purposes", () => {
  for (const name of [
    "start_command",
    "task_review_command",
    "correction_example",
    "evaluation_review_command",
  ]) {
    const c = example[name];
    assertValidPreparationWorkContract("command", c);
    for (const field of [
      "actor",
      "authorized",
      "result",
      "policy",
      "worker_profile",
    ])
      assert.throws(() =>
        assertValidPreparationWorkContract("command", { ...c, [field]: true }),
      );
    assert.throws(() =>
      assertValidPreparationWorkContract("command", {
        ...c,
        expected_work_revision: -1,
      }),
    );
  }
});
test("D12 W3 a distinct worker-capable context exists while v1 keeps dispatch prohibited", () => {
  assert.equal(
    pack.PREPARATION_TEMPLATE.resource_limits.worker_dispatch,
    false,
  );
  assert.equal(
    typeof pack.syntheticWorkerPackContext,
    "function",
    "D12 worker-capable publication context is not implemented",
  );
});

import {
  syntheticWorkerProfile,
  workActor,
} from "../dist/packages/runtime/src/preparation-worker-profile.js";
test("D12 W3 purpose-specific canonical worker and human grants remain separate and fail closed", () => {
  const profile = syntheticWorkerProfile(),
    at = "2026-09-07T16:05:00.000Z";
  assert.equal(
    workActor(profile, "prepare_disposition_packet", at).identity_kind,
    "service",
  );
  assert.equal(
    workActor(profile, "review_preparation_task", at).identity_id,
    "identity_intake_operator",
  );
  assert.equal(
    workActor(profile, "review_synthetic_evaluation_candidate", at).identity_id,
    "identity_pack_reviewer_demo",
  );
  const duplicate = structuredClone(profile);
  duplicate.identities.push({ ...duplicate.identities[0] });
  workActor(duplicate, "prepare_disposition_packet", at);
  duplicate.identities.at(-1).status = "revoked";
  assert.throws(() => workActor(duplicate, "prepare_disposition_packet", at));
  const changed = structuredClone(profile);
  changed.grants[0].purpose = "review_preparation_task";
  assert.throws(() => workActor(changed, "prepare_disposition_packet", at));
  assert.throws(() =>
    workActor(
      profile,
      "prepare_disposition_packet",
      "2027-01-01T00:00:00.000Z",
    ),
  );
});
test("D12 W7 documented unknown proof note validates without pretending absent effort is zero", async () => {
  const note = JSON.parse(
    await readFile(
      new URL("../docs/examples/d12-proof-note.v1.json", import.meta.url),
      "utf8",
    ),
  );
  assertValidPreparationWorkContract("note", note);
  assert.equal(note.value, null);
  assert.equal(note.baseline_person_minutes, null);
  assert.equal(note.synthetic, true);
});
