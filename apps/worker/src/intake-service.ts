import { PostgresPreparationWorkStore } from "../../../packages/runtime/src/postgres-preparation-work-store.js";
import { PostgresPreparationPackStore } from "../../../packages/runtime/src/postgres-preparation-pack-store.js";
import type { PackTarget } from "../../../packages/runtime/src/preparation-pack.js";
import { PostgresDiscoveryStore } from "../../../packages/runtime/src/postgres-discovery-store.js";
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
    readonly discovery?: PostgresDiscoveryStore,
    readonly pack?: PostgresPreparationPackStore,
    readonly work?: PostgresPreparationWorkStore,
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
  readDiscovery(
    id: string,
    key: string,
    caseId: string | null,
  ): Promise<JsonObject> {
    return this.json(() => {
      if (!this.discovery)
        throw new IntakeInputError("NOT_FOUND", "Discovery is unavailable");
      return this.discovery.read(id, key, caseId);
    });
  }
  reviewDiscovery(id: string, command: unknown): Promise<JsonObject> {
    return this.json(() => {
      if (!this.discovery)
        throw new IntakeInputError("NOT_FOUND", "Discovery is unavailable");
      return this.discovery.submit(id, command, this.dependencies().now);
    });
  }
  exportDiscovery(
    id: string,
    key: string,
    caseId: string | null,
  ): Promise<JsonObject> {
    return this.json(() => {
      if (!this.discovery)
        throw new IntakeInputError("NOT_FOUND", "Discovery is unavailable");
      return this.discovery.export(id, key, caseId);
    });
  }
  readPack(target: PackTarget, exporting = false): Promise<JsonObject> {
    return this.json(() => {
      if (!this.pack)
        throw new IntakeInputError(
          "NOT_FOUND",
          "Preparation publication is unavailable",
        );
      return exporting
        ? this.pack.export(target, this.dependencies().now)
        : this.pack.read(target, this.dependencies().now);
    });
  }
  selectPack(command: unknown, seat: string): Promise<JsonObject> {
    return this.json(() => {
      if (!this.pack)
        throw new IntakeInputError(
          "NOT_FOUND",
          "Preparation publication is unavailable",
        );
      return this.pack.submit(command, seat, this.dependencies().now);
    });
  }
  readWork(
    caseId: string,
    recordKey: string,
    exporting = false,
  ): Promise<JsonObject> {
    return this.json(() => {
      if (!this.work)
        throw new IntakeInputError(
          "NOT_FOUND",
          "Preparation work is unavailable",
        );
      return exporting
        ? this.work.export(caseId, recordKey, this.dependencies().now)
        : this.work.read(caseId, recordKey, this.dependencies().now);
    });
  }
  submitWork(command: unknown): Promise<JsonObject> {
    return this.json(() => {
      if (!this.work)
        throw new IntakeInputError(
          "NOT_FOUND",
          "Preparation work is unavailable",
        );
      return this.work.submit(command, this.dependencies().now);
    });
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
