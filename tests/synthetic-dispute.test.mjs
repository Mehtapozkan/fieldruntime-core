import assert from "node:assert/strict";
import test from "node:test";
import * as runtime from "../dist/packages/runtime/src/index.js";
import {
  assertValidSyntheticDisputeContract,
  assertValidDisputeResultContract,
} from "../dist/packages/contracts/src/index.js";
const subject = {
  tenant_id: "tenant_intake_demo",
  case_id: "case_lab",
  record_key: "sha256:" + "a".repeat(64),
  entity: "entity_north",
  customer: "Case Lab Customer",
  dispute_id: "case-lab-400",
  invoice_id: "CL-INV-10000",
  order_id: "CL-ORDER-1",
  delivery_id: "CL-DELIVERY-1",
  amount_minor: 40000,
  currency: "USD",
};
test("v2 admits a distinct 400-dollar shape while unchanged v1 rejects it", () => {
  assertValidSyntheticDisputeContract("subject", subject);
  assert.throws(() => assertValidDisputeResultContract("subject", subject));
  assert.throws(() =>
    assertValidSyntheticDisputeContract("subject", {
      ...subject,
      amount_minor: -1,
    }),
  );
});
test("supported public runtime exposes a configured result boundary, not low-level mutation", () => {
  assert.equal(typeof runtime.createSyntheticDisputeRuntime, "function");
  assert.equal(typeof runtime.validateSyntheticDisputeExport, "function");
  assert.equal(runtime.applyDisputeCommand, undefined);
});
