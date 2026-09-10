// Normal appliance smoke: no source fault/state-change controls enter the API.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { queueInput } from "../tests/helpers/preparation-continuation.mjs";
import { validateDisputeExport } from "../dist/packages/runtime/src/dispute-result.js";
const [mode, file] = process.argv.slice(2),
  base = "http://127.0.0.1:3210";
assert.ok(["applied", "durable"].includes(mode) && file);
async function call(path, body) {
  const r = await globalThis.fetch(
    base + path,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const value = await r.json();
  assert.equal(r.status, 200, JSON.stringify(value));
  return value;
}
if (mode === "applied") {
  const retained = await call(
    "/v1/intake/preparations",
    await queueInput("result-appliance-intake"),
  );
  const v = await call(`/v1/intake/bundles/${retained.bundle_id}`),
    a = v.candidates[0];
  const review = {
    schema_version: "intake-review.v1",
    bundle_id: v.bundle.id,
    expected_bundle_hash: v.bundle.hash,
    record_key: a.record_key,
    expected_source_revision: a.record.source_revision,
    support_document_ids: a.support_document_ids,
    reviewed_links: a.reviewed_links,
    target:
      a.targets.length === 1
        ? {
            mode: "attach",
            case_id: a.targets[0].case_id,
            expected_case_version: a.targets[0].case_version,
          }
        : { mode: "create", expected_case_version: 0 },
    expected_prior_intake_binding: a.prior_intake_binding,
    prior_selection_hash: null,
    acknowledgments: a.required_acknowledgments,
    reason: "Explicit synthetic result API fixture; no real customer data",
  };
  const preview = await call("/v1/intake/selections/preview", review),
    commit = await call("/v1/intake/commits", {
      ...review,
      schema_version: "intake-selection.v1",
      expected_material_key: preview.material_key,
      expected_consent_hash: preview.consent_hash,
      idempotency_key: "result-appliance-commit",
    });
  const path = `/v1/intake/dispute-results?case_id=${commit.receipt.case_id}&record_key=${commit.receipt.record_key}`,
    commands = [],
    receipts = [];
  for (const operation of ["enroll", "candidate", "basis_check"]) {
    const current = await call(path);
    const command = {
      schema_version: "dispute-result-command.v1",
      operation,
      binding: current.binding,
      idempotency_key: `result-appliance-${operation}`,
      ...(operation === "basis_check"
        ? { candidate_hash: current.candidate_hash }
        : {}),
    };
    commands.push(command);
    receipts.push(await call("/v1/intake/dispute-results/commands", command));
  }
  assert.equal(receipts.at(-1).entry.data.comparison.status, "match");
  const archive = await call(path + "&representation=export");
  validateDisputeExport(archive);
  await writeFile(
    file,
    JSON.stringify({ path, commands, receipts, archive }, null, 2) + "\n",
  );
  console.log(
    "D039 appliance: explicit import/enrollment/original-proof check and validated export; no disposition is fabricated",
  );
} else {
  const e = JSON.parse(await readFile(file, "utf8"));
  for (const [c, i] of e.commands.map((c, i) => [c, i]))
    assert.deepEqual(
      await call("/v1/intake/dispute-results/commands", c),
      e.receipts[i],
    );
  const archive = await call(e.path + "&representation=export");
  validateDisputeExport(archive);
  assert.deepEqual(archive, e.archive);
  console.log(
    "D039 appliance: exact receipts and export survive PostgreSQL/core restart without duplicate writes",
  );
}
