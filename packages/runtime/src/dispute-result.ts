import {
  assertValidDisputeResultContract,
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import { getCase, replayCaseJournal } from "./case-engine.js";
import {
  INTAKE_TENANT,
  intakeObject as o,
  intakeList as list,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "./intake.js";
import {
  readAuthorityRequest,
  reviewSnapshot,
  normalizeAuthorityCatalogData,
  executeAuthorityCommand,
  DISPUTE_REVIEW_VERSIONS,
  type AuthorityCommandResult,
} from "./authority-review.js";
import {
  string,
  type AuthorityState,
  type AuthorityCatalogHead,
} from "./authority-review-types.js";
import {
  exportWorkState,
  validateWorkExport,
  type WorkState,
} from "./preparation-work.js";
import {
  disputeActor,
  disputeIdentity,
  disputeCatalog,
  DISPUTE_IDS,
} from "./dispute-profile.js";
import {
  compareDisputeSource,
  rawDisputeRead,
  unavailableDisputeRead,
} from "./dispute-source.js";
export interface DisputeState {
  /** Historical export adapter retains global positions without other tenants data. */
  authorityPosition?: number;
  work: WorkState;
  authority: AuthorityState;
  heads: readonly AuthorityCatalogHead[];
  entries: readonly Obj[];
}
export const DISPUTE_VERSIONS = {
  engine: "dispute-result.v1",
  reader: "synthetic-dispute-source.v1",
  material: "dispute-authority-material.v1",
};
const same = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);
const hashed = (v: Obj): Obj => ({ ...v, hash: sha256Json(v) });
function needed<T>(v: T | undefined | null): T {
  ensure(
    v !== undefined && v !== null,
    "RESULT_INTEGRITY",
    "Required canonical evidence is missing",
  );
  return v;
}
const intake = (s: DisputeState): WorkState["pack"]["discovery"]["intake"] =>
  s.work.pack.discovery.intake;
const isAuthority = (e: Obj): boolean =>
  ["request_authority", "review_authority"].includes(String(e.operation));
export const caseEntries = (s: DisputeState, id: unknown): Obj[] =>
  s.entries.filter((e) => e.case_id === id && !isAuthority(e));
const orderedEvidence = (entries: readonly Obj[]): Obj[] =>
  [...entries].sort(
    (a, b) =>
      String(a.case_id).localeCompare(String(b.case_id)) ||
      Number(a.sequence) - Number(b.sequence) ||
      Number(isAuthority(a)) - Number(isAuthority(b)) ||
      Number(a.authority_position) - Number(b.authority_position),
  );
/** Derived receipts are retained solely in the existing D6 command journal, never O. */
export function disputeAuthorityReceipts(authority: AuthorityState): Obj[] {
  const groups = new Map<string, Obj[]>();
  for (const item of authority.entries)
    if (item.schema_version === "authority-request-journal-entry.dispute.v1") {
      const a = o(item),
        key = String(a.command_fingerprint);
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
  return [...groups.values()].map((group) => {
    group.sort((a, b) => Number(a.position) - Number(b.position));
    const a = needed(group[0]),
      meta = o(o(a.command).result_context),
      c = o(meta.command),
      binding = o(c.binding);
    return hashed({
      schema_version: "dispute-result-entry.v1",
      id: `result_${sha256Json(c).slice(7)}`,
      tenant_id: INTAKE_TENANT,
      case_id: binding.case_id,
      record_key: binding.record_key,
      sequence: binding.result_revision,
      previous_entry_hash: binding.result_head,
      operation: c.operation,
      idempotency_key: c.idempotency_key,
      command_fingerprint: sha256Json(c),
      command: c,
      context: meta.context,
      actor: meta.actor,
      authority_position: needed(group.at(-1)).position,
      authority_state_revision: binding.authority_state_revision,
      recorded_at: a.recorded_at,
      versions: meta.versions,
      source_precondition: meta.observation,
      data: {
        kind: c.operation,
        authority_entry_hashes: group.map((x) => x.event_hash),
      },
    });
  });
}
export function withDisputeAuthority(s: DisputeState): DisputeState {
  return {
    ...s,
    entries: orderedEvidence([
      ...s.entries.filter((e) => !isAuthority(e)),
      ...disputeAuthorityReceipts(s.authority),
    ]),
  };
}
const head = (s: DisputeState): AuthorityCatalogHead | undefined =>
  s.heads.find((h) => h.tenant_id === INTAKE_TENANT);
export function catalogData(s: DisputeState): Obj {
  const h = head(s);
  ensure(h, "NOT_ENROLLED", "Explicit synthetic result enrollment is required");
  return o(
    s.authority.snapshots.find((v) => v.hash === h.snapshot_hash)?.content.data,
  );
}
export function disputeSubject(
  s: DisputeState,
  caseId: string,
  key: string,
): Obj {
  const i = intake(s),
    committed = i.commits.filter(
      (c) => c.case_id === caseId && c.record_key === key,
    );
  ensure(
    committed.length,
    "CASE_BINDING_REQUIRED",
    "This exact record must be explicitly committed to this Case",
  );
  const versions = committed.map((c) => {
    const b = i.bundles.find((b) => b.id === o(c.selection).bundle_id);
    return list(b?.records).find((r) => r.record_key === key);
  });
  ensure(
    versions.every(Boolean),
    "RESULT_INTEGRITY",
    "Committed record missing",
  );
  const r = o(versions.at(-1)),
    cells = o(r.cells);
  const subject = {
    tenant_id: INTAKE_TENANT,
    case_id: caseId,
    record_key: key,
    entity: r.entity,
    customer: cells.customer_ref,
    dispute_id: cells.source_record_id,
    invoice_id: cells.invoice_id,
    order_id: String(cells.order_ids).split(";")[0],
    delivery_id: String(cells.delivery_ids).split(";")[0],
    amount_minor: Number(cells.amount_minor),
    currency: cells.currency,
  };
  assertValidDisputeResultContract("subject", subject);
  ensure(
    String(cells.order_ids).split(";").length === 1 &&
      String(cells.delivery_ids).split(";").length === 1,
    "UNSUPPORTED_SUBJECT",
    "Only the exact single-allocation synthetic dispute is supported",
  );
  const a = getCase(i.cases, INTAKE_TENANT, caseId);
  ensure(
    a &&
      o(a.document.case).customer_ref === subject.customer &&
      same(o(a.document.case).scope_ids, ["scope_entity_north"]),
    "SCOPE_CONFLICT",
    "Case and exact record scope differ",
  );
  return subject;
}
export function disputeBinding(
  s: DisputeState,
  caseId: string,
  key: string,
): Obj {
  const a = getCase(intake(s).cases, INTAKE_TENANT, caseId);
  ensure(a, "NOT_FOUND", "Case not found");
  const h = head(s),
    entries = caseEntries(s, caseId);
  return {
    case_id: caseId,
    record_key: key,
    case_version: a.journal.length,
    case_head_hash: needed(a.journal.at(-1)).event_hash,
    authority_state_revision: h?.revision ?? 0,
    catalog_hash: h?.snapshot_hash ?? null,
    business_input_hash: sha256Json({
      bundles: intake(s)
        .bundles.map((b) => b.hash)
        .sort(),
      commits: intake(s)
        .commits.map((c) => c.hash)
        .sort(),
    }),
    result_revision: entries.length,
    result_head: entries.at(-1)?.hash ?? null,
  };
}
export function disputeContext(s: DisputeState, caseId: string): Obj {
  const a = needed(getCase(intake(s).cases, INTAKE_TENANT, caseId));
  const h = head(s);
  const floor =
    [
      intake(s).clockFloor,
      ...s.work.entries.map((e) => string(e.recorded_at)),
      ...s.work.pack.entries.map((e) => string(e.recorded_at)),
      ...s.work.pack.discovery.entries.map((e) => string(e.recorded_at)),
      ...s.entries.map((e) => string(e.recorded_at)),
      ...s.heads.map((h) => h.last_recorded_at),
    ]
      .sort()
      .at(-1) ?? "";
  return {
    case_version: a.journal.length,
    case_head_hash: needed(a.journal.at(-1)).event_hash,
    bundle_hashes: intake(s)
      .bundles.map((b) => b.hash)
      .sort(),
    commit_hashes: intake(s)
      .commits.map((c) => c.hash)
      .sort(),
    work_hashes: s.work.entries.map((e) => e.hash),
    catalog_hash: h?.snapshot_hash ?? null,
    authority_state_revision: h?.revision ?? 0,
    authority_position: s.authorityPosition ?? s.authority.entries.length,
    clock_floor: floor,
  };
}
export function normalizeDisputeCommand(v: unknown): Obj {
  assertValidDisputeResultContract("command", v);
  ensure(
    Buffer.byteLength(canonicalJson(v)) <= 131072,
    "INVALID_INPUT",
    "Command exceeds 128 KiB",
  );
  if (v.reason !== undefined)
    ensure(string(v.reason).trim(), "INVALID_INPUT", "Give a reason");
  return immutableJson(v);
}
export function disputeDuplicate(s: DisputeState, c: Obj): Obj | undefined {
  const e = s.entries.find(
    (e) =>
      e.operation === c.operation && e.idempotency_key === c.idempotency_key,
  );
  if (e) {
    ensure(
      e.command_fingerprint === sha256Json(c),
      "IDEMPOTENCY_CONFLICT",
      "Result key is already bound to different command bytes",
    );
    return disputeReceipt(e);
  }
  return undefined;
}
export const disputeReceipt = (e: Obj): Obj => ({
  schema_version: "dispute-result-receipt.v1",
  historical_only: true,
  entry: e,
});
function candidate(s: DisputeState, c: Obj): Obj {
  const e = s.entries.find(
    (e) =>
      e.operation === "candidate" &&
      e.hash === c.candidate_hash &&
      e.case_id === o(c.binding).case_id &&
      e.record_key === o(c.binding).record_key,
  );
  ensure(e, "BINDING_CONFLICT", "Exact candidate is missing");
  return e;
}
function candidateHistory(s: DisputeState, e: Obj): Obj[] {
  return s.entries.filter(
    (x) => x.hash === e.hash || o(x.command).candidate_hash === e.hash,
  );
}
function last(s: DisputeState, e: Obj, op: string): Obj | undefined {
  return candidateHistory(s, e)
    .filter((x) => x.operation === op)
    .at(-1);
}
function fresh(e: Obj, at: string): boolean {
  return (
    string(e.recorded_at) <= at &&
    Date.parse(at) - Date.parse(string(e.recorded_at)) < 15 * 60 * 1000
  );
}
function currentBasis(s: DisputeState, e: Obj, at: string): Obj {
  const b = last(s, e, "basis_check");
  ensure(
    b && o(o(b.data).comparison).status === "match" && fresh(b, at),
    "BASIS_REQUIRED",
    "A fresh complete original-proof check is required",
  );
  const context = o(b.context),
    now = disputeContext(s, String(e.case_id));
  ensure(
    [
      "case_version",
      "case_head_hash",
      "bundle_hashes",
      "commit_hashes",
      "catalog_hash",
      "authority_state_revision",
    ].every((k) => same(context[k], now[k])),
    "STALE_BASIS",
    "Case, catalog or business inputs changed; check a fresh basis",
  );
  const data = catalogData(s),
    policy = list(data.policies).find(
      (p) => p.policy_id === "policy_dispute_no_adjustment",
    );
  ensure(policy, "POLICY_UNAVAILABLE", "Bound policy missing");
  const source = o(o(o(b.data).observation).read).source;
  return {
    schema_version: "dispute-result-basis.v1",
    subject: o(e.data).subject,
    case_version: now.case_version,
    case_head_hash: now.case_head_hash,
    business_bundle_hashes: now.bundle_hashes,
    business_commit_hashes: now.commit_hashes,
    preparation_entry_hashes: now.work_hashes,
    catalog_hash: now.catalog_hash,
    authority_state_revision: now.authority_state_revision,
    basis_observation_hash: b.hash,
    source,
    source_hash: sha256Json(source),
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    policy_content_hash: sha256Json(policy),
    observed_at: b.recorded_at,
    expires_at: new Date(
      Date.parse(String(b.recorded_at)) + 900000,
    ).toISOString(),
  };
}
function requestPacket(s: DisputeState, e: Obj, at: string): Obj | null {
  const hashes = candidateHistory(s, e)
    .filter((x) =>
      ["request_authority", "review_authority"].includes(String(x.operation)),
    )
    .flatMap((x) => o(x.data).authority_entry_hashes as string[]);
  const request = s.authority.entries
    .filter(
      (x) => hashes.includes(string(x.event_hash)) && x.request !== undefined,
    )
    .at(-1);
  return request
    ? o(
        readAuthorityRequest(
          s.authority,
          intake(s).cases,
          needed(head(s)),
          string(request.authority_request_id),
          new Date(at),
        ),
      )
    : null;
}
function authorityMaterial(
  s: DisputeState,
  e: Obj,
  b: Obj,
  reason: string,
): Obj {
  const a = needed(getCase(intake(s).cases, INTAKE_TENANT, String(e.case_id)));
  return {
    schema_version: "authority-review-material.dispute.v1",
    tenant_id: INTAKE_TENANT,
    case_id: e.case_id,
    case_version: b.case_version,
    proposal_key: "uphold_invoice_no_adjustment",
    basis: b,
    consequence: {
      consequence_class: "invoice_dispute_no_adjustment",
      account_ref: o(b.subject).customer,
      amount_minor: o(b.subject).amount_minor,
      currency: o(b.subject).currency,
      disposition: "uphold_invoice_no_adjustment",
      subject: o(b.subject),
      basis_hash: sha256Json(b),
      adjustment_minor: 0,
    },
    evidence: list(a.document.events).map((event) => ({
      work_event: event,
      content: {
        claim:
          "Retained intake report; independent original proof is bound separately",
        basis_observation_hash: b.basis_observation_hash,
      },
    })),
    conflicts: [],
    unknowns: [
      "Payment status and DEL-5 remain unresolved; synthetic source evidence is not real customer proof.",
    ],
    freshness_basis:
      "Exact Case, intake, catalog and source bindings; 15 minute observation window.",
    recommendation: reason,
    implementation_versions: DISPUTE_REVIEW_VERSIONS,
  };
}
export function disputeNeedsSource(c: Obj): boolean {
  return (
    [
      "basis_check",
      "result_check",
      "request_authority",
      "no_action",
      "accept",
    ].includes(String(c.operation)) ||
    (c.operation === "review_authority" &&
      ["approve", "modify"].includes(String(c.decision)))
  );
}
export function applyDisputeCommand(
  s: DisputeState,
  c: Obj,
  at: string,
  observation: Obj | null = null,
  enrollmentCatalog: string | null = null,
): { entry: Obj; authority?: AuthorityCommandResult } {
  const binding = o(c.binding),
    caseId = String(binding.case_id),
    key = String(binding.record_key);
  ensure(
    same(binding, disputeBinding(s, caseId, key)),
    "BINDING_CONFLICT",
    "Case, catalog, inputs or result head changed; refresh and explicitly resubmit",
  );
  const subject = disputeSubject(s, caseId, key),
    context = disputeContext(s, caseId);
  ensure(
    at >= String(context.clock_floor),
    "CLOCK_REGRESSION",
    "Result recording clock regressed",
  );
  const op = String(c.operation),
    id = `result_${sha256Json(c).slice(7)}`,
    entries = caseEntries(s, caseId);
  let actor: Obj, data: Obj, authority: AuthorityCommandResult | undefined;
  if (op === "enroll") {
    ensure(
      !s.entries.some(
        (e) =>
          e.operation === "enroll" &&
          e.case_id === caseId &&
          e.record_key === key,
      ),
      "ALREADY_ENROLLED",
      "Exact record already enrolled; retain the original enrollment receipt",
    );
    ensure(enrollmentCatalog, "RESULT_INTEGRITY", "Enrollment catalog missing");
    ensure(
      !s.entries.some((e) => e.operation === "enroll" && e.case_id !== caseId),
      "ENROLLMENT_SCOPE_CONFLICT",
      "This fixed synthetic reader admits one explicitly enrolled Case; no name-based enrollment transfer",
    );
    actor = head(s)
      ? disputeActor(catalogData(s), "operator", subject, at)
      : disputeIdentity("operator");
    data = { kind: op, subject, catalog_hash: enrollmentCatalog };
  } else {
    ensure(
      s.entries.some(
        (e) => e.operation === "enroll" && same(o(e.data).subject, subject),
      ),
      "NOT_ENROLLED",
      "Explicit exact record enrollment is required",
    );
    const role = op.includes("check")
      ? "verifier"
      : op === "review_authority" || op === "no_action"
        ? "decision"
        : op === "report"
          ? "reporter"
          : ["accept", "reject", "reopen"].includes(op)
            ? "recipient"
            : "operator";
    actor = disputeActor(catalogData(s), role, subject, at);
    ensure(
      !!observation === disputeNeedsSource(c),
      "RESULT_INTEGRITY",
      "Source evidence must match the operation's read requirement",
    );
    if (observation) {
      ensure(
        observation.recorded_at === at,
        "RESULT_INTEGRITY",
        "Observation recording time changed",
      );
      disputeActor(
        catalogData(s),
        "verifier",
        subject,
        String(observation.started_at),
      );
      disputeActor(catalogData(s), "verifier", subject, at);
    }
    if (op === "candidate") {
      data = { kind: op, subject };
    } else {
      const e = candidate(s, c),
        history = candidateHistory(s, e),
        terminal = history.some(
          (x) => x.operation === "reject" || x.operation === "reopen",
        );
      ensure(
        !terminal || op === "result_check",
        "CANDIDATE_TERMINAL",
        "Rejected or reopened candidate cannot gain new permission; explicitly create a new candidate",
      );
      if (!["result_check", "report", "reject", "reopen"].includes(op))
        ensure(
          s.entries
            .filter(
              (x) =>
                x.operation === "candidate" &&
                x.case_id === caseId &&
                x.record_key === key,
            )
            .at(-1)?.hash === e.hash,
          "CANDIDATE_SUPERSEDED",
          "A newer candidate requires its own review; old approval cannot transfer",
        );
      if (op === "basis_check" || op === "result_check") {
        ensure(
          observation && observation.recorded_at === at,
          "RESULT_INTEGRITY",
          "Trusted observation required",
        );
        const decision =
          op === "result_check" ? last(s, e, "no_action") : undefined;
        if (op === "result_check")
          ensure(
            decision && decision.hash === c.decision_hash,
            "BINDING_CONFLICT",
            "Exact recorded no-action decision required",
          );
        const comparison = compareDisputeSource(
          subject,
          o(observation.read),
          o(observation.recheck),
          at,
          op === "basis_check" ? "basis" : "result",
          decision ? o(o(decision.data).basis) : null,
          decision ? String(decision.hash) : null,
          decision ? String(decision.recorded_at) : null,
          String(observation.observed_at),
        );
        const outcome =
          op === "result_check" && comparison.status === "match"
            ? {
                id: `outcome_${sha256Json({ candidate: e.hash, decision: needed(decision).hash, observation }).slice(7)}`,
                case_id: caseId,
                type: "invoice_dispute_no_adjustment",
                status: "achieved",
                accepted: false,
                metrics: {
                  disputed_amount_minor: subject.amount_minor,
                  currency: subject.currency,
                  cash_collected: null,
                },
                evidence_ids: [id, String(needed(decision).id)],
                verified_by_identity_id: actor.identity_id,
                verified_at: at,
              }
            : null;
        data = { kind: op, observation, comparison, outcome };
      } else if (op === "request_authority" || op === "review_authority") {
        const create = op === "request_authority";
        let material: Obj | undefined;
        if (disputeNeedsSource(c)) {
          const b = currentBasis(s, e, at);
          ensure(
            op !== "request_authority" ||
              c.basis_observation_hash === b.basis_observation_hash,
            "BINDING_CONFLICT",
            "Basis observation changed",
          );
          ensure(
            observation &&
              sha256Json(o(observation.recheck).source) === b.source_hash &&
              o(observation.recheck).status === "read",
            "STALE_SOURCE",
            "Original source changed; check a fresh basis",
          );
          ensure(
            compareDisputeSource(
              subject,
              o(observation.read),
              o(observation.recheck),
              at,
              "basis",
              null,
              null,
              null,
              String(observation.observed_at),
            ).status === "match",
            "STALE_SOURCE",
            "Original prerequisites expired or no longer match",
          );
          material = authorityMaterial(
            s,
            e,
            b,
            string(
              c.reason ??
                "Review original proof and uphold only this disputed portion without adjustment; payment remains outstanding.",
            ),
          );
        }
        if (create)
          ensure(
            !last(s, e, "request_authority"),
            "REQUEST_EXISTS",
            "This candidate already has a request; use its review history or create a fresh candidate",
          );
        const packet = create ? null : requestPacket(s, e, at);
        if (!create)
          ensure(
            packet &&
              same(c.review, {
                authority_request_id: packet.authority_request_id,
                request_binding_hash: packet.request_binding_hash,
                expected_review_revision: packet.review_revision,
              }),
            "REVIEW_BINDING_CONFLICT",
            "Exact authority request/review revision changed",
          );
        const command = {
          schema_version: "authority-command.dispute.v1",
          type: create
            ? "authority.request.create"
            : "authority.request.decide",
          tenant_id: INTAKE_TENANT,
          case_id: caseId,
          expected_case_version: binding.case_version,
          expected_authority_state_revision: binding.authority_state_revision,
          idempotency_key: `dispute:${op}:${String(c.idempotency_key)}`,
          result_context: {
            command: c,
            context,
            observation,
            actor,
            versions: DISPUTE_VERSIONS,
          },
          correlation_id: create
            ? id
            : o(needed(packet).request).correlation_id,
          ...(create
            ? { proposal_key: "uphold_invoice_no_adjustment", material }
            : {
                ...o(c.review),
                decision: c.decision,
                reason: c.reason,
                ...(c.decision === "modify"
                  ? {
                      replacement_proposal_key: "uphold_invoice_no_adjustment",
                      material,
                    }
                  : {}),
              }),
        };
        let index = 0;
        authority = executeAuthorityCommand(
          s.authority,
          intake(s).cases,
          needed(head(s)),
          command,
          create ? "operator" : "business",
          {
            now: () => new Date(at),
            nextId: (kind) =>
              `${kind}_${sha256Json(c).slice(7, 55)}_${String(++index)}`,
          },
          Number(context.authority_position),
        );
        ensure(
          authority.status === "applied",
          authority.code ?? "AUTHORITY_DENIED",
          "D6 authority command refused",
        );
        data = {
          kind: op,
          authority_entry_hashes: authority.entries.map((x) => x.event_hash),
        };
      } else if (op === "no_action") {
        ensure(
          !last(s, e, "no_action"),
          "DECISION_EXISTS",
          "This candidate already has a no-action receipt",
        );
        const b = currentBasis(s, e, at),
          packet = requestPacket(s, e, at);
        ensure(
          packet &&
            same(c.review, {
              authority_request_id: packet.authority_request_id,
              request_binding_hash: packet.request_binding_hash,
              expected_review_revision: packet.review_revision,
            }) &&
            c.basis_hash === sha256Json(o(packet.material).basis),
          "BINDING_CONFLICT",
          "Exact authority and material bindings required",
        );
        const bound = o(o(packet.material).basis);
        ensure(
          bound.source_hash === b.source_hash &&
            observation &&
            o(observation.recheck).status === "read" &&
            sha256Json(o(observation.recheck).source) === bound.source_hash &&
            fresh({ recorded_at: bound.observed_at }, at),
          "STALE_SOURCE",
          "Original source/basis changed or expired",
        );
        ensure(
          compareDisputeSource(
            subject,
            o(observation.read),
            o(observation.recheck),
            at,
            "basis",
            null,
            null,
            null,
            String(observation.observed_at),
          ).status === "match",
          "STALE_SOURCE",
          "Original prerequisites expired or no longer match",
        );
        ensure(
          o(packet.current).authorized === true,
          "AUTHORITY_DENIED",
          "Current exact human approval is required",
        );
        data = {
          kind: op,
          basis: bound,
          request_hash: packet.request_binding_hash,
          review_head: o((packet.history as Obj[]).at(-1)).event_hash,
          consequence_hash: o(packet.request).proposed_consequence_hash,
          authorization: o(packet.current).resolution,
        };
      } else if (op === "report") {
        const d = last(s, e, "no_action");
        ensure(
          d && d.hash === c.decision_hash,
          "BINDING_CONFLICT",
          "Report must cite the exact recorded decision",
        );
        ensure(
          !last(s, e, "report"),
          "REPORT_EXISTS",
          "A report is already recorded; inspect its independent check",
        );
        const claim = o(c.claim),
          prior = o(o(o(d.data).basis).source).ar;
        ensure(
          claim.source_id === o(prior).object_id &&
            Number(claim.source_version) === Number(o(prior).version) + 1 &&
            String(claim.occurred_at) >= String(d.recorded_at) &&
            String(claim.occurred_at) <= at,
          "REPORT_BINDING_CONFLICT",
          "Report must identify the expected source/version and a non-future occurrence after this decision",
        );
        data = {
          kind: op,
          claim,
          reported_by: actor,
          reported_at: at,
          reason: c.reason,
        };
      } else if (op === "accept") {
        ensure(
          o(last(s, e, "accept")?.command ?? {}).observation_hash !==
            c.observation_hash,
          "ACCEPTANCE_EXISTS",
          "This exact observation already has business acceptance; retain its original receipt",
        );
        const d = last(s, e, "no_action"),
          v = last(s, e, "result_check");
        ensure(
          d &&
            d.hash === c.decision_hash &&
            v &&
            v.hash === c.observation_hash &&
            o(v.data).outcome !== null &&
            sha256Json(o(v.data).outcome) === c.outcome_hash &&
            o(o(v.data).comparison).status === "match" &&
            fresh(v, at),
          "RESULT_REQUIRED",
          "Latest fresh independent exact result is required",
        );
        const packet = requestPacket(s, e, at);
        ensure(
          packet &&
            o(packet.current).lifecycle === "open" &&
            o(packet.current).authorized === true,
          "AUTHORITY_DENIED",
          "A terminal or currently ineligible request cannot support new business consent",
        );
        const b = o(o(d.data).basis),
          ctx = disputeContext(s, caseId);
        ensure(
          b.case_version === ctx.case_version &&
            b.case_head_hash === ctx.case_head_hash &&
            b.catalog_hash === ctx.catalog_hash &&
            same(b.business_bundle_hashes, ctx.bundle_hashes) &&
            same(b.business_commit_hashes, ctx.commit_hashes),
          "STALE_BASIS",
          "Current Case/catalog/business inputs differ from the decision",
        );
        ensure(
          observation &&
            o(observation.recheck).status === "read" &&
            same(
              o(observation.recheck).source,
              o(o(o(v.data).observation).read).source,
            ),
          "STALE_SOURCE",
          "Result source changed after independent observation",
        );
        ensure(
          compareDisputeSource(
            subject,
            o(observation.read),
            o(observation.recheck),
            at,
            "result",
            b,
            String(d.hash),
            String(d.recorded_at),
            String(observation.observed_at),
          ).status === "match",
          "STALE_SOURCE",
          "Original prerequisites are no longer valid",
        );
        const commitments = list(c.commitments);
        ensure(
          commitments.length === 1 &&
            commitments[0]?.id === "commitment_payment_follow_up" &&
            commitments[0].owner_identity_id === DISPUTE_IDS.decision &&
            commitments[0].status === "owned" &&
            String(commitments[0].due_at) > at &&
            commitments[0].evidence_ref ===
              `dispute-result://${String(d.hash)}/payment-follow-up`,
          "COMMITMENT_REQUIRED",
          "Payment-status follow-up needs the named current owner, future due time and exact evidence; completion/transfer is not established by this slice",
        );
        disputeActor(catalogData(s), "decision", subject, at);
        data = {
          kind: op,
          outcome_hash: c.outcome_hash,
          observation_hash: c.observation_hash,
          commitments,
          remaining_obligations: [
            "Payment status remains unknown; Morgan owns the stated follow-up.",
            "DEL-5 and wider Case obligations remain unresolved.",
          ],
        };
      } else if (op === "reject") {
        ensure(
          !last(s, e, "accept"),
          "REOPEN_REQUIRED",
          "An accepted result requires a linked reopen intervention",
        );
        data = { kind: op, reason: c.reason };
      } else {
        ensure(op === "reopen", "INVALID_INPUT", "Unknown result operation");
        const a = last(s, e, "accept"),
          v = last(s, e, "result_check");
        ensure(
          a &&
            a.hash === c.acceptance_hash &&
            v &&
            v.hash === c.observation_hash &&
            Number(v.sequence) > Number(a.sequence) &&
            o(o(v.data).comparison).status === "mismatch",
          "REOPEN_PROOF_REQUIRED",
          "Reopen requires the original acceptance and latest subsequent reliable mismatch; inconclusive evidence leaves coverage unknown",
        );
        data = { kind: op, reason: c.reason };
      }
    }
  }
  const entry = hashed({
    schema_version: "dispute-result-entry.v1",
    id,
    tenant_id: INTAKE_TENANT,
    case_id: caseId,
    record_key: key,
    sequence: entries.length + (authority ? 0 : 1),
    previous_entry_hash: entries.at(-1)?.hash ?? null,
    operation: op,
    idempotency_key: c.idempotency_key,
    command_fingerprint: sha256Json(c),
    command: c,
    context,
    actor,
    authority_position:
      (s.authorityPosition ?? s.authority.entries.length) +
      (authority?.entries.length ?? 0),
    authority_state_revision: head(s)?.revision ?? 0,
    recorded_at: at,
    versions: DISPUTE_VERSIONS,
    source_precondition: [
      "request_authority",
      "review_authority",
      "no_action",
      "accept",
    ].includes(op)
      ? observation
      : null,
    data,
  });
  assertValidDisputeResultContract("entry", entry);
  return { entry, ...(authority ? { authority } : {}) };
}
// Rebuild the exact historical input prefix. Strictly earlier canonical evidence
// may not be omitted; equal timestamps alone cannot establish cross-journal order.
function historicalState(
  s: DisputeState,
  e: Obj,
  prefix: readonly Obj[],
): DisputeState {
  const ctx = o(e.context),
    at = string(e.recorded_at),
    i = intake(s),
    a = getCase(i.cases, INTAKE_TENANT, String(e.case_id));
  ensure(a, "RESULT_INTEGRITY", "Historical Case missing");
  const count = Number(ctx.case_version);
  ensure(
    count > 0 &&
      a.journal[count - 1]?.event_hash === ctx.case_head_hash &&
      a.journal.slice(count).every((x) => x.recorded_at >= at) &&
      a.journal.slice(0, count).every((x) => x.recorded_at <= at),
    "RESULT_INTEGRITY",
    "Obsolete or future canonical Case prefix",
  );
  const subset = (
    all: readonly Obj[],
    hashes: unknown,
    clock: string,
  ): Obj[] => {
    ensure(
      Array.isArray(hashes) && new Set(hashes).size === hashes.length,
      "RESULT_INTEGRITY",
      "Duplicate historical references",
    );
    const found = all.filter((x) => hashes.includes(x.hash));
    ensure(
      found.length === hashes.length &&
        all.every((x) => String(x[clock]) >= at || hashes.includes(x.hash)) &&
        found.every((x) => String(x[clock]) <= at),
      "RESULT_INTEGRITY",
      "Historical material omitted earlier canonical inputs or includes future inputs",
    );
    return found;
  };
  const bundles = subset(i.bundles, ctx.bundle_hashes, "retained_at"),
    commits = subset(i.commits, ctx.commit_hashes, "recorded_at"),
    work = subset(s.work.entries, ctx.work_hashes, "recorded_at");
  const pos = Number(ctx.authority_position);
  ensure(
    Number.isSafeInteger(pos) &&
      pos >= 0 &&
      s.authority.entries
        .filter((x) => Number(x.position) > pos)
        .every((x) => string(x.recorded_at) >= at),
    "RESULT_INTEGRITY",
    "Obsolete authority prefix",
  );
  const catalog =
    ctx.catalog_hash === null
      ? undefined
      : s.authority.snapshots.find(
          (v) => v.hash === ctx.catalog_hash && v.kind === "catalog",
        );
  ensure(
    ctx.catalog_hash === null ||
      (catalog &&
        catalog.content.revision === ctx.authority_state_revision &&
        string(catalog.content.recorded_at) <= at),
    "RESULT_INTEGRITY",
    "Historical catalog binding invalid",
  );
  ensure(
    s.authority.snapshots
      .filter(
        (v) =>
          v.kind === "catalog" &&
          v.tenant_id === INTAKE_TENANT &&
          Number(v.content.revision) > Number(ctx.authority_state_revision),
      )
      .every((v) => string(v.content.recorded_at) >= at),
    "RESULT_INTEGRITY",
    "Obsolete catalog claimed after canonical change",
  );
  const cases = {
    ...i.cases,
    cases: [
      ...i.cases.cases.filter((x) => x !== a),
      replayCaseJournal(a.journal.slice(0, count)),
    ],
  };
  const priorTimes = [
    ...prefix.map((x) => string(x.recorded_at)),
    ...bundles.map((x) => String(x.retained_at)),
    ...commits.map((x) => string(x.recorded_at)),
    ...work.map((x) => string(x.recorded_at)),
    ...a.journal.slice(0, count).map((x) => x.recorded_at),
    string(catalog?.content.recorded_at ?? ""),
  ];
  ensure(
    at >= String(ctx.clock_floor) &&
      priorTimes.every((x) => x <= String(ctx.clock_floor)),
    "RESULT_INTEGRITY",
    "Historical clock floor regressed",
  );
  return {
    ...s,
    entries: prefix,
    work: {
      ...s.work,
      entries: work,
      pack: {
        ...s.work.pack,
        entries: [],
        discovery: {
          ...s.work.pack.discovery,
          entries: [],
          intake: {
            ...i,
            cases,
            bundles,
            commits,
            clockFloor: String(ctx.clock_floor),
          },
        },
      },
    },
    authorityPosition: pos,
    authority: {
      ...s.authority,
      entries: s.authority.entries.filter((x) => Number(x.position) <= pos),
    },
    heads: catalog
      ? [
          {
            tenant_id: INTAKE_TENANT,
            revision: Number(ctx.authority_state_revision),
            snapshot_hash: String(ctx.catalog_hash),
            last_recorded_at: String(ctx.clock_floor),
          },
        ]
      : [],
  };
}
export function assertDisputeState(s: DisputeState): void {
  const prefix: Obj[] = [];
  const keys = new Set<string>(),
    sourceVersions = new Map<number, string>();
  for (const e of orderedEvidence(s.entries)) {
    assertValidDisputeResultContract("entry", e);
    const key = `${String(e.operation)}:${String(e.idempotency_key)}`;
    ensure(!keys.has(key), "RESULT_INTEGRITY", "Duplicate result command");
    keys.add(key);
    const past = historicalState(s, e, prefix),
      ob = e.source_precondition === null ? null : o(e.source_precondition);
    for (const obs of [
      ob,
      ...(["basis_check", "result_check"].includes(String(e.operation))
        ? [o(o(e.data).observation)]
        : []),
    ])
      if (obs) {
        ensure(
          String(obs.started_at) <= String(obs.observed_at) &&
            String(obs.observed_at) <= String(obs.recorded_at) &&
            obs.recorded_at === e.recorded_at,
          "RESULT_INTEGRITY",
          "Observation clock/order drift",
        );
        for (const value of [o(obs.read), o(obs.recheck)]) {
          const reconstructed =
            value.status === "unavailable"
              ? unavailableDisputeRead()
              : rawDisputeRead(
                  Buffer.from(String(value.bytes_base64), "base64"),
                );
          ensure(
            same(reconstructed, value),
            "RESULT_INTEGRITY",
            "Observation bytes or source parser drift",
          );
          if (
            value.status === "read" &&
            (obs === ob || o(o(e.data).comparison).status === "match")
          ) {
            const source = o(value.source),
              rev = Number(source.revision),
              hash = sha256Json(source),
              known = sourceVersions.get(rev);
            ensure(
              known === undefined || known === hash,
              "RESULT_INTEGRITY",
              "One immutable source revision has contradictory facts",
            );
            sourceVersions.set(rev, hash);
          }
        }
      }
    const observed = ["basis_check", "result_check"].includes(
      String(e.operation),
    )
      ? o(o(e.data).observation)
      : ob;
    if (e.operation === "enroll") {
      const snap = s.authority.snapshots.find(
        (v) => v.hash === o(e.data).catalog_hash,
      );
      const previous = head(past);
      ensure(
        snap &&
          snap.content.recorded_at === e.recorded_at &&
          snap.content.revision === (previous?.revision ?? 0) + 1 &&
          snap.content.previous_catalog_hash ===
            (previous?.snapshot_hash ?? null) &&
          same(
            snap.content.data,
            disputeCatalog(
              o(o(e.data).subject),
              previous ? catalogData(past) : undefined,
            ),
          ),
        "RESULT_INTEGRITY",
        "Enrollment profile or source-purpose binding drift",
      );
    }
    const generated = applyDisputeCommand(
      past,
      o(e.command),
      string(e.recorded_at),
      observed,
      e.operation === "enroll" ? String(o(e.data).catalog_hash) : null,
    );
    ensure(
      same(generated.entry, e),
      "RESULT_INTEGRITY",
      "Result entry differs from deterministic replay",
    );
    if (generated.authority)
      for (const snap of generated.authority.state.snapshots)
        ensure(
          s.authority.snapshots.some((x) => same(x, snap)),
          "RESULT_INTEGRITY",
          "Authority snapshot differs from result replay",
        );
    if (generated.authority)
      for (const a of generated.authority.entries)
        ensure(
          s.authority.entries.some((x) => same(x, a)),
          "RESULT_INTEGRITY",
          "Authority entry does not match its result command",
        );
    prefix.push(e);
  }
  for (const a of s.authority.entries.filter(
    (x) => x.schema_version === "authority-request-journal-entry.dispute.v1",
  ))
    ensure(
      s.entries.some(
        (e) =>
          ["request_authority", "review_authority"].includes(
            String(e.operation),
          ) &&
          (o(e.data).authority_entry_hashes as unknown[]).includes(
            a.event_hash,
          ),
      ),
      "RESULT_INTEGRITY",
      "Dispute authority material lacks canonical result provenance",
    );
}
export function readDispute(
  s: DisputeState,
  caseId: string,
  key: string,
  at: string,
): Obj {
  const binding = disputeBinding(s, caseId, key),
    subject = disputeSubject(s, caseId, key),
    history = s.entries.filter(
      (e) => e.case_id === caseId && e.record_key === key,
    ),
    e = history.filter((x) => x.operation === "candidate").at(-1);
  let basis: Obj | null = null,
    authority: Obj | null = null,
    outcome: Obj | null = null,
    verified = false,
    accepted = false,
    status = "not_enrolled",
    responsible = "Synthetic operator",
    next = "Explicitly enroll this exact imported dispute",
    blockers: string[] = [],
    measure: number | null = null;
  const obligations = [
    "Payment status remains unknown; no cash or credit is inferred.",
    "DEL-5 and wider Case obligations remain unresolved; Case closure is denied.",
  ];
  if (history.some((x) => x.operation === "enroll")) {
    status = "enrolled";
    next = "Create an exact business-result candidate";
  }
  if (e) {
    const v = last(s, e, "result_check"),
      a = last(s, e, "accept"),
      d = last(s, e, "no_action"),
      reopened = last(s, e, "reopen"),
      rejected = last(s, e, "reject");
    status = "basis_needed";
    next =
      "Check original delivery proof, allocation, governing terms and complete grounds";
    responsible = "Independent synthetic verifier";
    try {
      basis = currentBasis(s, e, at);
    } catch (error) {
      blockers.push(
        error instanceof Error ? error.message : "Basis unavailable",
      );
    }
    authority = requestPacket(s, e, at);
    if (basis) {
      status = "basis_checked";
      next = "Request exact business authority";
      responsible = "Synthetic operator";
    }
    if (authority) {
      status = o(authority.current).authorized
        ? "authorized"
        : "authority_needed";
      next = o(authority.current).authorized
        ? "Record the justified no-financial-action decision"
        : "Morgan must review the exact consequence";
      responsible = "Morgan — synthetic North AR decision owner";
      if (o(authority.current).lifecycle !== "open") {
        status = String(o(authority.current).lifecycle);
        next = "Create a fresh candidate; prior approval does not transfer";
      }
    }
    if (d) {
      status = "no_action_recorded";
      next =
        "Report the outside-runtime disposition, then independently check its source";
      responsible = "Synthetic disposition reporter";
    }
    if (last(s, e, "report")) {
      status = "reported_not_verified";
      next = "Independently check the synthetic AR disposition";
      responsible = "Independent synthetic verifier";
    }
    if (v) {
      const comparison = o(o(v.data).comparison);
      status =
        String(comparison.status) === "match"
          ? "source_checked"
          : String(comparison.status);
      blockers = [...(comparison.reasons as string[])];
      const bound = d ? o(o(d.data).basis) : null,
        ctx = disputeContext(s, caseId);
      const applicable =
        bound &&
        bound.case_version === ctx.case_version &&
        bound.catalog_hash === ctx.catalog_hash &&
        same(bound.business_bundle_hashes, ctx.bundle_hashes) &&
        same(bound.business_commit_hashes, ctx.commit_hashes);
      verified = comparison.status === "match" && fresh(v, at) && !!applicable;
      if (comparison.status === "match" && !verified) {
        status = "stale";
        blockers.push(
          "Checked history is stale or expired; obtain a fresh check/current basis",
        );
      }
      outcome = verified ? o(o(v.data).outcome) : null;
      accepted = verified && !!a && o(a.data).observation_hash === v.hash;
      if (accepted) {
        try {
          disputeActor(catalogData(s), "recipient", subject, at);
        } catch {
          accepted = false;
          blockers.push(
            "Current recipient eligibility is unavailable; historical acceptance remains recorded",
          );
        }
      }
      const consentCurrent =
        authority !== null &&
        o(authority.current).lifecycle === "open" &&
        o(authority.current).authorized === true;
      if (accepted && !consentCurrent) {
        accepted = false;
        blockers.push(
          "Authority is no longer current; historical acceptance grants no new permission",
        );
      }
      if (accepted) {
        status = "accepted_synthetic_disposition";
        measure = 1;
        next =
          "Follow the owned payment-status commitment; DEL-5 and the Case remain unresolved";
        responsible = "Morgan — payment-status follow-up";
      } else {
        next = verified
          ? "Robin must separately accept this exact result and its remaining commitments"
          : "Inspect the observed problem; obtain corrected evidence or an explicit fresh check";
        responsible = verified
          ? "Robin — synthetic dispute recipient"
          : "Independent verifier and named business owner";
      }
      if (verified && !consentCurrent) {
        next =
          "Inspect the historical checked result; fresh business consent requires a current candidate and authority";
        responsible = "Synthetic operator and named business owner";
      }
      if (a && comparison.status === "mismatch") measure = 0;
    }
    if (rejected || reopened) {
      accepted = false;
      verified = false;
      outcome = null;
      status = reopened ? "reopened" : "rejected";
      next =
        "Preserve this history and create a fresh candidate with new evidence/review";
      responsible = "Synthetic operator and named business owner";
      if (reopened) measure = 0;
    }
  }
  const result = {
    schema_version: "dispute-result-read.v1",
    simulation: true,
    binding,
    evaluated_at: at,
    subject,
    history,
    candidate_hash: e?.hash ?? null,
    basis,
    authority,
    current: {
      status,
      verified,
      accepted,
      blockers,
      responsible_role: responsible,
      next_action: next,
      remaining_obligations: obligations,
      closure_permitted: false,
      financial_write_permitted: false,
    },
    outcome,
    proof_measures: {
      cash_collected: null,
      disputes_resolved: measure,
      credits_issued: null,
      work_newly_attended_to: null,
      human_attention_released: null,
    },
  };
  assertValidDisputeResultContract("read", result);
  return result;
}
export function exportDispute(s: DisputeState): Obj {
  const e = hashed({
    schema_version: "dispute-result-export.v1",
    work: exportWorkState(s.work),
    authority: {
      entries: s.authority.entries.filter((e) => e.tenant_id === INTAKE_TENANT),
      snapshots: s.authority.snapshots.filter(
        (e) => e.tenant_id === INTAKE_TENANT,
      ),
    },
    catalog_heads: s.heads.filter((h) => h.tenant_id === INTAKE_TENANT),
    entries: s.entries.filter((e) => !isAuthority(e)),
  });
  assertValidDisputeResultContract("export", e);
  return e;
}
export function validateDisputeExport(value: unknown): DisputeState {
  assertValidDisputeResultContract("export", value);
  const { hash, ...body } = value;
  ensure(hash === sha256Json(body), "RESULT_INTEGRITY", "Export hash drift");
  ensure(
    list(value.entries).every((e) => !isAuthority(e)),
    "RESULT_INTEGRITY",
    "Authority receipts belong only in the D6 journal, not O",
  );
  const s = withDisputeAuthority({
    work: validateWorkExport(value.work),
    authority: value.authority as AuthorityState,
    heads: value.catalog_heads as readonly AuthorityCatalogHead[],
    entries: list(value.entries),
  });
  ensure(
    s.authority.entries.every((e) => e.tenant_id === INTAKE_TENANT) &&
      s.authority.snapshots.every((e) => e.tenant_id === INTAKE_TENANT) &&
      s.heads.every((e) => e.tenant_id === INTAKE_TENANT),
    "RESULT_INTEGRITY",
    "Export contains another tenant's authority data",
  );
  const seen = new Set<string>();
  for (const snap of s.authority.snapshots) {
    ensure(
      !seen.has(snap.hash) &&
        same(reviewSnapshot(snap.kind, snap.content), snap),
      "RESULT_INTEGRITY",
      "Authority snapshot hash/shape drift",
    );
    seen.add(snap.hash);
  }
  for (const h of s.heads) {
    const catalogs = s.authority.snapshots
      .filter((x) => x.kind === "catalog")
      .sort((a, b) => Number(a.content.revision) - Number(b.content.revision));
    let prior: string | null = null;
    for (const [i, catalog] of catalogs.entries()) {
      ensure(
        catalog.content.revision === i + 1 &&
          catalog.content.previous_catalog_hash === prior &&
          same(
            normalizeAuthorityCatalogData(catalog.content.data, INTAKE_TENANT),
            catalog.content.data,
          ),
        "RESULT_INTEGRITY",
        "Catalog history drift",
      );
      prior = catalog.hash;
    }
    ensure(
      catalogs.length === h.revision && prior === h.snapshot_hash,
      "RESULT_INTEGRITY",
      "Catalog head drift",
    );
    const clock = [
      ...s.entries.map((e) => string(e.recorded_at)),
      ...s.authority.entries.map((e) => string(e.recorded_at)),
      ...catalogs.map((e) => string(e.content.recorded_at)),
    ]
      .sort()
      .at(-1);
    ensure(
      clock === h.last_recorded_at,
      "RESULT_INTEGRITY",
      "Export clock guard drift",
    );
  }
  assertDisputeState(s);
  return s;
}
