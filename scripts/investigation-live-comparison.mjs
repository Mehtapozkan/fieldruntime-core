// Explicit synthetic coordinator. No normal-appliance or environment auto-activation.
import {
  readFile,
  writeFile,
  mkdir,
  access,
  readdir,
  open,
} from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  validateActivation,
  createLiveComparisonPort,
  assertCountedContinuation,
} from "../dist/packages/adapters/src/investigation-live.js";
import {
  sha256Json,
  canonicalJson,
} from "../dist/packages/contracts/src/index.js";
import {
  syntheticLiveComparisonContext,
  validateWorkExport,
  workInput,
} from "../dist/packages/runtime/src/preparation-work.js";
import { comparisonFixture } from "../dist/packages/runtime/src/investigation-comparison.js";
import { investigationMaterial } from "../dist/packages/runtime/src/investigation.js";
import {
  fixtureManifest,
  fixtureInputs,
  decodedSources,
  checkFixtureFreeze,
} from "./lib/investigation-fixtures.mjs";
import {
  blindedPacket,
  blindLabel,
} from "./lib/investigation-review-export.mjs";
import { runThreeArmComparison } from "./lib/investigation-comparison-runner.mjs";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import {
  prepareEvaluationFixture,
  WORK,
} from "../tests/helpers/investigation-comparison.mjs";
const [mode, configPath, credentialPath, baselinePath, outputPath] =
  process.argv.slice(2);
if (
  mode !== "--execute-confirmed" ||
  ![configPath, credentialPath, baselinePath, outputPath].every(
    (p) => p && isAbsolute(p),
  )
)
  throw new Error(
    "Use --execute-confirmed ABSOLUTE_CONFIG ABSOLUTE_SECRET_FILE ABSOLUTE_EXISTING_BASELINE ABSOLUTE_ISOLATED_OUTPUT. No credential has been read.",
  );
const config = validateActivation(
  JSON.parse(await readFile(configPath, "utf8")),
);
if (config.schema_version !== "comparison-activation.v2")
  throw new Error(
    "The approved count connection and confirmed counting prerequisites are required; no credential read.",
  );
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (
  head !== config.validated_head ||
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
)
  throw new Error(
    "Use the clean, final validated activation head; no provider request sent.",
  );
await checkFixtureFreeze();
const database = process.env.D040_POSTGRES_URL;
if (
  !database ||
  new URL(database).pathname !== "/fieldruntime_d040_v2" ||
  !["127.0.0.1", "localhost"].includes(new URL(database).hostname) ||
  new URL(database).search
)
  throw new Error(
    "The approved isolated loopback database fieldruntime_d040_v2 is required; never use an evaluator database.",
  );
const baselineSummary = JSON.parse(
  await readFile(resolve(baselinePath, "summary.json"), "utf8"),
);
if (
  baselineSummary.provider_calls !== 0 ||
  baselineSummary.results.length !== 24 ||
  baselineSummary.deterministic_implementation !== "disposition-code.v3"
)
  throw new Error("Preserve the existing 24-case deterministic baseline.");
const baseline = new Map();
for (const c of fixtureManifest.cases) {
  const archive = JSON.parse(
    await readFile(
      resolve(baselinePath, `coordinator/${c.id}-archive.json`),
      "utf8",
    ),
  );
  const state = validateWorkExport(archive),
    retained = JSON.parse(
      await readFile(
        resolve(baselinePath, `coordinator/${c.id}-start.json`),
        "utf8",
      ),
    );
  if (
    archive.hash !==
    baselineSummary.results.find((r) => r.fixture === c.id)?.archive_hash
  )
    throw new Error("Baseline reference changed");
  const start = state.entries.find(
    (e) => e.event === "started" && e.hash === retained.receipt.entry.hash,
  );
  const terminal = state.entries.find(
    (e) =>
      e.invocation_id === start?.invocation_id && e.event === "terminal_result",
  );
  if (!start || !terminal?.result)
    throw new Error(
      "Baseline output unavailable; do not replace it with a new run",
    );
  if (
    comparisonFixture(workInput(state, start)) !== c.id ||
    start.worker_profile.implementation_id !== "disposition-code.v3"
  )
    throw new Error("Baseline fixture/worker attribution differs");
  baseline.set(c.id, {
    invocation: {
      result: terminal.result,
      outcome: terminal.outcome,
      terminal_entry_hash: terminal.hash,
    },
    sources: {
      retained: decodedSources(await fixtureInputs(c.id)),
      permitted: investigationMaterial(workInput(state, start)).sources,
    },
  });
}
const out = resolve(outputPath);
await mkdir(out, { recursive: true, mode: 0o700 });
await mkdir(resolve(out, "coordinator"), { recursive: true, mode: 0o700 });
await mkdir(resolve(out, "review"), { recursive: true, mode: 0o700 });
const save = (name, value) =>
  writeFile(resolve(out, name), JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
const identity = {
  activation_hash: sha256Json(config),
  database: "fieldruntime_d040_v2/d040_live_comparison_v2",
  baseline_hash: baselineSummary.hash,
  validated_head: head,
};
try {
  await writeFile(
    resolve(out, "coordinator/binding.json"),
    JSON.stringify(identity),
    { flag: "wx", mode: 0o600 },
  );
} catch (e) {
  if (e.code !== "EEXIST") throw e;
  if (
    canonicalJson(
      JSON.parse(
        await readFile(resolve(out, "coordinator/binding.json"), "utf8"),
      ),
    ) !== canonicalJson(identity)
  )
    throw new Error(
      "Existing comparison binding differs; no reset/replacement run is approved",
      { cause: e },
    );
}
// Retain the exact non-secret prerequisites beside the coordinator evidence.
// The secret file contents/path never enter this export.
try {
  await writeFile(
    resolve(out, "coordinator/activation.json"),
    canonicalJson(config),
    {
      flag: "wx",
      mode: 0o600,
    },
  );
} catch (e) {
  if (e.code !== "EEXIST") throw e;
  if (
    canonicalJson(
      JSON.parse(
        await readFile(resolve(out, "coordinator/activation.json"), "utf8"),
      ),
    ) !== canonicalJson(config)
  )
    throw new Error(
      "Retained activation record changed; inspect before recovery",
      { cause: e },
    );
}
let seed;
try {
  seed = await readFile(resolve(out, "coordinator/blinding-seed"), "utf8");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  seed = randomBytes(32).toString("hex");
  await writeFile(resolve(out, "coordinator/blinding-seed"), seed, {
    flag: "wx",
    mode: 0o600,
  });
}
const mapping = fixtureManifest.cases.flatMap((c) =>
    ["deterministic", "bounded_investigation", "generic_assistant"].map(
      (arm) => ({ fixture: c.id, arm, label: blindLabel(seed, c.id, arm) }),
    ),
  ),
  results = new Map();
for (const name of await readdir(resolve(out, "review"))) {
  if (!name.endsWith(".json")) continue;
  const prior = JSON.parse(
    await readFile(resolve(out, "review", name), "utf8"),
  );
  if (
    [prior.review, prior.effort, prior.costs].some(
      (fields) => fields && Object.values(fields).some((v) => v !== null),
    )
  )
    throw new Error(
      "Human review/effort exists; preserve it. Automatic regeneration is not permitted.",
    );
}
for (const c of fixtureManifest.cases)
  for (const arm of ["bounded_investigation", "generic_assistant"]) {
    try {
      const prior = JSON.parse(
        await readFile(resolve(out, `coordinator/${c.id}-${arm}.json`), "utf8"),
      );
      if (prior.run) {
        const state = validateWorkExport(prior.run.archive),
          start = state.entries.find(
            (e) => e.hash === prior.run.receipt.entry.hash,
          );
        if (
          !start ||
          comparisonFixture(workInput(state, start)) !== c.id ||
          start.reservation.arm !== arm
        )
          throw new Error("Retained comparison attribution changed");
      }
      results.set(`${c.id}/${arm}`, prior);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
const render = async () => {
  for (const c of fixtureManifest.cases)
    for (const arm of [
      "deterministic",
      "bounded_investigation",
      "generic_assistant",
    ]) {
      const label = blindLabel(seed, c.id, arm);

      const b = baseline.get(c.id),
        result = results.get(`${c.id}/${arm}`);
      await save(
        `review/${label}.json`,
        blindedPacket(
          c.id,
          arm === "deterministic" ? b.invocation : result?.run?.invocation,
          b.sources,
          label,
        ),
      );
    }
  await save("coordinator/blinding-key.json", {
    combined_custodian_reviewer: true,
    custodian: config.custodian,
    reviewer: config.reviewer,
    limitation:
      "Producer labels concealed during scoring; combined roles and output style limit independence. Do not inspect this mapping before completing blinded scores.",
    mapping,
  });
};
// The lock is operational fencing, not an authority/budget ledger. A crash leaves
// it for explicit inspection; never remove it automatically or restart a send.
const lock = resolve(out, "coordinator/RUNNING");
await writeFile(
  lock,
  "Explicit coordinator session; inspect original journal before manual recovery.\n",
  { flag: "wx", mode: 0o600 },
);
const cleanup = [];
process.env.D9_POSTGRES_URL = database;
const h = await intakeHost(
  { after: (fn) => cleanup.push(fn) },
  { work: true, retainedComparison: true },
);
try {
  let targets;
  try {
    await access(resolve(out, "coordinator/targets.json"));
    targets = JSON.parse(
      await readFile(resolve(out, "coordinator/targets.json"), "utf8"),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    targets = [];
    for (const c of fixtureManifest.cases)
      targets.push({ id: c.id, ...(await prepareEvaluationFixture(h, c.id)) });
    await save("coordinator/targets.json", targets);
  }
  if (
    targets.length !== 24 ||
    new Set(targets.map((t) => t.id)).size !== 24 ||
    targets.some((t) => !fixtureManifest.cases.some((c) => c.id === t.id))
  )
    throw new Error("All 24 exact fixture targets must be retained once");
  const countDirectory = resolve(out, "coordinator/counts");
  await mkdir(countDirectory, { recursive: true, mode: 0o700 });
  const port = createLiveComparisonPort(config, {
    credentialPath,
    checkBeforeInference: async (input) => {
      const binding = input.binding;
      const view = await h.ok(
        `${WORK}?case_id=${encodeURIComponent(binding.case_id)}&record_key=${encodeURIComponent(binding.record_key)}`,
      );
      assertCountedContinuation(input, view);
    },
    retainCount: async (record) => {
      const file = await open(
        resolve(
          countDirectory,
          `${record.request_hash.slice(7)}-${record.phase}.json`,
        ),
        "wx",
        0o600,
      );
      try {
        await file.writeFile(canonicalJson(record));
        await file.sync();
      } finally {
        await file.close();
      }
      const directory = await open(countDirectory, "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    },
  });
  const result = await runThreeArmComparison(h, targets, {
    modelOnly: true,
    contextForArm: (arm) =>
      syntheticLiveComparisonContext(arm, sha256Json(config)),
    port,
    effectiveUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    onResult: async (r) => {
      results.set(`${r.fixture}/${r.arm}`, r);
      await save(`coordinator/${r.fixture}-${r.arm}.json`, r);
      await render();
      // Any send with no trustworthy usage conservatively retains its entire slot.
      // Unknown costs never become zero and never authorize a replacement call.
    },
  });
  const last = targets.at(-1),
    archive = await h.ok(last.path + "&representation=export");
  validateWorkExport(archive);
  await save("coordinator/final-archive.json", archive);
  const starts = archive.entries.filter(
    (e) =>
      e.event === "started" &&
      e.reservation?.batch_id === "synthetic-comparison-v2",
  );
  const countFiles = await readdir(countDirectory);
  await save("coordinator/summary.json", {
    status: result.status,
    live_synthetic: true,
    maximum_sends_reserved: starts.length,
    count_requests_may_have_been_sent: countFiles.filter((n) =>
      n.endsWith("-attempt.json"),
    ).length,
    count_responses_retained: countFiles.filter((n) =>
      n.endsWith("-response.json"),
    ).length,
    count_actual_spend_usd_minor: null,
    count_cost_qualification:
      "confirmed_cap_is_not_billing_evidence; missing response remains unknown",
    reserved_usd_minor: starts.reduce(
      (n, e) => n + e.reservation.reserved_usd_minor,
      0,
    ),
    actual_billing_usd: null,
    results: result.results.map(({ run, ...rest }) => ({
      ...rest,
      invocation: run?.invocation ?? null,
    })),
    human_scores: "not_supplied",
    effort: "not_measured",
    business_outcomes: "not_established",
  });
  console.log(
    `Comparison stopped for human review: ${result.status}. Scores and effort remain blank.`,
  );
} finally {
  for (const fn of cleanup.reverse()) await fn();
}
// RUNNING deliberately remains after success too: future entry requires explicit
// recovery inspection and exact keys, never another automatically scheduled run.
