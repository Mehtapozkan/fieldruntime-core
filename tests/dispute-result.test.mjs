import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertValidDisputeResultContract,
  assertValidAuthorityReviewContract,
  canonicalJson,
  sha256Json,
} from "../dist/packages/contracts/src/index.js";
import {
  compareDisputeSource,
  rawDisputeRead,
  unavailableDisputeRead,
} from "../dist/packages/runtime/src/dispute-source.js";
const source = JSON.parse(
  await readFile(
    new URL(
      "../packages/runtime/fixtures/dispute-result-source.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const subject = {
  ...source.pod.subject,
  tenant_id: "tenant_intake_demo",
  case_id: "case_synthetic",
  record_key: "sha256:" + "a".repeat(64),
};
const raw = (s) => rawDisputeRead(Buffer.from(canonicalJson(s))),
  at = "2026-09-07T16:06:00.000Z";
test("D039 strict source and original bytes produce a basis match without granting authority", () => {
  assertValidDisputeResultContract("source", source);
  const observed = raw(source),
    comparison = compareDisputeSource(
      subject,
      observed,
      observed,
      at,
      "basis",
      null,
      null,
    );
  assert.equal(comparison.status, "match");
  assert.equal(Object.hasOwn(comparison, "authorized"), false);
});
test("D039 read failure, wrong attribution and authoritative absence remain distinct", () => {
  const unavailable = unavailableDisputeRead();
  assert.equal(
    compareDisputeSource(
      subject,
      unavailable,
      unavailable,
      at,
      "basis",
      null,
      null,
    ).status,
    "inconclusive",
  );
  const missing = raw({ ...source, pod: null });
  assert.equal(
    compareDisputeSource(subject, missing, missing, at, "basis", null, null)
      .status,
    "mismatch",
  );
  const wrong = structuredClone(source);
  wrong.pod.subject.dispute_id = "dispute-18";
  assert.equal(
    compareDisputeSource(
      subject,
      raw(wrong),
      raw(wrong),
      at,
      "basis",
      null,
      null,
    ).status,
    "inconclusive",
  );
});
test("D039 reported success cannot replace expected prior AR lineage or original proof", () => {
  const next = structuredClone(source),
    decision = "sha256:" + "b".repeat(64);
  next.revision = 1;
  next.ar = {
    ...next.ar,
    version: 1,
    status: "upheld_no_adjustment",
    active_grounds: [],
    disposed_grounds: ["non_delivery"],
    decision_reference: decision,
    prior_version: 0,
    prior_hash: sha256Json(source.ar),
    event_at: at,
  };
  assert.equal(
    compareDisputeSource(
      subject,
      raw(next),
      raw(next),
      at,
      "result",
      { source },
      decision,
      at,
    ).status,
    "match",
  );
  next.ar.prior_hash = "sha256:" + "c".repeat(64);
  assert.equal(
    compareDisputeSource(
      subject,
      raw(next),
      raw(next),
      at,
      "result",
      { source },
      decision,
      at,
    ).status,
    "mismatch",
  );
  next.ar.prior_hash = null;
  assert.equal(
    compareDisputeSource(
      subject,
      raw(next),
      raw(next),
      at,
      "result",
      { source },
      decision,
      at,
    ).status,
    "inconclusive",
  );
});
test("D039 v1 authority command remains strict and credit-only", () => {
  assert.throws(() =>
    assertValidAuthorityReviewContract("command", {
      type: "authority.request.create",
      tenant_id: "tenant_intake_demo",
      case_id: "case_synthetic",
      expected_case_version: 1,
      expected_authority_state_revision: 1,
      idempotency_key: "x",
      correlation_id: "corr",
      proposal_key: "uphold_invoice_no_adjustment",
    }),
  );
  assert.throws(() =>
    assertValidDisputeResultContract("command", {
      operation: "accept",
      authorized: true,
    }),
  );
});

test("D039 duplicate source keys are malformed, never a selected active/valid copy", () => {
  const text = JSON.stringify(source).replace(
    '"valid":true',
    '"valid":false,"valid":true',
  );
  const parsed = rawDisputeRead(Buffer.from(text));
  assert.equal(parsed.status, "malformed");
  assert.equal(
    compareDisputeSource(subject, parsed, parsed, at, "basis", null, null)
      .status,
    "inconclusive",
  );
});
