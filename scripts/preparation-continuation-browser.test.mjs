/* global localStorage, document, innerWidth */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium, expect as browserExpect } from "@playwright/test";
import {
  continuation,
  note,
  WORK,
} from "../tests/helpers/preparation-continuation.mjs";
import { syntheticContinuationContext } from "../dist/packages/runtime/src/preparation-work.js";
const expect = browserExpect.configure({ timeout: 20000 });
async function browser(t, h, b) {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(h.base + "/?view=intake");
  await page.evaluate((b) => {
    localStorage.setItem("fieldruntime.intake.navigation.v1", b.bundle_id);
    localStorage.setItem(
      "fieldruntime.discovery.navigation.v1",
      JSON.stringify(b),
    );
  }, b);
  await page.reload();
  await expect(page.locator(".preparation-work")).toBeVisible();
  return { page, context, errors };
}
async function shot(page, name) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.locator(".preparation-work").scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (process.env.D13_CONTINUATION_SCREENSHOTS) {
      await mkdir(process.env.D13_CONTINUATION_SCREENSHOTS, {
        recursive: true,
      });
      await page.screenshot({
        path: `${process.env.D13_CONTINUATION_SCREENSHOTS}/${name}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
test("D13 browser: second DEL-4 packet, independent acceptance, original-key cross-tab recovery and readable citations", async (t) => {
  const x = await continuation(t);
  x.h.setWorkContext(syntheticContinuationContext());
  const next = await x.supply();
  const { h, path } = x,
    { page, context, errors } = await browser(t, h, next.b);
  await expect(page.locator(".work-progress")).toContainText("Task accepted");
  await expect(page.locator(".preparation-work")).toContainText("historical");
  await page
    .getByText("Prepare again — new explicit invocation", { exact: true })
    .click();
  const start = page.getByRole("button", { name: /^Prepare a fresh packet/ });
  await expect(start).toBeEnabled();
  const before = await h.snapshot();
  await shot(page, "fresh-publication-old-packet");
  assert.deepEqual(await h.snapshot(), before);
  let bytes, receipt;
  await page.route(`**${WORK}/commands`, async (route) => {
    bytes = route.request().postData();
    const r = await route.fetch();
    assert.equal(r.status(), 200);
    receipt = await r.json();
    await route.abort();
  });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Submission uncertain");
  await page.unroute(`**${WORK}/commands`);
  await h.restart();
  const other = await context.newPage();
  await other.goto(h.base + "/?view=intake");
  await expect(
    other.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toBeVisible();
  const snap = await h.snapshot();
  const [recovered] = await Promise.all([
    other.waitForResponse((r) => r.url().endsWith(`${WORK}/commands`)),
    other.getByRole("button", { name: /^Recover original submission/ }).click(),
  ]);
  assert.equal(recovered.request().postData(), bytes);
  assert.deepEqual(await recovered.json(), receipt);
  await expect(
    other.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toHaveCount(0);
  assert.deepEqual(await h.snapshot(), snap);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toHaveCount(0);
  await expect(page.locator(".work-progress")).toContainText(
    "human task review needed",
  );
  await expect(page.locator(".work-preview")).toContainText(
    "original DEL-4 confirmation",
  );
  await expect(page.locator(".work-preview")).not.toContainText("DEL-5");
  await expect(page.locator(".preparation-work")).toContainText(
    "underlying proof remains independently unverified",
  );
  await expect(
    page.getByRole("button", { name: /^Accept preparation packet/ }),
  ).toBeEnabled();
  await shot(page, "second-packet-needs-review");
  const citations = page
    .locator(".work-preview .intake-source > summary")
    .first();
  await citations.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".work-preview .intake-source").first(),
  ).toContainText("Delivery confirmation for DEL-4 is supplied");
  await page.keyboard.press("Enter");
  assert.equal((await h.ok(path)).invocations.at(-1).review, null);
  await page
    .getByLabel("Task review reason", { exact: true })
    .fill(
      "The updated evidence/access/owner/terms request is useful; delivery remains unverified",
    );
  await page
    .getByRole("button", { name: /^Accept preparation packet/ })
    .click();
  await expect(page.locator(".work-progress")).toContainText(
    "Task accepted for preparation",
  );
  await expect(page.locator(".preparation-work h2")).toBeFocused();
  await shot(page, "second-packet-task-accepted");
  const done = await h.snapshot();
  await h.restart();
  await page.reload();
  await expect(page.locator(".work-progress")).toContainText("Task accepted");
  assert.deepEqual(await h.snapshot(), done);
  assert.equal((await h.ok(path)).invocations.length, 2);
  assert.deepEqual(errors, []);
});
test("D13 browser: third retained bundle is visibly blocked before submission and reads do not write", async (t) => {
  const x = await continuation(t, { legacy: false });
  const next = await x.supply();
  await x.supply(
    note(x.input, "third", "The evidence access owner remains unknown.\n"),
  );
  const b = {
    ...next.b,
    bundle_id: (await x.h.ok(x.path)).resource_preflight.bundle_ids.find(
      (id) => id !== x.v.bundle.id && id !== next.v.bundle.id,
    ),
  };
  const { page, errors } = await browser(t, x.h, b);
  await expect(page.locator(".work-controls")).toContainText(
    "Preparation blocked before submission",
  );
  await expect(page.locator(".work-controls")).toContainText(
    "retained_bundles 3 exceeds 2",
  );
  await page
    .getByText("Prepare again — new explicit invocation", { exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Prepare a fresh packet/ }),
  ).toBeDisabled();
  const before = await x.h.snapshot();
  await shot(page, "third-bundle-blocked");
  await page.getByText("Preparation input limits", { exact: true }).click();
  await expect(page.locator(".work-controls")).toContainText(
    '"retained_bundles": 3',
  );
  await page.reload();
  await expect(page.locator(".work-controls")).toContainText(
    "Preparation blocked before submission",
  );
  assert.deepEqual(await x.h.snapshot(), before);
  assert.deepEqual(errors, []);
});
