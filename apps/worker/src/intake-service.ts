import { randomUUID } from "node:crypto";
import {
  CanonicalJsonError,
  ContractValidationError,
  immutableJson,
} from "../../../packages/contracts/src/index.js";
import { PostgresIntakeStore } from "../../../packages/runtime/src/postgres-intake-store.js";
import {
  IntakeError,
  type IntakeObject,
} from "../../../packages/runtime/src/intake.js";
import type { CaseEngineDependencies } from "../../../packages/runtime/src/case-engine.js";
import type { JsonValue } from "../../../packages/contracts/src/index.js";
type JsonObject = { readonly [key: string]: JsonValue };
export class IntakeInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IntakeInputError";
  }
}
export class TransactionalIntakeWorker {
  constructor(
    readonly store: PostgresIntakeStore,
    readonly dependencies: () => CaseEngineDependencies = () => ({
      now: (): Date => new Date(),
      nextId: (kind): string => `${kind}_${randomUUID().replaceAll("-", "_")}`,
    }),
  ) {}
  private async json(
    operation: () => Promise<IntakeObject>,
  ): Promise<JsonObject> {
    try {
      return immutableJson(await operation()) as JsonObject;
    } catch (error) {
      if (error instanceof IntakeError)
        throw new IntakeInputError(error.code, error.message);
      if (
        error instanceof ContractValidationError ||
        error instanceof CanonicalJsonError
      )
        throw new IntakeInputError(
          "INVALID_INPUT",
          "Intake input does not match the strict synthetic contract",
        );
      throw error;
    }
  }
  prepare(command: unknown, ingestedAt: string): Promise<JsonObject> {
    return this.json(() =>
      this.store.prepare(command, ingestedAt, this.dependencies().now),
    );
  }
  commit(command: unknown): Promise<JsonObject> {
    return this.json(() => this.store.commit(command, this.dependencies()));
  }
  preview(command: unknown): Promise<JsonObject> {
    return this.json(() => this.store.preview(command));
  }
  read(id: string): Promise<JsonObject> {
    return this.json(() => this.store.read(id));
  }
  list(): Promise<JsonObject> {
    return this.json(() => this.store.list());
  }
  export(): Promise<JsonObject> {
    return this.json(() => this.store.export());
  }
  async artifact(hash: string): Promise<Buffer> {
    try {
      return await this.store.artifact(hash);
    } catch (error) {
      if (error instanceof IntakeError)
        throw new IntakeInputError(error.code, error.message);
      throw error;
    }
  }
}
