import { readFile } from "node:fs/promises";
import { validatePackExport } from "../dist/packages/runtime/src/preparation-pack.js";
const file = process.argv[2];
if (!file)
  throw new Error(
    "Usage: node scripts/check-preparation-pack-export.mjs /path/to/pack-export.json",
  );
const state = validatePackExport(JSON.parse(await readFile(file, "utf8")));
console.log(
  JSON.stringify({
    status: "reconstructed",
    selection_entries: state.entries.length,
    descriptive_reviews: state.discovery.entries.length,
    authority_granted: false,
    closure_permission: false,
  }),
);
