import { randomUUID } from "node:crypto";
import {
  ContractValidationError,
  assertValidSimulatedCreditV2Contract,
} from "../../../packages/contracts/src/index.js";
import { PostgresCreditVerificationStore } from "../../../packages/runtime/src/postgres-credit-verification-store.js";
import type { CreditDependencies } from "../../../packages/runtime/src/postgres-simulated-credit-store.js";
import type { ObjectValue } from "../../../packages/runtime/src/authority-review-types.js";
import { CreditCommandInputError } from "./simulated-credit-service.js";
export class TransactionalCreditVerificationWorker {
  constructor(
    readonly store: PostgresCreditVerificationStore,
    readonly dependencies: () => CreditDependencies = () => ({
      now: (): Date => new Date(),
      nextId: (): string => `verification_${randomUUID().replaceAll("-", "_")}`,
    }),
  ) {}
  async verify(command: unknown): Promise<ObjectValue> {
    try {
      assertValidSimulatedCreditV2Contract("verify_command", command);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new CreditCommandInputError(
          "invalid credit verification command",
          { cause: error },
        );
      throw error;
    }
    return this.store.verify(command, this.dependencies());
  }
}
