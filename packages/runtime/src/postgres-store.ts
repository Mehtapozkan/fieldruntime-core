import {
  assertCaseEngineStateIntegrity,
  executeCaseCommand,
  getCase,
  replayCaseJournal,
  type CaseAggregate,
  type CaseCommandResult,
  type CaseEngineAppend,
  type CaseEngineDependencies,
  type CaseEngineState,
  type CaseIdempotencyRecord,
  type CaseJournalEntry,
  type CaseSourceEventRecord,
} from "./case-engine.js";
import { canonicalJson, immutableJson } from "./canonical-json.js";

type UnknownRecord = Record<string, unknown>;

export interface SqlQueryResult<Row = UnknownRecord> {
  readonly rows: readonly Row[];
  readonly rowCount: number | null;
}

export interface SqlClient {
  query<Row = UnknownRecord>(
    statement: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
  release(discard?: boolean): void;
}

export interface SqlPool {
  connect(): Promise<SqlClient>;
}

export class PostgresStoreError extends Error {
  readonly code: "STORE_CONFLICT" | "STORE_INTEGRITY" | "STORE_TRANSACTION";

  constructor(
    code: "STORE_CONFLICT" | "STORE_INTEGRITY" | "STORE_TRANSACTION",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PostgresStoreError";
    this.code = code;
  }
}

interface ProjectionRow {
  readonly tenant_id: unknown;
  readonly case_id: unknown;
  readonly version: unknown;
  readonly document: unknown;
  readonly journal_sequence: unknown;
  readonly journal_head_hash: unknown;
}

interface JournalRow {
  readonly entry: unknown;
}

interface SourceEventRow {
  readonly tenant_id: unknown;
  readonly source: unknown;
  readonly source_event_id: unknown;
  readonly work_event_fingerprint: unknown;
  readonly case_id: unknown;
  readonly journal_entry_id: unknown;
  readonly create_binding_fingerprint: unknown;
}

interface EmittedIdRow {
  readonly id: unknown;
  readonly record_kind: unknown;
  readonly tenant_id: unknown;
  readonly case_id: unknown;
  readonly journal_entry_id: unknown;
}

const LOAD_PROJECTIONS = `/* fr:load-projections */
SELECT tenant_id, case_id, version, document, journal_sequence,
       journal_head_hash
FROM case_projections
ORDER BY tenant_id, case_id`;

const LOAD_JOURNAL = `/* fr:load-journal */
SELECT entry
FROM case_journal
ORDER BY tenant_id, case_id, sequence`;

const LOAD_SOURCE_EVENTS = `/* fr:load-source-events */
SELECT tenant_id, source, source_event_id, work_event_fingerprint, case_id,
       journal_entry_id, create_binding_fingerprint
FROM source_event_identities
ORDER BY tenant_id, source, source_event_id`;

const LOAD_EMITTED_IDS = `/* fr:load-emitted-ids */
SELECT id, record_kind, tenant_id, case_id, journal_entry_id
FROM runtime_emitted_ids
ORDER BY id`;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      `${field} must be a nonempty string`,
    );
  }
  return value;
}

function requiredSafeInteger(value: unknown, field: string): number {
  const normalized = typeof value === "string" ? Number(value) : value;
  if (
    typeof normalized !== "number" ||
    !Number.isSafeInteger(normalized) ||
    normalized < 0
  ) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      `${field} must be a nonnegative safe integer`,
    );
  }
  return normalized;
}

function affectedRows(result: SqlQueryResult): number {
  return result.rowCount ?? result.rows.length;
}

function assertAffected(
  result: SqlQueryResult,
  expected: number,
  operation: string,
): void {
  if (affectedRows(result) !== expected) {
    throw new PostgresStoreError(
      "STORE_CONFLICT",
      `${operation} affected an unexpected number of rows`,
    );
  }
}

function caseKey(tenantId: string, caseId: string): string {
  return JSON.stringify([tenantId, caseId]);
}

function auditEntryId(entry: CaseJournalEntry): string {
  let auditEntry: unknown;
  if (entry.event_type === "case.created") {
    const document = entry.payload.document;
    const auditEntries = isRecord(document)
      ? document.audit_entries
      : undefined;
    auditEntry = Array.isArray(auditEntries) ? auditEntries[0] : undefined;
  } else {
    auditEntry = entry.payload.audit_entry;
  }
  if (!isRecord(auditEntry)) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      `journal entry ${entry.id} is missing its audit entry`,
    );
  }
  return requiredString(auditEntry.id, "audit entry id");
}

function sourceIdentityFromEntry(entry: CaseJournalEntry):
  | {
      readonly tenantId: string;
      readonly source: string;
      readonly sourceEventId: string;
    }
  | undefined {
  let workEvent: unknown;
  if (entry.event_type === "case.created") {
    const document = entry.payload.document;
    const events = isRecord(document) ? document.events : undefined;
    workEvent = Array.isArray(events) ? events[0] : undefined;
  } else if (entry.event_type === "case.work_event_attached") {
    workEvent = entry.payload.work_event;
  } else {
    return undefined;
  }
  if (!isRecord(workEvent)) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      `journal entry ${entry.id} is missing its WorkEvent`,
    );
  }
  return {
    tenantId: requiredString(workEvent.tenant_id, "WorkEvent tenant_id"),
    source: requiredString(workEvent.source, "WorkEvent source"),
    sourceEventId: requiredString(
      workEvent.source_event_id,
      "WorkEvent source_event_id",
    ),
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameEngineState(
  left: CaseEngineState,
  right: CaseEngineState,
): boolean {
  const normalize = (state: CaseEngineState): UnknownRecord => ({
    cases: [...state.cases].toSorted((first, second) =>
      compareKeys(
        caseKey(first.tenant_id, first.case_id),
        caseKey(second.tenant_id, second.case_id),
      ),
    ),
    idempotency_records: [...state.idempotency_records].toSorted(
      (first, second) =>
        compareKeys(
          JSON.stringify([first.tenant_id, first.idempotency_key]),
          JSON.stringify([second.tenant_id, second.idempotency_key]),
        ),
    ),
    source_event_records: [...state.source_event_records].toSorted(
      (first, second) =>
        compareKeys(
          JSON.stringify([
            first.tenant_id,
            first.source,
            first.source_event_id,
          ]),
          JSON.stringify([
            second.tenant_id,
            second.source,
            second.source_event_id,
          ]),
        ),
    ),
  });
  return sameJson(normalize(left), normalize(right));
}

async function loadEngineState(client: SqlClient): Promise<CaseEngineState> {
  const [projectionResult, journalResult, sourceResult, emittedResult] =
    await Promise.all([
      client.query<ProjectionRow>(LOAD_PROJECTIONS),
      client.query<JournalRow>(LOAD_JOURNAL),
      client.query<SourceEventRow>(LOAD_SOURCE_EVENTS),
      client.query<EmittedIdRow>(LOAD_EMITTED_IDS),
    ]);

  const journalByCase = new Map<string, CaseJournalEntry[]>();
  for (const row of journalResult.rows) {
    if (!isRecord(row.entry)) {
      throw new PostgresStoreError(
        "STORE_INTEGRITY",
        "stored journal entry must be a JSON object",
      );
    }
    const entry = immutableJson(row.entry) as unknown as CaseJournalEntry;
    const key = caseKey(
      requiredString(entry.tenant_id, "journal tenant_id"),
      requiredString(entry.case_id, "journal case_id"),
    );
    const entries = journalByCase.get(key) ?? [];
    entries.push(entry);
    journalByCase.set(key, entries);
  }

  const aggregates: CaseAggregate[] = [];
  const projectionKeys = new Set<string>();
  for (const row of projectionResult.rows) {
    const tenantId = requiredString(row.tenant_id, "projection tenant_id");
    const caseId = requiredString(row.case_id, "projection case_id");
    const key = caseKey(tenantId, caseId);
    if (projectionKeys.has(key)) {
      throw new PostgresStoreError(
        "STORE_INTEGRITY",
        "stored projections contain a duplicate case identity",
      );
    }
    projectionKeys.add(key);
    const entries = journalByCase.get(key);
    if (entries === undefined || entries.length === 0) {
      throw new PostgresStoreError(
        "STORE_INTEGRITY",
        `projection ${caseId} has no journal`,
      );
    }
    const aggregate = replayCaseJournal(entries);
    const version = requiredSafeInteger(row.version, "projection version");
    const sequence = requiredSafeInteger(
      row.journal_sequence,
      "projection journal_sequence",
    );
    const headHash = requiredString(
      row.journal_head_hash,
      "projection journal_head_hash",
    );
    const head = aggregate.journal.at(-1);
    if (
      aggregate.tenant_id !== tenantId ||
      aggregate.case_id !== caseId ||
      !sameJson(aggregate.document, row.document) ||
      aggregate.document.case === undefined ||
      !isRecord(aggregate.document.case) ||
      aggregate.document.case.version !== version ||
      aggregate.journal.length !== sequence ||
      head?.event_hash !== headHash
    ) {
      throw new PostgresStoreError(
        "STORE_INTEGRITY",
        `projection ${caseId} differs from journal replay`,
      );
    }
    aggregates.push(aggregate);
  }
  if (journalByCase.size !== projectionKeys.size) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "stored journal contains a case without a projection",
    );
  }

  const idempotencyRecords: CaseIdempotencyRecord[] = aggregates.flatMap(
    (aggregate) =>
      aggregate.journal.map((entry) => ({
        tenant_id: entry.tenant_id,
        idempotency_key: entry.idempotency_key,
        command_fingerprint: entry.command_fingerprint,
        case_id: entry.case_id,
        journal_entry_id: entry.id,
        result_status:
          entry.event_type === "case.transition_rejected"
            ? "rejected"
            : "applied",
      })),
  );

  const journalEntryBySource = new Map<string, string>();
  for (const aggregate of aggregates) {
    for (const entry of aggregate.journal) {
      const identity = sourceIdentityFromEntry(entry);
      if (identity !== undefined) {
        journalEntryBySource.set(
          JSON.stringify([
            identity.tenantId,
            identity.source,
            identity.sourceEventId,
          ]),
          entry.id,
        );
      }
    }
  }

  const sourceEventRecords: CaseSourceEventRecord[] = sourceResult.rows.map(
    (row) => {
      const tenantId = requiredString(row.tenant_id, "source tenant_id");
      const source = requiredString(row.source, "source source");
      const sourceEventId = requiredString(
        row.source_event_id,
        "source source_event_id",
      );
      const journalEntryId = requiredString(
        row.journal_entry_id,
        "source journal_entry_id",
      );
      if (
        journalEntryBySource.get(
          JSON.stringify([tenantId, source, sourceEventId]),
        ) !== journalEntryId
      ) {
        throw new PostgresStoreError(
          "STORE_INTEGRITY",
          "source-event identity points to the wrong journal entry",
        );
      }
      const createBinding = row.create_binding_fingerprint;
      if (createBinding !== null && createBinding !== undefined) {
        requiredString(createBinding, "source create_binding_fingerprint");
      }
      return {
        tenant_id: tenantId,
        source,
        source_event_id: sourceEventId,
        work_event_fingerprint: requiredString(
          row.work_event_fingerprint,
          "source work_event_fingerprint",
        ) as `sha256:${string}`,
        case_id: requiredString(row.case_id, "source case_id"),
        ...(typeof createBinding === "string"
          ? {
              create_binding_fingerprint: createBinding as `sha256:${string}`,
            }
          : {}),
      };
    },
  );

  const expectedEmittedIds = new Map<
    string,
    {
      readonly kind: "audit" | "journal";
      readonly tenantId: string;
      readonly caseId: string;
      readonly journalEntryId: string;
    }
  >();
  for (const aggregate of aggregates) {
    for (const entry of aggregate.journal) {
      expectedEmittedIds.set(entry.id, {
        kind: "journal",
        tenantId: entry.tenant_id,
        caseId: entry.case_id,
        journalEntryId: entry.id,
      });
      expectedEmittedIds.set(auditEntryId(entry), {
        kind: "audit",
        tenantId: entry.tenant_id,
        caseId: entry.case_id,
        journalEntryId: entry.id,
      });
    }
  }
  if (emittedResult.rows.length !== expectedEmittedIds.size) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "emitted-ID registry cardinality differs from journal history",
    );
  }
  for (const row of emittedResult.rows) {
    const id = requiredString(row.id, "emitted id");
    const expected = expectedEmittedIds.get(id);
    if (
      expected === undefined ||
      row.record_kind !== expected.kind ||
      row.tenant_id !== expected.tenantId ||
      row.case_id !== expected.caseId ||
      row.journal_entry_id !== expected.journalEntryId
    ) {
      throw new PostgresStoreError(
        "STORE_INTEGRITY",
        "emitted-ID registry differs from journal history",
      );
    }
  }

  return assertCaseEngineStateIntegrity(
    immutableJson<CaseEngineState>({
      cases: aggregates,
      idempotency_records: idempotencyRecords,
      source_event_records: sourceEventRecords,
    }),
  );
}

export async function loadTrustedEngineState(
  client: SqlClient,
): Promise<CaseEngineState> {
  try {
    return await loadEngineState(client);
  } catch (error) {
    if (error instanceof PostgresStoreError) throw error;
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "stored case state failed integrity validation",
      { cause: error },
    );
  }
}

function aggregateVersion(aggregate: CaseAggregate): number {
  const record = aggregate.document.case;
  if (!isRecord(record)) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "case projection is missing its case record",
    );
  }
  return requiredSafeInteger(record.version, "case version");
}

function assertUnchangedPrefix<T>(
  before: readonly T[],
  after: readonly T[],
  collection: string,
): void {
  if (after.length < before.length) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      `${collection} lost persisted records`,
    );
  }
  for (let index = 0; index < before.length; index += 1) {
    if (!sameJson(before[index], after[index])) {
      throw new PostgresStoreError(
        "STORE_INTEGRITY",
        `${collection} rewrote an existing record`,
      );
    }
  }
}

function validateAppendDelta(
  before: CaseEngineState,
  result: Extract<
    CaseCommandResult,
    { readonly status: "applied" | "rejected" }
  >,
): CaseEngineAppend {
  const trustedNextState = assertCaseEngineStateIntegrity(result.state);
  const append = result.append;
  const oldAggregate = getCase(before, append.tenant_id, append.case_id);
  const oldVersion =
    oldAggregate === undefined ? 0 : aggregateVersion(oldAggregate);
  if (
    append.expected_case_version !== oldVersion ||
    !sameJson(append.document, result.aggregate.document) ||
    !sameJson(append.journal_entry, result.entry) ||
    append.journal_entry.tenant_id !== append.tenant_id ||
    append.journal_entry.case_id !== append.case_id ||
    append.journal_entry.case_version !== oldVersion + 1 ||
    append.journal_entry.sequence !== (oldAggregate?.journal.length ?? 0) + 1 ||
    append.audit_entry_id !== auditEntryId(append.journal_entry)
  ) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "engine append does not match its command result",
    );
  }
  if (oldAggregate === undefined) {
    if (
      append.journal_entry.event_type !== "case.created" ||
      append.journal_entry.previous_event_hash !== null ||
      trustedNextState.cases.length !== before.cases.length + 1
    ) {
      throw new PostgresStoreError(
        "STORE_INTEGRITY",
        "case creation append has an invalid predecessor",
      );
    }
  } else {
    const previousEntry = oldAggregate.journal.at(-1);
    if (
      append.journal_entry.event_type === "case.created" ||
      previousEntry === undefined ||
      append.journal_entry.previous_event_hash !== previousEntry.event_hash ||
      trustedNextState.cases.length !== before.cases.length
    ) {
      throw new PostgresStoreError(
        "STORE_INTEGRITY",
        "case update append has an invalid predecessor",
      );
    }
  }

  const nextAggregate = getCase(
    trustedNextState,
    append.tenant_id,
    append.case_id,
  );
  if (
    nextAggregate === undefined ||
    !sameJson(nextAggregate, result.aggregate) ||
    aggregateVersion(nextAggregate) !== oldVersion + 1
  ) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "engine state does not contain the appended projection",
    );
  }
  if (oldAggregate !== undefined) {
    assertUnchangedPrefix(
      oldAggregate.journal,
      nextAggregate.journal,
      "case journal",
    );
  }

  for (const existing of before.cases) {
    if (
      existing.tenant_id === append.tenant_id &&
      existing.case_id === append.case_id
    ) {
      continue;
    }
    const next = getCase(
      trustedNextState,
      existing.tenant_id,
      existing.case_id,
    );
    if (next === undefined || !sameJson(existing, next)) {
      throw new PostgresStoreError(
        "STORE_INTEGRITY",
        "engine append changed an unrelated case",
      );
    }
  }

  if (
    trustedNextState.idempotency_records.length !==
      before.idempotency_records.length + 1 ||
    !sameJson(
      trustedNextState.idempotency_records.at(-1),
      append.idempotency_record,
    ) ||
    append.idempotency_record.tenant_id !== append.journal_entry.tenant_id ||
    append.idempotency_record.idempotency_key !==
      append.journal_entry.idempotency_key ||
    append.idempotency_record.command_fingerprint !==
      append.journal_entry.command_fingerprint ||
    append.idempotency_record.case_id !== append.journal_entry.case_id ||
    append.idempotency_record.journal_entry_id !== append.journal_entry.id ||
    append.idempotency_record.result_status !== result.status
  ) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "engine append has an invalid idempotency record",
    );
  }
  assertUnchangedPrefix(
    before.idempotency_records,
    trustedNextState.idempotency_records,
    "idempotency index",
  );

  const expectsSource =
    append.journal_entry.event_type === "case.created" ||
    append.journal_entry.event_type === "case.work_event_attached";
  if (
    expectsSource !== (append.source_event_record !== undefined) ||
    trustedNextState.source_event_records.length !==
      before.source_event_records.length + (expectsSource ? 1 : 0)
  ) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "engine append has an invalid source-event delta",
    );
  }
  assertUnchangedPrefix(
    before.source_event_records,
    trustedNextState.source_event_records,
    "source-event index",
  );
  if (
    append.source_event_record !== undefined &&
    !sameJson(
      trustedNextState.source_event_records.at(-1),
      append.source_event_record,
    )
  ) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "engine state does not contain the appended source-event record",
    );
  }
  return append;
}

async function persistAppend(
  client: SqlClient,
  before: CaseEngineState,
  append: CaseEngineAppend,
): Promise<void> {
  const oldAggregate = getCase(before, append.tenant_id, append.case_id);
  const entry = append.journal_entry;
  const causationSequence =
    entry.causation_event_id === undefined
      ? null
      : (oldAggregate?.journal.find(
          (candidate) => candidate.id === entry.causation_event_id,
        )?.sequence ?? null);
  if (entry.causation_event_id !== undefined && causationSequence === null) {
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "causation entry is missing from the prior journal",
    );
  }
  if (oldAggregate === undefined) {
    assertAffected(
      await client.query(
        `/* fr:insert-projection */
         INSERT INTO case_projections
           (tenant_id, case_id, version, document, journal_sequence,
            journal_head_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          append.tenant_id,
          append.case_id,
          entry.case_version,
          append.document,
          entry.sequence,
          entry.event_hash,
        ],
      ),
      1,
      "case projection insert",
    );
  } else {
    const previousEntry = oldAggregate.journal.at(-1);
    if (previousEntry === undefined) {
      throw new PostgresStoreError(
        "STORE_INTEGRITY",
        "stored aggregate has no journal head",
      );
    }
    assertAffected(
      await client.query(
        `/* fr:update-projection */
         UPDATE case_projections
         SET version = $3, document = $4, journal_sequence = $5,
             journal_head_hash = $6
         WHERE tenant_id = $1 AND case_id = $2
           AND version = $7 AND journal_sequence = $8
           AND journal_head_hash = $9`,
        [
          append.tenant_id,
          append.case_id,
          entry.case_version,
          append.document,
          entry.sequence,
          entry.event_hash,
          append.expected_case_version,
          previousEntry.sequence,
          previousEntry.event_hash,
        ],
      ),
      1,
      "case projection compare-and-swap",
    );
  }

  assertAffected(
    await client.query(
      `/* fr:insert-journal */
       INSERT INTO case_journal
         (id, tenant_id, case_id, sequence, case_version, event_type,
          recorded_at, idempotency_key, command_fingerprint,
          causation_event_id, causation_sequence, previous_event_hash,
          event_hash, entry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        entry.id,
        entry.tenant_id,
        entry.case_id,
        entry.sequence,
        entry.case_version,
        entry.event_type,
        entry.recorded_at,
        entry.idempotency_key,
        entry.command_fingerprint,
        entry.causation_event_id ?? null,
        causationSequence,
        entry.previous_event_hash,
        entry.event_hash,
        entry,
      ],
    ),
    1,
    "case journal insert",
  );

  assertAffected(
    await client.query(
      `/* fr:insert-emitted-ids */
       INSERT INTO runtime_emitted_ids
         (id, record_kind, tenant_id, case_id, journal_entry_id)
       VALUES
         ($1, 'journal', $3, $4, $1),
         ($2, 'audit', $3, $4, $1)`,
      [entry.id, append.audit_entry_id, entry.tenant_id, entry.case_id],
    ),
    2,
    "emitted-ID reservation",
  );

  if (append.source_event_record !== undefined) {
    const source = append.source_event_record;
    assertAffected(
      await client.query(
        `/* fr:insert-source-event */
         INSERT INTO source_event_identities
           (tenant_id, source, source_event_id, work_event_fingerprint,
            case_id, journal_entry_id, create_binding_fingerprint)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          source.tenant_id,
          source.source,
          source.source_event_id,
          source.work_event_fingerprint,
          source.case_id,
          entry.id,
          source.create_binding_fingerprint ?? null,
        ],
      ),
      1,
      "source-event identity insert",
    );
  }
}

async function rollback(
  client: SqlClient,
  originalError: unknown,
  releaseState: { discarded: boolean },
): Promise<never> {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    releaseState.discarded = true;
    client.release(true);
    throw new AggregateError(
      [originalError, rollbackError],
      "PostgreSQL transaction and rollback both failed",
      { cause: rollbackError },
    );
  }
  throw originalError;
}

export class PostgresCaseStore {
  readonly #pool: SqlPool;

  constructor(pool: SqlPool) {
    this.#pool = pool;
  }

  async execute(
    command: unknown,
    dependencies: CaseEngineDependencies,
  ): Promise<CaseCommandResult> {
    const client = await this.#pool.connect();
    let transactionOpen = false;
    const releaseState = { discarded: false };
    let commandExecuting = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      transactionOpen = true;
      const lock = await client.query<{ readonly revision: unknown }>(
        `/* fr:lock-writer */
         SELECT revision
         FROM runtime_writer_lock
         WHERE singleton_id = 1
         FOR UPDATE`,
      );
      if (lock.rows.length !== 1) {
        throw new PostgresStoreError(
          "STORE_INTEGRITY",
          "runtime writer lock row is missing or duplicated",
        );
      }
      requiredSafeInteger(lock.rows[0]?.revision, "writer revision");

      const before = await loadTrustedEngineState(client);
      commandExecuting = true;
      const result = executeCaseCommand(before, command, dependencies);
      commandExecuting = false;
      if (result.status === "applied" || result.status === "rejected") {
        const append = validateAppendDelta(before, result);
        await persistAppend(client, before, append);
        const persisted = await loadTrustedEngineState(client);
        if (!sameEngineState(persisted, result.state)) {
          throw new PostgresStoreError(
            "STORE_INTEGRITY",
            "persisted state differs from the engine result",
          );
        }
        assertAffected(
          await client.query(
            `/* fr:increment-writer-revision */
             UPDATE runtime_writer_lock
             SET revision = revision + 1
             WHERE singleton_id = 1`,
          ),
          1,
          "writer revision update",
        );
      }
      await client.query("COMMIT");
      transactionOpen = false;
      return result;
    } catch (error) {
      const surfacedError =
        commandExecuting || error instanceof PostgresStoreError
          ? error
          : new PostgresStoreError(
              "STORE_TRANSACTION",
              "PostgreSQL case transaction failed",
              { cause: error },
            );
      if (transactionOpen) {
        return await rollback(client, surfacedError, releaseState);
      }
      throw surfacedError;
    } finally {
      if (!releaseState.discarded) client.release();
    }
  }

  async getCase(
    tenantId: string,
    caseId: string,
  ): Promise<CaseAggregate | undefined> {
    const state = await this.#readState();
    return getCase(state, tenantId, caseId);
  }

  async listCases(tenantId: string): Promise<readonly CaseAggregate[]> {
    const state = await this.#readState();
    return Object.freeze(
      state.cases.filter((aggregate) => aggregate.tenant_id === tenantId),
    );
  }

  async getJournal(
    tenantId: string,
    caseId: string,
  ): Promise<readonly CaseJournalEntry[] | undefined> {
    const state = await this.#readState();
    return getCase(state, tenantId, caseId)?.journal;
  }

  async assertReady(): Promise<void> {
    await this.#readState();
  }

  async #readState(): Promise<CaseEngineState> {
    const client = await this.#pool.connect();
    let transactionOpen = false;
    const releaseState = { discarded: false };
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      transactionOpen = true;
      const lock = await client.query<{ readonly revision: unknown }>(
        `/* fr:read-writer */
         SELECT revision
         FROM runtime_writer_lock
         WHERE singleton_id = 1`,
      );
      if (lock.rows.length !== 1) {
        throw new PostgresStoreError(
          "STORE_INTEGRITY",
          "runtime writer lock row is missing or duplicated",
        );
      }
      requiredSafeInteger(lock.rows[0]?.revision, "writer revision");
      const state = await loadTrustedEngineState(client);
      await client.query("COMMIT");
      transactionOpen = false;
      return state;
    } catch (error) {
      const surfacedError =
        error instanceof PostgresStoreError
          ? error
          : new PostgresStoreError(
              "STORE_TRANSACTION",
              "PostgreSQL read transaction failed",
              { cause: error },
            );
      if (transactionOpen) {
        return await rollback(client, surfacedError, releaseState);
      }
      throw surfacedError;
    } finally {
      if (!releaseState.discarded) client.release();
    }
  }
}
