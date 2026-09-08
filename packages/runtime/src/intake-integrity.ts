import {
  assertValidIntakeContract,
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  assertCaseEngineStateIntegrity,
  executeCaseCommand,
  getCase,
  replayCaseJournal,
  type CaseEngineState,
} from "./case-engine.js";
import {
  adaptIntakeCommand,
  assertIntakeTarget,
  buildIntakeMaterial,
  intakeBytesHash,
  intakeList,
  intakeObject,
  intakeUpstreamKey,
  INTAKE_ACTOR,
  INTAKE_SCOPES,
  INTAKE_TENANT,
  normalizeIntakeSelection,
  normalizeIntakePrepare,
  prepareIntake,
  requireIntake,
  type IntakeObject,
} from "./intake.js";
export interface IntakeState {
  readonly cases: CaseEngineState;
  readonly artifacts: ReadonlyMap<string, Buffer>;
  readonly bundles: readonly IntakeObject[];
  readonly commits: readonly IntakeObject[];
  readonly clockFloor: string;
  readonly requestBindings?: readonly IntakeObject[];
}
const same = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);
const withoutHash = (v: IntakeObject): IntakeObject =>
  Object.fromEntries(Object.entries(v).filter(([k]) => k !== "hash"));
export function reconstructPreparation(
  bundle: IntakeObject,
  artifacts: ReadonlyMap<string, Buffer>,
): IntakeObject {
  return {
    schema_version: "intake-prepare.v1",
    profile_id: bundle.profile_id,
    idempotency_key: bundle.preparation_key,
    claims: bundle.claims,
    artifacts: intakeList(bundle.artifacts).map((a) => {
      const bytes = artifacts.get(String(a.byte_hash));
      requireIntake(bytes, "INTAKE_INTEGRITY", "Original artifact is missing");
      return {
        role: a.role,
        document_id: a.document_id,
        name: a.name,
        media_type: a.media_type,
        bytes_base64: bytes.toString("base64"),
        declared_hash: a.declared_hash,
        associations: a.associations,
      };
    }),
  };
}
export function assertIntakeState(state: IntakeState): void {
  const referenced = new Set<string>(),
    bundles = new Map<string, IntakeObject>(),
    keys = new Set<string>();
  for (const b of state.bundles) {
    assertValidIntakeContract("bundle", b);
    requireIntake(
      !bundles.has(String(b.id)) && !keys.has(String(b.preparation_key)),
      "INTAKE_INTEGRITY",
      "Duplicate preparation binding",
    );
    const rebuilt = prepareIntake(
      reconstructPreparation(b, state.artifacts),
      String(b.ingested_at),
      String(b.retained_at),
    ).bundle;
    requireIntake(
      same(b, rebuilt),
      "INTAKE_INTEGRITY",
      "Bytes, derived material or bundle binding changed",
    );
    for (const a of intakeList(b.artifacts))
      referenced.add(String(a.byte_hash));
    bundles.set(String(b.id), b);
    keys.add(String(b.preparation_key));
  }
  requireIntake(
    referenced.size === state.artifacts.size,
    "INTAKE_INTEGRITY",
    "Unreferenced artifact",
  );
  for (const [hash, bytes] of state.artifacts)
    requireIntake(
      referenced.has(hash) && intakeBytesHash(bytes) === hash,
      "INTAKE_INTEGRITY",
      "Source byte hash mismatch",
    );
  const prior: IntakeObject[] = [],
    materials = new Set<string>(),
    commandKeys = new Set<string>(),
    journalIds = new Set<string>();
  let floor = "";
  for (const r of state.commits) {
    assertValidIntakeContract("receipt", r);
    const selection = normalizeIntakeSelection(r.selection, "selection"),
      bundle = bundles.get(String(selection.bundle_id));
    requireIntake(bundle, "INTAKE_INTEGRITY", "Receipt bundle missing");
    requireIntake(
      r.sequence === prior.length + 1 &&
        !materials.has(String(r.material_key)) &&
        !commandKeys.has(r.idempotency_key as string) &&
        !journalIds.has(String(r.journal_entry_id)),
      "INTAKE_INTEGRITY",
      "Receipt ordering or identity conflict",
    );
    const material = buildIntakeMaterial(selection, bundle, prior),
      materialHash = sha256Json(material);
    requireIntake(
      same(material, r.review_material) &&
        materialHash === r.review_material_hash &&
        materialHash === selection.expected_consent_hash &&
        material.material_key === selection.expected_material_key &&
        material.material_key === r.material_key &&
        material.record_key === r.record_key &&
        material.case_root === r.case_root &&
        intakeUpstreamKey(intakeObject(material.record)) === r.upstream_key,
      "INTAKE_INTEGRITY",
      "Consent material changed",
    );
    requireIntake(
      r.hash === sha256Json(withoutHash(r)) &&
        r.command_fingerprint === sha256Json(selection) &&
        r.idempotency_key === selection.idempotency_key &&
        r.id === `intake_commit_${r.command_fingerprint.slice(7)}` &&
        same(r.actor, INTAKE_ACTOR),
      "INTAKE_INTEGRITY",
      "Receipt attribution or hash changed",
    );
    requireIntake(
      (r.recorded_at as string) >= String(bundle.retained_at) &&
        (r.recorded_at as string) >= floor,
      "INTAKE_INTEGRITY",
      "Receipt clock regressed",
    );
    floor = r.recorded_at as string;
    const aggregate = getCase(state.cases, INTAKE_TENANT, String(r.case_id)),
      expectedC = Number(intakeObject(material.target).expected_case_version);
    const entry = aggregate?.journal[expectedC];
    requireIntake(
      aggregate && entry,
      "INTAKE_INTEGRITY",
      "Receipt Case anchor missing",
    );
    const old = aggregate.journal.slice(0, expectedC),
      before = {
        ...state.cases,
        cases: [
          ...state.cases.cases.filter(
            (c) =>
              c.case_id !== aggregate.case_id ||
              c.tenant_id !== aggregate.tenant_id,
          ),
          ...(old.length ? [replayCaseJournal(old)] : []),
        ],
      };
    assertIntakeTarget(material, bundle, before, prior);
    const command = adaptIntakeCommand(
      material,
      String(selection.idempotency_key),
      r.recorded_at as string,
    );
    requireIntake(
      same(command, r.adapted_command) &&
        r.case_id === material.target_case_id &&
        r.previous_intake_hash === material.expected_prior_intake_binding &&
        r.journal_entry_id === entry.id &&
        r.journal_entry_hash === entry.event_hash &&
        r.case_version === entry.case_version &&
        r.recorded_at === entry.recorded_at &&
        entry.correlation_id === command.correlation_id,
      "INTAKE_INTEGRITY",
      "Case journal binding changed",
    );
    const retry = executeCaseCommand(state.cases, command, {
      now: () => {
        throw new Error("Replay must not consume time");
      },
      nextId: () => {
        throw new Error("Replay must not consume IDs");
      },
    });
    requireIntake(
      retry.status === "duplicate" &&
        retry.original_entry.event_hash === entry.event_hash,
      "INTAKE_INTEGRITY",
      "Generated command does not reproduce its Case receipt",
    );
    prior.push(r);
    materials.add(String(r.material_key));
    commandKeys.add(r.idempotency_key as string);
    journalIds.add(r.journal_entry_id);
  }
  for (const c of state.cases.cases)
    for (const entry of c.journal) {
      const event =
        entry.event_type === "case.created"
          ? intakeList(intakeObject(entry.payload.document).events)[0]
          : entry.event_type === "case.work_event_attached"
            ? intakeObject(entry.payload.work_event)
            : undefined;
      if (event?.source === "fieldruntime_intake")
        requireIntake(
          journalIds.has(entry.id),
          "INTAKE_INTEGRITY",
          "Intake Case event has no provenance receipt",
        );
    }
  assertRequestBindings(state);
}
// Preparation command metadata refers to the existing original bytes, never copies them.
export function intakeRequestMetadata(
  input: IntakeObject,
  operation: string,
): IntakeObject {
  if (operation === "commit") return input;
  return {
    ...input,
    artifacts: intakeList(input.artifacts).map(({ bytes_base64, ...a }) => ({
      ...a,
      byte_hash: intakeBytesHash(Buffer.from(String(bytes_base64), "base64")),
    })),
  };
}
function assertRequestBindings(state: IntakeState): void {
  const keys = new Set([
    ...state.bundles.map((b) => `prepare:${String(b.preparation_key)}`),
    ...state.commits.map((r) => `commit:${String(r.idempotency_key)}`),
  ]);
  for (const b of state.requestBindings ?? []) {
    assertValidIntakeContract("request_binding", b);
    const key = `${String(b.operation)}:${String(b.idempotency_key)}`;
    requireIntake(
      !keys.has(key) &&
        b.hash === sha256Json(withoutHash(b)) &&
        new Date(String(b.recorded_at)).toISOString() === b.recorded_at,
      "INTAKE_INTEGRITY",
      "Request binding identity, hash or time changed",
    );
    keys.add(key);
    const metadata = intakeObject(b.request),
      result = intakeObject(b.result);
    let input: IntakeObject;
    if (b.operation === "prepare") {
      input = normalizeIntakePrepare({
        ...metadata,
        artifacts: intakeList(metadata.artifacts).map(({ byte_hash, ...a }) => {
          const bytes = state.artifacts.get(String(byte_hash));
          requireIntake(
            bytes,
            "INTAKE_INTEGRITY",
            "Request source bytes missing",
          );
          return { ...a, bytes_base64: bytes.toString("base64") };
        }),
      });
      const original = state.bundles.find((v) => v.id === result.bundle_id);
      requireIntake(
        original &&
          result.status === "already_retained" &&
          original.hash === result.bundle_hash &&
          b.recorded_at >= String(original.retained_at) &&
          prepareIntake(
            input,
            String(original.ingested_at),
            String(original.retained_at),
          ).bundle.id === original.id,
        "INTAKE_INTEGRITY",
        "Preparation request no longer reproduces its original bundle",
      );
    } else {
      input = normalizeIntakeSelection(metadata, "selection");
      const original = state.commits.find((v) => v.id === result.receipt_id),
        bundle = state.bundles.find((v) => v.id === input.bundle_id);
      requireIntake(
        original &&
          bundle &&
          result.status === "already_committed" &&
          original.hash === result.receipt_hash &&
          b.recorded_at >= String(original.recorded_at),
        "INTAKE_INTEGRITY",
        "Commit request original receipt missing or changed",
      );
      const material = buildIntakeMaterial(input, bundle, state.commits);
      requireIntake(
        material.material_key === original.material_key &&
          material.target_case_id === original.case_id &&
          material.material_key === input.expected_material_key &&
          sha256Json(material) === input.expected_consent_hash,
        "INTAKE_INTEGRITY",
        "Commit request does not reproduce its original material/target",
      );
    }
    requireIntake(
      input.idempotency_key === b.idempotency_key &&
        sha256Json(input) === b.request_fingerprint &&
        same(intakeRequestMetadata(input, String(b.operation)), metadata),
      "INTAKE_INTEGRITY",
      "Request fingerprint or normalized metadata changed",
    );
  }
}
export function exportIntakeState(state: IntakeState): IntakeObject {
  assertIntakeState(state);
  const referenced = new Set(state.commits.map((r) => String(r.case_id)));
  const cases = state.cases.cases.filter(
    (c) => c.tenant_id === INTAKE_TENANT && referenced.has(c.case_id),
  );
  const caseState = {
    cases,
    idempotency_records: state.cases.idempotency_records.filter(
      (r) => r.tenant_id === INTAKE_TENANT && referenced.has(r.case_id),
    ),
    source_event_records: state.cases.source_event_records.filter(
      (r) => r.tenant_id === INTAKE_TENANT && referenced.has(r.case_id),
    ),
  };
  const content = {
    schema_version: "intake-export.v2",
    request_bindings: state.requestBindings ?? [],
    tenant_id: INTAKE_TENANT,
    scope_ids: [...INTAKE_SCOPES],
    artifacts: [...state.artifacts]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([byte_hash, bytes]) => ({
        byte_hash,
        bytes_base64: bytes.toString("base64"),
      })),
    bundles: state.bundles,
    commits: state.commits,
    case_state: caseState,
  };
  const result = { ...content, hash: sha256Json(content) };
  assertValidIntakeContract("export", result);
  return immutableJson(result);
}
export function validateIntakeExport(value: unknown): IntakeState {
  assertValidIntakeContract("export", value);
  const data = intakeObject(immutableJson(value));
  requireIntake(
    data.hash === sha256Json(withoutHash(data)) &&
      same(data.scope_ids, INTAKE_SCOPES),
    "INTAKE_INTEGRITY",
    "Export scope or hash mismatch",
  );
  const cases = assertCaseEngineStateIntegrity(
    data.case_state as CaseEngineState,
  );
  requireIntake(
    cases.cases.every(
      (c) =>
        c.tenant_id === INTAKE_TENANT &&
        intakeList(data.commits).some((r) => r.case_id === c.case_id),
    ),
    "INTAKE_INTEGRITY",
    "Export includes unrelated Cases",
  );
  const artifacts = new Map(
    intakeList(data.artifacts).map((a) => {
      const bytes = Buffer.from(String(a.bytes_base64), "base64");
      requireIntake(
        bytes.toString("base64") === a.bytes_base64,
        "INTAKE_INTEGRITY",
        "Export byte encoding changed",
      );
      return [String(a.byte_hash), bytes] as const;
    }),
  );
  requireIntake(
    artifacts.size === intakeList(data.artifacts).length,
    "INTAKE_INTEGRITY",
    "Duplicate export artifacts",
  );
  const state = {
    cases,
    artifacts,
    bundles: intakeList(data.bundles),
    commits: intakeList(data.commits),
    clockFloor: "",
    requestBindings:
      data.schema_version === "intake-export.v2"
        ? intakeList(data.request_bindings)
        : [],
  };
  assertIntakeState(state);
  return state;
}
