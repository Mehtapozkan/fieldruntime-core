// Test/runner loader: expected.json is deliberately never loaded here.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
export const fixtureRoot = new URL(
  "../../evaluations/investigation/v2/",
  import.meta.url,
);
export const fixtureManifest = JSON.parse(
  await readFile(new URL("manifest.json", fixtureRoot), "utf8"),
);
export async function fixtureInputs(id) {
  const c = fixtureManifest.cases.find((x) => x.id === id);
  assert.ok(c, "Unknown fixture");
  const result = [];
  for (const [index, b] of c.bundles.entries()) {
    const artifacts = [];
    for (const a of b.artifacts) {
      assert.match(a.path, /^H\d{2}\/bundle-[12]\/[^/]+\.(csv|txt)$/);
      const bytes = await readFile(new URL(a.path, fixtureRoot));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
      artifacts.push({
        role: a.role,
        document_id: a.document_id,
        name: a.path.split("/").at(-1),
        media_type: a.media_type,
        bytes_base64: bytes.toString("base64"),
        declared_hash: null,
        associations: a.associations,
      });
    }
    result.push({
      schema_version: "intake-prepare.v1",
      profile_id: fixtureManifest.intake_profile,
      idempotency_key: `evaluation-v2-${id}-${index}`,
      claims: {
        snapshot_at: null,
        snapshot_timezone: null,
        coverage: "unknown",
        population_count: null,
        population_window: null,
      },
      artifacts,
    });
  }
  return result;
}
export async function checkFixtureFreeze() {
  for (const line of (
    await readFile(new URL("SHA256SUMS", fixtureRoot), "utf8")
  )
    .trim()
    .split("\n")) {
    const [hash, path] = line.split("  ");
    assert.equal(
      createHash("sha256")
        .update(await readFile(new URL(path, fixtureRoot)))
        .digest("hex"),
      hash,
      path,
    );
  }
  for (const c of fixtureManifest.cases) await fixtureInputs(c.id);
  return {
    cases: fixtureManifest.cases.length,
    model_calls: 0,
    expected_answers_loaded: false,
  };
}
export function decodedSources(inputs) {
  return inputs.flatMap((i) =>
    i.artifacts.map((a) => ({
      ...a,
      text: Buffer.from(a.bytes_base64, "base64").toString("utf8"),
    })),
  );
}
