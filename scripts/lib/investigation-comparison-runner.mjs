import { fixtureManifest } from "./investigation-fixtures.mjs";
// Fixed three-arm evaluation sequence over an injected, durable runtime/API host.
// The caller owns persistence/custody. This module creates no ledger or database.
import { discoveryCommand } from "../../tests/helpers/discovery.mjs";
import {
  runEvaluationArm,
  WORK,
  syntheticComparisonContext,
} from "../../tests/helpers/investigation-comparison.mjs";
import {
  syntheticContinuationContext,
  validateWorkExport,
} from "../../dist/packages/runtime/src/preparation-work.js";
export async function runThreeArmComparison(
  h,
  targets,
  {
    http,
    onResult = async () => {},
    modelOnly = false,
    contextForArm = syntheticComparisonContext,
    port,
    effectiveUntil,
  } = {},
) {
  const results = [];
  for (const { id, ...x } of targets)
    for (const arm of [
      ...(modelOnly ? [] : ["deterministic"]),
      "bounded_investigation",
      "generic_assistant",
    ]) {
      const key = `comparison-v2-${id}-${arm}`;
      h.setWorkContext(
        arm === "deterministic"
          ? syntheticContinuationContext()
          : contextForArm(arm),
      );
      try {
        const fixture = fixtureManifest.cases.find((c) => c.id === id);
        const retained = await h.ok(`/v1/intake/bundles/${x.b.bundle_id}`);
        const record = retained.bundle.records.find(
          (r) => r.record_key === x.b.record_key,
        );
        if (
          !fixture ||
          record?.source_record_id !== fixture.selected_record ||
          record?.entity !== fixture.entity
        )
          throw new Error(
            "Comparison target/fixture attribution differs; no call is permitted",
          );
        const view = await h.ok(x.path),
          previous = view.history.find(
            (e) => e.event === "started" && e.command?.idempotency_key === key,
          );
        let run;
        if (previous) {
          if (
            modelOnly &&
            previous.worker_profile.implementation_id !==
              "disposition-investigation.v3"
          )
            throw new Error(
              "Historical mock receipt cannot stand in for a live comparison",
            );
          const receipt = await h.ok(WORK + "/commands", previous.command),
            current = await h.ok(x.path);
          run = {
            command: previous.command,
            receipt,
            view: current,
            archive: await h.ok(x.path + "&representation=export"),
            invocation: current.invocations.find(
              (i) => i.invocation_id === receipt.entry.invocation_id,
            ),
          };
        } else {
          const path = `/v1/intake/bundles/${x.b.bundle_id}/discovery?record_key=${x.b.record_key}&case_id=${x.b.case_id}`;
          const brief = await h.ok(path);
          // Reuse applicable review when possible; changed global inputs require fresh
          // descriptive consent before the explicitly planned publication/start.
          if (
            !brief.current.confirmed_purposes.includes("discovery_description")
          ) {
            // The canonical confirmation operation is idempotent under this original key.
            const review = discoveryCommand(
              brief,
              `${key}-description`,
              "confirm",
            );
            await h.ok(
              `/v1/intake/bundles/${x.b.bundle_id}/discovery-reviews`,
              review,
            );
          }
          run = await runEvaluationArm(h, x, arm, {
            http,
            key,
            context: arm === "deterministic" ? undefined : contextForArm(arm),
            port,
            effectiveUntil,
          });
        }
        validateWorkExport(run.archive);
        if (!run.invocation)
          throw new Error(
            "The receipt's invocation is unavailable; inspect before continuing.",
          );
        const result = {
          fixture: id,
          arm,
          key,
          status: run.invocation.result
            ? "output_available"
            : run.invocation.terminal_entry_hash
              ? "failed"
              : "open",
          outcome: run.invocation.outcome,
          run,
        };
        results.push(result);
      } catch (error) {
        const result = {
          fixture: id,
          arm,
          key,
          status: "submission_or_preflight_failed",
          error: error.message,
          run: null,
        };
        results.push(result);
        await onResult(result);
        return {
          status: "stopped_for_inspection",
          results,
          remaining: "not_run; no automatic retry",
        };
      }
      await onResult(results.at(-1));
    }
  return { status: "completed_for_review", results };
}
