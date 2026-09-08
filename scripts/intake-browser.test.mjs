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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
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

test("D9 retry amendment: two tabs cannot overwrite or send around an unresolved command", async (t) => {
  const { host: h, page: a } = await browserHost(t),
    b = await a.context().newPage();
  for (const page of [a, b]) {
    await page.goto(`${h.base}/?view=intake`);
    await page.getByRole("button", { name: "Use synthetic sample" }).click();
  }
  let aBody,
    bWrites = 0;
  await a.route("**/v1/intake/preparations", async (route) => {
    aBody = route.request().postData();
    assert.equal((await route.fetch()).status(), 200);
    await route.abort("failed");
  });
  b.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/preparations")) bWrites++;
  });
  await a
    .getByRole("button", { name: "Prepare selected synthetic files" })
    .click();
  await expect(
    a.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toBeVisible();
  await b
    .getByRole("button", { name: "Prepare selected synthetic files" })
    .click();
  await b.waitForFunction(() =>
    globalThis.document.querySelector('[role="alert"], .intake-confirmed'),
  );
  try {
    await expect(b.getByRole("alert")).toContainText("Another tab");
  } finally {
    t.diagnostic(JSON.stringify({ second_tab_writes: bWrites }));
  }
  assert.equal(bWrites, 0);
  const retained = await b.evaluate(async () => {
    const { pendingIntakeStorage } = await import("/intake-client.js");
    return pendingIntakeStorage().get();
  });
  assert.equal(retained.body, aBody);
  await h.restart();
  await b.reload();
  await b.getByRole("button", { name: "Recover original submission" }).click();
  await expect(
    b.getByRole("heading", {
      name: "Preparation retained — review still required",
    }),
  ).toBeVisible();
  await a.reload();
  await expect(
    a.getByRole("button", { name: "Recover original submission" }),
  ).toHaveCount(0);
  assert.equal((await h.snapshot()).intake_bundles.length, 1);
});

test("D9 retry amendment: simultaneous IndexedDB claims and conditional clears agree across actual tabs", async (t) => {
  const { host: h, page: a } = await browserHost(t),
    b = await a.context().newPage();
  for (const page of [a, b]) await page.goto(`${h.base}/?view=intake`);
  const commands = [
    { path: "/v1/intake/preparations", body: "first exact bytes" },
    { path: "/v1/intake/commits", body: "second exact bytes" },
  ];
  const claim = (page, command) =>
    page.evaluate(async (command) => {
      const { pendingIntakeStorage } = await import("/intake-client.js");
      try {
        return await pendingIntakeStorage().set(command);
      } catch {
        return false;
      }
    }, command);
  const get = (page) =>
    page.evaluate(async () =>
      (await import("/intake-client.js")).pendingIntakeStorage().get(),
    );
  const clear = (page, command) =>
    page.evaluate(
      async (command) =>
        (await import("/intake-client.js"))
          .pendingIntakeStorage()
          .clear(command),
      command,
    );
  const result = await Promise.all([
    claim(a, commands[0]),
    claim(b, commands[1]),
  ]);
  assert.equal(result.filter(Boolean).length, 1);
  const winner = commands[result[0] ? 0 : 1],
    other = commands[result[0] ? 1 : 0];
  assert.deepEqual(await get(a), winner);
  assert.deepEqual(await get(b), winner);
  assert.equal(await clear(b, other), false);
  assert.deepEqual(await get(a), winner);
  assert.equal(await clear(a, winner), true);
  assert.equal(await claim(b, other), true);
  assert.equal(await clear(a, winner), false);
  await a.reload();
  assert.deepEqual(await get(a), other);
  // A storage implementation that reports an unsuccessful claim cannot send.
  const stopped = await a.evaluate(async () => {
    const { createIntakeClient } = await import("/intake-client.js");
    let writes = 0;
    const client = createIntakeClient({
      storage: { set: async () => false, get: async () => null },
      fetcher: async () => {
        writes++;
        throw new Error("must not send");
      },
    });
    await client.write("preparations", { idempotency_key: "not-saved" });
    return { writes, error: client.state.error };
  });
  assert.equal(stopped.writes, 0);
  assert.match(stopped.error, /claim failed/);
});

test("D9 retry amendment: late completion cannot clear a newer command; another tab reload recovers it", async (t) => {
  const { host: h, page: a } = await browserHost(t),
    b = await a.context().newPage();
  for (const page of [a, b]) {
    await page.goto(`${h.base}/?view=intake`);
    await page.evaluate(async () => {
      const { createIntakeClient } = await import("/intake-client.js");
      globalThis.window.retryClient = createIntakeClient();
      await globalThis.window.retryClient.load();
    });
  }
  const first = await intakeInput("tab-original"),
    next = editQueue(await intakeInput("tab-next"), (rows) => {
      rows[0].amount_minor = "1600000";
    });
  let lose = true;
  await a.route("**/v1/intake/preparations", async (route) => {
    const response = await route.fetch();
    if (lose) {
      lose = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await a.evaluate(
    (input) => globalThis.window.retryClient.write("preparations", input),
    first,
  );
  await b.evaluate(() => globalThis.window.retryClient.load());
  let release, reached;
  const held = new Promise((resolve) => {
      release = resolve;
    }),
    ready = new Promise((resolve) => {
      reached = resolve;
    });
  await b.route("**/v1/intake/preparations", async (route) => {
    const response = await route.fetch();
    reached();
    await held;
    await route.fulfill({ response });
  });
  const late = b.evaluate(() => globalThis.window.retryClient.retry());
  await ready;
  await a.evaluate(() => globalThis.window.retryClient.retry());
  lose = true;
  await a.evaluate(
    (input) => globalThis.window.retryClient.write("preparations", input),
    next,
  );
  release();
  await late;
  const saved = await b.evaluate(async () =>
    (await import("/intake-client.js")).pendingIntakeStorage().get(),
  );
  assert.deepEqual(JSON.parse(saved.body), next);
  await h.restart();
  await b.reload();
  await expect(
    b.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Recover original submission" }).click();
  await expect(
    b.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toHaveCount(0);
  assert.equal((await h.snapshot()).intake_bundles.length, 2);
  assert.equal((await h.snapshot()).intake_commits.length, 0);
});
