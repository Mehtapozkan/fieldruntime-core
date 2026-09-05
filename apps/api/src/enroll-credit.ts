import { Pool } from "pg";
import { PostgresAuthorityStore } from "../../../packages/runtime/src/postgres-authority-store.js";
import { PostgresSimulatedCreditStore } from "../../../packages/runtime/src/postgres-simulated-credit-store.js";
import { assertSafeConfiguration, PgPoolAdapter } from "./main.js";
// Local CLI only. No input document, actor overrides, or HTTP catalog editor.
async function enroll(): Promise<void> {
  if (process.argv.length !== 2)
    throw new Error("D7 enrollment accepts no overrides");
  const config = assertSafeConfiguration(process.env);
  const pg = new Pool({ connectionString: config.databaseUrl }),
    pool = new PgPoolAdapter(pg);
  try {
    await new PostgresSimulatedCreditStore(pool).assertReady();
    const status = await new PostgresAuthorityStore(pool).enrollSimulatedCredit(
      () => new Date(),
    );
    process.stdout.write(
      `${status}: Orchid simulated-credit profile. Fresh review is required after catalog changes. Check committed effects through the independent verification API.\n`,
    );
  } finally {
    await pg.end();
  }
}
if (import.meta.main)
  void enroll().catch(() => {
    process.stderr.write(
      "D7 enrollment failed; existing records were preserved.\n",
    );
    process.exitCode = 1;
  });
