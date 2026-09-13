import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { intakeHost } from "./intake-postgres.mjs";
import { intakeInput, editQueue } from "./intake.mjs";
import {
  createSyntheticDisputeRuntime,
  normalizeSyntheticDisputeProfile,
  sha256Json,
  canonicalJson,
} from "../../dist/packages/runtime/src/index.js";
export const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/synthetic-dispute/case-lab.v1.json", import.meta.url),
    "utf8",
  ),
);
export const AT = "2026-09-07T16:06:00.000Z";
export async function labInput(release = 3) {
  const input = editQueue(
    await intakeInput(`case-lab-release-${release}`),
    (rows, headers) => ({
      headers,
      rows: [
        {
          ...rows[0],
          source_record_id: fixture.subject.dispute_id,
          customer_ref: fixture.subject.customer,
          invoice_id: fixture.subject.invoice_id,
          amount_minor: String(fixture.subject.amount_minor),
          order_ids: fixture.subject.order_id,
          delivery_ids: fixture.subject.delivery_id,
          upstream_case_id: "CL-CASE-400",
          upstream_owner: "Synthetic Case Lab owner",
        },
      ],
    }),
  );
  input.artifacts = input.artifacts.slice(0, 1);
  for (const e of fixture.evidence.filter((e) => e.release <= release))
    input.artifacts.push({
      role: "support",
      document_id: e.document_id,
      name: e.document_id + ".txt",
      media_type: "text/plain",
      bytes_base64: Buffer.from(e.text).toString("base64"),
      declared_hash: null,
      associations: [
        {
          entity: "entity_north",
          kind: "record",
          id: fixture.subject.dispute_id,
        },
      ],
    });
  return input;
}
export function labProfile(caseId, recordKey, bundle) {
  const roles = Object.fromEntries(
    [
      "operator",
      "decision",
      "reporter",
      "verifier",
      "recipient",
      "evaluator",
    ].map((role) => [
      role,
      {
        schema_version: "identity-reference.v0",
        identity_id: `identity_case_lab_${role}`,
        tenant_id: "tenant_intake_demo",
        identity_kind: ["verifier", "evaluator"].includes(role)
          ? "service"
          : "human",
        status: "active",
      },
    ]),
  );
  const policy = {
    schema_version: "authority-policy.v0",
    policy_id: "policy_case_lab_no_adjustment",
    policy_version: "1.0.0",
    tenant_id: "tenant_intake_demo",
    authority_class: "invoice_dispute_no_adjustment",
    action_class: "uphold_invoice_no_adjustment",
    consequence_class: "invoice_dispute_no_adjustment",
    status: "approved",
    authority_rank: 1,
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_from_source_timezone: "UTC",
    effective_until: "2027-01-01T00:00:00.000Z",
    effective_until_source_timezone: "UTC",
    source_ref: "synthetic://case-lab/policy/arrival/1",
    rules: [
      {
        rule_id: "rule_case_lab_arrival",
        priority: 1,
        condition: {
          currency: "USD",
          minimum_amount_minor: 40000,
          maximum_amount_minor: 40000,
        },
        requirements: [
          {
            requirement_id: "requirement_case_lab_decision",
            authority_class: "invoice_dispute_no_adjustment",
            required_approval_count: 1,
            allow_delegation: false,
            allow_preparer_approval: false,
            named_approver_identity_ids: [roles.decision.identity_id],
          },
        ],
      },
    ],
  };
  const record = bundle.records.find((r) => r.record_key === recordKey);
  return normalizeSyntheticDisputeProfile({
    schema_version: "synthetic-dispute-profile.v1",
    profile_id: "case_lab_arrival_no_adjustment",
    profile_version: "1.0.0",
    subject: {
      tenant_id: "tenant_intake_demo",
      case_id: caseId,
      record_key: recordKey,
      ...fixture.subject,
    },
    scope_ids: ["scope_entity_north"],
    evidence_refs: bundle.artifacts.map((a) => ({
      bundle_hash: bundle.hash,
      artifact_hash: a.byte_hash,
      document_id: a.document_id,
      locator: a.role === "queue" ? record.locators[0] : a.derived_from,
    })),
    policy,
    policy_content_hash: sha256Json(policy),
    disposition: "uphold_invoice_no_adjustment",
    roles,
    source: {
      profile_id: "case_lab_result_source_v1",
      object_id: "CL-DEDUCTION-400",
      proof_object_id: "CL-ARRIVAL-PROOF-1",
      terms_object_id: "CL-TERMS-1",
      clause_id: "CL-ARRIVAL-v1",
      governing_term: fixture.governing_term,
      governing_evidence_hash:
        "sha256:" +
        createHash("sha256")
          .update(fixture.governing_term + "\n")
          .digest("hex"),
      ground: fixture.ground,
    },
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_until: "2027-01-01T00:00:00.000Z",
  });
}
export function labSource(profile) {
  const subject = fixture.subject;
  return {
    schema_version: "synthetic-dispute-source.v2",
    profile_id: profile.source.profile_id,
    revision: 0,
    pod: {
      object_id: profile.source.proof_object_id,
      version: 0,
      subject,
      evidence_refs: profile.evidence_refs,
      valid: true,
      rescinded: false,
    },
    terms: {
      object_id: profile.source.terms_object_id,
      version: 0,
      subject,
      clause_id: profile.source.clause_id,
      clause: profile.source.governing_term,
      effective_from: profile.effective_from,
      effective_until: profile.effective_until,
      valid: true,
    },
    ar: {
      object_id: profile.source.object_id,
      version: 0,
      subject,
      status: "open",
      grounds_complete: true,
      active_grounds: [fixture.ground],
      disposed_grounds: [],
      adjustment_minor: 0,
      credit_ids: [],
      decision_reference: null,
      prior_version: null,
      prior_hash: null,
      payment_status: "unknown",
      event_at: "2026-09-07T16:00:00.000Z",
      source_timezone: "UTC",
    },
  };
}
export const roleFor = (op) =>
  op.includes("check")
    ? "verifier"
    : ["review_authority", "no_action"].includes(op)
      ? "decision"
      : op === "report"
        ? "reporter"
        : ["accept", "reject", "reopen"].includes(op)
          ? "recipient"
          : "operator";
export async function syntheticHost(t, { release = 3, host, at = AT } = {}) {
  const h = host ?? (await intakeHost(t, { work: true }));
  if (host) h.setTime(at);
  const bundle = await h.prepare(await labInput(release)),
    receipt = (await h.ok("/v1/intake/commits", await h.selection(bundle, 0)))
      .receipt;
  h.setTime(at);
  const profile = labProfile(
    receipt.case_id,
    receipt.record_key,
    bundle.bundle,
  );
  let source = labSource(profile),
    time = at,
    actor = profile.roles.operator.identity_id,
    reads = 0,
    reader = async () => {
      reads++;
      return Buffer.from(canonicalJson(source));
    };
  const options = (p = profile) => ({
    pool: h.pool,
    profile: p,
    source: { profileId: p.source.profile_id, read: () => reader() },
    actorIdentityId: () => actor,
    now: () => new Date(time),
  });
  let runtime = createSyntheticDisputeRuntime(options());
  let sequence = 0;
  const commands = [],
    receipts = [];
  const get = () => runtime.read();
  const command = async (op, extra = {}, key) => ({
    schema_version: "dispute-result-command.v2",
    operation: op,
    binding: (await get()).binding,
    idempotency_key: key ?? `lab-${op}-${++sequence}`,
    ...extra,
  });
  const submit = async (c) => {
    actor = profile.roles[roleFor(c.operation)].identity_id;
    const r = await (c.operation === "enroll"
      ? runtime.enroll(c)
      : runtime.submit(c));
    commands.push(c);
    receipts.push(r);
    return r;
  };
  const send = async (op, extra = {}, key) =>
    submit(await command(op, extra, key));
  const review = (v) => ({
    authority_request_id: v.authority.authority_request_id,
    request_binding_hash: v.authority.request_binding_hash,
    expected_review_revision: v.authority.review_revision,
  });
  const enroll = () => send("enroll"),
    candidate = () => send("candidate"),
    basis = async () =>
      send("basis_check", { candidate_hash: (await get()).candidate_hash });
  const request = async () => {
    const v = await get();
    return send("request_authority", {
      candidate_hash: v.candidate_hash,
      basis_observation_hash: v.basis.basis_observation_hash,
    });
  };
  const decide = async (decision = "approve") => {
    const v = await get();
    return send("review_authority", {
      candidate_hash: v.candidate_hash,
      review: review(v),
      decision,
      reason:
        "Named owner reviewed the fixed synthetic arrival policy and retained evidence",
    });
  };
  const noAction = async () => {
    const v = await get();
    return send("no_action", {
      candidate_hash: v.candidate_hash,
      review: review(v),
      basis_hash: sha256Json(v.authority.material.basis),
    });
  };
  const authorized = async () => {
    await enroll();
    await candidate();
    const b = await basis();
    assert.equal(
      b.entry.data.comparison.status,
      "match",
      JSON.stringify(b.entry.data.comparison),
    );
    await request();
    await decide();
    return noAction();
  };
  const report = async () => {
    const v = await get(),
      d = v.history.findLast((e) => e.operation === "no_action");
    return send("report", {
      candidate_hash: v.candidate_hash,
      decision_hash: d.hash,
      claim: {
        source_id: source.ar.object_id,
        source_version: source.ar.version + 1,
        occurred_at: time,
        source_timezone: "UTC",
        evidence_ref: "synthetic://case-lab/reported-disposition",
      },
      reason:
        "Reporter claims the outside-runtime deduction was withdrawn; source observation is separate",
    });
  };
  const transition = async () => {
    const d = (await get()).history.findLast(
        (e) => e.operation === "no_action",
      ),
      prior = structuredClone(source.ar);
    source = {
      ...source,
      revision: source.revision + 1,
      ar: {
        ...prior,
        version: prior.version + 1,
        status: fixture.expected_external_result,
        active_grounds: [],
        disposed_grounds: [fixture.ground],
        decision_reference: d.hash,
        prior_version: prior.version,
        prior_hash: sha256Json(prior),
        event_at: time,
      },
    };
  };
  const check = async () => {
    const v = await get(),
      d = v.history.findLast((e) => e.operation === "no_action");
    return send("result_check", {
      candidate_hash: v.candidate_hash,
      decision_hash: d.hash,
    });
  };
  const acceptance = async () => {
    const v = await get(),
      d = v.history.findLast((e) => e.operation === "no_action"),
      r = v.history.findLast((e) => e.operation === "result_check");
    return command("accept", {
      candidate_hash: v.candidate_hash,
      decision_hash: d.hash,
      observation_hash: r.hash,
      outcome_hash: sha256Json(r.data.outcome),
      reason:
        "Separate recipient accepts this exact synthetic disposition only",
      commitments: [
        {
          id: "commitment_payment_follow_up",
          description: "Confirm remaining payment status",
          owner_identity_id: profile.roles.decision.identity_id,
          due_at: "2026-09-08T16:06:00.000Z",
          status: "owned",
          evidence_ref: `dispute-result://${d.hash}/payment-follow-up`,
        },
      ],
    });
  };
  return {
    h,
    profile,
    options,
    receipt,
    bundle,
    get,
    command,
    submit,
    send,
    enroll,
    candidate,
    basis,
    request,
    decide,
    noAction,
    authorized,
    report,
    transition,
    check,
    acceptance,
    accept: async () => submit(await acceptance()),
    commands,
    receipts,
    get runtime() {
      return runtime;
    },
    get reads() {
      return reads;
    },
    get source() {
      return structuredClone(source);
    },
    setSource: (v) => {
      source = structuredClone(v);
    },
    setReader: (f) => {
      reader = f;
    },
    setActor: (id) => {
      actor = id;
    },
    setTime: (at) => {
      time = at;
    },
    restart: async () => {
      await h.restart();
      runtime = createSyntheticDisputeRuntime(options());
    },
  };
}
