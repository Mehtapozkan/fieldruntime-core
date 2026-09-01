import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha256Json } from "../dist/packages/contracts/src/index.js";
import {
  authorityExceptionForModel,
  buildWorkbenchModel,
  createInitialWorkbenchState,
  deriveWorkbenchView,
  EXPECTED_FIXTURE_ID,
  EXPECTED_WALKTHROUGH_ID,
  fetchJson,
  optionPresentation,
  reduceWorkbenchState,
  WORKBENCH_EVENTS,
} from "../apps/admin/public/workbench.js";

const fixture = JSON.parse(
  await readFile(
    new URL(
      "../packages/ecc-pack/fixtures/acme-sso-needs-review.case.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const walkthrough = JSON.parse(
  await readFile(
    new URL(
      "../packages/ecc-pack/fixtures/acme-sso-guided-walkthrough.v0.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const fixtureHash = sha256Json(fixture);

function fixtureResponse(overrides = {}) {
  return {
    fixture_id: EXPECTED_FIXTURE_ID,
    fixture_hash: fixtureHash,
    tenant_id: "tenant_orchid",
    case_id: EXPECTED_FIXTURE_ID,
    authoritative: false,
    replayable: false,
    document: structuredClone(fixture),
    ...overrides,
  };
}

function walkthroughResponse(overrides = {}) {
  return {
    walkthrough_id: EXPECTED_WALKTHROUGH_ID,
    walkthrough_hash: sha256Json(walkthrough),
    fixture_id: EXPECTED_FIXTURE_ID,
    fixture_hash: fixtureHash,
    authoritative: false,
    replayable: false,
    production_receipt: false,
    document: structuredClone(walkthrough),
    ...overrides,
  };
}

test("the guided reducer reaches the receipt in six gated interactions", () => {
  let state = createInitialWorkbenchState();
  assert.equal(deriveWorkbenchView(state).interactionCount, 0);

  const journey = [
    WORKBENCH_EVENTS.VIEW_DECISION,
    WORKBENCH_EVENTS.REVEAL_AUTHORITY,
    WORKBENCH_EVENTS.OPEN_ACT_VERIFY,
    WORKBENCH_EVENTS.START_SIMULATION,
    WORKBENCH_EVENTS.CONNECTOR_REPORTED_SUCCESS,
    WORKBENCH_EVENTS.INDEPENDENT_READBACK_MISMATCH,
    WORKBENCH_EVENTS.OPEN_RECOVERY,
    WORKBENCH_EVENTS.OPEN_RECEIPT,
  ];
  for (const type of journey) {
    state = reduceWorkbenchState(state, { type });
  }

  const view = deriveWorkbenchView(state);
  assert.equal(state.activeStep, "receipt");
  assert.equal(view.interactionCount, 6);
  assert.ok(view.interactionCount <= 7);
  assert.equal(
    view.stages.every((stage) => stage.available),
    true,
  );
  assert.equal(Object.isFrozen(state), true);
});

test("authority, verification, recovery, and navigation cannot be bypassed", () => {
  const initial = createInitialWorkbenchState();
  assert.equal(
    reduceWorkbenchState(initial, {
      type: WORKBENCH_EVENTS.OPEN_ACT_VERIFY,
    }),
    initial,
  );

  const decision = reduceWorkbenchState(initial, {
    type: WORKBENCH_EVENTS.VIEW_DECISION,
  });
  assert.equal(
    reduceWorkbenchState(decision, {
      type: WORKBENCH_EVENTS.OPEN_ACT_VERIFY,
    }),
    decision,
  );

  const act = reduceWorkbenchState(
    reduceWorkbenchState(decision, {
      type: WORKBENCH_EVENTS.REVEAL_AUTHORITY,
    }),
    { type: WORKBENCH_EVENTS.OPEN_ACT_VERIFY },
  );
  assert.equal(
    reduceWorkbenchState(act, { type: WORKBENCH_EVENTS.OPEN_RECEIPT }),
    act,
  );
  assert.equal(
    reduceWorkbenchState(act, {
      type: WORKBENCH_EVENTS.NAVIGATE,
      step: "receipt",
    }),
    act,
  );
});

test("the browser model is bound to the complete Acme guided story", () => {
  const model = buildWorkbenchModel(fixtureResponse(), walkthroughResponse());

  assert.equal(model.fixtureId, EXPECTED_FIXTURE_ID);
  assert.equal(model.sources.length, 4);
  assert.deepEqual(
    model.sources.map(({ source }) => source),
    [
      "fixture_slack",
      "fixture_linear",
      "fixture_crm",
      "fixture_policy_registry",
    ],
  );
  const policySource = model.sources.find(
    ({ source }) => source === "fixture_policy_registry",
  );
  assert.ok(policySource);
  assert.equal(policySource.version, "v3");
  assert.equal(policySource.freshness, "current");
  assert.equal(model.conflict.claim, "fix shipped");
  assert.match(model.conflict.sourceState, /not deployed/);
  assert.equal(model.options.length, 3);
  assert.deepEqual(model.options[2].approvals, [
    "Finance / Commercial Approver",
    "Executive Sponsor",
  ]);
  assert.equal(model.guide.receiptTrace.length, 9);
  assert.equal(
    model.guide.receiptTrace.some(({ kind }) => kind === "effect_rejection"),
    true,
  );
  assert.equal(
    model.guide.receiptTrace.some(({ kind }) => kind === "closure_denial"),
    false,
  );
  assert.match(model.guide.verificationMessage, /read-back|source state/i);
  assert.match(model.guide.recoveryMessage, /attempt lineage/i);
  assert.equal(Object.isFrozen(model), true);
});

test("financial presentation and authority follow the payload and action type", () => {
  assert.equal(
    optionPresentation({
      type: "financial_remedy",
      payload: { amount: 20_000, currency: "USD" },
    }).title,
    "Offer $20,000 credit",
  );

  const authorityException = authorityExceptionForModel({
    options: [
      {
        type: "customer_communication",
        risk: "critical",
        approvals: ["Business Approver"],
      },
      {
        type: "financial_remedy",
        risk: "high",
        approvals: ["Finance Approver", "Executive Sponsor"],
      },
    ],
  });
  assert.equal(authorityException.type, "financial_remedy");
  assert.deepEqual(authorityException.approvals, [
    "Finance Approver",
    "Executive Sponsor",
  ]);
});

test("the browser model fails closed on fixture or walkthrough drift", () => {
  assert.throws(
    () => buildWorkbenchModel(fixtureResponse(), undefined),
    /Walkthrough response/,
  );

  assert.throws(
    () =>
      buildWorkbenchModel(
        fixtureResponse({ authoritative: true }),
        walkthroughResponse(),
      ),
    /non-authoritative/,
  );

  assert.throws(
    () =>
      buildWorkbenchModel(
        fixtureResponse(),
        walkthroughResponse({ fixture_hash: `sha256:${"f".repeat(64)}` }),
      ),
    /does not match the fixture/,
  );

  assert.throws(
    () =>
      buildWorkbenchModel(
        fixtureResponse(),
        walkthroughResponse({ production_receipt: true }),
      ),
    /not a production receipt/,
  );

  const unsafe = walkthroughResponse();
  unsafe.document.safety.external_writes = true;
  assert.throws(
    () => buildWorkbenchModel(fixtureResponse(), unsafe),
    /safety boundary/,
  );
});

test("a stalled same-origin read times out instead of leaving the workbench loading", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_endpoint, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new globalThis.DOMException("aborted", "AbortError")),
        { once: true },
      );
    });

  try {
    await assert.rejects(
      fetchJson("/v0/evaluation-fixtures/ecc/case_acme_sso_001", 1),
      /did not respond in time/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("the static workbench is direct-to-case, local-only, and accessibly structured", async () => {
  const [html, css, javascript] = await Promise.all([
    readFile(
      new URL("../apps/admin/public/index.html", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../apps/admin/public/workbench.css", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../apps/admin/public/workbench.js", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(html, /<main\b/);
  assert.match(html, /<nav[^>]+aria-label=/);
  assert.match(html, /href="#stage-content"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="announcement"[\s\S]+role="status"/);
  assert.doesNotMatch(html, /id="stage-content"[^>]+aria-live=/);
  assert.match(html, /Synthetic/);
  assert.match(html, /Guided simulation/);
  assert.match(html, /External writes off/);
  assert.doesNotMatch(html, /<form\b|<input\b|<textarea\b|<select\b/);
  assert.doesNotMatch(html, /<script(?![^>]+src=)|<style\b/);
  assert.doesNotMatch(`${html}\n${css}\n${javascript}`, /https?:\/\//i);

  assert.match(javascript, /method:\s*"GET"/);
  assert.doesNotMatch(javascript, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.match(javascript, /\/v0\/evaluation-fixtures\/ecc\//);
  assert.match(javascript, /\/v0\/evaluation-walkthroughs\/ecc\//);
  assert.match(
    javascript,
    /Connector said success\. The customer record did not change\./,
  );
  assert.match(
    javascript,
    /Field Runtime caught the gap between ‘sent’ and done\./,
  );
  assert.match(javascript, /Effect acceptance gate/);
  assert.match(javascript, /Effect rejected · case open/);
  assert.match(javascript, /declared payload hash/);
  assert.doesNotMatch(javascript, /policy version, and idempotency key fixed/);
  assert.doesNotMatch(
    javascript,
    /"Business Approver"|"Finance \+ Executive"|Policy v3 active/,
  );
  assert.doesNotMatch(javascript, /role:\s*"status"/);
  assert.match(
    javascript,
    /dispatch\(\{ type: WORKBENCH_EVENTS\.START_SIMULATION \}\);/,
  );
  assert.match(
    javascript,
    /querySelector\([\s\S]+WORKBENCH_EVENTS\.OPEN_RECOVERY[\s\S]+\.focus\(\{ preventScroll: true \}\)/,
  );
  assert.match(javascript, /Not eligible until the exact required role passes/);
  assert.doesNotMatch(javascript, /Closure was refused|Case held open/);
  for (const headingId of [
    "case-stage-heading",
    "decision-stage-heading",
    "act-stage-heading",
    "receipt-stage-heading",
  ]) {
    assert.match(javascript, new RegExp(headingId));
  }

  assert.match(css, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(css, /min-width:\s*450px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.ok(contrast("#15201d", "#f5f3ed") >= 7);
  assert.ok(contrast("#e5ede9", "#0d211b") >= 7);
  assert.ok(contrast("#123d32", "#d6f25a") >= 7);
  assert.ok(contrast("#53605b", "#d9eee5") >= 4.5);
  assert.ok(contrast("#53605b", "#fbe7df") >= 4.5);
});
