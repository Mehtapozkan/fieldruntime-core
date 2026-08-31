import Ajv2020Module, {
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import caseSchema from "../schemas/case.v0.schema.json" with { type: "json" };
import journalEntrySchema from "../schemas/case-journal-entry.v0.schema.json" with { type: "json" };
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

const validateCase = ajv.compile(caseSchema);
const validateJournalEntry = ajv.compile(journalEntrySchema);

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
