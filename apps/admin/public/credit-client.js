// Presentation checks only. The existing runtime replays and authorizes every write.
export const CREDIT_ROOT =
  "/v1/tenants/tenant_orchid/cases/case_d6_workbench/simulated-credit";
const hash = (v) => typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v);
const instant = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  return object(v)
    ? Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, canonical(v[k])]),
      )
    : v;
}
function check(ok) {
  if (!ok)
    throw new Error(
      "The runtime returned invalid simulated credit evidence. Refresh; no success is assumed.",
    );
}
function scoped(v) {
  return v?.tenant_id === "tenant_orchid" && v.case_id === "case_d6_workbench";
}
function payload(v) {
  return (
    v?.consequence_class === "financial_remedy" &&
    v.account_ref === "synthetic://accounts/orchid" &&
    v.amount_minor === 1500000 &&
    v.currency === "USD"
  );
}
function target(v) {
  return (
    scoped(v) &&
    v.source === "simulated_credit_source.v1" &&
    v.account_ref === "synthetic://accounts/orchid" &&
    v.operation === "customer_credit" &&
    v.slot === "service_remedy"
  );
}
function source(v) {
  check(
    v === null ||
      (v.schema_version === "simulated-credit-source-row.v1" &&
        target(v.target) &&
        payload(v.payload) &&
        /^attempt_[\w-]+$/.test(v.origin_attempt_id) &&
        hash(v.row_hash) &&
        instant(v.effected_at)),
  );
}
function entry(v) {
  check(
    scoped(v) &&
      v.simulation === true &&
      v.closure_permission === false &&
      v.slot === "service_remedy" &&
      Number.isSafeInteger(v.sequence) &&
      v.sequence > 0 &&
      instant(v.recorded_at) &&
      hash(v.event_hash) &&
      hash(v.envelope_hash) &&
      object(v.command) &&
      v.command.idempotency_key === v.idempotency_key,
  );
}
export function validateAttempt(v) {
  entry(v);
  check(
    [
      "simulated-action-journal-entry.v1",
      "simulated-action-journal-entry.v2",
    ].includes(v.schema_version) &&
      /^attempt_[\w-]+$/.test(v.id) &&
      ["denied", "simulated_action_recorded"].includes(v.outcome),
  );
  const e = v.envelope;
  check(
    object(e) &&
      target(e.target) &&
      payload(e.payload) &&
      same(e.command, v.command) &&
      typeof e.authorized === "boolean" &&
      e.authorized === (v.outcome === "simulated_action_recorded") &&
      hash(e.action_binding_hash),
  );
  source(v.source);
  check(
    v.source === null || (v.source.origin_attempt_id === v.id && e.authorized),
  );
  return v;
}
const comparisonReasons = [
  "source_absent",
  "multiple_rows",
  "wrong_target",
  "wrong_payload",
  "wrong_origin",
  "read_unavailable",
  "malformed_observation",
  "source_changed",
  "operation_changed",
  "source_history_conflict",
  "catalog_changed",
];
export function validateVerification(v, attempt) {
  entry(v);
  check(
    v.schema_version === "simulated-credit-verification-entry.v1" &&
      /^verification_[\w-]+$/.test(v.id) &&
      hash(v.action_entry_hash) &&
      v.source === null,
  );
  const c = v.comparison,
    o = v.observation,
    a = v.authority;
  check(
    object(c) &&
      ["verified_simulated_effect", "mismatch", "inconclusive"].includes(
        c.outcome,
      ) &&
      Array.isArray(c.reason_codes) &&
      c.reason_codes.every((r) => comparisonReasons.includes(r)) &&
      typeof c.absence_proven === "boolean",
  );
  check(
    object(o) &&
      o.reader_identity_id === "identity_d7_credit_verifier" &&
      target(o.target) &&
      instant(o.observed_at) &&
      object(o.raw) &&
      ["read", "unavailable", "malformed"].includes(o.raw.status) &&
      (o.raw.rows === null || Array.isArray(o.raw.rows)),
  );
  check(
    a?.verifier_identity?.identity_id === "identity_d7_credit_verifier" &&
      a.read_grant?.identity?.identity_id === "identity_d7_credit_verifier" &&
      a.recording_grant?.identity?.identity_id ===
        "identity_d7_credit_verifier",
  );
  if (attempt)
    check(
      v.command.attempt_id === attempt.id &&
        v.action_entry_hash === attempt.event_hash &&
        v.envelope_hash === attempt.envelope_hash &&
        v.sequence > attempt.sequence,
    );
  check(v.command.expected_action_entry_hash === v.action_entry_hash);
  if (c.outcome === "verified_simulated_effect") {
    check(
      c.reason_codes.length === 0 &&
        !c.absence_proven &&
        o.raw.status === "read" &&
        o.raw.rows?.length === 1,
    );
    const row = o.raw.rows[0]?.source_row;
    source(row);
    check(
      row !== null &&
        row.origin_attempt_id === v.command.attempt_id &&
        same(o.raw, v.recording_source),
    );
  } else check(c.reason_codes.length > 0);
  if (c.absence_proven)
    check(
      c.outcome === "mismatch" &&
        same(c.reason_codes, ["source_absent"]) &&
        o.raw.status === "read" &&
        o.raw.rows?.length === 0 &&
        same(o.raw, v.recording_source),
    );
  return v;
}
export function validateCredit(v) {
  check(
    v?.schema_version === "simulated-credit-read-response.v2" &&
      v.simulation === true &&
      v.closure_permission === false &&
      v.verification === "available" &&
      hash(v.action_binding_hash) &&
      hash(v.profile_hash) &&
      target(v.profile?.target) &&
      payload(v.profile?.payload),
  );
  check(Array.isArray(v.attempts) && Array.isArray(v.verifications));
  for (const a of v.attempts) validateAttempt(a);
  for (const proof of v.verifications) {
    const attempt = v.attempts.find(
      (a) =>
        a.id === proof.command?.attempt_id &&
        a.outcome === "simulated_action_recorded",
    );
    check(attempt);
    validateVerification(proof, attempt);
  }
  const history = [...v.attempts, ...v.verifications].sort(
    (a, b) => a.sequence - b.sequence,
  );
  for (const [i, item] of history.entries())
    check(
      item.sequence === i + 1 &&
        item.previous_event_hash === (history[i - 1]?.event_hash ?? null),
    );
  source(v.source);
  check(v.source === null || v.attempts.some((a) => same(a.source, v.source)));
  if (v.current !== null) {
    const c = v.current,
      b = c.bindings;
    check(
      c.informational_only === true &&
        typeof c.eligible === "boolean" &&
        Array.isArray(c.reason_codes) &&
        c.reason_codes.every((r) => typeof r === "string") &&
        instant(c.evaluated_at),
    );
    check(
      scoped(b) &&
        b.schema_version === "simulated-credit-command.v1" &&
        b.type === "simulated-credit.execute" &&
        /^request_[\w-]+$/.test(b.authority_request_id) &&
        hash(b.request_binding_hash) &&
        b.expected_action_binding_hash === v.action_binding_hash &&
        [
          b.expected_case_version,
          b.expected_review_revision,
          b.expected_authority_state_revision,
        ].every(Number.isSafeInteger) &&
        b.expected_case_version >= 1 &&
        b.expected_review_revision >= 0 &&
        b.expected_authority_state_revision >= 1,
    );
    check(!c.eligible || (c.reason_codes.length === 0 && v.source === null));
  }
  return v;
}
export function creditMatchesPacket(credit, packet) {
  const b = credit?.current?.bindings;
  return !!(
    b &&
    packet &&
    b.authority_request_id === packet.authority_request_id &&
    b.request_binding_hash === packet.request_binding_hash &&
    b.expected_case_version === packet.case_version &&
    b.expected_review_revision === packet.review_revision &&
    b.expected_authority_state_revision === packet.authority_state_revision
  );
}
export function latestInvocation(credit) {
  return (
    credit?.attempts
      .filter((a) => a.outcome === "simulated_action_recorded")
      .at(-1) ?? null
  );
}
export function latestCheck(credit, attempt = latestInvocation(credit)) {
  return (
    credit?.verifications
      .filter((v) => v.action_entry_hash === attempt?.event_hash)
      .at(-1) ?? null
  );
}
export function canExecuteCredit(state) {
  const c = state.credit;
  const attempt = latestInvocation(c),
    proof = latestCheck(c, attempt);
  return !!(
    !state.busy &&
    !state.pending &&
    !state.needsRefresh &&
    !state.creditNeedsRefresh &&
    state.packet?.current.authorized &&
    c?.current?.eligible &&
    c.source === null &&
    creditMatchesPacket(c, state.packet) &&
    (!attempt || (attempt.source === null && proof?.comparison.absence_proven))
  );
}
export function creditCommand(credit, packet, key) {
  check(creditMatchesPacket(credit, packet));
  // Explicit fields, never spread authority, identities, payloads or success flags.
  const b = credit.current.bindings;
  return {
    schema_version: "simulated-credit-command.v1",
    type: "simulated-credit.execute",
    tenant_id: b.tenant_id,
    case_id: b.case_id,
    authority_request_id: b.authority_request_id,
    expected_case_version: b.expected_case_version,
    expected_review_revision: b.expected_review_revision,
    expected_authority_state_revision: b.expected_authority_state_revision,
    request_binding_hash: b.request_binding_hash,
    expected_action_binding_hash: b.expected_action_binding_hash,
    idempotency_key: key,
    correlation_id: "d7-workbench",
  };
}
export function verificationCommand(attempt, key) {
  validateAttempt(attempt);
  check(attempt.outcome === "simulated_action_recorded");
  return {
    schema_version: "simulated-credit-verification-command.v1",
    type: "simulated-credit.verify",
    tenant_id: attempt.tenant_id,
    case_id: attempt.case_id,
    attempt_id: attempt.id,
    expected_action_entry_hash: attempt.event_hash,
    idempotency_key: key,
    correlation_id: "d7-workbench",
  };
}
export function validateCreditReceipt(data, pending, attempt) {
  check(
    ["applied", "duplicate", "denied"].includes(data.status) &&
      data.historical_only === true,
  );
  const command = JSON.parse(pending.body),
    receipt = data.receipt;
  check(same(receipt?.command, command));
  if (pending.kind === "execute") {
    validateAttempt(receipt);
    check(data.status !== "denied" || receipt.outcome === "denied");
  } else validateVerification(receipt, attempt);
  return receipt;
}

export function creditReason(code) {
  return (
    {
      case_state_ineligible:
        "Prepare the original synthetic Case for review before recording a credit.",
      current_authority_required:
        "Current Finance and Executive approvals are required.",
      independent_absence_check_required:
        "Check the last attempt independently before considering a fresh execution attempt.",
      credit_already_recorded:
        "The credit slot is occupied. Another credit is blocked.",
      payload_mismatch:
        "This operation supports only the proposed $15,000 Orchid credit.",
      source_absent:
        "The independent source read found no credit in the expected slot.",
      wrong_payload:
        "The observed credit amount or currency differs from the approved proposal.",
      wrong_target:
        "The observed account, Case or credit slot differs from the expected target.",
      wrong_origin: "The observed credit belongs to a different attempt.",
      read_unavailable:
        "The independent source could not be read. Whether the effect exists remains unknown.",
      malformed_observation:
        "The source returned unreadable evidence. Whether the effect matches remains unknown.",
      source_changed:
        "Source readings did not agree during the check. A fresh check is needed.",
      operation_changed:
        "Operation history changed during the check. A fresh check is needed.",
      catalog_changed:
        "Verifier authority changed during the check. A fresh check is needed.",
      source_history_conflict:
        "The source conflicts with retained history. Inspect the discrepancy before proceeding.",
      verifier_ineligible:
        "The server-selected verifier is not currently eligible. Check the local enrollment and authority validity.",
    }[code] ??
    `The runtime reports ${code.replaceAll("_", " ")}. Refresh and inspect the prerequisites.`
  );
}
