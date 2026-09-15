import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { errorMonitor } from "node:events";
import { performance } from "node:perf_hooks";
import { setTimeout, clearTimeout } from "node:timers";
import os from "node:os";
const parentEntry = performance.now();
const processAgeAtEntry = process.uptime() * 1000;
const [repo, inputPath, resultPath, arm, stage, slot] = process.argv.slice(2);
assert.equal(process.versions.node, "24.19.0");
assert.equal(process.versions.tz, "2026b");
assert.equal(process.env.NODE_OPTIONS, undefined);
assert.deepEqual(process.execArgv, []);
const expected = JSON.parse(
  await readFile(new URL("./expected.json", import.meta.url), "utf8"),
).stages[stage];
const mod = (p) => import(pathToFileURL(resolve(repo, p)));
// Required parent imports precede its interval, as in the unchanged store.
// The fresh worker loads its own modules inside the interval and deadline.
const { fixedPreparationPort } = await mod(
  "dist/packages/runtime/src/preparation-worker-port.js",
);
const { validateWorkerResult } = await mod(
  "dist/packages/runtime/src/preparation-work.js",
);
const { canonicalJson, sha256Json } = await mod(
  "dist/packages/contracts/src/canonical-json.js",
);
const input = JSON.parse(await readFile(inputPath, "utf8"));
const golden = await readFile(resultPath, "utf8");
assert.equal(sha256Json(input), expected.input_fingerprint);
assert.equal(sha256Json(input.artifact), expected.pack_fingerprint);
assert.equal(sha256Json(JSON.parse(golden)), expected.result_hash);
const events = [];
let resourceLimits,
  workerCount = 0,
  resolveExit,
  tick;
const exited = new Promise((resolve) => {
  resolveExit = resolve;
});
process.once("worker", (worker) => {
  workerCount++;
  resourceLimits = { ...worker.resourceLimits };
  events.push({ event: "created", elapsed_ms: performance.now() - tick });
  worker.once("online", () =>
    events.push({ event: "online", elapsed_ms: performance.now() - tick }),
  );
  worker.once("message", () =>
    events.push({ event: "message", elapsed_ms: performance.now() - tick }),
  );
  worker.once(errorMonitor, (error) =>
    events.push({
      event: "error",
      elapsed_ms: performance.now() - tick,
      name: error.name,
      message: error.message,
    }),
  );
  worker.once("exit", (code) => {
    events.push({ event: "exit", elapsed_ms: performance.now() - tick, code });
    resolveExit();
  });
});
const observation = {
  slot: Number(slot),
  arm,
  stage,
  node: process.versions.node,
  tz: process.versions.tz,
  cpu_allowance: os.availableParallelism(),
  input_fingerprint: sha256Json(input),
  pack_fingerprint: sha256Json(input.artifact),
  budget_ms: 5000,
  worker_env: {},
  events,
  parent_script_entry_after_process_start_ms: processAgeAtEntry,
};
let execution, timeout, raw, failure;
observation.parent_initialization_ms = performance.now() - parentEntry;
tick = performance.now();
try {
  execution = fixedPreparationPort(input);
  raw = await Promise.race([
    execution.completion,
    new Promise((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              "Preparation exceeded the five-second computation budget",
            ),
          ),
        5000,
      );
    }),
  ]);
  observation.completion_ms = performance.now() - tick;
} catch (error) {
  failure = { name: error.name, message: error.message };
} finally {
  if (timeout) clearTimeout(timeout);
  try {
    execution?.cancel();
    observation.cancel_called = Boolean(execution);
  } catch (error) {
    observation.cancellation_error = error.message;
  }
}
observation.worker_interval_ms = performance.now() - tick;
observation.within_deadline = observation.worker_interval_ms <= 5000;
observation.deadline_margin_ms = 5000 - observation.worker_interval_ms;
observation.resource_limits = resourceLimits;
observation.native_workers = workerCount;
const validationStart = performance.now();
try {
  assert.equal(workerCount, 1, "Native isolate count changed");
  assert.equal(resourceLimits.maxOldGenerationSizeMb, 128);
  assert.equal(resourceLimits.maxYoungGenerationSizeMb, 32);
  assert.equal(
    observation.cancellation_error,
    undefined,
    "Cancellation failed",
  );
  if (failure || !observation.within_deadline) {
    observation.outcome = "worker_failed";
    observation.failure = failure ?? {
      name: "Error",
      message: "Monotonic five-second computation budget exceeded",
    };
    observation.parent_conformance = false;
    process.exitCode = 1;
  } else {
    const result = validateWorkerResult(input, raw);
    assert.equal(
      canonicalJson(result),
      golden,
      "Complete qualified result changed",
    );
    assert.equal(sha256Json(result), expected.result_hash);
    observation.result_hash = sha256Json(result);
    observation.full_canonical_result_equal = true;
    observation.parent_conformance = true;
    observation.outcome = "completed_conformant";
  }
} catch (error) {
  observation.outcome = "safety_or_semantic_mismatch";
  observation.failure = {
    name: error.name,
    message: error.message,
    code: error.code ?? null,
  };
  observation.parent_conformance = false;
  process.exitCode = 2;
}
observation.parent_validation_ms = performance.now() - validationStart;
if (workerCount) await exited;
observation.observation_end_ms = performance.now() - tick;
observation.phase_limit =
  "Native online is not module initialization complete; separate import/computation phases unavailable. Parent initialization excludes bootstrap before script entry; whole parent process is measured by the orchestrator.";
console.log(JSON.stringify(observation));
