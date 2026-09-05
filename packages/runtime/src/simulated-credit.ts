import {
  assertVerificationIntegrity,
  isVerification,
  retryAbsence,
} from "./credit-verification.js";
import {
  assertValidSimulatedCreditContract,
  assertValidSimulatedCreditV2Contract,
  canonicalJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  normalizeAuthorityCatalogData,
  readAuthorityRequest,
} from "./authority-review.js";
import {
  getCase,
  replayCaseJournal,
  type CaseEngineState,
} from "./case-engine.js";
import {
  AuthorityReviewError,
  integer,
  json,
  object,
  objects,
  string,
  type AuthorityCatalogHead,
  type AuthorityState,
  type ObjectValue,
} from "./authority-review-types.js";

const serviceSpecs = [
  ["executor", "identity_d7_credit_executor", "simulated_credit_executor"],
  ["verifier", "identity_d7_credit_verifier", "simulated_credit_verifier"],
  ["evaluator", "identity_d6_evaluator", "simulated_credit_evaluator"],
] as const;
const SERVICE_SCOPE = json({
  case_ids: ["case_d6_workbench"],
  organization_scope_ids: ["scope_customer_ops"],
  action_classes: ["customer_credit"],
  consequence_classes: ["financial_remedy"],
});
const SERVICE_REQUIREMENTS = serviceSpecs.map(([key, id, authority]) => ({
  authority_record_id: `authority_d7_credit_${key}`,
  identity_id: id,
  authority_class: authority,
  authority_rank: 1,
  scope: SERVICE_SCOPE,
}));
export const CREDIT_TARGET = json({
  source: "simulated_credit_source.v1",
  tenant_id: "tenant_orchid",
  case_id: "case_d6_workbench",
  account_ref: "synthetic://accounts/orchid",
  operation: "customer_credit",
  slot: "service_remedy",
});
export const CREDIT_PAYLOAD = json({
  consequence_class: "financial_remedy",
  account_ref: "synthetic://accounts/orchid",
  amount_minor: 1500000,
  currency: "USD",
});
export const CREDIT_PROFILE = json({
  version: "orchid-simulated-credit.v1",
  service_requirements: SERVICE_REQUIREMENTS,
  one_credit_per_case: true,
  minimum_distinct_reviewers: 2,
  precondition: "slot_absent",
  target: CREDIT_TARGET,
  payload: CREDIT_PAYLOAD,
  allowed_states: ["needs_review"],
  workflow_version_id: "workflow_ecc_v0_1_0",
  workflow_id: "customer_escalation_commitment_control",
  workflow_version: "0.1.0",
  scope_ids: ["scope_customer_ops"],
  policy_id: "policy_d6_financial_remedy",
  policy_version: "1.0.0",
  policy_rule_id: "rule_d6_large",
  executor: "identity_d7_credit_executor",
  evaluator: "identity_d6_evaluator",
  verifier: "identity_d7_credit_verifier",
  verification_predicate:
    "exactly one matching Orchid service-remedy credit; original customer impact is not verified",
});
export const CREDIT_PROFILE_HASH = sha256Json(CREDIT_PROFILE);
export const CREDIT_ACTION_HASH = sha256Json({
  profile_hash: CREDIT_PROFILE_HASH,
  target: CREDIT_TARGET,
  payload: CREDIT_PAYLOAD,
  precondition: "slot_absent",
});
export const CREDIT_VERSIONS = json({
  engine: "simulated-credit-engine.v1",
  canonicalization: "canonical-json.v1",
  gateway: "simulated-credit-gateway.v1",
  resolver: "authority-resolution.d6c.v2",
  adapter: "simulated-credit-adapter.v1",
});
const SOURCE = `synthetic://d7/profiles/orchid-simulated-credit.v1/${CREDIT_PROFILE_HASH}`;
export function creditAssert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new AuthorityReviewError("CREDIT_INTEGRITY", message);
}
export function creditSame(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
function identity(id: string): ObjectValue {
  return json({
    schema_version: "identity-reference.v0",
    identity_id: id,
    tenant_id: "tenant_orchid",
    identity_kind: "service",
    status: "active",
  });
}
function grants(): ObjectValue[] {
  return serviceSpecs.map(([key, id, authority]) =>
    json({
      schema_version: "authority-record.v0",
      authority_record_id: `authority_d7_credit_${key}`,
      tenant_id: "tenant_orchid",
      identity: identity(id),
      authority_class: authority,
      authority_rank: 1,
      status: "active",
      scope: SERVICE_SCOPE,
      effective_from: "2026-01-01T00:00:00.000Z",
      effective_from_source_timezone: "UTC",
      source_type: "authoritative_registry",
      source_ref: SOURCE,
    }),
  );
}
// Explicit fixed enrollment only. Existing or formerly enrolled identities never
// get resurrected, and the D6 named-principal policy/seat map is untouched.
export function enrollCreditCatalog(
  input: ObjectValue,
  priorCatalogs: readonly ObjectValue[],
): ObjectValue {
  const data = normalizeAuthorityCatalogData(input, "tenant_orchid");
  const additions = [
    identity("identity_d7_credit_executor"),
    identity("identity_d7_credit_verifier"),
  ];
  const records = grants();
  const exact = (
    values: ObjectValue[],
    expected: ObjectValue,
    key: string,
  ): boolean => {
    const matches = values.filter((value) => value[key] === expected[key]);
    return matches.length === 1 && creditSame(matches[0], expected);
  };
  creditAssert(
    exact(
      objects(data.identities),
      identity("identity_d6_evaluator"),
      "identity_id",
    ),
    "active canonical evaluator required",
  );
  const hasReserved = (catalog: ObjectValue): boolean =>
    objects(catalog.identities).some((item) =>
      additions.some((x) => x.identity_id === item.identity_id),
    ) ||
    objects(catalog.authority_records).some((item) =>
      records.some((x) => x.authority_record_id === item.authority_record_id),
    );
  if (hasReserved(data)) {
    creditAssert(
      additions.every((x) =>
        exact(objects(data.identities), x, "identity_id"),
      ) &&
        records.every((x) =>
          exact(objects(data.authority_records), x, "authority_record_id"),
        ),
      "partial, altered or revoked D7 enrollment",
    );
    return data;
  }
  creditAssert(
    !priorCatalogs.some(hasReserved),
    "prior D7 enrollment cannot be recreated",
  );
  return normalizeAuthorityCatalogData(
    {
      ...data,
      identities: [...objects(data.identities), ...additions],
      authority_records: [...objects(data.authority_records), ...records],
    },
    "tenant_orchid",
  );
}
export interface CreditState {
  readonly version?: 1 | 2;
  readonly entries: readonly ObjectValue[];
  readonly sources: readonly ObjectValue[];
}
export interface CreditContext {
  readonly cases: CaseEngineState;
  readonly authority: AuthorityState;
  readonly heads: readonly AuthorityCatalogHead[];
  readonly credit: CreditState;
}
export function creditFloor(
  context: CreditContext,
  head: AuthorityCatalogHead,
): string {
  return context.cases.cases
    .flatMap((c) => c.journal.map((e) => e.recorded_at))
    .reduce((a, b) => (a > b ? a : b), head.last_recorded_at);
}
export function evaluateCredit(
  context: CreditContext,
  command: ObjectValue,
  at: string,
  version: 1 | 2 = 1,
): ObjectValue {
  assertValidSimulatedCreditContract("command", command);
  creditAssert(
    command.tenant_id === CREDIT_TARGET.tenant_id &&
      command.case_id === CREDIT_TARGET.case_id,
    "unsupported simulated credit scope",
  );
  const head = context.heads.find((h) => h.tenant_id === command.tenant_id);
  creditAssert(head, "catalog missing");
  const aggregate = getCase(
    context.cases,
    head.tenant_id,
    string(command.case_id),
  );
  creditAssert(aggregate, "Case missing");
  const packet = readAuthorityRequest(
    context.authority,
    context.cases,
    head,
    string(command.authority_request_id),
    new Date(at),
  );
  creditAssert(
    packet && packet.case_id === command.case_id,
    "request missing or outside Case",
  );
  const catalog = context.authority.snapshots.find(
    (s) => s.hash === head.snapshot_hash,
  );
  creditAssert(catalog, "catalog snapshot missing");
  const data = object(catalog.content.data),
    record = object(aggregate.document.case);
  const reasons: string[] = [];
  const check = (ok: boolean, reason: string): void => {
    if (!ok) reasons.push(reason);
  };
  check(at >= creditFloor(context, head), "clock_regression");
  check(
    command.expected_case_version === packet.case_version,
    "case_version_conflict",
  );
  check(
    command.expected_review_revision === packet.review_revision,
    "review_revision_conflict",
  );
  check(
    command.expected_authority_state_revision === head.revision,
    "catalog_revision_conflict",
  );
  check(
    command.request_binding_hash === packet.request_binding_hash,
    "request_binding_conflict",
  );
  check(
    command.expected_action_binding_hash === CREDIT_ACTION_HASH,
    "action_binding_conflict",
  );
  check(
    object(packet.current).authorized === true,
    "current_authority_required",
  );
  if (object(packet.current).authorized !== true)
    reasons.push(...(object(packet.current).reason_codes as readonly string[]));
  check(
    creditSame(object(packet.material).consequence, CREDIT_PAYLOAD),
    "payload_mismatch",
  );
  check(
    record.customer_ref === CREDIT_TARGET.account_ref &&
      creditSame(record.scope_ids, CREDIT_PROFILE.scope_ids) &&
      record.workflow_version_id === CREDIT_PROFILE.workflow_version_id,
    "case_scope_mismatch",
  );
  const workflow = object(aggregate.document.workflow_version);
  check(
    workflow.id === CREDIT_PROFILE.workflow_version_id &&
      workflow.workflow_id === CREDIT_PROFILE.workflow_id &&
      workflow.version === CREDIT_PROFILE.workflow_version,
    "workflow_binding_mismatch",
  );
  check(record.state === "needs_review", "case_state_ineligible");
  check(
    object(packet.request).proposed_consequence_hash ===
      sha256Json(CREDIT_PAYLOAD),
    "consequence_binding_mismatch",
  );
  const request = object(packet.request),
    policyRef = object(request.policy_reference);
  check(
    policyRef.policy_id === CREDIT_PROFILE.policy_id &&
      policyRef.policy_version === CREDIT_PROFILE.policy_version,
    "policy_profile_mismatch",
  );
  const resolution = object(packet.current).resolution;
  const requirements =
    resolution === null
      ? []
      : objects(object(resolution).authority_requirements ?? []);
  check(
    requirements.length === 2 &&
      ["finance_approver", "executive_sponsor"].every((authority) =>
        requirements.some(
          (r) =>
            r.authority_class === authority &&
            r.required_approval_count === 1 &&
            string(r.policy_rule_ref).endsWith("#rule_d6_large"),
        ),
      ),
    "policy_rule_mismatch",
  );
  const effectiveIds = new Set(
    object(packet.current).effective_approval_ids as readonly string[],
  );
  const approvingPeople = new Set(
    objects(packet.history)
      .filter((entry) => entry.decision !== undefined)
      .map((entry) => object(entry.decision))
      .filter(
        (decision) =>
          effectiveIds.has(string(decision.authority_decision_id)) &&
          decision.decision === "approve" &&
          object(decision.approver_identity).identity_kind === "human",
      )
      .map((decision) =>
        string(object(decision.approver_identity).identity_id),
      ),
  );
  check(
    approvingPeople.size >= integer(CREDIT_PROFILE.minimum_distinct_reviewers),
    "distinct_reviewers_required",
  );
  const serviceGrants: ObjectValue[] = [];
  for (const key of ["executor", "evaluator"] as const) {
    const result = creditServiceEligibility(data, key, at);
    reasons.push(...result.reasons);
    if (result.grant) serviceGrants.push(result.grant);
  }
  check(!context.credit.sources.length, "credit_already_recorded");
  const absence = version === 2 ? retryAbsence(context.credit.entries) : null;
  const latestInvocation = context.credit.entries
    .filter((e) => e.outcome === "simulated_action_recorded")
    .at(-1);
  check(
    version === 1
      ? !context.credit.entries.some(
          (e) => e.outcome === "simulated_action_recorded" && e.source === null,
        )
      : !latestInvocation ||
          latestInvocation.source !== null ||
          absence !== null,
    "independent_absence_check_required",
  );
  const envelope = json({
    schema_version: `authorization-envelope.v${String(version)}`,
    ...(version === 2 ? { absence_verification_hash: absence } : {}),
    command,
    profile: CREDIT_PROFILE,
    profile_hash: CREDIT_PROFILE_HASH,
    action_binding_hash: CREDIT_ACTION_HASH,
    target: CREDIT_TARGET,
    payload: CREDIT_PAYLOAD,
    packet,
    catalog: catalog.content,
    case_document: aggregate.document,
    case_heads: [
      {
        tenant_id: aggregate.tenant_id,
        case_id: aggregate.case_id,
        version: aggregate.journal.length,
        event_hash: aggregate.journal.at(-1)?.event_hash,
      },
    ],
    authority_position: context.authority.entries.length,
    clock_floor: creditFloor(context, head),
    evaluated_at: at,
    evaluated_at_source_timezone: "UTC",
    authorized: reasons.length === 0,
    reason_codes: [...new Set(reasons)].sort(),
    service_grants: serviceGrants,
    implementation_versions: creditVersions(version),
  });
  creditContract(version, "envelope", envelope);
  return envelope;
}
export function creditSource(id: string, at: string): ObjectValue {
  const row = json({
    schema_version: "simulated-credit-source-row.v1",
    target: CREDIT_TARGET,
    payload: CREDIT_PAYLOAD,
    origin_attempt_id: id,
    effected_at: at,
    effected_at_source_timezone: "UTC",
  });
  return json({ ...row, row_hash: sha256Json(row) });
}
export function creditEntry(
  context: CreditContext,
  envelope: ObjectValue,
  id: string,
  report: string,
  source: ObjectValue | null,
): ObjectValue {
  const version =
    envelope.schema_version === "authorization-envelope.v2" ? 2 : 1;
  const packet = object(envelope.packet),
    command = object(envelope.command);
  const aggregate = getCase(
    context.cases,
    "tenant_orchid",
    "case_d6_workbench",
  );
  const entry = json({
    schema_version: `simulated-action-journal-entry.v${String(version)}`,
    id,
    sequence: context.credit.entries.length + 1,
    tenant_id: command.tenant_id,
    case_id: command.case_id,
    slot: "service_remedy",
    authority_request_id: command.authority_request_id,
    review_revision: packet.review_revision,
    review_head_hash: objects(packet.history).at(-1)?.event_hash,
    case_version: packet.case_version,
    case_head_hash: aggregate?.journal.at(-1)?.event_hash,
    catalog_hash: sha256Json(envelope.catalog),
    authority_state_revision: packet.authority_state_revision,
    authority_position: envelope.authority_position,
    recorded_at: envelope.evaluated_at,
    recorded_at_source_timezone: "UTC",
    previous_event_hash: context.credit.entries.at(-1)?.event_hash ?? null,
    command,
    command_fingerprint: sha256Json(command),
    idempotency_key: command.idempotency_key,
    envelope,
    envelope_hash: sha256Json(envelope),
    outcome: envelope.authorized ? "simulated_action_recorded" : "denied",
    adapter_report: report,
    source,
    simulation: true,
    verification: version === 2 ? "unverified" : "not_implemented",
    closure_permission: false,
    implementation_versions: creditVersions(version),
  });
  const result = json({ ...entry, event_hash: sha256Json(entry) });
  creditContract(version, "journal", result);
  return result;
}
// Recreate canonical state at each attempt's retained frontiers, then recompute
// permission. No adapter is called during replay. Hashes alone are insufficient.
export function assertCreditIntegrity(context: CreditContext): void {
  const seen = new Set<string>();
  for (let index = 0; index < context.credit.entries.length; index++) {
    const entry = context.credit.entries[index];
    creditAssert(entry, "missing credit entry");
    creditAssert(
      !seen.has(string(entry.idempotency_key)),
      "duplicate credit command",
    );
    seen.add(string(entry.idempotency_key));
    if (isVerification(entry)) {
      assertVerificationIntegrity(context, index);
      continue;
    }
    const version =
      entry.schema_version === "simulated-action-journal-entry.v2" ? 2 : 1;
    creditContract(version, "journal", entry);
    const envelope = object(entry.envelope);
    const cases = objects(envelope.case_heads).map((anchor) => {
      const current = getCase(
        context.cases,
        string(anchor.tenant_id),
        string(anchor.case_id),
      );
      const version = integer(anchor.version);
      creditAssert(
        current &&
          current.journal[version - 1]?.event_hash === anchor.event_hash,
        "credit Case anchor drift",
      );
      // A valid prefix was not current if an omitted Case entry strictly
      // predates issuance. Later changes preserve historical actions; equal
      // timestamps alone cannot order the separate Case and action journals.
      creditAssert(
        !current.journal
          .slice(version)
          .some((later) => later.recorded_at < string(entry.recorded_at)),
        "credit ignored an earlier Case change",
      );
      return replayCaseJournal(current.journal.slice(0, version));
    });
    creditAssert(
      new Set(cases.map((c) => `${c.tenant_id}/${c.case_id}`)).size ===
        cases.length,
      "duplicate Case anchors",
    );
    const position = integer(entry.authority_position);
    creditAssert(
      position <= context.authority.entries.length,
      "credit ahead of review history",
    );
    const catalog = context.authority.snapshots.find(
      (s) => s.hash === entry.catalog_hash && s.kind === "catalog",
    );
    creditAssert(
      catalog &&
        catalog.content.revision === entry.authority_state_revision &&
        integer(catalog.content.after_review_position) <= position,
      "credit catalog anchor drift",
    );
    creditAssert(
      !context.authority.snapshots.some(
        (s) =>
          s.kind === "catalog" &&
          s.tenant_id === entry.tenant_id &&
          integer(s.content.revision) >
            integer(entry.authority_state_revision) &&
          integer(s.content.after_review_position) <= position &&
          string(s.content.recorded_at) < string(entry.recorded_at),
      ),
      "credit ignored an earlier catalog change",
    );
    const priorEntries = context.credit.entries.slice(0, index);
    creditAssert(
      index === 0 ||
        (integer(priorEntries.at(-1)?.authority_position) <= position &&
          integer(priorEntries.at(-1)?.authority_state_revision) <=
            integer(entry.authority_state_revision)),
      "credit frontiers regressed",
    );
    const reviewEntries = context.authority.entries.slice(0, position);
    const floor = [
      ...reviewEntries.filter((e) => e.tenant_id === entry.tenant_id),
      ...priorEntries,
    ]
      .map((e) => string(e.recorded_at))
      .reduce((a, b) => (a > b ? a : b), string(catalog.content.recorded_at));
    // The existing runtime clock floor is a trusted scalar control input. Its
    // canonical timestamp can come from another Case; retain no cross-scope Case
    // identifiers or hashes in this operation's consent/evaluation envelope.
    const retainedFloor = string(envelope.clock_floor);
    const boundFloor = cases
      .flatMap((c) => c.journal.map((e) => e.recorded_at))
      .reduce((a, b) => (a > b ? a : b), floor);
    creditAssert(
      retainedFloor >= boundFloor &&
        retainedFloor <= string(entry.recorded_at) &&
        (retainedFloor === floor ||
          context.cases.cases.some((c) =>
            c.journal.some((e) => e.recorded_at === retainedFloor),
          )),
      "retained runtime clock floor is not supported by canonical history",
    );
    const past: CreditContext = {
      cases: { cases, idempotency_records: [], source_event_records: [] },
      authority: { ...context.authority, entries: reviewEntries },
      heads: [
        {
          tenant_id: "tenant_orchid",
          revision: integer(entry.authority_state_revision),
          snapshot_hash: catalog.hash,
          last_recorded_at: retainedFloor,
        },
      ],
      credit: {
        entries: priorEntries,
        sources: priorEntries
          .filter((e) => e.source !== null)
          .map((e) => object(e.source)),
      },
    };
    const expected = evaluateCredit(
      past,
      object(entry.command),
      string(entry.recorded_at),
      version,
    );
    creditAssert(
      creditSame(expected, envelope) &&
        !(envelope.reason_codes as readonly string[]).includes(
          "clock_regression",
        ),
      "credit evaluation differs from canonical replay",
    );
    const source = entry.source === null ? null : object(entry.source);
    creditAssert(
      envelope.authorized === true
        ? entry.adapter_report !== "not_invoked"
        : entry.adapter_report === "not_invoked" && source === null,
      "adapter invocation without authority",
    );
    if (source !== null)
      creditAssert(
        creditSame(
          source,
          creditSource(string(entry.id), string(entry.recorded_at)),
        ),
        "source payload or origin drift",
      );
    creditAssert(
      creditSame(
        entry,
        creditEntry(
          past,
          expected,
          string(entry.id),
          string(entry.adapter_report),
          source,
        ),
      ),
      "credit journal differs from replay",
    );
  }
  creditAssert(
    creditSame(
      context.credit.sources,
      context.credit.entries
        .filter((e) => e.source !== null)
        .map((e) => e.source),
    ),
    "source/action atomic evidence drift",
  );
  creditAssert(context.credit.sources.length <= 1, "duplicate business credit");
}

export function readCredit(
  context: CreditContext,
  now: Date,
  version: 1 | 2 = 1,
): ObjectValue {
  const latest = context.authority.entries
    .filter(
      (e) =>
        e.tenant_id === CREDIT_TARGET.tenant_id &&
        e.case_id === CREDIT_TARGET.case_id &&
        e.review_revision === 0,
    )
    .at(-1);
  let current: ObjectValue | null = null;
  const head = context.heads.find(
    (h) => h.tenant_id === CREDIT_TARGET.tenant_id,
  );
  if (latest && head) {
    const packet = readAuthorityRequest(
      context.authority,
      context.cases,
      head,
      string(latest.authority_request_id),
      now,
    );
    creditAssert(packet, "latest request missing");
    const bindings = json({
      schema_version: "simulated-credit-command.v1",
      type: "simulated-credit.execute",
      tenant_id: CREDIT_TARGET.tenant_id,
      case_id: CREDIT_TARGET.case_id,
      authority_request_id: packet.authority_request_id,
      expected_case_version: packet.case_version,
      expected_review_revision: packet.review_revision,
      expected_authority_state_revision: packet.authority_state_revision,
      request_binding_hash: packet.request_binding_hash,
      expected_action_binding_hash: CREDIT_ACTION_HASH,
    });
    // These two fixed strings are private evaluation placeholders, not reserved
    // command keys or emitted IDs. A submission must provide its own retry key.
    const evaluated = evaluateCredit(
      context,
      json({
        ...bindings,
        idempotency_key: "read-only-evaluation",
        correlation_id: "read-only-evaluation",
      }),
      now.toISOString(),
      version,
    );
    current = json({
      bindings,
      eligible: evaluated.authorized,
      reason_codes: evaluated.reason_codes,
      evaluated_at: evaluated.evaluated_at,
      informational_only: true,
    });
  }
  const result = json({
    schema_version: `simulated-credit-read-response.v${String(version)}`,
    profile: CREDIT_PROFILE,
    profile_hash: CREDIT_PROFILE_HASH,
    action_binding_hash: CREDIT_ACTION_HASH,
    current,
    attempts: context.credit.entries.filter((e) => !isVerification(e)),
    ...(version === 2
      ? { verifications: context.credit.entries.filter(isVerification) }
      : {}),
    source: context.credit.sources[0] ?? null,
    simulation: true,
    verification: version === 2 ? "available" : "not_implemented",
    closure_permission: false,
  });
  creditContract(version, "read", result);
  return result;
}

function creditVersions(version: 1 | 2): ObjectValue {
  return version === 1
    ? CREDIT_VERSIONS
    : json({
        ...CREDIT_VERSIONS,
        engine: "simulated-credit-engine.v2",
        gateway: "simulated-credit-gateway.v2",
      });
}
function creditContract(
  version: 1 | 2,
  kind: "envelope" | "journal" | "read",
  value: unknown,
): void {
  if (version === 1) assertValidSimulatedCreditContract(kind, value);
  else assertValidSimulatedCreditV2Contract(kind, value);
}
// One canonical grant check shared by execution and independent verification.
export function creditServiceEligibility(
  data: ObjectValue,
  key: "executor" | "evaluator" | "verifier",
  at: string,
): {
  identity: ObjectValue | undefined;
  grant: ObjectValue | undefined;
  reasons: string[];
} {
  const spec = serviceSpecs.find((s) => s[0] === key);
  creditAssert(spec, "service profile missing");
  const [, id, authority] = spec;
  const people = objects(data.identities).filter((p) => p.identity_id === id);
  const person = people[0];
  const candidates = objects(data.authority_records).filter(
    (g) => g.authority_class === authority && g.authority_rank === 1,
  );
  const grant = candidates[0],
    expected = grants().find((g) => g.authority_class === authority);
  const reasons: string[] = [];
  if (people.length !== 1 || !person || !creditSame(person, identity(id)))
    reasons.push(`${key}_identity_ineligible`);
  if (!(
    candidates.length === 1 &&
    grant &&
    grant.status === "active" &&
    grant.authority_record_id === expected?.authority_record_id &&
    grant.tenant_id === "tenant_orchid" &&
    creditSame(grant.identity, identity(id)) &&
    creditSame(grant.scope, expected?.scope) &&
    grant.source_type === "authoritative_registry" &&
    grant.source_ref === SOURCE &&
    string(grant.effective_from) <= at &&
    (grant.effective_until === undefined || at < string(grant.effective_until))
  ))
    reasons.push(`${key}_authority_ineligible`);
  return { identity: person, grant, reasons };
}
