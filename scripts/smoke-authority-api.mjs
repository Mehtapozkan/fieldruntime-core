import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  caseCommand,
  createRequestCommand,
  decideCommand,
  TENANT,
} from "../tests/helpers/authority-review.mjs";

const phase = process.argv[2];
assert.ok(
  ["applied", "durable"].includes(phase),
  "usage: node scripts/smoke-authority-api.mjs applied|durable",
);
const evidenceFile =
  process.env.D6_DEMO_EVIDENCE ?? ".fieldruntime/d6-review-demo.json";
const root = `/v1/tenants/${TENANT}/authority-requests`;
async function request(path, command) {
  const response = await globalThis.fetch(`http://127.0.0.1:3210${path}`, {
    ...(command
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        }
      : {}),
    signal: globalThis.AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}
const seed = caseCommand("d6_compose_demo");
const createdCase = await request(`/v0/tenants/${TENANT}/case-commands`, seed);
assert.equal(createdCase.status, phase === "applied" ? "applied" : "duplicate");
const create = createRequestCommand(
  "case_d6_compose_demo",
  "d6-compose-request",
);
const created = await request(root, create);
assert.equal(created.status, phase === "applied" ? "applied" : "duplicate");
const id = created.receipt.authority_request_id;
if (phase === "applied") {
  const finance = decideCommand(
    await request(`${root}/${id}/packet`),
    "d6-compose-finance",
  );
  const financeReceipt = (
    await request(`${root}/${id}/decisions/finance`, finance)
  ).receipt;
  assert.equal(financeReceipt.review_revision, 1);
  assert.equal(financeReceipt.result.authorized, false);
  const executive = decideCommand(
    await request(`${root}/${id}/packet`),
    "d6-compose-executive",
  );
  const executiveReceipt = (
    await request(`${root}/${id}/decisions/executive`, executive)
  ).receipt;
  assert.equal(executiveReceipt.review_revision, 2);
  assert.equal(executiveReceipt.result.authorized, true);
  const packet = await request(`${root}/${id}/packet`);
  await writeFile(
    evidenceFile,
    JSON.stringify(
      { packet, finance, financeReceipt, executive, executiveReceipt },
      null,
      2,
    ),
  );
} else {
  const evidence = JSON.parse(await readFile(evidenceFile, "utf8"));
  const packet = await request(`${root}/${id}/packet`);
  assert.deepEqual(packet.history, evidence.packet.history);
  assert.deepEqual(packet.material, evidence.packet.material);
  assert.deepEqual(
    packet.historical_evaluations,
    evidence.packet.historical_evaluations,
  );
  for (const seat of ["finance", "executive"]) {
    const retry = await request(
      `${root}/${id}/decisions/${seat}`,
      evidence[seat],
    );
    assert.equal(retry.status, "duplicate");
    assert.deepEqual(retry.receipt, evidence[`${seat}Receipt`]);
  }
}
const packet = await request(`${root}/${id}/packet`);
assert.deepEqual(
  [
    packet.case_version,
    packet.review_revision,
    packet.authority_state_revision,
  ],
  [1, 2, 1],
);
assert.equal(packet.current.authorized, true);
assert.equal(packet.action_permission, false);
const journal = await request(
  `/v0/tenants/${TENANT}/cases/case_d6_compose_demo/journal`,
);
assert.equal(journal.entries.length, 1);
process.stdout.write(
  `D6-C API/PostgreSQL ${phase}: C=1 R=2 S=1, Finance + Executive, reconstructed history, action_permission=false.\n`,
);
