import { randomUUID } from "node:crypto";
import {
  ContractValidationError,
  assertValidSimulatedCreditContract,
} from "../../../packages/contracts/src/index.js";
import {
  AuthorityReviewError,
  type ObjectValue,
} from "../../../packages/runtime/src/authority-review-types.js";
import {
  PostgresSimulatedCreditStore,
  type CreditDependencies,
} from "../../../packages/runtime/src/postgres-simulated-credit-store.js";
export class CreditCommandInputError extends Error {}
export class TransactionalCreditWorker {
  constructor(
    readonly store: PostgresSimulatedCreditStore,
    readonly dependencies: () => CreditDependencies = () => ({
      now: (): Date => new Date(),
      nextId: (): string => `attempt_${randomUUID().replaceAll("-", "_")}`,
    }),
  ) {}
  async execute(command: unknown): Promise<ObjectValue> {
    try {
      assertValidSimulatedCreditContract("command", command);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new CreditCommandInputError("invalid simulated credit command", {
          cause: error,
        });
      throw error;
    }
    try {
      return await this.store.execute(command, this.dependencies());
    } catch (error) {
      if (
        error instanceof AuthorityReviewError &&
        error.code === "CREDIT_INPUT_INVALID"
      )
        throw new CreditCommandInputError("invalid simulated credit command", {
          cause: error,
        });
      throw error;
    }
  }
}
