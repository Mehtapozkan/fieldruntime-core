import { canonicalizeJson, type JsonValue } from "./canonical-json.js";

type UnknownRecord = Record<string, unknown>;

const RESPONSIBILITY_ROLES = [
  "case_owner",
  "delegated_worker",
  "authority_owner",
  "executor",
  "verifier",
] as const;

export interface AuthorityContractViolation {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownValue(record: UnknownRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function stringField(record: UnknownRecord, key: string): string | undefined {
  const value = ownValue(record, key);
  return typeof value === "string" ? value : undefined;
}

function integerField(record: UnknownRecord, key: string): number | undefined {
  const value = ownValue(record, key);
  return Number.isInteger(value) ? (value as number) : undefined;
}

function recordField(
  record: UnknownRecord,
  key: string,
): UnknownRecord | undefined {
  const value = ownValue(record, key);
  return isRecord(value) ? value : undefined;
}

function recordsField(
  record: UnknownRecord,
  key: string,
): readonly UnknownRecord[] {
  const value = ownValue(record, key);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function stringsField(record: UnknownRecord, key: string): readonly string[] {
  const value = ownValue(record, key);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizedRecord(
  value: unknown,
  contract: string,
): {
  readonly record?: UnknownRecord;
  readonly violations: AuthorityContractViolation[];
} {
  let normalized: JsonValue;
  try {
    normalized = canonicalizeJson(value);
  } catch (error) {
    return {
      violations: [
        {
          code: "contract.non_canonical_json",
          message:
            error instanceof Error
              ? error.message
              : `${contract} is not canonical JSON.`,
          path: "/",
        },
      ],
    };
  }

  if (!isRecord(normalized)) {
    return {
      violations: [
        {
          code: "contract.object_required",
          message: `${contract} must be an object.`,
          path: "/",
        },
      ],
    };
  }

  return { record: normalized, violations: [] };
}

function checkIdentityTenant(
  identity: UnknownRecord | undefined,
  tenantId: string | undefined,
  path: string,
  violations: AuthorityContractViolation[],
): void {
  if (
    identity !== undefined &&
    tenantId !== undefined &&
    stringField(identity, "tenant_id") !== tenantId
  ) {
    violations.push({
      code: "identity.tenant_mismatch",
      message: "An identity reference belongs to another tenant.",
      path: `${path}/tenant_id`,
    });
  }
}

function compareBindingField(
  request: UnknownRecord,
  bound: UnknownRecord,
  requestKey: string,
  boundKey: string,
  code: string,
  message: string,
  path: string,
  violations: AuthorityContractViolation[],
): void {
  const requestValue = ownValue(request, requestKey);
  const boundValue = ownValue(bound, boundKey);
  if (requestValue !== undefined && boundValue !== requestValue) {
    violations.push({ code, message, path });
  }
}

function checkPolicyBinding(
  request: UnknownRecord,
  bound: UnknownRecord,
  path: string,
  violations: AuthorityContractViolation[],
): void {
  const requestedPolicy = recordField(request, "policy_reference");
  if (requestedPolicy === undefined) {
    return;
  }
  const boundPolicy = recordField(bound, "policy_reference");
  if (
    boundPolicy === undefined ||
    stringField(boundPolicy, "policy_id") !==
      stringField(requestedPolicy, "policy_id") ||
    stringField(boundPolicy, "policy_version") !==
      stringField(requestedPolicy, "policy_version")
  ) {
    violations.push({
      code: "authority.policy_binding_mismatch",
      message:
        "The authority record does not bind the Authority Request policy identity and version.",
      path,
    });
  }
}

export function validateCaseResponsibilityInvariants(
  value: unknown,
): AuthorityContractViolation[] {
  const normalized = normalizedRecord(value, "Case Responsibility");
  if (normalized.record === undefined) {
    return normalized.violations;
  }
  const root = normalized.record;
  const violations = [...normalized.violations];
  const tenantId = stringField(root, "tenant_id");
  const responsibilities = recordField(root, "responsibilities");

  checkIdentityTenant(
    recordField(root, "recorded_by_identity"),
    tenantId,
    "/recorded_by_identity",
    violations,
  );

  if (responsibilities !== undefined) {
    for (const role of RESPONSIBILITY_ROLES) {
      const binding = recordField(responsibilities, role);
      checkIdentityTenant(
        binding === undefined ? undefined : recordField(binding, "identity"),
        tenantId,
        `/responsibilities/${role}/identity`,
        violations,
      );
    }

    const authorityOwnerIdentity = recordField(
      recordField(responsibilities, "authority_owner") ?? {},
      "identity",
    );
    if (
      stringField(authorityOwnerIdentity ?? {}, "identity_kind") === "agent"
    ) {
      violations.push({
        code: "authority.agent_cannot_own_authority",
        message: "An agent cannot be the business authority owner.",
        path: "/responsibilities/authority_owner/identity/identity_kind",
      });
    }

    const executorId = stringField(
      recordField(
        recordField(responsibilities, "executor") ?? {},
        "identity",
      ) ?? {},
      "identity_id",
    );
    const verifierId = stringField(
      recordField(
        recordField(responsibilities, "verifier") ?? {},
        "identity",
      ) ?? {},
      "identity_id",
    );
    if (
      executorId !== undefined &&
      verifierId !== undefined &&
      executorId === verifierId
    ) {
      violations.push({
        code: "responsibility.verifier_not_independent",
        message: "Executor and verifier must use distinct identities.",
        path: "/responsibilities/verifier/identity/identity_id",
      });
    }
  }

  return violations;
}

export function validateDelegationGrantInvariants(
  value: unknown,
): AuthorityContractViolation[] {
  const normalized = normalizedRecord(value, "Delegation Grant");
  if (normalized.record === undefined) {
    return normalized.violations;
  }
  const root = normalized.record;
  const violations = [...normalized.violations];
  const tenantId = stringField(root, "tenant_id");
  const identityPaths = [
    "delegator_identity",
    "delegate_identity",
    "created_by_identity",
    "approved_by_identity",
  ] as const;
  for (const path of identityPaths) {
    checkIdentityTenant(
      recordField(root, path),
      tenantId,
      `/${path}`,
      violations,
    );
  }
  checkIdentityTenant(
    recordField(recordField(root, "provenance") ?? {}, "recorded_by_identity"),
    tenantId,
    "/provenance/recorded_by_identity",
    violations,
  );
  checkIdentityTenant(
    recordField(recordField(root, "revocation") ?? {}, "revoked_by_identity"),
    tenantId,
    "/revocation/revoked_by_identity",
    violations,
  );

  const delegatorId = stringField(
    recordField(root, "delegator_identity") ?? {},
    "identity_id",
  );
  const delegateId = stringField(
    recordField(root, "delegate_identity") ?? {},
    "identity_id",
  );
  if (
    delegatorId !== undefined &&
    delegateId !== undefined &&
    delegatorId === delegateId
  ) {
    violations.push({
      code: "delegation.self_delegation",
      message:
        "A delegation must identify distinct delegator and delegate identities.",
      path: "/delegate_identity/identity_id",
    });
  }

  const effectiveFrom = stringField(root, "effective_from");
  const effectiveUntil = stringField(root, "effective_until");
  if (
    effectiveFrom !== undefined &&
    effectiveUntil !== undefined &&
    effectiveUntil <= effectiveFrom
  ) {
    violations.push({
      code: "delegation.invalid_effective_window",
      message: "Delegation expiry must be later than its effective start.",
      path: "/effective_until",
    });
  }

  return violations;
}

export function validateAuthorityRequestInvariants(
  value: unknown,
): AuthorityContractViolation[] {
  const normalized = normalizedRecord(value, "Authority Request");
  if (normalized.record === undefined) {
    return normalized.violations;
  }
  const root = normalized.record;
  const violations = [...normalized.violations];
  checkIdentityTenant(
    recordField(root, "prepared_by_identity"),
    stringField(root, "tenant_id"),
    "/prepared_by_identity",
    violations,
  );
  return violations;
}

export function validateAuthorityPolicyInvariants(
  value: unknown,
): AuthorityContractViolation[] {
  const normalized = normalizedRecord(value, "Authority Policy");
  if (normalized.record === undefined) {
    return normalized.violations;
  }
  const root = normalized.record;
  const violations = [...normalized.violations];
  const effectiveFrom = stringField(root, "effective_from");
  const effectiveUntil = stringField(root, "effective_until");
  if (
    effectiveFrom !== undefined &&
    effectiveUntil !== undefined &&
    effectiveUntil <= effectiveFrom
  ) {
    violations.push({
      code: "policy.invalid_effective_window",
      message: "Policy expiry must be later than its effective start.",
      path: "/effective_until",
    });
  }

  const seenRuleIds = new Set<string>();
  const rules = recordsField(root, "rules");
  for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
    const rule = rules[ruleIndex] ?? {};
    const ruleId = stringField(rule, "rule_id");
    if (ruleId !== undefined) {
      if (seenRuleIds.has(ruleId)) {
        violations.push({
          code: "policy.duplicate_rule_id",
          message: "Policy rule identifiers must be unique.",
          path: `/rules/${String(ruleIndex)}/rule_id`,
        });
      }
      seenRuleIds.add(ruleId);
    }

    const condition = recordField(rule, "condition");
    const minimum = integerField(condition ?? {}, "minimum_amount_minor");
    const maximum = integerField(condition ?? {}, "maximum_amount_minor");
    if (minimum !== undefined && maximum !== undefined && maximum < minimum) {
      violations.push({
        code: "policy.invalid_amount_range",
        message: "A policy maximum amount cannot be below its minimum amount.",
        path: `/rules/${String(ruleIndex)}/condition/maximum_amount_minor`,
      });
    }

    const requirements = recordsField(rule, "requirements");
    const seenRequirementIds = new Set<string>();
    for (
      let requirementIndex = 0;
      requirementIndex < requirements.length;
      requirementIndex += 1
    ) {
      const requirement = requirements[requirementIndex] ?? {};
      const requirementId = stringField(requirement, "requirement_id");
      if (requirementId !== undefined) {
        if (seenRequirementIds.has(requirementId)) {
          violations.push({
            code: "policy.duplicate_requirement_id",
            message: "Policy requirement identifiers must be unique.",
            path: `/rules/${String(ruleIndex)}/requirements/${String(requirementIndex)}/requirement_id`,
          });
        }
        seenRequirementIds.add(requirementId);
      }

      const namedApprovers = stringsField(
        requirement,
        "named_approver_identity_ids",
      );
      const requiredCount = integerField(
        requirement,
        "required_approval_count",
      );
      if (
        namedApprovers.length > 0 &&
        requiredCount !== undefined &&
        namedApprovers.length !== requiredCount
      ) {
        violations.push({
          code: "policy.named_approver_count_mismatch",
          message:
            "Named approvers must identify every required accountable approval.",
          path: `/rules/${String(ruleIndex)}/requirements/${String(requirementIndex)}/named_approver_identity_ids`,
        });
      }
    }
  }
  return violations;
}

export function validateAuthorityRecordInvariants(
  value: unknown,
): AuthorityContractViolation[] {
  const normalized = normalizedRecord(value, "Authority Record");
  if (normalized.record === undefined) {
    return normalized.violations;
  }
  const root = normalized.record;
  const violations = [...normalized.violations];
  const identity = recordField(root, "identity");
  checkIdentityTenant(
    identity,
    stringField(root, "tenant_id"),
    "/identity",
    violations,
  );
  if (stringField(identity ?? {}, "identity_kind") === "agent") {
    violations.push({
      code: "authority.agent_cannot_own_authority",
      message: "An agent cannot be the business authority owner.",
      path: "/identity/identity_kind",
    });
  }

  const effectiveFrom = stringField(root, "effective_from");
  const effectiveUntil = stringField(root, "effective_until");
  if (
    effectiveFrom !== undefined &&
    effectiveUntil !== undefined &&
    effectiveUntil <= effectiveFrom
  ) {
    violations.push({
      code: "authority_record.invalid_effective_window",
      message: "Authority expiry must be later than its effective start.",
      path: "/effective_until",
    });
  }
  return violations;
}

export function validateAuthorityDecisionInvariants(
  value: unknown,
): AuthorityContractViolation[] {
  const normalized = normalizedRecord(value, "Authority Decision");
  if (normalized.record === undefined) {
    return normalized.violations;
  }
  const root = normalized.record;
  const violations = [...normalized.violations];
  const tenantId = stringField(root, "tenant_id");
  const approver = recordField(root, "approver_identity");
  checkIdentityTenant(approver, tenantId, "/approver_identity", violations);
  checkIdentityTenant(
    recordField(recordField(root, "lineage") ?? {}, "recorded_by_identity"),
    tenantId,
    "/lineage/recorded_by_identity",
    violations,
  );
  if (stringField(approver ?? {}, "identity_kind") === "agent") {
    violations.push({
      code: "authority.agent_cannot_decide",
      message:
        "An agent may prepare an Authority Request but cannot manufacture an Authority Decision.",
      path: "/approver_identity/identity_kind",
    });
  }
  return violations;
}

export function validateAuthorityResolutionResultInvariants(
  value: unknown,
): AuthorityContractViolation[] {
  const normalized = normalizedRecord(value, "Authority Resolution Result");
  if (normalized.record === undefined) {
    return normalized.violations;
  }
  const root = normalized.record;
  const violations = [...normalized.violations];
  const tenantId = stringField(root, "tenant_id");
  const authorityOwner = recordField(root, "authority_owner");
  checkIdentityTenant(authorityOwner, tenantId, "/authority_owner", violations);
  checkIdentityTenant(
    recordField(root, "evaluated_by_identity"),
    tenantId,
    "/evaluated_by_identity",
    violations,
  );
  const candidates = recordsField(root, "authority_candidates");
  for (let index = 0; index < candidates.length; index += 1) {
    checkIdentityTenant(
      recordField(candidates[index] ?? {}, "identity"),
      tenantId,
      `/authority_candidates/${String(index)}/identity`,
      violations,
    );
  }
  if (stringField(authorityOwner ?? {}, "identity_kind") === "agent") {
    violations.push({
      code: "authority.agent_cannot_own_authority",
      message: "An agent cannot be the business authority owner.",
      path: "/authority_owner/identity_kind",
    });
  }

  const requirements = recordsField(root, "authority_requirements");
  const outstandingClasses = new Set<string>();
  for (let index = 0; index < requirements.length; index += 1) {
    const requirement = requirements[index] ?? {};
    const requiredCount = integerField(requirement, "required_approval_count");
    const satisfiedIds = stringsField(requirement, "satisfied_approval_ids");
    const remainingCount = integerField(
      requirement,
      "remaining_approval_count",
    );
    const status = stringField(requirement, "status");
    const authorityClass = stringField(requirement, "authority_class");
    if (
      requiredCount !== undefined &&
      remainingCount !== undefined &&
      satisfiedIds.length + remainingCount !== requiredCount
    ) {
      violations.push({
        code: "authority.requirement_count_mismatch",
        message:
          "Satisfied and remaining approval counts must equal the required count.",
        path: `/authority_requirements/${String(index)}/remaining_approval_count`,
      });
    }
    if (
      (status === "satisfied" && remainingCount !== 0) ||
      (status === "outstanding" && remainingCount === 0)
    ) {
      violations.push({
        code: "authority.requirement_status_mismatch",
        message:
          "Requirement status must agree with its remaining approval count.",
        path: `/authority_requirements/${String(index)}/status`,
      });
    }
    if (status === "outstanding" && authorityClass !== undefined) {
      outstandingClasses.add(authorityClass);
    }
    for (const candidate of recordsField(requirement, "eligible_approvers")) {
      checkIdentityTenant(
        recordField(candidate, "identity"),
        tenantId,
        `/authority_requirements/${String(index)}/eligible_approvers/identity`,
        violations,
      );
    }
  }

  const outcome = stringField(root, "outcome");
  if (
    outcome === "authorized" &&
    requirements.some(
      (requirement) => stringField(requirement, "status") !== "satisfied",
    )
  ) {
    violations.push({
      code: "authority.authorized_with_outstanding_requirement",
      message: "Authorized results cannot contain outstanding requirements.",
      path: "/authority_requirements",
    });
  }
  if (outcome === "approval_required") {
    const declaredClasses = new Set(
      stringsField(root, "required_authority_classes"),
    );
    if (
      outstandingClasses.size === 0 ||
      declaredClasses.size !== outstandingClasses.size ||
      [...outstandingClasses].some((item) => !declaredClasses.has(item))
    ) {
      violations.push({
        code: "authority.outstanding_class_mismatch",
        message:
          "Approval-required results must identify every outstanding authority class.",
        path: "/required_authority_classes",
      });
    }
  }

  if (outcome === "conflicting_authority" && candidates.length > 0) {
    const ranks = candidates
      .map((candidate) => integerField(candidate, "authority_rank"))
      .filter((rank): rank is number => rank !== undefined);
    if (!ranks.some((rank, index) => ranks.indexOf(rank) !== index)) {
      violations.push({
        code: "authority.conflict_requires_same_rank",
        message:
          "A conflicting-authority result must preserve at least two same-rank candidates.",
        path: "/authority_candidates",
      });
    }
  }

  return violations;
}

export function validateAuthorityDecisionBinding(
  requestValue: unknown,
  decisionValue: unknown,
): AuthorityContractViolation[] {
  const request = normalizedRecord(requestValue, "Authority Request");
  const decision = normalizedRecord(decisionValue, "Authority Decision");
  const violations = [...request.violations, ...decision.violations];
  if (request.record === undefined || decision.record === undefined) {
    return violations;
  }

  compareBindingField(
    request.record,
    decision.record,
    "authority_request_id",
    "authority_request_id",
    "authority.request_binding_mismatch",
    "The Authority Decision references another Authority Request.",
    "/authority_request_id",
    violations,
  );
  compareBindingField(
    request.record,
    decision.record,
    "tenant_id",
    "tenant_id",
    "authority.tenant_binding_mismatch",
    "The Authority Decision belongs to another tenant.",
    "/tenant_id",
    violations,
  );
  compareBindingField(
    request.record,
    decision.record,
    "case_id",
    "case_id",
    "authority.case_binding_mismatch",
    "The Authority Decision belongs to another Case.",
    "/case_id",
    violations,
  );
  compareBindingField(
    request.record,
    decision.record,
    "case_version",
    "case_version",
    "authority.case_version_binding_mismatch",
    "The Authority Decision does not bind the exact requested Case version.",
    "/case_version",
    violations,
  );
  compareBindingField(
    request.record,
    decision.record,
    "proposed_consequence_hash",
    "proposed_consequence_hash",
    "authority.consequence_binding_mismatch",
    "The Authority Decision does not bind the exact proposed consequence hash.",
    "/proposed_consequence_hash",
    violations,
  );
  compareBindingField(
    request.record,
    decision.record,
    "correlation_id",
    "correlation_id",
    "authority.correlation_binding_mismatch",
    "The Authority Decision does not preserve the request correlation identifier.",
    "/correlation_id",
    violations,
  );
  checkPolicyBinding(
    request.record,
    decision.record,
    "/policy_reference",
    violations,
  );
  return violations;
}

export function validateAuthorityResolutionBinding(
  requestValue: unknown,
  resolutionValue: unknown,
): AuthorityContractViolation[] {
  const request = normalizedRecord(requestValue, "Authority Request");
  const resolution = normalizedRecord(
    resolutionValue,
    "Authority Resolution Result",
  );
  const violations = [...request.violations, ...resolution.violations];
  if (request.record === undefined || resolution.record === undefined) {
    return violations;
  }

  for (const binding of [
    [
      "authority_request_id",
      "authority.request_binding_mismatch",
      "The Authority Resolution Result references another Authority Request.",
    ],
    [
      "tenant_id",
      "authority.tenant_binding_mismatch",
      "The Authority Resolution Result belongs to another tenant.",
    ],
    [
      "case_id",
      "authority.case_binding_mismatch",
      "The Authority Resolution Result belongs to another Case.",
    ],
    [
      "case_version",
      "authority.case_version_binding_mismatch",
      "The Authority Resolution Result does not bind the exact requested Case version.",
    ],
    [
      "proposed_consequence_hash",
      "authority.consequence_binding_mismatch",
      "The Authority Resolution Result does not bind the exact proposed consequence hash.",
    ],
    [
      "correlation_id",
      "authority.correlation_binding_mismatch",
      "The Authority Resolution Result does not preserve the request correlation identifier.",
    ],
  ] as const) {
    compareBindingField(
      request.record,
      resolution.record,
      binding[0],
      binding[0],
      binding[1],
      binding[2],
      `/${binding[0]}`,
      violations,
    );
  }
  checkPolicyBinding(
    request.record,
    resolution.record,
    "/policy_reference",
    violations,
  );
  return violations;
}
