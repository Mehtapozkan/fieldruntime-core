import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidPreparationPackContract,
  canonicalJson,
  sha256Json,
} from "../dist/packages/contracts/src/index.js";
import { prepareIntake } from "../dist/packages/runtime/src/intake.js";
import {
  projectPreparationPack,
  normalizePackCommand,
  readPack,
  syntheticPackContext,
  PREPARATION_TEMPLATE,
} from "../dist/packages/runtime/src/preparation-pack.js";
import { INTAKE_START, intakeInput, editQueue } from "./helpers/intake.mjs";
import { scopedDeliveries, variation } from "./helpers/discovery.mjs";
function state(input) {
  const p = prepareIntake(input, INTAKE_START, INTAKE_START);
  return {
    intake: {
      cases: { cases: [], idempotency_records: [], source_event_records: [] },
      bundles: [p.bundle],
      commits: [],
      requestBindings: [],
      artifacts: p.bytes,
      clockFloor: INTAKE_START,
    },
    entries: [],
  };
}
function target(s, index = 0) {
  return {
    bundle_id: s.intake.bundles[0].id,
    record_key: s.intake.bundles[0].records[index].record_key,
    case_id: null,
  };
}
const hash = `sha256:${"a".repeat(64)}`;
const withdraw = {
  schema_version: "pack-selection-command.v1",
  operation: "withdraw",
  pack_id: "pack_synthetic_invoice_dispute_north",
  expected_selection_revision: 1,
  expected_selection_head: hash,
  expected_publication_profile_hash: hash,
  reason: "Remove selection; no new permission",
  idempotency_key: "withdraw",
  artifact_hash: hash,
};
test("D11-B strict operation schemas keep withdrawal independent of stale basis and reject authority injection", () => {
  normalizePackCommand(withdraw);
  for (const field of [
    "expected_basis",
    "effective_until",
    "effective_until_source_timezone",
    "actor",
    "identity",
    "authorized",
    "policy",
    "tenant_id",
    "versions",
  ])
    assert.throws(() => normalizePackCommand({ ...withdraw, [field]: true }));
  for (const op of ["publish", "rollback"])
    assert.throws(() => normalizePackCommand({ ...withdraw, operation: op }));
  assert.throws(() =>
    normalizePackCommand({ ...withdraw, expected_selection_revision: 0.5 }),
  );
});
test("D11-B T1/T3: all six outputs bind relevant claims or coverage; normative outputs have no fabricated proof", async () => {
  const s = state(await intakeInput("pack-unit")),
    a = projectPreparationPack(s, target(s));
  assertValidPreparationPackContract("artifact", a);
  const loop = (id) => a.loop_outputs.find((l) => l.id === id);
  const intervention = loop("Human Intervention Map"),
    sources = (ids) => a.sources.filter((x) => ids.includes(x.id));
  assert.deepEqual(
    sources(intervention.citation_ids).map((x) => x.name),
    ["note-17.txt"],
  );
  assert.match(
    intervention.text,
    /DEL-4: source reports confirmation is not supplied/,
  );
  assert.equal(loop("Population").citation_ids.length, 2);
  assert.equal(
    new Set(sources(loop("Population").citation_ids).map((x) => x.record_key))
      .size,
    2,
  );
  assert.equal(a.coverage.members.length, 2);
  assert.equal(a.coverage.bundle_hash, s.intake.bundles[0].hash);
  for (const id of ["Trigger", "Objective", "Close Event", "Correction Path"]) {
    assert.equal(loop(id).process_view, "proposed");
    assert.deepEqual(loop(id).citation_ids, []);
  }
  assert.ok(
    !a.material.loop_outputs
      .find((x) => x.id === "Human Intervention Map")
      .citation_ids.includes(intervention.citation_ids[0]),
  );
  assert.equal(sha256Json(projectPreparationPack(s, target(s))), sha256Json(a));
  assert.equal(a.template.resource_limits.model_calls, 0);
  assert.equal(a.template.resource_limits.worker_dispatch, false);
  assert.equal(a.closure_permission, false);
  const changed = JSON.parse(canonicalJson(a));
  changed.template.rules.consequential_authority.enabled = true;
  assert.throws(() => assertValidPreparationPackContract("artifact", changed));
  assert.deepEqual(a.template, PREPARATION_TEMPLATE);
});
for (const scenario of [
  "different-deliveries",
  "distinct-records",
  "same-delivery",
  "shared-delivery",
])
  test(`D11-B T3/T4: scoped ${scenario} retains the actual claim subject`, async () => {
    const s = state(await scopedDeliveries(`pack-${scenario}`, scenario)),
      a = projectPreparationPack(s, target(s)),
      map = a.loop_outputs.find((x) => x.id === "Human Intervention Map"),
      text = map.text;
    if (scenario === "different-deliveries") {
      assert.match(text, /DEL-4: source reports supplied confirmation/);
      assert.match(text, /DEL-5: source reports confirmation is not supplied/);
      assert.doesNotMatch(text, /conflicting/);
    }
    if (scenario === "distinct-records") {
      assert.match(text, /DEL-4: no explicitly associated delivery support/);
      assert.doesNotMatch(text, /DEL-5|conflicting/);
      assert.ok(
        !a.sources
          .filter((x) => map.citation_ids.includes(x.id))
          .some((x) => x.name === "dispute-18-only.txt"),
      );
    }
    if (scenario === "same-delivery") {
      assert.match(text, /DEL-4: conflicting source reports/);
      assert.equal(
        a.sources.filter(
          (x) => map.citation_ids.includes(x.id) && x.interpretation === "text",
        ).length,
        2,
      );
    }
    if (scenario === "shared-delivery") {
      assert.match(text, /DEL-4: source reports supplied confirmation/);
      const other = projectPreparationPack(s, target(s, 1)).loop_outputs.find(
        (x) => x.id === "Human Intervention Map",
      );
      assert.match(other.text, /DEL-4: source reports supplied confirmation/);
    }
  });
test("D11-B full upload coverage includes unrelated records without transferring their claims", async () => {
  const input = editQueue(await intakeInput("unrelated-coverage"), (rows) => {
    rows[1].customer_ref = "Cedar";
    rows[1].invoice_id = "INV-908";
  });
  const s = state(input),
    a = projectPreparationPack(s, target(s));
  assert.equal(
    a.material.sources.filter((x) => x.interpretation === "csv").length,
    1,
  );
  assert.equal(a.coverage.members.length, 2);
  const pop = a.loop_outputs.find((x) => x.id === "Population");
  assert.equal(pop.citation_ids.length, 2);
  assert.equal(
    a.sources.filter((x) => pop.citation_ids.includes(x.id)).length,
    2,
  );
  assert.doesNotMatch(
    a.loop_outputs.find((x) => x.id === "Human Intervention Map").text,
    /DEL-5/,
  );
});
test("D11-B reversed artifact input order preserves scoped conclusions and canonical bindings", async () => {
  const original = await scopedDeliveries("order", "different-deliveries"),
    reversed = structuredClone(original);
  reversed.artifacts.reverse();
  const a = state(original),
    b = state(reversed),
    first = projectPreparationPack(a, target(a)),
    second = projectPreparationPack(b, target(b));
  assert.deepEqual(first.loop_outputs, second.loop_outputs);
  assert.equal(
    first.binding.manifest.bundle_hash,
    second.binding.manifest.bundle_hash,
  );
});
test("D11-B unknown, ambiguous and retained-only inputs cannot establish independent facts", async () => {
  for (const condition of ["none", "ambiguous"]) {
    const s = state(await variation(`variation-${condition}`, condition)),
      a = projectPreparationPack(s, target(s)),
      map = a.loop_outputs.find((x) => x.id === "Human Intervention Map");
    assert.doesNotMatch(map.text, /source reports supplied confirmation/);
    assert.ok(
      a.material.source_claims.every((c) => c.independently_verified === false),
    );
  }
  const input = await intakeInput("opaque");
  input.artifacts[1].name = "support.pdf";
  input.artifacts[1].media_type = "application/pdf";
  input.artifacts[1].bytes_base64 = Buffer.from(
    "%PDF-1.4\nDelivery confirmation for DEL-4 is supplied.\n",
  ).toString("base64");
  const s = state(input),
    a = projectPreparationPack(s, target(s));
  assert.equal(a.sources.find((x) => x.name === "support.pdf").excerpt, null);
  assert.doesNotMatch(
    a.loop_outputs.find((x) => x.id === "Human Intervention Map").text,
    /source reports supplied/,
  );
});
test("D11-B current publication eligibility is separate from canonical reader and duplicate identities fail closed", async () => {
  const s = state(await intakeInput("identities")),
    context = syntheticPackContext();
  context.profile = JSON.parse(canonicalJson(context.profile));
  context.profile.identities.push({ ...context.profile.identities[1] });
  assert.doesNotThrow(() =>
    readPack({ discovery: s, entries: [] }, target(s), INTAKE_START, context),
  );
  context.profile.identities.at(-1).status = "revoked";
  assert.throws(
    () =>
      readPack({ discovery: s, entries: [] }, target(s), INTAKE_START, context),
    /Contradictory/,
  );
});
