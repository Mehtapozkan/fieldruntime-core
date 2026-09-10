import assert from "node:assert/strict";
import {
  validateWorkView,
  intakeHash,
} from "../apps/admin/public/intake-client.js";
import test from "node:test";
import {
  discoveryCommand,
  variation,
  scopedDeliveries,
} from "../tests/helpers/discovery.mjs";
import {
  WORK,
  PACK,
  preparedWork,
  publication,
  start,
  sharedCaseWork,
} from "../tests/helpers/preparation-work.mjs";
test("D12 W1/W3 API: explicit v2 publication, preparation and exact task target; read-only inspection", async (t) => {
  const { h, d, path, packPath } = await preparedWork(t);
  const before = await h.snapshot(),
    r = await h.call(path);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.current.can_start, false);
  assert.deepEqual(await h.snapshot(), before);
  const p = await h.ok(packPath);
  assert.ok(p.candidate, JSON.stringify(p.current));
  assert.equal(p.candidate.schema_version, "preparation-pack.v2");
  await h.ok(`${PACK}/selections/publication`, publication(p));
  const view = await h.ok(path),
    command = start(view),
    receipt = await h.ok(`${WORK}/commands`, command);
  assert.equal(receipt.entry.event, "started");
  const prepared = await h.ok(path),
    run = prepared.invocations[0];
  assert.equal(run.outcome, "prepared_gap_packet");
  assert.equal(run.can_accept, true);
  assert.equal(run.result.follow_up.sent, false);
  assert.equal(run.result.subject.customer, "Orchid");
  assert.equal(run.result.disposition.recommended_credit_minor, null);
  assert.match(run.result.evidence_checklist[0].finding, /not supplied/);
  assert.equal(
    run.result.steps[2].confirmation_entry_hash,
    (await d.get()).history[0].hash,
  );
  assert.equal((await d.get()).history.length, 1);
  const after = await h.snapshot();
  assert.deepEqual(await h.ok(`${WORK}/commands`, command), receipt);
  await h.restart();
  assert.deepEqual(await h.ok(path), prepared);
  assert.deepEqual(await h.ok(`${WORK}/commands`, command), receipt);
  assert.deepEqual(await h.snapshot(), after);
});
import { sha256Json } from "../dist/packages/contracts/src/index.js";
import {
  syntheticWorkContext,
  validateWorkExport,
} from "../dist/packages/runtime/src/preparation-work.js";
import { prepareDisposition } from "../dist/packages/runtime/src/disposition-preparation.js";
import { fixedPreparationPort } from "../dist/packages/runtime/src/preparation-worker-port.js";
import { workColumns } from "../dist/packages/runtime/src/postgres-preparation-work-store.js";
import { setTimeout as delay } from "node:timers/promises";
import { intakeInput, editQueue } from "../tests/helpers/intake.mjs";
const POST = `${WORK}/commands`;
test("D12 W5 shared-Case A to B to A uses Case replacement ordering", async (t) => {
  const {
    h,
    records: [a, b],
  } = await sharedCaseWork(t);
  const receipts = [],
    commands = [];
  for (const [i, record] of [a, b, a].entries()) {
    await h.ok(
      `${PACK}/selections/publication`,
      publication(await h.ok(record.packPath), `publish-${i}`),
    );
    const view = await h.ok(record.path),
      command = start(view, `start-${i}`);
    assert.equal(view.current.can_start, true);
    assert.equal(
      command.replaces_invocation,
      receipts.at(-1)?.entry.invocation_id ?? null,
    );
    const before = await h.snapshot();
    if (i) {
      const wrong = await h.call(POST, {
        ...command,
        replaces_invocation: view.invocations.at(-1)?.invocation_id ?? null,
      });
      assert.equal(wrong.status, 409);
      assert.equal(wrong.data.error, "WORK_REPLACEMENT_REQUIRED");
      assert.deepEqual(await h.snapshot(), before);
    }
    const response = await h.call(POST, command);
    t.diagnostic(
      JSON.stringify({
        step: ["A first", "B first", "A repeat"][i],
        status: response.status,
        result: response.data.error ?? response.data.entry?.event,
      }),
    );
    assert.equal(response.status, 200, JSON.stringify(response.data));
    commands.push(command);
    receipts.push(response.data);
    const after = await h.snapshot();
    assert.deepEqual(business(after), business(before));
    await h.restart();
    assert.deepEqual(await h.ok(POST, command), response.data);
    assert.deepEqual(await h.snapshot(), after);
    const run = (await h.ok(record.path)).invocations.at(-1);
    assert.equal(
      run.result.subject.record_id,
      i === 1 ? "dispute-18" : "dispute-17",
    );
    assert.equal(run.can_accept, true);
    assert.equal(run.review, null);
  }
  const av = await h.ok(a.path),
    bv = await h.ok(b.path);
  assert.equal(av.invocations.length, 2);
  assert.equal(bv.invocations.length, 1);
  assert.deepEqual(av.history, bv.history);
  assert.equal(av.work_revision, 6);
  assert.equal(bv.invocations[0].current_usable, false);
  const before = await h.snapshot();
  for (const [i, command] of commands.entries())
    assert.deepEqual(await h.ok(POST, command), receipts[i]);
  assert.equal(
    (await h.call(POST, { ...commands[0], idempotency_key: "stale-U" })).status,
    409,
  );
  assert.equal(
    (await h.call(POST, { ...commands[1], replaces_invocation: null })).data
      .error,
    "IDEMPOTENCY_CONFLICT",
  );
  validateWorkExport(await h.ok(`${a.path}&representation=export`));
  await validateWorkView(av, a.b);
  for (const pending of [receipts[0].entry.invocation_id, "invented-pending"]) {
    const bad = structuredClone(av);
    bad.current.pending_invocation = pending;
    delete bad.hash;
    bad.hash = await intakeHash(bad);
    await assert.rejects(() => validateWorkView(bad, a.b));
  }
  assert.deepEqual(await h.snapshot(), before);
});
test("D12 W5 single-record first and repeat control", async (t) => {
  const { h, path } = await published(t);
  for (const key of ["first", "repeat"]) {
    const command = start(await h.ok(path), key);
    const receipt = await h.ok(POST, command),
      snapshot = await h.snapshot();
    assert.deepEqual(await h.ok(POST, command), receipt);
    assert.deepEqual(await h.snapshot(), snapshot);
  }
  assert.equal((await h.ok(path)).invocations.length, 2);
});
const review = (v, decision = "approve") => ({
  schema_version: "preparation-task-review.v1",
  operation: "task_review",
  purpose: "preparation_usefulness",
  invocation_id: v.invocations.at(-1).invocation_id,
  result_hash: v.invocations.at(-1).result_hash,
  expected_work_revision: v.work_revision,
  expected_work_head: v.work_head,
  decision,
  reason: "Synthetic task review; no business disposition or closure",
  idempotency_key: `review-${decision}`,
  ...(decision === "modify"
    ? { replacement_proposal: "Clarify unconfirmed recipient and access route" }
    : {}),
});
const withdraw = (v) => ({
  schema_version: "pack-selection-command.v2",
  operation: "withdraw",
  pack_id: v.pack_id,
  expected_selection_revision: v.selection_revision,
  expected_selection_head: v.selection_head,
  expected_publication_profile_hash: v.publication_profile_hash,
  artifact_hash: v.selected_artifact_hash,
  reason: "Withdraw preparation permission",
  idempotency_key: "withdraw",
});
async function published(t, input) {
  const p = await preparedWork(t, input);
  await p.h.ok(
    `${PACK}/selections/publication`,
    publication(await p.h.ok(p.packPath)),
  );
  return p;
}
async function completed(t, input) {
  const p = await published(t, input);
  p.command = start(await p.h.ok(p.path));
  p.receipt = await p.h.ok(POST, p.command);
  p.view = await p.h.ok(p.path);
  return p;
}
const business = (s) =>
  Object.fromEntries(
    Object.entries(s).filter(
      ([k]) => !["runtime_writer_lock", "preparation_work_journal"].includes(k),
    ),
  );
for (const scenario of [
  "different-deliveries",
  "distinct-records",
  "same-delivery",
  "shared-delivery",
])
  test(`D12 W2 scoped ${scenario} keeps relevant delivery citations`, async (t) => {
    const { h, view, path } = await completed(
      t,
      await scopedDeliveries(`work-${scenario}`, scenario),
    );
    const r = view.invocations[0].result,
      deliveries = r.evidence_checklist.filter(
        (c) => c.subject.kind === "delivery",
      );
    if (scenario === "different-deliveries")
      assert.deepEqual(
        deliveries.map((c) => [c.subject.id, c.status]),
        [
          ["DEL-4", "reported_confirmation"],
          ["DEL-5", "reported_gap"],
        ],
      );
    if (scenario === "distinct-records") {
      assert.equal(deliveries[0].status, "not_supplied");
      assert.ok(r.reconciliation.every((c) => !c.conflicting));
      assert.ok(
        !r.follow_up.draft_citation_ids.some(
          (id) =>
            view.sources.find((s) => s.id === id)?.name ===
            "dispute-18-only.txt",
        ),
      );
    }
    if (scenario === "same-delivery")
      assert.equal(deliveries[0].status, "conflicting");
    if (scenario === "shared-delivery")
      assert.equal(deliveries[0].status, "reported_confirmation");
    for (const c of deliveries.filter((c) => c.status !== "not_supplied"))
      assert.ok(
        c.citation_ids.every((id) =>
          view.sources.find((s) => s.id === id)?.name.endsWith(".txt"),
        ),
      );
    assert.equal(r.disposition.recommended_credit_minor, null);
    await h.restart();
    assert.deepEqual((await h.ok(path)).invocations[0].result, r);
  });
for (const condition of ["none", "reported", "conflicting", "ambiguous"])
  test(`D12 W1/W2 varied Cedar ${condition} produces evidence-specific preparation`, async (t) => {
    const { view } = await completed(
        t,
        await variation(`worker-${condition}`, condition),
      ),
      r = view.invocations[0].result;
    assert.ok(r, JSON.stringify(view.history.at(-1).diagnostics));
    assert.equal(r.subject.customer, "Cedar");
    assert.equal(r.subject.disputed_amount_minor, 420000);
    assert.match(r.follow_up.draft, /SHIP-22/);
    assert.doesNotMatch(r.follow_up.draft, /DEL-4|Orchid|15000/);
    assert.equal(
      r.evidence_checklist[0].status,
      condition === "none"
        ? "not_supplied"
        : condition === "reported"
          ? "reported_confirmation"
          : condition === "conflicting"
            ? "conflicting"
            : "not_supplied",
    );
    if (condition === "ambiguous")
      assert.ok(r.evidence_checklist.some((c) => c.status === "ambiguous"));
    assert.equal(r.financial_authority, false);
  });
for (const decision of ["approve", "reject", "modify", "escalate"])
  test(`D12 W6 task ${decision} is terminal, purpose-bound and replayable`, async (t) => {
    const { h, path, view } = await completed(t),
      before = await h.snapshot(),
      command = review(view, decision),
      receipt = await h.ok(POST, command);
    assert.equal(receipt.entry.actor.identity_id, "identity_intake_operator");
    assert.deepEqual(business(await h.snapshot()), business(before));
    assert.equal((await h.ok(path)).invocations[0].can_accept, false);
    assert.equal(
      (await h.ok(path)).invocations[0].current_usable,
      decision === "approve",
    );
    assert.equal(
      (
        await h.call(POST, {
          ...review(await h.ok(path)),
          idempotency_key: "revive",
        })
      ).data.error,
      "WORK_REVIEW_TERMINAL",
    );
    const after = await h.snapshot();
    await h.restart();
    assert.deepEqual(await h.ok(POST, command), receipt);
    assert.deepEqual(await h.snapshot(), after);
    const replacement = start(await h.ok(path), "explicit-replacement");
    await h.ok(POST, replacement);
    assert.equal((await h.ok(path)).invocations.at(-1).review, null);
  });
for (const change of ["description", "withdrawal", "expiry", "worker_profile"])
  test(`D12 W3/W4 ${change} stales historical success while eligible task interventions remain possible`, async (t) => {
    const { h, d, path, packPath, view, command, receipt } = await completed(t);
    if (change === "description")
      await h.ok(
        d.post,
        discoveryCommand(await d.get(), "changed-description"),
      );
    if (change === "withdrawal")
      await h.ok(
        `${PACK}/selections/publication`,
        withdraw(await h.ok(packPath)),
      );
    if (change === "expiry") h.setTime("2026-09-07T17:01:00.000Z");
    if (change === "worker_profile") {
      const c = syntheticWorkContext();
      c.profile = structuredClone(c.profile);
      c.profile.profile_id = "synthetic_preparation_worker.revised";
      c.pack.worker_profile = c.profile;
      h.setWorkContext(c);
    }
    const stale = await h.ok(path);
    assert.equal(stale.invocations[0].current_usable, false);
    assert.equal(stale.invocations[0].can_intervene, true);
    assert.equal((await h.call(POST, review(stale))).status, 409);
    await h.ok(POST, review(stale, "reject"));
    assert.deepEqual(await h.ok(POST, command), receipt);
    assert.deepEqual(
      (await h.ok(path)).invocations[0].result,
      view.invocations[0].result,
    );
  });
test("D12 W3 clients cannot select identities, fabricate output or alter exact start bindings", async (t) => {
  const { h, path } = await published(t),
    v = await h.ok(path),
    c = start(v),
    before = await h.snapshot();
  for (const field of [
    "actor",
    "identity",
    "result",
    "authorized",
    "worker_profile",
    "policy",
  ])
    assert.equal((await h.call(POST, { ...c, [field]: true })).status, 400);
  assert.equal(
    (
      await h.call(POST, {
        ...c,
        binding: { ...c.binding, artifact_hash: `sha256:${"a".repeat(64)}` },
      })
    ).status,
    409,
  );
  assert.deepEqual(await h.snapshot(), before);
});
for (const change of [
  "revoked",
  "expired",
  "future",
  "unknown",
  "contradictory",
  "scope",
  "self_review",
])
  test(`D12 W3 canonical profile ${change} fails closed`, async (t) => {
    const { h, path } = await published(t),
      v = await h.ok(path),
      c = structuredClone(syntheticWorkContext());
    if (change === "revoked") c.profile.identities[0].status = "revoked";
    if (change === "expired")
      c.profile.grants[0].effective_until = "2026-09-07T16:04:00.000Z";
    if (change === "future")
      c.profile.grants[0].effective_from = "2026-09-07T16:06:00.000Z";
    if (change === "unknown")
      c.profile.identities = c.profile.identities.filter(
        (i) => i.identity_kind !== "service",
      );
    if (change === "contradictory")
      c.profile.identities.push({
        ...c.profile.identities[0],
        status: "revoked",
      });
    if (change === "scope") c.profile.read_scope_ids = ["scope_entity_north"];
    if (change === "self_review")
      c.profile.identities.find(
        (i) => i.identity_id === "identity_intake_operator",
      ).identity_kind = "service";
    c.pack.worker_profile = c.profile;
    h.setWorkContext(c);
    const before = await h.snapshot();
    assert.ok((await h.call(POST, start(v))).status >= 400);
    assert.deepEqual(await h.snapshot(), before);
  });
async function gated(h) {
  let finish, entered;
  const ready = new Promise((r) => (entered = r));
  h.setWorkPort((input) => ({
    completion: new Promise((r) => {
      finish = () => r(prepareDisposition(input));
      entered();
    }),
    cancel: () => {},
  }));
  return { ready, finish: () => finish() };
}
test("D12 W5 same-key/competing commands, interruption and late result fence; fresh explicit replacement", async (t) => {
  const { h, path } = await published(t),
    v = await h.ok(path),
    c = start(v),
    g = await gated(h),
    first = h.call(POST, c);
  await g.ready;
  const pending = await h.ok(path);
  assert.equal(pending.invocations[0].outcome, "started");
  const dup = await h.ok(POST, c);
  assert.equal(dup.entry.hash, pending.work_head);
  assert.equal(
    (await h.call(POST, { ...c, idempotency_key: "competing" })).status,
    409,
  );
  const interrupted = await h.ok(POST, {
    schema_version: "preparation-interruption.v1",
    operation: "interrupt",
    invocation_id: dup.entry.invocation_id,
    expected_work_revision: pending.work_revision,
    expected_work_head: pending.work_head,
    reason: "Explicit interruption fences late output",
    idempotency_key: "interrupt",
  });
  g.finish();
  assert.deepEqual((await first).data, dup);
  const after = await h.ok(path);
  assert.equal(after.work_revision, 2);
  assert.equal(after.invocations[0].outcome, "interrupted");
  assert.equal(after.invocations[0].result, null);
  await h.restart();
  assert.deepEqual(await h.ok(POST, c), dup);
  assert.equal((await h.ok(path)).work_head, interrupted.entry.hash);
  h.setWorkPort(fixedPreparationPort);
  await h.ok(POST, start(await h.ok(path), "replacement"));
  assert.equal((await h.ok(path)).invocations.at(-1).can_accept, true);
});
for (const change of [
  "description",
  "withdrawal",
  "expiry",
  "identity",
  "scope",
  "profile",
  "case",
])
  test(`D12 W4 ${change} during computation invalidates result at terminal boundary`, async (t) => {
    const { h, d, path, packPath } = await published(t),
      g = await gated(h),
      first = h.call(POST, start(await h.ok(path)));
    await g.ready;
    if (change === "description")
      await h.ok(d.post, discoveryCommand(await d.get(), "during-run"));
    if (change === "withdrawal")
      await h.ok(
        `${PACK}/selections/publication`,
        withdraw(await h.ok(packPath)),
      );
    if (change === "expiry") h.setTime("2026-09-07T17:01:00.000Z");
    if (["identity", "scope", "profile"].includes(change)) {
      const c = structuredClone(syntheticWorkContext());
      if (change === "identity") c.profile.identities[0].status = "revoked";
      if (change === "scope") c.profile.work_scope_ids = [];
      if (change === "profile")
        c.profile.profile_id = "synthetic_worker_revised";
      c.pack.worker_profile = c.profile;
      h.setWorkContext(c);
    }
    if (change === "case") {
      const v = await h.ok(path);
      await h.ok("/v0/tenants/tenant_intake_demo/case-commands", {
        type: "case.transition",
        tenant_id: "tenant_intake_demo",
        case_id: v.case_id,
        expected_case_version: 1,
        actor_identity_id: "identity_intake_operator",
        idempotency_key: "changed-during-run",
        correlation_id: "d12_boundary",
        to_state: "resolved",
        reason: "Incomplete closure proof remains denied",
      });
    }
    g.finish();
    assert.equal((await first).status, 200);
    const v = await h.ok(path);
    assert.equal(v.invocations[0].outcome, "invalidated");
    assert.equal(v.invocations[0].can_accept, false);
    await h.restart();
    assert.equal((await h.ok(path)).invocations[0].outcome, "invalidated");
  });
for (const fault of [
  "work-started-insert",
  "work-terminal_result-insert",
  "COMMIT",
])
  test(`D12 W5 persistence failure at ${fault} leaves no fabricated completion and retry never recomputes`, async (t) => {
    const { h, path } = await published(t),
      c = start(await h.ok(path)),
      before = await h.snapshot();
    let calls = 0;
    h.setWorkPort((input) => {
      calls++;
      return fixedPreparationPort(input);
    });
    h.fault({ tag: fault });
    assert.equal((await h.call(POST, c)).status, 500);
    if (fault === "work-terminal_result-insert") {
      const v = await h.ok(path);
      assert.equal(v.invocations[0].outcome, "started");
      const count = calls;
      await h.restart();
      const receipt = await h.ok(POST, c);
      assert.equal(receipt.entry.event, "started");
      assert.equal(calls, count);
      assert.equal((await h.ok(path)).invocations[0].outcome, "started");
    } else {
      assert.deepEqual(await h.snapshot(), before);
      await h.ok(POST, c);
      assert.equal(
        (await h.ok(path)).invocations[0].outcome,
        "prepared_gap_packet",
      );
    }
  });
test("D12 W5 lost start commit acknowledgment is recovered across restart without resuming computation", async (t) => {
  const { h, path } = await published(t),
    c = start(await h.ok(path));
  let calls = 0;
  h.setWorkPort((input) => {
    calls++;
    return fixedPreparationPort(input);
  });
  h.fault({ tag: "COMMIT", after: true });
  assert.equal((await h.call(POST, c)).status, 500);
  const before = await h.snapshot();
  await h.restart();
  const receipt = await h.ok(POST, c);
  assert.equal(receipt.entry.event, "started");
  assert.equal(calls, 0);
  assert.deepEqual(await h.snapshot(), before);
  assert.equal(
    (
      await h.call(POST, {
        ...c,
        binding: { ...c.binding, source_revision: `sha256:${"a".repeat(64)}` },
      })
    ).data.error,
    "IDEMPOTENCY_CONFLICT",
  );
});
test("D12 W9 fast computation plus six-second writer wait is valid; timing excludes lock wait", async (t) => {
  const { h, path } = await published(t),
    g = await gated(h),
    first = h.call(POST, start(await h.ok(path)));
  await g.ready;
  const lock = await h.pg.connect();
  try {
    await lock.query("BEGIN");
    await lock.query(
      "SELECT revision FROM runtime_writer_lock WHERE singleton_id=1 FOR UPDATE",
    );
    g.finish();
    await delay(6100);
    await lock.query("COMMIT");
  } finally {
    lock.release();
  }
  assert.equal((await first).status, 200);
  const v = await h.ok(path),
    e = v.history.at(-1);
  assert.equal(e.outcome, "prepared_gap_packet");
  assert.ok(e.parent_timing.computation_elapsed_ms < 5000);
  assert.ok(e.parent_timing.writer_lock_wait_ms >= 6000);
  await h.restart();
  assert.equal((await h.ok(path)).history.at(-1).hash, e.hash);
});
test("D12 W9 computation timeout is failed, never a packet", async (t) => {
  const { h, path } = await published(t);
  h.setWorkPort((input) => ({
    completion: delay(5500).then(() => prepareDisposition(input)),
    cancel: () => {},
  }));
  await h.ok(POST, start(await h.ok(path)));
  const v = await h.ok(path);
  assert.equal(v.invocations[0].outcome, "failed");
  assert.equal(v.invocations[0].result, null);
  assert.equal(v.invocations[0].can_accept, false);
});
test("D12 W8 coherent result tampering fails replay, readiness, reads and restart", async (t) => {
  const { h, path, view } = await completed(t),
    e = structuredClone(view.history.at(-1));
  e.result.subject.disputed_amount_minor = 1;
  e.result_hash = sha256Json(e.result);
  delete e.hash;
  e.hash = sha256Json(e);
  const c = await h.pg.connect();
  try {
    await c.query("SET session_replication_role='replica'");
    const row = workColumns(e);
    await c.query("DELETE FROM preparation_work_journal WHERE sequence=2");
    await c.query(
      "INSERT INTO preparation_work_journal SELECT * FROM jsonb_populate_record(NULL::preparation_work_journal,$1)",
      [row],
    );
  } finally {
    await c.query("SET session_replication_role='origin'");
    c.release();
  }
  assert.equal((await h.call("/readyz")).status, 503);
  assert.equal((await h.call(path)).status, 500);
  assert.equal((await h.call(path + "&representation=export")).status, 500);
  await h.restart();
  assert.equal((await h.call(path)).status, 500);
});
test("D12 W8 read/export while another writer holds the lock remains read-only and reproduces after restart", async (t) => {
  const { h, path } = await completed(t),
    before = await h.snapshot(),
    lock = await h.pg.connect();
  let archive;
  try {
    await lock.query("BEGIN");
    await lock.query(
      "SELECT revision FROM runtime_writer_lock WHERE singleton_id=1 FOR UPDATE",
    );
    const start = h.trace.length;
    archive = await h.ok(path + "&representation=export");
    await h.ok(path);
    assert.ok(
      !h.trace
        .slice(start)
        .some((q) => /FOR UPDATE|INSERT|UPDATE runtime_writer_lock/.test(q)),
    );
    await lock.query("COMMIT");
  } finally {
    lock.release();
  }
  assert.equal(validateWorkExport(archive).entries.length, 2);
  assert.deepEqual(await h.snapshot(), before);
  await h.restart();
  assert.deepEqual(await h.ok(path + "&representation=export"), archive);
});
test("D12 W4 successful intake no-op key bookkeeping alone does not stale preparation", async (t) => {
  const input = await intakeInput("initial-worker-intake"),
    { h, path, view } = await completed(t, input);
  await h.ok("/v1/intake/preparations", {
    ...input,
    idempotency_key: "fresh-noop-key",
  });
  const after = await h.ok(path);
  assert.equal(after.invocations[0].current_usable, true);
  assert.equal(
    after.invocations[0].result_hash,
    view.invocations[0].result_hash,
  );
});
const headFields = (v) => ({
  expected_work_revision: v.work_revision,
  expected_work_head: v.work_head,
});
const correction = (v) => {
  const r = v.invocations.at(-1);
  return {
    schema_version: "purpose_limited_preparation_correction.v1",
    operation: "correction",
    purpose: "preparation_usefulness",
    invocation_id: r.invocation_id,
    ...headFields(v),
    idempotency_key: "correct-wording",
    binding_hash: sha256Json(r.binding),
    original_result_hash: r.result_hash,
    target: "/follow_up/requests/0/text",
    before: r.result.follow_up.requests[0].text,
    after: `Please identify who can supply ${r.result.evidence_checklist[0].subject.id} confirmation and the permitted retrieval route; this request assigns no owner.`,
    classification: "knowledge_bearing",
    primary_reason: "MISSING_KNOWLEDGE",
    reason: "Clarify an evidence request without asserting new source facts",
    citation_ids: r.result.follow_up.requests[0].citation_ids,
    evidence_limits: [
      "Proposed wording only; no new source evidence or authority",
    ],
  };
};
const evaluation = (v, e) => ({
  schema_version: "preparation-evaluation-review.v1",
  operation: "evaluation_review",
  purpose: "synthetic_evaluation_candidate",
  invocation_id: e.invocation_id,
  ...headFields(v),
  idempotency_key: "evaluate-wording",
  correction_entry_hash: e.hash,
  candidate_id: e.candidate.id,
  expected_candidate_revision: e.candidate.revision,
  expected_test_case_hash: e.candidate.test_case_hash,
  decision: "approve",
  reason:
    "Select only a synthetic regression candidate; no implementation promotion",
  test_references: [
    "scripts/preparation-work-postgres.test.mjs W6; varied Cedar unseen inputs",
  ],
});
test("D12 W6 correction and independent evaluation are exact, immutable, replayable and never promote a worker", async (t) => {
  const { h, path, view, packPath } = await completed(t),
    c = correction(view),
    before = await h.snapshot();
  for (const field of [
    "target",
    "before",
    "after",
    "classification",
    "primary_reason",
    "evidence_limits",
  ]) {
    const bad = Object.fromEntries(
      Object.entries(c).filter(([key]) => key !== field),
    );
    assert.equal((await h.call(POST, bad)).status, 400);
  }
  assert.equal(
    (await h.call(POST, { ...c, before: "invented original" })).status,
    409,
  );
  assert.deepEqual(await h.snapshot(), before);
  const cr = await h.ok(POST, c),
    e = cr.entry;
  assert.equal(e.candidate.status, "not_reviewed");
  assert.equal(
    (await h.call(POST, { ...c, after: "different valid text" })).data.error,
    "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    (await h.call(POST, { ...c, idempotency_key: "stale-u" })).status,
    409,
  );
  const ev = evaluation(await h.ok(path), e),
    receipt = await h.ok(POST, ev);
  assert.notEqual(receipt.entry.actor.identity_id, e.actor.identity_id);
  assert.deepEqual(
    (await h.ok(path)).invocations[0].result,
    view.invocations[0].result,
  );
  assert.equal((await h.ok(path)).invocations[0].review, null);
  const context = structuredClone(syntheticWorkContext());
  context.profile.implementation_id = "disposition-code.v2";
  context.pack.worker_profile = context.profile;
  h.setWorkContext(context);
  assert.equal((await h.ok(path)).current.can_start, false);
  await h.ok(
    `${PACK}/selections/publication`,
    publication(await h.ok(packPath), "reviewed-worker-v2"),
  );
  await h.ok(POST, start(await h.ok(path), "worker-v2"));
  const changed = await h.ok(path);
  assert.equal(
    changed.invocations.at(-1).result.follow_up.requests[0].text,
    e.command.after,
  );
  assert.equal(changed.invocations.at(-1).review, null);
  assert.deepEqual(changed.invocations[0].result, view.invocations[0].result);
  const after = await h.snapshot();
  await h.restart();
  assert.deepEqual(await h.ok(POST, c), cr);
  assert.deepEqual(await h.ok(POST, ev), receipt);
  assert.deepEqual(await h.snapshot(), after);
  assert.equal(
    validateWorkExport(await h.ok(path + "&representation=export")).entries
      .length,
    6,
  );
});
const noteCommand = (v, measure, value = null) => {
  const r = v.invocations.at(-1),
    money = ["cash_collected", "credits_issued"].includes(measure);
  return {
    schema_version: "preparation-proof-note.v1",
    operation: "proof_note",
    purpose: "synthetic_measurement_readiness",
    invocation_id: r.invocation_id,
    ...headFields(v),
    idempotency_key: `note-${measure}`,
    binding_hash: sha256Json(r.binding),
    result_hash: r.result_hash,
    reason: "Bounded synthetic report; no measured customer outcome",
    note: {
      definition_version: "invoice-dispute-proof.v1",
      measure,
      value,
      unit: money
        ? "currency_minor"
        : measure === "human_attention_released"
          ? "person_minutes"
          : "records",
      currency: money ? "USD" : null,
      qualification: value === null ? "unknown" : "measured",
      synthetic: true,
      cohort: "All synthetic records including open and failed work",
      period: {
        start: "2026-09-07T16:00:00.000Z",
        end: "2026-09-07T16:05:00.000Z",
        source_timezone: "UTC",
      },
      coverage: {
        numerator: 1,
        denominator: 2,
        exclusions: "No failed or unresolved records excluded",
      },
      source: {
        kind: "unknown",
        reference: "synthetic-test-report",
        locator: "row 1",
        observed_at: null,
      },
      method: "Separate evidence is unavailable",
      measurement_owner: "synthetic operator",
      uncertainty: "No real-customer measurement",
      treatment: "not_applicable",
      baseline_person_minutes: null,
      actual_person_minutes: null,
      prior_coverage_known: false,
      substantive_progress: false,
      supersedes_entry_hash: null,
      reversal_of_entry_hash: null,
      reopens_entry_hash: null,
      overlap_entry_hashes: [],
    },
  };
};
test("D12 W7 five separate measures and costs retain unknown, negative attention, overlap and reversals without business proof", async (t) => {
  const { h, path } = await completed(t),
    initial = await h.snapshot(),
    receipts = [];
  for (const measure of [
    "cash_collected",
    "disputes_resolved",
    "credits_issued",
    "work_newly_attended_to",
    "human_attention_released",
    "cost_model_tool",
    "cost_infrastructure",
    "cost_human",
    "cost_support",
    "cost_setup",
  ]) {
    const c = noteCommand(await h.ok(path), measure);
    if (measure.startsWith("cost_")) {
      c.note.unit = "currency_minor";
      c.note.currency = "USD";
      c.note.treatment = measure === "cost_setup" ? "one_time" : "recurring";
    }
    receipts.push(await h.ok(POST, c));
  }
  let c = noteCommand(await h.ok(path), "cash_collected", 1500000);
  c.idempotency_key = "not-cash";
  c.note.source.kind = "posted_credit";
  assert.equal((await h.call(POST, c)).status, 400);
  c = noteCommand(await h.ok(path), "work_newly_attended_to", 1);
  c.idempotency_key = "not-attended";
  c.note.source.kind = "prior_coverage_and_progress";
  assert.equal((await h.call(POST, c)).status, 400);
  c = noteCommand(await h.ok(path), "human_attention_released", -5);
  c.idempotency_key = "negative-attention";
  c.note.source.kind = "active_effort_comparison";
  c.note.source.observed_at = "2026-09-07T16:05:00.000Z";
  c.note.baseline_person_minutes = 10;
  c.note.actual_person_minutes = 15;
  c.note.supersedes_entry_hash = receipts[4].entry.hash;
  c.note.method =
    "All active operator effort, including correction and review; waiting excluded";
  c.note.overlap_entry_hashes = [receipts[4].entry.hash];
  const negative = await h.ok(POST, c);
  c = noteCommand(await h.ok(path), "disputes_resolved");
  c.idempotency_key = "reopened";
  c.note.reopens_entry_hash = receipts[1].entry.hash;
  c.note.reversal_of_entry_hash = receipts[1].entry.hash;
  await h.ok(POST, c);
  assert.deepEqual(business(await h.snapshot()), business(initial));
  const v = await h.ok(path);
  assert.equal(v.authority_granted, false);
  assert.equal(v.closure_permission, false);
  assert.equal(negative.entry.command.note.value, -5);
  const archive = await h.ok(path + "&representation=export");
  await h.restart();
  assert.deepEqual(await h.ok(path + "&representation=export"), archive);
  assert.equal(validateWorkExport(archive).entries.length, 14);
});
import { intakeHost, migrations } from "../tests/helpers/intake-postgres.mjs";
import { preparedDiscovery } from "../tests/helpers/discovery.mjs";
test("D12 W3/W8 upgrade preserves v1 publication, Discovery and successful keys; requires explicit v2 publication", async (t) => {
  const h = await intakeHost(t, { beforeWork: true }),
    d = await preparedDiscovery(h);
  await h.ok(
    d.post,
    discoveryCommand(await d.get(), "legacy-confirm", "confirm"),
  );
  const b = (await d.get()).binding,
    packPath = `${PACK}?bundle_id=${b.bundle_id}&record_key=${b.record_key}&case_id=${b.case_id}`,
    path = `${WORK}?case_id=${b.case_id}&record_key=${b.record_key}`;
  const v = await h.ok(packPath),
    old = { ...publication(v), schema_version: "pack-selection-command.v1" },
    receipt = await h.ok(`${PACK}/selections/publication`, old),
    before = await h.snapshot();
  const checksums = (
    await h.pg.query(
      "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
    )
  ).rows;
  await h.upgrade();
  const after = await h.snapshot();
  for (const key of [
    "case_journal",
    "intake_commit",
    "intake_bundle",
    "intake_request_binding",
    "discovery_review",
    "preparation_pack_selection",
  ])
    if (before[key]) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(
    (
      await h.pg.query(
        "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
      )
    ).rows.slice(0, 8),
    checksums,
  );
  assert.equal(migrations.length, 12);
  const w = await h.ok(path);
  assert.equal(w.current.can_start, false);
  assert.equal((await h.call(POST, { ...start(w), binding: {} })).status, 400);
  assert.deepEqual(await h.ok(`${PACK}/selections/publication`, old), receipt);
  await h.ok(
    `${PACK}/selections/publication`,
    publication(await h.ok(packPath), "explicit-v2"),
  );
  await h.ok(POST, start(await h.ok(path)));
  await h.restart();
  assert.equal(
    (await h.ok(path)).invocations[0].outcome,
    "prepared_gap_packet",
  );
});
test("D12 W9 malformed or fabricated worker result fails without effective packet", async (t) => {
  const { h, path } = await published(t);
  h.setWorkPort((input) => ({
    completion: Promise.resolve({
      ...prepareDisposition(input),
      financial_authority: true,
    }),
    cancel: () => {},
  }));
  await h.ok(POST, start(await h.ok(path)));
  const v = await h.ok(path);
  assert.equal(v.invocations[0].outcome, "failed");
  assert.equal(v.invocations[0].result, null);
  await h.restart();
  assert.equal((await h.ok(path)).invocations[0].outcome, "failed");
});
test("D12 W9 expiry while waiting for terminal writer lock invalidates fast computation", async (t) => {
  const { h, path } = await published(t),
    g = await gated(h),
    first = h.call(POST, start(await h.ok(path)));
  await g.ready;
  const lock = await h.pg.connect();
  try {
    await lock.query("BEGIN");
    await lock.query(
      "SELECT revision FROM runtime_writer_lock WHERE singleton_id=1 FOR UPDATE",
    );
    g.finish();
    await delay(100);
    h.setTime("2026-09-07T17:01:00.000Z");
    await lock.query("COMMIT");
  } finally {
    lock.release();
  }
  assert.equal((await first).status, 200);
  assert.equal((await h.ok(path)).invocations[0].outcome, "invalidated");
});
test("D12 W9 bounded coverage refuses 201 rows without truncation", async (t) => {
  const input = editQueue(
    await intakeInput("oversize-worker"),
    (rows, headers) => ({
      rows: Array.from({ length: 201 }, (_, i) => ({
        ...rows[0],
        source_record_id: `record-${i}`,
      })),
      headers,
    }),
  );
  const { h, path } = await published(t, input),
    before = await h.snapshot();
  const r = await h.call(POST, start(await h.ok(path)));
  assert.equal(r.data.error, "WORK_INPUT_LIMIT");
  assert.deepEqual(await h.snapshot(), before);
});
async function rewriteWork(h, entries) {
  const c = await h.pg.connect();
  try {
    await c.query("SET session_replication_role='replica'");
    await c.query("DELETE FROM preparation_work_journal");
    for (const e of entries)
      await c.query(
        "INSERT INTO preparation_work_journal SELECT * FROM jsonb_populate_record(NULL::preparation_work_journal,$1)",
        [workColumns(e)],
      );
  } finally {
    await c.query("SET session_replication_role='origin'");
    c.release();
  }
}
const rehash = (e) => {
  delete e.hash;
  e.hash = sha256Json(e);
  return e;
};
test("D12 W8 coherent over-budget timing cannot turn a slow result into accepted computation", async (t) => {
  const { h, path, view } = await completed(t),
    entries = structuredClone(view.history);
  entries[1].parent_timing.computation_elapsed_ms = 6000;
  entries[1].parent_timing.completed_within_budget = true;
  rehash(entries[1]);
  await rewriteWork(h, entries);
  assert.equal((await h.call(path)).status, 500);
  assert.equal((await h.call("/readyz")).status, 503);
});
test("D12 W4/W8 D-014 preserves legitimate earlier work and rejects a coherently shifted obsolete Case prefix", async (t) => {
  const { h, path, view, b } = await completed(t);
  h.setTime("2026-09-07T16:06:00.000Z");
  const r = await h.ok("/v0/tenants/tenant_intake_demo/case-commands", {
    type: "case.transition",
    tenant_id: "tenant_intake_demo",
    case_id: b.case_id,
    expected_case_version: 1,
    actor_identity_id: "identity_intake_operator",
    idempotency_key: "d12-denied-close",
    correlation_id: "d12_case_change",
    to_state: "resolved",
    reason: "Task preparation cannot close an unresolved dispute",
  });
  assert.equal(r.status, "rejected");
  assert.equal((await h.ok(path)).invocations[0].current_usable, false);
  await h.restart();
  assert.deepEqual(
    (await h.ok(path)).invocations[0].result,
    view.invocations[0].result,
  );
  const before = await h.snapshot(),
    entries = structuredClone(view.history);
  entries[0].recorded_at = "2026-09-07T16:07:00.000Z";
  rehash(entries[0]);
  const end = entries[1];
  end.recorded_at = "2026-09-07T16:07:00.000Z";
  end.started_entry_hash = entries[0].hash;
  end.previous_entry_hash = entries[0].hash;
  end.result.started_entry_hash = entries[0].hash;
  end.result_hash = sha256Json(end.result);
  end.id = `work_${sha256Json({ caseId: end.case_id, previous: entries[0].hash, fp: null, invocation: end.invocation_id }).slice(7)}`;
  end.parent_timing.computation_started_at = end.recorded_at;
  end.parent_timing.computation_completed_at = end.recorded_at;
  end.parent_timing.terminal_evaluated_at = end.recorded_at;
  rehash(end);
  await rewriteWork(h, entries);
  assert.deepEqual(business(await h.snapshot()), business(before));
  assert.equal((await h.call(path)).status, 500);
  assert.equal((await h.call(path + "&representation=export")).status, 500);
  assert.equal((await h.call("/readyz")).status, 503);
  await h.restart();
  assert.equal((await h.call(path)).status, 500);
});
test("D12 W9 unavailable retained input is a system failure, never evidence of absence", async (t) => {
  const { h, path } = await published(t),
    c = start(await h.ok(path)),
    before = await h.snapshot();
  h.fault({ tag: "work-load" });
  assert.equal((await h.call(POST, c)).status, 500);
  assert.deepEqual(await h.snapshot(), before);
});
test("D12 W2 ordering and unrelated retained bundles do not transfer claims or exceed the one input bundle limit", async (t) => {
  const input = await scopedDeliveries("order-worker", "different-deliveries");
  input.artifacts.reverse();
  const { h, path, view, d, packPath } = await completed(t, input);
  assert.deepEqual(
    view.invocations[0].result.evidence_checklist
      .filter((c) => c.subject.kind === "delivery")
      .map((c) => c.status),
    ["reported_confirmation", "reported_gap"],
  );
  await h.prepare(await variation("unrelated-retained", "none"));
  assert.equal((await h.ok(path)).current.can_start, false);
  await h.ok(
    d.post,
    discoveryCommand(await d.get(), "fresh-after-unrelated", "confirm"),
  );
  await h.ok(
    `${PACK}/selections/publication`,
    publication(await h.ok(packPath), "republish-after-unrelated"),
  );
  await h.ok(POST, start(await h.ok(path), "fresh-one-bundle"));
  assert.equal(
    (await h.ok(path)).invocations.at(-1).outcome,
    "prepared_gap_packet",
  );
});
test("D12 W9 oversized output is failed without retaining a partial packet", async (t) => {
  const { h, path } = await published(t);
  h.setWorkPort((input) => {
    const r = structuredClone(prepareDisposition(input));
    r.follow_up.draft = "x".repeat(262145);
    return { completion: Promise.resolve(r), cancel: () => {} };
  });
  await h.ok(POST, start(await h.ok(path)));
  const v = await h.ok(path);
  assert.equal(v.invocations[0].outcome, "failed");
  assert.equal(v.invocations[0].result, null);
  assert.ok(v.history.at(-1).diagnostics[0].length <= 1800);
});
test("D12 W5 clock rollback denies new commands but original successful key is read without another clock sample", async (t) => {
  const { h, path, command, receipt } = await completed(t),
    before = await h.snapshot();
  h.setTime("2026-09-07T16:04:59.000Z");
  const reads = h.clockReads;
  assert.deepEqual(await h.ok(POST, command), receipt);
  assert.equal(h.clockReads, reads);
  const v = await h.ok(path);
  assert.equal(v.current.can_start, false);
  assert.equal(
    (await h.call(POST, { ...command, idempotency_key: "clock-back" })).data
      .error,
    "CLOCK_REGRESSION",
  );
  assert.deepEqual(await h.snapshot(), before);
});

test("D12 W7 proof correction lineage cannot cross measures but overlap may", async (t) => {
  const { h, path } = await completed(t);
  const original = await h.ok(
    POST,
    noteCommand(await h.ok(path), "cash_collected"),
  );
  const before = await h.snapshot();
  for (const field of [
    "supersedes_entry_hash",
    "reversal_of_entry_hash",
    "reopens_entry_hash",
  ]) {
    const command = noteCommand(await h.ok(path), "credits_issued");
    command.idempotency_key = `cross-measure-${field}`;
    command.note[field] = original.entry.hash;
    const denied = await h.call(POST, command);
    assert.equal(
      denied.status,
      400,
      `${field}: ${JSON.stringify(denied.data)}`,
    );
    assert.equal(denied.data.error, "INVALID_INPUT");
  }
  assert.deepEqual(await h.snapshot(), before);
  const overlap = noteCommand(await h.ok(path), "credits_issued");
  overlap.note.overlap_entry_hashes = [original.entry.hash];
  const recorded = await h.ok(POST, overlap);
  const archive = await h.ok(path + "&representation=export");
  await h.restart();
  assert.deepEqual(await h.ok(POST, overlap), recorded);
  assert.deepEqual(await h.ok(path + "&representation=export"), archive);
  assert.equal(validateWorkExport(archive).entries.length, 4);
});

test("D12 W7 measured proof requires a canonical UTC source observation time", async (t) => {
  const { h, path } = await completed(t),
    before = await h.snapshot();
  for (const observedAt of [
    null,
    "2026-09-07T09:00:00-07:00",
    "2026-09-07T16:00:00Z",
  ]) {
    const command = noteCommand(await h.ok(path), "cash_collected", 100);
    command.note.source.kind = "cash_receipt";
    command.note.source.observed_at = observedAt;
    const denied = await h.call(POST, command);
    assert.equal(denied.status, 400, JSON.stringify(denied.data));
  }
  assert.deepEqual(await h.snapshot(), before);
  const command = noteCommand(await h.ok(path), "cash_collected", 100);
  command.note.source.kind = "cash_receipt";
  command.note.source.observed_at = "2026-09-07T16:00:00.000Z";
  const receipt = await h.ok(POST, command),
    archive = await h.ok(path + "&representation=export");
  await h.restart();
  assert.deepEqual(await h.ok(POST, command), receipt);
  assert.deepEqual(await h.ok(path + "&representation=export"), archive);
  assert.equal(validateWorkExport(archive).entries.length, 3);
});

test("D12 W9 bounded coverage includes duplicate physical source rows", async (t) => {
  const input = editQueue(
    await intakeInput("duplicate-coverage-worker"),
    (rows, headers) => ({
      rows: Array.from({ length: 201 }, () => ({ ...rows[0] })),
      headers,
    }),
  );
  const { h, path } = await published(t, input),
    before = await h.snapshot();
  const r = await h.call(POST, start(await h.ok(path)));
  assert.equal(r.data.error, "WORK_INPUT_LIMIT", JSON.stringify(r.data));
  assert.deepEqual(await h.snapshot(), before);
});
