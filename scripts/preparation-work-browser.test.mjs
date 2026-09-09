import { intakeHash } from "../apps/admin/public/intake-client.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { preparedWork } from "../tests/helpers/preparation-work.mjs";
import { discoveryCommand, variation } from "../tests/helpers/discovery.mjs";
async function host(t, input) {
  const p = await preparedWork(t, input),
    browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(p.h.base + "/?view=intake");
  await page.evaluate((b) => {
    globalThis.localStorage.setItem(
      "fieldruntime.intake.navigation.v1",
      b.bundle_id,
    );
    globalThis.localStorage.setItem(
      "fieldruntime.discovery.navigation.v1",
      JSON.stringify({
        bundle_id: b.bundle_id,
        record_key: b.record_key,
        case_id: b.case_id,
      }),
    );
  }, p.b);
  await page.reload();
  await expect(page.locator(".preparation-work")).toBeVisible();
  assert.deepEqual(errors, []);
  return { ...p, page, context, errors };
}
async function publish(page) {
  await page
    .getByLabel("Selection reason", { exact: true })
    .fill(
      "Synthetic bounded preparation only; business authority remains separate",
    );
  await page
    .getByLabel("I reviewed this exact candidate for preparation only")
    .check();
  await page.getByRole("button", { name: /^Publish for preparation/ }).click();
  await expect(
    page.getByRole("button", { name: /^Prepare evidence-request packet/ }),
  ).toBeEnabled();
}
async function prepare(page) {
  await page
    .getByRole("button", { name: /^Prepare evidence-request packet/ })
    .click();
  await expect(page.locator(".work-progress")).toHaveText(
    "Preparation complete — human task review needed",
  );
}
async function shot(page, name) {
  const dir = process.env.D12_SCREENSHOT_DIR;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    );
    await page.evaluate(() => globalThis.document.activeElement?.blur());
    await page.locator(".preparation-work").scrollIntoViewIfNeeded();
    if (dir) {
      await mkdir(dir, { recursive: true });
      await page.screenshot({
        path: `${dir}/${name}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
test("D12 W1/W6/W9 browser: publish, prepare useful cited packet, task review, reload/restart and read-only disclosures", async (t) => {
  const { h, page, path, errors } = await host(t);
  const before = await h.snapshot();
  await shot(page, "before-publication");
  assert.deepEqual(await h.snapshot(), before);
  await publish(page);
  await shot(page, "eligible");
  await page
    .getByRole("button", { name: /^Prepare evidence-request packet/ })
    .focus();
  await expect(
    page.getByRole("button", { name: /^Prepare evidence-request packet/ }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".work-progress")).toContainText(
    "human task review needed",
  );
  await shot(page, "prepared");
  await expect(page.locator(".preparation-work")).toContainText(
    "DEL-4: An associated source reports confirmation is not supplied",
  );
  await expect(page.locator(".preparation-work")).toContainText(
    "No credit is recommended",
  );
  const after = await h.snapshot();
  await page.getByText("Inspect the unsent follow-up", { exact: true }).click();
  await expect(page.locator(".work-draft pre").first()).toContainText("DEL-4");
  await page
    .getByText("Checklist, scoped reconciliation & step evidence", {
      exact: true,
    })
    .click();
  await page
    .locator(".work-evidence")
    .getByText("Supporting citations", { exact: true })
    .first()
    .click();
  await expect(page.locator(".work-evidence")).toContainText("note-17.txt");
  assert.deepEqual(await h.snapshot(), after);
  await page.getByLabel("Task review reason", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: /^Accept preparation packet/ }),
  ).toBeFocused();
  await page
    .getByLabel("Task review reason", { exact: true })
    .fill("Useful scoped gap packet; no business acceptance");
  await page
    .getByRole("button", { name: /^Accept preparation packet/ })
    .click();
  await expect(page.locator(".work-progress")).toHaveText(
    "Task accepted for preparation",
  );
  await shot(page, "task-accepted");
  const done = await h.snapshot();
  await h.restart();
  await page.reload();
  await expect(page.locator(".work-progress")).toHaveText(
    "Task accepted for preparation",
  );
  assert.deepEqual(await h.snapshot(), done);
  assert.equal((await h.ok(path)).invocations.length, 1);
  assert.deepEqual(errors, []);
});
test("D12 W2 browser varied source facts change the checklist, questions and citations", async (t) => {
  const { page } = await host(
    t,
    await variation("browser-cedar", "conflicting"),
  );
  await publish(page);
  await prepare(page);
  await expect(page.locator(".preparation-work")).toContainText(
    "Cedar / dispute-92",
  );
  await expect(page.locator(".preparation-work")).toContainText(
    "SHIP-22: Associated sources disagree",
  );
  await expect(page.locator(".preparation-work")).not.toContainText("DEL-4");
  await shot(page, "conflicting-cedar");
});
test("D12 W4/W9 confirmed packet remains visible after failed refresh; stale result permits intervention without acceptance", async (t) => {
  const { h, d, page, path } = await host(t);
  await publish(page);
  await page.route("**/v1/intake/preparation-work?**", (route) =>
    route.abort(),
  );
  await page
    .getByRole("button", { name: /^Prepare evidence-request packet/ })
    .click();
  await expect(page.locator(".work-confirmed")).toContainText(
    "Confirmed started receipt",
  );
  await expect(
    page
      .locator(".work-controls")
      .getByRole("button", { name: /^Prepare evidence-request packet/ }),
  ).toBeDisabled();
  await page.unroute("**/v1/intake/preparation-work?**");
  await page.reload();
  await expect(page.locator(".work-progress")).toContainText(
    "human task review needed",
  );
  h.setTime("2026-09-07T16:06:00.000Z");
  await h.ok(d.post, discoveryCommand(await d.get(), "stale-worker"));
  await page.reload();
  await expect(
    page
      .locator(".work-controls")
      .getByRole("button", { name: /^Accept preparation packet/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /^Reject packet/ }),
  ).toBeEnabled();
  await shot(page, "changed-description");
  await page
    .getByLabel("Task review reason", { exact: true })
    .fill("The historical packet requires fresh inputs");
  await page.getByRole("button", { name: /^Reject packet/ }).click();
  await expect(page.locator(".work-progress")).toHaveText("Task rejected");
  assert.equal((await h.ok(path)).invocations[0].current_usable, false);
});
test("D12 W5 browser original command survives lost response, two tabs, competing claim and restart", async (t) => {
  const { h, page, context, path } = await host(t);
  await publish(page);
  const second = await context.newPage();
  second.setDefaultTimeout(12000);
  await second.goto(h.base + "/?view=intake");
  await expect(
    second.getByRole("button", { name: /^Prepare evidence-request packet/ }),
  ).toBeEnabled();
  let saved;
  await page.route("**/v1/intake/preparation-work/commands", async (route) => {
    saved = route.request().postData();
    await route.fetch();
    await route.abort();
  });
  await page
    .getByRole("button", { name: /^Prepare evidence-request packet/ })
    .click();
  await expect(page.getByRole("alert")).toContainText("Submission uncertain");
  let secondPosts = 0;
  second.on("request", (r) => {
    if (r.url().endsWith("/preparation-work/commands") && r.method() === "POST")
      secondPosts++;
  });
  await second
    .getByRole("button", { name: /^Prepare evidence-request packet/ })
    .click();
  await expect(second.getByRole("alert")).toContainText("Another tab");
  assert.equal(secondPosts, 0);
  const before = await h.snapshot();
  await h.restart();
  await page.unroute("**/v1/intake/preparation-work/commands");
  await second.reload();
  await expect(
    second.getByText("Exact saved retry command", { exact: true }),
  ).toBeVisible();
  let retried;
  second.on("request", (r) => {
    if (r.url().endsWith("/preparation-work/commands")) retried = r.postData();
  });
  await second.getByRole("button", { name: /Recover original/ }).click();
  await expect(second.locator(".work-progress")).toContainText(
    "human task review needed",
  );
  await expect.poll(() => retried).toBe(saved);
  await expect(
    second.getByRole("button", { name: /Recover original/ }),
  ).toHaveCount(0);
  assert.deepEqual(await h.snapshot(), before);
  await page.reload();
  await expect(page.locator(".work-progress")).toContainText(
    "human task review needed",
  );
  assert.equal((await h.ok(path)).invocations.length, 1);
});
test("D12 W6 browser correction, independent evaluation and task modification stay separate", async (t) => {
  const { page, h, path } = await host(t);
  await publish(page);
  await prepare(page);
  await page
    .getByText("Correct preparation wording / review evaluation candidate", {
      exact: true,
    })
    .click();
  await page
    .getByLabel("Corrected first evidence request", { exact: true })
    .fill("Identify the scoped evidence owner and permitted retrieval route.");
  await page
    .getByLabel("Correction reason", { exact: true })
    .fill("Improve wording only; new facts remain unknown");
  await page
    .getByRole("button", { name: /^Record wording correction/ })
    .click();
  await expect(page.locator(".work-confirmed")).toContainText(
    "Confirmed correction receipt",
  );
  await page
    .getByText("Correct preparation wording / review evaluation candidate", {
      exact: true,
    })
    .click();
  await expect(page.locator(".work-correction")).toContainText(
    "Evaluation candidate awaits independent review",
  );
  await page
    .getByLabel("Evaluation review reason", { exact: true })
    .fill("Select a regression candidate only");
  await page
    .getByLabel("Synthetic test references", { exact: true })
    .fill("D12 W2 varied Cedar and shared-delivery cases");
  await page
    .getByRole("button", { name: /^Accept evaluation candidate/ })
    .click();
  await expect(page.locator(".work-confirmed")).toContainText(
    "Confirmed evaluation review receipt",
  );
  await page
    .getByLabel("Task review reason", { exact: true })
    .fill(
      "Use an explicitly reviewed implementation change before preparing again",
    );
  await page
    .getByLabel("Proposed modification (required for modify)", { exact: true })
    .fill("Fresh supported worker and separate publication");
  await page.getByRole("button", { name: /^Request modification/ }).click();
  await expect(page.locator(".work-progress")).toHaveText(
    "Modification requested",
  );
  const v = await h.ok(path);
  assert.equal(v.invocations[0].current_usable, false);
  assert.notEqual(
    v.history.find((e) => e.event === "correction").actor.identity_id,
    v.history.find((e) => e.event === "evaluation_review").actor.identity_id,
  );
  await shot(page, "correction-reviewed");
});
test("D12 W5 task-review recovery returns to the original record after another tab navigates elsewhere", async (t) => {
  const { h, page, context, b, path } = await host(t);
  await publish(page);
  await prepare(page);
  await page
    .getByLabel("Task review reason", { exact: true })
    .fill("Reject this exact packet; navigation must not change its target");
  await page.route("**/v1/intake/preparation-work/commands", async (route) => {
    await route.fetch();
    await route.abort();
  });
  await page.getByRole("button", { name: /^Reject packet/ }).click();
  await expect(page.getByRole("alert")).toContainText("Submission uncertain");
  const intake = await h.ok(`/v1/intake/bundles/${b.bundle_id}`),
    other = intake.candidates[1],
    second = await context.newPage();
  second.setDefaultTimeout(12000);
  await second.goto(h.base + "/?view=intake");
  await second.evaluate(
    (target) =>
      globalThis.localStorage.setItem(
        "fieldruntime.discovery.navigation.v1",
        JSON.stringify(target),
      ),
    { bundle_id: b.bundle_id, record_key: other.record_key, case_id: null },
  );
  await second.reload();
  await expect(
    second.getByRole("button", { name: /Recover original/ }),
  ).toBeVisible();
  const before = await h.snapshot();
  await second.getByRole("button", { name: /Recover original/ }).click();
  await expect(second.locator(".work-progress")).toHaveText("Task rejected");
  await expect(
    second.getByRole("button", { name: /Recover original/ }),
  ).toHaveCount(0);
  assert.deepEqual(await h.snapshot(), before);
  assert.equal(
    (await h.ok(path)).invocations[0].review.command.decision,
    "reject",
  );
});
test("D12 W7 browser keeps earlier proof notes historical when a fresh packet has unknown measurements", async (t) => {
  const { page, h, path } = await host(t);
  await publish(page);
  await prepare(page);
  const view = await h.ok(path),
    run = view.invocations[0],
    note = JSON.parse(
      await readFile(
        new URL("../docs/examples/d12-proof-note.v1.json", import.meta.url),
        "utf8",
      ),
    );
  await h.ok("/v1/intake/preparation-work/commands", {
    schema_version: "preparation-proof-note.v1",
    operation: "proof_note",
    purpose: "synthetic_measurement_readiness",
    invocation_id: run.invocation_id,
    expected_work_revision: view.work_revision,
    expected_work_head: view.work_head,
    idempotency_key: "browser-note",
    binding_hash: await intakeHash(run.binding),
    result_hash: run.result_hash,
    note,
    reason: "Synthetic unknown active effort for the original invocation",
  });
  const next = await h.ok(path);
  await h.ok("/v1/intake/preparation-work/commands", {
    schema_version: "preparation-work-command.v1",
    operation: "start",
    binding: next.candidate_binding,
    expected_work_revision: next.work_revision,
    expected_work_head: next.work_head,
    replaces_invocation: run.invocation_id,
    idempotency_key: "new-measurement-unknown",
  });
  await page.reload();
  await page
    .getByText("Proof readiness & separate costs", { exact: true })
    .click();
  await expect(page.locator(".work-proof")).toContainText(
    "Historical invocation · human attention released: unknown",
  );
  assert.ok(
    (await h.ok(path)).invocations
      .at(-1)
      .result.proof_readiness.every((m) => m.value === null),
  );
});
