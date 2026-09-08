import { createHash } from "node:crypto";
import {
  assertValidIntakeContract,
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import { getCase, type CaseEngineState } from "./case-engine.js";

export type IntakeObject = Record<string, unknown>;
export class IntakeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IntakeError";
  }
}
export function requireIntake(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new IntakeError(code, message);
}
export function intakeObject(value: unknown): IntakeObject {
  requireIntake(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "INTAKE_INTEGRITY",
    "Expected a record",
  );
  return value as IntakeObject;
}
export function intakeList(value: unknown): readonly IntakeObject[] {
  requireIntake(Array.isArray(value), "INTAKE_INTEGRITY", "Expected records");
  return value.map(intakeObject);
}
export const INTAKE_TENANT = "tenant_intake_demo";
export const INTAKE_SCOPES = [
  "scope_entity_north",
  "scope_entity_south",
] as const;
export const INTAKE_PROFILE_ID = "invoice-dispute-intake.v1";
export const INTAKE_VERSIONS = immutableJson({
  csv: "csv.invoice-dispute.v1",
  text: "text.utf8.v1",
  mapping: "mapping.invoice-dispute.v1",
  timezone: `iana-offset.v1:${process.versions.tz ?? "unknown"}`,
});
export const INTAKE_ACTOR = immutableJson({
  schema_version: "identity-reference.v0",
  identity_id: "identity_intake_operator",
  tenant_id: INTAKE_TENANT,
  identity_kind: "human",
  status: "active",
});
export const INTAKE_HEADERS =
  "source_record_id source_version legal_entity_id customer_ref invoice_id amount_minor currency source_status activity reported_actor reported_role upstream_case_id upstream_owner order_ids delivery_ids source_occurred_at source_timezone".split(
    " ",
  );
export const MAX_INTAKE_HTTP_BYTES = 29 * 1024 * 1024;
const MiB = 1024 * 1024;
const sorted = <T>(values: readonly T[]): T[] =>
  [...values].sort((a, b) =>
    canonicalJson(a) < canonicalJson(b)
      ? -1
      : canonicalJson(a) > canonicalJson(b)
        ? 1
        : 0,
  );
const equal = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);
export const intakeBytesHash = (bytes: Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const hex = (hash: unknown): string => String(hash).slice(7);
function present<T>(value: T | undefined): T {
  requireIntake(
    value !== undefined,
    "INVALID_INPUT",
    "Required parsed value is missing",
  );
  return value;
}
function idValid(value: string): boolean {
  if (!value.length || value.length > 128 || value.trim() !== value)
    return false;
  for (let i = 0; i < value.length; i++)
    if (value.charCodeAt(i) < 32 || value.charCodeAt(i) === 127) return false;
  return true;
}
const scopeFor = (entity: unknown): string =>
  entity === "entity_north" ? INTAKE_SCOPES[0] : INTAKE_SCOPES[1];
const without = (value: IntakeObject, ...keys: string[]): IntakeObject =>
  Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k)));
function utf8(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    requireIntake(
      !text.includes("\0"),
      "INVALID_FORMAT",
      "NUL bytes are unsupported",
    );
    return text;
  } catch (error) {
    if (error instanceof IntakeError) throw error;
    throw new IntakeError("INVALID_FORMAT", "Input must be strict UTF-8");
  }
}
export function intakeTime(raw: unknown, timezone: unknown): IntakeObject {
  if (raw === null && timezone === null)
    return { raw: null, instant: null, timezone: null, quality: "unknown" };
  requireIntake(
    typeof raw === "string" && typeof timezone === "string",
    "INVALID_TIME",
    "Time and timezone must be supplied together",
  );
  const m =
    /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}:\d{2}:\d{2})(\.\d{1,3})?([Zz]|[+-]\d{2}:\d{2})$/.exec(
      raw,
    );
  requireIntake(
    m,
    "INVALID_TIME",
    "An exact offset-qualified occurrence is required",
  );
  const wall = `${present(m[1])}T${present(m[2])}${(m[3] ?? ".000").padEnd(4, "0")}Z`;
  const wallDate = new Date(wall),
    instant = new Date(raw);
  requireIntake(
    Number.isFinite(instant.getTime()) &&
      Number.isFinite(wallDate.getTime()) &&
      wallDate.toISOString() === wall,
    "INVALID_TIME",
    "Invalid calendar time or precision",
  );
  const offset = (wallDate.getTime() - instant.getTime()) / 60_000;
  requireIntake(
    Math.abs(offset) <= 1439,
    "INVALID_TIME",
    "Invalid time offset",
  );
  if (/^UTC(?:[+-](?:0[0-9]|1[0-9]|2[0-3]):[0-5][0-9])?$/.test(timezone)) {
    const sign = timezone[3] === "-" ? -1 : 1;
    const expected =
      timezone === "UTC"
        ? 0
        : sign *
          (Number(timezone.slice(4, 6)) * 60 + Number(timezone.slice(7, 9)));
    requireIntake(
      expected === offset,
      "INVALID_TIME",
      "Timezone and offset disagree",
    );
  } else {
    try {
      requireIntake(
        timezone.includes("/"),
        "INVALID_TIME",
        "Unsupported timezone label",
      );
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(instant);
      const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
      requireIntake(
        `${present(p.year)}-${present(p.month)}-${present(p.day)}T${present(p.hour)}:${present(p.minute)}:${present(p.second)}` ===
          wall.slice(0, 19),
        "INVALID_TIME",
        "Timezone and offset disagree",
      );
    } catch (error) {
      if (error instanceof IntakeError) throw error;
      throw new IntakeError("INVALID_TIME", "Unknown timezone");
    }
  }
  return { raw, instant: instant.toISOString(), timezone, quality: "reported" };
}
interface CsvRecord {
  cells: string[];
  start: number;
  end: number;
  lineStart: number;
  lineEnd: number;
}
export function parseIntakeCsv(bytes: Buffer): {
  headers: string[];
  rows: CsvRecord[];
} {
  requireIntake(bytes.length <= MiB, "INPUT_LIMIT", "CSV exceeds 1 MiB");
  utf8(bytes);
  let i = bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])) ? 3 : 0;
  let start = i,
    line = 1,
    lineStart = 1,
    quoted = false,
    closed = false,
    field: number[] = [],
    cells: string[] = [];
  const records: CsvRecord[] = [];
  const cell = (): void => {
    const value = utf8(Buffer.from(field));
    requireIntake(
      Buffer.byteLength(value) <= 8192,
      "INPUT_LIMIT",
      "CSV cell exceeds 8 KiB",
    );
    cells.push(value);
    field = [];
    closed = false;
  };
  const record = (end: number): void => {
    cell();
    records.push({ cells, start, end, lineStart, lineEnd: line });
    requireIntake(
      records.length <= 2001,
      "INPUT_LIMIT",
      "CSV exceeds 2,000 records",
    );
    cells = [];
  };
  for (; i < bytes.length; i++) {
    const b = bytes[i];
    if (quoted) {
      if (b === 34) {
        if (bytes[i + 1] === 34) {
          field.push(34);
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        if (b === 13)
          requireIntake(
            bytes[i + 1] === 10,
            "INVALID_FORMAT",
            "Use LF or CRLF",
          );
        field.push(present(b));
        if (b === 10) line++;
      }
    } else if (b === 34) {
      requireIntake(
        field.length === 0 && !closed,
        "INVALID_FORMAT",
        "Unexpected CSV quote",
      );
      quoted = true;
    } else if (b === 44) cell();
    else if (b === 10 || b === 13) {
      if (b === 13) {
        requireIntake(bytes[i + 1] === 10, "INVALID_FORMAT", "Use LF or CRLF");
        i++;
      }
      record(i + 1);
      line++;
      start = i + 1;
      lineStart = line;
    } else {
      requireIntake(
        !closed,
        "INVALID_FORMAT",
        "Unexpected content after quote",
      );
      field.push(present(b));
    }
    requireIntake(
      field.length <= 8192,
      "INPUT_LIMIT",
      "CSV cell exceeds 8 KiB",
    );
  }
  requireIntake(!quoted, "INVALID_FORMAT", "Unclosed CSV quote");
  if (start < bytes.length) record(bytes.length);
  const header = records.shift();
  requireIntake(header, "INVALID_FORMAT", "CSV header is required");
  requireIntake(
    equal([...header.cells].sort(), [...INTAKE_HEADERS].sort()),
    "INVALID_FORMAT",
    "Use exactly the supported CSV headers",
  );
  for (const row of records)
    requireIntake(
      row.cells.length === header.cells.length,
      "INVALID_FORMAT",
      "CSV column count differs",
    );
  return { headers: header.cells, rows: records };
}
function locator(
  hash: string,
  record: number | null,
  row?: CsvRecord,
  length = 0,
): IntakeObject {
  return {
    artifact_hash: hash,
    record,
    line_start: row?.lineStart ?? null,
    line_end: row?.lineEnd ?? null,
    byte_start: row?.start ?? 0,
    byte_end: row?.end ?? length,
    field: null,
  };
}
export function normalizeIntakePrepare(command: unknown): IntakeObject {
  assertValidIntakeContract("prepare", command);
  const value = intakeObject(immutableJson(command));
  return {
    ...value,
    artifacts: sorted(
      intakeList(value.artifacts).map((a) => ({
        ...a,
        associations: sorted(intakeList(a.associations)),
      })),
    ),
  };
}
function artifact(input: IntakeObject): {
  metadata: IntakeObject;
  bytes: Buffer;
  csv?: ReturnType<typeof parseIntakeCsv>;
} {
  const encoded = String(input.bytes_base64);
  requireIntake(
    encoded.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded),
    "INVALID_FORMAT",
    "Invalid base64",
  );
  const bytes = Buffer.from(encoded, "base64");
  requireIntake(
    bytes.toString("base64") === encoded,
    "INVALID_FORMAT",
    "Noncanonical base64",
  );
  const ext = String(input.name).split(".").at(-1)?.toLowerCase();
  const media: Record<string, string> = {
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  requireIntake(
    ext &&
      media[ext] === input.media_type &&
      (input.role === "queue" ? ext === "csv" : ext !== "csv"),
    "UNSUPPORTED_FORMAT",
    "Unsupported file format or media type",
  );
  const text = ext === "txt" || ext === "md";
  requireIntake(
    bytes.length <= (ext === "csv" ? MiB : text ? 512 * 1024 : 5 * MiB),
    "INPUT_LIMIT",
    "File exceeds its profile limit",
  );
  if (ext === "pdf")
    requireIntake(
      bytes.subarray(0, 5).equals(Buffer.from("%PDF-")),
      "INVALID_FORMAT",
      "PDF signature mismatch",
    );
  if (ext === "png")
    requireIntake(
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      "INVALID_FORMAT",
      "PNG signature mismatch",
    );
  if (ext === "jpg" || ext === "jpeg")
    requireIntake(
      bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
      "INVALID_FORMAT",
      "JPEG signature mismatch",
    );
  const hash = intakeBytesHash(bytes);
  requireIntake(
    input.declared_hash === null || input.declared_hash === hash,
    "HASH_MISMATCH",
    "Declared hash differs from received bytes",
  );
  requireIntake(
    idValid(String(input.document_id)),
    "INVALID_INPUT",
    "Invalid stable document ID",
  );
  for (const a of intakeList(input.associations))
    requireIntake(
      idValid(String(a.id)),
      "INVALID_INPUT",
      "Invalid association identifier",
    );
  const csv = ext === "csv" ? parseIntakeCsv(bytes) : undefined;
  const derived = text
    ? utf8(
        bytes.subarray(
          bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])) ? 3 : 0,
        ),
      )
    : null;
  const metadata = {
    ...without(input, "bytes_base64"),
    byte_hash: hash,
    byte_length: bytes.length,
    scope_ids: [...INTAKE_SCOPES],
    interpretation: csv ? "csv" : text ? "text" : "retained_only",
    parser_version: csv
      ? INTAKE_VERSIONS.csv
      : text
        ? INTAKE_VERSIONS.text
        : "none",
    derived_text: derived,
    derived_hash: csv
      ? sha256Json(csv)
      : text
        ? intakeBytesHash(Buffer.from(present(derived ?? undefined)))
        : null,
    derived_from: {
      ...locator(hash, null, undefined, bytes.length),
      ...(text
        ? { line_start: 1, line_end: (derived ?? "").split("\n").length }
        : {}),
    },
  };
  return csv ? { metadata, bytes, csv } : { metadata, bytes };
}
function mapRecord(
  cells: Record<string, string>,
  at: IntakeObject,
  snapshot: IntakeObject,
  ingestedAt: string,
): IntakeObject {
  const findings: IntakeObject[] = [];
  const invalid = (field: string, message: string): void => {
    findings.push({ code: "invalid_field", field, severity: "error", message });
  };
  for (const k of [
    "source_record_id",
    "legal_entity_id",
    "customer_ref",
    "invoice_id",
  ])
    if (!idValid(present(cells[k])))
      invalid(k, "A valid scoped identifier is required");
  if (
    cells.legal_entity_id &&
    !["entity_north", "entity_south"].includes(cells.legal_entity_id)
  )
    throw new IntakeError(
      "SCOPE_MISMATCH",
      "Entity is outside the synthetic profile",
    );
  for (const k of ["source_version", "upstream_case_id"])
    if (cells[k] && !idValid(present(cells[k])))
      invalid(k, "Invalid source identifier");
  if (
    !/^(?:0|[1-9]\d*)$/.test(present(cells.amount_minor)) ||
    !Number.isSafeInteger(Number(cells.amount_minor))
  )
    invalid("amount_minor", "A nonnegative safe integer amount is required");
  if (cells.currency !== "USD") invalid("currency", "Only USD is supported");
  if (!cells.source_status)
    invalid("source_status", "Reported status is required");
  const related = (field: string): string[] => {
    const values = cells[field] ? present(cells[field]).split(";") : [];
    if (
      values.length > 20 ||
      new Set(values).size !== values.length ||
      values.some((v) => !idValid(v))
    )
      invalid(field, "Use at most 20 distinct identifiers");
    return values.filter(idValid).slice(0, 20);
  };
  const orders = related("order_ids"),
    deliveries = related("delivery_ids");
  let occurrence: IntakeObject;
  try {
    occurrence = intakeTime(
      cells.source_occurred_at || null,
      cells.source_timezone || null,
    );
  } catch {
    invalid("source_occurred_at", "Source time or timezone is invalid");
    occurrence = {
      raw: cells.source_occurred_at || null,
      instant: null,
      timezone: cells.source_timezone || null,
      quality: "invalid",
    };
  }
  const keyFields = [
    INTAKE_TENANT,
    "scope_invoice_disputes",
    "synthetic_ar_queue",
    cells.legal_entity_id,
    "invoice_dispute",
    cells.source_record_id,
  ];
  const key = keyFields.every((v) => typeof v === "string" && idValid(v))
    ? sha256Json(keyFields)
    : null;
  const objects: IntakeObject[] = [];
  const add = (kind: string, id: string, field: string): void => {
    if (
      idValid(id) &&
      ["entity_north", "entity_south"].includes(present(cells.legal_entity_id))
    )
      objects.push({
        source: "synthetic_ar_queue",
        entity: cells.legal_entity_id,
        kind,
        id,
        qualification: "reported",
        citation: { ...at, field },
      });
  };
  add("customer", present(cells.customer_ref), "customer_ref");
  add("invoice", present(cells.invoice_id), "invoice_id");
  for (const v of orders) add("order", v, "order_ids");
  for (const v of deliveries) add("delivery", v, "delivery_ids");
  const relationships =
    idValid(present(cells.invoice_id)) &&
    ["entity_north", "entity_south"].includes(present(cells.legal_entity_id))
      ? objects
          .filter((o) => o.kind === "order" || o.kind === "delivery")
          .map((o) => ({
            entity: cells.legal_entity_id,
            from: `invoice:${present(cells.invoice_id)}`,
            to: `${String(o.kind)}:${String(o.id)}`,
            qualification: "reported",
          }))
      : [];
  const gaps = [
    "population_unconfirmed",
    "active_effort_unmeasured",
    "relationships_unconfirmed",
  ];
  if (occurrence.quality !== "reported") gaps.push("source_occurrence_unknown");
  if (snapshot.quality !== "reported") gaps.push("source_snapshot_unknown");
  return {
    record_key: key,
    source_revision: sha256Json({ cells, source_snapshot: snapshot }),
    source_system: "synthetic_ar_queue",
    source_record_id: cells.source_record_id,
    reported_source_version: cells.source_version || null,
    entity: cells.legal_entity_id,
    cells,
    source_occurrence: occurrence,
    source_snapshot: snapshot,
    ingested_at: ingestedAt,
    upstream_case_ref: cells.upstream_case_id
      ? {
          source: "synthetic_ar_queue",
          entity: cells.legal_entity_id,
          id: cells.upstream_case_id,
        }
      : null,
    reported_owner: cells.upstream_owner || null,
    reported_activity: cells.activity || null,
    reported_actor: cells.reported_actor || null,
    reported_role: cells.reported_role || null,
    reported_status: cells.source_status,
    business_objects: sorted(objects),
    relationships: sorted(relationships),
    locators: [at],
    findings,
    measurement_gaps: sorted(gaps),
    valid: findings.length === 0,
  };
}
export function prepareIntake(
  command: unknown,
  ingestedAt: string,
  retainedAt: string,
): { bundle: IntakeObject; bytes: Map<string, Buffer> } {
  const input = normalizeIntakePrepare(command),
    files = intakeList(input.artifacts);
  requireIntake(
    files.filter((f) => f.role === "queue").length === 1 && files.length <= 17,
    "INVALID_INPUT",
    "Exactly one CSV queue and at most 16 support documents are required",
  );
  requireIntake(
    new Set(files.map((f) => f.document_id)).size === files.length,
    "INVALID_INPUT",
    "Stable document IDs must be unique",
  );
  const parsed = files.map(artifact);
  requireIntake(
    parsed.reduce((n, f) => n + f.bytes.length, 0) <= 20 * MiB,
    "INPUT_LIMIT",
    "Bundle exceeds 20 MiB",
  );
  const queue = present(parsed.find((f) => f.csv));
  requireIntake(
    intakeList(queue.metadata.associations).length === 0,
    "INVALID_INPUT",
    "Queue associations must be empty",
  );
  const claims = intakeObject(input.claims),
    snapshot = intakeTime(claims.snapshot_at, claims.snapshot_timezone);
  if (claims.population_window !== null) {
    const w = intakeObject(claims.population_window),
      start = intakeTime(w.start, w.timezone),
      end = intakeTime(w.end, w.timezone);
    requireIntake(
      String(start.instant) <= String(end.instant),
      "INVALID_TIME",
      "Population window is reversed",
    );
  }
  requireIntake(
    new Date(ingestedAt).toISOString() === ingestedAt &&
      new Date(retainedAt).toISOString() === retainedAt &&
      ingestedAt <= retainedAt,
    "CLOCK_REGRESSION",
    "Ingestion must precede retention",
  );
  const records: IntakeObject[] = [],
    keys = new Map<string, IntakeObject>();
  for (const [index, row] of present(queue.csv).rows.entries()) {
    const cells = Object.fromEntries(
      present(queue.csv).headers.map((h, i) => [h, present(row.cells[i])]),
    );
    const mapped = mapRecord(
      cells,
      locator(String(queue.metadata.byte_hash), index + 1, row),
      snapshot,
      ingestedAt,
    );
    if (mapped.record_key !== null) {
      const key = present(mapped.record_key as string | undefined),
        prior = keys.get(key);
      if (prior) {
        requireIntake(
          prior.source_revision === mapped.source_revision,
          "CONTRADICTORY_RECORD",
          "One export contains contradictory copies of a source record",
        );
        prior.locators = [
          ...intakeList(prior.locators),
          ...intakeList(mapped.locators),
        ];
        continue;
      }
      keys.set(key, mapped);
    }
    records.push(mapped);
  }
  const identity = sha256Json({
    profile_id: INTAKE_PROFILE_ID,
    profile_version: "1",
    claims,
    artifacts: sorted(
      parsed.map((f) => {
        const a = f.metadata;
        return {
          role: a.role,
          document_id: a.document_id,
          byte_hash: a.byte_hash,
          associations: a.associations,
        };
      }),
    ),
  });
  const content: IntakeObject = {
    schema_version: "intake-bundle.v1",
    id: `intake_bundle_${hex(identity)}`,
    identity_hash: identity,
    tenant_id: INTAKE_TENANT,
    profile_id: INTAKE_PROFILE_ID,
    profile_version: "1",
    scope_ids: [...INTAKE_SCOPES],
    versions: INTAKE_VERSIONS,
    preparation_key: input.idempotency_key,
    preparation_fingerprint: sha256Json(input),
    claims,
    ingested_at: ingestedAt,
    retained_at: retainedAt,
    artifacts: sorted(parsed.map((p) => p.metadata)),
    records,
    coverage: {
      physical_records: present(queue.csv).rows.length,
      distinct_records: records.length,
      duplicate_records: present(queue.csv).rows.length - records.length,
      valid_records: records.filter((r) => r.valid).length,
      invalid_records: records.filter((r) => !r.valid).length,
      source_population_claim: claims.population_count,
      source_coverage_claim: claims.coverage,
      measurement_gaps: [
        "population_unconfirmed",
        "active_effort_unmeasured",
        ...(claims.population_window === null
          ? ["population_window_unknown"]
          : []),
      ],
    },
  };
  const bundle = { ...content, hash: sha256Json(content) };
  assertValidIntakeContract("bundle", bundle);
  return {
    bundle: immutableJson(bundle),
    bytes: new Map(parsed.map((p) => [String(p.metadata.byte_hash), p.bytes])),
  };
}
export function intakeUpstreamKey(record: IntakeObject): string | null {
  return record.upstream_case_ref === null
    ? null
    : sha256Json([
        INTAKE_TENANT,
        "scope_invoice_disputes",
        record.upstream_case_ref,
      ]);
}
function recordCommits(
  record: IntakeObject,
  commits: readonly IntakeObject[],
): IntakeObject[] {
  return commits
    .filter((c) => c.record_key === record.record_key)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence));
}
function caseRoot(
  record: IntakeObject,
  commits: readonly IntakeObject[],
): string {
  return String(
    recordCommits(record, commits)[0]?.case_root ??
      intakeUpstreamKey(record) ??
      record.record_key,
  );
}
function coherentCase(
  aggregate: { document: Readonly<IntakeObject> },
  record: IntakeObject,
): boolean {
  const c = intakeObject(aggregate.document.case),
    cells = intakeObject(record.cells);
  return (
    c.tenant_id === INTAKE_TENANT &&
    c.customer_ref === cells.customer_ref &&
    equal(c.scope_ids, [scopeFor(record.entity)])
  );
}
function targets(
  record: IntakeObject,
  cases: CaseEngineState,
  commits: readonly IntakeObject[],
): IntakeObject[] {
  const previous = recordCommits(record, commits).at(-1),
    upstream = intakeUpstreamKey(record);
  const mapped =
    previous ??
    commits.find((c) => upstream !== null && c.upstream_key === upstream);
  return cases.cases
    .filter(
      (c) =>
        c.tenant_id === INTAKE_TENANT &&
        coherentCase(c, record) &&
        (mapped === undefined || mapped.case_id === c.case_id),
    )
    .map((c) => {
      const state = intakeObject(c.document.case);
      return {
        case_id: c.case_id,
        case_version: state.version,
        owner_identity_id: state.owner_identity_id ?? null,
        reason: previous
          ? "record_binding"
          : mapped
            ? "upstream_binding"
            : "exact_customer_entity",
      };
    });
}
function associated(document: IntakeObject, record: IntakeObject): boolean {
  const objects = intakeList(record.business_objects);
  return intakeList(document.associations).some(
    (a) =>
      a.entity === record.entity &&
      (a.kind === "record"
        ? a.id === record.source_record_id
        : objects.some((o) => o.kind === a.kind && o.id === a.id)),
  );
}
function acknowledgments(
  record: IntakeObject,
  bundle: IntakeObject,
  commits: readonly IntakeObject[],
): string[] {
  const previous = recordCommits(record, commits);
  const values = [
    ...(record.measurement_gaps as string[]),
    ...(intakeObject(bundle.coverage).measurement_gaps as string[]),
    "target_reviewed",
    "support_unconfirmed",
  ];
  if (
    previous.some((c) => {
      const source = intakeObject(intakeObject(c.review_material).record);
      return (
        source.reported_source_version === record.reported_source_version &&
        source.source_revision !== record.source_revision
      );
    })
  )
    values.push("contradictory_source_revision");
  return [...new Set(values)].sort();
}
export function readIntakeView(
  bundle: IntakeObject,
  cases: CaseEngineState,
  commits: readonly IntakeObject[],
): IntakeObject {
  const candidates = intakeList(bundle.records).map((record) => {
    const prior = recordCommits(record, commits),
      matches = record.valid ? targets(record, cases, commits) : [];
    return {
      record_key: record.record_key,
      record,
      targets: matches,
      proposed_case_id: record.valid
        ? `case_intake_${hex(caseRoot(record, commits))}`
        : null,
      prior_intake_binding: prior.at(-1)?.hash ?? null,
      required_acknowledgments: acknowledgments(record, bundle, commits),
      support_document_ids: intakeList(bundle.artifacts)
        .filter((a) => a.role === "support" && associated(a, record))
        .map((a) => a.document_id),
      reviewed_links: record.relationships,
      commits: prior,
      can_review: record.valid,
    };
  });
  const committed = candidates.filter((c) => c.commits.length > 0).length;
  const view = {
    schema_version: "intake-view.v1",
    bundle,
    candidates,
    coverage: {
      distinct_records: candidates.length,
      committed_records: committed,
      uncommitted_records: candidates.length - committed,
      unmatched_records: candidates.filter((c) => c.targets.length === 0)
        .length,
      ambiguous_records: candidates.filter((c) => c.targets.length > 1).length,
    },
    authority_granted: false,
    closure_permission: false,
  };
  assertValidIntakeContract("view", view);
  return immutableJson(view);
}
export function normalizeIntakeSelection(
  value: unknown,
  kind: "review" | "selection",
): IntakeObject {
  assertValidIntakeContract(kind, value);
  const command = { ...intakeObject(immutableJson(value)) };
  for (const k of [
    "support_document_ids",
    "reviewed_links",
    "acknowledgments",
  ]) {
    const values = command[k] as unknown[];
    requireIntake(
      new Set(values.map(canonicalJson)).size === values.length,
      "INVALID_INPUT",
      "Repeated selection values are invalid",
    );
    command[k] = sorted(values);
  }
  requireIntake(
    String(command.reason).trim().length > 0,
    "INVALID_INPUT",
    "A review reason is required",
  );
  return command;
}
export function buildIntakeMaterial(
  selection: IntakeObject,
  bundle: IntakeObject,
  commits: readonly IntakeObject[],
): IntakeObject {
  requireIntake(
    selection.bundle_id === bundle.id &&
      selection.expected_bundle_hash === bundle.hash,
    "BINDING_CONFLICT",
    "Prepared material binding changed",
  );
  const record = intakeList(bundle.records).find(
    (r) => r.record_key === selection.record_key,
  );
  requireIntake(
    record?.valid,
    "INVALID_RECORD",
    "Select a valid source record",
  );
  requireIntake(
    selection.expected_source_revision === record.source_revision,
    "BINDING_CONFLICT",
    "Source revision changed",
  );
  const ids = selection.support_document_ids as string[],
    support = intakeList(bundle.artifacts).filter((a) =>
      ids.includes(String(a.document_id)),
    );
  requireIntake(
    support.length === ids.length &&
      support.every((a) => a.role === "support" && associated(a, record)),
    "MATCH_REQUIRED",
    "Supporting documents need a coherent reviewed source association",
  );
  const objects = new Set(
    intakeList(record.business_objects).map(
      (o) => `${String(o.kind)}:${String(o.id)}`,
    ),
  );
  const links = intakeList(selection.reviewed_links);
  requireIntake(
    links.every(
      (l) =>
        l.entity === record.entity &&
        objects.has(String(l.from)) &&
        objects.has(String(l.to)) &&
        l.from !== l.to,
    ),
    "MATCH_REQUIRED",
    "Reviewed links must refer to the selected entity and cited objects",
  );
  const root = caseRoot(record, commits),
    target = intakeObject(selection.target),
    caseId =
      target.mode === "create"
        ? `case_intake_${hex(root)}`
        : String(target.case_id);
  const materialKey = sha256Json({
    profile_id: INTAKE_PROFILE_ID,
    profile_version: "1",
    record_key: record.record_key,
    source_revision: record.source_revision,
    support: sorted(
      support.map((a) => ({
        document_id: a.document_id,
        byte_hash: a.byte_hash,
      })),
    ),
    reviewed_links: links,
    versions: INTAKE_VERSIONS,
  });
  const evidence = [
    present(intakeList(bundle.artifacts).find((a) => a.role === "queue")),
    ...support,
  ].map((a) => ({
    id: `evidence_${hex(a.byte_hash)}`,
    tenant_id: INTAKE_TENANT,
    source: "fieldruntime_intake",
    resource_uri: `intake://artifacts/${hex(a.byte_hash)}`,
    content_hash: a.byte_hash,
    scope_ids: [...INTAKE_SCOPES],
    authority_rank: 5,
    freshness_status: "unknown",
  }));
  const material = {
    schema_version: "intake-material.v1",
    profile_id: INTAKE_PROFILE_ID,
    profile_version: "1",
    versions: INTAKE_VERSIONS,
    bundle_id: bundle.id,
    bundle_hash: bundle.hash,
    record_key: record.record_key,
    source_revision: record.source_revision,
    material_key: materialKey,
    record,
    support,
    citations: evidence,
    reviewed_links: links,
    target,
    target_case_id: caseId,
    case_root: root,
    expected_prior_intake_binding: selection.expected_prior_intake_binding,
    prior_selection_hash: selection.prior_selection_hash,
    acknowledgments: selection.acknowledgments,
    reason: selection.reason,
  };
  assertValidIntakeContract("material", material);
  return immutableJson(material);
}
export function assertIntakeTarget(
  material: IntakeObject,
  bundle: IntakeObject,
  cases: CaseEngineState,
  commits: readonly IntakeObject[],
): void {
  const record = intakeObject(material.record),
    previous = recordCommits(record, commits).at(-1),
    target = intakeObject(material.target),
    caseId = String(material.target_case_id);
  requireIntake(
    material.expected_prior_intake_binding === (previous?.hash ?? null),
    "BINDING_CONFLICT",
    "Prior intake binding changed; refresh and review again",
  );
  requireIntake(
    equal(material.acknowledgments, acknowledgments(record, bundle, commits)),
    "ACKNOWLEDGMENT_REQUIRED",
    "Review the current source, matching and coverage findings",
  );
  requireIntake(
    material.prior_selection_hash === null ||
      previous?.review_material_hash === material.prior_selection_hash,
    "BINDING_CONFLICT",
    "Prior consent reference is unavailable",
  );
  requireIntake(
    previous === undefined || previous.case_id === caseId,
    "TARGET_CONFLICT",
    "A committed source record cannot be moved to another Case",
  );
  const upstream = intakeUpstreamKey(record);
  requireIntake(
    !commits.some(
      (c) =>
        upstream !== null &&
        c.upstream_key === upstream &&
        c.case_id !== caseId,
    ),
    "TARGET_CONFLICT",
    "Upstream Case already has a different mapping",
  );
  const aggregate = getCase(cases, INTAKE_TENANT, caseId);
  requireIntake(
    (aggregate === undefined
      ? 0
      : intakeObject(aggregate.document.case).version) ===
      target.expected_case_version,
    "VERSION_CONFLICT",
    "Case changed; refresh and explicitly review again",
  );
  if (target.mode === "create")
    requireIntake(
      aggregate === undefined,
      "TARGET_CONFLICT",
      "The scoped Case root already exists",
    );
  else
    requireIntake(
      aggregate && coherentCase(aggregate, record),
      "MATCH_REQUIRED",
      "Target must preserve tenant, entity and customer scope",
    );
}
export function previewIntake(
  value: unknown,
  bundle: IntakeObject,
  cases: CaseEngineState,
  commits: readonly IntakeObject[],
): IntakeObject {
  const selection = normalizeIntakeSelection(value, "review"),
    material = buildIntakeMaterial(selection, bundle, commits);
  assertIntakeTarget(material, bundle, cases, commits);
  const response = {
    schema_version: "intake-preview.v1",
    review_material: material,
    consent_hash: sha256Json(material),
    material_key: material.material_key,
    required_acknowledgments: acknowledgments(
      intakeObject(material.record),
      bundle,
      commits,
    ),
    authority_granted: false,
  };
  assertValidIntakeContract("preview", response);
  return immutableJson(response);
}
export function adaptIntakeCommand(
  material: IntakeObject,
  key: string,
  at: string,
): IntakeObject {
  const hash = sha256Json(material),
    m = hex(material.material_key),
    record = intakeObject(material.record),
    target = intakeObject(material.target),
    scope = scopeFor(record.entity);
  const event = {
    id: `work_event_${m}`,
    tenant_id: INTAKE_TENANT,
    source: "fieldruntime_intake",
    source_event_id: `intake:${m}`,
    event_type: "intake.material_reviewed",
    actor_identity_id: INTAKE_ACTOR.identity_id,
    scope_ids: [scope],
    occurred_at: at,
    source_timezone: "UTC",
    content_hash: hash,
    payload_ref: `intake://${hex(hash)}`,
    classification: "internal",
    idempotency_key: `intake-event:${m}`,
  };
  const common = {
    tenant_id: INTAKE_TENANT,
    expected_case_version: target.expected_case_version,
    actor_identity_id: INTAKE_ACTOR.identity_id,
    idempotency_key: `intake-command:${hex(sha256Json(key))}`,
    correlation_id: `intake-correlation:${hex(sha256Json(key))}`,
  };
  const command =
    target.mode === "create"
      ? {
          type: "case.create",
          ...common,
          case_seed: {
            tenant: {
              id: INTAKE_TENANT,
              name: "Invoice intake synthetic evaluation",
              status: "active",
              data_region: "local",
              retention_policy_id: "retention_intake_synthetic_v1",
            },
            workflow_version: {
              id: "workflow_ecc_v0_1_0",
              workflow_id: "customer_escalation_commitment_control",
              version: "0.1.0",
              status: "shadow",
              decision_graph_id: "ecc_decision_graph_v0",
              policy_version_ids: ["policy_customer_comms_v3"],
              eval_suite_version: "0.1.0",
              effective_from: "2026-08-26T00:00:00.000Z",
              effective_from_source_timezone: "UTC",
            },
            case: {
              id: material.target_case_id,
              tenant_id: INTAKE_TENANT,
              workflow_version_id: "workflow_ecc_v0_1_0",
              customer_ref: intakeObject(record.cells).customer_ref,
              issue_fingerprint: material.case_root,
              severity: "medium",
              owner_identity_id: null,
              scope_ids: [scope],
            },
          },
          trigger_event: event,
        }
      : {
          type: "case.attach_work_event",
          ...common,
          case_id: material.target_case_id,
          work_event: event,
        };
  assertValidIntakeContract("case_command", command);
  return immutableJson(command);
}
