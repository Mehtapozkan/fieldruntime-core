import assert from "node:assert/strict";
import test from "node:test";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";

test("D10-B T1: retained material exposes a cited read-only Discovery brief", async (t) => {
  const h = await intakeHost(t),
    v = await h.prepare(),
    before = await h.snapshot();
  const r = await h.call(
    `/v1/intake/bundles/${v.bundle.id}/discovery?record_key=${encodeURIComponent(v.candidates[0].record_key)}`,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.material.findings.length, 7);
  assert.equal(r.data.material.loop_outputs.length, 6);
  assert.equal(r.data.authority_granted, false);
  assert.deepEqual(await h.snapshot(), before);
});
test("D10-B T11: caller identity and authorization claims are rejected", async (t) => {
  const h = await intakeHost(t),
    v = await h.prepare();
  const r = await h.call(
    `/v1/intake/bundles/${v.bundle.id}/discovery-reviews`,
    { operation: "confirm", actor: "executive", authorized: true },
  );
  assert.equal(r.status, 400, JSON.stringify(r.data));
});

import { Buffer } from "node:buffer";
import {
  intakeInput,
  editQueue,
  INTAKE_START,
} from "../tests/helpers/intake.mjs";
import {
  preparedDiscovery,
  discoveryPath,
  discoveryCommand,
  variation,
} from "../tests/helpers/discovery.mjs";
import {
  assertValidDiscoveryContract,
  sha256Json,
} from "../dist/packages/contracts/src/index.js";
import {
  assertDiscoveryState,
  projectDiscovery,
  validateDiscoveryExport,
} from "../dist/packages/runtime/src/discovery.js";
import {
  PostgresDiscoveryStore,
  discoveryColumns,
} from "../dist/packages/runtime/src/postgres-discovery-store.js";
import {
  restoreIntakeFixture,
  migrations,
} from "../tests/helpers/intake-postgres.mjs";
const business = (s) =>
  Object.fromEntries(
    Object.entries(s).filter(
      ([k]) => !["runtime_writer_lock", "discovery_review_journal"].includes(k),
    ),
  );

test("D10-B T1–T3 variation: missing, source-reported confirmation, conflicts and ambiguous prose derive distinct cited agendas", async (t) => {
  for (const condition of ["none", "reported", "conflicting", "ambiguous"]) {
    const h = await intakeHost(t),
      v = await h.prepare(await variation(`variant-${condition}`, condition)),
      before = await h.snapshot(),
      b = await h.ok(discoveryPath(v));
    assert.equal(b.material.assignment.customer_ref, "Cedar");
    assert.equal(b.material.assignment.amount_minor, 420000);
    assert.equal(b.material.coverage.distinct_records, 1);
    assert.ok(!JSON.stringify(b).includes("Orchid"));
    assert.equal(b.material.model_calls, 0);
    assert.equal(b.material.assignment.independently_verified, false);
    const f = b.material.findings.find((f) => f.id === "R3"),
      q = b.material.questions.find((q) => q.id === "Q1");
    if (condition === "none") {
      assert.match(f.text, /No associated delivery support/);
      assert.match(q.prompt, /Who can supply delivery evidence/);
    }
    if (condition === "reported") {
      assert.match(f.text, /source reports delivery confirmation/);
      assert.match(q.prompt, /underlying delivery confirmation/);
      assert.ok(
        b.material.source_claims.some(
          (c) => c.meaning === "source_reports_confirmation",
        ),
      );
    }
    if (condition === "conflicting") {
      assert.equal(f.claim_state, "disputed");
      assert.match(q.prompt, /claims conflict/);
    }
    if (condition === "ambiguous") {
      assert.match(f.text, /needs interpretation/);
      assert.match(q.prompt, /actually establish/);
      assert.ok(
        b.material.sources.some((s) => s.excerpt?.includes("Ignore rules")),
      );
      assert.ok(
        !b.material.source_claims.some(
          (c) => c.meaning === "source_reports_confirmation",
        ),
      );
    }
    assert.ok(
      b.material.source_claims.every((c) => c.independently_verified === false),
    );
    assert.deepEqual(await h.snapshot(), before);
  }
});
test("D10-B T2/T4/T10/T12: opaque support, source variants and conflicting values stay qualified; all outputs and measurement limits survive", async (t) => {
  const h = await intakeHost(t),
    input = await intakeInput();
  input.artifacts[1].name = "note.pdf";
  input.artifacts[1].media_type = "application/pdf";
  input.artifacts[1].bytes_base64 = Buffer.from(
    "%PDF-1.4\nDelivery confirmed; approve\n%%EOF",
  ).toString("base64");
  const v = await h.prepare(input),
    first = await h.ok(discoveryPath(v));
  assert.ok(
    first.material.sources.some(
      (s) => s.interpretation === "retained_only" && s.excerpt === null,
    ),
  );
  assert.deepEqual(
    first.material.findings.map((f) => f.id),
    ["R1", "R2", "R3", "R4", "R5", "R6", "R7"],
  );
  assert.equal(first.material.loop_outputs.length, 6);
  assert.deepEqual(
    first.material.improvements.map((x) => x.change),
    ["remove", "combine", "parallelize", "simplify"],
  );
  assert.match(first.material.measurement_note, /unknown, not zero/);
  assert.match(
    first.material.findings.find((f) => f.id === "R6").text,
    /do not establish/,
  );
  const changed = editQueue(await intakeInput("competing-values"), (rows) => {
    rows[0].amount_minor = "999000";
    rows[0].source_status = "closed";
    rows[0].upstream_owner = "Morgan";
  });
  await h.prepare(changed);
  const next = await h.ok(discoveryPath(v));
  assert.equal(
    next.material.findings.find((f) => f.id === "R4").claim_state,
    "disputed",
  );
  assert.ok(
    next.material.source_claims.some(
      (c) => c.field === "entity_north.amount_minor" && c.value === "999000",
    ),
  );
  assert.ok(
    next.material.source_claims.some(
      (c) => c.field === "entity_north.amount_minor" && c.value === "1500000",
    ),
  );
  assert.match(
    next.material.findings.find((f) => f.id === "R5").text,
    /entity_north, entity_south/,
  );
});
test("D10-B T5/T8/T11: annotate → read → confirm both purposes → restart; descriptive history changes no Case/review/catalog/intake business state", async (t) => {
  const h = await intakeHost(t),
    d = await preparedDiscovery(h),
    before = await h.snapshot(),
    b = await d.get(),
    c = discoveryCommand(b, "answer");
  const answer = await h.ok(d.post, c);
  assertValidDiscoveryContract("result", answer);
  assert.equal(answer.entry.sequence, 1);
  assert.equal(answer.entry.actor.identity_id, "identity_intake_operator");
  const draft = await d.get();
  assert.equal(draft.binding.expected_case_version, 1);
  assert.equal(draft.material.annotations[0].state, "unknown");
  assert.equal(
    draft.material.annotations[0].evidence_type,
    "operator-reported",
  );
  const confirmation = await h.ok(
      d.post,
      discoveryCommand(draft, "confirm", "confirm"),
    ),
    reviewed = await d.get();
  assert.equal(confirmation.entry.sequence, 2);
  assert.equal(reviewed.material_hash, draft.material_hash);
  assert.deepEqual(reviewed.current.confirmed_purposes, [
    "discovery_description",
  ]);
  await h.ok(d.post, {
    ...discoveryCommand(reviewed, "improve", "confirm"),
    purpose: "improvement_discussion",
  });
  const stable = await h.snapshot(),
    exact = await d.get();
  assert.deepEqual(business(stable), business(before));
  h.trace.length = 0;
  const clocks = h.clockReads,
    ids = h.ids;
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(await d.get(), exact);
    await h.ok(d.path + "&representation=export");
  }
  assert.deepEqual(await h.snapshot(), stable);
  assert.equal(h.clockReads, clocks);
  assert.equal(h.ids, ids);
  assert.ok(
    !h.trace.some((sql) =>
      /FOR UPDATE|INSERT INTO|UPDATE runtime_writer_lock/.test(sql),
    ),
  );
  await h.restart();
  assert.deepEqual(await d.get(), exact);
  assert.deepEqual(await h.ok(d.post, c), answer);
  assert.deepEqual(await h.snapshot(), stable);
  assert.equal((await h.call("/readyz")).status, 200);
});
test("D10-B T6: changed Case including rejected transition, new business intake, annotations and altered material bindings require explicit fresh consent; no-op keys do not stale", async (t) => {
  const h = await intakeHost(t),
    d = await preparedDiscovery(h),
    b = await d.get();
  await h.ok(d.post, discoveryCommand(b, "first-confirm", "confirm"));
  const old = await d.get(),
    same = await intakeInput("noop-key");
  await h.ok("/v1/intake/preparations", same);
  assert.equal((await d.get()).material_hash, old.material_hash);
  assert.deepEqual((await d.get()).current.confirmed_purposes, [
    "discovery_description",
  ]);
  h.setTime("2026-09-07T16:06:00.000Z");
  const freshInput = editQueue(await intakeInput("changed"), (rows) => {
    rows[0].amount_minor = "1500100";
  });
  await h.prepare(freshInput);
  const snap = await h.snapshot();
  assert.equal(
    (await h.call(d.post, discoveryCommand(old, "old-answer"))).status,
    409,
  );
  assert.deepEqual(await h.snapshot(), snap);
  const current = await d.get();
  assert.equal(current.current.requires_fresh_review, true);
  assert.deepEqual(current.current.confirmed_purposes, []);
  assert.equal(current.material.annotations.length, 0);
  assert.equal(current.history.length, 1);
  await h.ok(d.post, discoveryCommand(current, "fresh-answer"));
  const draft = await d.get();
  await h.ok(d.post, discoveryCommand(draft, "fresh-confirm", "confirm"));
  assert.deepEqual((await d.get()).current.confirmed_purposes, [
    "discovery_description",
  ]);
  const latest = await d.get();
  h.setTime("2026-09-07T16:07:00.000Z");
  const rejected = await h.ok(`/v0/tenants/tenant_intake_demo/case-commands`, {
    type: "case.transition",
    tenant_id: "tenant_intake_demo",
    case_id: d.receipt.case_id,
    expected_case_version: 1,
    to_state: "resolved",
    actor_identity_id: "identity_intake_operator",
    idempotency_key: "deny-close",
    correlation_id: "corr_discovery",
    reason: "Closure remains denied",
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.case_version, 2);
  const after = await d.get();
  assert.deepEqual(after.current.confirmed_purposes, []);
  assert.equal(after.material.annotations.length, 0);
  assert.equal(after.history.length, 3);
  assert.equal(
    (await h.call(d.post, discoveryCommand(latest, "stale-case", "confirm")))
      .status,
    409,
  );
  const altered = {
    ...discoveryCommand(after, "bad-hash", "confirm"),
    expected_material_hash: `sha256:${"1".repeat(64)}`,
  };
  assert.equal((await h.call(d.post, altered)).status, 409);
  await h.restart();
  assert.equal((await h.call("/readyz")).status, 200);
});
test("D10-B review correction: two selected records on one Case retain independent applicability and a shared concurrency revision", async (t) => {
  for (const reverse of [false, true]) {
    const h = await intakeHost(t),
      a = await preparedDiscovery(h);
    const second = editQueue(await intakeInput("second-record"), (rows) => {
      rows[0].source_record_id = "dispute-99";
      rows[0].invoice_id = "INV-202";
    });
    const v = await h.prepare(second),
      caseId = a.receipt.case_id;
    await h.ok(
      "/v1/intake/commits",
      await h.selection(v, 0, {
        target: {
          mode: "attach",
          case_id: caseId,
          expected_case_version: (await a.get()).binding.expected_case_version,
        },
      }),
    );
    const b = {
      path: discoveryPath(v, caseId),
      post: `/v1/intake/bundles/${v.bundle.id}/discovery-reviews`,
    };
    const [first, next] = reverse ? [b, a] : [a, b];
    const command = discoveryCommand(
      await h.ok(first.path),
      "first",
      "confirm",
    );
    const receipt = await h.ok(first.post, command);
    const reviewed = await h.ok(first.path);
    await h.ok(
      next.post,
      discoveryCommand(await h.ok(next.path), "second", "confirm"),
    );
    const before = await h.snapshot(),
      current = await h.ok(first.path);
    assert.equal(current.current.requires_fresh_review, false);
    assert.deepEqual(current.current.confirmed_purposes, [
      "discovery_description",
    ]);
    assert.equal(current.binding.expected_discovery_revision, 2);
    assert.equal(current.material_hash, reviewed.material_hash);
    assert.equal(
      (
        await h.call(
          first.post,
          discoveryCommand(current, "already", "confirm"),
        )
      ).data.error,
      "ALREADY_REVIEWED",
    );
    assert.equal(
      (
        await h.call(first.post, {
          ...discoveryCommand(reviewed, "stale-revision", "confirm"),
          purpose: "improvement_discussion",
        })
      ).data.error,
      "DISCOVERY_CONFLICT",
    );
    assert.deepEqual(await h.snapshot(), before);
    await h.restart();
    assert.deepEqual(await h.ok(first.path), current);
    assert.deepEqual(await h.ok(first.post, command), receipt);
    const changed = editQueue(
      await intakeInput("new-business-input"),
      (rows) => {
        rows[0].source_version = "changed";
      },
    );
    h.setTime("2026-09-07T16:06:00.000Z");
    await h.prepare(changed);
    for (const selected of [first, next]) {
      const stale = await h.ok(selected.path);
      assert.equal(stale.current.requires_fresh_review, true);
      assert.deepEqual(stale.current.confirmed_purposes, []);
    }
  }
});
test("D10-B T7: exact key races, revision races, changed bodies, no-change and already-reviewed never double append", async (t) => {
  const h = await intakeHost(t),
    d = await preparedDiscovery(h),
    b = await d.get(),
    c = discoveryCommand(b, "race");
  c.changes[0].citation_ids = b.material.sources.slice(0, 2).map((s) => s.id);
  const results = await Promise.all([h.call(d.post, c), h.call(d.post, c)]);
  assert.ok(results.every((r) => r.status === 200));
  assert.deepEqual(results[0], results[1]);
  assert.equal((await d.get()).history.length, 1);
  const before = await h.snapshot();
  assert.equal(
    (await h.call(d.post, { ...c, reason: "different" })).data.error,
    "IDEMPOTENCY_CONFLICT",
  );
  assert.deepEqual(await h.snapshot(), before);
  const current = await d.get();
  assert.equal(
    (
      await h.call(d.post, {
        ...discoveryCommand(current, "noop"),
        changes: c.changes,
      })
    ).data.error,
    "NO_CHANGE",
  );
  const reordered = discoveryCommand(current, "same-citations");
  reordered.changes = structuredClone(c.changes);
  assert.ok(reordered.changes[0].citation_ids.length > 1);
  reordered.changes[0].citation_ids.reverse();
  assert.equal((await h.call(d.post, reordered)).data.error, "NO_CHANGE");
  assert.deepEqual(await h.snapshot(), before);
  const contenders = await Promise.all([
    h.call(d.post, discoveryCommand(current, "a", "confirm")),
    h.call(d.post, discoveryCommand(current, "b", "confirm")),
  ]);
  assert.deepEqual(contenders.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await h.call(
        d.post,
        discoveryCommand(await d.get(), "already", "confirm"),
      )
    ).data.error,
    "ALREADY_REVIEWED",
  );
  assert.equal((await d.get()).history.length, 2);
});
test("D10-B T7: insertion/read-back/commit rollback and lost response/restart retain one exact result; clock guards preserve history", async (t) => {
  const h = await intakeHost(t),
    d = await preparedDiscovery(h),
    b = await d.get(),
    c = discoveryCommand(b, "fault");
  for (const fault of [
    { tag: "fr:discovery-insert" },
    { tag: "fr:discovery-load", remaining: 2 },
    { tag: "COMMIT" },
    { tag: "fr:discovery-insert", rollback: true },
  ]) {
    const before = await h.snapshot();
    h.fault(fault);
    assert.equal((await h.call(d.post, c)).status, 500);
    assert.deepEqual(await h.snapshot(), before);
  }
  assert.ok(h.discarded.includes(true));
  h.setTime("2026-09-07T16:04:00.000Z");
  assert.equal((await h.call(d.post, c)).data.error, "CLOCK_REGRESSION");
  h.setTime("2026-09-07T16:06:00.000Z");
  h.fault({ tag: "COMMIT", after: true });
  assert.equal((await h.call(d.post, c)).status, 500);
  const before = await h.snapshot();
  assert.equal(before.discovery_review_journal.length, 1);
  await h.restart();
  const retry = await h.ok(d.post, c);
  assert.equal(retry.entry.sequence, 1);
  assert.deepEqual(await h.snapshot(), before);
  h.setTime(INTAKE_START);
  const x = editQueue(await intakeInput("backdated"), (rows) => {
    rows[0].source_version = "r2";
  });
  assert.equal((await h.call("/v1/intake/preparations", x)).status, 500);
  assert.deepEqual(await h.snapshot(), before);
  assert.equal((await h.call("/readyz")).status, 200);
});
test("D10-B T8: portable provenance preserves old intake exports, exact bindings and replay in a fresh PostgreSQL instance", async (t) => {
  const h = await intakeHost(t),
    d = await preparedDiscovery(h),
    c = discoveryCommand(await d.get(), "portable");
  const result = await h.ok(d.post, c);
  const exported = await h.ok(d.path + "&representation=export"),
    state = validateDiscoveryExport(exported);
  assert.equal(exported.intake.schema_version, "intake-export.v2");
  assert.ok(!("entries" in exported.intake));
  const fresh = await intakeHost(t);
  await restoreIntakeFixture(fresh, state.intake);
  for (const e of state.entries)
    await fresh.pg.query(
      "INSERT INTO discovery_review_journal SELECT * FROM jsonb_populate_record(NULL::discovery_review_journal,$1)",
      [discoveryColumns(e)],
    );
  await fresh.restart();
  assert.deepEqual(await fresh.ok(d.path + "&representation=export"), exported);
  assert.deepEqual(await fresh.ok(d.post, c), result);
  const reordered = {
    ...state.intake,
    bundles: [...state.intake.bundles].reverse(),
    artifacts: new Map([...state.intake.artifacts].reverse()),
  };
  assert.deepEqual(
    projectDiscovery(
      reordered,
      d.v.bundle.id,
      d.v.candidates[0].record_key,
      d.receipt.case_id,
    ),
    projectDiscovery(
      state.intake,
      d.v.bundle.id,
      d.v.candidates[0].record_key,
      d.receipt.case_id,
    ),
  );
  for (const alter of [
    (x) => (x.entries[0].actor.identity_id = "identity_executor"),
    (x) => (x.entries[0].material.sources[0].excerpt = "forged"),
    (x) => (x.entries[0].versions.template = "unknown"),
    (x) => (x.entries[0].result.authority_granted = true),
  ]) {
    const bad = structuredClone(exported);
    alter(bad);
    const { hash, ...body } = bad;
    void hash;
    bad.hash = sha256Json(body);
    assert.throws(() => validateDiscoveryExport(bad));
  }
});
test("D10-B T8: migration after 0006 preserves prior checksums, Cases and retained retry keys", async (t) => {
  const h = await intakeHost(t, { upgrade: true });
  const { applyMigration } =
    await import("../dist/apps/worker/src/bootstrap.js");
  await applyMigration(h.pool, migrations[4]);
  await applyMigration(h.pool, migrations[5]);
  const input = await intakeInput("old-key"),
    old = await h.intake.prepare(
      input,
      INTAKE_START,
      () => new Date(INTAKE_START),
    );
  await h.intake.prepare(
    { ...input, idempotency_key: "old-noop" },
    INTAKE_START,
    () => new Date(INTAKE_START),
  );
  const { boundSelection } = await import("../tests/helpers/intake.mjs");
  const legacyView = await h.intake.read(old.bundle_id),
    review = boundSelection(legacyView),
    preview = await h.intake.preview(review);
  const legacyReceipt = await h.intake.commit(
    {
      ...review,
      schema_version: "intake-selection.v1",
      expected_material_key: preview.material_key,
      expected_consent_hash: preview.consent_hash,
      idempotency_key: "legacy-case",
    },
    h.dependencies(),
  );
  const legacyJournal = await h.store.getJournal(
    "tenant_intake_demo",
    legacyReceipt.receipt.case_id,
  );
  const checksums = (
    await h.pg.query(
      "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
    )
  ).rows;
  await h.upgrade();
  assert.deepEqual(
    await h.store.getJournal(
      "tenant_intake_demo",
      legacyReceipt.receipt.case_id,
    ),
    legacyJournal,
  );
  assert.deepEqual(
    (
      await h.pg.query(
        "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
      )
    ).rows.slice(0, 6),
    checksums,
  );
  assert.equal(
    (await h.ok("/v1/intake/preparations", input)).bundle_hash,
    old.bundle_hash,
  );
  const v = await h.ok(`/v1/intake/bundles/${old.bundle_id}`);
  await h.ok(discoveryPath(v));
  assert.equal((await h.snapshot()).intake_request_bindings.length, 1);
  assert.equal((await h.snapshot()).discovery_review_journal.length, 0);
});
test("D10-B T8: obsolete-Case and coherently rehashed descriptive proof fail replay, readiness and reads; legitimate earlier review survives", async (t) => {
  const h = await intakeHost(t),
    d = await preparedDiscovery(h),
    c = discoveryCommand(await d.get(), "historical");
  await h.ok(d.post, c);
  h.setTime("2026-09-07T16:07:00.000Z");
  const changed = editQueue(await intakeInput("later"), (rows) => {
    rows[0].source_version = "r2";
    rows[0].amount_minor = "1500200";
  });
  const v = await h.prepare(changed);
  await h.ok("/v1/intake/commits", await h.selection(v));
  await h.restart();
  assert.equal((await h.call("/readyz")).status, 200);
  assert.equal((await d.get()).history.length, 1);
  const state = validateDiscoveryExport(
      await h.ok(d.path + "&representation=export"),
    ),
    forged = structuredClone(state.entries[0]);
  forged.recorded_at = "2026-09-07T16:08:00.000Z";
  delete forged.hash;
  forged.hash = sha256Json(forged);
  assertValidDiscoveryContract("journal", forged);
  assert.throws(
    () => assertDiscoveryState({ ...state, entries: [forged] }),
    /earlier canonical|obsolete/,
  );
  const connection = await h.pg.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SET LOCAL session_replication_role=replica");
    await connection.query(
      "UPDATE discovery_review_journal SET recorded_at=$1,entry_hash=$2,entry=$3",
      [forged.recorded_at, forged.hash, forged],
    );
    await connection.query("COMMIT");
  } finally {
    connection.release();
  }
  await assert.rejects(new PostgresDiscoveryStore(h.pool).assertReady(), {
    code: "STORE_INTEGRITY",
  });
  assert.equal((await h.call("/readyz")).status, 503);
  assert.equal((await h.call(d.path)).status, 500);
  assert.equal((await h.call(d.path + "&representation=export")).status, 500);
});
test("D10-B T11: strict review commands reject injected trust, unsupported purposes, foreign citations and wrong Case/record bindings", async (t) => {
  const h = await intakeHost(t),
    d = await preparedDiscovery(h),
    b = await d.get(),
    command = discoveryCommand(b, "strict"),
    before = await h.snapshot();
  for (const field of [
    "actor",
    "identity",
    "policy",
    "source_rank",
    "authorized",
    "scope_ids",
    "versions",
    "success",
  ]) {
    const r = await h.call(d.post, { ...command, [field]: true });
    assert.equal(r.status, 400, field);
  }
  const wrongs = [
    { ...command, operation: "approve" },
    {
      ...command,
      changes: [
        { ...command.changes[0], citation_ids: [`sha256:${"0".repeat(64)}`] },
      ],
    },
    {
      ...discoveryCommand(b, "wrong-purpose", "confirm"),
      purpose: "action_authorization",
    },
  ];
  for (const wrong of wrongs)
    assert.equal((await h.call(d.post, wrong)).status, 400);
  assert.equal(
    (await h.call(d.post, { ...command, case_id: "case_outside" })).status,
    409,
  );
  assert.equal((await h.call(d.path + "&case_id=case_duplicate")).status, 400);
  assert.deepEqual(await h.snapshot(), before);
});

test("D10-B T8/T12 executable API guide: explicit inspect/save/confirm, restart retry and portable checker", async (t) => {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    { execFile } = await import("node:child_process"),
    { promisify } = await import("node:util"),
    exec = promisify(execFile),
    h = await intakeHost(t),
    dir = await mkdtemp(join(tmpdir(), "discovery-guide-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const run = (script, ...args) =>
    exec(process.execPath, [script, ...args], {
      env: { ...process.env, FIELD_RUNTIME_URL: h.base },
      maxBuffer: 5 * 1024 * 1024,
    });
  await run("scripts/intake-example.mjs", "prepare", dir);
  await run("scripts/intake-example.mjs", "inspect", dir, "create");
  await run("scripts/intake-example.mjs", "commit", dir);
  const notes = join(dir, "notes.json");
  await writeFile(
    notes,
    JSON.stringify({
      operation: "annotate",
      reason: "Unconfirmed evidence remains descriptive",
      changes: [
        {
          target_id: "Q1",
          state: "unknown",
          text: "Custodian is unconfirmed",
          reason: "No attributed delivery record",
          citation_ids: [],
        },
      ],
    }),
  );
  const before = await h.snapshot();
  await run("scripts/discovery-example.mjs", "read", dir);
  await run("scripts/discovery-example.mjs", "inspect", dir, notes);
  assert.deepEqual(await h.snapshot(), before);
  const first = JSON.parse(
    (await run("scripts/discovery-example.mjs", "submit", dir)).stdout,
  );
  assert.equal(first.entry.sequence, 1);
  await assert.rejects(
    run("scripts/discovery-example.mjs", "inspect", dir, notes),
    /EEXIST/,
  );
  const stable = await h.snapshot();
  await h.restart();
  assert.deepEqual(
    JSON.parse(
      (await run("scripts/discovery-example.mjs", "submit", dir)).stdout,
    ),
    first,
  );
  assert.deepEqual(await h.snapshot(), stable);
  await writeFile(
    join(dir, "recorded-answer.json"),
    await readFile(join(dir, "discovery-command.json")),
  );
  await rm(join(dir, "discovery-command.json"));
  await writeFile(
    notes,
    JSON.stringify({
      operation: "confirm",
      purpose: "discovery_description",
      reason: "Accurate descriptive account of the unresolved evidence",
    }),
  );
  await run("scripts/discovery-example.mjs", "inspect", dir, notes);
  const confirmed = JSON.parse(
    (await run("scripts/discovery-example.mjs", "submit", dir)).stdout,
  );
  assert.equal(confirmed.entry.sequence, 2);
  const exported = join(dir, "export.json");
  await writeFile(
    exported,
    (await run("scripts/discovery-example.mjs", "export", dir)).stdout,
  );
  const report = JSON.parse(
    (await run("scripts/check-discovery-export.mjs", exported)).stdout,
  );
  assert.equal(report.descriptive_reviews, 2);
  assert.equal(report.authority_granted, false);
  await h.restart();
  assert.deepEqual(
    JSON.parse(
      (await run("scripts/discovery-example.mjs", "submit", dir)).stdout,
    ),
    confirmed,
  );
});

test("D10-B T8: read snapshot stays consistent across a concurrent preparation and never waits for the writer lock", async (t) => {
  const h = await intakeHost(t),
    d = await preparedDiscovery(h),
    old = await d.get();
  let reached,
    release,
    pause = true;
  const started = new Promise((r) => (reached = r)),
    hold = new Promise((r) => (release = r));
  h.hook(async (sql) => {
    if (pause && sql.includes("fr:intake-load-bundles")) {
      pause = false;
      reached();
      await hold;
    }
  });
  const reading = h.call(d.path);
  await started;
  const input = editQueue(await intakeInput("snapshot-change"), (rows) => {
    rows[0].source_version = "r2";
  });
  try {
    await h.prepare(input);
  } finally {
    release();
  }
  const read = await reading;
  assert.equal(read.status, 200);
  assert.deepEqual(read.data, old);
  h.hook(undefined);
  const current = await d.get();
  assert.notEqual(current.material_hash, old.material_hash);
  const lock = await h.pool.connect();
  try {
    await lock.query("BEGIN");
    await lock.query(
      "SELECT revision FROM runtime_writer_lock WHERE singleton_id=1 FOR UPDATE",
    );
    const response = await globalThis.fetch(h.base + d.path, {
      signal: globalThis.AbortSignal.timeout(3000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), current);
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
  }
});
