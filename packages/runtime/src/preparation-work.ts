import {
  investigationRequest,
  investigationReservation,
  validateInvestigationEvidence,
  investigationResult,
} from "./investigation.js";
import {
  preparationResources,
  requirePreparationResources,
  exactBundleBindings,
} from "./preparation-resources.js";
import {
  assertValidPreparationWorkContract,
  assertValidPreparationWorkV2Contract,
  assertValidPreparationWorkV3Contract,
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  intakeObject as o,
  intakeList as l,
  requireIntake as ensure,
  INTAKE_TENANT,
  type IntakeObject as Obj,
} from "./intake.js";
import { withHash } from "./discovery.js";
import {
  assertPackState,
  exportPackState,
  validatePackExport,
  readPack,
  packSupportManifest,
  historicalPackSupport,
  syntheticWorkerPackContext,
  syntheticContinuationPackContext,
  syntheticInvestigationPackContext,
  type PackState,
  type PackContext,
  type PackTarget,
} from "./preparation-pack.js";
import {
  WORK_LIMITS,
  assertWorkReader,
  workActor,
  syntheticWorkerProfile,
  syntheticContinuationProfile,
  syntheticInvestigationProfile,
} from "./preparation-worker-profile.js";
import { prepareDisposition } from "./disposition-preparation.js";
export interface WorkState {
  readonly pack: PackState;
  readonly entries: readonly Obj[];
}
export interface WorkContext {
  readonly pack: PackContext;
  readonly profile: Obj;
}
export function syntheticWorkContext(): WorkContext {
  return {
    pack: syntheticWorkerPackContext(),
    profile: syntheticWorkerProfile(),
  };
}
export function syntheticContinuationContext(): WorkContext {
  return {
    pack: syntheticContinuationPackContext(),
    profile: syntheticContinuationProfile(),
  };
}
export function syntheticInvestigationContext(): WorkContext {
  return {
    pack: syntheticInvestigationPackContext(),
    profile: syntheticInvestigationProfile(),
  };
}
const generation = (v: Obj): number =>
  v.implementation_id === "disposition-investigation.v1" ||
  v.worker_implementation_id === "disposition-investigation.v1" ||
  String(v.schema_version).endsWith(".v3")
    ? 3
    : v.worker_implementation_id === "disposition-code.v3" ||
        String(v.schema_version).endsWith(".v2")
      ? 2
      : 1;
function validateWork(
  kind: Parameters<typeof assertValidPreparationWorkContract>[0],
  v: unknown,
): asserts v is Obj {
  if (v && typeof v === "object" && generation(v as Obj) === 3)
    assertValidPreparationWorkV3Contract(kind, v);
  else if (v && typeof v === "object" && generation(v as Obj) === 2)
    assertValidPreparationWorkV2Contract(kind, v);
  else assertValidPreparationWorkContract(kind, v);
}
const same = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);
const checked = (
  kind:
    "binding" | "input" | "result" | "journal" | "receipt" | "read" | "export",
  v: Obj,
): Obj => {
  validateWork(kind, v);
  return immutableJson(v);
};
const listStrings = (v: unknown): string[] => v as string[];
const head = (s: WorkState, id: unknown): Obj | undefined =>
  s.entries.filter((e) => e.case_id === id).at(-1);
const versions = (p: Obj): Obj => ({
  worker: p.implementation_id,
  validator: `preparation-result-validator.v${String(generation(p))}`,
  journal: `preparation-work.v${String(generation(p))}`,
});
const floor = (s: WorkState): string =>
  [
    s.pack.discovery.intake.clockFloor,
    ...s.pack.discovery.entries.map((e) => String(e.recorded_at)),
    ...s.pack.entries.map((e) => String(e.recorded_at)),
    ...s.entries.map((e) => String(e.recorded_at)),
  ]
    .sort()
    .at(-1) ?? "";
const withoutHash = (e: Obj): Obj =>
  Object.fromEntries(Object.entries(e).filter(([k]) => k !== "hash"));
export function normalizeWorkCommand(v: unknown): Obj {
  validateWork("command", v);
  ensure(
    String(v.idempotency_key).trim() &&
      Buffer.byteLength(canonicalJson(v)) <= 131072,
    "INVALID_INPUT",
    "Give a bounded exact work command and key",
  );
  if (v.reason !== undefined)
    ensure(
      (v.reason as string).trim(),
      "INVALID_INPUT",
      "Give a review or intervention reason",
    );
  if (v.operation === "task_review" && v.decision === "modify")
    ensure(
      typeof v.replacement_proposal === "string" &&
        v.replacement_proposal.trim(),
      "INVALID_INPUT",
      "Modification requires an explicit replacement proposal",
    );
  return immutableJson(v);
}
export function workSupport(s: PackState): Obj {
  return {
    discovery: packSupportManifest(s.discovery),
    selection_hashes: s.entries.map((e) => e.hash),
  };
}
export function historicalWorkSupport(
  s: PackState,
  m: Obj,
  at: string,
): PackState {
  const hashes = listStrings(m.selection_hashes),
    entries = s.entries.slice(0, hashes.length);
  ensure(
    same(
      entries.map((e) => e.hash),
      hashes,
    ) &&
      entries.every((e) => String(e.recorded_at) <= at) &&
      s.entries.slice(hashes.length).every((e) => String(e.recorded_at) >= at),
    "WORK_INTEGRITY",
    "Work omitted an earlier publication or cited a future selection",
  );
  return {
    discovery: historicalPackSupport(s.discovery, o(m.discovery), at),
    entries,
  };
}
function target(s: WorkState, caseId: string, recordKey: string): PackTarget {
  const receipt = s.pack.discovery.intake.commits.findLast(
    (c) => c.case_id === caseId && c.record_key === recordKey,
  );
  ensure(receipt, "NOT_FOUND", "This record has no canonical intake Case");
  return {
    case_id: caseId,
    record_key: recordKey,
    bundle_id: String(o(receipt.selection).bundle_id),
  };
}
function currentBinding(
  s: WorkState,
  t: PackTarget,
  at: string,
  c: WorkContext,
): Obj {
  assertWorkReader(c.profile);
  ensure(
    same(c.pack.worker_profile, c.profile),
    "WORK_PROFILE_CONFLICT",
    "Worker and publication profiles differ",
  );
  workActor(c.profile, "prepare_disposition_packet", at);
  const v = readPack(s.pack, t, at, c.pack),
    a = v.selected_artifact;
  ensure(
    a &&
      o(a).schema_version ===
        (generation(c.profile) === 3
          ? "preparation-pack.v4"
          : generation(c.profile) === 2
            ? "preparation-pack.v3"
            : "preparation-pack.v2"),
    "WORK_COMPATIBILITY_REQUIRED",
    generation(c.profile) === 3
      ? "Explicit compatible v4 investigation publication is required; older publications do not gain model capacity"
      : generation(c.profile) === 2
        ? "Explicit compatible v3 publication is required; historical publications do not gain new capacity"
        : "Explicit worker-capable v2 publication is required; v1 prohibits dispatch",
  );
  ensure(
    o(v.current).eligible,
    "WORK_BASIS_CONFLICT",
    `Preparation permission is not current: ${listStrings(o(v.current).reasons).join(" ")}`,
  );
  const artifact = o(a),
    basis = o(artifact.binding),
    manifest = o(basis.manifest);
  const resources =
    generation(c.profile) >= 2
      ? preparationResources(s.pack, artifact, c.profile)
      : null;
  if (resources) requirePreparationResources(resources.preflight);
  const binding = checked("binding", {
    tenant_id: INTAKE_TENANT,
    case_id: t.case_id,
    record_key: t.record_key,
    entity_id: "entity_north",
    source_revision: manifest.source_revision,
    pack_id: artifact.pack_id,
    pack_version: artifact.version,
    artifact_hash: v.selected_artifact_hash,
    selection_revision: v.selection_revision,
    selection_head: v.selection_head,
    basis,
    worker_implementation_id: c.profile.implementation_id,
    worker_profile_hash: sha256Json(c.profile),
    ...(resources
      ? { retained_bundles: exactBundleBindings(resources.bundles) }
      : {}),
  });
  if (generation(c.profile) === 3)
    investigationRequest(bindingInput(s, binding));
  return binding;
}
function bindingInput(s: WorkState, b: Obj): Obj {
  const artifact = s.pack.entries.find(
    (e) => e.operation === "publish" && e.artifact_hash === b.artifact_hash,
  )?.artifact;
  ensure(
    artifact,
    "WORK_INTEGRITY",
    "Published investigation artifact unavailable",
  );
  const resources = preparationResources(
    s.pack,
    o(artifact),
    o(
      s.pack.entries.find((e) => e.artifact_hash === b.artifact_hash)
        ?.worker_profile,
    ),
  );
  requirePreparationResources(resources.preflight);
  const selected = resources.bundles.find(
    (x) => x.id === o(o(b.basis).manifest).bundle_id,
  );
  const record =
    selected && l(selected.records).find((r) => r.record_key === b.record_key);
  ensure(record, "WORK_INTEGRITY", "Investigation record unavailable");
  return {
    binding: b,
    artifact,
    selected_record: record,
    retained_bundles: resources.bundles,
  };
}
function startOf(s: WorkState, id: unknown): Obj {
  const e = s.entries.find(
    (e) => e.event === "started" && e.invocation_id === id,
  );
  ensure(e, "NOT_FOUND", "Original preparation invocation is unavailable");
  return e;
}
function terminalOf(s: WorkState, id: unknown): Obj | undefined {
  return s.entries.find(
    (e) =>
      e.invocation_id === id &&
      ["terminal_result", "interrupt"].includes(String(e.event)),
  );
}
function reviewOf(s: WorkState, id: unknown): Obj | undefined {
  return s.entries.find(
    (e) => e.invocation_id === id && e.event === "task_review",
  );
}
export function workInput(s: WorkState, start: Obj): Obj {
  const b = o(o(start.command).binding),
    basis = o(b.basis),
    manifest = o(basis.manifest);
  const artifact = s.pack.entries.find(
    (e) => e.operation === "publish" && e.artifact_hash === b.artifact_hash,
  )?.artifact;
  ensure(
    artifact && sha256Json(artifact) === b.artifact_hash,
    "WORK_INTEGRITY",
    "Original published artifact missing",
  );
  const bundle = s.pack.discovery.intake.bundles.find(
      (b) => b.id === manifest.bundle_id,
    ),
    record =
      bundle && l(bundle.records).find((r) => r.record_key === b.record_key);
  ensure(
    bundle && record,
    "WORK_INTEGRITY",
    "Original worker subject is missing",
  );
  const modern = generation(b) >= 2;
  const resources = modern
    ? preparationResources(s.pack, o(artifact), o(start.worker_profile))
    : null;
  if (resources) {
    requirePreparationResources(resources.preflight);
    ensure(
      same(b.retained_bundles, exactBundleBindings(resources.bundles)),
      "WORK_INTEGRITY",
      "The exact participating bundle binding changed",
    );
  }
  const supports = l(bundle.artifacts).filter(
    (a) =>
      a.role === "support" &&
      l(a.associations).some(
        (assoc) =>
          assoc.entity === record.entity &&
          ((assoc.kind === "record" && assoc.id === record.source_record_id) ||
            l(record.business_objects).some(
              (x) => x.kind === assoc.kind && x.id === assoc.id,
            )),
      ),
  );
  const parsed = l(bundle.artifacts)
    .filter((a) => a.interpretation !== "retained_only")
    .reduce((n, a) => n + Number(a.byte_length), 0);
  if (!modern)
    ensure(
      new Set([
        bundle.id,
        ...l(o(artifact).sources).map((source) => source.bundle_id),
      ]).size <= WORK_LIMITS.retained_bundles &&
        Number(o(bundle.coverage).physical_records) <=
          WORK_LIMITS.coverage_rows &&
        supports.length <= WORK_LIMITS.associated_support_artifacts &&
        parsed <= WORK_LIMITS.parsed_utf8_bytes,
      "WORK_INPUT_LIMIT",
      "The fixed worker input limit was exceeded; no evidence was truncated",
    );
  return checked("input", {
    schema_version:
      generation(b) === 3
        ? "preparation-worker-input.v3"
        : modern
          ? "preparation-worker-input.v2"
          : "preparation-worker-input.v1",
    invocation_id: start.invocation_id,
    started_entry_hash: start.hash,
    binding: b,
    artifact,
    selected_record: record,
    covered_records: bundle.records,
    associated_support_count: resources
      ? o(resources.preflight.counts).associated_support_artifacts
      : supports.length,
    parsed_utf8_bytes: resources
      ? o(resources.preflight.counts).parsed_utf8_bytes
      : parsed,
    ...(resources ? { retained_bundles: resources.bundles } : {}),
  });
}
function assertAt(s: WorkState, at: string): void {
  ensure(
    new Date(at).toISOString() === at && at >= floor(s),
    "CLOCK_REGRESSION",
    "Work clock predates retained canonical evidence",
  );
}
function assertHead(s: WorkState, caseId: unknown, command: Obj): void {
  const prev = head(s, caseId);
  ensure(
    command.expected_work_revision === (prev?.sequence ?? 0) &&
      command.expected_work_head === (prev?.hash ?? null),
    "WORK_HEAD_CONFLICT",
    "Work history changed. Refresh, inspect and explicitly resubmit the new binding.",
  );
}
function baseEntry(
  s: WorkState,
  command: Obj | null,
  start: Obj | undefined,
  c: WorkContext,
  at: string,
  actor: Obj,
): Obj {
  const b = start ? o(o(start.command).binding) : o(command?.binding),
    caseId = b.case_id,
    prev = head(s, caseId),
    fp = command ? sha256Json(command) : null,
    invocation = start?.invocation_id ?? `preparation_${String(fp).slice(7)}`;
  return {
    schema_version: `preparation-work-entry.v${String(Math.max(generation(c.profile), start ? generation(start) : 1, command ? generation(command) : 1))}`,
    tenant_id: INTAKE_TENANT,
    case_id: caseId,
    record_key: b.record_key,
    id: `work_${sha256Json({ caseId, previous: prev?.hash ?? null, fp, invocation }).slice(7)}`,
    event:
      command?.operation === "start"
        ? "started"
        : (command?.operation ?? "terminal_result"),
    sequence: Number(prev?.sequence ?? 0) + 1,
    previous_entry_hash: prev?.hash ?? null,
    invocation_id: invocation,
    command,
    idempotency_key: command?.idempotency_key ?? null,
    command_fingerprint: fp,
    actor,
    worker_profile: c.profile,
    publication_context: {
      profile: c.pack.profile,
      template_id: c.pack.template_id,
      worker_profile: c.pack.worker_profile ?? c.profile,
    },
    binding_hash: sha256Json(b),
    started_entry_hash: start?.hash ?? null,
    input_manifest: workSupport(s.pack),
    recorded_at: at,
    versions: versions(o(start?.worker_profile ?? c.profile)),
    computation_budget_ms:
      generation(o(start?.worker_profile ?? c.profile)) === 3 ? 60000 : 5000,
    ...(Math.max(
      generation(c.profile),
      start ? generation(start) : 1,
      command ? generation(command) : 1,
    ) === 3
      ? { reservation: start?.reservation ?? null, investigation: null }
      : {}),
    outcome: "recorded",
    result: null,
    result_hash: null,
    conformance: "not_run",
    diagnostics: [],
    parent_timing: null,
    candidate: null,
    authority_granted: false,
    closure_permission: false,
  };
}
function noPending(s: WorkState, caseId: unknown): void {
  ensure(
    !s.entries.some(
      (e) =>
        e.case_id === caseId &&
        e.event === "started" &&
        !terminalOf(s, e.invocation_id),
    ),
    "WORK_PENDING",
    "Inspect and explicitly interrupt the pending invocation before another command",
  );
}
function assertCurrentStart(
  s: WorkState,
  start: Obj,
  at: string,
  c: WorkContext,
): void {
  const b = o(o(start.command).binding),
    t = target(s, String(start.case_id), String(start.record_key));
  ensure(
    same(b, currentBinding(s, t, at, c)),
    "WORK_BASIS_CONFLICT",
    "Case, description, inputs, selection or worker profile changed; historical completion gives no current permission",
  );
}
function pointer(result: Obj, path: unknown): unknown {
  ensure(
    typeof path === "string" &&
      /^\/(title|follow_up|evidence_checklist|reconciliation)(\/|$)/.test(path),
    "INVALID_INPUT",
    "Correction must identify a preparation claim or draft",
  );
  let value: unknown = result;
  for (const key of path
    .slice(1)
    .split("/")
    .map((k) => k.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    ensure(
      !["__proto__", "prototype", "constructor"].includes(key) &&
        value !== null &&
        typeof value === "object" &&
        Object.hasOwn(value, key),
      "INVALID_INPUT",
      "Correction pointer is not in the original result",
    );
    value = (value as Obj)[key];
  }
  return value;
}
function candidate(start: Obj, result: Obj, command: Obj): Obj {
  const testcase = {
    input_hash: sha256Json(o(o(start.command).binding).basis),
    original_result_hash: sha256Json(result),
    target: command.target,
    before: command.before,
    after: command.after,
    classification: command.classification,
    evidence_limits: command.evidence_limits,
    citation_ids: command.citation_ids,
  };
  return {
    id: `evaluation_${sha256Json(command).slice(7)}`,
    revision: 1,
    status: "not_reviewed",
    input_hash: testcase.input_hash,
    original_result_hash: sha256Json(result),
    expected_result_hash: sha256Json({
      original_result_hash: sha256Json(result),
      target: command.target,
      after: command.after,
    }),
    test_case_hash: sha256Json(testcase),
    target: command.target,
    expected_text: command.after,
    promotion: "none",
  };
}
function validateNote(s: WorkState, start: Obj, command: Obj): void {
  const n = o(command.note),
    coverage = o(n.coverage),
    p = o(n.period),
    source = o(n.source),
    measure = String(n.measure);
  ensure(
    command.binding_hash === start.binding_hash,
    "WORK_BINDING_CONFLICT",
    "Proof note input binding differs",
  );
  const terminal = terminalOf(s, start.invocation_id);
  ensure(
    terminal && command.result_hash === terminal.result_hash,
    "WORK_BINDING_CONFLICT",
    "A proof note must cite the exact terminal result, including a failed result",
  );
  ensure(
    String(p.start) <= String(p.end) &&
      [p.start, p.end].every((t) => new Date(String(t)).toISOString() === t),
    "INVALID_TIME",
    "Use an ordered canonical synthetic observation period",
  );
  ensure(
    coverage.denominator === null ||
      Number(coverage.numerator) <= Number(coverage.denominator),
    "INVALID_INPUT",
    "Coverage numerator exceeds denominator",
  );
  ensure(
    (n.value === null) === (n.qualification === "unknown"),
    "INVALID_INPUT",
    "Unknown values must stay null; other values require explicit qualification",
  );
  ensure(
    source.observed_at === null
      ? n.qualification !== "measured"
      : typeof source.observed_at === "string" &&
          new Date(source.observed_at).toISOString() === source.observed_at,
    "INVALID_TIME",
    "Measured notes require a canonical UTC source observation time; supplied observation times must use UTC",
  );
  const kind: Record<string, string> = {
    cash_collected: "cash_receipt",
    disputes_resolved: "accepted_disposition",
    credits_issued: "posted_credit",
    work_newly_attended_to: "prior_coverage_and_progress",
    human_attention_released: "active_effort_comparison",
  };
  ensure(
    n.value === null ||
      source.kind ===
        (measure.startsWith("cost_") ? "cost_report" : kind[measure]),
    "INVALID_INPUT",
    "Source evidence kind does not support this separate measure",
  );
  const money = ["cash_collected", "credits_issued"].includes(measure),
    count = ["disputes_resolved", "work_newly_attended_to"].includes(measure);
  ensure(
    !money || n.unit === "currency_minor",
    "INVALID_INPUT",
    "Cash and credits use separate minor currency units",
  );
  ensure(
    !count || n.unit === "records",
    "INVALID_INPUT",
    "Coverage/disposition measures use record counts",
  );
  ensure(
    measure !== "human_attention_released" || n.unit === "person_minutes",
    "INVALID_INPUT",
    "Attention uses signed active person-minutes, not waiting",
  );
  ensure(
    n.unit === "currency_minor" ? n.currency !== null : n.currency === null,
    "INVALID_INPUT",
    "Keep currency attached only to monetary units",
  );
  if (n.value !== null && count)
    ensure(
      Number.isSafeInteger(n.value) && Number(n.value) >= 0,
      "INVALID_INPUT",
      "Record counts must be nonnegative integers",
    );
  if (n.value !== null && measure === "work_newly_attended_to")
    ensure(
      n.prior_coverage_known === true &&
        n.substantive_progress === true &&
        coverage.denominator !== null,
      "INVALID_INPUT",
      "Import or unknown prior coverage cannot establish newly attended work",
    );
  if (n.value !== null && measure === "human_attention_released")
    ensure(
      n.baseline_person_minutes !== null &&
        n.actual_person_minutes !== null &&
        n.value ===
          Number(n.baseline_person_minutes) - Number(n.actual_person_minutes) &&
        coverage.denominator !== null,
      "INVALID_INPUT",
      "Signed attention needs a comparable baseline and all actual active effort; retain negative results",
    );
  const refs = [
    n.supersedes_entry_hash,
    n.reversal_of_entry_hash,
    n.reopens_entry_hash,
    ...listStrings(n.overlap_entry_hashes),
  ].filter((v) => v !== null);
  for (const hash of refs)
    ensure(
      s.entries.some(
        (e) =>
          e.hash === hash &&
          e.event === "proof_note" &&
          e.case_id === start.case_id &&
          (![
            n.supersedes_entry_hash,
            n.reversal_of_entry_hash,
            n.reopens_entry_hash,
          ].includes(hash) ||
            o(o(e.command).note).measure === measure),
      ),
      "INVALID_INPUT",
      "Proof corrections must retain the same measure and Case; cross-measure relationships use overlap only",
    );
}
export function appendWorkCommand(
  s: WorkState,
  input: unknown,
  at: string,
  c: WorkContext = syntheticWorkContext(),
): Obj {
  const command = normalizeWorkCommand(input);
  assertAt(s, at);
  assertWorkReader(c.profile);
  if (command.operation === "start") {
    const b = o(command.binding);
    ensure(
      generation(command) === generation(c.profile) &&
        generation(b) === generation(c.profile),
      "WORK_COMPATIBILITY_REQUIRED",
      "The command version must match the explicitly published worker capacity",
    );
    assertHead(s, b.case_id, command);
    noPending(s, b.case_id);
    const current = currentBinding(
      s,
      target(s, String(b.case_id), String(b.record_key)),
      at,
      c,
    );
    ensure(
      same(current, b),
      "WORK_BINDING_CONFLICT",
      "Submitted start binding differs from the current canonical publication",
    );
    const prior = s.entries
      .filter((e) => e.case_id === b.case_id && e.event === "started")
      .at(-1);
    ensure(
      command.replaces_invocation === (prior?.invocation_id ?? null),
      "WORK_REPLACEMENT_REQUIRED",
      "A new run must explicitly name the prior completed or interrupted invocation; no task review transfers",
    );
    const provisional = withHash({
      ...baseEntry(
        s,
        command,
        undefined,
        c,
        at,
        workActor(c.profile, "prepare_disposition_packet", at),
      ),
      outcome: "started",
    });
    const input = workInput(s, provisional);
    const e = checked(
      "journal",
      withHash({
        ...withoutHash(provisional),
        ...(generation(c.profile) === 3
          ? {
              reservation: investigationReservation(
                s.entries,
                input,
                c.profile,
              ),
            }
          : {}),
      }),
    );
    workInput(s, e);
    return e;
  }
  const start = startOf(s, command.invocation_id);
  assertHead(s, start.case_id, command);
  const actor = workActor(
    c.profile,
    command.operation === "evaluation_review"
      ? "review_synthetic_evaluation_candidate"
      : "review_preparation_task",
    at,
  );
  if (command.operation === "interrupt") {
    ensure(
      !terminalOf(s, start.invocation_id),
      "WORK_TERMINAL",
      "This invocation is already terminal",
    );
    return checked(
      "journal",
      withHash({
        ...baseEntry(s, command, start, c, at, actor),
        outcome: "interrupted",
      }),
    );
  }
  noPending(s, start.case_id);
  const terminal = terminalOf(s, start.invocation_id),
    result = terminal?.result;
  if (command.operation === "task_review") {
    ensure(
      result && command.result_hash === terminal.result_hash,
      "WORK_BINDING_CONFLICT",
      "Review requires the exact retained preparation result",
    );
    ensure(
      !reviewOf(s, start.invocation_id),
      "WORK_REVIEW_TERMINAL",
      "A terminal task review cannot be revived",
    );
    if (command.decision === "approve") {
      ensure(
        terminal.outcome !== "invalidated",
        "WORK_BASIS_CONFLICT",
        "Invalidated results cannot be accepted",
      );
      assertCurrentStart(s, start, at, c);
    }
  } else if (command.operation === "correction") {
    ensure(
      result &&
        command.original_result_hash === terminal.result_hash &&
        command.binding_hash === start.binding_hash,
      "WORK_BINDING_CONFLICT",
      "Correction must bind the original result and inputs",
    );
    ensure(
      pointer(o(result), command.target) === command.before &&
        command.before !== command.after,
      "WORK_BINDING_CONFLICT",
      "Correction before-text differs or contains no change",
    );
    const inp = workInput(
      {
        pack: historicalWorkSupport(
          s.pack,
          o(start.input_manifest),
          String(start.recorded_at),
        ),
        entries: s.entries,
      },
      start,
    );
    const citations = new Set(l(o(inp.artifact).sources).map((x) => x.id));
    ensure(
      listStrings(command.citation_ids).every((id) => citations.has(id)),
      "INVALID_INPUT",
      "Correction citations must belong to retained input material",
    );
  } else if (command.operation === "evaluation_review") {
    const correction = s.entries.find(
        (e) =>
          e.hash === command.correction_entry_hash &&
          e.event === "correction" &&
          e.invocation_id === start.invocation_id,
      ),
      v = o(correction?.candidate ?? {});
    ensure(
      correction && o(correction.actor).identity_id !== actor.identity_id,
      "WORK_ACTOR_REQUIRED",
      "Evaluation review must be independent of the correction author",
    );
    ensure(
      v.id === command.candidate_id &&
        v.revision === command.expected_candidate_revision &&
        v.test_case_hash === command.expected_test_case_hash,
      "WORK_BINDING_CONFLICT",
      "Evaluation candidate binding changed",
    );
    ensure(
      !s.entries.some(
        (e) =>
          e.event === "evaluation_review" &&
          o(e.command).correction_entry_hash === correction.hash,
      ),
      "WORK_REVIEW_TERMINAL",
      "Evaluation candidate review is terminal",
    );
    ensure(
      listStrings(command.test_references).length > 0,
      "INVALID_INPUT",
      "Give the explicit synthetic test references",
    );
  } else validateNote(s, start, command);
  return checked(
    "journal",
    withHash({
      ...baseEntry(s, command, start, c, at, actor),
      candidate:
        command.operation === "correction"
          ? candidate(start, o(result), command)
          : null,
    }),
  );
}
export function validateWorkerResult(input: Obj, value: unknown): Obj {
  validateWork("result", value);
  ensure(
    Buffer.byteLength(canonicalJson(value)) <= WORK_LIMITS.result_bytes &&
      l(o(value.follow_up).requests).length <= WORK_LIMITS.questions,
    "WORK_RESULT_LIMIT",
    "Worker output exceeds its fixed resource bound",
  );
  ensure(
    same(
      value,
      generation(input) === 3
        ? investigationResult(input, o(value.investigation))
        : prepareDisposition(input),
    ),
    "WORK_RESULT_CONFORMANCE",
    "Worker claims, citations or conclusions differ from canonical scoped preparation",
  );
  return immutableJson(value);
}
export function appendWorkTerminal(
  s: WorkState,
  invocation: unknown,
  result: Obj | null,
  diagnostics: string[],
  timing: Obj,
  at: string,
  c: WorkContext = syntheticWorkContext(),
  investigation: Obj | null = null,
): Obj | null {
  const start = startOf(s, invocation);
  assertAt(s, at);
  if (terminalOf(s, invocation)) return null;
  ensure(
    head(s, start.case_id)?.hash === start.hash,
    "WORK_HEAD_CONFLICT",
    "A late result cannot cross an intervening work entry",
  );
  const budget = generation(o(start.worker_profile)) === 3 ? 60000 : 5000;
  ensure(
    timing.computation_budget_ms === budget &&
      String(timing.computation_started_at) >= String(start.recorded_at) &&
      String(timing.computation_completed_at) >=
        String(timing.computation_started_at) &&
      String(timing.computation_completed_at) <= at &&
      timing.terminal_evaluated_at === at &&
      timing.completed_within_budget ===
        Number(timing.computation_elapsed_ms) <= budget,
    "WORK_INTEGRITY",
    "Invalid parent timing evidence",
  );
  const historical: WorkState = {
    pack: historicalWorkSupport(
      s.pack,
      o(start.input_manifest),
      String(start.recorded_at),
    ),
    entries: s.entries,
  };
  const input = workInput(historical, start);
  if (generation(start) === 3) {
    ensure(
      investigation,
      "WORK_INTEGRITY",
      "Investigation terminal must retain its provider evidence",
    );
    validateInvestigationEvidence(input, investigation);
    ensure(
      same(result, investigationResult(input, investigation)),
      "WORK_INTEGRITY",
      "Result differs from the retained provider evidence",
    );
  } else
    ensure(
      investigation === null,
      "WORK_INTEGRITY",
      "Legacy computation cannot acquire provider evidence",
    );
  if (result) validateWorkerResult(input, result);
  ensure(
    result !== null || diagnostics.length > 0,
    "WORK_INTEGRITY",
    "Missing result requires bounded failure diagnostics",
  );
  let outcome = result ? String(result.outcome) : "failed";
  const why = [...diagnostics];
  try {
    assertCurrentStart(s, start, at, c);
  } catch (e) {
    outcome = "invalidated";
    why.push(
      e instanceof Error ? e.message : "Preparation permission unavailable",
    );
  }
  if (!timing.completed_within_budget) {
    outcome = "failed";
    ensure(
      result === null,
      "WORK_INTEGRITY",
      "Over-budget output cannot become a task result",
    );
  }
  return checked(
    "journal",
    withHash({
      ...baseEntry(s, null, start, c, at, o(start.actor)),
      outcome,
      result,
      result_hash: result ? sha256Json(result) : null,
      conformance: result ? "passed" : "failed",
      diagnostics: why,
      parent_timing: timing,
      ...(generation(start) === 3 ? { investigation } : {}),
    }),
  );
}
export function workReceipt(e: Obj): Obj {
  return checked("receipt", {
    schema_version: `preparation-work-receipt.v${String(generation(e))}`,
    status: "recorded",
    entry: e,
    historical_receipt: true,
    authority_granted: false,
    closure_permission: false,
  });
}
export function assertWorkState(s: WorkState): void {
  assertPackState(s.pack);
  const previous: Obj[] = [],
    keys = new Set<string>();
  const remaining = [...s.entries].sort(
    (a, b) =>
      String(a.recorded_at).localeCompare(String(b.recorded_at)) ||
      String(a.case_id).localeCompare(String(b.case_id)) ||
      Number(a.sequence) - Number(b.sequence),
  );
  while (remaining.length) {
    const earliest = remaining[0]?.recorded_at;
    const index = remaining.findIndex(
      (e) =>
        e.recorded_at === earliest &&
        (e.previous_entry_hash === null ||
          previous.some((p) => p.hash === e.previous_entry_hash)) &&
        (e.event !== "started" ||
          !e.reservation ||
          o(e.reservation).previous_reservation_entry_hash === null ||
          previous.some(
            (p) => p.hash === o(e.reservation).previous_reservation_entry_hash,
          )),
    );
    ensure(
      index >= 0,
      "WORK_INTEGRITY",
      "Invalid work/reservation order or future predecessor",
    );
    const entry = remaining.splice(index, 1)[0];
    ensure(entry, "WORK_INTEGRITY", "Missing next work entry");
    validateWork("journal", entry);
    ensure(
      entry.hash === sha256Json(withoutHash(entry)),
      "WORK_INTEGRITY",
      "Work entry hash changed",
    );
    const state = {
      pack: historicalWorkSupport(
        s.pack,
        o(entry.input_manifest),
        String(entry.recorded_at),
      ),
      entries: previous,
    };
    const c: WorkContext = {
      profile: o(entry.worker_profile),
      pack: o(entry.publication_context) as unknown as PackContext,
    };
    let rebuilt: Obj | null;
    if (entry.event === "terminal_result") {
      // Original operational failures are retained, while valid output, timing and
      // current-at-terminal invalidation are deterministically rechecked.
      const original = listStrings(entry.diagnostics),
        start = startOf(state, entry.invocation_id);
      let generated: string[] = [];
      try {
        assertCurrentStart(state, start, String(entry.recorded_at), c);
      } catch (e) {
        generated = [
          e instanceof Error ? e.message : "Preparation permission unavailable",
        ];
      }
      const diagnostics =
        generated.length && same(original.slice(-1), generated)
          ? original.slice(0, -1)
          : original;
      rebuilt = appendWorkTerminal(
        state,
        entry.invocation_id,
        entry.result === null ? null : o(entry.result),
        diagnostics,
        o(entry.parent_timing),
        String(entry.recorded_at),
        c,
        entry.investigation ? o(entry.investigation) : null,
      );
    } else {
      const key = canonicalJson([
        entry.case_id,
        entry.event,
        entry.idempotency_key,
      ]);
      ensure(!keys.has(key), "WORK_INTEGRITY", "Duplicate successful work key");
      keys.add(key);
      rebuilt = appendWorkCommand(
        state,
        entry.command,
        String(entry.recorded_at),
        c,
      );
    }
    ensure(
      same(rebuilt, entry),
      "WORK_INTEGRITY",
      "Work result, attribution, input anchors or review cannot be reconstructed",
    );
    previous.push(entry);
  }
}
const why = (fn: () => void): string[] => {
  try {
    fn();
    return [];
  } catch (e) {
    return [e instanceof Error ? e.message : "Work unavailable"];
  }
};
export function readWork(
  s: WorkState,
  caseId: string,
  recordKey: string,
  at: string,
  c: WorkContext = syntheticWorkContext(),
  resourceAware = generation(c.profile) >= 2,
): Obj {
  assertWorkReader(c.profile);
  const t = target(s, caseId, recordKey),
    last = head(s, caseId),
    entries = s.entries.filter((e) => e.case_id === caseId);
  let binding: Obj | null = null;
  let preflight: Obj | null = null;
  const resourceReasons = resourceAware
    ? why(() => {
        const v = readPack(s.pack, t, at, c.pack);
        if (v.candidate)
          preflight = preparationResources(
            s.pack,
            o(v.candidate),
            c.profile,
          ).preflight;
        if (preflight) requirePreparationResources(preflight);
      })
    : [];
  const reasons = [
    ...resourceReasons,
    ...why(() => {
      assertAt(s, at);
      const current = currentBinding(s, t, at, c);
      binding = current;
      if (generation(c.profile) === 3)
        investigationReservation(
          s.entries,
          bindingInput(s, current),
          c.profile,
        );
      if (resourceAware && generation(c.profile) === 1) {
        const a = s.pack.entries.find(
          (e) =>
            e.artifact_hash === current.artifact_hash &&
            e.operation === "publish",
        )?.artifact;
        if (a)
          requirePreparationResources(
            preparationResources(s.pack, o(a), c.profile).preflight,
          );
      }
    }),
  ];
  const pending = entries.find(
    (e) => e.event === "started" && !terminalOf(s, e.invocation_id),
  );
  if (pending)
    reasons.push(
      "Inspect the pending invocation; interrupt explicitly before starting fresh.",
    );
  const humanReasons = why(() => {
    assertAt(s, at);
    workActor(c.profile, "review_preparation_task", at);
  });
  const starts = entries.filter(
    (e) => e.event === "started" && e.record_key === recordKey,
  );
  const invocations = starts.map((start) => {
    const terminal = terminalOf(s, start.invocation_id),
      review = reviewOf(s, start.invocation_id),
      rs = why(() => {
        assertAt(s, at);
        assertCurrentStart(s, start, at, c);
      });
    const usable =
      !!terminal?.result &&
      terminal.outcome !== "invalidated" &&
      (!review || o(review.command).decision === "approve") &&
      rs.length === 0;
    return {
      invocation_id: start.invocation_id,
      started_entry_hash: start.hash,
      binding: o(start.command).binding,
      result: terminal?.result ?? null,
      result_hash: terminal?.result_hash ?? null,
      terminal_entry_hash: terminal?.hash ?? null,
      outcome: terminal?.outcome ?? "started",
      current_usable: usable,
      reasons: rs,
      review: review ?? null,
      can_accept: usable && !review && !pending && humanReasons.length === 0,
      can_intervene:
        !!terminal?.result && !review && !pending && humanReasons.length === 0,
      can_interrupt: !terminal && humanReasons.length === 0,
    };
  });
  const artifacts = [
    ...new Set(
      starts.map((start) => o(o(start.command).binding).artifact_hash),
    ),
  ]
    .map(
      (hash) =>
        s.pack.entries.find(
          (e) => e.operation === "publish" && e.artifact_hash === hash,
        )?.artifact,
    )
    .filter(Boolean)
    .map(o);
  const sources = [
    ...new Map(
      artifacts
        .flatMap((a) => l(a.sources))
        .map((source) => [String(source.id), source]),
    ).values(),
  ].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return checked(
    "read",
    withHash({
      schema_version:
        generation(c.profile) === 3 ||
        s.entries.some((e) => generation(e) === 3)
          ? "preparation-work-read.v3"
          : resourceAware || s.entries.some((e) => generation(e) >= 2)
            ? "preparation-work-read.v2"
            : "preparation-work-read.v1",
      ...(resourceAware || s.entries.some((e) => generation(e) >= 2)
        ? { resource_preflight: preflight }
        : {}),
      case_id: caseId,
      record_key: recordKey,
      evaluated_at: at,
      work_revision: last?.sequence ?? 0,
      work_head: last?.hash ?? null,
      candidate_binding: binding,
      selection_revision: s.pack.entries.at(-1)?.sequence ?? 0,
      selection_head: s.pack.entries.at(-1)?.hash ?? null,
      current: {
        can_start: reasons.length === 0,
        reasons,
        pending_invocation: pending?.invocation_id ?? null,
      },
      invocations,
      history: entries,
      sources,
      authority_granted: false,
      closure_permission: false,
    }),
  );
}
export function exportWorkState(s: WorkState): Obj {
  assertWorkState(s);
  return checked(
    "export",
    withHash({
      schema_version:
        s.entries.some((e) => generation(e) === 3) ||
        s.pack.entries.some(
          (e) => e.schema_version === "pack-selection-entry.v4",
        )
          ? "preparation-work-export.v3"
          : s.entries.some((e) => generation(e) === 2) ||
              s.pack.entries.some(
                (e) => e.schema_version === "pack-selection-entry.v3",
              )
            ? "preparation-work-export.v2"
            : "preparation-work-export.v1",
      pack: exportPackState(s.pack),
      entries: s.entries,
      authority_granted: false,
      closure_permission: false,
    }),
  );
}
export function validateWorkExport(v: unknown): WorkState {
  validateWork("export", v);
  ensure(
    v.hash === sha256Json(withoutHash(v)),
    "WORK_INTEGRITY",
    "Work archive hash changed",
  );
  const s = { pack: validatePackExport(v.pack), entries: l(v.entries) };
  assertWorkState(s);
  return s;
}
