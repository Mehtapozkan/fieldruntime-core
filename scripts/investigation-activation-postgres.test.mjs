import test from "node:test";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import {
  prepareEvaluationFixture,
  runEvaluationArm,
  httpMock,
  start,
  WORK,
  PACK,
  publication,
} from "../tests/helpers/investigation-comparison.mjs";
import {
  syntheticLiveComparisonContext,
  validateWorkExport,
} from "../dist/packages/runtime/src/preparation-work.js";
import { sha256Json } from "../dist/packages/contracts/src/index.js";
import {
  createLiveComparisonPort,
  assertCountedContinuation,
} from "../dist/packages/adapters/src/investigation-live.js";
const config = {
  schema_version: "comparison-activation.v1",
  reviewed_head: "7144571ecb3fab62cced702f3c2eee8f03f994e7",
  model: "gpt-4.1-mini-2025-04-14",
  fixture_version: "v2",
  max_calls: 48,
  max_usd_minor: 96,
  fresh_retry_slots: 0,
  custodian: "Mehtap Özkan",
  reviewer: "Mehtap Özkan",
  combined_roles_disclosed: true,
  project_id: "proj_HERMETIC",
  validated_head: "0".repeat(40),
  ci_url: "https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/1",
  input_usd_per_million: 0.4,
  output_usd_per_million: 1.6,
  total_worst_case_usd: 0.4608,
  confirmations: Object.fromEntries(
    [
      "model_available",
      "pricing_with_all_charges_within_ceiling",
      "project_data_controls",
      "credential_custody",
      "isolated_storage_access_encryption",
      "backups_and_30_day_deletion",
      "complete_input_accounting",
    ].map((k) => [k, "Hermetic test only; no actual account or spending"]),
  ),
};
const context = () =>
  syntheticLiveComparisonContext("bounded_investigation", sha256Json(config));
test("activation PostgreSQL/API: live-version attribution, two bundles, migration/restart/exact retry and tamper rejection", async (t) => {
  const h = await intakeHost(t, { work: true, beforeActivation: true });
  const x = await prepareEvaluationFixture(h, "H01");
  const old = await runEvaluationArm(h, x, "bounded_investigation");
  const before = await h.snapshot();
  await h.upgrade();
  assert.deepEqual(await h.snapshot(), before);
  let sends = 0,
    reads = 0;
  const port = createLiveComparisonPort(config, {
    credentialPath: "/hermetic/only",
    readCredential: async () => {
      reads++;
      return "HERMETIC-CREDENTIAL-NOT-A-REAL-KEY";
    },
    http: httpMock((_url, init) => {
      sends++;
      assert.equal(
        init.headers.authorization,
        "Bearer HERMETIC-CREDENTIAL-NOT-A-REAL-KEY",
      );
      assert.equal(init.headers["OpenAI-Project"], "proj_HERMETIC");
    }),
  });
  // Old mock reservation remains consumed; live activation cannot create a replacement slot.
  h.setWorkContext(context());
  h.setWorkPort(port);
  const same = await h.call(WORK + "/commands", old.command);
  assert.equal(same.status, 200);
  assert.equal(sends, 0);
  const y = await prepareEvaluationFixture(h, "H24");
  const run = await runEvaluationArm(h, y, "bounded_investigation", {
    key: "live-H24",
    context: context(),
    port,
  });
  assert.equal(sends, 1);
  assert.equal(reads, 1);
  assert.equal(run.invocation.result.investigation.live_activation, true);
  assert.equal(
    run.invocation.result.investigation.usage_qualification,
    "reported_by_provider",
  );
  assert.equal(
    run.invocation.result.investigation.actual_spend_usd_minor,
    null,
  );
  assert.equal(
    run.invocation.result.investigation.estimated_charge_usd_micros,
    720,
  );
  assert.equal(
    old.invocation.result.investigation.usage_qualification,
    "reported_by_mock_http",
  );
  const snapshot = await h.snapshot();
  await h.restart();
  assert.deepEqual(await h.ok(WORK + "/commands", run.command), run.receipt);
  assert.deepEqual(await h.snapshot(), snapshot);
  assert.equal(sends, 1);
  assert.equal(reads, 1);
  assert.equal(
    (await h.ok(y.path + "&representation=export")).hash,
    run.archive.hash,
  );
  const view = await h.ok(y.path);
  const denied = await h.call(WORK + "/commands", {
    ...run.command,
    expected_work_revision: view.work_revision,
    expected_work_head: view.work_head,
    replaces_invocation: run.receipt.entry.invocation_id,
    idempotency_key: "extra-slot",
  });
  assert.equal(denied.status, 400, JSON.stringify(denied.data));
  assert.equal(denied.data.error, "INVESTIGATION_BUDGET_EXHAUSTED");
  assert.equal(sends, 1);
  const altered = structuredClone(run.archive);
  const terminal = altered.entries.findLast(
    (e) =>
      e.event === "terminal_result" &&
      e.invocation_id === run.invocation.invocation_id,
  );
  assert.equal(
    terminal.investigation.schema_version,
    "investigation-evidence.v3",
  );
  terminal.investigation.estimated_charge_usd_micros += 1;
  terminal.result.investigation = terminal.investigation;
  terminal.result_hash = sha256Json(terminal.result);
  delete terminal.hash;
  terminal.hash = sha256Json(terminal);
  delete altered.hash;
  altered.hash = sha256Json(altered);
  assert.throws(() => validateWorkExport(altered));
  const client = await h.pg.connect();
  try {
    await client.query("SET session_replication_role=replica");
    await client.query(
      "UPDATE preparation_work_journal SET entry=$1,entry_hash=$2 WHERE id=$3",
      [terminal, terminal.hash, terminal.id],
    );
  } finally {
    await client.query("SET session_replication_role=origin");
    client.release();
  }
  assert.equal((await h.call("/readyz")).status, 503);
  assert.equal((await h.call(y.path)).status, 500);
  await h.restart();
  assert.equal((await h.call(y.path)).status, 500);
});
test("activation PostgreSQL/API: uncertain send never retries after restart and no secret/error text is retained", async (t) => {
  const h = await intakeHost(t, { work: true });
  const x = await prepareEvaluationFixture(h, "H01");
  let sends = 0;
  const port = createLiveComparisonPort(config, {
    credentialPath: "/hermetic/only",
    readCredential: async () => "HERMETIC-CREDENTIAL-NOT-A-REAL-KEY",
    http: async () => {
      sends++;
      throw new Error("secret HERMETIC-CREDENTIAL-NOT-A-REAL-KEY");
    },
  });
  const run = await runEvaluationArm(h, x, "bounded_investigation", {
    key: "uncertain-live",
    context: context(),
    port,
  });
  assert.equal(sends, 1);
  assert.equal(run.invocation.result, null);
  assert.ok(run.invocation.terminal_entry_hash);
  assert.doesNotMatch(JSON.stringify(run.archive), /HERMETIC-CREDENTIAL/);
  const snap = await h.snapshot();
  await h.restart();
  assert.deepEqual(await h.ok(WORK + "/commands", run.command), run.receipt);
  assert.equal(sends, 1);
  assert.deepEqual(await h.snapshot(), snap);
});

async function liveSetup(t, http) {
  const h = await intakeHost(t, { work: true });
  const x = await prepareEvaluationFixture(h, "H01");
  h.setWorkContext(context());
  const port = createLiveComparisonPort(config, {
    credentialPath: "/hermetic/only",
    readCredential: async () => "HERMETIC-CREDENTIAL-NOT-A-REAL-KEY",
    http,
  });
  h.setWorkPort(port);
  await h.ok(
    PACK + "/selections/publication",
    publication(await h.ok(x.packPath), "live-publish"),
  );
  const command = start(await h.ok(x.path), "planned-live-slot");
  return { h, x, command };
}
test("activation PostgreSQL/API: concurrent exact starts reserve once and never call again", async (t) => {
  let calls = 0,
    release,
    seen;
  const entered = new Promise((r) => (seen = r));
  const { h, x, command } = await liveSetup(t, async (...args) => {
    calls++;
    seen();
    await new Promise((r) => (release = r));
    return httpMock()(...args);
  });
  const first = h.call(WORK + "/commands", command);
  await entered;
  const retry = await h.ok(WORK + "/commands", command);
  assert.equal(calls, 1);
  release();
  assert.deepEqual((await first).data, retry);
  const v = await h.ok(x.path);
  assert.equal(v.history.filter((e) => e.event === "started").length, 1);
  assert.equal(v.invocations.length, 1);
  assert.ok(v.invocations[0].result);
});
for (const phase of ["started", "terminal_result"])
  test(`activation PostgreSQL/API: ${phase} persistence failure cannot authorize another send`, async (t) => {
    let calls = 0;
    const { h, x, command } = await liveSetup(
      t,
      httpMock(() => calls++),
    );
    h.fault({ tag: `fr:work-${phase}-insert` });
    assert.equal((await h.call(WORK + "/commands", command)).status, 500);
    assert.equal(calls, phase === "started" ? 0 : 1);
    await h.restart();
    await h.ok(WORK + "/commands", command);
    assert.equal(calls, 1);
    const v = await h.ok(x.path);
    assert.equal(v.history.filter((e) => e.event === "started").length, 1);
    assert.equal(Boolean(v.invocations[0].result), phase === "started");
  });
test("activation PostgreSQL/API: lost commit acknowledgment recovers the retained result without sending", async (t) => {
  let calls = 0;
  const { h, x, command } = await liveSetup(
    t,
    httpMock(() => calls++),
  );
  h.fault({ tag: "COMMIT", remaining: 2, after: true });
  assert.equal((await h.call(WORK + "/commands", command)).status, 500);
  assert.equal(calls, 1);
  const v = await h.ok(x.path);
  assert.ok(v.invocations[0].result);
  const before = await h.snapshot();
  await h.restart();
  await h.ok(WORK + "/commands", command);
  assert.equal(calls, 1);
  assert.deepEqual(await h.snapshot(), before);
});
test("activation PostgreSQL/API: interruption fences late HTTP, restart preserves the consumed slot", async (t) => {
  let calls = 0,
    release,
    seen;
  const entered = new Promise((r) => (seen = r));
  const { h, x, command } = await liveSetup(t, async (...args) => {
    calls++;
    seen();
    await new Promise((r) => (release = r));
    return httpMock()(...args);
  });
  const first = h.call(WORK + "/commands", command);
  await entered;
  const view = await h.ok(x.path);
  await h.ok(WORK + "/commands", {
    schema_version: "preparation-interruption.v5",
    operation: "interrupt",
    invocation_id: view.current.pending_invocation,
    expected_work_revision: view.work_revision,
    expected_work_head: view.work_head,
    reason: "Explicit synthetic experiment interruption",
    idempotency_key: "live-interrupt",
  });
  release();
  await first;
  await h.restart();
  await h.ok(WORK + "/commands", command);
  assert.equal(calls, 1);
  assert.equal((await h.ok(x.path)).invocations[0].result, null);
});
test("activation PostgreSQL/API: measured timeout retains unknown usage and never retries", async (t) => {
  let calls = 0;
  const { h, x, command } = await liveSetup(
    t,
    httpMock(() => calls++),
  );
  let tick = 0;
  h.setWorkMonotonic(() => (tick++ === 0 ? 0 : 60001));
  await h.ok(WORK + "/commands", command);
  const v = await h.ok(x.path);
  assert.equal(v.invocations[0].result, null);
  assert.equal(v.history.at(-1).investigation.status, "timeout_uncertain");
  assert.equal(v.history.at(-1).investigation.usage, null);
  await h.restart();
  await h.ok(WORK + "/commands", command);
  assert.equal(calls, 1);
});

test("activation PostgreSQL/API: both live-version arms recover through the fixed runner without a replacement call", async (t) => {
  const { runThreeArmComparison } =
    await import("./lib/investigation-comparison-runner.mjs");
  const h = await intakeHost(t, { work: true }),
    x = await prepareEvaluationFixture(h, "H17");
  let calls = 0;
  const port = createLiveComparisonPort(config, {
    credentialPath: "/hermetic/only",
    readCredential: async () => "HERMETIC-CREDENTIAL-NOT-A-REAL-KEY",
    http: httpMock(() => calls++),
  });
  const options = {
    modelOnly: true,
    port,
    contextForArm: (arm) =>
      syntheticLiveComparisonContext(arm, sha256Json(config)),
  };
  const first = await runThreeArmComparison(h, [{ id: "H17", ...x }], options);
  assert.equal(first.status, "completed_for_review");
  assert.equal(calls, 2);
  assert.equal(first.results.length, 2);
  for (const r of first.results)
    assert.equal(
      r.run.invocation.result.investigation.usage_qualification,
      "reported_by_provider",
    );
  const before = await h.snapshot();
  await h.restart();
  const second = await runThreeArmComparison(h, [{ id: "H17", ...x }], options);
  assert.equal(second.status, "completed_for_review");
  assert.equal(calls, 2);
  assert.deepEqual(await h.snapshot(), before);
  const wrong = await runThreeArmComparison(h, [{ id: "H23", ...x }], options);
  assert.equal(wrong.status, "stopped_for_inspection");
  assert.equal(calls, 2);
});

test("activation PostgreSQL/API: dedicated local credential rejects unsafe files and sends only with an owned private regular file", async (t) => {
  const { mkdtemp, writeFile, chmod, symlink, rm } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "d040-hermetic-secret-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "credential"),
    link = join(dir, "symlink");
  const key = "HERMETIC-FILE-NOT-AN-ACTUAL-PROJECT-KEY";
  await writeFile(file, key, { mode: 0o600 });
  await symlink(file, link);
  const h = await intakeHost(t, { work: true });
  let sends = 0;
  for (const [id, path, mode, allowed] of [
    ["H01", link, 0o600, false],
    ["H02", file, 0o644, false],
    ["H03", file, 0o600, true],
  ]) {
    await chmod(file, mode);
    const x = await prepareEvaluationFixture(h, id);
    const port = createLiveComparisonPort(config, {
      credentialPath: path,
      http: httpMock((_url, init) => {
        sends++;
        assert.equal(init.headers.authorization, `Bearer ${key}`);
      }),
    });
    const run = await runEvaluationArm(h, x, "bounded_investigation", {
      context: context(),
      port,
      key: `custody-${id}`,
    });
    assert.equal(!!run.invocation.result, allowed);
    assert.ok(!JSON.stringify(run.archive).includes(key));
  }
  assert.equal(sends, 1);
});

const countedConfig = {
  ...config,
  schema_version: "comparison-activation.v2",
  total_worst_case_usd: 0.768,
  counting: {
    max_calls: 48,
    retries: 0,
    max_charge_usd_micros_per_call: 6400,
    pricing_and_data_controls:
      "Hermetic test only; no actual account or spending",
  },
};
const countedContext = (arm = "bounded_investigation") =>
  syntheticLiveComparisonContext(arm, sha256Json(countedConfig));
const countReply = (
  body = '{"object":"response.input_tokens","input_tokens":4000}',
  status = 200,
) => ({
  status,
  redirected: false,
  body: (async function* () {
    yield Buffer.from(body);
  })(),
});
function countedPort(http, retainCount, checkBeforeInference = async () => {}) {
  return createLiveComparisonPort(countedConfig, {
    credentialPath: "/hermetic/only",
    readCredential: async () => "HERMETIC-CREDENTIAL-NOT-A-REAL-KEY",
    http,
    retainCount,
    checkBeforeInference,
  });
}
test("activation counted API: both arms bind the actual complete request; concurrent recovery and restart never recount or infer again", async (t) => {
  const h = await intakeHost(t, { work: true });
  const records = [],
    counts = [],
    inferences = [];
  const port = countedPort(
    async (url, init) => {
      if (url.endsWith("/input_tokens")) {
        counts.push(JSON.parse(init.body));
        return countReply();
      }
      inferences.push(JSON.parse(init.body));
      return httpMock()(url, init);
    },
    async (r) => records.push(r),
  );
  for (const [id, arm] of [
    ["H17", "bounded_investigation"],
    ["H23", "generic_assistant"],
  ]) {
    const x = await prepareEvaluationFixture(h, id);
    const run = await runEvaluationArm(h, x, arm, {
      key: `counted-${id}`,
      context: countedContext(arm),
      port,
    });
    assert.ok(run.invocation.result);
    const inference = inferences.at(-1),
      payload = counts.at(-1);
    assert.deepEqual(
      payload,
      Object.fromEntries(
        [
          "model",
          "instructions",
          "input",
          "text",
          "tools",
          "tool_choice",
          "truncation",
        ].map((k) => [k, inference[k]]),
      ),
    );
    assert.equal(records.at(-1).request_hash, sha256Json(inference));
    assert.equal(records.at(-1).payload_hash, sha256Json(payload));
    assert.equal(records.at(-1).activation_hash, sha256Json(countedConfig));
    assert.equal(inference.max_output_tokens, 2000);
    assert.equal(inference.store, false);
    assert.equal(
      run.invocation.result.investigation.usage_qualification,
      "reported_by_provider",
    );
    const snap = await h.snapshot();
    await h.restart();
    const retries = await Promise.all([
      h.ok(WORK + "/commands", run.command),
      h.ok(WORK + "/commands", run.command),
    ]);
    for (const receipt of retries) assert.deepEqual(receipt, run.receipt);
    assert.deepEqual(await h.snapshot(), snap);
  }
  assert.equal(counts.length, 2);
  assert.equal(inferences.length, 2);
  assert.deepEqual(
    records.map((r) => r.phase),
    ["attempt", "response", "attempt", "response"],
  );
});
for (const [name, response] of [
  [
    "unavailable",
    () => {
      throw new Error("unavailable");
    },
  ],
  ["refused", () => countReply('{"error":"rate limit"}', 429)],
  ["malformed", () => countReply("{")],
  [
    "duplicate fields",
    () =>
      countReply(
        '{"object":"response.input_tokens","input_tokens":17000,"input_tokens":3}',
      ),
  ],
  [
    "over ceiling",
    () => countReply('{"object":"response.input_tokens","input_tokens":16001}'),
  ],
  ["credential echo", () => countReply("HERMETIC-CREDENTIAL-NOT-A-REAL-KEY")],
])
  test(`activation counted API: ${name} counting blocks inference and retains the slot across restart`, async (t) => {
    const h = await intakeHost(t, { work: true }),
      x = await prepareEvaluationFixture(h, "H01");
    let calls = 0;
    const retained = [];
    const port = countedPort(
      async (url) => {
        calls++;
        assert.ok(url.endsWith("/input_tokens"));
        return response();
      },
      async (r) => retained.push(r),
    );
    const run = await runEvaluationArm(h, x, "bounded_investigation", {
      key: "count-failure",
      context: countedContext(),
      port,
    });
    assert.equal(calls, 1);
    assert.equal(run.invocation.result, null);
    assert.ok(run.invocation.terminal_entry_hash);
    assert.doesNotMatch(JSON.stringify(retained), /HERMETIC-CREDENTIAL/);
    assert.equal(
      run.archive.entries.filter((e) => e.event === "started").at(-1)
        .reservation.reserved_usd_minor,
      2,
    );
    await h.restart();
    assert.deepEqual(await h.ok(WORK + "/commands", run.command), run.receipt);
    assert.equal(calls, 1);
  });
for (const phase of ["attempt", "response"])
  test(`activation counted API: failed ${phase} evidence persistence prevents inference and no-resend recovery`, async (t) => {
    const h = await intakeHost(t, { work: true }),
      x = await prepareEvaluationFixture(h, "H01");
    let calls = 0;
    const port = countedPort(
      async (url) => {
        calls++;
        assert.ok(url.endsWith("/input_tokens"));
        return countReply();
      },
      async (r) => {
        if (r.phase === phase)
          throw new Error("injected private evidence write failure");
      },
    );
    const run = await runEvaluationArm(h, x, "bounded_investigation", {
      key: "count-write-failure",
      context: countedContext(),
      port,
    });
    assert.equal(calls, phase === "attempt" ? 0 : 1);
    assert.equal(run.invocation.result, null);
    await h.restart();
    assert.deepEqual(await h.ok(WORK + "/commands", run.command), run.receipt);
    assert.equal(calls, phase === "attempt" ? 0 : 1);
  });

for (const interrupt of [false, true])
  test(`activation counted API: ${interrupt ? "interrupted late count" : "concurrent start during count"} cannot create a second call`, async (t) => {
    const h = await intakeHost(t, { work: true }),
      x = await prepareEvaluationFixture(h, "H01");
    let seen,
      release,
      counts = 0,
      inference = 0;
    const entered = new Promise((r) => (seen = r));
    const port = countedPort(
      async (url, init) => {
        if (url.endsWith("/input_tokens")) {
          counts++;
          seen();
          await new Promise((r) => (release = r));
          return countReply();
        }
        inference++;
        return httpMock()(url, init);
      },
      async () => {},
      async (input) => assertCountedContinuation(input, await h.ok(x.path)),
    );
    h.setWorkContext(countedContext());
    h.setWorkPort(port);
    await h.ok(
      PACK + "/selections/publication",
      publication(await h.ok(x.packPath), "count-publish"),
    );
    const command = start(await h.ok(x.path), "one-count-slot");
    const first = h.call(WORK + "/commands", command);
    await entered;
    const retry = await h.ok(WORK + "/commands", command);
    if (interrupt) {
      const v = await h.ok(x.path);
      await h.ok(WORK + "/commands", {
        schema_version: "preparation-interruption.v5",
        operation: "interrupt",
        invocation_id: v.current.pending_invocation,
        expected_work_revision: v.work_revision,
        expected_work_head: v.work_head,
        reason: "Stop while independent token count is pending",
        idempotency_key: "count-interruption",
      });
    }
    release();
    assert.deepEqual((await first).data, retry);
    await h.restart();
    assert.deepEqual(await h.ok(WORK + "/commands", command), retry);
    assert.equal(counts, 1);
    assert.equal(inference, interrupt ? 0 : 1);
    assert.equal(
      Boolean((await h.ok(x.path)).invocations[0].result),
      !interrupt,
    );
  });
test("activation counted API: lost terminal acknowledgment retains both receipts without repeating count or inference", async (t) => {
  const h = await intakeHost(t, { work: true }),
    x = await prepareEvaluationFixture(h, "H01");
  let counts = 0,
    inference = 0;
  const records = [];
  const port = countedPort(
    async (url, init) => {
      if (url.endsWith("/input_tokens")) {
        counts++;
        return countReply();
      }
      inference++;
      return httpMock()(url, init);
    },
    async (r) => records.push(r),
  );
  h.setWorkContext(countedContext());
  h.setWorkPort(port);
  await h.ok(
    PACK + "/selections/publication",
    publication(await h.ok(x.packPath), "counted-ack-publish"),
  );
  const command = start(await h.ok(x.path), "counted-lost-ack");
  h.fault({ tag: "COMMIT", remaining: 2, after: true });
  assert.equal((await h.call(WORK + "/commands", command)).status, 500);
  assert.ok((await h.ok(x.path)).invocations[0].result);
  const snap = await h.snapshot();
  await h.restart();
  await h.ok(WORK + "/commands", command);
  assert.equal(counts, 1);
  assert.equal(inference, 1);
  assert.equal(records.length, 2);
  assert.deepEqual(await h.snapshot(), snap);
});

test("activation counted API: expired current worker profile after count prevents inference", async (t) => {
  const h = await intakeHost(t, { work: true }),
    x = await prepareEvaluationFixture(h, "H01");
  let inference = 0;
  const port = countedPort(
    async (url, init) => {
      if (url.endsWith("/input_tokens")) {
        const context = countedContext();
        h.setWorkContext({
          ...context,
          profile: {
            ...context.profile,
            grants: context.profile.grants.map((g) =>
              g.purpose === "prepare_disposition_packet"
                ? { ...g, effective_until: "2026-01-02T00:00:00.000Z" }
                : g,
            ),
          },
        });
        return countReply();
      }
      inference++;
      return httpMock()(url, init);
    },
    async () => {},
    async (input) => assertCountedContinuation(input, await h.ok(x.path)),
  );
  const run = await runEvaluationArm(h, x, "bounded_investigation", {
    key: "count-expiry",
    context: countedContext(),
    port,
  });
  assert.equal(inference, 0);
  assert.equal(run.invocation.result, null);
  await h.restart();
  assert.deepEqual(await h.ok(WORK + "/commands", run.command), run.receipt);
  assert.equal(inference, 0);
});
