// Browser acceptance uses the same HTTP server and isolated real PostgreSQL
// fixture as the API regressions. Fault injection is confined to this test host.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { CREDIT_ROOT } from "../../apps/admin/public/credit-client.js";
import { sha256Json } from "../../dist/packages/runtime/src/index.js";
import { PENDING_PREFIX } from "../../apps/admin/public/authority-client.js";

const action = (page, name) => page.locator(`[data-review-action="${name}"]`);
async function idle(page) {
  await expect(page.locator("#stage-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
async function click(page, name) {
  await action(page, name).click();
  await idle(page);
}
async function vote(page, seat, decision = "approve") {
  await page.getByLabel("Reviewer", { exact: true }).selectOption(seat);
  await page.getByLabel("Decision", { exact: true }).selectOption(decision);
  if (decision !== "approve")
    await page
      .getByLabel("Reason (required)")
      .fill("Explicit synthetic intervention.");
  await page
    .getByRole("button", { name: `Record ${decision}`, exact: true })
    .click();
  await idle(page);
}
async function openBrowser(t, h) {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "no browser runtime errors"));
  await page.goto(h.base);
  await idle(page);
  return { browser, context, page };
}
async function screenshot(page, name) {
  if (!process.env.D7_SCREENSHOT_DIR) return;
  await mkdir(process.env.D7_SCREENSHOT_DIR, { recursive: true });
  for (const [label, width] of [
    ["desktop", 1440],
    ["mobile", 390],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => globalThis.scrollTo(0, 0));
    await page.screenshot({
      path: `${process.env.D7_SCREENSHOT_DIR}/${name}-${label}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      true,
      "no horizontal overflow",
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function prepare(page) {
  await click(page, "initialize");
  for (let i = 0; i < 3; i++) await click(page, "prepare");
  await click(page, "fresh");
}
async function approve(page) {
  await vote(page, "finance");
  await vote(page, "executive");
}
export function registerCreditBrowserTests(fixture) {
  test("D7-D browser: complete operator journey, mobile controls, reopen and historical verification", async (t) => {
    const h = await fixture(t, { verification: true });
    await h.enroll();
    const { context, page } = await openBrowser(t, h);
    const empty = await h.dump();
    await page.reload();
    await idle(page);
    assert.deepEqual(await h.dump(), empty, "opening creates nothing");
    await prepare(page);
    await page.getByLabel("Reviewer", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Decision", { exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Record approve", exact: true }),
    ).toBeFocused();
    await screenshot(page, "01-review");
    await vote(page, "finance");
    await expect(page.locator("#review-current-status")).toContainText(
      "Finance approved",
    );
    await expect(
      page.getByText(/Finance approval is already recorded/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record approve", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Decision", { exact: true }).selectOption("reject");
    await expect(
      page.getByRole("button", { name: "Record reject", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("Decision", { exact: true }).selectOption("approve");
    await screenshot(page, "02-finance-approved");
    await vote(page, "executive");
    await expect(action(page, "execute-credit")).toBeEnabled();
    await screenshot(page, "03-approvals-complete");
    await click(page, "execute-credit");
    await expect(page.locator("#review-current-status")).toContainText(
      "independent check needed",
    );
    await screenshot(page, "04-credit-recorded");
    await click(page, "verify-credit");
    await expect(
      page.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toBeVisible();
    await screenshot(page, "05-independently-checked");
    const url = page.url();
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(url);
    await idle(reopened);
    await expect(
      reopened.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toBeVisible();
    await expect(
      reopened.getByText(/Customer impact remains unconfirmed/).first(),
    ).toBeVisible();
    await vote(reopened, "finance", "reject");
    await expect(action(reopened, "verify-credit")).toBeEnabled();
    await click(reopened, "verify-credit");
    await expect(
      reopened.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toBeVisible();
    const view = await h.request(CREDIT_ROOT);
    assert.equal(view.verifications.length, 2);
    assert.equal(view.current.eligible, false);
    assert.equal(view.closure_permission, false);
  });

  for (const kind of ["execute-credit", "verify-credit"])
    test(`D7-D browser: uncertain ${kind} recovers exact bytes after reopening without duplicate effect`, async (t) => {
      const h = await fixture(t, { verification: true });
      await h.enroll();
      const { page, context } = await openBrowser(t, h);
      await prepare(page);
      await approve(page);
      if (kind === "verify-credit") await click(page, "execute-credit");
      let original;
      await page.route("**/simulated-credit-attempts**", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        original = route.request().postData();
        await route.fetch();
        await route.abort("failed");
      });
      await click(page, kind);
      await expect(action(page, "retry")).toBeVisible();
      const saved = await page.evaluate(
        (prefix) =>
          Object.keys(globalThis.localStorage)
            .filter((k) => k.startsWith(prefix))
            .map((k) => JSON.parse(globalThis.localStorage.getItem(k))),
        PENDING_PREFIX,
      );
      assert.equal(saved.length, 1);
      assert.equal(saved[0].body, original);
      const url = page.url();
      await page.close();
      const reopened = await context.newPage();
      const packetReads = "**/authority-requests/*/packet";
      await reopened.route(packetReads, (route) => route.abort("failed"));
      await reopened.goto(url);
      await idle(reopened);
      await expect(action(reopened, "retry")).toBeVisible();
      let retried;
      reopened.on("request", (request) => {
        if (request.method() === "POST") retried = request.postData();
      });
      await click(reopened, "retry");
      assert.equal(retried, original);
      await expect(
        reopened.getByText("Confirmed historical receipt", { exact: true }),
      ).toBeVisible();
      await reopened.unroute(packetReads);
      await click(reopened, "refresh");
      await expect(action(reopened, "retry")).toHaveCount(0);
      const view = await h.request(CREDIT_ROOT);
      assert.equal(view.attempts.length, 1);
      assert.equal(view.verifications.length, kind === "verify-credit" ? 1 : 0);
    });

  test("D7-D browser: unavailable check, confirmed receipt with failed refresh, absence and explicit financial retry", async (t) => {
    let inserts = false;
    const h = await fixture(t, {
      verification: true,
      adapter: async (write) => {
        if (inserts) await write();
        return "success";
      },
    });
    await h.enroll();
    const { page } = await openBrowser(t, h);
    await prepare(page);
    await approve(page);
    await click(page, "execute-credit");
    h.setReaderHook((sql) => {
      if (sql.includes("verification-read-source"))
        throw Error("unavailable read");
    });
    await click(page, "verify-credit");
    await expect(
      page.locator('[data-credit-result="inconclusive"]'),
    ).toBeVisible();
    await expect(action(page, "execute-credit")).toBeDisabled();
    await screenshot(page, "06-inconclusive");
    h.setReaderHook(undefined);
    await page.route(`**${CREDIT_ROOT}`, (route) => route.abort("failed"));
    await click(page, "verify-credit");
    await expect(page.locator('[data-credit-result="mismatch"]')).toBeVisible();
    await expect(
      page.getByText(/confirmed receipt remains recorded/),
    ).toBeVisible();
    await expect(action(page, "retry")).toHaveCount(0);
    await screenshot(page, "07-mismatch-refresh-unavailable");
    await page.unroute(`**${CREDIT_ROOT}`);
    await click(page, "refresh");
    await expect(action(page, "execute-credit")).toBeEnabled();
    assert.equal((await h.request(CREDIT_ROOT)).attempts.length, 1);
    inserts = true;
    await click(page, "execute-credit");
    await click(page, "verify-credit");
    await expect(
      page.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toBeVisible();
    assert.equal((await h.request(CREDIT_ROOT)).attempts.length, 2);
  });

  test("D7-D browser: changed evidence blocks stale execution and demands explicit fresh consent", async (t) => {
    const h = await fixture(t, { verification: true });
    await h.enroll();
    const { page } = await openBrowser(t, h);
    await prepare(page);
    await approve(page);
    await page.locator('[data-stage="safeguard"]').click();
    await click(page, "evidence");
    await expect(page.locator("#review-current-status")).toContainText(
      "Case changed",
    );
    await expect(action(page, "execute-credit")).toBeDisabled();
    await page.locator('[data-stage="packet"]').click();
    await screenshot(page, "08-changed-evidence");
    await click(page, "fresh");
    await expect(page.locator("#review-current-status")).toContainText(
      "Awaiting review",
    );
    await expect(action(page, "execute-credit")).toBeDisabled();
  });

  test("D7-D browser: a confirmed newer attempt and its check remain visible when refresh fails", async (t) => {
    let inserts = false;
    const h = await fixture(t, {
      verification: true,
      adapter: async (write) => {
        if (inserts) await write();
        return "success";
      },
    });
    await h.enroll();
    const { page } = await openBrowser(t, h);
    await prepare(page);
    await approve(page);
    await click(page, "execute-credit");
    await click(page, "verify-credit");
    await expect(page.locator('[data-credit-result="mismatch"]')).toBeVisible();
    inserts = true;
    await page.route(`**${CREDIT_ROOT}`, (route) => route.abort("failed"));
    await click(page, "execute-credit");
    await expect(page.locator('[data-credit-result="mismatch"]')).toHaveCount(
      0,
    );
    await expect(
      page.getByText("Simulated action recorded; independent check needed", {
        exact: true,
      }),
    ).toBeVisible();
    const newer = (await h.request(CREDIT_ROOT)).attempts.at(-1);
    await click(page, "verify-credit");
    await expect(
      page.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toBeVisible();
    assert.equal(
      (await h.request(CREDIT_ROOT)).verifications.at(-1).command.attempt_id,
      newer.id,
    );
    await click(page, "verify-credit");
    assert.equal(
      (await h.request(CREDIT_ROOT)).verifications.at(-1).command.attempt_id,
      newer.id,
    );
    await expect(action(page, "retry")).toHaveCount(0);
  });
  test("D7-D browser: wrong amount is a retained mismatch, never successful verification", async (t) => {
    const h = await fixture(t, { verification: true });
    await h.enroll();
    const { page } = await openBrowser(t, h);
    await prepare(page);
    await approve(page);
    await click(page, "execute-credit");
    const view = await h.request(CREDIT_ROOT);
    const row = structuredClone(view.source);
    row.payload.amount_minor = 999;
    delete row.row_hash;
    row.row_hash = sha256Json(row);
    await h.sql(
      "ALTER TABLE simulated_credit_source DISABLE TRIGGER simulated_source_append_only",
    );
    await h.sql(
      "UPDATE simulated_credit_source SET source_row=$1,row_hash=$2",
      [row, row.row_hash],
    );
    await h.sql(
      "ALTER TABLE simulated_credit_source ENABLE TRIGGER simulated_source_append_only",
    );
    await click(page, "verify-credit");
    await expect(page.locator('[data-credit-result="mismatch"]')).toBeVisible();
    await expect(page.getByText(/Observed: 9.99 USD/)).toBeVisible();
    await expect(
      page.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toHaveCount(0);
    await expect(action(page, "retry")).toHaveCount(0);
    await screenshot(page, "09-wrong-amount");
  });
}
