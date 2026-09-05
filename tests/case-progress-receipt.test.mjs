import assert from "node:assert/strict";
import test from "node:test";
import * as clientModule from "../apps/admin/public/authority-client.js";
import {
  browserApiHarness,
  memoryStorage,
} from "./helpers/authority-browser-api.mjs";
import { readCredit } from "../dist/packages/runtime/src/simulated-credit.js";
import { sha256Json } from "../dist/packages/runtime/src/canonical-json.js";
const at = new Date("2026-09-06T16:00:00.000Z");

async function reviewed() {
  const h = browserApiHarness(),
    client = h.client();
  await client.initialize();
  await client.decide("finance", "approve");
  await client.decide("executive", "approve");
  const { cases, authority, head } = JSON.parse(h.snapshot());
  const credit = readCredit(
    { cases, authority, heads: [head], credit: { entries: [], sources: [] } },
    at,
    2,
  );
  return {
    h,
    client,
    state: {
      ...client.state,
      catalogRevision: head.revision,
      credit,
      creditNeedsRefresh: false,
    },
  };
}
function receipt(state) {
  assert.equal(
    typeof clientModule.caseReceiptEvidence,
    "function",
    "read-only receipt projection is missing",
  );
  return clientModule.caseReceiptEvidence(state);
}
test("D8-A receipt retains attributed decisions without writes or inferred economics", async () => {
  const { h, state } = await reviewed();
  const before = h.snapshot(),
    bytes = JSON.stringify(state);
  const result = receipt(state);
  assert.equal(result.reconciled, true);
  assert.equal(result.decisions.length, 2);
  assert.ok(
    result.decisions.every(
      (d) => d.applies === true && d.identity.identity_kind === "human",
    ),
  );
  assert.equal(result.latestAttempt, null);
  assert.equal(result.latestCheck, null);
  assert.equal(h.snapshot(), before);
  assert.equal(JSON.stringify(state), bytes);
});
test("D8-A independent Case, catalog and review reads cannot manufacture current applicability", async () => {
  const { state } = await reviewed();
  for (const alter of [
    (s) => s.caseRecord.document.case.version++,
    (s) => (s.caseRecord.journal[0] = null),
    (s) =>
      (s.packet.historical_evaluations[0].inputs.resolution.identities = {}),
    (s) => s.catalogRevision++,
    (s) => s.credit.current.bindings.expected_review_revision++,
    (s) =>
      (s.credit.current.bindings.request_binding_hash = `sha256:${"f".repeat(64)}`),
    (s) => s.credit.current.reason_codes.push("current_authority_required"),
    (s) => (s.needsRefresh = true),
    (s) => (s.creditNeedsRefresh = true),
  ]) {
    const changed = structuredClone(state);
    alter(changed);
    const result = receipt(changed);
    assert.equal(result.reconciled, false);
    assert.ok(result.issues.length > 0);
    assert.ok(result.decisions.every((d) => d.applies === null));
  }
});
test("D8-A receipt uses recorded canonical identity, not an altered approval identity copy", async () => {
  const { state } = await reviewed();
  state.packet.history[1].decision.approver_identity.identity_id =
    "identity_d6_business";
  const result = receipt(state);
  assert.equal(result.reconciled, false);
  assert.ok(result.issues.some((s) => /attribution/i.test(s)));
  assert.equal(result.decisions[0].identity, null);
  assert.equal(result.decisions[0].applies, null);
});

for (const [name, alter] of [
  [
    "journal event type",
    (r) => (r.journal[0].event_type = "case.transition_rejected"),
  ],
  [
    "journal payload",
    (r) => (r.journal[0].payload.document.case.state = "ready"),
  ],
  ["journal timestamp", (r) => (r.journal[0].recorded_at = "invalid-time")],
  ["document projection", (r) => (r.document.case.state = "ready")],
  [
    "document evidence",
    (r) => (r.document.events[0].content_hash = `sha256:${"a".repeat(64)}`),
  ],
  [
    "rehash with false projection anchor",
    (r) => {
      const entry = r.journal.at(-1);
      entry.after_hash = `sha256:${"a".repeat(64)}`;
      delete entry.event_hash;
      entry.event_hash = sha256Json(entry);
    },
  ],
  [
    "rehash with conflicting audit actor",
    (r) => {
      const entry = r.journal.at(-1);
      entry.payload.document.audit_entries[0].actor_identity_id =
        "identity_someone_else";
      delete entry.event_hash;
      entry.event_hash = sha256Json(entry);
    },
  ],
])
  test(`D8-A Case GET ${name} tampering cannot be marked reconciled`, async () => {
    const { h, state } = await reviewed();
    let corrupt = false;
    const c = clientModule.createReviewClient({
      storage: memoryStorage(),
      fetcher: async (path, options) => {
        const response = await h.fetcher(path, options);
        if (!corrupt || !path.endsWith("/cases/case_d6_workbench"))
          return response;
        const body = await response.json();
        alter(body);
        return new globalThis.Response(JSON.stringify(body), {
          status: response.status,
          headers: response.headers,
        });
      },
    });
    await c.start(state.requestId);
    const clean = c.state.caseRecord,
      before = h.snapshot();
    corrupt = true;
    await c.refresh();
    const result = receipt({
      ...c.state,
      credit: state.credit,
      creditNeedsRefresh: false,
    });
    assert.equal(
      result.reconciled,
      false,
      "altered Case evidence was labelled reconciled",
    );
    assert.equal(c.state.needsRefresh, true);
    assert.match(c.state.error, /Case evidence failed/);
    assert.deepEqual(
      c.state.caseRecord,
      clean,
      "retain the previous validated read",
    );
    assert.deepEqual(
      h.snapshot(),
      before,
      "validation and failed reads create nothing",
    );
  });
