import assert from "node:assert/strict";
import test from "node:test";
import { handleApiRequest } from "../dist/apps/api/src/handler.js";
import { assertSafeConfiguration } from "../dist/apps/api/src/main.js";
import { CaseCommandInputError } from "../dist/apps/worker/src/command-service.js";

function dependencies(overrides = {}) {
  return {
    async executeCaseCommand() {
      throw new Error("unexpected command");
    },
    async getCase() {
      return undefined;
    },
    async getEvaluationFixture() {
      return undefined;
    },
    async getJournal() {
      return undefined;
    },
    async getGuidedWalkthrough() {
      return undefined;
    },
    async isReady() {
      return true;
    },
    async listCases() {
      return [];
    },
    ...overrides,
  };
}

test("health is process-only while readiness fails closed and stays sanitized", async () => {
  let readinessChecks = 0;
  const deps = dependencies({
    async isReady() {
      readinessChecks += 1;
      throw new Error(
        "postgresql://fieldruntime:secret@postgres/fieldruntime is unavailable",
      );
    },
  });

  const health = await handleApiRequest(
    { method: "GET", path: "/healthz" },
    deps,
  );
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: "alive" });
  assert.equal(readinessChecks, 0);

  const readiness = await handleApiRequest(
    { method: "GET", path: "/readyz" },
    deps,
  );
  assert.equal(readiness.status, 503);
  assert.deepEqual(readiness.body, { status: "not_ready" });
  assert.doesNotMatch(JSON.stringify(readiness), /secret|postgresql/i);
});

test("the command boundary rejects unsafe payloads before invoking the worker", async () => {
  let calls = 0;
  const deps = dependencies({
    async executeCaseCommand() {
      calls += 1;
      return { status: "applied" };
    },
  });

  const wrongContentType = await handleApiRequest(
    {
      method: "POST",
      path: "/v0/tenants/tenant_orchid/case-commands",
      headers: { "content-type": "text/plain" },
      body: "{}",
    },
    deps,
  );
  assert.equal(wrongContentType.status, 415);

  const lookalikeContentType = await handleApiRequest(
    {
      method: "POST",
      path: "/v0/tenants/tenant_orchid/case-commands",
      headers: { "content-type": "application/jsonp" },
      body: "{}",
    },
    deps,
  );
  assert.equal(lookalikeContentType.status, 415);

  const malformed = await handleApiRequest(
    {
      method: "POST",
      path: "/v0/tenants/tenant_orchid/case-commands",
      headers: { "content-type": "application/json" },
      body: "{",
    },
    deps,
  );
  assert.equal(malformed.status, 400);

  const mismatch = await handleApiRequest(
    {
      method: "POST",
      path: "/v0/tenants/tenant_orchid/case-commands",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "case.transition",
        tenant_id: "tenant_other",
      }),
    },
    deps,
  );
  assert.equal(mismatch.status, 400);

  const oversized = await handleApiRequest(
    {
      method: "POST",
      path: "/v0/tenants/tenant_orchid/case-commands",
      headers: { "content-type": "application/json" },
      body: `{"tenant_id":"tenant_orchid","value":"${"x".repeat(1_048_577)}"}`,
    },
    deps,
  );
  assert.equal(oversized.status, 413);
  assert.equal(calls, 0);
});

test("command validation errors are client errors while storage failures stay internal", async () => {
  const request = {
    method: "POST",
    path: "/v0/tenants/tenant_orchid/case-commands",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: "tenant_orchid" }),
  };
  const invalid = await handleApiRequest(
    request,
    dependencies({
      async executeCaseCommand() {
        throw new CaseCommandInputError({ cause: new Error("secret detail") });
      },
    }),
  );
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, { error: "invalid_command" });

  const unavailable = await handleApiRequest(
    request,
    dependencies({
      async executeCaseCommand() {
        throw new Error("postgresql://fieldruntime:secret@remote/database");
      },
    }),
  );
  assert.equal(unavailable.status, 500);
  assert.deepEqual(unavailable.body, { error: "internal_error" });
  assert.doesNotMatch(JSON.stringify(unavailable), /secret|postgresql/i);
});

test("startup accepts only an authenticated local PostgreSQL target", () => {
  const base = {
    FIELD_RUNTIME_MODE: "simulation",
    FIELD_RUNTIME_EXTERNAL_WRITES: "false",
  };
  assert.deepEqual(
    assertSafeConfiguration({
      ...base,
      DATABASE_URL: "postgresql://fieldruntime:local@postgres/fieldruntime",
    }),
    {
      databaseUrl: "postgresql://fieldruntime:local@postgres/fieldruntime",
      bind: "127.0.0.1",
      port: 3210,
    },
  );
  assert.deepEqual(
    assertSafeConfiguration({
      ...base,
      DATABASE_URL: "postgresql://fieldruntime:local@postgres/fieldruntime",
      FIELD_RUNTIME_BIND: "0.0.0.0",
    }).bind,
    "0.0.0.0",
  );
  for (const databaseUrl of [
    "postgresql://fieldruntime:local@db.example.com/fieldruntime",
    "https://fieldruntime:local@localhost/fieldruntime",
    "postgresql://fieldruntime@localhost/fieldruntime",
    "postgresql://fieldruntime:local@localhost/",
    "postgresql://fieldruntime:local@localhost/fieldruntime?host=db.example.com",
  ]) {
    assert.throws(
      () => assertSafeConfiguration({ ...base, DATABASE_URL: databaseUrl }),
      /local PostgreSQL service/,
    );
  }
  assert.throws(
    () =>
      assertSafeConfiguration({
        ...base,
        FIELD_RUNTIME_EXTERNAL_WRITES: "true",
        DATABASE_URL: "postgresql://fieldruntime:local@localhost/fieldruntime",
      }),
    /external writes disabled/,
  );
  assert.throws(
    () =>
      assertSafeConfiguration({
        ...base,
        DATABASE_URL: "postgresql://fieldruntime:local@localhost/fieldruntime",
        FIELD_RUNTIME_BIND: "0.0.0.0",
      }),
    /only inside the Compose appliance/,
  );
});

test("valid commands are tenant-bound and conflicts remain explicit", async () => {
  const command = {
    type: "case.transition",
    tenant_id: "tenant_orchid",
    case_id: "case_example",
    expected_case_version: 1,
    actor_identity_id: "user_operator",
    idempotency_key: "transition:1",
    correlation_id: "correlation_1",
    to_state: "qualifying",
    reason: "begin qualification",
  };
  const seen = [];
  const deps = dependencies({
    async executeCaseCommand(tenantId, value) {
      seen.push([tenantId, value]);
      return {
        status: "conflict",
        code: "VERSION_CONFLICT",
        message: "stale",
      };
    },
  });

  const response = await handleApiRequest(
    {
      method: "POST",
      path: "/v0/tenants/tenant_orchid/case-commands",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(command),
    },
    deps,
  );

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    status: "conflict",
    code: "VERSION_CONFLICT",
    message: "stale",
  });
  assert.deepEqual(seen, [["tenant_orchid", command]]);
});

test("tenant reads do not reveal whether another tenant owns a case", async () => {
  const missing = await handleApiRequest(
    {
      method: "GET",
      path: "/v0/tenants/tenant_orchid/cases/case_secret",
    },
    dependencies(),
  );
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "not_found" });
});

test("evaluation fixtures are explicitly read-only and non-replayable", async () => {
  const fixture = {
    fixture_id: "case_acme_sso_001",
    fixture_hash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tenant_id: "tenant_orchid",
    case_id: "case_acme_sso_001",
    document: { case: { id: "case_acme_sso_001" } },
  };
  const response = await handleApiRequest(
    {
      method: "GET",
      path: "/v0/evaluation-fixtures/ecc/case_acme_sso_001",
    },
    dependencies({
      async getEvaluationFixture(id) {
        assert.equal(id, "case_acme_sso_001");
        return fixture;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ...fixture,
    authoritative: false,
    replayable: false,
  });
});

test("guided walkthroughs are explicitly presentation-only", async () => {
  const walkthrough = {
    walkthrough_id: "walkthrough_acme_sso_001",
    walkthrough_hash:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    fixture_id: "case_acme_sso_001",
    fixture_hash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    document: { schema_version: "guided-walkthrough.v0" },
  };
  const response = await handleApiRequest(
    {
      method: "GET",
      path: "/v0/evaluation-walkthroughs/ecc/walkthrough_acme_sso_001",
    },
    dependencies({
      async getGuidedWalkthrough(id) {
        assert.equal(id, "walkthrough_acme_sso_001");
        return walkthrough;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ...walkthrough,
    authoritative: false,
    replayable: false,
    production_receipt: false,
  });
});
