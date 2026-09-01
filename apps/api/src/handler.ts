import type {
  CaseAggregate,
  CaseCommandResult,
  CaseJournalEntry,
  JsonValue,
} from "../../../packages/runtime/src/index.js";
import { CaseCommandInputError } from "../../worker/src/command-service.js";

type JsonObject = { readonly [key: string]: JsonValue };

export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly body?: string;
}

export interface ApiResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: JsonValue;
}

export interface EvaluationFixtureRecord {
  readonly fixture_id: string;
  readonly fixture_hash: string;
  readonly tenant_id: string;
  readonly case_id: string;
  readonly document: JsonObject;
}

export interface GuidedWalkthroughRecord {
  readonly walkthrough_id: string;
  readonly walkthrough_hash: string;
  readonly fixture_id: string;
  readonly fixture_hash: string;
  readonly document: JsonObject;
}

export interface ApiDependencies {
  readonly isReady: () => Promise<boolean>;
  readonly executeCaseCommand: (
    tenantId: string,
    command: JsonObject,
  ) => Promise<CaseCommandResult>;
  readonly listCases: (tenantId: string) => Promise<readonly CaseAggregate[]>;
  readonly getCase: (
    tenantId: string,
    caseId: string,
  ) => Promise<CaseAggregate | undefined>;
  readonly getJournal: (
    tenantId: string,
    caseId: string,
  ) => Promise<readonly CaseJournalEntry[] | undefined>;
  readonly getEvaluationFixture: (
    fixtureId: string,
  ) => Promise<EvaluationFixtureRecord | undefined>;
  readonly getGuidedWalkthrough: (
    walkthroughId: string,
  ) => Promise<GuidedWalkthroughRecord | undefined>;
}

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
});
const CANONICAL_ID = /^[A-Za-z][A-Za-z0-9_-]{2,127}$/;
const MAX_BODY_BYTES = 1_048_576;

function response(status: number, body: JsonValue): ApiResponse {
  return Object.freeze({ status, headers: JSON_HEADERS, body });
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodePath(path: string): string[] | undefined {
  const pathname = path.split("?", 1)[0] ?? "";
  try {
    const segments = pathname
      .split("/")
      .filter((segment) => segment.length > 0)
      .map((segment) => decodeURIComponent(segment));
    return segments.every((segment) => !segment.includes("/"))
      ? segments
      : undefined;
  } catch {
    return undefined;
  }
}

function contentType(headers: ApiRequest["headers"]): string | undefined {
  if (headers === undefined) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "content-type") return value?.toLowerCase();
  }
  return undefined;
}

function safeCommandResult(result: CaseCommandResult): JsonObject {
  if (result.status === "conflict") {
    return {
      status: result.status,
      code: result.code,
      message: result.message,
    };
  }
  if (result.status === "duplicate") {
    return {
      status: result.status,
      original_status: result.original_status,
      case_id: result.aggregate.case_id,
      case_version: result.original_entry.case_version,
    };
  }
  return {
    status: result.status,
    case_id: result.aggregate.case_id,
    case_version: result.entry.case_version,
    journal_entry_id: result.entry.id,
    ...(result.status === "rejected" ? { code: result.code } : {}),
  };
}

function parseCommand(
  request: ApiRequest,
): { readonly error: ApiResponse } | { readonly command: JsonObject } {
  const type = contentType(request.headers);
  const mediaType = type?.split(";", 1)[0]?.trim();
  if (mediaType !== "application/json") {
    return { error: response(415, { error: "application_json_required" }) };
  }
  const body = request.body ?? "";
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return { error: response(413, { error: "payload_too_large" }) };
  }
  try {
    const parsed = JSON.parse(body) as JsonValue;
    if (!isObject(parsed)) {
      return { error: response(400, { error: "invalid_command" }) };
    }
    return { command: parsed };
  } catch {
    return { error: response(400, { error: "invalid_json" }) };
  }
}

export async function handleApiRequest(
  request: ApiRequest,
  dependencies: ApiDependencies,
): Promise<ApiResponse> {
  const method = request.method.toUpperCase();
  const segments = decodePath(request.path);
  if (segments === undefined) return response(400, { error: "invalid_path" });

  if (method === "GET" && segments.length === 1 && segments[0] === "healthz") {
    return response(200, { status: "alive" });
  }
  if (method === "GET" && segments.length === 1 && segments[0] === "readyz") {
    try {
      return (await dependencies.isReady())
        ? response(200, {
            status: "ready",
            mode: "simulation",
            external_writes: false,
          })
        : response(503, { status: "not_ready" });
    } catch {
      return response(503, { status: "not_ready" });
    }
  }

  if (
    method === "GET" &&
    segments.length === 4 &&
    segments[0] === "v0" &&
    segments[1] === "evaluation-fixtures" &&
    segments[2] === "ecc"
  ) {
    const fixtureId = segments[3];
    if (fixtureId === undefined || !CANONICAL_ID.test(fixtureId)) {
      return response(404, { error: "not_found" });
    }
    const fixture = await dependencies.getEvaluationFixture(fixtureId);
    return fixture === undefined
      ? response(404, { error: "not_found" })
      : response(200, {
          ...fixture,
          authoritative: false,
          replayable: false,
        });
  }

  if (
    method === "GET" &&
    segments.length === 4 &&
    segments[0] === "v0" &&
    segments[1] === "evaluation-walkthroughs" &&
    segments[2] === "ecc"
  ) {
    const walkthroughId = segments[3];
    if (walkthroughId === undefined || !CANONICAL_ID.test(walkthroughId)) {
      return response(404, { error: "not_found" });
    }
    const walkthrough = await dependencies.getGuidedWalkthrough(walkthroughId);
    return walkthrough === undefined
      ? response(404, { error: "not_found" })
      : response(200, {
          ...walkthrough,
          authoritative: false,
          replayable: false,
          production_receipt: false,
        });
  }

  if (
    segments.length >= 4 &&
    segments[0] === "v0" &&
    segments[1] === "tenants" &&
    segments[3] === "cases"
  ) {
    const tenantId = segments[2];
    if (tenantId === undefined || !CANONICAL_ID.test(tenantId)) {
      return response(404, { error: "not_found" });
    }
    if (method === "GET" && segments.length === 4) {
      const cases = await dependencies.listCases(tenantId);
      return response(200, { cases: cases as unknown as JsonValue });
    }
    const caseId = segments[4];
    if (caseId === undefined || !CANONICAL_ID.test(caseId)) {
      return response(404, { error: "not_found" });
    }
    if (method === "GET" && segments.length === 5) {
      const aggregate = await dependencies.getCase(tenantId, caseId);
      return aggregate === undefined
        ? response(404, { error: "not_found" })
        : response(200, aggregate as unknown as JsonValue);
    }
    if (
      method === "GET" &&
      segments.length === 6 &&
      segments[5] === "journal"
    ) {
      const journal = await dependencies.getJournal(tenantId, caseId);
      return journal === undefined
        ? response(404, { error: "not_found" })
        : response(200, { entries: journal as unknown as JsonValue });
    }
  }

  if (
    method === "POST" &&
    segments.length === 4 &&
    segments[0] === "v0" &&
    segments[1] === "tenants" &&
    segments[3] === "case-commands"
  ) {
    const tenantId = segments[2];
    if (tenantId === undefined || !CANONICAL_ID.test(tenantId)) {
      return response(404, { error: "not_found" });
    }
    const parsed = parseCommand(request);
    if ("error" in parsed) return parsed.error;
    if (parsed.command.tenant_id !== tenantId) {
      return response(400, { error: "tenant_mismatch" });
    }
    try {
      const result = await dependencies.executeCaseCommand(
        tenantId,
        parsed.command,
      );
      return response(
        result.status === "conflict" ? 409 : 200,
        safeCommandResult(result),
      );
    } catch (error) {
      return error instanceof CaseCommandInputError
        ? response(400, { error: "invalid_command" })
        : response(500, { error: "internal_error" });
    }
  }

  return response(404, { error: "not_found" });
}
