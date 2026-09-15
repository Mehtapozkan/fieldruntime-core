import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const [baselineRoot, candidateRoot, destination] = process.argv.slice(2);
const out = resolve(destination, "public");
const ts = (
  await import(
    pathToFileURL(
      resolve(candidateRoot, "node_modules/typescript/lib/typescript.js"),
    )
  )
).default;
const hash = (b) => createHash("sha256").update(b).digest("hex");
const graphs = {};
for (const arm of ["baseline", "candidate"]) {
  const root = resolve(arm === "baseline" ? baselineRoot : candidateRoot),
    nodes = new Map(),
    edges = [];
  async function visit(path) {
    const name = relative(root, path);
    if (nodes.has(name)) return;
    const bytes = await readFile(path);
    nodes.set(name, { path: name, sha256: hash(bytes) });
    if (path.endsWith(".json")) return;
    const source = ts.createSourceFile(
      path,
      bytes.toString(),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const imports = [];
    function scan(n) {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier
      ) {
        assert.ok(ts.isStringLiteral(n.moduleSpecifier));
        imports.push(n.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(n) &&
        (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(n.expression) && n.expression.text === "require"))
      ) {
        assert.ok(ts.isStringLiteral(n.arguments[0]));
        imports.push(n.arguments[0].text);
      }
      ts.forEachChild(n, scan);
    }
    scan(source);
    for (const specifier of [...new Set(imports)].sort()) {
      const internal = specifier.startsWith(".");
      const target = internal ? resolve(dirname(path), specifier) : specifier;
      edges.push({
        from: name,
        to: internal ? relative(root, target) : specifier,
        kind: internal
          ? "core-relative"
          : specifier.startsWith("node:")
            ? "node-builtin"
            : "external-package",
      });
      if (internal) await visit(target);
    }
  }
  await visit(
    resolve(root, "dist/packages/runtime/src/preparation-worker-thread.js"),
  );
  graphs[arm] = {
    nodes: [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path)),
    edges: edges.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to)),
    external_packages: [
      ...new Set(
        edges.filter((e) => e.kind === "external-package").map((e) => e.to),
      ),
    ].sort(),
  };
}
const banned = [
  "dist/packages/contracts/src/index.js",
  "dist/packages/contracts/src/validators.js",
  "dist/packages/runtime/src/intake.js",
  "dist/packages/runtime/src/case-engine.js",
  "dist/packages/runtime/src/preparation-worker-profile.js",
];
for (const p of banned) {
  assert.ok(
    graphs.baseline.nodes.some((n) => n.path === p),
    p,
  );
  assert.ok(!graphs.candidate.nodes.some((n) => n.path === p), p);
}
assert.equal(graphs.candidate.external_packages.length, 0);
await writeFile(
  resolve(out, "Built-Worker-Graphs.json"),
  JSON.stringify(
    {
      scope:
        "All transitive emitted Core JavaScript/JSON imports; external packages and Node builtins listed as terminal edges, their internals not expanded. Dynamic nonliteral imports rejected.",
      assertions: {
        baseline_reaches_all_forbidden_nodes: true,
        candidate_reaches_none: true,
        candidate_has_no_external_packages: true,
      },
      ...graphs,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    baseline_core_files: graphs.baseline.nodes.length,
    candidate_core_files: graphs.candidate.nodes.length,
    forbidden_reachability_removed: true,
  }),
);
