import {
  canonicalJson,
  assertValidDisputeResultContract,
} from "../../contracts/src/index.js";
import {
  intakeObject as o,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "./intake.js";
import type { SqlClient } from "./postgres-store.js";
export function disputeColumns(e: Obj): Obj {
  return {
    tenant_id: e.tenant_id,
    case_id: e.case_id,
    record_key: e.record_key,
    sequence: e.sequence,
    id: e.id,
    entry_hash: e.hash,
    previous_entry_hash: e.previous_entry_hash,
    operation: e.operation,
    idempotency_key: e.idempotency_key,
    command_fingerprint: e.command_fingerprint,
    recorded_at: e.recorded_at,
    authority_position: e.authority_position,
    authority_state_revision: e.authority_state_revision,
    entry: e,
  };
}
export async function loadDisputeEvidence(c: SqlClient): Promise<Obj[]> {
  const installed = await c.query(
    "SELECT version FROM fieldruntime_schema_migrations WHERE version = '0011_dispute_result'",
  );
  if (!installed.rows.length) return [];
  const rows = await c.query<Obj>(
    "/* fr:result-load */ SELECT * FROM dispute_result_journal ORDER BY case_id,sequence",
  );
  return rows.rows.map((r) => {
    const e = o(r.entry);
    assertValidDisputeResultContract("entry", e);
    ensure(
      !["request_authority", "review_authority"].includes(String(e.operation)),
      "RESULT_INTEGRITY",
      "Authority receipts cannot be persisted in O",
    );
    for (const [k, v] of Object.entries(disputeColumns(e)))
      ensure(
        canonicalJson(
          [
            "sequence",
            "authority_position",
            "authority_state_revision",
          ].includes(k)
            ? Number(r[k])
            : r[k],
        ) === canonicalJson(v),
        "RESULT_INTEGRITY",
        `Result ${k} index drift`,
      );
    return e;
  });
}
