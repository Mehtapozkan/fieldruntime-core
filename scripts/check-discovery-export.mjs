import { readFile } from "node:fs/promises";
import { validateDiscoveryExport } from "../dist/packages/runtime/src/discovery.js";
const file = process.argv[2];
if (!file)
  throw new Error(
    "Usage: node scripts/check-discovery-export.mjs /path/to/discovery-export.json",
  );
const state = validateDiscoveryExport(JSON.parse(await readFile(file, "utf8")));
console.log(
  JSON.stringify({
    status: "reconstructed",
    bundles: state.intake.bundles.length,
    cases: state.intake.cases.cases.length,
    descriptive_reviews: state.entries.length,
    authority_granted: false,
    closure_permission: false,
  }),
);
