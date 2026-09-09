import {
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  intakeObject as o,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "./intake.js";
import { assertWorkReader } from "./preparation-worker-profile.js";
import {
  appendWorkCommand,
  appendWorkTerminal,
  assertWorkState,
  exportWorkState,
  normalizeWorkCommand,
  readWork,
  syntheticWorkContext,
  workInput,
  workReceipt,
  validateWorkerResult,
  type WorkState,
  type WorkContext,
} from "./preparation-work.js";
import {
  fixedPreparationPort,
  type PreparationPort,
} from "./preparation-worker-port.js";
import { loadPackStore } from "./postgres-preparation-pack-store.js";
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
export function workColumns(e: Obj): Obj {
  return {
    tenant_id: e.tenant_id,
    case_id: e.case_id,
    record_key: e.record_key,
    sequence: e.sequence,
    id: e.id,
    entry_hash: e.hash,
    previous_entry_hash: e.previous_entry_hash,
    invocation_id: e.invocation_id,
    event: e.event,
    idempotency_key: e.idempotency_key,
    command_fingerprint: e.command_fingerprint,
    recorded_at: e.recorded_at,
    entry: e,
  };
}
export async function loadWorkStore(c: SqlClient): Promise<WorkState> {
  const pack = await loadPackStore(c);
  try {
    const rows = await c.query<Obj>(
      "/* fr:work-load */ SELECT * FROM preparation_work_journal ORDER BY case_id,sequence",
    );
    const entries = rows.rows.map((row) => {
      const entry = o(row.entry);
      for (const [k, v] of Object.entries(workColumns(entry)))
        ensure(
          canonicalJson(k === "sequence" ? Number(row[k]) : row[k]) ===
            canonicalJson(v),
          "WORK_INTEGRITY",
          `Stored work ${k} differs from canonical history`,
        );
      return entry;
    });
    const state = { pack, entries };
    assertWorkState(state);
    return state;
  } catch (error) {
    if (error instanceof PostgresStoreError) throw error;
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "Preparation work failed reconstruction",
      { cause: error },
    );
  }
}
async function persist(c: SqlClient, e: Obj): Promise<void> {
  const columns = workColumns(e),
    names = Object.keys(columns);
  await writeAuthorityRow(
    c,
    `/* fr:work-${String(e.event)}-insert */ INSERT INTO preparation_work_journal (${names.join(",")}) VALUES (${names.map((_, i) => `$${String(i + 1)}`).join(",")})`,
    Object.values(columns),
  );
  await writerRevision(c);
  const checked = await loadWorkStore(c);
  ensure(
    checked.entries.some((v) => canonicalJson(v) === canonicalJson(e)),
    "WORK_INTEGRITY",
    "Work entry was not retained exactly",
  );
}
export class PostgresPreparationWorkStore {
  constructor(
    readonly pool: SqlPool,
    readonly context: () => WorkContext = syntheticWorkContext,
    readonly port: PreparationPort = fixedPreparationPort,
    readonly monotonic: () => number = () => performance.now(),
  ) {}
  private snapshot(): WorkContext {
    const c = this.context();
    return {
      profile: immutableJson(c.profile),
      pack: {
        ...c.pack,
        profile: immutableJson(c.pack.profile),
        ...(c.pack.worker_profile
          ? { worker_profile: immutableJson(c.pack.worker_profile) }
          : {}),
      },
    };
  }
  read(caseId: string, key: string, now: () => Date): Promise<Obj> {
    return authorityTransaction(this.pool, true, async (c) =>
      readWork(
        await loadWorkStore(c),
        caseId,
        key,
        now().toISOString(),
        this.snapshot(),
      ),
    );
  }
  export(caseId: string, key: string, now: () => Date): Promise<Obj> {
    return authorityTransaction(this.pool, true, async (c) => {
      const s = await loadWorkStore(c);
      readWork(s, caseId, key, now().toISOString(), this.snapshot());
      return exportWorkState(s);
    });
  }
  async assertReady(): Promise<void> {
    await authorityTransaction(this.pool, true, loadWorkStore);
  }
  async submit(value: unknown, now: () => Date): Promise<Obj> {
    const command = normalizeWorkCommand(value);
    const first = await authorityTransaction(this.pool, false, async (c) => {
      const s = await loadWorkStore(c),
        context = this.snapshot();
      assertWorkReader(context.profile);
      const start =
        command.operation === "start"
          ? null
          : s.entries.find(
              (e) =>
                e.event === "started" &&
                e.invocation_id === command.invocation_id,
            );
      const caseId =
        command.operation === "start"
          ? o(command.binding).case_id
          : start?.case_id;
      const prior = s.entries.find(
        (e) =>
          e.case_id === caseId &&
          e.event ===
            (command.operation === "start" ? "started" : command.operation) &&
          e.idempotency_key === command.idempotency_key,
      );
      if (prior) {
        ensure(
          prior.command_fingerprint === sha256Json(command),
          "IDEMPOTENCY_CONFLICT",
          "Work key is already bound to another command",
        );
        return { receipt: workReceipt(prior), input: null };
      }
      const entry = appendWorkCommand(s, command, now().toISOString(), context),
        input = command.operation === "start" ? workInput(s, entry) : null;
      await persist(c, entry);
      return { receipt: workReceipt(entry), input };
    });
    if (first.input === null) return first.receipt;
    // Parent timing starts only after the start COMMIT. Nothing resumes on startup.
    const began = now().toISOString(),
      tick = this.monotonic();
    let result: Obj | null = null,
      diagnostics: string[] = [],
      execution: ReturnType<PreparationPort> | undefined,
      timeout: ReturnType<typeof setTimeout> | undefined;
    let raw: unknown;
    try {
      execution = this.port(first.input);
      raw = await Promise.race([
        execution.completion,
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            reject(
              new Error(
                "Preparation exceeded the five-second computation budget",
              ),
            );
          }, 5000);
        }),
      ]);
    } catch (error) {
      diagnostics = [
        error instanceof Error
          ? error.message.slice(0, 1800)
          : "Preparation failed",
      ];
    } finally {
      if (timeout) clearTimeout(timeout);
      execution?.cancel();
    }
    // Capture completion and budget BEFORE waiting for the writer transaction.
    const elapsed = Math.max(0, this.monotonic() - tick),
      completed = now().toISOString(),
      within = elapsed <= 5000,
      validationStart = this.monotonic();
    if (!within)
      diagnostics = ["Preparation exceeded the five-second computation budget"];
    else if (!diagnostics.length)
      try {
        result = validateWorkerResult(first.input, raw);
      } catch (error) {
        diagnostics = [
          error instanceof Error
            ? error.message.slice(0, 1800)
            : "Malformed worker output",
        ];
      }
    const validationElapsed = Math.max(0, this.monotonic() - validationStart),
      waiting = this.monotonic();
    await authorityTransaction(this.pool, false, async (c) => {
      const lockWait = Math.max(0, this.monotonic() - waiting),
        s = await loadWorkStore(c),
        at = now().toISOString();
      const timing = {
        computation_started_at: began,
        computation_completed_at: completed,
        computation_elapsed_ms: elapsed,
        computation_budget_ms: 5000,
        completed_within_budget: within,
        measurement_source: "runtime_parent_monotonic_clock",
        validation_elapsed_ms: validationElapsed,
        writer_lock_wait_ms: lockWait,
        terminal_evaluated_at: at,
        source_timezone: "UTC",
      };
      const entry = appendWorkTerminal(
        s,
        o(first.receipt.entry).invocation_id,
        result,
        diagnostics,
        timing,
        at,
        this.snapshot(),
      );
      if (entry) await persist(c, entry);
    });
    return first.receipt;
  }
}
