import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertValidCaseDocument,
  assertValidCaseJournalEntry,
  ContractValidationError,
  validateCrossRecordInvariants,
} from "../dist/packages/contracts/src/index.js";
import {
  canTransition,
  CASE_STATES,
  CASE_TRANSITIONS,
} from "../dist/packages/domain/src/index.js";
import {
  assertCaseEngineStateIntegrity,
  canonicalJson,
  CanonicalJsonError,
  emptyCaseEngine,
  executeCaseCommand,
  immutableJson,
  replayCaseJournal,
  sha256Json,
} from "../dist/packages/runtime/src/index.js";

const fixture = JSON.parse(
  await readFile(
    new URL(
      "../packages/ecc-pack/fixtures/acme-sso-needs-review.case.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function makeDependencies(start = "2026-08-31T20:00:00.000Z") {
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
        return `${kind}_${stats.ids}`;
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
    occurred_at: "2026-08-31T19:59:00.000Z",
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

function attachCommand(version, suffix = "002", overrides = {}) {
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

function createCase() {
  const harness = makeDependencies();
  const result = executeCaseCommand(
    emptyCaseEngine(),
    createCommand(),
    harness.dependencies,
  );
  assert.equal(result.status, "applied");
  return { ...harness, result };
}

function transition(result, dependencies, toState, suffix) {
  const next = executeCaseCommand(
    result.state,
    transitionCommand(result.aggregate.document.case.version, toState, suffix, {
      causation_event_id: result.entry.id,
    }),
    dependencies,
  );
  assert.equal(next.status, "applied");
  return next;
}

function rehashEntry(entry) {
  const unsigned = structuredClone(entry);
  delete unsigned.event_hash;
  entry.event_hash = sha256Json(unsigned);
}

test("case creation starts at detected version one with immutable attributed history", () => {
  const command = createCommand();
  const originalState = emptyCaseEngine();
  const { dependencies } = makeDependencies();
  const result = executeCaseCommand(originalState, command, dependencies);

  assert.equal(result.status, "applied");
  assert.notEqual(result.state, originalState);
  assert.equal(originalState.cases.length, 0);
  assert.equal(result.aggregate.document.case.state, "detected");
  assert.equal(result.aggregate.document.case.version, 1);
  assert.equal(result.aggregate.document.events.length, 1);
  assert.equal(result.aggregate.document.audit_entries.length, 1);
  assert.equal(result.aggregate.journal.length, 1);
  assert.equal(result.entry.sequence, 1);
  assert.equal(result.entry.previous_event_hash, null);
  assertValidCaseDocument(result.aggregate.document);
  assertValidCaseJournalEntry(result.entry);

  command.case_seed.case.customer_ref = "tampered-after-commit";
  command.trigger_event.scope_ids.push("scope_attacker");
  assert.equal(
    result.aggregate.document.case.customer_ref,
    "crm://accounts/acme-aero",
  );
  assert.deepEqual(result.aggregate.document.events[0].scope_ids, [
    "scope_customer_ops",
  ]);
  assert.ok(Object.isFrozen(result.state));
  assert.ok(Object.isFrozen(result.aggregate.document.case));
  assert.throws(() => {
    result.aggregate.document.case.state = "closed";
  }, TypeError);
});

test("WorkEvent time is canonicalized before persistence and every fingerprint", () => {
  const harness = makeDependencies();
  const localTime = createCommand({
    trigger_event: workEvent("001", {
      occurred_at: "2026-08-31T12:59:00-07:00",
      source_timezone: "America/Los_Angeles",
    }),
  });
  const created = executeCaseCommand(
    emptyCaseEngine(),
    localTime,
    harness.dependencies,
  );
  assert.equal(created.status, "applied");
  assert.equal(
    created.aggregate.document.events[0].occurred_at,
    "2026-08-31T19:59:00.000Z",
  );
  assert.equal(
    created.aggregate.document.events[0].source_timezone,
    "America/Los_Angeles",
  );
  assert.equal(
    created.entry.payload.document.events[0].occurred_at,
    "2026-08-31T19:59:00.000Z",
  );

  const consumed = { ...harness.stats };
  const utcRetry = createCommand({
    trigger_event: workEvent("001", {
      occurred_at: "2026-08-31T19:59:00.000Z",
      source_timezone: "America/Los_Angeles",
    }),
  });
  const duplicate = executeCaseCommand(
    created.state,
    utcRetry,
    harness.dependencies,
  );
  assert.equal(duplicate.status, "duplicate");
  assert.deepEqual(harness.stats, consumed);

  const freshKeyReplay = executeCaseCommand(
    created.state,
    { ...utcRetry, idempotency_key: "create-equivalent-time-fresh-key" },
    harness.dependencies,
  );
  assert.equal(freshKeyReplay.status, "conflict");
  assert.equal(freshKeyReplay.code, "SOURCE_EVENT_ALREADY_PROCESSED");
  assert.deepEqual(harness.stats, consumed);

  const localAttachment = attachCommand(1, "002", {
    work_event: workEvent("002", {
      occurred_at: "2026-08-31T14:29:00.25-05:30",
      source_timezone: "UTC-05:30",
    }),
  });
  const attached = executeCaseCommand(
    created.state,
    localAttachment,
    harness.dependencies,
  );
  assert.equal(attached.status, "applied");
  assert.equal(
    attached.aggregate.document.events[1].occurred_at,
    "2026-08-31T19:59:00.250Z",
  );
  assert.equal(
    attached.entry.payload.work_event.occurred_at,
    "2026-08-31T19:59:00.250Z",
  );
  assert.equal(attached.entry.payload.work_event.source_timezone, "UTC-05:30");

  const consumedAfterAttachment = { ...harness.stats };
  const equivalentAttachment = attachCommand(1, "002", {
    work_event: workEvent("002", {
      occurred_at: "2026-08-31T19:59:00.250Z",
      source_timezone: "UTC-05:30",
    }),
  });
  const duplicateAttachment = executeCaseCommand(
    attached.state,
    equivalentAttachment,
    harness.dependencies,
  );
  assert.equal(duplicateAttachment.status, "duplicate");
  assert.deepEqual(harness.stats, consumedAfterAttachment);
});

test("WorkEvent normalization rejects invalid or under-specified source time", () => {
  const invalidHarness = makeDependencies();
  assert.throws(
    () =>
      executeCaseCommand(
        emptyCaseEngine(),
        createCommand({
          trigger_event: workEvent("001", {
            occurred_at: "2026-02-30T19:59:00Z",
          }),
        }),
        invalidHarness.dependencies,
      ),
    (error) => error?.code === "INVALID_COMMAND",
  );
  assert.deepEqual(invalidHarness.stats, { ids: 0, now: 0 });

  const excessPrecisionHarness = makeDependencies();
  assert.throws(
    () =>
      executeCaseCommand(
        emptyCaseEngine(),
        createCommand({
          trigger_event: workEvent("001", {
            occurred_at: "2026-08-31T19:59:00.1234Z",
          }),
        }),
        excessPrecisionHarness.dependencies,
      ),
    (error) => error?.code === "INVALID_COMMAND",
  );
  assert.deepEqual(excessPrecisionHarness.stats, { ids: 0, now: 0 });

  const missingTimezoneHarness = makeDependencies();
  const missingTimezone = createCommand();
  delete missingTimezone.trigger_event.source_timezone;
  assert.throws(
    () =>
      executeCaseCommand(
        emptyCaseEngine(),
        missingTimezone,
        missingTimezoneHarness.dependencies,
      ),
    (error) => error?.code === "INVALID_COMMAND",
  );
  assert.deepEqual(missingTimezoneHarness.stats, { ids: 0, now: 0 });

  const invalidTimezoneHarness = makeDependencies();
  assert.throws(
    () =>
      executeCaseCommand(
        emptyCaseEngine(),
        createCommand({
          trigger_event: workEvent("001", { source_timezone: "PST" }),
        }),
        invalidTimezoneHarness.dependencies,
      ),
    (error) => error?.code === "INVALID_COMMAND",
  );
  assert.deepEqual(invalidTimezoneHarness.stats, { ids: 0, now: 0 });
});

test("case seed times are canonicalized before persistence and every fingerprint", () => {
  const harness = makeDependencies();
  const localTime = createCommand();
  localTime.case_seed.workflow_version.effective_from =
    "2026-08-25T17:00:00-07:00";
  localTime.case_seed.workflow_version.effective_from_source_timezone =
    "America/Los_Angeles";
  localTime.case_seed.workflow_version.effective_to =
    "2026-08-31T17:00:00-07:00";
  localTime.case_seed.workflow_version.effective_to_source_timezone =
    "America/Los_Angeles";
  localTime.case_seed.case.due_at = "2026-08-31T14:30:00.25-05:30";
  localTime.case_seed.case.due_at_source_timezone = "UTC-05:30";

  const created = executeCaseCommand(
    emptyCaseEngine(),
    localTime,
    harness.dependencies,
  );
  assert.equal(created.status, "applied");
  assert.equal(
    created.aggregate.document.workflow_version.effective_from,
    "2026-08-26T00:00:00.000Z",
  );
  assert.equal(
    created.aggregate.document.workflow_version.effective_to,
    "2026-09-01T00:00:00.000Z",
  );
  assert.equal(
    created.aggregate.document.workflow_version.effective_from_source_timezone,
    "America/Los_Angeles",
  );
  assert.equal(
    created.aggregate.document.workflow_version.effective_to_source_timezone,
    "America/Los_Angeles",
  );
  assert.equal(
    created.aggregate.document.case.due_at,
    "2026-08-31T20:00:00.250Z",
  );
  assert.equal(
    created.aggregate.document.case.due_at_source_timezone,
    "UTC-05:30",
  );
  assert.equal(
    created.entry.payload.document.workflow_version.effective_from,
    "2026-08-26T00:00:00.000Z",
  );
  assert.equal(
    created.entry.payload.document.workflow_version.effective_to,
    "2026-09-01T00:00:00.000Z",
  );
  assert.equal(
    created.entry.payload.document.case.due_at,
    "2026-08-31T20:00:00.250Z",
  );

  const consumed = { ...harness.stats };
  const canonicalRetry = createCommand();
  canonicalRetry.case_seed.workflow_version.effective_from_source_timezone =
    "America/Los_Angeles";
  canonicalRetry.case_seed.workflow_version.effective_to =
    "2026-09-01T00:00:00.000Z";
  canonicalRetry.case_seed.workflow_version.effective_to_source_timezone =
    "America/Los_Angeles";
  canonicalRetry.case_seed.case.due_at = "2026-08-31T20:00:00.250Z";
  canonicalRetry.case_seed.case.due_at_source_timezone = "UTC-05:30";
  const duplicate = executeCaseCommand(
    created.state,
    canonicalRetry,
    harness.dependencies,
  );
  assert.equal(duplicate.status, "duplicate");
  assert.deepEqual(harness.stats, consumed);

  canonicalRetry.idempotency_key = "create-equivalent-seed-time-fresh-key";
  const freshKeyReplay = executeCaseCommand(
    created.state,
    canonicalRetry,
    harness.dependencies,
  );
  assert.equal(freshKeyReplay.status, "conflict");
  assert.equal(freshKeyReplay.code, "SOURCE_EVENT_ALREADY_PROCESSED");
  assert.deepEqual(harness.stats, consumed);

  const nullHarness = makeDependencies();
  const nullTimes = createCommand();
  nullTimes.case_seed.workflow_version.effective_to = null;
  nullTimes.case_seed.case.due_at = null;
  const createdWithNulls = executeCaseCommand(
    emptyCaseEngine(),
    nullTimes,
    nullHarness.dependencies,
  );
  assert.equal(createdWithNulls.status, "applied");
  assert.equal(
    createdWithNulls.aggregate.document.workflow_version.effective_to,
    null,
  );
  assert.equal(createdWithNulls.aggregate.document.case.due_at, null);
  assert.equal(
    Object.hasOwn(
      createdWithNulls.aggregate.document.workflow_version,
      "effective_to_source_timezone",
    ),
    false,
  );
  assert.equal(
    Object.hasOwn(
      createdWithNulls.aggregate.document.case,
      "due_at_source_timezone",
    ),
    false,
  );
});

test("case seed time normalization fails closed before dependencies", () => {
  const invalidCommands = [];

  const invalidCalendar = createCommand();
  invalidCalendar.case_seed.workflow_version.effective_to =
    "2026-02-30T00:00:00Z";
  invalidCalendar.case_seed.workflow_version.effective_to_source_timezone =
    "UTC";
  invalidCommands.push(invalidCalendar);

  const excessPrecision = createCommand();
  excessPrecision.case_seed.case.due_at = "2026-08-31T20:00:00.1234Z";
  excessPrecision.case_seed.case.due_at_source_timezone = "UTC";
  invalidCommands.push(excessPrecision);

  const missingTimezone = createCommand();
  missingTimezone.case_seed.case.due_at = "2026-08-31T20:00:00Z";
  invalidCommands.push(missingTimezone);

  const missingOffset = createCommand();
  missingOffset.case_seed.workflow_version.effective_from =
    "2026-08-26T00:00:00";
  invalidCommands.push(missingOffset);

  const missingEffectiveFromTimezone = createCommand();
  delete missingEffectiveFromTimezone.case_seed.workflow_version
    .effective_from_source_timezone;
  invalidCommands.push(missingEffectiveFromTimezone);

  const invalidTimezone = createCommand();
  invalidTimezone.case_seed.workflow_version.effective_from_source_timezone =
    "PST";
  invalidCommands.push(invalidTimezone);

  const orphanedTimezone = createCommand();
  orphanedTimezone.case_seed.workflow_version.effective_to_source_timezone =
    "UTC";
  invalidCommands.push(orphanedTimezone);

  for (const command of invalidCommands) {
    const harness = makeDependencies();
    assert.throws(
      () =>
        executeCaseCommand(emptyCaseEngine(), command, harness.dependencies),
      (error) => error?.code === "INVALID_COMMAND",
    );
    assert.deepEqual(harness.stats, { ids: 0, now: 0 });
  }
});

test("unknown or schema-invalid commands fail before time and ids are consumed", () => {
  const unknownHarness = makeDependencies();
  assert.throws(
    () =>
      executeCaseCommand(
        emptyCaseEngine(),
        createCommand({ model_authorized: true }),
        unknownHarness.dependencies,
      ),
    (error) => error?.code === "INVALID_COMMAND",
  );
  assert.deepEqual(unknownHarness.stats, { ids: 0, now: 0 });

  const invalidHarness = makeDependencies();
  const invalid = createCommand();
  invalid.trigger_event.classification = "secret";
  assert.throws(() =>
    executeCaseCommand(emptyCaseEngine(), invalid, invalidHarness.dependencies),
  );
  assert.deepEqual(invalidHarness.stats, { ids: 0, now: 0 });
});

test("exact command retries are idempotent before stale-version and dependency checks", () => {
  const command = createCommand();
  const harness = makeDependencies();
  const first = executeCaseCommand(
    emptyCaseEngine(),
    command,
    harness.dependencies,
  );
  const consumed = { ...harness.stats };
  const retry = executeCaseCommand(first.state, command, harness.dependencies);

  assert.equal(retry.status, "duplicate");
  assert.equal(retry.state, first.state);
  assert.equal(retry.aggregate.journal.length, 1);
  assert.deepEqual(harness.stats, consumed);
});

test("an idempotency key cannot be reused for changed semantics", () => {
  const { dependencies } = makeDependencies();
  const first = executeCaseCommand(
    emptyCaseEngine(),
    createCommand(),
    dependencies,
  );
  const changed = createCommand();
  changed.case_seed.case.issue_fingerprint = "different-issue";
  const conflict = executeCaseCommand(first.state, changed, dependencies);

  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(conflict.state, first.state);
});

test("causation is part of the idempotent command identity", () => {
  const { dependencies, result: created, stats } = createCase();
  const command = attachCommand(1, "002");
  const attached = executeCaseCommand(created.state, command, dependencies);
  assert.equal(attached.status, "applied");
  const consumed = { ...stats };

  const changedCausation = structuredClone(command);
  changedCausation.causation_event_id = created.entry.id;
  const conflict = executeCaseCommand(
    attached.state,
    changedCausation,
    dependencies,
  );
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.code, "IDEMPOTENCY_CONFLICT");
  assert.deepEqual(stats, consumed);
});

test("source identity rejects fresh-key replays and changed-content replays", () => {
  const harness = makeDependencies();
  const first = executeCaseCommand(
    emptyCaseEngine(),
    createCommand(),
    harness.dependencies,
  );
  const duplicateCommand = createCommand({
    idempotency_key: "create-case-replayed-with-new-command-key",
    correlation_id: "trace-replay",
  });
  const consumed = { ...harness.stats };
  const duplicate = executeCaseCommand(
    first.state,
    duplicateCommand,
    harness.dependencies,
  );

  assert.equal(duplicate.status, "conflict");
  assert.equal(duplicate.code, "SOURCE_EVENT_ALREADY_PROCESSED");
  assert.equal(duplicate.state, first.state);
  assert.deepEqual(harness.stats, consumed);

  const conflictingCommand = createCommand({
    idempotency_key: "create-case-conflicting-source",
    trigger_event: workEvent("001", {
      content_hash: sha256Json({ body: "changed" }),
    }),
  });
  const conflict = executeCaseCommand(
    first.state,
    conflictingCommand,
    harness.dependencies,
  );
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.code, "SOURCE_EVENT_CONFLICT");
  assert.equal(conflict.state, first.state);
});

test("explicit work-event attachment is ordered, scoped, versioned, and replayable", () => {
  const harness = makeDependencies();
  const created = executeCaseCommand(
    emptyCaseEngine(),
    createCommand(),
    harness.dependencies,
  );
  const attached = executeCaseCommand(
    created.state,
    attachCommand(1, "002", { causation_event_id: created.entry.id }),
    harness.dependencies,
  );

  assert.equal(attached.status, "applied");
  assert.equal(attached.aggregate.document.case.version, 2);
  assert.deepEqual(
    attached.aggregate.document.events.map(
      ({ source_event_id }) => source_event_id,
    ),
    ["source_001", "source_002"],
  );
  assert.equal(attached.aggregate.journal.length, 2);
  assert.deepEqual(
    replayCaseJournal(attached.aggregate.journal),
    attached.aggregate,
  );
});

test("attachment rejects cross-tenant and scope-expanding source events", () => {
  const { dependencies, result: created } = createCase();
  const crossTenant = attachCommand(1, "002", {
    work_event: workEvent("002", { tenant_id: "tenant_attacker" }),
  });
  const tenantConflict = executeCaseCommand(
    created.state,
    crossTenant,
    dependencies,
  );
  assert.equal(tenantConflict.status, "conflict");
  assert.equal(tenantConflict.code, "TENANT_MISMATCH");

  const expanded = attachCommand(1, "003", {
    work_event: workEvent("003", { scope_ids: ["scope_other_customer"] }),
  });
  const scopeConflict = executeCaseCommand(
    created.state,
    expanded,
    dependencies,
  );
  assert.equal(scopeConflict.status, "conflict");
  assert.equal(scopeConflict.code, "SCOPE_EXPANSION");
  assert.equal(created.aggregate.journal.length, 1);
});

test("attachment rejects a reused WorkEvent id before consuming dependencies", () => {
  const { dependencies, result: created, stats } = createCase();
  const consumed = { ...stats };
  const duplicateId = attachCommand(1, "002", {
    work_event: workEvent("002", { id: "work_event_001" }),
  });

  assert.throws(
    () => executeCaseCommand(created.state, duplicateId, dependencies),
    (error) =>
      error?.code === "CASE_INVARIANT_VIOLATION" &&
      error.message.includes("reference.duplicate_collection_id"),
  );
  assert.deepEqual(stats, consumed);
  assert.equal(created.aggregate.journal.length, 1);
  assert.equal(created.aggregate.document.events.length, 1);
});

test("attachment fresh-key source replay keeps conflict precedence", () => {
  const { dependencies, result: created, stats } = createCase();
  const attached = executeCaseCommand(
    created.state,
    attachCommand(1, "002"),
    dependencies,
  );
  assert.equal(attached.status, "applied");
  const consumed = { ...stats };
  const replay = executeCaseCommand(
    attached.state,
    attachCommand(1, "002", {
      idempotency_key: "attach-002-fresh-key",
      correlation_id: "trace-attach-002-replay",
    }),
    dependencies,
  );

  assert.equal(replay.status, "conflict");
  assert.equal(replay.code, "SOURCE_EVENT_ALREADY_PROCESSED");
  assert.equal(replay.state, attached.state);
  assert.deepEqual(stats, consumed);
});

test("optimistic concurrency permits only one command at an expected version", () => {
  const { dependencies, result: created } = createCase();
  const first = executeCaseCommand(
    created.state,
    attachCommand(1, "002"),
    dependencies,
  );
  const stale = executeCaseCommand(
    first.state,
    attachCommand(1, "003"),
    dependencies,
  );

  assert.equal(first.status, "applied");
  assert.equal(stale.status, "conflict");
  assert.equal(stale.code, "VERSION_CONFLICT");
  assert.equal(stale.state, first.state);
  assert.equal(first.aggregate.document.case.version, 2);
});

test("legal transitions apply; illegal shortcuts are journaled as rejections", () => {
  const { dependencies, result: created } = createCase();
  const legal = executeCaseCommand(
    created.state,
    transitionCommand(1, "qualifying", "qualifying"),
    dependencies,
  );
  assert.equal(legal.status, "applied");
  assert.equal(legal.aggregate.document.case.state, "qualifying");
  assert.equal(legal.aggregate.document.case.version, 2);

  const rejected = executeCaseCommand(
    legal.state,
    transitionCommand(2, "executing", "shortcut"),
    dependencies,
  );
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.code, "invalid_transition");
  assert.equal(rejected.aggregate.document.case.state, "qualifying");
  assert.equal(rejected.aggregate.document.case.version, 3);
  assert.equal(rejected.entry.event_type, "case.transition_rejected");
  assert.equal(rejected.aggregate.document.audit_entries.length, 3);
});

test("an undeclared path to resolved is an invalid transition, not closure proof", () => {
  const { dependencies, result: created } = createCase();
  const rejected = executeCaseCommand(
    created.state,
    transitionCommand(1, "resolved", "invalid-topology"),
    dependencies,
  );

  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.code, "invalid_transition");
  assert.equal(rejected.entry.payload.reason_code, "invalid_transition");
});

test("retrying a rejected transition returns its original rejection disposition", () => {
  const { dependencies, result: created, stats } = createCase();
  const command = transitionCommand(1, "executing", "rejected-retry");
  const rejected = executeCaseCommand(created.state, command, dependencies);
  assert.equal(rejected.status, "rejected");
  const consumed = { ...stats };

  const retry = executeCaseCommand(rejected.state, command, dependencies);
  assert.equal(retry.status, "duplicate");
  assert.equal(retry.original_status, "rejected");
  assert.equal(retry.original_code, "invalid_transition");
  assert.equal(retry.original_entry.id, rejected.entry.id);
  assert.deepEqual(stats, consumed);
});

test("resolution fails closed until the complete closure-proof engine exists", () => {
  const { dependencies, result: created } = createCase();
  let current = transition(created, dependencies, "qualifying", "01");
  current = transition(current, dependencies, "enriching", "02");
  current = transition(current, dependencies, "needs_review", "03");
  current = transition(current, dependencies, "ready", "04");
  current = transition(current, dependencies, "executing", "05");
  current = transition(current, dependencies, "verifying", "06");

  const rejected = executeCaseCommand(
    current.state,
    transitionCommand(
      current.aggregate.document.case.version,
      "resolved",
      "07",
      { causation_event_id: current.entry.id },
    ),
    dependencies,
  );
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.code, "closure_proof_required");
  assert.equal(rejected.aggregate.document.case.state, "verifying");
  assert.equal(rejected.entry.payload.reason_code, "closure_proof_required");
});

test("every journal variant validates and unknown fields fail closed", () => {
  const { dependencies, result: created } = createCase();
  const attached = executeCaseCommand(
    created.state,
    attachCommand(1, "002"),
    dependencies,
  );
  const transitioned = executeCaseCommand(
    attached.state,
    transitionCommand(2, "qualifying", "legal"),
    dependencies,
  );
  const rejected = executeCaseCommand(
    transitioned.state,
    transitionCommand(3, "executing", "invalid"),
    dependencies,
  );
  for (const entry of rejected.aggregate.journal) {
    assert.doesNotThrow(() => assertValidCaseJournalEntry(entry));
  }
  assert.deepEqual(
    rejected.aggregate.journal.map(({ event_type }) => event_type),
    [
      "case.created",
      "case.work_event_attached",
      "case.state_transitioned",
      "case.transition_rejected",
    ],
  );

  const invalid = structuredClone(rejected.entry);
  invalid.model_authorized = true;
  assert.throws(
    () => assertValidCaseJournalEntry(invalid),
    ContractValidationError,
  );
});

test("replay rejects tampering, gaps, reordering, and cross-case history", () => {
  const { dependencies, result: created } = createCase();
  const attached = executeCaseCommand(
    created.state,
    attachCommand(1, "002"),
    dependencies,
  );
  const journal = attached.aggregate.journal;

  const tampered = structuredClone(journal);
  tampered[1].payload.work_event.event_type = "message.deleted";
  assert.throws(() => replayCaseJournal(tampered), /hash mismatch/);

  const reordered = [journal[1], journal[0]];
  assert.throws(() => replayCaseJournal(reordered), /sequence|case.created/);

  const gap = structuredClone(journal);
  gap[1].sequence = 3;
  assert.throws(() => replayCaseJournal(gap), /hash mismatch|contiguous/);

  const crossCase = structuredClone(journal);
  crossCase[1].case_id = "case_other";
  assert.throws(() => replayCaseJournal(crossCase), /hash mismatch|envelope/);
});

test("replay rejects coherently rehashed histories the engine could not emit", () => {
  const { result: created } = createCase();

  const badFingerprint = structuredClone(created.aggregate.journal);
  badFingerprint[0].command_fingerprint = `sha256:${"0".repeat(64)}`;
  badFingerprint[0].payload.document.audit_entries[0].metadata.command_fingerprint =
    badFingerprint[0].command_fingerprint;
  rehashEntry(badFingerprint[0]);
  assert.throws(() => replayCaseJournal(badFingerprint), /command fingerprint/);

  const extraGenesisData = structuredClone(created.aggregate.journal);
  extraGenesisData[0].payload.document.participants = [];
  rehashEntry(extraGenesisData[0]);
  assert.throws(
    () => replayCaseJournal(extraGenesisData),
    /projection|engine|created/,
  );

  const falseAuditLink = structuredClone(created.aggregate.journal);
  falseAuditLink[0].payload.document.audit_entries[0].metadata.case_version = 99;
  rehashEntry(falseAuditLink[0]);
  assert.throws(
    () => replayCaseJournal(falseAuditLink),
    /metadata case_version/,
  );

  const mismatchedCreationTime = structuredClone(created.aggregate.journal);
  mismatchedCreationTime[0].payload.document.case.created_at =
    "2001-01-01T00:00:00.000Z";
  const changedCase = mismatchedCreationTime[0].payload.document.case;
  const changedHash = sha256Json(changedCase);
  mismatchedCreationTime[0].after_hash = changedHash;
  mismatchedCreationTime[0].payload.document.audit_entries[0].after_hash =
    changedHash;
  rehashEntry(mismatchedCreationTime[0]);
  assert.throws(() => replayCaseJournal(mismatchedCreationTime), /projection/);

  const nonCanonicalWorkEventTime = structuredClone(created.aggregate.journal);
  const genesis = nonCanonicalWorkEventTime[0];
  const genesisDocument = genesis.payload.document;
  const triggerEvent = genesisDocument.events[0];
  triggerEvent.occurred_at = "2026-08-31T12:59:00-07:00";
  const seedCase = structuredClone(genesisDocument.case);
  delete seedCase.state;
  delete seedCase.created_at;
  delete seedCase.updated_at;
  delete seedCase.version;
  const commandFingerprint = sha256Json({
    type: "case.create",
    tenant_id: genesis.tenant_id,
    expected_case_version: 0,
    actor_identity_id: genesis.actor_identity_id,
    case_seed: {
      tenant: genesisDocument.tenant,
      workflow_version: genesisDocument.workflow_version,
      case: seedCase,
    },
    trigger_event: triggerEvent,
  });
  genesis.command_fingerprint = commandFingerprint;
  genesisDocument.audit_entries[0].metadata.command_fingerprint =
    commandFingerprint;
  rehashEntry(genesis);
  assert.throws(
    () => replayCaseJournal(nonCanonicalWorkEventTime),
    /validation|canonical UTC/,
  );

  const nonCanonicalSeedTime = structuredClone(created.aggregate.journal);
  const seedGenesis = nonCanonicalSeedTime[0];
  const seedDocument = seedGenesis.payload.document;
  seedDocument.workflow_version.effective_from = "2026-08-25T17:00:00-07:00";
  const replaySeedCase = structuredClone(seedDocument.case);
  delete replaySeedCase.state;
  delete replaySeedCase.created_at;
  delete replaySeedCase.updated_at;
  delete replaySeedCase.version;
  const seedCommandFingerprint = sha256Json({
    type: "case.create",
    tenant_id: seedGenesis.tenant_id,
    expected_case_version: 0,
    actor_identity_id: seedGenesis.actor_identity_id,
    case_seed: {
      tenant: seedDocument.tenant,
      workflow_version: seedDocument.workflow_version,
      case: replaySeedCase,
    },
    trigger_event: seedDocument.events[0],
  });
  seedGenesis.command_fingerprint = seedCommandFingerprint;
  seedDocument.audit_entries[0].metadata.command_fingerprint =
    seedCommandFingerprint;
  rehashEntry(seedGenesis);
  assert.throws(
    () => replayCaseJournal(nonCanonicalSeedTime),
    /validation|canonical UTC/,
  );
});

test("commands fail closed when a stored projection drifts from its journal", () => {
  const { dependencies, result: created, stats } = createCase();
  const forged = structuredClone(created.state);
  forged.cases[0].document.case.state = "resolved";
  const isIntegrityFailure = (error) => error?.code === "STATE_INTEGRITY";

  assert.throws(
    () => assertCaseEngineStateIntegrity(forged),
    isIntegrityFailure,
  );
  const consumed = { ...stats };
  assert.throws(
    () => executeCaseCommand(forged, attachCommand(1, "002"), dependencies),
    isIntegrityFailure,
  );
  assert.deepEqual(stats, consumed);

  const missingIdempotency = structuredClone(created.state);
  missingIdempotency.idempotency_records = [];
  assert.throws(
    () => assertCaseEngineStateIntegrity(missingIdempotency),
    isIntegrityFailure,
  );

  const missingSource = structuredClone(created.state);
  missingSource.source_event_records = [];
  assert.throws(
    () => assertCaseEngineStateIntegrity(missingSource),
    isIntegrityFailure,
  );
});

test("mutable hydrated state is frozen before duplicate and conflict results", () => {
  const { dependencies, result: created, stats } = createCase();
  const consumed = { ...stats };

  const duplicateInput = structuredClone(created.state);
  assert.equal(Object.isFrozen(duplicateInput), false);
  const duplicate = executeCaseCommand(
    duplicateInput,
    createCommand(),
    dependencies,
  );

  assert.equal(duplicate.status, "duplicate");
  assert.notEqual(duplicate.state, duplicateInput);
  assert.ok(Object.isFrozen(duplicate.state));
  assert.ok(Object.isFrozen(duplicate.aggregate.document.case));
  duplicateInput.cases[0].document.case.state = "resolved";
  assert.equal(duplicate.aggregate.document.case.state, "detected");
  assert.throws(() => {
    duplicate.aggregate.document.case.state = "resolved";
  }, TypeError);

  const conflictInput = structuredClone(created.state);
  const conflict = executeCaseCommand(
    conflictInput,
    attachCommand(0, "002"),
    dependencies,
  );

  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.code, "VERSION_CONFLICT");
  assert.notEqual(conflict.state, conflictInput);
  assert.ok(Object.isFrozen(conflict.state));
  conflictInput.cases[0].document.case.state = "resolved";
  assert.equal(conflict.state.cases[0].document.case.state, "detected");
  assert.deepEqual(stats, consumed);
});

test("dependency failure and duplicate generated ids leave prior state untouched", () => {
  const state = emptyCaseEngine();
  const failing = {
    now: () => new Date("2026-08-31T20:00:00.000Z"),
    nextId: () => {
      throw new Error("id store unavailable");
    },
  };
  assert.throws(
    () => executeCaseCommand(state, createCommand(), failing),
    /id store unavailable/,
  );
  assert.equal(state.cases.length, 0);

  const duplicateIds = {
    now: () => new Date("2026-08-31T20:00:00.000Z"),
    nextId: () => "same_id",
  };
  assert.throws(
    () => executeCaseCommand(state, createCommand(), duplicateIds),
    /globally unique/,
  );
  assert.equal(state.cases.length, 0);

  const invalidIds = {
    now: () => new Date("2026-08-31T20:00:00.000Z"),
    nextId: () => "1",
  };
  assert.throws(
    () => executeCaseCommand(state, createCommand(), invalidIds),
    (error) => error?.code === "INVALID_DEPENDENCY_RESULT",
  );
  assert.equal(state.cases.length, 0);
});

test("canonical hashing is order-independent and rejects executable or lossy values", () => {
  assert.equal(
    sha256Json({ beta: 2, alpha: { z: true, a: null } }),
    sha256Json({ alpha: { a: null, z: true }, beta: 2 }),
  );
  assert.equal(canonicalJson({ beta: 2, alpha: 1 }), '{"alpha":1,"beta":2}');

  const sparse = [];
  sparse.length = 1;
  const getterState = { calls: 0 };
  const accessor = {};
  Object.defineProperty(accessor, "secret", {
    enumerable: true,
    get() {
      getterState.calls += 1;
      return "do-not-run";
    },
  });
  const prohibited = JSON.parse('{"__proto__":{"polluted":true}}');
  const namedArrayProperty = [];
  namedArrayProperty["4294967295"] = "hidden";
  class CustomArray extends Array {}
  for (const value of [
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    new Date(),
    new Map(),
    sparse,
    accessor,
    prohibited,
    namedArrayProperty,
    new CustomArray(),
    new Proxy({}, {}),
    "contains\u0000null",
    "unpaired-high-\ud800",
    "unpaired-low-\udc00",
    { "bad\u0000key": true },
  ]) {
    assert.throws(() => canonicalJson(value), CanonicalJsonError);
  }
  assert.equal(getterState.calls, 0);
  assert.equal(canonicalJson({ emoji: "✅" }), '{"emoji":"✅"}');

  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /cyclic/);
});

test("canonical normalization ignores inherited prototype setters", () => {
  let objectSetterCalls = 0;
  let normalizedObject;
  Object.defineProperty(Object.prototype, "tenant_id", {
    configurable: true,
    set() {
      objectSetterCalls += 1;
    },
  });
  try {
    normalizedObject = canonicalJson({
      safe: "visible",
      tenant_id: "tenant_orchid",
    });
  } finally {
    delete Object.prototype.tenant_id;
  }

  assert.equal(
    normalizedObject,
    '{"safe":"visible","tenant_id":"tenant_orchid"}',
  );
  assert.equal(objectSetterCalls, 0);
  assert.notEqual(
    sha256Json({ safe: "visible", tenant_id: "tenant_orchid" }),
    sha256Json({ safe: "visible" }),
  );

  const input = ["secret"];
  let arraySetterCalls = 0;
  let normalizedArray;
  Object.defineProperty(Array.prototype, "0", {
    configurable: true,
    set() {
      arraySetterCalls += 1;
    },
  });
  try {
    normalizedArray = canonicalJson(input);
  } finally {
    delete Array.prototype[0];
  }

  assert.equal(normalizedArray, '["secret"]');
  assert.equal(arraySetterCalls, 0);
});

test("canonical serialization ignores inherited toJSON methods", () => {
  let objectToJsonCalls = 0;
  let normalizedObject;
  Object.defineProperty(Object.prototype, "toJSON", {
    configurable: true,
    value() {
      objectToJsonCalls += 1;
      return { substituted: true };
    },
  });
  try {
    normalizedObject = canonicalJson({ safe: "visible" });
  } finally {
    delete Object.prototype.toJSON;
  }

  assert.equal(normalizedObject, '{"safe":"visible"}');
  assert.equal(objectToJsonCalls, 0);

  let arrayToJsonCalls = 0;
  let normalizedArray;
  Object.defineProperty(Array.prototype, "toJSON", {
    configurable: true,
    value() {
      arrayToJsonCalls += 1;
      return ["substituted"];
    },
  });
  try {
    normalizedArray = canonicalJson(["secret"]);
  } finally {
    delete Array.prototype.toJSON;
  }

  assert.equal(normalizedArray, '["secret"]');
  assert.equal(arrayToJsonCalls, 0);
});

test("immutable normalization ignores an inherited array iterator", () => {
  const input = { nested: [{ value: "still-frozen" }] };
  const originalIterator = Object.getOwnPropertyDescriptor(
    Array.prototype,
    Symbol.iterator,
  );
  if (originalIterator === undefined) {
    throw new Error("Array.prototype must provide its standard iterator");
  }
  let iteratorCalls = 0;
  let normalized;
  Object.defineProperty(Array.prototype, Symbol.iterator, {
    configurable: true,
    value() {
      iteratorCalls += 1;
      return {
        next() {
          return { done: true };
        },
      };
    },
  });
  try {
    normalized = immutableJson(input);
  } finally {
    Object.defineProperty(Array.prototype, Symbol.iterator, originalIterator);
  }

  assert.equal(iteratorCalls, 0);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.nested));
  assert.ok(Object.isFrozen(normalized.nested[0]));
});

test("public contract boundaries reject getters and proxies without invoking them", () => {
  const accessor = structuredClone(fixture);
  let getterCalls = 0;
  Object.defineProperty(accessor.case, "state", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "needs_review";
    },
  });
  assert.throws(
    () => assertValidCaseDocument(accessor),
    ContractValidationError,
  );
  assert.equal(getterCalls, 0);

  let proxyCalls = 0;
  const proxy = new Proxy(fixture, {
    get(target, property, receiver) {
      proxyCalls += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(() => assertValidCaseDocument(proxy), ContractValidationError);
  assert.deepEqual(
    validateCrossRecordInvariants(proxy).map(({ code }) => code),
    ["document.non_canonical_json"],
  );
  assert.equal(proxyCalls, 0);
});

test("transition rules are frozen and immune to prototype pollution", () => {
  Object.defineProperty(Object.prototype, "evil", {
    configurable: true,
    value: ["resolved"],
  });
  try {
    assert.equal(canTransition("evil", "resolved"), false);
  } finally {
    delete Object.prototype.evil;
  }

  assert.ok(Object.isFrozen(CASE_STATES));
  assert.ok(Object.isFrozen(CASE_TRANSITIONS));
  assert.ok(
    Object.values(CASE_TRANSITIONS).every((transitions) =>
      Object.isFrozen(transitions),
    ),
  );
  assert.throws(() => CASE_TRANSITIONS.detected.push("resolved"), TypeError);
});

test("inherited records make the whole invariant input fail closed", () => {
  const invalidAction = structuredClone(fixture);
  invalidAction.action_proposals[1].status = "executed";
  const inheritedApproval = Object.create({
    proposal_id: invalidAction.action_proposals[1].id,
    decision: "approved",
    approved_payload_hash: invalidAction.action_proposals[1].payload_hash,
  });
  const inheritedReceipt = Object.create({
    proposal_id: invalidAction.action_proposals[1].id,
    status: "succeeded",
    request_hash: invalidAction.action_proposals[1].payload_hash,
  });
  invalidAction.approvals = [inheritedApproval];
  invalidAction.action_receipts = [inheritedReceipt];
  assert.deepEqual(
    validateCrossRecordInvariants(invalidAction).map(({ code }) => code),
    ["document.non_canonical_json"],
  );

  const invalidResolution = structuredClone(fixture);
  invalidResolution.case.state = "resolved";
  invalidResolution.outcomes = [
    Object.create({
      case_id: invalidResolution.case.id,
      accepted: true,
      evidence_ids: ["evidence_linear_issue"],
      verified_by_identity_id: "user_verifier",
      verified_at: "2026-08-31T20:00:00.000Z",
    }),
  ];
  invalidResolution.audit_entries = [
    Object.create({
      tenant_id: invalidResolution.tenant.id,
      case_id: invalidResolution.case.id,
    }),
  ];
  assert.deepEqual(
    validateCrossRecordInvariants(invalidResolution).map(({ code }) => code),
    ["document.non_canonical_json"],
  );
});

test("schema-required fields must be own properties", () => {
  const invalid = structuredClone(fixture);
  const state = invalid.case.state;
  delete invalid.case.state;
  Object.setPrototypeOf(invalid.case, { state });

  assert.throws(
    () => assertValidCaseDocument(invalid),
    ContractValidationError,
  );
});
