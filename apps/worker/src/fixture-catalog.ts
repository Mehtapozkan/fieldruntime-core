import {
  assertValidCaseDocument,
  validateCrossRecordInvariants,
} from "../../../packages/contracts/src/index.js";
import {
  canonicalizeJson,
  sha256Json,
  type JsonValue,
  type SqlClient,
} from "../../../packages/runtime/src/index.js";

type JsonObject = { readonly [key: string]: JsonValue };

export interface EvaluationFixtureRecord {
  readonly fixture_id: string;
  readonly pack_id: "ecc";
  readonly pack_version: string;
  readonly tenant_id: string;
  readonly case_id: string;
  readonly fixture_hash: `sha256:${string}`;
  readonly document: JsonObject;
}

export class FixtureCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureCatalogError";
  }
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function requiredString(value: JsonValue | undefined, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new FixtureCatalogError(`${path} must be a nonempty string`);
  }
  return value;
}

export function createEvaluationFixtureRecord(
  untrustedDocument: unknown,
): EvaluationFixtureRecord {
  assertValidCaseDocument(untrustedDocument);
  const violations = validateCrossRecordInvariants(untrustedDocument);
  if (violations.length > 0) {
    throw new FixtureCatalogError(
      `evaluation fixture violates ${violations[0]?.code ?? "an invariant"}`,
    );
  }
  const normalized = canonicalizeJson(untrustedDocument);
  if (!isObject(normalized)) {
    throw new FixtureCatalogError("evaluation fixture must be an object");
  }
  const tenant = isObject(normalized.tenant) ? normalized.tenant : undefined;
  const workflow = isObject(normalized.workflow_version)
    ? normalized.workflow_version
    : undefined;
  const caseRecord = isObject(normalized.case) ? normalized.case : undefined;
  if (
    tenant === undefined ||
    workflow === undefined ||
    caseRecord === undefined
  ) {
    throw new FixtureCatalogError(
      "evaluation fixture is missing tenant, workflow, or case identity",
    );
  }
  if (workflow.status === "active") {
    throw new FixtureCatalogError(
      "the PR4 evaluation appliance cannot load an active workflow fixture",
    );
  }
  const actions = isArray(normalized.action_proposals)
    ? normalized.action_proposals
    : [];
  if (
    actions.some((action) => isObject(action) && action.status === "executed")
  ) {
    throw new FixtureCatalogError(
      "the PR4 evaluation appliance cannot load executed actions",
    );
  }

  const tenantId = requiredString(tenant.id, "$/tenant/id");
  const caseId = requiredString(caseRecord.id, "$/case/id");
  const packVersion = requiredString(
    workflow.version,
    "$/workflow_version/version",
  );
  return Object.freeze({
    fixture_id: caseId,
    pack_id: "ecc",
    pack_version: packVersion,
    tenant_id: tenantId,
    case_id: caseId,
    fixture_hash: sha256Json(normalized),
    document: normalized,
  });
}

export async function loadEvaluationFixture(
  client: SqlClient,
  fixture: EvaluationFixtureRecord,
): Promise<"inserted" | "unchanged"> {
  const existing = await client.query<{
    readonly fixture_hash: unknown;
    readonly pack_id: unknown;
    readonly pack_version: unknown;
    readonly tenant_id: unknown;
    readonly case_id: unknown;
  }>(
    `SELECT fixture_hash, pack_id, pack_version, tenant_id, case_id
       FROM evaluation_demo_fixtures
      WHERE fixture_id = $1`,
    [fixture.fixture_id],
  );
  const row = existing.rows[0];
  if (row !== undefined) {
    if (
      row.fixture_hash !== fixture.fixture_hash ||
      row.pack_id !== fixture.pack_id ||
      row.pack_version !== fixture.pack_version ||
      row.tenant_id !== fixture.tenant_id ||
      row.case_id !== fixture.case_id
    ) {
      throw new FixtureCatalogError(
        "evaluation fixture identity already exists with different content",
      );
    }
    return "unchanged";
  }
  await client.query(
    `INSERT INTO evaluation_demo_fixtures (
       fixture_id, pack_id, pack_version, tenant_id, case_id,
       fixture_hash, document
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      fixture.fixture_id,
      fixture.pack_id,
      fixture.pack_version,
      fixture.tenant_id,
      fixture.case_id,
      fixture.fixture_hash,
      JSON.stringify(fixture.document),
    ],
  );
  return "inserted";
}

export async function getEvaluationFixture(
  client: SqlClient,
  fixtureId: string,
): Promise<EvaluationFixtureRecord | undefined> {
  const result = await client.query<{
    readonly fixture_id: unknown;
    readonly pack_id: unknown;
    readonly pack_version: unknown;
    readonly tenant_id: unknown;
    readonly case_id: unknown;
    readonly fixture_hash: unknown;
    readonly document: unknown;
  }>(
    `SELECT fixture_id, pack_id, pack_version, tenant_id, case_id,
            fixture_hash, document
       FROM evaluation_demo_fixtures
      WHERE fixture_id = $1`,
    [fixtureId],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  const rebuilt = createEvaluationFixtureRecord(row.document);
  if (
    row.fixture_id !== rebuilt.fixture_id ||
    row.pack_id !== rebuilt.pack_id ||
    row.pack_version !== rebuilt.pack_version ||
    row.tenant_id !== rebuilt.tenant_id ||
    row.case_id !== rebuilt.case_id ||
    row.fixture_hash !== rebuilt.fixture_hash
  ) {
    throw new FixtureCatalogError("stored evaluation fixture failed integrity");
  }
  return rebuilt;
}
