// Readiness only: production factory refuses before reading a credential or sending.
import { canonicalJson } from "../../contracts/src/index.js";
import { comparisonRequest } from "../../runtime/src/investigation-comparison.js";
import type { PreparationPort } from "../../runtime/src/preparation-worker-port.js";
export const COMPARISON_ENDPOINT = "https://api.openai.com/v1/responses";
export type MockHttp = (
  url: string,
  init: {
    method: "POST";
    redirect: "error";
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{
  status: number;
  redirected: boolean;
  body: AsyncIterable<Uint8Array>;
}>;
// Only injected HTTP mocks use this serializer/read path in this implementation.
// There is no ambient fetch, environment credential lookup, redirect or retry.
export function mockHttpComparisonPort(http: MockHttp): PreparationPort {
  return (input) => {
    const controller = new AbortController();
    const request = comparisonRequest(input);
    return {
      completion: (async (): Promise<string> => {
        const response = await http(COMPARISON_ENDPOINT, {
          method: "POST",
          redirect: "error",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer MOCK-NOT-A-CREDENTIAL",
          },
          body: canonicalJson(request),
          signal: controller.signal,
        });
        if (response.redirected) throw new Error("Redirect refused");
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.body) {
          if (controller.signal.aborted) throw new Error("Cancelled");
          bytes += chunk.byteLength;
          if (bytes > 60000)
            throw new Error("Response limit exceeded; outcome unknown");
          chunks.push(chunk);
        }
        const body = new TextDecoder("utf-8", { fatal: true }).decode(
          Buffer.concat(chunks),
        );
        return canonicalJson({
          schema_version: "comparison-http.v1",
          http_status: response.status,
          body,
        });
      })(),
      cancel: (): void => {
        controller.abort();
      },
    };
  };
}
export function liveComparisonPort(): never {
  throw new Error(
    "Live activation unavailable: named custodian/reviewer, project data controls, pinned tokenizer, model availability and complete 48-call budget require separate approval. No credential has been read.",
  );
}
