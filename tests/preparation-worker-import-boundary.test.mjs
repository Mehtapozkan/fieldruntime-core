import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout, clearTimeout } from "node:timers";
import ts from "typescript";
import {
  canonicalJson,
  sha256Json,
} from "../dist/packages/contracts/src/canonical-json.js";
import * as intake from "../dist/packages/runtime/src/intake.js";
import {
  validateDiscoveryExport,
  readDiscovery,
  appendDiscovery,
} from "../dist/packages/runtime/src/discovery.js";
import {
  readPack,
  appendPackSelection,
} from "../dist/packages/runtime/src/preparation-pack.js";
import {
  syntheticWorkContext,
  syntheticContinuationContext,
  readWork,
  appendWorkCommand,
  workInput,
  validateWorkerResult,
} from "../dist/packages/runtime/src/preparation-work.js";
import { prepareDisposition } from "../dist/packages/runtime/src/disposition-preparation.js";
import { fixedPreparationPort } from "../dist/packages/runtime/src/preparation-worker-port.js";
import { WORK_MEASURES } from "../dist/packages/runtime/src/preparation-worker-profile.js";
import { discoveryCommand } from "./helpers/discovery.mjs";
import { publication, start } from "./helpers/preparation-work.mjs";

async function runtimeGraph(entry) {
  const found = new Set();
  async function visit(url) {
    if (found.has(url.href)) return;
    found.add(url.href);
    if (url.pathname.endsWith(".json")) return;
    const source = ts.createSourceFile(
      fileURLToPath(url),
      await readFile(url, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const dependencies = [];
    function scan(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      ) {
        assert.ok(ts.isStringLiteral(node.moduleSpecifier));
        dependencies.push(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        assert.ok(
          ts.isStringLiteral(node.arguments[0]),
          "A computed runtime import needs an explicit boundary review",
        );
        dependencies.push(node.arguments[0].text);
      }
      ts.forEachChild(node, scan);
    }
    scan(source);
    for (const specifier of dependencies) {
      if (specifier.startsWith("node:")) continue;
      assert.ok(specifier.startsWith("."), specifier);
      await visit(new URL(specifier, url));
    }
  }
  await visit(entry);
  return [...found].sort();
}

test("fixed worker emitted runtime graph excludes parent validation dependencies", async () => {
  const graph = await runtimeGraph(
    new URL(
      "../dist/packages/runtime/src/preparation-worker-thread.js",
      import.meta.url,
    ),
  );
  for (const path of graph)
    assert.doesNotMatch(
      path,
      /\/packages\/(?:contracts\/src\/(?:index|validators)|runtime\/src\/(?:intake|case-engine|preparation-worker-profile))\.js$/,
    );
  assert.ok(graph.some((path) => path.endsWith("/canonical-json.js")));
  assert.ok(graph.some((path) => path.endsWith("/intake-values.js")));
  assert.ok(
    graph.some((path) => path.endsWith("/preparation-work-measures.js")),
  );
});

test("intake leaf preserves public bindings, valid values and exact rejection identity", async () => {
  const leaf = await import("../dist/packages/runtime/src/intake-values.js");
  for (const name of [
    "IntakeError",
    "requireIntake",
    "intakeObject",
    "intakeList",
  ])
    assert.equal(intake[name], leaf[name]);
  const record = { value: "synthetic" };
  assert.equal(leaf.intakeObject(record), record);
  assert.equal(leaf.intakeList([record])[0], record);
  assert.deepEqual(leaf.intakeList([]), []);
  assert.equal(leaf.requireIntake(true, "UNUSED", "unused"), undefined);
  for (const [name, value, message] of [
    ["intakeObject", null, "Expected a record"],
    ["intakeObject", [], "Expected a record"],
    ["intakeObject", "record", "Expected a record"],
    ["intakeList", {}, "Expected records"],
    ["intakeList", [null], "Expected a record"],
  ])
    for (const api of [intake, leaf])
      assert.throws(
        () => api[name](value),
        (error) =>
          error instanceof leaf.IntakeError &&
          error instanceof intake.IntakeError &&
          error.name === "IntakeError" &&
          error.code === "INTAKE_INTEGRITY" &&
          error.message === message,
      );
  assert.throws(
    () => leaf.requireIntake(false, "EXACT_CODE", "Exact message"),
    (error) =>
      error instanceof intake.IntakeError &&
      error.code === "EXACT_CODE" &&
      error.message === "Exact message",
  );
});

test("work measures retain the same unfrozen array binding and order", async () => {
  const leaf =
    await import("../dist/packages/runtime/src/preparation-work-measures.js");
  assert.equal(WORK_MEASURES, leaf.WORK_MEASURES);
  assert.deepEqual(WORK_MEASURES, [
    "cash_collected",
    "disputes_resolved",
    "credits_issued",
    "work_newly_attended_to",
    "human_attention_released",
  ]);
  assert.equal(Object.isFrozen(WORK_MEASURES), false);
  assert.equal(Object.isExtensible(WORK_MEASURES), true);
  assert.equal(
    Object.getOwnPropertyDescriptor(WORK_MEASURES, "0").writable,
    true,
  );
});

// Existing public replay fixture, followed by explicit current descriptive review
// and publication. These unit inputs differ from the separate recorded PostgreSQL
// continuation inputs; the baseline hashes below bind this fixture, not that run.
const expected = [
  {
    version: "v1",
    input:
      "sha256:9846711d1efb180702639a41a07dd524d1e385e6e956c2cc039dafd30cfe353d",
    pack: "sha256:c5ff0826510e1378d1d85d3ec608fb5279fb331bc5631ac654b7d8a48eea08a9",
    result:
      "sha256:544b4338682b30810f6ab7e6459c8b2c1f01373c3d1f9640a1ca085a7c214b3c",
  },
  {
    version: "v2",
    input:
      "sha256:e1a5196b57fa146d5740c6ec21a8acf20cb98361badec862637af1d176c2c35b",
    pack: "sha256:bba74988264f95519b3ba779a8434e1c585801e2de96830d53c49dd9a7fd2837",
    result:
      "sha256:777fa8d4b903130b0f6ee382220a31b947e1be10b6171a6045ebb5cd7dd8d892",
  },
];
for (const golden of expected)
  test(`fresh real ${golden.version} worker preserves complete canonical result and parent rejection`, async () => {
    const discovery = validateDiscoveryExport(
      JSON.parse(
        await readFile(
          new URL(
            "./fixtures/discovery/scoped-v1-export.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    const { bundle_id, record_key, case_id } = discovery.entries.at(-1).command;
    const target = { bundle_id, record_key, case_id };
    const at = "2026-09-07T16:05:00.000Z";
    const context =
      golden.version === "v1"
        ? syntheticWorkContext()
        : syntheticContinuationContext();
    discovery.entries.push(
      appendDiscovery(
        discovery,
        discoveryCommand(
          readDiscovery(discovery, bundle_id, record_key, case_id),
          "import-boundary-confirm",
          "confirm",
        ),
        at,
      ),
    );
    const pack = { discovery, entries: [] };
    const key = "import-boundary-" + golden.version;
    pack.entries.push(
      appendPackSelection(
        pack,
        publication(readPack(pack, target, at, context.pack), key),
        at,
        context.pack,
      ),
    );
    const state = { pack, entries: [] };
    const entry = appendWorkCommand(
      state,
      start(readWork(state, case_id, record_key, at, context), key),
      at,
      context,
    );
    state.entries.push(entry);
    const input = workInput(state, entry);
    assert.equal(
      input.schema_version,
      "preparation-worker-input." + golden.version,
    );
    assert.equal(sha256Json(input), golden.input);
    assert.equal(sha256Json(input.artifact), golden.pack);
    const reconstructed = prepareDisposition(input);
    assert.equal(sha256Json(reconstructed), golden.result);
    let timer;
    const execution = fixedPreparationPort(input);
    let result;
    try {
      result = await Promise.race([
        execution.completion,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Five-second worker deadline")),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      execution.cancel();
    }
    assert.equal(canonicalJson(result), canonicalJson(reconstructed));
    assert.equal(sha256Json(result), golden.result);
    assert.equal(
      canonicalJson(validateWorkerResult(input, result)),
      canonicalJson(result),
    );
    assert.throws(() => validateWorkerResult(input, null));
    const tampered = structuredClone(result);
    tampered.follow_up.draft += " Unsupported claim.";
    assert.throws(
      () => validateWorkerResult(input, tampered),
      (error) => error.code === "WORK_RESULT_CONFORMANCE",
    );
    assert.equal(result.financial_authority, false);
    assert.equal(result.case_closure_permission, false);
    assert.equal(result.follow_up.sent, false);
    assert.equal(result.disposition.independent_business_verification, false);
  });
