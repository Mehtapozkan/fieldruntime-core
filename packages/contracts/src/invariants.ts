import { canonicalizeJson, type JsonValue } from "./canonical-json.js";

const RESOLUTION_STATES = new Set(["resolved", "learning_review", "closed"]);

type UnknownRecord = Record<string, unknown>;

const CASE_COLLECTIONS = [
  "events",
  "participants",
  "evidence",
  "artifacts",
  "decision_packets",
  "approvals",
  "action_proposals",
  "action_receipts",
  "commitments",
  "intelligence_receipts",
  "outcomes",
  "corrections",
  "learning_candidates",
  "eval_runs",
  "audit_entries",
] as const;

export interface InvariantViolation {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownValue(record: UnknownRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function records(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: UnknownRecord[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      continue;
    }

    const item: unknown = value[index];
    if (isRecord(item)) {
      result.push(item);
    }
  }

  return result;
}

function stringField(record: UnknownRecord, key: string): string | undefined {
  const value = ownValue(record, key);
  return typeof value === "string" ? value : undefined;
}

function stringsField(
  record: UnknownRecord,
  key: string,
): readonly string[] | undefined {
  const value = ownValue(record, key);
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item: unknown = value[index];
    if (!Object.hasOwn(value, index) || typeof item !== "string") {
      return undefined;
    }
    strings.push(item);
  }

  return strings;
}

export function validateCrossRecordInvariants(
  document: unknown,
): InvariantViolation[] {
  let normalized: JsonValue;
  try {
    normalized = canonicalizeJson(document);
  } catch (error) {
    return [
      {
        code: "document.non_canonical_json",
        message:
          error instanceof Error
            ? error.message
            : "The canonical case document contains an unsafe JSON value.",
        path: "/",
      },
    ];
  }

  if (!isRecord(normalized)) {
    return [
      {
        code: "document.object_required",
        message: "The canonical case document must be an object.",
        path: "/",
      },
    ];
  }

  const root = normalized;
  const tenantRecord = isRecord(ownValue(root, "tenant"))
    ? (ownValue(root, "tenant") as UnknownRecord)
    : {};
  const workflowRecord = isRecord(ownValue(root, "workflow_version"))
    ? (ownValue(root, "workflow_version") as UnknownRecord)
    : {};
  const caseRecord = isRecord(ownValue(root, "case"))
    ? (ownValue(root, "case") as UnknownRecord)
    : {};
  const tenantId = stringField(tenantRecord, "id");
  const workflowVersionId = stringField(workflowRecord, "id");
  const caseId = stringField(caseRecord, "id");
  const caseScopeIds = new Set(stringsField(caseRecord, "scope_ids") ?? []);
  const state = stringField(caseRecord, "state");
  const proposals = records(ownValue(root, "action_proposals"));
  const approvals = records(ownValue(root, "approvals"));
  const actionReceipts = records(ownValue(root, "action_receipts"));
  const outcomes = records(ownValue(root, "outcomes"));
  const auditEntries = records(ownValue(root, "audit_entries"));
  const violations: InvariantViolation[] = [];

  if (
    tenantId !== undefined &&
    stringField(caseRecord, "tenant_id") !== tenantId
  ) {
    violations.push({
      code: "reference.case_tenant_mismatch",
      message: "The case tenant must match the canonical root tenant.",
      path: "/case/tenant_id",
    });
  }

  if (
    workflowVersionId !== undefined &&
    stringField(caseRecord, "workflow_version_id") !== workflowVersionId
  ) {
    violations.push({
      code: "reference.case_workflow_mismatch",
      message:
        "The case workflow version must match the canonical root workflow version.",
      path: "/case/workflow_version_id",
    });
  }

  for (const collection of CASE_COLLECTIONS) {
    const collectionRecords = records(ownValue(root, collection));
    const seenIds = new Set<string>();

    for (let index = 0; index < collectionRecords.length; index += 1) {
      const record = collectionRecords[index];
      if (record === undefined) {
        continue;
      }

      const id = stringField(record, "id");
      if (id !== undefined) {
        if (seenIds.has(id)) {
          violations.push({
            code: "reference.duplicate_collection_id",
            message: `The ${collection} collection contains a duplicate id.`,
            path: `/${collection}/${String(index)}/id`,
          });
        }
        seenIds.add(id);
      }

      const recordTenantId = stringField(record, "tenant_id");
      if (
        tenantId !== undefined &&
        recordTenantId !== undefined &&
        recordTenantId !== tenantId
      ) {
        violations.push({
          code: "reference.record_tenant_mismatch",
          message: `A ${collection} record belongs to another tenant.`,
          path: `/${collection}/${String(index)}/tenant_id`,
        });
      }

      const recordCaseId = stringField(record, "case_id");
      if (
        caseId !== undefined &&
        recordCaseId !== undefined &&
        recordCaseId !== caseId
      ) {
        violations.push({
          code: "reference.record_case_mismatch",
          message: `A ${collection} record belongs to another case.`,
          path: `/${collection}/${String(index)}/case_id`,
        });
      }

      const scopeIds = stringsField(record, "scope_ids");
      if (
        scopeIds !== undefined &&
        scopeIds.some((scopeId) => !caseScopeIds.has(scopeId))
      ) {
        violations.push({
          code: "reference.scope_expansion",
          message: `A ${collection} record expands beyond the case scopes.`,
          path: `/${collection}/${String(index)}/scope_ids`,
        });
      }
    }
  }

  const sourceEventKeys = new Set<string>();
  const workEvents = records(ownValue(root, "events"));
  for (let index = 0; index < workEvents.length; index += 1) {
    const event = workEvents[index];
    if (event === undefined) {
      continue;
    }

    const eventTenantId = stringField(event, "tenant_id");
    const source = stringField(event, "source");
    const sourceEventId = stringField(event, "source_event_id");
    if (
      eventTenantId === undefined ||
      source === undefined ||
      sourceEventId === undefined
    ) {
      continue;
    }

    const key = JSON.stringify([eventTenantId, source, sourceEventId]);
    if (sourceEventKeys.has(key)) {
      violations.push({
        code: "event.duplicate_source_identity",
        message:
          "A source event identity may appear only once in a canonical case.",
        path: `/events/${String(index)}`,
      });
    }
    sourceEventKeys.add(key);
  }

  for (const proposal of proposals) {
    const proposalId = stringField(proposal, "id");
    const proposalStatus = stringField(proposal, "status");
    const payloadHash = stringField(proposal, "payload_hash");

    if (proposalStatus !== "executed" || proposalId === undefined) {
      continue;
    }

    violations.push({
      code: "action.execution_proof_engine_required",
      message:
        "Executed actions fail closed until the authority engine recomputes a versioned authorization-envelope hash.",
      path: `/action_proposals/${proposalId}`,
    });

    const matchingApproval = approvals.find(
      (approval) =>
        stringField(approval, "proposal_id") === proposalId &&
        stringField(approval, "decision") === "approved" &&
        stringField(approval, "approved_payload_hash") === payloadHash,
    );
    if (matchingApproval === undefined) {
      violations.push({
        code: "action.payload_bound_approval_required",
        message:
          "An executed action requires approval matching its declared payload hash.",
        path: `/action_proposals/${proposalId}`,
      });
    }

    const matchingReceipt = actionReceipts.find(
      (receipt) =>
        stringField(receipt, "proposal_id") === proposalId &&
        ["succeeded", "no_op_duplicate"].includes(
          stringField(receipt, "status") ?? "",
        ) &&
        stringField(receipt, "request_hash") === payloadHash,
    );
    if (matchingReceipt === undefined) {
      violations.push({
        code: "action.receipt_required",
        message: "An executed action requires an immutable action receipt.",
        path: `/action_proposals/${proposalId}`,
      });
    }
  }

  if (state !== undefined && RESOLUTION_STATES.has(state)) {
    const acceptedVerifiedOutcome = outcomes.find(
      (outcome) =>
        ownValue(outcome, "accepted") === true &&
        stringField(outcome, "case_id") === caseId &&
        (stringsField(outcome, "evidence_ids")?.length ?? 0) > 0 &&
        stringField(outcome, "verified_by_identity_id") !== undefined &&
        stringField(outcome, "verified_at") !== undefined,
    );

    if (acceptedVerifiedOutcome === undefined) {
      violations.push({
        code: "resolution.independent_verified_outcome_required",
        message:
          "A resolved case requires an accepted, evidenced outcome with a named verifier.",
        path: "/outcomes",
      });
    }

    const caseAuditEntries = auditEntries.filter(
      (entry) =>
        stringField(entry, "case_id") === caseId &&
        stringField(entry, "tenant_id") === tenantId,
    );
    if (caseAuditEntries.length === 0) {
      violations.push({
        code: "resolution.audit_required",
        message: "A resolved case requires reconstructable audit lineage.",
        path: "/audit_entries",
      });
    }
  }

  return violations;
}
