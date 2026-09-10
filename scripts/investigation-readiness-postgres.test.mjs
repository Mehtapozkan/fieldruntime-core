import { discoveryCommand } from "../tests/helpers/discovery.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import {
  prepareEvaluationFixture,
  runEvaluationArm,
  httpMock,
  WORK,
  PACK,
  start,
  publication,
  syntheticComparisonContext,
  mockHttpComparisonPort,
} from "../tests/helpers/investigation-comparison.mjs";
import { validateWorkExport } from "../dist/packages/runtime/src/preparation-work.js";
import { comparisonRequest } from "../dist/packages/runtime/src/investigation-comparison.js";
import { workInput } from "../dist/packages/runtime/src/preparation-work.js";
test("comparison PostgreSQL/API: both arms reserve one shared budget; exact retries and restart preserve evidence", async (t) => {
  const h = await intakeHost(t, { work: true }),
    x = await prepareEvaluationFixture(h, "H17");
  let calls = 0;
  const a = await runEvaluationArm(h, x, "bounded_investigation", {
    http: httpMock(() => calls++),
  });
  assert.equal(a.receipt.entry.reservation.ordinal, 1);
  assert.equal(a.invocation.result.investigation.status, "response_received");
  const before = await h.snapshot();
  assert.deepEqual(await h.ok(WORK + "/commands", a.command), a.receipt);
  assert.equal(calls, 1);
  assert.deepEqual(await h.snapshot(), before);
  const b = await runEvaluationArm(h, x, "generic_assistant", {
    http: httpMock(() => calls++),
  });
  assert.equal(b.receipt.entry.reservation.ordinal, 2);
  assert.equal(
    b.receipt.entry.reservation.previous_reservation_entry_hash,
    a.receipt.entry.hash,
  );
  assert.equal(calls, 2);
  await h.restart();
  assert.deepEqual(await h.ok(WORK + "/commands", b.command), b.receipt);
  assert.equal(calls, 2);
  validateWorkExport(await h.ok(x.path + "&representation=export"));
  const state = validateWorkExport(b.archive),
    input = workInput(state, b.receipt.entry),
    req = comparisonRequest(input);
  assert.equal(req.model, "gpt-4.1-mini-2025-04-14");
  assert.ok(!req.instructions.includes("expected_interpretation"));
  const material = JSON.parse(req.input);
  const support = material.sources.find((s) => s.kind === "retained_utf8_text");
  assert.deepEqual(
    support.subjects.map((s) => s.id),
    ["DEL-17B"],
  );
});
for (const [name, mutate] of [
  [
    "refusal",
    (b) => ({
      ...b,
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "refusal", refusal: "Cannot prepare" }],
        },
      ],
    }),
  ],
  ["wrong model", (b) => ({ ...b, model: "floating-alias" })],
  [
    "incomplete",
    (b) => ({
      ...b,
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    }),
  ],
  ["tool output", (b) => ({ ...b, output: [{ type: "function_call" }] })],
  [
    "over-budget usage",
    (b) => ({ ...b, usage: { input_tokens: 16001, output_tokens: 1 } }),
  ],
  [
    "duplicate nested keys",
    (b) => ({
      ...b,
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: '{"claims":[],"claims":[]}',
              annotations: [],
            },
          ],
        },
      ],
    }),
  ],
])
  test(`comparison PostgreSQL/API retains ${name} as failure, never useful output`, async (t) => {
    const h = await intakeHost(t, { work: true }),
      x = await prepareEvaluationFixture(h, "H01");
    const a = await runEvaluationArm(h, x, "bounded_investigation", {
      http: httpMock(() => {}, mutate),
    });
    assert.equal(a.invocation.result, null);
    const terminal = a.archive.entries.at(-1);
    assert.equal(
      terminal.investigation.status,
      name === "refusal" ? "refused" : "invalid_response",
    );
    await h.restart();
    validateWorkExport(await h.ok(x.path + "&representation=export"));
  });
test("comparison PostgreSQL/API: failed start binding causes zero calls; lost terminal acknowledgment never recalls HTTP", async (t) => {
  const h = await intakeHost(t, { work: true }),
    x = await prepareEvaluationFixture(h, "H01");
  let calls = 0;
  h.setWorkContext(syntheticComparisonContext());
  h.setWorkPort(mockHttpComparisonPort(httpMock(() => calls++)));
  await h.ok(
    PACK + "/selections/publication",
    publication(await h.ok(x.packPath), "pub"),
  );
  const cmd = start(await h.ok(x.path), "failure");
  const before = await h.snapshot();
  h.fault({ tag: "INSERT INTO preparation_work_journal" });
  assert.notEqual((await h.call(WORK + "/commands", cmd)).status, 200);
  assert.equal(calls, 0);
  assert.deepEqual(await h.snapshot(), before);
  h.fault({ tag: "COMMIT", remaining: 2, after: true });
  await h.call(WORK + "/commands", cmd);
  assert.equal(calls, 1);
  await h.restart();
  const retry = await h.ok(WORK + "/commands", cmd);
  assert.equal(retry.entry.command.idempotency_key, "failure");
  assert.equal(calls, 1);
  validateWorkExport(await h.ok(x.path + "&representation=export"));
});
test("comparison PostgreSQL/API: concurrent exact starts consume one reservation and one call", async (t) => {
  const h = await intakeHost(t, { work: true }),
    x = await prepareEvaluationFixture(h, "H23");
  let calls = 0;
  h.setWorkContext(syntheticComparisonContext());
  h.setWorkPort(mockHttpComparisonPort(httpMock(() => calls++)));
  await h.ok(
    PACK + "/selections/publication",
    publication(await h.ok(x.packPath), "pub"),
  );
  const cmd = start(await h.ok(x.path), "same");
  const [a, b] = await Promise.all([
    h.ok(WORK + "/commands", cmd),
    h.ok(WORK + "/commands", cmd),
  ]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  assert.equal(
    (await h.ok(x.path)).history.filter((e) => e.event === "started").length,
    1,
  );
});

test("comparison PostgreSQL/API: cross-Case capacity includes both arms and unknown outcomes", async (t) => {
  const h = await intakeHost(t, { work: true }),
    a = await prepareEvaluationFixture(h, "H01"),
    b = await prepareEvaluationFixture(h, "H02");
  const bounded = structuredClone(syntheticComparisonContext());
  bounded.profile.investigation.batch_invocations = 1;
  bounded.profile.investigation.batch_budget_usd_minor = 2;
  bounded.pack.worker_profile = bounded.profile;
  await h.ok(
    `/v1/intake/bundles/${a.b.bundle_id}/discovery-reviews`,
    discoveryCommand(
      await h.ok(
        `/v1/intake/bundles/${a.b.bundle_id}/discovery?record_key=${a.b.record_key}&case_id=${a.b.case_id}`,
      ),
      "refresh-a",
      "confirm",
    ),
  );
  h.setWorkContext(bounded);
  let calls = 0;
  h.setWorkPort(
    mockHttpComparisonPort(async () => {
      calls++;
      throw new Error("uncertain mock send");
    }),
  );
  await h.ok(
    PACK + "/selections/publication",
    publication(await h.ok(a.packPath), "first-pub"),
  );
  const command = start(await h.ok(a.path), "unknown");
  const original = await h.ok(WORK + "/commands", command);
  const first = await h.ok(a.path);
  assert.equal(first.invocations.at(-1).result, null);
  assert.equal(first.history.at(-1).investigation.usage, null);
  const generic = structuredClone(
    syntheticComparisonContext("generic_assistant"),
  );
  generic.profile.investigation.batch_invocations = 1;
  generic.profile.investigation.batch_budget_usd_minor = 2;
  generic.pack.worker_profile = generic.profile;
  h.setWorkContext(generic);
  await h.ok(
    PACK + "/selections/publication",
    publication(await h.ok(b.packPath), "second-pub"),
  );
  const second = await h.ok(b.path);
  assert.equal(second.current.can_start, false);
  assert.match(second.current.reasons.join(" "), /48-send|reservation ceiling/);
  assert.equal(calls, 1);
  await h.restart();
  assert.equal((await h.ok(b.path)).current.can_start, false);
  assert.equal(calls, 1);
  assert.deepEqual(await h.ok(WORK + "/commands", command), original);
});
test("comparison PostgreSQL/API: interruption fences late HTTP and preserves the original-key receipt", async (t) => {
  const h = await intakeHost(t, { work: true }),
    x = await prepareEvaluationFixture(h, "H01");
  h.setWorkContext(syntheticComparisonContext());
  let release, seen;
  const entered = new Promise((r) => (seen = r));
  let calls = 0;
  h.setWorkPort(
    mockHttpComparisonPort(async (...args) => {
      calls++;
      seen();
      await new Promise((r) => (release = r));
      return httpMock()(...args);
    }),
  );
  await h.ok(
    PACK + "/selections/publication",
    publication(await h.ok(x.packPath), "pub"),
  );
  const cmd = start(await h.ok(x.path), "late"),
    pending = h.call(WORK + "/commands", cmd);
  await entered;
  const v = await h.ok(x.path);
  await h.ok(WORK + "/commands", {
    schema_version: "preparation-interruption.v4",
    operation: "interrupt",
    invocation_id: v.current.pending_invocation,
    expected_work_revision: v.work_revision,
    expected_work_head: v.work_head,
    reason: "Explicit interruption during a mock HTTP request",
    idempotency_key: "interrupt",
  });
  release();
  await pending;
  const done = await h.ok(x.path);
  assert.equal(done.invocations.at(-1).result, null);
  await h.restart();
  await h.ok(WORK + "/commands", cmd);
  assert.equal(calls, 1);
  validateWorkExport(await h.ok(x.path + "&representation=export"));
});

test("comparison PostgreSQL/API: pre-0013 fake history survives upgrade, explicit new publication and replay", async (t) => {
  const {
    syntheticInvestigationContext,
    hermeticInvestigationPort,
    fakeResponse,
  } = await import("../tests/helpers/investigation.mjs");
  const h = await intakeHost(t, { work: true, beforeComparison: true }),
    x = await prepareEvaluationFixture(h, "H01");
  let calls = 0;
  h.setWorkContext(syntheticInvestigationContext());
  h.setWorkPort(
    hermeticInvestigationPort(async (r) => {
      calls++;
      return fakeResponse(r);
    }),
  );
  await h.ok(
    PACK + "/selections/publication",
    publication(await h.ok(x.packPath), "old-pub"),
  );
  const cmd = start(await h.ok(x.path), "old-start"),
    receipt = await h.ok(WORK + "/commands", cmd);
  const old = await h.ok(x.path + "&representation=export");
  await h.upgrade();
  assert.deepEqual(await h.ok(x.path + "&representation=export"), old);
  assert.deepEqual(await h.ok(WORK + "/commands", cmd), receipt);
  assert.equal(calls, 1);
  const fresh = await runEvaluationArm(h, x, "bounded_investigation");
  assert.equal(fresh.archive.schema_version, "preparation-work-export.v4");
  assert.deepEqual(
    fresh.archive.entries.slice(0, old.entries.length),
    old.entries,
  );
  await h.restart();
  validateWorkExport(await h.ok(x.path + "&representation=export"));
});

test("comparison PostgreSQL/API: exact planned fixture sources and one send per arm cannot be bypassed with a fresh key", async (t) => {
  const { comparisonFixture } =
    await import("../dist/packages/runtime/src/investigation-comparison.js");
  const h = await intakeHost(t, { work: true }),
    x = await prepareEvaluationFixture(h, "H24");
  let calls = 0;
  const a = await runEvaluationArm(h, x, "bounded_investigation", {
    http: httpMock(() => calls++),
  });
  assert.equal(calls, 1);
  const state = validateWorkExport(a.archive),
    input = workInput(state, a.receipt.entry);
  assert.equal(comparisonFixture(input), "H24");
  const altered = structuredClone(input);
  altered.retained_bundles[0].artifacts[0].byte_hash =
    "sha256:" + "0".repeat(64);
  assert.throws(() => comparisonRequest(altered), /frozen fixture/);
  const v = await h.ok(x.path);
  assert.equal(v.current.can_start, false);
  const repeat = {
    ...a.command,
    expected_work_revision: v.work_revision,
    expected_work_head: v.work_head,
    replaces_invocation: a.receipt.entry.invocation_id,
    idempotency_key: "unplanned-fresh-key",
  };
  assert.notEqual((await h.call(WORK + "/commands", repeat)).status, 200);
  assert.equal(calls, 1);
  await h.restart();
  assert.deepEqual(await h.ok(WORK + "/commands", a.command), a.receipt);
  assert.equal(calls, 1);
});

for (const fault of [
  "http-error",
  "redirect",
  "bad-utf8",
  "oversize",
  "duplicate-envelope",
  "unavailable",
])
  test(`comparison PostgreSQL/API: ${fault} never establishes success or known spend`, async (t) => {
    const { Buffer } = await import("node:buffer");
    const { mockResponse } =
      await import("../tests/helpers/investigation-comparison.mjs");
    const h = await intakeHost(t, { work: true }),
      x = await prepareEvaluationFixture(h, "H01");
    let calls = 0;
    const http = async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.authorization, "Bearer MOCK-NOT-A-CREDENTIAL");
      const request = JSON.parse(init.body);
      assert.equal(request.store, false);
      assert.equal(request.background, false);
      assert.deepEqual(request.tools, []);
      assert.ok(!init.body.includes("expected_interpretation"));
      if (fault === "unavailable") throw new Error("mock unavailable");
      let body = Buffer.from(JSON.stringify(mockResponse(request)));
      if (fault === "bad-utf8") body = Buffer.from([0xc3, 0x28]);
      if (fault === "oversize") body = Buffer.alloc(60001, 65);
      if (fault === "duplicate-envelope")
        body = Buffer.from('{"status":"failed",' + body.toString().slice(1));
      return {
        status: fault === "http-error" ? 429 : 200,
        redirected: fault === "redirect",
        body: (async function* () {
          yield body;
        })(),
      };
    };
    const a = await runEvaluationArm(h, x, "bounded_investigation", { http });
    assert.equal(a.invocation.result, null);
    assert.equal(
      a.archive.entries.at(-1).investigation.actual_spend_usd_minor,
      null,
    );
    assert.equal(calls, 1);
    await h.restart();
    await h.ok(WORK + "/commands", a.command);
    assert.equal(calls, 1);
    validateWorkExport(await h.ok(x.path + "&representation=export"));
  });
test("comparison PostgreSQL/API: elapsed timeout retains unknown usage and prevents fresh-key replay", async (t) => {
  const h = await intakeHost(t, { work: true }),
    x = await prepareEvaluationFixture(h, "H01");
  let tick = 0;
  h.setWorkMonotonic(() => (tick += 60001));
  const a = await runEvaluationArm(h, x, "bounded_investigation");
  assert.equal(a.invocation.result, null);
  const e = a.archive.entries.at(-1).investigation;
  assert.equal(e.status, "timeout_uncertain");
  assert.equal(e.usage, null);
  assert.equal((await h.ok(x.path)).current.can_start, false);
  await h.restart();
  validateWorkExport(await h.ok(x.path + "&representation=export"));
});

test("comparison PostgreSQL/API: fixed three-arm runner retains actual outputs and resumes only original keys", async (t) => {
  const { runThreeArmComparison } =
    await import("./lib/investigation-comparison-runner.mjs");
  const h = await intakeHost(t, { work: true }),
    x = await prepareEvaluationFixture(h, "H17");
  let calls = 0;
  const targets = [{ id: "H17", ...x }],
    http = httpMock(() => calls++);
  const result = await runThreeArmComparison(h, targets, { http });
  assert.equal(result.status, "completed_for_review", JSON.stringify(result));
  assert.equal(result.results.length, 3);
  assert.equal(calls, 2);
  assert.ok(result.results.every((r) => r.run.invocation.result));
  const snapshot = await h.snapshot();
  await h.restart();
  const retry = await runThreeArmComparison(h, targets, { http });
  assert.equal(retry.status, "completed_for_review");
  assert.equal(calls, 2);
  assert.deepEqual(await h.snapshot(), snapshot);
  const originalRead = h.ok;
  h.ok = async (path, body) => {
    const value = await originalRead(path, body);
    return path.endsWith("&representation=export")
      ? { ...value, hash: "sha256:" + "0".repeat(64) }
      : value;
  };
  const tampered = await runThreeArmComparison(h, targets, { http });
  assert.equal(tampered.status, "stopped_for_inspection");
  assert.equal(tampered.results[0].run, null);
  assert.equal(calls, 2);
});
