import test from "node:test";
import assert from "node:assert/strict";
import * as live from "../dist/packages/adapters/src/investigation-live.js";
import * as runtime from "../dist/packages/runtime/src/investigation-live.js";
import { syntheticComparisonContext } from "../dist/packages/runtime/src/preparation-work.js";
import { assertValidPreparationWorkV4Contract } from "../dist/packages/contracts/src/index.js";
test("activation: absence of confirmed prerequisites prevents credential access and HTTP", async () => {
  let reads = 0,
    sends = 0;
  assert.throws(
    () =>
      live.createLiveComparisonPort(null, {
        readCredential: () => {
          reads++;
        },
        http: () => {
          sends++;
        },
      }),
    /activation|prerequisite/i,
  );
  assert.equal(reads, 0);
  assert.equal(sends, 0);
});
test("activation: verified local tokenizer keeps framing qualification explicit", () => {
  const a = runtime.accountComparisonInput({
    instructions: "hello world",
    input: "DEL-4 confirmation remains unverified.",
    text: { format: { schema: { type: "object" } } },
  });
  assert.equal(a.instructions_tokens, 2);
  assert.equal(a.input_tokens, 8);
  assert.equal(a.framing_reserve_tokens, 4000);
  assert.match(a.qualification, /not_provider_exact_count/);
  assert.throws(
    () =>
      runtime.accountComparisonInput({
        instructions: "x".repeat(12000),
        input: "x",
        text: { format: { schema: {} } },
      }),
    /allowance|limit/i,
  );
});
test("activation: old mock profiles cannot claim live provider attribution", () => {
  const old = syntheticComparisonContext().profile;
  assertValidPreparationWorkV4Contract("profile", old);
  assert.throws(() =>
    assertValidPreparationWorkV4Contract("profile", {
      ...old,
      investigation: { ...old.investigation, live_activation: true },
    }),
  );
});

test("activation: complete official tokenizer vectors agree without network", async () => {
  const { readFile } = await import("node:fs/promises");
  const { get_encoding } = await import("tiktoken");
  const vectors = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/investigation-tokenizer-vectors.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const encoder = get_encoding("o200k_base");
  try {
    for (const v of vectors.vectors)
      assert.deepEqual([...encoder.encode(v.text, [], [])], v.tokens);
  } finally {
    encoder.free();
  }
});

test("activation: pending handoff cannot enable credentials, arbitrary fields or extra slots", async () => {
  const { readFile } = await import("node:fs/promises");
  const pending = JSON.parse(
    await readFile(
      new URL("../docs/examples/d040-activation-pending.json", import.meta.url),
      "utf8",
    ),
  );
  assert.throws(() => live.validateActivation(pending));
  const hermetic = {
    ...pending,
    project_id: "proj_HERMETIC",
    validated_head: "0".repeat(40),
    ci_url: "https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/1",
    total_worst_case_usd: 0.4608,
    confirmations: Object.fromEntries(
      Object.keys(pending.confirmations).map((key) => [
        key,
        "Hermetic fixture only; not actual account confirmation",
      ]),
    ),
  };
  assert.doesNotThrow(() => live.validateActivation(hermetic));
  for (const extra of [
    { max_calls: 49 },
    { fresh_retry_slots: 1 },
    { max_usd_minor: 97 },
    { credential: "must never be retained here" },
  ])
    assert.throws(() => live.validateActivation({ ...hermetic, ...extra }));
});

test("activation v2: counting allowance and complete combined cost fail closed", async () => {
  const { readFile } = await import("node:fs/promises");
  const pending = JSON.parse(
    await readFile("docs/examples/d040-activation-pending.json", "utf8"),
  );
  const c = {
    ...pending,
    schema_version: "comparison-activation.v2",
    project_id: "proj_HERMETIC",
    validated_head: "0".repeat(40),
    ci_url: "https://github.com/Mehtapozkan/fieldruntime-core/actions/runs/1",
    total_worst_case_usd: 0.768,
    confirmations: Object.fromEntries(
      Object.keys(pending.confirmations).map((k) => [
        k,
        "Hermetic fixture only; no actual account confirmation",
      ]),
    ),
    counting: {
      max_calls: 48,
      retries: 0,
      max_charge_usd_micros_per_call: 6400,
      pricing_and_data_controls:
        "Hermetic fixture only; no actual account confirmation",
    },
  };
  assert.doesNotThrow(() => live.validateActivation(c));
  for (const change of [
    { max_calls: 49 },
    { retries: 1 },
    { max_charge_usd_micros_per_call: null },
    { max_charge_usd_micros_per_call: 10401 },
    { pricing_and_data_controls: "unknown pricing" },
  ])
    assert.throws(() =>
      live.validateActivation({ ...c, counting: { ...c.counting, ...change } }),
    );
  assert.throws(() =>
    live.validateActivation({ ...c, total_worst_case_usd: 0.4608 }),
  );
  assert.throws(
    () =>
      live.createLiveComparisonPort(c, { credentialPath: "/hermetic/only" }),
    /Count evidence/,
  );
});
