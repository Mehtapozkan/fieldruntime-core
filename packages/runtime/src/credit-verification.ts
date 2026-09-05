import {
  assertValidSimulatedCreditV2Contract,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  AuthorityReviewError,
  integer,
  json,
  object,
  objects,
  string,
  type ObjectValue,
} from "./authority-review-types.js";
import {
  creditAssert,
  creditSame,
  creditServiceEligibility,
  CREDIT_PROFILE,
  CREDIT_TARGET,
  type CreditContext,
} from "./simulated-credit.js";

export const VERIFICATION_VERSIONS = json({
  engine: "simulated-credit-verifier.v1",
  reader: "simulated-credit-source-reader.v1",
  comparison: "simulated-credit-comparison.v1",
  canonicalization: "canonical-json.v1",
});
export function isVerification(entry: ObjectValue): boolean {
  return entry.schema_version === "simulated-credit-verification-entry.v1";
}
export function sourceObservation(rows: readonly unknown[]): ObjectValue {
  return json({ status: "read", rows, hash: sha256Json(rows) });
}
export function unavailableObservation(): ObjectValue {
  return json({ status: "unavailable", rows: null, hash: null });
}
function comparison(
  outcome: string,
  reasons: string[],
  absence = false,
): ObjectValue {
  const result = json({
    outcome,
    reason_codes: [...new Set(reasons)].sort(),
    absence_proven: absence,
  });
  assertValidSimulatedCreditV2Contract("comparison", result);
  return result;
}
function validRaw(raw: ObjectValue): void {
  assertValidSimulatedCreditV2Contract("raw", raw);
  creditAssert(
    raw.status === "read"
      ? Array.isArray(raw.rows) && raw.hash === sha256Json(raw.rows)
      : raw.rows === null && raw.hash === null,
    "observation representation drift",
  );
}
// Observe the full database tuple, including its indexed attribution. A valid
// but different payload is a mismatch; a broken representation is inconclusive.
export function compareCreditObservation(
  raw: ObjectValue,
  attempt: ObjectValue,
): ObjectValue {
  try {
    validRaw(raw);
  } catch {
    return comparison("inconclusive", ["malformed_observation"]);
  }
  if (raw.status !== "read")
    return comparison("inconclusive", [
      raw.status === "unavailable"
        ? "read_unavailable"
        : "malformed_observation",
    ]);
  const rows = raw.rows as readonly unknown[];
  if (!rows.length) return comparison("mismatch", ["source_absent"], true);
  if (rows.length !== 1) return comparison("mismatch", ["multiple_rows"]);
  try {
    const row = object(rows[0]),
      source = object(row.source_row),
      target = object(source.target),
      payload = object(source.payload);
    const { row_hash: hash, ...bytes } = source;
    creditAssert(
      source.schema_version === "simulated-credit-source-row.v1" &&
        creditSame(
          Object.keys(source).sort(),
          [
            "schema_version",
            "target",
            "payload",
            "origin_attempt_id",
            "effected_at",
            "effected_at_source_timezone",
            "row_hash",
          ].sort(),
        ) &&
        creditSame(
          Object.keys(row).sort(),
          [
            "tenant_id",
            "case_id",
            "slot",
            "origin_attempt_id",
            "row_hash",
            "source_row",
          ].sort(),
        ) &&
        typeof source.origin_attempt_id === "string" &&
        typeof source.effected_at === "string" &&
        new Date(source.effected_at).toISOString() === source.effected_at &&
        source.effected_at_source_timezone === "UTC" &&
        hash === sha256Json(bytes) &&
        row.row_hash === hash &&
        row.origin_attempt_id === source.origin_attempt_id &&
        ["tenant_id", "case_id", "slot"].every(
          (key) => row[key] === target[key],
        ) &&
        [
          "source",
          "tenant_id",
          "case_id",
          "account_ref",
          "operation",
          "slot",
        ].every((key) => typeof target[key] === "string") &&
        typeof payload.account_ref === "string" &&
        typeof payload.consequence_class === "string" &&
        typeof payload.currency === "string" &&
        Number.isSafeInteger(payload.amount_minor),
      "malformed observed row",
    );
    const envelope = object(attempt.envelope),
      reasons: string[] = [];
    if (!creditSame(target, envelope.target)) reasons.push("wrong_target");
    if (!creditSame(payload, envelope.payload)) reasons.push("wrong_payload");
    if (
      source.origin_attempt_id !== attempt.id ||
      source.effected_at !== attempt.recorded_at
    )
      reasons.push("wrong_origin");
    return comparison(
      reasons.length ? "mismatch" : "verified_simulated_effect",
      reasons,
    );
  } catch {
    return comparison("inconclusive", ["malformed_observation"]);
  }
}
export function verificationAttempt(
  context: CreditContext,
  command: ObjectValue,
): ObjectValue | undefined {
  return context.credit.entries.find(
    (e) =>
      !isVerification(e) &&
      e.id === command.attempt_id &&
      e.event_hash === command.expected_action_entry_hash &&
      e.outcome === "simulated_action_recorded" &&
      e.tenant_id === command.tenant_id &&
      e.case_id === command.case_id,
  );
}
export function verifierAuthority(
  context: CreditContext,
  catalogHash: string,
  at: string,
  attempt: ObjectValue,
): { identity: ObjectValue; grant: ObjectValue } {
  const snapshot = context.authority.snapshots.find(
    (s) =>
      s.kind === "catalog" &&
      s.hash === catalogHash &&
      s.tenant_id === CREDIT_TARGET.tenant_id,
  );
  creditAssert(snapshot, "verification catalog missing");
  const eligible = creditServiceEligibility(
    object(snapshot.content.data),
    "verifier",
    at,
  );
  if (eligible.reasons.length || !eligible.identity || !eligible.grant)
    throw new AuthorityReviewError(
      "VERIFIER_INELIGIBLE",
      "verifier ineligible",
    );
  const executor = object(object(attempt.envelope).profile).executor;
  if (
    eligible.identity.identity_id === executor ||
    eligible.identity.identity_id !== CREDIT_PROFILE.verifier
  )
    throw new AuthorityReviewError(
      "VERIFIER_INELIGIBLE",
      "executor self-verification",
    );
  return { identity: eligible.identity, grant: eligible.grant };
}
export function observationFrontier(
  context: CreditContext,
  raw: ObjectValue,
  at: string,
): ObjectValue {
  const head = context.heads.find(
    (h) => h.tenant_id === CREDIT_TARGET.tenant_id,
  );
  creditAssert(
    head && context.credit.entries.length > 0,
    "verification frontier missing",
  );
  const result = json({
    raw,
    observed_at: at,
    observed_at_source_timezone: "UTC",
    reader_identity_id: CREDIT_PROFILE.verifier,
    reader_version: VERIFICATION_VERSIONS.reader,
    query_version: "orchid-credit-slot-query.v1",
    target: CREDIT_TARGET,
    action_sequence: context.credit.entries.length,
    action_head_hash: context.credit.entries.at(-1)?.event_hash,
    authority_position: context.authority.entries.length,
    catalog_hash: head.snapshot_hash,
    catalog_revision: head.revision,
  });
  assertValidSimulatedCreditV2Contract("observation", result);
  return result;
}
function retainedSources(entries: readonly ObjectValue[]): ObjectValue[] {
  return entries.filter((e) => e.source !== null).map((e) => object(e.source));
}
export function verificationComparison(
  context: CreditContext,
  attempt: ObjectValue,
  observation: ObjectValue,
  recording: ObjectValue,
): ObjectValue {
  const raw = object(observation.raw);
  validRaw(raw);
  validRaw(recording);
  const checked = compareCreditObservation(raw, attempt);
  const reasons = [...(checked.reason_codes as readonly string[])];
  if (
    observation.action_sequence !== context.credit.entries.length ||
    observation.action_head_hash !== context.credit.entries.at(-1)?.event_hash
  )
    reasons.push("operation_changed");
  if (
    observation.catalog_hash !==
    context.heads.find((h) => h.tenant_id === CREDIT_TARGET.tenant_id)
      ?.snapshot_hash
  )
    reasons.push("catalog_changed");
  if (!creditSame(raw, recording)) reasons.push("source_changed");
  if (recording.status !== "read")
    reasons.push(
      recording.status === "unavailable"
        ? "read_unavailable"
        : "malformed_observation",
    );
  if (
    reasons.includes("operation_changed") ||
    reasons.includes("catalog_changed") ||
    reasons.includes("source_changed") ||
    recording.status !== "read"
  )
    return comparison("inconclusive", reasons);
  const sources = retainedSources(
    context.credit.entries.slice(0, integer(observation.action_sequence)),
  );
  // Positive proof and reusable absence must agree with the independent read AND
  // immutable source/action history. A physical discrepancy is retained as a
  // problem; it never becomes a retry capability or a false successful proof.
  if (checked.absence_proven === true && sources.length)
    return comparison("mismatch", [...reasons, "source_history_conflict"]);
  if (
    checked.outcome === "verified_simulated_effect" &&
    !creditSame(
      sources,
      objects(raw.rows).map((r) => object(r.source_row)),
    )
  )
    return comparison("inconclusive", [...reasons, "source_history_conflict"]);
  return checked;
}
export function verificationEntry(
  context: CreditContext,
  command: ObjectValue,
  observation: ObjectValue,
  recording: ObjectValue,
  at: string,
  floor: string,
  id: string,
): ObjectValue {
  assertValidSimulatedCreditV2Contract("verify_command", command);
  const attempt = verificationAttempt(context, command),
    head = context.heads.find((h) => h.tenant_id === CREDIT_TARGET.tenant_id);
  creditAssert(
    attempt && head,
    "verification attempt missing or binding changed",
  );
  creditAssert(
    at >= string(observation.observed_at) &&
      at >= floor &&
      string(observation.observed_at) >= string(attempt.recorded_at),
    "verification clock regressed",
  );
  const read = verifierAuthority(
    context,
    string(observation.catalog_hash),
    string(observation.observed_at),
    attempt,
  );
  const current = verifierAuthority(context, head.snapshot_hash, at, attempt);
  const authority = json({
    verifier_identity: current.identity,
    read_grant: read.grant,
    recording_grant: current.grant,
    read_catalog_hash: observation.catalog_hash,
    recording_catalog_hash: head.snapshot_hash,
  });
  const entry = json({
    schema_version: "simulated-credit-verification-entry.v1",
    id,
    sequence: context.credit.entries.length + 1,
    tenant_id: attempt.tenant_id,
    case_id: attempt.case_id,
    slot: attempt.slot,
    authority_request_id: attempt.authority_request_id,
    review_revision: attempt.review_revision,
    review_head_hash: attempt.review_head_hash,
    case_version: attempt.case_version,
    case_head_hash: attempt.case_head_hash,
    catalog_hash: head.snapshot_hash,
    authority_state_revision: head.revision,
    authority_position: context.authority.entries.length,
    recorded_at: at,
    recorded_at_source_timezone: "UTC",
    previous_event_hash: context.credit.entries.at(-1)?.event_hash ?? null,
    command,
    command_fingerprint: sha256Json(command),
    idempotency_key: command.idempotency_key,
    action_entry_hash: attempt.event_hash,
    envelope_hash: attempt.envelope_hash,
    observation,
    recording_source: recording,
    comparison: verificationComparison(
      context,
      attempt,
      observation,
      recording,
    ),
    authority,
    clock_floor: floor,
    source: null,
    simulation: true,
    closure_permission: false,
    implementation_versions: VERIFICATION_VERSIONS,
  });
  const result = json({ ...entry, event_hash: sha256Json(entry) });
  assertValidSimulatedCreditV2Contract("verification", result);
  return result;
}
export function retryAbsence(entries: readonly ObjectValue[]): string | null {
  const latest = entries
    .filter((e) => e.outcome === "simulated_action_recorded")
    .at(-1);
  if (!latest || latest.source !== null) return null;
  const proof = entries
    .filter(
      (e) => isVerification(e) && e.action_entry_hash === latest.event_hash,
    )
    .at(-1);
  return proof && object(proof.comparison).absence_proven === true
    ? string(proof.event_hash)
    : null;
}
export function assertVerificationIntegrity(
  context: CreditContext,
  index: number,
): void {
  const entry = context.credit.entries[index];
  creditAssert(entry, "verification entry missing");
  assertValidSimulatedCreditV2Contract("verification", entry);
  const prior = context.credit.entries.slice(0, index),
    observation = object(entry.observation);
  const readSequence = integer(observation.action_sequence),
    position = integer(entry.authority_position);
  const readPosition = integer(observation.authority_position);
  creditAssert(
    readSequence > 0 &&
      readSequence <= index &&
      observation.action_head_hash === prior[readSequence - 1]?.event_hash,
    "verification observation head drift",
  );
  creditAssert(
    position <= context.authority.entries.length &&
      integer(observation.authority_position) <= position &&
      integer(prior.at(-1)?.authority_position) <= position &&
      integer(prior.at(-1)?.authority_state_revision) <=
        integer(entry.authority_state_revision),
    "verification frontiers regressed",
  );
  const catalogAt = (
    hash: string,
    revision: number,
    reviewPosition: number,
    at: string,
    current: boolean,
  ): ObjectValue => {
    const catalog = context.authority.snapshots.find(
      (s) =>
        s.hash === hash &&
        s.kind === "catalog" &&
        s.tenant_id === entry.tenant_id,
    );
    creditAssert(
      catalog &&
        catalog.content.revision === revision &&
        integer(catalog.content.after_review_position) <= reviewPosition &&
        string(catalog.content.recorded_at) <= at,
      "verification catalog anchor drift",
    );
    // The writer serializes issuance. A read can overlap an uncommitted catalog
    // write whose issuance timestamp is earlier; differing catalogs therefore
    // force an inconclusive comparison rather than proving read-time order.
    creditAssert(
      !current ||
        !context.authority.snapshots.some(
          (s) =>
            s.kind === "catalog" &&
            s.tenant_id === entry.tenant_id &&
            integer(s.content.revision) > revision &&
            string(s.content.recorded_at) < at,
        ),
      "verification ignored an earlier catalog change",
    );
    return catalog.content;
  };
  catalogAt(
    string(observation.catalog_hash),
    integer(observation.catalog_revision),
    integer(observation.authority_position),
    string(observation.observed_at),
    false,
  );
  const catalog = catalogAt(
    string(entry.catalog_hash),
    integer(entry.authority_state_revision),
    position,
    string(entry.recorded_at),
    true,
  );
  const floor = [
    ...prior,
    ...context.authority.entries
      .slice(0, position)
      .filter((e) => e.tenant_id === entry.tenant_id),
  ]
    .map((e) => string(e.recorded_at))
    .reduce((a, b) => (a > b ? a : b), string(catalog.recorded_at));
  const retainedFloor = string(entry.clock_floor);
  const earlierCaseFloor = context.cases.cases
    .flatMap((c) => c.journal)
    .filter((e) => e.recorded_at < string(entry.recorded_at))
    .reduce((a, e) => (e.recorded_at > a ? e.recorded_at : a), floor);
  creditAssert(
    retainedFloor >= earlierCaseFloor,
    "verification ignored an earlier Case clock",
  );
  creditAssert(
    integer(prior[readSequence - 1]?.authority_position) <= readPosition &&
      integer(prior[readSequence - 1]?.authority_state_revision) <=
        integer(observation.catalog_revision) &&
      context.authority.entries
        .slice(0, readPosition)
        .filter((e) => e.tenant_id === entry.tenant_id)
        .every((e) => string(e.recorded_at) <= string(observation.observed_at)),
    "verification read frontiers regressed",
  );
  creditAssert(
    retainedFloor >= floor &&
      retainedFloor <= string(entry.recorded_at) &&
      (retainedFloor === floor ||
        context.cases.cases.some((c) =>
          c.journal.some((e) => e.recorded_at === retainedFloor),
        )),
    "verification clock floor unsupported",
  );
  creditAssert(
    string(observation.observed_at) >=
      string(prior[readSequence - 1]?.recorded_at),
    "observation predates its operation frontier",
  );
  const past: CreditContext = {
    ...context,
    authority: {
      ...context.authority,
      entries: context.authority.entries.slice(0, position),
    },
    heads: [
      {
        tenant_id: "tenant_orchid",
        revision: integer(entry.authority_state_revision),
        snapshot_hash: string(entry.catalog_hash),
        last_recorded_at: retainedFloor,
      },
    ],
    credit: { entries: prior, sources: retainedSources(prior) },
  };
  const attempt = verificationAttempt(past, object(entry.command));
  creditAssert(
    attempt && integer(attempt.sequence) <= readSequence,
    "verification observed before its attempt",
  );
  const expected = verificationEntry(
    past,
    object(entry.command),
    observation,
    object(entry.recording_source),
    string(entry.recorded_at),
    retainedFloor,
    string(entry.id),
  );
  creditAssert(
    creditSame(expected, entry),
    "verification differs from canonical replay",
  );
}
