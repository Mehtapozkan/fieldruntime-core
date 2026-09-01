import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import {
  handleApiRequest,
  type ApiDependencies,
  type ApiRequest,
} from "./handler.js";
import { getWorkbenchAsset, type WorkbenchAssets } from "./workbench-assets.js";

const MAX_BODY_BYTES = 1_048_576;
const WORKBENCH_SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; manifest-src 'none'; media-src 'none'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'none'",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function normalizeHeaders(
  headers: IncomingHttpHeaders,
): Readonly<Record<string, string | undefined>> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = Array.isArray(value) ? value.join(",") : value;
  }
  return normalized;
}

export function createApiServer(
  dependencies: ApiDependencies,
  workbenchAssets: WorkbenchAssets,
): Server {
  return createServer((request, response) => {
    const method = request.method?.toUpperCase() ?? "GET";
    if (method === "GET" || method === "HEAD") {
      const workbenchAsset = getWorkbenchAsset(
        request.url ?? "/",
        workbenchAssets,
      );
      if (workbenchAsset !== undefined) {
        response.writeHead(200, {
          ...WORKBENCH_SECURITY_HEADERS,
          "content-length": workbenchAsset.body.byteLength,
          "content-type": workbenchAsset.contentType,
        });
        response.end(method === "HEAD" ? undefined : workbenchAsset.body);
        return;
      }
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let oversized = false;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES + 1) chunks.push(chunk);
      else oversized = true;
    });
    request.on("end", () => {
      const apiRequest: ApiRequest = {
        method: request.method ?? "GET",
        path: request.url ?? "/",
        headers: normalizeHeaders(request.headers),
        body: oversized
          ? "x".repeat(MAX_BODY_BYTES + 1)
          : Buffer.concat(chunks).toString("utf8"),
      };
      void handleApiRequest(apiRequest, dependencies)
        .then((result) => {
          response.writeHead(result.status, result.headers);
          response.end(`${JSON.stringify(result.body)}\n`);
        })
        .catch(() => {
          response.writeHead(500, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          response.end('{"error":"internal_error"}\n');
        });
    });
    request.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(400, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
      }
      response.end('{"error":"invalid_request"}\n');
    });
  });
}
