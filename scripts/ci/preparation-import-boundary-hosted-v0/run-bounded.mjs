import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  realpath,
} from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { setTimeout, clearTimeout } from "node:timers";
import os from "node:os";
import { createRequire } from "node:module";
const [mode, baselineArg, candidateArg, destinationArg] = process.argv.slice(2);
assert.ok(["plan", "run"].includes(mode));
const baseline = resolve(baselineArg),
  candidate = resolve(candidateArg),
  destination = resolve(destinationArg);
const scripts = dirname(fileURLToPath(import.meta.url));
const carrier = resolve(scripts, "../../..");
const out = resolve(destination, "public");
const config = JSON.parse(
  await readFile(resolve(scripts, "expected.json"), "utf8"),
);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const save = (file, value, exclusive = false) =>
  writeFile(
    resolve(out, file),
    JSON.stringify(value, null, 2) + "\n",
    exclusive ? { flag: "wx" } : undefined,
  );
async function resources() {
  const cgroups = {};
  for (const name of ["cpu.max", "memory.max", "cpuset.cpus.effective"]) {
    try {
      cgroups[name] = (await readFile("/sys/fs/cgroup/" + name, "utf8")).trim();
    } catch {
      cgroups[name] = null;
    }
  }
  return {
    os: os.type(),
    release: os.release(),
    architecture: os.arch(),
    cpu_models: [...new Set(os.cpus().map((c) => c.model))],
    logical_cpus: os.cpus().length,
    cpu_allowance: os.availableParallelism(),
    total_memory_bytes: os.totalmem(),
    free_memory_bytes: os.freemem(),
    load_average: os.loadavg(),
    cgroups,
  };
}
function refs() {
  const result = {};
  for (const [arm, root] of [
    ["baseline", baseline],
    ["candidate", candidate],
  ]) {
    const commit = git(root, "rev-parse", "HEAD"),
      tree = git(root, "rev-parse", "HEAD^{tree}");
    assert.equal(commit, config[arm + "_commit"]);
    assert.equal(tree, config[arm + "_tree"]);
    assert.equal(git(root, "status", "--porcelain"), "");
    result[arm] = { commit, tree };
  }
  assert.equal(git(candidate, "rev-parse", "HEAD^"), config.baseline_commit);
  const commit = git(carrier, "rev-parse", "HEAD");
  assert.equal(commit, process.env.GITHUB_SHA);
  assert.equal(git(carrier, "rev-parse", "HEAD^"), config.candidate_commit);
  const additions = git(
    carrier,
    "diff",
    "--name-only",
    config.candidate_commit,
    "HEAD",
  ).split("\n");
  for (const file of additions)
    assert.ok(
      file === ".github/workflows/preparation-import-boundary-hosted-v0.yml" ||
        file.startsWith("scripts/ci/preparation-import-boundary-hosted-v0/"),
      file,
    );
  result.carrier = {
    commit,
    tree: git(carrier, "rev-parse", "HEAD^{tree}"),
    parent: config.candidate_commit,
    additions,
  };
  return result;
}
assert.equal(
  process.env.GITHUB_RUN_ATTEMPT,
  "1",
  "Only one hosted workflow attempt is authorized",
);
assert.equal(process.env.GITHUB_EVENT_NAME, "push");
assert.equal(
  process.env.GITHUB_REF,
  "refs/heads/ci/preparation-import-boundary-hosted-v0",
);
assert.equal(process.versions.node, "24.19.0");
assert.equal(process.versions.tz, "2026b");
assert.equal(process.platform, "linux");
assert.equal(process.env.NODE_OPTIONS, undefined);
assert.equal(process.env.pnpm_config_verify_deps_before_run, undefined);
assert.equal(process.env.PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN, undefined);
const planPath = resolve(out, "Timing-Plan.json"),
  ledgerPath = resolve(out, "Timing-Ledger.json");
if (mode === "plan") {
  await mkdir(out, { recursive: true });
  const script_sha256 = {};
  const paths = (await readdir(scripts)).map((f) => resolve(scripts, f));
  paths.push(
    resolve(
      carrier,
      ".github/workflows/preparation-import-boundary-hosted-v0.yml",
    ),
  );
  for (const path of paths.sort())
    script_sha256[relative(carrier, path)] = hash(await readFile(path));
  const sequence = [];
  let slot = 0;
  for (const stage of ["v1", "v2"])
    for (const [pair, arms] of [
      [1, ["baseline", "candidate"]],
      [2, ["candidate", "baseline"]],
    ])
      for (const arm of arms) sequence.push({ slot: ++slot, stage, pair, arm });
  const plan = {
    registered_at: new Date().toISOString(),
    refs: refs(),
    sequence,
    script_sha256,
    expected: config.stages,
    node: process.versions.node,
    node_binary_sha256: hash(await readFile(process.execPath)),
    runtime_versions: process.versions,
    tz: process.versions.tz,
    pnpm: execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
    lock_sha256: {
      baseline: hash(await readFile(resolve(baseline, "pnpm-lock.yaml"))),
      candidate: hash(await readFile(resolve(candidate, "pnpm-lock.yaml"))),
    },
    resources: await resources(),
    runner: {
      run_id: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
      job: process.env.GITHUB_JOB,
      image_os: process.env.ImageOS ?? null,
      image_version: process.env.ImageVersion ?? null,
      runner_arch: process.env.RUNNER_ARCH,
      runner_os: process.env.RUNNER_OS,
    },
    controls: {
      deadline_ms: 5000,
      worker_env: {},
      maxOldGenerationSizeMb: 128,
      maxYoungGenerationSizeMb: 32,
      profiler: false,
      preload: false,
      warmup: false,
      worker_reuse: false,
      retry: false,
      synthetic_pressure: false,
      parallel_arms: false,
      os_cold_filesystem_claim: false,
      parent_context:
        "fresh Node process per slot; identical allowlisted environment",
      observer:
        "native worker lifecycle events and monotonic timestamps only; no worker/port/module replacement; overhead not separately calibrated",
      process_watchdog_ms: 30000,
      watchdog_scope:
        "emergency process cleanup only; consumes slot and cannot extend the worker budget",
    },
    measurement: {
      start:
        "monotonic sample immediately before unchanged fixedPreparationPort; timer armed after port construction, matching store ordering",
      end: "after completion/error and cancellation request; native exit logged separately",
      parent:
        "required parent module initialization and output validation measured separately; whole process measured by orchestrator",
      unavailable:
        "native online is not application module initialization complete; import/computation phase split unavailable",
    },
    qualification:
      "Two untimed candidate fixture preparations through unchanged resultHost; no timed worker or parent reused; exact fingerprints verified before timing",
    gate_mapping: {
      ordinary_pr_ci:
        "349 tests, format/lint/types/build/public-release, Docker/Compose/appliance/browser/restart; verified separately against actual PR test tree",
      carrier_after_timing:
        "exact serial 99 and 143 groups; ECC positive and completed intended negative receipt",
    },
  };
  assert.equal(plan.pnpm, "11.24.0");
  assert.equal(plan.lock_sha256.baseline, plan.lock_sha256.candidate);
  await save("Timing-Plan.json", plan, true);
  await save(
    "Timing-Ledger.json",
    {
      plan_sha256: hash(await readFile(planPath)),
      phase: "planned",
      executions: sequence.map((x) => ({
        ...x,
        status: "not_run",
        reason:
          "Not yet attempted; prerequisite failure leaves this slot unrun",
      })),
    },
    true,
  );
  await save(
    "Acceptance.json",
    {
      phase: "not_run",
      gates: [
        "retained_99",
        "preparation_authority_143",
        "ecc_positive",
        "ecc_negative",
      ].map((name) => ({ name, status: "not_run" })),
    },
    true,
  );
  console.log(
    "Registered eight slots and exact refs before setup/qualification/timing.",
  );
} else {
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  assert.equal(ledger.phase, "planned", "No repeat comparison");
  assert.equal(hash(await readFile(planPath)), ledger.plan_sha256);
  assert.deepEqual(refs(), plan.refs);
  for (const [file, expected] of Object.entries(plan.script_sha256))
    assert.equal(hash(await readFile(resolve(carrier, file))), expected);
  const qualification = JSON.parse(
    await readFile(resolve(out, "Qualification.json"), "utf8"),
  );
  assert.equal(qualification.native_worker_preparations, 2);
  const browserRequire = createRequire(
    await realpath(
      resolve(candidate, "node_modules/@playwright/test/package.json"),
    ),
  );
  const browserCore = createRequire(
    browserRequire.resolve("playwright"),
  ).resolve("playwright-core");
  const browserMetadata = await readFile(
    resolve(dirname(browserCore), "browsers.json"),
  );
  const browserPackage = JSON.parse(
    await readFile(
      resolve(candidate, "node_modules/@playwright/test/package.json"),
      "utf8",
    ),
  );
  const typescriptPackage = JSON.parse(
    await readFile(
      resolve(candidate, "node_modules/typescript/package.json"),
      "utf8",
    ),
  );
  ledger.installed_toolchain = {
    playwright: browserPackage.version,
    typescript: typescriptPackage.version,
    browser_metadata_sha256: hash(browserMetadata),
    pinned_browsers: JSON.parse(browserMetadata).browsers.filter((b) =>
      ["chromium", "chromium-headless-shell"].includes(b.name),
    ),
  };
  ledger.phase = "running";
  ledger.started_at = new Date().toISOString();
  ledger.resources_at_timing_start = await resources();
  await save("Timing-Ledger.json", ledger);
  let fatal = false,
    candidateFailure = false;
  for (const entry of ledger.executions) {
    if (fatal) {
      entry.reason = "Not run after safety/semantic/setup failure";
      continue;
    }
    entry.status = "reserved";
    delete entry.reason;
    entry.started_at = new Date().toISOString();
    await save("Timing-Ledger.json", ledger);
    const args = [
      resolve(scripts, "timed-arm.mjs"),
      entry.arm === "baseline" ? baseline : candidate,
      resolve(destination, "private-inputs", `input-${entry.stage}.json`),
      resolve(out, "qualified-results", `result-${entry.stage}.json`),
      entry.arm,
      entry.stage,
      String(entry.slot),
    ];
    const begin = performance.now();
    const result = await new Promise((resolveResult) => {
      const child = spawn(process.execPath, args, {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH, LANG: "C.UTF-8", TZ: "UTC" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "",
        watchdog = false;
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      const stop = setTimeout(() => {
        watchdog = true;
        child.kill("SIGKILL");
      }, 30000);
      child.on("error", (error) => {
        clearTimeout(stop);
        resolveResult({ error: error.message, stdout, stderr });
      });
      child.on("close", (code, signal) => {
        clearTimeout(stop);
        resolveResult({
          code,
          signal,
          watchdog,
          stdout,
          stderr,
          parent_pid: child.pid,
        });
      });
    });
    entry.parent_process_wall_ms = performance.now() - begin;
    entry.finished_at = new Date().toISOString();
    entry.status = "finished";
    entry.exit_code = result.code;
    entry.signal = result.signal;
    entry.watchdog = result.watchdog;
    entry.parent_pid = result.parent_pid;
    await writeFile(
      resolve(out, `timing-${entry.slot}-${entry.stage}-${entry.arm}.stdout`),
      result.stdout,
    );
    await writeFile(
      resolve(out, `timing-${entry.slot}-${entry.stage}-${entry.arm}.stderr`),
      result.stderr,
    );
    try {
      entry.measurement = JSON.parse(result.stdout);
    } catch {
      entry.error = result.error ?? "No valid measurement returned";
      fatal = true;
    }
    if (
      entry.measurement?.outcome === "safety_or_semantic_mismatch" ||
      result.watchdog
    )
      fatal = true;
    if (
      entry.arm === "candidate" &&
      (result.code !== 0 ||
        entry.measurement?.outcome !== "completed_conformant")
    )
      candidateFailure = true;
    if (result.code !== 0 && entry.measurement?.outcome !== "worker_failed")
      fatal = true;
    await save("Timing-Ledger.json", ledger);
    console.log(JSON.stringify(entry));
  }
  ledger.finished_at = new Date().toISOString();
  ledger.phase = fatal ? "stopped_after_mismatch" : "completed";
  ledger.candidate_correctness_passed = !fatal && !candidateFailure;
  ledger.baseline_failed_slots = ledger.executions
    .filter(
      (e) => e.arm === "baseline" && e.measurement?.outcome === "worker_failed",
    )
    .map((e) => e.slot);
  ledger.benefit_assessment =
    "Review all paired observations; no speed/reliability threshold is an acceptance substitute";
  await save("Timing-Ledger.json", ledger);
  if (fatal || candidateFailure) process.exitCode = 1;
}
