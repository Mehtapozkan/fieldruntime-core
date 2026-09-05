// Reproducible D7-B/C appliance demonstration: committed action, separate verification and restart.
import assert from "node:assert/strict";
import {
  caseCommand,
  createRequestCommand,
  decideCommand,
  TENANT,
} from "../tests/helpers/authority-review.mjs";
const mode = process.argv[2],
  base = process.env.FIELD_RUNTIME_SMOKE_URL ?? "http://127.0.0.1:3210";
assert.ok(["applied", "durable"].includes(mode));
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const caseId = "case_d6_workbench",
  root = `/v1/tenants/${TENANT}/authority-requests`,
  view = `/v1/tenants/${TENANT}/cases/${caseId}/simulated-credit`,
  action = `${view}-attempts`;
async function request(path, body) {
  const r = await globalThis.fetch(base + path, {
    ...(body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    signal: globalThis.AbortSignal.timeout(30000),
  });
  const value = await r.json();
  assert.equal(r.status, 200, JSON.stringify(value));
  return value;
}
const casePost = (c) => request(`/v0/tenants/${TENANT}/case-commands`, c);
if (mode === "applied") {
  assert.equal((await casePost(caseCommand("d6_workbench"))).status, "applied");
  for (const [i, to] of ["qualifying", "enriching", "needs_review"].entries())
    assert.equal(
      (
        await casePost({
          type: "case.transition",
          tenant_id: TENANT,
          case_id: caseId,
          expected_case_version: i + 1,
          actor_identity_id: "identity_d6_operator",
          idempotency_key: `d7-smoke-prepare:${to}`,
          correlation_id: "d7-smoke",
          to_state: to,
          reason: `Explicit synthetic preparation: ${to}`,
        })
      ).status,
      "applied",
    );
  const catalog = await request(`/v1/tenants/${TENANT}/authority-catalog`);
  assert.equal(
    catalog.authority_state_revision,
    2,
    "run fr d7 enroll --demo explicitly first",
  );
  const created = await request(
      root,
      createRequestCommand(caseId, "d7-smoke-request", {
        expected_case_version: 4,
        expected_authority_state_revision: 2,
      }),
    ),
    id = created.receipt.authority_request_id;
  for (const seat of ["finance", "executive"]) {
    const p = await request(`${root}/${id}/packet`);
    assert.equal(
      (
        await request(
          `${root}/${id}/decisions/${seat}`,
          decideCommand(p, `d7-smoke:${seat}`),
        )
      ).status,
      "applied",
    );
  }
  const packet = await request(`${root}/${id}/packet`);
  assert.equal(packet.current.authorized, true);
  assert.equal(packet.action_permission, false);
  const preview = await request(view);
  assert.equal(preview.current.eligible, true);
  const command = {
    ...preview.current.bindings,
    idempotency_key: "d7-smoke-credit",
    correlation_id: "d7-smoke",
  };
  const applied = await request(action, command);
  assert.equal(applied.status, "applied");
  assert.equal(applied.receipt.verification, "unverified");
  const verification = await request(
    `${action}/${applied.receipt.id}/verifications`,
    {
      schema_version: "simulated-credit-verification-command.v1",
      type: "simulated-credit.verify",
      tenant_id: TENANT,
      case_id: caseId,
      attempt_id: applied.receipt.id,
      expected_action_entry_hash: applied.receipt.event_hash,
      idempotency_key: "d7-smoke-verification",
      correlation_id: "d7-smoke",
    },
  );
  assert.equal(
    verification.receipt.comparison.outcome,
    "verified_simulated_effect",
  );
  assert.equal(applied.receipt.closure_permission, false);
}
const read = await request(view);
assert.equal(read.attempts.length, 1);
assert.equal(read.source.payload.amount_minor, 1500000);
assert.equal(read.current.eligible, false);
assert.ok(read.current.reason_codes.includes("credit_already_recorded"));
assert.equal(read.verifications.length, 1);
assert.equal(
  read.verifications[0].comparison.outcome,
  "verified_simulated_effect",
);
assert.equal(read.verifications[0].closure_permission, false);
assert.equal(
  read.verifications[0].authority.verifier_identity.identity_id,
  "identity_d7_credit_verifier",
);
const entry = read.attempts[0];
assert.equal(entry.case_version, 4);
assert.equal(entry.review_revision, 2);
assert.equal(entry.authority_state_revision, 2);
if (mode === "durable") {
  const retry = await request(action, entry.command);
  assert.equal(retry.status, "duplicate");
  assert.deepEqual(retry.receipt, entry);
  assert.equal(retry.historical_only, true);
  const proof = read.verifications[0];
  const verificationRetry = await request(
    `${action}/${entry.id}/verifications`,
    proof.command,
  );
  assert.equal(verificationRetry.status, "duplicate");
  assert.deepEqual(verificationRetry.receipt, proof);
}
assert.equal(
  (await request(`/v0/tenants/${TENANT}/cases/${caseId}`)).journal.length,
  4,
);
assert.equal(
  (await request(`${root}/${entry.authority_request_id}/packet`))
    .review_revision,
  2,
);
process.stdout.write(
  `D7-B/C ${mode}: one $15,000 simulated Orchid credit; independent exact source read verified; action/proof and exact retries reconstructed; impact unverified and closure blocked.\n`,
);
