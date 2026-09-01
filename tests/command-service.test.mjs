import assert from "node:assert/strict";
import test from "node:test";
import {
  CaseCommandInputError,
  TransactionalCaseWorker,
} from "../dist/apps/worker/src/command-service.js";
import {
  CanonicalJsonError,
  ContractValidationError,
} from "../dist/packages/contracts/src/index.js";
import {
  CaseEngineError,
  emptyCaseEngine,
  executeCaseCommand,
  PostgresStoreError,
} from "../dist/packages/runtime/src/index.js";

const dependencyFactory = {
  create() {
    return {
      now: () => new Date("2026-09-01T16:00:00.000Z"),
      nextId: (kind) => `${kind}_command_service_test`,
    };
  },
};

function throwingWorker(error) {
  return new TransactionalCaseWorker(
    {
      async execute() {
        throw error;
      },
    },
    dependencyFactory,
  );
}

test("the worker gives every command-input failure one public taxonomy", async () => {
  for (const error of [
    new CaseEngineError("INVALID_COMMAND", "private parser detail"),
    new CaseEngineError("CASE_INVARIANT_VIOLATION", "private invariant"),
    new ContractValidationError("case.v0", []),
    new CanonicalJsonError("$", "private canonical detail"),
  ]) {
    await assert.rejects(
      throwingWorker(error).execute({}),
      CaseCommandInputError,
    );
  }

  const engineWorker = new TransactionalCaseWorker(
    {
      async execute(command, dependencies) {
        return executeCaseCommand(emptyCaseEngine(), command, dependencies);
      },
    },
    dependencyFactory,
  );
  await assert.rejects(
    engineWorker.execute({ tenant_id: "tenant_orchid" }),
    CaseCommandInputError,
  );
});

test("the worker preserves dependency, integrity, and storage failures", async () => {
  for (const error of [
    new CaseEngineError("INVALID_DEPENDENCY_RESULT", "bad clock"),
    new CaseEngineError("STATE_INTEGRITY", "bad state"),
    new PostgresStoreError("STORE_INTEGRITY", "bad store"),
    new Error("driver unavailable"),
  ]) {
    await assert.rejects(
      throwingWorker(error).execute({}),
      (received) => received === error,
    );
  }
});
