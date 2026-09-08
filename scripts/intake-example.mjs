// Explicit synthetic example: disk files hold navigation/exact retry commands only.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { intakeInput, boundSelection } from "../tests/helpers/intake.mjs";
const [operation, directory, target] = process.argv.slice(2);
const base = process.env.FIELD_RUNTIME_URL ?? "http://127.0.0.1:3210";
const url = new URL(base);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.protocol !== "http:" ||
  url.username ||
  url.password ||
  url.search ||
  url.pathname !== "/"
)
  throw new Error("Local credential-free appliance required");
if (!["prepare", "inspect", "commit", "read"].includes(operation) || !directory)
  throw new Error(
    "Usage: node scripts/intake-example.mjs prepare|inspect|commit|read DIRECTORY [create|CASE_ID for inspect]",
  );
async function call(path, body) {
  const response = await globalThis.fetch(
    `${base}${path}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        },
  );
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      `${response.status}: ${JSON.stringify(value)} — retain the saved command for exact retry; inspect again only after a confirmed conflict`,
    );
  return value;
}
await mkdir(directory, { recursive: true });
const navigation = join(directory, "preparation.json"),
  commandPath = join(directory, "selection.json");
if (operation === "prepare") {
  const file = join(directory, "prepare-command.json");
  let body;
  try {
    body = await readFile(file, "utf8");
  } catch {
    body = JSON.stringify(
      await intakeInput("synthetic-intake-example:prepare"),
      null,
      2,
    );
    await writeFile(file, body, { flag: "wx" });
  }
  const result = await call("/v1/intake/preparations", body);
  await writeFile(navigation, JSON.stringify(result, null, 2));
  console.log(result);
} else {
  const prepared = JSON.parse(await readFile(navigation, "utf8")),
    view = await call(`/v1/intake/bundles/${prepared.bundle_id}`);
  if (operation === "read") console.log(JSON.stringify(view, null, 2));
  if (operation === "inspect") {
    if (!target)
      throw new Error(
        "Explicit target required: create or the exact Case ID from the read response",
      );
    const match = view.candidates[0].targets.find((c) => c.case_id === target);
    if (target !== "create" && !match)
      throw new Error("Target is not a coherent candidate");
    const review = boundSelection(
        view,
        0,
        target === "create"
          ? { mode: "create", expected_case_version: 0 }
          : {
              mode: "attach",
              case_id: target,
              expected_case_version: match.case_version,
            },
      ),
      preview = await call(
        "/v1/intake/selections/preview",
        JSON.stringify(review),
      );
    const command = {
      ...review,
      schema_version: "intake-selection.v1",
      expected_material_key: preview.material_key,
      expected_consent_hash: preview.consent_hash,
      idempotency_key: `example:${globalThis.crypto.randomUUID()}`,
    };
    await writeFile(commandPath, JSON.stringify(command, null, 2), {
      flag: "wx",
    });
    console.log(JSON.stringify(preview, null, 2));
    console.log(`Inspect ${commandPath}; no Case mutation has been submitted.`);
  }
  if (operation === "commit")
    console.log(
      JSON.stringify(
        await call("/v1/intake/commits", await readFile(commandPath, "utf8")),
        null,
        2,
      ),
    );
}
