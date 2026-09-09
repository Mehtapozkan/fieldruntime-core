// Offline derived report only. The existing runtime validates/replays all evidence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import {
  canonicalJson,
  sha256Json,
} from "../../dist/packages/contracts/src/index.js";
import {
  validateWorkExport,
  readWork,
  syntheticWorkContext,
} from "../../dist/packages/runtime/src/preparation-work.js";
import { readDiscovery } from "../../dist/packages/runtime/src/discovery.js";

const RULES = "challenge-report.v1";
const prepared = (a) =>
  ["prepared_gap_packet", "prepared_packet", "abstained"].includes(a.outcome);
const unique = (xs) => [...new Set(xs)].sort();
const sum = (xs, f) => xs.filter(f).length;
const hash = (v) => ({ ...v, hash: sha256Json(v) });

export function summarize(rows) {
  const attempts = rows.flatMap((r) => r.attempts);
  return {
    retained_records: rows.length,
    attached_cases: unique(rows.flatMap((r) => r.case_ids)).length,
    worker_scope_records: sum(rows, (r) => r.valid && r.worker_scope),
    attached_worker_scope_records: sum(
      rows,
      (r) => r.valid && r.worker_scope && r.case_ids.length > 0,
    ),
    worker_scope_cases: unique(
      rows.filter((r) => r.valid && r.worker_scope).flatMap((r) => r.case_ids),
    ).length,
    snapshot_startable_cases: unique(
      rows.filter((r) => r.snapshot_can_start).flatMap((r) => r.case_ids),
    ).length,
    snapshot_startable_records: sum(rows, (r) => r.snapshot_can_start),
    records_ever_prepared: sum(rows, (r) => r.attempts.some(prepared)),
    records_ever_task_accepted: sum(rows, (r) =>
      r.attempts.some((a) => prepared(a) && a.review_decision === "approve"),
    ),
    invocation_attempts: attempts.length,
    prepared_attempts: sum(attempts, prepared),
    accepted_packets: sum(
      attempts,
      (a) => prepared(a) && a.review_decision === "approve",
    ),
    latest_record_states: rows.reduce(
      (a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
      {},
    ),
    population_denominator: null,
    exception_rate: null,
    newly_attended_records: null,
  };
}
const measures = {
  cash_collected: "currency_minor",
  disputes_resolved: "records",
  credits_issued: "currency_minor",
  work_newly_attended_to: "records",
  human_attention_released: "person_minutes",
  cost_model_tool: "currency_minor",
  cost_infrastructure: "currency_minor",
  cost_human: "currency_minor",
  cost_support: "currency_minor",
  cost_setup: "currency_minor",
};
export function proofMeasures(entries) {
  return Object.entries(measures).map(([measure, unit]) => ({
    measure,
    unit: measure.startsWith("cost_")
      ? "per observation: currency_minor or person_minutes"
      : unit,
    aggregate_value: null,
    status: "unestablished",
    reason:
      "Retained synthetic notes are attributed reports, not independently reconciled business proof. Coverage, unique outcome identities and non-overlap are not established; no cross-note sum.",
    observations: entries.filter(
      (e) => e.event === "proof_note" && e.command.note.measure === measure,
    ),
  }));
}

// Bind the actual built interpreter, not just a human-readable version label.
export async function reportImplementation() {
  const root = new URL("../../dist/packages/", import.meta.url);
  const files = (await readdir(root, { recursive: true }))
    .filter((p) => /\.(js|json)$/.test(p))
    .sort();
  const parts = await Promise.all(
    files.map(async (p) => [
      p,
      createHash("sha256")
        .update(await readFile(new URL(p, root)))
        .digest("hex"),
    ]),
  );
  parts.push([
    "scripts/lib/challenge-report.mjs",
    createHash("sha256")
      .update(await readFile(new URL(import.meta.url)))
      .digest("hex"),
  ]);
  return {
    rules: RULES,
    digest: sha256Json(parts),
    node: process.versions.node,
    tz: process.versions.tz,
    profile_hash: sha256Json(syntheticWorkContext()),
  };
}

export async function buildReport(archive, manifest) {
  assert.deepEqual(Object.keys(manifest).sort(), [
    "archive_hash",
    "cohort",
    "evaluated_at",
    "schema_version",
  ]);
  assert.equal(manifest.schema_version, "challenge-input.v1");
  assert.equal(manifest.cohort, "all_retained_records");
  assert.equal(manifest.archive_hash, archive.hash, "Archive binding changed");
  assert.equal(
    new Date(manifest.evaluated_at).toISOString(),
    manifest.evaluated_at,
  );
  const state = validateWorkExport(archive),
    intake = state.pack.discovery.intake;
  const times = [
    ...intake.bundles.flatMap((b) => [b.ingested_at, b.retained_at]),
    ...intake.commits.map((e) => e.recorded_at),
    ...(intake.requestBindings ?? []).map((e) => e.recorded_at),
    ...intake.cases.cases.flatMap((c) => c.journal.map((e) => e.recorded_at)),
    ...state.pack.discovery.entries.map((e) => e.recorded_at),
    ...state.pack.entries.map((e) => e.recorded_at),
    ...state.entries.map((e) => e.recorded_at),
  ];
  assert.ok(
    times.every((t) => typeof t === "string" && t <= manifest.evaluated_at),
    "Evaluation predates retained evidence",
  );
  const variants = new Map();
  for (const [bi, bundle] of intake.bundles.entries())
    for (const [ri, record] of bundle.records.entries()) {
      const all = variants.get(record.record_key) ?? [];
      all.push({
        record,
        bundle_id: bundle.id,
        pointer: `/pack/discovery/intake/bundles/${bi}/records/${ri}`,
      });
      variants.set(record.record_key, all);
    }
  const records = [];
  for (const [record_key, material] of [...variants].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const commits = intake.commits.filter((e) => e.record_key === record_key);
    const case_ids = unique(commits.map((e) => e.case_id));
    const committed = commits.at(-1);
    const selected = committed
      ? material.find((v) => v.bundle_id === committed.selection.bundle_id)
      : material.length === 1
        ? material[0]
        : null;
    const views = case_ids.map((id) =>
      readWork(state, id, record_key, manifest.evaluated_at),
    );
    // Preserve per-Case sequence. Equal wall times never choose between Cases.
    const attempts = views.flatMap((v) =>
      v.invocations.map((run) => {
        const start = state.entries.find(
          (e) => e.hash === run.started_entry_hash,
        );
        const terminal = state.entries.find(
          (e) => e.hash === run.terminal_entry_hash,
        );
        return {
          ...run,
          case_id: v.case_id,
          sequence: start.sequence,
          recorded_at: start.recorded_at,
          review_decision: run.review?.command.decision ?? null,
          start_receipt: start,
          terminal_receipt: terminal ?? null,
          sources: v.sources,
          interpretation: "snapshot-only; not live permission",
        };
      }),
    );
    const last = case_ids.length <= 1 ? attempts.at(-1) : null;
    let status = "not_prepared";
    if (material.every((v) => !v.record.valid))
      status = "invalid_retained_input";
    else if (case_ids.length > 1 || (!selected && material.length > 1))
      status = "incomplete_multiple_bindings";
    else if (last)
      status = prepared(last)
        ? ({
            approve: "task_accepted",
            reject: "task_rejected",
            modify: "modification_requested",
            escalate: "escalated",
          }[last.review_decision] ?? "awaiting_review")
        : last.outcome;
    const record = selected?.record;
    const brief = selected?.record.valid
      ? readDiscovery(
          state.pack.discovery,
          selected.bundle_id,
          record_key,
          case_ids.length === 1 ? case_ids[0] : null,
        )
      : null;
    const snapshot_can_start =
      views.length === 1 && views[0].current.can_start === true && !!selected;
    const next_action =
      status === "incomplete_multiple_bindings"
        ? "Inspect each source/Case binding; no combined current-state claim is available."
        : !case_ids.length
          ? "Inspect retained material and explicitly attach the selected record to a Case."
          : last?.can_interrupt
            ? "Return to the pending invocation; inspect or explicitly interrupt it."
            : last?.can_accept
              ? "Inspect this packet and record a task-usefulness decision in the Workbench."
              : last?.review_decision === "approve"
                ? "A person must confirm evidence access, governing terms and the accountable business owner. Acceptance is task usefulness only."
                : snapshot_can_start
                  ? "Inspect current live inputs and explicitly prepare a fresh packet if useful."
                  : "Open the live Workbench to inspect the blocked prerequisites; refresh and review explicitly before acting.";
    records.push({
      record_key,
      case_ids,
      valid: material.every((v) => v.record.valid),
      worker_scope: material.every((v) => v.record.entity === "entity_north"),
      subject: record
        ? {
            entity: record.entity,
            record: record.source_record_id,
            customer: record.cells.customer_ref,
            invoice: record.cells.invoice_id,
            disputed_amount_minor: record.cells.amount_minor,
            currency: record.cells.currency,
          }
        : null,
      material,
      intake_receipts: commits,
      status,
      snapshot_can_start,
      snapshot_reasons: views.flatMap((v) => v.current.reasons),
      historical_acceptance_currently_usable_in_snapshot:
        last?.review_decision === "approve" ? last.current_usable : false,
      packet: last?.result ?? null,
      attempts,
      brief,
      missing_inputs: unique(
        material.flatMap((v) => v.record.measurement_gaps),
      ),
      accountable_owner: {
        confirmed: null,
        reported: record?.reported_owner ?? null,
        qualification: "source claim only; accountable owner unconfirmed",
      },
      governing_terms: {
        established: false,
        reason:
          "The bounded preparation does not establish a governing disposition rule.",
      },
      attention: last?.result
        ? last.result.evidence_checklist.map((item) => ({
            reason: ["not_supplied", "reports_missing"].includes(item.status)
              ? "MISSING_EVIDENCE"
              : "Reason unconfirmed",
            basis: item,
          }))
        : [
            {
              reason: ["failed", "interrupted"].includes(status)
                ? "SYSTEM_FAILURE"
                : "Reason unconfirmed",
              basis: { status, receipt: last?.terminal_entry_hash ?? null },
            },
          ],
      next_action,
      proposed_allocation:
        "Deterministic code can assemble scoped reports and an unsent request. A person must establish missing proof, governing terms and accountable ownership; no adaptive agent or consequential action is allocated.",
    });
  }
  return hash({
    schema_version: RULES,
    title: "Invoice-dispute Challenge — synthetic rehearsal",
    manifest,
    implementation: await reportImplementation(),
    evidence_scope:
      "Complete retained upload in this one export; exception-selected synthetic rehearsal, not a customer population or live authorization snapshot.",
    summary: summarize(records),
    records,
    case_states: intake.cases.cases.reduce(
      (counts, c) => ({
        ...counts,
        [c.document.case.state]: (counts[c.document.case.state] ?? 0) + 1,
      }),
      {},
    ),
    cases: intake.cases.cases.map((c) => ({
      case_id: c.case_id,
      document: c.document,
      journal: c.journal,
    })),
    upload_coverage: intake.bundles.map((b) => ({
      bundle_id: b.id,
      coverage: b.coverage,
      claims: b.claims,
    })),
    measures: proofMeasures(state.entries),
    effort: {
      preparation_person_minutes_per_accepted_packet: null,
      person_minutes_per_verified_business_outcome: null,
      verified_business_outcome_denominator: null,
      reason:
        "Complete preparation/review/correction/verification/support active effort and comparable baseline unavailable; no independently verified business outcomes in this export. No ratio inferred from timestamps or computation.",
    },
    comparisons: {
      manual: "not_run",
      generic_assistant: "not_run",
      customer_continuation: "not_run",
      ten_minute_target: "experiment_not_measured",
    },
    authority_granted: false,
    closure_permission: false,
  });
}

const esc = (v) =>
  String(v ?? "unknown")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const json = (v) => `<pre>${esc(JSON.stringify(v, null, 2))}</pre>`;
const disclosure = (label, v, id = "") =>
  `<details${id ? ` id="${esc(id)}"` : ""}><summary>${esc(label)}</summary>${json(v)}</details>`;
const citations = (ids = []) =>
  ids.map((id) => `<a href="#source-${esc(id)}">source</a>`).join(" · ");
export function renderReport(report, archive) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Challenge report</title><style>
body{max-width:1100px;margin:auto;padding:24px;background:#faf8f1;color:#242b28;font:16px/1.5 system-ui}h1,h2{line-height:1.2}a{color:#155744}a:focus,summary:focus{outline:3px solid #b45d15}section,details{background:#fff;padding:16px;margin:12px 0;border:1px solid #d9ded5;border-radius:8px}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 ui-monospace}table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;border-bottom:1px solid #ddd;padding:8px;overflow-wrap:anywhere}p{max-width:80ch}.skip{display:block}small{color:#4a554e}@media(max-width:600px){body{padding:12px}td,th{padding:5px;font-size:14px}section{padding:12px}#capacity thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}#capacity tr,#capacity td{display:block}#capacity tr{padding:12px 0;border-bottom:1px solid #d9ded5}#capacity td{border:0;font-size:16px}#capacity td:first-child{font-weight:600}#capacity td:nth-child(2)::before{content:"Recorded: ";font-weight:600}#capacity td:nth-child(3)::before{content:"Next: ";font-weight:600}}\n</style><body><a class="skip" href="#capacity">Skip to Operating Capacity Map</a><h1>${esc(report.title)}</h1>
<p>Demonstrated: explicit synthetic preparation and human task review. Proposed allocation is separate. This offline report grants no permission. Customer impact, cash, resolution and closure remain unproven.</p>
<p><a href="archive.json">Exact evidence archive</a> · <a href="manifest.json">Input manifest</a> · <a href="report.json">Calculated report</a></p>
${disclosure("Reproduction bindings and calculation rules", { hash: report.hash, manifest: report.manifest, implementation: report.implementation, evidence_scope: report.evidence_scope })}
<h2>Retained work and coverage</h2>${disclosure("Counts — Cases, records and attempts remain separate", report.summary)}
<p>${esc(report.summary.retained_records)} retained records; ${esc(report.summary.attached_cases)} attached Cases; ${esc(report.summary.records_ever_prepared)} records prepared across ${esc(report.summary.invocation_attempts)} attempts. ${esc(report.summary.accepted_packets)} packets task-accepted. Population coverage and newly attended work are unknown. Failed and open work remain included.</p><p>Recorded Case states: ${esc(
    Object.entries(report.case_states ?? {})
      .map(([state, count]) => `${count} ${state.replaceAll("_", " ")}`)
      .join(", "),
  )}. Task acceptance never establishes a resolved dispute or Case closure.</p>
<table id="capacity"><caption>Operating Capacity Map — demonstrated state / proposed next action</caption><thead><tr><th>Record</th><th>Recorded work</th><th>Next human action</th></tr></thead><tbody>${report.records.map((r, i) => `<tr><td><a href="#record-${i}">${esc(r.subject?.customer)} / ${esc(r.subject?.record)}</a></td><td>${esc(r.status.replaceAll("_", " "))}<br><small>${r.attempts.length} attempts · ${r.case_ids.length} Cases</small></td><td>${esc(r.next_action)}</td></tr>`).join("")}</tbody></table>
${report.records
  .map(
    (
      r,
      i,
    ) => `<section id="record-${i}"><h2>${esc(r.subject?.customer)} / ${esc(r.subject?.record)}</h2><p><strong>${esc(r.status.replaceAll("_", " "))}.</strong> ${esc(r.next_action)}</p><p>Accountable owner: unconfirmed${r.accountable_owner?.reported ? ` (queue reports ${esc(r.accountable_owner.reported)})` : ""}. Governing terms: not established. Missing confirmation does not prove non-delivery or justify credit.</p>
${r.packet ? `<h3>Actual unsent follow-up</h3><p>${esc(r.packet.follow_up.draft)}</p><ul>${r.packet.evidence_checklist.map((e) => `<li>${esc(e.subject.id)}: ${esc(e.finding)} ${citations(e.citation_ids)}</li>`).join("")}</ul>` : "<p>No latest completed packet is being presented for this record.</p>"}
<p><small>Historical task acceptance still applicable under the reconstructed snapshot: ${esc(r.historical_acceptance_currently_usable_in_snapshot)}. Check the live Workbench before acting.</small></p>
${disclosure("Why attention is needed, missing inputs and proposed allocation", { attention: r.attention, missing_inputs: r.missing_inputs, proposed_allocation: r.proposed_allocation, snapshot_reasons: r.snapshot_reasons })}
${disclosure("Source versions, exact Case attachments and descriptive findings", { material: r.material, intake_receipts: r.intake_receipts, brief: r.brief })}
${r.attempts.map((a) => disclosure(`Attempt ${a.sequence}: ${a.outcome}; review ${a.review_decision ?? "not recorded"} — ${a.recorded_at}`, a, `attempt-${a.invocation_id}`)).join("")}</section>`,
  )
  .join("")}
<h2>Five separate proof measures</h2><p>All aggregate measures remain unestablished. Retained notes below are synthetic reports; negative values, reversals, reopens and overlapping contributions are preserved without adding them together. A simulated credit is not cash collected.</p>
<table><tr><th>Measure / unit</th><th>Evidence and coverage</th></tr>${report.measures
    .slice(0, 5)
    .map(
      (m) =>
        `<tr><td>${esc(m.measure.replaceAll("_", " "))}<br>${esc(m.unit)}</td><td>Unknown aggregate · ${m.observations.length} retained notes${disclosure("Inspect attributed observations and corrections", m)}</td></tr>`,
    )
    .join("")}</table>
${disclosure("Preparation effort versus verified outcome effort; costs and comparisons not run", { effort: report.effort, costs: report.measures.slice(5), comparisons: report.comparisons })}
${disclosure("Upload coverage claims and Case histories", { upload_coverage: report.upload_coverage, cases: report.cases })}
<h2>Cited sources</h2>${[...new Map(report.records.flatMap((r) => r.attempts.flatMap((a) => a.sources)).map((s) => [s.id, s])).values()].map((s) => disclosure(`${s.name} — ${s.interpretation}`, s, `source-${s.id}`)).join("")}
${disclosure("Exact immutable evidence archive (also downloadable above)", archive)}
</body></html>`;
}
export const reportJson = (v) => canonicalJson(v) + "\n";
