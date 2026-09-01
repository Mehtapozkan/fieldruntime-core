import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { request } from "node:http";
import test from "node:test";
import { createApiServer } from "../dist/apps/api/src/server.js";

const html = Buffer.from("<!doctype html><title>sentinel workbench</title>\n");
const css = Buffer.from(".sentinel { color: rebeccapurple; }\n");
const javascript = Buffer.from('document.title = "sentinel";\n');

const workbenchAssets = Object.freeze({
  html: Object.freeze({ body: html, contentType: "text/html; charset=utf-8" }),
  css: Object.freeze({ body: css, contentType: "text/css; charset=utf-8" }),
  javascript: Object.freeze({
    body: javascript,
    contentType: "text/javascript; charset=utf-8",
  }),
});

function dependencies() {
  return {
    async executeCaseCommand() {
      throw new Error("unexpected command");
    },
    async getCase() {
      return undefined;
    },
    async getEvaluationFixture() {
      return undefined;
    },
    async getJournal() {
      return undefined;
    },
    async getGuidedWalkthrough() {
      return undefined;
    },
    async isReady() {
      return true;
    },
    async listCases() {
      return [];
    },
  };
}

async function withServer(run) {
  const server = createApiServer(dependencies(), workbenchAssets);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  try {
    await run(address.port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

async function httpRequest(port, method, path) {
  return await new Promise((resolve, reject) => {
    const outbound = request(
      { host: "127.0.0.1", method, path, port },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: response.headers,
            status: response.statusCode,
          });
        });
      },
    );
    outbound.on("error", reject);
    outbound.end();
  });
}

test("serves only the three same-origin workbench assets with exact MIME types", async () => {
  await withServer(async (port) => {
    for (const expected of [
      { body: html, contentType: "text/html; charset=utf-8", path: "/?demo=1" },
      {
        body: css,
        contentType: "text/css; charset=utf-8",
        path: "/workbench.css?v=1",
      },
      {
        body: javascript,
        contentType: "text/javascript; charset=utf-8",
        path: "/workbench.js",
      },
    ]) {
      const response = await httpRequest(port, "GET", expected.path);
      assert.equal(response.status, 200);
      assert.equal(response.headers["content-type"], expected.contentType);
      assert.equal(
        response.headers["content-length"],
        String(expected.body.byteLength),
      );
      assert.deepEqual(response.body, expected.body);
      assert.doesNotMatch(response.body.toString("utf8"), /^\s*"/);
    }
  });
});

test("sets a no-inline same-origin browser boundary on every workbench asset", async () => {
  await withServer(async (port) => {
    const response = await httpRequest(port, "GET", "/");
    const csp = response.headers["content-security-policy"];
    assert.equal(typeof csp, "string");
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self'/);
    assert.match(csp, /connect-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.doesNotMatch(csp, /'unsafe-inline'|'unsafe-eval'|https?:/);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["referrer-policy"], "no-referrer");
    assert.equal(
      response.headers["cross-origin-resource-policy"],
      "same-origin",
    );
    assert.equal(response.headers["cross-origin-opener-policy"], "same-origin");
  });
});

test("HEAD returns asset headers without returning asset bytes", async () => {
  await withServer(async (port) => {
    const response = await httpRequest(port, "HEAD", "/workbench.js?probe=1");
    assert.equal(response.status, 200);
    assert.equal(
      response.headers["content-type"],
      "text/javascript; charset=utf-8",
    );
    assert.equal(response.headers["content-length"], String(javascript.length));
    assert.equal(response.body.length, 0);
  });
});

test("denies static methods, traversal variants, and unknown files through the JSON API boundary", async () => {
  await withServer(async (port) => {
    for (const target of [
      { method: "POST", path: "/workbench.js" },
      { method: "PUT", path: "/" },
      { method: "GET", path: "/index.html" },
      { method: "GET", path: "/package.json" },
      { method: "GET", path: "/../package.json" },
      { method: "GET", path: "/%2e%2e/package.json" },
      { method: "GET", path: "/workbench%2ejs" },
      { method: "GET", path: "//not-an-origin-form/" },
    ]) {
      const response = await httpRequest(port, target.method, target.path);
      assert.equal(response.status, 404);
      assert.equal(
        response.headers["content-type"],
        "application/json; charset=utf-8",
      );
      assert.deepEqual(response.body, Buffer.from('{"error":"not_found"}\n'));
    }
  });
});

test("keeps existing API responses JSON and unmodified", async () => {
  await withServer(async (port) => {
    const response = await httpRequest(port, "GET", "/healthz");
    assert.equal(response.status, 200);
    assert.equal(
      response.headers["content-type"],
      "application/json; charset=utf-8",
    );
    assert.deepEqual(response.body, Buffer.from('{"status":"alive"}\n'));
  });
});
