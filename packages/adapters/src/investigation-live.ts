// Only an explicit coordinator process may construct this port. No appliance/env activation.
import { open, constants } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  canonicalJson,
  immutableJson,
  sha256Json,
} from "../../contracts/src/index.js";
import {
  intakeObject as o,
  requireIntake as ensure,
  type IntakeObject as Obj,
} from "../../runtime/src/intake.js";
import {
  liveRequest,
  accountComparisonInput,
} from "../../runtime/src/investigation-live.js";
import { COMPARISON_ENDPOINT, type MockHttp } from "./investigation-http.js";
import type { PreparationPort } from "../../runtime/src/preparation-worker-port.js";
export function validateActivation(value: unknown): Obj {
  ensure(
    value && typeof value === "object" && !Array.isArray(value),
    "ACTIVATION_REQUIRED",
    "Activation prerequisites have not been supplied",
  );
  const c = o(value);
  ensure(
    Object.keys(c).sort().join() ===
      [
        "schema_version",
        "reviewed_head",
        "model",
        "fixture_version",
        "max_calls",
        "max_usd_minor",
        "fresh_retry_slots",
        "custodian",
        "reviewer",
        "combined_roles_disclosed",
        "project_id",
        "validated_head",
        "ci_url",
        "input_usd_per_million",
        "output_usd_per_million",
        "total_worst_case_usd",
        "confirmations",
      ]
        .sort()
        .join(),
    "ACTIVATION_REQUIRED",
    "Activation accepts only the documented non-secret configuration fields",
  );
  ensure(
    c.schema_version === "comparison-activation.v1" &&
      c.reviewed_head === "7144571ecb3fab62cced702f3c2eee8f03f994e7" &&
      c.model === "gpt-4.1-mini-2025-04-14" &&
      c.fixture_version === "v2" &&
      c.max_calls === 48 &&
      c.max_usd_minor === 96 &&
      c.fresh_retry_slots === 0 &&
      c.custodian === "Mehtap Özkan" &&
      c.reviewer === "Mehtap Özkan" &&
      c.combined_roles_disclosed === true,
    "ACTIVATION_REQUIRED",
    "The exact conditional activation approval is required",
  );
  const confirmations = o(c.confirmations);
  const confirmationKeys = [
    "model_available",
    "pricing_with_all_charges_within_ceiling",
    "project_data_controls",
    "credential_custody",
    "isolated_storage_access_encryption",
    "backups_and_30_day_deletion",
    "complete_input_accounting",
  ];
  ensure(
    Object.keys(confirmations).sort().join() ===
      [...confirmationKeys].sort().join(),
    "ACTIVATION_REQUIRED",
    "Confirmation fields must match the non-secret activation contract",
  );
  for (const key of confirmationKeys)
    ensure(
      typeof confirmations[key] === "string" &&
        confirmations[key].trim().length >= 12 &&
        !/\b(unconfirmed|pending|unknown)\b/i.test(confirmations[key]),
      "ACTIVATION_REQUIRED",
      `Missing activation prerequisite: ${key}`,
    );
  ensure(
    typeof c.project_id === "string" &&
      /^proj_[A-Za-z0-9_-]+$/.test(c.project_id),
    "ACTIVATION_REQUIRED",
    "Dedicated project must be confirmed",
  );
  ensure(
    typeof c.validated_head === "string" &&
      /^[a-f0-9]{40}$/.test(c.validated_head) &&
      typeof c.ci_url === "string" &&
      /^https:\/\/github.com\/Mehtapozkan\/fieldruntime-core\/actions\/runs\/\d+$/.test(
        c.ci_url,
      ),
    "ACTIVATION_REQUIRED",
    "Final activation head and passing CI evidence are required",
  );
  ensure(
    c.input_usd_per_million === 0.4 &&
      c.output_usd_per_million === 1.6 &&
      Number.isFinite(c.total_worst_case_usd) &&
      Number(c.total_worst_case_usd) >= 0.4608 &&
      Number(c.total_worst_case_usd) <= 0.96,
    "ACTIVATION_REQUIRED",
    "Confirmed complete price must fit the approved ceiling",
  );
  return immutableJson(c);
}
async function credentialFile(path: string): Promise<string> {
  ensure(
    isAbsolute(path),
    "ACTIVATION_REQUIRED",
    "Credential must use an explicit local file",
  );
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    ensure(
      stat.isFile() &&
        stat.nlink === 1 &&
        (stat.mode & 0o077) === 0 &&
        stat.uid === process.getuid?.() &&
        stat.size > 0 &&
        stat.size <= 4096,
      "ACTIVATION_REQUIRED",
      "Credential custody/permissions do not match the approved boundary",
    );
    const key = (await file.readFile("utf8")).trim();
    ensure(
      key.length >= 20 && key.length <= 4096 && /^[A-Za-z0-9_-]+$/.test(key),
      "ACTIVATION_REQUIRED",
      "Dedicated credential is malformed",
    );
    return key;
  } catch {
    throw new Error(
      "Dedicated credential unavailable or unsafe; no request sent",
    );
  } finally {
    await file?.close();
  }
}
const realHttp: MockHttp = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.body) throw new Error("Provider response body unavailable");
  return {
    status: response.status,
    redirected: response.redirected,
    body: response.body,
  };
};
export function createLiveComparisonPort(
  value: unknown,
  options: {
    credentialPath?: string;
    readCredential?: (path: string) => Promise<string>;
    http?: MockHttp;
  } = {},
): PreparationPort {
  const config = validateActivation(value),
    activationHash = sha256Json(config);
  ensure(
    options.credentialPath && isAbsolute(options.credentialPath),
    "ACTIVATION_REQUIRED",
    "An explicit locally supplied credential path is required",
  );
  const path = options.credentialPath,
    read = options.readCredential ?? credentialFile,
    http = options.http ?? realHttp;
  return (input) => {
    ensure(
      o(input.binding).worker_implementation_id ===
        "disposition-investigation.v3" &&
        o(input.binding).activation_hash === activationHash,
      "ACTIVATION_REQUIRED",
      "Published live profile and activation record differ",
    );
    const request = liveRequest(input);
    accountComparisonInput(request);
    const controller = new AbortController();
    return {
      completion: (async (): Promise<string> => {
        // Only after the runtime's durable start reservation; never used on exact retry.
        const credential = await read(path);
        try {
          if (controller.signal.aborted)
            throw new Error("Cancelled before send");
          const response = await http(COMPARISON_ENDPOINT, {
            method: "POST",
            redirect: "error",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${credential}`,
              "OpenAI-Project": String(config.project_id),
            },
            body: canonicalJson(request),
            signal: controller.signal,
          });
          if (response.redirected) throw new Error("Redirect refused");
          const chunks: Uint8Array[] = [];
          let bytes = 0;
          for await (const chunk of response.body) {
            controller.signal.throwIfAborted();
            bytes += chunk.byteLength;
            if (bytes > 60000) throw new Error("Response unavailable");
            chunks.push(chunk);
          }
          const body = new TextDecoder("utf8", { fatal: true }).decode(
            Buffer.concat(chunks),
          );
          if (body.includes(credential))
            throw new Error("Credential echo refused");
          return canonicalJson({
            schema_version: "comparison-http.v1",
            http_status: response.status,
            body,
          });
        } catch {
          throw new Error(
            "Provider outcome uncertain; retain reservation and original command. No automatic resend.",
          );
        }
      })(),
      cancel: (): void => {
        controller.abort();
      },
    };
  };
}
