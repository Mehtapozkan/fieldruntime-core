import { PostgresDisputeResultStore } from "../../dist/packages/runtime/src/postgres-dispute-result-store.js";
import { fixedDisputeReader } from "../../dist/packages/runtime/src/dispute-source.js";
import { PostgresPreparationWorkStore } from "../../dist/packages/runtime/src/postgres-preparation-work-store.js";
import { syntheticWorkContext } from "../../dist/packages/runtime/src/preparation-work.js";
import { fixedPreparationPort } from "../../dist/packages/runtime/src/preparation-worker-port.js";
import { PostgresPreparationPackStore } from "../../dist/packages/runtime/src/postgres-preparation-pack-store.js";
import { syntheticPackContext } from "../../dist/packages/runtime/src/preparation-pack.js";
import { PostgresDiscoveryStore } from "../../dist/packages/runtime/src/postgres-discovery-store.js";
// Disposable test host only. Fault hooks never enter the appliance API.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createApiServer } from "../../dist/apps/api/src/server.js";
import { loadWorkbenchAssets } from "../../dist/apps/api/src/workbench-assets.js";
import { TransactionalCaseWorker } from "../../dist/apps/worker/src/command-service.js";
import { TransactionalIntakeWorker } from "../../dist/apps/worker/src/intake-service.js";
import {
  applyMigration,
  createMigrationSource,
} from "../../dist/apps/worker/src/bootstrap.js";
import { PostgresCaseStore } from "../../dist/packages/runtime/src/postgres-store.js";
import { PostgresIntakeStore } from "../../dist/packages/runtime/src/postgres-intake-store.js";
import { intakeInput, INTAKE_START } from "./intake.mjs";
export const migrationNames = [
  "0001_local_appliance",
  "0002_authority_request_review",
  "0003_simulated_credit",
  "0004_credit_verification",
  "0005_synthetic_intake",
  "0006_intake_request_bindings",
  "0007_discovery_review",
  "0008_preparation_pack_selection",
  "0009_preparation_work",
  "0010_preparation_continuation",
  "0011_dispute_result",
  "0012_bounded_investigation",
];
export const migrations = await Promise.all(
  migrationNames.map(async (name) =>
    createMigrationSource(
      name,
      await readFile(
        new URL(
          `../../packages/runtime/migrations/${name}.sql`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  ),
);
export async function intakeHost(
  t,
  {
    upgrade = false,
    beforePack = false,
    beforeWork = false,
    beforeContinuation = false,
    beforeResult = false,
    beforeInvestigation = false,
    work = false,
  } = {},
) {
  const url = process.env.D9_POSTGRES_URL ?? process.env.D6_POSTGRES_URL;
  assert.ok(
    url,
    "D9_POSTGRES_URL (or D6_POSTGRES_URL) must name local PostgreSQL; never skip",
  );
  assert.ok(
    ["localhost", "127.0.0.1"].includes(new URL(url).hostname) &&
      !new URL(url).search,
  );
  const schema = `d9_test_${randomUUID().replaceAll("-", "")}`,
    admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  let serverPort = 0,
    packEnabled = !upgrade && !beforePack,
    workEnabled = work && !beforeWork;
  let pg,
    pool,
    store,
    intake,
    server,
    base,
    time = new Date(INTAKE_START),
    ids = 0,
    clockReads = 0,
    hook,
    fault,
    workContext = syntheticWorkContext(),
    resultReader = fixedDisputeReader,
    resultEnabled =
      !upgrade &&
      !beforePack &&
      !beforeWork &&
      !beforeContinuation &&
      !beforeResult,
    workPort = fixedPreparationPort,
    workMonotonic = () => globalThis.performance.now(),
    packContext = workEnabled ? workContext.pack : syntheticPackContext();
  const trace = [],
    discarded = [];
  const now = () => {
    clockReads++;
    return time;
  };
  async function connect() {
    const c = await pg.connect();
    return {
      async query(sql, values) {
        trace.push(sql);
        if (hook) await hook(sql, values);
        const hit =
          fault &&
          (fault.tag === "COMMIT"
            ? sql === "COMMIT"
            : sql.includes(fault.tag)) &&
          --fault.remaining === 0;
        const active = hit ? fault : null;
        if (hit && !active.rollback) fault = null;
        if (sql === "ROLLBACK" && fault?.rollback) {
          fault = null;
          throw new Error("injected rollback failure");
        }
        if (hit && !active.after)
          throw new Error("injected persistence failure");
        const r = await c.query(sql, values);
        if (hit) throw new Error("injected lost acknowledgement");
        return r;
      },
      release(discard = false) {
        discarded.push(discard);
        c.release(discard);
      },
    };
  }
  function open() {
    pg = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
      max: 8,
    });
    pool = { connect };
    store = new PostgresCaseStore(pool);
    intake = new PostgresIntakeStore(pool);
  }
  async function migrate(sources) {
    for (const m of sources) await applyMigration(pool, m);
  }
  const dependencies = () => ({ now, nextId: (kind) => `${kind}_${++ids}` });
  async function start() {
    const worker = new TransactionalCaseWorker(store, { create: dependencies }),
      iw = new TransactionalIntakeWorker(
        intake,
        dependencies,
        new PostgresDiscoveryStore(pool),
        packEnabled
          ? new PostgresPreparationPackStore(pool, () => packContext)
          : undefined,
        workEnabled
          ? new PostgresPreparationWorkStore(
              pool,
              () => workContext,
              (input) => workPort(input),
              () => workMonotonic(),
            )
          : undefined,
      );
    server = createApiServer(
      {
        intake: iw,
        ...(resultEnabled
          ? {
              dispute: {
                submit: (command) =>
                  new PostgresDisputeResultStore(pool, () =>
                    resultReader(),
                  ).submit(command, now),
                read: (caseId, key) =>
                  new PostgresDisputeResultStore(pool, () =>
                    resultReader(),
                  ).read(caseId, key, now),
                export: (caseId, key) =>
                  new PostgresDisputeResultStore(pool, () =>
                    resultReader(),
                  ).export(caseId, key, now),
              },
            }
          : {}),
        isReady: async () => {
          if (resultEnabled)
            await new PostgresDisputeResultStore(pool, () =>
              resultReader(),
            ).assertReady();
          if (workEnabled)
            await new PostgresPreparationWorkStore(
              pool,
              () => workContext,
            ).assertReady();
          else if (packEnabled)
            await new PostgresPreparationPackStore(
              pool,
              () => packContext,
            ).assertReady();
          else await new PostgresDiscoveryStore(pool).assertReady();
          return true;
        },
        executeCaseCommand: (_tenant, cmd) => worker.execute(cmd),
        listCases: (t) => store.listCases(t),
        getCase: (t, c) => store.getCase(t, c),
        getJournal: (t, c) => store.getJournal(t, c),
        getEvaluationFixture: async () => undefined,
        getGuidedWalkthrough: async () => undefined,
      },
      await loadWorkbenchAssets(),
      now,
    );
    await new Promise((resolve) =>
      server.listen(serverPort, "127.0.0.1", resolve),
    );
    serverPort = server.address().port;
    base = `http://127.0.0.1:${serverPort}`;
  }
  async function stop() {
    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      server = undefined;
    }
    await pg.end();
  }
  t.after(async () => {
    await stop();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  open();
  await migrate(
    upgrade
      ? migrations.slice(0, 4)
      : beforePack
        ? migrations.slice(0, 7)
        : beforeWork
          ? migrations.slice(0, 8)
          : beforeContinuation
            ? migrations.slice(0, 9)
            : beforeResult
              ? migrations.slice(0, 10)
              : beforeInvestigation
                ? migrations.slice(0, 11)
                : migrations,
  );
  if (!upgrade) await start();

  async function call(path, body) {
    const r = await globalThis.fetch(
      `${base}${path}`,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const data = await r.json();
    return { status: r.status, data };
  }
  async function ok(path, body) {
    const r = await call(path, body);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  }
  async function prepare(input) {
    const r = await ok(
      "/v1/intake/preparations",
      input ?? (await intakeInput()),
    );
    return ok(`/v1/intake/bundles/${r.bundle_id}`);
  }
  async function selection(view, index = 0, options = {}) {
    const candidate = view.candidates[index],
      target =
        options.target ??
        (candidate.targets.length === 1
          ? {
              mode: "attach",
              case_id: candidate.targets[0].case_id,
              expected_case_version: candidate.targets[0].case_version,
            }
          : { mode: "create", expected_case_version: 0 });
    const review = {
      schema_version: "intake-review.v1",
      bundle_id: view.bundle.id,
      expected_bundle_hash: view.bundle.hash,
      record_key: candidate.record_key,
      expected_source_revision: candidate.record.source_revision,
      support_document_ids: candidate.support_document_ids,
      reviewed_links: candidate.reviewed_links,
      target,
      expected_prior_intake_binding: candidate.prior_intake_binding,
      prior_selection_hash: null,
      acknowledgments: candidate.required_acknowledgments,
      reason:
        "Synthetic operator reviewed source claims and target; impact is unconfirmed",
      ...options,
    };
    delete review.key;
    const preview = await ok("/v1/intake/selections/preview", review);
    return {
      ...review,
      schema_version: "intake-selection.v1",
      expected_material_key: preview.material_key,
      expected_consent_hash: preview.consent_hash,
      idempotency_key: options.key ?? `commit-${randomUUID()}`,
    };
  }
  async function snapshot() {
    const c = await pg.connect();
    try {
      const tables = [
        "runtime_writer_lock",
        ...(resultEnabled ? ["dispute_result_journal"] : []),
        "case_journal",
        "case_projections",
        "source_event_identities",
        "runtime_emitted_ids",
        "authority_catalog",
        "authority_snapshots",
        "authority_request_journal",
        "intake_artifacts",
        "intake_bundles",
        "intake_commits",
        "intake_request_bindings",
        "discovery_review_journal",
        ...(packEnabled ? ["preparation_pack_selection"] : []),
        ...(workEnabled ? ["preparation_work_journal"] : []),
      ];
      // A pre-0011 store has no result rows. Compare business content across the
      // additive upgrade; once installed the real table is always read/checked.
      const out = { dispute_result_journal: [] };
      for (const table of tables)
        out[table] = (
          await c.query(
            `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`,
          )
        ).rows;
      return out;
    } finally {
      c.release();
    }
  }
  return {
    get base() {
      return base;
    },
    get pg() {
      return pg;
    },
    get pool() {
      return pool;
    },
    get store() {
      return store;
    },
    get intake() {
      return intake;
    },
    get ids() {
      return ids;
    },
    get clockReads() {
      return clockReads;
    },
    dependencies,
    setResultReader: (reader) => {
      resultReader = reader;
    },
    setWorkContext: (value) => {
      workContext = value;
      packContext = value.pack;
    },
    setWorkPort: (value) => {
      workPort = value;
    },
    setWorkMonotonic: (value) => {
      workMonotonic = value;
    },
    setPackContext: (value) => {
      packContext = value;
    },
    trace,
    discarded,
    call,
    ok,
    prepare,
    selection,
    snapshot,
    setTime: (s) => {
      time = new Date(s);
    },
    fault: (f) => {
      fault = { remaining: 1, ...f };
    },
    hook: (f) => {
      hook = f;
    },
    restart: async () => {
      await stop();
      open();
      await start();
    },
    upgrade: async () => {
      if (server) {
        await stop();
        open();
      }
      await migrate(migrations.slice(4));
      packEnabled = true;
      resultEnabled = true;
      if (work || beforeWork) {
        workEnabled = true;
        packContext = workContext.pack;
      }
      await start();
    },
  };
}

export async function restoreIntakeFixture(fresh, source) {
  const { executeCaseCommand } =
      await import("../../dist/packages/runtime/src/case-engine.js"),
    { persistCaseCommandResult } =
      await import("../../dist/packages/runtime/src/postgres-store.js");
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
    for (const b of source.requestBindings ?? [])
      await c.query(
        "INSERT INTO intake_request_bindings VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          b.tenant_id,
          b.intake_scope_id,
          b.operation,
          b.idempotency_key,
          b.request_fingerprint,
          b.recorded_at,
          b.hash,
          b,
        ],
      );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
