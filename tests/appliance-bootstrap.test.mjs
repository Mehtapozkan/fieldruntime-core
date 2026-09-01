import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplianceBootstrapError,
  applyMigration,
  createMigrationSource,
} from "../dist/apps/worker/src/bootstrap.js";

function pool(existingChecksums = []) {
  const calls = [];
  let released = false;
  const client = {
    async query(statement, values = []) {
      calls.push({ statement, values });
      if (statement.startsWith("SELECT checksum")) {
        return {
          rows: existingChecksums.map((checksum) => ({ checksum })),
          rowCount: existingChecksums.length,
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {
      released = true;
    },
  };
  return {
    calls,
    client,
    get released() {
      return released;
    },
    async connect() {
      return client;
    },
  };
}

test("migration sources have stable content checksums", () => {
  const first = createMigrationSource("0001_local_appliance", "SELECT 1;\n");
  const second = createMigrationSource("0001_local_appliance", "SELECT 1;\n");
  const changed = createMigrationSource("0001_local_appliance", "SELECT 2;\n");

  assert.equal(first.checksum, second.checksum);
  assert.notEqual(first.checksum, changed.checksum);
  assert.match(first.checksum, /^sha256:[a-f0-9]{64}$/);
});

test("a new migration and its ledger entry commit atomically", async () => {
  const database = pool();
  const migration = createMigrationSource(
    "0001_local_appliance",
    "CREATE TABLE example (id text PRIMARY KEY);",
  );

  assert.equal(await applyMigration(database, migration), "applied");
  assert.equal(database.released, true);
  assert.equal(
    database.calls[0].statement,
    "BEGIN ISOLATION LEVEL READ COMMITTED",
  );
  assert.ok(
    database.calls.some(({ statement }) => statement === migration.sql),
  );
  assert.equal(database.calls.at(-1).statement, "COMMIT");
});

test("an exact migration retry is a no-op and changed history fails closed", async () => {
  const migration = createMigrationSource(
    "0001_local_appliance",
    "CREATE TABLE example (id text PRIMARY KEY);",
  );
  const unchanged = pool([migration.checksum]);
  assert.equal(await applyMigration(unchanged, migration), "unchanged");
  assert.equal(
    unchanged.calls.some(({ statement }) => statement === migration.sql),
    false,
  );

  const changed = pool([
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  ]);
  await assert.rejects(
    () => applyMigration(changed, migration),
    ApplianceBootstrapError,
  );
  assert.equal(changed.calls.at(-1).statement, "ROLLBACK");
  assert.equal(changed.released, true);
});
