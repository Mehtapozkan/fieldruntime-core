import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { validateCrossRecordInvariants } from "../dist/packages/contracts/src/index.js";

const schemaUrl = new URL(
  "../packages/contracts/schemas/case.v0.schema.json",
  import.meta.url,
);
const fixtureUrl = new URL(
  "../packages/ecc-pack/fixtures/acme-sso-needs-review.case.json",
  import.meta.url,
);

const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});
addFormats(ajv);
const validate = ajv.compile(schema);

test("the canonical ECC case fixture satisfies the JSON Schema", () => {
  assert.equal(
    validate(fixture),
    true,
    JSON.stringify(validate.errors, null, 2),
  );
  assert.deepEqual(validateCrossRecordInvariants(fixture), []);
});

test("the canonical contract rejects unknown authoritative fields", () => {
  const invalid = structuredClone(fixture);
  invalid.case.model_authorized = true;

  assert.equal(validate(invalid), false);
  assert.ok(
    validate.errors?.some((error) => error.keyword === "additionalProperties"),
  );
});

test("resolution without an accepted independently verified outcome is rejected", () => {
  const invalid = structuredClone(fixture);
  invalid.case.state = "resolved";

  assert.deepEqual(
    validateCrossRecordInvariants(invalid).map(({ code }) => code),
    ["resolution.independent_verified_outcome_required"],
  );
});

test("an executed action requires exact-payload approval and a receipt", () => {
  const invalid = structuredClone(fixture);
  invalid.action_proposals[1].status = "executed";

  assert.deepEqual(
    validateCrossRecordInvariants(invalid).map(({ code }) => code),
    ["action.payload_bound_approval_required", "action.receipt_required"],
  );
});

test("a terminal case with accepted verification and audit lineage passes", () => {
  const valid = structuredClone(fixture);
  valid.case.state = "resolved";
  valid.outcomes = [
    {
      id: "outcome_acme_001",
      case_id: valid.case.id,
      type: "customer_escalation_resolved",
      status: "achieved",
      accepted: true,
      metrics: { deployment_verified: true },
      evidence_ids: ["evidence_linear_issue"],
      verified_by_identity_id: "user_jane",
      verified_at: "2026-08-26T17:30:00Z",
    },
  ];

  assert.equal(validate(valid), true, JSON.stringify(validate.errors, null, 2));
  assert.deepEqual(validateCrossRecordInvariants(valid), []);
});
