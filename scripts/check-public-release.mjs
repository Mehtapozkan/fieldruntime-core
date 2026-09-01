import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  try {
    return readFileSync(join(repositoryRoot, relativePath), "utf8");
  } catch {
    fail(`${relativePath} is missing or unreadable`);
    return "";
  }
}

function requireText(relativePath, expected) {
  const content = read(relativePath);
  const normalizedContent = content.replace(/^>\s?/gm, "").replace(/\s+/g, " ");
  for (const value of expected) {
    if (!normalizedContent.includes(value.replace(/\s+/g, " "))) {
      fail(`${relativePath} is missing required text: ${value}`);
    }
  }
}

for (const file of [
  "LICENSE",
  "NOTICE",
  "SECURITY.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "GOVERNANCE.md",
  "MAINTAINERS.md",
  "TRADEMARKS.md",
  "OPEN_CORE.md",
  "THIRD_PARTY_NOTICES.md",
  ".github/CODEOWNERS",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/proposal.yml",
  ".github/ISSUE_TEMPLATE/documentation.yml",
  "docs/guides/5-minute-evaluation.md",
  "docs/releases/v0.1.0-evaluation-preview.md",
  "docs/releases/public-repository-checklist.md",
  "docs/assets/guided-workbench-preview.svg",
]) {
  read(file);
}

requireText("LICENSE", ["Apache License", "Version 2.0, January 2004"]);
requireText("README.md", [
  "Evaluation Preview",
  "Synthetic cases. Simulated authority. No external writes.",
  "complete case",
  "Public roadmap",
  "Delivery PR6 — Authority and Verification",
  "docs/guides/5-minute-evaluation.md",
  "Apache License 2.0",
  "fieldruntime.ai",
]);
requireText("SECURITY.md", [
  "loopback-only",
  "security/advisories/new",
  "not a production service",
]);
requireText("OPEN_CORE.md", ["not lock-in", "Apache License 2.0"]);
requireText("PLAN.md", [
  "GitHub #12 — Public Launch Finalization",
  "Delivery PR6 — Authority and Verification",
  "Delivery PR10 — Packaged Evaluation",
]);
requireText("docs/releases/v0.1.0-evaluation-preview.md", [
  "v0.1.0-evaluation-preview.0",
  "GitHub PRs #6 and #12 are merged",
  "Delivery PR6–PR10 are planned",
]);
requireText(".github/workflows/ci.yml", [
  "publish-evaluation-preview:",
  "needs: validate",
  "github.event_name == 'push'",
  "github.ref == 'refs/heads/main'",
  "github.repository == 'Mehtapozkan/fieldruntime-core'",
  "contents: write",
  "v0.1.0-evaluation-preview.0",
  "refs/tags/${RELEASE_TAG}",
  "gh release create",
  "--verify-tag",
  "--prerelease",
  "--latest=false",
  "fieldruntime.ai",
]);

const expectedPostgresImage =
  "postgres:17.11-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73";
requireText("compose.yaml", [expectedPostgresImage]);
const expectedNodeImage =
  "node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e";
requireText("Dockerfile", [expectedNodeImage]);

const dockerfile = read("Dockerfile");
const runtimeStageHeader = /^FROM\b[^\n]*\bAS\s+runtime\s*$/im.exec(dockerfile);
if (runtimeStageHeader === null) {
  fail("Dockerfile is missing the runtime image stage");
} else {
  const runtimeStageStart = runtimeStageHeader.index;
  const followingStageOffset = dockerfile
    .slice(runtimeStageStart + runtimeStageHeader[0].length)
    .search(/^FROM\b/im);
  const runtimeStageEnd =
    followingStageOffset === -1
      ? dockerfile.length
      : runtimeStageStart + runtimeStageHeader[0].length + followingStageOffset;
  const runtimeCopyInstructions = dockerfile
    .slice(runtimeStageStart, runtimeStageEnd)
    .replace(/\\\r?\n\s*/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^COPY\s/i.test(line));

  for (const artifact of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) {
    const escapedArtifact = artifact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const artifactToken = new RegExp(
      `(?:^|[\\s"'\\[,/])${escapedArtifact}(?=$|[\\s"'\\],/])`,
    );
    if (
      !runtimeCopyInstructions.some((instruction) =>
        artifactToken.test(instruction),
      )
    ) {
      fail(`Dockerfile runtime image must include ${artifact}`);
    }
  }
}

const packageFiles = [
  "package.json",
  "apps/admin/package.json",
  "apps/api/package.json",
  "apps/worker/package.json",
  "packages/cli/package.json",
  "packages/contracts/package.json",
  "packages/domain/package.json",
  "packages/ecc-pack/package.json",
  "packages/runtime/package.json",
];
for (const packageFile of packageFiles) {
  const document = JSON.parse(read(packageFile) || "{}");
  if (document.private !== true) {
    fail(
      `${packageFile} must remain private to prevent accidental registry publish`,
    );
  }
  if (document.license !== "Apache-2.0") {
    fail(`${packageFile} must declare Apache-2.0`);
  }
}

const rootPackage = JSON.parse(read("package.json") || "{}");
if (rootPackage.version !== "0.1.0-evaluation-preview.0") {
  fail("package.json must declare the evaluation-preview version");
}

function git(args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const isShallowRepository =
  git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
if (isShallowRepository) {
  fail(
    "git repository is shallow; fetch the complete history before running the public release check",
  );
}

const secretPatterns = [
  {
    name: "private key",
    expression: new RegExp(
      ["-----BEGIN ", "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"].join(""),
    ),
  },
  {
    name: "GitHub token",
    expression: new RegExp(["gh", "[pousr]_[A-Za-z0-9]{36,}"].join("")),
  },
  {
    name: "AWS access key",
    expression: new RegExp(["AK", "IA[0-9A-Z]{16}"].join("")),
  },
  {
    name: "Slack token",
    expression: new RegExp(["xox", "[baprs]-[A-Za-z0-9-]{20,}"].join("")),
  },
  {
    name: "OpenAI-style secret",
    expression: new RegExp(["sk", "-[A-Za-z0-9_-]{32,}"].join("")),
  },
];

const trackedFiles = git([
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
])
  .split("\0")
  .filter(Boolean);
for (const trackedFile of trackedFiles) {
  const buffer = readFileSync(join(repositoryRoot, trackedFile));
  if (buffer.includes(0)) continue;
  const content = buffer.toString("utf8");
  for (const pattern of secretPatterns) {
    if (pattern.expression.test(content)) {
      fail(`${trackedFile} contains a possible ${pattern.name}`);
    }
  }
}

if (!isShallowRepository) {
  const history = git(["log", "-p", "--all", "--no-ext-diff", "--no-color"]);
  for (const pattern of secretPatterns) {
    if (pattern.expression.test(history)) {
      fail(`git history contains a possible ${pattern.name}`);
    }
  }
}

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const licenseReport = JSON.parse(
  execFileSync(pnpmCommand, ["licenses", "list", "--json", "--prod"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }),
);
const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
]);
for (const license of Object.keys(licenseReport)) {
  if (!allowedLicenses.has(license)) {
    fail(`production dependency license requires review: ${license}`);
  }
}

if (failures.length > 0) {
  console.error("Public evaluation preview check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Public evaluation preview check passed for ${relative(repositoryRoot, repositoryRoot) || "repository root"}.`,
  );
  console.log(
    `Checked ${String(trackedFiles.length)} tracked files, git history, required release artifacts, the pinned PostgreSQL image, and production dependency licenses.`,
  );
}
