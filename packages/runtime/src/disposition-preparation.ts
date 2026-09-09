// Fixed, deterministic preparation port. No database, clock, filesystem, network,
// IDs or command gateway. The parent independently reconstructs this exact result.
import { sha256Json, immutableJson } from "../../contracts/src/index.js";
import {
  intakeObject as o,
  intakeList as l,
  type IntakeObject as Obj,
} from "./intake.js";
import { WORK_MEASURES } from "./preparation-worker-profile.js";
const strings = (v: unknown): string[] => v as string[];
const unique = (v: string[]): string[] => [...new Set(v)].sort();
const refs = (values: readonly Obj[]): string[] =>
  unique(values.flatMap((v) => strings(v.citation_ids)));
export function prepareDisposition(input: Obj): Obj {
  const b = o(input.binding),
    a = o(input.artifact),
    m = o(a.material),
    record = o(input.selected_record),
    cells = o(record.cells),
    key = String(record.record_key),
    entity = String(record.entity),
    id = String(record.source_record_id);
  const claims = l(m.source_claims).filter(
    (c) => c.applicable_record_key === key && o(c.subject).entity === entity,
  );
  const rows = refs(claims.filter((c) => c.meaning === "parsed_source_value"));
  const subject = (kind: string, subjectId: string): Obj => ({
    entity_id: entity,
    kind,
    id: subjectId,
    applicable_record_key: key,
  });
  const recordSubject = subject("record", id);
  const deliveries = unique(
    l(record.business_objects)
      .filter((x) => x.kind === "delivery")
      .map((x) => String(x.id)),
  );
  const checklist: Obj[] = deliveries.map((delivery) => {
    const applicable = claims.filter(
        (c) => o(c.subject).kind === "delivery" && o(c.subject).id === delivery,
      ),
      yes = applicable.some((c) => c.meaning === "source_reports_confirmation"),
      no = applicable.some((c) => c.meaning === "source_reports_missing");
    const status =
      yes && no
        ? "conflicting"
        : yes
          ? "reported_confirmation"
          : no
            ? "reported_gap"
            : "not_supplied";
    const finding =
      yes && no
        ? "Associated sources disagree about supplied confirmation for this delivery."
        : yes
          ? "An associated source reports supplied confirmation; underlying proof remains independently unverified."
          : no
            ? "An associated source reports confirmation is not supplied. This does not prove non-delivery."
            : "No explicitly associated claim establishes confirmation for this delivery in the retained inputs. This does not prove non-delivery.";
    return {
      subject: subject("delivery", delivery),
      finding,
      evidence_type: applicable.length
        ? "source_report"
        : "bounded_input_limit",
      status,
      citation_ids: applicable.length ? refs(applicable) : rows,
      independently_verified: false,
    };
  });
  const ambiguous = claims.filter((c) =>
    ["ambiguous_excerpt", "retained_only"].includes(String(c.meaning)),
  );
  if (ambiguous.length)
    checklist.push({
      subject: recordSubject,
      finding:
        "Associated material is ambiguous or retained only. Applicability and content needing interpretation remain unconfirmed.",
      evidence_type: "bounded_input_limit",
      status: "ambiguous",
      citation_ids: refs(ambiguous),
      independently_verified: false,
    });
  if (!deliveries.length)
    checklist.push({
      subject: recordSubject,
      finding:
        "No delivery identity is supplied for this record; clarify the scoped subject before requesting proof.",
      evidence_type: "bounded_input_limit",
      status: "unknown",
      citation_ids: rows,
      independently_verified: false,
    });
  checklist.push(
    {
      subject: recordSubject,
      finding: cells.upstream_owner
        ? `The queue reports ${cells.upstream_owner as string} as upstream owner; accountable evidence and business acceptance owners remain unconfirmed.`
        : "No upstream owner is reported; accountable evidence and business acceptance owners remain unconfirmed.",
      evidence_type: "source_report_with_limit",
      status: "owner_unconfirmed",
      citation_ids: refs(
        claims.filter((c) => String(c.field).endsWith(".upstream_owner")),
      ),
      independently_verified: false,
    },
    {
      subject: recordSubject,
      finding:
        "Governing terms and a disposition rule are not established by this preparation template.",
      evidence_type: "bounded_input_limit",
      status: "unknown",
      citation_ids: [],
      independently_verified: false,
    },
  );
  const groups = new Map<string, Obj[]>();
  for (const c of claims.filter((c) => c.meaning === "parsed_source_value")) {
    const group = String(c.field);
    groups.set(group, [...(groups.get(group) ?? []), c]);
  }
  const reconciliation = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([field, values]) => ({
      subject: recordSubject,
      field,
      values: unique(values.map((c) => String(c.value))),
      conflicting: new Set(values.map((c) => String(c.value))).size > 1,
      citation_ids: refs(values),
    }));
  const requests: Obj[] = checklist
    .filter((c) => o(c.subject).kind === "delivery")
    .map((c) => {
      const delivery = String(o(c.subject).id),
        scope = `${entity}/${id}/${delivery}`;
      let text =
        c.status === "conflicting"
          ? `Please reconcile the opposing ${delivery} confirmation reports and identify the governing original evidence.`
          : c.status === "reported_confirmation"
            ? `Please identify the original ${delivery} confirmation, its evidence owner and the permitted inspection route.`
            : `Please provide ${delivery} confirmation or identify the evidence owner.`;
      if (
        ["disposition-code.v2", "disposition-code.v3"].includes(
          String(b.worker_implementation_id),
        ) &&
        !["conflicting", "reported_confirmation"].includes(String(c.status))
      )
        text = `Please identify who can supply ${delivery} confirmation and the permitted retrieval route; this request assigns no owner.`;
      return {
        id: sha256Json({ scope, prerequisite: "delivery_confirmation" }),
        subject: scope,
        text,
        citation_ids: c.citation_ids,
        basis: "proposed evidence request",
      };
    });
  if (!deliveries.length || ambiguous.length)
    requests.push({
      id: sha256Json({ key, prerequisite: "clarify_applicability" }),
      subject: `${entity}/${id}`,
      text: "Please clarify the delivery identities and applicability of ambiguous or retained-only support; no content interpretation is assumed.",
      citation_ids: ambiguous.length ? refs(ambiguous) : rows,
      basis: "proposed evidence request",
    });
  requests.push({
    id: sha256Json({ key, prerequisite: "terms_and_owner" }),
    subject: `${entity}/${id}`,
    text: "Please identify the governing terms and the person accountable for reviewing a disposition.",
    citation_ids: [],
    basis: "proposed evidence request",
  });
  const related = l(input.covered_records)
    .filter((r) => r.valid && r.record_key !== key)
    .map((r) => ({
      record_key: r.record_key,
      entity_id: r.entity,
      record_id: r.source_record_id,
      disputed_amount_minor: Number(o(r.cells).amount_minor),
      currency: o(r.cells).currency,
      delivery_ids: unique(
        l(r.business_objects)
          .filter((x) => x.kind === "delivery")
          .map((x) => String(x.id)),
      ),
      applicable_to_selected_record: false,
      citation_ids: refs(
        l(o(a.coverage).members).filter((x) => x.record_key === r.record_key),
      ),
    }))
    .sort((a, b) => String(a.record_key).localeCompare(String(b.record_key)));
  const materialRefs = refs(checklist),
    coverageRefs = refs(l(o(a.coverage).members));
  const hasGap = checklist.some((c) =>
    ["reported_gap", "not_supplied", "conflicting", "ambiguous"].includes(
      String(c.status),
    ),
  );
  return immutableJson({
    schema_version:
      input.schema_version === "preparation-worker-input.v2"
        ? "disposition-preparation-result.v2"
        : "disposition-preparation-result.v1",
    invocation_id: input.invocation_id,
    started_entry_hash: input.started_entry_hash,
    binding_hash: sha256Json(b),
    outcome: "prepared_gap_packet",
    title: `${String(cells.customer_ref)} / ${id} — evidence request ready for task review`,
    subject: {
      entity_id: entity,
      record_id: id,
      record_key: key,
      customer: cells.customer_ref,
      invoice: cells.invoice_id,
      disputed_amount_minor: Number(cells.amount_minor),
      currency: cells.currency,
      citation_ids: rows,
    },
    coverage: {
      distinct_upload_records: o(o(a.coverage).coverage).distinct_records,
      record_keys: unique(
        l(o(a.coverage).members)
          .map((c) => String(c.record_key))
          .filter((k) => k !== "null"),
      ),
      citation_ids: coverageRefs,
      recurring_population: "unknown",
    },
    steps: [
      {
        id: "S1",
        result:
          "Indexed the selected record, explicitly associated claims and separately bound upload coverage.",
        citation_ids: unique([...rows, ...materialRefs, ...coverageRefs]),
        confirmation_entry_hash: null,
      },
      {
        id: "S2",
        result:
          "Compared only scoped subjects; retained competing reports and assembled distinct evidence questions. Related records remain context.",
        citation_ids: materialRefs,
        confirmation_entry_hash: null,
      },
      {
        id: "S3",
        result:
          "Reused the applicable descriptive confirmation. No new human decision was manufactured.",
        citation_ids: [],
        confirmation_entry_hash: o(b.basis).confirmation_entry_hash,
      },
      {
        id: "S4",
        result:
          "Assembled this cited checklist, reconciliation and unsent follow-up; abstained from a business disposition.",
        citation_ids: materialRefs,
        confirmation_entry_hash: null,
      },
    ],
    evidence_checklist: checklist,
    reconciliation,
    related_context: related,
    follow_up: {
      sent: false,
      draft_citation_ids: unique([
        ...rows,
        ...requests.flatMap((q) => strings(q.citation_ids)),
      ]),
      recipients: [
        {
          role: "delivery evidence owner",
          identity_id: null,
          status: "unconfirmed",
        },
        {
          role: "governing terms owner",
          identity_id: null,
          status: "unconfirmed",
        },
      ],
      requests,
      draft: `For ${entity}/${id} (${String(cells.customer_ref)}, ${String(cells.invoice_id)}): ${requests.map((q) => String(q.text)).join(" ")} Source reports are not independent verification; missing confirmation does not establish non-delivery or justify a credit. No recipient or due date is assigned.`,
    },
    disposition: {
      status: "abstain_pending_evidence",
      recommended_credit_minor: null,
      available_preparation:
        "Collect scoped evidence and governing terms for human review.",
      blocked_business_options: ["Choose payment, settlement or credit"],
      missing: [
        "underlying proof",
        "governing rule",
        "accountable business owner",
        "separate financial authority",
      ],
      independent_business_verification: false,
    },
    intervention: {
      primary_reason: hasGap ? "MISSING_EVIDENCE" : "MISSING_KNOWLEDGE",
      citation_ids: hasGap ? materialRefs : [],
      step_id: "S2",
      other_blockers: [
        {
          reason: "MISSING_KNOWLEDGE",
          basis: "Governing disposition rule is unconfirmed",
        },
        { reason: "AUTHORITY", basis: "Template permits no financial action" },
      ],
      task_recipient_identity: "identity_intake_operator",
      business_owner_identity: null,
    },
    proof_readiness: WORK_MEASURES.map((measure) => ({
      measure,
      status: "unknown",
      value: null,
      basis:
        "No qualifying customer outcome, prior-coverage or comparable-effort evidence is established by synthetic preparation.",
    })),
    execution_facts: {
      model_calls: 0,
      external_tool_calls: 0,
      messages_sent: 0,
    },
    cost_evidence: {
      model_tool_amount: null,
      infrastructure_amount: null,
      human_amount: null,
      support_amount: null,
      setup_amount: null,
      status: "unmeasured",
    },
    financial_authority: false,
    case_closure_permission: false,
  });
}
