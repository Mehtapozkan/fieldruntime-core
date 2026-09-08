import {
  IntakeInputError,
  type TransactionalIntakeWorker,
} from "../../worker/src/intake-service.js";
import { MAX_INTAKE_HTTP_BYTES } from "../../../packages/runtime/src/intake.js";
import { CreditCommandInputError } from "../../worker/src/simulated-credit-service.js";
import type {
  CaseAggregate,
  CaseCommandResult,
  CaseJournalEntry,
  JsonValue,
} from "../../../packages/runtime/src/index.js";
import { CaseCommandInputError } from "../../worker/src/command-service.js";
import {
  AuthorityCommandInputError,
  SYNTHETIC_REVIEW_SEATS,
} from "../../worker/src/authority-service.js";
import type { AuthorityCommandResult } from "../../../packages/runtime/src/authority-review.js";

type JsonObject = { readonly [key: string]: JsonValue };

export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly body?: string;
  readonly receivedAt?: string;
}

export interface ApiResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: JsonValue;
  readonly rawBody?: Buffer;
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
  readonly intake?: TransactionalIntakeWorker;
  readonly credit?: {
    readonly verify?: (command: unknown) => Promise<JsonObject>;
    readonly execute: (command: unknown) => Promise<JsonObject>;
    readonly read: (
      tenant: string,
      caseId: string,
    ) => Promise<JsonObject | undefined>;
  };
  readonly authority?: {
    readonly create: (command: unknown) => Promise<AuthorityCommandResult>;
    readonly decide: (
      command: unknown,
      seat: string,
    ) => Promise<AuthorityCommandResult>;
    readonly read: (
      tenantId: string,
      requestId: string,
    ) => Promise<JsonObject | undefined>;
    readonly catalogRevision: (tenantId: string) => Promise<number | undefined>;
  };
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

export function decodePath(path: string): string[] | undefined {
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

// D-036 commands reject duplicate JSON keys before boundary validation, including
// escaped spellings of the same key. JSON.parse first establishes valid JSON syntax.
function assertUniqueJsonKeys(body: string): void {
  const tokens =
    body.match(/"(?:\\[\s\S]|[^"\\])*"|[{}[\]:,]|[^\s{}[\]:,]+/g) ?? [];
  let i = 0;
  const value = (): void => {
    const token = tokens[i++];
    if (token === "{") {
      const keys = new Set<string>();
      while (tokens[i] !== "}") {
        const key = JSON.parse(tokens[i++] ?? "") as string;
        if (keys.has(key)) throw new Error("Duplicate JSON key");
        keys.add(key);
        i++;
        value();
        if (tokens[i] !== ",") break;
        i++;
      }
      i++;
    } else if (token === "[") {
      while (tokens[i] !== "]") {
        value();
        if (tokens[i] !== ",") break;
        i++;
      }
      i++;
    }
  };
  value();
}

function parseCommand(
  request: ApiRequest,
  limit = MAX_BODY_BYTES,
  rejectDuplicateKeys = false,
): { readonly error: ApiResponse } | { readonly command: JsonObject } {
  const type = contentType(request.headers);
  const mediaType = type?.split(";", 1)[0]?.trim();
  if (mediaType !== "application/json") {
    return { error: response(415, { error: "application_json_required" }) };
  }
  const body = request.body ?? "";
  if (Buffer.byteLength(body, "utf8") > limit) {
    return { error: response(413, { error: "payload_too_large" }) };
  }
  try {
    const parsed = JSON.parse(body) as JsonValue;
    if (rejectDuplicateKeys) assertUniqueJsonKeys(body);
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

  if (segments[0] === "v1" && segments[1] === "intake" && dependencies.intake) {
    const intake = dependencies.intake;
    try {
      if (
        segments[2] === "preparation-packs" &&
        segments[3] === "pack_synthetic_invoice_dispute_north"
      ) {
        const params = new URL(request.path, "http://localhost").searchParams;
        if (
          method === "POST" &&
          segments.length === 6 &&
          segments[4] === "selections"
        ) {
          if (params.size) return response(400, { error: "invalid_query" });
          const parsed = parseCommand(request, 131072, true);
          if ("error" in parsed) return parsed.error;
          return response(
            200,
            await intake.selectPack(parsed.command, segments[5] ?? ""),
          );
        }
        if (method === "GET" && segments.length === 4) {
          if (
            [...params.keys()].some(
              (k) =>
                ![
                  "bundle_id",
                  "record_key",
                  "case_id",
                  "representation",
                ].includes(k) || params.getAll(k).length !== 1,
            ) ||
            (params.has("representation") &&
              params.get("representation") !== "export")
          )
            return response(400, { error: "invalid_query" });
          const bundle = params.get("bundle_id"),
            key = params.get("record_key"),
            caseId = params.get("case_id");
          if (
            !bundle ||
            !CANONICAL_ID.test(bundle) ||
            !key ||
            !/^sha256:[a-f0-9]{64}$/.test(key) ||
            (caseId !== null && !CANONICAL_ID.test(caseId))
          )
            return response(400, { error: "invalid_query" });
          const result = response(
            200,
            await intake.readPack(
              { bundle_id: bundle, record_key: key, case_id: caseId },
              params.get("representation") === "export",
            ),
          );
          return params.get("representation") === "export"
            ? {
                ...result,
                headers: {
                  ...JSON_HEADERS,
                  "content-disposition":
                    "attachment; filename=synthetic-preparation-pack-export.json",
                },
              }
            : result;
        }
      }
      if (
        segments.length === 5 &&
        segments[2] === "bundles" &&
        CANONICAL_ID.test(segments[3] ?? "") &&
        ["discovery", "discovery-reviews"].includes(segments[4] ?? "")
      ) {
        const id = segments[3] ?? "";
        const params = new URL(request.path, "http://localhost").searchParams;
        if (method === "POST" && segments[4] === "discovery-reviews") {
          if (params.size) return response(400, { error: "invalid_query" });
          const parsed = parseCommand(request, 131072);
          if ("error" in parsed) return parsed.error;
          return response(
            200,
            await intake.reviewDiscovery(id, parsed.command),
          );
        }
        if (method === "GET" && segments[4] === "discovery") {
          if (
            [...params.keys()].some(
              (key) =>
                !["record_key", "case_id", "representation"].includes(key) ||
                params.getAll(key).length !== 1,
            ) ||
            (params.has("representation") &&
              params.get("representation") !== "export")
          )
            return response(400, { error: "invalid_query" });
          const key = params.get("record_key"),
            caseId = params.get("case_id");
          if (
            !key ||
            !/^sha256:[a-f0-9]{64}$/.test(key) ||
            (caseId !== null && !CANONICAL_ID.test(caseId))
          )
            return response(400, { error: "invalid_query" });
          if (params.get("representation") === "export") {
            // Validate the selected context before returning the complete scoped export.
            // Export itself is reconstructed in one read-only snapshot.
            return {
              ...response(200, await intake.exportDiscovery(id, key, caseId)),
              headers: {
                ...JSON_HEADERS,
                "content-disposition":
                  "attachment; filename=synthetic-discovery-export.json",
              },
            };
          }
          return response(200, await intake.readDiscovery(id, key, caseId));
        }
      }
      if (
        method === "GET" &&
        segments.length === 3 &&
        segments[2] === "bundles"
      )
        return response(200, await intake.list());
      if (
        method === "GET" &&
        segments.length === 4 &&
        segments[2] === "bundles" &&
        CANONICAL_ID.test(segments[3] ?? "")
      )
        return response(200, await intake.read(segments[3] ?? ""));
      if (method === "GET" && segments.length === 3 && segments[2] === "export")
        return {
          ...response(200, await intake.export()),
          headers: {
            ...JSON_HEADERS,
            "content-disposition":
              "attachment; filename=synthetic-intake-export.json",
          },
        };
      if (
        method === "GET" &&
        segments.length === 4 &&
        segments[2] === "artifacts" &&
        /^[0-9a-f]{64}$/.test(segments[3] ?? "")
      ) {
        const rawBody = await intake.artifact(`sha256:${segments[3] ?? ""}`);
        return {
          status: 200,
          body: null,
          rawBody,
          headers: {
            ...JSON_HEADERS,
            "content-type": "application/octet-stream",
            "content-disposition": "attachment; filename=retained-evidence.bin",
            "x-content-type-options": "nosniff",
          },
        };
      }
      if (
        method === "POST" &&
        ((segments.length === 3 &&
          ["preparations", "commits"].includes(segments[2] ?? "")) ||
          (segments.length === 4 &&
            segments[2] === "selections" &&
            segments[3] === "preview"))
      ) {
        const parsed = parseCommand(
          request,
          segments[2] === "preparations"
            ? MAX_INTAKE_HTTP_BYTES
            : MAX_BODY_BYTES,
        );
        if ("error" in parsed) return parsed.error;
        if (segments[2] === "preparations") {
          if (!request.receivedAt)
            throw new Error("Server ingestion timestamp missing");
          return response(
            200,
            await intake.prepare(parsed.command, request.receivedAt),
          );
        }
        return response(
          200,
          segments[2] === "commits"
            ? await intake.commit(parsed.command)
            : await intake.preview(parsed.command),
        );
      }
      return response(404, { error: "not_found" });
    } catch (error) {
      if (error instanceof IntakeInputError)
        return response(
          error.code === "NOT_FOUND"
            ? 404
            : /CONFLICT|REQUIRED|REGRESSION|NO_CHANGE|ALREADY_REVIEWED/.test(
                  error.code,
                )
              ? 409
              : 400,
          { error: error.code, message: error.message },
        );
      throw error;
    }
  }

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
    segments[0] === "v1" &&
    segments[1] === "tenants" &&
    segments[3] === "cases" &&
    (segments.length === 6 || segments.length === 8) &&
    dependencies.credit !== undefined
  ) {
    const tenant = segments[2] ?? "",
      caseId = segments[4] ?? "";
    if (!CANONICAL_ID.test(tenant) || !CANONICAL_ID.test(caseId))
      return response(404, { error: "not_found" });
    if (
      method === "GET" &&
      segments.length === 6 &&
      segments[5] === "simulated-credit"
    ) {
      try {
        const value = await dependencies.credit.read(tenant, caseId);
        return value === undefined
          ? response(404, { error: "not_found" })
          : response(200, value);
      } catch {
        return response(500, { error: "internal_error" });
      }
    }
    const verifying =
      segments.length === 8 &&
      segments[7] === "verifications" &&
      CANONICAL_ID.test(segments[6] ?? "") &&
      dependencies.credit.verify !== undefined;
    if (
      method === "POST" &&
      segments[5] === "simulated-credit-attempts" &&
      (segments.length === 6 || verifying)
    ) {
      const parsed = parseCommand(request);
      if ("error" in parsed) return parsed.error;
      if (
        parsed.command.tenant_id !== tenant ||
        parsed.command.case_id !== caseId ||
        (verifying && parsed.command.attempt_id !== segments[6])
      )
        return response(400, { error: "scope_mismatch" });
      try {
        const result = verifying
          ? await dependencies.credit.verify(parsed.command)
          : await dependencies.credit.execute(parsed.command);
        return response(
          result.status === "conflict" || result.status === "denied"
            ? 409
            : 200,
          result,
        );
      } catch (error) {
        return error instanceof CreditCommandInputError
          ? response(400, { error: "invalid_credit_command" })
          : response(500, { error: "internal_error" });
      }
    }
  }

  if (
    segments[0] === "v1" &&
    segments[1] === "tenants" &&
    segments[2] !== undefined &&
    CANONICAL_ID.test(segments[2]) &&
    dependencies.authority !== undefined
  ) {
    const tenantId = segments[2];
    const authority = dependencies.authority;
    if (
      method === "GET" &&
      segments.length === 4 &&
      segments[3] === "authority-catalog"
    ) {
      const revision = await authority.catalogRevision(tenantId);
      return revision === undefined
        ? response(404, { error: "not_found" })
        : response(200, {
            tenant_id: tenantId,
            authority_state_revision: revision,
            simulation: true,
            synthetic_review_seats: [...SYNTHETIC_REVIEW_SEATS],
            action_permission: false,
          });
    }
    if (segments[3] === "authority-requests") {
      const requestId = segments[4];
      if (
        method === "GET" &&
        requestId !== undefined &&
        CANONICAL_ID.test(requestId) &&
        (segments.length === 5 ||
          (segments.length === 6 && segments[5] === "packet"))
      ) {
        const packet = await authority.read(tenantId, requestId);
        return packet === undefined
          ? response(404, { error: "not_found" })
          : response(200, packet);
      }
      const isCreate = segments.length === 4;
      const isDecide =
        segments.length === 7 &&
        segments[5] === "decisions" &&
        requestId !== undefined &&
        CANONICAL_ID.test(requestId);
      if (method === "POST" && (isCreate || isDecide)) {
        const parsed = parseCommand(request);
        if ("error" in parsed) return parsed.error;
        if (parsed.command.tenant_id !== tenantId)
          return response(400, { error: "tenant_mismatch" });
        if (
          parsed.command.type !==
            (isCreate
              ? "authority.request.create"
              : "authority.request.decide") ||
          (!isCreate && parsed.command.authority_request_id !== requestId)
        )
          return response(400, { error: "request_binding_mismatch" });
        try {
          const result = isCreate
            ? await authority.create(parsed.command)
            : await authority.decide(parsed.command, segments[6] ?? "");
          return response(result.status === "conflict" ? 409 : 200, {
            status: result.status,
            ...(result.code === undefined ? {} : { code: result.code }),
            receipt: result.receipt,
          });
        } catch (error) {
          return error instanceof AuthorityCommandInputError
            ? response(400, { error: "invalid_authority_command" })
            : response(500, { error: "internal_error" });
        }
      }
    }
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
