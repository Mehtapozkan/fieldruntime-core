import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { intakeHost } from "./intake-postgres.mjs";
import {
  queueInput,
  continuation,
  start,
  review,
  POST,
} from "./preparation-continuation.mjs";
import { syntheticContinuationContext } from "../../dist/packages/runtime/src/preparation-work.js";
import {
  sha256Json,
  canonicalJson,
} from "../../dist/packages/contracts/src/index.js";
export const ROOT = "/v1/intake/dispute-results",
  COMMAND = ROOT + "/commands";
export const sourceFixture = () =>
  readFile(
    new URL(
      "../../packages/runtime/fixtures/dispute-result-source.v1.json",
      import.meta.url,
    ),
    "utf8",
  ).then(JSON.parse);
export async function resultHost(
  t,
  { prepare = false, beforeResult = false, input } = {},
) {
  let h, first, second, workBefore, flow;
  if (prepare) {
    flow = await continuation(t);
    h = flow.h;
    h.setWorkContext(syntheticContinuationContext());
    await flow.supply();
    await h.ok(POST, start(await h.ok(flow.path), "result-second-packet"));
    await h.ok(POST, review(await h.ok(flow.path), "result-second-accept"));
    first = flow.first;
    second = flow.second;
    workBefore = await h.ok(flow.path + "&representation=export");
  } else {
    h = await intakeHost(t, { work: true, beforeResult });
    let v = await h.prepare(input ?? (await queueInput()));
    first = (await h.ok("/v1/intake/commits", await h.selection(v, 0))).receipt;
    v = await h.ok(`/v1/intake/bundles/${v.bundle.id}`);
    second = (
      await h.ok(
        "/v1/intake/commits",
        await h.selection(v, 1, {
          target: {
            mode: "attach",
            case_id: first.case_id,
            expected_case_version: first.case_version,
          },
        }),
      )
    ).receipt;
  }
  h.setTime("2026-09-07T16:06:00.000Z");
  let source = await sourceFixture(),
    ticks = 0;
  h.setResultReader(async () => Buffer.from(canonicalJson(source)));
  const path = `${ROOT}?case_id=${first.case_id}&record_key=${first.record_key}`,
    get = () => h.ok(path),
    commands = [],
    receipts = [];
  const command = async (operation, extra = {}, key) => ({
    schema_version: "dispute-result-command.v1",
    binding: (await get()).binding,
    idempotency_key: key ?? `${operation}-${++ticks}`,
    operation,
    ...extra,
  });
  const send = async (operation, extra = {}, key) => {
    const c = await command(operation, extra, key);
    commands.push(c);
    const response = await h.call(COMMAND, c);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const r = response.data;
    receipts.push(r);
    return r;
  };
  const enroll = async () => send("enroll");
  const candidate = async () => send("candidate");
  const basis = async () =>
    send("basis_check", { candidate_hash: (await get()).candidate_hash });
  const request = async () => {
    const v = await get();
    return send("request_authority", {
      candidate_hash: v.candidate_hash,
      basis_observation_hash: v.basis.basis_observation_hash,
    });
  };
  const decide = async (decision = "approve") => {
    const v = await get();
    return send("review_authority", {
      candidate_hash: v.candidate_hash,
      review: {
        authority_request_id: v.authority.authority_request_id,
        request_binding_hash: v.authority.request_binding_hash,
        expected_review_revision: v.authority.review_revision,
      },
      decision,
      reason:
        "Synthetic Morgan reviewed original delivery and terms; uphold only the exact disputed portion without adjustment",
    });
  };
  const noAction = async () => {
    const v = await get();
    return send("no_action", {
      candidate_hash: v.candidate_hash,
      basis_hash: sha256Json(v.authority.material.basis),
      review: {
        authority_request_id: v.authority.authority_request_id,
        request_binding_hash: v.authority.request_binding_hash,
        expected_review_revision: v.authority.review_revision,
      },
    });
  };
  const authorized = async () => {
    await enroll();
    await candidate();
    const b = await basis();
    assert.equal(
      b.entry.data.comparison.status,
      "match",
      JSON.stringify(b.entry.data.comparison),
    );
    await request();
    await decide();
    return noAction();
  };
  const reported = async () => {
    const v = await get(),
      d = v.history.findLast((e) => e.operation === "no_action");
    return send("report", {
      candidate_hash: v.candidate_hash,
      decision_hash: d.hash,
      claim: {
        source_id: d.data.basis.source.ar.object_id,
        source_version: d.data.basis.source.ar.version + 1,
        occurred_at: "2026-09-07T16:06:00.000Z",
        source_timezone: "UTC",
        evidence_ref: "synthetic://report/dispute-17/disposition",
      },
      reason:
        "Synthetic reporter states the disposition was recorded outside Field Runtime; independent source check remains required",
    });
  };
  const transition = async () => {
    const v = await get(),
      d = v.history.findLast((e) => e.operation === "no_action"),
      prior = structuredClone(source.ar);
    source = {
      ...source,
      revision: source.revision + 1,
      ar: {
        ...prior,
        version: prior.version + 1,
        status: "upheld_no_adjustment",
        active_grounds: [],
        disposed_grounds: ["non_delivery"],
        decision_reference: d.hash,
        prior_version: prior.version,
        prior_hash: sha256Json(prior),
        event_at: "2026-09-07T16:06:00.000Z",
      },
    };
  };
  const check = async () => {
    const v = await get(),
      d = v.history.findLast((e) => e.operation === "no_action");
    return send("result_check", {
      candidate_hash: v.candidate_hash,
      decision_hash: d.hash,
    });
  };
  const accept = async () => {
    const v = await get(),
      d = v.history.findLast((e) => e.operation === "no_action"),
      check = v.history.findLast((e) => e.operation === "result_check");
    return send("accept", {
      candidate_hash: v.candidate_hash,
      decision_hash: d.hash,
      observation_hash: check.hash,
      outcome_hash: sha256Json(check.data.outcome),
      reason:
        "Robin accepts only the synthetic no-adjustment disputed portion, not payment, customer impact or Case closure",
      commitments: [
        {
          id: "commitment_payment_follow_up",
          description: "Obtain payment status for the upheld disputed portion",
          owner_identity_id: "identity_dispute_morgan",
          due_at: "2026-09-08T16:06:00.000Z",
          status: "owned",
          evidence_ref: `dispute-result://${d.hash}/payment-follow-up`,
        },
      ],
    });
  };
  return {
    h,
    first,
    second,
    path,
    get,
    command,
    send,
    enroll,
    candidate,
    basis,
    request,
    decide,
    noAction,
    authorized,
    reported,
    transition,
    check,
    accept,
    commands,
    receipts,
    workBefore,
    flow,
    get source() {
      return source;
    },
    setSource(s) {
      source = structuredClone(s);
    },
  };
}
