import assert from "node:assert/strict";
import { sha256Json } from "../dist/packages/runtime/src/index.js";

const phase = process.argv[2];
if (
  phase !== "applied" &&
  phase !== "duplicate-and-update" &&
  phase !== "durable"
) {
  throw new Error(
    "usage: node scripts/smoke-local-appliance.mjs applied|duplicate-and-update|durable",
  );
}

const baseUrl = "http://127.0.0.1:3210";

async function request(path, init) {
  const response = await globalThis.fetch(`${baseUrl}${path}`, {
    ...init,
    signal: globalThis.AbortSignal.timeout(5_000),
  });
  const body = await response.json();
  return { response, body };
}

const command = {
  type: "case.create",
  tenant_id: "tenant_orchid",
  expected_case_version: 0,
  actor_identity_id: "system_fieldruntime",
  idempotency_key: "compose-smoke-create-001",
  correlation_id: "compose-smoke-trace-001",
  case_seed: {
    tenant: {
      id: "tenant_orchid",
      name: "Orchid Evaluation Tenant",
      status: "active",
      data_region: "local",
      retention_policy_id: "retention_eval_v0",
    },
    workflow_version: {
      id: "workflow_ecc_v0_1_0",
      workflow_id: "customer_escalation_commitment_control",
      version: "0.1.0",
      status: "shadow",
      decision_graph_id: "ecc_decision_graph_v0",
      policy_version_ids: ["policy_customer_comms_v3"],
      eval_suite_version: "0.1.0",
      effective_from: "2026-08-26T00:00:00.000Z",
      effective_from_source_timezone: "UTC",
    },
    case: {
      id: "case_compose_smoke_001",
      tenant_id: "tenant_orchid",
      workflow_version_id: "workflow_ecc_v0_1_0",
      customer_ref: "crm://accounts/compose-smoke",
      issue_fingerprint: "compose-smoke:durable-case",
      severity: "high",
      owner_identity_id: "user_operator",
      scope_ids: ["scope_customer_ops", "scope_compose_smoke"],
      related_case_ids: [],
    },
  },
  trigger_event: {
    id: "work_event_compose_smoke_001",
    tenant_id: "tenant_orchid",
    source: "fixture_ci",
    source_event_id: "source_compose_smoke_001",
    event_type: "message.created",
    actor_identity_id: "user_operator",
    scope_ids: ["scope_customer_ops"],
    occurred_at: "2026-09-01T15:59:00.000Z",
    source_timezone: "UTC",
    content_hash: sha256Json({ body: "compose-smoke-event" }),
    payload_ref: "fixture://events/compose-smoke-001",
    classification: "internal",
    idempotency_key: "tenant_orchid:fixture_ci:source_compose_smoke_001",
  },
};

const health = await request("/healthz");
assert.equal(health.response.status, 200);
assert.deepEqual(health.body, { status: "alive" });

const readiness = await request("/readyz");
assert.equal(readiness.response.status, 200);
assert.deepEqual(readiness.body, {
  status: "ready",
  mode: "simulation",
  external_writes: false,
});

const fixture = await request("/v0/evaluation-fixtures/ecc/case_acme_sso_001");
assert.equal(fixture.response.status, 200);
assert.equal(fixture.body.authoritative, false);
assert.equal(fixture.body.replayable, false);

const commandResult = await request("/v0/tenants/tenant_orchid/case-commands", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(command),
});
assert.equal(commandResult.response.status, 200);
assert.equal(
  commandResult.body.status,
  phase === "applied" ? "applied" : "duplicate",
);
assert.equal(commandResult.body.case_id, "case_compose_smoke_001");
assert.equal(commandResult.body.case_version, 1);

let caseResult = await request(
  "/v0/tenants/tenant_orchid/cases/case_compose_smoke_001",
);
assert.equal(caseResult.response.status, 200);
assert.equal(caseResult.body.case_id, "case_compose_smoke_001");
assert.equal(
  caseResult.body.document.case.version,
  phase === "durable" ? 2 : 1,
);

let journal = await request(
  "/v0/tenants/tenant_orchid/cases/case_compose_smoke_001/journal",
);
assert.equal(journal.response.status, 200);
assert.equal(journal.body.entries.length, phase === "durable" ? 2 : 1);
assert.equal(journal.body.entries[0].event_type, "case.created");

if (phase !== "applied") {
  const transition = await request("/v0/tenants/tenant_orchid/case-commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "case.transition",
      tenant_id: "tenant_orchid",
      case_id: "case_compose_smoke_001",
      expected_case_version: 1,
      actor_identity_id: "user_operator",
      idempotency_key: "compose-smoke-transition-001",
      correlation_id: "compose-smoke-transition-trace-001",
      to_state: "qualifying",
      reason: "Exercise durable PostgreSQL projection update",
    }),
  });
  assert.equal(transition.response.status, 200);
  assert.equal(
    transition.body.status,
    phase === "duplicate-and-update" ? "applied" : "duplicate",
  );
  assert.equal(transition.body.case_version, 2);

  caseResult = await request(
    "/v0/tenants/tenant_orchid/cases/case_compose_smoke_001",
  );
  assert.equal(caseResult.body.document.case.version, 2);
  assert.equal(caseResult.body.document.case.state, "qualifying");
  journal = await request(
    "/v0/tenants/tenant_orchid/cases/case_compose_smoke_001/journal",
  );
  assert.equal(journal.body.entries.length, 2);
  assert.equal(journal.body.entries[1].event_type, "case.state_transitioned");
}

process.stdout.write(`Local appliance smoke passed in ${phase} phase.\n`);
