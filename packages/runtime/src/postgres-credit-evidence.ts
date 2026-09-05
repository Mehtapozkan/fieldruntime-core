import { json, object } from "./authority-review-types.js";
import {
  creditAssert,
  creditSame,
  type CreditState,
} from "./simulated-credit.js";
import type { SqlClient } from "./postgres-store.js";

export const CREDIT_COLUMNS = [
  "id",
  "sequence",
  "tenant_id",
  "case_id",
  "slot",
  "authority_request_id",
  "review_revision",
  "review_head_hash",
  "case_version",
  "case_head_hash",
  "catalog_hash",
  "authority_state_revision",
  "authority_position",
  "recorded_at",
  "previous_event_hash",
  "event_hash",
  "envelope_hash",
  "idempotency_key",
  "command_fingerprint",
] as const;
const NUMBERS = new Set([
  "sequence",
  "review_revision",
  "case_version",
  "authority_state_revision",
  "authority_position",
]);
// Pre-0003 stores remain readable while an existing preview is being migrated.
// A recorded migration can never silently lose its source/journal tables.
export async function loadCreditEvidence(
  client: SqlClient,
  required = false,
): Promise<CreditState> {
  const tables = await client.query<Record<string, unknown>>(
    "/* fr:credit-tables */ SELECT to_regclass('simulated_action_journal') AS journal, to_regclass('simulated_credit_source') AS source",
  );
  if (!tables.rows[0]?.journal || !tables.rows[0].source) {
    const installed = await client.query(
      "SELECT version FROM fieldruntime_schema_migrations WHERE version = '0003_simulated_credit'",
    );
    creditAssert(
      !required && installed.rows.length === 0,
      "simulated credit migration/tables missing",
    );
    return { entries: [], sources: [] };
  }
  const journal = await client.query<Record<string, unknown>>(
    "/* fr:credit-load-journal */ SELECT * FROM simulated_action_journal ORDER BY sequence",
  );
  const source = await client.query<Record<string, unknown>>(
    "/* fr:credit-load-source */ SELECT * FROM simulated_credit_source ORDER BY origin_attempt_id",
  );
  for (const row of journal.rows) {
    const entry = object(row.entry);
    for (const key of CREDIT_COLUMNS)
      creditAssert(
        creditSame(NUMBERS.has(key) ? Number(row[key]) : row[key], entry[key]),
        `credit indexed ${key} drift`,
      );
  }
  for (const row of source.rows) {
    const value = object(row.source_row),
      target = object(value.target);
    for (const key of ["tenant_id", "case_id", "slot"])
      creditAssert(row[key] === target[key], "credit source target drift");
    creditAssert(
      row.origin_attempt_id === value.origin_attempt_id &&
        row.row_hash === value.row_hash,
      "credit source index drift",
    );
  }
  return {
    entries: journal.rows.map((r) => json(r.entry)),
    sources: source.rows.map((r) => json(r.source_row)),
  };
}
