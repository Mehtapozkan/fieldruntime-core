// Read-only portable conformance checker; deliberately no live restore operation.
import { readFile } from "node:fs/promises";
import { validateIntakeExport } from "../dist/packages/runtime/src/intake-integrity.js";
try {
  if (process.argv.length !== 3)
    throw new Error(
      "Usage: node scripts/check-intake-export.mjs /path/to/synthetic-intake-export.json",
    );
  const state = validateIntakeExport(
    JSON.parse(await readFile(process.argv[2], "utf8")),
  );
  process.stdout.write(
    `PASS: ${state.bundles.length} bundles, ${state.artifacts.size} original artifacts, ${state.commits.length} receipts, ${state.requestBindings?.length ?? 0} no-op request bindings and ${state.cases.cases.length} Cases reconstruct. Synthetic evidence only; no current authorization.\n`,
  );
} catch (error) {
  process.stderr.write(`FAIL: ${error.message}\n`);
  process.exitCode = 1;
}
