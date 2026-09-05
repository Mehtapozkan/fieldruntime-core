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
    occurred_at: SYNTHETIC_EVIDENCE[ref].observed_at,
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

// A runtime-controlled test profile, separate from the default named-Finance policy.
export function allowEitherFinanceReviewer(data) {
  const rule = data.policies[0].rules.find(
    (item) => item.rule_id === "rule_d6_medium",
  );
  const requirement = Object.fromEntries(
    Object.entries(rule.requirements[0]).filter(
      ([key]) => key !== "named_approver_identity_ids",
    ),
  );
  data.policies[0].rules = [
    {
      ...rule,
      condition: { currency: "USD", minimum_amount_minor: 0 },
      requirements: [
        { ...requirement, required_approval_count: 1, allow_delegation: true },
      ],
    },
  ];
}

export function restrictFinanceDelegate(data, restriction) {
  allowEitherFinanceReviewer(data);
  if (restriction === "revoked identity")
    data.identities.find(
      (identity) => identity.identity_id === data.actors.finance_delegate,
    ).status = "revoked";
  if (restriction === "expired grant")
    data.delegations[0].effective_until = "2026-09-06T16:00:01.000Z";
  if (restriction === "wrong scope")
    data.delegations[0].scope.organization_scope_ids = ["scope_other"];
  if (restriction === "revoked grant") {
    data.delegations[0].status = "revoked";
    data.delegations[0].revocation = {
      revoked_by_identity: data.identities.find(
        (identity) => identity.identity_id === data.actors.executive,
      ),
      revoked_at: START,
      revoked_at_source_timezone: "UTC",
      reason: "Synthetic grant withdrawn",
      source_ref: "synthetic://d6/revocation",
    };
  }
}
