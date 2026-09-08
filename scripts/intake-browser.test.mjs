// Real browser + disposable PostgreSQL/API, using the existing test-host pattern.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { intakeHost } from "../tests/helpers/intake-postgres.mjs";
import { intakeInput, editQueue } from "../tests/helpers/intake.mjs";
const screenshotDir = process.env.D9_SCREENSHOT_DIR;
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
async function browserHost(t) {
  const host = await intakeHost(t),
    browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { host, page, errors };
}
async function choose(page) {
  await page
    .getByRole("button", { name: "Review this candidate" })
    .first()
    .click();
  await page.getByLabel("Proposed Case target").selectOption("create");
  await page
    .getByLabel("Review reason / corrections or exclusions")
    .fill(
      "Reviewed North entity, unconfirmed delivery and unknown occurrence. Create a coordination Case; no credit authority.",
    );
  await page.getByLabel("Review reason / corrections or exclusions").focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByLabel("I reviewed the source gaps", { exact: false }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    page.getByLabel("I reviewed the source gaps", { exact: false }),
  ).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Inspect exact commit" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Commit reviewed material" }),
  ).toBeVisible();
}
test("D9-B browser A1/A2/A9/A12: deliberate prepare, inspect, commit, lost response, reload/restart and desktop/390px", async (t) => {
  const { host: h, page, errors } = await browserHost(t),
    before = await h.snapshot();
  await page.goto(`${h.base}/?view=intake`);
  await expect(
    page.getByRole("button", { name: "Use synthetic sample" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(
      () => globalThis.document.activeElement.tagName !== "BODY",
    ),
  );
  await capture(page, "desktop-initial");
  await page.getByRole("button", { name: "Use synthetic sample" }).click();
  await expect(
    page.getByText("note-17.txt · 73 received bytes selected"),
  ).toBeVisible();
  assert.deepEqual(await h.snapshot(), before);
  await page
    .getByRole("button", { name: "Prepare selected synthetic files" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "2 of 2 distinct records interpreted and eligible for review",
    }),
  ).toBeVisible();
  await choose(page);
  await capture(page, "desktop-review");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.window.innerWidth,
    ),
  );
  await capture(page, "mobile-review");
  let lose = true;
  await page.route("**/v1/intake/commits", async (route) => {
    if (lose) {
      lose = false;
      const r = await route.fetch();
      assert.equal(r.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Commit reviewed material" }).click();
  await expect(
    page.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toBeVisible();
  await capture(page, "mobile-uncertain");
  const saved = (await h.snapshot()).intake_commits;
  assert.equal(saved.length, 1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Recover original submission" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Recover original submission" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Original Case receipt recovered" }),
  ).toBeVisible();
  assert.deepEqual((await h.snapshot()).intake_commits, saved);
  await capture(page, "mobile-committed");
  await h.restart();
  await page.reload();
  await expect(
    page.getByText("1 of 2 records have retained Case receipts", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByText("Earlier requests to create or attach evidence", { exact: true })
    .first()
    .click();
  await expect(
    page
      .getByText('"identity_id": "identity_intake_operator"', { exact: false })
      .first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(page, "desktop-reconstructed");
  const stable = await h.snapshot();
  await page.getByRole("button", { name: "Refresh retained evidence" }).click();
  assert.deepEqual(await h.snapshot(), stable);
  assert.deepEqual(errors, []);
});
test("D9-B browser A4/A10/A11: stale inspection needs explicit refresh; altered selection never silently commits", async (t) => {
  const { host: h, page, errors } = await browserHost(t),
    view = await h.prepare();
  await page.goto(`${h.base}/?view=intake`);
  await page
    .getByRole("button", { name: new RegExp("orchid.csv · 2 records") })
    .click();
  await choose(page);
  const changed = editQueue(await intakeInput("changed-browser"), (rows) => {
    rows[0].amount_minor = "1600000";
  });
  const other = await h.prepare(changed);
  await h.ok("/v1/intake/commits", await h.selection(other));
  await page.getByRole("button", { name: "Commit reviewed material" }).click();
  await expect(page.getByRole("alert")).toContainText("No new commit accepted");
  assert.equal((await h.snapshot()).intake_commits.length, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "mobile-stale");
  await page.getByRole("button", { name: "Refresh retained evidence" }).click();
  await expect(
    page.getByRole("button", { name: "Commit reviewed material" }),
  ).toHaveCount(0);
  const target = page.getByLabel("Proposed Case target");
  await target.selectOption("0");
  await page
    .getByLabel("Review reason / corrections or exclusions")
    .fill(
      "Reviewed prior and new source; keep earlier claims as historical material only",
    );
  await page.getByLabel("I reviewed the source gaps", { exact: false }).check();
  await page.getByRole("button", { name: "Inspect exact commit" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to append reviewed evidence" }),
  ).toBeVisible();
  await page
    .getByLabel("Review reason / corrections or exclusions")
    .fill("Changed after inspection");
  await page.getByRole("button", { name: "Commit reviewed material" }).click();
  await expect(page.getByRole("alert")).toContainText("Selection changed");
  assert.equal((await h.snapshot()).intake_commits.length, 1);
  const original = await h.ok(`/v1/intake/bundles/${view.bundle.id}`);
  assert.equal(original.candidates[0].commits.length, 1);
  assert.deepEqual(errors, []);
});

test("D9-B browser: edits during inspection invalidate the response; confirmed receipt survives a failed refresh", async (t) => {
  const { host: h, page, errors } = await browserHost(t);
  await h.prepare();
  await page.goto(`${h.base}/?view=intake`);
  await page.getByRole("button", { name: /orchid.csv · 2 records/ }).click();
  let edit = true;
  await page.route("**/v1/intake/selections/preview", async (route) => {
    const r = await route.fetch();
    if (edit) {
      edit = false;
      await page
        .getByLabel("Review reason / corrections or exclusions")
        .fill("Edited while inspection is in flight");
    }
    await route.fulfill({ response: r });
  });
  await page
    .getByRole("button", { name: "Review this candidate" })
    .first()
    .click();
  await page.getByLabel("Proposed Case target").selectOption("create");
  await page
    .getByLabel("Review reason / corrections or exclusions")
    .fill("Initial review");
  await page.getByLabel("I reviewed the source gaps", { exact: false }).check();
  await page.getByRole("button", { name: "Inspect exact commit" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Selection changed during inspection",
  );
  await expect(
    page.getByRole("button", { name: "Commit reviewed material" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Inspect exact commit" }).click();
  await expect(
    page.getByRole("button", { name: "Commit reviewed material" }),
  ).toBeVisible();
  await page.route("**/v1/intake/bundles/*", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Commit reviewed material" }).click();
  await expect(
    page.getByRole("heading", { name: "Material reviewed into Case" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Confirmed Case receipt retained",
  );
  assert.equal((await h.snapshot()).intake_commits.length, 1);
  await expect(
    page.getByRole("button", { name: "Recover original submission" }),
  ).toHaveCount(0);
  assert.deepEqual(errors, []);
});
