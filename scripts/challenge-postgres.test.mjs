import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import { intakeInput, editQueue } from "../tests/helpers/intake.mjs";
import {
  discoveryPath,
  reviewPath,
  discoveryCommand,
} from "../tests/helpers/discovery.mjs";
import {
  publication,
  start,
  WORK,
  PACK,
} from "../tests/helpers/preparation-work.mjs";
import { fixedPreparationPort } from "../dist/packages/runtime/src/preparation-worker-port.js";
import { prepareDisposition } from "../dist/packages/runtime/src/disposition-preparation.js";
import { sha256Json } from "../dist/packages/contracts/src/index.js";
import {
  buildReport,
  renderReport,
  reportJson,
} from "./lib/challenge-report.mjs";

const AT = "2026-09-07T16:05:00.000Z",
  POST = `${WORK}/commands`;
const review = (v, decision, key) => ({
  schema_version: "preparation-task-review.v1",
  operation: "task_review",
  purpose: "preparation_usefulness",
  invocation_id: v.invocations.at(-1).invocation_id,
  result_hash: v.invocations.at(-1).result_hash,
  expected_work_revision: v.work_revision,
  expected_work_head: v.work_head,
  decision,
  reason:
    "Synthetic rehearsal: evaluate packet usefulness only; ownership and governing terms still unknown",
  idempotency_key: key,
});

// One test-host fixture, not a fault endpoint or another runner. All data is synthetic.
test("D13 Challenge: real API rehearsal, exact retries, failed/open work, reproducible restart export and read-only report", async (t) => {
  const h = await intakeHost(t, { work: true });
  let tick = 0;
  h.setWorkMonotonic(() => ++tick); // Fixture timing, explicitly not a performance measurement.
  const input = editQueue(
    await intakeInput("challenge-input"),
    (rows, headers) => {
      const base = rows[0];
      return {
        headers,
        rows: Array.from({ length: 8 }, (_, i) => ({
          ...base,
          source_record_id: `challenge-${i + 1}`,
          customer_ref: i < 2 ? "Orchid" : "Cedar",
          invoice_id: i < 2 ? "INV-101" : `INV-${201 + i}`,
          amount_minor: String(i === 0 ? 1500000 : (i + 1) * 250000),
          legal_entity_id: i === 7 ? "entity_south" : "entity_north",
          delivery_ids: `DEL-${4 + i}`,
          upstream_case_id: i < 2 ? "CHALLENGE-1" : `CHALLENGE-${i + 1}`,
          upstream_owner: i < 2 ? "Taylor" : "",
        })),
      };
    },
  );
  input.artifacts = input.artifacts.slice(0, 1);
  for (const [i, supplied] of [
    [1, true],
    [2, true],
    [2, false],
  ])
    input.artifacts.push({
      role: "support",
      document_id: `note-${i}-${supplied}`,
      name: `delivery-${i}-${supplied}.txt`,
      media_type: "text/plain",
      bytes_base64: Buffer.from(
        `Delivery confirmation for DEL-${4 + i} is ${supplied ? "" : "not "}supplied.\n`,
      ).toString("base64"),
      declared_hash: null,
      associations: [
        { entity: "entity_north", kind: "record", id: `challenge-${i + 1}` },
      ],
    });
  let v = await h.prepare(input);
  const targets = [];
  const caseVersions = new Map();
  for (const i of [0, 1, 2, 3, 4, 5, 7]) {
    v = await h.ok(`/v1/intake/bundles/${v.bundle.id}`);
    const prior =
      i === 1 ? targets[0] : [3, 4, 5].includes(i) ? targets[2] : null;
    const target = prior
      ? {
          mode: "attach",
          case_id: prior.case_id,
          expected_case_version: caseVersions.get(prior.case_id),
        }
      : { mode: "create", expected_case_version: 0 };
    const receipt = (
      await h.ok(
        "/v1/intake/commits",
        await h.selection(v, i, { target, key: `commit-${i}` }),
      )
    ).receipt;
    caseVersions.set(receipt.case_id, receipt.case_version);
    targets[i] = {
      ...receipt,
      path: `${WORK}?case_id=${receipt.case_id}&record_key=${receipt.record_key}`,
      packPath: `${PACK}?bundle_id=${v.bundle.id}&record_key=${receipt.record_key}&case_id=${receipt.case_id}`,
    };
  }
  for (const i of [0, 1, 2, 3, 4, 5]) {
    const brief = await h.ok(discoveryPath(v, targets[i].case_id, i));
    await h.ok(
      reviewPath(v),
      discoveryCommand(brief, `confirm-${i}`, "confirm"),
    );
  }
  const invoke = async (i, key) => {
    const pack = await h.ok(targets[i].packPath);
    if (pack.candidate_hash !== pack.selected_artifact_hash)
      await h.ok(
        `${PACK}/selections/publication`,
        publication(pack, `publish-${key}`),
      );
    const cmd = start(await h.ok(targets[i].path), key);
    return { cmd, receipt: await h.ok(POST, cmd) };
  };
  console.log("D13: intake and descriptive review retained");
  const first = await invoke(0, "prepare-a1");
  await h.ok(POST, review(await h.ok(targets[0].path), "approve", "accept-a1"));
  await invoke(0, "prepare-a2");
  await h.ok(POST, review(await h.ok(targets[0].path), "approve", "accept-a2"));
  await invoke(1, "prepare-b");
  await h.ok(POST, review(await h.ok(targets[1].path), "reject", "reject-b"));
  await invoke(2, "prepare-c");
  const template = JSON.parse(
    await readFile(
      new URL("../docs/examples/d12-proof-note.v1.json", import.meta.url),
      "utf8",
    ),
  );
  const addNote = async (measure, key, changes = {}) => {
    const view = await h.ok(targets[2].path),
      run = view.invocations.at(-1);
    const monetary =
      ["cash_collected", "credits_issued"].includes(measure) ||
      measure.startsWith("cost_");
    return h.ok(POST, {
      schema_version: "preparation-proof-note.v1",
      operation: "proof_note",
      purpose: "synthetic_measurement_readiness",
      invocation_id: run.invocation_id,
      binding_hash: sha256Json(run.binding),
      result_hash: run.result_hash,
      expected_work_revision: view.work_revision,
      expected_work_head: view.work_head,
      idempotency_key: key,
      reason: "Synthetic readiness only; no real customer outcome",
      note: {
        ...template,
        measure,
        unit: monetary
          ? "currency_minor"
          : measure === "human_attention_released"
            ? "person_minutes"
            : "records",
        currency: monetary ? "USD" : null,
        treatment:
          measure === "cost_setup"
            ? "one_time"
            : measure.startsWith("cost_")
              ? "recurring"
              : "not_applicable",
        ...changes,
      },
    });
  };
  const notes = {};
  for (const m of [
    "cash_collected",
    "disputes_resolved",
    "credits_issued",
    "work_newly_attended_to",
    "human_attention_released",
    "cost_setup",
  ])
    notes[m] = await addNote(m, `unknown-${m}`);
  await addNote("human_attention_released", "negative-attention", {
    value: -5,
    qualification: "measured",
    baseline_person_minutes: 10,
    actual_person_minutes: 15,
    source: {
      kind: "active_effort_comparison",
      reference: "synthetic scripted rehearsal values",
      locator: "not measured customer effort",
      observed_at: AT,
    },
    coverage: {
      numerator: 1,
      denominator: 8,
      exclusions: "Other records lack active-effort observations",
    },
    supersedes_entry_hash: notes.human_attention_released.entry.hash,
    overlap_entry_hashes: [notes.human_attention_released.entry.hash],
  });
  await addNote("disputes_resolved", "reopen-unknown", {
    reversal_of_entry_hash: notes.disputes_resolved.entry.hash,
    reopens_entry_hash: notes.disputes_resolved.entry.hash,
  });
  console.log("D13: reviewed packets and proof notes retained");
  h.setWorkPort(() => {
    throw new Error("synthetic worker unavailable");
  });
  await invoke(3, "prepare-failed");
  const gate = () => {
    let finish, entered;
    const ready = new Promise((r) => {
      entered = r;
    });
    h.setWorkPort((input) => ({
      completion: new Promise((r) => {
        finish = () => r(prepareDisposition(input));
        entered();
      }),
      cancel() {},
    }));
    return { ready, finish: () => finish() };
  };
  const g = gate(),
    interrupting = invoke(4, "prepare-interrupted");
  await g.ready;
  const iv = await h.ok(targets[4].path);
  await h.ok(POST, {
    schema_version: "preparation-interruption.v1",
    operation: "interrupt",
    invocation_id: iv.current.pending_invocation,
    expected_work_revision: iv.work_revision,
    expected_work_head: iv.work_head,
    reason: "Explicit synthetic interruption; late output must stay fenced",
    idempotency_key: "interrupt-e",
  });
  g.finish();
  await interrupting;
  h.setWorkPort(fixedPreparationPort);
  await h.ok(
    `${PACK}/selections/publication`,
    publication(await h.ok(targets[5].packPath), "publish-open"),
  );
  const openCommand = start(await h.ok(targets[5].path), "prepare-open");
  h.fault({ tag: "INSERT INTO preparation_work_journal", remaining: 2 });
  assert.equal((await h.call(POST, openCommand)).status, 500);
  assert.equal(
    (await h.ok(targets[5].path)).invocations.at(-1).outcome,
    "started",
  );
  // Capture a genuinely pending invocation; do not forge a terminal event.
  console.log("D13: failed, interrupted and unfinished attempts retained");
  const before = await h.snapshot();
  h.trace.length = 0;
  const archive = await h.ok(targets[0].path + "&representation=export");
  assert.ok(
    !h.trace.some((sql) =>
      /FOR UPDATE|INSERT|UPDATE runtime_writer_lock/.test(sql),
    ),
  );
  const manifest = {
    schema_version: "challenge-input.v1",
    archive_hash: archive.hash,
    evaluated_at: AT,
    cohort: "all_retained_records",
  };
  const report = await buildReport(archive, manifest);
  assert.deepEqual(
    await h.snapshot(),
    before,
    "Report/export must not write canonical history",
  );
  assert.deepEqual(report.summary, {
    retained_records: 8,
    unidentified_source_rows: 0,
    attached_cases: 3,
    worker_scope_records: 7,
    attached_worker_scope_records: 6,
    worker_scope_cases: 2,
    snapshot_startable_cases: 0,
    snapshot_startable_records: 0,
    records_ever_prepared: 3,
    records_ever_task_accepted: 1,
    invocation_attempts: 7,
    prepared_attempts: 4,
    accepted_packets: 2,
    latest_record_states: report.summary.latest_record_states,
    population_denominator: null,
    exception_rate: null,
    newly_attended_records: null,
  });
  assert.deepEqual(
    Object.values(report.summary.latest_record_states).sort(),
    [1, 1, 1, 1, 1, 1, 2],
  );
  assert.equal(
    report.records.find((r) => r.subject?.record === "challenge-3").packet
      .evidence_checklist[0].status,
    "conflicting",
  );
  assert.ok(
    report.records
      .find((r) => r.subject?.record === "challenge-1")
      .attempts.every((a) => a.result.subject.record_id === "challenge-1"),
  );
  assert.ok(report.measures.every((m) => m.aggregate_value === null));
  assert.equal(
    report.measures
      .find((m) => m.measure === "human_attention_released")
      .observations.at(-1).command.note.value,
    -5,
  );
  assert.equal(report.authority_granted, false);
  assert.equal(report.closure_permission, false);
  const bytes = reportJson(report);
  assert.equal(reportJson(await buildReport(archive, manifest)), bytes);
  const changed = structuredClone(archive);
  changed.entries[0].record_key = "forged";
  await assert.rejects(() => buildReport(changed, manifest));
  await assert.rejects(() =>
    buildReport(archive, { ...manifest, archive_hash: "sha256:wrong" }),
  );
  await assert.rejects(() =>
    buildReport(archive, {
      ...manifest,
      evaluated_at: "2026-09-07T16:04:59.000Z",
    }),
  );
  await assert.rejects(() =>
    buildReport(archive, { ...manifest, accepted_packets: 100 }),
  );
  // Exact old retry during a different record's pending run is still its receipt.
  assert.deepEqual(await h.ok(POST, first.cmd), first.receipt);
  assert.deepEqual(await h.snapshot(), before);
  // A restart leaves the committed open invocation, then the old completion is fenced.
  await h.restart();
  assert.deepEqual(await h.ok(POST, first.cmd), first.receipt);
  const recovered = await h.ok(targets[0].path + "&representation=export");
  assert.deepEqual(recovered, archive);
  assert.equal(reportJson(await buildReport(recovered, manifest)), bytes);
  assert.equal(
    (await h.ok(targets[5].path)).invocations.at(-1).outcome,
    "started",
  );
  if (process.env.D13_REPORT_DIR) {
    const dir = resolve(process.env.D13_REPORT_DIR);
    await mkdir(dir, { recursive: true });
    for (const [name, contents] of Object.entries({
      "archive.json": reportJson(archive),
      "manifest.json": reportJson(manifest),
      "report.json": bytes,
      "report.html": renderReport(report, archive),
    }))
      await writeFile(resolve(dir, name), contents);
  }
  await t.test(
    "D13 report: desktop/390px source disclosures, keyboard route and no overflow",
    async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent(renderReport(report, archive));
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(
            await page
              .getByRole("heading", {
                name: "Invoice-dispute Challenge — synthetic rehearsal",
              })
              .count(),
            1,
          );
          assert.equal(await page.locator("#capacity tbody tr").count(), 8);
          assert.ok(
            (await page
              .getByText("Actual unsent follow-up", { exact: true })
              .count()) >= 2,
          );
          assert.equal(
            await page.evaluate(
              () =>
                globalThis.document.documentElement.scrollWidth <=
                globalThis.innerWidth,
            ),
            true,
          );
          if (width === 390)
            assert.ok(
              (
                await page
                  .locator("#capacity tbody tr")
                  .first()
                  .locator("td")
                  .last()
                  .boundingBox()
              ).width > 300,
            );
          if (process.env.D13_REPORT_DIR)
            await page.screenshot({
              path: resolve(process.env.D13_REPORT_DIR, `report-${width}.png`),
              fullPage: true,
            });
        }
        await page.locator(".skip").focus();
        await page.keyboard.press("Enter");
        assert.ok(page.url().endsWith("#capacity"));
        const source = page
          .getByRole("link", { name: "source", exact: true })
          .first();
        const href = await source.getAttribute("href");
        await source.click();
        const id = href.slice(1);
        const disclosure = page.locator(`[id="${id}"]`);
        await disclosure.locator("summary").focus();
        await page.keyboard.press("Enter");
        assert.equal(await disclosure.getAttribute("open"), "");
        assert.match(await disclosure.innerText(), /artifact_hash/);
      } finally {
        await browser.close();
      }
    },
  );
  t.diagnostic(
    JSON.stringify({
      hash: report.hash,
      summary: report.summary,
      read_only: true,
      restart_reproduced: true,
      unexpected_acceptance: false,
    }),
  );
});

test("D13 API export retains unidentified rows without fabricating record coverage", async (t) => {
  const h = await intakeHost(t, { work: true });
  const input = editQueue(
    await intakeInput("unidentified-api"),
    (rows, headers) => ({
      headers,
      rows: [
        rows[0],
        { ...rows[0], source_record_id: "" },
        { ...rows[0], source_record_id: "" },
      ],
    }),
  );
  const v = await h.prepare(input);
  const receipt = (
    await h.ok(
      "/v1/intake/commits",
      await h.selection(v, 0, { key: "commit-valid-row" }),
    )
  ).receipt;
  const path = `${WORK}?case_id=${receipt.case_id}&record_key=${receipt.record_key}&representation=export`;
  const before = await h.snapshot(),
    archive = await h.ok(path);
  const manifest = {
    schema_version: "challenge-input.v1",
    archive_hash: archive.hash,
    evaluated_at: AT,
    cohort: "all_retained_records",
  };
  const r = await buildReport(archive, manifest);
  assert.equal(r.summary.retained_records, 1);
  assert.equal(r.summary.unidentified_source_rows, 2);
  assert.equal(r.summary.invocation_attempts, 0);
  assert.equal(r.summary.snapshot_startable_records, 0);
  assert.equal(r.unidentified_material.length, 2);
  assert.deepEqual(await h.snapshot(), before);
  await h.restart();
  assert.deepEqual(await h.ok(path), archive);
});
