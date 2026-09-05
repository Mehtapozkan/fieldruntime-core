import {
  SYNTHETIC_EVIDENCE,
  sha256Json,
} from "../../dist/packages/runtime/src/index.js";

export const TENANT = "tenant_orchid";
export const START = "2026-09-06T16:00:00.000Z";
export function workEvent(id, source = "intake") {
  const ref = `synthetic://d6/${source}`;
  return {
    id: `work_event_${id}`,
    tenant_id: TENANT,
    source: "synthetic_d6",
    source_event_id: `source_${id}`,
    event_type: "message.created",
    actor_identity_id: "identity_d6_operator",
    scope_ids: ["scope_customer_ops"],
    occurred_at: "2026-09-01T12:00:00.000Z",
    source_timezone: "UTC",
    content_hash: sha256Json(SYNTHETIC_EVIDENCE[ref]),
    payload_ref: ref,
    classification: "internal",
    idempotency_key: `event:${id}`,
  };
}
export function caseCommand(id = "d6_demo") {
  return {
    type: "case.create",
    tenant_id: TENANT,
    expected_case_version: 0,
    actor_identity_id: "identity_d6_operator",
    idempotency_key: `case:${id}`,
    correlation_id: `trace:${id}`,
    case_seed: {
      tenant: {
        id: TENANT,
        name: "Synthetic D6 Tenant",
        status: "active",
        data_region: "local",
        retention_policy_id: "retention_eval_v0",
      },
      workflow_version: {
        id: "workflow_ecc_v0_1_0",
        workflow_id: "customer_escalation_commitment_control",
        version: "0.1.0",
        status: "shadow",
        decision_graph_id: "ecc_decision_graph_v0",
        policy_version_ids: ["policy_d6_financial_remedy"],
        eval_suite_version: "0.1.0",
        effective_from: "2026-01-01T00:00:00.000Z",
        effective_from_source_timezone: "UTC",
      },
      case: {
        id: `case_${id}`,
        tenant_id: TENANT,
        workflow_version_id: "workflow_ecc_v0_1_0",
        customer_ref: "synthetic://accounts/orchid",
        issue_fingerprint: `d6:${id}`,
        severity: "high",
        owner_identity_id: "identity_d6_operator",
        scope_ids: ["scope_customer_ops"],
        related_case_ids: [],
      },
    },
    trigger_event: workEvent(id),
  };
}
export function createRequestCommand(
  caseId = "case_d6_demo",
  key = "request:demo",
  overrides = {},
) {
  return {
    type: "authority.request.create",
    tenant_id: TENANT,
    case_id: caseId,
    expected_case_version: 1,
    expected_authority_state_revision: 1,
    proposal_key: "credit_15000",
    idempotency_key: key,
    correlation_id: "d6-demo",
    ...overrides,
  };
}
export function decideCommand(
  packet,
  key,
  decision = "approve",
  overrides = {},
) {
  return {
    type: "authority.request.decide",
    tenant_id: TENANT,
    case_id: packet.case_id,
    authority_request_id: packet.authority_request_id,
    expected_case_version: packet.case_version,
    expected_review_revision: packet.review_revision,
    expected_authority_state_revision: packet.authority_state_revision,
    request_binding_hash: packet.request_binding_hash,
    idempotency_key: key,
    correlation_id: "d6-demo",
    decision,
    ...overrides,
  };
}
