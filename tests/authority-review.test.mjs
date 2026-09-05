import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAuthority,
  resolveReviewerEligibility,
} from "../dist/packages/domain/src/authority-resolution.js";
import * as runtime from "../dist/packages/runtime/src/index.js";
import {
  assertValidAuthorityReviewContract,
  assertValidAuthorityRequest,
  assertValidAuthorityDecision,
  requestV1ToV0,
  decisionV1ToV0,
  sha256Json,
} from "../dist/packages/contracts/src/index.js";
import {
  allowEitherFinanceReviewer,
  restrictFinanceDelegate,
  caseCommand,
  createRequestCommand,
  decideCommand,
  workEvent,
  START,
  TENANT,
} from "./helpers/authority-review.mjs";

function harness({ decisionPrefix = "decision" } = {}) {
  let counter = 0,
    now = new Date(START);
  const dependencies = {
    now: () => now,
    nextId: (kind) =>
      `${kind === "decision" ? decisionPrefix : kind}_${++counter}`,
  };
  let cases = runtime.executeCaseCommand(
    runtime.emptyCaseEngine(),
    caseCommand(),
    dependencies,
  ).state;
  const catalog = runtime.reviewSnapshot("catalog", {
    schema_version: "authority-catalog.v1",
    tenant_id: TENANT,
    revision: 1,
    previous_catalog_hash: null,
    after_review_position: 0,
    recorded_at: START,
    data: runtime.normalizeAuthorityCatalogData(
      runtime.syntheticAuthorityCatalog(),
      TENANT,
    ),
  });
  let state = { entries: [], snapshots: [catalog] };
  let head = {
    tenant_id: TENANT,
    revision: 1,
    snapshot_hash: catalog.hash,
    last_recorded_at: START,
  };
  const api = {
    get state() {
      return state;
    },
    get cases() {
      return cases;
    },
    get head() {
      return head;
    },
    get now() {
      return now;
    },
    get counter() {
      return counter;
    },
    advance(ms) {
      now = new Date(now.valueOf() + ms);
    },
    verify(candidate = state) {
      runtime.assertAuthorityStateIntegrity(candidate, cases, [head]);
    },
    command(command, actor = "operator") {
      api.verify();
      const result = runtime.executeAuthorityCommand(
        state,
        cases,
        head,
        command,
        actor,
        dependencies,
      );
      state = result.state;
      if (result.status === "applied")
        head = { ...head, last_recorded_at: now.toISOString() };
      api.verify();
      return result;
    },
    read(id) {
      api.verify();
      return runtime.readAuthorityRequest(state, cases, head, id, now);
    },
    create(overrides = {}) {
      return api.command(createRequestCommand(undefined, undefined, overrides));
    },
    decide(id, seat, decision = "approve", overrides = {}) {
      return api.command(
        decideCommand(api.read(id), `${seat}:${counter}`, decision, overrides),
        seat,
      );
    },
    caseCommand(command) {
      const result = runtime.executeCaseCommand(cases, command, dependencies);
      cases = result.state;
      return result;
    },
    catalog(change) {
      const data = structuredClone(
        state.snapshots.find((item) => item.hash === head.snapshot_hash).content
          .data,
      );
      change(data);
      const next = runtime.reviewSnapshot("catalog", {
        schema_version: "authority-catalog.v1",
        tenant_id: TENANT,
        revision: head.revision + 1,
        previous_catalog_hash: head.snapshot_hash,
        after_review_position: state.entries.length,
        recorded_at: now.toISOString(),
        data: runtime.normalizeAuthorityCatalogData(data, TENANT),
      });
      state = { ...state, snapshots: [...state.snapshots, next] };
      head = {
        ...head,
        revision: head.revision + 1,
        snapshot_hash: next.hash,
        last_recorded_at: now.toISOString(),
      };
      api.verify();
    },
  };
  return api;
}

test("D6-C exposes a persistent request review engine and read-only packet path", () => {
  assert.equal(typeof runtime.executeAuthorityCommand, "function");
  assert.equal(typeof runtime.readAuthorityRequest, "function");
  assert.equal(typeof runtime.PostgresAuthorityStore, "function");
});

test("Finance then Executive approves unchanged C and deterministic replay reconstructs exact v1 bindings", () => {
  const h = harness(),
    created = h.create(),
    id = created.receipt.authority_request_id;
  assert.equal(created.status, "applied");
  assert.equal(h.read(id).current.resolution.outcome, "approval_required");
  assert.equal(h.decide(id, "finance").status, "applied");
  h.advance(1000);
  assert.equal(h.decide(id, "executive").status, "applied");
  const packet = h.read(id);
  assert.equal(packet.current.authorized, true);
  assert.equal(packet.current.effective_approval_ids.length, 2);
  assert.deepEqual(
    [
      packet.case_version,
      packet.review_revision,
      packet.authority_state_revision,
    ],
    [1, 2, 1],
  );
  assert.equal(h.cases.cases[0].journal.length, 1);
  assertValidAuthorityReviewContract("read", packet);
  assert.throws(() => assertValidAuthorityRequest(packet.request));
  assertValidAuthorityRequest(requestV1ToV0(packet.request));
  const decision = packet.history[1].decision;
  assert.throws(() => assertValidAuthorityDecision(decision));
  assertValidAuthorityDecision(decisionV1ToV0(decision));
  for (const field of [
    "policy_content_hash",
    "review_material_hash",
    "authority_snapshot_hash",
    "expires_at",
  ]) {
    const request = Object.fromEntries(
      Object.entries(packet.request).filter(([key]) => key !== field),
    );
    assert.throws(() => requestV1ToV0(request));
  }
  assert.throws(() =>
    requestV1ToV0({ ...packet.request, privileges: ["approve"] }),
  );
  assert.equal(packet.action_permission, false);
  h.verify(structuredClone(h.state));
});

test("reads and exact duplicates use no IDs and do not mutate state or the durable clock", () => {
  const h = harness(),
    command = createRequestCommand(),
    created = h.command(command);
  const before = JSON.stringify([h.state, h.head, h.cases]);
  const count = h.counter;
  for (let i = 0; i < 5; i++) h.read(created.receipt.authority_request_id);
  h.advance(7200000);
  assert.equal(h.command(command).status, "duplicate");
  assert.equal(
    h.read(created.receipt.authority_request_id).current.authorized,
    false,
  );
  assert.equal(h.counter, count);
  assert.equal(JSON.stringify([h.state, h.head, h.cases]), before);
  assert.equal(
    h.command({ ...command, proposal_key: "credit_12000" }).code,
    "idempotency_conflict",
  );
});

test("altered request bindings, stale R and client authority inputs fail closed", () => {
  const h = harness(),
    id = h.create().receipt.authority_request_id;
  const packet = h.read(id),
    stale = decideCommand(packet, "executive:stale");
  assert.equal(h.decide(id, "finance").status, "applied");
  const count = h.state.entries.length;
  assert.equal(h.command(stale, "executive").code, "review_revision_conflict");
  assert.equal(
    h.decide(id, "executive", "approve", {
      request_binding_hash: sha256Json({ altered: true }),
    }).code,
    "request_binding_mismatch",
  );
  for (const extra of [
    { approver_identity: packet.request.prepared_by_identity },
    { privileges: ["approve"] },
    { policies: [] },
    { asOf: START },
    { proposed_consequence_hash: sha256Json({ altered: true }) },
    { presented_view_hash: sha256Json({ fake: true }) },
  ]) {
    assert.throws(() =>
      h.command(
        { ...decideCommand(h.read(id), "injected"), ...extra },
        "executive",
      ),
    );
  }
  assert.equal(h.state.entries.length, count);
});

for (const kind of ["evidence", "D-014 rejection"])
  test(`${kind} advances C and invalidates all prior approvals`, () => {
    const h = harness(),
      id = h.create().receipt.authority_request_id;
    h.decide(id, "finance");
    const command = {
      tenant_id: TENANT,
      case_id: "case_d6_demo",
      expected_case_version: 1,
      actor_identity_id: "identity_d6_operator",
      idempotency_key: "case:changed",
      correlation_id: "changed",
    };
    const changed = h.caseCommand(
      kind === "evidence"
        ? {
            ...command,
            type: "case.attach_work_event",
            work_event: workEvent("updated", "update"),
          }
        : {
            ...command,
            type: "case.transition",
            to_state: "resolved",
            reason: "Attempted closure without proof",
          },
    );
    assert.ok(["applied", "rejected"].includes(changed.status));
    const packet = h.read(id);
    assert.equal(packet.case_version, 2);
    assert.equal(packet.review_revision, 1);
    assert.deepEqual(packet.current.reason_codes, ["stale_case"]);
    assert.equal(h.decide(id, "executive").status, "conflict");
    assert.equal(
      h.create({ idempotency_key: "request:fresh", expected_case_version: 2 })
        .status,
      "applied",
    );
  });

test("catalog changes and restoration invalidate an old request without a Case event", () => {
  const h = harness(),
    id = h.create().receipt.authority_request_id;
  h.decide(id, "finance");
  h.catalog((data) => {
    data.policies[0].source_ref = "synthetic://changed-policy";
  });
  assert.deepEqual(h.read(id).current.reason_codes, [
    "authority_state_changed",
  ]);
  assert.equal(h.decide(id, "executive").status, "conflict");
  h.catalog((data) => {
    data.policies[0].source_ref = "synthetic://d6/policy/financial-remedy/1";
  });
  assert.equal(h.read(id).authority_state_revision, 3);
  assert.equal(h.read(id).current.authorized, false);
  assert.equal(
    h.create({ expected_authority_state_revision: 3, idempotency_key: "fresh" })
      .status,
    "applied",
  );
});

for (const decision of ["reject", "modify", "escalate"])
  test(`${decision} is terminal and cannot revive or transfer approval`, () => {
    const h = harness(),
      id = h.create().receipt.authority_request_id;
    h.decide(id, "finance");
    h.decide(id, "executive");
    assert.equal(h.read(id).current.authorized, true);
    const result = h.decide(id, "executive", decision, {
      reason: "Needs a different resolution",
      ...(decision === "modify"
        ? { replacement_proposal_key: "credit_12000" }
        : {}),
    });
    assert.equal(result.status, "applied");
    assert.equal(h.read(id).current.authorized, false);
    assert.equal(h.decide(id, "finance").status, "conflict");
    if (decision === "modify") {
      const replacement = h.read(
        result.receipt.replacement_authority_request_id,
      );
      assert.equal(replacement.review_revision, 0);
      assert.equal(replacement.current.effective_approval_ids.length, 0);
      assert.equal(replacement.material.consequence.amount_minor, 1200000);
    }
  });

test("an eligible Finance reviewer can veto while another requirement has no current authority", () => {
  const h = harness();
  h.catalog((data) => {
    data.authority_records.find(
      (record) => record.authority_class === "executive_sponsor",
    ).effective_until = "2026-09-06T16:00:01.000Z";
    data.authority_records.find(
      (record) => record.authority_class === "executive_sponsor",
    ).effective_until_source_timezone = "UTC";
  });
  const id = h.create({ expected_authority_state_revision: 2 }).receipt
    .authority_request_id;
  h.advance(2000);
  assert.equal(
    h.decide(id, "finance", "reject", { reason: "Authority unresolved" })
      .status,
    "applied",
  );
  assert.equal(h.read(id).current.lifecycle, "rejected");
});

test("delegated approvals need the cited grant now; historical authorization never revives", () => {
  const h = harness();
  h.catalog((data) => {
    for (const rule of data.policies[0].rules)
      for (const requirement of rule.requirements)
        if (requirement.authority_class === "finance_approver")
          requirement.named_approver_identity_ids = [
            "identity_d6_finance_delegate",
          ];
    data.delegations[0].effective_until = "2026-09-06T16:00:30.000Z";
  });
  const id = h.create({ expected_authority_state_revision: 2 }).receipt
    .authority_request_id;
  assert.equal(h.decide(id, "finance_delegate").status, "applied");
  assert.equal(h.decide(id, "executive").status, "applied");
  assert.equal(h.read(id).current.authorized, true);
  h.advance(31000);
  const expired = h.read(id);
  assert.equal(expired.current.authorized, false);
  assert.equal(expired.historical_evaluations.at(-1).result.authorized, true);
  h.advance(3600000);
  assert.deepEqual(h.read(id).current.reason_codes, ["request_expired"]);
});

test("regressing clocks, identity revocation and tampered/coherently rehashed history fail closed", () => {
  const h = harness(),
    id = h.create().receipt.authority_request_id;
  h.advance(1000);
  h.decide(id, "finance");
  h.advance(-2000);
  assert.equal(h.decide(id, "executive").code, "clock_regression");
  h.advance(3000);
  const tampered = structuredClone(h.state);
  tampered.entries[1].decision.decision = "reject";
  tampered.entries[1].decision.reason = "Tampered veto";
  const body = Object.fromEntries(
    Object.entries(tampered.entries[1]).filter(([key]) => key !== "event_hash"),
  );
  tampered.entries[1].event_hash = sha256Json(body);
  assert.throws(() => h.verify(tampered));
  const missing = structuredClone(h.state);
  missing.snapshots.pop();
  assert.throws(() => h.verify(missing));
  h.catalog((data) => {
    data.identities.find(
      (identity) => identity.identity_id === "identity_d6_executive",
    ).status = "revoked";
  });
  assert.equal(h.read(id).current.authorized, false);
  assert.equal(h.decide(id, "executive").status, "conflict");
});

test("D6-C rejects client-supplied authority before dependency consumption", () => {
  assert.equal(typeof runtime.executeAuthorityCommand, "function");
  assert.throws(
    () =>
      runtime.executeAuthorityCommand(
        {},
        {},
        {},
        {
          type: "authority.request.create",
          approver_identity: { status: "active" },
        },
        "operator",
        {
          now: () => {
            throw Error("clock consumed");
          },
        },
      ),
    (error) => !error.message.includes("clock consumed"),
  );
});

test("coherently rehashed authorization results, missing revisions and reordered history fail replay", () => {
  const h = harness(),
    id = h.create().receipt.authority_request_id;
  h.decide(id, "finance");
  const forged = structuredClone(h.state);
  const entry = forged.entries[1];
  const evaluation = forged.snapshots.find(
    (item) => item.hash === entry.evaluation_snapshot_hash,
  );
  evaluation.content.result.authorized = true;
  evaluation.hash = sha256Json(evaluation.content);
  entry.evaluation_snapshot_hash = evaluation.hash;
  entry.event_hash = sha256Json(
    Object.fromEntries(
      Object.entries(entry).filter(([key]) => key !== "event_hash"),
    ),
  );
  assert.throws(() => h.verify(forged), /replay/);
  h.decide(id, "executive");
  const gap = structuredClone(h.state);
  gap.entries.splice(1, 1);
  assert.throws(() => h.verify(gap));
  const reversed = structuredClone(h.state);
  reversed.entries.reverse();
  assert.throws(() => h.verify(reversed));
});

for (const decision of ["reject", "modify", "escalate"])
  for (const [first, reviewer] of [
    ["finance", "finance_delegate"],
    ["finance_delegate", "finance"],
  ]) {
    test(`independent reviewer: ${reviewer} can ${decision} before ${first} approves`, () => {
      const h = harness();
      h.catalog(allowEitherFinanceReviewer);
      const id = h.create({ expected_authority_state_revision: 2 }).receipt
        .authority_request_id;
      const result = h.decide(id, reviewer, decision, {
        reason: "Independent review",
        ...(decision === "modify"
          ? { replacement_proposal_key: "credit_12000" }
          : {}),
      });
      assert.equal(result.status, "applied", JSON.stringify(result.receipt));
    });
    for (const decisionPrefix of ["decision", "decision_zz"])
      test(`independent reviewer: ${reviewer} can ${decision} after ${first} approves (${decisionPrefix})`, () => {
        const h = harness({ decisionPrefix });
        h.catalog(allowEitherFinanceReviewer);
        const id = h.create({ expected_authority_state_revision: 2 }).receipt
          .authority_request_id;
        assert.equal(h.decide(id, first).status, "applied");
        assert.equal(h.read(id).current.authorized, true);
        const result = h.decide(id, reviewer, decision, {
          reason: "Independent review",
          ...(decision === "modify"
            ? { replacement_proposal_key: "credit_12000" }
            : {}),
        });
        assert.equal(result.status, "applied", JSON.stringify(result.receipt));
        const packet = h.read(id);
        assert.deepEqual(
          [
            packet.case_version,
            packet.review_revision,
            packet.authority_state_revision,
          ],
          [1, 2, 2],
        );
        assert.equal(
          packet.current.lifecycle,
          { reject: "rejected", modify: "superseded", escalate: "escalated" }[
            decision
          ],
        );
        assert.equal(packet.current.authorized, false);
        assert.deepEqual(packet.current.effective_approval_ids, []);
        if (decision === "modify") {
          const replacement = h.read(
            result.receipt.replacement_authority_request_id,
          );
          assert.equal(replacement.review_revision, 0);
          assert.equal(replacement.current.authorized, false);
          assert.deepEqual(replacement.current.effective_approval_ids, []);
        }
        h.verify(structuredClone(h.state));
      });
  }

for (const restriction of [
  "named Finance",
  "wrong role",
  "revoked identity",
  "expired grant",
  "wrong scope",
  "revoked grant",
])
  test(`filled approval does not give intervention rights: ${restriction}`, () => {
    const h = harness();
    if (restriction !== "named Finance")
      h.catalog((data) => restrictFinanceDelegate(data, restriction));
    const id = h.create({
      proposal_key: "credit_7000",
      expected_authority_state_revision: h.head.revision,
    }).receipt.authority_request_id;
    assert.equal(h.decide(id, "finance").status, "applied");
    h.advance(2000);
    const before = h.state;
    for (const decision of ["reject", "modify", "escalate"]) {
      const result = h.decide(
        id,
        restriction === "wrong role" ? "business" : "finance_delegate",
        decision,
        {
          reason: "No authority to intervene",
          ...(decision === "modify"
            ? { replacement_proposal_key: "credit_12000" }
            : {}),
        },
      );
      assert.equal(result.code, "reviewer_ineligible");
      assert.deepEqual(h.state, before);
      assert.equal(h.read(id).current.authorized, true);
    }
  });

test("reviewer validity is independent of approval selection; v1 evidence keeps its recorded calculation", () => {
  const h = harness();
  h.catalog((data) => {
    allowEitherFinanceReviewer(data);
    const rule = data.policies[0].rules[0];
    rule.requirements.push({
      ...rule.requirements[0],
      requirement_id: "requirement_finance_delegate",
      named_approver_identity_ids: [data.actors.finance_delegate],
    });
  });
  const id = h.create({ expected_authority_state_revision: 2 }).receipt
    .authority_request_id;
  assert.equal(h.decide(id, "finance").status, "applied");
  assert.equal(h.decide(id, "finance_delegate").status, "applied");
  const packet = h.read(id);
  const proof = packet.historical_evaluations.at(-1).inputs.reviewer;
  const expected = {
    eligible: true,
    requirement_ids: ["requirement_d6_finance", "requirement_finance_delegate"],
  };
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(proof.eligibility), expected);
  assert.deepEqual(
    plain(
      resolveReviewerEligibility(
        proof.input,
        "decision_review_probe",
        "authority-resolution.d6c.v1",
      ),
    ),
    {
      eligible: true,
      requirement_ids: ["requirement_finance_delegate"],
    },
  );
  assert.equal(
    packet.history.at(-1).implementation_versions.resolver,
    "authority-resolution.d6c.v2",
  );
  for (const decisionId of ["decision_000", "decision_zzz"])
    for (const reverse of [false, true]) {
      const input = structuredClone(proof.input);
      // A valid same-principal duplicate can also win the counted slot. Neither
      // per-principal deduplication nor quota selection defines reviewer rights.
      const probe = input.priorAuthorityDecisions.find(
        (item) => item.authority_decision_id === "decision_review_probe",
      );
      input.priorAuthorityDecisions.push({
        ...probe,
        authority_decision_id: decisionId,
      });
      if (reverse)
        for (const key of [
          "identities",
          "policies",
          "authorityRecords",
          "delegations",
          "priorAuthorityDecisions",
        ])
          input[key].reverse();
      assert.deepEqual(
        plain(resolveReviewerEligibility(input, "decision_review_probe")),
        expected,
      );
      assert.ok(
        resolveAuthority(input).authority_requirements.every(
          (requirement) => requirement.satisfied_approval_ids.length === 1,
        ),
      );
    }
  const partial = structuredClone(proof.input);
  const probe = partial.priorAuthorityDecisions.find(
    (item) => item.authority_decision_id === "decision_review_probe",
  );
  partial.priorAuthorityDecisions = [probe];
  partial.policies[0].rules[0].requirements = [
    {
      ...partial.policies[0].rules[0].requirements[0],
      required_approval_count: 2,
    },
  ];
  partial.delegations.push({
    ...partial.delegations[0],
    delegation_id: "delegation_d6_second_delegate",
    delegate_identity: partial.identities.find(
      (identity) => identity.identity_id === "identity_d6_business",
    ),
  });
  assert.equal(resolveAuthority(partial).outcome, "ambiguous_authority");
  assert.deepEqual(
    plain(resolveReviewerEligibility(partial, "decision_review_probe")),
    {
      eligible: true,
      requirement_ids: ["requirement_d6_finance"],
    },
  );
  h.verify();
});
