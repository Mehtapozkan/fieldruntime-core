import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createEvaluationFixtureRecord,
  FixtureCatalogError,
  loadEvaluationFixture,
} from "../dist/apps/worker/src/fixture-catalog.js";

const fixture = JSON.parse(
  await readFile(
    new URL(
      "../packages/ecc-pack/fixtures/acme-sso-needs-review.case.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function client(existing = []) {
  const calls = [];
  return {
    calls,
    async query(text, values = []) {
      calls.push({ text, values });
      return text.startsWith("SELECT")
        ? { rows: existing, rowCount: existing.length }
        : { rows: [], rowCount: 1 };
    },
  };
}

test("the built-in ECC snapshot becomes a stable read-only catalog record", () => {
  const first = createEvaluationFixtureRecord(fixture);
  const second = createEvaluationFixtureRecord(structuredClone(fixture));

  assert.equal(first.fixture_id, "case_acme_sso_001");
  assert.equal(first.tenant_id, "tenant_orchid");
  assert.equal(first.pack_version, "0.1.0");
  assert.match(first.fixture_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.fixture_hash, second.fixture_hash);
});

test("fixture loading inserts once and exact reloading is a no-op", async () => {
  const record = createEvaluationFixtureRecord(fixture);
  const empty = client();
  assert.equal(await loadEvaluationFixture(empty, record), "inserted");
  assert.equal(empty.calls.length, 2);

  const existing = client([
    {
      fixture_hash: record.fixture_hash,
      pack_id: record.pack_id,
      pack_version: record.pack_version,
      tenant_id: record.tenant_id,
      case_id: record.case_id,
    },
  ]);
  assert.equal(await loadEvaluationFixture(existing, record), "unchanged");
  assert.equal(existing.calls.length, 1);
});

test("fixture identity is immutable and unsafe fixture state fails closed", async () => {
  const record = createEvaluationFixtureRecord(fixture);
  const changed = client([
    {
      fixture_hash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      pack_id: record.pack_id,
      pack_version: record.pack_version,
      tenant_id: record.tenant_id,
      case_id: record.case_id,
    },
  ]);
  await assert.rejects(
    () => loadEvaluationFixture(changed, record),
    FixtureCatalogError,
  );

  const changedVersion = client([
    {
      fixture_hash: record.fixture_hash,
      pack_id: record.pack_id,
      pack_version: "0.2.0",
      tenant_id: record.tenant_id,
      case_id: record.case_id,
    },
  ]);
  await assert.rejects(
    () => loadEvaluationFixture(changedVersion, record),
    FixtureCatalogError,
  );

  const active = structuredClone(fixture);
  active.workflow_version.status = "active";
  assert.throws(() => createEvaluationFixtureRecord(active), /active workflow/);

  const executed = structuredClone(fixture);
  executed.action_proposals[0].status = "executed";
  assert.throws(() => createEvaluationFixtureRecord(executed));
});
