import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertValidAuthorityPolicy,
  assertValidAuthorityRecord,
  assertValidAuthorityResolutionResult,
  sha256Json,
} from "../dist/packages/contracts/src/index.js";
import { resolveAuthority } from "../dist/packages/domain/src/index.js";

const fixtureUrl = new URL(
  "../packages/ecc-pack/fixtures/d6b-authority-resolution.v0.json",
  import.meta.url,
);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

function clone(value) {
  return structuredClone(value);
}

function baseInput(key = "credit_15000", overrides = {}) {
  return {
    case: clone(fixture.case_document),
    authorityRequest: clone(fixture.authority_requests[key]),
    proposedConsequence: clone(fixture.consequences[key]),
    identities: Object.values(clone(fixture.identities)),
    responsibilities: clone(fixture.responsibilities),
    authorityRecords: clone(fixture.authority_records),
    delegations: [],
    policies: [clone(fixture.policy)],
    priorAuthorityDecisions: [],
    evaluatedByIdentity: clone(fixture.identities.evaluator),
    asOf: fixture.as_of,
    asOfSourceTimezone: fixture.as_of_source_timezone,
    ...overrides,
  };
}

function approvalFor(key, identityKey, decisionId) {
  const request = fixture.authority_requests[key];
  const identity = fixture.identities[identityKey];
  const decision = clone(fixture.authority_decisions.finance_15000);
  decision.authority_decision_id = decisionId;
  decision.authority_request_id = request.authority_request_id;
  decision.approver_identity = clone(identity);
  decision.case_id = request.case_id;
  decision.case_version = request.case_version;
  decision.proposed_consequence_hash = request.proposed_consequence_hash;
  decision.policy_reference = clone(request.policy_reference);
  decision.correlation_id = request.correlation_id;
  decision.lineage.recorded_by_identity = clone(identity);
  decision.lineage.source_refs = [`fixture://approval/${decisionId}`];
  delete decision.relevant_delegation_ids;
  return decision;
}

function namedApproverPolicy(ruleId, authorityClass, identityId) {
  const policy = clone(fixture.policy);
  const rule = policy.rules.find(({ rule_id }) => rule_id === ruleId);
  const requirement = rule.requirements.find(
    ({ authority_class }) => authority_class === authorityClass,
  );
  requirement.named_approver_identity_ids = [identityId];
  return policy;
}

function authorityRecordFor(identityKey, authorityClass, recordId, sourceRef) {
  const record = clone(fixture.authority_records[0]);
  record.authority_record_id = recordId;
  record.identity = clone(fixture.identities[identityKey]);
  record.authority_class = authorityClass;
  record.source_ref = sourceRef;
  return record;
}

function requirement(result, authorityClass) {
  return result.authority_requirements.find(
    (item) => item.authority_class === authorityClass,
  );
}

test("the ECC resolver fixture has valid policy and authority records", () => {
  assert.doesNotThrow(() => assertValidAuthorityPolicy(fixture.policy));
  for (const record of fixture.authority_records) {
    assert.doesNotThrow(() => assertValidAuthorityRecord(record));
  }
  for (const [key, consequence] of Object.entries(fixture.consequences)) {
    assert.equal(
      sha256Json(consequence),
      fixture.authority_requests[key].proposed_consequence_hash,
    );
  }
});

test("$4K requires only the Business Approver and its exact approval authorizes", () => {
  const unresolved = resolveAuthority(baseInput("credit_4000"));
  assert.equal(unresolved.outcome, "approval_required");
  assert.deepEqual(unresolved.required_authority_classes, [
    "business_approver",
  ]);

  const approval = approvalFor(
    "credit_4000",
    "business_approver",
    "authority_decision_business_4000",
  );
  const authorized = resolveAuthority(
    baseInput("credit_4000", { priorAuthorityDecisions: [approval] }),
  );
  assert.equal(authorized.outcome, "authorized");
});

test("$7K requires Finance rather than the lower Business threshold", () => {
  const result = resolveAuthority(baseInput("credit_7000"));
  assert.equal(result.outcome, "approval_required");
  assert.deepEqual(result.required_authority_classes, ["finance_approver"]);
  assert.equal(
    requirement(result, "finance_approver").eligible_approvers[0].identity
      .identity_id,
    "identity_finance_approver",
  );
});

test("$15K requires both Finance and Executive Sponsor authority", () => {
  const result = resolveAuthority(baseInput());
  assert.equal(result.outcome, "approval_required");
  assert.deepEqual(result.required_authority_classes, [
    "executive_sponsor",
    "finance_approver",
  ]);
  assert.equal(result.authority_requirements.length, 2);
});

test("a valid Finance approval leaves only Executive Sponsor outstanding", () => {
  const result = resolveAuthority(
    baseInput("credit_15000", {
      priorAuthorityDecisions: [fixture.authority_decisions.finance_15000],
    }),
  );
  assert.equal(result.outcome, "approval_required");
  assert.deepEqual(result.required_authority_classes, ["executive_sponsor"]);
  assert.equal(requirement(result, "finance_approver").status, "satisfied");
  assert.equal(requirement(result, "executive_sponsor").status, "outstanding");
  assert.deepEqual(result.authority_decision_ids, [
    "authority_decision_finance_15000",
  ]);
});

test("a Finance approval for another payload does not satisfy $15K authority", () => {
  const changed = clone(fixture.authority_decisions.finance_15000);
  changed.proposed_consequence_hash = `sha256:${"0".repeat(64)}`;
  const result = resolveAuthority(
    baseInput("credit_15000", { priorAuthorityDecisions: [changed] }),
  );
  assert.deepEqual(result.required_authority_classes, [
    "executive_sponsor",
    "finance_approver",
  ]);
  assert.deepEqual(
    requirement(result, "finance_approver").satisfied_approval_ids,
    [],
  );
});

test("a Finance approval for a stale Case version does not satisfy authority", () => {
  const stale = clone(fixture.authority_decisions.finance_15000);
  stale.case_version = 6;
  const result = resolveAuthority(
    baseInput("credit_15000", { priorAuthorityDecisions: [stale] }),
  );
  assert.equal(requirement(result, "finance_approver").status, "outstanding");
});

test("a missing policy returns policy_unavailable", () => {
  const result = resolveAuthority(baseInput("credit_7000", { policies: [] }));
  assert.equal(result.outcome, "policy_unavailable");
  assert.deepEqual(result.reason_codes, ["policy.not_found"]);
});

test("a malformed policy fails closed without invoking authority logic", () => {
  const malformed = clone(fixture.policy);
  malformed.rules[0].condition.minimum_amount_minor = 600000;
  const result = resolveAuthority(
    baseInput("credit_4000", { policies: [malformed] }),
  );
  assert.equal(result.outcome, "policy_unavailable");
  assert.deepEqual(result.reason_codes, ["policy.malformed"]);
});

test("two contradictory current policies return conflicting_authority", () => {
  const conflicting = clone(fixture.policy);
  conflicting.source_ref = "fixture://policy/financial-remedy-conflict";
  conflicting.rules[2].requirements[0].authority_class = "business_approver";
  const result = resolveAuthority(
    baseInput("credit_15000", {
      policies: [fixture.policy, conflicting],
    }),
  );
  assert.equal(result.outcome, "conflicting_authority");
  assert.deepEqual(result.reason_codes, ["policy.conflicting_current_records"]);
  assert.equal(result.conflicting_source_refs.length, 2);
});

test("exact duplicate policy records are semantically one input", () => {
  const single = resolveAuthority(baseInput("credit_7000"));
  const duplicate = resolveAuthority(
    baseInput("credit_7000", { policies: [fixture.policy, fixture.policy] }),
  );
  assert.equal(duplicate.outcome, single.outcome);
  assert.deepEqual(
    duplicate.required_authority_classes,
    single.required_authority_classes,
  );
});

test("an expired scoped delegation is explicit", () => {
  const policy = namedApproverPolicy(
    "rule_credit_5001_to_10000",
    "finance_approver",
    "identity_finance_delegate",
  );
  const result = resolveAuthority(
    baseInput("credit_7000", {
      policies: [policy],
      delegations: [fixture.delegations.expired],
    }),
  );
  assert.equal(result.outcome, "expired_delegation");
  assert.deepEqual(result.delegation_ids, ["delegation_finance_expired"]);
});

test("a revoked delegation cannot satisfy named authority", () => {
  const policy = namedApproverPolicy(
    "rule_credit_5001_to_10000",
    "finance_approver",
    "identity_finance_delegate",
  );
  const result = resolveAuthority(
    baseInput("credit_7000", {
      policies: [policy],
      delegations: [fixture.delegations.revoked],
    }),
  );
  assert.equal(result.outcome, "no_authority");
  assert.deepEqual(result.reason_codes, ["delegation.revoked"]);
});

test("a valid scoped delegation can carry an exact approval", () => {
  const policy = namedApproverPolicy(
    "rule_credit_5001_to_10000",
    "finance_approver",
    "identity_finance_delegate",
  );
  const delegatedApproval = approvalFor(
    "credit_7000",
    "finance_delegate",
    "authority_decision_delegate_7000",
  );
  delegatedApproval.relevant_delegation_ids = ["delegation_finance_active"];
  const result = resolveAuthority(
    baseInput("credit_7000", {
      policies: [policy],
      delegations: [fixture.delegations.active],
      priorAuthorityDecisions: [delegatedApproval],
    }),
  );
  assert.equal(result.outcome, "authorized");
  assert.deepEqual(result.delegation_ids, ["delegation_finance_active"]);
  assert.deepEqual(result.authority_decision_ids, [
    "authority_decision_delegate_7000",
  ]);
});

test("a delegation outside the exact Case scope is ignored", () => {
  const policy = namedApproverPolicy(
    "rule_credit_5001_to_10000",
    "finance_approver",
    "identity_finance_delegate",
  );
  const wrongScope = clone(fixture.delegations.active);
  wrongScope.scope.case_ids = ["case_other"];
  const result = resolveAuthority(
    baseInput("credit_7000", {
      policies: [policy],
      delegations: [wrongScope],
    }),
  );
  assert.equal(result.outcome, "no_authority");
  assert.deepEqual(result.reason_codes, ["authority.no_eligible_principal"]);
});

test("a cross-tenant delegation is rejected", () => {
  const crossTenant = clone(fixture.delegations.active);
  crossTenant.tenant_id = "tenant_other";
  for (const identity of [
    crossTenant.delegator_identity,
    crossTenant.delegate_identity,
    crossTenant.created_by_identity,
    crossTenant.approved_by_identity,
    crossTenant.provenance.recorded_by_identity,
  ]) {
    identity.tenant_id = "tenant_other";
  }
  const result = resolveAuthority(
    baseInput("credit_7000", { delegations: [crossTenant] }),
  );
  assert.equal(result.outcome, "no_authority");
  assert.deepEqual(result.reason_codes, ["delegation.tenant_mismatch"]);
});

test("same-rank authority records remain a visible conflict", () => {
  const conflictingExecutive = authorityRecordFor(
    "executive_sponsor_b",
    "executive_sponsor",
    "authority_record_executive_b",
    "fixture://authority/executive-b",
  );
  const result = resolveAuthority(
    baseInput("credit_15000", {
      authorityRecords: [...fixture.authority_records, conflictingExecutive],
    }),
  );
  assert.equal(result.outcome, "conflicting_authority");
  assert.deepEqual(
    result.authority_candidates.map(({ identity }) => identity.identity_id),
    ["identity_executive_sponsor", "identity_executive_sponsor_b"],
  );
});

test("lower-rank and superseded authority records do not displace live rank one", () => {
  const lowerRank = authorityRecordFor(
    "executive_sponsor_b",
    "executive_sponsor",
    "authority_record_executive_lower",
    "fixture://authority/executive-lower",
  );
  lowerRank.authority_rank = 2;
  const superseded = clone(lowerRank);
  superseded.authority_record_id = "authority_record_executive_superseded";
  superseded.authority_rank = 1;
  superseded.status = "superseded";
  superseded.source_ref = "fixture://authority/executive-superseded";
  const result = resolveAuthority(
    baseInput("credit_15000", {
      authorityRecords: [...fixture.authority_records, lowerRank, superseded],
    }),
  );
  assert.equal(result.outcome, "approval_required");
  assert.equal(
    requirement(result, "executive_sponsor").eligible_approvers[0].identity
      .identity_id,
    "identity_executive_sponsor",
  );
});

test("an explicit named approver resolves despite another same-rank role holder", () => {
  const policy = namedApproverPolicy(
    "rule_credit_above_10000",
    "executive_sponsor",
    "identity_executive_sponsor",
  );
  const otherExecutive = authorityRecordFor(
    "executive_sponsor_b",
    "executive_sponsor",
    "authority_record_executive_b",
    "fixture://authority/executive-b",
  );
  const result = resolveAuthority(
    baseInput("credit_15000", {
      policies: [policy],
      authorityRecords: [...fixture.authority_records, otherExecutive],
    }),
  );
  assert.equal(result.outcome, "approval_required");
  assert.deepEqual(
    requirement(result, "executive_sponsor").eligible_approvers.map(
      ({ identity }) => identity.identity_id,
    ),
    ["identity_executive_sponsor"],
  );
});

test("an agent may prepare the request but cannot approve itself", () => {
  const agentApproval = approvalFor(
    "credit_7000",
    "worker",
    "authority_decision_agent_7000",
  );
  const result = resolveAuthority(
    baseInput("credit_7000", {
      priorAuthorityDecisions: [agentApproval],
    }),
  );
  assert.equal(result.outcome, "approval_required");
  assert.deepEqual(
    requirement(result, "finance_approver").satisfied_approval_ids,
    [],
  );
});

test("tool permissions and historical actors are outside authority evidence", () => {
  const baseline = resolveAuthority(baseInput("credit_7000"));
  const unrelated = baseInput("credit_7000");
  unrelated.toolPermissions = ["approve_financial_remedy"];
  unrelated.historicalActorRecords = [
    { identity_id: "identity_work_agent", prior_action: "approved_credit" },
  ];
  assert.deepEqual(resolveAuthority(unrelated), baseline);
});

test("a changed proposed consequence hash fails before policy resolution", () => {
  const request = clone(fixture.authority_requests.credit_15000);
  request.proposed_consequence_hash = `sha256:${"f".repeat(64)}`;
  const result = resolveAuthority(
    baseInput("credit_15000", { authorityRequest: request }),
  );
  assert.equal(result.outcome, "no_authority");
  assert.deepEqual(result.reason_codes, [
    "authority.consequence_binding_mismatch",
  ]);
});

test("a changed policy version and a pre-request decision invalidate prior approval", () => {
  const changedVersion = clone(fixture.authority_decisions.finance_15000);
  changedVersion.policy_reference.policy_version = "0.9.0";
  const requestWithoutPolicy = clone(fixture.authority_requests.credit_15000);
  delete requestWithoutPolicy.policy_reference;
  const result = resolveAuthority(
    baseInput("credit_15000", {
      authorityRequest: requestWithoutPolicy,
      priorAuthorityDecisions: [changedVersion],
    }),
  );
  assert.equal(requirement(result, "finance_approver").status, "outstanding");

  const premature = clone(fixture.authority_decisions.finance_15000);
  premature.decided_at = "2026-08-26T16:04:59.000Z";
  const prematureResult = resolveAuthority(
    baseInput("credit_15000", { priorAuthorityDecisions: [premature] }),
  );
  assert.equal(
    requirement(prematureResult, "finance_approver").status,
    "outstanding",
  );
});

test("all exact required approvals produce authorized", () => {
  const result = resolveAuthority(
    baseInput("credit_15000", {
      priorAuthorityDecisions: Object.values(fixture.authority_decisions),
    }),
  );
  assert.equal(result.outcome, "authorized");
  assert.ok(
    result.authority_requirements.every(({ status }) => status === "satisfied"),
  );
  assert.deepEqual(result.authority_decision_ids, [
    "authority_decision_executive_15000",
    "authority_decision_finance_15000",
  ]);
});

test("identical canonical inputs produce byte-identical immutable results", () => {
  const first = resolveAuthority(baseInput("credit_15000"));
  const second = resolveAuthority(baseInput("credit_15000"));
  assert.deepEqual(second, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.authority_requirements), true);
});

test("semantically equivalent input record order does not change resolution", () => {
  const approvals = Object.values(fixture.authority_decisions);
  const ordered = resolveAuthority(
    baseInput("credit_15000", { priorAuthorityDecisions: approvals }),
  );
  const reversedInput = baseInput("credit_15000", {
    identities: Object.values(clone(fixture.identities)).reverse(),
    authorityRecords: clone(fixture.authority_records).reverse(),
    policies: [clone(fixture.policy), clone(fixture.policy)].reverse(),
    priorAuthorityDecisions: clone(approvals).reverse(),
  });
  assert.deepEqual(resolveAuthority(reversedInput), ordered);
});

test("canonical output retains the exact policy, authority, and approval evidence", () => {
  const result = resolveAuthority(
    baseInput("credit_15000", {
      priorAuthorityDecisions: [fixture.authority_decisions.finance_15000],
    }),
  );
  const finance = requirement(result, "finance_approver");
  assert.deepEqual(finance.evidence_refs, [
    "fixture://approval/finance-15000",
    "fixture://authority/finance",
    "fixture://policy/financial-remedy-v1",
    "fixture://policy/financial-remedy-v1#rule_credit_above_10000",
  ]);
  assert.deepEqual(
    { ...result.policy_reference },
    {
      policy_id: "policy_financial_remedy",
      policy_version: "1.0.0",
    },
  );
  assert.doesNotThrow(() => assertValidAuthorityResolutionResult(result));
});

test("malformed authority state fails closed", () => {
  const malformed = clone(fixture.authority_records[1]);
  delete malformed.source_ref;
  const result = resolveAuthority(
    baseInput("credit_7000", { authorityRecords: [malformed] }),
  );
  assert.equal(result.outcome, "no_authority");
  assert.deepEqual(result.reason_codes, ["authority_record.malformed"]);
});

test("a stale Authority Request returns stale_case_version", () => {
  const stale = clone(fixture.authority_requests.credit_7000);
  stale.case_version = 6;
  const result = resolveAuthority(
    baseInput("credit_7000", { authorityRequest: stale }),
  );
  assert.equal(result.outcome, "stale_case_version");
  assert.equal(result.current_case_version, 7);
});

test("cross-tenant authority records fail closed", () => {
  const crossTenant = clone(fixture.authority_records[1]);
  crossTenant.tenant_id = "tenant_other";
  crossTenant.identity.tenant_id = "tenant_other";
  const result = resolveAuthority(
    baseInput("credit_7000", { authorityRecords: [crossTenant] }),
  );
  assert.equal(result.outcome, "no_authority");
  assert.deepEqual(result.reason_codes, ["authority_record.tenant_mismatch"]);
});
