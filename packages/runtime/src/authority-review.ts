import {
  assertValidAuthorityReviewContract,
  assertValidAuthorityPolicy,
  assertValidAuthorityRecord,
  assertValidDelegationGrant,
  assertValidIdentityReference,
  canonicalJson,
  immutableJson,
  sha256Json,
  requestV1ToV0,
  decisionV1ToV0,
} from "../../contracts/src/index.js";
import {
  resolveAuthority,
  resolveReviewerEligibility,
  type ResolveAuthorityInput,
} from "../../domain/src/authority-resolution.js";
import {
  getCase,
  replayCaseJournal,
  type CaseAggregate,
  type CaseEngineState,
} from "./case-engine.js";
import {
  AuthorityReviewError,
  REVIEW_VERSIONS,
  integer,
  json,
  list,
  object,
  objects,
  string,
  type AuthorityState,
  type AuthorityCatalogHead,
  type ObjectValue,
  type ReviewActor,
  type ReviewDependencies,
  type ReviewSnapshot,
  type SnapshotKind,
} from "./authority-review-types.js";
import {
  SYNTHETIC_REVIEW_TTL_MS,
  syntheticReviewMaterial,
} from "./synthetic-authority.js";

export {
  AuthorityReviewError,
  REVIEW_VERSIONS,
} from "./authority-review-types.js";
export type {
  AuthorityState,
  AuthorityCatalogHead,
  ReviewActor,
  ReviewDependencies,
  ReviewSnapshot,
} from "./authority-review-types.js";

export interface AuthorityCommandResult {
  readonly status: "applied" | "duplicate" | "conflict";
  readonly code?: string;
  readonly state: AuthorityState;
  readonly entries: readonly ObjectValue[];
  readonly receipt: ObjectValue;
}

function requireIntegrity(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) throw new AuthorityReviewError("REVIEW_INTEGRITY", message);
}
function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
export function reviewSnapshot(
  kind: SnapshotKind,
  content: ObjectValue,
): ReviewSnapshot {
  assertValidAuthorityReviewContract(kind, content);
  return immutableJson({
    tenant_id: string(content.tenant_id),
    hash: sha256Json(content),
    kind,
    content,
  });
}
function snapshot(
  state: AuthorityState,
  tenant: string,
  hash: unknown,
  kind: SnapshotKind,
): ObjectValue {
  const found = state.snapshots.find(
    (item) =>
      item.tenant_id === tenant && item.hash === hash && item.kind === kind,
  );
  requireIntegrity(found !== undefined, `missing ${kind} snapshot`);
  return found.content;
}
function addSnapshots(
  state: AuthorityState,
  additions: readonly ReviewSnapshot[],
): readonly ReviewSnapshot[] {
  const byHash = new Map(state.snapshots.map((item) => [item.hash, item]));
  for (const item of additions) {
    const prior = byHash.get(item.hash);
    requireIntegrity(
      prior === undefined || same(prior, item),
      "snapshot hash collision",
    );
    byHash.set(item.hash, item);
  }
  return [...byHash.values()];
}
function history(
  state: AuthorityState,
  tenant: string,
  requestId: string,
): ObjectValue[] {
  return state.entries.filter(
    (entry) =>
      entry.tenant_id === tenant && entry.authority_request_id === requestId,
  );
}
function requestOf(entries: readonly ObjectValue[]): ObjectValue {
  return object(entries[0]?.request);
}
function decisionsOf(entries: readonly ObjectValue[]): ObjectValue[] {
  return entries
    .filter((entry) => entry.decision !== undefined)
    .map((entry) => object(entry.decision));
}
function lifecycle(decisions: readonly ObjectValue[]): string {
  const terminal = decisions.find(
    (decision) => decision.decision !== "approve",
  );
  return terminal?.decision === "modify"
    ? "superseded"
    : terminal?.decision === "reject"
      ? "rejected"
      : terminal?.decision === "escalate"
        ? "escalated"
        : "open";
}
function actor(data: ObjectValue, key: string): ObjectValue {
  const id = object(data.actors)[key];
  const found = objects(data.identities).find(
    (identity) => identity.identity_id === id,
  );
  requireIntegrity(
    found !== undefined,
    "catalog actor has no canonical identity",
  );
  return found;
}
export function normalizeAuthorityCatalogData(
  value: unknown,
  tenantId: string,
): ObjectValue {
  const data = json(value);
  const assertions = {
    identities: assertValidIdentityReference,
    policies: assertValidAuthorityPolicy,
    authority_records: assertValidAuthorityRecord,
    delegations: assertValidDelegationGrant,
  };
  const normalized: Record<string, unknown> = { actors: data.actors };
  for (const [key, assertion] of Object.entries(assertions)) {
    const unique = new Map<string, ObjectValue>();
    for (const item of objects(data[key])) {
      assertion(item);
      requireIntegrity(item.tenant_id === tenantId, "catalog tenant mismatch");
      unique.set(canonicalJson(item), item);
    }
    normalized[key] = [...unique.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, item]) => item);
  }
  const result = json(normalized);
  for (const key of [
    "operator",
    "business",
    "finance",
    "executive",
    "finance_delegate",
    "evaluator",
  ])
    actor(result, key);
  return result;
}
function currentPolicy(
  data: ObjectValue,
  now: string,
): ObjectValue | undefined {
  const policies = objects(data.policies).filter(
    (policy) =>
      policy.authority_class === "financial_remedy" &&
      policy.action_class === "customer_credit",
  );
  if (policies.length !== 1) return undefined;
  const policy = policies[0];
  return policy?.status === "approved" &&
    integer(policy.authority_rank) === 1 &&
    string(policy.effective_from) <= now &&
    (policy.effective_until === undefined ||
      now < string(policy.effective_until))
    ? policy
    : undefined;
}
function caseAt(
  cases: CaseEngineState,
  tenant: string,
  id: string,
  version: number,
): CaseAggregate {
  const aggregate = getCase(cases, tenant, id);
  requireIntegrity(
    aggregate !== undefined && aggregate.journal.length >= version,
    "missing bound Case history",
  );
  return replayCaseJournal(aggregate.journal.slice(0, version));
}
function clockFloor(
  cases: CaseEngineState,
  head: AuthorityCatalogHead,
): string {
  return cases.cases
    .flatMap((item) => item.journal.map((entry) => entry.recorded_at))
    .reduce((max, time) => (time > max ? time : max), head.last_recorded_at);
}
function resolutionInput(
  aggregate: CaseAggregate,
  request: ObjectValue,
  material: ObjectValue,
  data: ObjectValue,
  decisions: readonly ObjectValue[],
  now: string,
): ResolveAuthorityInput {
  return {
    case: aggregate.document,
    authorityRequest: requestV1ToV0(request),
    proposedConsequence: material.consequence,
    identities: objects(data.identities),
    responsibilities: [],
    authorityRecords: objects(data.authority_records),
    delegations: objects(data.delegations),
    policies: objects(data.policies),
    priorAuthorityDecisions: decisions.map(decisionV1ToV0),
    evaluatedByIdentity: actor(data, "evaluator"),
    asOf: now,
    asOfSourceTimezone: "UTC",
  };
}
function evaluate(
  aggregate: CaseAggregate,
  request: ObjectValue,
  material: ObjectValue,
  data: ObjectValue,
  decisions: readonly ObjectValue[],
  head: AuthorityCatalogHead,
  now: string,
  floor: string,
): { result: ObjectValue; input: ResolveAuthorityInput } {
  const input = resolutionInput(
    aggregate,
    request,
    material,
    data,
    decisions,
    now,
  );
  const state = lifecycle(decisions);
  let reason: string | undefined;
  if (state !== "open") reason = `request_${state}`;
  else if (object(aggregate.document.case).version !== request.case_version)
    reason = "stale_case";
  else if (
    head.revision !== request.authority_state_revision ||
    head.snapshot_hash !== request.authority_snapshot_hash
  )
    reason = "authority_state_changed";
  else if (now < floor || now < string(request.requested_at))
    reason = "clock_regression";
  else if (now >= string(request.expires_at)) reason = "request_expired";
  const resolution = reason === undefined ? resolveAuthority(input) : null;
  const eligible =
    reason === undefined &&
    resolution !== null &&
    ["authorized", "approval_required"].includes(string(resolution.outcome));
  return {
    input,
    result: json({
      lifecycle: state,
      eligible,
      authorized: eligible && resolution.outcome === "authorized",
      reason_codes:
        reason === undefined ? (resolution?.reason_codes ?? []) : [reason],
      effective_approval_ids: eligible
        ? (resolution.authority_decision_ids ?? [])
        : [],
      resolution,
    }),
  };
}
function decisionFor(
  request: ObjectValue,
  data: ObjectValue,
  actorKey: ReviewActor,
  command: ObjectValue,
  id: string,
  now: string,
  replacement?: string,
): ObjectValue {
  const identity = actor(data, actorKey);
  const grants = objects(data.delegations)
    .filter(
      (grant) =>
        object(grant.delegate_identity).identity_id === identity.identity_id,
    )
    .map((grant) => string(grant.delegation_id))
    .sort();
  return json({
    schema_version: "authority-decision.v1",
    authority_decision_id: id,
    authority_request_id: request.authority_request_id,
    tenant_id: request.tenant_id,
    case_id: request.case_id,
    case_version: request.case_version,
    approver_identity: identity,
    proposed_consequence_hash: request.proposed_consequence_hash,
    policy_reference: request.policy_reference,
    request_binding_hash: sha256Json(request),
    expected_review_revision: command.expected_review_revision,
    decision: command.decision,
    ...(command.reason === undefined ? {} : { reason: command.reason }),
    ...(replacement === undefined
      ? {}
      : { replacement_authority_request_id: replacement }),
    ...(grants.length === 0 ? {} : { relevant_delegation_ids: grants }),
    decided_at: now,
    decided_at_source_timezone: "UTC",
    correlation_id: command.correlation_id,
    lineage: {
      recorded_by_identity: identity,
      recorded_at: now,
      recorded_at_source_timezone: "UTC",
      source_refs: [
        `authority-request://${string(request.authority_request_id)}/${string(command.request_binding_hash)}/revision/${integer(command.expected_review_revision).toString()}`,
      ],
    },
  });
}
function reviewerProof(
  aggregate: CaseAggregate,
  request: ObjectValue,
  material: ObjectValue,
  data: ObjectValue,
  command: ObjectValue,
  actorKey: ReviewActor,
  now: string,
  priorDecisions: readonly ObjectValue[],
): ObjectValue | undefined {
  const identity = actor(data, actorKey);
  if (identity.status !== "active" || identity.identity_kind !== "human")
    return undefined;
  const probe = decisionFor(
    request,
    data,
    actorKey,
    { ...command, decision: "approve" },
    "decision_review_probe",
    now,
  );
  const input = resolutionInput(
    aggregate,
    request,
    material,
    data,
    [
      ...priorDecisions.filter(
        (decision) =>
          object(decision.approver_identity).identity_id !==
          identity.identity_id,
      ),
      probe,
    ],
    now,
  );
  const result = resolveAuthority(input);
  const eligibility = resolveReviewerEligibility(
    input,
    "decision_review_probe",
  );
  // Conflicts elsewhere still permit an explicitly eligible reviewer to veto,
  // modify or escalate. An approve never bypasses the resolver's conflict result.
  if (
    !eligibility.eligible ||
    (command.decision === "approve" &&
      !["approval_required", "authorized"].includes(string(result.outcome)))
  )
    return undefined;
  return json({ input, result, eligibility });
}
function receipt(entry: ObjectValue, state: AuthorityState): ObjectValue {
  const evaluation = snapshot(
    state,
    string(entry.tenant_id),
    entry.evaluation_snapshot_hash,
    "evaluation",
  );
  return json({
    authority_request_id: entry.authority_request_id,
    journal_entry_id: entry.id,
    review_revision: entry.review_revision,
    case_version: object(entry.request ?? entry.decision).case_version,
    request_binding_hash: entry.request_binding_hash,
    recorded_at: entry.recorded_at,
    result: evaluation.result,
    historical: true,
    action_permission: false,
    ...(entry.decision === undefined ||
    object(entry.decision).replacement_authority_request_id === undefined
      ? {}
      : {
          replacement_authority_request_id: object(entry.decision)
            .replacement_authority_request_id,
        }),
  });
}

function applyCommand(
  state: AuthorityState,
  cases: CaseEngineState,
  head: AuthorityCatalogHead,
  command: ObjectValue,
  actorKey: ReviewActor,
  dependencies: ReviewDependencies,
): AuthorityCommandResult {
  const fingerprint = sha256Json({ command, actor_key: actorKey });
  const conflict = (code: string): AuthorityCommandResult => ({
    status: "conflict",
    code,
    state,
    entries: [],
    receipt: json({ code, action_permission: false }),
  });
  if (command.tenant_id !== head.tenant_id)
    return conflict("tenant_not_enrolled");
  const duplicate = state.entries.find(
    (entry) =>
      entry.tenant_id === command.tenant_id &&
      entry.idempotency_key === command.idempotency_key &&
      entry.replaces_entry_id === undefined,
  );
  if (duplicate !== undefined)
    return duplicate.command_fingerprint === fingerprint
      ? {
          status: "duplicate",
          state,
          entries: [],
          receipt: receipt(duplicate, state),
        }
      : conflict("idempotency_conflict");
  const tenant = head.tenant_id;
  const aggregate = getCase(cases, tenant, string(command.case_id));
  if (aggregate === undefined) return conflict("case_not_found");
  if (command.expected_case_version !== object(aggregate.document.case).version)
    return conflict("stale_case");
  if (command.expected_authority_state_revision !== head.revision)
    return conflict("authority_state_changed");
  const catalog = snapshot(state, tenant, head.snapshot_hash, "catalog"),
    data = object(catalog.data);
  const now = dependencies.now().toISOString();
  const floor = clockFloor(cases, head);
  if (now < floor) return conflict("clock_regression");
  const policy = currentPolicy(data, now);
  if (policy === undefined) return conflict("policy_unavailable");
  const identity = actor(data, actorKey);
  if (identity.identity_kind !== "human" || identity.status !== "active")
    return conflict("reviewer_ineligible");
  const entries: ObjectValue[] = [],
    additions: ReviewSnapshot[] = [];
  const generated = new Set(
    state.entries.flatMap((entry) => [
      string(entry.id),
      ...(entry.request === undefined
        ? []
        : [string(object(entry.request).authority_request_id)]),
      ...(entry.decision === undefined
        ? []
        : [string(object(entry.decision).authority_decision_id)]),
    ]),
  );
  for (const item of cases.cases)
    for (const entry of item.journal) generated.add(entry.id);
  const nextId = (kind: "request" | "review" | "decision"): string => {
    const id = dependencies.nextId(kind);
    requireIntegrity(
      new RegExp(`^${kind}_[A-Za-z0-9_-]{1,119}$`).test(id) &&
        !generated.has(id),
      "invalid or reused generated review identity",
    );
    generated.add(id);
    return id;
  };
  const addEntry = (
    request: ObjectValue,
    decision: ObjectValue | undefined,
    prior: readonly ObjectValue[],
    material: ObjectValue,
    id: string,
    links: ObjectValue,
    proof: ObjectValue | null,
  ): void => {
    const previous = prior.at(-1);
    const decisions = [
      ...decisionsOf(prior),
      ...(decision === undefined ? [] : [decision]),
    ];
    const evaluated = evaluate(
      aggregate,
      request,
      material,
      data,
      decisions,
      head,
      now,
      floor,
    );
    const evaluation = reviewSnapshot(
      "evaluation",
      json({
        schema_version: "authority-evaluation.v1",
        tenant_id: tenant,
        request_binding_hash: sha256Json(request),
        prior_review_revision: previous?.review_revision ?? 0,
        authority_snapshot_hash: head.snapshot_hash,
        case_journal_head_hash: aggregate.journal.at(-1)?.event_hash,
        recorded_at: now,
        inputs: { resolution: evaluated.input, reviewer: proof },
        result: evaluated.result,
        implementation_versions: REVIEW_VERSIONS,
      }),
    );
    additions.push(evaluation);
    const unhashed = json({
      schema_version: "authority-request-journal-entry.v1",
      id,
      tenant_id: tenant,
      case_id: command.case_id,
      authority_request_id: request.authority_request_id,
      review_revision:
        previous === undefined ? 0 : integer(previous.review_revision) + 1,
      position: state.entries.length + entries.length + 1,
      event_type:
        decision === undefined
          ? "authority.request.created"
          : "authority.request.decided",
      previous_event_hash: previous?.event_hash ?? null,
      request_binding_hash: sha256Json(request),
      command,
      command_fingerprint: fingerprint,
      idempotency_key: command.idempotency_key,
      actor_key: actorKey,
      actor_identity: identity,
      correlation_id: command.correlation_id,
      causation_event_id:
        links.replaces_entry_id ?? previous?.id ?? aggregate.journal.at(-1)?.id,
      recorded_at: now,
      recorded_at_source_timezone: "UTC",
      evaluation_snapshot_hash: evaluation.hash,
      implementation_versions: REVIEW_VERSIONS,
      ...(decision === undefined ? { request } : { decision }),
      ...links,
    });
    const entry = json({ ...unhashed, event_hash: sha256Json(unhashed) });
    assertValidAuthorityReviewContract("journal", entry);
    entries.push(entry);
  };
  const create = (
    proposal: string,
    requestId: string,
    entryId: string,
    predecessor: string | undefined,
    links: ObjectValue,
  ): ObjectValue => {
    const material = syntheticReviewMaterial(aggregate, proposal);
    additions.push(reviewSnapshot("material", material));
    const request = json({
      schema_version: "authority-request.v1",
      authority_request_id: requestId,
      tenant_id: tenant,
      case_id: command.case_id,
      case_version: command.expected_case_version,
      prepared_by_identity: actor(data, "operator"),
      requested_authority_class: "financial_remedy",
      requested_action_class: "customer_credit",
      proposed_consequence_hash: sha256Json(material.consequence),
      policy_reference: {
        policy_id: policy.policy_id,
        policy_version: policy.policy_version,
      },
      policy_content_hash: sha256Json(policy),
      case_journal_head_hash: aggregate.journal.at(-1)?.event_hash,
      review_material_hash: sha256Json(material),
      authority_state_revision: head.revision,
      authority_snapshot_hash: head.snapshot_hash,
      evidence_refs: objects(material.evidence).map((item) =>
        string(object(item.work_event).payload_ref),
      ),
      requested_at: now,
      requested_at_source_timezone: "UTC",
      expires_at: new Date(
        Date.parse(now) + SYNTHETIC_REVIEW_TTL_MS,
      ).toISOString(),
      expires_at_source_timezone: "UTC",
      correlation_id: command.correlation_id,
      causation_event_id:
        links.replaces_entry_id ?? aggregate.journal.at(-1)?.id,
      ...(predecessor === undefined
        ? {}
        : { predecessor_authority_request_id: predecessor }),
    });
    requestV1ToV0(request);
    addEntry(request, undefined, [], material, entryId, links, null);
    return request;
  };
  if (command.type === "authority.request.create") {
    if (actorKey !== "operator") return conflict("reviewer_ineligible");
    const predecessor = command.predecessor_authority_request_id;
    if (predecessor !== undefined) {
      const prior = history(state, tenant, string(predecessor));
      if (prior.length === 0 || prior[0]?.case_id !== command.case_id)
        return conflict("invalid_predecessor");
    }
    create(
      string(command.proposal_key),
      nextId("request"),
      nextId("review"),
      predecessor === undefined ? undefined : string(predecessor),
      {},
    );
  } else {
    const prior = history(state, tenant, string(command.authority_request_id));
    if (prior.length === 0 || prior[0]?.case_id !== command.case_id)
      return conflict("request_not_found");
    const request = requestOf(prior),
      last = prior.at(-1);
    if (command.expected_review_revision !== last?.review_revision)
      return conflict("review_revision_conflict");
    if (command.request_binding_hash !== sha256Json(request))
      return conflict("request_binding_mismatch");
    const material = snapshot(
      state,
      tenant,
      request.review_material_hash,
      "material",
    );
    const current = evaluate(
      aggregate,
      request,
      material,
      data,
      decisionsOf(prior),
      head,
      now,
      floor,
    ).result;
    if (
      current.lifecycle !== "open" ||
      request.case_version !== command.expected_case_version ||
      request.authority_state_revision !== head.revision ||
      now >= string(request.expires_at)
    ) {
      return conflict(
        string(list(current.reason_codes)[0] ?? "request_ineligible"),
      );
    }
    if (sha256Json(policy) !== request.policy_content_hash)
      return conflict("policy_changed");
    const proof = reviewerProof(
      aggregate,
      request,
      material,
      data,
      command,
      actorKey,
      now,
      decisionsOf(prior),
    );
    if (proof === undefined) return conflict("reviewer_ineligible");
    if (
      command.decision === "approve" &&
      decisionsOf(prior).some(
        (decision) =>
          object(decision.approver_identity).identity_id ===
          identity.identity_id,
      )
    )
      return conflict("principal_already_approved");
    if (
      command.decision === "modify" &&
      command.replacement_proposal_key === material.proposal_key
    )
      return conflict("replacement_unchanged");
    const replacementId =
      command.decision === "modify" ? nextId("request") : undefined;
    const entryId = nextId("review"),
      replacementEntryId =
        replacementId === undefined ? undefined : nextId("review");
    const decision = decisionFor(
      request,
      data,
      actorKey,
      command,
      nextId("decision"),
      now,
      replacementId,
    );
    decisionV1ToV0(decision);
    addEntry(
      request,
      decision,
      prior,
      material,
      entryId,
      replacementEntryId === undefined
        ? {}
        : { replacement_creation_entry_id: replacementEntryId },
      proof,
    );
    if (replacementId !== undefined && replacementEntryId !== undefined)
      create(
        string(command.replacement_proposal_key),
        replacementId,
        replacementEntryId,
        string(request.authority_request_id),
        { replaces_entry_id: entryId },
      );
  }
  const next = immutableJson({
    entries: [...state.entries, ...entries],
    snapshots: addSnapshots(state, additions),
  });
  const first = entries[0];
  requireIntegrity(
    first !== undefined,
    "accepted command produced no journal entry",
  );
  return {
    status: "applied",
    state: next,
    entries,
    receipt: receipt(first, next),
  };
}

export function assertAuthorityStateIntegrity(
  state: AuthorityState,
  cases: CaseEngineState,
  heads: readonly AuthorityCatalogHead[],
): void {
  const hashes = new Set<string>();
  for (const item of state.snapshots) {
    requireIntegrity(
      !hashes.has(item.hash) &&
        same(reviewSnapshot(item.kind, item.content), item),
      "snapshot identity or content drift",
    );
    hashes.add(item.hash);
    if (item.kind !== "catalog")
      requireIntegrity(
        state.entries.some((entry) =>
          item.kind === "evaluation"
            ? entry.evaluation_snapshot_hash === item.hash
            : entry.request !== undefined &&
              object(entry.request).review_material_hash === item.hash,
        ),
        "orphaned review snapshot",
      );
  }
  for (const head of heads) {
    const catalogs = state.snapshots
      .filter(
        (item) => item.kind === "catalog" && item.tenant_id === head.tenant_id,
      )
      .sort(
        (a, b) => integer(a.content.revision) - integer(b.content.revision),
      );
    requireIntegrity(
      catalogs.length === head.revision,
      "catalog revision history is incomplete",
    );
    let previous: ReviewSnapshot | undefined;
    for (const item of catalogs) {
      requireIntegrity(
        item.content.revision ===
          (previous === undefined
            ? 1
            : integer(previous.content.revision) + 1) &&
          item.content.previous_catalog_hash === (previous?.hash ?? null),
        "catalog predecessor drift",
      );
      requireIntegrity(
        integer(item.content.after_review_position) <= state.entries.length,
        "catalog is ahead of review history",
      );
      if (previous !== undefined)
        requireIntegrity(
          integer(item.content.after_review_position) >=
            integer(previous.content.after_review_position) &&
            string(item.content.recorded_at) >=
              string(previous.content.recorded_at),
          "catalog order regressed",
        );
      requireIntegrity(
        same(
          normalizeAuthorityCatalogData(item.content.data, head.tenant_id),
          item.content.data,
        ),
        "noncanonical catalog records",
      );
      previous = item;
    }
    requireIntegrity(
      previous?.hash === head.snapshot_hash,
      "catalog head differs from snapshots",
    );
    const expectedClock = state.entries
      .filter((entry) => entry.tenant_id === head.tenant_id)
      .map((entry) => string(entry.recorded_at))
      .reduce(
        (max, time) => (time > max ? time : max),
        string(previous.content.recorded_at),
      );
    requireIntegrity(
      head.last_recorded_at === expectedClock,
      "durable authority clock guard drift",
    );
  }
  const headTenants = new Set(heads.map((head) => head.tenant_id));
  requireIntegrity(
    headTenants.size === heads.length &&
      state.snapshots.every((item) => headTenants.has(item.tenant_id)),
    "unknown or duplicate catalog tenant",
  );
  let prefix: AuthorityState = { entries: [], snapshots: state.snapshots };
  for (let index = 0; index < state.entries.length;) {
    const entry = state.entries[index];
    requireIntegrity(entry !== undefined, "missing journal entry");
    assertValidAuthorityReviewContract("journal", entry);
    requireIntegrity(
      entry.position === index + 1 && entry.replaces_entry_id === undefined,
      "journal gap or orphan replacement",
    );
    const tenant = string(entry.tenant_id),
      now = string(entry.recorded_at);
    const catalogs = state.snapshots
      .filter(
        (item) =>
          item.kind === "catalog" &&
          item.tenant_id === tenant &&
          integer(item.content.after_review_position) <= index,
      )
      .sort(
        (a, b) => integer(a.content.revision) - integer(b.content.revision),
      );
    const catalog = catalogs.at(-1);
    requireIntegrity(
      catalog !== undefined && string(catalog.content.recorded_at) <= now,
      "missing trusted catalog at decision time",
    );
    const bound = caseAt(
      cases,
      tenant,
      string(entry.case_id),
      integer(object(entry.command).expected_case_version),
    );
    const pastCases: CaseEngineState = {
      cases: [bound],
      idempotency_records: [],
      source_event_records: [],
    };
    const pastHead: AuthorityCatalogHead = {
      tenant_id: tenant,
      revision: integer(catalog.content.revision),
      snapshot_hash: catalog.hash,
      last_recorded_at: prefix.entries
        .filter((item) => item.tenant_id === tenant)
        .map((item) => string(item.recorded_at))
        .reduce(
          (max, time) => (time > max ? time : max),
          string(catalog.content.recorded_at),
        ),
    };
    const ids =
      entry.request !== undefined
        ? [string(object(entry.request).authority_request_id), string(entry.id)]
        : [
            ...(entry.replacement_creation_entry_id === undefined
              ? []
              : [
                  string(
                    object(entry.decision).replacement_authority_request_id,
                  ),
                ]),
            string(entry.id),
            ...(entry.replacement_creation_entry_id === undefined
              ? []
              : [string(entry.replacement_creation_entry_id)]),
            string(object(entry.decision).authority_decision_id),
          ];
    const result = applyCommand(
      prefix,
      pastCases,
      pastHead,
      object(entry.command),
      string(entry.actor_key) as ReviewActor,
      {
        now: () => new Date(now),
        nextId: () => {
          const id = ids.shift();
          requireIntegrity(id !== undefined, "replay consumed extra IDs");
          return id;
        },
      },
    );
    requireIntegrity(
      result.status === "applied" && ids.length === 0,
      "journal command could not have been accepted",
    );
    for (let offset = 0; offset < result.entries.length; offset++)
      requireIntegrity(
        same(result.entries[offset], state.entries[index + offset]),
        "journal differs from deterministic replay",
      );
    for (const generated of result.state.snapshots)
      requireIntegrity(
        state.snapshots.some((item) => same(item, generated)),
        "evaluation or material differs from replay",
      );
    prefix = result.state;
    index += result.entries.length;
  }
}

export function executeAuthorityCommand(
  state: AuthorityState,
  cases: CaseEngineState,
  head: AuthorityCatalogHead,
  input: unknown,
  actorKey: ReviewActor,
  dependencies: ReviewDependencies,
): AuthorityCommandResult {
  assertValidAuthorityReviewContract("command", input);
  const command = json(input);
  if (
    ![
      "operator",
      "business",
      "finance",
      "executive",
      "finance_delegate",
    ].includes(actorKey)
  )
    throw new AuthorityReviewError(
      "REVIEW_INPUT_INVALID",
      "unknown synthetic actor context",
    );
  // The store verifies the complete cross-tenant state before calling this pure
  // command function; direct callers can use the exported replay verifier too.
  return applyCommand(state, cases, head, command, actorKey, dependencies);
}

export function readAuthorityRequest(
  state: AuthorityState,
  cases: CaseEngineState,
  head: AuthorityCatalogHead,
  requestId: string,
  now: Date,
): ObjectValue | undefined {
  const entries = history(state, head.tenant_id, requestId);
  if (entries.length === 0) return undefined;
  const request = requestOf(entries),
    material = snapshot(
      state,
      head.tenant_id,
      request.review_material_hash,
      "material",
    );
  const aggregate = getCase(cases, head.tenant_id, string(request.case_id));
  requireIntegrity(aggregate !== undefined, "request has no Case");
  const catalog = snapshot(
    state,
    head.tenant_id,
    head.snapshot_hash,
    "catalog",
  );
  const evaluated = evaluate(
    aggregate,
    request,
    material,
    object(catalog.data),
    decisionsOf(entries),
    head,
    now.toISOString(),
    clockFloor(cases, head),
  );
  const packet = json({
    schema_version: "authority-request-read-response.v1",
    tenant_id: head.tenant_id,
    case_id: request.case_id,
    authority_request_id: requestId,
    request,
    request_binding_hash: sha256Json(request),
    case_version: object(aggregate.document.case).version,
    review_revision: entries.at(-1)?.review_revision,
    authority_state_revision: head.revision,
    evaluated_at: now.toISOString(),
    evaluated_at_source_timezone: "UTC",
    material,
    history: entries,
    historical_evaluations: entries.map((entry) =>
      snapshot(
        state,
        head.tenant_id,
        entry.evaluation_snapshot_hash,
        "evaluation",
      ),
    ),
    current: evaluated.result,
    implementation_versions: REVIEW_VERSIONS,
    simulation: true,
    action_permission: false,
  });
  assertValidAuthorityReviewContract("read", packet);
  return packet;
}
