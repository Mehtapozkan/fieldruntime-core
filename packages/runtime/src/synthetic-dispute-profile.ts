import {
  assertValidSyntheticDisputeContract,
  assertValidAuthorityPolicy,
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  INTAKE_TENANT,
  intakeObject as o,
  intakeList as list,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "./intake.js";
import { normalizeAuthorityCatalogData } from "./authority-review.js";
import type { DisputeState } from "./dispute-result.js";
export const SYNTHETIC_DISPUTE_VERSIONS = {
  engine: "dispute-result.v2",
  reader: "synthetic-dispute-source.v2",
  material: "dispute-authority-material.v2",
};
export type SyntheticDisputeRole =
  "operator" | "decision" | "reporter" | "verifier" | "recipient" | "evaluator";
const same = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);
export function normalizeSyntheticDisputeProfile(value: unknown): Obj {
  assertValidSyntheticDisputeContract("profile", value);
  const p = o(immutableJson(value)),
    roles = o(p.roles),
    policy = o(p.policy),
    subject = o(p.subject);
  assertValidAuthorityPolicy(policy);
  ensure(
    new Set(list(p.evidence_refs).map((r) => canonicalJson(r))).size ===
      list(p.evidence_refs).length,
    "EVIDENCE_BINDING_CONFLICT",
    "Duplicate retained evidence binding",
  );
  const ids = Object.values(roles).map((v) => o(v).identity_id);
  ensure(
    new Set(ids).size === ids.length,
    "ROLE_SEPARATION",
    "All enrolled roles must be distinct identities",
  );
  for (const [role, v] of Object.entries(roles)) {
    const i = o(v);
    ensure(
      i.tenant_id === INTAKE_TENANT &&
        i.status === "active" &&
        i.identity_kind ===
          (["verifier", "evaluator"].includes(role) ? "service" : "human"),
      "ROLE_SEPARATION",
      "Profile requires active named human roles and independent services in the synthetic tenant",
    );
  }
  ensure(
    String(p.effective_from) < String(p.effective_until),
    "INVALID_PROFILE",
    "Profile effectivity is empty",
  );
  ensure(
    p.policy_content_hash === sha256Json(policy) &&
      policy.tenant_id === subject.tenant_id &&
      policy.status === "approved" &&
      policy.authority_rank === 1 &&
      policy.action_class === "uphold_invoice_no_adjustment" &&
      policy.authority_class === "invoice_dispute_no_adjustment" &&
      policy.consequence_class === "invoice_dispute_no_adjustment",
    "INVALID_PROFILE",
    "Exact approved no-adjustment policy required",
  );
  const rules = list(policy.rules);
  ensure(
    rules.length === 1,
    "INVALID_PROFILE",
    "One explicit synthetic disposition rule is supported",
  );
  const rule = o(rules[0]),
    requirements = list(rule.requirements);
  ensure(
    same(rule.condition, {
      currency: subject.currency,
      minimum_amount_minor: subject.amount_minor,
      maximum_amount_minor: subject.amount_minor,
    }) && requirements.length === 1,
    "INVALID_PROFILE",
    "Policy must cover only the exact disputed amount and currency",
  );
  const requirement = o(requirements[0]);
  ensure(
    requirement.required_approval_count === 1 &&
      requirement.allow_delegation === false &&
      requirement.allow_preparer_approval === false &&
      requirement.authority_class === "invoice_dispute_no_adjustment" &&
      same(requirement.named_approver_identity_ids, [
        o(roles.decision).identity_id,
      ]),
    "INVALID_PROFILE",
    "One separate named decision owner must approve the exact policy",
  );
  return p;
}
export function syntheticProfileFor(
  s: DisputeState,
  caseId: unknown,
  key: unknown,
): Obj | undefined {
  const retained = s.entries
    .filter(
      (e) =>
        e.operation === "enroll" &&
        e.case_id === caseId &&
        e.record_key === key &&
        e.schema_version === "dispute-result-entry.v2",
    )
    .map((e) => o(o(e.data).profile));
  ensure(
    retained.length <= 1,
    "RESULT_INTEGRITY",
    "Conflicting profile enrollments",
  );
  const configured =
    s.enrollmentProfile &&
    o(s.enrollmentProfile.subject).case_id === caseId &&
    o(s.enrollmentProfile.subject).record_key === key
      ? s.enrollmentProfile
      : undefined;
  if (configured && retained[0])
    ensure(
      same(configured, retained[0]),
      "PROFILE_CONFLICT",
      "Host configuration cannot replace an enrolled profile",
    );
  return retained[0] ?? configured;
}
export function assertSyntheticEvidence(s: DisputeState, p: Obj): void {
  const i = s.work.pack.discovery.intake,
    subject = o(p.subject),
    commits = i.commits.filter(
      (c) =>
        c.case_id === subject.case_id && c.record_key === subject.record_key,
    );
  ensure(
    commits.length > 0,
    "CASE_BINDING_REQUIRED",
    "Exact existing record must be committed to the canonical Case",
  );
  const governingHash = String(o(p.source).governing_evidence_hash),
    governing = i.artifacts.get(governingHash);
  ensure(
    governing &&
      list(p.evidence_refs).some((r) => r.artifact_hash === governingHash) &&
      Buffer.from(governing).toString("utf8").trim() ===
        o(p.source).governing_term,
    "EVIDENCE_BINDING_CONFLICT",
    "The exact governing term must be retained and bound, not future fixture truth",
  );
  for (const ref of list(p.evidence_refs)) {
    const bundle = i.bundles.find((b) => b.hash === ref.bundle_hash),
      artifact =
        bundle &&
        list(bundle.artifacts).find(
          (a) =>
            a.byte_hash === ref.artifact_hash &&
            a.document_id === ref.document_id,
        );
    const commit =
      bundle && commits.find((c) => o(c.selection).bundle_id === bundle.id);
    ensure(
      bundle &&
        artifact &&
        commit &&
        i.artifacts.has(String(ref.artifact_hash)),
      "EVIDENCE_BINDING_CONFLICT",
      "Profile evidence is not retained and committed to this exact record",
    );
    const locators =
      artifact.role === "queue"
        ? list(
            list(bundle.records).find(
              (r) => r.record_key === subject.record_key,
            )?.locators,
          )
        : [o(artifact.derived_from)];
    ensure(
      locators.some((l) => same(l, ref.locator)) &&
        (artifact.role === "queue" ||
          (o(commit.selection).support_document_ids as unknown[]).includes(
            artifact.document_id,
          )),
      "EVIDENCE_BINDING_CONFLICT",
      "Evidence locator or reviewed record association differs",
    );
  }
}
export function syntheticDisputeCatalog(p: Obj, previous?: Obj): Obj {
  const roles = o(p.roles),
    subject = o(p.subject),
    identity = (r: SyntheticDisputeRole): Obj => o(roles[r]);
  const grants = (
    ["decision", "verifier", "reporter", "recipient"] as const
  ).map((role) => ({
    schema_version: "authority-record.v0",
    authority_record_id: `authority_generic_${sha256Json(p).slice(7, 39)}_${role}`,
    tenant_id: INTAKE_TENANT,
    identity: identity(role),
    authority_class:
      role === "decision" ? "invoice_dispute_no_adjustment" : `dispute_${role}`,
    authority_rank: 1,
    status: "active",
    scope: {
      case_ids: [subject.case_id],
      organization_scope_ids: p.scope_ids,
      action_classes: [
        role === "decision"
          ? "uphold_invoice_no_adjustment"
          : `dispute_${role}`,
      ],
    },
    effective_from: p.effective_from,
    effective_from_source_timezone: "UTC",
    effective_until: p.effective_until,
    effective_until_source_timezone: "UTC",
    source_type: "authoritative_registry",
    source_ref: `synthetic://dispute-profile/${sha256Json(p)}/${role}`,
  }));
  const data = previous ?? {
    actors: {
      operator: identity("operator").identity_id,
      business: identity("decision").identity_id,
      finance: identity("recipient").identity_id,
      executive: identity("reporter").identity_id,
      finance_delegate: identity("operator").identity_id,
      evaluator: identity("evaluator").identity_id,
    },
    identities: [],
    policies: [],
    authority_records: [],
    delegations: [],
  };
  const identities = [...list(data.identities)];
  for (const v of Object.values(roles)) {
    const id = o(v),
      prior = identities.find((x) => x.identity_id === id.identity_id);
    ensure(
      !prior || same(prior, id),
      "PROFILE_CONFLICT",
      "Existing identity cannot be replaced by enrollment",
    );
    if (!prior) identities.push(id);
  }
  const policies = [...list(data.policies)],
    policy = o(p.policy),
    prior = policies.find((x) => x.policy_id === policy.policy_id);
  ensure(
    !prior || same(prior, policy),
    "PROFILE_CONFLICT",
    "Existing policy cannot be replaced by enrollment",
  );
  if (!prior) policies.push(policy);
  return normalizeAuthorityCatalogData(
    {
      ...data,
      identities,
      policies,
      authority_records: [...list(data.authority_records), ...grants],
    },
    INTAKE_TENANT,
  );
}
export function syntheticDisputeActor(
  data: Obj,
  role: SyntheticDisputeRole,
  p: Obj,
  at: string,
): Obj {
  const expected = o(o(p.roles)[role]),
    identities = list(data.identities).filter(
      (i) => i.identity_id === expected.identity_id,
    );
  ensure(
    identities.length === 1 &&
      same(identities[0], expected) &&
      at >= String(p.effective_from) &&
      at < String(p.effective_until),
    "REVIEWER_INELIGIBLE",
    "Enrolled identity is unavailable or profile expired",
  );
  if (role !== "operator" && role !== "evaluator") {
    const grants = list(data.authority_records).filter(
        (g) =>
          g.source_ref ===
          `synthetic://dispute-profile/${sha256Json(p)}/${role}`,
      ),
      g = grants[0],
      scope = g && o(g.scope);
    ensure(
      grants.length === 1 &&
        g &&
        scope &&
        g.status === "active" &&
        same(g.identity, expected) &&
        g.tenant_id === INTAKE_TENANT &&
        g.authority_rank === 1 &&
        g.authority_class ===
          (role === "decision"
            ? "invoice_dispute_no_adjustment"
            : `dispute_${role}`) &&
        String(g.effective_from) <= at &&
        at < String(g.effective_until) &&
        same(scope.case_ids, [o(p.subject).case_id]) &&
        same(scope.organization_scope_ids, p.scope_ids) &&
        same(scope.action_classes, [
          role === "decision"
            ? "uphold_invoice_no_adjustment"
            : `dispute_${role}`,
        ]),
      "REVIEWER_INELIGIBLE",
      "Exact named role grant is missing, revoked, expired or changed",
    );
  }
  return expected;
}
