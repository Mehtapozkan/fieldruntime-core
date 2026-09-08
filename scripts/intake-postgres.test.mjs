import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import test from "node:test";
import {
  intakeHost,
  restoreIntakeFixture,
} from "../tests/helpers/intake-postgres.mjs";
import { intakeInput } from "../tests/helpers/intake.mjs";
import { validateIntakeExport } from "../dist/packages/runtime/src/intake-integrity.js";
const root = "/v1/intake";
function businessState(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot).filter(
      ([key]) =>
        !["intake_request_bindings", "runtime_writer_lock"].includes(key),
    ),
  );
}
function assertNoopMetadata(before, after) {
  assert.deepEqual(businessState(after), businessState(before));
  assert.equal(
    after.intake_request_bindings.length,
    before.intake_request_bindings.length + 1,
  );
  assert.equal(
    Number(after.runtime_writer_lock[0].row.revision),
    Number(before.runtime_writer_lock[0].row.revision) + 1,
  );
}

test("D9-B preparation routes share decoded paths, ingestion attribution and bounded upload size", async (t) => {
  const h = await intakeHost(t);
  for (const [index, path] of [
    `${root}/preparations/`,
    `${root}/%70reparations?source=synthetic`,
  ].entries()) {
    await h.ok(path, await intakeInput(`small-route-${index}`));
    const input = await intakeInput(`route-${index}`);
    input.artifacts[1] = {
      ...input.artifacts[1],
      name: "retention.pdf",
      media_type: "application/pdf",
      bytes_base64: Buffer.from(
        `%PDF-1.7\n${"x".repeat(800_000)}${index}`,
      ).toString("base64"),
    };
    assert.ok(Buffer.byteLength(JSON.stringify(input)) > 1_048_576);
    const result = await h.ok(path, input);
    const view = await h.ok(`${root}/bundles/${result.bundle_id}`);
    assert.equal(view.bundle.ingested_at, "2026-09-07T16:05:00.000Z");
  }
  const before = await h.snapshot();
  assert.equal((await h.call(`${root}/%ZZ`, await intakeInput())).status, 400);
  assert.deepEqual(await h.snapshot(), before);
});
test("D9-B A1/A9/A12 PostgreSQL/API: explicit prepare, preview, atomic commit, restart and portable reconstruction", async (t) => {
  const h = await intakeHost(t),
    view = await h.prepare();
  assert.equal(view.candidates.length, 2);
  assert.equal(view.authority_granted, false);
  const before = await h.snapshot(),
    reads = h.clockReads,
    ids = h.ids;
  const selection = await h.selection(view);
  await h.ok(`${root}/bundles/${view.bundle.id}`);
  await h.ok(`${root}/bundles`);
  assert.deepEqual(await h.snapshot(), before);
  assert.equal(h.ids, ids);
  assert.equal(h.clockReads, reads);
  const accepted = await h.ok(`${root}/commits`, selection);
  assert.equal(accepted.status, "committed");
  assert.equal(accepted.receipt.case_version, 1);
  assert.equal(accepted.receipt.actor.identity_id, "identity_intake_operator");
  const state = validateIntakeExport(await h.ok(`${root}/export`));
  assert.equal(state.commits.length, 1);
  await h.restart();
  const retry = await h.ok(`${root}/commits`, selection);
  assert.equal(retry.status, "committed");
  assert.deepEqual(retry.receipt, accepted.receipt);
  assert.equal(
    (await h.ok(`${root}/bundles/${view.bundle.id}`)).candidates[0].commits
      .length,
    1,
  );
});
test("D9-B A9 PostgreSQL: failure between Case append and intake receipt rolls back every mutation", async (t) => {
  const h = await intakeHost(t),
    view = await h.prepare(),
    selection = await h.selection(view),
    before = await h.snapshot();
  h.fault({ tag: "fr:intake_commits-insert" });
  assert.equal((await h.call(`${root}/commits`, selection)).status, 500);
  assert.deepEqual(await h.snapshot(), before);
  const applied = await h.ok(`${root}/commits`, selection);
  assert.equal(applied.status, "committed");
});
test("D9-B A2 PostgreSQL: renamed bytes are retained once and changed-key bodies conflict", async (t) => {
  const h = await intakeHost(t),
    input = await intakeInput(),
    view = await h.prepare(input),
    before = await h.snapshot();
  input.idempotency_key = "renamed";
  input.artifacts[0].name = "renamed.csv";
  const same = await h.ok(`${root}/preparations`, input);
  assert.equal(same.status, "already_retained");
  assert.equal(same.bundle_id, view.bundle.id);
  const withKey = await h.snapshot();
  assertNoopMetadata(before, withKey);
  await h.restart();
  assert.deepEqual(await h.ok(`${root}/preparations`, input), same);
  assert.deepEqual(await h.snapshot(), withKey);
  input.idempotency_key = "prepare-1";
  assert.equal((await h.call(`${root}/preparations`, input)).status, 409);
});

const { editQueue } = await import("../tests/helpers/intake.mjs");
const { sha256Json } = await import("../dist/packages/contracts/src/index.js");
const { caseCommand } = await import("../tests/helpers/authority-review.mjs");

test("D9-B A3/A4/A7/A11 PostgreSQL: reorders are no-ops; changed rows/support and corrections append; disappearing rows do not delete history", async (t) => {
  const h = await intakeHost(t),
    input = await intakeInput(),
    view = await h.prepare(input),
    first = await h.ok(`${root}/commits`, await h.selection(view));
  const reordered = editQueue(structuredClone(input), (rows, headers) => ({
    rows: rows.reverse(),
    headers: headers.reverse(),
  }));
  reordered.idempotency_key = "reordered";
  const v2 = await h.prepare(reordered),
    selection = await h.selection(v2, 1),
    before = await h.snapshot();
  const noop = await h.ok(`${root}/commits`, selection);
  assert.equal(noop.status, "already_committed");
  assert.deepEqual(noop.receipt, first.receipt);
  assertNoopMetadata(before, await h.snapshot());
  const changed = editQueue(structuredClone(input), (rows) => {
    rows[0].amount_minor = "1600000";
  });
  changed.idempotency_key = "changed-row";
  let v = await h.prepare(changed);
  assert.ok(
    v.candidates[0].required_acknowledgments.includes(
      "contradictory_source_revision",
    ),
  );
  const next = await h.ok(`${root}/commits`, await h.selection(v));
  assert.equal(next.receipt.case_version, 2);
  assert.equal(next.receipt.previous_intake_hash, first.receipt.hash);
  changed.idempotency_key = "changed-support";
  changed.artifacts[1].bytes_base64 = Buffer.from(
    "Additional claim, still unconfirmed\n",
  ).toString("base64");
  v = await h.prepare(changed);
  const third = await h.ok(`${root}/commits`, await h.selection(v));
  assert.equal(third.receipt.case_version, 3);
  v = await h.ok(`${root}/bundles/${v.bundle.id}`);
  const corrected = await h.ok(
    `${root}/commits`,
    await h.selection(v, 0, {
      support_document_ids: [],
      reviewed_links: [],
      prior_selection_hash: third.receipt.review_material_hash,
      reason:
        "Exclude uncertain supporting relationship; previous evidence remains recorded",
    }),
  );
  assert.equal(corrected.receipt.case_version, 4);
  const partial = editQueue(await intakeInput("partial"), (rows, headers) => ({
    rows: [rows[1]],
    headers,
  }));
  partial.claims.coverage = "partial";
  v = await h.prepare(partial);
  assert.equal(v.bundle.coverage.physical_records, 1);
  const retained = await h.ok(`${root}/bundles/${view.bundle.id}`);
  assert.equal(retained.candidates[0].commits.length, 4);
  assert.equal(retained.candidates[1].commits.length, 0);
  await h.restart();
  assert.equal(
    (await h.ok(`${root}/bundles/${view.bundle.id}`)).candidates[0].commits
      .length,
    4,
  );
});
test("D9-B A5/A6 PostgreSQL: entity separation, preserved ownership, explicit ambiguous target and immutable K mapping", async (t) => {
  const h = await intakeHost(t),
    v = await h.prepare(),
    north = await h.ok(`${root}/commits`, await h.selection(v)),
    south = await h.ok(`${root}/commits`, await h.selection(v, 1));
  assert.notEqual(north.receipt.case_id, south.receipt.case_id);
  const extra = editQueue(await intakeInput("new-root"), (rows, headers) => ({
    rows: [
      { ...rows[0], source_record_id: "dispute-19", upstream_case_id: "AR-99" },
    ],
    headers,
  }));
  let next = await h.prepare(extra),
    second = await h.ok(
      `${root}/commits`,
      await h.selection(next, 0, {
        target: { mode: "create", expected_case_version: 0 },
      }),
    );
  const third = editQueue(await intakeInput("ambiguous"), (rows, headers) => ({
    rows: [
      { ...rows[0], source_record_id: "dispute-20", upstream_case_id: "" },
    ],
    headers,
  }));
  next = await h.prepare(third);
  assert.equal(next.candidates[0].targets.length, 2);
  const chosen = await h.ok(
    `${root}/commits`,
    await h.selection(next, 0, {
      target: {
        mode: "attach",
        case_id: north.receipt.case_id,
        expected_case_version: 1,
      },
    }),
  );
  assert.equal(chosen.receipt.case_version, 2);
  const caseDoc = await h.store.getCase(
    "tenant_intake_demo",
    north.receipt.case_id,
  );
  assert.equal(caseDoc.document.case.owner_identity_id, null);
  assert.equal(chosen.receipt.review_material.record.reported_owner, "Taylor");
  next = await h.ok(`${root}/bundles/${next.bundle.id}`);
  const selected = await h.selection(next),
    tampered = {
      ...selected,
      target: {
        mode: "attach",
        case_id: second.receipt.case_id,
        expected_case_version: 1,
      },
    };
  assert.equal((await h.call(`${root}/commits`, tampered)).status, 409);
  assert.equal(
    (
      await h.call(`${root}/selections/preview`, {
        ...Object.fromEntries(
          Object.entries(selected).filter(
            ([k]) =>
              ![
                "expected_material_key",
                "expected_consent_hash",
                "idempotency_key",
              ].includes(k),
          ),
        ),
        schema_version: "intake-review.v1",
        target: {
          mode: "attach",
          case_id: south.receipt.case_id,
          expected_case_version: 1,
        },
      })
    ).status,
    409,
  );
});
test("D9-B A8/A10 PostgreSQL/API: invalid authority/scope/normalized input has no writes; reserved Case event cannot bypass provenance", async (t) => {
  const h = await intakeHost(t),
    before = await h.snapshot();
  for (const field of [
    "tenant_id",
    "actor",
    "scope_ids",
    "normalized",
    "authorized",
  ]) {
    const input = await intakeInput();
    input[field] = "forged";
    assert.equal((await h.call(`${root}/preparations`, input)).status, 400);
  }
  const outside = editQueue(await intakeInput(), (rows) => {
    rows[0].legal_entity_id = "entity_outside";
  });
  assert.equal((await h.call(`${root}/preparations`, outside)).status, 400);
  assert.deepEqual(await h.snapshot(), before);
  const invalid = editQueue(await intakeInput("invalid-row"), (rows) => {
    rows[0].amount_minor = "not-money";
  });
  const view = await h.prepare(invalid);
  assert.equal(view.candidates[0].can_review, false);
  assert.equal(view.candidates[1].can_review, true);
  const command = caseCommand();
  command.trigger_event.source = "fieldruntime_intake";
  const denial = await h.call(
    `/v0/tenants/${command.tenant_id}/case-commands`,
    command,
  );
  assert.equal(denial.status, 400);
});
test("D9-B A9/A10 PostgreSQL: concurrent exact/new-key duplicates converge; different material needs fresh C and consent", async (t) => {
  const h = await intakeHost(t),
    v = await h.prepare(),
    selection = await h.selection(v),
    results = await Promise.all([
      h.ok(`${root}/commits`, selection),
      h.ok(`${root}/commits`, selection),
      h.ok(`${root}/commits`, { ...selection, idempotency_key: "fresh-key" }),
    ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [
    "already_committed",
    "committed",
    "committed",
  ]);
  assert.equal(new Set(results.map((r) => r.receipt.hash)).size, 1);
  const conflict = await h.call(`${root}/commits`, {
    ...selection,
    reason: "changed body",
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.error, "IDEMPOTENCY_CONFLICT");
  const changed = editQueue(await intakeInput("race"), (rows) => {
    rows[0].amount_minor = "1600000";
  });
  const view = await h.prepare(changed),
    a = await h.selection(view),
    b = await h.selection(view, 0, {
      support_document_ids: [],
      reason: "Separate reviewed material",
    });
  const raced = await Promise.all([
    h.call(`${root}/commits`, a),
    h.call(`${root}/commits`, b),
  ]);
  assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await h.ok(`${root}/bundles/${v.bundle.id}`)).candidates[0].commits.length,
    2,
  );
});
test("D9-B A9 PostgreSQL: lost successful commit, failed rollback, backward clock and exact restart retry", async (t) => {
  const h = await intakeHost(t),
    v = await h.prepare(),
    selection = await h.selection(v);
  h.fault({ tag: "COMMIT", after: true });
  assert.equal((await h.call(`${root}/commits`, selection)).status, 500);
  await h.restart();
  const before = await h.snapshot();
  h.setTime("2026-09-07T16:04:00.000Z");
  const retry = await h.ok(`${root}/commits`, selection);
  assert.equal(retry.status, "committed");
  assert.deepEqual(await h.snapshot(), before);
  const second = await h.selection(v, 1);
  assert.equal(
    (await h.call(`${root}/commits`, second)).data.error,
    "CLOCK_REGRESSION",
  );
  h.setTime("2026-09-07T16:06:00.000Z");
  h.fault({ tag: "fr:intake_commits-insert", rollback: true });
  assert.equal((await h.call(`${root}/commits`, second)).status, 500);
  assert.ok(h.discarded.includes(true));
  assert.deepEqual(await h.snapshot(), before);
  assert.equal((await h.ok(`${root}/commits`, second)).status, "committed");
});
test("D9-B A12 PostgreSQL: additive migration preserves existing Case history and prior checksums", async (t) => {
  const h = await intakeHost(t, { upgrade: true });
  const original = await h.store.execute(caseCommand(), h.dependencies());
  assert.equal(original.status, "applied");
  const entries = await h.store.getJournal(
      original.aggregate.tenant_id,
      original.aggregate.case_id,
    ),
    checksums = (
      await h.pg.query(
        "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
      )
    ).rows;
  await h.upgrade();
  assert.deepEqual(
    (
      await h.pg.query(
        "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
      )
    ).rows.slice(0, 4),
    checksums,
  );
  assert.deepEqual(
    await h.store.getJournal(
      original.aggregate.tenant_id,
      original.aggregate.case_id,
    ),
    entries,
  );
  const v = await h.prepare();
  await h.ok(`${root}/commits`, await h.selection(v));
  await h.restart();
  assert.deepEqual(
    await h.store.getJournal(
      original.aggregate.tenant_id,
      original.aggregate.case_id,
    ),
    entries,
  );
  assert.equal((await h.call("/readyz")).status, 200);
});
test("D9-B A12 PostgreSQL: bytes, derivations, bindings, journal anchors and unknown versions fail readiness/read/commit", async (t) => {
  for (const kind of ["bytes", "derivation", "binding", "anchor", "version"]) {
    await t.test(kind, async (t) => {
      const h = await intakeHost(t),
        v = await h.prepare(),
        selection = await h.selection(v),
        applied = await h.ok(`${root}/commits`, selection),
        before = await h.snapshot();
      const client = await h.pg.connect();
      try {
        await client.query("BEGIN");
        if (kind === "bytes") {
          await client.query(
            "ALTER TABLE intake_artifacts DISABLE TRIGGER USER",
          );
          await client.query(
            "UPDATE intake_artifacts SET bytes=$1 WHERE byte_hash=$2",
            [Buffer.from("tampered"), v.bundle.artifacts[0].byte_hash],
          );
        } else if (["derivation", "version"].includes(kind)) {
          await client.query("ALTER TABLE intake_bundles DISABLE TRIGGER USER");
          const b = structuredClone(v.bundle);
          if (kind === "derivation")
            b.records[0].reported_owner = "Forged owner";
          else b.versions.mapping = "unknown.mapping";
          delete b.hash;
          b.hash = sha256Json(b);
          await client.query(
            "UPDATE intake_bundles SET bundle=$1,bundle_hash=$2 WHERE id=$3",
            [b, b.hash, b.id],
          );
        } else {
          await client.query("ALTER TABLE intake_commits DISABLE TRIGGER USER");
          const r = structuredClone(applied.receipt);
          if (kind === "binding")
            r.review_material.record.cells.amount_minor = "9";
          else r.journal_entry_hash = `sha256:${"f".repeat(64)}`;
          delete r.hash;
          r.hash = sha256Json(r);
          await client.query(
            "UPDATE intake_commits SET receipt=$1,receipt_hash=$2,journal_entry_hash=$3 WHERE id=$4",
            [r, r.hash, r.journal_entry_hash, r.id],
          );
        }
        await client.query("COMMIT");
      } finally {
        client.release();
      }
      assert.deepEqual((await h.snapshot()).case_journal, before.case_journal);
      assert.deepEqual(
        (await h.snapshot()).authority_request_journal,
        before.authority_request_journal,
      );
      assert.equal((await h.call("/readyz")).status, 503);
      assert.equal(
        (await h.call(`${root}/bundles/${v.bundle.id}`)).status,
        500,
      );
      assert.equal((await h.call(`${root}/commits`, selection)).status, 500);
    });
  }
});

test("D9-B A1 PostgreSQL/API: attach at C4 preserves canonical owner/severity and records actual review time at C5", async (t) => {
  const h = await intakeHost(t),
    command = caseCommand("existing_intake");
  command.tenant_id = "tenant_intake_demo";
  command.case_seed.tenant.id = command.tenant_id;
  command.case_seed.case.tenant_id = command.tenant_id;
  command.case_seed.case.customer_ref = "Orchid";
  command.case_seed.case.scope_ids = ["scope_entity_north"];
  command.trigger_event.tenant_id = command.tenant_id;
  command.trigger_event.scope_ids = ["scope_entity_north"];
  await h.ok(`/v0/tenants/${command.tenant_id}/case-commands`, command);
  for (const [i, to_state] of [
    "qualifying",
    "enriching",
    "needs_review",
  ].entries())
    await h.ok(`/v0/tenants/${command.tenant_id}/case-commands`, {
      type: "case.transition",
      tenant_id: command.tenant_id,
      case_id: command.case_seed.case.id,
      expected_case_version: i + 1,
      actor_identity_id: "identity_d6_operator",
      idempotency_key: `existing:${to_state}`,
      correlation_id: "existing-intake",
      to_state,
      reason: "Explicit synthetic setup",
    });
  const view = await h.prepare();
  h.setTime("2026-09-07T16:10:00.000Z");
  const receipt = (await h.ok(`${root}/commits`, await h.selection(view)))
    .receipt;
  assert.equal(receipt.case_version, 5);
  assert.equal(receipt.review_material.record.source_occurrence.instant, null);
  assert.equal(
    receipt.adapted_command.work_event.occurred_at,
    "2026-09-07T16:10:00.000Z",
  );
  assert.equal(
    receipt.review_material.record.ingested_at,
    "2026-09-07T16:05:00.000Z",
  );
  const c = await h.store.getCase(command.tenant_id, command.case_seed.case.id);
  assert.equal(c.document.case.owner_identity_id, "identity_d6_operator");
  assert.equal(c.document.case.severity, "high");
  assert.equal(c.document.case.state, "needs_review");
  assert.equal((await h.snapshot()).authority_catalog.length, 0);
  await h.restart();
  assert.deepEqual(
    (await h.ok(`${root}/bundles/${view.bundle.id}`)).candidates[0].commits[0],
    receipt,
  );
});
test("D9-B A12 portable conformance: import retained export into a fresh disposable PostgreSQL fixture and reconstruct", async (t) => {
  const h = await intakeHost(t),
    v = await h.prepare();
  await h.ok(`${root}/commits`, await h.selection(v));
  const latest = await h.ok(`${root}/bundles/${v.bundle.id}`);
  await h.ok(
    `${root}/commits`,
    await h.selection(latest, 0, {
      support_document_ids: [],
      reason: "Explicit additive correction",
    }),
  );
  const exported = await h.ok(`${root}/export`),
    source = validateIntakeExport(exported),
    fresh = await intakeHost(t);
  await restoreIntakeFixture(fresh, source);
  await fresh.restart();
  assert.deepEqual(await fresh.ok(`${root}/export`), exported);
  assert.equal((await fresh.call("/readyz")).status, 200);
  const before = await fresh.snapshot();
  const retried = await fresh.ok(
    `${root}/commits`,
    source.commits[0].selection,
  );
  assert.equal(retried.status, "committed");
  assert.deepEqual(await fresh.snapshot(), before);
});

test("D9-B documented API commands: prepare → inspect → commit → restart → exact retry and export checker", async (t) => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    { promisify } = await import("node:util"),
    { execFile } = await import("node:child_process");
  const run = promisify(execFile),
    h = await intakeHost(t),
    dir = await mkdtemp(join(tmpdir(), "fieldruntime-intake-example-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const example = async (op, ...args) =>
    (
      await run(
        process.execPath,
        ["scripts/intake-example.mjs", op, dir, ...args],
        { env: { ...process.env, FIELD_RUNTIME_URL: h.base } },
      )
    ).stdout;
  await example("prepare");
  assert.match(await example("read"), /intake-view.v1/);
  assert.match(
    await example("inspect", "create"),
    /no Case mutation has been submitted/,
  );
  assert.match(await example("commit"), /"status": "committed"/);
  await h.restart();
  const before = await h.snapshot();
  assert.match(await example("commit"), /"status": "committed"/);
  assert.deepEqual(await h.snapshot(), before);
  const exported = await h.ok(`${root}/export`),
    file = join(dir, "export.json");
  await writeFile(file, JSON.stringify(exported));
  assert.match(
    (await run(process.execPath, ["scripts/check-intake-export.mjs", file]))
      .stdout,
    /PASS: 1 bundles, 2 original artifacts, 1 receipts, 0 no-op request bindings and 1 Cases/,
  );
  exported.commits[0].review_material.record.reported_owner =
    "coherently forged";
  delete exported.hash;
  exported.hash = sha256Json(exported);
  await writeFile(file, JSON.stringify(exported));
  await assert.rejects(
    run(process.execPath, ["scripts/check-intake-export.mjs", file]),
    (error) => error.code === 1 && error.stderr.includes("FAIL:"),
  );
});

test("D9 retry amendment: preparation no-op key cannot accept different valid bytes", async (t) => {
  const h = await intakeHost(t),
    input = await intakeInput("prepare-K1");
  await h.prepare(input);
  const noop = { ...input, idempotency_key: "prepare-K2" };
  assert.equal(
    (await h.ok(`${root}/preparations`, noop)).status,
    "already_retained",
  );
  const changed = editQueue(structuredClone(noop), (rows) => {
    rows[0].amount_minor = "1600000";
  });
  const result = await h.call(`${root}/preparations`, changed);
  t.diagnostic(
    JSON.stringify({
      operation: "prepare",
      changed_body_status: result.status,
      result: result.data.status ?? result.data.error,
    }),
  );
  assert.equal(result.status, 409);
  assert.equal(result.data.error, "IDEMPOTENCY_CONFLICT");
});
test("D9 retry amendment: commit no-op key cannot accept a different valid selection", async (t) => {
  const h = await intakeHost(t),
    view = await h.prepare(),
    first = await h.selection(view, 0, { key: "commit-K1" });
  await h.ok(`${root}/commits`, first);
  assert.equal(
    (await h.ok(`${root}/commits`, { ...first, idempotency_key: "commit-K2" }))
      .status,
    "already_committed",
  );
  const other = await h.selection(view, 1, { key: "commit-K2" });
  const result = await h.call(`${root}/commits`, other);
  t.diagnostic(
    JSON.stringify({
      operation: "commit",
      changed_body_status: result.status,
      result: result.data.status ?? result.data.error,
    }),
  );
  assert.equal(result.status, 409);
  assert.equal(result.data.error, "IDEMPOTENCY_CONFLICT");
});

for (const operation of ["prepare", "commit"]) {
  test(`D9 retry amendment ${operation}: metadata rollback, lost response, restart and competing keys preserve business history`, async (t) => {
    const h = await intakeHost(t),
      input = await intakeInput("original"),
      view = await h.prepare(input);
    const selection = await h.selection(view, 0, { key: "original" });
    const original = await h.ok(`${root}/commits`, selection);
    const path = `${root}/${operation === "prepare" ? "preparations" : "commits"}`;
    const command = {
      ...(operation === "prepare" ? input : selection),
      idempotency_key: "noop",
    };
    const before = await h.snapshot();
    h.setTime("2026-09-07T16:06:00.000Z");
    h.fault({ tag: "fr:intake_request_bindings-insert" });
    assert.equal((await h.call(path, command)).status, 500);
    assert.deepEqual(await h.snapshot(), before);
    h.fault({ tag: "COMMIT", after: true });
    assert.equal((await h.call(path, command)).status, 500);
    const recorded = await h.snapshot();
    assertNoopMetadata(before, recorded);
    await h.restart();
    h.setTime("2026-09-07T16:04:00.000Z");
    const result = await h.ok(path, command);
    assert.equal(
      result.status,
      operation === "prepare" ? "already_retained" : "already_committed",
    );
    if (operation === "prepare") assert.equal(result.bundle_id, view.bundle.id);
    else assert.deepEqual(result.receipt, original.receipt);
    assert.deepEqual(await h.ok(path, command), result);
    assert.deepEqual(await h.snapshot(), recorded);
    assert.equal(
      (await h.call(path, { ...command, idempotency_key: "backward-new" })).data
        .error,
      "CLOCK_REGRESSION",
    );
    assert.deepEqual(await h.snapshot(), recorded);
    h.setTime("2026-09-07T16:07:00.000Z");
    const concurrent = { ...command, idempotency_key: "concurrent" };
    const outcomes = await Promise.all([
      h.ok(path, concurrent),
      h.ok(path, concurrent),
    ]);
    assert.deepEqual(outcomes[0], outcomes[1]);
    assertNoopMetadata(recorded, await h.snapshot());
    const race = { ...command, idempotency_key: "different-bodies" };
    const changed =
      operation === "prepare"
        ? structuredClone(race)
        : await h.selection(
            await h.ok(`${root}/bundles/${view.bundle.id}`),
            0,
            {
              key: "different-bodies",
              reason: "Another explicitly reviewed request",
            },
          );
    if (operation === "prepare")
      changed.artifacts[0].name = "different-name.csv";
    const stable = await h.snapshot();
    const raced = await Promise.all([
      h.call(path, race),
      h.call(path, changed),
    ]);
    assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      raced.find((r) => r.status === 409).data.error,
      "IDEMPOTENCY_CONFLICT",
    );
    assertNoopMetadata(stable, await h.snapshot());
    const readOnly = await h.snapshot();
    const exported = await h.ok(`${root}/export`);
    assert.equal(exported.schema_version, "intake-export.v2");
    const restored = await intakeHost(t);
    await restoreIntakeFixture(restored, validateIntakeExport(exported));
    await restored.restart();
    assert.deepEqual(await restored.ok(path, command), result);
    assert.deepEqual(await restored.ok(`${root}/export`), exported);
    await h.ok(`${root}/bundles/${view.bundle.id}`);
    await h.selection(await h.ok(`${root}/bundles/${view.bundle.id}`));
    assert.deepEqual(await h.snapshot(), readOnly);
  });
}

test("D9 retry amendment: migration 0006 preserves original keys and v1 exports without inventing historical no-op keys", async (t) => {
  const source = await intakeHost(t),
    input = await intakeInput("legacy-prepare"),
    view = await source.prepare(input),
    selection = await source.selection(view, 0, { key: "legacy-commit" }),
    result = await source.ok(`${root}/commits`, selection);
  const v2 = await source.ok(`${root}/export`);
  const content = { ...v2 };
  delete content.hash;
  delete content.request_bindings;
  const legacyContent = { ...content, schema_version: "intake-export.v1" };
  const legacy = { ...legacyContent, hash: sha256Json(legacyContent) };
  const restored = await intakeHost(t, { upgrade: true });
  const { applyMigration } =
    await import("../dist/apps/worker/src/bootstrap.js");
  const { migrations } = await import("../tests/helpers/intake-postgres.mjs");
  await applyMigration(restored.pool, migrations[4]);
  await restoreIntakeFixture(restored, validateIntakeExport(legacy));
  const checksums = (
    await restored.pg.query(
      "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
    )
  ).rows;
  assert.equal(checksums.length, 5);
  await restored.upgrade();
  assert.deepEqual(
    (
      await restored.pg.query(
        "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
      )
    ).rows.slice(0, 5),
    checksums,
  );
  const before = await restored.snapshot();
  assert.equal(before.intake_request_bindings.length, 0);
  assert.equal(
    (await restored.ok(`${root}/preparations`, input)).status,
    "prepared",
  );
  assert.deepEqual(await restored.ok(`${root}/commits`, selection), result);
  assert.deepEqual(await restored.snapshot(), before);
  assert.equal(
    (
      await restored.call(`${root}/preparations`, {
        ...input,
        claims: { ...input.claims, coverage: "partial" },
      })
    ).data.error,
    "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    (
      await restored.call(`${root}/commits`, {
        ...selection,
        reason: "Changed",
      })
    ).data.error,
    "IDEMPOTENCY_CONFLICT",
  );
  // A never-retained historical no-op key remains unknowable. Its first post-upgrade success binds now.
  await restored.ok(`${root}/preparations`, {
    ...input,
    idempotency_key: "historically-unrecorded",
  });
  assertNoopMetadata(before, await restored.snapshot());
  await restored.restart();
  assert.equal((await restored.call("/readyz")).status, 200);
});

for (const operation of ["prepare", "commit"]) {
  test(`D9 retry amendment ${operation}: coherently altered request/result evidence fails replay and readiness`, async (t) => {
    const h = await intakeHost(t),
      input = await intakeInput("source"),
      view = await h.prepare(input),
      selection = await h.selection(view, 0, { key: "source" });
    await h.ok(`${root}/commits`, selection);
    const second = await h.ok(`${root}/commits`, await h.selection(view, 1));
    const other = await h.prepare(
      editQueue(await intakeInput("other"), (rows) => {
        rows[0].amount_minor = "1700000";
      }),
    );
    const path = `${root}/${operation === "prepare" ? "preparations" : "commits"}`;
    await h.ok(path, {
      ...(operation === "prepare" ? input : selection),
      idempotency_key: "noop",
    });
    const valid = await h.ok(`${root}/export`);
    for (const kind of ["fingerprint", "result", "scope"]) {
      const data = structuredClone(valid),
        b = data.request_bindings[0];
      if (kind === "fingerprint")
        b.request_fingerprint = `sha256:${"0".repeat(64)}`;
      if (kind === "scope") b.intake_scope_id = "scope_other";
      if (kind === "result")
        b.result =
          operation === "prepare"
            ? {
                status: "already_retained",
                bundle_id: other.bundle.id,
                bundle_hash: other.bundle.hash,
              }
            : {
                status: "already_committed",
                receipt_id: second.receipt.id,
                receipt_hash: second.receipt.hash,
              };
      const bound = { ...b };
      delete bound.hash;
      b.hash = sha256Json(bound);
      const outer = { ...data };
      delete outer.hash;
      data.hash = sha256Json(outer);
      assert.throws(() => validateIntakeExport(data));
    }
    const b = structuredClone(valid.request_bindings[0]);
    b.request_fingerprint = `sha256:${"0".repeat(64)}`;
    const bound = { ...b };
    delete bound.hash;
    b.hash = sha256Json(bound);
    const c = await h.pg.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL session_replication_role = replica");
      await c.query(
        "UPDATE intake_request_bindings SET binding=$1, binding_hash=$2, request_fingerprint=$3",
        [b, b.hash, b.request_fingerprint],
      );
      await c.query("COMMIT");
    } finally {
      c.release();
    }
    assert.equal((await h.call("/readyz")).status, 503);
    assert.equal(
      (await h.call(`${root}/bundles/${view.bundle.id}`)).status,
      500,
    );
    assert.equal((await h.call(`${root}/export`)).status, 500);
    await h.restart();
    assert.equal((await h.call("/readyz")).status, 503);
  });
}
