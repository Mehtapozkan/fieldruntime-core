import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertValidAuthorityDecision,
  assertValidAuthorityRequest,
  assertValidAuthorityResolutionResult,
  assertValidCaseResponsibility,
  assertValidDelegationGrant,
  assertValidIdentityReference,
  sha256Json,
  validateAuthorityDecisionBinding,
  validateAuthorityResolutionBinding,
} from "../dist/packages/contracts/src/index.js";

const fixtureUrl = new URL(
  "../packages/ecc-pack/fixtures/d6a-authority-contracts.v0.json",
  import.meta.url,
);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

const schemaNames = [
  "identity-reference.v0.schema.json",
  "case-responsibility.v0.schema.json",
  "delegation-grant.v0.schema.json",
  "authority-request.v0.schema.json",
  "authority-decision.v0.schema.json",
  "authority-resolution-result.v0.schema.json",
  "authority-policy.v0.schema.json",
  "authority-record.v0.schema.json",
];

function clone(value) {
  return structuredClone(value);
}

function codes(violations) {
  return violations.map(({ code }) => code);
}

test("identity references distinguish humans, agents, and services without granting authority by label", () => {
  assert.deepEqual(
    new Set(
      Object.values(fixture.identities).map(
        ({ identity_kind }) => identity_kind,
      ),
    ),
    new Set(["human", "agent", "service"]),
  );
  for (const identity of Object.values(fixture.identities)) {
    assert.doesNotThrow(() => assertValidIdentityReference(identity));
  }

  const roleOnly = {
    schema_version: "identity-reference.v0",
    tenant_id: "tenant_acme",
    identity_kind: "human",
    status: "active",
    display_metadata: { role_label: "Executive Sponsor" },
    role_refs: ["role_executive_sponsor"],
  };
  assert.throws(() => assertValidIdentityReference(roleOnly));
  assert.throws(() => assertValidIdentityReference({}));

  const unknownKind = clone(fixture.identities.case_owner);
  unknownKind.identity_kind = "provider_user";
  assert.throws(() => assertValidIdentityReference(unknownKind));
});

test("the synthetic D6-A fixture satisfies every canonical contract", () => {
  assert.doesNotThrow(() =>
    assertValidCaseResponsibility(fixture.case_responsibility),
  );
  for (const grant of Object.values(fixture.delegation_grants)) {
    assert.doesNotThrow(() => assertValidDelegationGrant(grant));
  }
  assert.doesNotThrow(() =>
    assertValidAuthorityRequest(fixture.authority_request),
  );
  assert.doesNotThrow(() =>
    assertValidAuthorityDecision(fixture.finance_approval),
  );
  for (const result of Object.values(fixture.resolution_results)) {
    assert.doesNotThrow(() => assertValidAuthorityResolutionResult(result));
  }
});

test("the public authority schemas remain provider neutral", async () => {
  const providerTerms = ["openai", "anthropic", "oauth", "slack", "okta"];
  for (const schemaName of schemaNames) {
    const schemaText = await readFile(
      new URL(`../packages/contracts/schemas/${schemaName}`, import.meta.url),
      "utf8",
    );
    for (const term of providerTerms) {
      assert.equal(
        schemaText.toLowerCase().includes(term),
        false,
        `${schemaName} leaked provider term ${term}`,
      );
    }
  }
});

test("cross-tenant identities are rejected throughout the authority boundary", () => {
  const responsibility = clone(fixture.case_responsibility);
  responsibility.responsibilities.case_owner.identity.tenant_id =
    "tenant_other";
  assert.throws(
    () => assertValidCaseResponsibility(responsibility),
    /identity\.tenant_mismatch/,
  );

  const delegation = clone(fixture.delegation_grants.active_scoped);
  delegation.delegate_identity.tenant_id = "tenant_other";
  assert.throws(
    () => assertValidDelegationGrant(delegation),
    /identity\.tenant_mismatch/,
  );

  const request = clone(fixture.authority_request);
  request.prepared_by_identity.tenant_id = "tenant_other";
  assert.throws(
    () => assertValidAuthorityRequest(request),
    /identity\.tenant_mismatch/,
  );

  const decision = clone(fixture.finance_approval);
  decision.approver_identity.tenant_id = "tenant_other";
  assert.throws(
    () => assertValidAuthorityDecision(decision),
    /identity\.tenant_mismatch/,
  );

  const result = clone(fixture.resolution_results.threshold_crossing);
  result.evaluated_by_identity.tenant_id = "tenant_other";
  assert.throws(
    () => assertValidAuthorityResolutionResult(result),
    /identity\.tenant_mismatch/,
  );
});

test("case responsibilities preserve independent ownership, execution, and verification", () => {
  const responsibility = fixture.case_responsibility;
  assert.deepEqual(Object.keys(responsibility.responsibilities).sort(), [
    "authority_owner",
    "case_owner",
    "delegated_worker",
    "executor",
    "verifier",
  ]);

  const collapsed = clone(responsibility);
  collapsed.responsibilities.verifier.identity = clone(
    collapsed.responsibilities.executor.identity,
  );
  assert.throws(
    () => assertValidCaseResponsibility(collapsed),
    /responsibility\.verifier_not_independent/,
  );

  const agentAuthorityOwner = clone(responsibility);
  agentAuthorityOwner.responsibilities.authority_owner.identity = clone(
    fixture.identities.worker,
  );
  assert.throws(
    () => assertValidCaseResponsibility(agentAuthorityOwner),
    /authority\.agent_cannot_own_authority/,
  );
});

test("delegations require explicit scope, attribution, and coherent lifecycle state", () => {
  const active = fixture.delegation_grants.active_scoped;
  assert.ok(active.scope.case_ids.includes(fixture.authority_request.case_id));
  assert.ok(active.scope.action_classes.includes("prepare_financial_remedy"));
  assert.ok(active.scope.consequence_classes.includes("customer_credit"));

  const missingScope = clone(active);
  missingScope.scope = {};
  assert.throws(() => assertValidDelegationGrant(missingScope));

  const selfDelegation = clone(active);
  selfDelegation.delegate_identity = clone(selfDelegation.delegator_identity);
  assert.throws(
    () => assertValidDelegationGrant(selfDelegation),
    /delegation\.self_delegation/,
  );

  const invalidWindow = clone(active);
  invalidWindow.effective_until = invalidWindow.effective_from;
  invalidWindow.effective_until_source_timezone =
    invalidWindow.effective_from_source_timezone;
  assert.throws(
    () => assertValidDelegationGrant(invalidWindow),
    /delegation\.invalid_effective_window/,
  );
});

test("revoked, expired, and superseded delegations cannot masquerade as active grants", () => {
  const { expired, revoked, superseded } = fixture.delegation_grants;
  assert.equal(expired.status, "expired");
  assert.equal(revoked.status, "revoked");
  assert.equal(superseded.status, "superseded");
  assert.doesNotThrow(() => assertValidDelegationGrant(expired));
  assert.doesNotThrow(() => assertValidDelegationGrant(revoked));
  assert.doesNotThrow(() => assertValidDelegationGrant(superseded));

  const revokedWithoutEvidence = clone(revoked);
  delete revokedWithoutEvidence.revocation;
  assert.throws(() => assertValidDelegationGrant(revokedWithoutEvidence));

  const activeWithRevocation = clone(revoked);
  activeWithRevocation.status = "active";
  assert.throws(() => assertValidDelegationGrant(activeWithRevocation));

  const expiredWithoutEnd = clone(expired);
  delete expiredWithoutEnd.effective_until;
  delete expiredWithoutEnd.effective_until_source_timezone;
  assert.throws(() => assertValidDelegationGrant(expiredWithoutEnd));

  const supersededWithoutReplacement = clone(superseded);
  delete supersededWithoutReplacement.superseded_by_delegation_id;
  assert.throws(() => assertValidDelegationGrant(supersededWithoutReplacement));
});

test("authority requests bind the exact Case version and proposed consequence hash", () => {
  const request = fixture.authority_request;
  assert.equal(
    sha256Json(fixture.synthetic_consequence),
    request.proposed_consequence_hash,
  );
  assert.equal(request.case_version, 7);

  const missingCase = clone(request);
  delete missingCase.case_id;
  assert.throws(() => assertValidAuthorityRequest(missingCase));

  const missingVersion = clone(request);
  delete missingVersion.case_version;
  assert.throws(() => assertValidAuthorityRequest(missingVersion));

  const malformedHash = clone(request);
  malformedHash.proposed_consequence_hash = "sha256:not-a-digest";
  assert.throws(() => assertValidAuthorityRequest(malformedHash));
});

test("authority times use canonical millisecond UTC with preserved source timezone", () => {
  const nonCanonicalRequest = clone(fixture.authority_request);
  nonCanonicalRequest.requested_at = "2026-08-26T16:05:00Z";
  assert.throws(() => assertValidAuthorityRequest(nonCanonicalRequest));

  const unpairedDelegationEnd = clone(fixture.delegation_grants.active_scoped);
  unpairedDelegationEnd.effective_until = "2026-08-27T16:05:00.000Z";
  delete unpairedDelegationEnd.effective_until_source_timezone;
  assert.throws(() => assertValidDelegationGrant(unpairedDelegationEnd));
});

test("authority decisions bind request, tenant, Case, version, consequence, policy, and correlation", () => {
  const request = fixture.authority_request;
  const approval = fixture.finance_approval;
  assert.deepEqual(validateAuthorityDecisionBinding(request, approval), []);

  const mutations = [
    [
      "authority_request_id",
      "authority_request_other",
      "authority.request_binding_mismatch",
    ],
    ["tenant_id", "tenant_other", "authority.tenant_binding_mismatch"],
    ["case_id", "case_other", "authority.case_binding_mismatch"],
    ["case_version", 8, "authority.case_version_binding_mismatch"],
    [
      "proposed_consequence_hash",
      `sha256:${"0".repeat(64)}`,
      "authority.consequence_binding_mismatch",
    ],
    [
      "correlation_id",
      "correlation_other",
      "authority.correlation_binding_mismatch",
    ],
  ];
  for (const [field, value, expectedCode] of mutations) {
    const changed = clone(approval);
    changed[field] = value;
    assert.ok(
      codes(validateAuthorityDecisionBinding(request, changed)).includes(
        expectedCode,
      ),
    );
  }

  const changedPolicy = clone(approval);
  changedPolicy.policy_reference.policy_version = "0.2.0";
  assert.ok(
    codes(validateAuthorityDecisionBinding(request, changedPolicy)).includes(
      "authority.policy_binding_mismatch",
    ),
  );
});

test("resolution results preserve exact immutable request bindings", () => {
  const request = fixture.authority_request;
  const threshold = fixture.resolution_results.threshold_crossing;
  assert.deepEqual(validateAuthorityResolutionBinding(request, threshold), []);

  const staleVersion = clone(threshold);
  staleVersion.case_version += 1;
  assert.deepEqual(
    codes(validateAuthorityResolutionBinding(request, staleVersion)),
    ["authority.case_version_binding_mismatch"],
  );

  const changedConsequence = clone(threshold);
  changedConsequence.proposed_consequence_hash = `sha256:${"f".repeat(64)}`;
  assert.deepEqual(
    codes(validateAuthorityResolutionBinding(request, changedConsequence)),
    ["authority.consequence_binding_mismatch"],
  );
});

test("an agent may prepare an authority request but cannot approve it or own authority", () => {
  assert.equal(
    fixture.authority_request.prepared_by_identity.identity_kind,
    "agent",
  );
  assert.doesNotThrow(() =>
    assertValidAuthorityRequest(fixture.authority_request),
  );

  const selfApproval = clone(fixture.finance_approval);
  selfApproval.approver_identity = clone(fixture.identities.worker);
  selfApproval.lineage.recorded_by_identity = clone(fixture.identities.worker);
  assert.throws(
    () => assertValidAuthorityDecision(selfApproval),
    /authority\.agent_cannot_decide/,
  );

  const agentOwner = clone(fixture.resolution_results.threshold_crossing);
  agentOwner.outcome = "authorized";
  delete agentOwner.required_authority_classes;
  agentOwner.authority_owner = clone(fixture.identities.worker);
  assert.throws(
    () => assertValidAuthorityResolutionResult(agentOwner),
    /authority\.agent_cannot_own_authority/,
  );

  assert.equal(
    fixture.resolution_results.agent_cannot_self_approve.outcome,
    "no_authority",
  );
});

test("the synthetic $15K consequence crosses the $10K finance limit", () => {
  assert.equal(fixture.synthetic_consequence.amount_minor, 1_500_000);
  assert.equal(fixture.finance_limit_minor, 1_000_000);
  assert.ok(
    fixture.synthetic_consequence.amount_minor > fixture.finance_limit_minor,
  );
  assert.equal(
    fixture.resolution_results.threshold_crossing.outcome,
    "approval_required",
  );
  assert.deepEqual(
    fixture.resolution_results.threshold_crossing.required_authority_classes,
    ["executive_sponsor"],
  );
});

test("expired and stale delegation vectors fail closed with attributable reasons", () => {
  assert.equal(
    fixture.resolution_results.expired_delegation.outcome,
    "expired_delegation",
  );
  assert.deepEqual(
    fixture.resolution_results.expired_delegation.delegation_ids,
    [fixture.delegation_grants.expired.delegation_id],
  );
  assert.equal(
    fixture.resolution_results.stale_delegation.outcome,
    "no_authority",
  );
  assert.deepEqual(fixture.resolution_results.stale_delegation.delegation_ids, [
    fixture.delegation_grants.superseded.delegation_id,
  ]);
});

test("same-rank authority conflicts are explicit and unequal ranks cannot claim a conflict", () => {
  const conflict = fixture.resolution_results.conflicting_authority;
  assert.equal(conflict.outcome, "conflicting_authority");
  assert.deepEqual(
    conflict.authority_candidates.map(({ authority_rank }) => authority_rank),
    [1, 1],
  );
  assert.doesNotThrow(() => assertValidAuthorityResolutionResult(conflict));

  const unequalRanks = clone(conflict);
  unequalRanks.authority_candidates[1].authority_rank = 2;
  assert.throws(
    () => assertValidAuthorityResolutionResult(unequalRanks),
    /authority\.conflict_requires_same_rank/,
  );
});

test("authorized results require completed requirements, approval envelopes, and policy", () => {
  const outstanding = clone(fixture.resolution_results.threshold_crossing);
  outstanding.outcome = "authorized";
  delete outstanding.required_authority_classes;
  assert.throws(() => assertValidAuthorityResolutionResult(outstanding));

  const authorized = clone(outstanding);
  const executiveRequirement = authorized.authority_requirements.find(
    ({ authority_class }) => authority_class === "executive_sponsor",
  );
  executiveRequirement.status = "satisfied";
  executiveRequirement.satisfied_approval_ids = [
    "authority_decision_executive_approval",
  ];
  executiveRequirement.remaining_approval_count = 0;
  authorized.authority_decision_ids.push(
    "authority_decision_executive_approval",
  );
  assert.doesNotThrow(() => assertValidAuthorityResolutionResult(authorized));

  delete authorized.authority_requirements;
  assert.throws(() => assertValidAuthorityResolutionResult(authorized));
});
