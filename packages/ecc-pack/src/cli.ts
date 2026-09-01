import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AnswerOnlyNegativeControl,
  DeterministicEccAdapter,
  parseEvaluationCases,
  runProductionTest,
} from "./production-test.js";

function optionValue(name: string): string | undefined {
  const direct = process.argv.find((argument) =>
    argument.startsWith(`${name}=`),
  );
  if (direct !== undefined) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const corpusPath = resolve(
  optionValue("--corpus") ?? "packages/ecc-pack/evals/ecc.v0.jsonl",
);
const adapter = process.argv.includes("--negative-control")
  ? new AnswerOnlyNegativeControl()
  : new DeterministicEccAdapter();
const cases = parseEvaluationCases(await readFile(corpusPath, "utf8"));
const receipt = runProductionTest(cases, adapter, {
  subjectVersion: optionValue("--subject-version") ?? "working-tree",
});
const receiptPath = optionValue("--receipt");
if (receiptPath !== undefined) {
  await writeFile(
    resolve(receiptPath),
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8",
  );
}

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} else {
  process.stdout.write(
    [
      `Field Runtime Production Test — ECC ${receipt.suite_version}`,
      `Adapter: ${receipt.adapter}`,
      `Verdict: ${receipt.verdict.toUpperCase()}`,
      `Cases: ${String(receipt.passed_cases)}/${String(receipt.total_cases)}`,
      `Checks: ${String(receipt.passed_checks)}/${String(receipt.total_checks)}`,
      `Hard gates: ${receipt.hard_gates_passed ? "PASS" : "FAIL"}`,
      `Receipt: ${receipt.receipt_hash}`,
    ].join("\n") + "\n",
  );
}

if (receipt.verdict !== "pass") process.exitCode = 1;
