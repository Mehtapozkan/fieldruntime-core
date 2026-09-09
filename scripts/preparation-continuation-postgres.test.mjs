import { workColumns } from "../dist/packages/runtime/src/postgres-preparation-work-store.js";
import { assertValidPreparationWorkV2Contract } from "../dist/packages/contracts/src/index.js";
import {
  appendWorkCommand,
  validateWorkExport,
} from "../dist/packages/runtime/src/preparation-work.js";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  preparedWork,
  publication,
  start,
  PACK,
  WORK,
} from "../tests/helpers/preparation-work.mjs";
import { syntheticWorkContext } from "../dist/packages/runtime/src/preparation-work.js";
const profile = JSON.parse(
  await readFile(
    new URL(
      "../packages/contracts/src/preparation-worker-profile.v2.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const continuationContext = () => ({
  profile,
  pack: {
    ...syntheticWorkContext().pack,
    template_id: "invoice-dispute-preparation.v3",
    worker_profile: profile,
  },
});
test("D13 F1 v3 publication explicitly prepares a versioned packet without transferred acceptance", async (t) => {
  const { h, path, packPath } = await preparedWork(t);
  h.setWorkContext(continuationContext());
  const p = await h.ok(packPath);
  assert.equal(
    p.candidate?.schema_version,
    "preparation-pack.v3",
    JSON.stringify(p.current),
  );
  await h.ok(`${PACK}/selections/publication`, {
    ...publication(p),
    schema_version: "pack-selection-command.v3",
  });
  const v = await h.ok(path);
  assert.equal(v.current.can_start, true, JSON.stringify(v));
  const command = {
    ...start(v),
    schema_version: "preparation-work-command.v2",
  };
  assertValidPreparationWorkV2Contract("command", command);
  appendWorkCommand(
    validateWorkExport(await h.ok(path + "&representation=export")),
    command,
    v.evaluated_at,
    continuationContext(),
  );
  const receipt = await h.ok(`${WORK}/commands`, command);
  assert.equal(receipt.entry.schema_version, "preparation-work-entry.v2");
  const run = (await h.ok(path)).invocations.at(-1);
  assert.equal(run.result.schema_version, "disposition-preparation-result.v2");
  assert.equal(run.review, null);
});

import {
  continuation,
  note,
  queueInput,
  POST,
  review,
} from "../tests/helpers/preparation-continuation.mjs";
import {
  syntheticContinuationContext,
  workInput,
} from "../dist/packages/runtime/src/preparation-work.js";
import { discoveryPath } from "../tests/helpers/discovery.mjs";
import { editQueue } from "../tests/helpers/intake.mjs";
import { buildReport as currentReport } from "./lib/challenge-report-v2.mjs";
import {
  buildReport as legacyReport,
  reportJson,
  renderReport,
} from "./lib/challenge-report.mjs";
import { mkdir, writeFile } from "node:fs/promises";
const manifest = (a, v = "v2", at = "2026-09-07T16:06:00.000Z") => ({
  schema_version: `challenge-input.${v}`,
  archive_hash: a.hash,
  evaluated_at: at,
  cohort: "all_retained_records",
});
const unchangedBusiness = (s) =>
  Object.fromEntries(
    Object.entries(s).filter(
      ([k]) => !["preparation_work_journal", "runtime_writer_lock"].includes(k),
    ),
  );

test("D13 F1/F2/F5 useful DEL-4 continuation preserves old approval, upgrades 0009 and exact restart receipts", async (t) => {
  const x = await continuation(t, { beforeContinuation: true });
  const { h, path } = x;
  const oldReport = await legacyReport(
    x.archive,
    manifest(x.archive, "v1", "2026-09-07T16:05:00.000Z"),
  );
  const installed = (
    await h.pg.query(
      "SELECT version,checksum FROM fieldruntime_schema_migrations ORDER BY version",
    )
  ).rows;
  const prior = await h.snapshot();
  await h.upgrade();
  assert.deepEqual(await h.snapshot(), prior);
  assert.deepEqual(
    (
      await h.pg.query(
        "SELECT version,checksum FROM fieldruntime_schema_migrations ORDER BY version",
      )
    ).rows.slice(0, 9),
    installed,
  );
  h.setWorkContext(syntheticContinuationContext());
  assert.equal(
    (await h.ok(path)).current.can_start,
    false,
    "Old publication must not gain new capacity",
  );
  const next = await x.supply();
  const view = await h.ok(path);
  assert.equal(view.current.can_start, true, JSON.stringify(view.current));
  assert.equal(view.resource_preflight.counts.retained_bundles, 2);
  assert.equal(view.resource_preflight.counts.coverage_rows, 4);
  assert.equal(view.candidate_binding.retained_bundles.length, 2);
  const state = await h.snapshot();
  const command = start(view, "continue-start-after");
  const receipt = await h.ok(POST, command);
  const fresh = await h.ok(path),
    run = fresh.invocations.at(-1);
  assert.equal(fresh.invocations.length, 2);
  assert.equal(run.review, null);
  assert.equal(run.can_accept, true);
  assert.deepEqual(fresh.invocations[0].result, x.before.invocations[0].result);
  assert.deepEqual(fresh.invocations[0].review, x.before.invocations[0].review);
  assert.equal(fresh.invocations[0].current_usable, false);
  const delivery = run.result.evidence_checklist.find(
    (c) => c.subject.id === "DEL-4",
  );
  assert.equal(delivery.status, "reported_confirmation");
  assert.equal(delivery.independently_verified, false);
  assert.match(
    run.result.follow_up.draft,
    /original DEL-4 confirmation.*evidence owner.*permitted inspection route/,
  );
  assert.match(
    run.result.follow_up.draft,
    /governing terms.*person accountable/,
  );
  assert.equal(run.result.follow_up.sent, false);
  assert.equal(run.result.disposition.recommended_credit_minor, null);
  const cited = fresh.sources.filter((s) =>
    delivery.citation_ids.includes(s.id),
  );
  assert.ok(
    cited.some(
      (s) =>
        s.bundle_id === next.v.bundle.id && s.excerpt.includes("is supplied"),
    ),
  );
  const other = await h.ok(discoveryPath(next.v, null, 1));
  assert.ok(
    !other.material.source_claims.some(
      (c) =>
        c.applicable_record_key === x.second.record_key &&
        c.meaning === "source_reports_confirmation",
    ),
  );
  assert.deepEqual(
    unchangedBusiness(await h.snapshot()),
    unchangedBusiness(state),
  );
  const archive = await h.ok(path + "&representation=export");
  const replay = validateWorkExport(archive);
  const input = workInput(
    replay,
    replay.entries.find((e) => e.hash === receipt.entry.hash),
  );
  assert.equal(input.retained_bundles.length, 2);
  assert.deepEqual(
    input.binding.retained_bundles.map((b) => b.bundle_hash).sort(),
    input.retained_bundles.map((b) => b.hash).sort(),
  );
  const report = await currentReport(archive, manifest(archive));
  assert.equal(report.summary.retained_records, 2);
  assert.equal(report.summary.attached_cases, 1);
  assert.equal(report.summary.invocation_attempts, 2);
  assert.equal(report.summary.accepted_packets, 1);
  assert.equal(
    report.records.find((r) => r.record_key === x.first.record_key)
      .historical_acceptance_currently_usable_in_snapshot,
    false,
  );
  assert.ok(report.measures.every((m) => m.aggregate_value === null));
  const snap = await h.snapshot();
  await h.restart();
  for (const [cmd, r] of [
    [x.command, x.receipt],
    [x.reviewCommand, x.reviewReceipt],
    [command, receipt],
    [next.selection, next.attached],
  ])
    assert.deepEqual(
      await h.ok(
        cmd.schema_version.startsWith("intake") ? "/v1/intake/commits" : POST,
        cmd,
      ),
      r,
    );
  assert.deepEqual(await h.ok(path + "&representation=export"), archive);
  assert.deepEqual(await h.snapshot(), snap);
  assert.equal(
    reportJson(
      await legacyReport(
        x.archive,
        manifest(x.archive, "v1", "2026-09-07T16:05:00.000Z"),
      ),
    ),
    reportJson(oldReport),
  );
  assert.deepEqual(await currentReport(archive, manifest(archive)), report);
  const accept = review(await h.ok(path), "continue-review-after");
  await h.ok(POST, accept);
  assert.equal(
    (await h.ok(path)).invocations.at(-1).review.command.idempotency_key,
    "continue-review-after",
  );
  t.diagnostic(
    JSON.stringify({
      before: { version: "v1", delivery: "not_supplied", accepted: 1 },
      after: {
        version: "v2",
        delivery: delivery.status,
        independently_verified: false,
        review_before_new_acceptance: run.review,
        attempts: report.summary.invocation_attempts,
      },
      source: cited,
    }),
  );
  if (process.env.D13_CONTINUATION_DIR) {
    const dir = process.env.D13_CONTINUATION_DIR;
    await mkdir(dir, { recursive: true });
    for (const [name, value] of Object.entries({
      archive,
      manifest: manifest(archive),
      report,
      before: x.archive,
      walkthrough: {
        original: x.command,
        original_receipt: x.receipt,
        original_review: x.reviewReceipt,
        supplied: note(x.input),
        attachment: next.attached,
        command,
        receipt,
        packet: fresh,
        acceptance: accept,
      },
    }))
      await writeFile(`${dir}/${name}.json`, reportJson(value));
    await writeFile(`${dir}/report.html`, renderReport(report, archive));
  }
});

for (const [name, mutate, expected] of [
  [
    "duplicate queue occurrences",
    (input) =>
      editQueue(input, (rows, headers) => ({
        rows: [...Array.from({ length: 100 }, () => ({ ...rows[0] })), rows[1]],
        headers,
      })),
    "coverage_rows",
  ],
  [
    "duplicate support occurrences",
    (input) => {
      let v = input;
      for (let i = 0; i < 11; i++)
        v = note(v, `shared-${i}`, "Retained synthetic access note.\n");
      return v;
    },
    "associated_support_artifacts",
  ],
  [
    "duplicate parsed-byte occurrences",
    (input) => {
      let v = input;
      for (let i = 0; i < 3; i++) v = note(v, `large-${i}`, "x".repeat(400000));
      return v;
    },
    "parsed_utf8_bytes",
  ],
])
  test(`D13 F3 aggregate ${name} block preflight, report and execution without truncation`, async (t) => {
    const input = mutate(await queueInput());
    const x = await continuation(t, { input, legacy: false, prepared: false });
    const next = await x.supply();
    const { h, path } = x;
    const v = await h.ok(path);
    assert.equal(v.current.can_start, false);
    assert.equal(v.resource_preflight.eligible, false);
    assert.ok(
      v.resource_preflight.counts[expected] >
        v.resource_preflight.limits[expected],
    );
    const before = await h.snapshot();
    const archive = await h.ok(path + "&representation=export");
    const report = await currentReport(archive, manifest(archive));
    assert.equal(report.summary.snapshot_startable_records, 0);
    assert.ok(
      report.records
        .find((r) => r.record_key === x.first.record_key)
        .snapshot_reasons.some((r) => r.includes(expected)),
    );
    // A structurally valid command still cannot bypass the server's complete resource check.
    const p = await h.ok(next.packPath);
    const b = {
      ...x.before.candidate_binding,
      basis: p.candidate.binding,
      artifact_hash: p.candidate_hash,
      pack_version: p.candidate.version,
      selection_revision: p.selection_revision,
      selection_head: p.selection_head,
      retained_bundles: [x.v.bundle, next.v.bundle]
        .map((b) => ({ bundle_id: b.id, bundle_hash: b.hash }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    };
    const denied = await h.call(POST, {
      ...start(x.before),
      binding: b,
      idempotency_key: `overflow-${expected}`,
    });
    assert.equal(denied.status, 400);
    assert.equal(
      denied.data.error,
      "WORK_INPUT_LIMIT",
      JSON.stringify(denied.data),
    );
    assert.deepEqual(await h.snapshot(), before);
  });

async function twoBundles(t, options = {}) {
  const x = await continuation(t, {
    legacy: false,
    prepared: false,
    ...options,
  });
  const next = await x.supply();
  return { ...x, next };
}
test("D13 F3/F4 third bundle and incomplete bundle/scope bindings fail closed", async (t) => {
  const x = await twoBundles(t),
    { h, path } = x;
  const v = await h.ok(path),
    command = start(v, "bound-two"),
    before = await h.snapshot();
  for (const mutate of [
    (b) => ({ ...b, retained_bundles: b.retained_bundles.slice(0, 1) }),
    (b) => ({
      ...b,
      retained_bundles: b.retained_bundles.map((r, i) =>
        i ? { ...r, bundle_hash: `sha256:${"a".repeat(64)}` } : r,
      ),
    }),
  ]) {
    const r = await h.call(POST, {
      ...command,
      binding: mutate(command.binding),
    });
    assert.equal(r.status, 409);
    assert.equal(r.data.error, "WORK_BINDING_CONFLICT");
    assert.deepEqual(await h.snapshot(), before);
  }
  for (const scope of ["scope_entity_north", "scope_entity_south"]) {
    const c = structuredClone(syntheticContinuationContext());
    c.profile.read_scope_ids = [scope];
    c.pack.worker_profile = c.profile;
    h.setWorkContext(c);
    assert.notEqual((await h.call(path)).status, 200);
    assert.notEqual((await h.call(POST, command)).status, 200);
    assert.deepEqual(await h.snapshot(), before);
  }
  h.setWorkContext(syntheticContinuationContext());
  const third = note(
    x.input,
    "third-source",
    "An evidence owner is not assigned.\n",
  );
  await x.supply(third);
  const blocked = await h.ok(path);
  assert.equal(blocked.current.can_start, false);
  assert.equal(blocked.resource_preflight.counts.retained_bundles, 3);
  assert.equal(blocked.resource_preflight.bundle_ids.length, 3);
  const snap = await h.snapshot();
  const denied = await h.call(POST, command);
  assert.equal(denied.status, 400);
  assert.equal(denied.data.error, "WORK_INPUT_LIMIT");
  assert.deepEqual(await h.snapshot(), snap);
  const report = await currentReport(
    await h.ok(path + "&representation=export"),
    manifest(await h.ok(path + "&representation=export")),
  );
  assert.equal(report.summary.snapshot_startable_records, 0);
});

import { prepareDisposition } from "../dist/packages/runtime/src/disposition-preparation.js";
import { sha256Json } from "../dist/packages/contracts/src/index.js";
for (const interruption of [false, true])
  test(`D13 F5 concurrent keys, ${interruption ? "interruption and late result" : "withdrawal during execution"} preserve fences`, async (t) => {
    const { h, path, next } = await twoBundles(t);
    let entered, finish;
    const inputReady = new Promise((resolve) => (entered = resolve)),
      completion = new Promise((resolve) => (finish = resolve));
    h.setWorkPort((input) => {
      entered(input);
      return { completion, cancel() {} };
    });
    const command = start(await h.ok(path), "race-original");
    const pending = h.call(POST, command);
    const input = await inputReady;
    const initial = await h.ok(path);
    assert.equal(initial.current.can_start, false);
    const original = await h.ok(POST, command);
    assert.equal(original.entry.event, "started");
    assert.equal(
      (await h.call(POST, start(initial, "competing"))).data.error,
      "WORK_PENDING",
    );
    if (interruption) {
      const cancel = {
        schema_version: "preparation-interruption.v2",
        operation: "interrupt",
        invocation_id: original.entry.invocation_id,
        expected_work_revision: initial.work_revision,
        expected_work_head: initial.work_head,
        reason: "Explicitly pause synthetic follow-through",
        idempotency_key: "interrupt-original",
      };
      const cancelled = await h.ok(POST, cancel);
      finish(prepareDisposition(input));
      assert.equal((await pending).status, 200);
      const snap = await h.snapshot();
      await h.restart();
      assert.deepEqual(await h.ok(POST, cancel), cancelled);
      assert.deepEqual(await h.snapshot(), snap);
      assert.equal(
        (await h.ok(path)).invocations.at(-1).outcome,
        "interrupted",
      );
    } else {
      const p = await h.ok(next.packPath);
      await h.ok(`${PACK}/selections/publication`, {
        schema_version: "pack-selection-command.v3",
        operation: "withdraw",
        pack_id: p.pack_id,
        artifact_hash: p.selected_artifact_hash,
        expected_selection_revision: p.selection_revision,
        expected_selection_head: p.selection_head,
        expected_publication_profile_hash: p.publication_profile_hash,
        reason: "Withdraw while computation is pending",
        idempotency_key: "withdraw",
      });
      finish(prepareDisposition(input));
      assert.equal((await pending).status, 200);
      assert.equal(
        (await h.ok(path)).invocations.at(-1).outcome,
        "invalidated",
      );
      await h.restart();
      assert.equal((await h.ok(path)).invocations.at(-1).can_accept, false);
    }
    const snap = await h.snapshot();
    assert.deepEqual(await h.ok(POST, command), original);
    assert.deepEqual(await h.snapshot(), snap);
  });

for (const tag of [
  "fr:work-started-insert",
  "fr:work-terminal_result-insert",
  "COMMIT",
])
  test(`D13 F5 ${tag} failure and original-key restart recovery retain exact versioned inputs`, async (t) => {
    const { h, path } = await twoBundles(t);
    const before = await h.snapshot(),
      command = start(await h.ok(path), "fault-original");
    h.fault({
      tag,
      ...(tag === "COMMIT" ? { remaining: 2, after: true } : {}),
    });
    const failed = await h.call(POST, command);
    assert.equal(failed.status, 500);
    if (tag === "fr:work-started-insert")
      assert.deepEqual(await h.snapshot(), before);
    await h.restart();
    const snapshot = await h.snapshot();
    const recovered = await h.ok(POST, command);
    const view = await h.ok(path);
    assert.equal(view.invocations.length, 1);
    assert.deepEqual(view.invocations[0].binding, command.binding);
    if (tag !== "fr:work-started-insert")
      assert.deepEqual(await h.snapshot(), snapshot);
    const stable = await h.snapshot();
    await h.restart();
    assert.deepEqual(await h.ok(POST, command), recovered);
    assert.deepEqual(await h.snapshot(), stable);
    assert.equal(view.invocations[0].review, null);
    if (tag === "fr:work-terminal_result-insert")
      assert.equal(view.invocations[0].outcome, "started");
    else assert.equal(view.invocations[0].outcome, "prepared_gap_packet");
  });

test("D13 F4/F5 full new input replay rejects coherently altered participating bundle evidence", async (t) => {
  const { h, path } = await twoBundles(t);
  await h.ok(POST, start(await h.ok(path)));
  const archive = await h.ok(path + "&representation=export");
  const changed = structuredClone(archive);
  const startEntry = changed.entries.find((e) => e.event === "started");
  startEntry.command.binding.retained_bundles.pop();
  startEntry.binding_hash = sha256Json(startEntry.command.binding);
  startEntry.command_fingerprint = sha256Json(startEntry.command);
  let prev = null;
  for (const entry of changed.entries) {
    entry.previous_entry_hash = prev;
    if (entry.event !== "started") {
      entry.started_entry_hash = changed.entries[0].hash;
      entry.binding_hash = startEntry.binding_hash;
      if (entry.result) {
        entry.result.started_entry_hash = entry.started_entry_hash;
        entry.result.binding_hash = entry.binding_hash;
        entry.result_hash = sha256Json(entry.result);
      }
    }
    const body = { ...entry };
    delete body.hash;
    entry.hash = sha256Json(body);
    prev = entry.hash;
  }
  const body = { ...changed };
  delete body.hash;
  changed.hash = sha256Json(body);
  assert.throws(() => validateWorkExport(changed));
  assert.deepEqual(await h.ok(path + "&representation=export"), archive);
  const canonical = unchangedBusiness(await h.snapshot());
  const db = await h.pg.connect();
  try {
    await db.query("SET session_replication_role='replica'");
    await db.query("DELETE FROM preparation_work_journal");
    for (const e of changed.entries)
      await db.query(
        "INSERT INTO preparation_work_journal SELECT * FROM jsonb_populate_record(NULL::preparation_work_journal,$1)",
        [workColumns(e)],
      );
  } finally {
    await db.query("SET session_replication_role='origin'");
    db.release();
  }
  assert.deepEqual(unchangedBusiness(await h.snapshot()), canonical);
  assert.equal((await h.call("/readyz")).status, 503);
  assert.equal((await h.call(path)).status, 500);
  assert.equal((await h.call(path + "&representation=export")).status, 500);
  await h.restart();
  assert.equal((await h.call(path)).status, 500);
});

for (const change of ["description", "expiry", "identity", "case"])
  test(`D13 F5 ${change} during v2 computation cannot become current task acceptance`, async (t) => {
    const x = await twoBundles(t),
      { h, path, next } = x;
    let entered, finish;
    const ready = new Promise((r) => (entered = r)),
      completion = new Promise((r) => (finish = r));
    h.setWorkPort((input) => {
      entered(input);
      return { completion, cancel() {} };
    });
    const pending = h.call(POST, start(await h.ok(path), "changing"));
    const input = await ready;
    if (change === "description") {
      const { discoveryCommand, reviewPath } =
        await import("../tests/helpers/discovery.mjs");
      await h.ok(
        reviewPath(next.v),
        discoveryCommand(
          await h.ok(discoveryPath(next.v, x.first.case_id)),
          "describe-change",
        ),
      );
    } else if (change === "expiry") h.setTime("2026-09-07T17:00:00.000Z");
    else if (change === "identity") {
      const c = structuredClone(syntheticContinuationContext());
      c.profile.identities[0].status = "revoked";
      c.pack.worker_profile = c.profile;
      h.setWorkContext(c);
    } else {
      // D-014 rejected closure is attributable and advances C, never business state.
      await h.ok("/v0/tenants/tenant_intake_demo/case-commands", {
        type: "case.transition",
        tenant_id: "tenant_intake_demo",
        case_id: x.first.case_id,
        expected_case_version: next.attached.receipt.case_version,
        actor_identity_id: "identity_intake_operator",
        idempotency_key: "changed-during-v2-run",
        correlation_id: "d13_boundary",
        to_state: "resolved",
        reason: "Incomplete proof remains denied",
      });
    }
    finish(prepareDisposition(input));
    assert.equal((await pending).status, 200);
    assert.equal((await h.ok(path)).invocations.at(-1).outcome, "invalidated");
    await h.restart();
    assert.equal((await h.ok(path)).invocations.at(-1).can_accept, false);
  });

// Interpret scoped claims from every bound bundle; an unrelated report is not proof.
for (const shared of [false, true])
  test(`D13 F1/F6 ${shared ? "shared delivery" : "record-only"} support preserves same-subject conflict and canonical ordering`, async (t) => {
    const input = note(
      await queueInput(),
      "old-denial",
      "Delivery confirmation for DEL-4 is not supplied.\n",
    );
    if (shared)
      editQueue(input, (rows) => {
        rows[1].delivery_ids = "DEL-4";
      });
    const x = await twoBundles(t, { input });
    await x.h.ok(POST, start(await x.h.ok(x.path)));
    const r = (await x.h.ok(x.path)).invocations.at(-1).result;
    const claim = r.evidence_checklist.find((c) => c.subject.id === "DEL-4");
    assert.equal(claim.status, "conflicting");
    assert.match(r.follow_up.draft, /reconcile the opposing DEL-4/);
    assert.ok(claim.citation_ids.length >= 2);
    const state = validateWorkExport(
      await x.h.ok(x.path + "&representation=export"),
    );
    const e = state.entries.findLast((e) => e.event === "started");
    const inputSnapshot = workInput(state, e);
    assert.equal(sha256Json(prepareDisposition(inputSnapshot)), sha256Json(r));
    const reordered = structuredClone(inputSnapshot);
    reordered.retained_bundles.reverse();
    assert.equal(sha256Json(prepareDisposition(reordered)), sha256Json(r));
    // Explicit sharing is a claim about the delivery, not a transfer through invoice labels.
    const { readDiscovery } =
      await import("../dist/packages/runtime/src/discovery.js");
    const other = readDiscovery(
      state.pack.discovery,
      x.next.v.bundle.id,
      x.second.record_key,
      null,
    );
    const reports = other.material.source_claims.filter(
      (c) =>
        c.applicable_record_key === x.second.record_key &&
        c.meaning === "source_reports_confirmation",
    );
    assert.equal(reports.length, 0); // note is still explicitly record-only, even for a shared delivery
  });

test("D13 F6 explicit delivery association applies across records without changing the other delivery", async (t) => {
  const input = await queueInput();
  editQueue(input, (rows) => {
    rows[1].delivery_ids = "DEL-4;DEL-5";
  });
  const x = await continuation(t, { input, legacy: false, prepared: false });
  const next = await x.supply(
    note(
      input,
      "shared-delivery",
      "Delivery confirmation for DEL-4 is supplied.\n",
      { entity: "entity_north", kind: "delivery", id: "DEL-4" },
    ),
  );
  const { readDiscovery } =
    await import("../dist/packages/runtime/src/discovery.js");
  const state = validateWorkExport(
    await x.h.ok(x.path + "&representation=export"),
  );
  for (const key of [x.first.record_key, x.second.record_key]) {
    const claims = readDiscovery(
      state.pack.discovery,
      next.v.bundle.id,
      key,
      null,
    ).material.source_claims.filter(
      (c) =>
        c.applicable_record_key === key &&
        c.meaning === "source_reports_confirmation",
    );
    assert.ok(
      claims.some((c) => c.subject.id === "DEL-4"),
      JSON.stringify(claims),
    );
    assert.ok(!claims.some((c) => c.subject.id === "DEL-5"));
  }
});

test("D13 F5/F7 v2 correction, independent evaluation and five unknown measures replay without authority", async (t) => {
  const { h, path } = await twoBundles(t);
  await h.ok(POST, start(await h.ok(path)));
  const v = await h.ok(path),
    r = v.invocations.at(-1);
  const example = JSON.parse(
    await readFile(
      new URL(
        "../docs/examples/d12-preparation-worker.proposed.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const head = (v) => ({
    expected_work_revision: v.work_revision,
    expected_work_head: v.work_head,
  });
  const c = {
    ...example.correction_example,
    schema_version: "purpose_limited_preparation_correction.v2",
    ...head(v),
    invocation_id: r.invocation_id,
    binding_hash: sha256Json(r.binding),
    original_result_hash: r.result_hash,
    target: "/follow_up/requests/0/text",
    before: r.result.follow_up.requests[0].text,
    after:
      "Please identify the original proof, responsible evidence owner and permitted inspection route; these remain unconfirmed.",
    citation_ids: r.result.follow_up.requests[0].citation_ids,
    idempotency_key: "v2-correct",
  };
  const corrected = await h.ok(POST, c),
    e = corrected.entry;
  const ev = {
    ...example.evaluation_review_command,
    schema_version: "preparation-evaluation-review.v2",
    ...head(await h.ok(path)),
    invocation_id: r.invocation_id,
    correction_entry_hash: e.hash,
    candidate_id: e.candidate.id,
    expected_candidate_revision: e.candidate.revision,
    expected_test_case_hash: e.candidate.test_case_hash,
    idempotency_key: "v2-evaluate",
  };
  const evaluated = await h.ok(POST, ev);
  assert.notEqual(evaluated.entry.actor.identity_id, e.actor.identity_id);
  for (const measure of [
    "cash_collected",
    "disputes_resolved",
    "credits_issued",
    "work_newly_attended_to",
    "human_attention_released",
  ]) {
    const note = JSON.parse(
      await readFile(
        new URL("../docs/examples/d12-proof-note.v1.json", import.meta.url),
        "utf8",
      ),
    );
    const money = ["cash_collected", "credits_issued"].includes(measure);
    Object.assign(note, {
      measure,
      unit: money
        ? "currency_minor"
        : measure === "human_attention_released"
          ? "person_minutes"
          : "records",
      currency: money ? "USD" : null,
    });
    await h.ok(POST, {
      schema_version: "preparation-proof-note.v2",
      operation: "proof_note",
      purpose: "synthetic_measurement_readiness",
      ...head(await h.ok(path)),
      invocation_id: r.invocation_id,
      binding_hash: sha256Json(r.binding),
      result_hash: r.result_hash,
      reason: "Unknown synthetic measurement; no outcome or authority",
      idempotency_key: `v2-proof-${measure}`,
      note,
    });
  }
  const archive = await h.ok(path + "&representation=export"),
    snapshot = await h.snapshot();
  const report = await currentReport(archive, manifest(archive));
  assert.equal(report.summary.newly_attended_records, null);
  assert.equal(archive.closure_permission, false);
  assert.equal((await h.ok(path)).invocations.at(-1).review, null);
  assert.deepEqual((await h.ok(path)).invocations.at(-1).result, r.result);
  await h.restart();
  assert.deepEqual(await h.ok(POST, c), corrected);
  assert.deepEqual(await h.ok(POST, ev), evaluated);
  assert.deepEqual(await h.ok(path + "&representation=export"), archive);
  assert.deepEqual(await h.snapshot(), snapshot);
});

test("D13 current report never borrows a start action from a historical interpreter", async (t) => {
  const x = await continuation(t, { prepared: false });
  const old = await legacyReport(
    x.archive,
    manifest(x.archive, "v1", "2026-09-07T16:05:00.000Z"),
  );
  assert.equal(
    old.records.find((r) => r.record_key === x.first.record_key)
      .snapshot_can_start,
    true,
  );
  x.h.setWorkContext(syntheticContinuationContext());
  const view = await x.h.ok(x.path);
  assert.equal(view.current.can_start, false);
  const report = await currentReport(x.archive, manifest(x.archive));
  const record = report.records.find(
    (r) => r.record_key === x.first.record_key,
  );
  assert.equal(record.snapshot_can_start, false);
  t.diagnostic(
    JSON.stringify({
      current_reasons: view.current.reasons,
      report_next_action: record.next_action,
    }),
  );
  assert.match(record.next_action, /v3 publication/);
  assert.doesNotMatch(
    record.next_action,
    /explicitly prepare a fresh packet if useful/,
  );
});
