import {
  CREDIT_ROOT,
  validateCredit,
  validateCreditReceipt,
  canExecuteCredit,
  creditCommand,
  verificationCommand,
  latestInvocation,
  creditReason,
} from "./credit-client.js";

// Public synthetic templates; the runtime selects retained evidence by reference and hash.
export const DEMO_CASE = {
  type: "case.create",
  tenant_id: "tenant_orchid",
  expected_case_version: 0,
  actor_identity_id: "identity_d6_operator",
  idempotency_key: "case:d6_workbench",
  correlation_id: "trace:d6_workbench",
  case_seed: {
    tenant: {
      id: "tenant_orchid",
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
      id: "case_d6_workbench",
      tenant_id: "tenant_orchid",
      workflow_version_id: "workflow_ecc_v0_1_0",
      customer_ref: "synthetic://accounts/orchid",
      issue_fingerprint: "d6:d6_workbench",
      severity: "high",
      owner_identity_id: "identity_d6_operator",
      scope_ids: ["scope_customer_ops"],
      related_case_ids: [],
    },
  },
  trigger_event: {
    id: "work_event_d6_workbench",
    tenant_id: "tenant_orchid",
    source: "synthetic_d6",
    source_event_id: "source_d6_workbench",
    event_type: "message.created",
    actor_identity_id: "identity_d6_operator",
    scope_ids: ["scope_customer_ops"],
    occurred_at: "2026-09-01T15:00:00.000Z",
    source_timezone: "UTC",
    content_hash:
      "sha256:98007a203730934f31f52067f6eedb61b1f075869ebb8002ce27e5a17ab96cc8",
    payload_ref: "synthetic://d6/intake",
    classification: "internal",
    idempotency_key: "event:d6_workbench",
  },
};
export const DEMO_UPDATE = {
  id: "work_event_d6_workbench_update",
  tenant_id: "tenant_orchid",
  source: "synthetic_d6",
  source_event_id: "source_d6_workbench_update",
  event_type: "message.created",
  actor_identity_id: "identity_d6_operator",
  scope_ids: ["scope_customer_ops"],
  occurred_at: "2026-09-01T15:30:00.000Z",
  source_timezone: "UTC",
  content_hash:
    "sha256:87fdb9df4f9cd8933e1a6cc45eaa3b4b79026528e6a2e28f9b4f08bd3ea74e35",
  payload_ref: "synthetic://d6/update",
  classification: "internal",
  idempotency_key: "event:d6_workbench_update",
};

export const TENANT = "tenant_orchid";
export const CASE_ID = "case_d6_workbench";
export const CASE_ROOT = `/v0/tenants/${TENANT}`;
export const REVIEW_ROOT = `/v1/tenants/${TENANT}/authority-requests`;
export const STORAGE_KEY = "fieldruntime.d6.review.v1";
export const PENDING_PREFIX = "fieldruntime.d7.pending.v1:";
export const PREPARATION_STATES = ["qualifying", "enriching", "needs_review"];
export function preparationStep(record) {
  const journal = record?.journal;
  if (
    !Array.isArray(journal) ||
    journal.length < 1 ||
    journal.length > 3 ||
    journal[0].event_type !== "case.created" ||
    record.document.case.version !== journal.length
  )
    return null;
  if (
    journal
      .slice(1)
      .some(
        (entry, index) =>
          entry.event_type !== "case.state_transitioned" ||
          entry.payload.to_state !== PREPARATION_STATES[index],
      )
  )
    return null;
  return PREPARATION_STATES[journal.length - 1];
}
export const SEATS = Object.freeze({
  finance: "Finance",
  executive: "Executive",
  business: "Business",
  finance_delegate: "Finance delegate",
});
export const PROPOSALS = Object.freeze({
  credit_4000: "$4,000",
  credit_7000: "$7,000",
  credit_12000: "$12,000",
  credit_15000: "$15,000",
});
const ID = /^request_[A-Za-z0-9_-]{1,119}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const clone = (value) => JSON.parse(JSON.stringify(value));
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const strings = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const instant = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
function requireValue(
  condition,
  message = "The API returned an invalid review response.",
) {
  if (!condition) throw new Error(message);
}

// Browser checks protect presentation; only the runtime can authorize a decision.
export function validatePacket(
  packet,
  expectedId = packet?.authority_request_id,
) {
  requireValue(
    packet?.schema_version === "authority-request-read-response.v1" &&
      packet.simulation === true &&
      packet.action_permission === false &&
      packet.tenant_id === TENANT &&
      packet.case_id === CASE_ID &&
      ID.test(packet.authority_request_id) &&
      packet.authority_request_id === expectedId &&
      HASH.test(packet.request_binding_hash) &&
      integer(packet.case_version, 1) &&
      integer(packet.review_revision) &&
      integer(packet.authority_state_revision, 1),
  );
  const request = packet.request,
    material = packet.material,
    current = packet.current;
  requireValue(
    request?.authority_request_id === expectedId &&
      request.case_id === CASE_ID &&
      request.tenant_id === TENANT &&
      request.schema_version === "authority-request.v1" &&
      integer(request.case_version, 1) &&
      integer(request.authority_state_revision, 1) &&
      HASH.test(request.proposed_consequence_hash) &&
      HASH.test(request.review_material_hash) &&
      instant(request.expires_at) &&
      instant(request.requested_at) &&
      instant(packet.evaluated_at) &&
      typeof request.policy_reference?.policy_id === "string" &&
      typeof request.policy_reference.policy_version === "string" &&
      typeof request.correlation_id === "string" &&
      typeof current?.authorized === "boolean" &&
      typeof current.eligible === "boolean" &&
      ["open", "rejected", "superseded", "escalated"].includes(
        current.lifecycle,
      ) &&
      strings(current.reason_codes) &&
      strings(current.effective_approval_ids),
  );
  requireValue(
    material?.schema_version === "authority-review-material.v1" &&
      material.case_id === CASE_ID &&
      material.case_version === request.case_version &&
      integer(material.consequence?.amount_minor, 1) &&
      material.consequence.currency === "USD" &&
      typeof material.consequence.account_ref === "string" &&
      Array.isArray(material.evidence) &&
      material.evidence.length > 0 &&
      Array.isArray(material.conflicts) &&
      strings(material.unknowns) &&
      typeof material.freshness_basis === "string" &&
      typeof material.recommendation === "string" &&
      Object.hasOwn(PROPOSALS, material.proposal_key),
  );
  for (const evidence of material.evidence) {
    requireValue(
      evidence?.work_event &&
        evidence.content &&
        ["payload_ref", "source_event_id", "source"].every(
          (key) => typeof evidence.work_event[key] === "string",
        ) &&
        HASH.test(evidence.work_event.content_hash) &&
        ["source", "body", "conflict", "source_timezone"].every(
          (key) => typeof evidence.content[key] === "string",
        ) &&
        instant(evidence.content.observed_at),
    );
  }
  requireValue(
    material.conflicts.every(
      (item) =>
        typeof item?.description === "string" &&
        typeof item.source_ref === "string",
    ),
  );
  if (current.resolution?.authority_requirements !== undefined) {
    requireValue(Array.isArray(current.resolution.authority_requirements));
    for (const requirement of current.resolution.authority_requirements)
      requireValue(
        typeof requirement?.authority_class === "string" &&
          typeof requirement.status === "string" &&
          typeof requirement.policy_rule_ref === "string" &&
          integer(requirement.required_approval_count, 1) &&
          strings(requirement.satisfied_approval_ids) &&
          Array.isArray(requirement.eligible_approvers) &&
          requirement.eligible_approvers.every(
            (item) => typeof item?.identity?.identity_id === "string",
          ),
      );
  }
  requireValue(
    Array.isArray(packet.history) &&
      packet.history.length === packet.review_revision + 1 &&
      Array.isArray(packet.historical_evaluations) &&
      packet.historical_evaluations.length === packet.history.length,
  );
  for (const [index, entry] of packet.history.entries()) {
    const evaluation = packet.historical_evaluations[index];
    requireValue(
      entry.authority_request_id === expectedId &&
        entry.review_revision === index &&
        entry.request_binding_hash === packet.request_binding_hash &&
        instant(entry.recorded_at) &&
        HASH.test(entry.event_hash) &&
        typeof evaluation?.result?.authorized === "boolean" &&
        typeof evaluation.result.lifecycle === "string" &&
        typeof evaluation.implementation_versions?.resolver === "string" &&
        instant(evaluation.recorded_at) &&
        evaluation.inputs &&
        (index === 0 ||
          (typeof entry.decision?.approver_identity?.identity_id === "string" &&
            ["approve", "reject", "modify", "escalate"].includes(
              entry.decision?.decision,
            ))),
    );
  }
  validateCurrent(packet);
  return packet;
}

function validateCurrent(packet) {
  // Check that the server's projections agree; never recompute reviewer authority
  // in the browser or turn a historical evaluation into current eligibility.
  const { current, request, history } = packet;
  const resolution = current.resolution;
  const votes = history.flatMap((entry) =>
    entry.decision ? [entry.decision] : [],
  );
  const terminal = votes.find((vote) => vote.decision !== "approve");
  const lifecycle =
    { reject: "rejected", modify: "superseded", escalate: "escalated" }[
      terminal?.decision
    ] ?? "open";
  requireValue(current.lifecycle === lifecycle);
  const bound =
    lifecycle === "open" &&
    packet.case_version === request.case_version &&
    packet.authority_state_revision === request.authority_state_revision &&
    Date.parse(packet.evaluated_at) >= Date.parse(request.requested_at) &&
    Date.parse(packet.evaluated_at) < Date.parse(request.expires_at);
  const sameIds = (a, b) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const route =
    resolution !== null &&
    ["authorized", "approval_required"].includes(resolution?.outcome);
  requireValue(
    current.eligible === (bound && route) &&
      current.authorized ===
        (current.eligible && resolution?.outcome === "authorized"),
  );
  if (!bound) requireValue(resolution === null);
  if (resolution !== null) {
    requireValue(
      resolution?.authority_request_id === request.authority_request_id &&
        resolution.case_id === packet.case_id &&
        resolution.case_version === packet.case_version &&
        resolution.tenant_id === packet.tenant_id &&
        resolution.evaluated_at === packet.evaluated_at &&
        resolution.proposed_consequence_hash ===
          request.proposed_consequence_hash &&
        strings(resolution.reason_codes) &&
        sameIds(current.reason_codes, resolution.reason_codes),
    );
  }
  const effective = current.eligible
    ? (resolution.authority_decision_ids ?? [])
    : [];
  requireValue(
    strings(effective) &&
      new Set(effective).size === effective.length &&
      sameIds(current.effective_approval_ids, effective),
  );
  if (!current.eligible) return;
  const requirements = resolution.authority_requirements;
  requireValue(Array.isArray(requirements) && requirements.length > 0);
  for (const requirement of requirements) {
    const remaining =
      requirement.required_approval_count -
      requirement.satisfied_approval_ids.length;
    requireValue(
      remaining >= 0 &&
        requirement.remaining_approval_count === remaining &&
        requirement.status === (remaining === 0 ? "satisfied" : "outstanding"),
    );
  }
  requireValue(
    current.authorized ===
      requirements.every((item) => item.status === "satisfied"),
  );
  const selected = [
    ...new Set(requirements.flatMap((item) => item.satisfied_approval_ids)),
  ];
  requireValue(
    sameIds(selected, effective) &&
      effective.every((id) =>
        votes.some(
          (vote) =>
            vote.authority_decision_id === id &&
            vote.decision === "approve" &&
            vote.authority_request_id === request.authority_request_id &&
            vote.request_binding_hash === packet.request_binding_hash &&
            vote.case_version === request.case_version,
        ),
      ),
  );
  if (current.authorized)
    requireValue(
      sameIds(current.reason_codes, ["authority.all_requirements_satisfied"]),
    );
}

export function decisionCommand(
  packet,
  seat,
  decision,
  reason,
  replacement,
  key,
) {
  validatePacket(packet);
  requireValue(Object.hasOwn(SEATS, seat), "Choose a synthetic reviewer seat.");
  requireValue(
    ["approve", "reject", "modify", "escalate"].includes(decision),
    "Choose a decision.",
  );
  requireValue(
    decision === "approve" ||
      (typeof reason === "string" && reason.trim().length > 0),
    "A reason is required.",
  );
  requireValue(
    decision !== "modify" ||
      (Object.hasOwn(PROPOSALS, replacement) &&
        replacement !== packet.material.proposal_key),
    "Choose a different replacement proposal.",
  );
  return {
    type: "authority.request.decide",
    tenant_id: TENANT,
    case_id: CASE_ID,
    authority_request_id: packet.authority_request_id,
    expected_case_version: packet.case_version,
    expected_review_revision: packet.review_revision,
    expected_authority_state_revision: packet.authority_state_revision,
    request_binding_hash: packet.request_binding_hash,
    decision,
    ...(decision === "approve" ? {} : { reason: reason.trim() }),
    ...(decision === "modify" ? { replacement_proposal_key: replacement } : {}),
    idempotency_key: key,
    correlation_id: packet.request.correlation_id,
  };
}

export function requestBlocked(packet) {
  if (!packet) return true;
  return (
    packet.current.lifecycle !== "open" ||
    packet.case_version !== packet.request.case_version ||
    packet.authority_state_revision !==
      packet.request.authority_state_revision ||
    packet.current.reason_codes.some((code) =>
      [
        "request_expired",
        "clock_regression",
        "stale_case",
        "authority_state_changed",
      ].includes(code),
    )
  );
  // Whole-request current.eligible does not decide individual veto rights.
}

const explanations = {
  stale_case:
    "The Case version changed. Prior approvals no longer apply. Refresh, then create a fresh request.",
  review_revision_conflict:
    "Another reviewer changed the review history. Refresh and inspect it before explicitly resubmitting.",
  authority_state_changed:
    "The authority catalog changed. Refresh, then create a fresh request for a new review.",
  request_binding_mismatch:
    "The submitted request binding does not match. Refresh the exact request before resubmitting.",
  reviewer_ineligible:
    "This synthetic reviewer is not currently eligible for this decision. Refresh and inspect the authority requirements.",
  request_expired:
    "This request expired. Refresh, then create a fresh request. Earlier approvals cannot transfer.",
  request_rejected:
    "The request was rejected and cannot accept further decisions.",
  request_superseded:
    "The request was replaced. Its approvals cannot transfer to the replacement.",
  request_escalated: "The request was escalated and grants no authority.",
  principal_already_approved:
    "This principal has already approved. A second approval cannot add another vote.",
  idempotency_conflict:
    "This key was used with different content. Refresh and inspect history before submitting a new command.",
  version_conflict: "The Case changed. Refresh before explicitly resubmitting.",
};
export const explain = (code) =>
  explanations[code] ??
  `The server did not accept this command (${code}). Refresh and review before resubmitting.`;

function pendingCommand(value) {
  requireValue(
    value &&
      [
        "case",
        "create",
        "decide",
        "evidence",
        "prepare",
        "execute",
        "verify",
      ].includes(value.kind) &&
      typeof value.body === "string",
    "Saved retry information is invalid.",
  );
  const command = JSON.parse(value.body);
  requireValue(
    command.tenant_id === TENANT &&
      (command.case_id ?? command.case_seed?.case?.id) === CASE_ID &&
      typeof command.idempotency_key === "string",
    "Saved retry information is invalid.",
  );
  const expected =
    value.kind === "execute"
      ? `${CREDIT_ROOT}-attempts`
      : value.kind === "verify"
        ? `${CREDIT_ROOT}-attempts/${command.attempt_id}/verifications`
        : value.kind === "create"
          ? REVIEW_ROOT
          : value.kind === "decide"
            ? `${REVIEW_ROOT}/${command.authority_request_id}/decisions/${value.seat}`
            : `${CASE_ROOT}/case-commands`;
  requireValue(
    value.path === expected &&
      (value.kind !== "decide" ||
        (ID.test(command.authority_request_id) &&
          Object.hasOwn(SEATS, value.seat))),
    "Saved retry target is invalid.",
  );
  return value;
}

export function createReviewClient({
  fetcher = globalThis.fetch,
  storage,
  nextKey = () => globalThis.crypto.randomUUID(),
  onChange = () => {},
  timeoutMs = 30_000,
  creditEnabled = false,
}) {
  let state = {
    packet: null,
    caseRecord: null,
    requestId: null,
    pending: null,
    receipt: null,
    credit: null,
    creditReceipt: null,
    creditNeedsRefresh: true,
    creditError: null,
    needsRefresh: false,
    busy: false,
    error: null,
    message:
      "Start the synthetic review when you are ready. Opening this page creates nothing.",
  };
  function emit(patch) {
    state = { ...state, ...patch };
    onChange(api.state);
  }
  function save(pending = state.pending, requestId = state.requestId) {
    // Never persist packets, eligibility, accepted receipts or simulated history.
    storage.setItem(STORAGE_KEY, JSON.stringify({ requestId, pending }));
  }
  function savedCommands() {
    return (storage.keys?.() ?? [])
      .filter((key) => key.startsWith(PENDING_PREFIX))
      .sort()
      .map((key) => pendingCommand(JSON.parse(storage.getItem(key))));
  }
  function retain(pending) {
    if (creditEnabled) {
      const key = PENDING_PREFIX + JSON.parse(pending.body).idempotency_key;
      storage.setItem(key, JSON.stringify(pending));
      requireValue(
        storage.getItem(key) === JSON.stringify(pending),
        "Retry storage is unavailable. No command was sent.",
      );
    }
    save(pending);
  }
  function acknowledge(pending, id = state.requestId) {
    if (creditEnabled)
      storage.removeItem?.(
        PENDING_PREFIX + JSON.parse(pending.body).idempotency_key,
      );
    const next = savedCommands()[0] ?? null;
    save(next, id);
    return next;
  }
  async function http(path, body) {
    const controller = new globalThis.AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });
      requireValue(
        (response.headers.get("content-type") ?? "").startsWith(
          "application/json",
        ),
      );
      return { status: response.status, data: await response.json() };
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
  async function context() {
    const [caseResponse, catalogResponse] = await Promise.all([
      http(`${CASE_ROOT}/cases/${CASE_ID}`),
      http(`/v1/tenants/${TENANT}/authority-catalog`),
    ]);
    requireValue(
      [200, 404].includes(caseResponse.status),
      "The current Case could not be loaded.",
    );
    const catalog = catalogResponse.data;
    requireValue(
      catalogResponse.status === 200 &&
        catalog.tenant_id === TENANT &&
        catalog.simulation === true &&
        catalog.action_permission === false &&
        integer(catalog.authority_state_revision, 1),
    );
    const record = caseResponse.status === 404 ? null : caseResponse.data;
    if (record)
      requireValue(
        record.case_id === CASE_ID &&
          record.tenant_id === TENANT &&
          integer(record.document?.case?.version, 1) &&
          Array.isArray(record.document.events),
      );
    emit({ caseRecord: record });
    return { record, catalog };
  }
  async function load(id) {
    requireValue(ID.test(id), "The request navigation ID is invalid.");
    // Preserve the reviewed packet on read failure. Never rebase its bindings
    // with the separate Case read, even if that read returns a newer version.
    const response = await http(`${REVIEW_ROOT}/${id}/packet`);
    requireValue(
      response.status === 200,
      "The request could not be loaded from the runtime.",
    );
    const packet = clone(validatePacket(response.data, id));
    if (state.receipt?.historical && state.receipt.authority_request_id === id)
      requireValue(
        packet.review_revision >= state.receipt.review_revision,
        "The current packet does not yet include the recorded decision.",
      );
    await context();
    save(state.pending, id);
    emit({
      packet,
      requestId: id,
      needsRefresh: false,
      error: null,
      message: state.pending
        ? "A command is still unconfirmed. Retry its original bytes and key."
        : "Current review loaded. Inspect the proposal and history before your next decision.",
    });
    if (creditEnabled) await loadCredit();
  }
  async function loadCredit() {
    try {
      const response = await http(CREDIT_ROOT);
      requireValue(
        response.status === 200,
        "Simulated credit history could not be loaded.",
      );
      const credit = clone(validateCredit(response.data));
      if (state.creditReceipt)
        requireValue(
          [...credit.attempts, ...credit.verifications].some(
            (entry) => entry.event_hash === state.creditReceipt.event_hash,
          ),
          "The read does not yet include the confirmed receipt.",
        );
      emit({ credit, creditNeedsRefresh: false, creditError: null });
    } catch (error) {
      emit({
        creditNeedsRefresh: true,
        creditError: `${error.message} Any confirmed receipt remains recorded; do not resubmit it. Refresh or explicitly check the retained attempt again.`,
      });
    }
  }
  async function run(work) {
    if (state.busy) return;
    emit({ busy: true, error: null });
    try {
      return await work();
    } catch (error) {
      emit({
        error: error.message ?? "The runtime could not be reached.",
        needsRefresh: true,
      });
    } finally {
      emit({ busy: false });
    }
  }
  async function transmit(pending) {
    pendingCommand(pending);
    // Save exact retry bytes before sending a potentially accepted write.
    retain(pending);
    const creditWrite = ["execute", "verify"].includes(pending.kind);
    emit({
      pending,
      ...(creditWrite
        ? { creditNeedsRefresh: true }
        : { receipt: null, needsRefresh: true }),
    });
    let response;
    try {
      response = await http(pending.path, pending.body);
      if (response.status >= 500) throw new Error("Uncertain server response");
      if (
        response.status !== 200 &&
        !(creditWrite && response.status === 409 && response.data.receipt)
      ) {
        const code =
          response.data.code ??
          response.data.error ??
          `HTTP ${response.status}`;
        const next = acknowledge(pending);
        emit({
          pending: next,
          error: creditWrite ? creditReason(code) : explain(code),
          message:
            "No decision acceptance is confirmed. Refresh and explicitly resubmit; the command will not be rebased.",
        });
        return;
      }
      const data = response.data;
      if (creditWrite) {
        const command = JSON.parse(pending.body);
        validateCreditReceipt(
          data,
          pending,
          state.credit?.attempts.find((a) => a.id === command.attempt_id),
        );
      } else {
        requireValue(["applied", "duplicate"].includes(data.status));
        if (["create", "decide"].includes(pending.kind)) {
          const receipt = data.receipt,
            command = JSON.parse(pending.body);
          requireValue(
            receipt?.historical === true &&
              receipt.action_permission === false &&
              ID.test(receipt.authority_request_id) &&
              integer(receipt.review_revision) &&
              HASH.test(receipt.request_binding_hash),
          );
          if (pending.kind === "decide")
            requireValue(
              receipt.authority_request_id === command.authority_request_id &&
                receipt.request_binding_hash === command.request_binding_hash &&
                receipt.review_revision ===
                  command.expected_review_revision + 1,
            );
        } else
          requireValue(
            data.case_id === CASE_ID && integer(data.case_version, 1),
          );
      }
    } catch {
      emit({
        error:
          "Result unconfirmed. The server may have recorded this command. Retry the exact saved command; do not submit a new command.",
        message: "No successful submission is being assumed.",
      });
      return;
    }
    const receipt = response.data.receipt ?? response.data;
    const id = ["create", "decide"].includes(pending.kind)
      ? receipt.authority_request_id
      : state.requestId;
    const next = acknowledge(pending, id);
    emit({
      pending: next,
      requestId: id,
      ...(creditWrite
        ? { creditReceipt: clone(receipt) }
        : { receipt: clone(receipt) }),
      error: null,
      message: "The command was recorded. Checking the current review…",
    });
    // A confirmed write permits a read, never another decision. Conflicts and
    // uncertain writes return above without changing the reviewed binding.
    if (id) {
      try {
        await load(id);
      } catch {
        emit({
          needsRefresh: true,
          error:
            "The command was recorded, but current review could not be refreshed. Refresh to inspect current state; do not resubmit the recorded command.",
        });
      }
    }
    if (creditWrite && receipt.outcome === "denied")
      emit({
        needsRefresh: true,
        creditNeedsRefresh: true,
        error:
          "The simulated credit was denied. Its historical receipt is retained. Refresh, inspect what changed and explicitly consent before any new attempt.",
      });
    return response.data;
  }
  function ensureWritable() {
    requireValue(
      !state.pending && savedCommands().length === 0,
      "Resolve the unconfirmed command with an exact retry first.",
    );
  }
  function submit(kind, path, command, seat) {
    return transmit({
      kind,
      path,
      body: JSON.stringify(command),
      ...(seat ? { seat } : {}),
    });
  }
  function createCommand(c, s, key, predecessor) {
    return {
      type: "authority.request.create",
      tenant_id: TENANT,
      case_id: CASE_ID,
      expected_case_version: c,
      expected_authority_state_revision: s,
      proposal_key: state.packet?.material.proposal_key ?? "credit_15000",
      idempotency_key: key,
      correlation_id: "d6-workbench",
      ...(predecessor ? { predecessor_authority_request_id: predecessor } : {}),
    };
  }
  const api = {
    get state() {
      return clone(state);
    },
    start(id) {
      return run(async () => {
        const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
        if (saved) {
          requireValue(
            saved.requestId === null || ID.test(saved.requestId),
            "Saved request navigation is invalid.",
          );
          emit({
            requestId: saved.requestId,
            pending:
              saved.pending === null ? null : pendingCommand(saved.pending),
          });
        }
        if (creditEnabled && savedCommands().length)
          emit({ pending: savedCommands()[0] });
        if (id ?? state.requestId) await load(id ?? state.requestId);
        else {
          await context();
          if (creditEnabled) await loadCredit();
        }
        if (state.pending)
          emit({
            error:
              "Result unconfirmed. Retry the exact saved command to recover its receipt.",
          });
      });
    },
    refresh(id = state.requestId) {
      return run(async () => {
        if (id) await load(id);
        else {
          await context();
          if (creditEnabled) await loadCredit();
        }
      });
    },
    initialize() {
      return run(async () => {
        ensureWritable();
        let current = await context();
        if (!current.record) {
          if (!(await submit("case", `${CASE_ROOT}/case-commands`, DEMO_CASE)))
            return;
          current = await context();
        }
        const c = current.record.document.case.version,
          s = current.catalog.authority_state_revision;
        if (creditEnabled) {
          await loadCredit();
          requireValue(
            !state.creditNeedsRefresh,
            "Load the existing operation history before initializing another request.",
          );
          if (state.credit.current?.bindings.authority_request_id) {
            await load(state.credit.current.bindings.authority_request_id);
            return;
          }
        }
        await submit("create", REVIEW_ROOT, {
          ...createCommand(c, s, `d6-workbench:initial:${c}:${s}`),
          proposal_key: "credit_15000",
        });
      });
    },
    decide(seat, decision, reason = "", replacement) {
      return run(async () => {
        ensureWritable();
        requireValue(
          !state.needsRefresh && !requestBlocked(state.packet),
          "Refresh and review a current, open request first.",
        );
        const command = decisionCommand(
          state.packet,
          seat,
          decision,
          reason,
          replacement,
          `d6-workbench:${nextKey()}`,
        );
        await submit(
          "decide",
          `${REVIEW_ROOT}/${state.requestId}/decisions/${seat}`,
          command,
          seat,
        );
      });
    },
    retry() {
      return run(async () => {
        requireValue(
          state.pending,
          "There is no unconfirmed command to retry.",
        );
        await transmit(state.pending);
      });
    },
    executeCredit() {
      return run(async () => {
        ensureWritable();
        // run() has set busy; check the displayed, unrebased binding.
        requireValue(
          canExecuteCredit({ ...state, busy: false }),
          "Refresh and inspect the current proposal, approvals and execution prerequisites first.",
        );
        await submit(
          "execute",
          `${CREDIT_ROOT}-attempts`,
          creditCommand(
            state.credit,
            state.packet,
            `d7-workbench:execute:${nextKey()}`,
          ),
        );
      });
    },
    verifyCredit() {
      return run(async () => {
        ensureWritable();
        // Verification is independent of current execution and review eligibility.
        const loaded = latestInvocation(state.credit);
        const confirmed =
          state.creditReceipt?.outcome === "simulated_action_recorded"
            ? state.creditReceipt
            : null;
        const attempt =
          confirmed && (!loaded || confirmed.sequence > loaded.sequence)
            ? confirmed
            : loaded;
        requireValue(
          attempt,
          "Load a committed action attempt before checking its source.",
        );
        await submit(
          "verify",
          `${CREDIT_ROOT}-attempts/${attempt.id}/verifications`,
          verificationCommand(attempt, `d7-workbench:verify:${nextKey()}`),
        );
      });
    },
    prepareCase() {
      return run(async () => {
        ensureWritable();
        requireValue(
          !state.needsRefresh && state.caseRecord,
          "Refresh before preparing the Case.",
        );
        const to = preparationStep(state.caseRecord);
        requireValue(
          to,
          "This is no longer the original preparation sequence. The Workbench will not move a changed Case.",
        );
        await submit("prepare", `${CASE_ROOT}/case-commands`, {
          type: "case.transition",
          tenant_id: TENANT,
          case_id: CASE_ID,
          expected_case_version: state.caseRecord.document.case.version,
          actor_identity_id: "identity_d6_operator",
          idempotency_key: `d7-workbench:prepare:${to}`,
          correlation_id: "d7-workbench",
          to_state: to,
          reason: `Explicit synthetic preparation for ${to}; no customer impact or closure is established.`,
        });
      });
    },
    attachEvidence() {
      return run(async () => {
        ensureWritable();
        requireValue(
          state.packet && !state.needsRefresh,
          "Refresh the reviewed Case before attaching evidence.",
        );
        await submit("evidence", `${CASE_ROOT}/case-commands`, {
          type: "case.attach_work_event",
          tenant_id: TENANT,
          case_id: CASE_ID,
          expected_case_version: state.packet.case_version,
          actor_identity_id: "identity_d6_operator",
          idempotency_key: "d6-workbench:evidence:update",
          correlation_id: "d6-workbench",
          work_event: DEMO_UPDATE,
        });
      });
    },
    freshRequest() {
      return run(async () => {
        ensureWritable();
        requireValue(
          state.packet && !state.needsRefresh,
          "Refresh before creating a fresh request.",
        );
        await submit(
          "create",
          REVIEW_ROOT,
          createCommand(
            state.packet.case_version,
            state.packet.authority_state_revision,
            `d6-workbench:fresh:${nextKey()}`,
            state.requestId,
          ),
        );
      });
    },
  };
  return api;
}
