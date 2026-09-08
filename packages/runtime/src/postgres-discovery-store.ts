import { canonicalJson, sha256Json } from "../../contracts/src/index.js";
import {
  appendDiscovery,
  assertDiscoveryState,
  discoveryResult,
  exportDiscoveryState,
  normalizeDiscoveryCommand,
  readDiscovery,
  type DiscoveryState,
} from "./discovery.js";
import { intakeObject, requireIntake, type IntakeObject } from "./intake.js";
import { loadIntakeStore } from "./postgres-intake-store.js";
import {
  authorityTransaction,
  writeAuthorityRow,
  writerRevision,
} from "./postgres-authority-store.js";
import {
  PostgresStoreError,
  type SqlClient,
  type SqlPool,
} from "./postgres-store.js";
export function discoveryColumns(e: IntakeObject): IntakeObject {
  return {
    tenant_id: e.tenant_id,
    intake_scope_id: e.intake_scope_id,
    case_id: e.case_id,
    sequence: e.sequence,
    id: e.id,
    entry_hash: e.hash,
    previous_entry_hash: e.previous_entry_hash,
    operation: e.operation,
    idempotency_key: e.idempotency_key,
    command_fingerprint: e.command_fingerprint,
    recorded_at: e.recorded_at,
    entry: e,
  };
}
export async function loadDiscoveryStore(
  client: SqlClient,
): Promise<DiscoveryState> {
  const intake = await loadIntakeStore(client);
  try {
    const rows = await client.query<IntakeObject>(
      "/* fr:discovery-load */ SELECT * FROM discovery_review_journal ORDER BY case_id, sequence",
    );
    const entries = rows.rows.map((r) => {
      const e = intakeObject(r.entry);
      for (const [k, v] of Object.entries(discoveryColumns(e)))
        requireIntake(
          canonicalJson(k === "sequence" ? Number(r[k]) : r[k]) ===
            canonicalJson(v),
          "DISCOVERY_INTEGRITY",
          `Stored Discovery ${k} differs from canonical evidence`,
        );
      return e;
    });
    const state = { intake, entries };
    assertDiscoveryState(state);
    return state;
  } catch (error) {
    if (error instanceof PostgresStoreError) throw error;
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "Discovery evidence failed reconstruction",
      { cause: error },
    );
  }
}
export class PostgresDiscoveryStore {
  constructor(readonly pool: SqlPool) {}
  read(
    bundleId: string,
    key: string,
    caseId: string | null,
  ): Promise<IntakeObject> {
    return authorityTransaction(this.pool, true, async (c) =>
      readDiscovery(await loadDiscoveryStore(c), bundleId, key, caseId),
    );
  }
  export(
    bundleId: string,
    key: string,
    caseId: string | null,
  ): Promise<IntakeObject> {
    return authorityTransaction(this.pool, true, async (c) => {
      const state = await loadDiscoveryStore(c);
      readDiscovery(state, bundleId, key, caseId);
      return exportDiscoveryState(state);
    });
  }
  async assertReady(): Promise<void> {
    await authorityTransaction(this.pool, true, loadDiscoveryStore);
  }
  submit(
    bundleId: string,
    input: unknown,
    now: () => Date,
  ): Promise<IntakeObject> {
    const command = normalizeDiscoveryCommand(input);
    requireIntake(
      command.bundle_id === bundleId,
      "INVALID_INPUT",
      "Command and route select different retained bundles",
    );
    return authorityTransaction(this.pool, false, async (client) => {
      const state = await loadDiscoveryStore(client),
        fingerprint = sha256Json(command);
      const existing = state.entries.find(
        (e) =>
          e.operation === command.operation &&
          e.idempotency_key === command.idempotency_key,
      );
      if (existing) {
        requireIntake(
          existing.command_fingerprint === fingerprint,
          "IDEMPOTENCY_CONFLICT",
          "Discovery key is already bound to different submitted material",
        );
        return discoveryResult(existing);
      }
      const entry = appendDiscovery(state, command, now().toISOString()),
        columns = discoveryColumns(entry),
        names = Object.keys(columns);
      await writeAuthorityRow(
        client,
        `/* fr:discovery-insert */ INSERT INTO discovery_review_journal (${names.join(",")}) VALUES (${names.map((_, i) => `$${String(i + 1)}`).join(",")})`,
        Object.values(columns),
      );
      await writerRevision(client);
      const reloaded = await loadDiscoveryStore(client);
      requireIntake(
        reloaded.entries.some((e) => canonicalJson(e) === canonicalJson(entry)),
        "DISCOVERY_INTEGRITY",
        "Accepted review was not retained exactly",
      );
      return discoveryResult(entry);
    });
  }
}
