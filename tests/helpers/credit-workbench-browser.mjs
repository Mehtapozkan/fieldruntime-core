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
  const disclosure = page.locator("details[data-review-intervention]");
  if (
    (await disclosure.count()) &&
    !(await disclosure.evaluate((node) => node.open))
  )
    await disclosure.locator("summary").click();
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
async function screenshot(
  page,
  name,
  directory = process.env.D7_SCREENSHOT_DIR,
) {
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  for (const [label, width] of [
    ["desktop", 1440],
    ["mobile", 390],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => globalThis.scrollTo(0, 0));
    await page.screenshot({
      path: `${directory}/${name}-${label}.png`,
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
async function receiptView(page, { status = "reconciled", check, name } = {}) {
  await page.locator('[data-stage="history"]').click();
  await expect(page.locator(`[data-receipt-status="${status}"]`)).toBeVisible();
  await expect(
    page.locator('[data-receipt-stage="remaining"] > summary'),
  ).toContainText("Customer impact and acceptance remain unproven");
  if (check)
    await expect(
      page.locator('[data-receipt-stage="verification"] > summary'),
    ).toContainText(check);
  if (name && process.env.D8_SCREENSHOT_DIR)
    await screenshot(page, name, process.env.D8_SCREENSHOT_DIR);
}
async function controls(page) {
  await page.locator('[data-stage="packet"]').click();
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
    await receiptView(page, { name: "01-awaiting-review" });
    const readOnly = await h.dump();
    const proposal = page.locator('[data-receipt-stage="proposal"] > summary');
    await proposal.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Linked evidence", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await click(page, "refresh");
    await expect(
      page.getByRole("heading", {
        name: "Case progress and evidence",
        exact: true,
      }),
    ).toBeFocused();
    await page.reload();
    await idle(page);
    await expect(page.locator("[data-case-receipt]")).toBeVisible();
    assert.deepEqual(
      await h.dump(),
      readOnly,
      "receipt open/expand/refresh/reload write nothing",
    );
    await controls(page);
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
    await receiptView(page, { name: "02-finance-approved" });
    await expect(
      page.locator('[data-receipt-stage="decisions"] > summary'),
    ).toContainText("Finance approved");
    await controls(page);
    await vote(page, "executive");
    await expect(action(page, "execute-credit")).toBeEnabled();
    await expect(
      page.getByLabel("Reviewer", { exact: true }),
    ).not.toBeVisible();
    const intervention = page.getByText("Review or intervene", { exact: true });
    await intervention.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Reviewer", { exact: true })).toHaveValue(
      "executive",
    );
    await expect(page.getByLabel("Reviewer", { exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(
      page.getByLabel("Reviewer", { exact: true }),
    ).not.toBeVisible();
    await screenshot(page, "03-approvals-complete");
    await receiptView(page, { name: "03-approvals-complete" });
    await controls(page);
    await click(page, "execute-credit");
    await expect(page.locator("#review-current-status")).toContainText(
      "independent check needed",
    );
    await screenshot(page, "04-credit-recorded");
    await receiptView(page, {
      name: "04-credit-recorded",
      check: "No check confirmed",
    });
    await controls(page);
    await click(page, "verify-credit");
    await expect(
      page.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toBeVisible();
    await screenshot(page, "05-independently-checked");
    await receiptView(page, {
      name: "05-independently-checked",
      check: "independently checked",
    });
    await expect(
      page.getByRole("heading", {
        name: "Case progress and evidence",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("[data-case-receipt]")).toContainText(
      "Customer impact and acceptance remain unproven",
    );
    await expect(
      page.locator('[data-receipt-status="reconciled"]'),
    ).toBeVisible();
    const snapshot = await h.dump();
    await page.reload();
    await idle(page);
    await expect(
      page.locator('[data-receipt-stage="verification"] > summary'),
    ).toContainText("independently checked");
    assert.deepEqual(await h.dump(), snapshot);
    await controls(page);
    const url = page.url();
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(url);
    await idle(reopened);
    await expect(
      reopened.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toBeVisible();
    await expect(
      reopened
        .getByText(
          /Customer-reported impact has not been independently confirmed/,
        )
        .first(),
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
      const h = await fixture(t, {
        verification: true,
        ...(kind === "verify-credit" ? { adapter: async () => "success" } : {}),
      });
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
      if (kind === "verify-credit") {
        await expect(
          reopened.getByRole("heading", {
            name: "Last confirmed check: credit mismatch",
            exact: true,
          }),
        ).toBeVisible();
        await expect(reopened.locator("[data-confirmed-credit]")).toContainText(
          "Observed: No credit found",
        );
        await expect(reopened.locator("[data-confirmed-credit]")).toContainText(
          "Sep 6, 2026",
        );
      }
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
    await expect(page.locator("#review-current-status")).toHaveText(
      "Last confirmed check: credit mismatch",
    );
    const confirmed = page.locator("[data-confirmed-credit]");
    await expect(confirmed).toContainText(
      "Expected: one $15,000 USD credit to Orchid",
    );
    await expect(confirmed).toContainText("Observed: No credit found");
    await expect(confirmed).toContainText("Sep 6, 2026");
    await expect(page.locator("[data-current-eligibility]")).toContainText(
      "Current eligibility unconfirmed",
    );
    await expect(page.locator("[data-current-eligibility]")).toContainText(
      "Refresh failed",
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const resultY = await confirmed.evaluate(
        (node) => node.getBoundingClientRect().top,
      );
      const errorY = await page
        .locator("[data-current-eligibility]")
        .evaluate((node) => node.getBoundingClientRect().top);
      assert.ok(
        resultY < errorY,
        "confirmed result leads the separate eligibility notice",
      );
    }
    await expect(action(page, "retry")).toHaveCount(0);
    await screenshot(page, "07-mismatch-refresh-unavailable");
    await receiptView(page, {
      status: "incomplete",
      check: "Last confirmed check: credit mismatch",
      name: "06-mismatch-refresh-unavailable",
    });
    await expect(page.locator("[data-case-receipt]")).toContainText(
      "Observed: No credit found",
    );
    await controls(page);
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
    const selected = (await h.request(CREDIT_ROOT)).current.bindings
      .authority_request_id;
    const priorPacket = await h.read(selected);
    await page.locator('[data-stage="safeguard"]').click();
    await click(page, "evidence");
    await expect(page.locator("#review-current-status")).toContainText(
      "Case changed",
    );
    await expect(action(page, "execute-credit")).toBeDisabled();
    await page.locator('[data-stage="packet"]').click();
    await screenshot(page, "08-changed-evidence");
    await receiptView(page, { name: "07-changed-evidence" });
    await page.locator('[data-receipt-stage="decisions"] > summary').click();
    await expect(
      page.getByText("Not effective in the latest review.", { exact: true }),
    ).toHaveCount(2);
    // A individually valid earlier packet must not be combined with newer Case/action reads.
    await page.route("**/authority-requests/*/packet", (route) =>
      route.fulfill({ json: priorPacket }),
    );
    await click(page, "refresh");
    await receiptView(page, {
      status: "incomplete",
      name: "09-inconsistent-reads",
    });
    await expect(
      page.locator('[data-receipt-stage="decisions"] > summary'),
    ).toContainText("Finance approved");
    await expect(page.locator("[data-case-receipt]")).toContainText(
      "current applicability unconfirmed",
    );
    await page.unroute("**/authority-requests/*/packet");
    await click(page, "refresh");
    await expect(
      page.locator('[data-receipt-status="reconciled"]'),
    ).toBeVisible();
    await controls(page);
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
    await expect(page.locator("#review-current-status")).toContainText(
      "recorded; independent check needed",
    );
    await expect(
      page.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toHaveCount(0);
    await receiptView(page, {
      status: "incomplete",
      check: "No check confirmed for the latest attempt",
    });
    await expect(
      page.locator('[data-receipt-stage="verification"] > summary'),
    ).not.toContainText("mismatch");
    await controls(page);
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
    await page.unroute(`**${CREDIT_ROOT}`);
    await click(page, "refresh");
    await vote(page, "executive", "modify");
    await receiptView(page, { status: "incomplete" });
    await page.locator('[data-receipt-stage="decisions"] > summary').click();
    await page
      .getByRole("button", { name: "Open unapproved replacement", exact: true })
      .click();
    await idle(page);
    await receiptView(page, {
      name: "10-unapproved-replacement",
      check: "independently checked",
    });
    await expect(
      page.getByText(
        "Confirmed review submission; history refresh incomplete",
        { exact: true },
      ),
    ).toHaveCount(0);
    await expect(
      page.getByText("Confirmed review submission · another request", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator('[data-receipt-stage="decisions"] > summary'),
    ).toContainText("No decisions recorded");
    await expect(page.locator("[data-case-receipt]")).toContainText(
      "This action belongs to another request; it did not execute the selected proposal.",
    );
    await page.reload();
    await idle(page);
    await expect(
      page.locator('[data-receipt-stage="decisions"] > summary'),
    ).toContainText("No decisions recorded");
    await expect(
      page.getByRole("button", {
        name: "Inspect predecessor history",
        exact: true,
      }),
    ).toBeVisible();
  });
  test("D7-D browser: a later inconclusive check replaces a successful result despite failed and reordered refresh", async (t) => {
    const h = await fixture(t, { verification: true });
    await h.enroll();
    const { page } = await openBrowser(t, h);
    await prepare(page);
    await approve(page);
    await click(page, "execute-credit");
    await click(page, "verify-credit");
    await expect(
      page.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toBeVisible();
    h.setReaderHook((sql) => {
      if (sql.includes("verification-read-source"))
        throw Error("unavailable read");
    });
    await page.route(`**${CREDIT_ROOT}`, (route) => route.abort("failed"));
    await click(page, "verify-credit");
    await expect(page.locator("#review-current-status")).toHaveText(
      "Check inconclusive",
    );
    await expect(
      page.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-credit-result="inconclusive"]'),
    ).toBeVisible();
    await expect(action(page, "execute-credit")).toHaveCount(0);
    await receiptView(page, {
      status: "incomplete",
      check: "Check inconclusive",
      name: "08-later-inconclusive",
    });
    await expect(
      page.locator('[data-receipt-stage="verification"] > summary'),
    ).not.toContainText("independently checked");
    await controls(page);
    await vote(page, "business", "reject");
    await expect(
      page.locator(".review-notice").filter({
        hasText:
          "This synthetic reviewer is not currently eligible for this decision. Refresh and inspect the authority requirements.",
      }),
    ).toBeVisible();
    await page.unroute(`**${CREDIT_ROOT}`);
    await page.route(`**${CREDIT_ROOT}`, async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.attempts.reverse();
      data.verifications.reverse();
      await route.fulfill({ response, json: data });
    });
    await click(page, "refresh");
    await expect(page.locator("#review-current-status")).toHaveText(
      "Check inconclusive",
    );
    await expect(
      page.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toHaveCount(0);
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
    await expect(page.locator("#review-current-status")).toHaveText(
      "Last confirmed check: credit mismatch",
    );
    await expect(page.locator("[data-current-eligibility]")).toContainText(
      "Refresh failed",
    );
    await expect(
      page.locator('[data-credit-result="verified_simulated_effect"]'),
    ).toHaveCount(0);
    await expect(action(page, "retry")).toHaveCount(0);
    await screenshot(page, "09-wrong-amount");
  });
}
