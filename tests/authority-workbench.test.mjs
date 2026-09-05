import assert from "node:assert/strict";
import test from "node:test";

const clientUrl = new URL(
  "../apps/admin/public/authority-client.js",
  import.meta.url,
);

test("persistent Workbench has a server-backed client and no local authorization reducer", async () => {
  const client = await import(clientUrl);
  assert.equal(typeof client.createReviewClient, "function");
  assert.equal(typeof client.validatePacket, "function");
});

test("persistent Workbench rejects malformed or authority-granting packet responses", async () => {
  const { validatePacket } = await import(clientUrl);
  assert.throws(() =>
    validatePacket({ current: { authorized: true }, action_permission: true }),
  );
  const h = browserApiHarness(),
    client = h.client();
  await client.initialize();
  for (const alter of [
    (packet) => {
      packet.case_id = "case_other";
    },
    (packet) => {
      packet.history[0].request_binding_hash = `sha256:${"0".repeat(64)}`;
    },
    (packet) => {
      packet.material.evidence[0].content = null;
    },
    (packet) => {
      packet.historical_evaluations[0].result = null;
    },
    (packet) => {
      packet.action_permission = true;
    },
  ]) {
    const packet = client.state.packet;
    alter(packet);
    assert.throws(() => validatePacket(packet));
  }
});

import { browserApiHarness } from "./helpers/authority-browser-api.mjs";
import {
  DEMO_CASE,
  DEMO_UPDATE,
  CASE_ID,
  TENANT,
  STORAGE_KEY,
  decisionCommand,
  requestBlocked,
  validatePacket,
} from "../apps/admin/public/authority-client.js";
import {
  SYNTHETIC_EVIDENCE,
  sha256Json,
} from "../dist/packages/runtime/src/index.js";

test("packet authorization flags must agree with bindings, lifecycle, resolver, requirements and recorded approvals", async () => {
  const client = browserApiHarness().client();
  await client.initialize();
  const initial = client.state.packet;
  await client.decide("finance", "approve");
  await client.refresh();
  await client.decide("executive", "approve");
  await client.refresh();
  const approved = client.state.packet;
  assert.equal(validatePacket(approved).current.authorized, true);
  const reordered = structuredClone(approved);
  reordered.current.effective_approval_ids.reverse();
  reordered.current.resolution.authority_requirements.reverse();
  assert.doesNotThrow(() => validatePacket(reordered));
  const variants = [
    [
      "unapproved flag",
      initial,
      (p) => {
        p.current.authorized = true;
      },
    ],
    [
      "ineligible",
      approved,
      (p) => {
        p.current.eligible = false;
      },
    ],
    [
      "terminal",
      approved,
      (p) => {
        p.current.lifecycle = "rejected";
      },
    ],
    [
      "stale reason",
      approved,
      (p) => {
        p.current.reason_codes = ["stale_case"];
      },
    ],
    [
      "no effective approvals",
      approved,
      (p) => {
        p.current.effective_approval_ids = [];
      },
    ],
    [
      "resolver outcome",
      approved,
      (p) => {
        p.current.resolution.outcome = "approval_required";
      },
    ],
    [
      "outstanding requirement",
      approved,
      (p) => {
        p.current.resolution.authority_requirements[0].status = "outstanding";
      },
    ],
    [
      "changed Case",
      approved,
      (p) => {
        p.case_version++;
      },
    ],
    [
      "changed catalog",
      approved,
      (p) => {
        p.authority_state_revision++;
      },
    ],
    [
      "expired",
      approved,
      (p) => {
        p.evaluated_at = p.request.expires_at;
      },
    ],
    [
      "unrecorded approval",
      approved,
      (p) => {
        p.current.effective_approval_ids[0] = "decision_invented";
        p.current.resolution.authority_decision_ids[0] = "decision_invented";
        p.current.resolution.authority_requirements[0].satisfied_approval_ids[0] =
          "decision_invented";
      },
    ],
  ];
  const accepted = [];
  for (const [name, source, alter] of variants) {
    const packet = structuredClone(source);
    alter(packet);
    try {
      validatePacket(packet);
      accepted.push(name);
    } catch {
      /* fail closed */
    }
  }
  assert.deepEqual(
    accepted,
    [],
    "incoherent packets must be rejected before rendering authorization",
  );
});

test("demo commands cite retained runtime evidence and initialize explicitly and idempotently", async () => {
  for (const event of [DEMO_CASE.trigger_event, DEMO_UPDATE])
    assert.equal(
      event.content_hash,
      sha256Json(SYNTHETIC_EVIDENCE[event.payload_ref]),
    );
  const h = browserApiHarness(),
    client = h.client(),
    empty = h.snapshot();
  await client.start();
  assert.equal(h.snapshot(), empty);
  assert.ok(h.calls.every((call) => call.method === "GET"));
  await client.initialize();
  assert.equal(client.state.error, null);
  const id = client.state.requestId;
  assert.equal(h.caseVersion, 1);
  assert.equal(h.requests.length, 1);
  await client.initialize();
  assert.equal(client.state.requestId, id);
  assert.equal(h.caseVersion, 1);
  assert.equal(h.requests.length, 1);
  h.assertIntegrity();
});

test("confirmed decisions refresh progress by GET; further decisions require a new human submission", async () => {
  const h = browserApiHarness(),
    client = h.client();
  await client.initialize();
  const readOnly = h.snapshot();
  await client.refresh();
  assert.equal(h.snapshot(), readOnly);
  const before = h.calls.length;
  await client.decide("finance", "approve");
  assert.equal(client.state.receipt.review_revision, 1);
  assert.equal(client.state.packet.review_revision, 1);
  assert.equal(client.state.needsRefresh, false);
  assert.equal(client.state.packet.current.authorized, false);
  assert.deepEqual(
    h.calls.slice(before).map((call) => call.method),
    ["POST", "GET", "GET", "GET"],
  );
  const finance = JSON.parse(h.calls[before].body);
  assert.equal(finance.expected_review_revision, 0);
  const next = h.calls.length;
  await client.decide("executive", "approve");
  assert.equal(JSON.parse(h.calls[next].body).expected_review_revision, 1);
  assert.equal(client.state.packet.current.authorized, true);
  assert.equal(client.state.packet.action_permission, false);
  const saved = JSON.parse(h.storage.getItem(STORAGE_KEY));
  assert.deepEqual(Object.keys(saved).sort(), ["pending", "requestId"]);
  const state = h.snapshot(),
    reloaded = h.client();
  await reloaded.start();
  assert.equal(h.snapshot(), state);
  assert.deepEqual(reloaded.state.packet.history, client.state.packet.history);
  assert.equal(reloaded.state.receipt, null);
  assert.equal(h.caseVersion, 1);
});

test("stale submissions keep the reviewed binding and require explicit refresh and a fresh request", async () => {
  const h = browserApiHarness(),
    client = h.client();
  await client.initialize();
  await client.decide("finance", "approve");
  await client.refresh();
  const old = client.state.packet;
  h.caseCommand({
    type: "case.attach_work_event",
    tenant_id: TENANT,
    case_id: CASE_ID,
    expected_case_version: 1,
    actor_identity_id: "identity_d6_operator",
    idempotency_key: "other:update",
    correlation_id: "other",
    work_event: DEMO_UPDATE,
  });
  await client.decide("executive", "approve");
  assert.match(client.state.error, /Case version changed/);
  assert.equal(
    client.state.packet.request_binding_hash,
    old.request_binding_hash,
  );
  assert.equal(JSON.parse(h.calls.at(-1).body).expected_case_version, 1);
  const count = h.calls.length;
  await client.decide("executive", "approve");
  assert.equal(h.calls.length, count);
  await client.refresh();
  assert.equal(client.state.packet.current.authorized, false);
  assert.deepEqual(client.state.packet.current.effective_approval_ids, []);
  await client.freshRequest();
  assert.equal(client.state.packet.review_revision, 0);
  assert.equal(client.state.packet.case_version, 2);
  assert.equal(client.state.packet.material.evidence.length, 2);
  assert.equal(client.state.packet.current.authorized, false);
});

for (const decision of ["reject", "modify", "escalate"])
  test(`browser submits ${decision} with exact bindings; terminal history and replacement reconstruct`, async () => {
    const h = browserApiHarness(),
      client = h.client();
    await client.initialize();
    await client.decide("finance", "approve");
    await client.refresh();
    const old = client.state.packet;
    await client.decide(
      "executive",
      decision,
      "Independent review",
      "credit_12000",
    );
    assert.equal(client.state.error, null);
    const receipt = client.state.receipt;
    await client.refresh();
    assert.equal(client.state.packet.review_revision, 2);
    assert.equal(client.state.packet.current.authorized, false);
    assert.equal(requestBlocked(client.state.packet), true);
    if (decision === "modify") {
      await client.refresh(receipt.replacement_authority_request_id);
      assert.equal(client.state.packet.review_revision, 0);
      assert.equal(
        client.state.packet.material.consequence.amount_minor,
        1200000,
      );
      assert.equal(
        client.state.packet.request.predecessor_authority_request_id,
        old.authority_request_id,
      );
      assert.deepEqual(client.state.packet.current.effective_approval_ids, []);
    }
    const reloaded = h.client();
    await reloaded.start();
    assert.deepEqual(reloaded.state.packet, client.state.packet);
    h.assertIntegrity();
  });

test("an unresolved whole-request route does not disable an independently eligible terminal reviewer", async () => {
  const h = browserApiHarness((data) => {
    data.authority_records = data.authority_records.filter(
      (record) => record.authority_class !== "executive_sponsor",
    );
  });
  const client = h.client();
  await client.initialize();
  assert.equal(client.state.packet.current.eligible, false);
  assert.equal(requestBlocked(client.state.packet), false);
  await client.decide("finance", "reject", "Unresolved Executive authority");
  assert.equal(client.state.receipt.result.lifecycle, "rejected");
});

for (const lost of ["network", "malformed success"])
  test(`uncertain ${lost} retains exact bytes and key across reload; retry never adds a second vote`, async () => {
    const h = browserApiHarness(),
      client = h.client();
    await client.initialize();
    if (lost === "network") h.dropNextWrite();
    else h.forgeNextResponse();
    await client.decide("finance", "approve");
    assert.match(client.state.error, /Result unconfirmed/);
    assert.equal(client.state.receipt, null);
    const pending = client.state.pending,
      entries = h.entries.length;
    const reloaded = h.client();
    await reloaded.start();
    assert.deepEqual(reloaded.state.pending, pending);
    await reloaded.retry();
    assert.equal(
      h.calls.filter((call) => call.method === "POST").at(-1).body,
      pending.body,
    );
    assert.equal(
      h.calls.filter((call) => call.method === "POST").at(-1).path,
      pending.path,
    );
    assert.equal(h.entries.length, entries);
    assert.equal(reloaded.state.pending, null);
    assert.equal(reloaded.state.receipt.review_revision, 1);
    h.assertIntegrity();
  });

test("reasons, replacement proposals, altered responses and saved navigation cannot grant authority", async () => {
  const h = browserApiHarness(),
    client = h.client();
  await client.initialize();
  const packet = client.state.packet;
  assert.throws(
    () =>
      decisionCommand(packet, "finance", "reject", "", undefined, "invalid"),
    /reason/,
  );
  assert.throws(
    () =>
      decisionCommand(
        packet,
        "finance",
        "modify",
        "change",
        "credit_15000",
        "invalid",
      ),
    /different/,
  );
  h.storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      requestId: packet.authority_request_id,
      pending: null,
      packet: { current: { authorized: true } },
    }),
  );
  const reloaded = h.client();
  await reloaded.start();
  assert.equal(reloaded.state.packet.current.authorized, false);
  h.advance(3600000);
  await client.decide("finance", "approve");
  assert.match(client.state.error, /expired/);
  await client.refresh();
  assert.equal(requestBlocked(client.state.packet), true);
});

test("confirmed receipt survives a failed follow-up read without offering a write retry", async () => {
  const { createReviewClient } = await import(clientUrl);
  const h = browserApiHarness();
  let failRead = false;
  const client = createReviewClient({
    storage: h.storage,
    nextKey: () => "confirmed-read-failure",
    fetcher: async (path, options) => {
      if (failRead && options.method === "GET" && path.endsWith("/packet"))
        throw new Error("read unavailable");
      return h.fetcher(path, options);
    },
  });
  await client.initialize();
  failRead = true;
  await client.decide("finance", "approve");
  assert.equal(client.state.receipt.review_revision, 1);
  assert.equal(client.state.pending, null);
  assert.equal(client.state.needsRefresh, true);
  assert.equal(client.state.packet.review_revision, 0);
  assert.match(
    client.state.error,
    /recorded.*current review could not be refreshed/i,
  );
  const count = h.calls.filter((call) => call.method === "POST").length;
  failRead = false;
  await client.refresh();
  assert.equal(client.state.packet.review_revision, 1);
  assert.equal(h.calls.filter((call) => call.method === "POST").length, count);
});

test("post-write refresh exposes an intervening Case change instead of historical authorization", async () => {
  const { createReviewClient } = await import(clientUrl);
  const h = browserApiHarness();
  let change = false;
  const client = createReviewClient({
    storage: h.storage,
    nextKey: (() => {
      let key = 0;
      return () => `case-race-${++key}`;
    })(),
    fetcher: async (path, options) => {
      const response = await h.fetcher(path, options);
      if (change && options.method === "POST") {
        change = false;
        h.caseCommand({
          type: "case.attach_work_event",
          tenant_id: TENANT,
          case_id: CASE_ID,
          expected_case_version: 1,
          actor_identity_id: "identity_d6_operator",
          idempotency_key: "other:between",
          correlation_id: "other",
          work_event: DEMO_UPDATE,
        });
      }
      return response;
    },
  });
  await client.initialize();
  await client.decide("finance", "approve");
  change = true;
  await client.decide("executive", "approve");
  assert.equal(client.state.receipt.review_revision, 2);
  assert.equal(client.state.receipt.result.authorized, true);
  assert.equal(client.state.packet.case_version, 2);
  assert.equal(client.state.packet.current.authorized, false);
  assert.deepEqual(client.state.packet.current.effective_approval_ids, []);
  assert.ok(client.state.packet.current.reason_codes.includes("stale_case"));
});

test("operator progress follows current server requirements in either reviewer ordering and hides historical authority", async () => {
  const { reviewProgress } =
    await import("../apps/admin/public/authority-workbench.js");
  for (const [first, second] of [
    ["finance", "executive"],
    ["executive", "finance"],
  ]) {
    const h = browserApiHarness(),
      client = h.client();
    await client.initialize();
    assert.equal(reviewProgress(client.state).heading, "Awaiting review");
    await client.decide(first, "approve");
    assert.match(
      reviewProgress(client.state).heading,
      new RegExp(`${first} approved.*${second} needed`, "i"),
    );
    assert.match(
      reviewProgress({ ...client.state, pending: {} }).heading,
      /unconfirmed/,
    );
    await client.decide(second, "approve");
    assert.equal(
      reviewProgress(client.state).heading,
      "Approvals complete; credit not recorded",
    );
    await client.attachEvidence();
    assert.equal(
      reviewProgress(client.state).heading,
      "Case changed — fresh review needed",
    );
    await client.freshRequest();
    assert.equal(reviewProgress(client.state).heading, "Awaiting review");
    await client.decide(first, "reject", "Review is incomplete.");
    assert.equal(reviewProgress(client.state).heading, "Request rejected");
  }
});
