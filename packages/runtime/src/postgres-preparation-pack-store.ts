import {
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  appendPackSelection,
  assertPackState,
  exportPackState,
  normalizePackCommand,
  packResult,
  readPack,
  syntheticPackContext,
  type PackContext,
  type PackState,
  type PackTarget,
} from "./preparation-pack.js";
import { intakeObject, requireIntake, type IntakeObject } from "./intake.js";
import { loadDiscoveryStore } from "./postgres-discovery-store.js";
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
export function packColumns(e: IntakeObject): IntakeObject {
  return {
    tenant_id: e.tenant_id,
    pack_id: e.pack_id,
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
export async function loadPackStore(client: SqlClient): Promise<PackState> {
  const discovery = await loadDiscoveryStore(client);
  try {
    const rows = await client.query<IntakeObject>(
      "/* fr:pack-load */ SELECT * FROM preparation_pack_selection ORDER BY sequence",
    );
    const entries = rows.rows.map((row) => {
      const entry = intakeObject(row.entry);
      for (const [key, value] of Object.entries(packColumns(entry)))
        requireIntake(
          canonicalJson(key === "sequence" ? Number(row[key]) : row[key]) ===
            canonicalJson(value),
          "PACK_INTEGRITY",
          `Stored selection ${key} differs from canonical evidence`,
        );
      return entry;
    });
    const state = { discovery, entries };
    assertPackState(state);
    return state;
  } catch (error) {
    if (error instanceof PostgresStoreError) throw error;
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "Preparation selection evidence failed reconstruction",
      { cause: error },
    );
  }
}
export class PostgresPreparationPackStore {
  constructor(
    readonly pool: SqlPool,
    readonly context: () => PackContext = syntheticPackContext,
  ) {}
  private snapshotContext(): PackContext {
    const context = this.context();
    return { ...context, profile: immutableJson(context.profile) };
  }
  read(target: PackTarget, now: () => Date): Promise<IntakeObject> {
    return authorityTransaction(this.pool, true, async (c) =>
      readPack(
        await loadPackStore(c),
        target,
        now().toISOString(),
        this.snapshotContext(),
      ),
    );
  }
  export(target: PackTarget, now: () => Date): Promise<IntakeObject> {
    return authorityTransaction(this.pool, true, async (c) => {
      const state = await loadPackStore(c);
      readPack(state, target, now().toISOString(), this.snapshotContext());
      return exportPackState(state);
    });
  }
  async assertReady(): Promise<void> {
    await authorityTransaction(this.pool, true, loadPackStore);
  }
  submit(input: unknown, seat: string, now: () => Date): Promise<IntakeObject> {
    const command = normalizePackCommand(input);
    requireIntake(
      ["publication", "intake"].includes(seat),
      "INVALID_INPUT",
      "Choose a known synthetic seat",
    );
    return authorityTransaction(this.pool, false, async (client) => {
      const state = await loadPackStore(client),
        fingerprint = sha256Json(command);
      const previous = state.entries.find(
        (e) =>
          e.pack_id === command.pack_id &&
          e.operation === command.operation &&
          e.idempotency_key === command.idempotency_key,
      );
      if (previous) {
        requireIntake(
          previous.command_fingerprint === fingerprint,
          "IDEMPOTENCY_CONFLICT",
          "Selection key is already bound to another command",
        );
        return packResult(previous);
      }
      const entry = appendPackSelection(
          state,
          command,
          now().toISOString(),
          this.snapshotContext(),
          seat,
        ),
        columns = packColumns(entry),
        names = Object.keys(columns);
      await writeAuthorityRow(
        client,
        `/* fr:pack-selection-insert */ INSERT INTO preparation_pack_selection (${names.join(",")}) VALUES (${names.map((_, i) => `$${String(i + 1)}`).join(",")})`,
        Object.values(columns),
      );
      await writerRevision(client);
      const reloaded = await loadPackStore(client);
      requireIntake(
        reloaded.entries.some((e) => canonicalJson(e) === canonicalJson(entry)),
        "PACK_INTEGRITY",
        "Accepted publication was not retained exactly",
      );
      return packResult(entry);
    });
  }
}
