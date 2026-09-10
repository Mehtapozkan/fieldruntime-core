import test from "node:test";
import assert from "node:assert/strict";
import {
  checkFixtureFreeze,
  fixtureInputs,
  decodedSources,
} from "../scripts/lib/investigation-fixtures.mjs";
import { liveComparisonPort } from "../dist/packages/adapters/src/investigation-http.js";
import {
  syntheticComparisonContext,
  syntheticInvestigationContext,
} from "../dist/packages/runtime/src/preparation-work.js";
import {
  assertValidPreparationWorkV3Contract,
  assertValidPreparationWorkV4Contract,
} from "../dist/packages/contracts/src/index.js";
test("readiness: frozen exact 24-case inputs exclude expected answers", async () => {
  assert.equal((await checkFixtureFreeze()).cases, 24);
  for (let i = 1; i <= 24; i++) {
    const inputs = await fixtureInputs(`H${String(i).padStart(2, "0")}`);
    assert.ok(!JSON.stringify(inputs).includes("expected_interpretation"));
  }
});
test("readiness: H17 contains two deliveries with support only for the second", async () => {
  const s = decodedSources(await fixtureInputs("H17"));
  assert.match(s[0].text, /DEL-17A;DEL-17B/);
  assert.deepEqual(s[1].associations, [
    { entity: "entity_north", kind: "delivery", id: "DEL-17B" },
  ]);
  assert.match(s[1].text, /DEL-17B/);
  assert.doesNotMatch(s[1].text, /DEL-17A/);
});
for (const id of ["H23", "H24"])
  test(`readiness: ${id} has actual proof excerpt, terms and named owner bytes`, async () => {
    const s = decodedSources(await fixtureInputs(id));
    const text = s.map((s) => s.text).join("\n");
    assert.match(text, /ORIGINAL DELIVERY EXCERPT/);
    assert.match(text, /TERMS EXCERPT/);
    assert.match(text, /Morgan Test|Casey Test/);
    if (id === "H24") {
      assert.equal((await fixtureInputs(id)).length, 2);
      for (const d of ["DEL-24A", "DEL-24B"])
        assert.ok(
          s.some((s) =>
            s.associations.some((a) => a.kind === "delivery" && a.id === d),
          ),
        );
    }
  });
test("readiness: explicit profile version preserves historical fake contracts", () => {
  const p = syntheticComparisonContext().profile;
  assertValidPreparationWorkV4Contract("profile", p);
  assert.throws(() => assertValidPreparationWorkV3Contract("profile", p));
  assertValidPreparationWorkV3Contract(
    "profile",
    syntheticInvestigationContext().profile,
  );
  assert.throws(() =>
    assertValidPreparationWorkV4Contract("profile", {
      ...p,
      investigation: { ...p.investigation, live_activation: true },
    }),
  );
});
test("readiness: live boundary remains unavailable without reading credentials", () => {
  assert.throws(() => liveComparisonPort(), /Live activation unavailable/);
});

test("readiness: complete call plan covers both model arms and retains unknown costs", async () => {
  const { comparisonCallPlan, blindedPacket } =
    await import("../scripts/lib/investigation-review-export.mjs");
  const p = comparisonCallPlan();
  assert.equal(p.total_planned_calls, 48);
  assert.equal(p.total_reservation_usd_minor, 96);
  assert.equal(p.total_price_ceiling_usd, p.per_call_price_ceiling_usd * 48);
  assert.equal(p.fresh_retry_slots, 0);
  const e = blindedPacket("H01", null, [], "X");
  assert.equal(e.status, "not_run");
  assert.equal(e.costs.model_usd, null);
  assert.equal(e.review.serious_errors, null);
});
