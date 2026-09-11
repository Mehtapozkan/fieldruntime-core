// D-040 activation interpreter. Historical mock v1/v2 evidence is never relabeled.
import { get_encoding } from "tiktoken";
import {
  assertValidInvestigationV3Contract,
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  intakeObject as o,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "./intake.js";
import {
  comparisonRequest,
  comparisonReservation,
  comparisonFailure,
  comparisonResponse,
} from "./investigation-comparison.js";
import { syntheticComparisonProfile } from "./preparation-worker-profile.js";
import { prepareDisposition } from "./disposition-preparation.js";
const encoding = get_encoding("o200k_base");
const accounts = new Map<string, Obj>();
const count = (text: string): number => encoding.encode(text, [], []).length;
export function accountComparisonInput(request: Obj): Obj {
  const serialized = canonicalJson(request),
    bytes = Buffer.byteLength(serialized);
  ensure(
    bytes <= 12000,
    "INVESTIGATION_INPUT_LIMIT",
    "Complete request exceeds the frozen conservative input allowance; no clipping",
  );
  const hash = sha256Json(request),
    cached = accounts.get(hash);
  if (cached) return cached;
  const result = immutableJson({
    tokenizer: "tiktoken-js.1.0.22.o200k_base",
    request_hash: hash,
    serialized_utf8_bytes: bytes,
    serialized_tokens: count(serialized),
    instructions_tokens: count(String(request.instructions)),
    input_tokens: count(String(request.input)),
    schema_tokens: count(canonicalJson(o(o(request.text).format).schema)),
    framing_reserve_tokens: 4000,
    conservative_input_ceiling: bytes + 4000,
    qualification:
      "local_counts_and_conservative_allowance_not_provider_exact_count",
  });
  const oldest = accounts.keys().next().value;
  if (accounts.size >= 256 && oldest !== undefined) accounts.delete(oldest);
  accounts.set(hash, result);
  return result;
}
export function liveRequest(input: Obj): Obj {
  const request = comparisonRequest(input);
  accountComparisonInput(request);
  return request;
}
export function liveReservation(
  entries: readonly Obj[],
  input: Obj,
  profile: Obj,
): Obj {
  assertValidInvestigationV3Contract("profile", o(profile.investigation));
  ensure(
    o(input.binding).activation_hash ===
      o(profile.investigation).activation_hash,
    "WORK_INTEGRITY",
    "Activation binding changed",
  );
  const historicalProfile = syntheticComparisonProfile(
    o(profile.investigation).arm as
      "bounded_investigation" | "generic_assistant",
  );
  const reservation = comparisonReservation(entries, input, {
    ...historicalProfile,
    investigation: {
      ...o(historicalProfile.investigation),
      batch_budget_usd_minor: o(profile.investigation).batch_budget_usd_minor,
      batch_invocations: o(profile.investigation).batch_invocations,
    },
  });
  return immutableJson({
    ...reservation,
    profile_hash: sha256Json(profile),
    accounting: "live_reservation_not_actual_spend",
    input_accounting: accountComparisonInput(liveRequest(input)),
  });
}
function liveFields(input: Obj, old: Obj): Obj {
  const usage = old.usage === null ? null : o(old.usage);
  return {
    ...old,
    schema_version: "investigation-evidence.v3",
    input_accounting: accountComparisonInput(liveRequest(input)),
    usage_qualification: usage ? "reported_by_provider" : "unknown",
    price_basis: "openai-standard-2026-09-10.uncached-estimate-not-billing",
    estimated_charge_usd_micros: usage
      ? Math.ceil(
          Number(usage.input_tokens) * 0.4 + Number(usage.output_tokens) * 1.6,
        )
      : null,
    live_activation: true,
  };
}
export function liveFailure(input: Obj, status = "outcome_uncertain"): Obj {
  return immutableJson(liveFields(input, comparisonFailure(input, status)));
}
export function liveResponse(input: Obj, raw: unknown): Obj {
  const result = liveFields(input, comparisonResponse(input, raw));
  assertValidInvestigationV3Contract("evidence", result);
  return immutableJson(result);
}
export function validateLiveEvidence(input: Obj, value: unknown): Obj {
  assertValidInvestigationV3Contract("evidence", value);
  ensure(
    value.raw_response !== null ||
      [
        "invalid_response",
        "unavailable",
        "timeout_uncertain",
        "outcome_uncertain",
      ].includes(String(value.status)),
    "WORK_INTEGRITY",
    "No response cannot establish a result",
  );
  const expected =
    value.raw_response === null
      ? { ...liveFailure(input, String(value.status)) }
      : { ...liveResponse(input, value.raw_response) };
  if (
    value.raw_response === null &&
    value.status === "invalid_response" &&
    Number(value.response_bytes) > 65536
  ) {
    expected.response_bytes = value.response_bytes;
    expected.raw_response_hash = value.raw_response_hash;
  }
  ensure(
    canonicalJson(expected) === canonicalJson(value),
    "WORK_INTEGRITY",
    "Live attribution, request, usage or interpretation changed",
  );
  return immutableJson(value);
}
export function liveResult(input: Obj, evidence: Obj): Obj | null {
  validateLiveEvidence(input, evidence);
  if (evidence.proposal === null) return null;
  const baseline = prepareDisposition({
    ...input,
    schema_version: "preparation-worker-input.v2",
  });
  return immutableJson({
    ...baseline,
    schema_version: "disposition-preparation-result.v5",
    title: "Unreviewed comparison proposal — scoped preparation only",
    execution_facts: { ...o(baseline.execution_facts), model_calls: 1 },
    investigation: evidence,
  });
}
