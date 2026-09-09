import { intakeHost } from "./intake-postgres.mjs";
import {
  preparedDiscovery,
  discoveryCommand,
  discoveryPath,
  reviewPath,
  scopedDeliveries,
} from "./discovery.mjs";
export const WORK = "/v1/intake/preparation-work";
export const PACK =
  "/v1/intake/preparation-packs/pack_synthetic_invoice_dispute_north";
export async function preparedWork(t, input) {
  const h = await intakeHost(t, { work: true }),
    d = await preparedDiscovery(h, input);
  await h.ok(
    d.post,
    discoveryCommand(await d.get(), "worker-description", "confirm"),
  );
  const brief = await d.get(),
    b = brief.binding;
  const packPath = `${PACK}?bundle_id=${b.bundle_id}&record_key=${b.record_key}&case_id=${b.case_id}`;
  const path = `${WORK}?case_id=${b.case_id}&record_key=${b.record_key}`;
  return { h, d, b, path, packPath };
}
export const publication = (v, key = "publish-worker") => ({
  schema_version: "pack-selection-command.v2",
  operation: "publish",
  pack_id: v.pack_id,
  expected_selection_revision: v.selection_revision,
  expected_selection_head: v.selection_head,
  expected_publication_profile_hash: v.publication_profile_hash,
  artifact_hash: v.candidate_hash,
  expected_basis: v.candidate.binding,
  effective_until: "2026-09-07T17:00:00.000Z",
  effective_until_source_timezone: "UTC",
  reason: "Publish bounded synthetic preparation only",
  idempotency_key: key,
});
export const start = (v, key = "start-worker") => ({
  schema_version: "preparation-work-command.v1",
  operation: "start",
  binding: v.candidate_binding,
  expected_work_revision: v.work_revision,
  expected_work_head: v.work_head,
  replaces_invocation:
    v.history.filter((entry) => entry.event === "started").at(-1)
      ?.invocation_id ?? null,
  idempotency_key: key,
});

// Two separately identified North records explicitly committed to one Case.
// Complete both attachments before review: attachment changes C, never consent.
export async function sharedCaseWork(t) {
  const h = await intakeHost(t, { work: true });
  let v = await h.prepare(
    await scopedDeliveries("shared-case-work", "distinct-records"),
  );
  const first = (
    await h.ok(
      "/v1/intake/commits",
      await h.selection(v, 0, {
        target: { mode: "create", expected_case_version: 0 },
        key: "attach-a",
      }),
    )
  ).receipt;
  v = await h.ok(`/v1/intake/bundles/${v.bundle.id}`);
  await h.ok(
    "/v1/intake/commits",
    await h.selection(v, 1, {
      target: {
        mode: "attach",
        case_id: first.case_id,
        expected_case_version: first.case_version,
      },
      key: "attach-b",
    }),
  );
  const records = [];
  for (const index of [0, 1]) {
    const d = {
      path: discoveryPath(v, first.case_id, index),
      post: reviewPath(v),
    };
    d.get = () => h.ok(d.path);
    await h.ok(
      d.post,
      discoveryCommand(await d.get(), `describe-${index}`, "confirm"),
    );
    const b = (await d.get()).binding;
    records.push({
      d,
      b,
      path: `${WORK}?case_id=${b.case_id}&record_key=${b.record_key}`,
      packPath: `${PACK}?bundle_id=${b.bundle_id}&record_key=${b.record_key}&case_id=${b.case_id}`,
    });
  }
  return { h, ...records[0], records };
}
