import { Buffer } from "node:buffer";
import {
  preparedWork,
  PACK,
  WORK,
  publication,
  start,
} from "./preparation-work.mjs";
import { syntheticInvestigationContext } from "../../dist/packages/runtime/src/preparation-work.js";
import { hermeticInvestigationPort } from "../../dist/packages/adapters/src/investigation.js";
export {
  PACK,
  WORK,
  publication,
  start,
  syntheticInvestigationContext,
  hermeticInvestigationPort,
};
export function fakeResponse(request, mutate = (v) => v) {
  const input = JSON.parse(request.input);
  const source =
    input.sources.find((s) => s.kind === "retained_utf8_text") ??
    input.sources[0];
  const subject =
    source.subjects.find((s) => s.kind === "delivery") ?? source.subjects[0];
  const span = {
    source_id: source.id,
    start: 0,
    end: Buffer.byteLength(source.text),
    quote: source.text,
  };
  const proposal = {
    schema_version: "investigation-proposal.v1",
    input_hash: input.input_hash,
    claims: [
      {
        subject,
        interpretation:
          "This source report needs interpretation; original proof remains unconfirmed.",
        spans: [span],
        status: "unreviewed_interpretation",
      },
    ],
    contradictions: [],
    gaps: [
      {
        subject,
        question:
          "Please provide the original proof and its permitted inspection route.",
        why_it_matters:
          "A source report alone leaves the underlying evidence unconfirmed.",
        spans: [span],
        evidence_status: "reported_but_unverified",
      },
    ],
    uncertainties: [
      "The accountable owner and governing terms remain unconfirmed.",
    ],
    follow_up:
      "Please provide original evidence, permitted access, the accountable owner and applicable governing terms.",
    abstention_reasons: [
      "Independent proof and business judgment remain outside preparation.",
    ],
    human_interpretation_review_required: true,
    authority_granted: false,
    independently_verified: false,
    sent: false,
  };
  return JSON.stringify(
    mutate({
      id: "fake-response-only",
      model: "hermetic-model.v1",
      status: "completed",
      output: proposal,
      usage: {
        input_tokens: Buffer.byteLength(request.input),
        output_tokens: 100,
      },
    }),
  );
}
export async function investigation(
  t,
  {
    context = syntheticInvestigationContext(),
    transport = async (request) => fakeResponse(request),
    input,
  } = {},
) {
  const x = await preparedWork(t, input);
  let calls = 0;
  x.h.setWorkContext(context);
  x.h.setWorkPort(
    hermeticInvestigationPort(async (request, signal) => {
      calls++;
      return transport(request, signal);
    }),
  );
  let tick = 0;
  x.h.setWorkMonotonic(() => ++tick);
  const candidate = await x.h.ok(x.packPath);
  if (!candidate.candidate) throw new Error(JSON.stringify(candidate.current));
  await x.h.ok(
    `${PACK}/selections/publication`,
    publication(candidate, "investigation-publication"),
  );
  return {
    ...x,
    context,
    calls: () => calls,
    post: `${WORK}/commands`,
    view: () => x.h.ok(x.path),
    run: async (key = "investigate") =>
      x.h.ok(`${WORK}/commands`, start(await x.h.ok(x.path), key)),
  };
}
