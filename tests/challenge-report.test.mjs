import assert from "node:assert/strict";
import test from "node:test";
import {
  summarize,
  proofMeasures,
  renderReport,
} from "../scripts/lib/challenge-report.mjs";

test("D13 unique records, Cases and attempts; an old accepted packet cannot label a newer failed attempt accepted", () => {
  const rows = [
    {
      record_key: "a",
      case_ids: ["case"],
      valid: true,
      worker_scope: true,
      attempts: [
        {
          invocation_id: "a1",
          outcome: "prepared_gap_packet",
          review_decision: "approve",
        },
        { invocation_id: "a2", outcome: "failed", review_decision: null },
      ],
      status: "failed",
      snapshot_can_start: false,
    },
    {
      record_key: "b",
      case_ids: ["case"],
      valid: true,
      worker_scope: true,
      attempts: [
        {
          invocation_id: "b1",
          outcome: "prepared_gap_packet",
          review_decision: null,
        },
      ],
      status: "awaiting_review",
      snapshot_can_start: true,
    },
    {
      record_key: "c",
      case_ids: [],
      valid: true,
      worker_scope: false,
      attempts: [],
      status: "not_prepared",
      snapshot_can_start: false,
    },
  ];
  assert.deepEqual(summarize(rows), {
    retained_records: 3,
    attached_cases: 1,
    worker_scope_records: 2,
    attached_worker_scope_records: 2,
    worker_scope_cases: 1,
    snapshot_startable_cases: 1,
    snapshot_startable_records: 1,
    records_ever_prepared: 2,
    records_ever_task_accepted: 1,
    invocation_attempts: 3,
    prepared_attempts: 2,
    accepted_packets: 1,
    latest_record_states: { failed: 1, awaiting_review: 1, not_prepared: 1 },
    population_denominator: null,
    exception_rate: null,
    newly_attended_records: null,
  });
});
test("D13 separate measures preserve negative, reversal, reopen, overlap and unknowns without summing claims", () => {
  const notes = [
    {
      hash: "old",
      event: "proof_note",
      command: { note: { measure: "cash_collected", value: 0 } },
    },
    {
      hash: "new",
      event: "proof_note",
      command: {
        note: {
          measure: "cash_collected",
          value: -100,
          reversal_of_entry_hash: "old",
        },
      },
    },
    {
      hash: "attention",
      event: "proof_note",
      command: {
        note: {
          measure: "human_attention_released",
          value: -5,
          overlap_entry_hashes: ["old"],
        },
      },
    },
    {
      hash: "reopen",
      event: "proof_note",
      command: {
        note: {
          measure: "disputes_resolved",
          value: null,
          reopens_entry_hash: "old",
        },
      },
    },
  ];
  const p = proofMeasures(notes);
  assert.equal(p.length, 10);
  assert.ok(p.every((m) => m.aggregate_value === null));
  assert.equal(
    p.find((m) => m.measure === "credits_issued").observations.length,
    0,
  );
  assert.deepEqual(
    p.find((m) => m.measure === "cash_collected").observations,
    notes.slice(0, 2),
  );
  assert.equal(
    p.find((m) => m.measure === "human_attention_released").observations[0]
      .command.note.value,
    -5,
  );
});
test("D13 presentation escapes source content and never installs scripts or external source links", () => {
  const html = renderReport(
    {
      hash: "test",
      summary: {},
      records: [],
      measures: [],
      title: "<script>bad()</script>",
    },
    {},
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});
