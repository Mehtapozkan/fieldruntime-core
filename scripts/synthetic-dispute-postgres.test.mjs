import assert from "node:assert/strict";
import test from "node:test";
import { syntheticHost, AT } from "../tests/helpers/synthetic-dispute.mjs";
import {
  validateSyntheticDisputeExport,
  replaySyntheticDisputeExport,
} from "../dist/packages/runtime/src/index.js";
test("G1 enrolled 400-dollar lifecycle uses named D6 authority, independent observation and separate acceptance", async (t) => {
  const f = await syntheticHost(t);
  await f.authorized();
  assert.equal((await f.get()).current.accepted, false);
  await f.report();
  assert.equal((await f.get()).current.verified, false);
  await f.transition();
  await f.check();
  assert.equal((await f.get()).current.verified, true);
  assert.equal((await f.get()).current.accepted, false);
  await f.accept();
  const view = await f.get();
  assert.equal(view.subject.amount_minor, 40000);
  assert.equal(view.current.accepted, true);
  assert.equal(view.current.closure_permitted, false);
  const exported = await f.runtime.export();
  validateSyntheticDisputeExport(exported);
  assert.deepEqual(
    replaySyntheticDisputeExport(
      exported,
      f.receipt.case_id,
      f.receipt.record_key,
      AT,
    ),
    view,
  );
  await f.restart();
  assert.deepEqual(await f.get(), view);
  assert.deepEqual(await f.runtime.export(), exported);
});

import { Buffer } from "node:buffer";
import {
  createSyntheticDisputeRuntime,
  normalizeSyntheticDisputeProfile,
  sha256Json,
  canonicalJson,
} from "../dist/packages/runtime/src/index.js";
import {
  fixture,
  labInput,
  labProfile,
} from "../tests/helpers/synthetic-dispute.mjs";
const unchanged = async (f, fn) => {
  const before = await f.h.snapshot();
  await fn();
  assert.deepEqual(await f.h.snapshot(), before);
};

test("G2 unenrolled subject and stale or substituted profile/record heads are rejected without writes", async (t) => {
  const f = await syntheticHost(t);
  await unchanged(f, () =>
    assert.rejects(f.candidate(), (e) => e.code === "NOT_ENROLLED"),
  );
  await f.enroll();
  const c = await f.command("candidate");
  for (const binding of [
    { ...c.binding, case_id: "case_unenrolled" },
    { ...c.binding, record_key: "sha256:" + "e".repeat(64) },
    { ...c.binding, profile_hash: "sha256:" + "e".repeat(64) },
  ])
    await unchanged(f, () =>
      assert.rejects(
        f.runtime.submit({ ...c, binding }),
        (e) => e.code === "NOT_ENROLLED",
      ),
    );
  await f.submit(c);
  await unchanged(f, () =>
    assert.rejects(
      f.submit({ ...c, idempotency_key: "fresh-stale" }),
      (e) => e.code === "BINDING_CONFLICT",
    ),
  );
});

test("G3 wrong immutable identifiers, amount/currency and evidence bindings cannot enroll", async (t) => {
  const f = await syntheticHost(t);
  for (const [field, value] of [
    ["customer", "Another Customer"],
    ["invoice_id", "WRONG"],
    ["delivery_id", "WRONG"],
    ["order_id", "WRONG"],
    ["dispute_id", "WRONG"],
    ["amount_minor", 50000],
    ["currency", "EUR"],
  ]) {
    const p = structuredClone(f.profile);
    p.subject[field] = value;
    p.policy.rules[0].condition = {
      currency: p.subject.currency,
      minimum_amount_minor: p.subject.amount_minor,
      maximum_amount_minor: p.subject.amount_minor,
    };
    p.policy_content_hash = sha256Json(p.policy);
    const runtime = createSyntheticDisputeRuntime(f.options(p));
    await unchanged(f, () =>
      assert.rejects(runtime.read(), (e) => e.code === "SUBJECT_CONFLICT"),
    );
  }
  for (const mutate of [
    (p) => (p.evidence_refs[0].artifact_hash = "sha256:" + "f".repeat(64)),
    (p) => p.evidence_refs[0].locator.byte_end++,
    (p) => (p.evidence_refs[0].document_id = "unrelated"),
    (p) => (p.evidence_refs[0].bundle_hash = "sha256:" + "f".repeat(64)),
  ]) {
    const p = structuredClone(f.profile);
    mutate(p);
    const runtime = createSyntheticDisputeRuntime(f.options(p));
    await unchanged(f, () =>
      assert.rejects(
        runtime.read(),
        (e) => e.code === "EVIDENCE_BINDING_CONFLICT",
      ),
    );
  }
});

test("G4 ordinary commands cannot select profile/source/roles, enroll, supply observation or success", async (t) => {
  const f = await syntheticHost(t);
  const enroll = await f.command("enroll");
  await assert.rejects(
    f.runtime.submit(enroll),
    (e) => e.code === "HOST_ENROLLMENT_REQUIRED",
  );
  await f.enroll();
  const c = await f.command("candidate");
  for (const key of [
    "profile",
    "subject",
    "policy",
    "source",
    "source_path",
    "url",
    "credentials",
    "observation",
    "observation_bytes",
    "success",
    "verifier_identity",
    "roles",
    "source_mutation_handle",
  ]) {
    await unchanged(f, () =>
      assert.rejects(f.runtime.submit({ ...c, [key]: true })),
    );
  }
  assert.equal(f.reads, 0);
  assert.throws(
    () =>
      createSyntheticDisputeRuntime({
        ...f.options(),
        source: {
          profileId: f.profile.source.profile_id,
          read: async () => Buffer.from("{}"),
          write() {},
        },
      }),
    (e) => e.code === "SOURCE_PORT_REQUIRED",
  );
  assert.throws(
    () =>
      createSyntheticDisputeRuntime({
        ...f.options(),
        source: { profileId: "wrong", read: async () => Buffer.from("{}") },
      }),
    (e) => e.code === "SOURCE_PORT_REQUIRED",
  );
});

test("G5 exact named roles and separate decision/reporter/verifier/recipient are enforced", async (t) => {
  const f = await syntheticHost(t);
  for (const role of ["decision", "reporter", "verifier", "recipient"]) {
    const p = structuredClone(f.profile);
    p.roles[role] = p.roles.operator;
    assert.throws(
      () => normalizeSyntheticDisputeProfile(p),
      (e) => e.code === "ROLE_SEPARATION",
    );
  }
  await f.enroll();
  await f.candidate();
  const c = await f.command("basis_check", {
    candidate_hash: (await f.get()).candidate_hash,
  });
  f.setActor(f.profile.roles.reporter.identity_id);
  await unchanged(f, () =>
    assert.rejects(
      f.runtime.submit(c),
      (e) => e.code === "REVIEWER_INELIGIBLE",
    ),
  );
  assert.equal(f.reads, 0);
  await f.basis();
  await f.request();
  const v = await f.get();
  assert.equal(
    v.authority.request.prepared_by_identity.identity_id,
    f.profile.roles.operator.identity_id,
  );
  assert.equal(v.authority.current.authorized, false);
  await unchanged(f, () =>
    assert.rejects(f.noAction(), (e) => e.code === "AUTHORITY_DENIED"),
  );
});

for (const failure of ["unavailable", "malformed", "changing"]) {
  test(`G6 ${failure} source is inconclusive and cannot become accepted success`, async (t) => {
    const f = await syntheticHost(t);
    await f.authorized();
    await f.report();
    await f.transition();
    let count = 0;
    f.setReader(async () => {
      if (failure === "unavailable") throw new Error("unavailable");
      if (failure === "malformed") return Buffer.from('{"success":true}');
      const s = f.source;
      if (++count % 2 === 0) s.revision++;
      return Buffer.from(canonicalJson(s));
    });
    const r = await f.check();
    assert.equal(r.entry.data.comparison.status, "inconclusive");
    assert.equal(r.entry.data.outcome, null);
    await unchanged(f, () =>
      assert.rejects(f.accept(), (e) => e.code === "RESULT_REQUIRED"),
    );
    const v = await f.get();
    assert.equal(v.current.accepted, false);
    assert.equal(v.proof_measures.disputes_resolved, null);
    validateSyntheticDisputeExport(await f.runtime.export());
  });
}

test("G7 a report alone is neither source observation nor business acceptance", async (t) => {
  const f = await syntheticHost(t);
  await f.authorized();
  await f.report();
  const before = await f.get();
  assert.equal(before.current.status, "reported_not_verified");
  assert.equal(before.current.verified, false);
  assert.equal(before.current.accepted, false);
  const r = await f.check();
  assert.equal(r.entry.data.comparison.status, "mismatch");
  await unchanged(f, () =>
    assert.rejects(f.accept(), (e) => e.code === "RESULT_REQUIRED"),
  );
  await f.transition();
  await f.check();
  assert.equal((await f.get()).current.accepted, false);
  await f.accept();
  assert.equal((await f.get()).current.accepted, true);
});

test("G8 reliable later mismatch removes current success and supports explicit linked reopen", async (t) => {
  const f = await syntheticHost(t);
  await f.authorized();
  await f.report();
  await f.transition();
  await f.check();
  const acceptance = await f.accept();
  const source = f.source;
  source.revision++;
  source.ar = {
    ...source.ar,
    version: source.ar.version + 1,
    status: "reopened",
  };
  f.setSource(source);
  const check = await f.check(),
    view = await f.get();
  assert.equal(check.entry.data.comparison.status, "mismatch");
  assert.equal(view.current.accepted, false);
  assert.equal(view.proof_measures.disputes_resolved, 0);
  const r = await f.send("reopen", {
    candidate_hash: view.candidate_hash,
    acceptance_hash: acceptance.entry.hash,
    observation_hash: check.entry.hash,
    reason: "Recipient explicitly reopens after reliable independent mismatch",
  });
  assert.equal((await f.get()).current.status, "reopened");
  const exp = await f.runtime.export();
  validateSyntheticDisputeExport(exp);
  await f.restart();
  assert.deepEqual(await f.runtime.export(), exp);
  assert.deepEqual(await f.submit(f.commands.at(-1)), r);
});

test("G9 inconclusive later evidence cannot masquerade as a reliable reversal", async (t) => {
  const f = await syntheticHost(t);
  await f.authorized();
  await f.report();
  await f.transition();
  await f.check();
  const accepted = await f.accept();
  f.setReader(async () => {
    throw new Error("offline");
  });
  const check = await f.check(),
    v = await f.get();
  assert.equal(v.current.accepted, false);
  assert.equal(v.proof_measures.disputes_resolved, null);
  await unchanged(f, () =>
    assert.rejects(
      f.send("reopen", {
        candidate_hash: v.candidate_hash,
        acceptance_hash: accepted.entry.hash,
        observation_hash: check.entry.hash,
        reason: "Unproven reversal",
      }),
      (e) => e.code === "REOPEN_PROOF_REQUIRED",
    ),
  );
  assert.ok(
    (await f.get()).history.some((e) => e.hash === accepted.entry.hash),
  );
});

test("G10 every exact command retry returns original receipt after restart without new observations or writes", async (t) => {
  const f = await syntheticHost(t);
  await f.authorized();
  await f.report();
  await f.transition();
  await f.check();
  await f.accept();
  const commands = [...f.commands],
    receipts = [...f.receipts],
    before = await f.h.snapshot(),
    reads = f.reads;
  await f.restart();
  for (let i = 0; i < commands.length; i++)
    assert.deepEqual(await f.submit(commands[i]), receipts[i]);
  assert.equal(f.reads, reads);
  assert.deepEqual(await f.h.snapshot(), before);
  const c = { ...commands[1], binding: (await f.get()).binding };
  await unchanged(f, () =>
    assert.rejects(f.submit(c), (e) => e.code === "IDEMPOTENCY_CONFLICT"),
  );
});

test("G11 failed write rolls back and lost commit acknowledgement recovers the exact receipt", async (t) => {
  const f = await syntheticHost(t);
  await f.enroll();
  const c = await f.command("candidate");
  f.h.fault({ tag: "fr:result-insert" });
  await unchanged(f, () => assert.rejects(f.submit(c)));
  f.h.fault({ tag: "COMMIT", remaining: 2, after: true });
  await assert.rejects(f.submit(c));
  const r = await f.submit(c);
  assert.equal(
    (await f.get()).history.filter((e) => e.operation === "candidate").length,
    1,
  );
  await f.restart();
  assert.deepEqual(await f.submit(c), r);
});

test("G12 validated export rejects changed trusted profile/evidence/history even with a recomputed envelope hash", async (t) => {
  const f = await syntheticHost(t);
  await f.authorized();
  await f.report();
  await f.transition();
  await f.check();
  await f.accept();
  const original = await f.runtime.export();
  for (const change of [
    (v) => (v.entries[0].data.profile.subject.amount_minor = 39999),
    (v) =>
      (v.entries[0].data.profile.roles.verifier =
        v.entries[0].data.profile.roles.reporter),
    (v) => v.entries[0].data.profile.evidence_refs[0].locator.byte_end++,
    (v) => v.entries.pop(),
    (v) =>
      (v.entries.find(
        (e) => e.operation === "result_check",
      ).data.observation.read.source.ar.status = "open"),
  ]) {
    const v = structuredClone(original);
    change(v);
    const body = { ...v };
    delete body.hash;
    v.hash = sha256Json(body);
    assert.throws(() => validateSyntheticDisputeExport(v));
  }
});

test("G13 worker input exposes only released committed evidence, never source/verifier/acceptance truth", async (t) => {
  const f = await syntheticHost(t, { release: 1 }),
    early = await f.runtime.workerInput();
  assert.equal(early.evidence.length, 4);
  assert.doesNotMatch(
    canonicalJson(early),
    /14:43|15:27|CL-ARRIVAL-v1|deduction_withdrawn|identity_case_lab_verifier/,
  );
  await assert.rejects(
    f.runtime.read(),
    (e) => e.code === "EVIDENCE_BINDING_CONFLICT",
  );
  for (const release of [2, 3]) {
    const b = await f.h.prepare(await labInput(release));
    await f.h.ok("/v1/intake/commits", await f.h.selection(b, 0));
    const runtime = createSyntheticDisputeRuntime(
        f.options(
          labProfile(f.receipt.case_id, f.receipt.record_key, b.bundle),
        ),
      ),
      input = await runtime.workerInput();
    assert.equal(input.evidence.length, release === 2 ? 6 : 7);
    assert.doesNotMatch(
      canonicalJson(input),
      /deduction_withdrawn|identity_case_lab_verifier|acceptance|source_port/,
    );
    if (release === 2)
      assert.doesNotMatch(canonicalJson(input), /CL-ARRIVAL-v1|15:00:00/);
    else assert.match(canonicalJson(input), /2026-09-07T15:00:00/);
  }
  assert.equal(f.reads, 0);
});

test("G14 fixed fixture explicitly retains UTC arrival < deadline < unloading; no inferred or dynamic deadline", () => {
  assert.equal(
    fixture.invoice_minor - fixture.payment_minor,
    fixture.subject.amount_minor,
  );
  assert.equal(fixture.arrival, "2026-09-07T14:43:00.000Z");
  assert.equal(fixture.deadline, "2026-09-07T15:00:00.000Z");
  assert.equal(fixture.unloading_completed, "2026-09-07T15:27:00.000Z");
  assert.ok(
    fixture.arrival < fixture.deadline &&
      fixture.deadline < fixture.unloading_completed,
  );
  assert.equal(fixture.timezone, "UTC");
});

import { resultHost, COMMAND } from "../tests/helpers/dispute-result.mjs";
import { validateDisputeExport } from "../dist/packages/runtime/src/dispute-result.js";
test("G15 additive 0015 preserves actual v1 histories, checksums, export and original retry receipts", async (t) => {
  const f = await resultHost(t, { beforeSynthetic: true });
  await f.authorized();
  await f.reported();
  await f.transition();
  await f.check();
  await f.accept();
  const before = await f.h.snapshot(),
    oldExport = await f.h.ok(f.path + "&representation=export"),
    oldRead = await f.get(),
    migrations = (
      await f.h.pg.query(
        "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
      )
    ).rows;
  assert.equal(migrations.length, 14);
  validateDisputeExport(oldExport);
  await f.h.upgrade();
  await f.h.restart();
  assert.deepEqual(await f.h.snapshot(), before);
  assert.deepEqual(await f.get(), oldRead);
  assert.deepEqual(await f.h.ok(f.path + "&representation=export"), oldExport);
  validateDisputeExport(oldExport);
  const after = (
    await f.h.pg.query(
      "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
    )
  ).rows;
  assert.deepEqual(after.slice(0, 14), migrations);
  assert.equal(after[14].version, "0015_synthetic_dispute_profile");
  for (let i = 0; i < f.commands.length; i++)
    assert.deepEqual(await f.h.ok(COMMAND, f.commands[i]), f.receipts[i]);
  assert.deepEqual(await f.h.snapshot(), before);
});

test("G16 accepted synthetic result never authorizes canonical Case closure", async (t) => {
  const f = await syntheticHost(t);
  await f.authorized();
  await f.report();
  await f.transition();
  await f.check();
  await f.accept();
  const v = await f.get();
  f.h.setTime("2026-09-07T16:07:00.000Z");
  f.setTime("2026-09-07T16:07:00.000Z");
  const r = await f.h.ok("/v0/tenants/tenant_intake_demo/case-commands", {
    type: "case.transition",
    tenant_id: "tenant_intake_demo",
    case_id: f.receipt.case_id,
    expected_case_version: v.binding.case_version,
    actor_identity_id: "identity_intake_operator",
    idempotency_key: "generic-closure-denied",
    correlation_id: "generic-closure-denied",
    to_state: "resolved",
    reason: "Synthetic result is not complete Case proof",
  });
  assert.equal(r.status, "rejected");
  assert.equal((await f.get()).current.closure_permitted, false);
  const aggregate = await f.h.store.getCase(
    "tenant_intake_demo",
    f.receipt.case_id,
  );
  assert.notEqual(aggregate.document.case.state, "resolved");
});

test("G17 configured profile cannot replace an enrollment and competing commands cannot silently rebase", async (t) => {
  const f = await syntheticHost(t);
  await f.enroll();
  const p = structuredClone(f.profile);
  p.profile_version = "changed";
  const runtime = createSyntheticDisputeRuntime(f.options(p));
  await assert.rejects(
    runtime.read(),
    (e) => e.code === "PROFILE_CONFLICT" || e.code === "STORE_INTEGRITY",
  );
  const a = await f.command("candidate"),
    b = { ...a, idempotency_key: "concurrent-other" };
  const results = await Promise.allSettled([f.submit(a), f.submit(b)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.find((r) => r.status === "rejected").reason.code,
    "BINDING_CONFLICT",
  );
  assert.equal(
    (await f.get()).history.filter((e) => e.operation === "candidate").length,
    1,
  );
});

import {
  executeAuthorityCommand,
  emptyCaseEngine,
} from "../dist/packages/runtime/src/index.js";
test("G18 ordinary public D6 command path cannot inject v2 result authority material", async (t) => {
  const f = await syntheticHost(t);
  await f.enroll();
  await f.candidate();
  await f.basis();
  await f.request();
  const exported = await f.runtime.export();
  const command = exported.authority.entries.find(
    (e) => e.schema_version === "authority-request-journal-entry.dispute.v2",
  ).command;
  assert.throws(
    () =>
      executeAuthorityCommand(
        { entries: [], snapshots: [] },
        emptyCaseEngine(),
        {},
        command,
        "operator",
        { now: () => new Date(AT), nextId: () => "unused" },
      ),
    (e) => e.code === "REVIEW_INPUT_INVALID",
  );
});

test("G19 v1 and v2 coexist in the same existing journals; v1 receipts and independent role bindings survive", async (t) => {
  const old = await resultHost(t);
  await old.authorized();
  await old.reported();
  await old.transition();
  await old.check();
  await old.accept();
  const oldCommands = [...old.commands],
    oldReceipts = [...old.receipts],
    oldRows = (await old.h.snapshot()).dispute_result_journal;
  const f = await syntheticHost(t, {
    host: old.h,
    at: "2026-09-07T16:08:00.000Z",
  });
  const worker = await f.runtime.workerInput();
  assert.equal(worker.evidence.length, 7);
  assert.equal(f.reads, 0);
  assert.doesNotMatch(
    JSON.stringify(worker),
    /deduction_withdrawn|verifier|acceptance/,
  );
  await f.authorized();
  await f.report();
  await f.transition();
  await f.check();
  await f.accept();
  const exported = await f.runtime.export();
  validateSyntheticDisputeExport(exported);
  assert.equal(exported.result_heads.length, 2);
  assert.equal(
    exported.entries.filter(
      (e) => e.schema_version === "dispute-result-entry.v1",
    ).length,
    oldRows.length,
  );
  assert.equal(
    (await f.get()).authority.request.prepared_by_identity.identity_id,
    f.profile.roles.operator.identity_id,
  );
  await f.restart();
  assert.deepEqual(await f.runtime.export(), exported);
  for (let i = 0; i < oldCommands.length; i++)
    assert.deepEqual(await old.h.ok(COMMAND, oldCommands[i]), oldReceipts[i]);
  const retained = (await f.h.snapshot()).dispute_result_journal.filter(
    (x) => x.row.case_id === old.first.case_id,
  );
  assert.deepEqual(retained, oldRows);
});

test("G20 wrong source subject, amount, currency or port attribution never proves a result", async (t) => {
  const f = await syntheticHost(t);
  await f.authorized();
  await f.report();
  await f.transition();
  const source = f.source;
  for (const change of [
    (s) => (s.ar.subject.dispute_id = "not-enrolled"),
    (s) => (s.ar.subject.amount_minor = 50000),
    (s) => (s.ar.subject.currency = "EUR"),
    (s) => (s.profile_id = "different_source_port"),
  ]) {
    const altered = structuredClone(source);
    change(altered);
    f.setSource(altered);
    const r = await f.check();
    assert.equal(r.entry.data.comparison.status, "inconclusive");
    await assert.rejects(f.accept(), (e) => e.code === "RESULT_REQUIRED");
  }
});
