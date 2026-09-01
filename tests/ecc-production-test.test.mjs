import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  AnswerOnlyNegativeControl,
  DeterministicEccAdapter,
  parseEvaluationCases,
  runProductionTest,
} from "../dist/packages/ecc-pack/src/production-test.js";

const read = async (path) =>
  readFile(
    new URL(`../packages/ecc-pack/evals/${path}`, import.meta.url),
    "utf8",
  );

const cases = parseEvaluationCases(await read("ecc.v0.jsonl"));
const fixedClock = () => new Date("2026-09-01T00:00:00.000Z");

test("the deterministic ECC adapter passes the 30-case Production Test", () => {
  const receipt = runProductionTest(cases, new DeterministicEccAdapter(), {
    now: fixedClock,
    subjectVersion: "test-subject",
  });

  assert.equal(receipt.verdict, "pass");
  assert.equal(receipt.hard_gates_passed, true);
  assert.equal(receipt.total_cases, 30);
  assert.equal(receipt.passed_cases, 30);
  assert.equal(receipt.failed_cases, 0);
  assert.equal(receipt.score, 1);
  assert.ok(receipt.total_checks > 250);
  assert.match(receipt.receipt_hash, /^sha256:[a-f0-9]{64}$/);
});

test("the answer-only negative control fails loudly and trips hard gates", () => {
  const receipt = runProductionTest(cases, new AnswerOnlyNegativeControl(), {
    now: fixedClock,
    subjectVersion: "negative-control",
  });

  assert.equal(receipt.verdict, "fail");
  assert.equal(receipt.hard_gates_passed, false);
  assert.ok(receipt.failed_cases > 20);
  assert.ok(receipt.score < 0.5);
});

test("the adapter boundary does not expose expected outcomes or assertions", () => {
  const delegate = new DeterministicEccAdapter();
  let inspected = 0;
  const boundaryProbe = {
    name: "boundary-probe",
    evaluate(subject) {
      inspected += 1;
      assert.equal("expected" in subject, false);
      assert.equal("assertions" in subject, false);
      assert.ok(Object.isFrozen(subject));
      assert.ok(Object.isFrozen(subject.input.records));
      return delegate.evaluate(subject);
    },
  };

  const receipt = runProductionTest(cases, boundaryProbe, {
    now: fixedClock,
  });
  assert.equal(inspected, 30);
  assert.equal(receipt.verdict, "pass");
});

test("a changed gold expectation fails without changing adapter behavior", () => {
  const changed = structuredClone(cases);
  changed[0].expected.owner = "user_wrong";

  const receipt = runProductionTest(changed, new DeterministicEccAdapter(), {
    now: fixedClock,
  });
  const first = receipt.case_results[0];

  assert.equal(receipt.verdict, "fail");
  assert.equal(first.passed, false);
  assert.ok(
    first.checks.some(
      ({ name, passed }) => name === "expected.owner" && passed === false,
    ),
  );
});

test("Production Test receipts satisfy the committed receipt schema", async () => {
  const schema = JSON.parse(
    await read("production-test-receipt.v1.schema.json"),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const receipt = runProductionTest(cases, new DeterministicEccAdapter(), {
    now: fixedClock,
    subjectVersion: "test-subject",
  });

  assert.equal(
    validate(receipt),
    true,
    JSON.stringify(validate.errors, null, 2),
  );
});

test("receipt hashes are deterministic for the same subject and clock", () => {
  const first = runProductionTest(cases, new DeterministicEccAdapter(), {
    now: fixedClock,
    subjectVersion: "same",
  });
  const second = runProductionTest(cases, new DeterministicEccAdapter(), {
    now: fixedClock,
    subjectVersion: "same",
  });
  const changed = runProductionTest(cases, new DeterministicEccAdapter(), {
    now: fixedClock,
    subjectVersion: "changed",
  });

  assert.equal(first.receipt_hash, second.receipt_hash);
  assert.notEqual(first.receipt_hash, changed.receipt_hash);
});
