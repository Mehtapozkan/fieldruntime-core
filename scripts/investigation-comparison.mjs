import { comparisonRequest } from "../dist/packages/runtime/src/investigation-comparison.js";
import {
  workInput,
  validateWorkExport,
} from "../dist/packages/runtime/src/preparation-work.js";
import { investigationMaterial } from "../dist/packages/runtime/src/investigation.js";
// Explicit disposable synthetic rehearsal. Never uses ambient credentials/fetch for inference.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import {
  fixtureManifest,
  fixtureInputs,
  checkFixtureFreeze,
  decodedSources,
} from "./lib/investigation-fixtures.mjs";
import {
  blindedPacket,
  blindLabel,
  comparisonCallPlan,
} from "./lib/investigation-review-export.mjs";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import {
  prepareEvaluationFixture,
  runEvaluationArm,
} from "../tests/helpers/investigation-comparison.mjs";
import { liveComparisonPort } from "../dist/packages/adapters/src/investigation-http.js";
const [mode, destination] = process.argv.slice(2);
if (
  ![
    "--check-fixtures",
    "--plan",
    "--baseline",
    "--bounded-investigation",
    "--generic-assistant",
  ].includes(mode)
)
  throw new Error(
    "Use --check-fixtures, --plan, or --baseline OUTPUT_DIRECTORY. Model arms remain activation-blocked.",
  );
await checkFixtureFreeze();
if (mode === "--check-fixtures")
  console.log(JSON.stringify(await checkFixtureFreeze()));
else if (mode === "--plan")
  console.log(JSON.stringify(comparisonCallPlan(), null, 2));
else if (mode === "--bounded-investigation" || mode === "--generic-assistant")
  liveComparisonPort();
else {
  if (!destination)
    throw new Error("An explicit new output directory is required");
  const out = resolve(destination);
  await mkdir(out);
  await mkdir(resolve(out, "review"));
  await mkdir(resolve(out, "coordinator"));
  const write = (name, value) =>
    writeFile(resolve(out, name), JSON.stringify(value, null, 2) + "\n");
  const seed = randomBytes(32).toString("hex"),
    mapping = [],
    results = [];
  await write("coordinator/call-plan.json", comparisonCallPlan());
  for (const c of fixtureManifest.cases) {
    const cleanup = [];
    let run,
      error = null;
    try {
      const h = await intakeHost(
        { after: (fn) => cleanup.push(fn) },
        { work: true },
      );
      const x = await prepareEvaluationFixture(h, c.id);
      run = await runEvaluationArm(h, x, "deterministic");
      await write(`coordinator/${c.id}-archive.json`, run.archive);
      await write(`coordinator/${c.id}-start.json`, {
        command: run.command,
        receipt: run.receipt,
      });
      await h.restart();
      const reconstructed = await h.ok(x.path + "&representation=export");
      if (reconstructed.hash !== run.archive.hash)
        throw new Error("Restart changed archive");
      const retry = await h.ok(
        "/v1/intake/preparation-work/commands",
        run.command,
      );
      if (JSON.stringify(retry) !== JSON.stringify(run.receipt))
        throw new Error("Retry changed original receipt");
    } catch (e) {
      error = e.message;
    } finally {
      for (const fn of cleanup.reverse()) await fn();
    }
    if (run) {
      const input = workInput(
        validateWorkExport(run.archive),
        run.receipt.entry,
      );
      await write(`coordinator/${c.id}-candidate-requests.json`, {
        status: "planned_not_authorized_or_sent",
        binding_note:
          "Illustrative bindings use the baseline export; a published comparison start recomputes its own exact binding and request hash",
        requests: ["bounded_investigation", "generic_assistant"].map((arm) => ({
          arm,
          request: comparisonRequest({
            ...input,
            binding: {
              ...input.binding,
              worker_implementation_id: "disposition-investigation.v2",
              comparison_arm: arm,
            },
          }),
        })),
      });
    }
    const sources = {
      retained: decodedSources(await fixtureInputs(c.id)),
      permitted: run
        ? investigationMaterial(
            workInput(validateWorkExport(run.archive), run.receipt.entry),
          ).sources
        : null,
    };
    for (const arm of [
      "deterministic",
      "bounded_investigation",
      "generic_assistant",
    ]) {
      const label = blindLabel(seed, c.id, arm);
      mapping.push({ fixture: c.id, arm, label });
      await write(
        `review/${label}.json`,
        blindedPacket(
          c.id,
          arm === "deterministic" ? run?.invocation : null,
          sources,
          label,
        ),
      );
    }
    results.push({
      fixture: c.id,
      status: error
        ? "failed"
        : run?.invocation.result
          ? "prepared_awaiting_review"
          : "failed_or_open",
      error,
      archive_hash: run?.archive.hash ?? null,
      invocation: run?.invocation.invocation_id ?? null,
      result_hash: run?.invocation.result_hash ?? null,
      provider_calls: 0,
      usefulness: "not_reviewed",
    });
    console.log(`${c.id}: ${results.at(-1).status}${error ? " " + error : ""}`);
  }
  await write("coordinator/blinding-key.json", { seed, mapping });
  const summary = {
    schema_version: "comparison-baseline-run.v1",
    synthetic: true,
    fixture_version: "v2",
    deterministic_implementation: "disposition-code.v3",
    model_arms: "not_run",
    provider_calls: 0,
    quality_comparison: "not_run",
    results,
    measures: {
      cash_collected: null,
      disputes_resolved: null,
      credits_issued: null,
      work_newly_attended_to: null,
      human_attention_released: null,
    },
  };
  summary.hash = createHash("sha256")
    .update(JSON.stringify(summary))
    .digest("hex");
  await write("summary.json", summary);
  if (results.some((r) => r.status !== "prepared_awaiting_review"))
    process.exitCode = 1;
}
