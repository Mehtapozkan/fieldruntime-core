import {
  assertValidAuthorityDecision,
  assertValidAuthorityPolicy,
  assertValidAuthorityRecord,
  assertValidAuthorityRequest,
  assertValidAuthorityResolutionResult,
  assertValidCaseDocument,
  assertValidCaseResponsibility,
  assertValidDelegationGrant,
  assertValidIdentityReference,
  canonicalJson,
  canonicalizeJson,
  immutableJson,
  sha256Json,
  validateAuthorityDecisionBinding,
  type JsonValue,
} from "../../contracts/src/index.js";

type JsonObject = Record<string, JsonValue>;
type ContractAssertion = (
  value: unknown,
) => asserts value is Record<string, unknown>;

interface ResolutionContext {
  readonly tenantId: string;
  readonly caseId: string;
  readonly caseVersion: number;
  readonly workflowVersionId: string;
  readonly caseScopeIds: readonly string[];
  readonly authorityClass: string;
  readonly actionClass: string;
  readonly consequenceClass: string;
  readonly businessDomain?: string;
}

interface InternalCandidate {
  readonly identity: JsonObject;
  readonly authorityRank: number;
  readonly evidenceRefs: readonly string[];
  readonly authorityRecords: readonly JsonObject[];
  readonly delegations: readonly JsonObject[];
}

interface RequirementResolution {
  readonly output: JsonObject;
  readonly satisfiedDecisionIds: readonly string[];
  readonly delegationIds: readonly string[];
}

type CandidateResolution =
  | {
      readonly kind: "candidates";
      readonly candidates: readonly InternalCandidate[];
      readonly directCandidates: readonly InternalCandidate[];
    }
  | {
      readonly kind: "expired";
      readonly delegationIds: readonly string[];
    }
  | {
      readonly kind: "revoked";
      readonly delegationIds: readonly string[];
    }
  | { readonly kind: "missing" };

export interface ResolveAuthorityInput {
  readonly case: unknown;
  readonly authorityRequest: unknown;
  readonly proposedConsequence: unknown;
  readonly identities: readonly unknown[];
  readonly responsibilities: readonly unknown[];
  readonly authorityRecords: readonly unknown[];
  readonly delegations: readonly unknown[];
  readonly policies: readonly unknown[];
  readonly priorAuthorityDecisions: readonly unknown[];
  readonly evaluatedByIdentity: unknown;
  readonly asOf: string;
  readonly asOfSourceTimezone: string;
}

export type AuthorityResolutionResult = Readonly<Record<string, JsonValue>>;

export class AuthorityResolutionInputError extends Error {
  readonly code = "AUTHORITY_RESOLUTION_INPUT_INVALID";

  constructor(message: string) {
    super(`Authority resolution input is invalid: ${message}`);
    this.name = "AuthorityResolutionInputError";
  }
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(record: JsonObject, key: string): JsonValue | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function objectField(record: JsonObject, key: string): JsonObject | undefined {
  const value = field(record, key);
  return isObject(value) ? value : undefined;
}

function stringField(record: JsonObject, key: string): string | undefined {
  const value = field(record, key);
  return typeof value === "string" ? value : undefined;
}

function integerField(record: JsonObject, key: string): number | undefined {
  const value = field(record, key);
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

function booleanField(record: JsonObject, key: string): boolean | undefined {
  const value = field(record, key);
  return typeof value === "boolean" ? value : undefined;
}

function objectArrayField(
  record: JsonObject,
  key: string,
): readonly JsonObject[] {
  const value = field(record, key);
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function stringArrayField(record: JsonObject, key: string): readonly string[] {
  const value = field(record, key);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function requireObject(record: JsonObject, key: string): JsonObject {
  const value = objectField(record, key);
  if (value === undefined) {
    throw new AuthorityResolutionInputError(`${key} must be an object`);
  }
  return value;
}

function requireArray(record: JsonObject, key: string): readonly JsonValue[] {
  const value = field(record, key);
  if (!Array.isArray(value)) {
    throw new AuthorityResolutionInputError(`${key} must be an array`);
  }
  return value as readonly JsonValue[];
}

function requireString(record: JsonObject, key: string): string {
  const value = stringField(record, key);
  if (value === undefined) {
    throw new AuthorityResolutionInputError(`${key} must be a string`);
  }
  return value;
}

function requireInteger(record: JsonObject, key: string): number {
  const value = integerField(record, key);
  if (value === undefined) {
    throw new AuthorityResolutionInputError(`${key} must be an integer`);
  }
  return value;
}

function isCanonicalUtcInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const instant = Date.parse(value);
  return !Number.isNaN(instant) && new Date(instant).toISOString() === value;
}

function isSourceTimezone(value: string): boolean {
  return /^(?:UTC(?:[+-](?:0[0-9]|1[0-9]|2[0-3]):[0-5][0-9])?|[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+)$/.test(
    value,
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sortObjects(values: readonly JsonObject[]): JsonObject[] {
  return [...values].sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right)),
  );
}

function uniqueObjects(values: readonly JsonObject[]): JsonObject[] {
  const byCanonical = new Map<string, JsonObject>();
  for (const value of values) {
    byCanonical.set(canonicalJson(value), value);
  }
  return sortObjects([...byCanonical.values()]);
}

function uniqueJsonValues(values: readonly JsonValue[]): JsonValue[] {
  const byCanonical = new Map<string, JsonValue>();
  for (const value of values) {
    byCanonical.set(canonicalJson(value), value);
  }
  return [...byCanonical.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

// Call after exact-copy deduplication, before selecting status, scope, or time.
function hasConflictingIds(
  records: readonly JsonObject[],
  idField: string,
): boolean {
  const ids = records.map((record) => requireString(record, idField));
  return new Set(ids).size !== ids.length;
}

function validates(value: JsonValue, assertion: ContractAssertion): boolean {
  try {
    assertion(value);
    return true;
  } catch {
    return false;
  }
}

function allValidate(
  values: readonly JsonValue[],
  assertion: ContractAssertion,
): boolean {
  return values.every((value) => validates(value, assertion));
}

function identityId(identity: JsonObject): string {
  return requireString(identity, "identity_id");
}

function samePrincipal(left: JsonObject, right: JsonObject): boolean {
  return (
    stringField(left, "identity_id") === stringField(right, "identity_id") &&
    stringField(left, "tenant_id") === stringField(right, "tenant_id") &&
    stringField(left, "identity_kind") === stringField(right, "identity_kind")
  );
}

function sameIdentityReference(left: JsonObject, right: JsonObject): boolean {
  return (
    samePrincipal(left, right) &&
    stringField(left, "status") === stringField(right, "status")
  );
}

function identityMap(
  identities: readonly JsonObject[],
): ReadonlyMap<string, JsonObject> | undefined {
  const result = new Map<string, JsonObject>();
  for (const identity of identities) {
    const id = identityId(identity);
    const prior = result.get(id);
    if (prior !== undefined && !sameIdentityReference(prior, identity)) {
      return undefined;
    }
    result.set(id, identity);
  }
  return result;
}

function recordIsEffective(record: JsonObject, asOf: string): boolean {
  const effectiveFrom = stringField(record, "effective_from");
  const effectiveUntil = stringField(record, "effective_until");
  return (
    effectiveFrom !== undefined &&
    effectiveFrom <= asOf &&
    (effectiveUntil === undefined || asOf < effectiveUntil)
  );
}

function intersects(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function scopeMatches(scope: JsonObject, context: ResolutionContext): boolean {
  const dimensions: readonly [
    string,
    string | readonly string[] | undefined,
  ][] = [
    ["case_ids", context.caseId],
    ["workflow_version_ids", context.workflowVersionId],
    ["case_class_ids", undefined],
    ["authority_classes", context.authorityClass],
    ["action_classes", context.actionClass],
    ["business_domains", context.businessDomain],
    ["consequence_classes", context.consequenceClass],
    ["organization_scope_ids", context.caseScopeIds],
  ];
  for (const [fieldName, current] of dimensions) {
    const allowed = stringArrayField(scope, fieldName);
    if (allowed.length === 0) {
      continue;
    }
    if (current === undefined) {
      return false;
    }
    if (Array.isArray(current)) {
      if (!intersects(allowed, current)) {
        return false;
      }
    } else if (!allowed.includes(current as string)) {
      return false;
    }
  }
  return true;
}

function conditionMatches(
  condition: JsonObject,
  consequence: JsonObject,
): boolean {
  const currency = stringField(condition, "currency");
  if (
    currency !== undefined &&
    stringField(consequence, "currency") !== currency
  ) {
    return false;
  }
  const minimum = integerField(condition, "minimum_amount_minor");
  const maximum = integerField(condition, "maximum_amount_minor");
  if (minimum !== undefined || maximum !== undefined) {
    const amount = integerField(consequence, "amount_minor");
    if (amount === undefined) {
      return false;
    }
    if (minimum !== undefined && amount < minimum) {
      return false;
    }
    if (maximum !== undefined && amount > maximum) {
      return false;
    }
  }
  return true;
}

function policyIsCurrent(policy: JsonObject, asOf: string): boolean {
  return (
    stringField(policy, "status") === "approved" &&
    integerField(policy, "authority_rank") === 1 &&
    recordIsEffective(policy, asOf)
  );
}

function authorityRecordIsCurrent(record: JsonObject, asOf: string): boolean {
  return (
    stringField(record, "status") === "active" &&
    integerField(record, "authority_rank") === 1 &&
    recordIsEffective(record, asOf)
  );
}

function candidateOutput(candidate: InternalCandidate): JsonObject {
  const result: JsonObject = {
    identity: candidate.identity,
    authority_rank: candidate.authorityRank,
    evidence_refs: uniqueSorted(candidate.evidenceRefs),
  };
  const delegationIds = uniqueSorted(
    candidate.delegations.map((grant) => requireString(grant, "delegation_id")),
  );
  if (delegationIds.length > 0) {
    result.delegation_ids = delegationIds;
  }
  return result;
}

function groupDirectCandidates(
  records: readonly JsonObject[],
): InternalCandidate[] {
  const grouped = new Map<string, JsonObject[]>();
  for (const record of records) {
    const identity = requireObject(record, "identity");
    const id = identityId(identity);
    const values = grouped.get(id) ?? [];
    values.push(record);
    grouped.set(id, values);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, candidateRecords]) => ({
      identity: requireObject(candidateRecords[0] ?? {}, "identity"),
      authorityRank: 1,
      evidenceRefs: uniqueSorted(
        candidateRecords.map((record) => requireString(record, "source_ref")),
      ),
      authorityRecords: sortObjects(candidateRecords),
      delegations: [],
    }));
}

function delegationScopeMatches(
  grant: JsonObject,
  context: ResolutionContext,
): boolean {
  const scope = objectField(grant, "scope");
  return scope !== undefined && scopeMatches(scope, context);
}

function delegationIsCurrent(grant: JsonObject, asOf: string): boolean {
  return (
    stringField(grant, "status") === "active" && recordIsEffective(grant, asOf)
  );
}

function delegationIsExpired(grant: JsonObject, asOf: string): boolean {
  const effectiveUntil = stringField(grant, "effective_until");
  return (
    stringField(grant, "status") === "expired" ||
    (effectiveUntil !== undefined && effectiveUntil <= asOf)
  );
}

function delegatedCandidate(
  direct: InternalCandidate,
  grant: JsonObject,
  identities: ReadonlyMap<string, JsonObject>,
): InternalCandidate | undefined {
  const delegator = requireObject(grant, "delegator_identity");
  const delegate = requireObject(grant, "delegate_identity");
  const known = identities.get(identityId(delegate));
  const approvedBy = objectField(grant, "approved_by_identity");
  const knownApprover =
    approvedBy === undefined
      ? undefined
      : identities.get(identityId(approvedBy));
  if (
    !sameIdentityReference(direct.identity, delegator) ||
    known === undefined ||
    !sameIdentityReference(known, delegate) ||
    stringField(known, "status") !== "active" ||
    stringField(known, "identity_kind") === "agent" ||
    approvedBy === undefined ||
    knownApprover === undefined ||
    !samePrincipal(knownApprover, approvedBy) ||
    stringField(approvedBy, "identity_kind") === "agent" ||
    stringField(approvedBy, "status") !== "active"
  ) {
    return undefined;
  }
  const provenance = requireObject(grant, "provenance");
  return {
    identity: known,
    authorityRank: direct.authorityRank,
    evidenceRefs: uniqueSorted([
      ...direct.evidenceRefs,
      requireString(provenance, "source_ref"),
    ]),
    authorityRecords: direct.authorityRecords,
    delegations: [grant],
  };
}

function resolveCandidates(
  requirement: JsonObject,
  directCandidates: readonly InternalCandidate[],
  delegations: readonly JsonObject[],
  identities: ReadonlyMap<string, JsonObject>,
  context: ResolutionContext,
  asOf: string,
): CandidateResolution {
  const namedIds = stringArrayField(requirement, "named_approver_identity_ids");
  const allowDelegation =
    booleanField(requirement, "allow_delegation") === true;
  const matchingGrants = delegations.filter((grant) => {
    const delegator = objectField(grant, "delegator_identity");
    return (
      delegator !== undefined &&
      directCandidates.some(
        (candidate) => identityId(candidate.identity) === identityId(delegator),
      ) &&
      delegationScopeMatches(grant, context)
    );
  });

  const delegated = allowDelegation
    ? matchingGrants
        .filter((grant) => delegationIsCurrent(grant, asOf))
        .map((grant) => {
          const delegator = requireObject(grant, "delegator_identity");
          const direct = directCandidates.find(
            (candidate) =>
              identityId(candidate.identity) === identityId(delegator),
          );
          return direct === undefined
            ? undefined
            : delegatedCandidate(direct, grant, identities);
        })
        .filter(
          (candidate): candidate is InternalCandidate =>
            candidate !== undefined,
        )
    : [];

  const allCandidates = new Map<string, InternalCandidate>();
  for (const candidate of [...directCandidates, ...delegated]) {
    const id = identityId(candidate.identity);
    const prior = allCandidates.get(id);
    if (prior === undefined) {
      allCandidates.set(id, candidate);
    } else {
      allCandidates.set(id, {
        identity: prior.identity,
        authorityRank: Math.min(prior.authorityRank, candidate.authorityRank),
        evidenceRefs: uniqueSorted([
          ...prior.evidenceRefs,
          ...candidate.evidenceRefs,
        ]),
        authorityRecords: uniqueObjects([
          ...prior.authorityRecords,
          ...candidate.authorityRecords,
        ]),
        delegations: uniqueObjects([
          ...prior.delegations,
          ...candidate.delegations,
        ]),
      });
    }
  }

  if (namedIds.length > 0) {
    const selected = namedIds
      .map((id) => allCandidates.get(id))
      .filter(
        (candidate): candidate is InternalCandidate => candidate !== undefined,
      );
    if (selected.length === namedIds.length) {
      return {
        kind: "candidates",
        candidates: selected,
        directCandidates: selected.filter(
          (candidate) => candidate.delegations.length === 0,
        ),
      };
    }
    const unresolvedNamedIds = namedIds.filter((id) => !allCandidates.has(id));
    const relevantUnusable = matchingGrants.filter((grant) =>
      unresolvedNamedIds.includes(
        identityId(requireObject(grant, "delegate_identity")),
      ),
    );
    const expired = relevantUnusable.filter((grant) =>
      delegationIsExpired(grant, asOf),
    );
    if (expired.length > 0) {
      return {
        kind: "expired",
        delegationIds: uniqueSorted(
          expired.map((grant) => requireString(grant, "delegation_id")),
        ),
      };
    }
    const revoked = relevantUnusable.filter(
      (grant) => stringField(grant, "status") === "revoked",
    );
    if (revoked.length > 0) {
      return {
        kind: "revoked",
        delegationIds: uniqueSorted(
          revoked.map((grant) => requireString(grant, "delegation_id")),
        ),
      };
    }
    return { kind: "missing" };
  }

  const candidates = [...allCandidates.values()].sort((left, right) =>
    identityId(left.identity).localeCompare(identityId(right.identity)),
  );
  return candidates.length > 0
    ? { kind: "candidates", candidates, directCandidates }
    : { kind: "missing" };
}

function candidateHasApprovalPath(
  candidate: InternalCandidate,
  asOf: string,
  recordedDelegations: readonly string[],
): boolean {
  // Records and grants already passed evaluation-time scope and identity checks.
  // Keep each grant bound to its own delegator's record at decision time too.
  const records = candidate.authorityRecords.filter((record) =>
    authorityRecordIsCurrent(record, asOf),
  );
  if (
    records.some((record) =>
      sameIdentityReference(
        requireObject(record, "identity"),
        candidate.identity,
      ),
    )
  ) {
    return true;
  }
  return candidate.delegations.some(
    (grant) =>
      recordedDelegations.includes(requireString(grant, "delegation_id")) &&
      delegationIsCurrent(grant, asOf) &&
      sameIdentityReference(
        requireObject(grant, "delegate_identity"),
        candidate.identity,
      ) &&
      records.some((record) =>
        sameIdentityReference(
          requireObject(record, "identity"),
          requireObject(grant, "delegator_identity"),
        ),
      ),
  );
}

function decisionSatisfies(
  decision: JsonObject,
  request: JsonObject,
  requirement: JsonObject,
  candidates: readonly InternalCandidate[],
  policy: JsonObject,
  asOf: string,
): boolean {
  if (
    stringField(decision, "decision") !== "approve" ||
    validateAuthorityDecisionBinding(request, decision).length > 0
  ) {
    return false;
  }
  const decidedAt = stringField(decision, "decided_at");
  const approver = objectField(decision, "approver_identity");
  const decisionPolicy = objectField(decision, "policy_reference");
  if (
    decidedAt === undefined ||
    decidedAt < requireString(request, "requested_at") ||
    decidedAt > asOf ||
    !policyIsCurrent(policy, decidedAt) ||
    approver === undefined ||
    stringField(approver, "identity_kind") === "agent" ||
    decisionPolicy === undefined ||
    stringField(decisionPolicy, "policy_id") !==
      stringField(policy, "policy_id") ||
    stringField(decisionPolicy, "policy_version") !==
      stringField(policy, "policy_version")
  ) {
    return false;
  }
  if (
    booleanField(requirement, "allow_preparer_approval") !== true &&
    identityId(approver) ===
      identityId(requireObject(request, "prepared_by_identity"))
  ) {
    return false;
  }
  const candidate = candidates.find((item) =>
    sameIdentityReference(item.identity, approver),
  );
  return (
    candidate !== undefined &&
    candidateHasApprovalPath(
      candidate,
      decidedAt,
      stringArrayField(decision, "relevant_delegation_ids"),
    )
  );
}

function decisionEvidence(decision: JsonObject): string[] {
  const lineage = objectField(decision, "lineage");
  return lineage === undefined
    ? []
    : [...stringArrayField(lineage, "source_refs")];
}

function resolveRequirement(
  requirement: JsonObject,
  candidates: readonly InternalCandidate[],
  decisions: readonly JsonObject[],
  request: JsonObject,
  policy: JsonObject,
  policyRuleRef: string,
  asOf: string,
): RequirementResolution {
  const validDecisionsByApprover = new Map<string, JsonObject>();
  for (const decision of decisions) {
    if (
      !decisionSatisfies(
        decision,
        request,
        requirement,
        candidates,
        policy,
        asOf,
      )
    ) {
      continue;
    }
    const approver = requireObject(decision, "approver_identity");
    const id = identityId(approver);
    const prior = validDecisionsByApprover.get(id);
    if (
      prior === undefined ||
      requireString(decision, "authority_decision_id") <
        requireString(prior, "authority_decision_id")
    ) {
      validDecisionsByApprover.set(id, decision);
    }
  }
  const validDecisions = [...validDecisionsByApprover.values()].sort(
    (left, right) =>
      requireString(left, "authority_decision_id").localeCompare(
        requireString(right, "authority_decision_id"),
      ),
  );
  const requiredCount = requireInteger(requirement, "required_approval_count");
  const satisfied = validDecisions.slice(0, requiredCount);
  const remainingCount = Math.max(0, requiredCount - satisfied.length);
  const delegationIds = uniqueSorted(
    candidates.flatMap((candidate) =>
      candidate.delegations.map((grant) =>
        requireString(grant, "delegation_id"),
      ),
    ),
  );
  const evidenceRefs = uniqueSorted([
    requireString(policy, "source_ref"),
    policyRuleRef,
    ...candidates.flatMap((candidate) => candidate.evidenceRefs),
    ...satisfied.flatMap(decisionEvidence),
  ]);
  const output: JsonObject = {
    requirement_id: requireString(requirement, "requirement_id"),
    authority_class: requireString(requirement, "authority_class"),
    required_approval_count: requiredCount,
    status: remainingCount === 0 ? "satisfied" : "outstanding",
    satisfied_approval_ids: satisfied.map((decision) =>
      requireString(decision, "authority_decision_id"),
    ),
    remaining_approval_count: remainingCount,
    eligible_approvers: candidates.map(candidateOutput),
    policy_rule_ref: policyRuleRef,
    evidence_refs: evidenceRefs,
  };
  if (delegationIds.length > 0) {
    output.delegation_ids = delegationIds;
  }
  return {
    output,
    satisfiedDecisionIds: stringArrayField(output, "satisfied_approval_ids"),
    delegationIds,
  };
}

function policyReference(policy: JsonObject): JsonObject {
  return {
    policy_id: requireString(policy, "policy_id"),
    policy_version: requireString(policy, "policy_version"),
  };
}

function requestedPolicyReference(request: JsonObject): JsonObject | undefined {
  return objectField(request, "policy_reference");
}

function policyMatchesRequest(
  policy: JsonObject,
  request: JsonObject,
  consequenceClass: string,
): boolean {
  const requestedPolicy = requestedPolicyReference(request);
  if (
    requestedPolicy !== undefined &&
    (stringField(policy, "policy_id") !==
      stringField(requestedPolicy, "policy_id") ||
      stringField(policy, "policy_version") !==
        stringField(requestedPolicy, "policy_version"))
  ) {
    return false;
  }
  return (
    stringField(policy, "authority_class") ===
      stringField(request, "requested_authority_class") &&
    stringField(policy, "action_class") ===
      stringField(request, "requested_action_class") &&
    stringField(policy, "consequence_class") === consequenceClass
  );
}

function baseResult(
  request: JsonObject,
  caseRecord: JsonObject,
  evaluatedBy: JsonObject,
  asOf: string,
  asOfSourceTimezone: string,
  resolutionId: string,
): JsonObject {
  const result: JsonObject = {
    schema_version: "authority-resolution-result.v0",
    authority_resolution_id: resolutionId,
    authority_request_id: requireString(request, "authority_request_id"),
    tenant_id: requireString(request, "tenant_id"),
    case_id: requireString(request, "case_id"),
    case_version: requireInteger(request, "case_version"),
    proposed_consequence_hash: requireString(
      request,
      "proposed_consequence_hash",
    ),
    outcome: "no_authority",
    reason_codes: ["authority.no_authority"],
    evaluated_by_identity: evaluatedBy,
    evaluated_at: asOf,
    evaluated_at_source_timezone: asOfSourceTimezone,
    correlation_id: requireString(request, "correlation_id"),
  };
  const causationEventId = stringField(request, "causation_event_id");
  if (causationEventId !== undefined) {
    result.causation_event_id = causationEventId;
  }
  if (
    requireInteger(caseRecord, "version") !==
    requireInteger(request, "case_version")
  ) {
    result.current_case_version = requireInteger(caseRecord, "version");
  }
  const requestedPolicy = requestedPolicyReference(request);
  if (requestedPolicy !== undefined) {
    result.policy_reference = requestedPolicy;
  }
  return result;
}

function finalize(
  base: JsonObject,
  details: JsonObject,
): AuthorityResolutionResult {
  const result = { ...base, ...details };
  assertValidAuthorityResolutionResult(result);
  return immutableJson(result);
}

function resolutionIdentifier(
  root: JsonObject,
  caseDocument: JsonObject,
  request: JsonObject,
  consequence: JsonValue,
  asOf: string,
): string {
  const authoritativeInput: JsonObject = {
    case: caseDocument,
    authority_request: request,
    proposed_consequence: consequence,
    identities: uniqueJsonValues(requireArray(root, "identities")),
    responsibilities: uniqueJsonValues(requireArray(root, "responsibilities")),
    authority_records: uniqueJsonValues(requireArray(root, "authorityRecords")),
    delegations: uniqueJsonValues(requireArray(root, "delegations")),
    policies: uniqueJsonValues(requireArray(root, "policies")),
    prior_authority_decisions: uniqueJsonValues(
      requireArray(root, "priorAuthorityDecisions"),
    ),
    as_of: asOf,
  };
  return `authority_resolution_${sha256Json(authoritativeInput).slice(7, 39)}`;
}

export function resolveAuthority(
  input: ResolveAuthorityInput,
): AuthorityResolutionResult {
  return resolveAuthorityInternal(input);
}

/** Eligibility to veto/modify/escalate one applicable policy requirement.
 * This is never a whole-request authorization result. All original input,
 * policy selection, candidate, identity, scope and path checks still run.
 */
export function resolveReviewerEligibility(
  input: ResolveAuthorityInput,
  probeDecisionId: string,
): Readonly<{ eligible: boolean; requirement_ids: readonly string[] }> {
  const normalized = canonicalizeJson(input);
  if (!isObject(normalized))
    throw new AuthorityResolutionInputError("root must be an object");
  const ids = uniqueSorted(
    requireArray(normalized, "policies")
      .filter(isObject)
      .flatMap((policy) =>
        objectArrayField(policy, "rules").flatMap((rule) =>
          objectArrayField(rule, "requirements").map((requirement) =>
            requireString(requirement, "requirement_id"),
          ),
        ),
      ),
  );
  const eligible = ids.filter((id) => {
    const result = resolveAuthorityInternal(input, id);
    return stringArrayField(result, "authority_decision_ids").includes(
      probeDecisionId,
    );
  });
  return immutableJson({
    eligible: eligible.length > 0,
    requirement_ids: eligible,
  });
}

function resolveAuthorityInternal(
  input: ResolveAuthorityInput,
  reviewerRequirementId?: string,
): AuthorityResolutionResult {
  const normalized = canonicalizeJson(input);
  if (!isObject(normalized)) {
    throw new AuthorityResolutionInputError("root must be an object");
  }
  const caseDocument = requireObject(normalized, "case");
  const request = requireObject(normalized, "authorityRequest");
  const consequence = field(normalized, "proposedConsequence");
  const evaluatedBy = requireObject(normalized, "evaluatedByIdentity");
  const asOf = requireString(normalized, "asOf");
  const asOfSourceTimezone = requireString(normalized, "asOfSourceTimezone");
  if (
    consequence === undefined ||
    !isCanonicalUtcInstant(asOf) ||
    !isSourceTimezone(asOfSourceTimezone)
  ) {
    throw new AuthorityResolutionInputError(
      "proposedConsequence and canonical as-of time are required",
    );
  }
  try {
    assertValidCaseDocument(caseDocument);
    assertValidAuthorityRequest(request);
    assertValidIdentityReference(evaluatedBy);
  } catch (error) {
    throw new AuthorityResolutionInputError(
      error instanceof Error ? error.message : "boundary contract failed",
    );
  }

  const caseRecord = requireObject(caseDocument, "case");
  const caseTenant = requireString(caseRecord, "tenant_id");
  const caseId = requireString(caseRecord, "id");
  const caseVersion = requireInteger(caseRecord, "version");
  const workflowVersionId = requireString(caseRecord, "workflow_version_id");
  const tenantId = requireString(request, "tenant_id");
  const resolutionId = resolutionIdentifier(
    normalized,
    caseDocument,
    request,
    consequence,
    asOf,
  );
  const base = baseResult(
    request,
    caseRecord,
    evaluatedBy,
    asOf,
    asOfSourceTimezone,
    resolutionId,
  );

  if (
    caseTenant !== tenantId ||
    requireString(request, "case_id") !== caseId ||
    stringField(evaluatedBy, "tenant_id") !== tenantId
  ) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["authority.tenant_or_case_mismatch"],
    });
  }
  if (caseVersion !== requireInteger(request, "case_version")) {
    return finalize(base, {
      outcome: "stale_case_version",
      current_case_version: caseVersion,
      reason_codes: ["case.version_changed"],
    });
  }
  if (
    sha256Json(consequence) !==
    stringField(request, "proposed_consequence_hash")
  ) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["authority.consequence_binding_mismatch"],
    });
  }
  if (!isObject(consequence)) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["consequence.malformed"],
    });
  }
  const consequenceClass = stringField(consequence, "consequence_class");
  if (consequenceClass === undefined) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["consequence.class_missing"],
    });
  }

  const identityValues = requireArray(normalized, "identities");
  const responsibilityValues = requireArray(normalized, "responsibilities");
  const authorityRecordValues = requireArray(normalized, "authorityRecords");
  const delegationValues = requireArray(normalized, "delegations");
  const policyValues = requireArray(normalized, "policies");
  const decisionValues = requireArray(normalized, "priorAuthorityDecisions");
  if (!allValidate(identityValues, assertValidIdentityReference)) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["identity.malformed"],
    });
  }
  const identities = identityValues.filter(isObject);
  const identitiesById = identityMap(identities);
  if (identitiesById === undefined) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["identity.conflicting_records"],
    });
  }
  const knownEvaluator = identitiesById.get(identityId(evaluatedBy));
  if (
    identities.some(
      (identity) => stringField(identity, "tenant_id") !== tenantId,
    ) ||
    knownEvaluator === undefined ||
    !sameIdentityReference(knownEvaluator, evaluatedBy) ||
    stringField(evaluatedBy, "status") !== "active"
  ) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["identity.tenant_or_evaluator_mismatch"],
    });
  }

  if (!allValidate(responsibilityValues, assertValidCaseResponsibility)) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["responsibility.malformed"],
    });
  }
  const responsibilities = responsibilityValues.filter(isObject);
  if (
    responsibilities.some(
      (record) =>
        stringField(record, "tenant_id") !== tenantId ||
        stringField(record, "case_id") !== caseId ||
        integerField(record, "case_version") !== caseVersion,
    )
  ) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["responsibility.case_binding_mismatch"],
    });
  }

  if (!allValidate(policyValues, assertValidAuthorityPolicy)) {
    return finalize(base, {
      outcome: "policy_unavailable",
      reason_codes: ["policy.malformed"],
    });
  }
  const policies = uniqueObjects(policyValues.filter(isObject));
  if (
    policies.some((policy) => stringField(policy, "tenant_id") !== tenantId)
  ) {
    return finalize(base, {
      outcome: "policy_unavailable",
      reason_codes: ["policy.tenant_mismatch"],
    });
  }
  const matchingPolicies = policies.filter(
    (policy) =>
      policyIsCurrent(policy, asOf) &&
      policyMatchesRequest(policy, request, consequenceClass),
  );
  if (matchingPolicies.length === 0) {
    return finalize(base, {
      outcome: "policy_unavailable",
      reason_codes: ["policy.not_found"],
    });
  }
  if (matchingPolicies.length > 1) {
    return finalize(base, {
      outcome: "conflicting_authority",
      reason_codes: ["policy.conflicting_current_records"],
      conflicting_source_refs: uniqueSorted(
        matchingPolicies.map(
          (policy) =>
            `${requireString(policy, "source_ref")}#${sha256Json(policy).slice(7, 23)}`,
        ),
      ),
    });
  }
  const policy = matchingPolicies[0] as JsonObject;
  base.policy_reference = policyReference(policy);
  const matchingRules = objectArrayField(policy, "rules").filter((rule) =>
    conditionMatches(requireObject(rule, "condition"), consequence),
  );
  if (matchingRules.length === 0) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["policy.no_applicable_rule"],
    });
  }
  const bestPriority = Math.min(
    ...matchingRules.map((rule) => requireInteger(rule, "priority")),
  );
  const selectedRules = matchingRules.filter(
    (rule) => requireInteger(rule, "priority") === bestPriority,
  );
  if (selectedRules.length > 1) {
    return finalize(base, {
      outcome: "conflicting_authority",
      reason_codes: ["policy.conflicting_rules"],
      conflicting_source_refs: selectedRules.map(
        (rule) =>
          `${requireString(policy, "source_ref")}#${requireString(rule, "rule_id")}`,
      ),
    });
  }
  const selectedRule = selectedRules[0] as JsonObject;
  const policyRuleRef = `${requireString(policy, "source_ref")}#${requireString(selectedRule, "rule_id")}`;

  if (!allValidate(authorityRecordValues, assertValidAuthorityRecord)) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["authority_record.malformed"],
    });
  }
  const authorityRecords = uniqueObjects(
    authorityRecordValues.filter(isObject),
  );
  if (hasConflictingIds(authorityRecords, "authority_record_id")) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["authority_record.conflicting_records"],
    });
  }
  if (
    authorityRecords.some(
      (record) => stringField(record, "tenant_id") !== tenantId,
    )
  ) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["authority_record.tenant_mismatch"],
    });
  }
  for (const record of authorityRecords) {
    const identity = requireObject(record, "identity");
    const known = identitiesById.get(identityId(identity));
    if (known === undefined || !sameIdentityReference(known, identity)) {
      return finalize(base, {
        outcome: "no_authority",
        reason_codes: ["authority_record.identity_mismatch"],
      });
    }
  }

  if (!allValidate(delegationValues, assertValidDelegationGrant)) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["delegation.malformed"],
    });
  }
  const delegations = uniqueObjects(delegationValues.filter(isObject));
  if (hasConflictingIds(delegations, "delegation_id")) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["delegation.conflicting_records"],
    });
  }
  if (
    delegations.some((grant) => stringField(grant, "tenant_id") !== tenantId)
  ) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["delegation.tenant_mismatch"],
    });
  }

  const structurallyValidDecisions = decisionValues.filter(
    (value): value is JsonObject =>
      isObject(value) && validates(value, assertValidAuthorityDecision),
  );
  if (
    decisionValues.some(
      (value) =>
        isObject(value) &&
        stringField(value, "tenant_id") !== undefined &&
        stringField(value, "tenant_id") !== tenantId,
    )
  ) {
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["authority_decision.tenant_mismatch"],
    });
  }
  const decisions = uniqueObjects(structurallyValidDecisions);

  const contextBase = {
    tenantId,
    caseId,
    caseVersion,
    workflowVersionId,
    caseScopeIds: stringArrayField(caseRecord, "scope_ids"),
    actionClass: requireString(request, "requested_action_class"),
    consequenceClass,
  };
  const businessDomain = stringField(consequence, "business_domain");
  const requirementOutputs: RequirementResolution[] = [];
  const selectedRequirements = objectArrayField(
    selectedRule,
    "requirements",
  ).filter(
    (requirement) =>
      reviewerRequirementId === undefined ||
      stringField(requirement, "requirement_id") === reviewerRequirementId,
  );
  if (selectedRequirements.length === 0)
    return finalize(base, {
      outcome: "no_authority",
      reason_codes: ["authority.no_applicable_review_requirement"],
    });
  for (const requirement of [...selectedRequirements].sort((left, right) =>
    requireString(left, "requirement_id").localeCompare(
      requireString(right, "requirement_id"),
    ),
  )) {
    const authorityClass = requireString(requirement, "authority_class");
    const context: ResolutionContext = {
      ...contextBase,
      authorityClass,
      ...(businessDomain === undefined ? {} : { businessDomain }),
    };
    const applicableRecords = authorityRecords.filter((record) => {
      const identity = requireObject(record, "identity");
      const known = identitiesById.get(identityId(identity));
      const scope = objectField(record, "scope");
      return (
        authorityRecordIsCurrent(record, asOf) &&
        stringField(record, "authority_class") === authorityClass &&
        known !== undefined &&
        stringField(known, "status") === "active" &&
        scope !== undefined &&
        scopeMatches(scope, context)
      );
    });
    const directCandidates = groupDirectCandidates(applicableRecords);
    const candidateResolution = resolveCandidates(
      requirement,
      directCandidates,
      delegations,
      identitiesById,
      context,
      asOf,
    );
    if (candidateResolution.kind === "expired") {
      return finalize(base, {
        outcome: "expired_delegation",
        delegation_ids: candidateResolution.delegationIds,
        reason_codes: ["delegation.expired"],
      });
    }
    if (candidateResolution.kind === "revoked") {
      return finalize(base, {
        outcome: "no_authority",
        delegation_ids: candidateResolution.delegationIds,
        reason_codes: ["delegation.revoked"],
      });
    }
    if (candidateResolution.kind === "missing") {
      return finalize(base, {
        outcome: "no_authority",
        reason_codes: ["authority.no_eligible_principal"],
      });
    }

    const requiredCount = requireInteger(
      requirement,
      "required_approval_count",
    );
    if (candidateResolution.directCandidates.length > requiredCount) {
      return finalize(base, {
        outcome: "conflicting_authority",
        authority_candidates:
          candidateResolution.directCandidates.map(candidateOutput),
        conflicting_source_refs: uniqueSorted(
          candidateResolution.directCandidates.flatMap(
            (candidate) => candidate.evidenceRefs,
          ),
        ),
        reason_codes: ["authority.same_rank_conflict"],
      });
    }
    const partial = resolveRequirement(
      requirement,
      candidateResolution.candidates,
      decisions,
      request,
      policy,
      policyRuleRef,
      asOf,
    );
    const satisfiedCount = partial.satisfiedDecisionIds.length;
    if (satisfiedCount < requiredCount) {
      if (candidateResolution.candidates.length > requiredCount) {
        return finalize(base, {
          outcome: "ambiguous_authority",
          authority_candidates:
            candidateResolution.candidates.map(candidateOutput),
          reason_codes: ["authority.multiple_eligible_principals"],
        });
      }
      if (candidateResolution.candidates.length < requiredCount) {
        return finalize(base, {
          outcome: "no_authority",
          reason_codes: ["authority.insufficient_eligible_principals"],
        });
      }
    }
    requirementOutputs.push(partial);
  }

  const authorityRequirements = requirementOutputs.map(({ output }) => output);
  const satisfiedDecisionIds = uniqueSorted(
    requirementOutputs.flatMap(({ satisfiedDecisionIds: ids }) => ids),
  );
  const delegationIds = uniqueSorted(
    requirementOutputs.flatMap(({ delegationIds: ids }) => ids),
  );
  const outstandingClasses = uniqueSorted(
    authorityRequirements
      .filter(
        (requirement) => stringField(requirement, "status") === "outstanding",
      )
      .map((requirement) => requireString(requirement, "authority_class")),
  );
  const allCandidateIdentities = uniqueSorted(
    authorityRequirements.flatMap((requirement) =>
      objectArrayField(requirement, "eligible_approvers").map((candidate) =>
        identityId(requireObject(candidate, "identity")),
      ),
    ),
  );
  const details: JsonObject = {
    outcome:
      outstandingClasses.length === 0 ? "authorized" : "approval_required",
    authority_requirements: authorityRequirements,
    policy_reference: policyReference(policy),
    reason_codes: [
      outstandingClasses.length === 0
        ? "authority.all_requirements_satisfied"
        : "authority.approval_required",
    ],
  };
  if (outstandingClasses.length > 0) {
    details.required_authority_classes = outstandingClasses;
  }
  if (satisfiedDecisionIds.length > 0) {
    details.authority_decision_ids = satisfiedDecisionIds;
  }
  if (delegationIds.length > 0) {
    details.delegation_ids = delegationIds;
  }
  if (allCandidateIdentities.length === 1) {
    const owner = identitiesById.get(allCandidateIdentities[0] as string);
    if (owner !== undefined) {
      details.authority_owner = owner;
    }
  }
  return finalize(base, details);
}
