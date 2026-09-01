import {
  assertValidCaseDocument,
  assertValidCaseJournalEntry,
  validateCrossRecordInvariants,
} from "../../contracts/src/index.js";
import {
  canTransition,
  isCaseState,
  type CaseState,
} from "../../domain/src/index.js";
import {
  canonicalJson,
  canonicalizeJson,
  CanonicalJsonError,
  immutableJson,
  sha256Json,
  type JsonValue,
} from "./canonical-json.js";

type UnknownRecord = Record<string, unknown>;

export type JournalEventType =
  | "case.created"
  | "case.state_transitioned"
  | "case.transition_rejected"
  | "case.work_event_attached";

export interface CaseJournalEntry {
  readonly schema_version: "case-journal-entry.v0";
  readonly id: string;
  readonly tenant_id: string;
  readonly case_id: string;
  readonly sequence: number;
  readonly case_version: number;
  readonly event_type: JournalEventType;
  readonly recorded_at: string;
  readonly actor_identity_id: string;
  readonly idempotency_key: string;
  readonly command_fingerprint: `sha256:${string}`;
  readonly correlation_id: string;
  readonly causation_event_id?: string;
  readonly previous_event_hash: `sha256:${string}` | null;
  readonly before_hash: `sha256:${string}` | null;
  readonly after_hash: `sha256:${string}`;
  readonly payload: Readonly<UnknownRecord>;
  readonly event_hash: `sha256:${string}`;
}

export interface CaseAggregate {
  readonly tenant_id: string;
  readonly case_id: string;
  readonly document: Readonly<UnknownRecord>;
  readonly journal: readonly CaseJournalEntry[];
}

export interface CaseIdempotencyRecord {
  readonly tenant_id: string;
  readonly idempotency_key: string;
  readonly command_fingerprint: `sha256:${string}`;
  readonly case_id: string;
  readonly journal_entry_id: string;
  readonly result_status: "applied" | "rejected";
}

export interface CaseSourceEventRecord {
  readonly tenant_id: string;
  readonly source: string;
  readonly source_event_id: string;
  readonly work_event_fingerprint: `sha256:${string}`;
  readonly case_id: string;
  readonly create_binding_fingerprint?: `sha256:${string}`;
}

export interface CaseEngineState {
  readonly cases: readonly CaseAggregate[];
  readonly idempotency_records: readonly CaseIdempotencyRecord[];
  readonly source_event_records: readonly CaseSourceEventRecord[];
}

/**
 * The single append produced by an applied command or a journaled rejection.
 *
 * Persistence adapters commit this bundle atomically. It is deliberately SQL-
 * agnostic so the deterministic engine remains the only component that derives
 * journal, projection, idempotency, and source-event records.
 */
export interface CaseEngineAppend {
  readonly expected_case_version: number;
  readonly tenant_id: string;
  readonly case_id: string;
  readonly document: Readonly<Record<string, unknown>>;
  readonly journal_entry: CaseJournalEntry;
  readonly idempotency_record: CaseIdempotencyRecord;
  readonly source_event_record?: CaseSourceEventRecord;
  readonly audit_entry_id: string;
}

export interface CaseEngineDependencies {
  readonly now: () => Date;
  readonly nextId: (kind: "audit_entry" | "journal_entry") => string;
}

export type CaseEngineConflictCode =
  | "CASE_ALREADY_EXISTS"
  | "CASE_NOT_FOUND"
  | "CAUSATION_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "SCOPE_EXPANSION"
  | "SOURCE_EVENT_ALREADY_PROCESSED"
  | "SOURCE_EVENT_CONFLICT"
  | "TENANT_MISMATCH"
  | "VERSION_CONFLICT";

export type TransitionRejectionCode =
  "closure_proof_required" | "invalid_transition";

interface SuccessfulCommandResult {
  readonly state: CaseEngineState;
  readonly aggregate: CaseAggregate;
  readonly entry: CaseJournalEntry;
  readonly append: CaseEngineAppend;
}

export type CaseCommandResult =
  | (SuccessfulCommandResult & { readonly status: "applied" })
  | (SuccessfulCommandResult & {
      readonly status: "rejected";
      readonly code: TransitionRejectionCode;
    })
  | {
      readonly status: "duplicate";
      readonly state: CaseEngineState;
      readonly aggregate: CaseAggregate;
      readonly original_entry: CaseJournalEntry;
      readonly original_status: "applied";
    }
  | {
      readonly status: "duplicate";
      readonly state: CaseEngineState;
      readonly aggregate: CaseAggregate;
      readonly original_entry: CaseJournalEntry;
      readonly original_status: "rejected";
      readonly original_code: TransitionRejectionCode;
    }
  | {
      readonly status: "conflict";
      readonly state: CaseEngineState;
      readonly code: CaseEngineConflictCode;
      readonly message: string;
    };

export class CaseEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CaseEngineError";
    this.code = code;
  }
}

interface CommandContext {
  readonly tenantId: string;
  readonly expectedVersion: number;
  readonly actorIdentityId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly causationEventId?: string;
}

const CASE_SEED_KEYS = new Set(["tenant", "workflow_version", "case"]);
const CASE_RECORD_SEED_KEYS = new Set([
  "customer_ref",
  "due_at",
  "due_at_source_timezone",
  "id",
  "issue_fingerprint",
  "owner_identity_id",
  "parent_case_id",
  "related_case_ids",
  "scope_ids",
  "severity",
  "tenant_id",
  "workflow_version_id",
]);
const CANONICAL_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{2,127}$/;
const SOURCE_TIMEZONE_PATTERN =
  /^(?:UTC(?:[+-](?:0[0-9]|1[0-9]|2[0-3]):[0-5][0-9])?|[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+)$/;
const RFC3339_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?([Zz]|([+-])(\d{2}):(\d{2}))$/;
const COMMAND_KEYS = Object.freeze({
  "case.attach_work_event": new Set([
    "type",
    "tenant_id",
    "case_id",
    "expected_case_version",
    "actor_identity_id",
    "idempotency_key",
    "correlation_id",
    "causation_event_id",
    "work_event",
  ]),
  "case.create": new Set([
    "type",
    "tenant_id",
    "expected_case_version",
    "actor_identity_id",
    "idempotency_key",
    "correlation_id",
    "causation_event_id",
    "case_seed",
    "trigger_event",
  ]),
  "case.transition": new Set([
    "type",
    "tenant_id",
    "case_id",
    "expected_case_version",
    "actor_identity_id",
    "idempotency_key",
    "correlation_id",
    "causation_event_id",
    "to_state",
    "reason",
  ]),
});

const EMPTY_STATE = immutableJson<CaseEngineState>({
  cases: [],
  idempotency_records: [],
  source_event_records: [],
});

function isDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  if (!Object.isFrozen(value)) {
    return false;
  }
  if (seen.has(value)) {
    return true;
  }
  seen.add(value);

  const keys = Reflect.ownKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !("value" in descriptor) ||
      !isDeeplyFrozen(descriptor.value, seen)
    ) {
      return false;
    }
  }
  return true;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asUnknownArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? (value as readonly unknown[]) : undefined;
}

function requireRecord(
  record: UnknownRecord,
  key: string,
  path = "$",
): UnknownRecord {
  const value = record[key];
  if (!Object.hasOwn(record, key) || !isRecord(value)) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      `${path}/${key} must be an own object property`,
    );
  }
  return value;
}

function requireString(record: UnknownRecord, key: string, path = "$"): string {
  const value = record[key];
  if (
    !Object.hasOwn(record, key) ||
    typeof value !== "string" ||
    value.length === 0
  ) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      `${path}/${key} must be a nonempty own string property`,
    );
  }
  return value;
}

function optionalString(
  record: UnknownRecord,
  key: string,
  path = "$",
): string | undefined {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }
  return requireString(record, key, path);
}

function requireVersion(record: UnknownRecord): number {
  const value = record.expected_case_version;
  if (
    !Object.hasOwn(record, "expected_case_version") ||
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      "$/expected_case_version must be a nonnegative safe integer",
    );
  }
  return value;
}

function requireStringArray(
  record: UnknownRecord,
  key: string,
  path: string,
): readonly string[] {
  const value = record[key];
  if (
    !Object.hasOwn(record, key) ||
    !Array.isArray(value) ||
    value.length === 0
  ) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      `${path}/${key} must be a nonempty array`,
    );
  }

  const strings = value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      throw new CaseEngineError(
        "INVALID_COMMAND",
        `${path}/${key}/${String(index)} must be a nonempty string`,
      );
    }
    return item;
  });
  if (new Set(strings).size !== strings.length) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      `${path}/${key} may not contain duplicates`,
    );
  }
  return strings;
}

function parseContext(command: UnknownRecord): CommandContext {
  const causationEventId = optionalString(command, "causation_event_id");
  const tenantId = requireString(command, "tenant_id");
  const actorIdentityId = requireString(command, "actor_identity_id");
  const idempotencyKey = requireString(command, "idempotency_key");
  const correlationId = requireString(command, "correlation_id");
  for (const [field, value] of [
    ["tenant_id", tenantId],
    ["actor_identity_id", actorIdentityId],
    ...(causationEventId === undefined
      ? []
      : ([["causation_event_id", causationEventId]] as const)),
  ] as const) {
    if (!CANONICAL_ID_PATTERN.test(value)) {
      throw new CaseEngineError(
        "INVALID_COMMAND",
        `$/${field} must be a canonical Field Runtime id`,
      );
    }
  }
  if (idempotencyKey.length > 512 || correlationId.length > 512) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      "idempotency_key and correlation_id may not exceed 512 characters",
    );
  }
  return {
    tenantId,
    expectedVersion: requireVersion(command),
    actorIdentityId,
    idempotencyKey,
    correlationId,
    ...(causationEventId === undefined ? {} : { causationEventId }),
  };
}

function caseRecord(document: Readonly<UnknownRecord>): UnknownRecord {
  const value = document.case;
  if (!isRecord(value)) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "case projection is missing",
    );
  }
  return value;
}

function caseVersion(aggregate: CaseAggregate): number {
  const value = caseRecord(aggregate.document).version;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "case projection has an invalid version",
    );
  }
  return value;
}

function caseState(aggregate: CaseAggregate): CaseState {
  const value = caseRecord(aggregate.document).state;
  if (typeof value !== "string" || !isCaseState(value)) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "case projection has an invalid state",
    );
  }
  return value;
}

function findCase(
  state: CaseEngineState,
  tenantId: string,
  caseId: string,
): CaseAggregate | undefined {
  return state.cases.find(
    (aggregate) =>
      aggregate.tenant_id === tenantId && aggregate.case_id === caseId,
  );
}

function conflict(
  state: CaseEngineState,
  code: CaseEngineConflictCode,
  message: string,
): CaseCommandResult {
  return Object.freeze({ status: "conflict", state, code, message });
}

function commandContextFingerprint(
  command: UnknownRecord,
  semanticPayload: UnknownRecord,
): `sha256:${string}` {
  const causationEventId = optionalString(command, "causation_event_id");
  return sha256Json({
    type: requireString(command, "type"),
    tenant_id: requireString(command, "tenant_id"),
    expected_case_version: requireVersion(command),
    actor_identity_id: requireString(command, "actor_identity_id"),
    ...(causationEventId === undefined
      ? {}
      : { causation_event_id: causationEventId }),
    ...semanticPayload,
  });
}

function assertCommandKeys(
  command: UnknownRecord,
  type: keyof typeof COMMAND_KEYS,
): void {
  const allowed = COMMAND_KEYS[type];
  for (const key of Object.keys(command)) {
    if (!allowed.has(key)) {
      throw new CaseEngineError(
        "INVALID_COMMAND",
        `$/${key} is not permitted for ${type}`,
      );
    }
  }
}

function fingerprintCommand(command: UnknownRecord): `sha256:${string}` {
  const type = requireString(command, "type");
  parseContext(command);
  if (type === "case.create") {
    assertCommandKeys(command, type);
    return commandContextFingerprint(command, {
      case_seed: requireRecord(command, "case_seed"),
      trigger_event: requireRecord(command, "trigger_event"),
    });
  }
  if (type === "case.attach_work_event") {
    assertCommandKeys(command, type);
    return commandContextFingerprint(command, {
      case_id: requireString(command, "case_id"),
      work_event: requireRecord(command, "work_event"),
    });
  }
  if (type === "case.transition") {
    assertCommandKeys(command, type);
    return commandContextFingerprint(command, {
      case_id: requireString(command, "case_id"),
      to_state: requireString(command, "to_state"),
      reason: requireString(command, "reason"),
    });
  }
  throw new CaseEngineError(
    "INVALID_COMMAND",
    `unsupported command type: ${type}`,
  );
}

function sourceEventIdentity(workEvent: UnknownRecord): {
  readonly tenantId: string;
  readonly source: string;
  readonly sourceEventId: string;
} {
  return {
    tenantId: requireString(workEvent, "tenant_id", "$/work_event"),
    source: requireString(workEvent, "source", "$/work_event"),
    sourceEventId: requireString(workEvent, "source_event_id", "$/work_event"),
  };
}

function findSourceEvent(
  state: CaseEngineState,
  identity: ReturnType<typeof sourceEventIdentity>,
): CaseSourceEventRecord | undefined {
  return state.source_event_records.find(
    (record) =>
      record.tenant_id === identity.tenantId &&
      record.source === identity.source &&
      record.source_event_id === identity.sourceEventId,
  );
}

function assertSeedShape(
  seed: UnknownRecord,
  context: CommandContext,
): {
  readonly tenant: UnknownRecord;
  readonly workflow: UnknownRecord;
  readonly caseSeed: UnknownRecord;
  readonly caseId: string;
  readonly scopeIds: readonly string[];
} {
  for (const key of Object.keys(seed)) {
    if (!CASE_SEED_KEYS.has(key)) {
      throw new CaseEngineError(
        "INVALID_COMMAND",
        `$/case_seed/${key} is not permitted`,
      );
    }
  }

  const tenant = requireRecord(seed, "tenant", "$/case_seed");
  const workflow = requireRecord(seed, "workflow_version", "$/case_seed");
  const caseSeed = requireRecord(seed, "case", "$/case_seed");
  for (const key of Object.keys(caseSeed)) {
    if (!CASE_RECORD_SEED_KEYS.has(key)) {
      throw new CaseEngineError(
        "INVALID_COMMAND",
        `$/case_seed/case/${key} is not permitted; state, version, and timestamps are engine-owned`,
      );
    }
  }

  const tenantId = requireString(tenant, "id", "$/case_seed/tenant");
  const workflowVersionId = requireString(
    workflow,
    "id",
    "$/case_seed/workflow_version",
  );
  const caseId = requireString(caseSeed, "id", "$/case_seed/case");
  if (
    tenantId !== context.tenantId ||
    requireString(caseSeed, "tenant_id", "$/case_seed/case") !== tenantId
  ) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      "case seed tenant references must match the command tenant",
    );
  }
  if (
    requireString(caseSeed, "workflow_version_id", "$/case_seed/case") !==
    workflowVersionId
  ) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      "case seed workflow reference must match the root workflow version",
    );
  }

  requireString(caseSeed, "severity", "$/case_seed/case");
  const scopeIds = requireStringArray(
    caseSeed,
    "scope_ids",
    "$/case_seed/case",
  );
  return { tenant, workflow, caseSeed, caseId, scopeIds };
}

function assertWorkEvent(
  workEvent: UnknownRecord,
  tenantId: string,
  caseScopeIds: readonly string[],
): void {
  const identity = sourceEventIdentity(workEvent);
  if (identity.tenantId !== tenantId) {
    throw new CaseEngineError(
      "TENANT_MISMATCH",
      "work event tenant must match the command tenant",
    );
  }

  requireString(workEvent, "id", "$/work_event");
  requireString(workEvent, "event_type", "$/work_event");
  const occurredAt = requireString(workEvent, "occurred_at", "$/work_event");
  if (
    canonicalRfc3339Instant(occurredAt, "$/work_event/occurred_at") !==
    occurredAt
  ) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      "$/work_event/occurred_at must be a canonical UTC instant with millisecond precision",
    );
  }
  const sourceTimezone = requireString(
    workEvent,
    "source_timezone",
    "$/work_event",
  );
  if (!SOURCE_TIMEZONE_PATTERN.test(sourceTimezone)) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      "$/work_event/source_timezone must be UTC, a UTC fixed-offset label, or an IANA-style timezone identifier",
    );
  }
  const contentHash = requireString(workEvent, "content_hash", "$/work_event");
  if (!/^sha256:[0-9a-f]{64}$/.test(contentHash)) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      "work event content_hash must be a lowercase sha256 value",
    );
  }
  requireString(workEvent, "classification", "$/work_event");
  requireString(workEvent, "idempotency_key", "$/work_event");
  const eventScopes = requireStringArray(
    workEvent,
    "scope_ids",
    "$/work_event",
  );
  const allowedScopes = new Set(caseScopeIds);
  if (eventScopes.some((scope) => !allowedScopes.has(scope))) {
    throw new CaseEngineError(
      "SCOPE_EXPANSION",
      "work event scopes must be a subset of the case scopes",
    );
  }
}

function assertSourceTimezone(value: string, path: string): void {
  if (!SOURCE_TIMEZONE_PATTERN.test(value)) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      `${path} must be UTC, a UTC fixed-offset label, or an IANA-style timezone identifier`,
    );
  }
}

function canonicalRfc3339Instant(value: string, path: string): string {
  const match = RFC3339_TIMESTAMP_PATTERN.exec(value);
  if (match === null) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      `${path} must be an RFC 3339 instant with at most millisecond precision`,
    );
  }
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText = "",
    zoneText,
    offsetSign,
    offsetHourText = "00",
    offsetMinuteText = "00",
  ] = match;
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined ||
    hourText === undefined ||
    minuteText === undefined ||
    secondText === undefined ||
    zoneText === undefined
  ) {
    throw new CaseEngineError("INVALID_COMMAND", `${path} is incomplete`);
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText);
  const offsetMinute = Number(offsetMinuteText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const maximumDay = daysInMonth[month - 1];
  if (
    maximumDay === undefined ||
    day < 1 ||
    day > maximumDay ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      `${path} is not a valid RFC 3339 calendar instant`,
    );
  }

  const milliseconds = Number(fractionText.padEnd(3, "0"));
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, milliseconds);
  const offsetDirection =
    zoneText.toUpperCase() === "Z" ? 0 : offsetSign === "+" ? 1 : -1;
  const offsetMilliseconds =
    offsetDirection * (offsetHour * 60 + offsetMinute) * 60_000;
  const canonical = new Date(
    local.getTime() - offsetMilliseconds,
  ).toISOString();
  if (!/^\d{4}-/.test(canonical)) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      `${path} normalizes outside the supported four-digit year range`,
    );
  }
  return canonical;
}

function normalizeInboundWorkEvent(workEvent: UnknownRecord): UnknownRecord {
  const sourceTimezone = requireString(
    workEvent,
    "source_timezone",
    "$/work_event",
  );
  assertSourceTimezone(sourceTimezone, "$/work_event/source_timezone");
  const occurredAt = requireString(workEvent, "occurred_at", "$/work_event");
  return {
    ...workEvent,
    occurred_at: canonicalRfc3339Instant(
      occurredAt,
      "$/work_event/occurred_at",
    ),
  };
}

function normalizeRequiredSeedInstant(
  record: UnknownRecord,
  instantField: string,
  timezoneField: string,
  path: string,
): UnknownRecord {
  const instant = requireString(record, instantField, path);
  const sourceTimezone = requireString(record, timezoneField, path);
  assertSourceTimezone(sourceTimezone, `${path}/${timezoneField}`);
  return {
    ...record,
    [instantField]: canonicalRfc3339Instant(instant, `${path}/${instantField}`),
  };
}

function normalizeOptionalSeedInstant(
  record: UnknownRecord,
  instantField: string,
  timezoneField: string,
  path: string,
): UnknownRecord {
  const instant = record[instantField];
  const sourceTimezone = record[timezoneField];
  if (instant === undefined || instant === null) {
    if (sourceTimezone !== undefined) {
      throw new CaseEngineError(
        "INVALID_COMMAND",
        `${path}/${timezoneField} requires a non-null ${instantField}`,
      );
    }
    return record;
  }
  if (typeof instant !== "string") {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      `${path}/${instantField} must be a string`,
    );
  }
  const requiredTimezone = requireString(record, timezoneField, path);
  assertSourceTimezone(requiredTimezone, `${path}/${timezoneField}`);
  return {
    ...record,
    [instantField]: canonicalRfc3339Instant(instant, `${path}/${instantField}`),
  };
}

function normalizeCaseSeed(seed: UnknownRecord): UnknownRecord {
  let workflow = normalizeRequiredSeedInstant(
    requireRecord(seed, "workflow_version", "$/case_seed"),
    "effective_from",
    "effective_from_source_timezone",
    "$/case_seed/workflow_version",
  );
  workflow = normalizeOptionalSeedInstant(
    workflow,
    "effective_to",
    "effective_to_source_timezone",
    "$/case_seed/workflow_version",
  );
  const caseSeed = normalizeOptionalSeedInstant(
    requireRecord(seed, "case", "$/case_seed"),
    "due_at",
    "due_at_source_timezone",
    "$/case_seed/case",
  );
  return {
    ...seed,
    workflow_version: workflow,
    case: caseSeed,
  };
}

function normalizeWorkEventCommand(
  command: UnknownRecord,
  field: "trigger_event" | "work_event",
): UnknownRecord {
  return {
    ...command,
    [field]: normalizeInboundWorkEvent(requireRecord(command, field)),
  };
}

function normalizeCreateCommand(command: UnknownRecord): UnknownRecord {
  const withTriggerEvent = normalizeWorkEventCommand(command, "trigger_event");
  return {
    ...withTriggerEvent,
    case_seed: normalizeCaseSeed(requireRecord(command, "case_seed")),
  };
}

function assertCreationInputs(
  seedShape: ReturnType<typeof assertSeedShape>,
  triggerEvent: UnknownRecord,
): void {
  const preflightAt = "2000-01-01T00:00:00.000Z";
  const document = immutableJson<UnknownRecord>({
    tenant: seedShape.tenant,
    workflow_version: seedShape.workflow,
    case: {
      ...seedShape.caseSeed,
      state: "detected",
      created_at: preflightAt,
      updated_at: preflightAt,
      version: 1,
    },
    events: [triggerEvent],
  });
  assertNoInvariantViolations(document);
}

function assertAttachedWorkEventInput(
  document: Readonly<UnknownRecord>,
  workEvent: UnknownRecord,
): void {
  assertNoInvariantViolations(
    immutableJson<UnknownRecord>({ ...document, events: [workEvent] }),
  );
}

function assertProposedWorkEventCollection(
  document: Readonly<UnknownRecord>,
  workEvent: UnknownRecord,
): void {
  const events = asUnknownArray(document.events) ?? [];
  assertNoInvariantViolations(
    immutableJson<UnknownRecord>({
      ...document,
      events: [...events, workEvent],
    }),
  );
}

function assertNoInvariantViolations(document: UnknownRecord): void {
  assertValidCaseDocument(document);
  const violations = validateCrossRecordInvariants(document);
  if (violations.length > 0) {
    throw new CaseEngineError(
      "CASE_INVARIANT_VIOLATION",
      JSON.stringify(violations),
    );
  }
}

function consumeDependencies(
  state: CaseEngineState,
  aggregate: CaseAggregate | undefined,
  dependencies: CaseEngineDependencies,
): {
  readonly recordedAt: string;
  readonly journalEntryId: string;
  readonly auditEntryId: string;
} {
  const now = dependencies.now();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new CaseEngineError(
      "INVALID_DEPENDENCY_RESULT",
      "now() must return a valid Date",
    );
  }
  const recordedAt = now.toISOString();
  const previous = aggregate?.journal.at(-1);
  if (
    previous !== undefined &&
    Date.parse(recordedAt) < Date.parse(previous.recorded_at)
  ) {
    throw new CaseEngineError(
      "CLOCK_REGRESSION",
      "journal time may not move backwards within a case",
    );
  }

  const journalEntryId = dependencies.nextId("journal_entry");
  const auditEntryId = dependencies.nextId("audit_entry");
  for (const [kind, id] of [
    ["journal entry", journalEntryId],
    ["audit entry", auditEntryId],
  ] as const) {
    if (typeof id !== "string" || !CANONICAL_ID_PATTERN.test(id)) {
      throw new CaseEngineError(
        "INVALID_DEPENDENCY_RESULT",
        `${kind} id must be a canonical Field Runtime id`,
      );
    }
  }

  const journalIds = new Set(
    state.cases.flatMap((item) => item.journal.map((entry) => entry.id)),
  );
  const auditIds = new Set(
    state.cases.flatMap((item) => {
      const entries = item.document.audit_entries;
      return Array.isArray(entries)
        ? entries.flatMap((entry) =>
            isRecord(entry) && typeof entry.id === "string" ? [entry.id] : [],
          )
        : [];
    }),
  );
  const usedIds = new Set([...journalIds, ...auditIds]);
  if (
    journalEntryId === auditEntryId ||
    usedIds.has(journalEntryId) ||
    usedIds.has(auditEntryId)
  ) {
    throw new CaseEngineError(
      "DUPLICATE_GENERATED_ID",
      "generated journal and audit ids must be globally unique",
    );
  }

  return { recordedAt, journalEntryId, auditEntryId };
}

function assertCausation(
  aggregate: CaseAggregate | undefined,
  causationEventId: string | undefined,
): boolean {
  if (causationEventId === undefined) {
    return true;
  }
  return (
    aggregate?.journal.some((entry) => entry.id === causationEventId) ?? false
  );
}

function makeAuditEntry(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly actorIdentityId: string;
  readonly operation: JournalEventType;
  readonly beforeHash: `sha256:${string}` | null;
  readonly afterHash: `sha256:${string}`;
  readonly recordedAt: string;
  readonly correlationId: string;
  readonly journalEntryId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: `sha256:${string}`;
  readonly sequence: number;
  readonly caseVersion: number;
}): UnknownRecord {
  return {
    id: input.id,
    tenant_id: input.tenantId,
    case_id: input.caseId,
    actor_identity_id: input.actorIdentityId,
    operation: input.operation,
    target_ref: `case://${input.caseId}`,
    before_hash: input.beforeHash,
    after_hash: input.afterHash,
    occurred_at: input.recordedAt,
    trace_id: input.correlationId,
    metadata: {
      journal_entry_id: input.journalEntryId,
      idempotency_key: input.idempotencyKey,
      command_fingerprint: input.commandFingerprint,
      journal_sequence: input.sequence,
      case_version: input.caseVersion,
    },
  };
}

function makeJournalEntry(input: {
  readonly id: string;
  readonly aggregate: CaseAggregate | undefined;
  readonly tenantId: string;
  readonly caseId: string;
  readonly caseVersion: number;
  readonly eventType: JournalEventType;
  readonly recordedAt: string;
  readonly actorIdentityId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: `sha256:${string}`;
  readonly correlationId: string;
  readonly causationEventId?: string;
  readonly beforeHash: `sha256:${string}` | null;
  readonly afterHash: `sha256:${string}`;
  readonly payload: UnknownRecord;
}): CaseJournalEntry {
  const unsigned = {
    schema_version: "case-journal-entry.v0",
    id: input.id,
    tenant_id: input.tenantId,
    case_id: input.caseId,
    sequence: (input.aggregate?.journal.length ?? 0) + 1,
    case_version: input.caseVersion,
    event_type: input.eventType,
    recorded_at: input.recordedAt,
    actor_identity_id: input.actorIdentityId,
    idempotency_key: input.idempotencyKey,
    command_fingerprint: input.commandFingerprint,
    correlation_id: input.correlationId,
    ...(input.causationEventId === undefined
      ? {}
      : { causation_event_id: input.causationEventId }),
    previous_event_hash: input.aggregate?.journal.at(-1)?.event_hash ?? null,
    before_hash: input.beforeHash,
    after_hash: input.afterHash,
    payload: input.payload,
  } as const;
  const entry = immutableJson<CaseJournalEntry>({
    ...unsigned,
    event_hash: sha256Json(unsigned),
  });
  assertValidCaseJournalEntry(entry);
  return entry;
}

function addAuditEntry(
  document: Readonly<UnknownRecord>,
  auditEntry: UnknownRecord,
): UnknownRecord {
  const current = document.audit_entries;
  const auditEntries = asUnknownArray(current) ?? [];
  return { ...document, audit_entries: [...auditEntries, auditEntry] };
}

function updateCaseRecord(
  document: Readonly<UnknownRecord>,
  updates: UnknownRecord,
): UnknownRecord {
  return {
    ...document,
    case: { ...caseRecord(document), ...updates },
  };
}

function replaceAggregate(
  state: CaseEngineState,
  aggregate: CaseAggregate,
  idempotencyRecord: CaseIdempotencyRecord,
  sourceEventRecord?: CaseSourceEventRecord,
): CaseEngineState {
  const existingIndex = state.cases.findIndex(
    (item) =>
      item.tenant_id === aggregate.tenant_id &&
      item.case_id === aggregate.case_id,
  );
  const cases = [...state.cases];
  if (existingIndex === -1) {
    cases.push(aggregate);
  } else {
    cases[existingIndex] = aggregate;
  }

  return immutableJson<CaseEngineState>({
    cases,
    idempotency_records: [...state.idempotency_records, idempotencyRecord],
    source_event_records:
      sourceEventRecord === undefined
        ? state.source_event_records
        : [...state.source_event_records, sourceEventRecord],
  });
}

function makeCaseEngineAppend(input: {
  readonly state: CaseEngineState;
  readonly aggregate: CaseAggregate;
  readonly entry: CaseJournalEntry;
  readonly expectedCaseVersion: number;
  readonly auditEntryId: string;
  readonly includesSourceEvent: boolean;
}): CaseEngineAppend {
  const idempotencyRecord = input.state.idempotency_records.find(
    (record) => record.journal_entry_id === input.entry.id,
  );
  const sourceEventRecord = input.includesSourceEvent
    ? input.state.source_event_records.at(-1)
    : undefined;
  if (
    idempotencyRecord === undefined ||
    (input.includesSourceEvent && sourceEventRecord === undefined)
  ) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "engine append is missing its persistence indexes",
    );
  }
  return immutableJson<CaseEngineAppend>({
    expected_case_version: input.expectedCaseVersion,
    tenant_id: input.aggregate.tenant_id,
    case_id: input.aggregate.case_id,
    document: input.aggregate.document,
    journal_entry: input.entry,
    idempotency_record: idempotencyRecord,
    ...(sourceEventRecord === undefined
      ? {}
      : { source_event_record: sourceEventRecord }),
    audit_entry_id: input.auditEntryId,
  });
}

function findOriginalResult(
  state: CaseEngineState,
  context: CommandContext,
  commandFingerprint: `sha256:${string}`,
): CaseCommandResult | undefined {
  const record = state.idempotency_records.find(
    (item) =>
      item.tenant_id === context.tenantId &&
      item.idempotency_key === context.idempotencyKey,
  );
  if (record === undefined) {
    return undefined;
  }
  if (record.command_fingerprint !== commandFingerprint) {
    return conflict(
      state,
      "IDEMPOTENCY_CONFLICT",
      "the idempotency key was already used for a different command",
    );
  }

  const aggregate = findCase(state, record.tenant_id, record.case_id);
  const originalEntry = aggregate?.journal.find(
    (entry) => entry.id === record.journal_entry_id,
  );
  if (aggregate === undefined || originalEntry === undefined) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "idempotency record points to missing history",
    );
  }
  if (record.result_status === "rejected") {
    const originalCode = originalEntry.payload.reason_code;
    if (
      originalCode !== "closure_proof_required" &&
      originalCode !== "invalid_transition"
    ) {
      throw new CaseEngineError(
        "JOURNAL_INTEGRITY",
        "rejected idempotency record points to an invalid rejection event",
      );
    }
    return Object.freeze({
      status: "duplicate",
      state,
      aggregate,
      original_entry: originalEntry,
      original_status: "rejected",
      original_code: originalCode,
    });
  }
  return Object.freeze({
    status: "duplicate",
    state,
    aggregate,
    original_entry: originalEntry,
    original_status: "applied",
  });
}

function createCase(
  state: CaseEngineState,
  command: UnknownRecord,
  dependencies: CaseEngineDependencies,
): CaseCommandResult {
  const context = parseContext(command);
  if (context.expectedVersion !== 0) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      "case.create requires expected_case_version 0",
    );
  }
  const seed = requireRecord(command, "case_seed");
  const triggerEvent = requireRecord(command, "trigger_event");
  const seedShape = assertSeedShape(seed, context);
  assertWorkEvent(triggerEvent, context.tenantId, seedShape.scopeIds);
  assertCreationInputs(seedShape, triggerEvent);
  const commandFingerprint = fingerprintCommand(command);
  const priorResult = findOriginalResult(state, context, commandFingerprint);
  if (priorResult !== undefined) {
    return priorResult;
  }
  if (!assertCausation(undefined, context.causationEventId)) {
    return conflict(
      state,
      "CAUSATION_NOT_FOUND",
      "case creation cannot reference an unknown journal event",
    );
  }

  const identity = sourceEventIdentity(triggerEvent);
  const workEventFingerprint = sha256Json(triggerEvent);
  const createBindingFingerprint = sha256Json({
    case_seed: seed,
    trigger_event: triggerEvent,
  });
  const existingSource = findSourceEvent(state, identity);
  if (existingSource !== undefined) {
    if (
      existingSource.work_event_fingerprint !== workEventFingerprint ||
      existingSource.case_id !== seedShape.caseId ||
      existingSource.create_binding_fingerprint !== createBindingFingerprint
    ) {
      return conflict(
        state,
        "SOURCE_EVENT_CONFLICT",
        "the source event identity is already bound to different content or a different case",
      );
    }
    return conflict(
      state,
      "SOURCE_EVENT_ALREADY_PROCESSED",
      "the source event was already processed under its original idempotency key",
    );
  }

  if (findCase(state, context.tenantId, seedShape.caseId) !== undefined) {
    return conflict(
      state,
      "CASE_ALREADY_EXISTS",
      "a case with this tenant and case id already exists",
    );
  }
  const generated = consumeDependencies(state, undefined, dependencies);
  const nextCase = {
    ...seedShape.caseSeed,
    state: "detected",
    created_at: generated.recordedAt,
    updated_at: generated.recordedAt,
    version: 1,
  };
  const afterHash = sha256Json(nextCase);
  const auditEntry = makeAuditEntry({
    id: generated.auditEntryId,
    tenantId: context.tenantId,
    caseId: seedShape.caseId,
    actorIdentityId: context.actorIdentityId,
    operation: "case.created",
    beforeHash: null,
    afterHash,
    recordedAt: generated.recordedAt,
    correlationId: context.correlationId,
    journalEntryId: generated.journalEntryId,
    idempotencyKey: context.idempotencyKey,
    commandFingerprint,
    sequence: 1,
    caseVersion: 1,
  });
  const document = immutableJson<UnknownRecord>({
    tenant: seedShape.tenant,
    workflow_version: seedShape.workflow,
    case: nextCase,
    events: [triggerEvent],
    audit_entries: [auditEntry],
  });
  assertNoInvariantViolations(document);
  const entry = makeJournalEntry({
    id: generated.journalEntryId,
    aggregate: undefined,
    tenantId: context.tenantId,
    caseId: seedShape.caseId,
    caseVersion: 1,
    eventType: "case.created",
    recordedAt: generated.recordedAt,
    actorIdentityId: context.actorIdentityId,
    idempotencyKey: context.idempotencyKey,
    commandFingerprint,
    correlationId: context.correlationId,
    ...(context.causationEventId === undefined
      ? {}
      : { causationEventId: context.causationEventId }),
    beforeHash: null,
    afterHash,
    payload: { document },
  });
  const aggregate = immutableJson<CaseAggregate>({
    tenant_id: context.tenantId,
    case_id: seedShape.caseId,
    document,
    journal: [entry],
  });
  const nextState = replaceAggregate(
    state,
    aggregate,
    {
      tenant_id: context.tenantId,
      idempotency_key: context.idempotencyKey,
      command_fingerprint: commandFingerprint,
      case_id: seedShape.caseId,
      journal_entry_id: entry.id,
      result_status: "applied",
    },
    {
      tenant_id: identity.tenantId,
      source: identity.source,
      source_event_id: identity.sourceEventId,
      work_event_fingerprint: workEventFingerprint,
      case_id: seedShape.caseId,
      create_binding_fingerprint: createBindingFingerprint,
    },
  );
  const storedAggregate = findCase(
    nextState,
    context.tenantId,
    seedShape.caseId,
  );
  if (storedAggregate === undefined) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "created case was not stored",
    );
  }
  return Object.freeze({
    status: "applied",
    state: nextState,
    aggregate: storedAggregate,
    entry,
    append: makeCaseEngineAppend({
      state: nextState,
      aggregate: storedAggregate,
      entry,
      expectedCaseVersion: 0,
      auditEntryId: generated.auditEntryId,
      includesSourceEvent: true,
    }),
  });
}

function attachWorkEvent(
  state: CaseEngineState,
  command: UnknownRecord,
  dependencies: CaseEngineDependencies,
): CaseCommandResult {
  const context = parseContext(command);
  const caseId = requireString(command, "case_id");
  const workEvent = requireRecord(command, "work_event");
  const commandFingerprint = fingerprintCommand(command);
  const priorResult = findOriginalResult(state, context, commandFingerprint);
  if (priorResult !== undefined) {
    return priorResult;
  }

  const aggregate = findCase(state, context.tenantId, caseId);
  if (aggregate === undefined) {
    return conflict(state, "CASE_NOT_FOUND", "the target case does not exist");
  }
  const scopeIds = requireStringArray(
    caseRecord(aggregate.document),
    "scope_ids",
    "$/case",
  );
  try {
    assertWorkEvent(workEvent, context.tenantId, scopeIds);
  } catch (error) {
    if (
      error instanceof CaseEngineError &&
      (error.code === "SCOPE_EXPANSION" || error.code === "TENANT_MISMATCH")
    ) {
      return conflict(state, error.code, error.message);
    }
    throw error;
  }
  assertAttachedWorkEventInput(aggregate.document, workEvent);
  if (!assertCausation(aggregate, context.causationEventId)) {
    return conflict(
      state,
      "CAUSATION_NOT_FOUND",
      "causation_event_id must reference this case journal",
    );
  }

  const identity = sourceEventIdentity(workEvent);
  const workEventFingerprint = sha256Json(workEvent);
  const existingSource = findSourceEvent(state, identity);
  if (existingSource !== undefined) {
    if (
      existingSource.work_event_fingerprint !== workEventFingerprint ||
      existingSource.case_id !== caseId
    ) {
      return conflict(
        state,
        "SOURCE_EVENT_CONFLICT",
        "the source event identity is already bound to different content or a different case",
      );
    }
    return conflict(
      state,
      "SOURCE_EVENT_ALREADY_PROCESSED",
      "the source event was already processed under its original idempotency key",
    );
  }

  if (context.expectedVersion !== caseVersion(aggregate)) {
    return conflict(
      state,
      "VERSION_CONFLICT",
      "expected_case_version does not match the current case version",
    );
  }
  assertProposedWorkEventCollection(aggregate.document, workEvent);
  const generated = consumeDependencies(state, aggregate, dependencies);
  const currentCase = caseRecord(aggregate.document);
  const nextVersion = context.expectedVersion + 1;
  const nextCase = {
    ...currentCase,
    updated_at: generated.recordedAt,
    version: nextVersion,
  };
  const beforeHash = sha256Json(currentCase);
  const afterHash = sha256Json(nextCase);
  const auditEntry = makeAuditEntry({
    id: generated.auditEntryId,
    tenantId: context.tenantId,
    caseId,
    actorIdentityId: context.actorIdentityId,
    operation: "case.work_event_attached",
    beforeHash,
    afterHash,
    recordedAt: generated.recordedAt,
    correlationId: context.correlationId,
    journalEntryId: generated.journalEntryId,
    idempotencyKey: context.idempotencyKey,
    commandFingerprint,
    sequence: aggregate.journal.length + 1,
    caseVersion: nextVersion,
  });
  const events = asUnknownArray(aggregate.document.events) ?? [];
  let document = updateCaseRecord(aggregate.document, nextCase);
  document = { ...document, events: [...events, workEvent] };
  document = addAuditEntry(document, auditEntry);
  const immutableDocument = immutableJson<UnknownRecord>(document);
  assertNoInvariantViolations(immutableDocument);
  const entry = makeJournalEntry({
    id: generated.journalEntryId,
    aggregate,
    tenantId: context.tenantId,
    caseId,
    caseVersion: nextVersion,
    eventType: "case.work_event_attached",
    recordedAt: generated.recordedAt,
    actorIdentityId: context.actorIdentityId,
    idempotencyKey: context.idempotencyKey,
    commandFingerprint,
    correlationId: context.correlationId,
    ...(context.causationEventId === undefined
      ? {}
      : { causationEventId: context.causationEventId }),
    beforeHash,
    afterHash,
    payload: { work_event: workEvent, audit_entry: auditEntry },
  });
  const nextAggregate = immutableJson<CaseAggregate>({
    tenant_id: context.tenantId,
    case_id: caseId,
    document: immutableDocument,
    journal: [...aggregate.journal, entry],
  });
  const nextState = replaceAggregate(
    state,
    nextAggregate,
    {
      tenant_id: context.tenantId,
      idempotency_key: context.idempotencyKey,
      command_fingerprint: commandFingerprint,
      case_id: caseId,
      journal_entry_id: entry.id,
      result_status: "applied",
    },
    {
      tenant_id: identity.tenantId,
      source: identity.source,
      source_event_id: identity.sourceEventId,
      work_event_fingerprint: workEventFingerprint,
      case_id: caseId,
    },
  );
  const storedAggregate = findCase(nextState, context.tenantId, caseId);
  if (storedAggregate === undefined) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "updated case was not stored",
    );
  }
  return Object.freeze({
    status: "applied",
    state: nextState,
    aggregate: storedAggregate,
    entry,
    append: makeCaseEngineAppend({
      state: nextState,
      aggregate: storedAggregate,
      entry,
      expectedCaseVersion: context.expectedVersion,
      auditEntryId: generated.auditEntryId,
      includesSourceEvent: true,
    }),
  });
}

function transitionCase(
  state: CaseEngineState,
  command: UnknownRecord,
  dependencies: CaseEngineDependencies,
): CaseCommandResult {
  const context = parseContext(command);
  const caseId = requireString(command, "case_id");
  const toState = requireString(command, "to_state");
  const reason = requireString(command, "reason");
  if (reason.length > 2000) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      "transition reason may not exceed 2000 characters",
    );
  }
  if (toState.length > 128) {
    throw new CaseEngineError(
      "INVALID_COMMAND",
      "transition target state may not exceed 128 characters",
    );
  }
  const commandFingerprint = fingerprintCommand(command);
  const priorResult = findOriginalResult(state, context, commandFingerprint);
  if (priorResult !== undefined) {
    return priorResult;
  }

  const aggregate = findCase(state, context.tenantId, caseId);
  if (aggregate === undefined) {
    return conflict(state, "CASE_NOT_FOUND", "the target case does not exist");
  }
  if (context.expectedVersion !== caseVersion(aggregate)) {
    return conflict(
      state,
      "VERSION_CONFLICT",
      "expected_case_version does not match the current case version",
    );
  }
  if (!assertCausation(aggregate, context.causationEventId)) {
    return conflict(
      state,
      "CAUSATION_NOT_FOUND",
      "causation_event_id must reference this case journal",
    );
  }

  const fromState = caseState(aggregate);
  let rejectionCode: TransitionRejectionCode | undefined;
  if (fromState === "verifying" && toState === "resolved") {
    rejectionCode = "closure_proof_required";
  } else if (!canTransition(fromState, toState)) {
    rejectionCode = "invalid_transition";
  }
  const eventType: JournalEventType =
    rejectionCode === undefined
      ? "case.state_transitioned"
      : "case.transition_rejected";
  const generated = consumeDependencies(state, aggregate, dependencies);
  const nextVersion = context.expectedVersion + 1;
  const currentCase = caseRecord(aggregate.document);
  const nextCase = {
    ...currentCase,
    ...(rejectionCode === undefined ? { state: toState } : {}),
    updated_at: generated.recordedAt,
    version: nextVersion,
  };
  const beforeHash = sha256Json(currentCase);
  const afterHash = sha256Json(nextCase);
  const auditEntry = makeAuditEntry({
    id: generated.auditEntryId,
    tenantId: context.tenantId,
    caseId,
    actorIdentityId: context.actorIdentityId,
    operation: eventType,
    beforeHash,
    afterHash,
    recordedAt: generated.recordedAt,
    correlationId: context.correlationId,
    journalEntryId: generated.journalEntryId,
    idempotencyKey: context.idempotencyKey,
    commandFingerprint,
    sequence: aggregate.journal.length + 1,
    caseVersion: nextVersion,
  });
  let document = updateCaseRecord(aggregate.document, nextCase);
  document = addAuditEntry(document, auditEntry);
  const immutableDocument = immutableJson<UnknownRecord>(document);
  assertNoInvariantViolations(immutableDocument);
  const payload =
    rejectionCode === undefined
      ? {
          from_state: fromState,
          to_state: toState,
          reason,
          audit_entry: auditEntry,
        }
      : {
          from_state: fromState,
          to_state: toState,
          reason_code: rejectionCode,
          reason,
          audit_entry: auditEntry,
        };
  const entry = makeJournalEntry({
    id: generated.journalEntryId,
    aggregate,
    tenantId: context.tenantId,
    caseId,
    caseVersion: nextVersion,
    eventType,
    recordedAt: generated.recordedAt,
    actorIdentityId: context.actorIdentityId,
    idempotencyKey: context.idempotencyKey,
    commandFingerprint,
    correlationId: context.correlationId,
    ...(context.causationEventId === undefined
      ? {}
      : { causationEventId: context.causationEventId }),
    beforeHash,
    afterHash,
    payload,
  });
  const nextAggregate = immutableJson<CaseAggregate>({
    tenant_id: context.tenantId,
    case_id: caseId,
    document: immutableDocument,
    journal: [...aggregate.journal, entry],
  });
  const nextState = replaceAggregate(state, nextAggregate, {
    tenant_id: context.tenantId,
    idempotency_key: context.idempotencyKey,
    command_fingerprint: commandFingerprint,
    case_id: caseId,
    journal_entry_id: entry.id,
    result_status: rejectionCode === undefined ? "applied" : "rejected",
  });
  const storedAggregate = findCase(nextState, context.tenantId, caseId);
  if (storedAggregate === undefined) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "updated case was not stored",
    );
  }
  if (rejectionCode !== undefined) {
    return Object.freeze({
      status: "rejected",
      state: nextState,
      aggregate: storedAggregate,
      entry,
      append: makeCaseEngineAppend({
        state: nextState,
        aggregate: storedAggregate,
        entry,
        expectedCaseVersion: context.expectedVersion,
        auditEntryId: generated.auditEntryId,
        includesSourceEvent: false,
      }),
      code: rejectionCode,
    });
  }
  return Object.freeze({
    status: "applied",
    state: nextState,
    aggregate: storedAggregate,
    entry,
    append: makeCaseEngineAppend({
      state: nextState,
      aggregate: storedAggregate,
      entry,
      expectedCaseVersion: context.expectedVersion,
      auditEntryId: generated.auditEntryId,
      includesSourceEvent: false,
    }),
  });
}

export function emptyCaseEngine(): CaseEngineState {
  return EMPTY_STATE;
}

export function assertCaseEngineStateIntegrity(
  state: CaseEngineState,
): CaseEngineState {
  let normalized: JsonValue;
  try {
    normalized = canonicalizeJson(state);
  } catch (error) {
    throw new CaseEngineError(
      "STATE_INTEGRITY",
      `engine state must be canonical JSON: ${error instanceof Error ? error.message : "invalid value"}`,
    );
  }
  if (
    !isRecord(normalized) ||
    !Array.isArray(normalized.cases) ||
    !Array.isArray(normalized.idempotency_records) ||
    !Array.isArray(normalized.source_event_records) ||
    Object.keys(normalized).length !== 3
  ) {
    throw new CaseEngineError(
      "STATE_INTEGRITY",
      "engine state has an invalid envelope",
    );
  }
  const candidate = normalized as unknown as CaseEngineState;

  for (const aggregate of candidate.cases) {
    if (
      !isRecord(aggregate) ||
      Object.keys(aggregate).length !== 4 ||
      !Object.hasOwn(aggregate, "tenant_id") ||
      !Object.hasOwn(aggregate, "case_id") ||
      !Object.hasOwn(aggregate, "document") ||
      !Array.isArray(aggregate.journal) ||
      typeof aggregate.tenant_id !== "string" ||
      typeof aggregate.case_id !== "string"
    ) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        "engine state contains an invalid case aggregate",
      );
    }
  }
  for (const record of candidate.idempotency_records) {
    if (
      !isRecord(record) ||
      Object.keys(record).length !== 6 ||
      typeof record.tenant_id !== "string" ||
      typeof record.idempotency_key !== "string" ||
      typeof record.command_fingerprint !== "string" ||
      typeof record.case_id !== "string" ||
      typeof record.journal_entry_id !== "string" ||
      !["applied", "rejected"].includes(record.result_status)
    ) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        "engine state contains an invalid idempotency record",
      );
    }
  }
  for (const record of candidate.source_event_records) {
    const allowedKeys = new Set([
      "tenant_id",
      "source",
      "source_event_id",
      "work_event_fingerprint",
      "case_id",
      "create_binding_fingerprint",
    ]);
    if (
      !isRecord(record) ||
      ![5, 6].includes(Object.keys(record).length) ||
      Object.keys(record).some((key) => !allowedKeys.has(key)) ||
      typeof record.tenant_id !== "string" ||
      typeof record.source !== "string" ||
      typeof record.source_event_id !== "string" ||
      typeof record.work_event_fingerprint !== "string" ||
      typeof record.case_id !== "string" ||
      (record.create_binding_fingerprint !== undefined &&
        typeof record.create_binding_fingerprint !== "string")
    ) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        "engine state contains an invalid source-event record",
      );
    }
  }

  const caseKeys = new Set<string>();
  const expectedIdempotencyKeys = new Set<string>();
  const expectedSourceKeys = new Set<string>();
  const globalJournalIds = new Set<string>();
  const globalAuditIds = new Set<string>();
  for (const aggregate of candidate.cases) {
    const key = JSON.stringify([aggregate.tenant_id, aggregate.case_id]);
    if (caseKeys.has(key)) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        "engine state contains a duplicate tenant/case identity",
      );
    }
    caseKeys.add(key);

    const replayed = replayCaseJournal(aggregate.journal);
    if (canonicalJson(replayed) !== canonicalJson(aggregate)) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        `case projection differs from journal replay for ${aggregate.case_id}`,
      );
    }

    for (const entry of aggregate.journal) {
      if (globalJournalIds.has(entry.id)) {
        throw new CaseEngineError(
          "STATE_INTEGRITY",
          "engine state contains a duplicate global journal id",
        );
      }
      globalJournalIds.add(entry.id);

      const idempotencyKey = JSON.stringify([
        entry.tenant_id,
        entry.idempotency_key,
      ]);
      if (expectedIdempotencyKeys.has(idempotencyKey)) {
        throw new CaseEngineError(
          "STATE_INTEGRITY",
          "journal history reuses a tenant-scoped idempotency key",
        );
      }
      expectedIdempotencyKeys.add(idempotencyKey);
      const idempotencyRecord = candidate.idempotency_records.find(
        (record) =>
          record.tenant_id === entry.tenant_id &&
          record.idempotency_key === entry.idempotency_key,
      );
      if (
        idempotencyRecord === undefined ||
        idempotencyRecord.command_fingerprint !== entry.command_fingerprint ||
        idempotencyRecord.case_id !== entry.case_id ||
        idempotencyRecord.journal_entry_id !== entry.id ||
        idempotencyRecord.result_status !==
          (entry.event_type === "case.transition_rejected"
            ? "rejected"
            : "applied")
      ) {
        throw new CaseEngineError(
          "STATE_INTEGRITY",
          "journal history is missing its exact idempotency record",
        );
      }

      let workEvent: UnknownRecord | undefined;
      let createdDocument: UnknownRecord | undefined;
      if (entry.event_type === "case.created") {
        if (isRecord(entry.payload.document)) {
          createdDocument = entry.payload.document;
          const events = createdDocument.events;
          if (Array.isArray(events) && isRecord(events[0])) {
            workEvent = events[0];
          }
        }
      } else if (
        entry.event_type === "case.work_event_attached" &&
        isRecord(entry.payload.work_event)
      ) {
        workEvent = entry.payload.work_event;
      }
      if (workEvent !== undefined) {
        const identity = sourceEventIdentity(workEvent);
        const sourceKey = JSON.stringify([
          identity.tenantId,
          identity.source,
          identity.sourceEventId,
        ]);
        if (expectedSourceKeys.has(sourceKey)) {
          throw new CaseEngineError(
            "STATE_INTEGRITY",
            "journal history reuses a global source-event identity",
          );
        }
        expectedSourceKeys.add(sourceKey);
        const sourceRecord = candidate.source_event_records.find(
          (record) =>
            record.tenant_id === identity.tenantId &&
            record.source === identity.source &&
            record.source_event_id === identity.sourceEventId,
        );
        if (
          sourceRecord === undefined ||
          sourceRecord.case_id !== entry.case_id ||
          sourceRecord.work_event_fingerprint !== sha256Json(workEvent)
        ) {
          throw new CaseEngineError(
            "STATE_INTEGRITY",
            "journal history is missing its exact source-event record",
          );
        }

        if (createdDocument === undefined) {
          if (sourceRecord.create_binding_fingerprint !== undefined) {
            throw new CaseEngineError(
              "STATE_INTEGRITY",
              "an attached source event has an invalid creation binding",
            );
          }
        } else {
          const createdCase = caseRecord(createdDocument);
          const seedCase = Object.fromEntries(
            Object.entries(createdCase).filter(([field]) =>
              CASE_RECORD_SEED_KEYS.has(field),
            ),
          );
          const expectedBinding = sha256Json({
            case_seed: {
              tenant: createdDocument.tenant,
              workflow_version: createdDocument.workflow_version,
              case: seedCase,
            },
            trigger_event: workEvent,
          });
          if (sourceRecord.create_binding_fingerprint !== expectedBinding) {
            throw new CaseEngineError(
              "STATE_INTEGRITY",
              "case creation binding differs from journal history",
            );
          }
        }
      }
    }

    const auditEntries = aggregate.document.audit_entries;
    if (Array.isArray(auditEntries)) {
      for (const auditEntry of auditEntries) {
        if (
          !isRecord(auditEntry) ||
          typeof auditEntry.id !== "string" ||
          globalAuditIds.has(auditEntry.id)
        ) {
          throw new CaseEngineError(
            "STATE_INTEGRITY",
            "engine state contains a missing or duplicate global audit id",
          );
        }
        globalAuditIds.add(auditEntry.id);
      }
    }
  }
  for (const journalId of globalJournalIds) {
    if (globalAuditIds.has(journalId)) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        "journal and audit ids must be globally disjoint",
      );
    }
  }

  const idempotencyKeys = new Set<string>();
  for (const record of candidate.idempotency_records) {
    const key = JSON.stringify([record.tenant_id, record.idempotency_key]);
    if (idempotencyKeys.has(key)) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        "engine state contains a duplicate idempotency identity",
      );
    }
    idempotencyKeys.add(key);
    const aggregate = findCase(candidate, record.tenant_id, record.case_id);
    const entry = aggregate?.journal.find(
      (item) => item.id === record.journal_entry_id,
    );
    if (entry === undefined) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        "idempotency index differs from journal history",
      );
    }
    if (
      entry.idempotency_key !== record.idempotency_key ||
      entry.command_fingerprint !== record.command_fingerprint ||
      (record.result_status === "rejected") !==
        (entry.event_type === "case.transition_rejected")
    ) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        "idempotency index differs from journal history",
      );
    }
  }

  const sourceKeys = new Set<string>();
  for (const record of candidate.source_event_records) {
    const key = JSON.stringify([
      record.tenant_id,
      record.source,
      record.source_event_id,
    ]);
    if (sourceKeys.has(key)) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        "engine state contains a duplicate source-event identity",
      );
    }
    sourceKeys.add(key);
    const aggregate = findCase(candidate, record.tenant_id, record.case_id);
    const events = asUnknownArray(aggregate?.document.events);
    const event =
      events === undefined
        ? undefined
        : events.find(
            (item) =>
              isRecord(item) &&
              item.tenant_id === record.tenant_id &&
              item.source === record.source &&
              item.source_event_id === record.source_event_id,
          );
    if (
      !isRecord(event) ||
      sha256Json(event) !== record.work_event_fingerprint
    ) {
      throw new CaseEngineError(
        "STATE_INTEGRITY",
        "source-event index differs from case projection",
      );
    }
  }
  if (sourceKeys.size !== expectedSourceKeys.size) {
    throw new CaseEngineError(
      "STATE_INTEGRITY",
      "source-event index cardinality differs from journal history",
    );
  }

  return isDeeplyFrozen(state)
    ? state
    : immutableJson<CaseEngineState>(candidate);
}

export function executeCaseCommand(
  state: CaseEngineState,
  untrustedCommand: unknown,
  dependencies: CaseEngineDependencies,
): CaseCommandResult {
  const trustedState = assertCaseEngineStateIntegrity(state);
  let normalized: JsonValue;
  try {
    normalized = canonicalizeJson(untrustedCommand);
  } catch (error) {
    if (error instanceof CanonicalJsonError) {
      throw new CaseEngineError(
        "INVALID_COMMAND",
        "command is not canonical JSON",
      );
    }
    throw error;
  }
  if (!isRecord(normalized)) {
    throw new CaseEngineError("INVALID_COMMAND", "command must be an object");
  }
  const command = normalized;
  const type = requireString(command, "type");
  switch (type) {
    case "case.attach_work_event": {
      assertCommandKeys(command, type);
      return attachWorkEvent(
        trustedState,
        normalizeWorkEventCommand(command, "work_event"),
        dependencies,
      );
    }
    case "case.create": {
      assertCommandKeys(command, type);
      return createCase(
        trustedState,
        normalizeCreateCommand(command),
        dependencies,
      );
    }
    case "case.transition": {
      assertCommandKeys(command, type);
      return transitionCase(trustedState, command, dependencies);
    }
    default:
      throw new CaseEngineError(
        "INVALID_COMMAND",
        `unsupported command type: ${type}`,
      );
  }
}

export function getCase(
  state: CaseEngineState,
  tenantId: string,
  caseId: string,
): CaseAggregate | undefined {
  return findCase(state, tenantId, caseId);
}

export function getCaseJournal(
  state: CaseEngineState,
  tenantId: string,
  caseId: string,
): readonly CaseJournalEntry[] {
  return findCase(state, tenantId, caseId)?.journal ?? Object.freeze([]);
}

function assertAuditMatchesEntry(
  auditEntry: UnknownRecord,
  entry: CaseJournalEntry,
): void {
  const expected = {
    tenant_id: entry.tenant_id,
    case_id: entry.case_id,
    actor_identity_id: entry.actor_identity_id,
    operation: entry.event_type,
    target_ref: `case://${entry.case_id}`,
    before_hash: entry.before_hash,
    after_hash: entry.after_hash,
    occurred_at: entry.recorded_at,
    trace_id: entry.correlation_id,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (auditEntry[key] !== value) {
      throw new CaseEngineError(
        "JOURNAL_INTEGRITY",
        `audit entry ${key} does not match its journal envelope`,
      );
    }
  }

  const metadata = auditEntry.metadata;
  if (!isRecord(metadata)) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "audit entry metadata is missing",
    );
  }
  const expectedMetadata = {
    journal_entry_id: entry.id,
    idempotency_key: entry.idempotency_key,
    command_fingerprint: entry.command_fingerprint,
    journal_sequence: entry.sequence,
    case_version: entry.case_version,
  };
  if (
    Object.keys(metadata).length !== Object.keys(expectedMetadata).length ||
    Object.keys(metadata).some((key) => !Object.hasOwn(expectedMetadata, key))
  ) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "audit entry metadata has fields the engine did not emit",
    );
  }
  for (const [key, value] of Object.entries(expectedMetadata)) {
    if (metadata[key] !== value) {
      throw new CaseEngineError(
        "JOURNAL_INTEGRITY",
        `audit entry metadata ${key} does not match its journal envelope`,
      );
    }
  }
}

function verifyEntryHash(entry: CaseJournalEntry): void {
  const { event_hash: eventHash, ...unsigned } = entry;
  if (sha256Json(unsigned) !== eventHash) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      `journal event hash mismatch at sequence ${String(entry.sequence)}`,
    );
  }
}

function expectedJournalCommandFingerprint(
  entry: CaseJournalEntry,
  type: "case.attach_work_event" | "case.create" | "case.transition",
  semanticPayload: UnknownRecord,
): `sha256:${string}` {
  return sha256Json({
    type,
    tenant_id: entry.tenant_id,
    expected_case_version: entry.case_version - 1,
    actor_identity_id: entry.actor_identity_id,
    ...(entry.causation_event_id === undefined
      ? {}
      : { causation_event_id: entry.causation_event_id }),
    ...semanticPayload,
  });
}

export function replayCaseJournal(untrustedEntries: unknown): CaseAggregate {
  const normalized = canonicalizeJson(untrustedEntries);
  const entries = asUnknownArray(normalized);
  if (entries === undefined || entries.length === 0) {
    throw new CaseEngineError(
      "JOURNAL_INTEGRITY",
      "journal must be a nonempty array",
    );
  }

  let aggregate: CaseAggregate | undefined;
  let previousHash: `sha256:${string}` | null = null;
  const eventIds = new Set<string>();
  const auditIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  const sourceEventKeys = new Set<string>();
  let previousRecordedAt: string | undefined;

  for (let index = 0; index < entries.length; index += 1) {
    const value: unknown = entries[index];
    assertValidCaseJournalEntry(value);
    const entry = immutableJson(value) as unknown as CaseJournalEntry;
    verifyEntryHash(entry);
    const recordedAtMilliseconds = Date.parse(entry.recorded_at);
    if (
      !Number.isFinite(recordedAtMilliseconds) ||
      new Date(recordedAtMilliseconds).toISOString() !== entry.recorded_at
    ) {
      throw new CaseEngineError(
        "JOURNAL_INTEGRITY",
        `journal time is not a canonical UTC instant at sequence ${String(entry.sequence)}`,
      );
    }
    if (entry.sequence !== index + 1) {
      throw new CaseEngineError(
        "JOURNAL_INTEGRITY",
        `journal sequence must be contiguous at index ${String(index)}`,
      );
    }
    if (entry.previous_event_hash !== previousHash) {
      throw new CaseEngineError(
        "JOURNAL_INTEGRITY",
        `journal hash chain mismatch at sequence ${String(entry.sequence)}`,
      );
    }
    if (
      previousRecordedAt !== undefined &&
      Date.parse(entry.recorded_at) < Date.parse(previousRecordedAt)
    ) {
      throw new CaseEngineError(
        "JOURNAL_INTEGRITY",
        `journal time regresses at sequence ${String(entry.sequence)}`,
      );
    }
    if (
      entry.causation_event_id !== undefined &&
      !eventIds.has(entry.causation_event_id)
    ) {
      throw new CaseEngineError(
        "JOURNAL_INTEGRITY",
        `causation must reference an earlier event at sequence ${String(entry.sequence)}`,
      );
    }
    if (eventIds.has(entry.id) || auditIds.has(entry.id)) {
      throw new CaseEngineError(
        "JOURNAL_INTEGRITY",
        `journal and audit ids must be unique at sequence ${String(entry.sequence)}`,
      );
    }
    eventIds.add(entry.id);
    const idempotencyIdentity = JSON.stringify([
      entry.tenant_id,
      entry.idempotency_key,
    ]);
    if (idempotencyKeys.has(idempotencyIdentity)) {
      throw new CaseEngineError(
        "JOURNAL_INTEGRITY",
        `duplicate idempotency key at sequence ${String(entry.sequence)}`,
      );
    }
    idempotencyKeys.add(idempotencyIdentity);

    if (entry.event_type === "case.created") {
      if (index !== 0 || aggregate !== undefined) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          "case.created must be the first and only creation event",
        );
      }
      const document = entry.payload.document;
      assertValidCaseDocument(document);
      const immutableDocument = immutableJson<UnknownRecord>(document);
      const createdCase = caseRecord(immutableDocument);
      const requiredRootKeys = new Set([
        "tenant",
        "workflow_version",
        "case",
        "events",
        "audit_entries",
      ]);
      const allowedCreatedCaseKeys = new Set([
        ...CASE_RECORD_SEED_KEYS,
        "state",
        "created_at",
        "updated_at",
        "version",
      ]);
      if (
        Object.keys(immutableDocument).length !== requiredRootKeys.size ||
        Object.keys(immutableDocument).some(
          (key) => !requiredRootKeys.has(key),
        ) ||
        Object.keys(createdCase).some(
          (key) => !allowedCreatedCaseKeys.has(key),
        ) ||
        createdCase.id !== entry.case_id ||
        createdCase.tenant_id !== entry.tenant_id ||
        createdCase.state !== "detected" ||
        createdCase.version !== 1 ||
        createdCase.created_at !== entry.recorded_at ||
        createdCase.updated_at !== entry.recorded_at ||
        entry.case_version !== 1 ||
        entry.before_hash !== null ||
        entry.after_hash !== sha256Json(createdCase)
      ) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          "case.created projection does not match its journal envelope",
        );
      }
      const auditEntries = immutableDocument.audit_entries;
      const auditValues = asUnknownArray(auditEntries);
      const onlyAudit = auditValues?.length === 1 ? auditValues[0] : undefined;
      const auditEntry = isRecord(onlyAudit) ? onlyAudit : undefined;
      if (auditEntry === undefined) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          "case.created must project an audit entry",
        );
      }
      if (
        typeof auditEntry.id !== "string" ||
        auditIds.has(auditEntry.id) ||
        eventIds.has(auditEntry.id)
      ) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          "audit ids must be present and unique",
        );
      }
      auditIds.add(auditEntry.id);
      assertAuditMatchesEntry(auditEntry, entry);
      const events = asUnknownArray(immutableDocument.events);
      if (events === undefined || events.length !== 1 || !isRecord(events[0])) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          "case.created must project exactly one trigger event",
        );
      }
      const identity = sourceEventIdentity(events[0]);
      const createdScopes = requireStringArray(
        createdCase,
        "scope_ids",
        "$/case",
      );
      assertWorkEvent(events[0], entry.tenant_id, createdScopes);
      const seedCase = Object.fromEntries(
        Object.entries(createdCase).filter(([field]) =>
          CASE_RECORD_SEED_KEYS.has(field),
        ),
      );
      if (
        entry.command_fingerprint !==
        expectedJournalCommandFingerprint(entry, "case.create", {
          case_seed: {
            tenant: immutableDocument.tenant,
            workflow_version: immutableDocument.workflow_version,
            case: seedCase,
          },
          trigger_event: events[0],
        })
      ) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          "case.created command fingerprint does not match its payload",
        );
      }
      sourceEventKeys.add(
        JSON.stringify([
          identity.tenantId,
          identity.source,
          identity.sourceEventId,
        ]),
      );
      assertNoInvariantViolations(immutableDocument);
      aggregate = immutableJson<CaseAggregate>({
        tenant_id: entry.tenant_id,
        case_id: entry.case_id,
        document: immutableDocument,
        journal: [entry],
      });
    } else {
      if (aggregate === undefined) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          "journal must begin with case.created",
        );
      }
      if (
        entry.tenant_id !== aggregate.tenant_id ||
        entry.case_id !== aggregate.case_id ||
        entry.case_version !== caseVersion(aggregate) + 1 ||
        entry.before_hash !== sha256Json(caseRecord(aggregate.document))
      ) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          `journal envelope mismatch at sequence ${String(entry.sequence)}`,
        );
      }
      const auditEntry = entry.payload.audit_entry;
      if (!isRecord(auditEntry)) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          `missing audit projection at sequence ${String(entry.sequence)}`,
        );
      }
      if (
        typeof auditEntry.id !== "string" ||
        auditIds.has(auditEntry.id) ||
        eventIds.has(auditEntry.id)
      ) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          `audit id is missing or duplicated at sequence ${String(entry.sequence)}`,
        );
      }
      auditIds.add(auditEntry.id);
      assertAuditMatchesEntry(auditEntry, entry);
      const currentCase = caseRecord(aggregate.document);
      let nextCase: UnknownRecord;
      let document: UnknownRecord;
      if (entry.event_type === "case.work_event_attached") {
        const workEvent = entry.payload.work_event;
        if (!isRecord(workEvent)) {
          throw new CaseEngineError(
            "JOURNAL_INTEGRITY",
            "work-event attachment payload is invalid",
          );
        }
        const identity = sourceEventIdentity(workEvent);
        const sourceKey = JSON.stringify([
          identity.tenantId,
          identity.source,
          identity.sourceEventId,
        ]);
        if (sourceEventKeys.has(sourceKey)) {
          throw new CaseEngineError(
            "JOURNAL_INTEGRITY",
            "journal attaches a duplicate source event",
          );
        }
        sourceEventKeys.add(sourceKey);
        const scopes = requireStringArray(currentCase, "scope_ids", "$/case");
        assertWorkEvent(workEvent, aggregate.tenant_id, scopes);
        if (
          entry.command_fingerprint !==
          expectedJournalCommandFingerprint(entry, "case.attach_work_event", {
            case_id: entry.case_id,
            work_event: workEvent,
          })
        ) {
          throw new CaseEngineError(
            "JOURNAL_INTEGRITY",
            "attachment command fingerprint does not match its payload",
          );
        }
        nextCase = {
          ...currentCase,
          updated_at: entry.recorded_at,
          version: entry.case_version,
        };
        const events = asUnknownArray(aggregate.document.events) ?? [];
        document = {
          ...aggregate.document,
          case: nextCase,
          events: [...events, workEvent],
        };
      } else {
        const fromState = entry.payload.from_state;
        const toState = entry.payload.to_state;
        if (
          typeof fromState !== "string" ||
          fromState !== currentCase.state ||
          typeof toState !== "string"
        ) {
          throw new CaseEngineError(
            "JOURNAL_INTEGRITY",
            "transition payload does not match replayed state",
          );
        }
        if (entry.event_type === "case.state_transitioned") {
          if (toState === "resolved" || !canTransition(fromState, toState)) {
            throw new CaseEngineError(
              "JOURNAL_INTEGRITY",
              "journal contains an unauthorized accepted transition",
            );
          }
          nextCase = {
            ...currentCase,
            state: toState,
            updated_at: entry.recorded_at,
            version: entry.case_version,
          };
        } else {
          const reasonCode = entry.payload.reason_code;
          const expectedRejection =
            fromState === "verifying" && toState === "resolved"
              ? "closure_proof_required"
              : !canTransition(fromState, toState)
                ? "invalid_transition"
                : undefined;
          if (reasonCode !== expectedRejection) {
            throw new CaseEngineError(
              "JOURNAL_INTEGRITY",
              "transition rejection is not justified by the replayed state",
            );
          }
          nextCase = {
            ...currentCase,
            updated_at: entry.recorded_at,
            version: entry.case_version,
          };
        }
        if (
          entry.command_fingerprint !==
          expectedJournalCommandFingerprint(entry, "case.transition", {
            case_id: entry.case_id,
            to_state: toState,
            reason: entry.payload.reason,
          })
        ) {
          throw new CaseEngineError(
            "JOURNAL_INTEGRITY",
            "transition command fingerprint does not match its payload",
          );
        }
        document = { ...aggregate.document, case: nextCase };
      }
      document = addAuditEntry(document, auditEntry);
      const immutableDocument = immutableJson<UnknownRecord>(document);
      if (entry.after_hash !== sha256Json(nextCase)) {
        throw new CaseEngineError(
          "JOURNAL_INTEGRITY",
          `after hash mismatch at sequence ${String(entry.sequence)}`,
        );
      }
      assertNoInvariantViolations(immutableDocument);
      aggregate = immutableJson<CaseAggregate>({
        tenant_id: aggregate.tenant_id,
        case_id: aggregate.case_id,
        document: immutableDocument,
        journal: [...aggregate.journal, entry],
      });
    }
    previousHash = entry.event_hash;
    previousRecordedAt = entry.recorded_at;
  }

  if (aggregate === undefined) {
    throw new CaseEngineError("JOURNAL_INTEGRITY", "journal produced no case");
  }
  return aggregate;
}
