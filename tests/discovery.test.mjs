import assert from "node:assert/strict";
import test from "node:test";
import { assertValidDiscoveryContract } from "../dist/packages/contracts/src/index.js";
import { prepareIntake } from "../dist/packages/runtime/src/intake.js";
import {
  projectDiscovery,
  normalizeDiscoveryCommand,
} from "../dist/packages/runtime/src/discovery.js";
import { INTAKE_START, intakeInput } from "./helpers/intake.mjs";
import { variation } from "./helpers/discovery.mjs";
const hash = `sha256:${"a".repeat(64)}`;
const command = {
  schema_version: "discovery-review-command.v1",
  operation: "confirm",
  bundle_id: "intake_bundle_fixture",
  record_key: hash,
  case_id: "case_fixture",
  expected_case_version: 1,
  expected_intake_receipt_hash: hash,
  expected_discovery_revision: 0,
  expected_previous_entry_hash: null,
  expected_material_hash: hash,
  purpose: "discovery_description",
  reason: "Descriptive review only",
  idempotency_key: "review-1",
};
test("D10-B strict command contract preserves the descriptive boundary and forbids authority fields", () => {
  assertValidDiscoveryContract("command", command);
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalizeDiscoveryCommand(command))),
    command,
  );
  assert.equal(Object.getPrototypeOf(normalizeDiscoveryCommand(command)), null);
  for (const field of [
    "actor",
    "tenant_id",
    "authority_granted",
    "policy",
    "source_rank",
    "identity",
    "versions",
  ])
    assert.throws(() =>
      normalizeDiscoveryCommand({ ...command, [field]: true }),
    );
  for (const change of [
    { operation: "approve" },
    { purpose: "case_closure" },
    { reason: " " },
    { expected_case_version: 0 },
    { expected_discovery_revision: 0.5 },
  ])
    assert.throws(() => normalizeDiscoveryCommand({ ...command, ...change }));
});
test("D10-B annotation batch has bounded unique targets, explicit evidence state and no implicit confirmation", () => {
  const { purpose, ...base } = command;
  void purpose;
  const change = {
      target_id: "Q1",
      state: "unknown",
      text: "Evidence is not supplied",
      reason: "No governing record is identified",
      citation_ids: [],
    },
    c = { ...base, operation: "annotate", changes: [change] };
  normalizeDiscoveryCommand(c);
  for (const invalid of [
    { ...c, changes: Array(33).fill(change) },
    { ...c, changes: [change, change] },
    { ...c, purpose: "discovery_description" },
    { ...c, changes: [{ ...change, state: "verified" }] },
    { ...c, changes: [{ ...change, text: "x".repeat(2001) }] },
  ])
    assert.throws(() => normalizeDiscoveryCommand(invalid));
});
for (const condition of ["none", "reported", "conflicting", "ambiguous"])
  test(`D10-B zero-model projection: ${condition} evidence retains complete byte citations and distinct dimensions`, async () => {
    const prepared = prepareIntake(
        await variation(`unit-${condition}`, condition),
        INTAKE_START,
        INTAKE_START,
      ),
      { bundle, bytes } = prepared;
    const state = {
      cases: { cases: [], idempotency_records: [], source_event_records: [] },
      artifacts: bytes,
      bundles: [bundle],
      commits: [],
      clockFloor: INTAKE_START,
    };
    const m = projectDiscovery(
      state,
      bundle.id,
      bundle.records[0].record_key,
      null,
    );
    assertValidDiscoveryContract("material", m);
    assert.equal(m.assignment.customer_ref, "Cedar");
    assert.equal(m.assignment.amount_minor, 420000);
    assert.equal(m.coverage.distinct_records, 1);
    assert.equal(m.model_calls, 0);
    assert.equal(m.annotations.length, 0);
    for (const c of m.sources) {
      assert.equal(
        bytes
          .get(c.artifact_hash)
          .subarray(c.locator.byte_start, c.locator.byte_end)
          .toString("utf8"),
        c.excerpt,
      );
    }
    assert.deepEqual(
      m.findings.map((f) => f.id),
      ["R1", "R2", "R3", "R4", "R5", "R6", "R7"],
    );
    assert.equal(m.loop_outputs.length, 6);
    assert.ok(
      m.findings.every(
        (f) =>
          f.process_view &&
          f.evidence_type &&
          f.claim_state &&
          !Object.hasOwn(f, "review_status"),
      ),
    );
  });
test("D10-B original intake sample remains source-qualified and is not a canned independent verification", async () => {
  const { bundle, bytes } = prepareIntake(
      await intakeInput(),
      INTAKE_START,
      INTAKE_START,
    ),
    state = {
      cases: { cases: [], idempotency_records: [], source_event_records: [] },
      artifacts: bytes,
      bundles: [bundle],
      commits: [],
      clockFloor: INTAKE_START,
    };
  const m = projectDiscovery(
    state,
    bundle.id,
    bundle.records[0].record_key,
    null,
  );
  assert.match(m.findings[2].text, /does not prove non-delivery/);
  assert.ok(m.source_claims.every((c) => c.independently_verified === false));
  assert.equal(m.assignment.accountable_owner, null);
  assert.match(m.measurement_note, /overlapping/);
});

test("D10-B cited excerpt truncation preserves UTF-8 byte boundaries", async () => {
  const input = await intakeInput();
  input.artifacts[1].bytes_base64 = globalThis.Buffer.from(
    "x".repeat(1023) + "😀" + " remaining ambiguous text",
  ).toString("base64");
  const { bundle, bytes } = prepareIntake(input, INTAKE_START, INTAKE_START),
    state = {
      cases: { cases: [], idempotency_records: [], source_event_records: [] },
      artifacts: bytes,
      bundles: [bundle],
      commits: [],
      clockFloor: INTAKE_START,
    };
  const m = projectDiscovery(
      state,
      bundle.id,
      bundle.records[0].record_key,
      null,
    ),
    c = m.sources.find((c) => c.name === "note-17.txt");
  assert.equal(c.excerpt, "x".repeat(1023) + "😀");
  assert.equal(
    bytes
      .get(c.artifact_hash)
      .subarray(c.locator.byte_start, c.locator.byte_end)
      .toString("utf8"),
    c.excerpt,
  );
});
