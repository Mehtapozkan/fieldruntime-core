// D-038 current reports add read-only resource preflight. V1 stays a retained
// calculation and must be reproduced with its pinned implementation digest.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildReport as legacyReport, summarize } from "./challenge-report.mjs";
import {
  validateWorkExport,
  readWork,
  syntheticContinuationContext,
} from "../../dist/packages/runtime/src/preparation-work.js";
import { sha256Json } from "../../dist/packages/contracts/src/index.js";
export async function buildReport(archive, manifest) {
  assert.equal(manifest.schema_version, "challenge-input.v2");
  const prior = await legacyReport(archive, {
    ...manifest,
    schema_version: "challenge-input.v1",
  });
  const state = validateWorkExport(archive),
    context = syntheticContinuationContext();
  const records = prior.records.map((record) => {
    const views = record.case_ids.map((id) =>
      readWork(
        state,
        id,
        record.record_key,
        manifest.evaluated_at,
        context,
        true,
      ),
    );
    const runs = views.flatMap((v) => v.invocations);
    const attempts = record.attempts.map((a) => {
      const run = runs.find((r) => r.invocation_id === a.invocation_id);
      assert.ok(run, "An invocation is missing from canonical history");
      return {
        ...a,
        current_usable: run.current_usable,
        can_accept: run.can_accept,
        can_interrupt: run.can_interrupt,
        reasons: run.reasons,
      };
    });
    const last = record.case_ids.length === 1 ? attempts.at(-1) : null;
    const startable =
      record.material.length > 0 &&
      views.length === 1 &&
      views[0].current.can_start;
    const resources = views.map((v) => ({
      case_id: v.case_id,
      ...v.resource_preflight,
    }));
    const blocked = resources.some((p) => p.eligible === false);
    return {
      ...record,
      attempts,
      snapshot_can_start: startable,
      snapshot_reasons: views.flatMap((v) => v.current.reasons),
      resource_preflight: resources,
      historical_acceptance_currently_usable_in_snapshot:
        last?.review_decision === "approve" ? last.current_usable : false,
      next_action: blocked
        ? "Preparation exceeds the retained-input boundary. Inspect the complete sources and continue manually; no evidence can be omitted to fit."
        : last?.can_accept
          ? "Inspect this packet and record a separate task-usefulness decision."
          : startable
            ? "Inspect current live inputs and explicitly prepare a fresh packet if useful."
            : record.next_action,
    };
  });
  const body = { ...prior };
  delete body.hash;
  const report = {
    ...body,
    schema_version: "challenge-report.v2",
    manifest,
    records,
    summary: summarize(records, prior.summary.unidentified_source_rows),
    implementation: {
      ...prior.implementation,
      rules: "challenge-report.v2",
      profile_hash: sha256Json(context),
      resource_preflight: "preparation-work-read.v2",
      calculation_hash: `sha256:${createHash("sha256")
        .update(await readFile(new URL(import.meta.url)))
        .digest("hex")}`,
    },
  };
  return { ...report, hash: sha256Json(report) };
}
