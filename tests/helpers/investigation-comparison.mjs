import { fixedPreparationPort } from "../../dist/packages/runtime/src/preparation-worker-port.js";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { fixtureInputs } from "../../scripts/lib/investigation-fixtures.mjs";
import { discoveryPath, reviewPath, discoveryCommand } from "./discovery.mjs";
import { PACK, WORK, publication, start } from "./preparation-work.mjs";
import {
  syntheticContinuationContext,
  syntheticComparisonContext,
  validateWorkExport,
} from "../../dist/packages/runtime/src/preparation-work.js";
import { mockHttpComparisonPort } from "../../dist/packages/adapters/src/investigation-http.js";
import { fakeResponse } from "./investigation.mjs";
export {
  PACK,
  WORK,
  publication,
  start,
  syntheticComparisonContext,
  mockHttpComparisonPort,
};
export function mockResponse(request, mutate = (x) => x) {
  const old = JSON.parse(
    fakeResponse({ ...request, model: "hermetic-model.v1" }),
  );
  return mutate({
    id: "mock-response",
    object: "response",
    model: request.model,
    status: "completed",
    error: null,
    incomplete_details: null,
    output: [
      {
        id: "mock-message",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(old.output),
            annotations: [],
          },
        ],
      },
    ],
    usage: { input_tokens: 1000, output_tokens: 200, total_tokens: 1200 },
  });
}
export function httpMock(observe = () => {}, mutate = (x) => x) {
  return async (url, init) => {
    observe(url, init);
    const body = JSON.stringify(mockResponse(JSON.parse(init.body), mutate));
    return {
      status: 200,
      redirected: false,
      body: (async function* () {
        yield Buffer.from(body);
      })(),
    };
  };
}
export async function prepareEvaluationFixture(h, id) {
  let v, receipt;
  for (const input of await fixtureInputs(id)) {
    v = await h.prepare(input);
    receipt = (
      await h.ok(
        "/v1/intake/commits",
        await h.selection(v, 0, {
          key: input.idempotency_key + "-commit",
          ...(receipt
            ? {
                target: {
                  mode: "attach",
                  case_id: receipt.case_id,
                  expected_case_version: receipt.case_version,
                },
              }
            : {}),
        }),
      )
    ).receipt;
  }
  const d = { path: discoveryPath(v, receipt.case_id), post: reviewPath(v) };
  await h.ok(
    d.post,
    discoveryCommand(await h.ok(d.path), `${id}-describe`, "confirm"),
  );
  const b = (await h.ok(d.path)).binding;
  return {
    b,
    path: `${WORK}?case_id=${b.case_id}&record_key=${b.record_key}`,
    packPath: `${PACK}?bundle_id=${b.bundle_id}&record_key=${b.record_key}&case_id=${b.case_id}`,
  };
}
export async function runEvaluationArm(
  h,
  x,
  arm,
  {
    http = httpMock(),
    key = `${arm}-start`,
    context,
    port,
    effectiveUntil,
  } = {},
) {
  h.setWorkContext(
    arm === "deterministic"
      ? syntheticContinuationContext()
      : (context ?? syntheticComparisonContext(arm)),
  );
  h.setWorkPort(
    arm === "deterministic"
      ? fixedPreparationPort
      : (port ?? mockHttpComparisonPort(http)),
  );
  const candidate = await h.ok(x.packPath);
  assert.ok(candidate.candidate, JSON.stringify(candidate.current));
  await h.ok(`${PACK}/selections/publication`, {
    ...publication(candidate, `${key}-publish`),
    ...(effectiveUntil ? { effective_until: effectiveUntil } : {}),
  });
  const view = await h.ok(x.path);
  assert.equal(view.current.can_start, true, JSON.stringify(view.current));
  const command = start(view, key),
    receipt = await h.ok(`${WORK}/commands`, command);
  const done = await h.ok(x.path),
    archive = await h.ok(x.path + "&representation=export");
  validateWorkExport(archive);
  return {
    command,
    receipt,
    view: done,
    archive,
    invocation: done.invocations.find(
      (i) => i.invocation_id === receipt.entry.invocation_id,
    ),
  };
}
