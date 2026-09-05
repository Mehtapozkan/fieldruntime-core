// Explicit integration suite: requires the credential-free local Compose PostgreSQL.
// Never silently skip: CI must actually execute PostgreSQL and the HTTP boundary.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createApiServer } from "../dist/apps/api/src/server.js";
import { loadWorkbenchAssets } from "../dist/apps/api/src/workbench-assets.js";
import { TransactionalCaseWorker } from "../dist/apps/worker/src/command-service.js";
import { TransactionalAuthorityWorker } from "../dist/apps/worker/src/authority-service.js";
import {
  applyMigration,
  createMigrationSource,
} from "../dist/apps/worker/src/bootstrap.js";
import {
  PostgresCaseStore,
  PostgresAuthorityStore,
  syntheticAuthorityCatalog,
  sha256Json,
} from "../dist/packages/runtime/src/index.js";
import {
  caseCommand,
  createRequestCommand,
  decideCommand,
  workEvent,
  START,
  TENANT,
} from "../tests/helpers/authority-review.mjs";

const databaseUrl = process.env.D6_POSTGRES_URL;
assert.ok(
  databaseUrl,
  "D6_POSTGRES_URL is required; PostgreSQL coverage must not be skipped",
);
const target = new URL(databaseUrl);
assert.ok(
  ["localhost", "127.0.0.1"].includes(target.hostname) && target.search === "",
  "integration database must be local",
);
const migrations = await Promise.all(
  ["0001_local_appliance", "0002_authority_request_review"].map(
    async (version) =>
      createMigrationSource(
        version,
        await readFile(
          new URL(
            `../packages/runtime/migrations/${version}.sql`,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
  ),
);
const assets = await loadWorkbenchAssets();
const root = `/v1/tenants/${TENANT}/authority-requests`;
const tables = [
  "runtime_writer_lock",
  "case_journal",
  "case_projections",
  "source_event_identities",
  "runtime_emitted_ids",
  "evaluation_demo_fixtures",
  "authority_catalog",
  "authority_snapshots",
  "authority_request_journal",
  "fieldruntime_schema_migrations",
];

async function fixture(t, { upgrade = false } = {}) {
  const schema = `d6_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);
  let pg, pool, server, baseUrl, store, authority;
  let time = new Date(START),
    ids = 0,
    fault,
    hook;
  const trace = [],
    discarded = [];
  const now = () => time;
  async function connect() {
    const client = await pg.connect();
    return {
      async query(sql, values) {
        trace.push(sql);
        if (hook) await hook(sql);
        const hit =
          fault &&
          (fault.tag === "COMMIT"
            ? sql === "COMMIT"
            : sql.includes(fault.tag)) &&
          --fault.remaining === 0;
        const active = hit ? fault : undefined;
        if (hit && !active.rollback) fault = undefined;
        if (hit && !active.after)
          throw new Error("injected persistence failure");
        if (sql === "ROLLBACK" && fault?.rollback) {
          fault = undefined;
          throw new Error("injected rollback failure");
        }
        const result = await client.query(sql, values);
        if (hit) throw new Error("injected acknowledgement loss");
        return result;
      },
      release(discard = false) {
        discarded.push(discard);
        client.release(discard);
      },
    };
  }
  function openPool() {
    pg = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
      max: 8,
    });
    pool = { connect };
    store = new PostgresCaseStore(pool);
    authority = new PostgresAuthorityStore(pool);
  }
  async function startServer() {
    const worker = new TransactionalCaseWorker(store, {
      create: () => ({ now, nextId: (kind) => `${kind}_${++ids}` }),
    });
    const review = new TransactionalAuthorityWorker(authority, () => ({
      now,
      nextId: (kind) => `${kind}_${++ids}`,
    }));
    server = createApiServer(
      {
        isReady: async () => {
          await store.assertReady();
          await authority.assertReady(TENANT);
          return true;
        },
        executeCaseCommand: (_tenant, command) => worker.execute(command),
        listCases: (tenant) => store.listCases(tenant),
        getCase: (tenant, id) => store.getCase(tenant, id),
        getJournal: (tenant, id) => store.getJournal(tenant, id),
        getEvaluationFixture: async () => undefined,
        getGuidedWalkthrough: async () => undefined,
        authority: {
          create: (command) => review.create(command),
          decide: (command, seat) => review.decide(command, seat),
          read: (tenant, id) => authority.readRequest(tenant, id, now),
          catalogRevision: (tenant) => authority.readCatalogRevision(tenant),
        },
      },
      assets,
    );
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = undefined;
    }
    await pg.end();
  }
  openPool();
  t.after(async () => {
    await stop();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  await applyMigration(pool, migrations[0]);
  let priorCase;
  if (upgrade) {
    const worker = new TransactionalCaseWorker(store, {
      create: () => ({ now, nextId: (kind) => `${kind}_${++ids}` }),
    });
    await worker.execute(caseCommand());
    priorCase = await store.getCase(TENANT, "case_d6_demo");
  }
  await applyMigration(pool, migrations[1]);
  assert.equal(await applyMigration(pool, migrations[0]), "unchanged");
  assert.equal(await applyMigration(pool, migrations[1]), "unchanged");
  await assert.rejects(
    () =>
      applyMigration(
        pool,
        createMigrationSource(
          migrations[0].version,
          `${migrations[0].sql}\n-- checksum drift`,
        ),
      ),
    /different checksum/,
  );
  if (upgrade)
    assert.deepEqual(await store.getCase(TENANT, "case_d6_demo"), priorCase);
  await authority.initializeCatalog(TENANT, syntheticAuthorityCatalog(), now);
  await startServer();
  async function request(path, command, expected = 200) {
    const response = await globalThis.fetch(`${baseUrl}${path}`, {
      ...(command
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(command),
          }
        : {}),
      signal: globalThis.AbortSignal.timeout(30_000),
    });
    const body = await response.json();
    assert.ok(
      (Array.isArray(expected) ? expected : [expected]).includes(
        response.status,
      ),
      `HTTP ${response.status}: ${JSON.stringify(body)}`,
    );
    return body;
  }
  const api = {
    request,
    trace,
    discarded,
    get ids() {
      return ids;
    },
    get authority() {
      return authority;
    },
    now,
    advance(ms) {
      time = new Date(time.valueOf() + ms);
    },
    inject(tag, { after = false, remaining = 1, rollback = false } = {}) {
      fault = { tag, after, remaining, rollback };
    },
    setHook(value) {
      hook = value;
    },
    sql: (sql, values) => pg.query(sql, values),
    async dump() {
      return Object.fromEntries(
        await Promise.all(
          tables.map(async (table) => [
            table,
            (
              await pg.query(
                `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`,
              )
            ).rows,
          ]),
        ),
      );
    },
    async restart() {
      await stop();
      openPool();
      await authority.initializeCatalog(
        TENANT,
        syntheticAuthorityCatalog(),
        now,
      );
      await startServer();
    },
    case: (command, expected = 200) =>
      request(`/v0/tenants/${TENANT}/case-commands`, command, expected),
    read: (id) => request(`${root}/${id}/packet`),
    async create(key = "request:demo", overrides = {}) {
      return (
        await request(
          root,
          createRequestCommand("case_d6_demo", key, overrides),
        )
      ).receipt.authority_request_id;
    },
    async decide(id, seat, decision = "approve", overrides = {}) {
      const packet = await api.read(id);
      return request(
        `${root}/${id}/decisions/${seat}`,
        decideCommand(packet, `vote:${++ids}`, decision, overrides),
      );
    },
    async catalog(edit) {
      const row = (
        await pg.query(
          "SELECT s.content FROM authority_catalog c JOIN authority_snapshots s ON s.tenant_id = c.tenant_id AND s.snapshot_hash = c.snapshot_hash",
        )
      ).rows[0];
      const data = structuredClone(row.content.data);
      edit(data);
      await authority.replaceCatalog(TENANT, data, row.content.revision, now);
    },
  };
  if (!upgrade) assert.equal((await api.case(caseCommand())).status, "applied");
  return api;
}

for (const upgrade of [false, true])
  test(`PostgreSQL ${upgrade ? "preview upgrade preserves Case history" : "fresh install"}: HTTP two-person review survives restart`, async (t) => {
    const h = await fixture(t, { upgrade }),
      id = await h.create();
    const created = await h.read(id);
    assert.deepEqual(
      [
        created.case_version,
        created.review_revision,
        created.authority_state_revision,
      ],
      [1, 0, 1],
    );
    assert.equal(
      (await h.decide(id, "finance")).receipt.result.authorized,
      false,
    );
    assert.equal(
      (await h.decide(id, "executive")).receipt.result.authorized,
      true,
    );
    const approved = await h.read(id);
    assert.deepEqual(
      [
        approved.case_version,
        approved.review_revision,
        approved.authority_state_revision,
      ],
      [1, 2, 1],
    );
    assert.equal(approved.current.effective_approval_ids.length, 2);
    assert.equal(approved.action_permission, false);
    assert.equal(
      (await h.request(`/v0/tenants/${TENANT}/cases/case_d6_demo/journal`))
        .entries.length,
      1,
    );
    const before = await h.dump(),
      ids = h.ids;
    h.trace.length = 0;
    h.advance(1000);
    for (let i = 0; i < 3; i++) {
      await h.read(id);
      await h.request(`${root}/${id}`);
    }
    assert.deepEqual(await h.dump(), before);
    assert.equal(h.ids, ids);
    assert.ok(
      h.trace.includes("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"),
    );
    assert.ok(
      h.trace.every((sql) => !/FOR UPDATE|INSERT|UPDATE|DELETE/i.test(sql)),
    );
    await h.restart();
    const restored = await h.read(id);
    assert.deepEqual(restored.history, approved.history);
    assert.deepEqual(
      restored.historical_evaluations,
      approved.historical_evaluations,
    );
    assert.deepEqual(restored.material, approved.material);
    assert.equal(restored.current.authorized, true);
    assert.deepEqual(await h.dump(), before);
  });

test("HTTP rejects altered bindings, stale R, privilege injection, unknown actors and idempotency drift", async (t) => {
  const h = await fixture(t),
    id = await h.create(),
    packet = await h.read(id);
  const path = `${root}/${id}/decisions/finance`;
  for (const extra of [
    { request_binding_hash: `sha256:${"0".repeat(64)}` },
    { expected_review_revision: 2 },
  ]) {
    await h.request(
      path,
      decideCommand(packet, "bad-binding", "approve", extra),
      409,
    );
  }
  const before = await h.dump();
  for (const extra of [
    "identity",
    "privileges",
    "authority_records",
    "policy",
    "evidence",
    "authorization_result",
    "asOf",
    "presented_view_hash",
    "authority_decision_id",
  ]) {
    await h.request(
      path,
      decideCommand(packet, "injection", "approve", { [extra]: {} }),
      400,
    );
  }
  await h.request(
    `${root}/${id}/decisions/evaluator`,
    decideCommand(packet, "service"),
    400,
  );
  await h.request(
    `${root}/${id}/decisions/business`,
    decideCommand(packet, "owner-not-finance"),
    409,
  );
  await h.request(
    path.replace(TENANT, "tenant_other"),
    decideCommand(packet, "tenant-injection"),
    400,
  );
  assert.deepEqual(await h.dump(), before);
  const command = decideCommand(packet, "finance-once");
  const applied = await h.request(path, command);
  await h.restart();
  const ids = h.ids,
    after = await h.dump();
  assert.deepEqual((await h.request(path, command)).receipt, applied.receipt);
  assert.equal(h.ids, ids);
  await h.request(path, { ...command, correlation_id: "changed" }, 409);
  await h.request(path, decideCommand(await h.read(id), "second-vote"), 409);
  assert.deepEqual(await h.dump(), after);
});

for (const rejected of [false, true])
  test(`HTTP ${rejected ? "D-014 rejection" : "new evidence"} between approvals stales the request`, async (t) => {
    const h = await fixture(t),
      id = await h.create();
    await h.decide(id, "finance");
    const viewed = await h.read(id);
    const base = {
      tenant_id: TENANT,
      case_id: "case_d6_demo",
      expected_case_version: 1,
      actor_identity_id: "identity_d6_operator",
      idempotency_key: "case-change",
      correlation_id: "case-change",
    };
    const change = await h.case(
      rejected
        ? {
            ...base,
            type: "case.transition",
            to_state: "resolved",
            reason: "Incomplete closure proof must fail",
          }
        : {
            ...base,
            type: "case.attach_work_event",
            work_event: workEvent("new_evidence", "update"),
          },
    );
    assert.equal(change.status, rejected ? "rejected" : "applied");
    const current = await h.read(id);
    assert.deepEqual([current.case_version, current.review_revision], [2, 1]);
    assert.deepEqual(current.current.reason_codes, ["stale_case"]);
    await h.request(
      `${root}/${id}/decisions/executive`,
      decideCommand(viewed, "stale-case"),
      409,
    );
    const replacement = await h.create("fresh-case", {
      expected_case_version: 2,
      predecessor_authority_request_id: id,
    });
    assert.equal((await h.read(replacement)).review_revision, 0);
    assert.notEqual(
      (await h.read(replacement)).request.review_material_hash,
      viewed.request.review_material_hash,
    );
  });

for (const change of ["policy", "delegation", "identity"])
  test(`PostgreSQL ${change} catalog change without a Case event invalidates; restored bytes cannot revive`, async (t) => {
    const h = await fixture(t),
      id = await h.create();
    await h.decide(id, "finance");
    const viewed = await h.read(id),
      old = (
        await h.sql(
          "SELECT s.content FROM authority_catalog c JOIN authority_snapshots s ON s.snapshot_hash=c.snapshot_hash",
        )
      ).rows[0].content.data;
    await h.catalog((data) => {
      if (change === "policy")
        data.policies[0].rules[0].condition.maximum_amount_minor = 400000;
      if (change === "delegation") {
        data.delegations[0].status = "revoked";
        data.delegations[0].revocation = {
          revoked_by_identity: data.identities.find(
            (i) => i.identity_id === "identity_d6_executive",
          ),
          revoked_at: START,
          revoked_at_source_timezone: "UTC",
          reason: "Synthetic grant withdrawn",
          source_ref: "synthetic://d6/revocation",
        };
      }
      if (change === "identity")
        data.identities.find(
          (i) => i.identity_id === "identity_d6_executive",
        ).status = "revoked";
    });
    const current = await h.read(id);
    assert.deepEqual(
      [
        current.case_version,
        current.review_revision,
        current.authority_state_revision,
      ],
      [1, 1, 2],
    );
    assert.deepEqual(current.current.reason_codes, ["authority_state_changed"]);
    await h.request(
      `${root}/${id}/decisions/executive`,
      decideCommand(viewed, "catalog-stale"),
      409,
    );
    await h.authority.replaceCatalog(TENANT, old, 2, h.now);
    assert.equal((await h.read(id)).current.authorized, false);
    assert.equal((await h.read(id)).authority_state_revision, 3);
    const fresh = await h.create("fresh-catalog", {
      expected_authority_state_revision: 3,
    });
    assert.equal((await h.read(fresh)).review_revision, 0);
    await h.restart();
    assert.equal((await h.read(id)).authority_state_revision, 3);
  });

function delegateRoute(data) {
  for (const rule of data.policies[0].rules)
    for (const requirement of rule.requirements)
      if (requirement.authority_class === "finance_approver")
        requirement.named_approver_identity_ids = [
          "identity_d6_finance_delegate",
        ];
  data.delegations[0].effective_until = "2026-09-06T16:10:00.000Z";
}
test("HTTP grant and request expiry, runtime-clock regression and historical receipt separation", async (t) => {
  const h = await fixture(t);
  await h.catalog(delegateRoute);
  const id = await h.create("delegated", {
    expected_authority_state_revision: 2,
  });
  await h.decide(id, "finance_delegate");
  const viewed = await h.read(id),
    command = decideCommand(viewed, "executive-once"),
    path = `${root}/${id}/decisions/executive`;
  const receipt = (await h.request(path, command)).receipt;
  assert.equal(receipt.result.authorized, true);
  h.advance(-1000);
  await h.request(
    path,
    decideCommand(await h.read(id), "clock-regressed", "reject", {
      reason: "veto",
    }),
    409,
  );
  h.advance(601000);
  const expiredGrant = await h.read(id);
  assert.equal(expiredGrant.authority_state_revision, 2);
  assert.equal(expiredGrant.current.authorized, false);
  assert.ok(
    !expiredGrant.current.effective_approval_ids.includes(
      viewed.history[1].decision.authority_decision_id,
    ),
  );
  await h.request(
    `${root}/${id}/decisions/finance_delegate`,
    decideCommand(expiredGrant, "expired-grant", "reject", {
      reason: "cannot use expired authority",
    }),
    409,
  );
  h.advance(3000000);
  assert.deepEqual((await h.read(id)).current.reason_codes, [
    "request_expired",
  ]);
  await h.request(
    path,
    decideCommand(await h.read(id), "expired-request", "reject", {
      reason: "too late",
    }),
    409,
  );
  await h.restart();
  const before = await h.dump();
  assert.deepEqual((await h.request(path, command)).receipt, receipt);
  assert.equal((await h.read(id)).current.authorized, false);
  assert.deepEqual(await h.dump(), before);
});

for (const disposition of ["reject", "modify", "escalate"])
  test(`HTTP ${disposition} after complete approval is terminal; modify replaces atomically`, async (t) => {
    const h = await fixture(t),
      id = await h.create();
    await h.decide(id, "finance");
    await h.decide(id, "executive");
    const result = await h.decide(id, "executive", disposition, {
      reason: "Reviewed changed recommendation",
      ...(disposition === "modify"
        ? { replacement_proposal_key: "credit_12000" }
        : {}),
    });
    assert.equal(result.status, "applied");
    const packet = await h.read(id);
    assert.equal(packet.review_revision, 3);
    assert.equal(
      packet.current.lifecycle,
      { reject: "rejected", modify: "superseded", escalate: "escalated" }[
        disposition
      ],
    );
    assert.deepEqual(packet.current.effective_approval_ids, []);
    await h.request(
      `${root}/${id}/decisions/finance`,
      decideCommand(packet, "revive"),
      409,
    );
    if (disposition === "modify") {
      const replacement = await h.read(
        result.receipt.replacement_authority_request_id,
      );
      assert.equal(replacement.request.predecessor_authority_request_id, id);
      assert.equal(replacement.review_revision, 0);
      assert.deepEqual(replacement.current.effective_approval_ids, []);
      assert.notEqual(
        replacement.request_binding_hash,
        packet.request_binding_hash,
      );
      await h.restart();
      assert.deepEqual(
        (await h.read(replacement.authority_request_id)).history,
        replacement.history,
      );
    }
  });

test("PostgreSQL simultaneous approvals require refresh; no silent revision rebasing", async (t) => {
  const h = await fixture(t),
    id = await h.create(),
    viewed = await h.read(id);
  const results = await Promise.all(
    ["finance", "executive"].map(async (seat) => {
      const command = decideCommand(viewed, `race:${seat}`);
      return {
        seat,
        result: await h.request(
          `${root}/${id}/decisions/${seat}`,
          command,
          [200, 409],
        ),
      };
    }),
  );
  assert.equal(results.filter((r) => r.result.status === "conflict").length, 1);
  assert.equal((await h.read(id)).review_revision, 1);
  const loser = results.find((r) => r.result.status === "conflict").seat;
  assert.equal((await h.decide(id, loser)).receipt.result.authorized, true);
  assert.equal((await h.read(id)).review_revision, 2);
});

test("PostgreSQL repeatable packet snapshot does not block behind a held writer lock", async (t) => {
  const h = await fixture(t),
    id = await h.create(),
    before = await h.dump();
  let releaseRead, enteredRead;
  const readEntered = new Promise((r) => {
    enteredRead = r;
  });
  const continueRead = new Promise((r) => {
    releaseRead = r;
  });
  let intercepted = false;
  h.setHook(async (sql) => {
    if (!intercepted && sql.includes("fr:authority-load-catalog")) {
      intercepted = true;
      enteredRead();
      await continueRead;
    }
  });
  const reading = h.read(id);
  await readEntered;
  await h.catalog((data) => {
    data.policies[0].rules[0].condition.maximum_amount_minor = 300000;
  });
  releaseRead();
  const packet = await reading;
  h.setHook(undefined);
  assert.equal(packet.authority_state_revision, 1);
  assert.equal((await h.read(id)).authority_state_revision, 2);
  const blockerPool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${(await h.sql("SELECT current_schema() AS schema")).rows[0].schema}`,
  });
  const blocker = await blockerPool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT revision FROM runtime_writer_lock FOR UPDATE");
    assert.equal((await h.read(id)).authority_state_revision, 2);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await blockerPool.end();
  }
  assert.equal(
    before.authority_request_journal.length,
    (await h.dump()).authority_request_journal.length,
  );
});

for (const [tag, remaining] of [
  ["authority-insert-snapshot", 1],
  ["authority-insert-snapshot", 2],
  ["authority-insert-snapshot", 3],
  ["authority-insert-journal", 1],
  ["authority-insert-journal", 2],
  ["authority-clock", 1],
  ["authority-increment-writer", 1],
  ["authority-load-journal", 2],
  ["COMMIT", 1],
])
  test(`PostgreSQL rollback at ${tag} #${remaining} exposes neither half of modify; retry survives restart`, async (t) => {
    const h = await fixture(t),
      id = await h.create();
    await h.decide(id, "finance");
    const packet = await h.read(id),
      command = decideCommand(packet, "atomic-modify", "modify", {
        reason: "Revised amount",
        replacement_proposal_key: "credit_12000",
      });
    const path = `${root}/${id}/decisions/executive`,
      before = await h.dump();
    h.inject(tag, { after: tag !== "COMMIT", remaining });
    await h.request(path, command, 500);
    assert.deepEqual(await h.dump(), before);
    await h.restart();
    const applied = await h.request(path, command);
    assert.equal(applied.status, "applied");
    assert.equal((await h.read(id)).current.lifecycle, "superseded");
    assert.equal(
      (await h.read(applied.receipt.replacement_authority_request_id))
        .review_revision,
      0,
    );
  });

test("PostgreSQL uncertain COMMIT returns the same receipt after restart; failed rollback discards client", async (t) => {
  const h = await fixture(t),
    id = await h.create(),
    packet = await h.read(id),
    command = decideCommand(packet, "uncertain");
  const path = `${root}/${id}/decisions/finance`;
  h.inject("COMMIT", { after: true });
  await h.request(path, command, 500);
  const after = await h.dump();
  await h.restart();
  const duplicate = await h.request(path, command);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.receipt.review_revision, 1);
  assert.deepEqual(await h.dump(), after);
  h.inject("authority-insert-journal", { rollback: true });
  await h.request(
    `${root}/${id}/decisions/executive`,
    decideCommand(await h.read(id), "rollback-failure"),
    500,
  );
  assert.ok(h.discarded.includes(true));
  assert.deepEqual(await h.dump(), after);
});

test("PostgreSQL append-only constraints and snapshot tampering fail closed at HTTP/readiness", async (t) => {
  const h = await fixture(t),
    id = await h.create();
  await h.decide(id, "finance");
  for (const table of ["authority_snapshots", "authority_request_journal"])
    for (const action of [
      `UPDATE ${table} SET tenant_id=tenant_id`,
      `DELETE FROM ${table}`,
      `TRUNCATE ${table} CASCADE`,
    ])
      await assert.rejects(() => h.sql(action), /append-only/);
  await assert.rejects(() =>
    h.sql("UPDATE authority_catalog SET revision=revision-1"),
  );
  const packet = await h.read(id),
    snapshot = packet.request.review_material_hash;
  await h.sql(
    "ALTER TABLE authority_snapshots DISABLE TRIGGER authority_snapshots_append_only",
  );
  await h.sql(
    "UPDATE authority_snapshots SET content=jsonb_set(content, '{recommendation}', '\"tampered consent\"') WHERE snapshot_hash=$1",
    [snapshot],
  );
  await h.sql(
    "ALTER TABLE authority_snapshots ENABLE TRIGGER authority_snapshots_append_only",
  );
  await h.request(`${root}/${id}/packet`, undefined, 500);
  await h.request("/readyz", undefined, 503);
  await h.request(
    `${root}/${id}/decisions/executive`,
    decideCommand(packet, "tampered"),
    500,
  );
  assert.equal(
    (await h.sql("SELECT count(*) AS count FROM authority_request_journal"))
      .rows[0].count,
    "2",
  );
  assert.notEqual(
    sha256Json(
      (
        await h.sql(
          "SELECT content FROM authority_snapshots WHERE snapshot_hash=$1",
          [snapshot],
        )
      ).rows[0].content,
    ),
    snapshot,
  );
});

test("PostgreSQL direct/business and named delegate approval; later-effective grant cannot rescue an earlier vote", async (t) => {
  const h = await fixture(t);
  const small = await h.create("business-route", {
    proposal_key: "credit_4000",
  });
  assert.equal(
    (await h.decide(small, "business")).receipt.result.authorized,
    true,
  );
  await h.catalog((data) => {
    delegateRoute(data);
    const a = data.delegations[0];
    a.effective_until = "2026-09-06T16:06:15.000Z";
    data.delegations.push({
      ...structuredClone(a),
      delegation_id: "delegation_d6_future",
      effective_from: "2026-09-06T16:06:30.000Z",
      effective_until: "2026-09-06T16:30:00.000Z",
    });
  });
  h.advance(360000);
  const id = await h.create("future-grant", {
    expected_authority_state_revision: 2,
  });
  await h.decide(id, "finance_delegate");
  const approval = (await h.read(id)).history[1].decision;
  assert.equal(approval.decided_at, "2026-09-06T16:06:00.000Z");
  h.advance(60000);
  const executive = await h.decide(id, "executive");
  assert.equal(executive.receipt.result.authorized, false);
  assert.ok(
    !executive.receipt.result.effective_approval_ids.includes(
      approval.authority_decision_id,
    ),
  );
});

for (const change of ["case", "catalog"])
  test(`PostgreSQL concurrent review and ${change} write serialize; final approval is ineffective`, async (t) => {
    const h = await fixture(t),
      id = await h.create();
    await h.decide(id, "finance");
    const packet = await h.read(id);
    let release, entered;
    const reached = new Promise((r) => {
      entered = r;
    });
    const proceed = new Promise((r) => {
      release = r;
    });
    let blocked = false;
    h.setHook(async (sql) => {
      if (!blocked && sql.includes("fr:authority-load-catalog")) {
        blocked = true;
        entered();
        await proceed;
      }
    });
    const reviewing = h.request(
      `${root}/${id}/decisions/executive`,
      decideCommand(packet, "review-race"),
    );
    await reached; // The review now holds the existing singleton writer lock.
    const changing =
      change === "case"
        ? h.case({
            type: "case.attach_work_event",
            tenant_id: TENANT,
            case_id: "case_d6_demo",
            expected_case_version: 1,
            actor_identity_id: "identity_d6_operator",
            idempotency_key: "race-case",
            correlation_id: "race-case",
            work_event: workEvent("race_evidence", "update"),
          })
        : h.catalog((data) => {
            data.policies[0].rules[0].condition.maximum_amount_minor = 400000;
          });
    release();
    const receipt = (await reviewing).receipt;
    await changing;
    h.setHook(undefined);
    assert.equal(receipt.result.authorized, true); // historical before the serialized change
    const current = await h.read(id);
    assert.equal(current.current.authorized, false);
    assert.deepEqual(current.current.reason_codes, [
      change === "case" ? "stale_case" : "authority_state_changed",
    ]);
    assert.equal(current.review_revision, 2);
  });

test("PostgreSQL catalog reordering is harmless; changed catalog persistence rolls back atomically", async (t) => {
  const h = await fixture(t),
    id = await h.create(),
    before = await h.dump();
  await h.catalog((data) => {
    data.identities.reverse();
    data.authority_records.reverse();
    data.delegations.reverse();
  });
  assert.deepEqual(await h.dump(), before);
  for (const tag of [
    "authority-insert-snapshot",
    "authority-update-catalog",
    "authority-increment-writer",
  ]) {
    h.inject(tag, { after: true });
    await assert.rejects(
      () =>
        h.catalog((data) => {
          data.policies[0].rules[0].condition.maximum_amount_minor = 400000;
        }),
      /injected/,
    );
    assert.deepEqual(await h.dump(), before);
    assert.equal((await h.read(id)).authority_state_revision, 1);
  }
});

for (const [tag, remaining] of [
  ["authority-insert-snapshot", 1],
  ["authority-insert-snapshot", 2],
  ["authority-insert-journal", 1],
  ["authority-clock", 1],
  ["authority-increment-writer", 1],
  ["authority-load-journal", 2],
  ["COMMIT", 1],
])
  test(`PostgreSQL request creation rollback at ${tag} #${remaining} reserves no durable IDs or snapshots`, async (t) => {
    const h = await fixture(t),
      before = await h.dump(),
      command = createRequestCommand();
    h.inject(tag, { after: tag !== "COMMIT", remaining });
    await h.request(root, command, 500);
    assert.deepEqual(await h.dump(), before);
    await h.restart();
    assert.equal((await h.request(root, command)).status, "applied");
  });

test("PostgreSQL deferred constraints reject half of a replacement even if store rehydration is bypassed", async (t) => {
  const h = await fixture(t),
    id = await h.create();
  const original = (await h.sql("SELECT * FROM authority_request_journal"))
    .rows[0];
  const entry = structuredClone(original.entry);
  // A forged second creation claims an atomic replacement parent that does not exist.
  entry.id = "review_orphan";
  entry.authority_request_id = "request_orphan";
  entry.position = 2;
  entry.replaces_entry_id = "review_absent";
  entry.request.authority_request_id = "request_orphan";
  entry.idempotency_key = "orphan";
  const columns = {
    ...original,
    id: entry.id,
    position: 2,
    authority_request_id: entry.authority_request_id,
    idempotency_key: "orphan",
    replaces_entry_id: "review_absent",
    entry,
  };
  const generated = new Set(["previous_revision", "creation_revision"]);
  const names = Object.keys(columns).filter((key) => !generated.has(key));
  await assert.rejects(
    () =>
      h.sql(
        `INSERT INTO authority_request_journal (${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")})`,
        names.map((key) => columns[key]),
      ),
    /foreign key|orphan authority replacement/,
  );
  assert.equal((await h.read(id)).review_revision, 0);
});
