import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import test from "node:test";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import { intakeInput } from "../tests/helpers/intake.mjs";
import { validateIntakeExport } from "../dist/packages/runtime/src/intake-integrity.js";
const root = "/v1/intake";
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
  assert.equal(retry.status, "duplicate");
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
  assert.deepEqual(await h.snapshot(), before);
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
  assert.deepEqual(await h.snapshot(), before);
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
    "duplicate",
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
  assert.equal(retry.status, "duplicate");
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
  const { executeCaseCommand } =
      await import("../dist/packages/runtime/src/case-engine.js"),
    { persistCaseCommandResult } =
      await import("../dist/packages/runtime/src/postgres-store.js");
  const c = await fresh.pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "SELECT revision FROM runtime_writer_lock WHERE singleton_id=1 FOR UPDATE",
    );
    for (const [hash, bytes] of source.artifacts)
      await c.query("INSERT INTO intake_artifacts VALUES ($1,$2,$3)", [
        "tenant_intake_demo",
        hash,
        bytes,
      ]);
    for (const b of source.bundles)
      await c.query(
        "INSERT INTO intake_bundles SELECT * FROM jsonb_populate_record(NULL::intake_bundles,$1)",
        [
          {
            tenant_id: b.tenant_id,
            id: b.id,
            bundle_hash: b.hash,
            preparation_key: b.preparation_key,
            preparation_fingerprint: b.preparation_fingerprint,
            ingested_at: b.ingested_at,
            retained_at: b.retained_at,
            bundle: b,
          },
        ],
      );
    let state = {
      cases: [],
      idempotency_records: [],
      source_event_records: [],
    };
    for (const receipt of source.commits) {
      const entry = source.cases.cases.find(
          (c) => c.case_id === receipt.case_id,
        ).journal[receipt.case_version - 1],
        audit =
          entry.payload.audit_entry ?? entry.payload.document.audit_entries[0];
      const applied = executeCaseCommand(state, receipt.adapted_command, {
        now: () => new Date(receipt.recorded_at),
        nextId: (kind) => (kind === "audit_entry" ? audit.id : entry.id),
      });
      assert.equal(applied.status, "applied");
      assert.deepEqual(applied.entry, entry);
      await persistCaseCommandResult(c, state, applied);
      state = applied.state;
      const row = {
        tenant_id: receipt.tenant_id,
        id: receipt.id,
        sequence: receipt.sequence,
        receipt_hash: receipt.hash,
        bundle_id: receipt.selection.bundle_id,
        record_key: receipt.record_key,
        material_key: receipt.material_key,
        case_root: receipt.case_root,
        upstream_key: receipt.upstream_key,
        case_id: receipt.case_id,
        case_version: receipt.case_version,
        journal_entry_id: receipt.journal_entry_id,
        journal_entry_hash: receipt.journal_entry_hash,
        previous_intake_hash: receipt.previous_intake_hash,
        idempotency_key: receipt.idempotency_key,
        command_fingerprint: receipt.command_fingerprint,
        recorded_at: receipt.recorded_at,
        receipt,
      };
      await c.query(
        "INSERT INTO intake_commits SELECT * FROM jsonb_populate_record(NULL::intake_commits,$1)",
        [row],
      );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  await fresh.restart();
  assert.deepEqual(await fresh.ok(`${root}/export`), exported);
  assert.equal((await fresh.call("/readyz")).status, 200);
  const before = await fresh.snapshot();
  const retried = await fresh.ok(
    `${root}/commits`,
    source.commits[0].selection,
  );
  assert.equal(retried.status, "duplicate");
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
  assert.match(await example("commit"), /"status": "duplicate"/);
  assert.deepEqual(await h.snapshot(), before);
  const exported = await h.ok(`${root}/export`),
    file = join(dir, "export.json");
  await writeFile(file, JSON.stringify(exported));
  assert.match(
    (await run(process.execPath, ["scripts/check-intake-export.mjs", file]))
      .stdout,
    /PASS: 1 bundles, 2 original artifacts, 1 receipts and 1 Cases/,
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
