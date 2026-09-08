// Accepted D-035: deterministic descriptions only. No authority evaluator consumes this history.
import {
  assertValidDiscoveryContract,
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import { getCase, replayCaseJournal } from "./case-engine.js";
import {
  assertIntakeState,
  exportIntakeState,
  validateIntakeExport,
  type IntakeState,
} from "./intake-integrity.js";
import {
  INTAKE_ACTOR,
  INTAKE_SCOPES,
  INTAKE_TENANT,
  intakeObject as object,
  intakeList as list,
  requireIntake as require,
  type IntakeObject as Obj,
} from "./intake.js";
// Preserve v1 interpretation for immutable reviews; only new preparation uses v2.
const LEGACY_DISCOVERY_VERSIONS = {
  projection: "discovery.invoice-dispute.v1",
  template: "discovery.questions.v1",
  interpretation: "discovery.source-claims.v1",
};
export const DISCOVERY_VERSIONS = {
  projection: "discovery.invoice-dispute.v2",
  template: "discovery.questions.v2",
  interpretation: "discovery.source-claims.v2",
};
type Versions = typeof DISCOVERY_VERSIONS;
export interface DiscoveryState {
  readonly intake: IntakeState;
  readonly entries: readonly Obj[];
}
const same = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);
const strings = (v: unknown): string[] => v as string[];
const sorted = (values: string[]): string[] => [...new Set(values)].sort();
const hashOf = (v: Obj): string =>
  sha256Json(
    Object.fromEntries(Object.entries(v).filter(([k]) => k !== "hash")),
  );
function checked(
  kind: "material" | "journal" | "read" | "result" | "export",
  v: Obj,
): Obj {
  assertValidDiscoveryContract(kind, v);
  return immutableJson(v);
}
export function normalizeDiscoveryCommand(v: unknown): Obj {
  assertValidDiscoveryContract("command", v);
  require(Buffer.byteLength(canonicalJson(v), "utf8") <=
    131072, "INVALID_INPUT", "Discovery command exceeds 128 KiB");
  require(String(v.reason).trim().length >
    0, "INVALID_INPUT", "Give a descriptive review reason");
  if (v.operation === "annotate") {
    const changes = list(v.changes);
    require(new Set(changes.map((c) => c.target_id)).size === changes.length &&
      changes.every(
        (c) => String(c.text).trim() && String(c.reason).trim(),
      ), "INVALID_INPUT", "Changes need unique targets, text and reasons");
  }
  return immutableJson(v);
}
function selected(
  state: IntakeState,
  bundleId: string,
  key: string,
): { bundle: Obj; record: Obj } {
  const bundle = state.bundles.find((b) => b.id === bundleId);
  require(bundle, "NOT_FOUND", "Retained bundle not found");
  const record = list(bundle.records).find(
    (r) => r.record_key === key && r.valid === true,
  );
  require(record, "NOT_FOUND", "Choose an interpreted, valid retained record");
  require(same(bundle.scope_ids, INTAKE_SCOPES) &&
    bundle.tenant_id ===
      INTAKE_TENANT, "SCOPE_CONFLICT", "Discovery is limited to the trusted synthetic intake scope");
  return { bundle, record };
}
function manifest(
  state: IntakeState,
  bundle: Obj,
  record: Obj,
  caseId: string | null,
  versions: Versions,
): Obj {
  const aggregate =
    caseId === null ? undefined : getCase(state.cases, INTAKE_TENANT, caseId);
  const receipt = state.commits.find(
    (c) =>
      c.case_id === caseId &&
      c.record_key === record.record_key &&
      object(c.selection).bundle_id === bundle.id,
  );
  if (caseId !== null) {
    require(aggregate &&
      receipt, "CASE_BINDING_REQUIRED", "Explicitly commit this retained record to the selected Case before descriptive review");
    const c = object(aggregate.document.case);
    require(c.customer_ref === object(record.cells).customer_ref &&
      same(c.scope_ids, [
        `scope_${String(record.entity)}`,
      ]), "SCOPE_CONFLICT", "Case and retained record scope differ");
  }
  return {
    tenant_id: INTAKE_TENANT,
    scope_ids: [...INTAKE_SCOPES],
    bundle_id: bundle.id,
    bundle_hash: bundle.hash,
    record_key: record.record_key,
    source_revision: record.source_revision,
    case_id: caseId,
    case_version: aggregate?.journal.length ?? 0,
    case_journal_hash: aggregate?.journal.at(-1)?.event_hash ?? null,
    intake_receipt_hash: receipt?.hash ?? null,
    business_bundle_hashes: sorted(state.bundles.map((b) => String(b.hash))),
    business_commit_hashes: sorted(state.commits.map((c) => String(c.hash))),
    intake_versions: bundle.versions,
    versions,
  };
}
function sourceMaterial(
  state: IntakeState,
  selectedBundle: Obj,
  record: Obj,
  legacy: boolean,
): { sources: Obj[]; claims: Obj[]; related: Obj[] } {
  const sources = new Map<string, Obj>(),
    claims: Obj[] = [],
    related: Obj[] = [],
    cells = object(record.cells);
  const associated = (a: Obj, r: Obj): Obj[] =>
    list(a.associations).filter(
      (assoc) =>
        assoc.entity === r.entity &&
        ((assoc.kind === "record" && assoc.id === r.source_record_id) ||
          list(r.business_objects).some(
            (o) => o.kind === assoc.kind && o.id === assoc.id,
          )),
    );
  const relatedRecord = (r: Obj): boolean =>
    r.valid === true &&
    (r.record_key === record.record_key ||
      (object(r.cells).customer_ref === cells.customer_ref &&
        object(r.cells).invoice_id === cells.invoice_id) ||
      (!legacy &&
        r.entity === record.entity &&
        list(r.business_objects).some(
          (o) =>
            o.kind === "delivery" &&
            list(record.business_objects).some(
              (selected) => selected.kind === o.kind && selected.id === o.id,
            ),
        )));
  const targets = state.bundles.flatMap((b) =>
    list(b.records).filter(relatedRecord),
  );
  const scope = (
    r: Obj,
    kind: string,
    id: unknown,
    associations: Obj[] = [],
  ): Obj =>
    legacy
      ? {}
      : {
          subject: { entity: r.entity, kind, id },
          applicable_record_key: r.record_key,
          source_associations: [...associations].sort((a, b) =>
            canonicalJson(a).localeCompare(canonicalJson(b)),
          ),
        };
  const cite = (b: Obj, a: Obj, r: Obj | null, rawLocator: Obj): string => {
    const bytes = state.artifacts.get(String(a.byte_hash));
    require(bytes, "DISCOVERY_INTEGRITY", "Cited original bytes are missing");
    const text =
      a.interpretation === "retained_only"
        ? null
        : Array.from(
            bytes
              .subarray(
                Number(rawLocator.byte_start),
                Number(rawLocator.byte_end),
              )
              .toString("utf8"),
          )
            .slice(0, 1024)
            .join("");
    const locator =
      text === null
        ? rawLocator
        : {
            ...rawLocator,
            byte_end: Number(rawLocator.byte_start) + Buffer.byteLength(text),
            line_end:
              rawLocator.line_start === null
                ? null
                : Number(rawLocator.line_start) + text.split("\n").length - 1,
          };
    const content = {
      bundle_id: b.id,
      artifact_hash: a.byte_hash,
      name: a.name,
      interpretation: a.interpretation,
      locator,
      excerpt: text,
      scope_ids: a.scope_ids,
      record_key: r?.record_key ?? null,
      reported_source_version: r?.reported_source_version ?? null,
      source_time: r ? object(r.source_occurrence).instant : null,
      retained_at: b.retained_at,
    };
    const id = sha256Json(content);
    sources.set(id, { id, ...content });
    return id;
  };
  for (const b of [...state.bundles].sort((a, b) =>
    String(a.hash).localeCompare(String(b.hash)),
  )) {
    const rs = list(b.records).filter(relatedRecord);
    for (const r of rs) {
      related.push(r);
      const queue = list(b.artifacts).find((a) => a.role === "queue");
      require(queue, "DISCOVERY_INTEGRITY", "Queue artifact missing");
      const refs = list(r.locators).map((loc) => cite(b, queue, r, loc));
      for (const field of [
        "customer_ref",
        "invoice_id",
        "amount_minor",
        "currency",
        "source_status",
        "upstream_owner",
        "delivery_ids",
        "order_ids",
      ])
        claims.push({
          ...scope(r, "record", r.source_record_id),
          field: `${String(r.entity)}.${field}`,
          value: String(object(r.cells)[field]),
          meaning: "parsed_source_value",
          citation_ids: refs,
          independently_verified: false,
        });
    }
    // V2 evaluates explicit associations against retained record subjects, even when
    // the source arrived in a different bundle. Invoice-label context alone is never a link.
    for (const r of legacy ? rs : targets) {
      for (const a of list(b.artifacts).filter(
        (a) => a.role === "support" && associated(a, r).length,
      )) {
        const links = associated(a, r);
        const locator =
          a.derived_from === null
            ? {
                artifact_hash: a.byte_hash,
                record: null,
                line_start: null,
                line_end: null,
                byte_start: 0,
                byte_end: a.byte_length,
                field: null,
              }
            : object(a.derived_from);
        const id = cite(b, a, null, locator),
          text =
            typeof a.derived_text === "string" ? a.derived_text.trim() : null;
        const deliveries = String(object(r.cells).delivery_ids)
          .split(";")
          .filter(Boolean);
        let deliveryId: string | undefined;
        let meaning =
          a.interpretation === "retained_only"
            ? "retained_only"
            : "ambiguous_excerpt";
        // Whole-excerpt equality is intentional: no substring inference from arbitrary prose,
        // nested negation, quotations or source instructions. These are source reports only.
        for (const d of deliveries) {
          // An explicit DEL-5 association cannot establish a DEL-4 claim merely
          // because both occur on one record. Preserve uncertain applicability instead.
          if (
            !legacy &&
            !links.some((link) => link.kind !== "delivery" || link.id === d)
          )
            continue;
          if (text === `Delivery confirmation for ${d} is supplied.`) {
            meaning = "source_reports_confirmation";
            deliveryId = d;
          }
          if (
            text === `Delivery confirmation for ${d} is not supplied.` ||
            text ===
              `Customer disputes delivery ${d}. Delivery confirmation is not supplied.`
          ) {
            meaning = "source_reports_missing";
            deliveryId = d;
          }
        }
        claims.push({
          ...scope(
            r,
            deliveryId ? "delivery" : "record",
            deliveryId ?? r.source_record_id,
            links,
          ),
          field: `${String(r.entity)}.delivery_evidence`,
          value:
            text === null
              ? "Retained bytes only; content is not parsed"
              : Array.from(text).slice(0, 1024).join(""),
          meaning,
          citation_ids: [id],
          independently_verified: false,
        });
      }
    }
  }
  require(sources.size > 0 &&
    state.bundles.includes(
      selectedBundle,
    ), "DISCOVERY_INTEGRITY", "Selected source cannot be reconstructed");
  const unique = new Map(claims.map((c) => [sha256Json(c), c]));
  return {
    sources: [...sources.values()].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    ),
    claims: [...unique]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, c]) => c),
    related,
  };
}
export function projectDiscovery(
  state: IntakeState,
  bundleId: string,
  recordKey: string,
  caseId: string | null,
): Obj {
  return projectAtVersions(
    state,
    bundleId,
    recordKey,
    caseId,
    DISCOVERY_VERSIONS,
  );
}
function projectAtVersions(
  state: IntakeState,
  bundleId: string,
  recordKey: string,
  caseId: string | null,
  versions: Versions,
): Obj {
  const legacy = same(versions, LEGACY_DISCOVERY_VERSIONS);
  require(legacy ||
    same(
      versions,
      DISCOVERY_VERSIONS,
    ), "DISCOVERY_INTEGRITY", "Unsupported Discovery implementation versions");
  const { bundle, record } = selected(state, bundleId, recordKey),
    cells = object(record.cells),
    { sources, claims, related } = sourceMaterial(
      state,
      bundle,
      record,
      legacy,
    ),
    m = manifest(state, bundle, record, caseId, versions);
  const deliveries = sorted(
    String(cells.delivery_ids).split(";").filter(Boolean),
  );
  const ownClaims = claims.filter((c) =>
      legacy
        ? String(c.field).startsWith(`${String(record.entity)}.`)
        : c.applicable_record_key === record.record_key,
    ),
    delivery = ownClaims.filter(
      (c) =>
        String(c.field).endsWith(".delivery_evidence") &&
        (legacy ||
          object(c.subject).kind === "record" ||
          deliveries.includes(String(object(c.subject).id))),
    );
  const groups = deliveries.map((id) => ({
    id,
    claims: delivery.filter(
      (c) =>
        !legacy &&
        object(c.subject).kind === "delivery" &&
        object(c.subject).id === id,
    ),
  }));
  const conflicts = groups.filter(
    (g) =>
      g.claims.some((c) => c.meaning === "source_reports_confirmation") &&
      g.claims.some((c) => c.meaning === "source_reports_missing"),
  );
  const positive = delivery.some(
      (c) => c.meaning === "source_reports_confirmation",
    ),
    negative = delivery.some((c) => c.meaning === "source_reports_missing"),
    ambiguous = delivery.some((c) =>
      ["ambiguous_excerpt", "retained_only"].includes(String(c.meaning)),
    );
  const conflict = legacy ? positive && negative : conflicts.length > 0;
  const gap = legacy
    ? positive && negative
      ? "Supplied sources disagree about delivery confirmation."
      : ambiguous
        ? "The supplied delivery material needs interpretation; inspect its cited excerpt or original bytes."
        : positive
          ? "A supplied source reports delivery confirmation. The underlying proof and customer impact remain unverified."
          : negative
            ? "A supplied note reports that delivery confirmation is not supplied. This does not prove non-delivery."
            : "No associated delivery support is supplied for this record. Absence from this upload does not prove non-delivery."
    : [
        ...groups.map((g) => {
          const yes = g.claims.some(
              (c) => c.meaning === "source_reports_confirmation",
            ),
            no = g.claims.some((c) => c.meaning === "source_reports_missing");
          return (
            `${g.id}: ` +
            (yes && no
              ? "Supplied sources disagree about delivery confirmation for this delivery."
              : yes
                ? "A supplied source reports delivery confirmation."
                : no
                  ? "A supplied note reports that delivery confirmation is not supplied."
                  : "No associated delivery support establishes a confirmation claim for this delivery.")
          );
        }),
        ...(ambiguous
          ? [
              "The supplied delivery material needs interpretation; applicability remains uncertain. Inspect its cited excerpt or original bytes.",
            ]
          : []),
        ...(groups.length
          ? []
          : [
              "No delivery identity is supplied for this record; evidence applicability needs clarification.",
            ]),
        "Source reports are not independent verification. Absence from this upload does not prove non-delivery; underlying proof and customer impact remain unverified.",
      ].join(" ");
  const refs = (field?: string): string[] =>
    sorted(
      (legacy ? claims : field === "delivery_evidence" ? delivery : ownClaims)
        .filter((c) => !field || String(c.field).endsWith(`.${field}`))
        .flatMap((c) => strings(c.citation_ids)),
    );
  const fieldConflicts = [
    "amount_minor",
    "currency",
    "source_status",
    "upstream_owner",
  ].filter(
    (f) =>
      new Set(
        ownClaims
          .filter((c) => String(c.field).endsWith(`.${f}`))
          .map((c) => c.value),
      ).size > 1,
  );
  const variants = sorted(related.map((r) => String(r.entity))),
    ownRefs = sorted(
      sources
        .filter((s) => s.record_key === record.record_key)
        .map((s) => String(s.id)),
    );
  const finding = (
    id: string,
    title: string,
    text: string,
    state = "unknown",
    view = "observed",
    citations = ownRefs,
  ): Obj => ({
    id,
    title,
    text,
    process_view: view,
    evidence_type: view === "proposed" ? "inferred" : "observed",
    claim_state: state,
    citation_ids: citations,
  });
  const question = (
    id: string,
    recordId: string,
    prompt: string,
    consequence: string,
    needed: string,
    owner: string,
  ): Obj => ({
    id,
    record_id: recordId,
    prompt,
    consequence,
    needed_evidence: needed,
    proposed_owner: owner,
    owner_confirmed: false,
  });
  const objective = `Prepare an evidence-backed disposition for ${String(cells.customer_ref)} / ${String(cells.invoice_id)} in ${String(record.entity)}.`;
  const findings = [
    finding(
      "R1",
      "Boundary and normal route",
      `The queue reports ${String(cells.activity)} / ${String(cells.source_status)}. Documented route: not established by the supplied material. Observed route: a queue snapshot cannot establish historical transitions. Proposed route: inspect and clarify evidence before disposition review; this remains a hypothesis. Trigger and acceptance criterion remain unknown.`,
    ),
    finding(
      "R2",
      "Exceptions, population and exposure",
      `${String(object(bundle.coverage).distinct_records)} distinct retained records; ${String(object(bundle.coverage).invalid_records)} invalid. Population completeness, normal/exception routes and error exposure are unconfirmed. Reported dispute principal is not savings.`,
    ),
    finding(
      "R3",
      "Dependencies and evidence",
      gap,
      conflict ? "disputed" : "unknown",
      "observed",
      legacy
        ? refs("delivery_evidence").length
          ? refs("delivery_evidence")
          : ownRefs
        : sorted([
            ...refs("delivery_evidence"),
            ...(groups.some((g) => !g.claims.length) || !groups.length
              ? ownRefs
              : []),
          ]),
    ),
    finding(
      "R4",
      "Field-level source precedence",
      fieldConflicts.length
        ? `Competing source values for ${fieldConflicts.join(", ")}${legacy ? "" : ` on ${String(record.source_record_id)} (${String(record.entity)})`}; inspect both citations and source times. No governing field rule selects a winner.`
        : "No reviewed field-level precedence is supplied. Amount, delivery status and terms need governing sources, scope, effective periods and accountable approvers.",
      fieldConflicts.length ? "disputed" : "unknown",
      "observed",
      legacy
        ? refs()
        : sorted(
            ownClaims
              .filter((c) =>
                fieldConflicts.some((f) => String(c.field).endsWith(`.${f}`)),
              )
              .flatMap((c) => strings(c.citation_ids)),
          ),
    ),
    finding(
      "R5",
      "Entity and regional variants",
      `${variants.join(", ")} remain distinct source entities. Matching invoice labels do not merge work.${legacy ? "" : " Distinct record identities retain their own amounts and support; related records are context, not transferred proof."} Regional, subsidiary, acquisition and policy applicability are unknown.`,
      "unknown",
      "observed",
      legacy
        ? refs()
        : sorted(
            claims
              .filter((c) =>
                ["invoice_id", "customer_ref"].some((f) =>
                  String(c.field).endsWith(`.${f}`),
                ),
              )
              .flatMap((c) => strings(c.citation_ids)),
          ),
    ),
    finding(
      "R6",
      "Elapsed work, effort, waits and handoffs",
      "Source occurrence and export timestamps retain their stated meanings. Intake and review times do not establish business start/end, active effort, waiting duration or historical handoffs.",
    ),
    finding(
      "R7",
      "Task readiness and support",
      "Task-specific understanding, preferred assistance and support ownership remain unconfirmed. An operator correction records reported understanding, not a skill score or legal authority.",
      "unknown",
      "proposed",
    ),
  ];
  const questions = [
    question(
      "Q1",
      "R3",
      conflict
        ? `Which delivery claims conflict${legacy ? "" : ` for ${conflicts.map((g) => g.id).join(", ")}`}, and which governing evidence can clarify them?`
        : ambiguous
          ? "What does this cited delivery material actually establish, and what remains unknown?"
          : positive &&
              (legacy ||
                groups.every((g) =>
                  g.claims.some(
                    (c) => c.meaning === "source_reports_confirmation",
                  ),
                ))
            ? "Who can supply and inspect the underlying delivery confirmation reported by this source?"
            : `Who can supply delivery evidence${
                legacy
                  ? ""
                  : ` for ${
                      groups
                        .filter(
                          (g) =>
                            !g.claims.some(
                              (c) =>
                                c.meaning === "source_reports_confirmation",
                            ),
                        )
                        .map((g) => g.id)
                        .join(", ") || "the unidentified delivery"
                    }`
              }, by what agreed date, and what cannot proceed without it?`,
      "A disposition may depend on delivery proof; source wording alone cannot settle the claim.",
      "Delivery record, applicable terms, attributed read-back and evidence-owner response",
      "Delivery evidence owner / AR operator",
    ),
    question(
      "Q2",
      "R1",
      "What starts and ends this assignment? Supply a dated normal Case route separately from the documented SOP and proposed route.",
      "A snapshot is not an observed sequence.",
      "Scoped SOP, actual activity/control records and owner confirmation",
      "Process owner",
    ),
    question(
      "Q3",
      "R2",
      "Is the export the full eligible population for a defined window? Include typical exceptions, failed, human-only and still-open work.",
      "Missing denominator prevents defensible exception rates or exposure totals.",
      "Cohort rules, export manifest, exception classifications and loss evidence",
      "Queue / measurement owner",
    ),
    question(
      "Q4",
      "R3",
      `Who confirms accountability${typeof record.reported_owner === "string" ? ` for reported owner ${record.reported_owner}` : ""}, which work happens off-system, and who receives the disposition?`,
      "Reported ownership and object links do not establish responsibility or causal waiting.",
      "Owner confirmation, handoff acknowledgment and upstream/downstream dependencies",
      "AR / upstream / downstream owners",
    ),
    question(
      "Q5",
      "R4",
      "Which source governs each disputed field and terms, for which entity and effective period? Preserve competing values.",
      "An operator description cannot install a precedence or authorization rule.",
      "Scoped field rules with policy references, freshness and named approver",
      "Data / policy owners",
    ),
    question(
      "Q6",
      "R5",
      "Which regional, entity, subsidiary or acquisition controls differ, and since when?",
      "Entity labels alone cannot select policy variants.",
      "Entity mapping and dated local policies with overlap rules",
      "Entity policy owner",
    ),
    question(
      "Q7",
      "R6",
      "What do the source timestamps mean? Who actively worked, waited or handed off; what was reopened?",
      "Elapsed intervals cannot substitute for person-effort or summed overlapping waits.",
      "Activity semantics, timezone/calendar, effort method/coverage, reopen and handoff evidence",
      "Operator / measurement owner",
    ),
    question(
      "Q8",
      "R7",
      "Using these citations, distinguish missing proof from non-delivery and describe what you would retain, review or delegate. What help is needed?",
      "Readiness is specific to this task; no inferred score or authentication.",
      "Voluntary self-assessment, demonstrated correction, preferred support and support owner",
      "Operator / support owner",
    ),
  ];
  const loop = (id: string, text: string, state = "unknown"): Obj => ({
    id,
    text,
    claim_state: state,
    process_view: "proposed",
    citation_ids: ownRefs,
  });
  const output = {
    schema_version: "discovery-material.v1",
    manifest: m,
    assignment: {
      customer_ref: cells.customer_ref,
      invoice_id: cells.invoice_id,
      entity: record.entity,
      amount_minor: Number(cells.amount_minor),
      currency: cells.currency,
      objective,
      reported_owner: record.reported_owner ?? null,
      accountable_owner: null,
      independently_verified: false,
    },
    coverage: bundle.coverage,
    committed_records: new Set(
      state.commits
        .filter((c) =>
          list(bundle.records).some((r) => r.record_key === c.record_key),
        )
        .map((c) => c.record_key),
    ).size,
    sources,
    source_claims: claims,
    findings,
    questions,
    loop_outputs: [
      loop(
        "Trigger",
        "An entity-qualified reported invoice dispute is received; actual business start semantics need confirmation.",
      ),
      loop("Objective", objective),
      loop(
        "Population",
        `${String(object(bundle.coverage).distinct_records)} distinct records in this upload; recurring eligible cohort, coverage and window remain unconfirmed.`,
      ),
      loop(
        "Close Event",
        "Candidate: accountable owner/customer accepts an agreed disposition independently evidenced in its governing source. Settlement versus matched cash remains unresolved. No Case closure is granted.",
      ),
      loop(
        "Human Intervention Map",
        `${gap} Evidence owner and governing terms need confirmation. Financial authority is absent; no automatic owner assignment.`,
      ),
      loop(
        "Correction Path",
        "Append a cited descriptive correction and reason; preserve the original. Promotion to rules, evaluation or worker behavior requires later reviewed work.",
      ),
    ],
    improvements: [
      {
        change: "remove",
        proposal:
          "Hypothesis: remove duplicate copying of source values into a second summary.",
        control:
          "Preserve original bytes, entity keys and operator discrepancy review.",
        allocation:
          "Deterministic code reuses parsed cells; a person checks meaning.",
        measurement_needed:
          "Attributable preparation/rework effort and error coverage before/after.",
        hypothesis: true,
      },
      {
        change: "combine",
        proposal:
          "Hypothesis: combine repeated evidence requests into one consequential agenda.",
        control:
          "A person confirms questions and accountable recipients; no automatic messages.",
        allocation:
          "Code lists gaps; people obtain and interpret evidence. No model calls.",
        measurement_needed:
          "Missed questions, review/support effort and quality baseline.",
        hypothesis: true,
      },
      {
        change: "parallelize",
        proposal:
          "Hypothesis: gather delivery evidence and governing terms in parallel where independent.",
        control:
          "Confirm dependencies, permitted access and disposition authorization.",
        allocation:
          "People collect evidence. An adaptive agent is not needed for this retained bundle.",
        measurement_needed:
          "Critical-path waits as interval unions; never sum overlapping waits as savings.",
        hypothesis: true,
      },
      {
        change: "simplify",
        proposal:
          "Hypothesis: focus review on consequential discrepancies while preserving full citations.",
        control:
          "Separate source interpretation, business authorization and independent proof.",
        allocation:
          "Code prepares differences; people correct meaning. Bounded model/agent work remains later.",
        measurement_needed:
          "Comparable cohort, review/correction/verification effort and missed findings.",
        hypothesis: true,
      },
    ],
    annotations: [],
    measurement_note:
      "Baseline before intervention: agree cohort, normal route, variants, event meanings and comparison method. Preserve failed, human-only, reopened and unresolved Cases. Active effort needs person, method and coverage; union overlapping intervals per person and overlapping waits. Include human preparation/review/correction/verification, support, model/tool/compute and attributable setup/operating costs. Missing effort, population, baseline, costs, acceptance and impact are unknown, not zero. Dispute amounts are not savings. Zero model calls do not mean zero operating cost. No verified business outcomes or measured improvement are established.",
    model_calls: 0,
  };
  return checked("material", output);
}
function historyFor(state: DiscoveryState, caseId: string | null): Obj[] {
  return state.entries
    .filter((e) => e.case_id === caseId)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence));
}
function materialAt(
  state: DiscoveryState,
  bundleId: string,
  key: string,
  caseId: string | null,
  versions: Versions,
): Obj {
  let material = projectAtVersions(
    state.intake,
    bundleId,
    key,
    caseId,
    versions,
  );
  for (const entry of historyFor(state, caseId))
    if (
      entry.operation === "annotate" &&
      same(object(entry.material).manifest, material.manifest)
    )
      material = object(entry.material);
  return material;
}
export function readDiscovery(
  state: DiscoveryState,
  bundleId: string,
  key: string,
  caseId: string | null,
): Obj {
  return readAtVersions(state, bundleId, key, caseId, DISCOVERY_VERSIONS);
}
function readAtVersions(
  state: DiscoveryState,
  bundleId: string,
  key: string,
  caseId: string | null,
  versions: Versions,
): Obj {
  const material = materialAt(state, bundleId, key, caseId, versions),
    m = object(material.manifest),
    hash = sha256Json(material),
    history = historyFor(state, caseId),
    last = history.at(-1);
  const confirmed = sorted(
    history
      .filter((e) => e.operation === "confirm" && e.material_hash === hash)
      .map((e) => String(object(e.command).purpose)),
  );
  // Concurrency is Case-wide; applicability belongs to this selected material.
  const selectedLast = history.findLast(
    (e) =>
      object(e.command).bundle_id === bundleId &&
      object(e.command).record_key === key,
  );
  const stale =
    selectedLast !== undefined &&
    !same(object(selectedLast.material).manifest, m);
  const reasons =
    caseId === null
      ? [
          "Commit the selected retained material to an explicitly chosen Case before saving descriptive review.",
        ]
      : [];
  if (stale)
    reasons.push(
      "Case, retained business inputs or template changed. Earlier answers and confirmations are historical. Carry-forward requires a new explicit annotation and separate confirmation.",
    );
  return checked(
    "read",
    withHash({
      schema_version: "discovery-brief.v1",
      material,
      material_hash: hash,
      binding: {
        bundle_id: bundleId,
        record_key: key,
        case_id: caseId,
        expected_case_version: m.case_version,
        expected_intake_receipt_hash: m.intake_receipt_hash,
        expected_discovery_revision: last?.sequence ?? 0,
        expected_previous_entry_hash: last?.hash ?? null,
        expected_material_hash: hash,
      },
      history,
      current: {
        can_record: caseId !== null,
        requires_fresh_review: stale,
        reasons,
        confirmed_purposes: confirmed,
        applicable_annotation_revisions: sorted(
          list(material.annotations).map((a) => String(a.submitted_revision)),
        ).map(Number),
      },
      authority_granted: false,
      closure_permission: false,
    }),
  );
}
export function withHash(v: Obj): Obj {
  return { ...v, hash: sha256Json(v) };
}
export function discoveryResult(entry: Obj): Obj {
  return checked("result", {
    schema_version: "discovery-review-result.v1",
    status: "recorded",
    entry,
    authority_granted: false,
    closure_permission: false,
  });
}
export function appendDiscovery(
  state: DiscoveryState,
  input: unknown,
  at: string,
): Obj {
  return appendAtVersions(state, input, at, DISCOVERY_VERSIONS);
}
function appendAtVersions(
  state: DiscoveryState,
  input: unknown,
  at: string,
  versions: Versions,
): Obj {
  const command = normalizeDiscoveryCommand(input),
    view = readAtVersions(
      state,
      String(command.bundle_id),
      String(command.record_key),
      String(command.case_id),
      versions,
    ),
    binding = object(view.binding),
    material = object(view.material),
    previous = historyFor(state, String(command.case_id)).at(-1);
  for (const [k, v] of Object.entries(binding))
    require(same(
      command[k],
      v,
    ), "DISCOVERY_CONFLICT", `Discovery ${k} changed. Refresh and explicitly review the new material.`);
  const floor =
    [
      state.intake.clockFloor,
      ...state.entries.map((e) => String(e.recorded_at)),
    ]
      .sort()
      .at(-1) ?? "";
  require(at >= floor &&
    new Date(at).toISOString() ===
      at, "CLOCK_REGRESSION", "Discovery recording clock regressed");
  let resulting: Obj = material;
  const revision = Number(binding.expected_discovery_revision) + 1,
    fingerprint = sha256Json(command);
  if (command.operation === "annotate") {
    const targets = new Set(
        [...list(material.findings), ...list(material.questions)].map(
          (x) => x.id,
        ),
      ),
      citations = new Set(list(material.sources).map((x) => x.id)),
      annotations = new Map(
        list(material.annotations).map((a) => [a.target_id, a]),
      );
    let changed = false;
    for (const change of list(command.changes)) {
      require(targets.has(change.target_id) &&
        strings(change.citation_ids).every((id) =>
          citations.has(id),
        ), "INVALID_INPUT", "Correction target or citation is not in the reviewed retained material");
      const normalizedChange: Obj = {
        ...change,
        citation_ids: sorted(strings(change.citation_ids)),
      };
      const old = annotations.get(change.target_id);
      if (
        !old ||
        !["target_id", "state", "text", "reason", "citation_ids"].every((k) =>
          same(old[k], normalizedChange[k]),
        )
      )
        changed = true;
      annotations.set(change.target_id, {
        ...change,
        citation_ids: sorted(strings(change.citation_ids)),
        evidence_type: "operator-reported",
        submitted_revision: revision,
        command_fingerprint: fingerprint,
      });
    }
    require(changed, "NO_CHANGE", "No descriptive annotation changed; no command was recorded");
    resulting = checked("material", {
      ...material,
      annotations: [...annotations.values()].sort((a, b) =>
        String(a.target_id).localeCompare(String(b.target_id)),
      ),
    });
  } else
    require(!strings(object(view.current).confirmed_purposes).includes(
      String(command.purpose),
    ), "ALREADY_REVIEWED", "This exact material is already descriptively confirmed for that purpose; no new command was recorded");
  const materialHash = sha256Json(resulting);
  return checked(
    "journal",
    withHash({
      schema_version: "discovery-review-entry.v1",
      id: `discovery_review_${fingerprint.slice(7)}`,
      tenant_id: INTAKE_TENANT,
      intake_scope_id: "scope_invoice_disputes",
      case_id: command.case_id,
      sequence: revision,
      previous_entry_hash: previous?.hash ?? null,
      operation: command.operation,
      idempotency_key: command.idempotency_key,
      command_fingerprint: fingerprint,
      recorded_at: at,
      actor: INTAKE_ACTOR,
      command,
      material: resulting,
      material_hash: materialHash,
      result: {
        status: "recorded",
        operation: command.operation,
        discovery_revision: revision,
        material_hash: materialHash,
        authority_granted: false,
        closure_permission: false,
      },
      versions,
    }),
  );
}
// Rebuild the exact historical prefix, not the latest Case. Strictly earlier canonical
// changes cannot be omitted; equal timestamps alone do not establish cross-journal order.
function historicalInputs(state: IntakeState, entry: Obj): IntakeState {
  const m = object(object(entry.material).manifest),
    at = String(entry.recorded_at),
    bundleHashes = strings(m.business_bundle_hashes),
    commitHashes = strings(m.business_commit_hashes);
  const bundles = state.bundles.filter((b) =>
      bundleHashes.includes(String(b.hash)),
    ),
    commits = state.commits.filter((c) =>
      commitHashes.includes(String(c.hash)),
    );
  require(bundles.length === bundleHashes.length &&
    commits.length === commitHashes.length &&
    same(sorted(bundleHashes), bundleHashes) &&
    same(
      sorted(commitHashes),
      commitHashes,
    ), "DISCOVERY_INTEGRITY", "Historical business input manifest is missing or duplicated");
  require(state.bundles.every(
    (b) => String(b.retained_at) >= at || bundleHashes.includes(String(b.hash)),
  ) &&
    state.commits.every(
      (c) =>
        String(c.recorded_at) >= at || commitHashes.includes(String(c.hash)),
    ), "DISCOVERY_INTEGRITY", "Historical review omitted earlier canonical business inputs");
  require(commits.every((c, i) => c === state.commits[i]) &&
    bundles.every((b) => String(b.retained_at) <= at) &&
    commits.every(
      (c) => String(c.recorded_at) <= at,
    ), "DISCOVERY_INTEGRITY", "Historical inputs are not a possible intake prefix");
  const aggregate = getCase(state.cases, INTAKE_TENANT, String(entry.case_id)),
    count = Number(m.case_version);
  require(aggregate &&
    count > 0 &&
    aggregate.journal[count - 1]?.event_hash === m.case_journal_hash &&
    aggregate.journal
      .slice(count)
      .every(
        (e) => e.recorded_at >= at,
      ), "DISCOVERY_INTEGRITY", "Review claimed an obsolete or altered Case anchor");
  const prefix = aggregate.journal.slice(0, count);
  require(prefix.every(
    (e) => e.recorded_at <= at,
  ), "DISCOVERY_INTEGRITY", "Review predates its referenced Case");
  const times = [
    ...bundles.map((b) => String(b.retained_at)),
    ...commits.map((c) => String(c.recorded_at)),
    ...prefix.map((e) => e.recorded_at),
  ];
  return {
    ...state,
    bundles,
    commits,
    clockFloor: times.sort().at(-1) ?? "",
    cases: {
      ...state.cases,
      cases: [
        ...state.cases.cases.filter((c) => c !== aggregate),
        replayCaseJournal(prefix),
      ],
    },
  };
}
export function assertDiscoveryState(state: DiscoveryState): void {
  assertIntakeState(state.intake);
  const previous: Obj[] = [],
    keys = new Set<string>();
  // All relevant per-Case sequences are replayed in their recorded chain order.
  for (const entry of [...state.entries].sort(
    (a, b) =>
      String(a.case_id).localeCompare(String(b.case_id)) ||
      Number(a.sequence) - Number(b.sequence),
  )) {
    assertValidDiscoveryContract("journal", entry);
    const key = canonicalJson([
      entry.tenant_id,
      entry.intake_scope_id,
      entry.operation,
      entry.idempotency_key,
    ]);
    require(!keys.has(key) &&
      entry.hash ===
        hashOf(
          entry,
        ), "DISCOVERY_INTEGRITY", "Discovery identity or hash changed");
    keys.add(key);
    const intake = historicalInputs(state.intake, entry),
      sameCase = previous.filter((p) => p.case_id === entry.case_id);
    const rebuilt = appendAtVersions(
      { intake, entries: sameCase },
      entry.command,
      String(entry.recorded_at),
      object(entry.versions) as Versions,
    );
    require(same(
      entry,
      rebuilt,
    ), "DISCOVERY_INTEGRITY", "Descriptive review, attribution, material or result cannot be reconstructed");
    previous.push(entry);
  }
  // Clock order across unrelated Cases is not inferred from equal timestamps.
  // A retained entry nevertheless cannot cite business material recorded in its future.
}
export function exportDiscoveryState(state: DiscoveryState): Obj {
  assertDiscoveryState(state);
  return checked(
    "export",
    withHash({
      schema_version: "discovery-export.v1",
      intake: exportIntakeState(state.intake),
      entries: [...state.entries].sort(
        (a, b) =>
          String(a.case_id).localeCompare(String(b.case_id)) ||
          Number(a.sequence) - Number(b.sequence),
      ),
      versions: DISCOVERY_VERSIONS,
    }),
  );
}
export function validateDiscoveryExport(v: unknown): DiscoveryState {
  assertValidDiscoveryContract("export", v);
  require(v.hash ===
    hashOf(v), "DISCOVERY_INTEGRITY", "Discovery export hash differs");
  const state = {
    intake: validateIntakeExport(v.intake),
    entries: list(v.entries),
  };
  assertDiscoveryState(state);
  return state;
}
