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
    evaluate(subject, harness) {
      inspected += 1;
      assert.equal("expected" in subject, false);
      assert.equal("assertions" in subject, false);
      assert.ok(Object.isFrozen(subject));
      assert.ok(Object.isFrozen(subject.input.records));
      return delegate.evaluate(subject, harness);
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

test("hard gates use harness observations instead of adapter claims", () => {
  const delegate = new DeterministicEccAdapter();
  const caseWithoutWriteAssertion = cases.find(
    ({ id }) => id === "FR-EVAL-003",
  );
  assert.equal(
    caseWithoutWriteAssertion.assertions.some(
      ({ assertion }) => assertion === "external_write_count",
    ),
    false,
  );
  const concealingAdapter = {
    name: "concealing-adapter",
    evaluate(subject, harness) {
      harness.recordExternalWrite();
      harness.recordUnauthorizedAction();
      const decision = delegate.evaluate(subject, harness);
      return {
        ...decision,
        measures: {
          ...decision.measures,
          external_write_count: 0,
          unauthorized_action_count: 0,
        },
      };
    },
  };

  const receipt = runProductionTest(
    [caseWithoutWriteAssertion],
    concealingAdapter,
    {
      now: fixedClock,
    },
  );
  assert.equal(receipt.verdict, "fail");
  assert.equal(receipt.hard_gates_passed, false);
  assert.ok(
    receipt.case_results.some(({ checks }) =>
      checks.some(
        ({ name, actual, passed }) =>
          name === "external_write_count" && actual === 1 && passed === false,
      ),
    ),
  );
});

test("every case receives the complete harness-owned hard-gate set", () => {
  const receipt = runProductionTest(cases, new DeterministicEccAdapter(), {
    now: fixedClock,
  });

  for (const result of receipt.case_results) {
    assert.equal(
      result.checks.filter(({ hard_gate }) => hard_gate).length,
      10,
      result.id,
    );
  }
});

test("trigger tenant mismatch fails closed before case creation", () => {
  const changed = structuredClone(cases[0]);
  changed.input.trigger_event.tenant_id = "tenant_lumen";
  changed.expected = {
    qualified: false,
    case_behavior: "security_reject",
    severity: null,
    owner: null,
    conflicts: ["tenant mismatch"],
    required_approvals: [],
    final_state: "dismissed",
    learning_candidate: null,
  };
  changed.assertions = [
    {
      assertion: "unauthorized_retrieval_count",
      operator: "eq",
      expected: 0,
    },
    {
      assertion: "security_audit_event",
      operator: "eq",
      expected: true,
    },
  ];

  const receipt = runProductionTest([changed], new DeterministicEccAdapter(), {
    now: fixedClock,
  });
  assert.equal(receipt.verdict, "pass");
});

test("accepted customer language cannot resolve a case without closure proof", () => {
  const changed = structuredClone(cases.find(({ id }) => id === "FR-EVAL-027"));
  const verification = changed.input.records.find(
    ({ source }) => source === "verification",
  );
  delete verification.state.verification_evidence_ref;
  changed.expected.final_state = "verifying";
  changed.assertions = [
    { assertion: "outcome_accepted", operator: "eq", expected: true },
    { assertion: "case_resolved", operator: "eq", expected: false },
  ];

  const receipt = runProductionTest([changed], new DeterministicEccAdapter(), {
    now: fixedClock,
  });
  assert.equal(receipt.verdict, "pass");
});

test("an accepted no-action decision can satisfy closure proof", () => {
  const changed = structuredClone(cases.find(({ id }) => id === "FR-EVAL-027"));
  const authority = changed.input.records.find(
    ({ source }) => source === "authority",
  );
  authority.state.action_or_no_action_decision = "accepted_no_action";

  const receipt = runProductionTest([changed], new DeterministicEccAdapter(), {
    now: fixedClock,
  });
  assert.equal(receipt.verdict, "pass");
  assert.equal(receipt.case_results[0].passed, true);
});

test("closure proof requires separately attributable authoritative records", () => {
  const wrongSource = structuredClone(
    cases.find(({ id }) => id === "FR-EVAL-027"),
  );
  wrongSource.input.records.find(
    ({ source }) => source === "verification",
  ).source = "slack";
  wrongSource.expected.final_state = "verifying";
  wrongSource.assertions = [
    { assertion: "case_resolved", operator: "eq", expected: false },
  ];

  const lowAuthority = structuredClone(wrongSource);
  const verification = lowAuthority.input.records.find(
    ({ source }) => source === "slack",
  );
  verification.source = "verification";
  verification.authority_rank = 3;

  for (const evaluationCase of [wrongSource, lowAuthority]) {
    const receipt = runProductionTest(
      [evaluationCase],
      new DeterministicEccAdapter(),
      { now: fixedClock },
    );
    assert.equal(receipt.verdict, "pass");
    assert.equal(receipt.case_results[0].passed, true);
  }
});

test("empty evaluation corpora fail closed", () => {
  assert.throws(() => parseEvaluationCases("\n  \n"), /at least one case/);
  assert.throws(
    () =>
      runProductionTest([], new DeterministicEccAdapter(), {
        now: fixedClock,
      }),
    /at least one case/,
  );
});

test("empty receipt identity fields fail before evaluation", () => {
  assert.throws(
    () =>
      runProductionTest(cases, new DeterministicEccAdapter(), {
        now: fixedClock,
        subjectVersion: "   ",
      }),
    /Subject version must not be empty/,
  );
  assert.throws(
    () =>
      runProductionTest(
        cases,
        { name: "", evaluate() {} },
        {
          now: fixedClock,
        },
      ),
    /Adapter name must not be empty/,
  );
});

test("custom evaluation corpora are schema-validated before execution", () => {
  const changed = structuredClone(cases[0]);
  changed.assertions[0].operator = "bogus";

  assert.throws(
    () => parseEvaluationCases(`${JSON.stringify(changed)}\n`),
    /Invalid evaluation case.*operator/i,
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

test("receipts bind input corpus and gold independently", () => {
  const inputChanged = structuredClone(cases);
  inputChanged[0].input.trigger_event.content = "Changed trigger";
  const goldChanged = structuredClone(cases);
  goldChanged[0].expected.owner = "user_wrong";

  const baseline = runProductionTest(cases, new DeterministicEccAdapter(), {
    now: fixedClock,
  });
  const changedInputReceipt = runProductionTest(
    inputChanged,
    new DeterministicEccAdapter(),
    { now: fixedClock },
  );
  const changedGoldReceipt = runProductionTest(
    goldChanged,
    new DeterministicEccAdapter(),
    { now: fixedClock },
  );

  assert.notEqual(baseline.corpus_hash, changedInputReceipt.corpus_hash);
  assert.equal(baseline.gold_hash, changedInputReceipt.gold_hash);
  assert.equal(baseline.corpus_hash, changedGoldReceipt.corpus_hash);
  assert.notEqual(baseline.gold_hash, changedGoldReceipt.gold_hash);
});
