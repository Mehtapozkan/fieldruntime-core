#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import { join } from "node:path";

interface CliFileSystem {
  mkdir(path: string, options: { readonly recursive: true }): Promise<unknown>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(
    path: string,
    contents: string,
    options: { readonly encoding: "utf8"; readonly flag: "wx" },
  ): Promise<unknown>;
}

interface ProcessRunOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

interface ProcessRunResult {
  readonly exitCode: number;
}

export interface CliDependencies {
  readonly cwd: () => string;
  readonly fs: CliFileSystem;
  readonly runProcess: (
    command: string,
    args: readonly string[],
    options: ProcessRunOptions,
  ) => Promise<ProcessRunResult>;
  readonly stderr: { write(text: string): unknown };
  readonly stdout: { write(text: string): unknown };
}

interface ProjectManifest {
  readonly schema_version: "fieldruntime-project.v0";
  readonly workflow_pack: "ecc";
  readonly profile: "demo";
  readonly mode: "simulation";
  readonly external_writes: false;
}

const PROJECT_DIRECTORY = ".fieldruntime";
const PROJECT_FILE = "project.json";
const MANIFEST_KEYS = new Set([
  "schema_version",
  "workflow_pack",
  "profile",
  "mode",
  "external_writes",
]);
const PROJECT_MANIFEST: ProjectManifest = Object.freeze({
  schema_version: "fieldruntime-project.v0",
  workflow_pack: "ecc",
  profile: "demo",
  mode: "simulation",
  external_writes: false,
});
const PROJECT_CONTENT = `${JSON.stringify(PROJECT_MANIFEST, null, 2)}\n`;

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function parseManifest(raw: string): ProjectManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new CliError(
      ".fieldruntime/project.json is not valid JSON; refusing to continue.",
    );
  }

  if (
    !isRecord(value) ||
    Object.keys(value).length !== MANIFEST_KEYS.size ||
    Object.keys(value).some((key) => !MANIFEST_KEYS.has(key)) ||
    value.schema_version !== PROJECT_MANIFEST.schema_version ||
    value.workflow_pack !== PROJECT_MANIFEST.workflow_pack ||
    value.profile !== PROJECT_MANIFEST.profile ||
    value.mode !== PROJECT_MANIFEST.mode ||
    value.external_writes !== PROJECT_MANIFEST.external_writes
  ) {
    throw new CliError(
      ".fieldruntime/project.json is contradictory or unsafe; expected the initialized ECC demo in simulation mode with external writes disabled.",
    );
  }

  return PROJECT_MANIFEST;
}

function projectPaths(cwd: string): {
  readonly directory: string;
  readonly manifest: string;
} {
  const directory = join(cwd, PROJECT_DIRECTORY);
  return { directory, manifest: join(directory, PROJECT_FILE) };
}

async function readManifest(
  dependencies: CliDependencies,
  manifestPath: string,
): Promise<ProjectManifest> {
  try {
    return parseManifest(await dependencies.fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new CliError(
        "Field Runtime is not initialized. Run `fr init ecc --demo` first.",
      );
    }
    throw error;
  }
}

async function initialize(dependencies: CliDependencies): Promise<void> {
  const paths = projectPaths(dependencies.cwd());
  await dependencies.fs.mkdir(paths.directory, { recursive: true });
  try {
    await dependencies.fs.writeFile(paths.manifest, PROJECT_CONTENT, {
      encoding: "utf8",
      flag: "wx",
    });
    dependencies.stdout.write("Initialized the ECC demo in simulation mode.\n");
    return;
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }

  await readManifest(dependencies, paths.manifest);
  dependencies.stdout.write("The ECC demo is already initialized.\n");
}

async function assertRepositoryRoot(
  dependencies: CliDependencies,
  cwd: string,
): Promise<void> {
  try {
    const [packageText, composeText, dockerfileText] = await Promise.all([
      dependencies.fs.readFile(join(cwd, "package.json"), "utf8"),
      dependencies.fs.readFile(join(cwd, "compose.yaml"), "utf8"),
      dependencies.fs.readFile(join(cwd, "Dockerfile"), "utf8"),
    ]);
    const packageDocument = JSON.parse(packageText) as unknown;
    if (
      !isRecord(packageDocument) ||
      packageDocument.name !== "fieldruntime-core" ||
      !composeText.includes("name: fieldruntime-core") ||
      !composeText.includes("FIELD_RUNTIME_EXTERNAL_WRITES") ||
      dockerfileText.trim().length === 0
    ) {
      throw new CliError(
        "`fr up` must run from the fieldruntime-core repository root.",
      );
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(
      "`fr up` must run from the fieldruntime-core repository root.",
    );
  }
}

async function startAppliance(
  dependencies: CliDependencies,
  enroll = false,
): Promise<number> {
  const cwd = dependencies.cwd();
  await readManifest(dependencies, projectPaths(cwd).manifest);
  await assertRepositoryRoot(dependencies, cwd);
  let result: ProcessRunResult;
  try {
    result = await dependencies.runProcess(
      "docker",
      enroll
        ? [
            "compose",
            "exec",
            "-T",
            "core",
            "node",
            "dist/apps/api/src/enroll-credit.js",
          ]
        : ["compose", "up", "--build", "--detach", "--wait"],
      {
        cwd,
        env: {
          COMPOSE_FILE: join(cwd, "compose.yaml"),
          FIELD_RUNTIME_EXTERNAL_WRITES: "false",
          FIELD_RUNTIME_MODE: "simulation",
        },
      },
    );
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new CliError(
        "Docker is not available. Install Docker with Compose v2 and retry `fr up`.",
        1,
      );
    }
    throw error;
  }
  if (!Number.isSafeInteger(result.exitCode) || result.exitCode < 0) {
    throw new CliError("Docker Compose returned an invalid exit code.", 1);
  }
  if (result.exitCode === 0 && !enroll) {
    dependencies.stdout.write(
      "Field Runtime workbench: http://127.0.0.1:3210/\n",
    );
  }
  return result.exitCode;
}

function assertCommand(args: readonly string[]): "init" | "up" | "enroll" {
  if (
    args.length === 3 &&
    args[0] === "init" &&
    args[1] === "ecc" &&
    args[2] === "--demo"
  ) {
    return "init";
  }
  if (args.length === 1 && args[0] === "up") return "up";
  if (
    args.length === 3 &&
    args[0] === "d7" &&
    args[1] === "enroll" &&
    args[2] === "--demo"
  )
    return "enroll";
  throw new CliError(
    "Usage: fr init ecc --demo\n       fr up\n       fr d7 enroll --demo",
  );
}

export async function runCli(
  args: readonly string[],
  dependencies: CliDependencies,
): Promise<number> {
  try {
    const command = assertCommand(args);
    if (command === "init") {
      await initialize(dependencies);
      return 0;
    }
    return await startAppliance(dependencies, command === "enroll");
  } catch (error) {
    if (error instanceof CliError) {
      dependencies.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    dependencies.stderr.write("Field Runtime CLI failed.\n");
    return 1;
  }
}

async function runChildProcess(
  command: string,
  args: readonly string[],
  options: ProcessRunOptions,
): Promise<ProcessRunResult> {
  return await new Promise<ProcessRunResult>((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolvePromise({ exitCode: code ?? 1 });
    });
  });
}

const defaultDependencies: CliDependencies = {
  cwd: () => process.cwd(),
  fs: {
    mkdir: async (path, options) => await nodeMkdir(path, options),
    readFile: async (path, encoding) => await nodeReadFile(path, encoding),
    writeFile: async (path, contents, options) => {
      await nodeWriteFile(path, contents, options);
    },
  },
  runProcess: runChildProcess,
  stderr: { write: (text) => process.stderr.write(text) },
  stdout: { write: (text) => process.stdout.write(text) },
};

if (import.meta.main) {
  void runCli(process.argv.slice(2), defaultDependencies).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
