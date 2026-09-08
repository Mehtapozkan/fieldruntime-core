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
export async function intakeHost(t, { upgrade = false } = {}) {
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
  let serverPort = 0;
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
    fault;
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
      iw = new TransactionalIntakeWorker(intake, dependencies);
    server = createApiServer(
      {
        intake: iw,
        isReady: async () => {
          await intake.assertReady();
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
  await migrate(upgrade ? migrations.slice(0, 4) : migrations);
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
      ];
      const out = {};
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
      await migrate(migrations.slice(4));
      await start();
    },
  };
}
