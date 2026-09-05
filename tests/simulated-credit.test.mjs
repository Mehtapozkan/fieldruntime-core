import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "../dist/packages/contracts/src/index.js";
import * as credit from "../dist/packages/runtime/src/index.js";
import { syntheticAuthorityCatalog } from "../dist/packages/runtime/src/index.js";
import {
  assertCreditIntegrity,
  creditEntry,
  creditSource,
  evaluateCredit,
  readCredit,
} from "../dist/packages/runtime/src/simulated-credit.js";
import {
  caseCommand,
  createRequestCommand,
  decideCommand,
  workEvent,
  START,
  TENANT,
} from "./helpers/authority-review.mjs";

const hash = `sha256:${"a".repeat(64)}`;
const command = {
  schema_version: "simulated-credit-command.v1",
  type: "simulated-credit.execute",
  tenant_id: "tenant_orchid",
  case_id: "case_d6_workbench",
  authority_request_id: "request_example",
  expected_case_version: 4,
  expected_review_revision: 2,
  expected_authority_state_revision: 2,
  request_binding_hash: hash,
  expected_action_binding_hash: hash,
  idempotency_key: "credit:example",
  correlation_id: "trace:example",
};
test("D7 accepts only a bound command, never caller supplied permission or effect material", () => {
  assert.equal(
    typeof contracts.assertValidSimulatedCreditContract,
    "function",
    "versioned credit contract is not implemented",
  );
  contracts.assertValidSimulatedCreditContract("command", command);
  for (const extra of [
    { authorized: true },
    { payload: {} },
    { target: {} },
    { executor_identity: {} },
    { verified: true },
  ])
    assert.throws(() =>
      contracts.assertValidSimulatedCreditContract("command", {
        ...command,
        ...extra,
      }),
    );
});
test("explicit D7 enrollment preserves D6 policy and seats, adds scoped services, and is idempotent", () => {
  assert.equal(
    typeof credit.enrollCreditCatalog,
    "function",
    "explicit credit enrollment is not implemented",
  );
  const original = syntheticAuthorityCatalog();
  const enrolled = credit.enrollCreditCatalog(original, []);
  assert.deepEqual(enrolled.actors, original.actors);
  assert.deepEqual(enrolled.policies, original.policies);
  assert.equal(enrolled.identities.length, original.identities.length + 2);
  assert.equal(
    enrolled.authority_records.length,
    original.authority_records.length + 3,
  );
  assert.deepEqual(credit.enrollCreditCatalog(enrolled, [enrolled]), enrolled);
  const revoked = structuredClone(enrolled);
  revoked.identities.find(
    (x) => x.identity_id === "identity_d7_credit_executor",
  ).status = "revoked";
  assert.throws(() => credit.enrollCreditCatalog(revoked, [enrolled]));
  assert.throws(() => credit.enrollCreditCatalog(original, [enrolled]));
});

test("D7 enrollment rejects contradictory reserved IDs and an inactive evaluator", () => {
  const enrolled = credit.enrollCreditCatalog(syntheticAuthorityCatalog(), []);
  for (const field of ["identities", "authority_records"]) {
    const bad = structuredClone(enrolled);
    const existing = bad[field].find((x) =>
      (x.identity_id ?? x.authority_record_id).includes("d7_credit_executor"),
    );
    bad[field].push({ ...existing, status: "revoked" });
    assert.throws(() => credit.enrollCreditCatalog(bad, [enrolled]));
  }
  const inactive = structuredClone(syntheticAuthorityCatalog());
  inactive.identities.find(
    (x) => x.identity_id === "identity_d6_evaluator",
  ).status = "revoked";
  assert.throws(() => credit.enrollCreditCatalog(inactive, []));
});

function reviewedCreditContext() {
  let ids = 0;
  const deps = {
    now: () => new Date(START),
    nextId: (kind) => `${kind}_${++ids}`,
  };
  let cases = credit.executeCaseCommand(
    credit.emptyCaseEngine(),
    caseCommand("d6_workbench"),
    deps,
  ).state;
  for (const [i, to_state] of [
    "qualifying",
    "enriching",
    "needs_review",
  ].entries())
    cases = credit.executeCaseCommand(
      cases,
      {
        type: "case.transition",
        tenant_id: TENANT,
        case_id: "case_d6_workbench",
        expected_case_version: i + 1,
        actor_identity_id: "identity_d6_operator",
        idempotency_key: `prepare:${to_state}`,
        correlation_id: "replay",
        to_state,
        reason: "Prepare the synthetic Case",
      },
      deps,
    ).state;
  const catalog = credit.reviewSnapshot("catalog", {
    schema_version: "authority-catalog.v1",
    tenant_id: TENANT,
    revision: 1,
    previous_catalog_hash: null,
    after_review_position: 0,
    recorded_at: START,
    data: credit.enrollCreditCatalog(syntheticAuthorityCatalog(), []),
  });
  const head = {
    tenant_id: TENANT,
    revision: 1,
    snapshot_hash: catalog.hash,
    last_recorded_at: START,
  };
  let authority = { entries: [], snapshots: [catalog] };
  const created = credit.executeAuthorityCommand(
    authority,
    cases,
    head,
    createRequestCommand("case_d6_workbench", "request:replay", {
      expected_case_version: 4,
    }),
    "operator",
    deps,
  );
  authority = created.state;
  for (const seat of ["finance", "executive"]) {
    const packet = credit.readAuthorityRequest(
      authority,
      cases,
      head,
      created.receipt.authority_request_id,
      new Date(START),
    );
    authority = credit.executeAuthorityCommand(
      authority,
      cases,
      head,
      decideCommand(packet, `decision:${seat}`),
      seat,
      deps,
    ).state;
  }
  credit.assertCaseEngineStateIntegrity(cases);
  credit.assertAuthorityStateIntegrity(authority, cases, [head]);
  const context = {
    cases,
    authority,
    heads: [head],
    credit: { entries: [], sources: [] },
  };
  const command = {
    ...readCredit(context, new Date(START)).current.bindings,
    idempotency_key: "credit:replay",
    correlation_id: "replay",
  };
  return { context, command };
}

function changedCreditCase(context, at, kind = "evidence") {
  const command = {
    tenant_id: TENANT,
    case_id: "case_d6_workbench",
    expected_case_version: 4,
    actor_identity_id: "identity_d6_operator",
    idempotency_key: "case:changed",
    correlation_id: "case:changed",
    ...(kind === "evidence"
      ? {
          type: "case.attach_work_event",
          work_event: workEvent("replay_update", "update"),
        }
      : {
          type: "case.transition",
          to_state: "resolved",
          reason: "Incomplete proof must deny closure",
        }),
  };
  let ids = 0;
  const changed = credit.executeCaseCommand(context.cases, command, {
    now: () => new Date(at),
    nextId: (kind) => `${kind}_changed_${++ids}`,
  });
  assert.equal(changed.state.cases[0].journal.length, 5);
  credit.assertCaseEngineStateIntegrity(changed.state);
  return changed.state;
}

function claimCredit(context, command, at) {
  const envelope = evaluateCredit(context, command, at);
  assert.equal(envelope.authorized, true);
  const source = creditSource("attempt_replay", at);
  const entry = creditEntry(
    context,
    envelope,
    "attempt_replay",
    "success",
    source,
  );
  return {
    ...context,
    heads: [{ ...context.heads[0], last_recorded_at: at }],
    credit: { entries: [entry], sources: [source] },
  };
}

for (const changedAt of [
  "2026-09-06T16:00:01.000Z",
  "2026-09-06T16:00:02.000Z",
])
  test(`D7 earlier action survives a later Case append recorded at ${changedAt}`, () => {
    const { context, command } = reviewedCreditContext();
    const original = claimCredit(context, command, "2026-09-06T16:00:01.000Z");
    const later = { ...original, cases: changedCreditCase(context, changedAt) };
    credit.assertAuthorityStateIntegrity(
      later.authority,
      later.cases,
      later.heads,
      later.credit.entries,
    );
    assert.doesNotThrow(() => assertCreditIntegrity(later));
    const read = readCredit(later, new Date(changedAt));
    assert.deepEqual(read.attempts, original.credit.entries);
    assert.equal(read.current.eligible, false);
    assert.equal(read.closure_permission, false);
  });

for (const kind of ["evidence", "D-014 rejection"])
  test(`D7 replay rejects an obsolete Case claim after canonical ${kind}`, () => {
    const { context, command } = reviewedCreditContext();
    const changedAt = "2026-09-06T16:00:02.000Z";
    const cases = changedCreditCase(context, changedAt, kind);
    // Coherently regenerate the complete action/source evidence from the old
    // prefix at a later claimed issuance, retaining a canonically supported floor.
    const forged = claimCredit(
      {
        ...context,
        heads: [{ ...context.heads[0], last_recorded_at: changedAt }],
      },
      command,
      "2026-09-06T16:00:03.000Z",
    );
    forged.cases = cases;
    credit.assertAuthorityStateIntegrity(
      forged.authority,
      cases,
      forged.heads,
      forged.credit.entries,
    );
    assert.throws(
      () => assertCreditIntegrity(forged),
      /credit ignored an earlier Case change/,
    );
  });
