import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertValidGuidedWalkthrough,
  ContractValidationError,
  sha256Json,
} from "../dist/packages/contracts/src/index.js";
import {
  createGuidedWalkthroughRecord,
  GuidedWalkthroughError,
} from "../dist/apps/worker/src/guided-walkthrough.js";

const caseFixture = JSON.parse(
  await readFile(
    new URL(
      "../packages/ecc-pack/fixtures/acme-sso-needs-review.case.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const walkthrough = JSON.parse(
  await readFile(
    new URL(
      "../packages/ecc-pack/fixtures/acme-sso-guided-walkthrough.v0.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function cloneWalkthrough() {
  return structuredClone(walkthrough);
}

function walkthroughForFixture(fixture) {
  const candidate = cloneWalkthrough();
  candidate.source_fixture.fixture_hash = sha256Json(fixture);
  return candidate;
}

test("the Acme walkthrough is an immutable non-authoritative response record", () => {
  assert.doesNotThrow(() => assertValidGuidedWalkthrough(walkthrough));

  const first = createGuidedWalkthroughRecord(walkthrough, caseFixture);
  const second = createGuidedWalkthroughRecord(
    structuredClone(walkthrough),
    structuredClone(caseFixture),
  );

  assert.equal(first.walkthrough_id, "walkthrough_acme_sso_001");
  assert.equal(first.fixture_id, "case_acme_sso_001");
  assert.equal(first.fixture_hash, sha256Json(caseFixture));
  assert.equal(first.walkthrough_hash, second.walkthrough_hash);
  assert.match(first.walkthrough_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.authoritative, false);
  assert.equal(first.replayable, false);
  assert.equal(first.document.safety.external_writes, false);
  assert.equal(first.document.safety.authority_effects, false);
  assert.equal(first.document.safety.production_receipt, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.document), true);
  assert.equal(
    Object.isFrozen(first.document.stages.act_verify.attempts),
    true,
  );
});

test("the guided story catches silent success, rejects the effect, and accepts only the simulated recovery", () => {
  const record = createGuidedWalkthroughRecord(walkthrough, caseFixture);
  const stage = record.document.stages.act_verify;
  const [failure, recovery] = stage.attempts;

  assert.equal(failure.simulated_connector_response.status, "reported_success");
  assert.notEqual(
    failure.simulated_connector_response.adapter_identity_id,
    failure.independent_readback.verifier_identity_id,
  );
  assert.equal(failure.independent_readback.result, "mismatch");
  assert.equal(failure.effect_acceptance_evaluation.decision, "rejected");
  assert.equal(failure.simulated_result.status, "effect_rejected");
  assert.equal(failure.simulated_result.accepted, false);

  assert.equal(recovery.previous_attempt_id, failure.attempt_id);
  assert.equal(recovery.action.idempotency_key, failure.action.idempotency_key);
  assert.equal(recovery.independent_readback.result, "match");
  assert.equal(
    recovery.simulated_result.status,
    "effect_accepted_simulation_only",
  );
  assert.equal(recovery.simulated_result.accepted, true);
  assert.equal(
    recovery.effect_acceptance_evaluation.authoritative_transition_applied,
    false,
  );
  assert.equal(stage.authoritative_case_state, "needs_review");
  assert.equal(stage.external_effect_count, 0);
  assert.equal(stage.production_receipt_emitted, false);
});

test("every walkthrough option and attempt is bound to the source action identity", () => {
  const record = createGuidedWalkthroughRecord(walkthrough, caseFixture);
  const actions = new Map(
    caseFixture.action_proposals.map((action) => [action.id, action]),
  );

  for (const option of record.document.stages.decision.options) {
    const source = actions.get(option.action_id);
    assert.ok(source);
    assert.equal(option.payload_hash, source.payload_hash);
    assert.deepEqual(
      [...option.required_approval_roles].sort(),
      [...source.required_approval_roles].sort(),
    );
  }
  for (const attempt of record.document.stages.act_verify.attempts) {
    const source = actions.get(attempt.action.action_id);
    assert.ok(source);
    assert.equal(attempt.action.payload_hash, source.payload_hash);
    assert.equal(attempt.action.idempotency_key, source.idempotency_key);
  }
});

test("the receipt surface remains a trace preview with unpromoted learning", () => {
  const record = createGuidedWalkthroughRecord(walkthrough, caseFixture);
  const preview = record.document.stages.receipt_preview;

  assert.equal(preview.kind, "guided_simulation_trace");
  assert.equal(preview.production_receipt, false);
  assert.equal(
    preview.trace.some(({ kind }) => kind === "effect_rejection"),
    true,
  );
  assert.equal(
    preview.trace.some(({ kind }) => kind === "closure_denial"),
    false,
  );
  assert.equal(preview.correction_preview.append_only_preview, true);
  assert.equal(
    preview.correction_preview.based_on_attempt_id,
    "attempt_customer_update_silent_failure",
  );
  assert.equal(
    preview.learning_candidate_preview.status,
    "preview_not_promoted",
  );
  assert.equal(preview.learning_candidate_preview.promotion_authorized, false);
  assert.equal(
    preview.learning_candidate_preview.original_history_mutated,
    false,
  );
  assert.equal(Object.hasOwn(record.document, "action_receipts"), false);
  assert.equal(Object.hasOwn(record.document, "outcomes"), false);
});

test("the walkthrough contract rejects authority, writes, replay, and receipt claims", () => {
  for (const mutate of [
    (value) => {
      value.safety.authoritative = true;
    },
    (value) => {
      value.safety.replayable = true;
    },
    (value) => {
      value.safety.external_writes = true;
    },
    (value) => {
      value.safety.production_receipt = true;
    },
    (value) => {
      value.stages.receipt_preview.production_receipt = true;
    },
    (value) => {
      value.stages.act_verify.external_effect_count = 1;
    },
  ]) {
    const invalid = cloneWalkthrough();
    mutate(invalid);
    assert.throws(
      () => createGuidedWalkthroughRecord(invalid, caseFixture),
      ContractValidationError,
    );
  }
});

test("cross-fixture payload, verifier, result, and attempt-lineage drift fails closed", () => {
  const wrongPayload = cloneWalkthrough();
  wrongPayload.stages.decision.options[1].payload_hash =
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  assert.throws(
    () => createGuidedWalkthroughRecord(wrongPayload, caseFixture),
    GuidedWalkthroughError,
  );

  const selfVerified = cloneWalkthrough();
  selfVerified.stages.act_verify.attempts[0].independent_readback.verifier_identity_id =
    selfVerified.stages.act_verify.attempts[0].simulated_connector_response.adapter_identity_id;
  assert.throws(
    () => createGuidedWalkthroughRecord(selfVerified, caseFixture),
    /independent verifier/,
  );

  const falseMismatch = cloneWalkthrough();
  falseMismatch.stages.act_verify.attempts[0].independent_readback.observed_value =
    structuredClone(
      falseMismatch.stages.act_verify.attempts[0].independent_readback
        .expected_value,
    );
  assert.throws(
    () => createGuidedWalkthroughRecord(falseMismatch, caseFixture),
    /contradicts/,
  );

  const brokenLineage = cloneWalkthrough();
  brokenLineage.stages.act_verify.attempts[1].previous_attempt_id =
    "attempt_unrelated";
  assert.throws(
    () => createGuidedWalkthroughRecord(brokenLineage, caseFixture),
    GuidedWalkthroughError,
  );

  const duplicateAttemptId = cloneWalkthrough();
  const failureAttemptId =
    duplicateAttemptId.stages.act_verify.attempts[0].attempt_id;
  duplicateAttemptId.stages.act_verify.attempts[1].attempt_id =
    failureAttemptId;
  duplicateAttemptId.stages.receipt_preview.trace[7].ref_id = failureAttemptId;
  assert.throws(
    () => createGuidedWalkthroughRecord(duplicateAttemptId, caseFixture),
    /attempt_id must differ/,
  );

  const unboundEffect = cloneWalkthrough();
  unboundEffect.stages.act_verify.attempts[1].independent_readback.expected_value =
    { message: "Completely different unbound effect" };
  unboundEffect.stages.act_verify.attempts[1].independent_readback.observed_value =
    { message: "Completely different unbound effect" };
  assert.throws(
    () => createGuidedWalkthroughRecord(unboundEffect, caseFixture),
    /expected_value\/message does not match/,
  );

  const unboundSource = cloneWalkthrough();
  unboundSource.stages.act_verify.attempts[1].independent_readback.source =
    "fixture://unrelated/readback";
  assert.throws(
    () => createGuidedWalkthroughRecord(unboundSource, caseFixture),
    /independent_readback\/source does not match/,
  );

  const reversedTime = cloneWalkthrough();
  reversedTime.stages.act_verify.attempts[1].simulated_connector_response.reported_at =
    "2026-08-26T15:00:00.000Z";
  reversedTime.stages.act_verify.attempts[1].independent_readback.observed_at =
    "2026-08-26T15:00:05.000Z";
  assert.throws(
    () => createGuidedWalkthroughRecord(reversedTime, caseFixture),
    /recovery connector cannot precede/,
  );

  const wrongTraceSubject = cloneWalkthrough();
  wrongTraceSubject.stages.receipt_preview.trace[6].ref_id =
    "action_verify_deployment";
  assert.throws(
    () => createGuidedWalkthroughRecord(wrongTraceSubject, caseFixture),
    /trace\/6\/ref_id does not match/,
  );
});

test("the walkthrough is bound to the exact canonical case fixture hash", () => {
  const invalid = cloneWalkthrough();
  invalid.source_fixture.fixture_hash =
    "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

  assert.throws(
    () => createGuidedWalkthroughRecord(invalid, caseFixture),
    GuidedWalkthroughError,
  );
});

test("the walkthrough rejects recorded authority and effects in its source case", () => {
  const approvedProposal = structuredClone(caseFixture);
  approvedProposal.action_proposals[1].status = "approved";
  assert.throws(
    () =>
      createGuidedWalkthroughRecord(
        walkthroughForFixture(approvedProposal),
        approvedProposal,
      ),
    /action_draft_update\/status does not match/,
  );

  const approvedCredit = structuredClone(caseFixture);
  approvedCredit.action_proposals[2].status = "approved";
  assert.throws(
    () =>
      createGuidedWalkthroughRecord(
        walkthroughForFixture(approvedCredit),
        approvedCredit,
      ),
    /action_offer_credit\/status does not match/,
  );

  const recordedApproval = structuredClone(caseFixture);
  recordedApproval.approvals.push({
    id: "approval_business_001",
    proposal_id: "action_draft_update",
    approver_identity_id: "user_business_approver",
    role: "Business Approver",
    decision: "approved",
    policy_version_id: "policy_customer_comms_v3",
    decided_at: "2026-08-26T16:05:00.000Z",
    approved_payload_hash:
      "sha256:3f66e2da315d9a9557a94a985c1b7dadd8f774697df93eae16c59bd1588d590e",
  });
  assert.throws(
    () =>
      createGuidedWalkthroughRecord(
        walkthroughForFixture(recordedApproval),
        recordedApproval,
      ),
    /fixture\/approvals must remain empty/,
  );

  const recordedEffect = structuredClone(caseFixture);
  recordedEffect.action_receipts.push({
    id: "action_receipt_customer_update_001",
    proposal_id: "action_draft_update",
    provider: "fixture",
    external_ref: "fixture://crm/customer-update/receipt/001",
    status: "succeeded",
    request_hash:
      "sha256:3f66e2da315d9a9557a94a985c1b7dadd8f774697df93eae16c59bd1588d590e",
    response_ref: "fixture://crm/customer-update/response/001",
    executed_at: "2026-08-26T16:05:00.000Z",
    idempotency_key: "case_acme_sso_001:customer-update:v1",
  });
  assert.throws(
    () =>
      createGuidedWalkthroughRecord(
        walkthroughForFixture(recordedEffect),
        recordedEffect,
      ),
    /fixture\/action_receipts must remain empty/,
  );
});

test("the walkthrough source workflow remains shadow-only", () => {
  const activeWorkflow = structuredClone(caseFixture);
  activeWorkflow.workflow_version.status = "active";

  assert.throws(
    () =>
      createGuidedWalkthroughRecord(
        walkthroughForFixture(activeWorkflow),
        activeWorkflow,
      ),
    /workflow_version\/status does not match/,
  );
});
