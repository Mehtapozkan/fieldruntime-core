// Offline operator aid: writes one explicit command, never submits or rebases it.
import process from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  assertValidDisputeResultContract,
  sha256Json,
} from "../dist/packages/contracts/src/index.js";
const [operation, viewPath, commandPath, reason] = process.argv.slice(2);
if (!operation || !viewPath || !commandPath)
  throw Error(
    "Usage: node scripts/draft-dispute-result-command.mjs OPERATION view.json pending.json [reason]",
  );
const v = JSON.parse(await readFile(viewPath, "utf8"));
assertValidDisputeResultContract("read", v);
const last = (op) => v.history.findLast((e) => e.operation === op),
  d = last("no_action"),
  check = last("result_check");
const c = {
  schema_version: "dispute-result-command.v1",
  operation,
  binding: v.binding,
  idempotency_key: randomUUID(),
};
if (!["enroll", "candidate"].includes(operation))
  c.candidate_hash = v.candidate_hash;
if (operation === "request_authority")
  c.basis_observation_hash = v.basis?.basis_observation_hash;
if (["review_authority", "no_action"].includes(operation))
  c.review = {
    authority_request_id: v.authority?.authority_request_id,
    request_binding_hash: v.authority?.request_binding_hash,
    expected_review_revision: v.authority?.review_revision,
  };
if (operation === "review_authority") {
  c.decision = process.env.D039_DECISION ?? "approve";
  c.reason = reason;
}
if (operation === "no_action")
  c.basis_hash = sha256Json(v.authority.material.basis);
if (["report", "result_check", "accept"].includes(operation))
  c.decision_hash = d?.hash;
if (operation === "report") {
  c.reason = reason;
  c.claim = {
    source_id: d?.data.basis.source.ar.object_id,
    source_version: d?.data.basis.source.ar.version + 1,
    occurred_at: v.evaluated_at,
    source_timezone: "UTC",
    evidence_ref: `synthetic://human-report/${c.idempotency_key}`,
  };
}
if (operation === "accept") {
  c.observation_hash = check?.hash;
  c.outcome_hash = sha256Json(check?.data.outcome);
  c.reason = reason;
  c.commitments = [
    {
      id: "commitment_payment_follow_up",
      description: "Obtain payment status for the upheld disputed portion",
      owner_identity_id: "identity_dispute_morgan",
      due_at: new Date(Date.parse(v.evaluated_at) + 86400000).toISOString(),
      status: "owned",
      evidence_ref: `dispute-result://${d?.hash}/payment-follow-up`,
    },
  ];
}
if (operation === "reject" || operation === "reopen") c.reason = reason;
if (operation === "reopen") {
  c.acceptance_hash = last("accept")?.hash;
  c.observation_hash = check?.hash;
}
assertValidDisputeResultContract("command", c);
await writeFile(commandPath, JSON.stringify(c, null, 2) + "\n", { flag: "wx" });
console.log(
  `Inspect ${commandPath} before explicit submission. Preserve its bytes/key after an uncertain response; a fresh draft is not a retry.`,
);
