import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertCaseEngineStateIntegrity,
  PostgresCaseStore,
  sha256Json,
} from "../dist/packages/runtime/src/index.js";

function emptyDatabase() {
  return {
    writerLockPresent: true,
    revision: 0,
    projections: [],
    journal: [],
    sourceEvents: [],
    emittedIds: [],
  };
}

function cloneDatabase(database) {
  return structuredClone(database);
}

function tagged(statement) {
  return /\/\* fr:([^*]+) \*\//.exec(statement)?.[1]?.trim();
}

class FakeSqlPool {
  database = emptyDatabase();
  discardedClients = 0;
  #lockTail = Promise.resolve();
  #failureTags = new Set();

  async connect() {
    return new FakeSqlClient(this);
  }

  failOnce(tag) {
    this.#failureTags.add(tag);
  }

  consumeFailure(tag) {
    if (tag === undefined || !this.#failureTags.has(tag)) {
      return false;
    }
    this.#failureTags.delete(tag);
    return true;
  }

  async acquireWriter() {
    const predecessor = this.#lockTail;
    let unlock;
    this.#lockTail = new Promise((resolve) => {
      unlock = resolve;
    });
    await predecessor;
    return unlock;
  }
}

class FakeSqlClient {
  #pool;
  #transactionOpen = false;
  #readOnly = false;
  #working;
  #unlock;
  #released = false;

  constructor(pool) {
    this.#pool = pool;
  }

  async query(statement, values = []) {
    if (this.#released) {
      throw new Error("query after release");
    }
    if (statement.startsWith("BEGIN")) {
      assert.equal(this.#transactionOpen, false);
      this.#transactionOpen = true;
      this.#readOnly = statement.includes("READ ONLY");
      if (this.#readOnly) {
        this.#working = cloneDatabase(this.#pool.database);
      }
      return { rows: [], rowCount: null };
    }
    if (statement === "COMMIT") {
      assert.equal(this.#transactionOpen, true);
      if (!this.#readOnly) {
        assert.ok(this.#working);
        this.#pool.database = this.#working;
      }
      this.#finishTransaction();
      return { rows: [], rowCount: null };
    }
    if (statement === "ROLLBACK") {
      assert.equal(this.#transactionOpen, true);
      if (this.#pool.consumeFailure("rollback")) {
        throw new Error("injected SQL failure at rollback");
      }
      this.#finishTransaction();
      return { rows: [], rowCount: null };
    }

    const tag = tagged(statement);
    if (tag === "lock-writer") {
      assert.equal(this.#readOnly, false);
      this.#unlock = await this.#pool.acquireWriter();
      this.#working = cloneDatabase(this.#pool.database);
      return {
        rows: this.#working.writerLockPresent
          ? [{ revision: this.#working.revision }]
          : [],
        rowCount: this.#working.writerLockPresent ? 1 : 0,
      };
    }
    if (this.#pool.consumeFailure(tag)) {
      throw new Error(`injected SQL failure at ${tag}`);
    }
    const database = this.#database();

    switch (tag) {
      case "load-projections":
        return {
          rows: database.projections
            .toSorted((left, right) =>
              `${left.tenant_id}/${left.case_id}`.localeCompare(
                `${right.tenant_id}/${right.case_id}`,
              ),
            )
            .map((row) => structuredClone(row)),
          rowCount: database.projections.length,
        };
      case "read-writer":
        return {
          rows: database.writerLockPresent
            ? [{ revision: database.revision }]
            : [],
          rowCount: database.writerLockPresent ? 1 : 0,
        };
      case "load-journal":
        return {
          rows: database.journal
            .toSorted((left, right) =>
              `${left.entry.tenant_id}/${left.entry.case_id}/${String(left.entry.sequence).padStart(12, "0")}`.localeCompare(
                `${right.entry.tenant_id}/${right.entry.case_id}/${String(right.entry.sequence).padStart(12, "0")}`,
              ),
            )
            .map(({ entry }) => ({ entry: structuredClone(entry) })),
          rowCount: database.journal.length,
        };
      case "load-source-events":
        return {
          rows: database.sourceEvents
            .toSorted((left, right) =>
              `${left.tenant_id}/${left.source}/${left.source_event_id}`.localeCompare(
                `${right.tenant_id}/${right.source}/${right.source_event_id}`,
              ),
            )
            .map((row) => structuredClone(row)),
          rowCount: database.sourceEvents.length,
        };
      case "load-emitted-ids":
        return {
          rows: database.emittedIds
            .toSorted((left, right) => left.id.localeCompare(right.id))
            .map((row) => structuredClone(row)),
          rowCount: database.emittedIds.length,
        };
      case "insert-projection": {
        const [tenantId, caseId, version, document, sequence, headHash] =
          values;
        if (
          database.projections.some(
            (row) => row.tenant_id === tenantId && row.case_id === caseId,
          )
        ) {
          throw new Error("duplicate projection");
        }
        database.projections.push({
          tenant_id: tenantId,
          case_id: caseId,
          version,
          document: structuredClone(document),
          journal_sequence: sequence,
          journal_head_hash: headHash,
        });
        return { rows: [], rowCount: 1 };
      }
      case "update-projection": {
        const [
          tenantId,
          caseId,
          version,
          document,
          sequence,
          headHash,
          expectedVersion,
          expectedSequence,
          expectedHead,
        ] = values;
        const row = database.projections.find(
          (candidate) =>
            candidate.tenant_id === tenantId &&
            candidate.case_id === caseId &&
            candidate.version === expectedVersion &&
            candidate.journal_sequence === expectedSequence &&
            candidate.journal_head_hash === expectedHead,
        );
        if (row === undefined) {
          return { rows: [], rowCount: 0 };
        }
        Object.assign(row, {
          version,
          document: structuredClone(document),
          journal_sequence: sequence,
          journal_head_hash: headHash,
        });
        return { rows: [], rowCount: 1 };
      }
      case "insert-journal": {
        const entry = structuredClone(values[13]);
        if (
          database.journal.some(
            (row) =>
              row.entry.id === entry.id ||
              (row.entry.tenant_id === entry.tenant_id &&
                row.entry.idempotency_key === entry.idempotency_key) ||
              (row.entry.tenant_id === entry.tenant_id &&
                row.entry.case_id === entry.case_id &&
                row.entry.sequence === entry.sequence),
          )
        ) {
          throw new Error("duplicate journal identity");
        }
        database.journal.push({ entry });
        return { rows: [], rowCount: 1 };
      }
      case "insert-emitted-ids": {
        const [journalId, auditId, tenantId, caseId] = values;
        if (
          database.emittedIds.some(
            (row) => row.id === journalId || row.id === auditId,
          ) ||
          journalId === auditId
        ) {
          throw new Error("duplicate emitted id");
        }
        database.emittedIds.push(
          {
            id: journalId,
            record_kind: "journal",
            tenant_id: tenantId,
            case_id: caseId,
            journal_entry_id: journalId,
          },
          {
            id: auditId,
            record_kind: "audit",
            tenant_id: tenantId,
            case_id: caseId,
            journal_entry_id: journalId,
          },
        );
        return { rows: [], rowCount: 2 };
      }
      case "insert-source-event": {
        const [
          tenantId,
          source,
          sourceEventId,
          fingerprint,
          caseId,
          journalEntryId,
          createBinding,
        ] = values;
        if (
          database.sourceEvents.some(
            (row) =>
              row.tenant_id === tenantId &&
              row.source === source &&
              row.source_event_id === sourceEventId,
          )
        ) {
          throw new Error("duplicate source-event identity");
        }
        database.sourceEvents.push({
          tenant_id: tenantId,
          source,
          source_event_id: sourceEventId,
          work_event_fingerprint: fingerprint,
          case_id: caseId,
          journal_entry_id: journalEntryId,
          create_binding_fingerprint: createBinding,
        });
        return { rows: [], rowCount: 1 };
      }
      case "increment-writer-revision":
        database.revision += 1;
        return { rows: [], rowCount: 1 };
      default:
        throw new Error(`unrecognized SQL statement: ${statement}`);
    }
  }

  release(discard = false) {
    if (discard) {
      this.#pool.discardedClients += 1;
      this.#finishTransaction();
    } else {
      assert.equal(this.#transactionOpen, false);
    }
    this.#released = true;
  }

  #database() {
    assert.equal(this.#transactionOpen, true);
    assert.ok(this.#working);
    return this.#working;
  }

  #finishTransaction() {
    this.#transactionOpen = false;
    this.#working = undefined;
    this.#readOnly = false;
    this.#unlock?.();
    this.#unlock = undefined;
  }
}

function makeDependencies(prefix, start = "2026-09-01T16:00:00.000Z") {
  const epoch = Date.parse(start);
  const stats = { ids: 0, now: 0 };
  return {
    stats,
    dependencies: {
      now() {
        stats.now += 1;
        return new Date(epoch + stats.now * 1000);
      },
      nextId(kind) {
        stats.ids += 1;
        return `${kind}_${prefix}_${String(stats.ids)}`;
      },
    },
  };
}

function workEvent(suffix = "001", overrides = {}) {
  return {
    id: `work_event_${suffix}`,
    tenant_id: "tenant_orchid",
    source: "fixture_slack",
    source_event_id: `source_${suffix}`,
    event_type: "message.created",
    actor_identity_id: "user_operator",
    scope_ids: ["scope_customer_ops"],
    occurred_at: "2026-09-01T15:59:00.000Z",
    source_timezone: "UTC",
    content_hash: sha256Json({ body: `event-${suffix}` }),
    payload_ref: `fixture://events/${suffix}`,
    classification: "internal",
    idempotency_key: `tenant_orchid:fixture_slack:source_${suffix}`,
    ...overrides,
  };
}

function createCommand(overrides = {}) {
  return {
    type: "case.create",
    tenant_id: "tenant_orchid",
    expected_case_version: 0,
    actor_identity_id: "system_fieldruntime",
    idempotency_key: "create-case-001",
    correlation_id: "trace-case-001",
    case_seed: {
      tenant: {
        id: "tenant_orchid",
        name: "Orchid Evaluation Tenant",
        status: "active",
        data_region: "local",
        retention_policy_id: "retention_eval_v0",
      },
      workflow_version: {
        id: "workflow_ecc_v0_1_0",
        workflow_id: "customer_escalation_commitment_control",
        version: "0.1.0",
        status: "shadow",
        decision_graph_id: "ecc_decision_graph_v0",
        policy_version_ids: ["policy_customer_comms_v3"],
        eval_suite_version: "0.1.0",
        effective_from: "2026-08-26T00:00:00.000Z",
        effective_from_source_timezone: "UTC",
      },
      case: {
        id: "case_runtime_001",
        tenant_id: "tenant_orchid",
        workflow_version_id: "workflow_ecc_v0_1_0",
        customer_ref: "crm://accounts/acme-aero",
        issue_fingerprint: "acme-aero:sso-failure",
        severity: "high",
        owner_identity_id: "user_operator",
        scope_ids: ["scope_customer_ops", "scope_acme_aero"],
        related_case_ids: [],
      },
    },
    trigger_event: workEvent("001"),
    ...overrides,
  };
}

function attachCommand(version, suffix, overrides = {}) {
  return {
    type: "case.attach_work_event",
    tenant_id: "tenant_orchid",
    case_id: "case_runtime_001",
    expected_case_version: version,
    actor_identity_id: "system_fieldruntime",
    idempotency_key: `attach-${suffix}`,
    correlation_id: `trace-attach-${suffix}`,
    work_event: workEvent(suffix),
    ...overrides,
  };
}

function transitionCommand(version, toState, suffix, overrides = {}) {
  return {
    type: "case.transition",
    tenant_id: "tenant_orchid",
    case_id: "case_runtime_001",
    expected_case_version: version,
    actor_identity_id: "user_operator",
    idempotency_key: `transition-${suffix}`,
    correlation_id: `trace-transition-${suffix}`,
    to_state: toState,
    reason: `Move the case to ${toState}`,
    ...overrides,
  };
}

test("PostgresCaseStore commits and rehydrates the complete atomic create", async () => {
  const pool = new FakeSqlPool();
  const store = new PostgresCaseStore(pool);
  const harness = makeDependencies("create");
  const result = await store.execute(createCommand(), harness.dependencies);

  assert.equal(result.status, "applied");
  assert.equal(pool.database.revision, 1);
  assert.equal(pool.database.projections.length, 1);
  assert.equal(pool.database.journal.length, 1);
  assert.equal(pool.database.sourceEvents.length, 1);
  assert.equal(pool.database.emittedIds.length, 2);
  assert.equal(
    result.append.idempotency_record.journal_entry_id,
    result.entry.id,
  );

  const persisted = await store.getCase("tenant_orchid", "case_runtime_001");
  assert.deepEqual(persisted, result.aggregate);
  assert.equal(
    (await store.getJournal("tenant_orchid", "case_runtime_001"))?.length,
    1,
  );
  assert.equal((await store.listCases("tenant_orchid")).length, 1);
  assert.equal((await store.listCases("tenant_other")).length, 0);
  assert.equal(
    await store.getJournal("tenant_other", "case_runtime_001"),
    undefined,
  );
  assert.doesNotThrow(() => assertCaseEngineStateIntegrity(result.state));
});

test("post-commit verification treats persisted index ordering as non-semantic", async () => {
  const pool = new FakeSqlPool();
  const store = new PostgresCaseStore(pool);
  await store.execute(
    createCommand(),
    makeDependencies("ordering_first").dependencies,
  );
  const second = structuredClone(createCommand());
  second.case_seed.case.id = "case_alpha_002";
  second.case_seed.case.issue_fingerprint = "alpha:second-case";
  second.trigger_event = workEvent("000");
  second.idempotency_key = "create-case-alpha-002";
  second.correlation_id = "trace-case-alpha-002";

  const created = await store.execute(
    second,
    makeDependencies("ordering_second").dependencies,
  );
  assert.equal(created.status, "applied");
  assert.deepEqual(
    (await store.listCases("tenant_orchid")).map(({ case_id }) => case_id),
    ["case_alpha_002", "case_runtime_001"],
  );
});

test("every persistence failure rolls back projection, journal, indexes, and IDs", async () => {
  for (const tag of [
    "insert-projection",
    "insert-journal",
    "insert-emitted-ids",
    "insert-source-event",
    "increment-writer-revision",
  ]) {
    const pool = new FakeSqlPool();
    const store = new PostgresCaseStore(pool);
    const harness = makeDependencies(tag.replaceAll("-", "_"));
    pool.failOnce(tag);

    await assert.rejects(
      store.execute(createCommand(), harness.dependencies),
      (error) =>
        error?.code === "STORE_TRANSACTION" &&
        error.cause?.message.includes(tag),
    );
    assert.deepEqual(pool.database, emptyDatabase());

    const retry = await store.execute(createCommand(), harness.dependencies);
    assert.equal(retry.status, "applied");
    assert.equal(pool.database.revision, 1);
  }
});

test("every update persistence failure restores the prior durable state", async () => {
  for (const tag of [
    "update-projection",
    "insert-journal",
    "insert-emitted-ids",
    "insert-source-event",
    "increment-writer-revision",
  ]) {
    const pool = new FakeSqlPool();
    const store = new PostgresCaseStore(pool);
    await store.execute(
      createCommand(),
      makeDependencies(`update_seed_${tag}`).dependencies,
    );
    const before = cloneDatabase(pool.database);
    pool.failOnce(tag);

    await assert.rejects(
      store.execute(
        attachCommand(1, "002"),
        makeDependencies(`update_fail_${tag}`).dependencies,
      ),
      (error) =>
        error?.code === "STORE_TRANSACTION" &&
        error.cause?.message.includes(tag),
    );
    assert.deepEqual(pool.database, before);

    const retry = await store.execute(
      attachCommand(1, "002"),
      makeDependencies(`update_retry_${tag}`).dependencies,
    );
    assert.equal(retry.status, "applied");
  }
});

test("a failed rollback discards the client and releases the writer", async () => {
  const pool = new FakeSqlPool();
  const store = new PostgresCaseStore(pool);
  pool.failOnce("insert-projection");
  pool.failOnce("rollback");

  await assert.rejects(
    store.execute(createCommand(), makeDependencies("rollback").dependencies),
    AggregateError,
  );
  assert.equal(pool.discardedClients, 1);
  assert.deepEqual(pool.database, emptyDatabase());

  const retry = await store.execute(
    createCommand(),
    makeDependencies("rollback_retry").dependencies,
  );
  assert.equal(retry.status, "applied");
});

test("the writer lock makes concurrent exact retries consume dependencies once", async () => {
  const pool = new FakeSqlPool();
  const store = new PostgresCaseStore(pool);
  const first = makeDependencies("race_a");
  const second = makeDependencies("race_b");

  const results = await Promise.all([
    store.execute(createCommand(), first.dependencies),
    store.execute(createCommand(), second.dependencies),
  ]);
  assert.deepEqual(results.map(({ status }) => status).toSorted(), [
    "applied",
    "duplicate",
  ]);
  assert.equal(first.stats.now + second.stats.now, 1);
  assert.equal(first.stats.ids + second.stats.ids, 2);
  assert.equal(pool.database.journal.length, 1);
  assert.equal(pool.database.sourceEvents.length, 1);
  assert.equal(pool.database.revision, 1);
});

test("journaled rejections persist once and retain their original disposition", async () => {
  const pool = new FakeSqlPool();
  const store = new PostgresCaseStore(pool);
  const createHarness = makeDependencies("reject_create");
  await store.execute(createCommand(), createHarness.dependencies);
  const rejectHarness = makeDependencies("reject_command");
  const command = transitionCommand(1, "executing", "shortcut");

  const rejected = await store.execute(command, rejectHarness.dependencies);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.code, "invalid_transition");
  assert.equal(rejected.aggregate.document.case.state, "detected");
  assert.equal(rejected.aggregate.document.case.version, 2);
  const consumed = { ...rejectHarness.stats };

  const duplicate = await store.execute(command, rejectHarness.dependencies);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.original_status, "rejected");
  assert.equal(duplicate.original_code, "invalid_transition");
  assert.deepEqual(rejectHarness.stats, consumed);
  assert.equal(pool.database.journal.length, 2);
  assert.equal(pool.database.revision, 2);
});

test("concurrent expected-version writers produce one winner without source aliases", async () => {
  const pool = new FakeSqlPool();
  const store = new PostgresCaseStore(pool);
  await store.execute(
    createCommand(),
    makeDependencies("version_create").dependencies,
  );
  const first = makeDependencies("version_a");
  const second = makeDependencies("version_b");
  const commands = [attachCommand(1, "002"), attachCommand(1, "003")];
  const results = await Promise.all([
    store.execute(commands[0], first.dependencies),
    store.execute(commands[1], second.dependencies),
  ]);

  const winnerIndex = results.findIndex(({ status }) => status === "applied");
  const loser = results.find(({ status }) => status === "conflict");
  assert.notEqual(winnerIndex, -1);
  assert.equal(loser?.code, "VERSION_CONFLICT");
  assert.equal(pool.database.journal.length, 2);
  assert.equal(pool.database.sourceEvents.length, 2);

  const replayHarness = makeDependencies("source_replay");
  const replay = structuredClone(commands[winnerIndex]);
  replay.idempotency_key = "fresh-key-for-source-replay";
  replay.correlation_id = "fresh-trace-for-source-replay";
  const sourceConflict = await store.execute(
    replay,
    replayHarness.dependencies,
  );
  assert.equal(sourceConflict.status, "conflict");
  assert.equal(sourceConflict.code, "SOURCE_EVENT_ALREADY_PROCESSED");
  assert.deepEqual(replayHarness.stats, { ids: 0, now: 0 });
});

test("hydration fails closed on projection drift before dependencies run", async () => {
  const pool = new FakeSqlPool();
  const store = new PostgresCaseStore(pool);
  await store.execute(
    createCommand(),
    makeDependencies("tamper_create").dependencies,
  );
  pool.database.projections[0].document.case.state = "resolved";
  const harness = makeDependencies("tamper_attempt");

  await assert.rejects(
    store.execute(attachCommand(1, "002"), harness.dependencies),
    (error) => error?.code === "STORE_INTEGRITY",
  );
  await assert.rejects(store.assertReady(), (error) => {
    return error?.code === "STORE_INTEGRITY";
  });
  assert.deepEqual(harness.stats, { ids: 0, now: 0 });
  assert.equal(pool.database.journal.length, 1);
});

test("readiness requires the singleton writer lock", async () => {
  const pool = new FakeSqlPool();
  const store = new PostgresCaseStore(pool);
  pool.database.writerLockPresent = false;

  await assert.rejects(store.assertReady(), (error) => {
    return error?.code === "STORE_INTEGRITY";
  });
});

test("migration enforces atomic identities and append-only durable records", async () => {
  const migration = await readFile(
    new URL(
      "../packages/runtime/migrations/0001_local_appliance.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE runtime_writer_lock/);
  assert.match(migration, /UNIQUE \(tenant_id, idempotency_key\)/);
  assert.match(migration, /previous_sequence bigint GENERATED ALWAYS/);
  assert.match(migration, /case_projection_journal_head_fk/);
  assert.match(migration, /causation_sequence < sequence/);
  assert.match(migration, /IS NOT DISTINCT FROM command_fingerprint/);
  assert.match(migration, /PRIMARY KEY \(tenant_id, source, source_event_id\)/);
  assert.match(migration, /CREATE TABLE runtime_emitted_ids/);
  assert.match(migration, /CREATE TABLE evaluation_demo_fixtures/);
  assert.match(migration, /evaluation_demo_fixtures_append_only/);
  assert.match(migration, /case_journal_append_only/);
  assert.match(migration, /source_event_identities_append_only/);
});
