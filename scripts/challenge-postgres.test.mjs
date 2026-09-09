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
  const portableArchive = JSON.parse(reportJson(archive));
  const portable = await buildReport(
    portableArchive,
    JSON.parse(reportJson(manifest)),
  );
  assert.equal(reportJson(portable), bytes);
  assert.equal(
    renderReport(portable, portableArchive),
    renderReport(report, archive),
  );
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

test("D13 follow-through: supplied DEL-4 evidence requires fresh review, preserves history and grants no business outcome", async (t) => {
  const h = await intakeHost(t, { work: true });
  let tick = 0;
  h.setWorkMonotonic(() => ++tick); // Synthetic clock; no effort/performance measurement.
  const input = editQueue(
    await intakeInput("follow-through-before"),
    (rows, headers) => {
      rows[1].legal_entity_id = "entity_north";
      return { rows, headers };
    },
  );
  input.artifacts = input.artifacts.slice(0, 1);
  let v = await h.prepare(input);
  const first = (
    await h.ok(
      "/v1/intake/commits",
      await h.selection(v, 0, { key: "ft-attach-a" }),
    )
  ).receipt;
  v = await h.ok(`/v1/intake/bundles/${v.bundle.id}`);
  const second = (
    await h.ok(
      "/v1/intake/commits",
      await h.selection(v, 1, {
        key: "ft-attach-b",
        target: {
          mode: "attach",
          case_id: first.case_id,
          expected_case_version: first.case_version,
        },
      }),
    )
  ).receipt;
  const path = `${WORK}?case_id=${first.case_id}&record_key=${first.record_key}`;
  const packPath = (bundle) =>
    `${PACK}?bundle_id=${bundle.bundle.id}&record_key=${first.record_key}&case_id=${first.case_id}`;
  await h.ok(
    reviewPath(v),
    discoveryCommand(
      await h.ok(discoveryPath(v, first.case_id)),
      "ft-description-before",
      "confirm",
    ),
  );
  const p0 = await h.ok(packPath(v));
  await h.ok(
    `${PACK}/selections/publication`,
    publication(p0, "ft-publish-before"),
  );
  const command0 = start(await h.ok(path), "ft-start-before");
  const receipt0 = await h.ok(POST, command0);
  const review0 = review(await h.ok(path), "approve", "ft-accept-before");
  const accepted0 = await h.ok(POST, review0);
  const before = await h.ok(path);
  const run0 = before.invocations.at(-1);
  const delivery = (run, id) =>
    run.result.evidence_checklist.find((item) => item.subject.id === id);
  assert.equal(delivery(run0, "DEL-4").status, "not_supplied");
  assert.match(run0.result.follow_up.draft, /provide DEL-4 confirmation/);
  const archive0 = await h.ok(path + "&representation=export");
  const manifest = (archive, at) => ({
    schema_version: "challenge-input.v1",
    archive_hash: archive.hash,
    evaluated_at: at,
    cohort: "all_retained_records",
  });
  const report0 = await buildReport(archive0, manifest(archive0, AT));

  // A person supplies a new local note. This is not a connector fetch or sent request.
  const suppliedAt = "2026-09-07T16:06:00.000Z";
  h.setTime(suppliedAt);
  const supplied = structuredClone(input);
  supplied.idempotency_key = "follow-through-supplied";
  supplied.artifacts.push({
    role: "support",
    document_id: "del-4-supplied",
    name: "del-4-supplied.txt",
    media_type: "text/plain",
    bytes_base64: Buffer.from(
      "Delivery confirmation for DEL-4 is supplied.\n",
    ).toString("base64"),
    declared_hash: null,
    associations: [
      { entity: "entity_north", kind: "record", id: "dispute-17" },
    ],
  });
  const v1 = await h.prepare(supplied);
  const retained = await h.ok(path);
  assert.equal(retained.invocations[0].current_usable, false);
  const attach = await h.selection(v1, 0, {
    key: "ft-attach-supplied",
    target: {
      mode: "attach",
      case_id: first.case_id,
      expected_case_version: second.case_version,
    },
  });
  const attached = await h.ok("/v1/intake/commits", attach);
  assert.equal(attached.receipt.case_id, first.case_id);
  assert.ok(attached.receipt.case_version > second.case_version);
  const stale = await h.ok(path);
  const deniedSnapshot = await h.snapshot();
  const denied = await h.call(POST, {
    ...command0,
    idempotency_key: "ft-stale-start",
    expected_work_revision: stale.work_revision,
    expected_work_head: stale.work_head,
    replaces_invocation: run0.invocation_id,
  });
  assert.equal(denied.status, 409, JSON.stringify(denied.data));
  assert.deepEqual(await h.snapshot(), deniedSnapshot);
  assert.equal(stale.current.can_start, false);
  assert.equal(stale.invocations[0].current_usable, false);
  assert.deepEqual(stale.invocations[0].result, run0.result);
  assert.deepEqual(stale.invocations[0].review, run0.review);

  const freshBrief = await h.ok(discoveryPath(v1, first.case_id));
  const otherBrief = await h.ok(discoveryPath(v1, null, 1));
  assert.match(JSON.stringify(freshBrief.material), /DEL-4/);
  await h.ok(
    reviewPath(v1),
    discoveryCommand(freshBrief, "ft-description-after", "confirm"),
  );
  const described = await h.ok(path);
  assert.equal(
    described.current.can_start,
    false,
    "Description alone is not publication",
  );
  const p1 = await h.ok(packPath(v1));
  assert.notEqual(p1.candidate_hash, p0.candidate_hash);
  await h.ok(
    `${PACK}/selections/publication`,
    publication(p1, "ft-publish-after"),
  );
  const ready = await h.ok(path);
  assert.equal(ready.current.can_start, true);
  const command1 = start(ready, "ft-start-after");
  assert.equal(command1.replaces_invocation, run0.invocation_id);
  assert.equal(
    command1.binding.source_revision,
    command0.binding.source_revision,
    "Unchanged CSV row revision alone cannot bind newly supplied support",
  );
  assert.notEqual(
    command1.binding.basis.manifest.bundle_hash,
    command0.binding.basis.manifest.bundle_hash,
  );
  const beforeDenied = await h.snapshot();
  const blocked = await h.call(POST, command1);
  assert.equal(blocked.status, 400, JSON.stringify(blocked.data));
  assert.equal(blocked.data.error, "WORK_INPUT_LIMIT");
  assert.deepEqual(
    await h.snapshot(),
    beforeDenied,
    "Denied work creates no start or accepted packet",
  );
  const suppliedClaims = freshBrief.material.source_claims.filter(
    (claim) =>
      claim.applicable_record_key === first.record_key &&
      claim.subject.id === "DEL-4" &&
      claim.meaning === "source_reports_confirmation",
  );
  assert.ok(suppliedClaims.length > 0);
  assert.ok(
    suppliedClaims.every(
      (claim) =>
        claim.independently_verified === false &&
        claim.source_associations.some(
          (a) => a.kind === "record" && a.id === "dispute-17",
        ),
    ),
  );
  const cited = new Set(suppliedClaims.flatMap((claim) => claim.citation_ids));
  const sources = freshBrief.material.sources.filter((source) =>
    cited.has(source.id),
  );
  assert.ok(
    sources.some(
      (source) =>
        source.name === "del-4-supplied.txt" &&
        source.bundle_id === v1.bundle.id,
    ),
  );
  assert.equal(
    otherBrief.material.source_claims.filter(
      (claim) =>
        claim.applicable_record_key === second.record_key &&
        claim.meaning === "source_reports_confirmation",
    ).length,
    0,
    "DEL-4 evidence does not transfer to dispute-18 / DEL-5",
  );
  assert.equal(
    new Set(p1.candidate.sources.map((source) => source.bundle_id)).size,
    2,
  );
  const state = await h.snapshot();
  h.trace.length = 0;
  const archive1 = await h.ok(path + "&representation=export");
  const report1 = await buildReport(archive1, manifest(archive1, suppliedAt));
  assert.ok(
    !h.trace.some((sql) =>
      /FOR UPDATE|INSERT|UPDATE runtime_writer_lock/.test(sql),
    ),
  );
  assert.deepEqual(await h.snapshot(), state);
  assert.equal(report1.summary.retained_records, 2);
  assert.equal(report1.summary.attached_cases, 1);
  assert.equal(report1.summary.invocation_attempts, 1);
  assert.equal(report1.summary.records_ever_prepared, 1);
  assert.equal(report1.summary.newly_attended_records, null);
  assert.ok(
    report1.measures.every((measure) => measure.aggregate_value === null),
  );
  assert.equal(report1.authority_granted, false);
  assert.equal(report1.closure_permission, false);
  assert.deepEqual(report1.case_states, { detected: 1 });
  assert.ok(
    report1.cases.every(
      (entry) =>
        (entry.document.outcomes ?? []).length === 0 &&
        (entry.document.action_receipts ?? []).length === 0 &&
        (entry.document.action_proposals ?? []).length === 0,
    ),
  );
  assert.deepEqual(
    archive1.entries.slice(0, archive0.entries.length),
    archive0.entries,
  );
  assert.equal(
    reportJson(await buildReport(archive0, manifest(archive0, AT))),
    reportJson(report0),
  );
  await h.restart();
  for (const [url, command, receipt] of [
    [POST, command0, receipt0],
    [POST, review0, accepted0],
    ["/v1/intake/commits", attach, attached],
  ])
    assert.deepEqual(await h.ok(url, command), receipt);
  assert.deepEqual(await h.snapshot(), state);
  assert.deepEqual(await h.ok(path + "&representation=export"), archive1);
  const observation = {
    original_delivery: delivery(run0, "DEL-4"),
    supplied_claims: suppliedClaims,
    sources,
    other_record_key: second.record_key,
    retained_current: retained.current,
    committed_current: stale.current,
    stale_start: denied,
    refreshed_start: blocked,
    before_binding: run0.binding,
    proposed_binding: command1.binding,
    before_summary: report0.summary,
    after_summary: report1.summary,
    human_next_action:
      "Inspect the supplied source report and obtain underlying proof, permitted access, accountable owner and governing terms. New worker preparation is blocked by the accepted one-bundle limit.",
  };
  t.diagnostic(
    JSON.stringify({
      original_delivery: observation.original_delivery.status,
      supplied_claim: suppliedClaims[0].meaning,
      supplied_citation: sources[0].id,
      stale_start: denied.data.error,
      fresh_start: blocked.data.error,
      case_versions: [
        run0.binding.basis.manifest.case_version,
        command1.binding.basis.manifest.case_version,
      ],
      summary: report1.summary,
      independent_business_verification: false,
      restart_reproduced: true,
    }),
  );
  if (process.env.D13_FOLLOW_THROUGH_DIR) {
    const dir = resolve(process.env.D13_FOLLOW_THROUGH_DIR);
    for (const [stage, archive, report, at] of [
      ["before", archive0, report0, AT],
      ["after", archive1, report1, suppliedAt],
    ]) {
      await mkdir(resolve(dir, stage), { recursive: true });
      for (const [name, contents] of Object.entries({
        "archive.json": reportJson(archive),
        "manifest.json": reportJson(manifest(archive, at)),
        "report.json": reportJson(report),
        "report.html": renderReport(report, archive),
      }))
        await writeFile(resolve(dir, stage, name), contents);
    }
    await writeFile(
      resolve(dir, "follow-through.json"),
      reportJson({
        supplied_input: supplied,
        intake_receipt: attached,
        prior_start: receipt0,
        prior_review: accepted0,
        stale_start: denied,
        retained_current: retained.current,
        committed_current: stale.current,
        fresh_description: freshBrief,
        other_record: otherBrief,
        proposed_start: command1,
        blocked_start: blocked,
        observation,
      }),
    );
  }
});
