import { createHash } from "node:crypto";
import type {
  SqlClient,
  SqlPool,
} from "../../../packages/runtime/src/index.js";
import {
  loadEvaluationFixture,
  type EvaluationFixtureRecord,
} from "./fixture-catalog.js";

export interface MigrationSource {
  readonly version: string;
  readonly sql: string;
  readonly checksum: `sha256:${string}`;
}

export class ApplianceBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplianceBootstrapError";
  }
}

export function createMigrationSource(
  version: string,
  sql: string,
): MigrationSource {
  if (!/^[0-9]{4}_[a-z0-9_]+$/.test(version) || sql.trim().length === 0) {
    throw new ApplianceBootstrapError("migration source is invalid");
  }
  return Object.freeze({
    version,
    sql,
    checksum: `sha256:${createHash("sha256").update(sql).digest("hex")}`,
  });
}

async function rollback(
  client: SqlClient,
  error: unknown,
  releaseState: { discarded: boolean },
): Promise<never> {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    releaseState.discarded = true;
    client.release(true);
    throw new AggregateError(
      [error, rollbackError],
      "migration and rollback both failed",
      { cause: rollbackError },
    );
  }
  throw error;
}

export async function applyMigration(
  pool: SqlPool,
  migration: MigrationSource,
): Promise<"applied" | "unchanged"> {
  const client = await pool.connect();
  let transactionOpen = false;
  const releaseState = { discarded: false };
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    transactionOpen = true;
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended(
         'fieldruntime-local-appliance-migrations', 0
       ))`,
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS fieldruntime_schema_migrations (
         version text PRIMARY KEY,
         checksum text NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const existing = await client.query<{ readonly checksum: unknown }>(
      `SELECT checksum
         FROM fieldruntime_schema_migrations
        WHERE version = $1`,
      [migration.version],
    );
    const row = existing.rows[0];
    if (row !== undefined) {
      if (row.checksum !== migration.checksum) {
        throw new ApplianceBootstrapError(
          "an applied migration has a different checksum",
        );
      }
      await client.query("COMMIT");
      transactionOpen = false;
      return "unchanged";
    }
    await client.query(migration.sql);
    await client.query(
      `INSERT INTO fieldruntime_schema_migrations (version, checksum)
       VALUES ($1, $2)`,
      [migration.version, migration.checksum],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    return "applied";
  } catch (error) {
    if (transactionOpen) {
      return await rollback(client, error, releaseState);
    }
    throw error;
  } finally {
    if (!releaseState.discarded) client.release();
  }
}

export async function bootstrapAppliance(
  pool: SqlPool,
  migration: MigrationSource | readonly MigrationSource[],
  fixture: EvaluationFixtureRecord,
): Promise<void> {
  const migrations: readonly MigrationSource[] = Array.isArray(migration)
    ? (migration as readonly MigrationSource[])
    : [migration as MigrationSource];
  for (const source of migrations) await applyMigration(pool, source);
  const client = await pool.connect();
  let transactionOpen = false;
  const releaseState = { discarded: false };
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    transactionOpen = true;
    await loadEvaluationFixture(client, fixture);
    await client.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      return await rollback(client, error, releaseState);
    }
    throw error;
  } finally {
    if (!releaseState.discarded) client.release();
  }
}

export async function applianceIsReady(
  pool: SqlPool,
  migration: MigrationSource | readonly MigrationSource[],
  fixture: EvaluationFixtureRecord,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    const migrations: readonly MigrationSource[] = Array.isArray(migration)
      ? (migration as readonly MigrationSource[])
      : [migration as MigrationSource];
    for (const source of migrations) {
      const migrationResult = await client.query<{
        readonly checksum: unknown;
      }>(
        `SELECT checksum
         FROM fieldruntime_schema_migrations
        WHERE version = $1`,
        [source.version],
      );
      if (migrationResult.rows[0]?.checksum !== source.checksum) return false;
    }
    const fixtureResult = await client.query<{
      readonly fixture_hash: unknown;
    }>(
      `SELECT fixture_hash
         FROM evaluation_demo_fixtures
        WHERE fixture_id = $1 AND pack_version = $2`,
      [fixture.fixture_id, fixture.pack_version],
    );
    return fixtureResult.rows[0]?.fixture_hash === fixture.fixture_hash;
  } finally {
    client.release();
  }
}
