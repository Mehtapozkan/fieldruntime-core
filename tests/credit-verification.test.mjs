import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "../dist/packages/contracts/src/index.js";
import * as runtime from "../dist/packages/runtime/src/index.js";
const command = {
  schema_version: "simulated-credit-verification-command.v1",
  type: "simulated-credit.verify",
  tenant_id: "tenant_orchid",
  case_id: "case_d6_workbench",
  attempt_id: "attempt_example",
  expected_action_entry_hash: `sha256:${"a".repeat(64)}`,
  idempotency_key: "verification:example",
  correlation_id: "verification:example",
};
test("D7-C verification command binds an exact attempt and rejects caller authority or results", () => {
  contracts.assertValidSimulatedCreditV2Contract("verify_command", command);
  for (const extra of [
    { verifier_identity_id: "identity_d7_credit_executor" },
    { verified: true },
    { observed_rows: [] },
    { success: true },
    { expected_case_version: 4 },
  ])
    assert.throws(() =>
      contracts.assertValidSimulatedCreditV2Contract("verify_command", {
        ...command,
        ...extra,
      }),
    );
  assert.throws(() =>
    contracts.assertValidSimulatedCreditV2Contract("verify_command", {
      ...command,
      expected_action_entry_hash: "unbound",
    }),
  );
});
test("D7-C compares independent observations rather than an adapter success claim", () => {
  assert.equal(
    typeof runtime.compareCreditObservation,
    "function",
    "independent comparison is not implemented",
  );
  const absent = { status: "read", rows: [], hash: runtime.sha256Json([]) };
  const unavailable = { status: "unavailable", rows: null, hash: null };
  assert.equal(
    runtime.compareCreditObservation(absent, {}).outcome,
    "mismatch",
  );
  assert.equal(
    runtime.compareCreditObservation(unavailable, {}).outcome,
    "inconclusive",
  );
  assert.notEqual(
    runtime.compareCreditObservation(unavailable, {}).absence_proven,
    true,
  );
});

const {
  creditSource,
  CREDIT_TARGET,
  CREDIT_PAYLOAD,
  creditServiceEligibility,
} = await import("../dist/packages/runtime/src/simulated-credit.js");
const { sourceObservation, verifierAuthority } =
  await import("../dist/packages/runtime/src/credit-verification.js");
const at = "2026-09-06T16:00:00.000Z";
const attempt = {
  id: "attempt_example",
  recorded_at: at,
  envelope: { target: CREDIT_TARGET, payload: CREDIT_PAYLOAD },
};
function tuple(source) {
  return {
    ...Object.fromEntries(
      ["tenant_id", "case_id", "slot"].map((k) => [k, source.target[k]]),
    ),
    origin_attempt_id: source.origin_attempt_id,
    row_hash: source.row_hash,
    source_row: source,
  };
}
function changedSource(edit) {
  const s = structuredClone(creditSource(attempt.id, at));
  edit(s);
  delete s.row_hash;
  s.row_hash = runtime.sha256Json(s);
  return s;
}
test("D7-C comparison checks scope, value and originating attempt; malformed and failed reads cannot prove absence", () => {
  const exact = tuple(creditSource(attempt.id, at));
  assert.equal(
    runtime.compareCreditObservation(sourceObservation([exact]), attempt)
      .outcome,
    "verified_simulated_effect",
  );
  for (const [edit, reason] of [
    [
      (s) => (s.target.account_ref = "synthetic://accounts/wrong"),
      "wrong_target",
    ],
    [(s) => (s.target.case_id = "case_wrong"), "wrong_target"],
    [(s) => (s.target.slot = "wrong_slot"), "wrong_target"],
    [(s) => (s.payload.amount_minor = 1), "wrong_payload"],
    [(s) => (s.payload.currency = "EUR"), "wrong_payload"],
    [(s) => (s.origin_attempt_id = "attempt_other"), "wrong_origin"],
  ]) {
    const r = runtime.compareCreditObservation(
      sourceObservation([tuple(changedSource(edit))]),
      attempt,
    );
    assert.equal(r.outcome, "mismatch");
    assert.ok(r.reason_codes.includes(reason));
    assert.equal(r.absence_proven, false);
  }
  for (const rows of [[null], [{}], [{ ...exact, row_hash: "bad" }]]) {
    const r = runtime.compareCreditObservation(
      sourceObservation(rows),
      attempt,
    );
    assert.equal(r.outcome, "inconclusive");
    assert.equal(r.absence_proven, false);
  }
  assert.equal(
    runtime.compareCreditObservation(sourceObservation([exact, exact]), attempt)
      .outcome,
    "mismatch",
  );
});
test("D7-C service eligibility uses canonical identity and scoped current grant; executor self-verification fails", () => {
  const data = runtime.enrollCreditCatalog(
    runtime.syntheticAuthorityCatalog(),
    [],
  );
  assert.deepEqual(creditServiceEligibility(data, "verifier", at).reasons, []);
  const snapshot = runtime.reviewSnapshot("catalog", {
    schema_version: "authority-catalog.v1",
    tenant_id: "tenant_orchid",
    revision: 1,
    previous_catalog_hash: null,
    after_review_position: 0,
    recorded_at: at,
    data,
  });
  assert.throws(
    () =>
      verifierAuthority(
        { authority: { snapshots: [snapshot] } },
        snapshot.hash,
        at,
        { envelope: { profile: { executor: "identity_d7_credit_verifier" } } },
      ),
    /self-verification/,
  );
  for (const edit of [
    (d) =>
      (d.identities.find(
        (i) => i.identity_id === "identity_d7_credit_verifier",
      ).status = "revoked"),
    (d) =>
      (d.authority_records.find(
        (g) => g.authority_class === "simulated_credit_verifier",
      ).scope.case_ids = ["case_other"]),
    (d) =>
      (d.authority_records.find(
        (g) => g.authority_class === "simulated_credit_verifier",
      ).effective_until = at),
    (d) =>
      d.authority_records.push({
        ...d.authority_records.find(
          (g) => g.authority_class === "simulated_credit_verifier",
        ),
        authority_record_id: "authority_other",
      }),
  ]) {
    const bad = structuredClone(data);
    edit(bad);
    assert.ok(creditServiceEligibility(bad, "verifier", at).reasons.length);
  }
});
