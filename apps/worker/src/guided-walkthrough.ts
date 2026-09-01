import {
  assertValidCaseDocument,
  assertValidGuidedWalkthrough,
  canonicalJson,
  canonicalizeJson,
  immutableJson,
  sha256Json,
  type JsonValue,
  validateCrossRecordInvariants,
} from "../../../packages/contracts/src/index.js";

type JsonObject = { readonly [key: string]: JsonValue };

export interface GuidedWalkthroughRecord {
  readonly walkthrough_id: string;
  readonly walkthrough_hash: `sha256:${string}`;
  readonly fixture_id: string;
  readonly fixture_hash: `sha256:${string}`;
  readonly authoritative: false;
  readonly replayable: false;
  readonly document: JsonObject;
}

export class GuidedWalkthroughError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuidedWalkthroughError";
  }
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredObject(
  value: JsonValue | undefined,
  path: string,
): JsonObject {
  if (!isObject(value)) {
    throw new GuidedWalkthroughError(`${path} must be an object`);
  }
  return value;
}

function requiredArray(
  value: JsonValue | undefined,
  path: string,
): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw new GuidedWalkthroughError(`${path} must be an array`);
  }
  return value as readonly JsonValue[];
}

function requiredString(value: JsonValue | undefined, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new GuidedWalkthroughError(`${path} must be a nonempty string`);
  }
  return value;
}

function requiredInteger(value: JsonValue | undefined, path: string): number {
  if (!Number.isInteger(value)) {
    throw new GuidedWalkthroughError(`${path} must be an integer`);
  }
  return value as number;
}

function objectArray(
  value: JsonValue | undefined,
  path: string,
): readonly JsonObject[] {
  return requiredArray(value, path).map((item, index) =>
    requiredObject(item, `${path}/${String(index)}`),
  );
}

function stringArray(
  value: JsonValue | undefined,
  path: string,
): readonly string[] {
  return requiredArray(value, path).map((item, index) =>
    requiredString(item, `${path}/${String(index)}`),
  );
}

function assertEqual(
  actual: JsonValue | undefined,
  expected: JsonValue | undefined,
  path: string,
): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new GuidedWalkthroughError(
      `${path} does not match its source fixture`,
    );
  }
}

function assertStringSetEqual(
  actual: readonly string[],
  expected: readonly string[],
  path: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value) => !expected.includes(value)) ||
    expected.some((value) => !actual.includes(value))
  ) {
    throw new GuidedWalkthroughError(
      `${path} does not match its source fixture`,
    );
  }
}

function mapById(
  records: readonly JsonObject[],
  path: string,
): ReadonlyMap<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const [index, record] of records.entries()) {
    const id = requiredString(record.id, `${path}/${String(index)}/id`);
    if (result.has(id)) {
      throw new GuidedWalkthroughError(`${path} contains duplicate id ${id}`);
    }
    result.set(id, record);
  }
  return result;
}

function requiredRecord(
  records: ReadonlyMap<string, JsonObject>,
  id: string,
  path: string,
): JsonObject {
  const record = records.get(id);
  if (record === undefined) {
    throw new GuidedWalkthroughError(`${path} references missing id ${id}`);
  }
  return record;
}

function assertActionBinding(
  binding: JsonObject,
  actions: ReadonlyMap<string, JsonObject>,
  path: string,
  includeIdempotency: boolean,
): JsonObject {
  const actionId = requiredString(binding.action_id, `${path}/action_id`);
  const action = requiredRecord(actions, actionId, `${path}/action_id`);
  assertEqual(
    binding.payload_hash,
    action.payload_hash,
    `${path}/payload_hash`,
  );
  if (includeIdempotency) {
    assertEqual(
      binding.idempotency_key,
      action.idempotency_key,
      `${path}/idempotency_key`,
    );
  }
  return action;
}

function assertIndependentAttempt(
  attempt: JsonObject,
  actions: ReadonlyMap<string, JsonObject>,
  selectedActionId: string,
  path: string,
): void {
  const actionBinding = requiredObject(attempt.action, `${path}/action`);
  const selectedAction = assertActionBinding(
    actionBinding,
    actions,
    `${path}/action`,
    true,
  );
  assertEqual(
    actionBinding.action_id,
    selectedActionId,
    `${path}/action/action_id`,
  );

  const connector = requiredObject(
    attempt.simulated_connector_response,
    `${path}/simulated_connector_response`,
  );
  const readback = requiredObject(
    attempt.independent_readback,
    `${path}/independent_readback`,
  );
  const selectedPayload = requiredObject(
    selectedAction.payload,
    "fixture/action_proposals/payload",
  );
  const expectedValue = requiredObject(
    readback.expected_value,
    `${path}/independent_readback/expected_value`,
  );
  assertEqual(
    expectedValue.message,
    selectedPayload.message,
    `${path}/independent_readback/expected_value/message`,
  );
  const selectedTarget = requiredString(
    selectedAction.target,
    "fixture/action_proposals/target",
  );
  assertEqual(
    readback.source,
    `${selectedTarget}/readback`,
    `${path}/independent_readback/source`,
  );
  const adapterIdentity = requiredString(
    connector.adapter_identity_id,
    `${path}/simulated_connector_response/adapter_identity_id`,
  );
  const verifierIdentity = requiredString(
    readback.verifier_identity_id,
    `${path}/independent_readback/verifier_identity_id`,
  );
  if (adapterIdentity === verifierIdentity) {
    throw new GuidedWalkthroughError(
      `${path} must identify an independent verifier`,
    );
  }

  const reportedAt = Date.parse(
    requiredString(
      connector.reported_at,
      `${path}/simulated_connector_response/reported_at`,
    ),
  );
  const observedAt = Date.parse(
    requiredString(
      readback.observed_at,
      `${path}/independent_readback/observed_at`,
    ),
  );
  if (observedAt < reportedAt) {
    throw new GuidedWalkthroughError(
      `${path} read-back cannot precede the connector response`,
    );
  }

  const valuesMatch =
    canonicalJson(readback.expected_value) ===
    canonicalJson(readback.observed_value);
  if (
    (readback.result === "match" && !valuesMatch) ||
    (readback.result === "mismatch" && valuesMatch)
  ) {
    throw new GuidedWalkthroughError(
      `${path} read-back result contradicts its expected and observed values`,
    );
  }
}

function validateFixtureBindings(
  walkthrough: JsonObject,
  fixture: JsonObject,
): void {
  const source = requiredObject(walkthrough.source_fixture, "$/source_fixture");
  const tenant = requiredObject(fixture.tenant, "fixture/tenant");
  const workflow = requiredObject(
    fixture.workflow_version,
    "fixture/workflow_version",
  );
  const caseRecord = requiredObject(fixture.case, "fixture/case");
  const pack = requiredObject(walkthrough.pack, "$/pack");

  assertEqual(source.fixture_id, caseRecord.id, "$/source_fixture/fixture_id");
  assertEqual(source.tenant_id, tenant.id, "$/source_fixture/tenant_id");
  assertEqual(source.case_id, caseRecord.id, "$/source_fixture/case_id");
  assertEqual(
    source.workflow_version_id,
    workflow.id,
    "$/source_fixture/workflow_version_id",
  );
  assertEqual(pack.version, workflow.version, "$/pack/version");
  assertEqual(pack.workflow_id, workflow.workflow_id, "$/pack/workflow_id");
  assertEqual(workflow.status, "shadow", "fixture/workflow_version/status");
  assertEqual(
    source.fixture_hash,
    sha256Json(fixture),
    "$/source_fixture/fixture_hash",
  );

  const stages = requiredObject(walkthrough.stages, "$/stages");
  const caseStage = requiredObject(stages.case, "$/stages/case");
  const evidence = mapById(
    objectArray(fixture.evidence, "fixture/evidence"),
    "fixture/evidence",
  );
  const evidenceBindings = objectArray(
    caseStage.evidence_bindings,
    "$/stages/case/evidence_bindings",
  );
  const evidenceIds = evidenceBindings.map((binding, index) =>
    requiredString(
      binding.evidence_id,
      `$/stages/case/evidence_bindings/${String(index)}/evidence_id`,
    ),
  );
  assertStringSetEqual(
    evidenceIds,
    [...evidence.keys()],
    "$/stages/case/evidence_bindings",
  );

  const artifacts = mapById(
    objectArray(fixture.artifacts, "fixture/artifacts"),
    "fixture/artifacts",
  );
  const conflictId = requiredString(
    caseStage.conflict_artifact_id,
    "$/stages/case/conflict_artifact_id",
  );
  const conflict = requiredRecord(
    artifacts,
    conflictId,
    "$/stages/case/conflict_artifact_id",
  );
  assertEqual(conflict.type, "conflict", "$/stages/case/conflict_artifact_id");

  const decisionStage = requiredObject(stages.decision, "$/stages/decision");
  const packets = mapById(
    objectArray(fixture.decision_packets, "fixture/decision_packets"),
    "fixture/decision_packets",
  );
  const packetId = requiredString(
    decisionStage.decision_packet_id,
    "$/stages/decision/decision_packet_id",
  );
  const packet = requiredRecord(
    packets,
    packetId,
    "$/stages/decision/decision_packet_id",
  );
  assertEqual(
    decisionStage.recommendation,
    packet.recommendation,
    "$/stages/decision/recommendation",
  );

  const actions = mapById(
    objectArray(fixture.action_proposals, "fixture/action_proposals"),
    "fixture/action_proposals",
  );
  const expectedStatusByType = new Map([
    ["independent_readback", "draft"],
    ["customer_communication", "pending_approval"],
    ["financial_remedy", "pending_approval"],
  ]);
  for (const [actionId, action] of actions) {
    const actionType = requiredString(
      action.action_type,
      `fixture/action_proposals/${actionId}/action_type`,
    );
    const expectedStatus = expectedStatusByType.get(actionType);
    if (expectedStatus === undefined) {
      throw new GuidedWalkthroughError(
        `fixture/action_proposals/${actionId}/action_type is not part of this walkthrough`,
      );
    }
    assertEqual(
      action.status,
      expectedStatus,
      `fixture/action_proposals/${actionId}/status`,
    );
    const roles = stringArray(
      action.required_approval_roles,
      `fixture/action_proposals/${actionId}/required_approval_roles`,
    );
    if (
      (actionType === "independent_readback" && roles.length !== 0) ||
      (actionType === "customer_communication" && roles.length < 1) ||
      (actionType === "financial_remedy" && roles.length < 2)
    ) {
      throw new GuidedWalkthroughError(
        `fixture/action_proposals/${actionId}/required_approval_roles does not preserve the walkthrough authority route`,
      );
    }
  }
  const options = objectArray(
    decisionStage.options,
    "$/stages/decision/options",
  );
  const optionIds: string[] = [];
  for (const [index, option] of options.entries()) {
    const path = `$/stages/decision/options/${String(index)}`;
    const action = assertActionBinding(option, actions, path, false);
    optionIds.push(requiredString(option.action_id, `${path}/action_id`));
    assertEqual(option.risk_level, action.risk_level, `${path}/risk_level`);
    assertStringSetEqual(
      stringArray(
        option.required_approval_roles,
        `${path}/required_approval_roles`,
      ),
      stringArray(
        action.required_approval_roles,
        `fixture/action_proposals/${String(index)}/required_approval_roles`,
      ),
      `${path}/required_approval_roles`,
    );
  }
  assertEqual(optionIds, packet.option_ids, "$/stages/decision/options");

  const authorityException = requiredObject(
    decisionStage.authority_exception,
    "$/stages/decision/authority_exception",
  );
  const authorityActionId = requiredString(
    authorityException.action_id,
    "$/stages/decision/authority_exception/action_id",
  );
  const authorityAction = requiredRecord(
    actions,
    authorityActionId,
    "$/stages/decision/authority_exception/action_id",
  );
  assertStringSetEqual(
    stringArray(
      authorityException.missing_roles,
      "$/stages/decision/authority_exception/missing_roles",
    ),
    stringArray(
      authorityAction.required_approval_roles,
      "fixture/action_proposals/required_approval_roles",
    ),
    "$/stages/decision/authority_exception/missing_roles",
  );

  const actVerify = requiredObject(stages.act_verify, "$/stages/act_verify");
  const selected = requiredObject(
    actVerify.selected_action,
    "$/stages/act_verify/selected_action",
  );
  const selectedAction = assertActionBinding(
    selected,
    actions,
    "$/stages/act_verify/selected_action",
    true,
  );
  const selectedActionId = requiredString(
    selected.action_id,
    "$/stages/act_verify/selected_action/action_id",
  );
  assertEqual(
    selectedAction.status,
    "pending_approval",
    "fixture/action_proposals/selected/status",
  );
  for (const field of [
    "approvals",
    "action_receipts",
    "outcomes",
    "corrections",
    "learning_candidates",
  ]) {
    if (requiredArray(fixture[field], `fixture/${field}`).length !== 0) {
      throw new GuidedWalkthroughError(
        `fixture/${field} must remain empty for this no-authority, no-effect walkthrough`,
      );
    }
  }
  const authorityPreview = requiredObject(
    actVerify.authority_preview,
    "$/stages/act_verify/authority_preview",
  );
  assertEqual(
    authorityPreview.action_id,
    selectedActionId,
    "$/stages/act_verify/authority_preview/action_id",
  );
  assertStringSetEqual(
    stringArray(
      authorityPreview.required_roles,
      "$/stages/act_verify/authority_preview/required_roles",
    ),
    stringArray(
      selectedAction.required_approval_roles,
      "fixture/action_proposals/required_approval_roles",
    ),
    "$/stages/act_verify/authority_preview/required_roles",
  );
  assertEqual(
    actVerify.authoritative_case_state,
    caseRecord.state,
    "$/stages/act_verify/authoritative_case_state",
  );

  const attempts = objectArray(
    actVerify.attempts,
    "$/stages/act_verify/attempts",
  );
  const failure = attempts[0];
  const recovery = attempts[1];
  if (failure === undefined || recovery === undefined) {
    throw new GuidedWalkthroughError(
      "$/stages/act_verify/attempts must contain failure and recovery",
    );
  }
  assertIndependentAttempt(
    failure,
    actions,
    selectedActionId,
    "$/stages/act_verify/attempts/0",
  );
  assertIndependentAttempt(
    recovery,
    actions,
    selectedActionId,
    "$/stages/act_verify/attempts/1",
  );
  assertEqual(failure.sequence, 1, "$/stages/act_verify/attempts/0/sequence");
  assertEqual(
    failure.previous_attempt_id,
    null,
    "$/stages/act_verify/attempts/0/previous_attempt_id",
  );
  const failureId = requiredString(
    failure.attempt_id,
    "$/stages/act_verify/attempts/0/attempt_id",
  );
  assertEqual(recovery.sequence, 2, "$/stages/act_verify/attempts/1/sequence");
  assertEqual(
    recovery.previous_attempt_id,
    failureId,
    "$/stages/act_verify/attempts/1/previous_attempt_id",
  );
  const recoveryId = requiredString(
    recovery.attempt_id,
    "$/stages/act_verify/attempts/1/attempt_id",
  );
  if (recoveryId === failureId) {
    throw new GuidedWalkthroughError(
      "$/stages/act_verify/attempts/1/attempt_id must differ from the failed attempt id",
    );
  }

  const failureReadback = requiredObject(
    failure.independent_readback,
    "$/stages/act_verify/attempts/0/independent_readback",
  );
  const failureAcceptance = requiredObject(
    failure.effect_acceptance_evaluation,
    "$/stages/act_verify/attempts/0/effect_acceptance_evaluation",
  );
  const failureResult = requiredObject(
    failure.simulated_result,
    "$/stages/act_verify/attempts/0/simulated_result",
  );
  assertEqual(
    failureReadback.result,
    "mismatch",
    "$/stages/act_verify/attempts/0/independent_readback/result",
  );
  assertEqual(
    failureAcceptance.decision,
    "rejected",
    "$/stages/act_verify/attempts/0/effect_acceptance_evaluation/decision",
  );
  assertEqual(
    failureResult.status,
    "effect_rejected",
    "$/stages/act_verify/attempts/0/simulated_result/status",
  );
  assertEqual(
    failureResult.accepted,
    false,
    "$/stages/act_verify/attempts/0/simulated_result/accepted",
  );

  const recoveryReadback = requiredObject(
    recovery.independent_readback,
    "$/stages/act_verify/attempts/1/independent_readback",
  );
  const recoveryConnector = requiredObject(
    recovery.simulated_connector_response,
    "$/stages/act_verify/attempts/1/simulated_connector_response",
  );
  const failureObservedAt = Date.parse(
    requiredString(
      failureReadback.observed_at,
      "$/stages/act_verify/attempts/0/independent_readback/observed_at",
    ),
  );
  const recoveryReportedAt = Date.parse(
    requiredString(
      recoveryConnector.reported_at,
      "$/stages/act_verify/attempts/1/simulated_connector_response/reported_at",
    ),
  );
  if (recoveryReportedAt < failureObservedAt) {
    throw new GuidedWalkthroughError(
      "$/stages/act_verify/attempts/1 recovery connector cannot precede the failed attempt read-back",
    );
  }
  assertEqual(
    canonicalJson(recoveryReadback.expected_value),
    canonicalJson(failureReadback.expected_value),
    "$/stages/act_verify/attempts/1/independent_readback/expected_value",
  );
  assertEqual(
    recoveryReadback.source,
    failureReadback.source,
    "$/stages/act_verify/attempts/1/independent_readback/source",
  );
  const recoveryAcceptance = requiredObject(
    recovery.effect_acceptance_evaluation,
    "$/stages/act_verify/attempts/1/effect_acceptance_evaluation",
  );
  const recoveryResult = requiredObject(
    recovery.simulated_result,
    "$/stages/act_verify/attempts/1/simulated_result",
  );
  assertEqual(
    recoveryReadback.result,
    "match",
    "$/stages/act_verify/attempts/1/independent_readback/result",
  );
  assertEqual(
    recoveryAcceptance.decision,
    "accepted_simulation_only",
    "$/stages/act_verify/attempts/1/effect_acceptance_evaluation/decision",
  );
  assertEqual(
    recoveryResult.status,
    "effect_accepted_simulation_only",
    "$/stages/act_verify/attempts/1/simulated_result/status",
  );
  assertEqual(
    recoveryResult.accepted,
    true,
    "$/stages/act_verify/attempts/1/simulated_result/accepted",
  );

  const failureAction = requiredObject(
    failure.action,
    "$/stages/act_verify/attempts/0/action",
  );
  const recoveryAction = requiredObject(
    recovery.action,
    "$/stages/act_verify/attempts/1/action",
  );
  assertEqual(
    recoveryAction.idempotency_key,
    failureAction.idempotency_key,
    "$/stages/act_verify/attempts/1/action/idempotency_key",
  );

  const receiptPreview = requiredObject(
    stages.receipt_preview,
    "$/stages/receipt_preview",
  );
  const correction = requiredObject(
    receiptPreview.correction_preview,
    "$/stages/receipt_preview/correction_preview",
  );
  const correctionId = requiredString(
    correction.correction_id,
    "$/stages/receipt_preview/correction_preview/correction_id",
  );
  assertEqual(
    correction.based_on_attempt_id,
    failureId,
    "$/stages/receipt_preview/correction_preview/based_on_attempt_id",
  );
  const learning = requiredObject(
    receiptPreview.learning_candidate_preview,
    "$/stages/receipt_preview/learning_candidate_preview",
  );
  assertEqual(
    learning.source_correction_id,
    correctionId,
    "$/stages/receipt_preview/learning_candidate_preview/source_correction_id",
  );

  const trace = objectArray(
    receiptPreview.trace,
    "$/stages/receipt_preview/trace",
  );
  const expectedTrace = [
    ["evidence", conflictId],
    ["recommendation", packetId],
    ["authority", selectedActionId],
    ["payload", selectedActionId],
    ["connector_response", failureId],
    ["independent_verification", failureId],
    ["effect_rejection", failureId],
    ["accepted_simulated_result", recoveryId],
    ["correction", correctionId],
  ] as const;
  if (trace.length !== expectedTrace.length) {
    throw new GuidedWalkthroughError(
      "$/stages/receipt_preview/trace must contain the exact nine-step trace",
    );
  }
  for (const [index, entry] of trace.entries()) {
    assertEqual(
      requiredInteger(
        entry.sequence,
        `$/stages/receipt_preview/trace/${String(index)}/sequence`,
      ),
      index + 1,
      `$/stages/receipt_preview/trace/${String(index)}/sequence`,
    );
    const expected = expectedTrace[index];
    if (expected === undefined) {
      throw new GuidedWalkthroughError(
        "$/stages/receipt_preview/trace contains an unexpected entry",
      );
    }
    assertEqual(
      entry.kind,
      expected[0],
      `$/stages/receipt_preview/trace/${String(index)}/kind`,
    );
    assertEqual(
      entry.ref_id,
      expected[1],
      `$/stages/receipt_preview/trace/${String(index)}/ref_id`,
    );
  }
}

export function createGuidedWalkthroughRecord(
  untrustedWalkthrough: unknown,
  untrustedCaseFixture: unknown,
): GuidedWalkthroughRecord {
  assertValidGuidedWalkthrough(untrustedWalkthrough);
  assertValidCaseDocument(untrustedCaseFixture);
  const violations = validateCrossRecordInvariants(untrustedCaseFixture);
  if (violations.length > 0) {
    throw new GuidedWalkthroughError(
      `source fixture violates ${violations[0]?.code ?? "an invariant"}`,
    );
  }

  const walkthrough = requiredObject(
    canonicalizeJson(untrustedWalkthrough),
    "$",
  );
  const fixture = requiredObject(
    canonicalizeJson(untrustedCaseFixture),
    "fixture",
  );
  validateFixtureBindings(walkthrough, fixture);

  const document = immutableJson<JsonObject>(walkthrough);
  const source = requiredObject(document.source_fixture, "$/source_fixture");
  const safety = requiredObject(document.safety, "$/safety");
  if (safety.authoritative !== false || safety.replayable !== false) {
    throw new GuidedWalkthroughError(
      "guided walkthroughs must remain non-authoritative and non-replayable",
    );
  }

  return Object.freeze({
    walkthrough_id: requiredString(document.walkthrough_id, "$/walkthrough_id"),
    walkthrough_hash: sha256Json(document),
    fixture_id: requiredString(
      source.fixture_id,
      "$/source_fixture/fixture_id",
    ),
    fixture_hash: requiredString(
      source.fixture_hash,
      "$/source_fixture/fixture_hash",
    ) as `sha256:${string}`,
    authoritative: false,
    replayable: false,
    document,
  });
}
