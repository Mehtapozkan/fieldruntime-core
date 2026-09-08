// Explicit local synthetic demonstration. Saved commands are never overwritten or rebased.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertValidDiscoveryContract } from "../dist/packages/contracts/src/index.js";
const [operation, directory, notesFile] = process.argv.slice(2),
  base = process.env.FIELD_RUNTIME_URL ?? "http://127.0.0.1:3210",
  url = new URL(base);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.protocol !== "http:" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== "/"
)
  throw new Error("Local credential-free appliance required");
if (!["read", "inspect", "submit", "export"].includes(operation) || !directory)
  throw new Error(
    "Usage: node scripts/discovery-example.mjs read|inspect|submit|export INTAKE_EXAMPLE_DIRECTORY [NOTES_JSON for inspect]",
  );
async function call(path, body) {
  const r = await globalThis.fetch(
      `${base}${path}`,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          },
    ),
    v = await r.json();
  if (!r.ok)
    throw new Error(
      `${r.status}: ${JSON.stringify(v)}. Keep the original command after an uncertain response; refresh and explicitly inspect new material only after a confirmed conflict.`,
    );
  return v;
}
const file = join(directory, "discovery-command.json");
if (operation === "submit") {
  const body = await readFile(file, "utf8"),
    command = JSON.parse(body);
  assertValidDiscoveryContract("command", command);
  console.log(
    JSON.stringify(
      await call(
        `/v1/intake/bundles/${command.bundle_id}/discovery-reviews`,
        body,
      ),
      null,
      2,
    ),
  );
} else {
  const { bundle_id } = JSON.parse(
      await readFile(join(directory, "preparation.json"), "utf8"),
    ),
    view = await call(`/v1/intake/bundles/${bundle_id}`),
    candidate = view.candidates[0],
    cases = [
      ...new Set(
        candidate.commits
          .filter((r) => r.selection.bundle_id === bundle_id)
          .map((r) => r.case_id),
      ),
    ];
  if (cases.length !== 1)
    throw new Error(
      "Use the existing intake example to explicitly commit this first sample record to one Case before this demonstration",
    );
  const path = `/v1/intake/bundles/${bundle_id}/discovery?record_key=${encodeURIComponent(candidate.record_key)}&case_id=${cases[0]}`;
  if (operation === "export")
    console.log(
      JSON.stringify(await call(path + "&representation=export"), null, 2),
    );
  else {
    const brief = await call(path);
    assertValidDiscoveryContract("read", brief);
    if (operation === "read") console.log(JSON.stringify(brief, null, 2));
    else {
      if (!notesFile)
        throw new Error(
          "Supply an explicit annotate/confirm JSON note with reason; inspect does not submit it",
        );
      const notes = JSON.parse(await readFile(notesFile, "utf8"));
      if (
        Object.keys(notes).some(
          (k) => !["operation", "changes", "purpose", "reason"].includes(k),
        )
      )
        throw new Error(
          "Only descriptive operation, changes/purpose and reason belong in the note",
        );
      const command = {
        schema_version: "discovery-review-command.v1",
        ...brief.binding,
        ...notes,
        idempotency_key: `discovery-example:${globalThis.crypto.randomUUID()}`,
      };
      assertValidDiscoveryContract("command", command);
      await writeFile(file, JSON.stringify(command, null, 2), { flag: "wx" });
      console.log(JSON.stringify(brief, null, 2));
      console.log(`Inspect ${file}; no descriptive write has been sent.`);
    }
  }
}
