import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "../dist/packages/contracts/src/index.js";
import * as credit from "../dist/packages/runtime/src/index.js";
import { syntheticAuthorityCatalog } from "../dist/packages/runtime/src/index.js";

const hash = `sha256:${"a".repeat(64)}`;
const command = {
  schema_version: "simulated-credit-command.v1",
  type: "simulated-credit.execute",
  tenant_id: "tenant_orchid",
  case_id: "case_d6_workbench",
  authority_request_id: "request_example",
  expected_case_version: 4,
  expected_review_revision: 2,
  expected_authority_state_revision: 2,
  request_binding_hash: hash,
  expected_action_binding_hash: hash,
  idempotency_key: "credit:example",
  correlation_id: "trace:example",
};
test("D7 accepts only a bound command, never caller supplied permission or effect material", () => {
  assert.equal(
    typeof contracts.assertValidSimulatedCreditContract,
    "function",
    "versioned credit contract is not implemented",
  );
  contracts.assertValidSimulatedCreditContract("command", command);
  for (const extra of [
    { authorized: true },
    { payload: {} },
    { target: {} },
    { executor_identity: {} },
    { verified: true },
  ])
    assert.throws(() =>
      contracts.assertValidSimulatedCreditContract("command", {
        ...command,
        ...extra,
      }),
    );
});
test("explicit D7 enrollment preserves D6 policy and seats, adds scoped services, and is idempotent", () => {
  assert.equal(
    typeof credit.enrollCreditCatalog,
    "function",
    "explicit credit enrollment is not implemented",
  );
  const original = syntheticAuthorityCatalog();
  const enrolled = credit.enrollCreditCatalog(original, []);
  assert.deepEqual(enrolled.actors, original.actors);
  assert.deepEqual(enrolled.policies, original.policies);
  assert.equal(enrolled.identities.length, original.identities.length + 2);
  assert.equal(
    enrolled.authority_records.length,
    original.authority_records.length + 3,
  );
  assert.deepEqual(credit.enrollCreditCatalog(enrolled, [enrolled]), enrolled);
  const revoked = structuredClone(enrolled);
  revoked.identities.find(
    (x) => x.identity_id === "identity_d7_credit_executor",
  ).status = "revoked";
  assert.throws(() => credit.enrollCreditCatalog(revoked, [enrolled]));
  assert.throws(() => credit.enrollCreditCatalog(original, [enrolled]));
});

test("D7 enrollment rejects contradictory reserved IDs and an inactive evaluator", () => {
  const enrolled = credit.enrollCreditCatalog(syntheticAuthorityCatalog(), []);
  for (const field of ["identities", "authority_records"]) {
    const bad = structuredClone(enrolled);
    const existing = bad[field].find((x) =>
      (x.identity_id ?? x.authority_record_id).includes("d7_credit_executor"),
    );
    bad[field].push({ ...existing, status: "revoked" });
    assert.throws(() => credit.enrollCreditCatalog(bad, [enrolled]));
  }
  const inactive = structuredClone(syntheticAuthorityCatalog());
  inactive.identities.find(
    (x) => x.identity_id === "identity_d6_evaluator",
  ).status = "revoked";
  assert.throws(() => credit.enrollCreditCatalog(inactive, []));
});
