import { readFile } from "node:fs/promises";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import {
  PostgresCaseStore,
  type SqlClient,
  type SqlPool,
  type SqlQueryResult,
} from "../../../packages/runtime/src/index.js";
import {
  applianceIsReady,
  bootstrapAppliance,
  createMigrationSource,
} from "../../worker/src/bootstrap.js";
import { TransactionalCaseWorker } from "../../worker/src/command-service.js";
import {
  createEvaluationFixtureRecord,
  getEvaluationFixture,
} from "../../worker/src/fixture-catalog.js";
import { createGuidedWalkthroughRecord } from "../../worker/src/guided-walkthrough.js";
import { createApiServer } from "./server.js";
import { loadWorkbenchAssets } from "./workbench-assets.js";

interface Environment {
  readonly DATABASE_URL?: string;
  readonly FIELD_RUNTIME_BIND?: string;
  readonly FIELD_RUNTIME_EXTERNAL_WRITES?: string;
  readonly FIELD_RUNTIME_MODE?: string;
  readonly FIELD_RUNTIME_PORT?: string;
}

interface SafeConfiguration {
  readonly databaseUrl: string;
  readonly bind: "0.0.0.0" | "127.0.0.1";
  readonly port: number;
}

const LOCAL_DATABASE_HOSTS = new Set([
  "127.0.0.1",
  "[::1]",
  "localhost",
  "postgres",
]);

export function assertSafeConfiguration(
  environment: Environment,
): SafeConfiguration {
  if (
    environment.FIELD_RUNTIME_MODE !== "simulation" ||
    environment.FIELD_RUNTIME_EXTERNAL_WRITES !== "false"
  ) {
    throw new Error(
      "local appliance requires simulation mode with external writes disabled",
    );
  }
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required");
  }
  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must identify the local PostgreSQL service");
  }
  if (
    (parsedDatabaseUrl.protocol !== "postgresql:" &&
      parsedDatabaseUrl.protocol !== "postgres:") ||
    !LOCAL_DATABASE_HOSTS.has(parsedDatabaseUrl.hostname.toLowerCase()) ||
    parsedDatabaseUrl.username.length === 0 ||
    parsedDatabaseUrl.password.length === 0 ||
    parsedDatabaseUrl.pathname.length <= 1 ||
    parsedDatabaseUrl.search.length > 0 ||
    parsedDatabaseUrl.hash.length > 0
  ) {
    throw new Error("DATABASE_URL must identify the local PostgreSQL service");
  }
  const bind = environment.FIELD_RUNTIME_BIND ?? "127.0.0.1";
  if (bind !== "127.0.0.1" && bind !== "0.0.0.0") {
    throw new Error(
      "FIELD_RUNTIME_BIND must be a supported local bind address",
    );
  }
  if (bind === "0.0.0.0" && parsedDatabaseUrl.hostname !== "postgres") {
    throw new Error(
      "FIELD_RUNTIME_BIND=0.0.0.0 is allowed only inside the Compose appliance",
    );
  }
  const port = Number(environment.FIELD_RUNTIME_PORT ?? "3210");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("FIELD_RUNTIME_PORT must be a valid TCP port");
  }
  return Object.freeze({ databaseUrl, bind, port });
}

class PgClientAdapter implements SqlClient {
  readonly #client: PoolClient;

  constructor(client: PoolClient) {
    this.#client = client;
  }

  async query<Row = QueryResultRow>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.#client.query(
      statement,
      values === undefined ? undefined : [...values],
    );
    return {
      rows: result.rows as readonly Row[],
      rowCount: result.rowCount,
    };
  }

  release(discard = false): void {
    this.#client.release(discard);
  }
}

class PgPoolAdapter implements SqlPool {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async connect(): Promise<SqlClient> {
    return new PgClientAdapter(await this.#pool.connect());
  }
}

async function start(): Promise<void> {
  const configuration = assertSafeConfiguration(process.env);
  const [migrationSql, fixtureDocument, walkthroughDocument] =
    await Promise.all([
      readFile(
        new URL(
          "../../../packages/runtime/migrations/0001_local_appliance.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../packages/ecc-pack/fixtures/acme-sso-needs-review.case.json",
          import.meta.url,
        ),
        "utf8",
      ).then((value) => JSON.parse(value) as unknown),
      readFile(
        new URL(
          "../../../packages/ecc-pack/fixtures/acme-sso-guided-walkthrough.v0.json",
          import.meta.url,
        ),
        "utf8",
      ).then((value) => JSON.parse(value) as unknown),
    ]);
  const migration = createMigrationSource("0001_local_appliance", migrationSql);
  const fixture = createEvaluationFixtureRecord(fixtureDocument);
  const walkthrough = createGuidedWalkthroughRecord(
    walkthroughDocument,
    fixtureDocument,
  );
  const pgPool = new Pool({ connectionString: configuration.databaseUrl });
  const pool = new PgPoolAdapter(pgPool);
  await bootstrapAppliance(pool, migration, fixture);

  const store = new PostgresCaseStore(pool);
  const worker = new TransactionalCaseWorker(store);
  const workbenchAssets = await loadWorkbenchAssets();
  const server = createApiServer(
    {
      isReady: async () => {
        if (!(await applianceIsReady(pool, migration, fixture))) return false;
        await store.assertReady();
        return true;
      },
      executeCaseCommand: async (_tenantId, command) =>
        await worker.execute(command),
      listCases: async (tenantId) => await store.listCases(tenantId),
      getCase: async (tenantId, caseId) =>
        await store.getCase(tenantId, caseId),
      getJournal: async (tenantId, caseId) =>
        await store.getJournal(tenantId, caseId),
      getEvaluationFixture: async (fixtureId) => {
        const client = await pool.connect();
        try {
          return await getEvaluationFixture(client, fixtureId);
        } finally {
          client.release();
        }
      },
      getGuidedWalkthrough: (walkthroughId) =>
        Promise.resolve(
          walkthroughId === walkthrough.walkthrough_id
            ? walkthrough
            : undefined,
        ),
    },
    workbenchAssets,
  );
  server.listen(configuration.port, configuration.bind, () => {
    process.stdout.write(
      `Field Runtime local evaluation API listening on ${configuration.bind}:${String(configuration.port)}\n`,
    );
  });

  const stop = (): void => {
    server.close(() => {
      void pgPool.end().finally(() => {
        process.exitCode = 0;
      });
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (import.meta.main) {
  void start().catch(() => {
    process.stderr.write("Field Runtime local appliance failed to start.\n");
    process.exitCode = 1;
  });
}
