import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
const [candidateArg, destinationArg] = process.argv.slice(2);
const candidate = resolve(candidateArg),
  destination = resolve(destinationArg),
  out = resolve(destination, "public");
const expected = JSON.parse(
  await readFile(new URL("./expected.json", import.meta.url), "utf8"),
);
assert.equal(
  execFileSync("git", ["-C", candidate, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  expected.candidate_commit,
);
assert.equal(
  execFileSync("git", ["-C", candidate, "rev-parse", "HEAD^{tree}"], {
    encoding: "utf8",
  }).trim(),
  expected.candidate_tree,
);
const state = JSON.parse(
  await readFile(resolve(out, "Acceptance.json"), "utf8"),
);
assert.equal(state.phase, "not_run", "No repeated acceptance batch");
state.phase = "running";
state.candidate_commit = expected.candidate_commit;
const save = () =>
  writeFile(
    resolve(out, "Acceptance.json"),
    JSON.stringify(state, null, 2) + "\n",
  );
const definitions = [
  {
    name: "retained_99",
    count: 99,
    args: [
      "--test",
      "--test-concurrency=1",
      "scripts/synthetic-dispute-postgres.test.mjs",
      "scripts/dispute-result-postgres.test.mjs",
      "scripts/dispute-result-browser.test.mjs",
    ],
  },
  {
    name: "preparation_authority_143",
    count: 143,
    args: [
      "--test",
      "--test-concurrency=1",
      "scripts/preparation-work-postgres.test.mjs",
      "scripts/preparation-continuation-postgres.test.mjs",
      "scripts/authority-postgres.test.mjs",
    ],
  },
  {
    name: "ecc_positive",
    receipt: "ecc-positive.json",
    args: [
      "dist/packages/ecc-pack/src/cli.js",
      "--receipt",
      resolve(out, "ecc-positive.json"),
    ],
  },
  {
    name: "ecc_negative",
    receipt: "ecc-negative.json",
    negative: true,
    args: [
      "dist/packages/ecc-pack/src/cli.js",
      "--negative-control",
      "--receipt",
      resolve(out, "ecc-negative.json"),
    ],
  },
];
await mkdir(resolve(destination, "raw-logs"), { recursive: true });
await mkdir(resolve(out, "gates"), { recursive: true });
for (const definition of definitions) {
  const entry = state.gates.find((x) => x.name === definition.name);
  entry.status = "running";
  entry.command = ["node", ...definition.args];
  entry.started_at = new Date().toISOString();
  await save();
  console.log("Starting " + definition.name);
  try {
    const path = resolve(destination, "raw-logs", definition.name + ".log");
    const file = await open(path, "w");
    const code = await new Promise((resolveCode, reject) => {
      const child = spawn(process.execPath, definition.args, {
        cwd: candidate,
        env: process.env,
        stdio: ["ignore", file.fd, file.fd],
      });
      child.once("error", reject);
      child.once("close", resolveCode);
    }).finally(() => file.close());
    entry.exit_code = code;
    const log = (await readFile(path, "utf8")).replace(
      /postgres(?:ql)?:\/\/[^\s/@]+@/g,
      "postgresql://[synthetic-local]@",
    );
    await writeFile(resolve(out, "gates", definition.name + ".log"), log);
    assert.equal(
      code,
      definition.negative ? 1 : 0,
      "Unexpected gate exit status",
    );
    if (definition.count) {
      entry.counts = {};
      for (const key of [
        "tests",
        "pass",
        "fail",
        "cancelled",
        "skipped",
        "todo",
      ]) {
        const plain = stripVTControlCharacters(log);
        const matches = [
          ...plain.matchAll(new RegExp("^(?:ℹ |# )" + key + " (\\d+)$", "gm")),
        ];
        assert.ok(matches.length, "Missing " + key + " evidence");
        entry.counts[key] = Number(matches.at(-1)[1]);
      }
      assert.equal(entry.counts.tests, definition.count);
      assert.equal(entry.counts.pass, definition.count);
      for (const key of ["fail", "cancelled", "skipped", "todo"])
        assert.equal(entry.counts[key], 0);
    } else {
      const receipt = JSON.parse(
        await readFile(resolve(out, definition.receipt), "utf8"),
      );
      const want = {
        adapter: definition.negative
          ? "negative-control-answer-only"
          : "fieldruntime-deterministic-ecc-v0",
        run_status: "completed",
        verdict: definition.negative ? "fail" : "pass",
        total_cases: 30,
        passed_cases: definition.negative ? 0 : 30,
        total_checks: 620,
        passed_checks: definition.negative ? 152 : 620,
        hard_gates_passed: !definition.negative,
      };
      for (const [key, value] of Object.entries(want))
        assert.equal(receipt[key], value, key);
      assert.equal(receipt.case_results.length, 30);
      if (definition.negative)
        assert.ok(
          receipt.case_results.some((c) =>
            c.checks.some((x) => x.hard_gate && !x.passed),
          ),
        );
      entry.receipt_checks = want;
      entry.completed_receipt_check_passed = true;
    }
    entry.status = "passed";
    entry.finished_at = new Date().toISOString();
    await save();
    console.log("Passed " + definition.name);
  } catch (error) {
    entry.status = "failed";
    entry.failure = { name: error.name, message: error.message };
    entry.finished_at = new Date().toISOString();
    state.phase = "failed";
    await save();
    throw error;
  }
}
state.phase = "passed";
state.finished_at = new Date().toISOString();
await save();
