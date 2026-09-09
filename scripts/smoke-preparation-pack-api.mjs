// Explicit synthetic fixture only, through the ordinary appliance API; no fault controls.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { intakeInput, boundSelection } from "../tests/helpers/intake.mjs";
import { discoveryCommand } from "../tests/helpers/discovery.mjs";
import {
  assertValidPreparationPackContract,
  assertValidPreparationPackV2Contract,
} from "../dist/packages/contracts/src/index.js";
import { validatePackExport } from "../dist/packages/runtime/src/preparation-pack.js";
const validatePack = (kind, v) =>
  (v.schema_version.endsWith(".v2")
    ? assertValidPreparationPackV2Contract
    : assertValidPreparationPackContract)(kind, v);
const [mode, evidenceFile] = process.argv.slice(2),
  base = process.env.FIELD_RUNTIME_URL ?? "http://127.0.0.1:3210",
  url = new URL(base);
if (
  !["applied", "durable"].includes(mode) ||
  !evidenceFile ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.protocol !== "http:" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== "/"
)
  throw new Error(
    "Usage: node scripts/smoke-preparation-pack-api.mjs applied|durable NEW_EVIDENCE_FILE (loopback appliance only)",
  );
async function call(path, body) {
  const r = await globalThis.fetch(
      `${base}${path}`,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    ),
    v = await r.json();
  assert.equal(r.status, 200, JSON.stringify(v));
  return v;
}
const root =
    "/v1/intake/preparation-packs/pack_synthetic_invoice_dispute_north",
  post = `${root}/selections/publication`;
if (mode === "applied") {
  const p = await call(
      "/v1/intake/preparations",
      await intakeInput("d11-appliance-prepare"),
    ),
    v = await call(`/v1/intake/bundles/${p.bundle_id}`),
    selection = boundSelection(v, 0, {
      mode: "create",
      expected_case_version: 0,
    }),
    preview = await call("/v1/intake/selections/preview", selection);
  const committed = await call("/v1/intake/commits", {
    ...selection,
    schema_version: "intake-selection.v1",
    expected_material_key: preview.material_key,
    expected_consent_hash: preview.consent_hash,
    idempotency_key: "d11-appliance-commit",
  });
  const query = `bundle_id=${p.bundle_id}&record_key=${encodeURIComponent(v.candidates[0].record_key)}&case_id=${committed.receipt.case_id}`,
    discoveryPath = `/v1/intake/bundles/${p.bundle_id}/discovery?${query.split("&").slice(1).join("&")}`;
  await call(
    `/v1/intake/bundles/${p.bundle_id}/discovery-reviews`,
    discoveryCommand(
      await call(discoveryPath),
      "d11-appliance-confirm",
      "confirm",
    ),
  );
  const path = `${root}?${query}`,
    candidate = await call(path);
  validatePack("read", candidate);
  const command = {
    schema_version: candidate.schema_version.endsWith(".v2")
      ? "pack-selection-command.v2"
      : "pack-selection-command.v1",
    operation: "publish",
    pack_id: candidate.pack_id,
    expected_selection_revision: candidate.selection_revision,
    expected_selection_head: candidate.selection_head,
    expected_publication_profile_hash: candidate.publication_profile_hash,
    expected_basis: candidate.candidate.binding,
    artifact_hash: candidate.candidate_hash,
    idempotency_key: "d11-appliance-publish",
    reason:
      "Explicit synthetic appliance control; uncertainty retained, preparation only",
    effective_until: new Date(
      Date.parse(candidate.evaluated_at) + 3600000,
    ).toISOString(),
    effective_until_source_timezone: "UTC",
  };
  const receipt = await call(post, command);
  validatePack("result", receipt);
  const archive = await call(path + "&representation=export");
  validatePackExport(archive);
  await writeFile(
    evidenceFile,
    JSON.stringify({ path, command, receipt, archive }),
    { flag: "wx" },
  );
  console.log(
    "PASS: explicit intake → Case → descriptive review → separate publication; no worker or business authority",
  );
} else {
  const saved = JSON.parse(await readFile(evidenceFile, "utf8"));
  assert.deepEqual(await call(post, saved.command), saved.receipt);
  assert.deepEqual(
    await call(saved.path + "&representation=export"),
    saved.archive,
  );
  const v = await call(saved.path);
  validatePack("read", v);
  assert.equal(v.selection_head, saved.receipt.entry.hash);
  validatePackExport(saved.archive);
  console.log(
    "PASS: original publication receipt and full portable evidence reconstructed after restart; exact retry adds no entry",
  );
}
