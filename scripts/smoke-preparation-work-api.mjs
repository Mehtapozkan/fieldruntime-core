// Explicitly consumes the synthetic D11 smoke fixture; no automatic initialization or faults.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  assertValidPreparationWorkContract,
  assertValidPreparationWorkV2Contract,
} from "../dist/packages/contracts/src/index.js";
import { validateWorkExport } from "../dist/packages/runtime/src/preparation-work.js";
const [mode, packFile, evidenceFile] = process.argv.slice(2),
  base = process.env.FIELD_RUNTIME_URL ?? "http://127.0.0.1:3210",
  url = new URL(base);
assert.ok(
  ["applied", "durable"].includes(mode) &&
    packFile &&
    evidenceFile &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.protocol === "http:" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === "/",
  "Use applied|durable PACK_EVIDENCE NEW_WORK_EVIDENCE on a loopback appliance",
);
async function call(path, command) {
  const response = await globalThis.fetch(
      base + path,
      command
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(command),
          }
        : {},
    ),
    v = await response.json();
  assert.equal(response.status, 200, JSON.stringify(v));
  return v;
}
const POST = "/v1/intake/preparation-work/commands";
if (mode === "applied") {
  const pack = JSON.parse(await readFile(packFile, "utf8")),
    b = pack.receipt.entry.artifact.binding.discovery,
    path = `/v1/intake/preparation-work?case_id=${b.case_id}&record_key=${b.record_key}`,
    v = await call(path);
  (v.schema_version.endsWith(".v2")
    ? assertValidPreparationWorkV2Contract
    : assertValidPreparationWorkContract)("read", v);
  assert.equal(v.current.can_start, true);
  const start = {
      schema_version: v.schema_version.endsWith(".v2")
        ? "preparation-work-command.v2"
        : "preparation-work-command.v1",
      operation: "start",
      binding: v.candidate_binding,
      expected_work_revision: v.work_revision,
      expected_work_head: v.work_head,
      replaces_invocation: null,
      idempotency_key: "d12-appliance-start",
    },
    started = await call(POST, start),
    done = await call(path),
    run = done.invocations.at(-1);
  assert.equal(run.outcome, "prepared_gap_packet");
  assert.equal(run.result.disposition.recommended_credit_minor, null);
  const review = {
      schema_version: done.schema_version.endsWith(".v2")
        ? "preparation-task-review.v2"
        : "preparation-task-review.v1",
      operation: "task_review",
      purpose: "preparation_usefulness",
      invocation_id: run.invocation_id,
      result_hash: run.result_hash,
      expected_work_revision: done.work_revision,
      expected_work_head: done.work_head,
      decision: "approve",
      reason: "Accept synthetic gap packet for preparation only",
      idempotency_key: "d12-appliance-review",
    },
    reviewed = await call(POST, review),
    archive = await call(path + "&representation=export");
  validateWorkExport(archive);
  await writeFile(
    evidenceFile,
    JSON.stringify({ path, start, started, review, reviewed, archive }),
    { flag: "wx" },
  );
  console.log(
    "PASS: explicit compatible publication → bounded preparation → cited gap packet → human task acceptance; no financial action or closure",
  );
} else {
  const e = JSON.parse(await readFile(evidenceFile, "utf8"));
  assert.deepEqual(await call(POST, e.start), e.started);
  assert.deepEqual(await call(POST, e.review), e.reviewed);
  assert.deepEqual(await call(e.path + "&representation=export"), e.archive);
  validateWorkExport(e.archive);
  console.log(
    "PASS: preparation/result/review and portable evidence reconstruct after restart; original keys do not recompute or append",
  );
}
