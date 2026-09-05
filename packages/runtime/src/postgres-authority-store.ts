import { loadCreditEvidence } from "./postgres-credit-evidence.js";
import {
  assertCreditIntegrity,
  enrollCreditCatalog,
  type CreditState,
} from "./simulated-credit.js";
import {
  assertValidAuthorityReviewContract,
  canonicalJson,
  immutableJson,
} from "../../contracts/src/index.js";
import {
  loadTrustedEngineState,
  PostgresStoreError,
  type SqlClient,
  type SqlPool,
} from "./postgres-store.js";
import {
  assertAuthorityStateIntegrity,
  executeAuthorityCommand,
  normalizeAuthorityCatalogData,
  readAuthorityRequest,
  reviewSnapshot,
  type AuthorityCommandResult,
} from "./authority-review.js";
import {
  AuthorityReviewError,
  integer,
  json,
  object,
  string,
  type AuthorityCatalogHead,
  type AuthorityState,
  type ObjectValue,
  type ReviewActor,
  type ReviewDependencies,
  type ReviewSnapshot,
} from "./authority-review-types.js";
import type { CaseEngineState } from "./case-engine.js";

export interface StoredState {
  readonly credit: CreditState;
  readonly cases: CaseEngineState;
  readonly authority: AuthorityState;
  readonly heads: readonly AuthorityCatalogHead[];
}
type Row = Record<string, unknown>;
function same(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
function storedInteger(value: unknown): number {
  return integer(typeof value === "string" ? Number(value) : value);
}
function assertStored(condition: boolean, message: string): asserts condition {
  if (!condition) throw new PostgresStoreError("STORE_INTEGRITY", message);
}
function journalColumns(entry: ObjectValue, state: AuthorityState): Row {
  const creation = state.entries.find(
    (item) =>
      item.tenant_id === entry.tenant_id &&
      item.authority_request_id === entry.authority_request_id &&
      item.review_revision === 0,
  );
  const request = object(creation?.request);
  const evaluation = state.snapshots.find(
    (item) =>
      item.hash === entry.evaluation_snapshot_hash &&
      item.tenant_id === entry.tenant_id,
  );
  assertStored(evaluation !== undefined, "missing authority evaluation");
  return {
    id: entry.id,
    position: entry.position,
    tenant_id: entry.tenant_id,
    case_id: entry.case_id,
    case_version: request.case_version,
    case_head_hash: evaluation.content.case_journal_head_hash,
    authority_request_id: entry.authority_request_id,
    review_revision: entry.review_revision,
    authority_decision_id:
      entry.decision === undefined
        ? null
        : object(entry.decision).authority_decision_id,
    request_binding_hash: entry.request_binding_hash,
    previous_event_hash: entry.previous_event_hash,
    event_hash: entry.event_hash,
    evaluation_snapshot_hash: entry.evaluation_snapshot_hash,
    material_snapshot_hash: request.review_material_hash,
    idempotency_key: entry.idempotency_key,
    command_fingerprint: entry.command_fingerprint,
    replaces_entry_id: entry.replaces_entry_id ?? null,
    replacement_creation_entry_id: entry.replacement_creation_entry_id ?? null,
  };
}

export async function loadAuthorityStore(
  client: SqlClient,
  requireCreditMigration = false,
): Promise<StoredState> {
  const cases = await loadTrustedEngineState(client);
  const catalogs = await client.query<Row>(
    "/* fr:authority-load-catalog */ SELECT * FROM authority_catalog ORDER BY tenant_id",
  );
  const snapshots = await client.query<Row>(
    "/* fr:authority-load-snapshots */ SELECT tenant_id, snapshot_hash, kind, content FROM authority_snapshots ORDER BY tenant_id, snapshot_hash",
  );
  const journal = await client.query<Row>(
    "/* fr:authority-load-journal */ SELECT * FROM authority_request_journal ORDER BY position",
  );
  const heads: AuthorityCatalogHead[] = catalogs.rows.map((row) => ({
    tenant_id: string(row.tenant_id),
    revision: storedInteger(row.revision),
    snapshot_hash: string(row.snapshot_hash),
    last_recorded_at: string(row.last_recorded_at),
  }));
  const authority: AuthorityState = immutableJson({
    entries: journal.rows.map((row) => json(row.entry)),
    snapshots: snapshots.rows.map((row) => {
      assertStored(
        row.kind === "catalog" ||
          row.kind === "material" ||
          row.kind === "evaluation",
        "unknown authority snapshot kind",
      );
      return {
        tenant_id: string(row.tenant_id),
        hash: string(row.snapshot_hash),
        kind: row.kind,
        content: json(row.content),
      };
    }),
  });
  const credit = await loadCreditEvidence(client, requireCreditMigration);
  try {
    assertAuthorityStateIntegrity(authority, cases, heads, credit.entries);
    assertCreditIntegrity({ cases, authority, heads, credit });
    for (const row of journal.rows) {
      const columns = journalColumns(json(row.entry), authority);
      for (const [key, expected] of Object.entries(columns)) {
        const actual = ["position", "case_version", "review_revision"].includes(
          key,
        )
          ? storedInteger(row[key])
          : row[key];
        assertStored(same(actual, expected), `authority journal ${key} drift`);
      }
    }
  } catch (error) {
    if (error instanceof PostgresStoreError) throw error;
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "authority history failed replay validation",
      { cause: error },
    );
  }
  return { cases, authority, heads, credit };
}
export async function writeAuthorityRow(
  client: SqlClient,
  statement: string,
  values: readonly unknown[],
): Promise<void> {
  const result = await client.query(statement, values);
  if (result.rowCount !== 1)
    throw new PostgresStoreError(
      "STORE_CONFLICT",
      "authority write affected unexpected rows",
    );
}
async function persistSnapshot(
  client: SqlClient,
  snapshot: ReviewSnapshot,
): Promise<void> {
  await writeAuthorityRow(
    client,
    `/* fr:authority-insert-snapshot */ INSERT INTO authority_snapshots (tenant_id, snapshot_hash, kind, content) VALUES ($1, $2, $3, $4)`,
    [snapshot.tenant_id, snapshot.hash, snapshot.kind, snapshot.content],
  );
}
export async function writerRevision(client: SqlClient): Promise<void> {
  await writeAuthorityRow(
    client,
    "/* fr:authority-increment-writer */ UPDATE runtime_writer_lock SET revision = revision + 1 WHERE singleton_id = 1",
    [],
  );
}
export async function authorityTransaction<T>(
  pool: SqlPool,
  readOnly: boolean,
  operation: (client: SqlClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let opened = false;
  const releaseState = { discarded: false };
  try {
    await client.query(
      readOnly
        ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
        : "BEGIN ISOLATION LEVEL READ COMMITTED",
    );
    opened = true;
    const lock = await client.query<Row>(
      readOnly
        ? "/* fr:authority-read-writer */ SELECT revision FROM runtime_writer_lock WHERE singleton_id = 1"
        : "/* fr:authority-lock-writer */ SELECT revision FROM runtime_writer_lock WHERE singleton_id = 1 FOR UPDATE",
    );
    assertStored(lock.rows.length === 1, "missing singleton writer record");
    storedInteger(lock.rows[0]?.revision);
    const result = await operation(client);
    await client.query("COMMIT");
    opened = false;
    return result;
  } catch (error) {
    if (opened) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseState.discarded = true;
        client.release(true);
        throw new AggregateError(
          [error, rollbackError],
          "authority transaction and rollback failed",
          { cause: rollbackError },
        );
      }
    }
    throw error;
  } finally {
    if (!releaseState.discarded) client.release();
  }
}

export class PostgresAuthorityStore {
  constructor(readonly pool: SqlPool) {}

  async execute(
    command: unknown,
    actorKey: ReviewActor,
    dependencies: ReviewDependencies,
  ): Promise<AuthorityCommandResult> {
    assertValidAuthorityReviewContract("command", command);
    return authorityTransaction(this.pool, false, async (client) => {
      const before = await loadAuthorityStore(client);
      const head = before.heads.find(
        (item) => item.tenant_id === command.tenant_id,
      );
      if (head === undefined)
        return {
          status: "conflict",
          code: "tenant_not_enrolled",
          state: before.authority,
          entries: [],
          receipt: json({
            code: "tenant_not_enrolled",
            action_permission: false,
          }),
        };
      const result = executeAuthorityCommand(
        before.authority,
        before.cases,
        head,
        command,
        actorKey,
        dependencies,
      );
      if (result.status !== "applied") return result;
      for (const item of result.state.snapshots)
        if (
          !before.authority.snapshots.some(
            (existing) => existing.hash === item.hash,
          )
        )
          await persistSnapshot(client, item);
      for (const entry of result.entries) {
        const columns = { ...journalColumns(entry, result.state), entry };
        const names = Object.keys(columns);
        await writeAuthorityRow(
          client,
          `/* fr:authority-insert-journal */ INSERT INTO authority_request_journal (${names.join(", ")}) VALUES (${names.map((_, i) => `$${String(i + 1)}`).join(", ")})`,
          Object.values(columns),
        );
      }
      const last = result.entries.at(-1);
      await writeAuthorityRow(
        client,
        `/* fr:authority-clock */ UPDATE authority_catalog SET last_recorded_at = $2 WHERE tenant_id = $1 AND revision = $3 AND snapshot_hash = $4`,
        [head.tenant_id, last?.recorded_at, head.revision, head.snapshot_hash],
      );
      await writerRevision(client);
      const persisted = await loadAuthorityStore(client);
      assertStored(
        same(persisted.authority.entries, result.state.entries) &&
          same(persisted.cases, before.cases),
        "authority commit changed unexpected state",
      );
      assertStored(
        same(
          [...persisted.authority.snapshots].sort((a, b) =>
            a.hash.localeCompare(b.hash),
          ),
          [...result.state.snapshots].sort((a, b) =>
            a.hash.localeCompare(b.hash),
          ),
        ),
        "authority snapshot persistence drift",
      );
      return result;
    });
  }

  async readRequest(
    tenantId: string,
    requestId: string,
    now: () => Date,
  ): Promise<ObjectValue | undefined> {
    return authorityTransaction(this.pool, true, async (client) => {
      const stored = await loadAuthorityStore(client);
      const head = stored.heads.find((item) => item.tenant_id === tenantId);
      return head === undefined
        ? undefined
        : readAuthorityRequest(
            stored.authority,
            stored.cases,
            head,
            requestId,
            now(),
          );
    });
  }

  async readCatalogRevision(tenantId: string): Promise<number | undefined> {
    return authorityTransaction(
      this.pool,
      true,
      async (client) =>
        (await loadAuthorityStore(client)).heads.find(
          (head) => head.tenant_id === tenantId,
        )?.revision,
    );
  }

  async assertReady(tenantId: string): Promise<void> {
    return authorityTransaction(this.pool, true, async (client) => {
      const stored = await loadAuthorityStore(client);
      assertStored(
        stored.heads.some((head) => head.tenant_id === tenantId),
        "synthetic authority catalog missing",
      );
    });
  }

  // Internal bootstrap/control operations: deliberately absent from HTTP. A
  // restart verifies the durable catalog and never resets it to default bytes.
  async initializeCatalog(
    tenantId: string,
    data: unknown,
    now: () => Date,
  ): Promise<void> {
    await this.changeCatalog(tenantId, data, 0, now, true);
  }
  async replaceCatalog(
    tenantId: string,
    data: unknown,
    expectedRevision: number,
    now: () => Date,
  ): Promise<void> {
    await this.changeCatalog(tenantId, data, expectedRevision, now, false);
  }
  async enrollSimulatedCredit(
    now: () => Date,
  ): Promise<"enrolled" | "already_enrolled"> {
    const changed = await this.changeCatalog(
      "tenant_orchid",
      (before: StoredState) => {
        const head = before.heads.find((h) => h.tenant_id === "tenant_orchid");
        if (!head)
          throw new AuthorityReviewError(
            "CREDIT_INTEGRITY",
            "D6 bootstrap required before enrollment",
          );
        const catalogs = before.authority.snapshots.filter(
          (s) => s.kind === "catalog" && s.tenant_id === head.tenant_id,
        );
        const current = catalogs.find((s) => s.hash === head.snapshot_hash);
        return enrollCreditCatalog(
          object(current?.content.data),
          catalogs.map((s) => object(s.content.data)),
        );
      },
      undefined,
      now,
      false,
    );
    return changed ? "enrolled" : "already_enrolled";
  }
  private async changeCatalog(
    tenantId: string,
    data: unknown,
    expectedRevision: number | undefined,
    now: () => Date,
    initialize: boolean,
  ): Promise<boolean> {
    return authorityTransaction(this.pool, false, async (client) => {
      const before = await loadAuthorityStore(
        client,
        typeof data === "function",
      );
      const prior = before.heads.find((head) => head.tenant_id === tenantId);
      if (initialize && prior !== undefined) return false;
      const normalized = normalizeAuthorityCatalogData(
        typeof data === "function"
          ? (data as (state: StoredState) => unknown)(before)
          : data,
        tenantId,
      );
      const revision = expectedRevision ?? prior?.revision ?? 0;
      if ((prior?.revision ?? 0) !== revision)
        throw new AuthorityReviewError(
          "CATALOG_REVISION_CONFLICT",
          "catalog revision changed",
        );
      if (prior !== undefined) {
        const old = before.authority.snapshots.find(
          (item) => item.hash === prior.snapshot_hash,
        );
        if (old !== undefined && same(old.content.data, normalized))
          return false;
      }
      const at = now().toISOString();
      const floor = before.cases.cases
        .flatMap((item) => item.journal.map((entry) => entry.recorded_at))
        .reduce(
          (max, time) => (time > max ? time : max),
          prior?.last_recorded_at ?? "",
        );
      if (at < floor)
        throw new AuthorityReviewError(
          "CLOCK_REGRESSION",
          "catalog write clock regressed",
        );
      const snapshot = reviewSnapshot(
        "catalog",
        json({
          schema_version: "authority-catalog.v1",
          tenant_id: tenantId,
          revision: revision + 1,
          previous_catalog_hash: prior?.snapshot_hash ?? null,
          after_review_position: before.authority.entries.length,
          recorded_at: at,
          data: normalized,
        }),
      );
      await persistSnapshot(client, snapshot);
      if (prior === undefined)
        await writeAuthorityRow(
          client,
          `/* fr:authority-insert-catalog */ INSERT INTO authority_catalog (tenant_id, revision, snapshot_hash, last_recorded_at) VALUES ($1, $2, $3, $4)`,
          [tenantId, revision + 1, snapshot.hash, at],
        );
      else
        await writeAuthorityRow(
          client,
          `/* fr:authority-update-catalog */ UPDATE authority_catalog SET revision = $2, snapshot_hash = $3, last_recorded_at = $4 WHERE tenant_id = $1 AND revision = $5`,
          [tenantId, revision + 1, snapshot.hash, at, revision],
        );
      await writerRevision(client);
      const persisted = await loadAuthorityStore(client);
      assertStored(
        same(persisted.cases, before.cases) &&
          same(persisted.authority.entries, before.authority.entries),
        "catalog update changed Case or review history",
      );
      return true;
    });
  }
}
