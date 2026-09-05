import { PostgresCreditVerificationStore } from "../dist/packages/runtime/src/postgres-credit-verification-store.js";
import { TransactionalCreditVerificationWorker } from "../dist/apps/worker/src/credit-verification-service.js";
import {
  createReviewClient,
  PENDING_PREFIX,
} from "../apps/admin/public/authority-client.js";
import {
  CREDIT_ROOT,
  canExecuteCredit,
  latestCheck,
  validateCredit,
} from "../apps/admin/public/credit-client.js";
import { memoryStorage } from "../tests/helpers/authority-browser-api.mjs";
// Real PostgreSQL and HTTP; no skipped or in-memory substitute acceptance tests.
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createApiServer } from "../dist/apps/api/src/server.js";
import { loadWorkbenchAssets } from "../dist/apps/api/src/workbench-assets.js";
import { TransactionalCaseWorker } from "../dist/apps/worker/src/command-service.js";
import { TransactionalAuthorityWorker } from "../dist/apps/worker/src/authority-service.js";
import { TransactionalCreditWorker } from "../dist/apps/worker/src/simulated-credit-service.js";
import {
  applyMigration,
  createMigrationSource,
} from "../dist/apps/worker/src/bootstrap.js";
import {
  PostgresAuthorityStore,
  PostgresCaseStore,
  syntheticAuthorityCatalog,
  sha256Json,
  CREDIT_ACTION_HASH,
} from "../dist/packages/runtime/src/index.js";
import { PostgresSimulatedCreditStore } from "../dist/packages/runtime/src/postgres-simulated-credit-store.js";
import { loadAuthorityStore } from "../dist/packages/runtime/src/postgres-authority-store.js";
import {
  CREDIT_COLUMNS,
  loadCreditEvidence,
} from "../dist/packages/runtime/src/postgres-credit-evidence.js";
import {
  assertCreditIntegrity,
  creditEntry,
  creditSource,
  evaluateCredit,
} from "../dist/packages/runtime/src/simulated-credit.js";
import {
  caseCommand,
  createRequestCommand,
  decideCommand,
  workEvent,
  START,
  TENANT,
} from "../tests/helpers/authority-review.mjs";
const url = process.env.D7_POSTGRES_URL;
assert.ok(url, "D7_POSTGRES_URL required; real PostgreSQL coverage must run");
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(url).hostname) &&
    !new URL(url).search,
);
const migrations = await Promise.all(
  [
    "0001_local_appliance",
    "0002_authority_request_review",
    "0003_simulated_credit",
  ].map(async (version) =>
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
const verificationMigration = createMigrationSource(
  "0004_credit_verification",
  await readFile(
    new URL(
      "../packages/runtime/migrations/0004_credit_verification.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const CASE = "case_d6_workbench",
  root = `/v1/tenants/${TENANT}/authority-requests`,
  action = `/v1/tenants/${TENANT}/cases/${CASE}/simulated-credit-attempts`,
  view = `/v1/tenants/${TENANT}/cases/${CASE}/simulated-credit`;
const tables = [
  "runtime_writer_lock",
  "case_journal",
  "case_projections",
  "source_event_identities",
  "runtime_emitted_ids",
  "authority_catalog",
  "authority_snapshots",
  "authority_request_journal",
  "fieldruntime_schema_migrations",
  "simulated_action_journal",
  "simulated_credit_source",
];
function transition(version, to) {
  return {
    type: "case.transition",
    tenant_id: TENANT,
    case_id: CASE,
    expected_case_version: version,
    actor_identity_id: "identity_d6_operator",
    idempotency_key: `prepare:${to}`,
    correlation_id: "d7-prepare",
    to_state: to,
    reason: `Prepare the synthetic Case for ${to}`,
  };
}
async function fixture(
  t,
  { upgrade = false, adapter, verification = false } = {},
) {
  const schema = `d7_test_${randomUUID().replaceAll("-", "")}`,
    admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  let readerPg,
    readerPool,
    verifier,
    readerHook,
    pg,
    pool,
    cases,
    authority,
    credit,
    server,
    base,
    fault,
    hook,
    ids = 0,
    time = new Date(START);
  const trace = [],
    discarded = [];
  const now = () => time;
  const open = () => {
    pg = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
      max: 8,
    });
    pool = {
      async connect() {
        const c = await pg.connect();
        if (c.listenerCount("error") === 0) c.on("error", () => {}); // Terminated test backends still reject the next query.
        return {
          async query(sql, values) {
            trace.push(sql);
            if (hook) await hook(sql, c.processID);
            const active =
              fault &&
              (fault.tag === "COMMIT"
                ? sql === "COMMIT"
                : sql.includes(fault.tag)) &&
              --fault.remaining === 0
                ? fault
                : undefined;
            if (active && !active.rollback) fault = undefined;
            if (sql === "ROLLBACK" && fault?.rollback) {
              fault = undefined;
              throw Error("injected rollback failure");
            }
            if (active && !active.after)
              throw Error("injected persistence failure");
            const r = await c.query(sql, values);
            if (active) throw Error("injected acknowledgement loss");
            return r;
          },
          release(discard = false) {
            discarded.push(discard);
            c.release(discard);
          },
        };
      },
    };
    readerPg = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
      max: 4,
    });
    readerPool = {
      async connect() {
        const c = await readerPg.connect();
        return {
          async query(sql, values) {
            trace.push(`reader: ${sql}`);
            if (readerHook) await readerHook(sql, c.processID);
            return c.query(sql, values);
          },
          release(discard = false) {
            c.release(discard);
          },
        };
      },
    };
    verifier = new PostgresCreditVerificationStore(pool, readerPool);
    cases = new PostgresCaseStore(pool);
    authority = new PostgresAuthorityStore(pool);
    credit = new PostgresSimulatedCreditStore(pool, adapter);
  };
  const start = async () => {
    const worker = new TransactionalCaseWorker(cases, {
      create: () => ({ now, nextId: (kind) => `${kind}_${++ids}` }),
    });
    const review = new TransactionalAuthorityWorker(authority, () => ({
      now,
      nextId: (kind) => `${kind}_${++ids}`,
    }));
    const effect = new TransactionalCreditWorker(credit, () => ({
      now,
      nextId: () => `attempt_${++ids}`,
    }));
    const verificationWorker = new TransactionalCreditVerificationWorker(
      verifier,
      () => ({ now, nextId: () => `verification_${++ids}` }),
    );
    server = createApiServer(
      {
        isReady: async () => {
          await credit.assertReady();
          return true;
        },
        executeCaseCommand: (_, c) => worker.execute(c),
        listCases: (t) => cases.listCases(t),
        getCase: (t, id) => cases.getCase(t, id),
        getJournal: (t, id) => cases.getJournal(t, id),
        getEvaluationFixture: async () => undefined,
        getGuidedWalkthrough: async () => undefined,
        authority: {
          create: (c) => review.create(c),
          decide: (c, s) => review.decide(c, s),
          read: (t, id) => authority.readRequest(t, id, now),
          catalogRevision: (t) => authority.readCatalogRevision(t),
        },
        credit: {
          verify: (c) => verificationWorker.verify(c),
          execute: (c) => effect.execute(c),
          read: (t, id) => credit.read(t, id, now),
        },
      },
      await loadWorkbenchAssets(),
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = undefined;
    }
    await Promise.all([pg.end(), readerPg.end()]);
  };
  open();
  t.after(async () => {
    await stop();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  await applyMigration(pool, migrations[0]);
  await applyMigration(pool, migrations[1]);
  await authority.initializeCatalog(TENANT, syntheticAuthorityCatalog(), now);
  const cw = new TransactionalCaseWorker(cases, {
    create: () => ({ now, nextId: (kind) => `${kind}_${++ids}` }),
  });
  if (upgrade) {
    await cw.execute(caseCommand("d6_workbench"));
    await authority.execute(createRequestCommand(CASE), "operator", {
      now,
      nextId: (kind) => `${kind}_${++ids}`,
    });
  }
  const oldCases = await cases.getCase(TENANT, CASE);
  const oldReviews = (
    await pg.query(
      "SELECT entry FROM authority_request_journal ORDER BY position",
    )
  ).rows;
  await applyMigration(pool, migrations[2]);
  if (verification) await applyMigration(pool, verificationMigration);
  for (const m of verification
    ? [...migrations, verificationMigration]
    : migrations) {
    assert.equal(await applyMigration(pool, m), "unchanged");
    await assert.rejects(
      () =>
        applyMigration(
          pool,
          createMigrationSource(m.version, m.sql + "\n-- drift"),
        ),
      /different checksum/,
    );
  }
  assert.deepEqual(await cases.getCase(TENANT, CASE), oldCases);
  assert.deepEqual(
    (
      await pg.query(
        "SELECT entry FROM authority_request_journal ORDER BY position",
      )
    ).rows,
    oldReviews,
  );
  await start();
  const api = {
    get base() {
      return base;
    },
    fetcher: (path, options) => globalThis.fetch(base + path, options),
    trace,
    discarded,
    get verifier() {
      return verifier;
    },
    setReaderHook(fn) {
      readerHook = fn;
    },
    async upgradeVerification() {
      return applyMigration(pool, verificationMigration);
    },
    verifyCommand(attempt, key = `verify:${++ids}`, overrides = {}) {
      return {
        schema_version: "simulated-credit-verification-command.v1",
        type: "simulated-credit.verify",
        tenant_id: TENANT,
        case_id: CASE,
        attempt_id: attempt.id,
        expected_action_entry_hash: attempt.event_hash,
        idempotency_key: key,
        correlation_id: "d7-verify",
        ...overrides,
      };
    },
    verify(command, status = 200) {
      return api.request(
        `${action}/${command.attempt_id}/verifications`,
        command,
        status,
      );
    },
    now,
    get authority() {
      return authority;
    },
    get credit() {
      return credit;
    },
    get ids() {
      return ids;
    },
    advance(ms) {
      time = new Date(time.valueOf() + ms);
    },
    setHook(fn) {
      hook = fn;
    },
    inject(tag, { after = false, remaining = 1, rollback = false } = {}) {
      fault = { tag, after, remaining, rollback };
    },
    sql: (s, v) => pg.query(s, v),
    async request(path, command, status = 200) {
      const r = await globalThis.fetch(base + path, {
        ...(command
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(command),
            }
          : {}),
        signal: globalThis.AbortSignal.timeout(30000),
      });
      const b = await r.json();
      assert.ok(
        (Array.isArray(status) ? status : [status]).includes(r.status),
        `HTTP ${r.status}: ${JSON.stringify(b).slice(0, 2000)}`,
      );
      return b;
    },
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
    case(c, status = 200) {
      return api.request(`/v0/tenants/${TENANT}/case-commands`, c, status);
    },
    read(id) {
      return api.request(`${root}/${id}/packet`);
    },
    async prepare() {
      if (!(await cases.getCase(TENANT, CASE)))
        await api.case(caseCommand("d6_workbench"));
      for (const [i, to] of [
        "qualifying",
        "enriching",
        "needs_review",
      ].entries())
        await api.case(transition(i + 1, to));
    },
    async enroll() {
      await authority.enrollSimulatedCredit(now);
    },
    async create(key = `request:${++ids}`, overrides = {}) {
      const c = await cases.getCase(TENANT, CASE);
      return (
        await api.request(
          root,
          createRequestCommand(CASE, key, {
            expected_case_version: c.journal.length,
            expected_authority_state_revision:
              await authority.readCatalogRevision(TENANT),
            ...overrides,
          }),
        )
      ).receipt.authority_request_id;
    },
    async decide(id, seat, decision = "approve", overrides = {}) {
      return api.request(
        `${root}/${id}/decisions/${seat}`,
        decideCommand(
          await api.read(id),
          `decision:${++ids}`,
          decision,
          overrides,
        ),
      );
    },
    async approved() {
      await api.prepare();
      await api.enroll();
      const id = await api.create();
      await api.decide(id, "finance");
      await api.decide(id, "executive");
      assert.equal((await api.read(id)).current.authorized, true);
      return id;
    },
    async command(id, key = "credit:once", overrides = {}) {
      const p = await api.read(id);
      return {
        schema_version: "simulated-credit-command.v1",
        type: "simulated-credit.execute",
        tenant_id: TENANT,
        case_id: CASE,
        authority_request_id: id,
        expected_case_version: p.case_version,
        expected_review_revision: p.review_revision,
        expected_authority_state_revision: p.authority_state_revision,
        request_binding_hash: p.request_binding_hash,
        expected_action_binding_hash: CREDIT_ACTION_HASH,
        idempotency_key: key,
        correlation_id: "d7-test",
        ...overrides,
      };
    },
    async catalog(edit) {
      const row = (
        await pg.query(
          "SELECT s.content FROM authority_catalog c JOIN authority_snapshots s ON s.snapshot_hash=c.snapshot_hash",
        )
      ).rows[0];
      const data = structuredClone(row.content.data);
      edit(data);
      await authority.replaceCatalog(TENANT, data, row.content.revision, now);
    },
    async restart() {
      await stop();
      open();
      await authority.initializeCatalog(
        TENANT,
        syntheticAuthorityCatalog(),
        now,
      );
      await start();
    },
  };
  return api;
}

test("D7 fresh and upgraded stores retain Case/review history; enrollment is explicit and idempotent", async (t) => {
  for (const upgrade of [false, true])
    await t.test(upgrade ? "upgrade" : "fresh", async (t) => {
      const h = await fixture(t, { upgrade });
      const before = await h.dump();
      assert.equal(
        (await h.sql("SELECT revision FROM authority_catalog")).rows[0]
          .revision,
        "1",
      );
      await Promise.all([h.enroll(), h.enroll()]);
      const enrolled = await h.dump();
      assert.equal(enrolled.authority_catalog[0].row.revision, 2);
      assert.deepEqual(enrolled.case_journal, before.case_journal);
      assert.deepEqual(
        enrolled.authority_request_journal,
        before.authority_request_journal,
      );
      h.advance(1000);
      await h.enroll();
      assert.deepEqual(await h.dump(), enrolled);
      await h.restart();
      await h.enroll();
      assert.deepEqual(await h.dump(), enrolled);
      if (upgrade) {
        const id = before.authority_request_journal[0].row.authority_request_id;
        assert.equal((await h.read(id)).current.authorized, false);
      }
    });
});
test("D7 runtime Case → prepare → enrollment → Finance/Executive → atomic credit → restart/exact retry", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    command = await h.command(id),
    before = await h.dump();
  const result = await h.request(action, command);
  assert.equal(result.status, "applied");
  assert.equal(result.receipt.outcome, "simulated_action_recorded");
  assert.equal(result.receipt.verification, "not_implemented");
  assert.equal(result.receipt.closure_permission, false);
  const after = await h.dump();
  for (const table of [
    "case_journal",
    "case_projections",
    "authority_request_journal",
  ])
    assert.deepEqual(after[table], before[table]);
  assert.equal(after.authority_catalog[0].row.revision, 2);
  assert.equal(after.simulated_credit_source.length, 1);
  assert.equal(after.simulated_action_journal.length, 1);
  await h.restart();
  h.advance(1000);
  assert.deepEqual((await h.request(action, command)).receipt, result.receipt);
  const loaded = await h.request(view);
  assert.deepEqual(loaded.attempts, [result.receipt]);
  assert.equal(loaded.source.payload.amount_minor, 1500000);
  const stable = await h.dump(),
    ids = h.ids;
  h.trace.length = 0;
  for (let i = 0; i < 3; i++) await h.request(view);
  assert.deepEqual(await h.dump(), stable);
  assert.equal(h.ids, ids);
  assert.ok(h.trace.every((s) => !/FOR UPDATE|INSERT|UPDATE|DELETE/i.test(s)));
  assert.equal((await h.case(transition(4, "resolved"))).status, "rejected");
});

for (const [label, edit] of [
  ["C", (c) => c.expected_case_version--],
  ["R", (c) => c.expected_review_revision--],
  ["S", (c) => c.expected_authority_state_revision--],
  [
    "request hash",
    (c) => (c.request_binding_hash = `sha256:${"b".repeat(64)}`),
  ],
  [
    "action hash",
    (c) => (c.expected_action_binding_hash = `sha256:${"b".repeat(64)}`),
  ],
])
  test(`D7 altered ${label} cannot authorize or change C/R/S`, async (t) => {
    const h = await fixture(t),
      id = await h.approved(),
      c = await h.command(id);
    edit(c);
    const before = await h.dump(),
      r = await h.request(action, c, 409);
    assert.equal(r.status, "denied");
    assert.equal(r.receipt.source, null);
    assert.equal(r.receipt.adapter_report, "not_invoked");
    const after = await h.dump();
    assert.equal(after.simulated_credit_source.length, 0);
    assert.deepEqual(after.case_journal, before.case_journal);
    assert.deepEqual(
      after.authority_request_journal,
      before.authority_request_journal,
    );
    await h.restart();
    assert.deepEqual((await h.request(view)).attempts, [r.receipt]);
  });

test("D7 HTTP rejects injected identity, payload, target, authorization and verification flags without writes", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    c = await h.command(id),
    before = await h.dump();
  for (const extra of [
    { payload: { amount_minor: 1 } },
    { target: { account_ref: "elsewhere" } },
    { executor_identity: { status: "active" } },
    { authorized: true },
    { verified: true },
  ])
    await h.request(action, { ...c, ...extra }, 400);
  await h.request(action, { ...c, tenant_id: "tenant_other" }, 400);
  await h.request(
    action.replace(CASE, "case_other"),
    { ...c, case_id: "case_other" },
    400,
  );
  assert.deepEqual(await h.dump(), before);
  await h.request(
    view + "-verifications",
    { ...c, type: "simulated-credit.verify" },
    404,
  );
});

for (const scenario of [
  "missing Executive",
  "changed evidence",
  "catalog change",
  "expired request",
  "wrong proposed amount",
  "unprepared Case",
])
  test(`D7 denies ${scenario}`, async (t) => {
    const h = await fixture(t);
    await h.prepare();
    await h.enroll();
    const id = await h.create(
      undefined,
      scenario === "wrong proposed amount"
        ? { proposal_key: "credit_12000" }
        : {},
    );
    await h.decide(id, "finance");
    if (scenario !== "missing Executive") await h.decide(id, "executive");
    const c = await h.command(id);
    if (scenario === "changed evidence")
      await h.case({
        type: "case.attach_work_event",
        tenant_id: TENANT,
        case_id: CASE,
        expected_case_version: 4,
        actor_identity_id: "identity_d6_operator",
        idempotency_key: "evidence:change",
        correlation_id: "evidence:change",
        work_event: workEvent("d7_update", "update"),
      });
    if (scenario === "catalog change")
      await h.catalog((d) => (d.policies[0].source_ref += "/changed"));
    if (scenario === "expired request") h.advance(3600000);
    if (scenario === "unprepared Case")
      await h.case(transition(4, "awaiting_approval"));
    const r = await h.request(action, c, 409);
    assert.equal(r.status, "denied");
    assert.equal(r.receipt.envelope.authorized, false);
    assert.equal((await h.request(view)).source, null);
  });

for (const decision of ["reject", "modify", "escalate"])
  test(`D7 ${decision} before invocation denies; after invocation preserves effect and permits intervention`, async (t) => {
    const h = await fixture(t),
      id = await h.approved(),
      c = await h.command(id),
      reason = {
        reason: "Synthetic reviewer intervention",
        ...(decision === "modify"
          ? { replacement_proposal_key: "credit_12000" }
          : {}),
      };
    await h.decide(id, "finance", decision, reason);
    assert.equal((await h.request(action, c, 409)).status, "denied");
    assert.equal((await h.request(view)).source, null);
    const second = await fixture(t),
      q = await second.approved(),
      command = await second.command(q);
    const applied = await second.request(action, command);
    await second.decide(q, "finance", decision, reason);
    assert.equal((await second.read(q)).current.authorized, false);
    assert.equal(
      (
        await second.request(
          action,
          { ...command, idempotency_key: "credit:after" },
          409,
        )
      ).status,
      "denied",
    );
    await second.restart();
    assert.deepEqual(
      (await second.request(view)).source,
      applied.receipt.source,
    );
    if (decision === "modify") {
      const history = (await second.read(q)).history;
      const replacement =
        history.at(-1).decision.replacement_authority_request_id;
      const fresh = await second.read(replacement);
      assert.equal(fresh.review_revision, 0);
      assert.equal(fresh.current.authorized, false);
      await second.decide(replacement, "finance");
      await second.decide(replacement, "executive");
      const denied = await second.request(
        action,
        await second.command(replacement, "credit:replacement"),
        409,
      );
      assert.ok(
        denied.receipt.envelope.reason_codes.includes(
          "credit_already_recorded",
        ),
      );
    }
  });

for (const [label, edit] of [
  [
    "executor identity revoked",
    (d) => {
      d.identities.find(
        (x) => x.identity_id === "identity_d7_credit_executor",
      ).status = "revoked";
      d.authority_records.find(
        (x) => x.authority_class === "simulated_credit_executor",
      ).identity.status = "revoked";
    },
  ],
  [
    "executor authority revoked",
    (d) =>
      (d.authority_records.find(
        (x) => x.authority_class === "simulated_credit_executor",
      ).status = "revoked"),
  ],
  [
    "evaluator authority revoked",
    (d) =>
      (d.authority_records.find(
        (x) => x.authority_class === "simulated_credit_evaluator",
      ).status = "revoked"),
  ],
  [
    "grant expired",
    (d) => {
      const g = d.authority_records.find(
        (x) => x.authority_class === "simulated_credit_executor",
      );
      g.effective_until = START;
      g.effective_until_source_timezone = "UTC";
    },
  ],
  [
    "wrong scope",
    (d) =>
      (d.authority_records.find(
        (x) => x.authority_class === "simulated_credit_executor",
      ).scope.case_ids = ["case_other"]),
  ],
  [
    "competing executor",
    (d) =>
      d.authority_records.push({
        ...structuredClone(
          d.authority_records.find(
            (x) => x.authority_class === "simulated_credit_executor",
          ),
        ),
        authority_record_id: "authority_competing",
      }),
  ],
  [
    "wrong profile grant",
    (d) =>
      (d.authority_records.find(
        (x) => x.authority_class === "simulated_credit_executor",
      ).source_ref = "synthetic://wrong-profile"),
  ],
])
  test(`D7 current service check: ${label}`, async (t) => {
    const h = await fixture(t);
    await h.prepare();
    await h.enroll();
    await h.catalog(edit);
    const id = await h.create();
    await h.decide(id, "finance");
    await h.decide(id, "executive");
    assert.equal((await h.read(id)).current.authorized, true);
    const r = await h.request(action, await h.command(id), 409);
    assert.equal(r.status, "denied");
    assert.equal(r.receipt.source, null);
  });

test("D7 unresolved human authority conflict remains fail closed", async (t) => {
  const h = await fixture(t);
  await h.prepare();
  await h.enroll();
  await h.catalog((d) => {
    const id = {
      ...d.identities.find((i) => i.identity_id === "identity_d6_executive"),
      identity_id: "identity_other_executive",
    };
    d.identities.push(id);
    d.authority_records.push({
      ...d.authority_records.find(
        (r) => r.authority_class === "executive_sponsor",
      ),
      identity: id,
      authority_record_id: "authority_other_executive",
      source_ref: "synthetic://different-executive",
    });
  });
  const q = await h.create();
  const r = await h.request(action, await h.command(q), 409);
  assert.ok(
    r.receipt.envelope.reason_codes.includes("current_authority_required"),
  );
  assert.equal(r.receipt.source, null);
});

test("D7 concurrent same/different keys produce one effect; changed bytes cannot reuse a key", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    c = await h.command(id);
  const [a, b] = await Promise.all([
    h.request(action, c),
    h.request(action, c),
  ]);
  assert.deepEqual([a.status, b.status].sort(), ["applied", "duplicate"]);
  assert.deepEqual(a.receipt, b.receipt);
  const before = await h.dump();
  assert.equal(
    (await h.request(action, { ...c, correlation_id: "changed" }, 409)).code,
    "idempotency_conflict",
  );
  assert.deepEqual(await h.dump(), before);
  const [x, y] = await Promise.all([
    h.request(action, { ...c, idempotency_key: "different:1" }, 409),
    h.request(action, { ...c, idempotency_key: "different:2" }, 409),
  ]);
  assert.equal(x.status, "denied");
  assert.equal(y.status, "denied");
  assert.equal((await h.dump()).simulated_credit_source.length, 1);
});

test("D7 action versus rejection serializes at the existing writer lock", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    c = await h.command(id);
  let unlock;
  const gate = new Promise((r) => (unlock = r));
  let entered;
  const ready = new Promise((r) => (entered = r));
  let first = true;
  h.setHook(async (sql) => {
    if (first && sql.includes("fr:credit-insert-source")) {
      first = false;
      entered();
      await gate;
    }
  });
  const run = h.request(action, c);
  await ready;
  const rejection = h.decide(id, "finance", "reject", {
    reason: "Reject after issuance",
  });
  unlock();
  await run;
  await rejection;
  h.setHook(undefined);
  assert.equal((await h.read(id)).current.authorized, false);
  assert.equal((await h.request(view)).source.payload.amount_minor, 1500000);
});

for (const tag of [
  "fr:credit-insert-source",
  "fr:credit-insert-journal",
  "fr:credit-clock",
  "fr:authority-increment-writer",
  "fr:credit-load-journal",
  "COMMIT",
])
  test(`D7 injected failure at ${tag} rolls back source/action/clock/key atomically`, async (t) => {
    const h = await fixture(t),
      id = await h.approved(),
      c = await h.command(id),
      before = await h.dump();
    h.inject(tag);
    await h.request(action, c, 500);
    assert.deepEqual(await h.dump(), before);
    await h.restart();
    assert.equal((await h.request(action, c)).status, "applied");
    assert.equal((await h.request(view)).attempts.length, 1);
  });

test("D7 lost commit acknowledgement and rollback failure discard unsafe connection; exact restart retry is historical", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    c = await h.command(id);
  h.inject("COMMIT", { after: true });
  await h.request(action, c, 500);
  assert.equal((await h.dump()).simulated_credit_source.length, 1);
  await h.restart();
  const retry = await h.request(action, c);
  assert.equal(retry.status, "duplicate");
  assert.equal(retry.historical_only, true);
  h.inject("fr:credit-insert-journal", { rollback: true });
  await h.request(action, { ...c, idempotency_key: "credit:rollback" }, 500);
  assert.ok(h.discarded.includes(true));
  await h.restart();
  assert.equal((await h.request(view)).attempts.length, 1);
});

test("D7 adapter success without source state is not verification or permission to repeat", async (t) => {
  const h = await fixture(t, { adapter: async () => "success" }),
    id = await h.approved(),
    c = await h.command(id);
  const r = await h.request(action, c);
  assert.equal(r.receipt.adapter_report, "success");
  assert.equal(r.receipt.source, null);
  assert.equal(r.receipt.verification, "not_implemented");
  await h.restart();
  const denied = await h.request(
    action,
    { ...c, idempotency_key: "retry:new-key" },
    409,
  );
  assert.ok(
    denied.receipt.envelope.reason_codes.includes(
      "independent_absence_check_required",
    ),
  );
  assert.equal((await h.request(action, c)).status, "duplicate");
});
test("D7 adapter uncertainty commits available exact source evidence, never verified status", async (t) => {
  const h = await fixture(t, {
      adapter: async (insert) => {
        await insert();
        return "uncertain";
      },
    }),
    id = await h.approved();
  const r = await h.request(action, await h.command(id));
  assert.equal(r.receipt.adapter_report, "uncertain");
  assert.equal(r.receipt.source.payload.amount_minor, 1500000);
  assert.equal(r.receipt.verification, "not_implemented");
});
test("D7 adapter exception or duplicate invocation cannot leave partial source state", async (t) => {
  for (const adapter of [
    async (insert) => {
      await insert();
      throw Error("simulated crash");
    },
    async (insert) => {
      await insert();
      await insert();
      return "success";
    },
  ]) {
    const h = await fixture(t, { adapter }),
      id = await h.approved(),
      before = await h.dump();
    await h.request(action, await h.command(id), 500);
    assert.deepEqual(await h.dump(), before);
  }
});

test("D7 clock regression makes no records or ID reservations; exact duplicate is checked first", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    c = await h.command(id),
    before = await h.dump(),
    ids = h.ids;
  h.advance(-1);
  await h.request(action, c, 500);
  assert.deepEqual(await h.dump(), before);
  assert.equal(h.ids, ids);
  h.advance(1);
  await h.request(action, c);
  h.advance(-1);
  assert.equal((await h.request(action, c)).status, "duplicate");
});

test("D7 source/action tables reject UPDATE DELETE TRUNCATE; coherent false authorization fails replay", async (t) => {
  const h = await fixture(t);
  await h.prepare();
  await h.enroll();
  const id = await h.create(),
    c = await h.command(id);
  const denied = await h.request(action, c, 409);
  for (const table of ["simulated_action_journal", "simulated_credit_source"])
    for (const statement of [
      `UPDATE ${table} SET ${table === "simulated_action_journal" ? "recorded_at = recorded_at" : "slot = slot"}`,
      `DELETE FROM ${table}`,
      `TRUNCATE ${table} CASCADE`,
    ])
      await assert.rejects(() => h.sql(statement));
  const forged = structuredClone(denied.receipt);
  forged.envelope.authorized = true;
  forged.envelope.reason_codes = [];
  forged.envelope.packet.current.authorized = true;
  forged.envelope_hash = sha256Json(forged.envelope);
  forged.outcome = "simulated_action_recorded";
  forged.adapter_report = "success";
  const unsigned = structuredClone(forged);
  delete unsigned.event_hash;
  forged.event_hash = sha256Json(unsigned);
  // A privileged SQL rewrite defeats append-only triggers; semantic replay must
  // still reject a coherent hash rewrite that contradicts canonical review.
  await h.sql(
    "ALTER TABLE simulated_action_journal DISABLE TRIGGER simulated_action_append_only",
  );
  await h.sql(
    "UPDATE simulated_action_journal SET entry=$1,event_hash=$2,envelope_hash=$3 WHERE id=$4",
    [forged, forged.event_hash, forged.envelope_hash, forged.id],
  );
  await h.sql(
    "ALTER TABLE simulated_action_journal ENABLE TRIGGER simulated_action_append_only",
  );
  await h.request(view, undefined, 500);
  await assert.rejects(() => h.restart());
});

test("D7 final issuance clock catches expiry during evaluation and advances no Case/review revision", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    command = await h.command(id),
    before = await h.dump();
  let call = 0;
  const outcome = await h.credit.execute(command, {
    now: () =>
      new Date(
        ++call === 1 ? "2026-09-06T16:59:59.999Z" : "2026-09-06T17:00:00.000Z",
      ),
    nextId: () => "attempt_expiry",
  });
  assert.equal(outcome.status, "denied");
  assert.ok(outcome.receipt.envelope.reason_codes.includes("request_expired"));
  assert.equal(outcome.receipt.source, null);
  const after = await h.dump();
  assert.deepEqual(after.case_journal, before.case_journal);
  assert.deepEqual(
    after.authority_request_journal,
    before.authority_request_journal,
  );
  h.advance(3600001);
  const fresh = await h.create();
  assert.equal((await h.read(fresh)).current.authorized, false);
});
test("D7 action clock participates in subsequent review/catalog writes and deterministic restart replay", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    command = await h.command(id);
  h.advance(1000);
  const applied = await h.request(action, command);
  h.advance(-1);
  const before = await h.dump();
  await assert.rejects(() =>
    h.catalog((d) => (d.policies[0].source_ref += "/clock")),
  );
  assert.deepEqual(await h.dump(), before);
  h.advance(1001);
  await h.decide(id, "finance", "reject", {
    reason: "Intervene after recorded effect",
  });
  h.advance(1000);
  await h.catalog((d) => (d.policies[0].source_ref += "/later"));
  await h.restart();
  assert.deepEqual((await h.request(view)).source, applied.receipt.source);
  assert.equal((await h.read(id)).current.authorized, false);
});
for (const tag of [
  "fr:authority-insert-snapshot",
  "fr:authority-update-catalog",
  "fr:authority-increment-writer",
  "COMMIT",
])
  test(`D7 enrollment failure ${tag} preserves the complete pre-enrollment catalog`, async (t) => {
    const h = await fixture(t),
      before = await h.dump();
    h.inject(tag);
    await assert.rejects(() => h.enroll());
    assert.deepEqual(await h.dump(), before);
    await h.restart();
    await h.enroll();
    assert.equal((await h.dump()).authority_catalog[0].row.revision, 2);
  });
test("D7 lost enrollment response is a no-op retry; altered or removed enrollment cannot be reset", async (t) => {
  const h = await fixture(t);
  h.inject("COMMIT", { after: true });
  await assert.rejects(() => h.enroll());
  const enrolled = await h.dump();
  await h.restart();
  await h.enroll();
  assert.deepEqual(await h.dump(), enrolled);
  await h.catalog((d) => {
    d.authority_records = d.authority_records.filter(
      (r) => !r.authority_record_id.startsWith("authority_d7_"),
    );
    d.identities = d.identities.filter(
      (i) => !i.identity_id.startsWith("identity_d7_"),
    );
  });
  const removed = await h.dump();
  await assert.rejects(() => h.enroll());
  assert.deepEqual(await h.dump(), removed);
});
test("D7 failure during post-write replay rolls back the source/action pair", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    command = await h.command(id),
    before = await h.dump();
  h.inject("fr:credit-load-journal", { remaining: 2 });
  await h.request(action, command, 500);
  assert.deepEqual(await h.dump(), before);
  await h.restart();
  assert.equal((await h.request(action, command)).status, "applied");
});

test("D7 terminated PostgreSQL writer rolls back an inserted source before journal commit", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    command = await h.command(id),
    before = await h.dump();
  let terminated = false;
  h.setHook(async (sql, pid) => {
    if (!terminated && sql.includes("fr:credit-insert-journal")) {
      terminated = true;
      await h.sql("SELECT pg_terminate_backend($1)", [pid]);
    }
  });
  await h.request(action, command, 500);
  h.setHook(undefined);
  assert.equal(terminated, true);
  assert.deepEqual(await h.dump(), before);
  await h.restart();
  assert.equal((await h.request(action, command)).status, "applied");
  assert.equal((await h.request(view)).attempts.length, 1);
});

test("D7 exact workflow identity/version cannot be changed behind the expected record ID", async (t) => {
  for (const field of ["version", "workflow_id"]) {
    const h = await fixture(t),
      seed = caseCommand("d6_workbench");
    seed.case_seed.workflow_version[field] =
      field === "version" ? "9.9.9" : "another_workflow";
    if (field === "workflow_id") {
      const before = await h.dump();
      await h.case(seed, 400); // The strict Case contract already rejects this identity.
      assert.deepEqual(await h.dump(), before);
      continue;
    }
    await h.case(seed);
    const id = await h.approved();
    const denied = await h.request(action, await h.command(id), 409);
    assert.ok(
      denied.receipt.envelope.reason_codes.includes(
        "workflow_binding_mismatch",
      ),
    );
    assert.equal((await h.request(view)).source, null);
  }
});

test("D7 requires two distinct human reviewers even when one principal holds both classes", async (t) => {
  const h = await fixture(t);
  await h.prepare();
  await h.enroll();
  await h.catalog((d) => {
    d.authority_records.find(
      (r) => r.authority_class === "executive_sponsor",
    ).identity = structuredClone(
      d.identities.find((i) => i.identity_id === "identity_d6_finance"),
    );
  });
  const id = await h.create();
  await h.decide(id, "finance");
  // D6 resolves individual class requirements; this operation additionally
  // requires the accepted Finance-then-Executive two-person consent boundary.
  const denied = await h.request(action, await h.command(id), 409);
  assert.ok(
    denied.receipt.envelope.reason_codes.includes(
      "distinct_reviewers_required",
    ),
  );
  assert.equal((await h.request(view)).source, null);
});

test("D7 envelopes expose only the bound Case while replay preserves the runtime clock floor", async (t) => {
  const h = await fixture(t),
    id = await h.approved();
  h.advance(1000);
  await h.case(caseCommand("unrelated_orchid_case"));
  h.advance(1000);
  const privateCase = caseCommand("private_clock_case");
  privateCase.tenant_id = "tenant_private";
  privateCase.case_seed.tenant.id = "tenant_private";
  privateCase.case_seed.case.tenant_id = "tenant_private";
  privateCase.trigger_event.tenant_id = "tenant_private";
  await h.request("/v0/tenants/tenant_private/case-commands", privateCase);
  const privateAt = h.now().toISOString();
  h.advance(1000);
  const receipt = (await h.request(action, await h.command(id))).receipt;
  assert.deepEqual(
    receipt.envelope.case_heads.map(({ tenant_id, case_id }) => ({
      tenant_id,
      case_id,
    })),
    [{ tenant_id: TENANT, case_id: CASE }],
  );
  assert.equal(receipt.envelope.clock_floor, privateAt);
  assert.ok(!JSON.stringify(receipt).includes("tenant_private"));
  assert.ok(!JSON.stringify(receipt).includes("case_private_clock_case"));
  assert.ok(!JSON.stringify(receipt).includes("case_unrelated_orchid_case"));
  await h.restart();
  const history = await h.request(view);
  assert.deepEqual(history.attempts, [receipt]);
  assert.ok(!JSON.stringify(history).includes("tenant_private"));
  const forged = structuredClone(receipt);
  forged.envelope.clock_floor = "2026-09-06T16:00:00.123Z";
  forged.envelope_hash = sha256Json(forged.envelope);
  const unsigned = structuredClone(forged);
  delete unsigned.event_hash;
  forged.event_hash = sha256Json(unsigned);
  await h.sql(
    "ALTER TABLE simulated_action_journal DISABLE TRIGGER simulated_action_append_only",
  );
  await h.sql(
    "UPDATE simulated_action_journal SET entry=$1,event_hash=$2,envelope_hash=$3 WHERE id=$4",
    [forged, forged.event_hash, forged.envelope_hash, forged.id],
  );
  await h.sql(
    "ALTER TABLE simulated_action_journal ENABLE TRIGGER simulated_action_append_only",
  );
  await h.request(view, undefined, 500);
});

function appendReplayEvidence() {
  return {
    type: "case.attach_work_event",
    tenant_id: TENANT,
    case_id: CASE,
    expected_case_version: 4,
    actor_identity_id: "identity_d6_operator",
    idempotency_key: "evidence:replay",
    correlation_id: "evidence:replay",
    work_event: workEvent("replay_update", "update"),
  };
}

for (const delay of [0, 1000])
  test(`D7 legitimate action survives restart after evidence recorded ${delay}ms later`, async (t) => {
    const h = await fixture(t),
      id = await h.approved(),
      command = await h.command(id);
    h.advance(1000);
    const original = await h.request(action, command);
    h.advance(delay);
    await h.case(appendReplayEvidence());
    const before = await h.dump();
    await h.restart();
    assert.equal((await h.request("/readyz")).status, "ready");
    const read = await h.request(view);
    assert.deepEqual(read.attempts, [original.receipt]);
    assert.deepEqual(read.source, original.receipt.source);
    assert.equal(read.current.eligible, false);
    assert.equal(read.closure_permission, false);
    const retry = await h.request(action, command);
    assert.equal(retry.status, "duplicate");
    assert.deepEqual(retry.receipt, original.receipt);
    assert.deepEqual(await h.dump(), before);
  });

test("D7 obsolete Case forgery preserves canonical histories but fails replay, readiness, reads and restart", async (t) => {
  const h = await fixture(t),
    id = await h.approved(),
    command = await h.command(id);
  const prefix = await loadAuthorityStore({ query: h.sql }, true);
  h.advance(1000);
  const original = (await h.request(action, command)).receipt;
  h.advance(1000);
  const changedAt = h.now().toISOString();
  await h.case(appendReplayEvidence());
  await h.restart();
  assert.deepEqual((await h.request(view)).attempts, [original]);
  const canonical = await h.dump();
  const current = await loadAuthorityStore({ query: h.sql }, true);
  h.advance(1000);
  // Re-evaluate the obsolete C=4 prefix at t=3, although unchanged canonical
  // Case history records C=5 at t=2. Keep a canonically supported clock floor.
  const past = {
    ...prefix,
    heads: [{ ...prefix.heads[0], last_recorded_at: changedAt }],
  };
  const envelope = evaluateCredit(past, command, h.now().toISOString());
  assert.equal(envelope.authorized, true);
  const source = creditSource(original.id, h.now().toISOString());
  const forged = creditEntry(past, envelope, original.id, "success", source);
  const candidate = {
    ...current,
    heads: [{ ...current.heads[0], last_recorded_at: forged.recorded_at }],
    credit: { entries: [forged], sources: [source] },
  };
  let forgedReplayAccepted = true;
  try {
    assertCreditIntegrity(candidate);
  } catch (error) {
    assert.equal(error.code, "CREDIT_INTEGRITY");
    assert.match(error.message, /credit ignored an earlier Case change/);
    forgedReplayAccepted = false;
  }
  // Deliberately bypass only the two action/source immutability triggers to
  // simulate a privileged coherent rewrite. Preserve all Case/review/catalog
  // snapshots, repairing every action index, source hash and mutable clock guard.
  await h.sql(
    "ALTER TABLE simulated_action_journal DISABLE TRIGGER simulated_action_append_only",
  );
  await h.sql(
    "ALTER TABLE simulated_credit_source DISABLE TRIGGER simulated_source_append_only",
  );
  const n = CREDIT_COLUMNS.length;
  await h.sql(
    `WITH rewritten_action AS (
      UPDATE simulated_action_journal SET ${CREDIT_COLUMNS.map((c, i) => `${c}=$${i + 1}`).join(", ")},entry=$${n + 1} WHERE id=$1 RETURNING id
    ), rewritten_source AS (
      UPDATE simulated_credit_source SET source_row=$${n + 2},row_hash=$${n + 3}
      WHERE origin_attempt_id=(SELECT id FROM rewritten_action) RETURNING origin_attempt_id
    ) UPDATE authority_catalog SET last_recorded_at=$${n + 4} WHERE tenant_id='tenant_orchid'`,
    [
      ...CREDIT_COLUMNS.map((c) => forged[c]),
      forged,
      source,
      source.row_hash,
      forged.recorded_at,
    ],
  );
  await h.sql(
    "ALTER TABLE simulated_action_journal ENABLE TRIGGER simulated_action_append_only",
  );
  await h.sql(
    "ALTER TABLE simulated_credit_source ENABLE TRIGGER simulated_source_append_only",
  );
  assert.deepEqual(
    await loadCreditEvidence({ query: h.sql }, true),
    candidate.credit,
  );
  const rewritten = await h.dump();
  for (const table of tables.filter(
    (name) =>
      ![
        "simulated_action_journal",
        "simulated_credit_source",
        "authority_catalog",
      ].includes(name),
  ))
    assert.deepEqual(
      rewritten[table],
      canonical[table],
      `${table} must remain canonical`,
    );
  assert.deepEqual(
    rewritten.authority_catalog,
    canonical.authority_catalog.map(({ row }) => ({
      row: { ...row, last_recorded_at: forged.recorded_at },
    })),
  );
  const ready = await h.request("/readyz", undefined, [200, 503]);
  const read = await h.request(view, undefined, [200, 500]);
  const restart = await Promise.allSettled([h.restart()]);
  const observed = {
    legitimate_history_control: true,
    forged_replay_accepted: forgedReplayAccepted,
    readiness: ready.status,
    operation_read_accepted:
      read.schema_version === "simulated-credit-read-response.v1",
    restart_accepted: restart[0].status === "fulfilled",
  };
  t.diagnostic(JSON.stringify(observed));
  assert.deepEqual(observed, {
    legitimate_history_control: true,
    forged_replay_accepted: false,
    readiness: "not_ready",
    operation_read_accepted: false,
    restart_accepted: false,
  });
});

test("D7-C exact independent source read, immutable proof, unchanged C/R/S, read-only GET and restart retry", async (t) => {
  const h = await fixture(t, { verification: true });
  const id = await h.approved(),
    applied = await h.request(action, await h.command(id));
  assert.equal(applied.receipt.verification, "unverified");
  const command = h.verifyCommand(applied.receipt),
    before = await h.dump();
  h.advance(1000);
  const pids = { reader: new Set(), writer: new Set() };
  h.setReaderHook((sql, pid) => {
    if (sql.includes("verification-read-source")) pids.reader.add(pid);
  });
  h.setHook((sql, pid) => {
    if (sql.includes("verification-read-source")) pids.writer.add(pid);
  });
  const verified = await h.verify(command);
  assert.equal(
    verified.receipt.comparison.outcome,
    "verified_simulated_effect",
  );
  assert.equal(verified.receipt.comparison.absence_proven, false);
  assert.equal(
    verified.receipt.authority.verifier_identity.identity_id,
    "identity_d7_credit_verifier",
  );
  assert.equal(
    verified.receipt.observation.raw.rows[0].source_row.origin_attempt_id,
    applied.receipt.id,
  );
  assert.equal(verified.receipt.closure_permission, false);
  assert.equal(pids.reader.size, 1);
  assert.equal(pids.writer.size, 1);
  assert.notEqual([...pids.reader][0], [...pids.writer][0]);
  assert.ok(
    h.trace.includes("reader: BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"),
  );
  assert.ok(
    !h.trace.some(
      (sql) =>
        sql.startsWith("reader:") &&
        /FOR UPDATE|INSERT|UPDATE authority_catalog/.test(sql),
    ),
  );
  const after = await h.dump();
  for (const table of [
    "case_journal",
    "case_projections",
    "authority_request_journal",
    "authority_snapshots",
    "simulated_credit_source",
  ])
    assert.deepEqual(after[table], before[table]);
  assert.equal(
    after.authority_catalog[0].row.revision,
    before.authority_catalog[0].row.revision,
  );
  assert.equal(
    after.authority_catalog[0].row.last_recorded_at,
    h.now().toISOString(),
  );
  h.setHook(undefined);
  h.setReaderHook(undefined);
  const packet = await h.request(view);
  assert.equal(packet.verifications.length, 1);
  assert.equal(packet.attempts.length, 1);
  await h.request(view);
  await h.read(id);
  assert.deepEqual(await h.dump(), after);
  await h.restart();
  assert.deepEqual(await h.request(view), packet);
  const count = h.ids;
  h.setReaderHook(() => {
    throw Error("duplicate must never read source");
  });
  h.advance(-1000);
  assert.deepEqual((await h.verify(command)).receipt, verified.receipt);
  assert.equal(h.ids, count);
  assert.deepEqual(await h.dump(), after);
});

test("D7-C migration of a committed v1 action preserves its evidence and permits independent verification", async (t) => {
  const h = await fixture(t, { upgrade: true });
  const id = await h.approved(),
    applied = await h.request(action, await h.command(id));
  const before = await h.dump();
  assert.equal(await h.upgradeVerification(), "applied");
  assert.equal(await h.upgradeVerification(), "unchanged");
  const after = await h.dump();
  for (const table of [
    "case_journal",
    "authority_snapshots",
    "authority_request_journal",
    "simulated_credit_source",
  ])
    assert.deepEqual(after[table], before[table]);
  assert.deepEqual(
    after.simulated_action_journal[0].row.entry,
    before.simulated_action_journal[0].row.entry,
  );
  const verified = await h.verify(h.verifyCommand(applied.receipt));
  assert.equal(
    verified.receipt.comparison.outcome,
    "verified_simulated_effect",
  );
  await h.restart();
  assert.equal(
    (await h.request(view)).attempts[0].schema_version,
    "simulated-action-journal-entry.v1",
  );
});

async function invocation(t, options = {}) {
  const h = await fixture(t, { verification: true, ...options });
  const id = await h.approved(),
    execution = await h.command(id);
  const attempt = (await h.request(action, execution)).receipt;
  return { h, id, execution, attempt, command: h.verifyCommand(attempt) };
}
test("D7-C strict HTTP verification bindings reject supplied authority, mismatched scope and altered retry bytes", async (t) => {
  const { h, attempt, command } = await invocation(t);
  const before = await h.dump();
  for (const extra of [
    { verifier_identity_id: "identity_d7_credit_executor" },
    { success: true },
    { observation: [] },
    { authorized: true },
    { recorded_at: START },
    { policy: {} },
  ])
    await h.verify({ ...command, ...extra }, 400);
  await h.request(
    `${action}/${attempt.id}/verifications`,
    { ...command, case_id: "case_other" },
    400,
  );
  await h.request(`${action}/attempt_other/verifications`, command, 400);
  assert.equal(
    (
      await h.verify(
        { ...command, expected_action_entry_hash: `sha256:${"0".repeat(64)}` },
        409,
      )
    ).code,
    "attempt_binding_conflict",
  );
  assert.deepEqual(await h.dump(), before);
  await h.verify(command);
  const recorded = await h.dump();
  assert.equal(
    (await h.verify({ ...command, correlation_id: "different" }, 409)).code,
    "idempotency_conflict",
  );
  assert.deepEqual(await h.dump(), recorded);
});
for (const variant of [
  "revoked identity",
  "revoked grant",
  "expired grant",
  "future grant",
  "wrong scope",
  "executor grant",
  "ambiguous grant",
])
  test(`D7-C current verifier rejects ${variant} without a proof or clock write`, async (t) => {
    const { h, command } = await invocation(t);
    h.advance(1000);
    await h.catalog((d) => {
      const g = d.authority_records.find(
        (g) => g.authority_class === "simulated_credit_verifier",
      );
      if (variant === "revoked identity")
        d.identities.find(
          (i) => i.identity_id === "identity_d7_credit_verifier",
        ).status = "revoked";
      if (variant === "revoked grant") g.status = "revoked";
      if (variant === "expired grant") {
        g.effective_until = h.now().toISOString();
        g.effective_until_source_timezone = "UTC";
      }
      if (variant === "future grant")
        g.effective_from = new Date(h.now().valueOf() + 1).toISOString();
      if (variant === "wrong scope") g.scope.case_ids = ["case_other"];
      if (variant === "executor grant")
        g.identity = structuredClone(
          d.identities.find(
            (i) => i.identity_id === "identity_d7_credit_executor",
          ),
        );
      if (variant === "ambiguous grant")
        d.authority_records.push({
          ...g,
          authority_record_id: "authority_conflicting_verifier",
        });
    });
    const before = await h.dump();
    assert.equal((await h.verify(command, 409)).code, "verifier_ineligible");
    assert.deepEqual(await h.dump(), before);
  });
test("D7-C verification of an earlier effect survives later evidence, rejection and catalog change without restoring authority", async (t) => {
  const { h, id, command } = await invocation(t);
  h.advance(1000);
  await h.decide(id, "finance", "reject", { reason: "Stop further authority" });
  await h.case(appendReplayEvidence());
  await h.catalog((d) => {
    d.policies[0].source_ref += "/later";
  });
  assert.equal(
    (await h.verify(command)).receipt.comparison.outcome,
    "verified_simulated_effect",
  );
  await h.restart();
  const packet = await h.request(view);
  assert.equal(packet.current.eligible, false);
  assert.equal(packet.closure_permission, false);
  assert.equal((await h.read(id)).current.authorized, false);
  const rejected = await h.case(
    {
      type: "case.transition",
      tenant_id: TENANT,
      case_id: CASE,
      expected_case_version: 5,
      actor_identity_id: "identity_d6_operator",
      idempotency_key: "verify-closure-denied",
      correlation_id: "closure",
      to_state: "resolved",
      reason: "Effect proof alone is insufficient",
    },
    200,
  );
  assert.equal(rejected.status, "rejected");
});
test("D7-C adapter success without source is a mismatch; only latest independent absence permits one explicit current retry", async (t) => {
  let inserts = false;
  const { h, id, attempt, command } = await invocation(t, {
    adapter: async (insert) => {
      if (inserts) await insert();
      return "success";
    },
  });
  assert.equal(attempt.source, null);
  const premature = await h.request(
    action,
    await h.command(id, "fresh-too-soon"),
    409,
  );
  assert.ok(
    premature.receipt.envelope.reason_codes.includes(
      "independent_absence_check_required",
    ),
  );
  const absence = await h.verify(command);
  assert.equal(absence.receipt.comparison.outcome, "mismatch");
  assert.equal(absence.receipt.comparison.absence_proven, true);
  await h.restart();
  const second = await h.request(
    action,
    await h.command(id, "explicit-second"),
  );
  assert.equal(
    second.receipt.envelope.absence_verification_hash,
    absence.receipt.event_hash,
  );
  assert.equal(second.receipt.source, null);
  await h.request(action, await h.command(id, "needs-new-absence"), 409);
  // Rechecking an older invocation cannot satisfy the latest one.
  await h.verify(h.verifyCommand(attempt));
  await h.request(action, await h.command(id, "still-needs-new-absence"), 409);
  const latest = await h.verify(h.verifyCommand(second.receipt));
  assert.equal(latest.receipt.comparison.absence_proven, true);
  inserts = true;
  const final = await h.request(action, await h.command(id, "explicit-final"));
  assert.equal(
    final.receipt.envelope.absence_verification_hash,
    latest.receipt.event_hash,
  );
  assert.ok(final.receipt.source);
  const oldOrigin = (await h.verify(h.verifyCommand(attempt))).receipt;
  assert.equal(oldOrigin.comparison.outcome, "mismatch");
  assert.ok(oldOrigin.comparison.reason_codes.includes("wrong_origin"));
  assert.equal(oldOrigin.comparison.absence_proven, false);
  await h.request(action, await h.command(id, "occupied"), 409);
  await h.restart();
  assert.equal(
    (await h.request(view)).source.origin_attempt_id,
    final.receipt.id,
  );
});
test("D7-C unavailable reads are inconclusive, survive restart, and cannot enable financial retries", async (t) => {
  const { h, id, command } = await invocation(t, {
    adapter: async () => "uncertain",
  });
  h.setReaderHook((sql) => {
    if (sql.includes("verification-read-source"))
      throw Error("injected read timeout");
  });
  const failed = await h.verify(command);
  assert.equal(failed.receipt.observation.raw.status, "unavailable");
  assert.equal(failed.receipt.comparison.outcome, "inconclusive");
  assert.equal(failed.receipt.comparison.absence_proven, false);
  h.setReaderHook(undefined);
  await h.request(action, await h.command(id, "error-is-not-absence"), 409);
  await h.restart();
  assert.deepEqual((await h.verify(command)).receipt, failed.receipt);
  const fresh = await h.verify(
    h.verifyCommand((await h.request(view)).attempts[0]),
  );
  assert.equal(fresh.receipt.comparison.absence_proven, true);
});

for (const variant of [
  "wrong amount",
  "wrong account",
  "wrong origin",
  "malformed row",
])
  test(`D7-C independently records ${variant} as a problem without accepting adapter acknowledgment`, async (t) => {
    const { h, attempt, command } = await invocation(t);
    // Privileged source corruption is deliberately distinct from canonical
    // action/Case/review/catalog history, which remains unchanged.
    const row = structuredClone(attempt.source);
    if (variant === "wrong amount") row.payload.amount_minor = 999;
    if (variant === "wrong account")
      row.target.account_ref = "synthetic://accounts/wrong";
    if (variant === "wrong origin")
      row.effected_at = new Date(h.now().valueOf() - 1).toISOString();
    if (variant === "malformed row") row.payload = null;
    delete row.row_hash;
    row.row_hash = sha256Json(row);
    await h.sql(
      "ALTER TABLE simulated_credit_source DISABLE TRIGGER simulated_source_append_only",
    );
    await h.sql(
      "UPDATE simulated_credit_source SET source_row=$1,row_hash=$2",
      [row, row.row_hash],
    );
    await h.sql(
      "ALTER TABLE simulated_credit_source ENABLE TRIGGER simulated_source_append_only",
    );
    const proof = (await h.verify(command)).receipt;
    assert.equal(
      proof.comparison.outcome,
      variant === "malformed row" ? "inconclusive" : "mismatch",
    );
    assert.equal(proof.comparison.absence_proven, false);
    assert.deepEqual(proof.observation.raw.rows[0].source_row, row);
    const state = await loadAuthorityStore({ query: h.sql }, true, true);
    assert.doesNotThrow(() => assertCreditIntegrity(state));
    assert.equal(
      (await h.request("/readyz", undefined, 503)).status,
      "not_ready",
    );
    await h.request(view, undefined, 500);
    await h.request(
      action,
      (await h.dump()).simulated_action_journal[0].row.entry.command,
      500,
    );
  });

test("D7-C a committed source change between observation and recording is inconclusive", async (t) => {
  let insertNow = false;
  const { h, id, attempt, command } = await invocation(t, {
    adapter: async (insert) => {
      if (insertNow) await insert();
      return "success";
    },
  });
  assert.equal(
    (await h.verify(command)).receipt.comparison.absence_proven,
    true,
  );
  const next = await h.command(id, "explicit-after-absence");
  let raced = false;
  h.setReaderHook(async (sql) => {
    if (sql === "COMMIT" && !raced) {
      raced = true;
      insertNow = true;
      await h.request(action, next);
    }
  });
  const proof = (await h.verify(h.verifyCommand(attempt))).receipt;
  h.setReaderHook(undefined);
  assert.equal(raced, true);
  assert.equal(proof.comparison.outcome, "inconclusive");
  assert.ok(proof.comparison.reason_codes.includes("source_changed"));
  assert.ok(proof.comparison.reason_codes.includes("operation_changed"));
  assert.equal(proof.comparison.absence_proven, false);
  await h.restart();
  assert.deepEqual((await h.request(view)).verifications.at(-1), proof);
  await h.request(action, await h.command(id, "race-cannot-credit-again"), 409);
});

test("D7-C simultaneous verification keys serialize; same-key races return one exact proof", async (t) => {
  const { h, attempt, command } = await invocation(t);
  const same = await Promise.all([h.verify(command), h.verify(command)]);
  assert.deepEqual(same.map((r) => r.status).sort(), ["applied", "duplicate"]);
  assert.deepEqual(same[0].receipt, same[1].receipt);
  let readers = 0,
    release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  h.setReaderHook(async (sql) => {
    if (sql === "COMMIT") {
      if (++readers === 2) release();
      await barrier;
    }
  });
  const different = await Promise.all([
    h.verify(h.verifyCommand(attempt)),
    h.verify(h.verifyCommand(attempt)),
  ]);
  h.setReaderHook(undefined);
  assert.deepEqual(different.map((r) => r.receipt.comparison.outcome).sort(), [
    "inconclusive",
    "verified_simulated_effect",
  ]);
  assert.equal((await h.request(view)).verifications.length, 3);
  await h.restart();
  assert.equal((await h.request(view)).verifications.length, 3);
});

for (const change of ["revoke", "expire", "regress"])
  test(`D7-C recording rechecks current verifier and final time after observation: ${change}`, async (t) => {
    const { h, command } = await invocation(t);
    if (change === "expire")
      await h.catalog((d) => {
        const g = d.authority_records.find(
          (g) => g.authority_class === "simulated_credit_verifier",
        );
        g.effective_until = new Date(h.now().valueOf() + 1000).toISOString();
        g.effective_until_source_timezone = "UTC";
      });
    let before = await h.dump(),
      changed = false;
    h.setReaderHook(async (sql) => {
      if (sql === "COMMIT" && !changed) {
        changed = true;
        h.advance(change === "regress" ? -1 : 1000);
        if (change === "revoke") {
          await h.catalog((d) => {
            d.identities.find(
              (i) => i.identity_id === "identity_d7_credit_verifier",
            ).status = "revoked";
          });
          before = await h.dump();
        }
      }
    });
    await h.verify(command, change === "regress" ? 500 : 409);
    h.setReaderHook(undefined);
    assert.equal(changed, true);
    assert.deepEqual(await h.dump(), before);
  });

for (const [tag, remaining] of [
  ["fr:verification-insert-journal", 1],
  ["fr:verification-clock", 1],
  ["fr:authority-increment-writer", 1],
  ["fr:credit-load-journal", 3],
  ["COMMIT", 2],
])
  test(`D7-C persistence failure ${tag} rolls back proof and clock and exact retry works after restart`, async (t) => {
    const { h, command } = await invocation(t);
    h.advance(1000);
    const before = await h.dump();
    h.inject(tag, { remaining });
    await h.verify(command, 500);
    assert.deepEqual(await h.dump(), before);
    await h.restart();
    const result = await h.verify(command);
    assert.equal(
      result.receipt.comparison.outcome,
      "verified_simulated_effect",
    );
    assert.equal(
      (await h.dump()).authority_catalog[0].row.last_recorded_at,
      h.now().toISOString(),
    );
  });

test("D7-C lost commit response reconstructs exact proof before any new read or clock sample", async (t) => {
  const { h, command } = await invocation(t);
  h.advance(1000);
  h.inject("COMMIT", { remaining: 2, after: true });
  await h.verify(command, 500);
  const durable = await h.dump(),
    receipt = durable.simulated_action_journal.at(-1).row.entry;
  assert.equal(receipt.comparison.outcome, "verified_simulated_effect");
  await h.restart();
  h.setReaderHook(() => {
    throw Error("retry read is forbidden");
  });
  h.advance(-1000);
  assert.deepEqual((await h.verify(command)).receipt, receipt);
  assert.deepEqual(await h.dump(), durable);
});

test("D7-C writer read failure is inconclusive and failed rollback evicts the connection", async (t) => {
  const { h, command, attempt } = await invocation(t);
  h.inject("fr:verification-read-source");
  const proof = (await h.verify(command)).receipt;
  assert.equal(proof.comparison.outcome, "inconclusive");
  assert.equal(proof.comparison.absence_proven, false);
  assert.equal(proof.recording_source.status, "unavailable");
  const next = h.verifyCommand(attempt),
    before = await h.dump();
  h.inject("fr:verification-clock", { rollback: true });
  await h.verify(next, 500);
  assert.ok(h.discarded.includes(true));
  assert.deepEqual(await h.dump(), before);
  await h.restart();
  assert.equal(
    (await h.verify(next)).receipt.comparison.outcome,
    "verified_simulated_effect",
  );
});

test("D7-C terminated writer cannot leave partial verification proof", async (t) => {
  const { h, command } = await invocation(t),
    before = await h.dump();
  let killed = false;
  h.setHook(async (sql, pid) => {
    if (!killed && sql.includes("fr:verification-clock")) {
      killed = true;
      await h.sql("SELECT pg_terminate_backend($1)", [pid]);
    }
  });
  await h.verify(command, 500);
  h.setHook(undefined);
  assert.ok(killed);
  assert.deepEqual(await h.dump(), before);
  await h.restart();
  assert.equal(
    (await h.verify(command)).receipt.comparison.outcome,
    "verified_simulated_effect",
  );
});

for (const forgery of [
  "false absence",
  "false match",
  "wrong verifier",
  "success from read error",
])
  test(`D7-C coherent ${forgery} proof fails runtime replay, readiness, operation reads and restart`, async (t) => {
    const { h, attempt, command } = await invocation(
      t,
      forgery === "false match" ? { adapter: async () => "success" } : {},
    );
    const proof = (await h.verify(command)).receipt,
      canonical = await h.dump();
    const state = await loadAuthorityStore({ query: h.sql }, true);
    assert.doesNotThrow(() => assertCreditIntegrity(state));
    const forged = structuredClone(proof);
    if (forgery === "false absence") {
      forged.observation.raw = {
        status: "read",
        rows: [],
        hash: sha256Json([]),
      };
      forged.recording_source = structuredClone(forged.observation.raw);
      forged.comparison = {
        outcome: "mismatch",
        reason_codes: ["source_absent"],
        absence_proven: true,
      };
    }
    if (forgery === "false match") {
      const source = creditSource(attempt.id, attempt.recorded_at);
      const rows = [
        {
          tenant_id: TENANT,
          case_id: CASE,
          slot: "service_remedy",
          origin_attempt_id: attempt.id,
          row_hash: source.row_hash,
          source_row: source,
        },
      ];
      forged.observation.raw = { status: "read", rows, hash: sha256Json(rows) };
      forged.recording_source = structuredClone(forged.observation.raw);
      forged.comparison = {
        outcome: "verified_simulated_effect",
        reason_codes: [],
        absence_proven: false,
      };
    }
    if (forgery === "wrong verifier") {
      forged.authority.verifier_identity.identity_id =
        "identity_d7_credit_executor";
      forged.authority.read_grant.identity.identity_id =
        "identity_d7_credit_executor";
      forged.authority.recording_grant.identity.identity_id =
        "identity_d7_credit_executor";
    }
    if (forgery === "success from read error")
      forged.observation.raw = {
        status: "unavailable",
        rows: null,
        hash: null,
      };
    forged.envelope_hash = attempt.envelope_hash;
    delete forged.event_hash;
    forged.event_hash = sha256Json(forged);
    assert.throws(
      () =>
        assertCreditIntegrity({
          ...state,
          credit: { ...state.credit, entries: [attempt, forged] },
        }),
      /verification differs from canonical replay/,
    );
    await h.sql(
      "ALTER TABLE simulated_action_journal DISABLE TRIGGER simulated_action_append_only",
    );
    const columns = [...CREDIT_COLUMNS, "entry"];
    await h.sql(
      `UPDATE simulated_action_journal SET ${columns.map((c, i) => `${c}=$${i + 1}`).join(",")} WHERE id=$1`,
      [...CREDIT_COLUMNS.map((k) => forged[k]), forged],
    );
    await h.sql(
      "ALTER TABLE simulated_action_journal ENABLE TRIGGER simulated_action_append_only",
    );
    const after = await h.dump();
    for (const table of tables.filter((t) => t !== "simulated_action_journal"))
      assert.deepEqual(after[table], canonical[table]);
    await h.request("/readyz", undefined, 503);
    await h.request(view, undefined, 500);
    await assert.rejects(() => h.restart(), /replay validation/);
  });

test("D7-C later inconclusive check supersedes absence; fresh execution still needs current authority", async (t) => {
  const { h, id, attempt, command } = await invocation(t, {
    adapter: async () => "success",
  });
  await h.verify(command);
  assert.equal((await h.request(view)).current.eligible, true);
  h.setReaderHook((sql) => {
    if (sql.includes("verification-read-source")) throw Error("unavailable");
  });
  await h.verify(h.verifyCommand(attempt));
  h.setReaderHook(undefined);
  await h.request(action, await h.command(id, "later-error-blocks"), 409);
  await h.verify(h.verifyCommand(attempt));
  await h.decide(id, "finance", "reject", {
    reason: "Absence does not grant execution authority",
  });
  const denied = await h.request(
    action,
    await h.command(id, "terminal-even-with-absence"),
    409,
  );
  assert.ok(
    denied.receipt.envelope.reason_codes.includes("current_authority_required"),
  );
  assert.equal(denied.receipt.adapter_report, "not_invoked");
  await h.restart();
  assert.equal((await h.request(view)).source, null);
});

test("D7-C replay rejects an obsolete read catalog hidden behind an older review position", async (t) => {
  const { h, id, attempt, command } = await invocation(t);
  const original = (await h.verify(command)).receipt;
  h.advance(1000);
  await h.decide(id, "finance", "escalate", {
    reason: "Review changes before verifier revocation",
  });
  h.advance(1000);
  await h.catalog((d) => {
    d.identities.find(
      (i) => i.identity_id === "identity_d7_credit_verifier",
    ).status = "revoked";
  });
  h.advance(1000);
  const duringRevocation = h.now().toISOString();
  h.advance(1000);
  await h.catalog((d) => {
    d.identities.find(
      (i) => i.identity_id === "identity_d7_credit_verifier",
    ).status = "active";
  });
  // Explicit later catalog restoration is current, never retroactive permission.
  const state = await loadAuthorityStore({ query: h.sql }, true);
  const beforeProof = {
    ...state,
    credit: { ...state.credit, entries: [attempt] },
  };
  const observation = {
    ...original.observation,
    observed_at: duringRevocation,
  };
  h.advance(1000);
  const { verificationEntry } =
    await import("../dist/packages/runtime/src/credit-verification.js");
  let forged = verificationEntry(
    beforeProof,
    command,
    observation,
    original.recording_source,
    h.now().toISOString(),
    state.heads[0].last_recorded_at,
    original.id,
  );
  assert.equal(forged.comparison.outcome, "inconclusive");
  assert.ok(forged.comparison.reason_codes.includes("catalog_changed"));
  const falseProof = structuredClone(forged);
  falseProof.comparison = {
    outcome: "verified_simulated_effect",
    reason_codes: [],
    absence_proven: false,
  };
  delete falseProof.event_hash;
  falseProof.event_hash = sha256Json(falseProof);
  forged = falseProof;
  assert.throws(
    () =>
      assertCreditIntegrity({
        ...state,
        credit: { ...state.credit, entries: [attempt, forged] },
      }),
    /verification differs from canonical replay/,
  );
  const canonical = await h.dump();
  await h.sql(
    "ALTER TABLE simulated_action_journal DISABLE TRIGGER simulated_action_append_only",
  );
  const columns = [...CREDIT_COLUMNS, "entry"];
  await h.sql(
    `WITH proof AS (UPDATE simulated_action_journal SET ${columns.map((c, i) => `${c}=$${i + 1}`).join(",")} WHERE id=$1 RETURNING id)
    UPDATE authority_catalog SET last_recorded_at=$${columns.length + 1} WHERE EXISTS (SELECT 1 FROM proof)`,
    [...CREDIT_COLUMNS.map((k) => forged[k]), forged, forged.recorded_at],
  );
  await h.sql(
    "ALTER TABLE simulated_action_journal ENABLE TRIGGER simulated_action_append_only",
  );
  const changed = await h.dump();
  for (const table of [
    "case_journal",
    "authority_request_journal",
    "authority_snapshots",
    "simulated_credit_source",
  ])
    assert.deepEqual(changed[table], canonical[table]);
  await h.request("/readyz", undefined, 503);
  await h.request(view, undefined, 500);
  await assert.rejects(() => h.restart(), /replay validation/);
});

test("D7-C a read overlapping an uncommitted catalog write retains inconclusive evidence, never a false match", async (t) => {
  const { h, command } = await invocation(t);
  let entered, release;
  const waiting = new Promise((r) => {
      entered = r;
    }),
    barrier = new Promise((r) => {
      release = r;
    });
  h.advance(1000);
  h.setHook(async (sql) => {
    if (sql.includes("fr:authority-update-catalog")) {
      entered();
      await barrier;
    }
  });
  const changing = h.catalog((d) => {
    d.policies[0].source_ref += "/overlap";
  });
  await waiting;
  h.advance(1000);
  h.setReaderHook(async (sql) => {
    if (sql === "COMMIT") {
      release();
      await changing;
    }
  });
  const proof = (await h.verify(command)).receipt;
  h.setHook(undefined);
  h.setReaderHook(undefined);
  assert.equal(proof.comparison.outcome, "inconclusive");
  assert.ok(proof.comparison.reason_codes.includes("catalog_changed"));
  assert.equal(proof.comparison.absence_proven, false);
  await h.restart();
  assert.deepEqual((await h.verify(command)).receipt, proof);
});

function workbench(h, options = {}) {
  return createReviewClient({
    fetcher: h.fetcher,
    storage: memoryStorage(),
    creditEnabled: true,
    nextKey: randomUUID,
    ...options,
  });
}
async function readyWorkbench(t, fixtureOptions = {}, clientOptions = {}) {
  const h = await fixture(t, { verification: true, ...fixtureOptions });
  await h.enroll();
  const client = workbench(h, clientOptions);
  await client.start();
  await client.initialize();
  for (let i = 0; i < 3; i++) await client.prepareCase();
  assert.equal(client.state.caseRecord.document.case.state, "needs_review");
  await client.freshRequest();
  await client.decide("finance", "approve");
  await client.decide("executive", "approve");
  assert.equal(client.state.error, null);
  assert.equal(client.state.creditError, null);
  assert.equal(canExecuteCredit(client.state), true);
  return { h, client };
}

test("D7-D Workbench: explicit preparation, review, credit, independent check and restart reconstruction", async (t) => {
  const { h, client } = await readyWorkbench(t);
  const c = client.state.packet.case_version,
    r = client.state.packet.review_revision;
  const before = await h.dump();
  await client.refresh();
  await client.refresh();
  assert.deepEqual(
    await h.dump(),
    before,
    "page reads have no durable effects",
  );
  await Promise.all([client.executeCredit(), client.executeCredit()]);
  assert.equal(client.state.pending, null);
  assert.equal(client.state.credit.attempts.length, 1);
  assert.equal(latestCheck(client.state.credit), null);
  assert.equal(canExecuteCredit(client.state), false);
  await client.verifyCredit();
  assert.equal(client.state.error, null);
  assert.equal(client.state.creditError, null);
  assert.equal(
    latestCheck(client.state.credit).comparison.outcome,
    "verified_simulated_effect",
  );
  assert.equal(client.state.packet.case_version, c);
  assert.equal(client.state.packet.review_revision, r);
  await h.restart();
  const reopened = workbench(h);
  await reopened.start(client.state.requestId);
  assert.deepEqual(
    reopened.state.credit.attempts,
    client.state.credit.attempts,
  );
  assert.deepEqual(
    reopened.state.credit.verifications,
    client.state.credit.verifications,
  );
  assert.equal(reopened.state.credit.closure_permission, false);
  const durable = await h.dump();
  const newViewer = workbench(h);
  await newViewer.start();
  await newViewer.initialize();
  assert.equal(newViewer.state.requestId, client.state.requestId);
  assert.deepEqual(
    await h.dump(),
    durable,
    "explicit reopen does not create a second request",
  );
});

for (const kind of ["execute", "verify"])
  test(`D7-D ${kind}: saved exact command survives lost response, reopening and restart`, async (t) => {
    const storage = memoryStorage();
    const { h, client } = await readyWorkbench(t, {}, { storage });
    if (kind === "verify") await client.executeCredit();
    let dropped = false;
    const calls = [];
    const uncertain = workbench(h, {
      storage,
      fetcher: async (path, options) => {
        const result = await h.fetcher(path, options);
        if (options.method === "POST") {
          calls.push(options.body);
          assert.ok(
            storage
              .keys()
              .some(
                (key) =>
                  key.startsWith(PENDING_PREFIX) &&
                  JSON.parse(storage.getItem(key)).body === options.body,
              ),
            "saved before response",
          );
          if (!dropped) {
            dropped = true;
            throw Error("lost response");
          }
        }
        return result;
      },
    });
    await uncertain.start();
    await (kind === "execute"
      ? uncertain.executeCredit()
      : uncertain.verifyCredit());
    const original = uncertain.state.pending.body;
    assert.match(uncertain.state.error, /unconfirmed/);
    assert.equal(uncertain.state.creditReceipt, null);
    await h.restart();
    const retry = workbench(h, {
      storage,
      fetcher: async (path, options) => {
        if (options.method === "POST") assert.equal(options.body, original);
        return h.fetcher(path, options);
      },
    });
    await retry.start();
    assert.equal(retry.state.pending.body, original);
    await retry.retry();
    assert.equal(retry.state.pending, null);
    assert.equal(retry.state.error, null);
    assert.equal(retry.state.creditError, null);
    assert.equal(
      storage.keys().filter((key) => key.startsWith(PENDING_PREFIX)).length,
      0,
    );
    assert.equal(retry.state.credit.attempts.length, 1);
    if (kind === "verify")
      assert.equal(retry.state.credit.verifications.length, 1);
  });

test("D7-D confirmed verification survives failed refresh; unavailable read is never success or absence", async (t) => {
  const { h, client } = await readyWorkbench(t, {
    adapter: async () => "uncertain",
  });
  await client.executeCredit();
  h.setReaderHook((sql) => {
    if (sql.includes("verification-read-source"))
      throw Error("read unavailable");
  });
  let failRead = false;
  const c = workbench(h, {
    fetcher: async (path, options) => {
      if (failRead && path === CREDIT_ROOT && options.method === "GET")
        throw Error("refresh unavailable");
      const result = await h.fetcher(path, options);
      if (options.method === "POST") failRead = true;
      return result;
    },
  });
  await c.start(client.state.requestId);
  await c.verifyCredit();
  assert.equal(c.state.pending, null);
  assert.equal(c.state.creditReceipt.comparison.outcome, "inconclusive");
  assert.equal(c.state.creditReceipt.comparison.absence_proven, false);
  assert.equal(c.state.creditNeedsRefresh, true);
  assert.match(c.state.creditError, /confirmed receipt remains recorded/);
  assert.equal(canExecuteCredit(c.state), false);
  h.setReaderHook(undefined);
  failRead = false;
  await c.refresh();
  assert.equal(latestCheck(c.state.credit).comparison.outcome, "inconclusive");
  const oldKey = c.state.creditReceipt.command.idempotency_key;
  await c.verifyCredit();
  assert.notEqual(c.state.creditReceipt.command.idempotency_key, oldKey);
  assert.equal(c.state.creditReceipt.comparison.outcome, "mismatch");
});

test("D7-D latest independent absence permits only an explicit fresh attempt; occupied slot blocks duplicates", async (t) => {
  let insert = false;
  const { h, client } = await readyWorkbench(t, {
    adapter: async (write) => {
      if (insert) await write();
      return "success";
    },
  });
  await client.executeCredit();
  assert.equal(canExecuteCredit(client.state), false);
  await client.verifyCredit();
  assert.equal(latestCheck(client.state.credit).comparison.outcome, "mismatch");
  assert.equal(
    latestCheck(client.state.credit).comparison.absence_proven,
    true,
  );
  assert.equal(canExecuteCredit(client.state), true);
  assert.equal(
    client.state.credit.attempts.length,
    1,
    "check did not automatically retry financial effect",
  );
  insert = true;
  await client.executeCredit();
  assert.equal(client.state.credit.attempts.length, 2);
  assert.equal(canExecuteCredit(client.state), false);
  await client.verifyCredit();
  assert.equal(
    latestCheck(client.state.credit).comparison.outcome,
    "verified_simulated_effect",
  );
  await h.restart();
  await client.refresh();
  assert.equal(canExecuteCredit(client.state), false);
});

for (const change of ["evidence", "reject", "modify", "escalate"])
  test(`D7-D ${change}: stale execution cannot stop independent historical verification`, async (t) => {
    const { h, client } = await readyWorkbench(t);
    await client.executeCredit();
    if (change === "evidence") await client.attachEvidence();
    else
      await client.decide(
        "executive",
        change,
        "Intervene after the effect",
        "credit_12000",
      );
    assert.equal(client.state.packet.current.authorized, false);
    assert.equal(canExecuteCredit(client.state), false);
    await client.verifyCredit();
    assert.equal(client.state.error, null);
    assert.equal(
      latestCheck(client.state.credit).comparison.outcome,
      "verified_simulated_effect",
    );
    if (change === "modify") {
      const id = client.state.receipt.replacement_authority_request_id;
      assert.equal((await h.read(id)).review_revision, 0);
      assert.equal((await h.read(id)).current.authorized, false);
    }
  });

test("D7-D stale displayed bindings are submitted unchanged, denied and require explicit refresh", async (t) => {
  const { h, client } = await readyWorkbench(t);
  const c = client.state.packet.case_version;
  await h.case({
    type: "case.attach_work_event",
    tenant_id: TENANT,
    case_id: CASE,
    expected_case_version: c,
    actor_identity_id: "identity_d6_operator",
    idempotency_key: "outside-browser",
    correlation_id: "test",
    work_event: workEvent("update", "update"),
  });
  await client.executeCredit();
  assert.equal(client.state.pending, null);
  assert.equal(client.state.creditReceipt.command.expected_case_version, c);
  assert.equal(client.state.creditReceipt.outcome, "denied");
  assert.equal(client.state.credit.source, null);
  assert.equal(canExecuteCredit(client.state), false);
});

test("D7-D altered presentation cannot turn adapter success or an inconclusive check into verification", async (t) => {
  const { client } = await readyWorkbench(t);
  await client.executeCredit();
  await client.verifyCredit();
  const valid = client.state.credit;
  for (const edit of [
    (v) => {
      v.verifications[0].comparison.outcome = "inconclusive";
    },
    (v) => {
      v.verifications[0].authority.verifier_identity.identity_id =
        "identity_d7_credit_executor";
    },
    (v) => {
      v.verifications[0].observation.raw.rows[0].source_row.payload.amount_minor = 999;
    },
    (v) => {
      v.verifications[0].action_entry_hash = "sha256:" + "0".repeat(64);
    },
  ]) {
    const changed = structuredClone(valid);
    edit(changed);
    assert.throws(() => validateCredit(changed), /invalid/);
  }
});

if (process.env.D7_WORKBENCH_BROWSER === "1") {
  const { registerCreditBrowserTests } =
    await import("../tests/helpers/credit-workbench-browser.mjs");
  registerCreditBrowserTests(fixture);
}
