import { fixtureManifest } from "./investigation-fixtures.mjs";
import { createHash } from "node:crypto";
export const effortFields = [
  "preparation_seconds",
  "review_seconds",
  "correction_seconds",
  "verification_seconds",
  "follow_up_seconds",
  "founder_support_seconds",
  "setup_seconds",
];
export const costFields = [
  "model_usd",
  "tool_usd",
  "infrastructure_usd",
  "setup_usd",
  "human_usd",
  "founder_support_usd",
];
export function blindedPacket(id, invocation, sources, label) {
  const result = invocation?.result;
  // Keep actual text verbatim. Hide producer metadata, never improve the answer.
  const output =
    result?.investigation?.proposal ??
    (result
      ? {
          packet: Object.fromEntries(
            Object.entries(result).filter(
              ([k]) =>
                ![
                  "schema_version",
                  "title",
                  "execution_facts",
                  "investigation",
                  "invocation_id",
                  "started_entry_hash",
                  "binding_hash",
                  "versions",
                  "hash",
                ].includes(k),
            ),
          ),
        }
      : null);
  return {
    schema_version: "comparison-review-export.v1",
    fixture: id,
    output_label: label,
    status: result
      ? "output_available"
      : invocation
        ? invocation.terminal_entry_hash
          ? "failed"
          : "open"
        : "not_run",
    outcome: invocation?.outcome ?? null,
    output,
    sources,
    semantic_correctness: "not_established",
    review: {
      completeness: null,
      relevance: null,
      actionability: null,
      abstention: null,
      serious_errors: null,
      reviewer: null,
      reviewed_at: null,
    },
    effort: Object.fromEntries(effortFields.map((k) => [k, null])),
    costs: Object.fromEntries(costFields.map((k) => [k, null])),
    unknown_is_not_zero: true,
  };
}
export const blindLabel = (seed, id, arm) =>
  "output-" +
  createHash("sha256")
    .update(`${seed}/${id}/${arm}`)
    .digest("hex")
    .slice(0, 16);
export function comparisonCallPlan() {
  return {
    schema_version: "comparison-call-plan.v1",
    model: "gpt-4.1-mini-2025-04-14",
    tokenizer_candidate: "tiktoken 0.12.0 / o200k_base",
    tokenizer_admission:
      "12,000 serialized UTF-8 bytes plus 4,000 framing allowance; exact tokenizer confirmation remains an activation prerequisite",
    arms: [
      { arm: "deterministic", records: 24, provider_calls: 0 },
      { arm: "bounded_investigation", records: 24, provider_calls: 24 },
      { arm: "generic_assistant", records: 24, provider_calls: 24 },
    ],
    total_planned_calls: 48,
    slots: fixtureManifest.cases.flatMap((c) =>
      ["bounded_investigation", "generic_assistant"].map((arm) => ({
        fixture: c.id,
        arm,
        key: `comparison-v2-${c.id}-${arm}`,
      })),
    ),
    automatic_retries: 0,
    fresh_retry_slots: 0,
    input_token_ceiling: 16000,
    output_token_ceiling: 2000,
    per_call_price_ceiling_usd: 0.0096,
    total_price_ceiling_usd: 0.4608,
    per_call_reservation_usd_minor: 2,
    total_reservation_usd_minor: 96,
    uncertain_outcomes: "full reservation retained; no refund or reissue",
    durable_store:
      "existing preparation_work_journal; one shared synthetic-comparison-v2 batch across both arms and all Cases",
    activation: "unapproved",
    comparisons_run: false,
  };
}
