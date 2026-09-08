import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
export const INTAKE_START = "2026-09-07T16:05:00.000Z";
export async function intakeInput(key = "prepare-1") {
  const bytes = await readFile(
    new URL("../fixtures/intake/orchid.csv", import.meta.url),
  );
  const note = await readFile(
    new URL("../fixtures/intake/note-17.txt", import.meta.url),
  );
  return {
    schema_version: "intake-prepare.v1",
    profile_id: "invoice-dispute-intake.v1",
    idempotency_key: key,
    claims: {
      snapshot_at: null,
      snapshot_timezone: null,
      coverage: "unknown",
      population_count: null,
      population_window: null,
    },
    artifacts: [
      {
        role: "queue",
        document_id: "queue",
        name: "orchid.csv",
        media_type: "text/csv",
        bytes_base64: bytes.toString("base64"),
        declared_hash: null,
        associations: [],
      },
      {
        role: "support",
        document_id: "note-17",
        name: "note-17.txt",
        media_type: "text/plain",
        bytes_base64: note.toString("base64"),
        declared_hash: null,
        associations: [
          { entity: "entity_north", kind: "record", id: "dispute-17" },
        ],
      },
    ],
  };
}
export function editQueue(input, change) {
  const text = Buffer.from(
    input.artifacts.find((a) => a.role === "queue").bytes_base64,
    "base64",
  ).toString("utf8");
  const lines = text.trimEnd().split("\n"),
    headers = lines.shift().split(",");
  const rows = lines.map((line) =>
    Object.fromEntries(line.split(",").map((value, i) => [headers[i], value])),
  );
  const result = change(rows, headers) ?? { rows, headers };
  const output =
    [
      result.headers,
      ...result.rows.map((row) => result.headers.map((key) => row[key])),
    ]
      .map((row) =>
        row
          .map((value) =>
            /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value,
          )
          .join(","),
      )
      .join("\n") + "\n";
  input.artifacts.find((a) => a.role === "queue").bytes_base64 =
    Buffer.from(output).toString("base64");
  return input;
}
export function boundSelection(
  view,
  index = 0,
  target = { mode: "create", expected_case_version: 0 },
) {
  const c = view.candidates[index];
  return {
    schema_version: "intake-review.v1",
    bundle_id: view.bundle.id,
    expected_bundle_hash: view.bundle.hash,
    record_key: c.record_key,
    expected_source_revision: c.record.source_revision,
    support_document_ids: c.support_document_ids,
    reviewed_links: c.reviewed_links,
    target,
    expected_prior_intake_binding: c.prior_intake_binding,
    prior_selection_hash: null,
    acknowledgments: c.required_acknowledgments,
    reason: "Reviewed synthetic source, missing business time and target",
  };
}
