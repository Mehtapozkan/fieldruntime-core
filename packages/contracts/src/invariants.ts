const RESOLUTION_STATES = new Set(["resolved", "learning_review", "closed"]);

type UnknownRecord = Record<string, unknown>;

export interface InvariantViolation {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

function records(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is UnknownRecord => typeof item === "object" && item !== null,
  );
}

function stringField(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function validateCrossRecordInvariants(
  document: unknown,
): InvariantViolation[] {
  if (typeof document !== "object" || document === null) {
    return [
      {
        code: "document.object_required",
        message: "The canonical case document must be an object.",
        path: "/",
      },
    ];
  }

  const root = document as UnknownRecord;
  const caseRecord =
    typeof root.case === "object" && root.case !== null
      ? (root.case as UnknownRecord)
      : {};
  const state = stringField(caseRecord, "state");
  const proposals = records(root.action_proposals);
  const approvals = records(root.approvals);
  const actionReceipts = records(root.action_receipts);
  const outcomes = records(root.outcomes);
  const auditEntries = records(root.audit_entries);
  const violations: InvariantViolation[] = [];

  for (const proposal of proposals) {
    const proposalId = stringField(proposal, "id");
    const proposalStatus = stringField(proposal, "status");
    const payloadHash = stringField(proposal, "payload_hash");

    if (proposalStatus !== "executed" || proposalId === undefined) {
      continue;
    }

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
          "An executed action requires approval of its exact payload hash.",
        path: `/action_proposals/${proposalId}`,
      });
    }

    const matchingReceipt = actionReceipts.find(
      (receipt) => stringField(receipt, "proposal_id") === proposalId,
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
        outcome.accepted === true &&
        Array.isArray(outcome.evidence_ids) &&
        outcome.evidence_ids.length > 0 &&
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

    if (auditEntries.length === 0) {
      violations.push({
        code: "resolution.audit_required",
        message: "A resolved case requires reconstructable audit lineage.",
        path: "/audit_entries",
      });
    }
  }

  return violations;
}
