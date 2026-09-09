import { buildReport as buildCurrentReport } from "./lib/challenge-report-v2.mjs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildReport as buildLegacyReport,
  renderReport,
  reportJson,
} from "./lib/challenge-report.mjs";
const [archiveFile, manifestFile, directory] = process.argv.slice(2);
if (!archiveFile || !manifestFile || !directory || process.argv.length !== 5)
  throw new Error(
    "Usage: node scripts/challenge-report.mjs archive.json manifest.json output-directory",
  );
const archive = JSON.parse(await readFile(archiveFile, "utf8"));
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
if (
  manifest.schema_version === "challenge-input.v1" &&
  archive.schema_version !== "preparation-work-export.v1"
)
  throw new Error(
    "Historical report v1 requires a v1 archive and its pinned implementation; use challenge-input.v2 for new history",
  );
const report = await (
  manifest.schema_version === "challenge-input.v2"
    ? buildCurrentReport
    : buildLegacyReport
)(archive, manifest);
await mkdir(directory, { recursive: true });
// Never overwrite original inputs or an earlier report. New report = explicit new directory.
for (const [name, content] of Object.entries({
  "archive.json": reportJson(archive),
  "manifest.json": reportJson(manifest),
  "report.json": reportJson(report),
  "report.html": renderReport(report, archive),
}))
  await writeFile(resolve(directory, name), content, { flag: "wx" });
console.log(
  JSON.stringify({
    report: resolve(directory, "report.html"),
    hash: report.hash,
    summary: report.summary,
  }),
);
