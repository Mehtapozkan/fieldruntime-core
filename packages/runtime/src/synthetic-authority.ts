import { sha256Json } from "../../contracts/src/index.js";
import type { CaseAggregate } from "./case-engine.js";
import {
  AuthorityReviewError,
  REVIEW_VERSIONS,
  type ReviewVersions,
  json,
  object,
  objects,
  string,
  type ObjectValue,
} from "./authority-review-types.js";

export const SYNTHETIC_AUTHORITY_TENANT = "tenant_orchid";
export const SYNTHETIC_REVIEW_TTL_MS = 60 * 60 * 1000;
const START = "2026-01-01T00:00:00.000Z";

// Compiled synthetic records, never imported from the frozen ECC corpus or a
// caller's Case identity/role metadata. Only this tenant is enrolled by default.
export function syntheticAuthorityCatalog(): ObjectValue {
  const identity = (key: string, kind = "human"): ObjectValue => ({
    schema_version: "identity-reference.v0",
    identity_id: `identity_d6_${key}`,
    tenant_id: SYNTHETIC_AUTHORITY_TENANT,
    identity_kind: kind,
    status: "active",
  });
  const people = [
    "operator",
    "business",
    "finance",
    "executive",
    "finance_delegate",
  ].map((key) => identity(key));
  const evaluator = identity("evaluator", "service");
  const finance = identity("finance"),
    executive = identity("executive");
  const policyRef = {
    policy_id: "policy_d6_financial_remedy",
    policy_version: "1.0.0",
  };
  const requirement = (key: string, authority: string): ObjectValue => ({
    requirement_id: `requirement_d6_${key}`,
    authority_class: authority,
    required_approval_count: 1,
    allow_delegation: key === "finance",
    allow_preparer_approval: false,
    ...(key === "finance"
      ? { named_approver_identity_ids: ["identity_d6_finance"] }
      : {}),
  });
  const scope = {
    organization_scope_ids: ["scope_customer_ops"],
    action_classes: ["customer_credit"],
    consequence_classes: ["financial_remedy"],
  };
  return json({
    actors: Object.fromEntries(
      [...people, evaluator].map((person) => [
        string(person.identity_id).replace("identity_d6_", ""),
        person.identity_id,
      ]),
    ),
    identities: [...people, evaluator],
    policies: [
      {
        schema_version: "authority-policy.v0",
        ...policyRef,
        tenant_id: SYNTHETIC_AUTHORITY_TENANT,
        authority_class: "financial_remedy",
        action_class: "customer_credit",
        consequence_class: "financial_remedy",
        status: "approved",
        authority_rank: 1,
        effective_from: START,
        effective_from_source_timezone: "UTC",
        source_ref: "synthetic://d6/policy/financial-remedy/1",
        rules: [
          {
            rule_id: "rule_d6_small",
            priority: 1,
            condition: {
              currency: "USD",
              minimum_amount_minor: 0,
              maximum_amount_minor: 500000,
            },
            requirements: [requirement("business", "business_approver")],
          },
          {
            rule_id: "rule_d6_medium",
            priority: 1,
            condition: {
              currency: "USD",
              minimum_amount_minor: 500001,
              maximum_amount_minor: 1000000,
            },
            requirements: [requirement("finance", "finance_approver")],
          },
          {
            rule_id: "rule_d6_large",
            priority: 1,
            condition: { currency: "USD", minimum_amount_minor: 1000001 },
            requirements: [
              requirement("finance", "finance_approver"),
              requirement("executive", "executive_sponsor"),
            ],
          },
        ],
      },
    ],
    authority_records: (
      [
        ["business", "business_approver"],
        ["finance", "finance_approver"],
        ["executive", "executive_sponsor"],
      ] as const
    ).map(([key, authority]) => ({
      schema_version: "authority-record.v0",
      authority_record_id: `authority_d6_${key}`,
      tenant_id: SYNTHETIC_AUTHORITY_TENANT,
      identity: identity(key),
      authority_class: authority,
      authority_rank: 1,
      status: "active",
      scope,
      effective_from: START,
      effective_from_source_timezone: "UTC",
      source_type: "authoritative_registry",
      source_ref: `synthetic://d6/authority/${key}`,
    })),
    delegations: [
      {
        schema_version: "delegation-grant.v0",
        delegation_id: "delegation_d6_finance",
        tenant_id: SYNTHETIC_AUTHORITY_TENANT,
        delegator_identity: finance,
        delegate_identity: identity("finance_delegate"),
        scope: { ...scope, authority_classes: ["finance_approver"] },
        status: "active",
        effective_from: START,
        effective_from_source_timezone: "UTC",
        effective_until: "2030-01-01T00:00:00.000Z",
        effective_until_source_timezone: "UTC",
        policy_reference: policyRef,
        provenance: {
          source_type: "approved_delegation",
          source_ref: "synthetic://d6/delegation/finance",
          recorded_by_identity: finance,
          recorded_at: START,
          recorded_at_source_timezone: "UTC",
        },
        created_by_identity: finance,
        approved_by_identity: executive,
        created_at: START,
        created_at_source_timezone: "UTC",
      },
    ],
  });
}

export const SYNTHETIC_EVIDENCE = json({
  "synthetic://d6/intake": {
    source: "synthetic_customer_report",
    body: "Customer requests a service credit after an interruption.",
    observed_at: "2026-09-01T15:00:00.000Z",
    source_timezone: "UTC",
    conflict: "Customer-reported impact has not been independently confirmed.",
  },
  "synthetic://d6/update": {
    source: "synthetic_operations_report",
    body: "New operational evidence changes the estimated interruption duration.",
    observed_at: "2026-09-01T15:30:00.000Z",
    source_timezone: "UTC",
    conflict: "Operational duration differs from the original customer report.",
  },
});

export function syntheticReviewMaterial(
  aggregate: CaseAggregate,
  proposal: string,
  versions: ReviewVersions = REVIEW_VERSIONS,
): ObjectValue {
  const record = object(aggregate.document.case);
  const amounts: Readonly<Record<string, number>> = {
    credit_4000: 400000,
    credit_7000: 700000,
    credit_12000: 1200000,
    credit_15000: 1500000,
  };
  const amount = amounts[proposal];
  if (
    amount === undefined ||
    aggregate.tenant_id !== SYNTHETIC_AUTHORITY_TENANT
  ) {
    throw new AuthorityReviewError(
      "REVIEW_INPUT_INVALID",
      "unknown synthetic proposal or tenant",
    );
  }
  const evidence = objects(aggregate.document.events).map((event) => {
    const content = SYNTHETIC_EVIDENCE[string(event.payload_ref)];
    if (content === undefined || sha256Json(content) !== event.content_hash) {
      throw new AuthorityReviewError(
        "EVIDENCE_UNAVAILABLE",
        "Case evidence must resolve to retained synthetic source content",
      );
    }
    return { work_event: event, content: object(content) };
  });
  if (evidence.length === 0)
    throw new AuthorityReviewError(
      "EVIDENCE_UNAVAILABLE",
      "review requires cited evidence",
    );
  return json({
    schema_version: "authority-review-material.v1",
    tenant_id: aggregate.tenant_id,
    case_id: aggregate.case_id,
    case_version: record.version,
    proposal_key: proposal,
    consequence: {
      consequence_class: "financial_remedy",
      account_ref: record.customer_ref,
      amount_minor: amount,
      currency: "USD",
    },
    evidence,
    conflicts: evidence.map((item) => ({
      source_ref: item.work_event.payload_ref,
      description: item.content.conflict,
    })),
    unknowns: ["Independent impact verification remains outstanding."],
    freshness_basis:
      "Evidence is pinned to the exact Case journal head; the synthetic policy imposes no additional age cutoff.",
    recommendation:
      "Review the exact proposed credit and cited conflicting evidence. This synthetic review grants no action or closure permission.",
    implementation_versions: versions,
  });
}
