import requestV0 from "../schemas/authority-request.v0.schema.json" with { type: "json" };
import decisionV0 from "../schemas/authority-decision.v0.schema.json" with { type: "json" };
import { immutableJson, type JsonValue } from "./canonical-json.js";
import {
  assertValidAuthorityRequest,
  assertValidAuthorityDecision,
  assertValidAuthorityReviewContract,
  ContractValidationError,
} from "./validators.js";

export type ReviewObject = Readonly<Record<string, JsonValue>>;

// The allowlist is the unchanged v0 schema. Validate the complete v1 boundary
// first: projecting unknown input would otherwise silently discard privileges.
function project(
  value: ReviewObject,
  fields: readonly string[],
  version: string,
): ReviewObject {
  return immutableJson(
    Object.fromEntries([
      ...fields
        .filter((key) => key !== "schema_version" && Object.hasOwn(value, key))
        .map((key) => [key, value[key]]),
      ["schema_version", version],
    ]),
  ) as ReviewObject;
}

export function requestV1ToV0(value: unknown): ReviewObject {
  assertValidAuthorityReviewContract("request", value);
  const request = immutableJson(value) as ReviewObject;
  if (
    typeof request.expires_at !== "string" ||
    typeof request.requested_at !== "string" ||
    Date.parse(request.expires_at) <= Date.parse(request.requested_at)
  ) {
    throw new ContractValidationError(
      "authority-request.v1",
      [],
      "expiry must follow creation",
    );
  }
  const projected = project(
    request,
    Object.keys(requestV0.properties),
    "authority-request.v0",
  );
  assertValidAuthorityRequest(projected);
  return projected;
}

export function decisionV1ToV0(value: unknown): ReviewObject {
  assertValidAuthorityReviewContract("decision", value);
  const projected = project(
    immutableJson(value) as ReviewObject,
    Object.keys(decisionV0.properties),
    "authority-decision.v0",
  );
  assertValidAuthorityDecision(projected);
  return projected;
}
