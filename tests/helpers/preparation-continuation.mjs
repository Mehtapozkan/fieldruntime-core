import { Buffer } from "node:buffer";
import { intakeHost } from "./intake-postgres.mjs";
import { intakeInput, editQueue } from "./intake.mjs";
import { discoveryPath, reviewPath, discoveryCommand } from "./discovery.mjs";
import { WORK, PACK, publication, start } from "./preparation-work.mjs";
import { syntheticContinuationContext } from "../../dist/packages/runtime/src/preparation-work.js";
export { WORK, PACK, publication, start };
export const POST = `${WORK}/commands`;
export const review = (v, key = "accept", decision = "approve") => ({
  schema_version: v.schema_version.endsWith(".v2")
    ? "preparation-task-review.v2"
    : "preparation-task-review.v1",
  operation: "task_review",
  purpose: "preparation_usefulness",
  invocation_id: v.invocations.at(-1).invocation_id,
  expected_work_revision: v.work_revision,
  expected_work_head: v.work_head,
  result_hash: v.invocations.at(-1).result_hash,
  decision,
  reason:
    "Synthetic packet usefulness only; original delivery proof, owner and terms remain unverified",
  idempotency_key: key,
});
export async function queueInput(key = "continuation-before") {
  const v = editQueue(await intakeInput(key), (rows, headers) => {
    rows[1].legal_entity_id = "entity_north";
    return { rows, headers };
  });
  v.artifacts = v.artifacts.slice(0, 1);
  return v;
}
export function note(
  input,
  key = "continuation-after",
  text = "Delivery confirmation for DEL-4 is supplied.\n",
  association = { entity: "entity_north", kind: "record", id: "dispute-17" },
) {
  const v = structuredClone(input);
  v.idempotency_key = key;
  v.artifacts.push({
    role: "support",
    document_id: key,
    name: `${key}.txt`,
    media_type: "text/plain",
    bytes_base64: Buffer.from(text).toString("base64"),
    declared_hash: null,
    associations: [association],
  });
  return v;
}
export async function continuation(
  t,
  {
    input,
    legacy = true,
    accept = true,
    prepared = true,
    beforeContinuation = false,
  } = {},
) {
  const h = await intakeHost(t, { work: true, beforeContinuation });
  let tick = 0;
  h.setWorkMonotonic(() => ++tick);
  if (!legacy) h.setWorkContext(syntheticContinuationContext());
  input ??= await queueInput();
  let v = await h.prepare(input);
  const first = (
    await h.ok(
      "/v1/intake/commits",
      await h.selection(v, 0, { key: "continue-attach-a" }),
    )
  ).receipt;
  v = await h.ok(`/v1/intake/bundles/${v.bundle.id}`);
  const second = (
    await h.ok(
      "/v1/intake/commits",
      await h.selection(v, 1, {
        key: "continue-attach-b",
        target: {
          mode: "attach",
          case_id: first.case_id,
          expected_case_version: first.case_version,
        },
      }),
    )
  ).receipt;
  const path = `${WORK}?case_id=${first.case_id}&record_key=${first.record_key}`;
  const packPath = (bundle) =>
    `${PACK}?bundle_id=${bundle.bundle.id}&record_key=${first.record_key}&case_id=${first.case_id}`;
  const describe = async (bundle, key) =>
    h.ok(
      reviewPath(bundle),
      discoveryCommand(
        await h.ok(discoveryPath(bundle, first.case_id)),
        key,
        "confirm",
      ),
    );
  await describe(v, "continue-describe-before");
  await h.ok(
    `${PACK}/selections/publication`,
    publication(await h.ok(packPath(v)), "continue-publish-before"),
  );
  const command = prepared
    ? start(await h.ok(path), "continue-start-before")
    : null;
  const receipt = prepared ? await h.ok(POST, command) : null;
  const reviewCommand =
    prepared && accept
      ? review(await h.ok(path), "continue-review-before")
      : null;
  const reviewReceipt = reviewCommand ? await h.ok(POST, reviewCommand) : null;
  const before = await h.ok(path),
    archive = await h.ok(path + "&representation=export");
  async function supply(
    value = note(input),
    { describeFresh = true, publish = true } = {},
  ) {
    h.setTime("2026-09-07T16:06:00.000Z");
    const next = await h.prepare(value);
    const fresh = await h.ok(`/v1/intake/bundles/${next.bundle.id}`);
    const target = fresh.candidates[0].targets.find(
      (x) => x.case_id === first.case_id,
    );
    const selection = await h.selection(fresh, 0, {
      key: `attach-${value.idempotency_key}`,
      target: {
        mode: "attach",
        case_id: first.case_id,
        expected_case_version: target.case_version,
      },
    });
    const attached = await h.ok("/v1/intake/commits", selection);
    if (describeFresh)
      await describe(next, `describe-${value.idempotency_key}`);
    if (publish)
      await h.ok(
        `${PACK}/selections/publication`,
        publication(
          await h.ok(packPath(next)),
          `publish-${value.idempotency_key}`,
        ),
      );
    return {
      v: next,
      selection,
      attached,
      path,
      packPath: packPath(next),
      b: {
        bundle_id: next.bundle.id,
        record_key: first.record_key,
        case_id: first.case_id,
      },
    };
  }
  return {
    h,
    input,
    v,
    first,
    second,
    path,
    packPath,
    describe,
    command,
    receipt,
    reviewCommand,
    reviewReceipt,
    before,
    archive,
    supply,
  };
}
