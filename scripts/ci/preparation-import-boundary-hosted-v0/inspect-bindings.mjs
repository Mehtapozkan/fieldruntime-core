import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [baselineRoot, candidateRoot, destination] = process.argv.slice(2);
const output = {};
for (const arm of ["baseline", "candidate"]) {
  const mod = (p) =>
    import(
      pathToFileURL(
        resolve(
          arm === "baseline" ? baselineRoot : candidateRoot,
          "dist/packages/runtime/src",
          p,
        ),
      )
    );
  const old = await mod("intake.js"),
    profile = await mod("preparation-worker-profile.js");
  const same = arm === "candidate" ? await mod("intake-values.js") : old;
  const measures =
    arm === "candidate"
      ? (await mod("preparation-work-measures.js")).WORK_MEASURES
      : profile.WORK_MEASURES;
  const bindings = Object.fromEntries(
    ["IntakeError", "requireIntake", "intakeObject", "intakeList"].map((n) => [
      n,
      old[n] === same[n],
    ]),
  );
  for (const match of Object.values(bindings)) assert.equal(match, true);
  const record = { value: "synthetic" };
  const valid = {
    object_reference_preserved: old.intakeObject(record) === record,
    list_member_reference_preserved: old.intakeList([record])[0] === record,
    empty_list: old.intakeList([]),
    true_require_returns_undefined:
      old.requireIntake(true, "UNUSED", "unused") === undefined,
  };
  const invalid = [];
  for (const [method, value] of [
    ["intakeObject", null],
    ["intakeObject", []],
    ["intakeObject", "record"],
    ["intakeList", {}],
    ["intakeList", [null]],
  ]) {
    let caught;
    try {
      old[method](value);
    } catch (e) {
      caught = {
        name: e.name,
        code: e.code,
        message: e.message,
        old_class_identity: e instanceof old.IntakeError,
        leaf_class_identity: e instanceof same.IntakeError,
      };
    }
    assert.ok(caught);
    invalid.push({ method, value, ...caught });
  }
  let custom;
  try {
    same.requireIntake(false, "EXACT_CODE", "Exact message");
  } catch (e) {
    custom = {
      name: e.name,
      code: e.code,
      message: e.message,
      old_class_identity: e instanceof old.IntakeError,
    };
  }
  assert.ok(custom);
  assert.equal(profile.WORK_MEASURES, measures);
  output[arm] = {
    binding_checks: bindings,
    valid,
    invalid,
    custom_require_error: custom,
    measures: {
      values: measures,
      shared_object: profile.WORK_MEASURES === measures,
      frozen: Object.isFrozen(measures),
      extensible: Object.isExtensible(measures),
      index_zero_writable: Object.getOwnPropertyDescriptor(measures, "0")
        .writable,
    },
    note:
      arm === "baseline"
        ? "Baseline public bindings; leaf module does not exist at baseline."
        : "Actual public/leaf binding identity comparisons.",
  };
}
for (const field of ["valid", "invalid", "custom_require_error", "measures"])
  assert.deepEqual(output.baseline[field], output.candidate[field]);
output.cross_arm_behavior_identical = true;
await writeFile(
  resolve(destination, "public/Binding-Equivalence.json"),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  "Baseline/candidate valid values, exact errors and array behavior match; candidate public/leaf class, function and array identities match. No workers started.",
);
