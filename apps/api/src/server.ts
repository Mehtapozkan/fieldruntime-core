import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import {
  handleApiRequest,
  type ApiDependencies,
  type ApiRequest,
} from "./handler.js";

const MAX_BODY_BYTES = 1_048_576;

function normalizeHeaders(
  headers: IncomingHttpHeaders,
): Readonly<Record<string, string | undefined>> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = Array.isArray(value) ? value.join(",") : value;
  }
  return normalized;
}

export function createApiServer(dependencies: ApiDependencies): Server {
  return createServer((request, response) => {
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
