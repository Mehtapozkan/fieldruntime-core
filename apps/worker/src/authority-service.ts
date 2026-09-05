import { randomUUID } from "node:crypto";
import {
  CanonicalJsonError,
  ContractValidationError,
} from "../../../packages/contracts/src/index.js";
import {
  AuthorityReviewError,
  PostgresAuthorityStore,
  type ReviewActor,
  type ReviewDependencies,
} from "../../../packages/runtime/src/index.js";
import type { AuthorityCommandResult } from "../../../packages/runtime/src/authority-review.js";

export class AuthorityCommandInputError extends Error {
  constructor(options: ErrorOptions) {
    super("authority command input is invalid", options);
    this.name = "AuthorityCommandInputError";
  }
}
export const SYNTHETIC_REVIEW_SEATS = Object.freeze([
  "business",
  "finance",
  "executive",
  "finance_delegate",
]);

export class TransactionalAuthorityWorker {
  constructor(
    readonly store: PostgresAuthorityStore,
    readonly dependencies: () => ReviewDependencies = () => ({
      now: (): Date => new Date(),
      nextId: (kind): string => `${kind}_${randomUUID().replaceAll("-", "_")}`,
    }),
  ) {}

  async create(command: unknown): Promise<AuthorityCommandResult> {
    return this.execute(command, "operator");
  }
  async decide(
    command: unknown,
    seat: string,
  ): Promise<AuthorityCommandResult> {
    if (!SYNTHETIC_REVIEW_SEATS.includes(seat))
      throw new AuthorityCommandInputError({ cause: "unknown synthetic seat" });
    return this.execute(command, seat as ReviewActor);
  }
  private async execute(
    command: unknown,
    actor: ReviewActor,
  ): Promise<AuthorityCommandResult> {
    try {
      return await this.store.execute(command, actor, this.dependencies());
    } catch (error) {
      if (
        error instanceof ContractValidationError ||
        error instanceof CanonicalJsonError ||
        (error instanceof AuthorityReviewError &&
          ["REVIEW_INPUT_INVALID", "EVIDENCE_UNAVAILABLE"].includes(error.code))
      ) {
        throw new AuthorityCommandInputError({ cause: error });
      }
      throw error;
    }
  }
}
