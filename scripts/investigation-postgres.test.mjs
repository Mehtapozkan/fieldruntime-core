import {
  validateWorkView,
  validatePackView,
} from "../apps/admin/public/intake-client.js";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  investigation,
  fakeResponse,
  start,
  WORK,
  PACK,
  publication,
  syntheticInvestigationContext,
} from "../tests/helpers/investigation.mjs";
import {
  validateWorkExport,
  syntheticContinuationContext,
} from "../dist/packages/runtime/src/preparation-work.js";
import { assertValidPreparationWorkV3Contract } from "../dist/packages/contracts/src/index.js";
test("D040 PostgreSQL/API: explicit v4 publication, one fake invocation and separate task review", async (t) => {
  const x = await investigation(t);
  const before = await x.h.snapshot();
  const v = await x.view();
  assert.equal(v.current.can_start, true, JSON.stringify(v.current));
  assert.equal(
    v.candidate_binding.worker_implementation_id,
    "disposition-investigation.v1",
  );
  assert.deepEqual(await x.h.snapshot(), before, "reads reserve nothing");
  const command = start(v, "investigation-first");
  const receipt = await x.h.ok(x.post, command);
  assert.equal(receipt.entry.reservation.ordinal, 1);
  assert.equal(x.calls(), 1);
  const done = await x.view();
  const run = done.invocations.at(-1);
  assert.equal(run.outcome, "prepared_gap_packet");
  assert.equal(
    run.result.investigation.semantic_correctness,
    "not_established",
  );
  assert.equal(
    run.result.investigation.proposal.human_interpretation_review_required,
    true,
  );
  assert.equal(run.result.financial_authority, false);
  assert.equal(run.result.case_closure_permission, false);
  assert.equal(run.review, null);
  await validateWorkView(done, x.b);
  await validatePackView(await x.h.ok(x.packPath), {
    bundle_id: x.b.bundle_id,
    case_id: x.b.case_id,
    record_key: x.b.record_key,
  });
  const archive = await x.h.ok(x.path + "&representation=export");
  assertValidPreparationWorkV3Contract("export", archive);
  validateWorkExport(archive);
  const review = {
    schema_version: "preparation-task-review.v3",
    operation: "task_review",
    purpose: "preparation_usefulness",
    invocation_id: run.invocation_id,
    result_hash: run.result_hash,
    expected_work_revision: done.work_revision,
    expected_work_head: done.work_head,
    decision: "approve",
    reason: "Synthetic interpretation inspected for task usefulness only",
    idempotency_key: "review-investigation",
  };
  const accepted = await x.h.ok(x.post, review);
  await x.h.restart();
  assert.deepEqual(await x.h.ok(x.post, review), accepted);
  if (process.env.D040_HANDOFF_DIR) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const dir = process.env.D040_HANDOFF_DIR;
    await mkdir(dir, { recursive: true });
    for (const [name, value] of Object.entries({
      command,
      start_receipt: receipt,
      awaiting_review: done,
      review_command: review,
      task_acceptance: accepted,
      accepted_view: await x.view(),
      accepted_export: await x.h.ok(x.path + "&representation=export"),
    }))
      await writeFile(
        `${dir}/${name}.json`,
        JSON.stringify(value, null, 2) + "\n",
      );
  }
  const snapshot = await x.h.snapshot();
  assert.deepEqual(await x.h.ok(x.post, command), receipt);
  assert.equal(x.calls(), 1);
  assert.deepEqual(await x.h.snapshot(), snapshot);
});
import { hermeticInvestigationPort } from "../tests/helpers/investigation.mjs";
import {
  PostgresPreparationWorkStore,
  workColumns,
} from "../dist/packages/runtime/src/postgres-preparation-work-store.js";
import { workInput } from "../dist/packages/runtime/src/preparation-work.js";
import {
  investigationRequest,
  investigationResponse,
  validateInvestigationProposal,
} from "../dist/packages/runtime/src/investigation.js";
import { sha256Json } from "../dist/packages/contracts/src/index.js";
import { validateDisputeExport } from "../dist/packages/runtime/src/dispute-result.js";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import {
  preparedDiscovery,
  discoveryCommand,
  variation,
} from "../tests/helpers/discovery.mjs";
import {
  continuation,
  note,
  queueInput,
} from "../tests/helpers/preparation-continuation.mjs";
const interrupt = (v, key = "interrupt") => ({
  schema_version: "preparation-interruption.v3",
  operation: "interrupt",
  invocation_id: v.invocations.at(-1).invocation_id,
  expected_work_revision: v.work_revision,
  expected_work_head: v.work_head,
  reason: "Explicit interruption; no automatic provider retry",
  idempotency_key: key,
});
const business = (s) =>
  Object.fromEntries(
    Object.entries(s).filter(
      ([k]) => !["preparation_work_journal", "runtime_writer_lock"].includes(k),
    ),
  );
const gate = () => {
  let finish, entered;
  const ready = new Promise((r) => (entered = r)),
    wait = new Promise((r) => (finish = r));
  return {
    ready,
    finish,
    transport: async (q) => {
      entered();
      await wait;
      return fakeResponse(q);
    },
  };
};

for (const [name, transport, status] of [
  ["malformed", async () => "{", "invalid_response"],
  ["oversized", async () => "x".repeat(65537), "invalid_response"],
  [
    "refused",
    async (q) =>
      fakeResponse(q, (v) => ({ ...v, status: "refused", output: null })),
    "refused",
  ],
  [
    "wrong model",
    async (q) => fakeResponse(q, (v) => ({ ...v, model: "unapproved-model" })),
    "invalid_response",
  ],
  [
    "wrong scope",
    async (q) =>
      fakeResponse(q, (v) => {
        v.output.claims[0].subject.id = "DEL-5";
        return v;
      }),
    "invalid_response",
  ],
  [
    "invented quote",
    async (q) =>
      fakeResponse(q, (v) => {
        v.output.claims[0].spans[0].quote = "invented";
        return v;
      }),
    "invalid_response",
  ],
  [
    "invented amount",
    async (q) =>
      fakeResponse(q, (v) => {
        v.output.follow_up = "Please explain 999999999.";
        return v;
      }),
    "invalid_response",
  ],
  [
    "authority claim",
    async (q) =>
      fakeResponse(q, (v) => {
        v.output.authority_granted = true;
        return v;
      }),
    "invalid_response",
  ],
  [
    "provider error",
    async () => {
      throw Error("private provider error must not leak");
    },
    "outcome_uncertain",
  ],
])
  test(`D040 ${name}: retained failure, no usable packet or automatic retry`, async (t) => {
    const x = await investigation(t, { transport });
    const before = await x.h.snapshot();
    const c = start(await x.view());
    const receipt = await x.h.ok(x.post, c);
    const v = await x.view();
    assert.equal(v.invocations[0].outcome, "failed");
    assert.equal(v.invocations[0].result, null);
    const terminal = v.history.at(-1);
    assert.equal(terminal.investigation.status, status);
    assert.equal(terminal.reservation.reserved_usd_minor, 50);
    assert.equal(terminal.investigation.actual_spend_usd_minor, null);
    assert.equal(v.invocations[0].can_accept, false);
    assert.deepEqual(business(await x.h.snapshot()), business(before));
    const state = await x.h.snapshot();
    await x.h.restart();
    assert.deepEqual(await x.h.ok(x.post, c), receipt);
    assert.equal(x.calls(), 1);
    assert.deepEqual(await x.h.snapshot(), state);
    validateWorkExport(await x.h.ok(x.path + "&representation=export"));
  });

test("D040 unknown usage is not zero; citation conformance is not semantic proof", async (t) => {
  const x = await investigation(t, {
    transport: async (q) =>
      fakeResponse(q, (v) => {
        v.usage = null;
        v.output.claims[0].interpretation =
          "This report could describe a warehouse acknowledgment; a person must examine that interpretation.";
        return v;
      }),
  });
  await x.run();
  const run = (await x.view()).invocations[0];
  assert.equal(run.result.investigation.usage, null);
  assert.equal(run.result.investigation.usage_qualification, "unknown");
  assert.equal(
    run.result.investigation.semantic_correctness,
    "not_established",
  );
  assert.equal(run.review, null);
  assert.equal(run.result.proof_readiness.length, 5);
  assert.ok(run.result.proof_readiness.every((p) => p.value === null));
  const archive = await x.h.ok(
    `/v1/intake/dispute-results?case_id=${x.b.case_id}&record_key=${x.b.record_key}&representation=export`,
  );
  assert.equal(archive.schema_version, "dispute-result-export.v2");
  validateDisputeExport(archive);
});

test("D040 concurrent exact starts reserve once; interruption fences late response and retry survives restart", async (t) => {
  const g = gate(),
    x = await investigation(t, { transport: g.transport }),
    c = start(await x.view());
  const first = x.h.call(x.post, c);
  await g.ready;
  const retry = await x.h.ok(x.post, c);
  assert.equal(x.calls(), 1);
  assert.equal(
    (await x.h.call(x.post, { ...c, idempotency_key: "competitor" })).status,
    409,
  );
  const pending = await x.view();
  await x.h.ok(x.post, interrupt(pending));
  g.finish();
  assert.deepEqual((await first).data, retry);
  assert.equal((await x.view()).invocations[0].outcome, "interrupted");
  assert.equal((await x.view()).work_revision, 2);
  await x.h.restart();
  const before = await x.h.snapshot();
  assert.deepEqual(await x.h.ok(x.post, c), retry);
  assert.deepEqual(await x.h.snapshot(), before);
  assert.equal(x.calls(), 1);
  x.h.setWorkPort(hermeticInvestigationPort(async (q) => fakeResponse(q)));
  await x.h.ok(x.post, start(await x.view(), "explicit-new"));
  const after = await x.view();
  assert.equal(
    after.history.filter((e) => e.event === "started").at(-1).reservation
      .ordinal,
    2,
  );
  assert.equal(after.invocations.at(-1).review, null);
});

for (const fault of [
  "work-started-insert",
  "work-terminal_result-insert",
  "lost-start",
  "lost-terminal",
])
  test(`D040 ${fault}: atomic reservation and restart recovery never repeats a provider invocation`, async (t) => {
    const x = await investigation(t),
      c = start(await x.view()),
      before = await x.h.snapshot();
    x.h.fault(
      fault === "lost-start"
        ? { tag: "COMMIT", after: true }
        : fault === "lost-terminal"
          ? { tag: "COMMIT", remaining: 2, after: true }
          : { tag: fault },
    );
    assert.equal((await x.h.call(x.post, c)).status, 500);
    if (fault === "work-started-insert") {
      assert.equal(x.calls(), 0);
      assert.deepEqual(await x.h.snapshot(), before);
      await x.h.ok(x.post, c);
      assert.equal(x.calls(), 1);
    } else {
      const snapshot = await x.h.snapshot(),
        calls = x.calls();
      await x.h.restart();
      const receipt = await x.h.ok(x.post, c);
      assert.equal(receipt.entry.reservation.ordinal, 1);
      assert.equal(x.calls(), calls);
      assert.deepEqual(await x.h.snapshot(), snapshot);
      assert.equal(
        (await x.view()).invocations[0].outcome,
        fault === "lost-terminal" ? "prepared_gap_packet" : "started",
      );
    }
    assert.equal(
      (
        await x.h.call(x.post, {
          ...c,
          replaces_invocation: "preparation_changed",
        })
      ).data.error,
      "IDEMPOTENCY_CONFLICT",
    );
  });

test("D040 timeout measurement precedes writer waiting and retains unknown outcome", async (t) => {
  const x = await investigation(t);
  let tick = 0;
  x.h.setWorkMonotonic(() => {
    tick++;
    return tick === 1 ? 0 : 60001;
  });
  await x.run();
  const v = await x.view();
  assert.equal(v.invocations[0].outcome, "failed");
  assert.equal(v.history.at(-1).investigation.status, "timeout_uncertain");
  assert.equal(v.history.at(-1).investigation.usage, null);
  validateWorkExport(await x.h.ok(x.path + "&representation=export"));
});

for (const change of ["withdrawal", "expiry", "identity"])
  test(`D040 ${change} during provider work invalidates terminal permission`, async (t) => {
    const g = gate(),
      x = await investigation(t, { transport: g.transport }),
      c = start(await x.view());
    const pending = x.h.call(x.post, c);
    await g.ready;
    if (change === "expiry") x.h.setTime("2026-09-07T17:00:01.000Z");
    else if (change === "identity") {
      const context = structuredClone(x.context);
      context.profile.identities.find(
        (i) => i.identity_kind === "service",
      ).status = "revoked";
      x.h.setWorkContext(context);
    } else {
      const v = await x.h.ok(x.packPath);
      await x.h.ok(`${PACK}/selections/publication`, {
        schema_version: "pack-selection-command.v4",
        operation: "withdraw",
        pack_id: v.pack_id,
        expected_selection_revision: v.selection_revision,
        expected_selection_head: v.selection_head,
        expected_publication_profile_hash: v.publication_profile_hash,
        artifact_hash: v.selected_artifact_hash,
        reason: "Synthetic stop before terminal",
        idempotency_key: "stop",
      });
    }
    g.finish();
    assert.equal((await pending).status, 200);
    const v = await x.view();
    assert.equal(v.invocations[0].current_usable, false);
    assert.equal(v.invocations[0].can_accept, false);
    assert.notEqual(v.invocations[0].outcome, "prepared_gap_packet");
    validateWorkExport(await x.h.ok(x.path + "&representation=export"));
  });

test("D040 shared batch cap across distinct Cases and equal timestamps; last slot still permits task review", async (t) => {
  const context = structuredClone(syntheticInvestigationContext());
  context.profile.investigation.batch_invocations = 2;
  context.pack.worker_profile = context.profile;
  const x = await investigation(t, { context });
  await x.run();
  assert.equal((await x.view()).invocations[0].can_accept, true);
  assert.equal((await x.view()).current.can_start, true);
  const d = await preparedDiscovery(
    x.h,
    await variation("budget-second", "reported"),
  );
  await x.h.ok(
    d.post,
    discoveryCommand(await d.get(), "second-description", "confirm"),
  );
  const b = (await d.get()).binding;
  const p = `${PACK}?bundle_id=${b.bundle_id}&record_key=${b.record_key}&case_id=${b.case_id}`;
  await x.h.ok(
    `${PACK}/selections/publication`,
    publication(await x.h.ok(p), "budget-second-publish"),
  );
  const path = `${WORK}?case_id=${b.case_id}&record_key=${b.record_key}`;
  await x.h.ok(x.post, start(await x.h.ok(path), "budget-second-start"));
  const v = await x.h.ok(path);
  assert.equal(v.current.can_start, false);
  assert.match(v.current.reasons.join(" "), /budget/i);
  assert.equal(
    (await x.h.call(x.post, start(v, "exhausted"))).data.error,
    "INVESTIGATION_BUDGET_EXHAUSTED",
  );
  assert.equal(x.calls(), 2);
  const both = await x.h.ok(path + "&representation=export");
  assert.deepEqual(
    both.entries
      .filter((e) => e.event === "started")
      .map((e) => e.reservation.ordinal),
    [1, 2],
  );
  await x.h.restart();
  validateWorkExport(await x.h.ok(path + "&representation=export"));
});

test("D040 pre-0012 upgrade preserves deterministic history and checksum bindings", async (t) => {
  const h = await intakeHost(t, { work: true, beforeInvestigation: true }),
    d = await preparedDiscovery(h);
  await h.ok(
    d.post,
    discoveryCommand(await d.get(), "upgrade-review", "confirm"),
  );
  const b = (await d.get()).binding,
    p = `${PACK}?bundle_id=${b.bundle_id}&record_key=${b.record_key}&case_id=${b.case_id}`,
    path = `${WORK}?case_id=${b.case_id}&record_key=${b.record_key}`;
  await h.ok(`${PACK}/selections/publication`, publication(await h.ok(p)));
  const c = start(await h.ok(path)),
    receipt = await h.ok(`${WORK}/commands`, c),
    before = await h.snapshot();
  await h.upgrade();
  assert.deepEqual(await h.snapshot(), before);
  assert.deepEqual(await h.ok(`${WORK}/commands`, c), receipt);
  validateWorkExport(await h.ok(path + "&representation=export"));
  await h.restart();
  assert.deepEqual(await h.ok(`${WORK}/commands`, c), receipt);
});

test("D040 full two-bundle continuation, source-report limits, independent new acceptance and deterministic fallback", async (t) => {
  const x = await continuation(t);
  x.h.setWorkContext(syntheticInvestigationContext());
  let calls = 0,
    request;
  x.h.setWorkPort(
    hermeticInvestigationPort(async (q) => {
      calls++;
      request = q;
      return fakeResponse(q);
    }),
  );
  const text =
    "Warehouse acknowledgment, not original delivery proof. ".repeat(26) +
    "DEL-4 confirmation is reported; ownership and terms remain unconfirmed.";
  await x.supply(note(x.input, "investigation-follow", text));
  const v = await x.h.ok(x.path);
  assert.equal(v.current.can_start, true);
  const c = start(v, "investigation-follow-start"),
    r = await x.h.ok(POST, c);
  const done = await x.h.ok(x.path),
    run = done.invocations.at(-1);
  assert.equal(run.outcome, "prepared_gap_packet");
  assert.equal(run.review, null);
  assert.equal(run.binding.retained_bundles.length, 2);
  assert.ok(JSON.parse(request.input).sources.some((s) => s.text === text));
  assert.ok(JSON.parse(request.input).subjects.every((s) => s.id !== "DEL-5"));
  assert.equal(run.result.disposition.independent_business_verification, false);
  assert.deepEqual(await x.h.ok(POST, x.command), x.receipt);
  assert.deepEqual(await x.h.ok(POST, x.reviewCommand), x.reviewReceipt);
  await x.h.restart();
  assert.deepEqual(await x.h.ok(POST, c), r);
  assert.equal(calls, 1);
  validateWorkExport(await x.h.ok(x.path + "&representation=export"));
  // An explicit publication of deterministic v3 is required; no silent fallback.
  x.h.setWorkContext(syntheticContinuationContext());
  const bundle = await x.h.ok(
    `/v1/intake/bundles/${run.binding.basis.discovery.bundle_id}`,
  );
  const candidate = await x.h.ok(x.packPath(bundle));
  await x.h.ok(
    `${PACK}/selections/publication`,
    publication(candidate, "explicit-code-fallback"),
  );
  const { fixedPreparationPort } =
    await import("../dist/packages/runtime/src/preparation-worker-port.js");
  x.h.setWorkPort(fixedPreparationPort);
  await x.h.ok(POST, start(await x.h.ok(x.path), "code-fallback"));
  assert.equal(
    (await x.h.ok(x.path)).invocations.at(-1).result.execution_facts
      .model_calls,
    0,
  );
});
const POST = `${WORK}/commands`;
test("D040 no third bundle or aggregate truncation; permitted scopes apply to both complete bundles", async (t) => {
  const x = await continuation(t, { prepared: false });
  x.h.setWorkContext(syntheticInvestigationContext());
  let calls = 0;
  x.h.setWorkPort(
    hermeticInvestigationPort(async (q) => {
      calls++;
      return fakeResponse(q);
    }),
  );
  const next = await x.supply(note(x.input, "investigation-two"));
  await x.h.ok(POST, start(await x.h.ok(x.path), "allowed-two"));
  assert.equal(calls, 1);
  const c = structuredClone(syntheticInvestigationContext());
  c.profile.read_scope_ids = [];
  c.pack.worker_profile = c.profile;
  x.h.setWorkContext(c);
  assert.equal((await x.h.call(x.path)).data.error, "SCOPE_CONFLICT");
  x.h.setWorkContext(syntheticInvestigationContext());
  await x.supply(
    note(
      x.input,
      "investigation-third",
      "DEL-4 has another unverified status report.",
    ),
  );
  const v = await x.h.ok(x.path);
  assert.equal(v.current.can_start, false);
  assert.equal(v.resource_preflight.counts.retained_bundles, 3);
  assert.match(v.current.reasons.join(" "), /retained_bundles/);
  assert.equal(calls, 1);
  assert.ok(next.b.record_key);
});

test("D040 oversized complete scoped text refuses start before reservation, without clipping or provider access", async (t) => {
  const input = note(
    await queueInput("large-investigation"),
    "large-support",
    "Warehouse report. ".repeat(1400),
  );
  const x = await investigation(t, { input });
  const v = await x.view();
  assert.equal(v.current.can_start, false);
  assert.match(v.current.reasons.join(" "), /byte\/token budget/);
  assert.equal(x.calls(), 0);
  assert.equal(v.history.length, 0);
  assert.equal(v.candidate_binding, null);
});

test("D040 malformed coherent provider evidence fails export, readiness and PostgreSQL reads after restart", async (t) => {
  const x = await investigation(t);
  await x.run();
  const archive = await x.h.ok(x.path + "&representation=export"),
    e = structuredClone(archive.entries.at(-1));
  const raw = JSON.parse(e.investigation.raw_response);
  raw.output.claims[0].spans[0].quote = "invented source text";
  e.investigation.raw_response = JSON.stringify(raw);
  e.investigation.raw_response_hash = `sha256:${(await import("node:crypto")).createHash("sha256").update(e.investigation.raw_response).digest("hex")}`;
  e.investigation.response_bytes = Buffer.byteLength(
    e.investigation.raw_response,
  );
  e.result.investigation = e.investigation;
  e.result_hash = sha256Json(e.result);
  delete e.hash;
  e.hash = sha256Json(e);
  const bad = structuredClone(archive);
  bad.entries[bad.entries.length - 1] = e;
  delete bad.hash;
  bad.hash = sha256Json(bad);
  assert.throws(() => validateWorkExport(bad));
  const cols = workColumns(e);
  const client = await x.h.pg.connect();
  try {
    await client.query("SET session_replication_role=replica");
    await client.query(
      "UPDATE preparation_work_journal SET entry=$1,entry_hash=$2 WHERE event=$3",
      [cols.entry, cols.entry_hash, "terminal_result"],
    );
  } finally {
    await client.query("SET session_replication_role=origin");
    client.release();
  }
  assert.equal((await x.h.call("/readyz")).status, 503);
  assert.equal((await x.h.call(x.path)).status, 500);
  await x.h.restart();
  assert.equal((await x.h.call(x.path)).status, 500);
});

test("D040 citation and usage boundary is deterministic while interpretation correctness remains a human judgment", async (t) => {
  const x = await investigation(t, {
    input: await variation("unfamiliar", "conflicting"),
  });
  await x.run();
  const archive = await x.h.ok(x.path + "&representation=export"),
    s = validateWorkExport(archive),
    input = workInput(s, s.entries[0]),
    q = investigationRequest(input),
    raw = JSON.parse(fakeResponse(q));
  assert.equal(raw.output.claims[0].subject.id, "SHIP-22");
  assert.ok(!q.input.includes("Orchid"));
  const proposal = structuredClone(raw.output);
  const material = JSON.parse(q.input),
    sources = material.sources.filter((s) => s.kind === "retained_utf8_text");
  proposal.contradictions = [
    {
      ...proposal.claims[0],
      spans: sources.map((s) => ({
        source_id: s.id,
        start: 0,
        end: Buffer.byteLength(s.text),
        quote: s.text,
      })),
    },
  ];
  // Exact citations permit review of a proposed interpretation, not proof of truth.
  validateInvestigationProposal(input, proposal);
  proposal.claims[0].spans[0].end++;
  assert.throws(() => validateInvestigationProposal(input, proposal));
  const over = investigationResponse(
    input,
    fakeResponse(q, (v) => {
      v.usage.output_tokens = 2001;
      return v;
    }),
  );
  assert.equal(over.status, "invalid_response");
  assert.equal(over.proposal, null);
  const closed = new PostgresPreparationWorkStore(x.h.pool, () => x.context);
  const command = s.entries[0].command;
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        await closed.submit(
          command,
          () => new Date("2026-09-07T16:05:00.000Z"),
        ),
      ),
    ),
    await x.h.ok(x.post, command),
  );
  const fresh = start(await x.view(), "transport-unavailable");
  await assert.rejects(
    () => closed.submit(fresh, () => new Date("2026-09-07T16:05:00.000Z")),
    /unavailable/,
  );
});

import { editQueue } from "../tests/helpers/intake.mjs";
for (const [name, mutate, field] of [
  [
    "duplicate rows",
    (i) =>
      editQueue(i, (rows, headers) => ({
        rows: [...Array.from({ length: 100 }, () => ({ ...rows[0] })), rows[1]],
        headers,
      })),
    "coverage_rows",
  ],
  [
    "duplicate support",
    (i) => {
      for (let n = 0; n < 11; n++)
        i = note(i, `dup-${n}`, "Same retained note.");
      return i;
    },
    "associated_support_artifacts",
  ],
  [
    "duplicate bytes",
    (i) => {
      for (let n = 0; n < 3; n++) i = note(i, `bytes-${n}`, "x".repeat(400000));
      return i;
    },
    "parsed_utf8_bytes",
  ],
])
  test(`D040 aggregate ${name} cannot be deduplicated to fit investigation`, async (t) => {
    const x = await continuation(t, {
      input: mutate(await queueInput()),
      legacy: false,
      prepared: false,
    });
    x.h.setWorkContext(syntheticInvestigationContext());
    await x.supply();
    const v = await x.h.ok(x.path);
    assert.equal(v.current.can_start, false);
    assert.ok(
      v.resource_preflight.counts[field] > v.resource_preflight.limits[field],
    );
    assert.equal(v.history.length, 0);
  });

test("D040 wall timeout aborts the fake transport; exact retry does not invoke it again", async (t) => {
  let entered;
  const ready = new Promise((r) => (entered = r));
  let aborted = false;
  const x = await investigation(t, {
    transport: async (_q, signal) => {
      entered();
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(Error("aborted fake"));
        }),
      );
    },
  });
  const c = start(await x.view());
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = x.h.call(x.post, c);
  await ready;
  t.mock.timers.tick(60001);
  t.mock.timers.reset();
  assert.equal((await pending).status, 200);
  assert.equal(aborted, true);
  const v = await x.view();
  assert.equal(v.invocations[0].outcome, "failed");
  assert.equal(v.history.at(-1).investigation.status, "timeout_uncertain");
  await x.h.ok(x.post, c);
  assert.equal(x.calls(), 1);
});

test("D040 concurrent cross-Case starts cannot oversubscribe the last reserved slot", async (t) => {
  const context = structuredClone(syntheticInvestigationContext());
  context.profile.investigation.batch_invocations = 1;
  context.pack.worker_profile = context.profile;
  const g = gate(),
    x = await investigation(t, { context, transport: g.transport });
  const first = x.h.call(POST, start(await x.view(), "budget-in-flight"));
  await g.ready;
  const d = await preparedDiscovery(
    x.h,
    await variation("concurrent-budget", "reported"),
  );
  await x.h.ok(
    d.post,
    discoveryCommand(await d.get(), "concurrent-description", "confirm"),
  );
  const b = (await d.get()).binding;
  const p = `${PACK}?bundle_id=${b.bundle_id}&record_key=${b.record_key}&case_id=${b.case_id}`;
  await x.h.ok(
    `${PACK}/selections/publication`,
    publication(await x.h.ok(p), "concurrent-publication"),
  );
  const path = `${WORK}?case_id=${b.case_id}&record_key=${b.record_key}`,
    v = await x.h.ok(path);
  assert.equal(v.current.can_start, false);
  const denied = await x.h.call(POST, start(v, "over-subscribe"));
  assert.equal(denied.data.error, "INVESTIGATION_BUDGET_EXHAUSTED");
  g.finish();
  assert.equal((await first).status, 200);
  assert.equal(x.calls(), 1);
  assert.equal((await x.view()).invocations[0].outcome, "invalidated");
  await x.h.restart();
  validateWorkExport(await x.h.ok(path + "&representation=export"));
});
