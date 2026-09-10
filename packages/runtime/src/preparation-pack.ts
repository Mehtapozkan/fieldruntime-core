import templateV4 from "../../contracts/src/preparation-template.v4.json" with { type: "json" };
import templateV3 from "../../contracts/src/preparation-template.v3.json" with { type: "json" };
import templateV2 from "../../contracts/src/preparation-template.v2.json" with { type: "json" };
import {
  syntheticWorkerProfile,
  syntheticContinuationProfile,
  syntheticInvestigationProfile,
  workActor,
} from "./preparation-worker-profile.js";
// Accepted D-036: one synthetic preparation configuration, never worker or business authority.
import template from "../../contracts/src/preparation-template.v1.json" with { type: "json" };
import {
  assertValidPreparationPackContract,
  assertValidPreparationPackV2Contract,
  assertValidPreparationPackV3Contract,
  assertValidPreparationPackV4Contract,
  assertValidIdentityReference,
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  getCase,
  replayCaseJournal,
  type CaseEngineState,
} from "./case-engine.js";
import {
  assertDiscoveryState,
  readDiscovery,
  exportDiscoveryState,
  validateDiscoveryExport,
  withHash,
  DISCOVERY_VERSIONS,
  type DiscoveryState,
} from "./discovery.js";
import {
  INTAKE_ACTOR,
  INTAKE_SCOPES,
  INTAKE_TENANT,
  intakeObject as o,
  intakeList as l,
  intakeTime,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "./intake.js";
export const PREPARATION_PACK_ID = "pack_synthetic_invoice_dispute_north";
export const PACK_VERSIONS = immutableJson({
  projection: "preparation-pack.v1",
  selection: "pack-selection.v1",
});
export const PREPARATION_TEMPLATE = immutableJson(template);
export const PREPARATION_TEMPLATE_V2 = immutableJson(templateV2);
export const PACK_V2_VERSIONS = immutableJson({
  projection: "preparation-pack.v2",
  selection: "pack-selection.v2",
});
export const PREPARATION_TEMPLATE_V3 = immutableJson(templateV3);
export const PACK_V3_VERSIONS = immutableJson({
  projection: "preparation-pack.v3",
  selection: "pack-selection.v3",
});
export const PREPARATION_TEMPLATE_V4 = immutableJson(templateV4);
export const PACK_V4_VERSIONS = immutableJson({
  projection: "preparation-pack.v4",
  selection: "pack-selection.v4",
});
const packGeneration = (v: unknown): number =>
  String(v).endsWith(".v4")
    ? 4
    : String(v).endsWith(".v3")
      ? 3
      : String(v).endsWith(".v2")
        ? 2
        : 1;
const packVersions = (n: number): Obj =>
  n === 4
    ? PACK_V4_VERSIONS
    : n === 3
      ? PACK_V3_VERSIONS
      : n === 2
        ? PACK_V2_VERSIONS
        : PACK_VERSIONS;
export interface PackState {
  readonly discovery: DiscoveryState;
  readonly entries: readonly Obj[];
}
export interface PackTarget {
  readonly bundle_id: string;
  readonly record_key: string;
  readonly case_id: string | null;
}
export interface PackContext {
  readonly profile: Obj;
  readonly template_id: string;
  readonly worker_profile?: Obj;
}
const same = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);
const ss = (v: unknown): string[] => v as string[];
const sorted = (v: string[]): string[] => [...new Set(v)].sort();
const withoutHash = (v: Obj): Obj =>
  Object.fromEntries(Object.entries(v).filter(([k]) => k !== "hash"));
const checked = (
  kind: "profile" | "artifact" | "journal" | "read" | "result" | "export",
  value: Obj,
): Obj => {
  validatePack(kind, value);
  return immutableJson(value);
};
function validatePack(
  kind:
    | "profile"
    | "artifact"
    | "command"
    | "journal"
    | "read"
    | "result"
    | "export",
  value: unknown,
): asserts value is Obj {
  if (packGeneration(o(value).schema_version) === 4)
    assertValidPreparationPackV4Contract(kind, value);
  else if (packGeneration(o(value).schema_version) === 3)
    assertValidPreparationPackV3Contract(kind, value);
  else if (
    o(value).schema_version === `preparation-pack.v2` ||
    (String(o(value).schema_version).startsWith("pack-selection-") &&
      String(o(value).schema_version).endsWith(".v2"))
  )
    assertValidPreparationPackV2Contract(kind, value);
  else assertValidPreparationPackContract(kind, value);
}
export function syntheticWorkerPackContext(): PackContext {
  return {
    ...syntheticPackContext(),
    template_id: "invoice-dispute-preparation.v2",
    worker_profile: syntheticWorkerProfile(),
  };
}
export function syntheticInvestigationPackContext(): PackContext {
  return {
    ...syntheticPackContext(),
    template_id: "invoice-dispute-preparation.v4",
    worker_profile: syntheticInvestigationProfile(),
  };
}
export function syntheticContinuationPackContext(): PackContext {
  return {
    ...syntheticPackContext(),
    template_id: "invoice-dispute-preparation.v3",
    worker_profile: syntheticContinuationProfile(),
  };
}
export function syntheticPackContext(): PackContext {
  return {
    template_id: "invoice-dispute-preparation.v1",
    profile: checked("profile", {
      schema_version: "synthetic-pack-publication.v1",
      profile_id: "synthetic_pack_publication.v1",
      tenant_id: INTAKE_TENANT,
      identities: [
        INTAKE_ACTOR,
        {
          schema_version: "identity-reference.v0",
          identity_id: "identity_pack_reviewer_demo",
          tenant_id: INTAKE_TENANT,
          identity_kind: "human",
          status: "active",
        },
      ],
      reader_identity_id: "identity_intake_operator",
      reviewer_identity_id: "identity_pack_reviewer_demo",
      read_scope_ids: [...INTAKE_SCOPES],
      grant: {
        identity_id: "identity_pack_reviewer_demo",
        purpose: "publish_preparation_config_only",
        status: "active",
        scope_ids: ["scope_entity_north"],
        effective_from: "2026-01-01T00:00:00.000Z",
        effective_until: "2027-01-01T00:00:00.000Z",
      },
    }),
  };
}
function identity(profile: Obj, id: unknown): Obj {
  assertValidPreparationPackContract("profile", profile);
  const identities = l(profile.identities),
    byId = new Map<string, Obj>();
  for (const item of identities) {
    assertValidIdentityReference(item);
    const key = String(item.identity_id),
      old = byId.get(key);
    ensure(
      !old || same(old, item),
      "PACK_REVIEWER_REQUIRED",
      "Contradictory canonical identity copies cannot establish publication eligibility",
    );
    byId.set(key, item);
  }
  const actor = byId.get(String(id));
  ensure(
    actor &&
      actor.tenant_id === INTAKE_TENANT &&
      actor.identity_kind === "human" &&
      actor.status === "active",
    "PACK_REVIEWER_REQUIRED",
    "The current canonical synthetic identity is not eligible",
  );
  return actor;
}
function reader(profile: Obj): void {
  identity(profile, profile.reader_identity_id);
  ensure(
    same(sorted(ss(profile.read_scope_ids)), [...INTAKE_SCOPES].sort()),
    "SCOPE_CONFLICT",
    "The complete synthetic artifact requires North and South read scopes",
  );
}
function reviewer(profile: Obj, at: string, seat = "publication"): Obj {
  reader(profile);
  const actor = identity(
      profile,
      seat === "publication"
        ? profile.reviewer_identity_id
        : "identity_intake_operator",
    ),
    grant = o(profile.grant);
  ensure(
    seat === "publication" &&
      actor.identity_id === "identity_pack_reviewer_demo" &&
      grant.identity_id === actor.identity_id &&
      grant.status === "active" &&
      grant.purpose === "publish_preparation_config_only" &&
      same(grant.scope_ids, ["scope_entity_north"]),
    "PACK_REVIEWER_REQUIRED",
    "Only the separately scoped synthetic publication reviewer may change selection",
  );
  ensure(
    intakeTime(grant.effective_from, "UTC").instant === grant.effective_from &&
      intakeTime(grant.effective_until, "UTC").instant ===
        grant.effective_until &&
      String(grant.effective_from) <= at &&
      at < String(grant.effective_until),
    "PACK_REVIEWER_REQUIRED",
    "Publication reviewer grant is not currently effective",
  );
  return actor;
}
export function normalizePackCommand(input: unknown): Obj {
  validatePack("command", input);
  ensure(
    String(input.reason).trim() &&
      String(input.idempotency_key).trim() &&
      Buffer.byteLength(canonicalJson(input)) <= 131072,
    "INVALID_INPUT",
    "Give a bounded publication reason and key",
  );
  if (input.operation !== "withdraw")
    ensure(
      intakeTime(input.effective_until, input.effective_until_source_timezone)
        .instant === input.effective_until,
      "INVALID_TIME",
      "Use canonical millisecond UTC while preserving its source timezone",
    );
  return immutableJson(input);
}
// Add relevant coverage citations directly from canonical retained rows, including rows
// outside the brief's related-record display. Do not alter the retained D10 interpreter.
function coverageSources(
  state: DiscoveryState,
  bundle: Obj,
): { coverage: Obj; sources: Obj[] } {
  const queue = l(bundle.artifacts).find((a) => a.role === "queue");
  ensure(queue, "PACK_INTEGRITY", "Canonical queue is missing");
  const bytes = state.intake.artifacts.get(String(queue.byte_hash));
  ensure(bytes, "PACK_INTEGRITY", "Original coverage bytes are missing");
  const sources = new Map<string, Obj>();
  const members = l(bundle.records)
    .map((record) => {
      const citations = l(record.locators).map((locator) => {
        const excerpt = Array.from(
          bytes
            .subarray(Number(locator.byte_start), Number(locator.byte_end))
            .toString("utf8"),
        )
          .slice(0, 1024)
          .join("");
        const content = {
          bundle_id: bundle.id,
          artifact_hash: queue.byte_hash,
          name: queue.name,
          interpretation: queue.interpretation,
          locator: {
            ...locator,
            byte_end: Number(locator.byte_start) + Buffer.byteLength(excerpt),
            line_end:
              locator.line_start === null
                ? null
                : Number(locator.line_start) + excerpt.split("\n").length - 1,
          },
          excerpt,
          scope_ids: queue.scope_ids,
          record_key: record.record_key ?? null,
          reported_source_version: record.reported_source_version ?? null,
          source_time: o(record.source_occurrence).instant,
          retained_at: bundle.retained_at,
        };
        const id = sha256Json(content);
        sources.set(id, { id, ...content });
        return id;
      });
      return {
        record_hash: sha256Json(record),
        record_key: record.record_key ?? null,
        citation_ids: sorted(citations),
      };
    })
    .sort((a, b) => a.record_hash.localeCompare(b.record_hash));
  return {
    coverage: {
      bundle_id: bundle.id,
      bundle_hash: bundle.hash,
      coverage: bundle.coverage,
      members,
    },
    sources: [...sources.values()],
  };
}
export function projectPreparationPack(
  state: DiscoveryState,
  target: PackTarget,
  context: PackContext = syntheticPackContext(),
): Obj {
  reader(context.profile);
  const selectedTemplate =
    context.template_id === PREPARATION_TEMPLATE_V4.template_id
      ? PREPARATION_TEMPLATE_V4
      : context.template_id === PREPARATION_TEMPLATE_V3.template_id
        ? PREPARATION_TEMPLATE_V3
        : context.template_id === PREPARATION_TEMPLATE_V2.template_id
          ? PREPARATION_TEMPLATE_V2
          : PREPARATION_TEMPLATE;
  const generation = packGeneration(selectedTemplate.template_id),
    v2 = generation >= 2;
  ensure(
    !v2 || context.worker_profile,
    "PACK_COMPATIBILITY_REQUIRED",
    "Worker-capable preparation requires its exact server profile",
  );
  ensure(
    context.template_id === selectedTemplate.template_id,
    "PACK_COMPATIBILITY_REQUIRED",
    "Current preparation template is unavailable; retained history is not reinterpreted",
  );
  const view = readDiscovery(
      state,
      target.bundle_id,
      target.record_key,
      target.case_id,
    ),
    material = o(view.material),
    manifest = o(material.manifest),
    assignment = o(material.assignment);
  ensure(
    same(manifest.versions, DISCOVERY_VERSIONS) &&
      o(manifest.versions).projection === "discovery.invoice-dispute.v2",
    "PACK_COMPATIBILITY_REQUIRED",
    "New preparation requires the supported scoped Discovery v2 interpretation",
  );
  ensure(
    assignment.entity === "entity_north",
    "SCOPE_CONFLICT",
    "Publication is limited to a selected synthetic North record; South remains readable context",
  );
  const bundle = state.intake.bundles.find((b) => b.id === target.bundle_id);
  ensure(bundle, "PACK_INTEGRITY", "Retained bundle is missing");
  const coverage = coverageSources(state, bundle),
    rowRefs = sorted(
      l(coverage.coverage.members).flatMap((m) => ss(m.citation_ids)),
    );
  const sourceMap = new Map(
    [...l(material.sources), ...coverage.sources].map((s) => [String(s.id), s]),
  );
  const claims = l(material.source_claims).filter(
    (c) =>
      c.applicable_record_key === target.record_key &&
      o(c.subject).entity === assignment.entity &&
      o(c.subject).kind === "delivery",
  );
  const record = l(bundle.records).find(
    (r) => r.record_key === target.record_key,
  );
  ensure(record, "PACK_INTEGRITY", "Selected record missing");
  const deliveryIds = sorted(
    l(record.business_objects)
      .filter((b) => b.kind === "delivery")
      .map((b) => String(b.id)),
  );
  const interventions = deliveryIds.map((id) => {
    const applicable = claims.filter((c) => o(c.subject).id === id),
      meanings = new Set(applicable.map((c) => c.meaning));
    const stateText =
      meanings.has("source_reports_confirmation") &&
      meanings.has("source_reports_missing")
        ? "conflicting source reports of supplied and not supplied confirmation"
        : meanings.has("source_reports_missing")
          ? "source reports confirmation is not supplied"
          : meanings.has("source_reports_confirmation")
            ? "source reports supplied confirmation"
            : applicable.length
              ? "ambiguous or retained-only support; confirmation is unestablished"
              : "no explicitly associated delivery support retained";
    return `${id}: ${stateText}`;
  });
  const noteRefs = sorted(claims.flatMap((c) => ss(c.citation_ids)));
  const ownRows = sorted(
    l(coverage.coverage.members)
      .filter((m) => m.record_key === target.record_key)
      .flatMap((m) => ss(m.citation_ids)),
  );
  const loop = (
    id: string,
    text: string,
    refs: string[] = [],
    observed = false,
  ): Obj => ({
    id,
    text,
    citation_ids: refs,
    claim_state: observed ? "supported" : "unknown",
    process_view: observed ? "observed" : "proposed",
  });
  const loops = [
    loop(
      "Trigger",
      "Proposed: receive an entity-qualified dispute for scoped preparation. The actual business trigger and eligibility rule remain unknown.",
    ),
    loop("Objective", selectedTemplate.objective),
    loop(
      "Population",
      `${String(o(bundle.coverage).distinct_records)} distinct records in this retained upload (${String(o(bundle.coverage).invalid_records)} invalid). Recurring population and coverage remain unconfirmed.`,
      rowRefs,
      true,
    ),
    loop(
      "Close Event",
      "Proposed: evidence an agreed disposition in its governing source. Source, owner and settlement-versus-cash criterion remain unknown; Case closure stays denied.",
    ),
    loop(
      "Human Intervention Map",
      `${interventions.join("; ") || "No delivery reference is supplied"}. These are retained reports and coverage limits, not independent verification. Evidence owners and governing terms remain unconfirmed.`,
      sorted([
        ...noteRefs,
        ...(deliveryIds.some(
          (id) => !claims.some((c) => o(c.subject).id === id),
        ) || !deliveryIds.length
          ? ownRows
          : []),
      ]),
      true,
    ),
    loop(
      "Correction Path",
      "Reuse applicable descriptive review. New information requires explicit correction and fresh descriptive review, a new artifact/version and separate publication before using that changed basis.",
    ),
  ];
  const confirmation = l(view.history).findLast(
    (e) =>
      e.operation === "confirm" &&
      e.material_hash === view.material_hash &&
      o(e.command).purpose === "discovery_description",
  );
  const content = {
    schema_version: `preparation-pack.v${String(generation)}`,
    pack_id: PREPARATION_PACK_ID,
    template: selectedTemplate,
    binding: {
      discovery: view.binding,
      manifest,
      confirmation_entry_hash: confirmation?.hash ?? null,
      publication_profile_hash: sha256Json(context.profile),
      ...(v2
        ? { worker_profile_hash: sha256Json(context.worker_profile) }
        : {}),
    },
    material,
    coverage: coverage.coverage,
    sources: [...sourceMap.values()].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    ),
    findings: l(material.findings).map((f) =>
      f.id === "R2"
        ? { ...f, citation_ids: rowRefs }
        : f.id === "R7"
          ? { ...f, citation_ids: [] }
          : f,
    ),
    loop_outputs: loops,
    authority_granted: false,
    closure_permission: false,
  };
  return checked("artifact", {
    ...content,
    version: `pack-v${String(generation)}-${sha256Json(content).slice(7)}`,
  });
}
function orderedDiscovery(entries: readonly Obj[]): Obj[] {
  return [...entries].sort(
    (a, b) =>
      String(a.case_id).localeCompare(b.case_id as string) ||
      Number(a.sequence) - Number(b.sequence),
  );
}
export function packSupportManifest(state: DiscoveryState): Obj {
  const caseIds = new Set(state.intake.commits.map((c) => String(c.case_id)));
  return {
    bundle_hashes: state.intake.bundles.map((b) => b.hash),
    commit_hashes: state.intake.commits.map((c) => c.hash),
    request_binding_hashes: (state.intake.requestBindings ?? []).map(
      (b) => b.hash,
    ),
    discovery_hashes: orderedDiscovery(state.entries).map((e) => e.hash),
    cases: state.intake.cases.cases
      .filter((c) => c.tenant_id === INTAKE_TENANT && caseIds.has(c.case_id))
      .map((c) => ({
        case_id: c.case_id,
        version: c.journal.length,
        head: c.journal.at(-1)?.event_hash,
      }))
      .sort((a, b) => a.case_id.localeCompare(b.case_id)),
  };
}
export function historicalPackSupport(
  state: DiscoveryState,
  m: Obj,
  at: string,
): DiscoveryState {
  const subset = (
    values: readonly Obj[],
    hashes: unknown,
    time: string,
  ): Obj[] => {
    const keys = ss(hashes),
      byHash = new Map(values.map((v) => [String(v.hash), v]));
    const kept = keys.map((key) => {
      const v = byHash.get(key);
      ensure(v, "PACK_INTEGRITY", "Historical input is missing");
      return v;
    });
    ensure(
      new Set(keys).size === keys.length &&
        kept.every((v) => String(v[time]) <= at) &&
        values.every(
          (v) => String(v[time]) >= at || keys.includes(String(v.hash)),
        ),
      "PACK_INTEGRITY",
      "Publication omitted earlier inputs or cited future material",
    );
    ensure(
      same(
        values.filter((v) => keys.includes(String(v.hash))),
        kept,
      ),
      "PACK_INTEGRITY",
      "Historical input order changed",
    );
    return kept;
  };
  const bundles = subset(state.intake.bundles, m.bundle_hashes, "retained_at"),
    commits = subset(state.intake.commits, m.commit_hashes, "recorded_at"),
    requestBindings = subset(
      state.intake.requestBindings ?? [],
      m.request_binding_hashes,
      "recorded_at",
    ),
    entries = subset(
      orderedDiscovery(state.entries),
      m.discovery_hashes,
      "recorded_at",
    );
  ensure(
    commits.every((c, i) => c === state.intake.commits[i]),
    "PACK_INTEGRITY",
    "Historical commits are not a prefix",
  );
  const referenced = sorted(commits.map((c) => String(c.case_id))),
    anchors = l(m.cases);
  ensure(
    same(
      anchors.map((a) => String(a.case_id)),
      referenced,
    ),
    "PACK_INTEGRITY",
    "Historical Case coverage changed",
  );
  const cases = anchors.map((a) => {
    const aggregate = getCase(
        state.intake.cases,
        INTAKE_TENANT,
        String(a.case_id),
      ),
      count = Number(a.version);
    ensure(
      aggregate &&
        count > 0 &&
        aggregate.journal[count - 1]?.event_hash === a.head &&
        aggregate.journal.slice(count).every((e) => e.recorded_at >= at),
      "PACK_INTEGRITY",
      "Publication claimed an obsolete or altered Case anchor",
    );
    const prefix = aggregate.journal.slice(0, count);
    ensure(
      prefix.every((e) => e.recorded_at <= at),
      "PACK_INTEGRITY",
      "Publication predates its bound Case",
    );
    return replayCaseJournal(prefix);
  });
  for (const entry of entries)
    ensure(
      entries
        .filter((e) => e.case_id === entry.case_id)
        .some((e) => Number(e.sequence) === Number(entry.sequence) - 1) ||
        entry.sequence === 1,
      "PACK_INTEGRITY",
      "Discovery support is not a complete prefix",
    );
  const journalIds = new Set(cases.flatMap((c) => c.journal.map((e) => e.id))),
    events = cases.flatMap((c) => l(c.document.events));
  const caseState: CaseEngineState = {
    cases,
    idempotency_records: state.intake.cases.idempotency_records.filter((r) =>
      journalIds.has(r.journal_entry_id),
    ),
    source_event_records: state.intake.cases.source_event_records.filter((r) =>
      events.some(
        (e) =>
          e.tenant_id === r.tenant_id &&
          e.source === r.source &&
          e.source_event_id === r.source_event_id,
      ),
    ),
  };
  const byteHashes = new Set(
    bundles.flatMap((b) => l(b.artifacts).map((a) => String(a.byte_hash))),
  );
  const times = [
    ...bundles.map((b) => String(b.retained_at)),
    ...commits.map((c) => String(c.recorded_at)),
    ...requestBindings.map((b) => String(b.recorded_at)),
    ...cases.flatMap((c) => c.journal.map((e) => e.recorded_at)),
  ];
  const result = {
    intake: {
      ...state.intake,
      bundles,
      commits,
      requestBindings,
      artifacts: new Map(
        [...state.intake.artifacts].filter(([h]) => byteHashes.has(h)),
      ),
      cases: caseState,
      clockFloor: times.sort().at(-1) ?? "",
    },
    entries,
  };
  assertDiscoveryState(result);
  return result;
}
const floor = (state: PackState): string =>
  [
    state.discovery.intake.clockFloor,
    ...state.discovery.entries.map((e) => String(e.recorded_at)),
    ...state.entries.map((e) => String(e.recorded_at)),
  ]
    .sort()
    .at(-1) ?? "";
const targetOf = (artifact: Obj): PackTarget => {
  const b = o(o(artifact.binding).discovery);
  return {
    bundle_id: String(b.bundle_id),
    record_key: String(b.record_key),
    case_id: b.case_id === null ? null : (b.case_id as string),
  };
};
function retained(state: PackState, hash: unknown): Obj {
  const artifact = state.entries.find(
    (e) => e.operation === "publish" && e.artifact_hash === hash,
  )?.artifact;
  ensure(artifact, "PACK_CONFLICT", "Retained artifact is unavailable");
  return o(artifact);
}
function currentBasis(
  state: PackState,
  artifact: Obj,
  context: PackContext,
): void {
  const fresh = projectPreparationPack(
    state.discovery,
    targetOf(artifact),
    context,
  );
  ensure(
    same(fresh, artifact),
    "PACK_BASIS_CONFLICT",
    "Case, descriptive revision, business inputs, profile or template changed. Inspect a fresh artifact and obtain separate publication approval.",
  );
  const b = o(artifact.binding),
    d = o(b.discovery);
  ensure(
    d.case_id !== null &&
      Number(d.expected_case_version) > 0 &&
      b.confirmation_entry_hash !== null,
    "PACK_REVIEW_REQUIRED",
    "Commit this record and complete its current descriptive review before publication",
  );
}
export function appendPackSelection(
  state: PackState,
  input: unknown,
  at: string,
  context: PackContext = syntheticPackContext(),
  seat = "publication",
): Obj {
  const command = normalizePackCommand(input),
    last = state.entries.at(-1);
  ensure(
    command.expected_selection_revision === (last?.sequence ?? 0) &&
      command.expected_selection_head === (last?.hash ?? null),
    "PACK_HEAD_CONFLICT",
    "Selection changed. Refresh and explicitly review the new head.",
  );
  ensure(
    command.expected_publication_profile_hash === sha256Json(context.profile),
    "PACK_PROFILE_CONFLICT",
    "Publication profile changed; inspect current eligibility",
  );
  ensure(
    new Date(at).toISOString() === at && at >= floor(state),
    "CLOCK_REGRESSION",
    "Publication recording clock regressed",
  );
  const actor = reviewer(context.profile, at, seat);
  let artifact: Obj;
  if (command.operation === "publish") {
    const d = o(o(command.expected_basis).discovery);
    artifact = projectPreparationPack(
      state.discovery,
      {
        bundle_id: String(d.bundle_id),
        record_key: String(d.record_key),
        case_id: d.case_id === null ? null : (d.case_id as string),
      },
      context,
    );
  } else artifact = retained(state, command.artifact_hash);
  ensure(
    sha256Json(artifact) === command.artifact_hash,
    "PACK_BINDING_CONFLICT",
    "Submitted artifact hash does not match canonical preparation",
  );
  if (command.operation === "withdraw") {
    ensure(
      last && o(last.result).selected_artifact_hash === command.artifact_hash,
      "PACK_HEAD_CONFLICT",
      "Withdraw only the exact currently selected artifact",
    );
    // Deliberately do not call currentBasis or require unexpired pack effectivity.
  } else {
    currentBasis(state, artifact, context);
    if (packGeneration(artifact.schema_version) >= 2)
      workActor(o(context.worker_profile), "prepare_disposition_packet", at);
    ensure(
      same(command.expected_basis, artifact.binding),
      "PACK_BINDING_CONFLICT",
      "Exact reviewed basis differs",
    );
    ensure(
      at < String(command.effective_until) &&
        String(command.effective_until) <=
          String(o(context.profile.grant).effective_until),
      "PACK_EXPIRY_CONFLICT",
      "Selection expiry must be later than now and within the current reviewer grant",
    );
    if (command.operation === "publish")
      ensure(
        o(last?.result ?? {}).selected_artifact_hash !== command.artifact_hash,
        "NO_CHANGE",
        "This identical artifact is already selected; no command was recorded",
      );
  }
  for (const e of state.entries)
    if (e.operation === "publish" && o(e.artifact).version === artifact.version)
      ensure(
        e.artifact_hash === command.artifact_hash,
        "PACK_INTEGRITY",
        "One artifact version cannot identify different content",
      );
  const fingerprint = sha256Json(command),
    sequence = state.entries.length + 1;
  return checked(
    "journal",
    withHash({
      schema_version: `pack-selection-entry.v${String(packGeneration(command.schema_version))}`,
      tenant_id: INTAKE_TENANT,
      pack_id: PREPARATION_PACK_ID,
      case_id: targetOf(artifact).case_id,
      id: `pack_selection_${fingerprint.slice(7)}`,
      sequence,
      previous_entry_hash: last?.hash ?? null,
      operation: command.operation,
      idempotency_key: command.idempotency_key,
      command_fingerprint: fingerprint,
      recorded_at: at,
      command,
      artifact_hash: command.artifact_hash,
      artifact: command.operation === "publish" ? artifact : null,
      input_manifest: packSupportManifest(state.discovery),
      profile: context.profile,
      ...(packGeneration(command.schema_version) >= 2
        ? { worker_profile: context.worker_profile ?? syntheticWorkerProfile() }
        : {}),
      actor,
      result: {
        operation: command.operation,
        selection_revision: sequence,
        selected_artifact_hash:
          command.operation === "withdraw" ? null : command.artifact_hash,
        authority_granted: false,
        closure_permission: false,
      },
      versions: packVersions(packGeneration(command.schema_version)),
    }),
  );
}
export function packResult(entry: Obj): Obj {
  return checked("result", {
    schema_version: `pack-selection-result.v${String(packGeneration(entry.schema_version))}`,
    status: "recorded",
    entry,
    historical_receipt: true,
    authority_granted: false,
    closure_permission: false,
  });
}
export function assertPackState(state: PackState): void {
  assertDiscoveryState(state.discovery);
  const previous: Obj[] = [],
    keys = new Set<string>();
  for (const entry of state.entries) {
    validatePack("journal", entry);
    const key = canonicalJson([
      entry.tenant_id,
      entry.pack_id,
      entry.operation,
      entry.idempotency_key,
    ]);
    ensure(
      !keys.has(key) &&
        entry.hash === sha256Json(withoutHash(entry)) &&
        same(
          entry.versions,
          packVersions(packGeneration(entry.schema_version)),
        ),
      "PACK_INTEGRITY",
      "Selection identity, versions or hash changed",
    );
    keys.add(key);
    const discovery = historicalPackSupport(
      state.discovery,
      o(entry.input_manifest),
      String(entry.recorded_at),
    );
    const rebuilt = appendPackSelection(
      { discovery, entries: previous },
      entry.command,
      String(entry.recorded_at),
      {
        profile: o(entry.profile),
        template_id: `invoice-dispute-preparation.v${String(packGeneration(entry.schema_version))}`,
        ...(packGeneration(entry.schema_version) >= 2
          ? { worker_profile: o(entry.worker_profile) }
          : {}),
      },
    );
    ensure(
      same(entry, rebuilt),
      "PACK_INTEGRITY",
      "Publication material, eligibility, result or selection cannot be reconstructed",
    );
    previous.push(entry);
  }
}
function reasons(fn: () => void): string[] {
  try {
    fn();
    return [];
  } catch (e) {
    return [e instanceof Error ? e.message : "Preparation unavailable"];
  }
}
export function readPack(
  state: PackState,
  target: PackTarget,
  at: string,
  context: PackContext = syntheticPackContext(),
): Obj {
  reader(context.profile);
  const last = state.entries.at(-1),
    selectedHash = o(last?.result ?? {}).selected_artifact_hash ?? null;
  const selected = selectedHash === null ? null : retained(state, selectedHash);
  let candidate: Obj | null;
  let candidateReasons: string[];
  try {
    candidate = projectPreparationPack(state.discovery, target, context);
    candidateReasons = [];
  } catch (error) {
    candidate = null;
    candidateReasons = [
      error instanceof Error ? error.message : "Preparation unavailable",
    ];
  }
  const eligibleReviewer = reasons(() => {
    ensure(
      at >= floor(state),
      "CLOCK_REGRESSION",
      "Current clock predates retained evidence",
    );
    reviewer(context.profile, at);
  });
  const publishReasons = [...candidateReasons, ...eligibleReviewer];
  if (candidate)
    publishReasons.push(
      ...reasons(() => {
        currentBasis(state, candidate, context);
        if (packGeneration(candidate.schema_version) >= 2)
          workActor(
            o(context.worker_profile),
            "prepare_disposition_packet",
            at,
          );
      }),
    );
  const currentReasons = selected
    ? [
        ...eligibleReviewer,
        ...reasons(() => {
          currentBasis(state, selected, context);
          if (packGeneration(selected.schema_version) >= 2)
            workActor(
              o(context.worker_profile),
              "prepare_disposition_packet",
              at,
            );
        }),
      ]
    : [];
  if (selected && last) {
    if (String(o(last.command).effective_until) <= at)
      currentReasons.push(
        "Selected pack effectivity expired. Publication history remains inspectable.",
      );
    if (!same(last.profile, context.profile))
      currentReasons.push(
        "Publication profile changed; historical approval is not current permission.",
      );
    if (!same(targetOf(selected), target))
      currentReasons.push(
        "The selected pack belongs to a different record or Case; do not apply it to this view.",
      );
  }
  const canPublish =
    !!candidate &&
    publishReasons.length === 0 &&
    sha256Json(candidate) !== selectedHash;
  const status = selected
    ? currentReasons.length
      ? "stale"
      : "published_for_preparation"
    : last?.operation === "withdraw"
      ? "withdrawn"
      : candidate
        ? "proposed"
        : "unavailable";
  const rollbacks = [
    ...new Map(
      state.entries
        .filter((e) => e.operation === "publish")
        .map((e) => [String(e.artifact_hash), o(e.artifact)]),
    ).entries(),
  ].map(([hash, artifact]) => {
    const why = [
      ...eligibleReviewer,
      ...reasons(() => {
        currentBasis(state, artifact, context);
        if (packGeneration(artifact.schema_version) >= 2)
          workActor(
            o(context.worker_profile),
            "prepare_disposition_packet",
            at,
          );
      }),
    ];
    return {
      artifact_hash: hash,
      version: artifact.version,
      eligible: why.length === 0,
      reasons: why,
    };
  });
  const comparison = candidate
    ? Object.keys(candidate)
        .filter((k) => !selected || !same(candidate[k], selected[k]))
        .map((field) => ({
          field,
          before_hash: selected ? sha256Json(selected[field]) : null,
          after_hash: sha256Json(candidate[field]),
        }))
    : [];
  return checked(
    "read",
    withHash({
      schema_version: `pack-selection-read.v${String(Math.max(packGeneration(context.template_id), ...state.entries.map((e) => packGeneration(e.schema_version))))}`,
      pack_id: PREPARATION_PACK_ID,
      evaluated_at: at,
      target: { ...target },
      candidate,
      candidate_hash: candidate ? sha256Json(candidate) : null,
      selection_revision: last?.sequence ?? 0,
      selection_head: last?.hash ?? null,
      selected_artifact: selected,
      selected_artifact_hash: selectedHash,
      current: {
        status,
        eligible: !!selected && currentReasons.length === 0,
        can_publish: canPublish,
        can_withdraw: !!selected && eligibleReviewer.length === 0,
        reasons: sorted([...publishReasons, ...currentReasons]),
        withdrawal_reasons: eligibleReviewer,
      },
      publication_profile_hash: sha256Json(context.profile),
      publication_reviewer:
        l(context.profile.identities).find(
          (i) => i.identity_id === context.profile.reviewer_identity_id,
        ) ?? null,
      comparison,
      rollback_candidates: rollbacks,
      history: [...state.entries],
      authority_granted: false,
      closure_permission: false,
    }),
  );
}
export function exportPackState(state: PackState): Obj {
  assertPackState(state);
  return checked(
    "export",
    withHash({
      schema_version: `pack-selection-export.v${String(Math.max(1, ...state.entries.map((e) => packGeneration(e.schema_version))))}`,
      discovery: exportDiscoveryState(state.discovery),
      entries: [...state.entries],
      versions: packVersions(
        Math.max(
          1,
          ...state.entries.map((e) => packGeneration(e.schema_version)),
        ),
      ),
      authority_granted: false,
      closure_permission: false,
    }),
  );
}
export function validatePackExport(input: unknown): PackState {
  validatePack("export", input);
  ensure(
    input.hash === sha256Json(withoutHash(input)),
    "PACK_INTEGRITY",
    "Pack export hash changed",
  );
  const state = {
    discovery: validateDiscoveryExport(input.discovery),
    entries: l(input.entries),
  };
  assertPackState(state);
  return state;
}
