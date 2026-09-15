import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
const root = pathToFileURL(
  resolve(process.env.CORE_EXPERIMENT_CANDIDATE) + "/",
);
const destination = resolve(process.env.CORE_EXPERIMENT_OUTPUT);
const expected = JSON.parse(
  await readFile(new URL("./expected.json", import.meta.url), "utf8"),
);
assert.equal(process.versions.node, "24.19.0");
assert.equal(process.versions.tz, "2026b");
assert.equal(process.env.NODE_OPTIONS, undefined);
const mod = (p) => import(new URL(p, root));
const { resultHost } = await mod("tests/helpers/dispute-result.mjs");
const { validateWorkExport, workInput, validateWorkerResult } = await mod(
  "dist/packages/runtime/src/preparation-work.js",
);
const { canonicalJson, sha256Json } = await mod(
  "dist/packages/contracts/src/canonical-json.js",
);
test("untimed unchanged trusted fixture qualifies exact recorded v1/v2 inputs and results", async (t) => {
  const r = await resultHost(t, { prepare: true });
  const state = validateWorkExport(r.workBefore);
  const view = await r.h.ok(r.flow.path);
  await mkdir(resolve(destination, "private-inputs"), { recursive: true });
  await mkdir(resolve(destination, "public/qualified-results"), {
    recursive: true,
  });
  const observations = [];
  for (const [index, stage] of ["v1", "v2"].entries()) {
    const golden = expected.stages[stage];
    const entry = state.entries.filter((e) => e.event === "started")[index];
    const input = workInput(state, entry),
      result = view.invocations[index].result;
    const observation = {
      stage,
      input_schema: input.schema_version,
      input_fingerprint: sha256Json(input),
      pack_fingerprint: sha256Json(input.artifact),
      result_hash: sha256Json(result),
    };
    assert.equal(
      observation.input_fingerprint,
      golden.input_fingerprint,
      "Recorded input mismatch",
    );
    assert.equal(observation.input_schema, golden.input_schema);
    assert.equal(observation.pack_fingerprint, golden.pack_fingerprint);
    assert.equal(observation.result_hash, golden.result_hash);
    assert.equal(Buffer.byteLength(canonicalJson(result)), golden.result_bytes);
    assert.equal(
      canonicalJson(validateWorkerResult(input, result)),
      canonicalJson(result),
    );
    await writeFile(
      resolve(destination, "private-inputs", `input-${stage}.json`),
      canonicalJson(input),
    );
    await writeFile(
      resolve(destination, "public/qualified-results", `result-${stage}.json`),
      canonicalJson(result),
    );
    observations.push({
      ...observation,
      full_result_parent_conformance: true,
      result_bytes: Buffer.byteLength(canonicalJson(result)),
    });
  }
  await writeFile(
    resolve(destination, "public/Qualification.json"),
    JSON.stringify(
      {
        purpose:
          "Untimed fixture qualification; no timed worker or parent is reused",
        candidate: expected.candidate_commit,
        native_worker_preparations: 2,
        observations,
      },
      null,
      2,
    ) + "\n",
  );
});
