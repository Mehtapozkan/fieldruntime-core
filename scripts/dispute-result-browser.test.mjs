/* global localStorage, document, innerWidth */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium, expect as browserExpect } from "@playwright/test";
import { resultHost, COMMAND } from "../tests/helpers/dispute-result.mjs";
const expect = browserExpect.configure({ timeout: 25000 });
async function browser(t, x) {
  const engine = await chromium.launch();
  t.after(() => engine.close());
  const context = await engine.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(x.h.base + "/?view=intake");
  const v = await x.get();
  const bundle = x.flow
    ? (await x.h.ok(x.flow.path)).invocations.at(-1).binding.basis.discovery
        .bundle_id
    : x.first.selection.bundle_id;
  await page.evaluate(
    (b) => {
      localStorage.setItem("fieldruntime.intake.navigation.v1", b.bundle_id);
      localStorage.setItem(
        "fieldruntime.discovery.navigation.v1",
        JSON.stringify(b),
      );
    },
    {
      bundle_id: bundle,
      case_id: v.binding.case_id,
      record_key: v.binding.record_key,
    },
  );
  await page.reload();
  try {
    await page
      .getByRole("button", {
        name: "Follow this dispute’s result",
        exact: true,
      })
      .click();
  } catch (e) {
    console.log(
      "Browser startup errors",
      errors,
      await page.locator("body").innerText(),
    );
    throw e;
  }
  await expect(page.locator(".dispute-result")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh result evidence", exact: true }),
  ).toBeEnabled();
  return { page, context, errors };
}
async function submit(page, label) {
  let r;
  try {
    [r] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(COMMAND)),
      page.getByRole("button", { name: new RegExp("^" + label) }).click(),
    ]);
  } catch (e) {
    console.log(label, await page.locator("body").innerText());
    throw e;
  }
  assert.equal(r.status(), 200, await r.text());
  await expect(
    page.getByRole("button", { name: "Refresh result evidence", exact: true }),
  ).toBeEnabled();
  return r.json();
}
async function shot(page, name) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.locator(".dispute-result").scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (process.env.D039_UI_SCREENSHOTS) {
      await mkdir(process.env.D039_UI_SCREENSHOTS, { recursive: true });
      await page.locator(".dispute-result h2").first().scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${process.env.D039_UI_SCREENSHOTS}/${name}-${width}-viewport.png`,
      });
      await page.locator(".result-controls").screenshot({
        path: `${process.env.D039_UI_SCREENSHOTS}/${name}-${width}-controls.png`,
      });
      await page.screenshot({
        path: `${process.env.D039_UI_SCREENSHOTS}/${name}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
test("D039 Workbench: deliberate enrollment and normal-source mismatch; no writes on reads", async (t) => {
  const x = await resultHost(t, { prepare: true }),
    { page, errors } = await browser(t, x);
  const before = await x.h.snapshot();
  await expect(page.locator(".dispute-result")).toContainText("DEL-4");
  await expect(page.locator(".dispute-result")).toContainText("$15,000.00");
  const skip = page.locator(".skip-link");
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#stage-content")).toBeFocused();
  const disclosure = page.locator(".result-prepared > summary");
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".result-prepared > pre")).toBeVisible();
  await page.keyboard.press("Enter");
  const enroll = page.getByRole("button", {
    name: "Enroll this exact synthetic dispute",
    exact: true,
  });
  await enroll.focus();
  await expect(enroll).toBeFocused();
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() => document.activeElement?.tagName !== "BODY"),
  );
  await page.locator(".result-next-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#dispute-result-controls")).toBeFocused();
  await shot(page, "prepared-work");
  await page
    .getByRole("button", { name: "Refresh result evidence", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Enroll this exact synthetic dispute",
      exact: true,
    }),
  ).toBeEnabled();
  assert.deepEqual(await x.h.snapshot(), before);
  await submit(page, "Enroll this exact synthetic dispute");
  await submit(page, "Create result candidate");
  await submit(page, "Check original proof and terms");
  await submit(page, "Request business authority");
  await page
    .getByLabel("Business authority review reason", { exact: true })
    .fill(
      "Morgan reviews the exact synthetic DEL-4 basis; payment remains due.",
    );
  await submit(page, "Approve no-adjustment decision");
  await submit(page, "Record no-financial-action decision");
  await page
    .getByLabel("What was reported?", { exact: true })
    .fill(
      "Reporter states the synthetic disposition was recorded; not source proof.",
    );
  await page
    .getByLabel("Report evidence reference", { exact: true })
    .fill("synthetic://report/dispute-17/disposition");
  await submit(page, "Record reported disposition");
  const checked = await submit(page, "Check disposition source");
  assert.equal(checked.entry.data.comparison.status, "mismatch");
  await expect(page.locator(".dispute-result")).toContainText(
    "Last confirmed check: disposition mismatch",
  );
  await expect(page.locator(".result-comparison")).toContainText("open");
  await expect(page.locator(".dispute-result")).toContainText(
    "Business acceptance unavailable",
  );
  assert.equal((await x.get()).current.accepted, false);
  await shot(page, "normal-source-mismatch");
  assert.deepEqual(errors, []);
});

test("D039 Workbench: separate acceptance, cross-tab lost-response recovery, restart and reversal", async (t) => {
  const x = await resultHost(t);
  await x.authorized();
  await x.reported();
  await x.transition();
  const { page, context, errors } = await browser(t, x);
  await submit(page, "Check disposition source");
  await page
    .getByLabel("Business acceptance reason", { exact: true })
    .fill(
      "Robin accepts only this independently checked synthetic portion; payment follow-up remains owned.",
    );
  await page
    .getByLabel("Payment follow-up due (UTC)", { exact: true })
    .fill("2026-09-08T16:06");
  const other = await context.newPage();
  await other.goto(x.h.base + "/?view=intake");
  await expect(
    other.getByRole("button", {
      name: "Accept this exact business result",
      exact: true,
    }),
  ).toBeEnabled();
  let bytes,
    receipt,
    postCount = 0;
  await page.route(`**${COMMAND}`, async (route) => {
    bytes = route.request().postData();
    const r = await route.fetch();
    assert.equal(r.status(), 200);
    receipt = await r.json();
    await route.abort();
  });
  await page
    .getByRole("button", {
      name: "Accept this exact business result",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Submission uncertain");
  other.on("request", (r) => {
    if (r.url().endsWith(COMMAND)) {
      postCount++;
      if (postCount === 1) assert.equal(r.postData(), bytes);
    }
  });
  await other
    .getByLabel("Business acceptance reason", { exact: true })
    .fill("A competing decision must not replace the unresolved command");
  await other
    .getByLabel("Payment follow-up due (UTC)", { exact: true })
    .fill("2026-09-08T16:06");
  await other
    .getByRole("button", {
      name: "Accept this exact business result",
      exact: true,
    })
    .click();
  await expect(other.getByRole("alert")).toContainText("Another tab");
  assert.equal(postCount, 0);
  await page.unroute(`**${COMMAND}`);
  await x.h.restart();
  await other.reload();
  await expect(
    other.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toBeVisible();
  const snapshot = await x.h.snapshot();
  const recovered = await submit(other, "Recover original submission");
  assert.deepEqual(recovered, receipt);
  assert.deepEqual(recovered.entry.command, JSON.parse(bytes));
  assert.deepEqual(await x.h.snapshot(), snapshot);
  await expect(other.locator(".result-acceptance")).toContainText(
    "remains accepted",
  );
  await expect(other.locator(".result-acceptance")).toContainText("Morgan");
  await expect(other.locator(".result-acceptance")).toContainText("9/8/2026");
  await shot(other, "accepted-result");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Original submission needs recovery" }),
  ).toHaveCount(0);
  await expect(page.locator(".result-acceptance")).toContainText(
    "remains accepted",
  );
  assert.deepEqual(await x.h.snapshot(), snapshot);
  const source = structuredClone(x.source);
  source.revision++;
  source.pod.rescinded = true;
  source.ar.status = "reopened";
  source.ar.active_grounds = ["non_delivery"];
  x.setSource(source);
  await submit(page, "Check disposition source");
  await expect(page.locator(".result-acceptance")).toContainText(
    "Historical acceptance only",
  );
  await page.locator(".result-interventions > summary").click();
  await page
    .getByLabel("Business intervention reason", { exact: true })
    .fill(
      "Independent source retracted proof and reopened the exact DEL-4 dispute",
    );
  await submit(page, "Reopen accepted result");
  await expect(page.locator(".dispute-result")).toContainText(
    "Result reopened",
  );
  assert.equal((await x.get()).proof_measures.disputes_resolved, 0);
  await shot(page, "reopened-result");
  assert.deepEqual(errors, []);
});

test("D039 Workbench: confirmed mismatch survives failed refresh; later inconclusive and new candidate inherit no success", async (t) => {
  const x = await resultHost(t);
  await x.authorized();
  await x.reported();
  await x.transition();
  await x.check();
  await x.accept();
  const { page, errors } = await browser(t, x);
  const source = structuredClone(x.source);
  source.revision++;
  source.ar.status = "open";
  x.setSource(source);
  await page.route("**/v1/intake/dispute-results?*", (route) => route.abort());
  const checked = await submit(page, "Check disposition source");
  assert.equal(checked.entry.data.comparison.status, "mismatch");
  await expect(page.locator(".result-confirmed-title")).toHaveText(
    "Last confirmed check: disposition mismatch",
  );
  await expect(page.locator(".result-comparison")).toContainText(
    "Observed AR: open",
  );
  await expect(page.locator(".dispute-result")).toContainText(
    "Current eligibility is unconfirmed",
  );
  await expect(page.locator(".result-acceptance")).toContainText(
    "Historical acceptance only",
  );
  await shot(page, "mismatch-refresh-failed");
  await page.unroute("**/v1/intake/dispute-results?*");
  await page
    .getByRole("button", { name: "Refresh result evidence", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check disposition source", exact: true }),
  ).toBeEnabled();
  x.h.setResultReader(async () => {
    throw new Error("test-host read unavailable");
  });
  await submit(page, "Check disposition source");
  await expect(page.locator(".result-confirmed-title")).toHaveText(
    "Last confirmed check: result inconclusive",
  );
  await expect(page.locator(".dispute-result")).toContainText(
    "not evidence of absence",
  );
  assert.equal((await x.get()).proof_measures.disputes_resolved, null);
  await shot(page, "inconclusive-result");
  await page.locator(".result-interventions > summary").click();
  await expect(
    page.getByRole("button", { name: "Reopen accepted result", exact: true }),
  ).toBeDisabled();
  await submit(page, "Create fresh result candidate");
  await expect(page.locator(".result-confirmed-title")).toHaveText(
    "Original proof and terms still need checking",
  );
  await expect(page.locator(".result-acceptance")).toContainText(
    "Historical acceptance only",
  );
  await expect(page.locator(".result-acceptance")).toContainText("Morgan");
  await expect(page.locator(".result-history")).toContainText("accept");
  assert.deepEqual(errors, []);
});

for (const decision of ["reject", "modify", "escalate"])
  test(`D039 Workbench: ${decision} authority after permission expires; historical source check stays independent`, async (t) => {
    const x = await resultHost(t);
    await x.authorized();
    const { page, errors } = await browser(t, x);
    x.h.setTime("2026-09-07T16:22:00.000Z");
    await page
      .getByRole("button", { name: "Refresh result evidence", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Check disposition source",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(page.locator(".dispute-result")).toContainText(
      "Business acceptance unavailable",
    );
    await page
      .getByText("Morgan: review or intervene", { exact: true })
      .click();
    await page
      .getByLabel("Business authority intervention reason", { exact: true })
      .fill(
        "Current operator explicitly intervenes; no prior permission is renewed",
      );
    const label = `${decision === "modify" ? "Replace" : decision[0].toUpperCase() + decision.slice(1)} authority after recorded decision`;
    const [r] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(COMMAND)),
      page.getByRole("button", { name: label, exact: true }).click(),
    ]);
    // The request is expired; every intervention is refused by current lifecycle checks.
    assert.equal(r.status(), 409, await r.text());
    await expect(page.getByRole("alert")).toContainText("Refresh");
    await page
      .getByRole("button", { name: "Refresh result evidence", exact: true })
      .click();
    {
      await expect(
        page.getByRole("button", {
          name: "Check disposition source",
          exact: true,
        }),
      ).toBeEnabled();
      await submit(page, "Check disposition source");
    }
    assert.equal((await x.get()).current.accepted, false);
    assert.deepEqual(errors, []);
  });

for (const decision of ["reject", "modify", "escalate"])
  test(`D039 Workbench: current ${decision} preserves authority interventions and replacement review`, async (t) => {
    const x = await resultHost(t);
    await x.enroll();
    await x.candidate();
    await x.basis();
    await x.request();
    await x.decide();
    const { page, errors } = await browser(t, x);
    await page.locator(".result-authority > summary").click();
    await page
      .getByLabel("Business authority review reason", { exact: true })
      .fill(
        "Morgan explicitly changes the reviewed decision; earlier approval must not transfer",
      );
    const labels = {
      reject: "Reject authority request",
      modify: "Replace authority request — fresh review",
      escalate: "Escalate authority request",
    };
    await submit(page, labels[decision]);
    const v = await x.get();
    assert.equal(v.authority.current.authorized, false);
    if (decision === "modify") {
      assert.equal(v.authority.review_revision, 0);
      assert.deepEqual(v.authority.current.effective_approval_ids, []);
    } else
      assert.equal(
        v.authority.current.lifecycle,
        decision === "reject" ? "rejected" : "escalated",
      );
    await expect(
      page.getByRole("button", {
        name: "Record no-financial-action decision",
        exact: true,
      }),
    ).toBeDisabled();
    await x.h.restart();
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Record no-financial-action decision",
        exact: true,
      }),
    ).toBeDisabled();
    assert.deepEqual(errors, []);
  });

test("D039 Workbench: stale inspected review, altered read scope and rejected business result fail closed", async (t) => {
  const x = await resultHost(t);
  await x.enroll();
  await x.candidate();
  await x.basis();
  await x.request();
  const { page, errors } = await browser(t, x);
  await page
    .getByLabel("Business authority review reason", { exact: true })
    .fill("This was the inspected R0 material");
  await x.decide(); // another operator advances R after the displayed read
  const before = await x.h.snapshot();
  const [denied] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(COMMAND)),
    page
      .getByRole("button", {
        name: "Approve no-adjustment decision",
        exact: true,
      })
      .click(),
  ]);
  assert.equal(denied.status(), 409);
  assert.equal((await denied.json()).error, "REVIEW_BINDING_CONFLICT");
  await expect(page.getByRole("alert")).toContainText("Refresh");
  assert.deepEqual(await x.h.snapshot(), before);
  await page.route("**/v1/intake/dispute-results?*", async (route) => {
    const r = await route.fetch(),
      v = await r.json();
    v.subject.delivery_id = "DEL-5";
    await route.fulfill({ response: r, json: v });
  });
  await page
    .getByRole("button", { name: "Refresh result evidence", exact: true })
    .click();
  await expect(page.locator(".dispute-result")).toContainText(
    "could not be reconciled",
  );
  await expect(
    page.getByRole("button", {
      name: "Record no-financial-action decision",
      exact: true,
    }),
  ).toBeDisabled();
  assert.deepEqual(await x.h.snapshot(), before);
  await page.unroute("**/v1/intake/dispute-results?*");
  await page
    .getByRole("button", { name: "Refresh result evidence", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Record no-financial-action decision",
      exact: true,
    }),
  ).toBeEnabled();
  await page.locator(".result-interventions > summary").click();
  await page
    .getByLabel("Business intervention reason", { exact: true })
    .fill(
      "Robin rejects the scoped result candidate; do not transfer its earlier consent",
    );
  await submit(page, "Reject business result");
  assert.equal((await x.get()).current.status, "rejected");
  await expect(page.locator(".result-confirmed-title")).toHaveText(
    "Business result rejected",
  );
  await page.locator(".result-interventions > summary").click();
  await submit(page, "Create fresh result candidate");
  assert.equal((await x.get()).authority, null);
  assert.deepEqual(errors, []);
});

test("D039 Workbench: accepted history expires; unavailable and wrong-record source checks never renew permission", async (t) => {
  const x = await resultHost(t);
  await x.authorized();
  await x.reported();
  await x.transition();
  await x.check();
  await x.accept();
  const { page, errors } = await browser(t, x);
  x.h.setTime("2026-09-07T16:22:00.000Z");
  await page
    .getByRole("button", { name: "Refresh result evidence", exact: true })
    .click();
  await expect(page.locator(".dispute-result")).toContainText(
    "stale or expired",
  );
  await expect(page.locator(".result-acceptance")).toContainText(
    "Historical acceptance only",
  );
  assert.equal((await x.get()).current.status, "stale");
  await shot(page, "stale-acceptance");
  const source = structuredClone(x.source);
  source.revision++;
  source.pod.subject.dispute_id = "dispute-18";
  x.setSource(source);
  const receipt = await submit(page, "Check disposition source");
  assert.equal(receipt.entry.data.comparison.status, "inconclusive");
  await expect(page.locator(".dispute-result")).toContainText("attribution");
  await expect(
    page.getByRole("button", {
      name: "Accept this exact business result",
      exact: true,
    }),
  ).toHaveCount(0);
  assert.deepEqual(errors, []);
});

test("D039 Workbench: a different attached record cannot enroll or inherit DEL-4 result", async (t) => {
  const x = await resultHost(t);
  await x.authorized();
  const { page, errors } = await browser(t, x),
    before = await x.h.snapshot();
  await page.evaluate(
    (target) => {
      localStorage.setItem(
        "fieldruntime.discovery.navigation.v1",
        JSON.stringify(target),
      );
      localStorage.setItem(
        "fieldruntime.result.navigation.v1",
        target.case_id + "|" + target.record_key,
      );
    },
    {
      bundle_id: x.second.selection.bundle_id,
      case_id: x.second.case_id,
      record_key: x.second.record_key,
    },
  );
  await page.reload();
  await expect(page.locator(".dispute-result")).toContainText(
    "Selected dispute — result unavailable",
  );
  await expect(page.locator(".dispute-result")).toContainText("Another record");
  await expect(
    page.getByRole("button", {
      name: "Enroll this exact synthetic dispute",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".result-confirmed-title")).toHaveCount(0);
  assert.deepEqual(await x.h.snapshot(), before);
  assert.deepEqual(errors, []);
});
