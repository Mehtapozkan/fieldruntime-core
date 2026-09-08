import {
  assertValidIntakeContract,
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  executeCaseCommand,
  type CaseEngineDependencies,
} from "./case-engine.js";
import {
  authorityTransaction,
  loadAuthorityStore,
  writeAuthorityRow,
  writerRevision,
} from "./postgres-authority-store.js";
import {
  persistCaseCommandResult,
  PostgresStoreError,
  type SqlClient,
  type SqlPool,
} from "./postgres-store.js";
import {
  assertIntakeState,
  exportIntakeState,
  type IntakeState,
} from "./intake-integrity.js";
import {
  adaptIntakeCommand,
  assertIntakeTarget,
  buildIntakeMaterial,
  intakeList,
  intakeObject,
  intakeUpstreamKey,
  INTAKE_ACTOR,
  INTAKE_TENANT,
  normalizeIntakePrepare,
  normalizeIntakeSelection,
  prepareIntake,
  previewIntake,
  readIntakeView,
  requireIntake,
  type IntakeObject,
} from "./intake.js";
const same = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);
const hex = (value: unknown): string => String(value).slice(7);
function receiptColumns(r: IntakeObject): IntakeObject {
  return {
    tenant_id: r.tenant_id,
    id: r.id,
    sequence: r.sequence,
    receipt_hash: r.hash,
    bundle_id: intakeObject(r.selection).bundle_id,
    record_key: r.record_key,
    material_key: r.material_key,
    case_root: r.case_root,
    upstream_key: r.upstream_key,
    case_id: r.case_id,
    case_version: r.case_version,
    journal_entry_id: r.journal_entry_id,
    journal_entry_hash: r.journal_entry_hash,
    previous_intake_hash: r.previous_intake_hash,
    idempotency_key: r.idempotency_key,
    command_fingerprint: r.command_fingerprint,
    recorded_at: r.recorded_at,
    receipt: r,
  };
}
function bundleColumns(b: IntakeObject): IntakeObject {
  return {
    tenant_id: b.tenant_id,
    id: b.id,
    bundle_hash: b.hash,
    preparation_key: b.preparation_key,
    preparation_fingerprint: b.preparation_fingerprint,
    ingested_at: b.ingested_at,
    retained_at: b.retained_at,
    bundle: b,
  };
}
function assertColumns(row: IntakeObject, expected: IntakeObject): void {
  for (const [k, v] of Object.entries(expected))
    requireIntake(
      same(
        k === "sequence" || k === "case_version" ? Number(row[k]) : row[k],
        v,
      ),
      "INTAKE_INTEGRITY",
      `Stored intake ${k} differs from canonical evidence`,
    );
}
export async function loadIntakeStore(client: SqlClient): Promise<IntakeState> {
  const canonical = await loadAuthorityStore(client, true);
  try {
    const artifacts = await client.query<IntakeObject>(
      "/* fr:intake-load-artifacts */ SELECT * FROM intake_artifacts ORDER BY byte_hash",
    );
    const bundles = await client.query<IntakeObject>(
      "/* fr:intake-load-bundles */ SELECT * FROM intake_bundles ORDER BY retained_at, id",
    );
    const receipts = await client.query<IntakeObject>(
      "/* fr:intake-load-commits */ SELECT * FROM intake_commits ORDER BY sequence",
    );
    const bytes = new Map<string, Buffer>();
    for (const a of artifacts.rows) {
      requireIntake(
        a.tenant_id === INTAKE_TENANT &&
          Buffer.isBuffer(a.bytes) &&
          !bytes.has(String(a.byte_hash)),
        "INTAKE_INTEGRITY",
        "Artifact index or bytes invalid",
      );
      bytes.set(String(a.byte_hash), a.bytes);
    }
    const prepared = bundles.rows.map((row) => {
      const b = intakeObject(row.bundle);
      assertColumns(row, bundleColumns(b));
      return b;
    });
    const commits = receipts.rows.map((row) => {
      const r = intakeObject(row.receipt);
      assertColumns(row, receiptColumns(r));
      return r;
    });
    const times = [
      ...canonical.cases.cases.flatMap((c) =>
        c.journal.map((e) => e.recorded_at),
      ),
      ...canonical.heads.map((h) => h.last_recorded_at),
      ...canonical.credit.entries.map((e) => e.recorded_at as string),
      ...prepared.map((b) => String(b.retained_at)),
      ...commits.map((r) => String(r.recorded_at)),
    ];
    const state = {
      cases: canonical.cases,
      artifacts: bytes,
      bundles: prepared,
      commits,
      clockFloor: times.reduce((a, b) => (a > b ? a : b), ""),
    };
    assertIntakeState(state);
    return state;
  } catch (error) {
    if (error instanceof PostgresStoreError) throw error;
    throw new PostgresStoreError(
      "STORE_INTEGRITY",
      "Intake evidence failed reconstruction",
      { cause: error },
    );
  }
}
async function insert(
  client: SqlClient,
  table: "intake_bundles" | "intake_commits",
  columns: IntakeObject,
): Promise<void> {
  const keys = Object.keys(columns);
  await writeAuthorityRow(
    client,
    `/* fr:${table}-insert */ INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${String(i + 1)}`).join(", ")})`,
    Object.values(columns),
  );
}
function bundleAt(state: IntakeState, id: unknown): IntakeObject {
  const b = state.bundles.find((b) => b.id === id);
  requireIntake(b, "NOT_FOUND", "Prepared bundle not found");
  return b;
}
function checkedTime(state: IntakeState, now: () => Date): string {
  const at = now().toISOString();
  requireIntake(
    at >= state.clockFloor,
    "CLOCK_REGRESSION",
    "Intake recording clock regressed",
  );
  return at;
}
function result(
  kind: "prepare_result" | "commit_result",
  value: IntakeObject,
): IntakeObject {
  assertValidIntakeContract(kind, value);
  return immutableJson(value);
}
function preparedResult(status: string, b: IntakeObject): IntakeObject {
  return result("prepare_result", {
    schema_version: "intake-prepare-result.v1",
    status,
    bundle_id: b.id,
    bundle_hash: b.hash,
  });
}
function committedResult(status: string, receipt: IntakeObject): IntakeObject {
  return result("commit_result", {
    schema_version: "intake-commit-result.v1",
    status,
    receipt,
    authority_granted: false,
  });
}
export class PostgresIntakeStore {
  constructor(readonly pool: SqlPool) {}
  async prepare(
    value: unknown,
    ingestedAt: string,
    now: () => Date,
  ): Promise<IntakeObject> {
    const input = normalizeIntakePrepare(value),
      fingerprint = sha256Json(input);
    // Parsing occurs before any write. This provisional time affects no identity.
    const parsed = prepareIntake(input, ingestedAt, ingestedAt);
    return authorityTransaction(this.pool, false, async (client) => {
      const state = await loadIntakeStore(client),
        prior = state.bundles.find(
          (b) => b.preparation_key === input.idempotency_key,
        );
      if (prior) {
        requireIntake(
          prior.preparation_fingerprint === fingerprint,
          "IDEMPOTENCY_CONFLICT",
          "Preparation key was used for different bytes or metadata",
        );
        return preparedResult("duplicate", prior);
      }
      const identical = state.bundles.find((b) => b.id === parsed.bundle.id);
      // D-034 A2 retains the original bundle/key without a fresh-key alias.
      // This no-op does not reserve the submitted key or accept new metadata.
      if (identical) return preparedResult("already_retained", identical);
      const at = checkedTime(state, now),
        prepared = prepareIntake(input, ingestedAt, at);
      for (const [hash, bytes] of prepared.bytes)
        if (!state.artifacts.has(hash))
          await writeAuthorityRow(
            client,
            "/* fr:intake-insert-artifact */ INSERT INTO intake_artifacts (tenant_id,byte_hash,bytes) VALUES ($1,$2,$3)",
            [INTAKE_TENANT, hash, bytes],
          );
      await insert(client, "intake_bundles", bundleColumns(prepared.bundle));
      await writerRevision(client);
      await loadIntakeStore(client);
      return preparedResult("prepared", prepared.bundle);
    });
  }
  async commit(
    value: unknown,
    dependencies: CaseEngineDependencies,
  ): Promise<IntakeObject> {
    const selection = normalizeIntakeSelection(value, "selection"),
      fingerprint = sha256Json(selection);
    return authorityTransaction(this.pool, false, async (client) => {
      const state = await loadIntakeStore(client),
        prior = state.commits.find(
          (r) => r.idempotency_key === selection.idempotency_key,
        );
      if (prior) {
        requireIntake(
          prior.command_fingerprint === fingerprint,
          "IDEMPOTENCY_CONFLICT",
          "Commit key was used for another selection",
        );
        return committedResult("duplicate", prior);
      }
      const bundle = bundleAt(state, selection.bundle_id),
        material = buildIntakeMaterial(selection, bundle, state.commits),
        hash = sha256Json(material);
      requireIntake(
        selection.expected_material_key === material.material_key &&
          selection.expected_consent_hash === hash,
        "BINDING_CONFLICT",
        "Reviewed content differs from the submitted binding",
      );
      const existing = state.commits.find(
        (r) => r.material_key === material.material_key,
      );
      if (existing) {
        requireIntake(
          existing.case_id === material.target_case_id,
          "TARGET_CONFLICT",
          "Material already belongs to another Case",
        );
        return committedResult("already_committed", existing);
      }
      assertIntakeTarget(material, bundle, state.cases, state.commits);
      const at = checkedTime(state, dependencies.now),
        command = adaptIntakeCommand(
          material,
          String(selection.idempotency_key),
          at,
        );
      const applied = executeCaseCommand(state.cases, command, {
        ...dependencies,
        now: () => new Date(at),
      });
      requireIntake(
        applied.status === "applied",
        "CASE_CONFLICT",
        "Case command did not apply; refresh and review again",
      );
      await persistCaseCommandResult(client, state.cases, applied);
      const content = {
        schema_version: "intake-commit.v1",
        id: `intake_commit_${hex(fingerprint)}`,
        sequence: state.commits.length + 1,
        tenant_id: INTAKE_TENANT,
        record_key: material.record_key,
        material_key: material.material_key,
        case_root: material.case_root,
        upstream_key: intakeUpstreamKey(intakeObject(material.record)),
        case_id: material.target_case_id,
        case_version: applied.entry.case_version,
        recorded_at: at,
        actor: INTAKE_ACTOR,
        idempotency_key: selection.idempotency_key,
        command_fingerprint: fingerprint,
        selection,
        review_material: material,
        review_material_hash: hash,
        adapted_command: command,
        journal_entry_id: applied.entry.id,
        journal_entry_hash: applied.entry.event_hash,
        previous_intake_hash: material.expected_prior_intake_binding,
      };
      const receipt = { ...content, hash: sha256Json(content) };
      assertValidIntakeContract("receipt", receipt);
      await insert(client, "intake_commits", receiptColumns(receipt));
      await loadIntakeStore(client);
      return committedResult("committed", receipt);
    });
  }
  async read(id: string): Promise<IntakeObject> {
    return authorityTransaction(this.pool, true, async (c) => {
      const s = await loadIntakeStore(c);
      return readIntakeView(bundleAt(s, id), s.cases, s.commits);
    });
  }
  async preview(value: unknown): Promise<IntakeObject> {
    const input = normalizeIntakeSelection(value, "review");
    return authorityTransaction(this.pool, true, async (c) => {
      const s = await loadIntakeStore(c);
      return previewIntake(
        input,
        bundleAt(s, input.bundle_id),
        s.cases,
        s.commits,
      );
    });
  }
  async list(): Promise<IntakeObject> {
    return authorityTransaction(this.pool, true, async (c) => {
      const s = await loadIntakeStore(c);
      const value = {
        schema_version: "intake-list.v1",
        bundles: s.bundles.map((b) => ({
          id: b.id,
          hash: b.hash,
          name: intakeList(b.artifacts).find((a) => a.role === "queue")?.name,
          ingested_at: b.ingested_at,
          retained_at: b.retained_at,
          records: intakeObject(b.coverage).distinct_records,
          preparation_key: b.preparation_key,
        })),
      };
      assertValidIntakeContract("list", value);
      return value;
    });
  }
  async artifact(hash: string): Promise<Buffer> {
    return authorityTransaction(this.pool, true, async (c) => {
      const s = await loadIntakeStore(c),
        bytes = s.artifacts.get(hash);
      requireIntake(
        bytes,
        "NOT_FOUND",
        "Artifact unavailable in synthetic scope",
      );
      return Buffer.from(bytes);
    });
  }
  async export(): Promise<IntakeObject> {
    return authorityTransaction(this.pool, true, async (c) =>
      exportIntakeState(await loadIntakeStore(c)),
    );
  }
  async assertReady(): Promise<void> {
    await authorityTransaction(this.pool, true, async (c) => {
      await loadIntakeStore(c);
    });
  }
}
