import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import test from "node:test";
import { assertValidIntakeContract } from "../dist/packages/contracts/src/index.js";
import { prepareIntake } from "../dist/packages/runtime/src/intake.js";
import { intakeInput, INTAKE_START } from "./helpers/intake.mjs";

test("D9-B contract: strict synthetic input cannot accept supplied authority or scope", async () => {
  const command = await intakeInput();
  assertValidIntakeContract("prepare", command);
  for (const field of [
    "tenant_id",
    "actor",
    "authorized",
    "classification",
    "scope_ids",
  ])
    assert.throws(() =>
      assertValidIntakeContract("prepare", { ...command, [field]: "injected" }),
    );
});
test("D9-B A1: retain original bytes and unknown source time in an inspectable preparation", async () => {
  const result = prepareIntake(await intakeInput(), INTAKE_START, INTAKE_START);
  assert.equal(result.bundle.coverage.distinct_records, 2);
  assert.equal(result.bundle.records[0].source_occurrence.instant, null);
  assert.equal(result.bundle.records[0].locators[0].byte_start, 236);
  assert.equal(result.bundle.records[0].locators[0].byte_end, 352);
});
test("D9-B A8: unsupported document formats are denied rather than accepted", async () => {
  const command = await intakeInput();
  command.artifacts[1].name = "notes.docx";
  assert.throws(
    () => prepareIntake(command, INTAKE_START, INTAKE_START),
    (error) => error.code === "UNSUPPORTED_FORMAT",
  );
});

const { editQueue, boundSelection } = await import("./helpers/intake.mjs");
const {
  intakeTime,
  parseIntakeCsv,
  readIntakeView,
  previewIntake,
  buildIntakeMaterial,
} = await import("../dist/packages/runtime/src/intake.js");
const empty = { cases: [], idempotency_records: [], source_event_records: [] };
const prepare = (input) =>
  prepareIntake(input, INTAKE_START, INTAKE_START).bundle;
test("D9-B A3/A4: reordering preserves K/V/M; changed source and selected support change material", async () => {
  const input = await intakeInput(),
    a = prepare(input),
    original = readIntakeView(a, empty, []),
    m = previewIntake(boundSelection(original), a, empty, []);
  const reordered = editQueue(structuredClone(input), (rows, headers) => ({
      rows: rows.reverse(),
      headers: headers.reverse(),
    })),
    b = prepare(reordered),
    v = readIntakeView(b, empty, []);
  assert.notEqual(a.id, b.id);
  assert.equal(a.records[0].record_key, b.records[1].record_key);
  assert.equal(a.records[0].source_revision, b.records[1].source_revision);
  assert.equal(
    previewIntake(boundSelection(v, 1), b, empty, []).material_key,
    m.material_key,
  );
  const changed = editQueue(structuredClone(input), (rows) => {
      rows[0].amount_minor = "1600000";
    }),
    c = prepare(changed);
  assert.notEqual(
    previewIntake(boundSelection(readIntakeView(c, empty, [])), c, empty, [])
      .material_key,
    m.material_key,
  );
  input.artifacts[1].bytes_base64 = Buffer.from(
    "Different retained note\n",
  ).toString("base64");
  const d = prepare(input);
  assert.notEqual(
    previewIntake(boundSelection(readIntakeView(d, empty, [])), d, empty, [])
      .material_key,
    m.material_key,
  );
});
test("D9-B A5/A6/A7: scoped records, many-to-many links and partial population stay qualified", async () => {
  const input = await intakeInput();
  input.claims.coverage = "partial";
  input.claims.population_count = 100;
  editQueue(input, (rows) => {
    rows[0].order_ids = "PO-9;PO-11";
    rows[0].delivery_ids = "DEL-4;DEL-8";
    rows[1].source_record_id = rows[0].source_record_id;
  });
  const b = prepare(input);
  assert.notEqual(b.records[0].record_key, b.records[1].record_key);
  assert.equal(b.records[0].relationships.length, 4);
  assert.ok(
    b.records[0].relationships.every((l) => l.from === "invoice:INV-101"),
  );
  assert.equal(b.coverage.physical_records, 2);
  assert.equal(b.coverage.source_population_claim, 100);
  assert.ok(b.coverage.measurement_gaps.includes("population_unconfirmed"));
});
test("D9-B A8: encoding, grammar, limits, duplicate identities and declared hashes fail closed", async () => {
  const input = await intakeInput();
  const queue = Buffer.from(input.artifacts[0].bytes_base64, "base64");
  assert.equal(
    parseIntakeCsv(Buffer.concat([Buffer.from([239, 187, 191]), queue])).rows
      .length,
    2,
  );
  for (const bytes of [
    Buffer.from([255]),
    Buffer.from("not,the,headers\n"),
    Buffer.concat([queue, Buffer.from('"unclosed')]),
    Buffer.alloc(1048577, 65),
  ])
    assert.throws(() => parseIntakeCsv(bytes));
  for (const mutate of [
    (x) => {
      x.artifacts[1].declared_hash = `sha256:${"0".repeat(64)}`;
    },
    (x) =>
      editQueue(x, (rows) => {
        rows[1] = { ...rows[0], amount_minor: "2" };
      }),
    (x) =>
      editQueue(x, (rows) => {
        rows[0].legal_entity_id = "entity_outside";
      }),
    (x) =>
      editQueue(x, (rows) => {
        rows[0].activity = "a".repeat(8193);
      }),
  ]) {
    const bad = structuredClone(input);
    mutate(bad);
    assert.throws(() => prepare(bad));
  }
  const invalid = editQueue(structuredClone(input), (rows) => {
    rows[0].amount_minor = "-1";
    rows[0].source_occurred_at = "2026-02-30T00:00:00Z";
    rows[0].source_timezone = "UTC";
  });
  const retained = prepare(invalid);
  assert.equal(retained.coverage.invalid_records, 1);
  assert.equal(retained.records[1].valid, true);
  assert.throws(() =>
    previewIntake(
      boundSelection(readIntakeView(retained, empty, [])),
      retained,
      empty,
      [],
    ),
  );
  const opaque = structuredClone(input);
  opaque.artifacts[1] = {
    ...opaque.artifacts[1],
    name: "proof.pdf",
    media_type: "application/pdf",
    bytes_base64: Buffer.from(
      "%PDF-1.7\nretention-only synthetic fixture",
    ).toString("base64"),
  };
  const pdf = prepare(opaque).artifacts.find((a) => a.role === "support");
  assert.equal(pdf.interpretation, "retained_only");
  assert.equal(pdf.derived_text, null);
});
test("D9-B source time: calendar, precision and IANA offset coherence are exact", () => {
  assert.equal(
    intakeTime("2026-09-07T09:00:00-07:00", "America/Los_Angeles").instant,
    "2026-09-07T16:00:00.000Z",
  );
  for (const [time, zone] of [
    ["2026-02-30T00:00:00Z", "UTC"],
    ["2026-09-07T09:00:00-08:00", "America/Los_Angeles"],
    ["2026-09-07T16:00:00.0001Z", "UTC"],
    ["2026-09-07", "UTC"],
    [null, "UTC"],
    ["2026-09-07T16:00:00Z", "Unknown/Zone"],
  ])
    assert.throws(() => intakeTime(time, zone));
});
test("D9-B A11: reviewed exclusions change consent and material; arbitrary links cannot expand scope", async () => {
  const b = prepare(await intakeInput()),
    v = readIntakeView(b, empty, []),
    s = boundSelection(v),
    a = previewIntake(s, b, empty, []);
  s.support_document_ids = [];
  s.reviewed_links = [];
  s.reason =
    "Exclude unsupported delivery association; retain earlier report as source evidence";
  const c = previewIntake(s, b, empty, []);
  assert.notEqual(a.material_key, c.material_key);
  assert.notEqual(a.consent_hash, c.consent_hash);
  s.reviewed_links = [
    {
      entity: "entity_south",
      from: "invoice:INV-101",
      to: "order:PO-9",
      qualification: "reviewed",
    },
  ];
  assert.throws(() => buildIntakeMaterial(s, b, []));
});

test("D9-B A8 presentation: repeated invalid rows remain inspectable beside a valid independent candidate", async () => {
  const input = editQueue(await intakeInput(), (rows, headers) => ({
    rows: [
      { ...rows[0], source_record_id: "" },
      { ...rows[0], source_record_id: "" },
      rows[1],
    ],
    headers,
  }));
  const bundle = prepare(input),
    view = readIntakeView(bundle, empty, []);
  assert.equal(view.bundle.coverage.invalid_records, 2);
  assert.equal(view.candidates[2].can_review, true);
  const { validateIntakeView } =
    await import("../apps/admin/public/intake-client.js");
  await assert.doesNotReject(validateIntakeView(view));
});

test("D9-B CSV grammar: quoted newlines accept LF/CRLF and reject bare CR", async () => {
  for (const newline of ["\n", "\r\n", "\r"]) {
    const input = editQueue(await intakeInput(), (rows) => {
      rows[0].activity = `first${newline}second`;
    });
    const parse = () => prepareIntake(input, INTAKE_START, INTAKE_START);
    if (newline === "\r")
      assert.throws(parse, (error) => error.code === "INVALID_FORMAT");
    else {
      const result = parse();
      assert.equal(result.bundle.records[0].locators[0].line_end, 3);
    }
  }
});
