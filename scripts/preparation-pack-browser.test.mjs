import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import {
  preparedDiscovery,
  discoveryCommand,
} from "../tests/helpers/discovery.mjs";
async function host(t) {
  const h = await intakeHost(t),
    d = await preparedDiscovery(h);
  await h.ok(
    d.post,
    discoveryCommand(await d.get(), "browser-description", "confirm"),
  );
  const brief = await d.get(),
    browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  await page.goto(`${h.base}/?view=intake`);
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
  }, brief.binding);
  await page.reload();
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "proposed",
  );
  return { h, d, brief, context, page };
}
test("D11-B T9 browser: the existing intake brief exposes a separate preparation publication panel", async (t) => {
  const { h, page } = await host(t),
    before = await h.snapshot();
  await expect(
    page.getByRole("heading", { name: "Preparation pack", exact: true }),
  ).toBeVisible({ timeout: 3000 });
  await expect(
    page.getByRole("button", { name: /Publish for preparation/ }),
  ).toBeVisible();
  assert.deepEqual(await h.snapshot(), before);
});

const root =
  "/v1/intake/preparation-packs/pack_synthetic_invoice_dispute_north";
async function capture(page, name) {
  const dir = process.env.D11_SCREENSHOT_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
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
    await page.locator(".preparation-pack").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${dir}/${name}-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function publish(page) {
  await page
    .getByLabel("Selection reason", { exact: true })
    .fill(
      "Reviewed scoped preparation with unknown proof and owner; no business permission",
    );
  await page
    .getByLabel("I reviewed this exact candidate for preparation only")
    .check();
  await page.getByRole("button", { name: /Publish for preparation/ }).click();
}
async function snapshot(h, brief) {
  return h.ok(
    `${root}?bundle_id=${brief.binding.bundle_id}&record_key=${brief.binding.record_key}&case_id=${brief.binding.case_id}`,
  );
}
test("D11-B T1/T5/T7/T9 browser: publish, correction, fresh review, separate publication and stale withdrawal", async (t) => {
  const { h, d, brief, page } = await host(t);
  const before = await h.snapshot();
  await capture(page, "proposed");
  // Keyboard order stays explicit through reason, expiry, consent and publish.
  await page.getByLabel("Selection reason", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Preparation expiry (UTC)")).toBeFocused();
  for (
    let i = 0;
    i < 10 &&
    !(await page
      .getByLabel("I reviewed this exact candidate for preparation only")
      .evaluate((n) => n === globalThis.document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(
    page.getByLabel("I reviewed this exact candidate for preparation only"),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: /Publish for preparation/ }),
  ).toBeFocused();
  await page
    .getByText("Pack findings and cited evidence", { exact: true })
    .click();
  await page
    .locator(".preparation-pack")
    .getByText(/associated document/)
    .first()
    .click();
  await expect(page.locator(".preparation-pack")).toContainText(
    "Delivery confirmation",
  );
  await page
    .getByText("Pack findings and cited evidence", { exact: true })
    .click();
  assert.deepEqual(await h.snapshot(), before);
  await publish(page);
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "published_for_preparation",
  );
  await expect(page.locator(".pack-result h3")).toBeFocused();
  assert.equal(
    (await d.get()).history.length,
    1,
    "publication must reuse description without another confirmation",
  );
  await capture(page, "published");
  await h.restart();
  await page.reload();
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "published_for_preparation",
  );
  assert.equal((await snapshot(h, brief)).history.length, 1);
  h.setTime("2026-09-07T16:06:00.000Z");
  await page
    .getByText("Answer or correct the recorded description", { exact: true })
    .click();
  await page
    .getByLabel("Descriptive answer or correction")
    .fill(
      "The reported contact has changed; scoped proof and the accountable owner remain unknown",
    );
  await page
    .getByLabel("Reason and evidence limits")
    .fill("New descriptive information; no source verification or authority");
  await page.getByRole("button", { name: /Save descriptive answer/ }).click();
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "stale",
  );
  await expect(
    page.getByRole("button", { name: /Publish for preparation/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Withdraw selected pack/ }),
  ).toBeEnabled();
  await capture(page, "stale");
  await page
    .getByText("Confirm a description or improvement discussion", {
      exact: true,
    })
    .click();
  await page
    .getByLabel("Confirmation reason", { exact: true })
    .fill(
      "Fresh description includes the changed contact and remaining uncertainty",
    );
  await page
    .getByRole("button", { name: /Record descriptive confirmation/ })
    .click();
  await expect(
    page.getByRole("button", { name: /Publish for preparation/ }),
  ).toBeEnabled();
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "stale",
  );
  assert.equal((await snapshot(h, brief)).history.length, 1);
  await publish(page);
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "published_for_preparation",
  );
  const v = await snapshot(h, brief);
  assert.equal(v.history.length, 2);
  assert.notEqual(v.history[0].artifact_hash, v.history[1].artifact_hash);
  h.setTime("2026-09-07T18:00:00.000Z");
  await page.getByRole("button", { name: /Refresh retained evidence/ }).click();
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "stale",
  );
  await page
    .getByLabel("Selection reason", { exact: true })
    .fill("Withdraw the expired selection without renewing permission");
  await page.getByRole("button", { name: /Withdraw selected pack/ }).click();
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "withdrawn",
  );
  await capture(page, "withdrawn");
  assert.equal((await snapshot(h, brief)).history.length, 3);
  assert.equal((await d.get()).history.length, 3);
});
test("D11-B T6/T9 browser: confirmed publication survives failed refresh without current permission", async (t) => {
  const { h, brief, page } = await host(t);
  await page.route(`**${root}?*`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Injected read unavailable" }),
    }),
  );
  await publish(page);
  await expect(
    page.getByRole("heading", { name: "Publication recorded", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "unavailable",
  );
  await expect(page.locator(".pack-result")).toContainText(
    "Current selection could not be confirmed",
  );
  await expect(
    page.getByRole("button", { name: /Publish for preparation/ }),
  ).toBeDisabled();
  assert.equal((await snapshot(h, brief)).history.length, 1);
  await page.unroute(`**${root}?*`);
  await page.getByRole("button", { name: /Refresh retained evidence/ }).click();
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "published_for_preparation",
  );
});
test("D11-B T6/T9 browser: two tabs preserve the original uncertain command through restart and completion", async (t) => {
  const { h, brief, page, context } = await host(t),
    second = await context.newPage(),
    sent = [];
  context.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/selections/publication"))
      sent.push(r.postData());
  });
  h.fault({ tag: "COMMIT", after: true });
  await publish(page);
  await expect(page.getByRole("alert")).toContainText("Submission uncertain");
  await second.goto(`${h.base}/?view=intake`);
  await expect(
    second.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toBeVisible();
  await expect(
    second.getByRole("button", { name: /Publish for preparation/ }),
  ).toBeDisabled();
  // A competing tab cannot replace the saved bytes/key even with a valid different command.
  const claim = await second.evaluate(async () => {
    const { pendingIntakeStorage } = await import("/intake-client.js"),
      storage = pendingIntakeStorage(),
      original = await storage.get();
    const body = JSON.parse(original.body);
    body.idempotency_key = "competing-tab";
    try {
      await storage.set({ path: original.path, body: JSON.stringify(body) });
      return false;
    } catch {
      return (await storage.get()).body === original.body;
    }
  });
  assert.equal(claim, true);
  await h.restart();
  await second.reload();
  await second
    .getByRole("button", { name: /Recover original submission/ })
    .click();
  await expect(
    second.getByRole("heading", { name: "Publication recorded", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toHaveCount(0);
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "published_for_preparation",
  );
  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]);
  assert.equal((await snapshot(h, brief)).history.length, 1);
});
test("D11-B T5/T9 browser: stale publication requires refresh and fresh consent, never silent resubmission", async (t) => {
  const { h, d, brief, page } = await host(t),
    sent = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/selections/publication"))
      sent.push(r.postData());
  });
  await h.ok(d.post, discoveryCommand(await d.get(), "outside-correction"));
  await publish(page);
  await expect(page.getByRole("alert")).toContainText("No new commit accepted");
  await expect(
    page.getByRole("button", { name: /Publish for preparation/ }),
  ).toBeDisabled();
  assert.equal(sent.length, 1);
  assert.equal((await snapshot(h, brief)).history.length, 0);
  await page.getByRole("button", { name: /Refresh retained evidence/ }).click();
  await expect(
    page.getByRole("button", { name: /Publish for preparation/ }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("I reviewed this exact candidate for preparation only"),
  ).not.toBeChecked();
  assert.equal(sent.length, 1);
});
test("D11-B T5/T9 browser: independently loaded description and pack cannot silently mix revisions", async (t) => {
  const { h, d, page } = await host(t);
  let once = true;
  await page.route(`**${root}?*`, async (route) => {
    if (once) {
      once = false;
      await h.ok(d.post, discoveryCommand(await d.get(), "between-reads"));
    }
    await route.continue();
  });
  await page.getByRole("button", { name: /Refresh retained evidence/ }).click();
  await expect(page.locator(".preparation-pack")).toHaveAttribute(
    "data-state",
    "unavailable",
  );
  await expect(page.locator(".preparation-pack")).toContainText(
    "read across a change",
  );
  await expect(
    page.getByRole("button", { name: /Publish for preparation/ }),
  ).toBeDisabled();
});
