// Explicit local example; a command file is never overwritten or silently rebased.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertValidPreparationPackContract } from "../dist/packages/contracts/src/index.js";
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
    "Usage: node scripts/preparation-pack-example.mjs read|inspect|submit|export INTAKE_EXAMPLE_DIRECTORY [NOTES_JSON for inspect]",
  );
const root =
    "/v1/intake/preparation-packs/pack_synthetic_invoice_dispute_north",
  file = join(directory, "pack-command.json");
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
    value = await r.json();
  if (!r.ok)
    throw new Error(
      `${r.status}: ${JSON.stringify(value)}. Keep the original command after an uncertain response. A confirmed conflict requires refresh and explicit new review.`,
    );
  return value;
}
if (operation === "submit") {
  const body = await readFile(file, "utf8"),
    command = JSON.parse(body);
  assertValidPreparationPackContract("command", command);
  const result = await call(`${root}/selections/publication`, body);
  assertValidPreparationPackContract("result", result);
  console.log(JSON.stringify(result, null, 2));
} else {
  const { bundle_id } = JSON.parse(
      await readFile(join(directory, "preparation.json"), "utf8"),
    ),
    intake = await call(`/v1/intake/bundles/${bundle_id}`),
    candidate = intake.candidates[0];
  const cases = [
    ...new Set(
      candidate.commits
        .filter((r) => r.selection.bundle_id === bundle_id)
        .map((r) => r.case_id),
    ),
  ];
  if (cases.length !== 1)
    throw new Error(
      "Explicitly commit this first synthetic record to one Case using the intake example first",
    );
  const path = `${root}?bundle_id=${bundle_id}&record_key=${encodeURIComponent(candidate.record_key)}&case_id=${cases[0]}`;
  if (operation === "export")
    console.log(
      JSON.stringify(await call(`${path}&representation=export`), null, 2),
    );
  else {
    const v = await call(path);
    assertValidPreparationPackContract("read", v);
    if (operation === "read") console.log(JSON.stringify(v, null, 2));
    else {
      if (!notesFile)
        throw new Error(
          "Supply operation, reason and (publish/rollback only) explicit expiry; inspect sends no command",
        );
      const notes = JSON.parse(await readFile(notesFile, "utf8"));
      if (
        Object.keys(notes).some(
          (k) =>
            ![
              "operation",
              "reason",
              "effective_until",
              "effective_until_source_timezone",
              "artifact_hash",
            ].includes(k),
        )
      )
        throw new Error("Unknown note fields");
      const a =
        notes.operation === "publish"
          ? v.candidate
          : v.history.find(
              (e) => e.artifact_hash === notes.artifact_hash && e.artifact,
            )?.artifact;
      const c = {
        schema_version: "pack-selection-command.v1",
        operation: notes.operation,
        pack_id: v.pack_id,
        expected_selection_revision: v.selection_revision,
        expected_selection_head: v.selection_head,
        expected_publication_profile_hash: v.publication_profile_hash,
        artifact_hash:
          notes.operation === "withdraw"
            ? v.selected_artifact_hash
            : notes.operation === "publish"
              ? v.candidate_hash
              : notes.artifact_hash,
        idempotency_key: `pack-example:${globalThis.crypto.randomUUID()}`,
        reason: notes.reason,
        ...(notes.operation === "withdraw"
          ? {}
          : {
              expected_basis: a?.binding,
              effective_until: notes.effective_until,
              effective_until_source_timezone:
                notes.effective_until_source_timezone,
            }),
      };
      assertValidPreparationPackContract("command", c);
      await writeFile(file, JSON.stringify(c, null, 2), { flag: "wx" });
      console.log(JSON.stringify(v, null, 2));
      console.log(`Inspect ${file}; no selection command was sent.`);
    }
  }
}
