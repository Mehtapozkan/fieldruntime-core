import preparationWorkV2Schema from "../schemas/preparation-work.v2.schema.json" with { type: "json" };
import preparationPackV3Schema from "../schemas/preparation-pack.v3.schema.json" with { type: "json" };
import preparationWorkSchema from "../schemas/preparation-work.v1.schema.json" with { type: "json" };
import preparationPackV2Schema from "../schemas/preparation-pack.v2.schema.json" with { type: "json" };
import preparationPackSchema from "../schemas/preparation-pack.v1.schema.json" with { type: "json" };
import discoverySchema from "../schemas/discovery.v1.schema.json" with { type: "json" };
import intakeSchema from "../schemas/intake.v1.schema.json" with { type: "json" };
import simulatedCreditSchema from "../schemas/simulated-credit.v1.schema.json" with { type: "json" };
import simulatedCreditV2Schema from "../schemas/simulated-credit.v2.schema.json" with { type: "json" };
import Ajv2020Module, {
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import authorityDecisionSchema from "../schemas/authority-decision.v0.schema.json" with { type: "json" };
import authorityPolicySchema from "../schemas/authority-policy.v0.schema.json" with { type: "json" };
import authorityRecordSchema from "../schemas/authority-record.v0.schema.json" with { type: "json" };
import authorityRequestSchema from "../schemas/authority-request.v0.schema.json" with { type: "json" };
import authorityResolutionResultSchema from "../schemas/authority-resolution-result.v0.schema.json" with { type: "json" };
import caseSchema from "../schemas/case.v0.schema.json" with { type: "json" };
import caseResponsibilitySchema from "../schemas/case-responsibility.v0.schema.json" with { type: "json" };
import delegationGrantSchema from "../schemas/delegation-grant.v0.schema.json" with { type: "json" };
import guidedWalkthroughSchema from "../schemas/guided-walkthrough.v0.schema.json" with { type: "json" };
import identityReferenceSchema from "../schemas/identity-reference.v0.schema.json" with { type: "json" };
import journalEntrySchema from "../schemas/case-journal-entry.v0.schema.json" with { type: "json" };
import requestV1Schema from "../schemas/authority-request.v1.schema.json" with { type: "json" };
import decisionV1Schema from "../schemas/authority-decision.v1.schema.json" with { type: "json" };
import reviewSupportSchema from "../schemas/authority-review-support.v1.schema.json" with { type: "json" };
import reviewCommandSchema from "../schemas/authority-command.v1.schema.json" with { type: "json" };
import reviewJournalSchema from "../schemas/authority-request-journal-entry.v1.schema.json" with { type: "json" };
import reviewReadSchema from "../schemas/authority-request-read-response.v1.schema.json" with { type: "json" };
import {
  type AuthorityContractViolation,
  validateAuthorityDecisionInvariants,
  validateAuthorityPolicyInvariants,
  validateAuthorityRecordInvariants,
  validateAuthorityRequestInvariants,
  validateAuthorityResolutionResultInvariants,
  validateCaseResponsibilityInvariants,
  validateDelegationGrantInvariants,
} from "./authority-contracts.js";
import { canonicalizeJson, type JsonValue } from "./canonical-json.js";

const Ajv2020 = Ajv2020Module.default;
const addFormats = addFormatsModule.default;

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  ownProperties: true,
  strict: true,
});
addFormats(ajv);

const validateIdentityReference = ajv.compile(identityReferenceSchema);
const validateAuthorityDecision = ajv.compile(authorityDecisionSchema);
const validateAuthorityPolicy = ajv.compile(authorityPolicySchema);
const validateAuthorityRecord = ajv.compile(authorityRecordSchema);
const validateAuthorityRequest = ajv.compile(authorityRequestSchema);
const validateAuthorityResolutionResult = ajv.compile(
  authorityResolutionResultSchema,
);
const validateCase = ajv.compile(caseSchema);
const validateCaseResponsibility = ajv.compile(caseResponsibilitySchema);
const validateDelegationGrant = ajv.compile(delegationGrantSchema);
const validateGuidedWalkthrough = ajv.compile(guidedWalkthroughSchema);
const validateJournalEntry = ajv.compile(journalEntrySchema);
ajv.addSchema(reviewSupportSchema);
const reviewValidators = {
  request: ajv.compile(requestV1Schema),
  decision: ajv.compile(decisionV1Schema),
  command: ajv.compile(reviewCommandSchema),
  journal: ajv.compile(reviewJournalSchema),
  read: ajv.compile(reviewReadSchema),
  catalog: ajv.compile({ $ref: `${reviewSupportSchema.$id}#/$defs/catalog` }),
  material: ajv.compile({ $ref: `${reviewSupportSchema.$id}#/$defs/material` }),
  evaluation: ajv.compile({
    $ref: `${reviewSupportSchema.$id}#/$defs/evaluation_snapshot`,
  }),
};

ajv.addSchema(simulatedCreditSchema);
const creditValidators = Object.fromEntries(
  (["command", "envelope", "journal", "source", "read"] as const).map(
    (kind) => [
      kind,
      ajv.compile({ $ref: `${simulatedCreditSchema.$id}#/$defs/${kind}` }),
    ],
  ),
) as Record<
  "command" | "envelope" | "journal" | "source" | "read",
  ValidateFunction
>;
ajv.addSchema(intakeSchema);
const intakeValidators = Object.fromEntries(
  (
    [
      "prepare",
      "bundle",
      "review",
      "selection",
      "material",
      "case_command",
      "receipt",
      "view",
      "preview",
      "prepare_result",
      "commit_result",
      "list",
      "export",
      "request_binding",
    ] as const
  ).map((kind) => [
    kind,
    ajv.compile({ $ref: `${intakeSchema.$id}#/$defs/${kind}` }),
  ]),
) as Record<
  | "prepare"
  | "bundle"
  | "review"
  | "selection"
  | "material"
  | "case_command"
  | "receipt"
  | "view"
  | "preview"
  | "prepare_result"
  | "commit_result"
  | "list"
  | "export"
  | "request_binding",
  ValidateFunction
>;
ajv.addSchema(discoverySchema);
const discoveryValidators = Object.fromEntries(
  (["command", "material", "journal", "read", "result", "export"] as const).map(
    (kind) => [
      kind,
      ajv.compile({ $ref: `${discoverySchema.$id}#/$defs/${kind}` }),
    ],
  ),
) as Record<
  "command" | "material" | "journal" | "read" | "result" | "export",
  ValidateFunction
>;
ajv.addSchema(preparationPackSchema);
const packValidators = Object.fromEntries(
  (
    [
      "profile",
      "artifact",
      "command",
      "journal",
      "read",
      "result",
      "export",
    ] as const
  ).map((kind) => [
    kind,
    ajv.compile({ $ref: `${preparationPackSchema.$id}#/$defs/${kind}` }),
  ]),
) as Record<
  "profile" | "artifact" | "command" | "journal" | "read" | "result" | "export",
  ValidateFunction
>;
ajv.addSchema(preparationWorkSchema);
ajv.addSchema(preparationPackV2Schema);
ajv.addSchema(preparationWorkV2Schema);
ajv.addSchema(preparationPackV3Schema);
const packV2Validators = Object.fromEntries(
  ["profile", "artifact", "command", "journal", "read", "result", "export"].map(
    (kind) => [
      kind,
      ajv.compile({ $ref: `${preparationPackV2Schema.$id}#/$defs/${kind}` }),
    ],
  ),
) as Record<keyof typeof packValidators, ValidateFunction>;
const workValidators = Object.fromEntries(
  [
    "profile",
    "note",
    "binding",
    "command",
    "input",
    "result",
    "journal",
    "receipt",
    "read",
    "export",
  ].map((kind) => [
    kind,
    ajv.compile({ $ref: `${preparationWorkSchema.$id}#/$defs/${kind}` }),
  ]),
) as Record<
  | "profile"
  | "note"
  | "binding"
  | "command"
  | "input"
  | "result"
  | "journal"
  | "receipt"
  | "read"
  | "export",
  ValidateFunction
>;
const packV3Validators = Object.fromEntries(
  Object.keys(packValidators).map((kind) => [
    kind,
    ajv.compile({ $ref: `${preparationPackV3Schema.$id}#/$defs/${kind}` }),
  ]),
) as Record<keyof typeof packValidators, ValidateFunction>;
const workV2Validators = Object.fromEntries(
  [...Object.keys(workValidators), "preflight"].map((kind) => [
    kind,
    ajv.compile({ $ref: `${preparationWorkV2Schema.$id}#/$defs/${kind}` }),
  ]),
) as Record<keyof typeof workValidators | "preflight", ValidateFunction>;
export function assertValidPreparationPackV3Contract(
  kind: keyof typeof packValidators,
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(packV3Validators[kind], value, `preparation-pack.v3/${kind}`);
}
export function assertValidPreparationWorkV2Contract(
  kind: keyof typeof workV2Validators,
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(workV2Validators[kind], value, `preparation-work.v2/${kind}`);
}
export function assertValidPreparationPackV2Contract(
  kind: keyof typeof packV2Validators,
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(packV2Validators[kind], value, `preparation-pack.v2/${kind}`);
}
export function assertValidPreparationWorkContract(
  kind: keyof typeof workValidators,
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(workValidators[kind], value, `preparation-work.v1/${kind}`);
}
export function assertValidPreparationPackContract(
  kind: keyof typeof packValidators,
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(packValidators[kind], value, `preparation-pack.v1/${kind}`);
}

export function assertValidDiscoveryContract(
  kind: keyof typeof discoveryValidators,
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(discoveryValidators[kind], value, `discovery.v1/${kind}`);
}

export function assertValidIntakeContract(
  kind: keyof typeof intakeValidators,
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(intakeValidators[kind], value, `intake.v1/${kind}`);
}

export function assertValidSimulatedCreditContract(
  kind: keyof typeof creditValidators,
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(creditValidators[kind], value, `simulated-credit.v1/${kind}`);
}

ajv.addSchema(simulatedCreditV2Schema);
const creditV2Validators = Object.fromEntries(
  (
    [
      "envelope",
      "journal",
      "read",
      "verify_command",
      "raw",
      "observation",
      "comparison",
      "verification",
    ] as const
  ).map((kind) => [
    kind,
    ajv.compile({ $ref: `${simulatedCreditV2Schema.$id}#/$defs/${kind}` }),
  ]),
) as Record<
  | "envelope"
  | "journal"
  | "read"
  | "verify_command"
  | "raw"
  | "observation"
  | "comparison"
  | "verification",
  ValidateFunction
>;
export function assertValidSimulatedCreditV2Contract(
  kind: keyof typeof creditV2Validators,
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(
    creditV2Validators[kind],
    value,
    `simulated-credit.v2/${kind}`,
  );
}

export function assertValidAuthorityReviewContract(
  kind: keyof typeof reviewValidators,
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(reviewValidators[kind], value, `authority-review.v1/${kind}`);
}

export class ContractValidationError extends Error {
  readonly code = "CONTRACT_VALIDATION_FAILED";
  readonly errors: readonly ErrorObject[];

  constructor(
    contract: string,
    errors: readonly ErrorObject[],
    inputError?: string,
  ) {
    super(
      inputError === undefined
        ? `${contract} validation failed: ${ajv.errorsText([...errors])}`
        : `${contract} validation failed: ${inputError}`,
    );
    this.name = "ContractValidationError";
    this.errors = Object.freeze([...errors]);
  }
}

function assertContract(
  validate: ValidateFunction,
  value: unknown,
  contract: string,
): asserts value is Record<string, unknown> {
  let normalized: JsonValue;
  try {
    normalized = canonicalizeJson(value);
  } catch (error) {
    throw new ContractValidationError(
      contract,
      [],
      error instanceof Error ? error.message : "input is not canonical JSON",
    );
  }
  if (!validate(normalized)) {
    throw new ContractValidationError(contract, validate.errors ?? []);
  }
}

function assertContractWithInvariants(
  validate: ValidateFunction,
  value: unknown,
  contract: string,
  validateInvariants: (candidate: unknown) => AuthorityContractViolation[],
): asserts value is Record<string, unknown> {
  assertContract(validate, value, contract);
  const violations = validateInvariants(value);
  if (violations.length > 0) {
    throw new ContractValidationError(
      contract,
      [],
      violations
        .map(({ code, message, path }) => `${code} at ${path}: ${message}`)
        .join("; "),
    );
  }
}

export function assertValidIdentityReference(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(validateIdentityReference, value, "identity-reference.v0");
}

export function assertValidCaseResponsibility(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContractWithInvariants(
    validateCaseResponsibility,
    value,
    "case-responsibility.v0",
    validateCaseResponsibilityInvariants,
  );
}

export function assertValidDelegationGrant(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContractWithInvariants(
    validateDelegationGrant,
    value,
    "delegation-grant.v0",
    validateDelegationGrantInvariants,
  );
}

export function assertValidAuthorityRequest(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContractWithInvariants(
    validateAuthorityRequest,
    value,
    "authority-request.v0",
    validateAuthorityRequestInvariants,
  );
}

export function assertValidAuthorityPolicy(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContractWithInvariants(
    validateAuthorityPolicy,
    value,
    "authority-policy.v0",
    validateAuthorityPolicyInvariants,
  );
}

export function assertValidAuthorityRecord(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContractWithInvariants(
    validateAuthorityRecord,
    value,
    "authority-record.v0",
    validateAuthorityRecordInvariants,
  );
}

export function assertValidAuthorityDecision(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContractWithInvariants(
    validateAuthorityDecision,
    value,
    "authority-decision.v0",
    validateAuthorityDecisionInvariants,
  );
}

export function assertValidAuthorityResolutionResult(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContractWithInvariants(
    validateAuthorityResolutionResult,
    value,
    "authority-resolution-result.v0",
    validateAuthorityResolutionResultInvariants,
  );
}

export function assertValidCaseDocument(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(validateCase, value, "case.v0");
}

export function assertValidCaseJournalEntry(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(validateJournalEntry, value, "case-journal-entry.v0");
}

export function assertValidGuidedWalkthrough(
  value: unknown,
): asserts value is Record<string, unknown> {
  assertContract(validateGuidedWalkthrough, value, "guided-walkthrough.v0");
}
