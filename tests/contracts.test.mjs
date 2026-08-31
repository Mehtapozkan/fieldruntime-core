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

test("stored WorkEvents require canonical UTC time and source timezone metadata", () => {
  const nonCanonicalTime = structuredClone(fixture);
  nonCanonicalTime.events[0].occurred_at = "2026-08-26T09:00:00-07:00";
  assert.equal(validate(nonCanonicalTime), false);
  assert.ok(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/events/0/occurred_at" &&
        error.keyword === "pattern",
    ),
  );

  for (const occurredAt of [
    "2026-08-26t16:00:00.000Z",
    "2026-08-26 16:00:00.000Z",
  ]) {
    const nonCanonicalSeparator = structuredClone(fixture);
    nonCanonicalSeparator.events[0].occurred_at = occurredAt;
    assert.equal(validate(nonCanonicalSeparator), false);
    assert.ok(
      validate.errors?.some(
        (error) =>
          error.instancePath === "/events/0/occurred_at" &&
          error.keyword === "pattern",
      ),
    );
  }

  const missingTimezone = structuredClone(fixture);
  delete missingTimezone.events[0].source_timezone;
  assert.equal(validate(missingTimezone), false);
  assert.ok(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/events/0" && error.keyword === "required",
    ),
  );
});

test("stored creation times require canonical UTC and source timezone metadata", () => {
  for (const mutate of [
    (document) => {
      document.workflow_version.effective_from = "2026-08-25T17:00:00-07:00";
    },
    (document) => {
      document.workflow_version.effective_to = "2026-08-31T17:00:00-07:00";
      document.workflow_version.effective_to_source_timezone =
        "America/Los_Angeles";
    },
    (document) => {
      document.case.due_at = "2026-08-28T17:00:00-07:00";
    },
  ]) {
    const nonCanonical = structuredClone(fixture);
    mutate(nonCanonical);
    assert.equal(validate(nonCanonical), false);
    assert.ok(validate.errors?.some((error) => error.keyword === "pattern"));
  }

  const missingEffectiveTimezone = structuredClone(fixture);
  delete missingEffectiveTimezone.workflow_version
    .effective_from_source_timezone;
  assert.equal(validate(missingEffectiveTimezone), false);
  assert.ok(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/workflow_version" &&
        error.keyword === "required",
    ),
  );

  const missingDueTimezone = structuredClone(fixture);
  delete missingDueTimezone.case.due_at_source_timezone;
  assert.equal(validate(missingDueTimezone), false);
  assert.ok(
    validate.errors?.some(
      (error) => error.instancePath === "/case" && error.keyword === "required",
    ),
  );

  const missingEffectiveToTimezone = structuredClone(fixture);
  missingEffectiveToTimezone.workflow_version.effective_to =
    "2026-09-01T00:00:00.000Z";
  assert.equal(validate(missingEffectiveToTimezone), false);
  assert.ok(
    validate.errors?.some(
      (error) =>
        error.instancePath === "/workflow_version" &&
        error.keyword === "required",
    ),
  );
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

test("an executed action fails closed and requires matching declared-hash records", () => {
  const invalid = structuredClone(fixture);
  invalid.action_proposals[1].status = "executed";

  assert.deepEqual(
    validateCrossRecordInvariants(invalid).map(({ code }) => code),
    [
      "action.execution_proof_engine_required",
      "action.payload_bound_approval_required",
      "action.receipt_required",
    ],
  );
});

test("declared hashes cannot stand in for the future execution-proof engine", () => {
  const invalid = structuredClone(fixture);
  const proposal = invalid.action_proposals[1];
  proposal.status = "executed";
  proposal.payload.message = "changed without recomputing the declared hash";
  invalid.approvals = [
    {
      proposal_id: proposal.id,
      decision: "approved",
      approved_payload_hash: proposal.payload_hash,
    },
  ];
  invalid.action_receipts = [
    {
      proposal_id: proposal.id,
      status: "succeeded",
      request_hash: proposal.payload_hash,
    },
  ];

  assert.deepEqual(
    validateCrossRecordInvariants(invalid)
      .map(({ code }) => code)
      .filter((code) => code.startsWith("action.")),
    ["action.execution_proof_engine_required"],
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
