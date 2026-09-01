import { randomUUID } from "node:crypto";
import {
  CanonicalJsonError,
  ContractValidationError,
} from "../../../packages/contracts/src/index.js";
import {
  CaseEngineError,
  PostgresCaseStore,
  type CaseCommandResult,
  type CaseEngineDependencies,
} from "../../../packages/runtime/src/index.js";

const COMMAND_INPUT_ERROR_CODES = new Set([
  "CASE_INVARIANT_VIOLATION",
  "INVALID_COMMAND",
  "SCOPE_EXPANSION",
  "TENANT_MISMATCH",
]);

export class CaseCommandInputError extends Error {
  readonly code = "CASE_COMMAND_INPUT_INVALID";

  constructor(options: ErrorOptions) {
    super("case command input is invalid", options);
    this.name = "CaseCommandInputError";
  }
}

function isCommandInputError(error: unknown): boolean {
  return (
    error instanceof CanonicalJsonError ||
    error instanceof ContractValidationError ||
    (error instanceof CaseEngineError &&
      COMMAND_INPUT_ERROR_CODES.has(error.code))
  );
}

export interface CommandDependencyFactory {
  create(): CaseEngineDependencies;
}

export class TransactionalCaseWorker {
  readonly #store: PostgresCaseStore;
  readonly #dependencies: CommandDependencyFactory;

  constructor(
    store: PostgresCaseStore,
    dependencies: CommandDependencyFactory = systemDependencies,
  ) {
    this.#store = store;
    this.#dependencies = dependencies;
  }

  async execute(command: unknown): Promise<CaseCommandResult> {
    try {
      return await this.#store.execute(command, this.#dependencies.create());
    } catch (error) {
      if (isCommandInputError(error)) {
        throw new CaseCommandInputError({ cause: error });
      }
      throw error;
    }
  }
}

const systemDependencies: CommandDependencyFactory = Object.freeze({
  create(): CaseEngineDependencies {
    return {
      now: () => new Date(),
      nextId: (kind): string => {
        const prefix = kind === "audit_entry" ? "audit" : "journal";
        return `${prefix}_${randomUUID().replaceAll("-", "_")}`;
      },
    };
  },
});
