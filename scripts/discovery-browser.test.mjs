import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import {
  preparedDiscovery,
  discoveryCommand,
  variation,
} from "../tests/helpers/discovery.mjs";
const screenshotDir = process.env.D10_SCREENSHOT_DIR;
async function capture(page, name) {
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await page.evaluate(() => globalThis.window.scrollTo(0, 0));
    await page.screenshot({
      path: `${screenshotDir}/${name}.png`,
      fullPage: true,
    });
  }
}
async function host(t) {
  const h = await intakeHost(t),
    browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { h, context, page, errors };
}
async function open(page, h, name = "orchid.csv") {
  await page.goto(`${h.base}/?view=intake`);
  await page.evaluate(() =>
    globalThis.window.localStorage.removeItem(
      "fieldruntime.discovery.navigation.v1",
    ),
  );
  await page.reload();
  await page
    .getByRole("button", { name: new RegExp(name.replaceAll(".", "\\.")) })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Open workflow brief" })
    .first()
    .click();
  await expect(page.locator(".discovery-brief h2").first()).toBeVisible();
}
async function answer(page, text = "The evidence owner is still unconfirmed") {
  await page.getByLabel("Descriptive answer or correction").fill(text);
  await page
    .getByLabel("Reason and evidence limits")
    .fill("Operator-reported answer; original evidence remains unverified");
}
async function confirm(page, purpose = "discovery_description") {
  const previous = Number(
    (await page.locator(".discovery-result").getAttribute("data-revision")) ??
      0,
  );
  await page
    .getByText("Confirm a description or improvement discussion", {
      exact: true,
    })
    .click();
  await page.getByLabel("Descriptive purpose").selectOption(purpose);
  await page
    .getByLabel("Confirmation reason")
    .fill(
      "Accurate description of the remaining source gaps; no business authorization",
    );
  await page
    .getByRole("button", { name: "Record descriptive confirmation" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Descriptive confirmation recorded" }),
  ).toBeVisible();
  await expect(page.locator(".discovery-result")).toHaveAttribute(
    "data-revision",
    String(previous + 1),
  );
}
async function widths(page) {
  assert.ok(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.window.innerWidth,
    ),
  );
}

test("D10-B browser T1/T5/T9/T12: explicit Case preparation, cited brief, correction, confirmation and restart at desktop/390px", async (t) => {
  const { h, page, errors } = await host(t);
  await h.prepare();
  await open(page, h);
  await expect(
    page.getByRole("button", { name: "Review Case preparation" }),
  ).toBeVisible();
  assert.equal((await h.snapshot()).case_journal.length, 0);
  await page.getByRole("button", { name: "Review Case preparation" }).click();
  await page.getByLabel("Proposed Case target").selectOption("create");
  await page
    .getByLabel("Review reason / corrections or exclusions")
    .fill("Create a synthetic coordination Case for descriptive review only");
  await page.getByLabel("I reviewed the source gaps", { exact: false }).check();
  await page.getByRole("button", { name: "Inspect exact commit" }).click();
  await page.getByRole("button", { name: "Commit reviewed material" }).click();
  await expect(
    page.getByRole("heading", { name: "Material reviewed into Case" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open workflow brief" })
    .first()
    .click();
  await expect(page.locator(".discovery-focus")).toContainText(
    "$15,000.00 reported dispute",
  );
  await expect(page.locator(".discovery-focus")).toContainText(
    "Accountable owner unconfirmed",
  );
  await expect(page.locator(".discovery-focus")).toContainText(
    "does not prove non-delivery",
  );
  const before = await h.snapshot();
  await capture(page, "desktop-initial");
  await page.setViewportSize({ width: 390, height: 844 });
  await widths(page);
  await capture(page, "mobile-initial");
  await page
    .getByText("Cited evidence for this finding", { exact: true })
    .click();
  await expect(page.locator(".discovery-focus")).toContainText(
    "Customer disputes delivery DEL-4",
  );
  assert.deepEqual(await h.snapshot(), before);
  await page
    .getByText("Cited evidence for this finding", { exact: true })
    .click();
  await page
    .getByLabel("Answer a question or correct a finding")
    .selectOption("R3");
  await page.getByLabel("Answer state").selectOption("disputed");
  await answer(
    page,
    "The note describes an evidence gap, not a finding that delivery failed",
  );
  await page.getByLabel("Reason and evidence limits").focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByText("Select supporting citations (optional)", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Save descriptive answer" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Descriptive answer recorded" }),
  ).toBeVisible();
  await expect(page.locator(".discovery-focus")).toContainText(
    "Operator-reported correction (disputed)",
  );
  await capture(page, "mobile-correction");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(page, "desktop-correction");
  await confirm(page);
  await expect(page.locator(".discovery-brief")).toContainText(
    "workflow description",
  );
  await confirm(page, "improvement_discussion");
  await h.restart();
  await page.reload();
  await expect(page.locator(".discovery-brief")).toContainText(
    "workflow description and improvement discussion",
  );
  await page
    .getByText("Seven Discovery records and six loop outputs", { exact: true })
    .click();
  await expect(page.locator(".discovery-brief")).toContainText(
    "Correction Path",
  );
  await page
    .getByText("Seven Discovery records and six loop outputs", { exact: true })
    .click();
  await capture(page, "desktop-confirmed");
  await page.setViewportSize({ width: 390, height: 844 });
  await widths(page);
  await capture(page, "mobile-confirmed");
  const stable = await h.snapshot();
  await page.getByRole("button", { name: "Refresh retained evidence" }).click();
  assert.deepEqual(await h.snapshot(), stable);
  assert.equal(stable.discovery_review_journal.length, 3);
  assert.equal(stable.case_journal.length, 1);
  assert.deepEqual(errors, []);
});
test("D10-B browser T3/T6/T9: second customer, stale answers and explicit carry-forward need fresh annotation and separate confirmation", async (t) => {
  const { h, page, errors } = await host(t),
    d = await preparedDiscovery(
      h,
      await variation("cedar-initial", "reported"),
    );
  await open(page, h, "cedar.csv");
  await expect(page.locator(".discovery-focus")).toContainText(
    "Cedar / INV-908",
  );
  await expect(page.locator(".discovery-focus")).toContainText("$4,200.00");
  await expect(page.locator(".discovery-focus")).toContainText(
    "source reports delivery confirmation",
  );
  await answer(
    page,
    "Ask the dispatch custodian for the claimed source record",
  );
  await page.getByRole("button", { name: "Save descriptive answer" }).click();
  await expect(
    page.getByRole("heading", { name: "Descriptive answer recorded" }),
  ).toBeVisible();
  await confirm(page);
  h.setTime("2026-09-07T16:06:00.000Z");
  await h.prepare(await variation("cedar-conflicting", "conflicting"));
  await page
    .getByText("Answer or correct the recorded description", { exact: true })
    .click();
  await answer(page, "An explicit new interpretation");
  await page.getByRole("button", { name: "Save descriptive answer" }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh");
  assert.equal((await h.snapshot()).discovery_review_journal.length, 2);
  await capture(page, "desktop-stale-submission");
  await page.getByRole("button", { name: "Refresh retained evidence" }).click();
  await expect(page.locator(".discovery-focus")).toContainText(
    "Supplied sources disagree",
  );
  await expect(page.locator(".discovery-controls")).toContainText(
    "Earlier answers and confirmations are historical",
  );
  await capture(page, "desktop-stale");
  await page.setViewportSize({ width: 390, height: 844 });
  await widths(page);
  await capture(page, "mobile-stale");
  await page
    .getByText("Descriptive review history (2 entries)", { exact: true })
    .click();
  await expect(page.locator(".discovery-brief")).toContainText(
    "Ask the dispatch custodian",
  );
  await page
    .getByRole("button", { name: "Use this answer in a new draft" })
    .click();
  assert.equal((await h.snapshot()).discovery_review_journal.length, 2);
  await page.getByRole("button", { name: "Save descriptive answer" }).click();
  await expect(
    page.getByRole("heading", { name: "Descriptive answer recorded" }),
  ).toBeVisible();
  const current = await h.ok(d.path);
  assert.deepEqual(current.current.confirmed_purposes, []);
  assert.equal(current.history.length, 3);
  await confirm(page);
  assert.equal((await h.ok(d.path)).history.length, 4);
  assert.deepEqual(errors, []);
});
test("D10-B browser T7/T9: shared cross-tab claim, lost response, reload, exact recovery and late compare-clear", async (t) => {
  const { h, page, context, errors } = await host(t),
    d = await preparedDiscovery(h);
  await open(page, h);
  const second = await context.newPage();
  await open(second, h);
  const submissions = [];
  let lose = true;
  await context.route("**/discovery-reviews", async (route) => {
    submissions.push(route.request().postData());
    if (lose) {
      lose = false;
      const r = await route.fetch();
      assert.equal(r.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
  await answer(page);
  await page.getByRole("button", { name: "Save descriptive answer" }).click();
  await expect(page.getByRole("alert")).toContainText("Submission uncertain");
  await capture(page, "desktop-uncertain");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "mobile-uncertain");
  await answer(second, "Competing tab must not replace the pending bytes");
  await second.getByRole("button", { name: "Save descriptive answer" }).click();
  await expect(second.getByRole("alert")).toContainText("Another tab");
  assert.equal(submissions.length, 1);
  await h.restart();
  await second.reload();
  await expect(
    second.getByRole("button", { name: "Recover original submission" }),
  ).toBeVisible();
  await second
    .getByRole("button", { name: "Recover original submission" })
    .click();
  await expect(
    second.getByRole("heading", { name: "Descriptive answer recorded" }),
  ).toBeVisible();
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0], submissions[1]);
  assert.equal((await h.snapshot()).discovery_review_journal.length, 1);
  const fresh = await h.ok(d.path),
    command = discoveryCommand(fresh, "new-command", "confirm");
  const claimed = await second.evaluate(async (command) => {
    const { pendingIntakeStorage } = await import("/intake-client.js");
    const store = pendingIntakeStorage();
    return store.set({
      path: `/v1/intake/bundles/${command.bundle_id}/discovery-reviews`,
      body: JSON.stringify(command),
    });
  }, command);
  assert.equal(claimed, true);
  await page
    .getByRole("button", { name: "Recover original submission" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Another tab");
  assert.equal(submissions.length, 2);
  const saved = await page.evaluate(async () => {
    const { pendingIntakeStorage } = await import("/intake-client.js");
    return pendingIntakeStorage().get();
  });
  assert.equal(JSON.parse(saved.body).idempotency_key, "new-command");
  await page.reload();
  await page
    .getByRole("button", { name: "Recover original submission" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Descriptive confirmation recorded" }),
  ).toBeVisible();
  assert.equal((await h.snapshot()).discovery_review_journal.length, 2);
  assert.deepEqual(errors, []);
});
test("D10-B browser T9: confirmed result survives failed refresh and altered/mixed projection cannot imply current confirmation", async (t) => {
  const { h, page, errors } = await host(t),
    d = await preparedDiscovery(h);
  await open(page, h);
  let failRead = false;
  await page.route("**/discovery?**", async (route) => {
    if (failRead)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Read unavailable" }),
      });
    else await route.continue();
  });
  await answer(page);
  failRead = true;
  await page.getByRole("button", { name: "Save descriptive answer" }).click();
  await expect(
    page.getByRole("heading", { name: "Descriptive answer recorded" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Confirmed descriptive review retained",
  );
  await expect(page.locator(".discovery-brief")).toContainText(
    "current applicability has not been refreshed",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Recover original submission" })
      .count(),
    0,
  );
  await capture(page, "desktop-failed-refresh");
  await page.setViewportSize({ width: 390, height: 844 });
  await widths(page);
  await capture(page, "mobile-failed-refresh");
  failRead = false;
  await page.getByRole("button", { name: "Refresh retained evidence" }).click();
  await expect(
    page.getByRole("button", { name: "Save descriptive answer" }),
  ).toBeEnabled();
  await page.unroute("**/discovery?**");
  await page.route("**/discovery?**", async (route) => {
    const r = await route.fetch(),
      body = await r.json();
    body.current.confirmed_purposes = ["discovery_description"];
    await route.fulfill({ response: r, json: body });
  });
  await page.getByRole("button", { name: "Refresh retained evidence" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "could not be reconciled",
  );
  await expect(
    page.getByRole("button", { name: "Save descriptive answer" }),
  ).toBeDisabled();
  assert.equal((await h.ok(d.path)).history.length, 1);
  assert.deepEqual(errors, []);
});

test("D10-B browser T9: an intake command and Discovery command compete for the same atomic slot; failed claim sends nothing", async (t) => {
  const { h, page, context } = await host(t),
    d = await preparedDiscovery(h);
  await open(page, h);
  const other = await context.newPage();
  await other.goto(`${h.base}/?view=intake`);
  // Construct the existing client before the competing command claims the shared slot.
  await other.evaluate(async () => {
    const { createIntakeClient } = await import("/intake-client.js");
    globalThis.competingIntake = createIntakeClient();
  });
  let hold;
  const blocked = new Promise((resolve) => (hold = resolve));
  let pending;
  const received = new Promise((resolve) => (pending = resolve));
  await page.route("**/discovery-reviews", async (route) => {
    const response = await route.fetch();
    pending();
    await blocked;
    await route.fulfill({ response });
  });
  await answer(page);
  await page.getByRole("button", { name: "Save descriptive answer" }).click();
  await received;
  const input = await (
    await import("../tests/helpers/intake.mjs")
  ).intakeInput("competing-intake");
  const before = await h.snapshot();
  const state = await other.evaluate(async (input) => {
    await globalThis.competingIntake.write("preparations", input);
    return {
      error: globalThis.competingIntake.state.error,
      pending: globalThis.competingIntake.state.pending,
    };
  }, input);
  assert.match(state.error, /Another tab/);
  assert.ok(state.pending.path.endsWith("discovery-reviews"));
  assert.deepEqual(await h.snapshot(), before);
  // The other tab explicitly recovers/completes the original command, then claims a new intake command.
  await other.evaluate(() => globalThis.competingIntake.retry());
  await other.evaluate(async (input) => {
    const { pendingIntakeStorage } = await import("/intake-client.js");
    await pendingIntakeStorage().set({
      path: "/v1/intake/preparations",
      body: JSON.stringify(input),
    });
  }, input);
  hold();
  await expect(
    page.getByRole("heading", { name: "Descriptive answer recorded" }),
  ).toBeVisible();
  const saved = await page.evaluate(async () => {
    const { pendingIntakeStorage } = await import("/intake-client.js");
    return pendingIntakeStorage().get();
  });
  assert.equal(JSON.parse(saved.body).idempotency_key, "competing-intake");
  assert.equal((await h.ok(d.path)).history.length, 1);
  await page.reload();
  await page
    .getByRole("button", { name: "Recover original submission" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Preparation retained — review still required",
    }),
  ).toHaveCount(0); // old intake banner is consolidated in the open Discovery view
  await expect(
    page.getByRole("button", { name: "Recover original submission" }),
  ).toHaveCount(0);
  assert.equal((await h.snapshot()).intake_request_bindings.length, 1);
});
