import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCli } from "../dist/packages/cli/src/cli.js";

const expectedManifest = {
  schema_version: "fieldruntime-project.v0",
  workflow_pack: "ecc",
  profile: "demo",
  mode: "simulation",
  external_writes: false,
};

async function withTemporaryDirectory(callback) {
  const directory = await mkdtemp(join(tmpdir(), "fieldruntime-cli-"));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function harness(cwd, overrides = {}) {
  const stdout = [];
  const stderr = [];
  const processCalls = [];
  const dependencies = {
    cwd: () => cwd,
    fs: {
      mkdir,
      readFile,
      writeFile,
    },
    runProcess: async (command, args, options) => {
      processCalls.push({ command, args, options });
      return { exitCode: 0 };
    },
    stdout: { write: (text) => stdout.push(text) },
    stderr: { write: (text) => stderr.push(text) },
    ...overrides,
  };
  return { dependencies, processCalls, stderr, stdout };
}

async function writeManifest(directory, value) {
  const projectDirectory = join(directory, ".fieldruntime");
  await mkdir(projectDirectory, { recursive: true });
  await writeFile(
    join(projectDirectory, "project.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

async function writeRepositorySurface(directory) {
  await Promise.all([
    writeFile(
      join(directory, "package.json"),
      `${JSON.stringify({ name: "fieldruntime-core" })}\n`,
      "utf8",
    ),
    writeFile(
      join(directory, "compose.yaml"),
      "name: fieldruntime-core\nservices:\n  core:\n    environment:\n      FIELD_RUNTIME_EXTERNAL_WRITES: 'false'\n",
      "utf8",
    ),
    writeFile(join(directory, "Dockerfile"), "FROM scratch\n", "utf8"),
  ]);
}

test("init ecc --demo creates the exact safe project manifest", async () => {
  await withTemporaryDirectory(async (directory) => {
    const context = harness(directory);
    const exitCode = await runCli(
      ["init", "ecc", "--demo"],
      context.dependencies,
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(
      JSON.parse(
        await readFile(
          join(directory, ".fieldruntime", "project.json"),
          "utf8",
        ),
      ),
      expectedManifest,
    );
    assert.equal(context.processCalls.length, 0);
    assert.deepEqual(context.stderr, []);
  });
});

test("identical initialization is idempotent", async () => {
  await withTemporaryDirectory(async (directory) => {
    const context = harness(directory);
    assert.equal(
      await runCli(["init", "ecc", "--demo"], context.dependencies),
      0,
    );
    const before = await readFile(
      join(directory, ".fieldruntime", "project.json"),
      "utf8",
    );

    assert.equal(
      await runCli(["init", "ecc", "--demo"], context.dependencies),
      0,
    );
    assert.equal(
      await readFile(join(directory, ".fieldruntime", "project.json"), "utf8"),
      before,
    );
    assert.match(context.stdout.at(-1), /already initialized/);
    assert.equal(context.processCalls.length, 0);
  });
});

test("init preserves and rejects contradictory or unsafe configuration", async () => {
  await withTemporaryDirectory(async (directory) => {
    const unsafe = { ...expectedManifest, external_writes: true };
    await writeManifest(directory, unsafe);
    const context = harness(directory);

    assert.equal(
      await runCli(["init", "ecc", "--demo"], context.dependencies),
      2,
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(
          join(directory, ".fieldruntime", "project.json"),
          "utf8",
        ),
      ),
      unsafe,
    );
    assert.match(context.stderr.join(""), /contradictory or unsafe/);
    assert.equal(context.processCalls.length, 0);
  });
});

test("up validates the manifest and invokes the exact Compose command", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeManifest(directory, expectedManifest);
    await writeRepositorySurface(directory);
    const context = harness(directory);

    assert.equal(await runCli(["up"], context.dependencies), 0);
    assert.deepEqual(context.processCalls, [
      {
        command: "docker",
        args: ["compose", "up", "--build", "--detach", "--wait"],
        options: {
          cwd: directory,
          env: {
            COMPOSE_FILE: join(directory, "compose.yaml"),
            FIELD_RUNTIME_EXTERNAL_WRITES: "false",
            FIELD_RUNTIME_MODE: "simulation",
          },
        },
      },
    ]);
    assert.deepEqual(context.stderr, []);
    assert.equal(
      context.stdout.at(-1),
      "Field Runtime workbench: http://127.0.0.1:3210/\n",
    );
  });
});

test("up refuses missing, malformed, and unsafe manifests before Docker", async () => {
  await withTemporaryDirectory(async (directory) => {
    const missing = harness(directory);
    assert.equal(await runCli(["up"], missing.dependencies), 2);
    assert.match(missing.stderr.join(""), /not initialized/);
    assert.equal(missing.processCalls.length, 0);

    await writeManifest(directory, { ...expectedManifest, mode: "live" });
    const unsafe = harness(directory);
    assert.equal(await runCli(["up"], unsafe.dependencies), 2);
    assert.match(unsafe.stderr.join(""), /contradictory or unsafe/);
    assert.equal(unsafe.processCalls.length, 0);

    await writeFile(
      join(directory, ".fieldruntime", "project.json"),
      "not-json\n",
      "utf8",
    );
    const malformed = harness(directory);
    assert.equal(await runCli(["up"], malformed.dependencies), 2);
    assert.match(malformed.stderr.join(""), /not valid JSON/);
    assert.equal(malformed.processCalls.length, 0);
  });
});

test("up refuses an initialized directory without the appliance sources", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeManifest(directory, expectedManifest);
    const context = harness(directory);

    assert.equal(await runCli(["up"], context.dependencies), 2);
    assert.match(context.stderr.join(""), /repository root/);
    assert.equal(context.processCalls.length, 0);
  });
});

test("unsupported commands and flags fail without side effects", async () => {
  await withTemporaryDirectory(async (directory) => {
    for (const args of [
      [],
      ["init"],
      ["init", "ecc"],
      ["init", "ecc", "--live"],
      ["init", "other", "--demo"],
      ["up", "--external-writes"],
    ]) {
      const context = harness(directory);
      assert.equal(await runCli(args, context.dependencies), 2);
      assert.match(context.stderr.join(""), /^Usage:/);
      assert.equal(context.processCalls.length, 0);
    }
  });
});

test("up propagates a valid nonzero Docker exit code", async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeManifest(directory, expectedManifest);
    await writeRepositorySurface(directory);
    const context = harness(directory, {
      runProcess: async () => ({ exitCode: 17 }),
    });

    assert.equal(await runCli(["up"], context.dependencies), 17);
    assert.deepEqual(context.stdout, []);
  });
});

test("unexpected filesystem and process failures are sanitized", async () => {
  await withTemporaryDirectory(async (directory) => {
    const writeFailure = harness(directory, {
      fs: {
        mkdir,
        readFile,
        writeFile: async () => {
          throw new Error("secret filesystem detail");
        },
      },
    });
    assert.equal(
      await runCli(["init", "ecc", "--demo"], writeFailure.dependencies),
      1,
    );
    assert.equal(writeFailure.stderr.join(""), "Field Runtime CLI failed.\n");

    await writeManifest(directory, expectedManifest);
    await writeRepositorySurface(directory);
    const processFailure = harness(directory, {
      runProcess: async () => {
        throw new Error("secret process detail");
      },
    });
    assert.equal(await runCli(["up"], processFailure.dependencies), 1);
    assert.equal(processFailure.stderr.join(""), "Field Runtime CLI failed.\n");
  });
});

test("the shebang entry point runs through a bin-style symlink", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = new URL("../packages/cli/src/cli.ts", import.meta.url);
    const executable = join(directory, "fr");
    await symlink(source, executable);

    const result = spawnSync(executable, ["--help"], {
      cwd: directory,
      encoding: "utf8",
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /^Usage: fr init ecc --demo/);
    await assert.rejects(
      readFile(join(directory, ".fieldruntime", "project.json"), "utf8"),
      { code: "ENOENT" },
    );
  });
});
