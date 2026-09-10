import { Buffer } from "node:buffer";
import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import { queueInput } from "../tests/helpers/preparation-continuation.mjs";
const ROOT = "/v1/intake/dispute-results";
test("D13 BR1 result API exposes exact committed-record candidate without writes", async (t) => {
  const h = await intakeHost(t, { work: true }),
    v = await h.prepare(await queueInput()),
    committed = await h.ok("/v1/intake/commits", await h.selection(v, 0));
  const receipt = committed.receipt,
    before = await h.snapshot();
  const r = await h.call(
    `${ROOT}?case_id=${receipt.case_id}&record_key=${receipt.record_key}`,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.current.closure_permitted, false);
  assert.equal(r.data.current.status, "not_enrolled");
  assert.deepEqual(await h.snapshot(), before);
});
import { resultHost, COMMAND } from "../tests/helpers/dispute-result.mjs";
test("D13 BR1/BR6 API: original proof to accepted disposition and independent reversal", async (t) => {
  const r = await resultHost(t, { prepare: true });
  const originalSource = clone(r.source);
  await r.authorized();
  await r.reported();
  await r.transition();
  const resultSource = clone(r.source);
  const check = await r.check();
  assert.equal(
    check.entry.data.comparison.status,
    "match",
    JSON.stringify(check.entry.data.comparison),
  );
  const accepted = await r.accept(),
    view = await r.get();
  assert.equal(view.current.accepted, true);
  assert.equal(view.current.verified, true);
  assert.equal(view.proof_measures.disputes_resolved, 1);
  const acceptedExport = await r.h.ok(r.path + "&representation=export");
  validateDisputeExport(acceptedExport);
  const db = await r.h.snapshot();
  await r.h.restart();
  assert.deepEqual(await r.get(), view);
  assert.deepEqual(await r.h.ok(COMMAND, r.commands.at(-1)), accepted);
  assert.deepEqual(await r.h.snapshot(), db);
  const source = structuredClone(r.source);
  source.revision++;
  source.pod.rescinded = true;
  source.ar.status = "reopened";
  source.ar.active_grounds = ["non_delivery"];
  r.setSource(source);
  const negative = await r.check();
  assert.equal(negative.entry.data.comparison.status, "mismatch");
  assert.equal((await r.get()).current.accepted, false);
  await r.send("reopen", {
    candidate_hash: view.candidate_hash,
    acceptance_hash: accepted.entry.hash,
    observation_hash: negative.entry.hash,
    reason:
      "Independent synthetic source retracted original delivery proof and reopened this exact dispute",
  });
  const reopened = await r.get();
  assert.equal(reopened.current.status, "reopened");
  assert.equal(reopened.proof_measures.disputes_resolved, 0);
  assert.equal(reopened.current.closure_permitted, false);
  assert.deepEqual(Object.keys(reopened.proof_measures), [
    "cash_collected",
    "disputes_resolved",
    "credits_issued",
    "work_newly_attended_to",
    "human_attention_released",
  ]);
  for (const [key, value] of Object.entries(view.proof_measures))
    if (key !== "disputes_resolved") assert.equal(value, null);
  assert.equal(accepted.entry.record_key, r.first.record_key);
  assert.equal(accepted.entry.actor.identity_id, "identity_dispute_robin");
  assert.equal(accepted.entry.command.observation_hash, check.entry.hash);
  assert.equal(
    accepted.entry.data.commitments[0].owner_identity_id,
    "identity_dispute_morgan",
  );
  const reopenedExport = await r.h.ok(r.path + "&representation=export");
  validateDisputeExport(reopenedExport);
  t.diagnostic(
    JSON.stringify({
      accepted_receipt: accepted.entry.hash,
      accepted_export: acceptedExport.hash,
      reopened_export: reopenedExport.hash,
      current_accepted: reopened.current.accepted,
    }),
  );
  const finalDb = await r.h.snapshot();
  assert.deepEqual(finalDb.case_journal, db.case_journal);
  assert.deepEqual(finalDb.intake_commits, db.intake_commits);
  assert.equal((await r.h.ok(r.flow.path)).invocations.length, 2);
  assert.deepEqual(
    await r.h.ok(r.flow.path + "&representation=export"),
    r.workBefore,
  );
  if (process.env.D039_CAPTURE_DIR) {
    await mkdir(process.env.D039_CAPTURE_DIR, { recursive: true });
    for (const [name, value] of Object.entries({
      commands: r.commands,
      receipts: r.receipts,
      "accepted-view": view,
      "accepted-export": acceptedExport,
      "reopened-view": reopened,
      "reopened-export": reopenedExport,
      "preparation-export": r.workBefore,
      "source-original": originalSource,
      "source-disposition": resultSource,
      "source-reversal": source,
    }))
      await writeFile(
        join(process.env.D039_CAPTURE_DIR, name + ".json"),
        JSON.stringify(value, null, 2) + "\n",
      );
  }
});
import {
  canonicalJson,
  sha256Json,
} from "../dist/packages/contracts/src/index.js";
import { validateDisputeExport } from "../dist/packages/runtime/src/dispute-result.js";
import { PostgresDisputeResultStore } from "../dist/packages/runtime/src/postgres-dispute-result-store.js";
import { PostgresAuthorityStore } from "../dist/packages/runtime/src/postgres-authority-store.js";
const clone = structuredClone;
async function changeCatalog(r, edit) {
  const c = await r.h.pg.query(
    "SELECT s.content->'data' AS data,c.revision FROM authority_catalog c JOIN authority_snapshots s ON c.snapshot_hash=s.snapshot_hash WHERE c.tenant_id='tenant_intake_demo'",
  );
  const data = clone(c.rows[0].data);
  edit(data);
  await new PostgresAuthorityStore(r.h.pool).replaceCatalog(
    "tenant_intake_demo",
    data,
    Number(c.rows[0].revision),
    () => new Date("2026-09-07T16:06:00.000Z"),
  );
}
async function checkedCandidate(t) {
  const r = await resultHost(t);
  await r.enroll();
  await r.candidate();
  await r.basis();
  return r;
}
async function denied(r, command, code) {
  const before = await r.h.snapshot(),
    response = await r.h.call(COMMAND, command);
  assert.equal(response.status, 409, JSON.stringify(response));
  if (code) assert.equal(response.data.error, code);
  assert.deepEqual(await r.h.snapshot(), before);
  return response;
}
for (const [name, edit, expected] of [
  [
    "wrong source object",
    (s) => {
      s.pod.object_id = "POD-some-other-object";
    },
    "inconclusive",
  ],
  [
    "unrecognized custody",
    (s) => {
      s.pod.issuer = "arbitrary reporter";
    },
    "inconclusive",
  ],
  [
    "different governing clause",
    (s) => {
      s.terms.clause = "Always issue a credit";
    },
    "mismatch",
  ],
  [
    "wrong record",
    (s) => {
      s.pod.subject.dispute_id = "dispute-18";
    },
    "inconclusive",
  ],
  [
    "wrong delivery on the exact record",
    (s) => {
      s.pod.subject.delivery_id = "DEL-5";
    },
    "mismatch",
  ],
  [
    "wrong entity",
    (s) => {
      s.terms.subject.entity = "entity_south";
    },
    "inconclusive",
  ],
  [
    "partial allocation",
    (s) => {
      s.pod.allocation_complete = false;
    },
    "mismatch",
  ],
  [
    "status note is not original bytes",
    (s) => {
      s.pod.original_bytes_base64 =
        Buffer.from("Proof exists").toString("base64");
    },
    "mismatch",
  ],
  [
    "terms absent",
    (s) => {
      s.terms = null;
    },
    "mismatch",
  ],
  [
    "additional active ground",
    (s) => {
      s.ar.active_grounds.push("quality");
    },
    "mismatch",
  ],
  [
    "incomplete grounds",
    (s) => {
      s.ar.grounds_complete = false;
    },
    "inconclusive",
  ],
])
  test(`D13 BR2/BR4 ${name} cannot support authority`, async (t) => {
    const r = await resultHost(t);
    await r.enroll();
    await r.candidate();
    const s = clone(r.source);
    edit(s);
    s.revision++;
    r.setSource(s);
    const b = await r.basis();
    assert.equal(b.entry.data.comparison.status, expected);
    const v = await r.get();
    assert.equal(v.basis, null);
    await denied(
      r,
      await r.command("request_authority", {
        candidate_hash: v.candidate_hash,
        basis_observation_hash: b.entry.hash,
      }),
      "BASIS_REQUIRED",
    );
    await r.h.restart();
    assert.deepEqual((await r.get()).history.at(-1), b.entry);
  });
test("D13 BR2 distinct DEL-5 cannot enroll or inherit DEL-4 proof; exact source remains inspectable", async (t) => {
  const r = await checkedCandidate(t),
    v = await r.get();
  assert.equal(v.subject.delivery_id, "DEL-4");
  const other = await r.h.call(
    `${ROOT}?case_id=${r.first.case_id}&record_key=${r.second.record_key}`,
  );
  assert.equal(other.status, 400);
  assert.equal(
    (
      await r.h.call(COMMAND, {
        ...(await r.command("candidate")),
        binding: { ...v.binding, record_key: r.second.record_key },
      })
    ).status,
    400,
  );
  assert.equal((await r.h.snapshot()).intake_commits.length, 2);
});
for (const mode of ["unavailable", "malformed", "changing"])
  test(`D13 BR4 ${mode} source is retained inconclusive, never absence`, async (t) => {
    const r = await resultHost(t);
    await r.enroll();
    await r.candidate();
    let reads = 0;
    r.h.setResultReader(async () => {
      reads++;
      if (mode === "unavailable") throw Error("source unavailable");
      if (mode === "malformed") return Buffer.from("{broken");
      const s = clone(r.source);
      s.revision = reads;
      return Buffer.from(canonicalJson(s));
    });
    const b = await r.basis();
    assert.equal(b.entry.data.comparison.status, "inconclusive");
    assert.equal((await r.get()).basis, null);
    await r.h.restart();
    assert.deepEqual((await r.get()).history.at(-1), b.entry);
  });
test("D13 BR3 exact stale C/R/S and changed bodies fail closed; a read grants no permission", async (t) => {
  const r = await checkedCandidate(t);
  await r.request();
  const old = await r.command("review_authority", {
    candidate_hash: (await r.get()).candidate_hash,
    review: {
      authority_request_id: (await r.get()).authority.authority_request_id,
      request_binding_hash: (await r.get()).authority.request_binding_hash,
      expected_review_revision: 0,
    },
    decision: "approve",
    reason: "Exact synthetic review",
  });
  await denied(
    r,
    {
      ...old,
      review: {
        ...old.review,
        request_binding_hash: "sha256:" + "0".repeat(64),
      },
    },
    "REVIEW_BINDING_CONFLICT",
  );
  await r.decide();
  await denied(r, old, "REVIEW_BINDING_CONFLICT");
  const v = await r.get();
  await changeCatalog(r, (data) => {
    data.identities.find(
      (i) => i.identity_id === "identity_dispute_morgan",
    ).status = "revoked";
  });
  await denied(
    r,
    await r.command("no_action", {
      candidate_hash: v.candidate_hash,
      review: {
        authority_request_id: v.authority.authority_request_id,
        request_binding_hash: v.authority.request_binding_hash,
        expected_review_revision: v.authority.review_revision,
      },
      basis_hash: sha256Json(v.authority.material.basis),
    }),
    "REVIEWER_INELIGIBLE",
  );
});
test("D13 BR3 source expiry during writer wait blocks no-action despite prior approval", async (t) => {
  const r = await checkedCandidate(t);
  await r.request();
  await r.decide();
  const v = await r.get(),
    c = await r.command("no_action", {
      candidate_hash: v.candidate_hash,
      basis_hash: sha256Json(v.authority.material.basis),
      review: {
        authority_request_id: v.authority.authority_request_id,
        request_binding_hash: v.authority.request_binding_hash,
        expected_review_revision: v.authority.review_revision,
      },
    });
  r.h.setTime("2026-09-07T16:21:00.000Z");
  await denied(r, c, "BASIS_REQUIRED");
});
test("D13 BR3 changed original terms between read and writer lock cannot authorize", async (t) => {
  const r = await checkedCandidate(t);
  await r.request();
  await r.decide();
  let reads = 0;
  r.h.setResultReader(async () => {
    const s = clone(r.source);
    if (++reads > 1) {
      s.revision++;
      s.terms.version++;
    }
    return Buffer.from(canonicalJson(s));
  });
  const v = await r.get();
  await denied(
    r,
    await r.command("no_action", {
      candidate_hash: v.candidate_hash,
      basis_hash: sha256Json(v.authority.material.basis),
      review: {
        authority_request_id: v.authority.authority_request_id,
        request_binding_hash: v.authority.request_binding_hash,
        expected_review_revision: v.authority.review_revision,
      },
    }),
    "STALE_SOURCE",
  );
});
for (const decision of ["reject", "modify", "escalate"])
  test(`D13 BR5 authority ${decision} preserves D6 terminal rules and no transferred approvals`, async (t) => {
    const r = await checkedCandidate(t);
    await r.request();
    await r.decide();
    await r.decide(decision);
    const v = await r.get();
    assert.equal(v.authority.current.authorized, false);
    if (decision === "modify") {
      assert.equal(v.authority.review_revision, 0);
      assert.equal(v.authority.history.length, 1);
    } else
      assert.equal(
        v.authority.current.lifecycle,
        decision === "reject" ? "rejected" : "escalated",
      );
    await denied(
      r,
      await r.command("no_action", {
        candidate_hash: v.candidate_hash,
        basis_hash: sha256Json(v.authority.material.basis),
        review: {
          authority_request_id: v.authority.authority_request_id,
          request_binding_hash: v.authority.request_binding_hash,
          expected_review_revision: v.authority.review_revision,
        },
      }),
      "AUTHORITY_DENIED",
    );
    await r.h.restart();
    assert.deepEqual((await r.get()).authority, v.authority);
  });
test("D13 BR5 canonical verifier and recipient grants are independent and current", async (t) => {
  const r = await resultHost(t);
  await r.authorized();
  await r.reported();
  await r.transition();
  await r.check();
  await changeCatalog(r, (data) => {
    data.authority_records.find(
      (g) => g.authority_class === "dispute_recipient",
    ).status = "revoked";
  });
  const v = await r.get(),
    check = v.history.findLast((e) => e.operation === "result_check"),
    d = v.history.findLast((e) => e.operation === "no_action");
  await denied(
    r,
    await r.command("accept", {
      candidate_hash: v.candidate_hash,
      decision_hash: d.hash,
      observation_hash: check.hash,
      outcome_hash: sha256Json(check.data.outcome),
      commitments: [],
      reason: "Try an invalid recipient",
    }),
    "REVIEWER_INELIGIBLE",
  );
  await changeCatalog(r, (data) => {
    data.identities.find(
      (i) => i.identity_id === "identity_dispute_verifier",
    ).identity_kind = "human";
  });
  await denied(
    r,
    await r.command("result_check", {
      candidate_hash: v.candidate_hash,
      decision_hash: d.hash,
    }),
    "REVIEWER_INELIGIBLE",
  );
});
test("D13 BR5 caller identity, source paths and success claims never become trusted inputs", async (t) => {
  const r = await checkedCandidate(t),
    c = await r.command("basis_check", {
      candidate_hash: (await r.get()).candidate_hash,
    }),
    before = await r.h.snapshot();
  for (const extra of [
    { identity: { identity_id: "identity_dispute_verifier" } },
    { verified: true },
    { source_path: "/tmp/proof" },
    { observation: { status: "match" } },
    { authorization: true },
  ])
    assert.equal((await r.h.call(COMMAND, { ...c, ...extra })).status, 400);
  assert.deepEqual(await r.h.snapshot(), before);
});
test("D13 BR6 later inconclusive result removes current success and preserves accepted history", async (t) => {
  const r = await resultHost(t);
  await r.authorized();
  await r.reported();
  await r.transition();
  await r.check();
  const a = await r.accept();
  r.h.setResultReader(async () => {
    throw Error("unavailable");
  });
  const check = await r.check();
  assert.equal(check.entry.data.comparison.status, "inconclusive");
  const v = await r.get();
  assert.equal(v.current.verified, false);
  assert.equal(v.current.accepted, false);
  assert.equal(v.proof_measures.disputes_resolved, null);
  assert.ok(v.history.some((e) => e.hash === a.entry.hash));
});
test("D13 BR7 read/export restart reproduction preserves exact authority and business evidence", async (t) => {
  const r = await resultHost(t);
  await r.authorized();
  await r.reported();
  await r.transition();
  await r.check();
  await r.accept();
  const before = await r.h.snapshot();
  const archive = await r.h.ok(r.path + "&representation=export");
  validateDisputeExport(archive);
  await r.h.restart();
  assert.deepEqual(await r.h.ok(r.path + "&representation=export"), archive);
  assert.deepEqual(await r.h.snapshot(), before);
});
for (const tag of [
  "fr:result-insert",
  "fr:result-clock",
  "fr:authority-increment-writer",
])
  test(`D13 BR7 rollback at ${tag} retains no partial result`, async (t) => {
    const r = await resultHost(t);
    await r.enroll();
    const c = await r.command("candidate"),
      before = await r.h.snapshot();
    r.h.fault({ tag });
    assert.equal((await r.h.call(COMMAND, c)).status, 500);
    assert.deepEqual(await r.h.snapshot(), before);
    const receipt = await r.h.ok(COMMAND, c);
    await r.h.restart();
    assert.deepEqual(await r.h.ok(COMMAND, c), receipt);
  });
test("D13 BR7 lost commit acknowledgment, concurrent exact retry and changed-body key conflict", async (t) => {
  const r = await resultHost(t);
  await r.enroll();
  const c = await r.command("candidate");
  r.h.fault({ tag: "COMMIT", remaining: 2, after: true });
  assert.equal((await r.h.call(COMMAND, c)).status, 500);
  await r.h.restart();
  const before = await r.h.snapshot(),
    receipts = await Promise.all([r.h.ok(COMMAND, c), r.h.ok(COMMAND, c)]);
  assert.deepEqual(receipts[0], receipts[1]);
  assert.deepEqual(await r.h.snapshot(), before);
  await denied(
    r,
    {
      ...c,
      binding: { ...c.binding, case_version: c.binding.case_version + 1 },
    },
    "IDEMPOTENCY_CONFLICT",
  );
});
test("D13 BR7 competing distinct commands cannot silently rebase a Case-wide head", async (t) => {
  const r = await resultHost(t);
  await r.enroll();
  const a = await r.command("candidate", {}, "competing-a"),
    b = { ...a, idempotency_key: "competing-b" },
    results = await Promise.all([r.h.call(COMMAND, a), r.h.call(COMMAND, b)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await r.get()).history.filter((e) => e.operation === "candidate").length,
    1,
  );
});
test("D13 BR7 additive upgrade preserves old migration checksums and Case history", async (t) => {
  const r = await resultHost(t, { beforeResult: true });
  const before = await r.h.snapshot(),
    applied = (
      await r.h.pg.query(
        "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
      )
    ).rows;
  await r.h.upgrade();
  assert.deepEqual((await r.h.snapshot()).case_journal, before.case_journal);
  const after = (
    await r.h.pg.query(
      "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
    )
  ).rows;
  assert.deepEqual(after.slice(0, 10), applied);
  assert.equal(after.at(-1).version, "0011_dispute_result");
  await r.enroll();
  await r.h.restart();
  assert.equal((await r.get()).current.status, "enrolled");
});
import { authorityTransaction } from "../dist/packages/runtime/src/postgres-authority-store.js";
import { loadDisputeStore } from "../dist/packages/runtime/src/postgres-dispute-result-store.js";
import { disputeColumns } from "../dist/packages/runtime/src/postgres-dispute-evidence.js";
import { applyDisputeCommand } from "../dist/packages/runtime/src/dispute-result.js";
async function replaceEntry(h, entry) {
  const columns = disputeColumns(entry),
    keys = Object.keys(columns);
  await h.pg.query("ALTER TABLE dispute_result_journal DISABLE TRIGGER USER");
  try {
    await h.pg.query(
      `UPDATE dispute_result_journal SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")} WHERE id=$${keys.length + 1}`,
      [...Object.values(columns), entry.id],
    );
  } finally {
    await h.pg.query("ALTER TABLE dispute_result_journal ENABLE TRIGGER USER");
  }
}
async function closureCommand(r, key) {
  const v = await r.get();
  return {
    type: "case.transition",
    tenant_id: "tenant_intake_demo",
    case_id: r.first.case_id,
    expected_case_version: v.binding.case_version,
    actor_identity_id: "identity_intake_operator",
    idempotency_key: key,
    correlation_id: key,
    to_state: "resolved",
    reason:
      "Synthetic closure safeguard control; complete Case proof is absent",
  };
}
test("D13 BR7/BR8 a legitimate action predating changed Case survives; a coherently forged obsolete prefix fails replay/readiness/GET", async (t) => {
  const r = await checkedCandidate(t);
  await r.request();
  await r.decide();
  const prior = await authorityTransaction(r.h.pool, true, loadDisputeStore);
  const original = await r.noAction(),
    command = r.commands.at(-1);
  r.h.setTime("2026-09-07T16:07:00.000Z");
  const closure = await closureCommand(r, "result-closure-control");
  await r.h.ok("/v0/tenants/tenant_intake_demo/case-commands", closure);
  const changed = await r.h.store.getCase(
    "tenant_intake_demo",
    r.first.case_id,
  );
  assert.notEqual(changed.document.case.state, "resolved");
  assert.equal(changed.journal.length, command.binding.case_version + 1);
  await r.h.restart();
  assert.ok(
    (await r.get()).history.some((e) => e.hash === original.entry.hash),
  );
  assert.deepEqual(await r.h.ok(COMMAND, command), original);
  const obs = clone(original.entry.source_precondition);
  obs.started_at =
    obs.observed_at =
    obs.recorded_at =
      "2026-09-07T16:08:00.000Z";
  const forged = applyDisputeCommand(
    prior,
    command,
    obs.recorded_at,
    obs,
  ).entry;
  assert.notEqual(forged.hash, original.entry.hash);
  await replaceEntry(r.h, forged);
  await r.h.pg.query(
    "UPDATE authority_catalog SET last_recorded_at=$1 WHERE tenant_id='tenant_intake_demo'",
    [obs.recorded_at],
  );
  await assert.rejects(
    new PostgresDisputeResultStore(r.h.pool).assertReady(),
    /reconstruction/,
  );
  assert.ok((await r.h.call(r.path)).status >= 500);
  await r.h.restart();
  assert.ok((await r.h.call(r.path)).status >= 500);
});
test("D13 BR7 coherently changed comparison, outcome, indexes and hash cannot turn raw mismatch into success", async (t) => {
  const r = await resultHost(t);
  await r.authorized();
  await r.reported();
  const mismatch = await r.check();
  assert.equal(mismatch.entry.data.comparison.status, "mismatch");
  const archive = await r.h.ok(r.path + "&representation=export");
  validateDisputeExport(archive);
  const forged = clone(mismatch.entry);
  forged.data.comparison.status = "match";
  forged.data.comparison.reasons = [];
  forged.data.outcome = {
    id: "outcome_forged",
    case_id: forged.case_id,
    type: "invoice_dispute_no_adjustment",
    status: "achieved",
    accepted: false,
    metrics: {},
    evidence_ids: [forged.id],
    verified_by_identity_id: "identity_dispute_verifier",
    verified_at: forged.recorded_at,
  };
  delete forged.hash;
  forged.hash = sha256Json(forged);
  const changed = clone(archive);
  changed.entries[changed.entries.length - 1] = forged;
  delete changed.hash;
  changed.hash = sha256Json(changed);
  assert.throws(() => validateDisputeExport(changed), /replay/);
  await replaceEntry(r.h, forged);
  await assert.rejects(
    new PostgresDisputeResultStore(r.h.pool).assertReady(),
    /reconstruction/,
  );
  assert.ok((await r.h.call(r.path)).status >= 500);
});
test("D13 BR5 business rejection terminates the candidate; replacement carries no authority or acceptance", async (t) => {
  const r = await checkedCandidate(t);
  await r.request();
  await r.decide();
  const old = await r.get();
  await r.send("reject", {
    candidate_hash: old.candidate_hash,
    reason: "Robin rejects this synthetic proposed business disposition",
  });
  assert.equal((await r.get()).current.status, "rejected");
  await r.candidate();
  const fresh = await r.get();
  assert.notEqual(fresh.candidate_hash, old.candidate_hash);
  assert.equal(fresh.authority, null);
  assert.equal(fresh.current.accepted, false);
  assert.equal(fresh.basis, null);
});
test("D13 BR3 historical source verification remains possible after request rejection", async (t) => {
  const r = await resultHost(t);
  await r.authorized();
  await r.decide("reject");
  await r.reported();
  await r.transition();
  const receipt = await r.check();
  assert.equal(receipt.entry.data.comparison.status, "match");
  assert.equal((await r.get()).authority.current.lifecycle, "rejected");
});
test("D13 BR7 export contains only intake authority despite prior unrelated D6 journal positions", async (t) => {
  const r = await resultHost(t);
  const { syntheticAuthorityCatalog } =
    await import("../dist/packages/runtime/src/synthetic-authority.js");
  const { caseCommand, createRequestCommand } =
    await import("../tests/helpers/authority-review.mjs");
  const store = new PostgresAuthorityStore(r.h.pool);
  await store.initializeCatalog(
    "tenant_orchid",
    syntheticAuthorityCatalog(),
    () => new Date("2026-09-07T16:06:00.000Z"),
  );
  const c = caseCommand("export_context");
  await r.h.ok("/v0/tenants/tenant_orchid/case-commands", c);
  const cmd = createRequestCommand(c.case_seed.case.id);
  cmd.expected_authority_state_revision = 1;
  const deps = {
    now: () => new Date("2026-09-07T16:06:00.000Z"),
    nextId: (k) => `${k}_outside_export`,
  };
  const made = await store.execute(cmd, "operator", deps);
  assert.equal(made.status, "applied");
  await r.authorized();
  const archive = await r.h.ok(r.path + "&representation=export");
  assert.ok(
    archive.authority.entries.every(
      (e) => e.tenant_id === "tenant_intake_demo",
    ),
  );
  assert.ok(archive.authority.entries[0].position > 1);
  validateDisputeExport(archive);
});

test("D13 BR7 authority writes advance only R; replacement and read-back failures roll back both entries", async (t) => {
  const r = await checkedCandidate(t),
    before = await r.get(),
    original = (await r.h.snapshot()).dispute_result_journal;
  const created = await r.request();
  await r.decide();
  let v = await r.get();
  assert.deepEqual(v.binding, before.binding);
  assert.equal(v.authority.review_revision, 1);
  assert.deepEqual((await r.h.snapshot()).dispute_result_journal, original);
  const originalCreate = r.commands.find(
    (c) => c.operation === "request_authority",
  );
  const c = await r.command("review_authority", {
    candidate_hash: v.candidate_hash,
    review: {
      authority_request_id: v.authority.authority_request_id,
      request_binding_hash: v.authority.request_binding_hash,
      expected_review_revision: 1,
    },
    decision: "modify",
    reason: "Fresh named review required for replacement",
  });
  const db = await r.h.snapshot();
  r.h.fault({ tag: "fr:result-authority-insert", remaining: 2 });
  assert.equal((await r.h.call(COMMAND, c)).status, 500);
  assert.deepEqual(await r.h.snapshot(), db);
  let wrote = false;
  r.h.hook((sql) => {
    if (sql.includes("fr:result-authority-insert")) wrote = true;
    if (wrote && sql.includes("fr:result-load")) {
      r.h.hook(null);
      throw Error("injected post-write reconstruction failure");
    }
  });
  assert.equal((await r.h.call(COMMAND, c)).status, 500);
  assert.equal(wrote, true);
  assert.deepEqual(await r.h.snapshot(), db);
  const receipt = await r.h.ok(COMMAND, c);
  v = await r.get();
  assert.equal(v.authority.review_revision, 0);
  assert.equal(v.authority.current.authorized, false);
  assert.deepEqual(v.binding, before.binding);
  await r.h.restart();
  const final = await r.h.snapshot();
  assert.deepEqual(await r.h.ok(COMMAND, c), receipt);
  assert.deepEqual(await r.h.ok(COMMAND, originalCreate), created);
  assert.deepEqual(await r.h.snapshot(), final);
});
test("D13 BR3 current verifier revocation during independent read blocks the writer transaction", async (t) => {
  const r = await checkedCandidate(t);
  let changed = false;
  r.h.setResultReader(async () => {
    if (!changed) {
      changed = true;
      await changeCatalog(r, (d) => {
        d.authority_records.find(
          (g) => g.authority_class === "dispute_verifier",
        ).status = "revoked";
      });
    }
    return Buffer.from(canonicalJson(r.source));
  });
  const c = await r.command("basis_check", {
    candidate_hash: (await r.get()).candidate_hash,
  });
  const n = (await r.get()).history.length;
  const result = await r.h.call(COMMAND, c);
  assert.equal(result.status, 409);
  assert.equal(result.data.error, "REVIEWER_INELIGIBLE");
  assert.equal((await r.get()).history.length, n);
});
test("D13 BR3 a Case event after approval blocks no-action; unchanged record labels do not restore consent", async (t) => {
  const r = await checkedCandidate(t);
  await r.request();
  await r.decide();
  const v = await r.get(),
    c = await r.command("no_action", {
      candidate_hash: v.candidate_hash,
      basis_hash: sha256Json(v.authority.material.basis),
      review: {
        authority_request_id: v.authority.authority_request_id,
        request_binding_hash: v.authority.request_binding_hash,
        expected_review_revision: v.authority.review_revision,
      },
    });
  r.h.setTime("2026-09-07T16:07:00.000Z");
  await r.h.ok(
    "/v0/tenants/tenant_intake_demo/case-commands",
    await closureCommand(r, "stale-dispute-case"),
  );
  await denied(r, c, "BINDING_CONFLICT");
  await denied(
    r,
    {
      ...c,
      idempotency_key: "explicit-fresh-binding",
      binding: (await r.get()).binding,
    },
    "STALE_BASIS",
  );
});
test("D13 BR7 acceptance survives lost response/restart with one exact review and no financial effect", async (t) => {
  const r = await resultHost(t);
  await r.authorized();
  await r.reported();
  await r.transition();
  await r.check();
  r.h.fault({ tag: "COMMIT", remaining: 4, after: true });
  await assert.rejects(r.accept());
  const command = r.commands.at(-1);
  await r.h.restart();
  const before = await r.h.snapshot(),
    receipt = await r.h.ok(COMMAND, command);
  assert.equal(receipt.entry.operation, "accept");
  assert.equal(
    (await r.get()).history.filter((e) => e.operation === "accept").length,
    1,
  );
  assert.deepEqual(await r.h.ok(COMMAND, command), receipt);
  assert.deepEqual(await r.h.snapshot(), before);
});

test("D13 BR6 a fresh check after inconclusive evidence requires new exact acceptance without double counting", async (t) => {
  const r = await resultHost(t);
  await r.authorized();
  await r.reported();
  await r.transition();
  await r.check();
  const original = await r.accept();
  r.h.setResultReader(async () => {
    throw Error("unavailable");
  });
  await r.check();
  assert.equal((await r.get()).current.accepted, false);
  r.h.setResultReader(async () => Buffer.from(canonicalJson(r.source)));
  await r.check();
  assert.equal((await r.get()).current.accepted, false);
  const accepted = await r.accept();
  assert.notEqual(accepted.entry.hash, original.entry.hash);
  const v = await r.get();
  assert.equal(v.proof_measures.disputes_resolved, 1);
  assert.equal(v.history.filter((e) => e.operation === "accept").length, 2);
  await r.h.restart();
  assert.deepEqual(await r.get(), v);
});

test("D13 BR2 explicitly shared delivery support stays context; only the exact original allocation supports this disposition", async (t) => {
  const { editQueue } = await import("../tests/helpers/intake.mjs");
  const { note } =
    await import("../tests/helpers/preparation-continuation.mjs");
  const input = note(
    editQueue(await queueInput("shared-original"), (rows, headers) => {
      rows[1].delivery_ids = "DEL-4";
      return { rows, headers };
    }),
    "shared-report",
    "Delivery confirmation for DEL-4 is supplied.",
    { entity: "entity_north", kind: "delivery", id: "DEL-4" },
  );
  const r = await resultHost(t, { input });
  await r.enroll();
  await r.candidate();
  const matched = await r.basis();
  assert.equal(matched.entry.data.comparison.status, "match");
  const archive = await r.h.ok(r.path + "&representation=export");
  validateDisputeExport(archive);
  assert.equal(archive.work.pack.discovery.intake.commits.length, 2);
  const other = await r.h.call(
    `${ROOT}?case_id=${r.first.case_id}&record_key=${r.second.record_key}`,
  );
  assert.equal(other.status, 400);
  const source = clone(r.source);
  source.revision++;
  source.pod.subject.dispute_id = "dispute-18";
  r.setSource(source);
  assert.equal((await r.basis()).entry.data.comparison.status, "inconclusive");
  assert.equal((await r.get()).basis, null);
});
for (const identity of [
  "identity_intake_operator",
  "identity_dispute_morgan",
  "identity_dispute_reporter",
])
  test(`D13 BR5 ${identity} cannot replace the independent verifier grant`, async (t) => {
    const r = await checkedCandidate(t);
    await changeCatalog(r, (data) => {
      data.authority_records.find(
        (g) => g.authority_class === "dispute_verifier",
      ).identity = data.identities.find((i) => i.identity_id === identity);
    });
    await denied(
      r,
      await r.command("basis_check", {
        candidate_hash: (await r.get()).candidate_hash,
      }),
      "REVIEWER_INELIGIBLE",
    );
  });
test("D13 BR3 an AR disposition cannot predate the no-action decision it claims to follow", async (t) => {
  const r = await resultHost(t);
  await r.authorized();
  await r.reported();
  await r.transition();
  const source = clone(r.source);
  source.ar.event_at = "2026-09-07T16:05:59.000Z";
  r.setSource(source);
  const checked = await r.check();
  assert.equal(checked.entry.data.comparison.status, "mismatch");
  assert.equal((await r.get()).current.verified, false);
});

test("D13 BR3 a writer wait cannot legitimize a source event that was future at observation", async (t) => {
  const r = await resultHost(t);
  await r.authorized();
  await r.reported();
  await r.transition();
  const source = clone(r.source);
  source.ar.event_at = "2026-09-07T16:06:02.000Z";
  r.setSource(source);
  r.h.hook((sql) => {
    if (sql.includes("fr:authority-lock-writer"))
      r.h.setTime("2026-09-07T16:06:03.000Z");
  });
  const checked = await r.check();
  r.h.hook(null);
  assert.equal(checked.entry.data.comparison.status, "inconclusive");
  assert.equal((await r.get()).current.verified, false);
  await r.h.restart();
  assert.deepEqual((await r.get()).history.at(-1), checked.entry);
});
test("D13 BR3 authority preparation cannot read proof through an expired verifier grant", async (t) => {
  const r = await resultHost(t);
  await r.enroll();
  await changeCatalog(r, (d) => {
    d.authority_records.find(
      (g) => g.authority_class === "dispute_verifier",
    ).effective_until = "2026-09-07T16:06:01.000Z";
  });
  await r.candidate();
  await r.basis();
  let reads = 0;
  r.h.setResultReader(async () => {
    reads++;
    return Buffer.from(canonicalJson(r.source));
  });
  r.h.setTime("2026-09-07T16:06:02.000Z");
  const v = await r.get(),
    command = await r.command("request_authority", {
      candidate_hash: v.candidate_hash,
      basis_observation_hash: v.basis.basis_observation_hash,
    });
  await denied(r, command, "REVIEWER_INELIGIBLE");
  assert.equal(reads, 0);
});

for (const decision of ["reject", "escalate"])
  test(`D13 BR3 ${decision} remains available without an expired source-reader grant`, async (t) => {
    const r = await resultHost(t);
    await r.enroll();
    await changeCatalog(r, (d) => {
      d.authority_records.find(
        (g) => g.authority_class === "dispute_verifier",
      ).effective_until = "2026-09-07T16:06:01.000Z";
    });
    await r.candidate();
    await r.basis();
    await r.request();
    await r.decide();
    const before = await r.get();
    let reads = 0;
    r.h.setResultReader(async () => {
      reads++;
      throw new Error("Source access is no longer granted");
    });
    r.h.setTime("2026-09-07T16:06:02.000Z");
    const receipt = await r.decide(decision),
      command = r.commands.at(-1);
    assert.equal(reads, 0);
    assert.equal(receipt.entry.source_precondition, null);
    const after = await r.get();
    assert.equal(after.binding.result_revision, before.binding.result_revision);
    assert.equal(
      after.authority.review_revision,
      before.authority.review_revision + 1,
    );
    assert.equal(after.authority.current.authorized, false);
    await r.h.restart();
    const durable = await r.h.snapshot();
    assert.deepEqual((await r.h.call(COMMAND, command)).data, receipt);
    assert.deepEqual(await r.h.snapshot(), durable);
    validateDisputeExport(await r.h.ok(`${r.path}&representation=export`));
  });

test("D13 BR3 no-action source preflight rechecks verifier effectivity under the writer lock", async (t) => {
  const r = await resultHost(t);
  await r.enroll();
  await changeCatalog(r, (d) => {
    d.authority_records.find(
      (g) => g.authority_class === "dispute_verifier",
    ).effective_until = "2026-09-07T16:06:01.000Z";
  });
  await r.candidate();
  await r.basis();
  await r.request();
  await r.decide();
  const v = await r.get(),
    command = await r.command("no_action", {
      candidate_hash: v.candidate_hash,
      basis_hash: sha256Json(v.authority.material.basis),
      review: {
        authority_request_id: v.authority.authority_request_id,
        request_binding_hash: v.authority.request_binding_hash,
        expected_review_revision: v.authority.review_revision,
      },
    });
  let reads = 0;
  r.h.setResultReader(async () => {
    reads++;
    r.h.setTime("2026-09-07T16:06:02.000Z");
    return Buffer.from(canonicalJson(r.source));
  });
  await denied(r, command, "REVIEWER_INELIGIBLE");
  assert.equal(reads, 1);
  assert.equal(
    (await r.get()).history.some((e) => e.operation === "no_action"),
    false,
  );
});
