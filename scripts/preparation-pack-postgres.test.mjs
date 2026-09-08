import assert from "node:assert/strict";
import test from "node:test";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import {
  preparedDiscovery,
  discoveryCommand,
} from "../tests/helpers/discovery.mjs";
const ROOT =
  "/v1/intake/preparation-packs/pack_synthetic_invoice_dispute_north";
const pathFor = (b) =>
  `${ROOT}?bundle_id=${b.bundle_id}&record_key=${encodeURIComponent(b.record_key)}&case_id=${b.case_id}`;
async function prepared(t) {
  const h = await intakeHost(t),
    d = await preparedDiscovery(h);
  await h.ok(
    d.post,
    discoveryCommand(await d.get(), "pack-description", "confirm"),
  );
  const brief = await d.get();
  return { h, d, brief, path: pathFor(brief.binding) };
}
test("D11-B T1: a read-only pack candidate reuses the completed descriptive review", async (t) => {
  const { h, brief, path } = await prepared(t),
    before = await h.snapshot();
  const result = await h.call(path);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(
    result.data.candidate.binding.discovery.expected_discovery_revision,
    1,
  );
  assert.equal(
    result.data.candidate.binding.confirmation_entry_hash,
    brief.history[0].hash,
  );
  assert.equal(result.data.current.status, "proposed");
  assert.deepEqual(await h.snapshot(), before);
});
test("D11-B T2: caller approval and identities cannot enter the publication boundary", async (t) => {
  const h = await intakeHost(t),
    before = await h.snapshot();
  const r = await h.call(`${ROOT}/selections/publication`, {
    operation: "publish",
    actor: "executive",
    authorized: true,
  });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.deepEqual(await h.snapshot(), before);
});

import {
  sha256Json,
  assertValidPreparationPackContract,
} from "../dist/packages/contracts/src/index.js";
import {
  validatePackExport,
  syntheticPackContext,
} from "../dist/packages/runtime/src/preparation-pack.js";
import { PostgresPreparationPackStore } from "../dist/packages/runtime/src/postgres-preparation-pack-store.js";
const post = `${ROOT}/selections/publication`;
const command = (v, key, operation = "publish", artifact = v.candidate) => ({
  schema_version: "pack-selection-command.v1",
  operation,
  pack_id: v.pack_id,
  expected_selection_revision: v.selection_revision,
  expected_selection_head: v.selection_head,
  expected_publication_profile_hash: v.publication_profile_hash,
  reason:
    "Synthetic preparation only; source uncertainty and separate business authority remain",
  idempotency_key: key,
  artifact_hash:
    operation === "withdraw" ? v.selected_artifact_hash : sha256Json(artifact),
  ...(operation === "withdraw"
    ? {}
    : {
        expected_basis: artifact.binding,
        effective_until: "2026-09-07T17:00:00.000Z",
        effective_until_source_timezone: "UTC",
      }),
});
const business = (snapshot) =>
  Object.fromEntries(
    Object.entries(snapshot).filter(
      ([k]) =>
        !["runtime_writer_lock", "preparation_pack_selection"].includes(k),
    ),
  );
test("D11-B T1/T6/T8: publish, exact retry and restart reproduce one selection without business writes", async (t) => {
  const { h, path } = await prepared(t),
    v = await h.ok(path),
    before = await h.snapshot(),
    c = command(v, "first-publish");
  assert.equal(v.current.can_publish, true, JSON.stringify(v.current));
  const receipt = await h.ok(post, c);
  assertValidPreparationPackContract("result", receipt);
  assert.equal(receipt.entry.sequence, 1);
  assert.equal(receipt.entry.actor.identity_id, "identity_pack_reviewer_demo");
  assert.equal(receipt.authority_granted, false);
  assert.deepEqual(business(await h.snapshot()), business(before));
  const after = await h.snapshot(),
    view = await h.ok(path);
  assert.equal(view.current.status, "published_for_preparation");
  assert.equal(view.current.eligible, true);
  assert.deepEqual(await h.ok(post, c), receipt);
  assert.deepEqual(await h.snapshot(), after);
  const archive = await h.ok(path + "&representation=export");
  assert.equal(validatePackExport(archive).entries.length, 1);
  await h.restart();
  assert.deepEqual(await h.ok(post, c), receipt);
  assert.deepEqual(await h.ok(path + "&representation=export"), archive);
  assert.deepEqual(await h.snapshot(), after);
  assert.equal(
    (await h.call(post, { ...c, reason: "Different valid reason" })).status,
    409,
  );
  const noop = await h.call(post, command(view, "fresh-no-change"));
  assert.equal(noop.data.error, "NO_CHANGE");
  assert.deepEqual(await h.snapshot(), after);
});
test("D11-B T5/T7: correction stales selection, fresh description needs separate publication, stale expired pack can withdraw", async (t) => {
  const { h, d, path } = await prepared(t);
  const first = await h.ok(path),
    receipt = await h.ok(post, command(first, "A"));
  h.setTime("2026-09-07T16:06:00.000Z");
  await h.ok(d.post, discoveryCommand(await d.get(), "correction"));
  let v = await h.ok(path);
  assert.equal(v.current.status, "stale");
  assert.equal(v.current.can_publish, false);
  assert.equal(v.current.can_withdraw, true);
  assert.equal(v.history[0].hash, receipt.entry.hash);
  const stale = await h.call(post, command(first, "stale-A"));
  assert.equal(stale.status, 409);
  h.setTime("2026-09-07T16:07:00.000Z");
  await h.ok(
    d.post,
    discoveryCommand(await d.get(), "fresh-description", "confirm"),
  );
  v = await h.ok(path);
  assert.equal(v.candidate.binding.discovery.expected_discovery_revision, 3);
  assert.equal(v.current.status, "stale");
  assert.equal(v.current.can_publish, true);
  assert.notEqual(v.candidate.version, first.candidate.version);
  const second = await h.ok(post, command(v, "B"));
  assert.equal(second.entry.sequence, 2);
  assert.equal((await h.ok(path)).current.eligible, true);
  h.setTime("2026-09-07T17:01:00.000Z");
  const changed = discoveryCommand(await d.get(), "second-correction");
  changed.changes[0].text =
    "A different operator-reported contact is available; proof and accountable owner remain unconfirmed";
  await h.ok(d.post, changed);
  v = await h.ok(path);
  assert.equal(v.current.status, "stale");
  assert.equal(v.current.can_withdraw, true);
  const before = await h.snapshot(),
    withdrawal = command(v, "withdraw-stale", "withdraw");
  const unauthorized = await h.call(`${ROOT}/selections/intake`, withdrawal);
  assert.equal(unauthorized.data.error, "PACK_REVIEWER_REQUIRED");
  assert.deepEqual(await h.snapshot(), before);
  const withdrawn = await h.ok(post, withdrawal);
  assert.equal(withdrawn.entry.sequence, 3);
  assert.equal(withdrawn.entry.result.selected_artifact_hash, null);
  assert.equal((await h.ok(path)).current.status, "withdrawn");
  assert.deepEqual(business(await h.snapshot()), business(before));
  const after = await h.snapshot();
  assert.equal(
    (await h.call(post, { ...withdrawal, idempotency_key: "competing" })).data
      .error,
    "PACK_HEAD_CONFLICT",
  );
  assert.deepEqual(await h.ok(post, withdrawal), withdrawn);
  assert.deepEqual(await h.snapshot(), after);
  const current = await h.ok(path),
    rollback = {
      ...command(current, "rollback-stale", "rollback", first.candidate),
      effective_until: "2026-09-07T18:00:00.000Z",
    };
  assert.equal(
    (await h.call(post, rollback)).data.error,
    "PACK_BASIS_CONFLICT",
  );
  await h.restart();
  assert.equal((await h.ok(path)).current.status, "withdrawn");
  assert.equal(
    validatePackExport(await h.ok(path + "&representation=export")).entries
      .length,
    3,
  );
});

import { scopedDeliveries } from "../tests/helpers/discovery.mjs";
import { intakeInput, editQueue } from "../tests/helpers/intake.mjs";
import { packColumns } from "../dist/packages/runtime/src/postgres-preparation-pack-store.js";
for (const scenario of [
  "different-deliveries",
  "distinct-records",
  "same-delivery",
  "shared-delivery",
])
  test(`D11-B T3/T4 API: ${scenario} preserves scoped support`, async (t) => {
    const h = await intakeHost(t),
      d = await preparedDiscovery(
        h,
        await scopedDeliveries(`api-${scenario}`, scenario),
      ),
      b = (await d.get()).binding;
    const v = await h.ok(pathFor(b)),
      a = v.candidate,
      map = a.loop_outputs.find((x) => x.id === "Human Intervention Map");
    if (scenario === "different-deliveries") {
      assert.match(map.text, /DEL-4: source reports supplied/);
      assert.match(
        map.text,
        /DEL-5: source reports confirmation is not supplied/,
      );
      assert.doesNotMatch(map.text, /conflicting/);
    }
    if (scenario === "distinct-records") {
      assert.match(map.text, /DEL-4: no explicitly associated/);
      assert.doesNotMatch(map.text, /DEL-5|conflicting/);
      assert.ok(
        !a.sources
          .filter((x) => map.citation_ids.includes(x.id))
          .some((x) => x.name === "dispute-18-only.txt"),
      );
    }
    if (scenario === "same-delivery") {
      assert.match(map.text, /DEL-4: conflicting/);
      assert.equal(
        a.sources.filter(
          (x) => map.citation_ids.includes(x.id) && x.interpretation === "text",
        ).length,
        2,
      );
    }
    if (scenario === "shared-delivery")
      assert.match(map.text, /source reports supplied/);
    assert.equal(v.current.can_publish, false);
    assert.equal(a.closure_permission, false);
  });
test("D11-B T2: current revoked, expired, unknown, conflicting or wrong-scope reviewers cannot publish or withdraw", async (t) => {
  const { h, path } = await prepared(t),
    original = await h.ok(path);
  await h.ok(post, command(original, "identity-control"));
  const selected = await h.ok(path);
  const mutations = [
    (p) => {
      p.identities.find(
        (i) => i.identity_id === p.reviewer_identity_id,
      ).status = "revoked";
    },
    (p) => {
      p.grant.status = "revoked";
    },
    (p) => {
      p.grant.effective_until = "2026-09-07T16:00:00.000Z";
    },
    (p) => {
      p.reviewer_identity_id = "identity_missing";
    },
    (p) => {
      p.identities.push({ ...p.identities[1], status: "revoked" });
    },
    (p) => {
      p.grant.scope_ids = ["scope_entity_south"];
    },
    (p) => {
      p.identities[1].identity_kind = "service";
    },
  ];
  for (const [i, mutate] of mutations.entries()) {
    const context = structuredClone(syntheticPackContext());
    mutate(context.profile);
    h.setPackContext(context);
    const before = await h.snapshot();
    for (const op of ["publish", "withdraw"]) {
      const c = {
        ...command(selected, `denied-${i}-${op}`, op),
        expected_publication_profile_hash: sha256Json(context.profile),
      };
      const r = await h.call(post, c);
      assert.equal(
        r.data.error,
        "PACK_REVIEWER_REQUIRED",
        JSON.stringify(r.data),
      );
    }
    assert.deepEqual(await h.snapshot(), before);
    await new PostgresPreparationPackStore(h.pool).assertReady();
  }
  h.setPackContext(syntheticPackContext());
  assert.equal((await h.ok(path)).current.eligible, true);
});
test("D11-B T2 strict commands reject duplicate JSON keys, unknown fields and tampered artifact hashes", async (t) => {
  const { h, path } = await prepared(t),
    v = await h.ok(path),
    c = command(v, "strict"),
    before = await h.snapshot();
  for (const extra of [
    "actor",
    "authorized",
    "profile",
    "rules",
    "identity_records",
  ])
    assert.equal((await h.call(post, { ...c, [extra]: true })).status, 400);
  assert.equal(
    (await h.call(post, { ...c, artifact_hash: `sha256:${"0".repeat(64)}` }))
      .data.error,
    "PACK_BINDING_CONFLICT",
  );
  const body = JSON.stringify(c).replace(
    '"operation":"publish"',
    '"operation":"withdraw","oper\\u0061tion":"publish"',
  );
  const duplicate = await globalThis.fetch(`${h.base}${post}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(duplicate.status, 400);
  assert.deepEqual(await h.snapshot(), before);
});
test("D11-B T5: business changes stale consent while successful no-op keys leave it applicable", async (t) => {
  const { h, d, path } = await prepared(t),
    v = await h.ok(path),
    c = command(v, "before-business");
  await h.ok(post, c);
  const before = await h.ok(path);
  h.setTime("2026-09-07T16:06:00.000Z");
  await h.prepare(await intakeInput("fresh-noop-key"));
  const afterNoop = await h.ok(path);
  assert.equal(afterNoop.candidate_hash, before.candidate_hash);
  assert.equal(afterNoop.current.eligible, true);
  const changed = editQueue(await intakeInput("new-business"), (rows) => {
    rows[0].amount_minor = "1510000";
  });
  await h.prepare(changed);
  const stale = await h.ok(path);
  assert.equal(stale.current.status, "stale");
  assert.equal(stale.current.can_withdraw, true);
  assert.notEqual(stale.candidate_hash, before.candidate_hash);
  assert.equal((await d.get()).current.requires_fresh_review, true);
  assert.deepEqual(
    await h.ok(post, c),
    (await h.ok(path)).history.length
      ? {
          schema_version: "pack-selection-result.v1",
          status: "recorded",
          entry: before.history[0],
          historical_receipt: true,
          authority_granted: false,
          closure_permission: false,
        }
      : null,
  );
});
test("D11-B T5: changed runtime profile/template deny current use without preventing eligible withdrawal", async (t) => {
  const { h, path } = await prepared(t),
    v = await h.ok(path);
  await h.ok(post, command(v, "profile-A"));
  const context = structuredClone(syntheticPackContext());
  context.profile.grant.effective_until = "2026-12-01T00:00:00.000Z";
  context.template_id = "unsupported-template.v2";
  h.setPackContext(context);
  const stale = await h.ok(path);
  assert.equal(stale.current.status, "stale");
  assert.equal(stale.candidate, null);
  assert.equal(stale.current.can_withdraw, true);
  const r = await h.ok(post, command(stale, "withdraw-template", "withdraw"));
  assert.equal(r.entry.result.selected_artifact_hash, null);
  await h.restart();
  assert.equal((await h.ok(path)).current.status, "withdrawn");
});
test("D11-B T6: concurrent commands and keys commit one selection only", async (t) => {
  const { h, path } = await prepared(t),
    v = await h.ok(path),
    c = command(v, "same-key");
  const before = await h.snapshot(),
    same = await Promise.all([h.call(post, c), h.call(post, c)]);
  assert.ok(same.every((r) => r.status === 200));
  assert.deepEqual(same[0].data, same[1].data);
  assert.equal((await h.ok(path)).history.length, 1);
  assert.deepEqual(business(await h.snapshot()), business(before));
  const selected = await h.ok(path),
    a = command(selected, "head-one", "withdraw"),
    b = { ...a, idempotency_key: "head-two" };
  const race = await Promise.all([h.call(post, a), h.call(post, b)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    race.find((r) => r.status === 409).data.error,
    "PACK_HEAD_CONFLICT",
  );
  assert.equal((await h.ok(path)).history.length, 2);
});
for (const fault of [
  { tag: "fr:pack-selection-insert" },
  { tag: "fr:pack-selection-insert", after: true },
  { tag: "COMMIT" },
])
  test(`D11-B T6 rollback: ${JSON.stringify(fault)}`, async (t) => {
    const { h, path } = await prepared(t),
      v = await h.ok(path),
      c = command(v, "failed-write"),
      before = await h.snapshot();
    h.fault(fault);
    assert.equal((await h.call(post, c)).status, 500);
    assert.deepEqual(await h.snapshot(), before);
    await h.restart();
    assert.equal((await h.ok(post, c)).entry.sequence, 1);
  });
test("D11-B T6: lost acknowledgment recovers the original receipt after restart", async (t) => {
  const { h, path } = await prepared(t),
    v = await h.ok(path),
    c = command(v, "lost-response");
  h.fault({ tag: "COMMIT", after: true });
  assert.equal((await h.call(post, c)).status, 500);
  const before = await h.snapshot();
  await h.restart();
  const result = await h.ok(post, c);
  assert.equal(result.entry.sequence, 1);
  assert.deepEqual(await h.snapshot(), before);
});
test("D11-B T7: guarded rollback is fresh approval of an applicable retained artifact", async (t) => {
  const { h, path } = await prepared(t),
    initial = await h.ok(path);
  await h.ok(post, command(initial, "rollback-A"));
  await h.ok(post, command(await h.ok(path), "withdraw-A", "withdraw"));
  h.setTime("2026-09-07T16:07:00.000Z");
  const withdrawn = await h.ok(path),
    before = await h.snapshot();
  assert.equal(withdrawn.rollback_candidates[0].eligible, true);
  const r = await h.ok(
    post,
    command(withdrawn, "restore-A", "rollback", initial.candidate),
  );
  assert.equal(r.entry.sequence, 3);
  assert.equal(r.entry.recorded_at, "2026-09-07T16:07:00.000Z");
  assert.equal((await h.ok(path)).current.eligible, true);
  assert.deepEqual(business(await h.snapshot()), business(before));
});
test("D11-B T8: coherent claim-citation forgery fails replay, readiness and operation reads", async (t) => {
  const { h, path } = await prepared(t),
    v = await h.ok(path),
    result = await h.ok(post, command(v, "tamper"));
  const before = await h.snapshot(),
    changed = structuredClone(result.entry);
  const intervention = changed.artifact.loop_outputs.find(
    (x) => x.id === "Human Intervention Map",
  );
  intervention.citation_ids = changed.artifact.loop_outputs
    .find((x) => x.id === "Population")
    .citation_ids.slice(0, 1);
  const { version, ...versioned } = changed.artifact;
  void version;
  changed.artifact.version = `pack-v1-${sha256Json(versioned).slice(7)}`;
  changed.artifact_hash = sha256Json(changed.artifact);
  changed.command.artifact_hash = changed.artifact_hash;
  changed.command_fingerprint = sha256Json(changed.command);
  changed.id = `pack_selection_${changed.command_fingerprint.slice(7)}`;
  changed.result.selected_artifact_hash = changed.artifact_hash;
  const { hash, ...content } = changed;
  void hash;
  changed.hash = sha256Json(content);
  const columns = packColumns(changed),
    names = Object.keys(columns);
  await h.pg.query(
    "ALTER TABLE preparation_pack_selection DISABLE TRIGGER USER",
  );
  await h.pg.query(
    `UPDATE preparation_pack_selection SET ${names.map((n, i) => `${n}=$${i + 1}`).join(",")}`,
    Object.values(columns),
  );
  await h.pg.query(
    "ALTER TABLE preparation_pack_selection ENABLE TRIGGER USER",
  );
  assert.deepEqual(business(await h.snapshot()), business(before));
  await assert.rejects(
    new PostgresPreparationPackStore(h.pool).assertReady(),
    /reconstruction/,
  );
  assert.equal((await h.call("/readyz")).status, 503);
  assert.equal((await h.call(path)).status, 500);
  await h.restart();
  assert.equal((await h.call(path)).status, 500);
});

import { readFile } from "node:fs/promises";
import { restoreIntakeFixture } from "../tests/helpers/intake-postgres.mjs";
import { validateDiscoveryExport } from "../dist/packages/runtime/src/discovery.js";
import { discoveryColumns } from "../dist/packages/runtime/src/postgres-discovery-store.js";
test("D11-B T8: additive 0007 upgrade preserves checksums, v1/v2 history and successful keys", async (t) => {
  const original = JSON.parse(
      await readFile(
        new URL(
          "../tests/fixtures/discovery/scoped-v1-export.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    retained = validateDiscoveryExport(original);
  const h = await intakeHost(t, { beforePack: true });
  await restoreIntakeFixture(h, retained.intake);
  for (const e of retained.entries)
    await h.pg.query(
      "INSERT INTO discovery_review_journal SELECT * FROM jsonb_populate_record(NULL::discovery_review_journal,$1)",
      [discoveryColumns(e)],
    );
  const old = retained.entries.at(-1),
    b = old.command,
    discoveryPath = `/v1/intake/bundles/${b.bundle_id}/discovery?record_key=${b.record_key}&case_id=${b.case_id}`,
    reviewPath = `/v1/intake/bundles/${b.bundle_id}/discovery-reviews`;
  const before = await h.snapshot(),
    archive = await h.ok(discoveryPath + "&representation=export"),
    checksums = (
      await h.pg.query(
        "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
      )
    ).rows;
  await h.upgrade();
  assert.deepEqual(
    (
      await h.pg.query(
        "SELECT * FROM fieldruntime_schema_migrations ORDER BY version",
      )
    ).rows.slice(0, 7),
    checksums,
  );
  const upgraded = await h.snapshot();
  delete upgraded.preparation_pack_selection;
  assert.deepEqual(upgraded, before);
  assert.deepEqual(
    await h.ok(discoveryPath + "&representation=export"),
    archive,
  );
  assert.deepEqual(
    (await h.ok(reviewPath, b)).entry,
    JSON.parse(JSON.stringify(old)),
  );
  let v = await h.ok(pathFor(b));
  assert.equal(v.current.can_publish, false);
  assert.equal(
    v.candidate.material.manifest.versions.projection,
    "discovery.invoice-dispute.v2",
  );
  await h.ok(
    reviewPath,
    discoveryCommand(await h.ok(discoveryPath), "fresh-v2", "confirm"),
  );
  v = await h.ok(pathFor(b));
  await h.ok(post, command(v, "publish-v2"));
  const packArchive = await h.ok(pathFor(b) + "&representation=export");
  assert.deepEqual(packArchive.discovery.entries.slice(0, 2), original.entries);
  assert.equal(validatePackExport(packArchive).entries.length, 1);
  await h.restart();
  assert.deepEqual(
    await h.ok(pathFor(b) + "&representation=export"),
    packArchive,
  );
});
test("D11-B T5/T8: D-014 and obsolete-prefix forgery preserve earlier legitimate publication", async (t) => {
  const { h, path, brief } = await prepared(t),
    v = await h.ok(path),
    result = await h.ok(post, command(v, "earlier-pack"));
  h.setTime("2026-09-07T16:06:00.000Z");
  const transition = {
    type: "case.transition",
    tenant_id: "tenant_intake_demo",
    case_id: brief.binding.case_id,
    expected_case_version: 1,
    actor_identity_id: "identity_intake_operator",
    idempotency_key: "denied-close",
    correlation_id: "d11_case_change",
    to_state: "resolved",
    reason: "Closure remains unproven",
  };
  const c = await h.call(
    `/v0/tenants/tenant_intake_demo/case-commands`,
    transition,
  );
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(c.data.status, "rejected");
  assert.equal((await h.ok(path)).current.status, "stale");
  await h.restart();
  await new PostgresPreparationPackStore(h.pool).assertReady();
  assert.deepEqual((await h.ok(path)).history[0], result.entry);
  const before = await h.snapshot(),
    changed = structuredClone(result.entry);
  changed.recorded_at = "2026-09-07T16:07:00.000Z";
  const { hash, ...content } = changed;
  void hash;
  changed.hash = sha256Json(content);
  const cols = packColumns(changed),
    names = Object.keys(cols);
  await h.pg.query(
    "ALTER TABLE preparation_pack_selection DISABLE TRIGGER USER",
  );
  await h.pg.query(
    `UPDATE preparation_pack_selection SET ${names.map((n, i) => `${n}=$${i + 1}`).join(",")}`,
    Object.values(cols),
  );
  await h.pg.query(
    "ALTER TABLE preparation_pack_selection ENABLE TRIGGER USER",
  );
  assert.deepEqual(business(await h.snapshot()), business(before));
  await assert.rejects(
    new PostgresPreparationPackStore(h.pool).assertReady(),
    /reconstruction/,
  );
  assert.equal((await h.call(path)).status, 500);
  assert.equal((await h.call("/readyz")).status, 503);
});
test("D11-B T6/T8: reads do not acquire writer locks or change durable state", async (t) => {
  const { h, path } = await prepared(t),
    v = await h.ok(path);
  await h.ok(post, command(v, "read-control"));
  const before = await h.snapshot(),
    ids = h.ids,
    locker = await h.pg.connect();
  try {
    await locker.query("BEGIN");
    await locker.query(
      "SELECT revision FROM runtime_writer_lock WHERE singleton_id=1 FOR UPDATE",
    );
    const start = h.trace.length;
    for (let i = 0; i < 3; i++) {
      const result = await h.ok(path);
      assert.equal(result.history.length, 1);
    }
    await h.ok(path + "&representation=export");
    assert.ok(
      !h.trace
        .slice(start)
        .some((q) => /FOR UPDATE|INSERT|UPDATE runtime_writer_lock/.test(q)),
    );
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
  }
  assert.deepEqual(await h.snapshot(), before);
  assert.equal(h.ids, ids);
});
test("D11-B T5/T6: expiry and current reviewer are rechecked after the command read", async (t) => {
  const { h, path } = await prepared(t),
    v = await h.ok(path),
    c = command(v, "expiry-race"),
    before = await h.snapshot();
  h.setTime("2026-09-07T17:00:00.000Z");
  assert.equal((await h.call(post, c)).data.error, "PACK_EXPIRY_CONFLICT");
  assert.deepEqual(await h.snapshot(), before);
  const context = structuredClone(syntheticPackContext());
  context.profile.grant.status = "revoked";
  h.setPackContext(context);
  assert.equal(
    (await h.call(post, { ...c, effective_until: "2026-09-07T18:00:00.000Z" }))
      .data.error,
    "PACK_PROFILE_CONFLICT",
  );
  assert.deepEqual(await h.snapshot(), before);
});
test("D11-B T5/T6: snapshot read remains coherent across a concurrent descriptive write", async (t) => {
  const { h, d, path } = await prepared(t),
    before = await h.ok(path),
    correction = discoveryCommand(await d.get(), "snapshot-correction");
  let write;
  h.hook(async (sql) => {
    if (!sql.includes("fr:pack-load")) return;
    h.hook(null);
    h.setTime("2026-09-07T16:06:00.000Z");
    write = await h.ok(d.post, correction);
  });
  const read = await h.ok(path);
  assert.equal(write.entry.sequence, 2);
  assert.equal(read.candidate_hash, before.candidate_hash);
  assert.equal(read.candidate.binding.discovery.expected_discovery_revision, 1);
  assert.equal(
    (await h.call(post, command(read, "stale-snapshot"))).status,
    409,
  );
  const fresh = await h.ok(path);
  assert.notEqual(fresh.candidate_hash, read.candidate_hash);
  assert.equal(fresh.current.can_publish, false);
});
test("D11-B T6/T8: clocks cannot backdate new inputs across selection, while exact retries remain read-only", async (t) => {
  const { h, path } = await prepared(t);
  h.setTime("2026-09-07T16:07:00.000Z");
  const v = await h.ok(path),
    c = command(v, "clock-floor"),
    r = await h.ok(post, c),
    before = await h.snapshot();
  h.setTime("2026-09-07T16:06:00.000Z");
  assert.deepEqual(await h.ok(post, c), r);
  assert.deepEqual(await h.snapshot(), before);
  const current = await h.ok(path);
  assert.equal(current.current.eligible, false);
  assert.equal(current.current.can_withdraw, false);
  assert.equal(
    (await h.call(post, command(current, "backdated-withdraw", "withdraw")))
      .data.error,
    "CLOCK_REGRESSION",
  );
  const input = editQueue(await intakeInput("backdated-input"), (rows) => {
    rows[0].amount_minor = "1600000";
  });
  assert.equal((await h.call("/v1/intake/preparations", input)).status, 500);
  assert.deepEqual(await h.snapshot(), before);
  h.setTime("2026-09-07T16:07:00.000Z");
  await h.prepare(input);
  // Equal timestamps permit preserved exact anchors but cannot prove cross-journal order.
  await h.restart();
  assert.equal((await h.call("/readyz")).status, 200);
  assert.equal((await h.ok(path)).current.status, "stale");
});
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("D11-B T1/T8: executable appliance walkthrough survives restart through the real API", async (t) => {
  const h = await intakeHost(t),
    directory = await mkdtemp(join(tmpdir(), "d11-smoke-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "evidence.json"),
    run = (mode) =>
      promisify(execFile)(
        process.execPath,
        ["scripts/smoke-preparation-pack-api.mjs", mode, file],
        { env: { ...process.env, FIELD_RUNTIME_URL: h.base } },
      );
  assert.match((await run("applied")).stdout, /PASS:/);
  const before = await h.snapshot();
  await h.restart();
  assert.match((await run("durable")).stdout, /PASS:/);
  assert.deepEqual(await h.snapshot(), before);
});
