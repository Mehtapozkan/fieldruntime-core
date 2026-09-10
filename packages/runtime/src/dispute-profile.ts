import { sha256Json } from "../../contracts/src/index.js";
import {
  INTAKE_ACTOR,
  INTAKE_TENANT,
  intakeObject as o,
  intakeList as list,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "./intake.js";
import { normalizeAuthorityCatalogData } from "./authority-review.js";
const FROM = "2026-01-01T00:00:00.000Z",
  UNTIL = "2027-01-01T00:00:00.000Z";
export const DISPUTE_IDS = {
  operator: "identity_intake_operator",
  decision: "identity_dispute_morgan",
  verifier: "identity_dispute_verifier",
  reporter: "identity_dispute_reporter",
  recipient: "identity_dispute_robin",
  evaluator: "identity_dispute_evaluator",
};
export function disputeIdentity(role: keyof typeof DISPUTE_IDS): Obj {
  return {
    schema_version: "identity-reference.v0",
    identity_id: DISPUTE_IDS[role],
    tenant_id: INTAKE_TENANT,
    identity_kind: ["verifier", "evaluator"].includes(role)
      ? "service"
      : "human",
    status: "active",
  };
}
export function disputeCatalog(subject: Obj, previous?: Obj): Obj {
  const identity = disputeIdentity;
  const grants = (
    ["decision", "verifier", "reporter", "recipient"] as const
  ).map((role) => ({
    schema_version: "authority-record.v0",
    authority_record_id: `authority_dispute_${role}_${sha256Json(subject).slice(7, 23)}`,
    tenant_id: INTAKE_TENANT,
    identity: identity(role),
    authority_class:
      role === "decision" ? "invoice_dispute_no_adjustment" : `dispute_${role}`,
    authority_rank: 1,
    status: "active",
    scope: {
      case_ids: [subject.case_id],
      organization_scope_ids: ["scope_entity_north"],
      action_classes: [
        role === "decision"
          ? "uphold_invoice_no_adjustment"
          : `dispute_${role}`,
      ],
    },
    effective_from: FROM,
    effective_from_source_timezone: "UTC",
    effective_until: UNTIL,
    effective_until_source_timezone: "UTC",
    source_type: "authoritative_registry",
    source_ref: `synthetic://dispute-result/${sha256Json(subject)}/${role}`,
  }));
  const data = previous ?? {
    actors: {
      operator: INTAKE_ACTOR.identity_id,
      business: DISPUTE_IDS.decision,
      finance: DISPUTE_IDS.recipient,
      executive: DISPUTE_IDS.reporter,
      finance_delegate: DISPUTE_IDS.operator,
      evaluator: DISPUTE_IDS.evaluator,
    },
    identities: Object.keys(DISPUTE_IDS).map((k) =>
      identity(k as keyof typeof DISPUTE_IDS),
    ),
    policies: [
      {
        schema_version: "authority-policy.v0",
        policy_id: "policy_dispute_no_adjustment",
        policy_version: "1.0.0",
        tenant_id: INTAKE_TENANT,
        authority_class: "invoice_dispute_no_adjustment",
        action_class: "uphold_invoice_no_adjustment",
        consequence_class: "invoice_dispute_no_adjustment",
        status: "approved",
        authority_rank: 1,
        effective_from: FROM,
        effective_from_source_timezone: "UTC",
        effective_until: UNTIL,
        effective_until_source_timezone: "UTC",
        source_ref: "synthetic://dispute-result/policy/no-adjustment/1",
        rules: [
          {
            rule_id: "rule_dispute_no_adjustment",
            priority: 1,
            condition: { currency: "USD", minimum_amount_minor: 0 },
            requirements: [
              {
                requirement_id: "requirement_dispute_morgan",
                authority_class: "invoice_dispute_no_adjustment",
                required_approval_count: 1,
                allow_delegation: false,
                allow_preparer_approval: false,
                named_approver_identity_ids: [DISPUTE_IDS.decision],
              },
            ],
          },
        ],
      },
    ],
    authority_records: [],
    delegations: [],
  };
  return normalizeAuthorityCatalogData(
    {
      ...data,
      authority_records: [...list(data.authority_records), ...grants],
    },
    INTAKE_TENANT,
  );
}
export function disputeActor(
  data: Obj,
  role: keyof typeof DISPUTE_IDS,
  subject: Obj,
  at: string,
): Obj {
  const identities = list(data.identities).filter(
    (i) => i.identity_id === DISPUTE_IDS[role],
  );
  ensure(
    identities.length === 1 &&
      identities[0]?.status === "active" &&
      identities[0].tenant_id === INTAKE_TENANT &&
      identities[0].identity_kind ===
        (role === "verifier" || role === "evaluator" ? "service" : "human"),
    "REVIEWER_INELIGIBLE",
    `Current synthetic ${role} identity is unavailable`,
  );
  const identity = identities[0];
  if (role !== "operator" && role !== "evaluator") {
    const grants = list(data.authority_records).filter(
      (g) =>
        g.source_ref ===
        `synthetic://dispute-result/${sha256Json(subject)}/${role}`,
    );
    ensure(
      grants.length === 1,
      "REVIEWER_INELIGIBLE",
      `Exact ${role} grant is missing or contradictory`,
    );
    const g = o(grants[0]),
      scope = o(g.scope);
    ensure(
      g.status === "active" &&
        g.tenant_id === INTAKE_TENANT &&
        sha256Json(g.identity) === sha256Json(identity) &&
        g.authority_class ===
          (role === "decision"
            ? "invoice_dispute_no_adjustment"
            : `dispute_${role}`) &&
        String(g.effective_from) <= at &&
        at < String(g.effective_until) &&
        Array.isArray(scope.case_ids) &&
        scope.case_ids.includes(subject.case_id) &&
        Array.isArray(scope.organization_scope_ids) &&
        scope.organization_scope_ids.includes("scope_entity_north") &&
        Array.isArray(scope.action_classes) &&
        scope.action_classes.includes(
          role === "decision"
            ? "uphold_invoice_no_adjustment"
            : `dispute_${role}`,
        ),
      "REVIEWER_INELIGIBLE",
      `Current ${role} grant is revoked, expired or outside scope`,
    );
  }
  if (role === "verifier")
    ensure(
      ![
        DISPUTE_IDS.operator,
        DISPUTE_IDS.decision,
        DISPUTE_IDS.reporter,
        DISPUTE_IDS.recipient,
      ].includes(String(identity.identity_id)),
      "REVIEWER_INELIGIBLE",
      "Executor or recipient cannot verify their own result",
    );
  return identity;
}
