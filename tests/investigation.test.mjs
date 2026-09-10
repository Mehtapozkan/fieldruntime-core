import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as work from "../dist/packages/runtime/src/preparation-work.js";
import {
  assertValidPreparationWorkV3Contract,
  assertValidPreparationWorkV2Contract,
} from "../dist/packages/contracts/src/index.js";
const profile = JSON.parse(
  await readFile(
    new URL(
      "../packages/contracts/src/preparation-worker-profile.v3.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("D040 strict new profile has no live activation and old profiles cannot gain model capacity", () => {
  assertValidPreparationWorkV3Contract("profile", profile);
  assert.throws(() => assertValidPreparationWorkV2Contract("profile", profile));
  assert.throws(() =>
    assertValidPreparationWorkV3Contract("profile", {
      ...profile,
      investigation: { ...profile.investigation, live_activation: true },
    }),
  );
});
test("D040 optional implementation is explicit and deterministic remains the default", () => {
  assert.equal(typeof work.syntheticInvestigationContext, "function");
  assert.equal(
    work.syntheticContinuationContext().profile.implementation_id,
    "disposition-code.v3",
  );
  assert.equal(
    work.syntheticInvestigationContext().profile.investigation.mode,
    "hermetic_only",
  );
});
test("D040 held-out evaluation and rubric were frozen before prompt implementation", async () => {
  const base = new URL("../evaluations/investigation/v1/", import.meta.url);
  const sums = (await readFile(new URL("SHA256SUMS", base), "utf8"))
    .trim()
    .split("\n");
  for (const line of sums) {
    const [hash, name] = line.split("  ");
    assert.equal(
      createHash("sha256")
        .update(await readFile(new URL(name, base)))
        .digest("hex"),
      hash,
    );
  }
  const set = JSON.parse(await readFile(new URL("holdout.json", base), "utf8"));
  assert.equal(set.records.length, 24);
  assert.equal(new Set(set.records.map((r) => r.id)).size, 24);
  const rubric = JSON.parse(
    await readFile(new URL("rubric.json", base), "utf8"),
  );
  assert.equal(rubric.comparisons_run, false);
  assert.deepEqual(rubric.results, []);
});
