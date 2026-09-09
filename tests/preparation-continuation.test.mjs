import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertValidPreparationWorkContract as old,
  assertValidPreparationWorkV2Contract as current,
} from "../dist/packages/contracts/src/index.js";
import {
  syntheticContinuationProfile,
  syntheticWorkerProfile,
  workActor,
} from "../dist/packages/runtime/src/preparation-worker-profile.js";
const example = JSON.parse(
  await readFile(
    new URL(
      "../docs/examples/d12-preparation-worker.proposed.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("D-038 strict version barrier retains old commands and rejects caller authority", () => {
  const command = structuredClone(example.start_command);
  old("command", command);
  command.schema_version = "preparation-work-command.v2";
  command.binding.worker_implementation_id = "disposition-code.v3";
  command.binding.retained_bundles = [
    {
      bundle_id: command.binding.basis.manifest.bundle_id,
      bundle_hash: command.binding.basis.manifest.bundle_hash,
    },
  ];
  current("command", command);
  assert.throws(() => old("command", command));
  assert.throws(() => current("command", example.start_command));
  for (const field of [
    "authorized",
    "result",
    "actor",
    "worker_profile",
    "preflight",
  ])
    assert.throws(() => current("command", { ...command, [field]: true }));
  for (const bundles of [
    [],
    Array.from({ length: 3 }, (_, i) => ({
      ...command.binding.retained_bundles[0],
      bundle_id: `bundle_${i}`,
    })),
  ])
    assert.throws(() =>
      current("command", {
        ...command,
        binding: { ...command.binding, retained_bundles: bundles },
      }),
    );
});
test("D-038 new profile retains purpose/scope/time checks without changing the historical profile", () => {
  const profile = syntheticContinuationProfile(),
    historical = syntheticWorkerProfile();
  assert.equal(historical.schema_version, "synthetic-preparation-worker.v1");
  assert.equal(profile.implementation_id, "disposition-code.v3");
  assert.deepEqual(profile.identities, historical.identities);
  assert.deepEqual(profile.grants, historical.grants);
  const at = "2026-09-07T16:05:00.000Z";
  assert.equal(
    workActor(profile, "prepare_disposition_packet", at).identity_kind,
    "service",
  );
  const revoked = structuredClone(profile);
  revoked.identities[0].status = "revoked";
  assert.throws(() => workActor(revoked, "prepare_disposition_packet", at));
  assert.throws(() =>
    workActor(
      syntheticContinuationProfile(),
      "prepare_disposition_packet",
      "2027-01-01T00:00:00.000Z",
    ),
  );
});
