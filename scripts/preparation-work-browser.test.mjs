import { intakeHash } from "../apps/admin/public/intake-client.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect as browserExpect } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
// UI completion includes persistence and read-only replay; it is not the worker's
// five-second computation budget, which the PostgreSQL tests enforce separately.
const expect = browserExpect.configure({ timeout: 15000 });
// The Workbench aborts requests at 15s. A response observer must not fail at
// the page's 12s interaction deadline while a valid command is still pending.
const commandResponseTimeout = 20000;
import {
  preparedWork,
  sharedCaseWork,
  WORK,
} from "../tests/helpers/preparation-work.mjs";
import { discoveryCommand, variation } from "../tests/helpers/discovery.mjs";
async function host(t, input, fixture) {
  const p = fixture ?? (await preparedWork(t, input)),
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
async function openRecord(page, index) {
  await page.locator(".discovery-intake-details > summary").click();
  await page
    .locator(".intake-candidate")
    .nth(index)
    .getByRole("button", { name: /^Open workflow brief/ })
    .click();
}
test("D12 W5 browser shared-Case A to B to A prepares the selected record", async (t) => {
  const {
    h,
    page,
    records: [a, b],
  } = await host(t, undefined, await sharedCaseWork(t));
  const statuses = [],
    commands = [],
    receipts = [];
  for (const [i, record] of [a, b, a].entries()) {
    if (i) {
      await openRecord(page, i === 1 ? 1 : 0);
      await expect(page.locator(".preparation-work")).toContainText(
        i === 1 ? "dispute-18" : "dispute-17",
      );
      await expect(page.locator(".preparation-work h2")).toBeFocused();
      await page
        .getByText("Publication & withdrawal — inspect or change", {
          exact: true,
        })
        .click();
    }
    await publish(page, i === 2);
    if (i === 2)
      await page.route(`**${WORK}?**`, async (route) => {
        const response = await route.fetch();
        // A's earlier packet can still be visible while the new receipt's
        // read-only refresh is pending. It must not enable task acceptance.
        await expect(
          page.getByRole("button", { name: /^Accept preparation packet/ }),
        ).toBeDisabled();
        await route.fulfill({ response });
      });
    if (i === 2)
      await page.route(`**${WORK}/commands`, async (route) => {
        const began = Date.now();
        const response = await route.fetch();
        // Exercise delivery after the old 12s observer deadline but within the
        // unchanged 15s UI request deadline. This is response latency, not work.
        await delay(Math.max(0, 12500 - (Date.now() - began)));
        await route.fulfill({ response });
      });
    // Lose B's response after the real server commits, then recover after restart.
    if (i === 1)
      await page.route(`**${WORK}/commands`, async (route) => {
        commands.push(route.request().postData());
        const response = await route.fetch();
        statuses.push(response.status());
        receipts.push(await response.json());
        await route.abort();
      });
    const action = page.getByRole("button", {
      name:
        i === 2
          ? /^Prepare a fresh packet/
          : /^Prepare evidence-request packet/,
    });
    if (i === 1) {
      await action.click();
      await expect(page.getByRole("alert")).toContainText(
        "Submission uncertain",
      );
      await page.unroute(`**${WORK}/commands`);
      await h.restart();
      await page.reload();
      await expect(
        page.getByRole("heading", {
          name: "Original submission needs recovery",
        }),
      ).toBeVisible();
      const before = await h.snapshot();
      const [recovered] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith(`${WORK}/commands`), {
          timeout: commandResponseTimeout,
        }),
        page
          .getByRole("button", { name: /^Recover original submission/ })
          .click(),
      ]);
      assert.equal(recovered.request().postData(), commands.at(-1));
      assert.deepEqual(await recovered.json(), receipts.at(-1));
      await expect(
        page.getByRole("heading", {
          name: "Original submission needs recovery",
        }),
      ).toHaveCount(0);
      assert.deepEqual(await h.snapshot(), before);
    } else {
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith(`${WORK}/commands`), {
          timeout: commandResponseTimeout,
        }),
        action.click(),
      ]);
      statuses.push(response.status());
      commands.push(response.request().postData());
      receipts.push(await response.json());
    }
    await expect(page.locator(".work-progress")).toContainText(
      "human task review needed",
    );
    // Wait for the confirmed command's final validated refresh, not the
    // earlier A packet's identical progress label, before inspecting/capturing.
    await expect(
      page.getByRole("button", { name: /^Accept preparation packet/ }),
    ).toBeEnabled();
    if (i === 2) {
      await page.unroute(`**${WORK}?**`);
      await page.unroute(`**${WORK}/commands`);
    }
    await expect(page.locator(".work-preview")).toContainText(
      i === 1 ? "DEL-5" : "DEL-4",
    );
    await expect(page.locator(".work-preview")).not.toContainText(
      i === 1 ? "DEL-4" : "DEL-5",
    );
    const command = JSON.parse(commands.at(-1));
    assert.equal(command.binding.record_key, record.b.record_key);
    assert.equal(
      command.replaces_invocation,
      receipts[i - 1]?.entry.invocation_id ?? null,
    );
    assert.equal((await h.ok(record.path)).invocations.at(-1).review, null);
    t.diagnostic(
      JSON.stringify({
        step: ["A first", "B first recovered", "A repeat"][i],
        status: statuses.at(-1),
        record: i === 1 ? "dispute-18" : "dispute-17",
      }),
    );
  }
  assert.deepEqual(statuses, [200, 200, 200]);
  await shot(page, "shared-case-return-a");
  const before = await h.snapshot();
  await h.restart();
  await page.reload();
  await expect(page.locator(".work-progress")).toContainText(
    "human task review needed",
  );
  for (const [i, command] of commands.entries())
    assert.deepEqual(
      await h.ok(`${WORK}/commands`, JSON.parse(command)),
      receipts[i],
    );
  assert.equal((await h.ok(a.path)).invocations.length, 2);
  assert.equal((await h.ok(b.path)).invocations.length, 1);
  assert.deepEqual(await h.snapshot(), before);
});
async function publish(page, again = false) {
  await page
    .getByLabel("Selection reason", { exact: true })
    .fill(
      "Synthetic bounded preparation only; business authority remains separate",
    );
  await page
    .getByLabel("I reviewed this exact candidate for preparation only")
    .check();
  await page.getByRole("button", { name: /^Publish for preparation/ }).click();
  await expect(page.locator(".pack-result h3")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  if (again)
    await page
      .getByText("Prepare again — new explicit invocation", { exact: true })
      .click();
  await expect(
    page.getByRole("button", {
      name: /^Prepare (evidence-request|a fresh) packet/,
    }),
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
  // Retain a confirmed server response in transit for longer than the worker
  // computation budget. No progress can appear before the response and refresh.
  await page.route("**/v1/intake/preparation-work/commands", async (route) => {
    const response = await route.fetch();
    await expect(page.locator(".work-progress")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Prepare evidence-request packet/ }),
    ).toBeDisabled();
    await delay(5500);
    await route.fulfill({ response });
  });
  await page.keyboard.press("Enter");
  await expect(page.locator(".work-progress")).toContainText(
    "human task review needed",
  );
  await page.unroute("**/v1/intake/preparation-work/commands");
  await expect(page.locator(".work-preview blockquote").first()).toBeVisible();
  await expect(page.locator(".work-preview")).toContainText(
    "Please provide DEL-4 confirmation",
  );
  await expect(page.locator(".work-preview")).toContainText("governing terms");
  await expect(
    page.getByLabel("Proposed modification (required for modify)", {
      exact: true,
    }),
  ).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Skip to case" }),
  ).toHaveAttribute("href", "#stage-content");
  const run = (await h.ok(path)).invocations.at(-1);
  const excerpt = await page
    .locator(".work-preview blockquote")
    .first()
    .innerText();
  assert.ok(run.result.follow_up.draft.startsWith(excerpt));
  await shot(page, "prepared");
  await expect(page.locator(".preparation-work")).toContainText(
    "DEL-4: An associated source reports confirmation is not supplied",
  );
  await expect(page.locator(".preparation-work")).toContainText(
    "No credit is recommended",
  );
  const after = await h.snapshot();
  await page
    .getByText("Inspect the complete unsent follow-up", { exact: true })
    .click();
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
    second.getByRole("button", {
      name: /^Prepare (evidence-request|a fresh) packet/,
    }),
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
  await expect(
    page.getByLabel("Proposed modification (required for modify)", {
      exact: true,
    }),
  ).toBeHidden();
  await page.getByRole("button", { name: /^Request modification/ }).click();
  await expect(
    page.getByLabel("Proposed modification (required for modify)", {
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: /^Submit modification request/ })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Give a proposed modification.",
  );
  await page
    .getByLabel("Proposed modification (required for modify)", { exact: true })
    .fill("Fresh supported worker and separate publication");
  await page
    .getByRole("button", { name: /^Submit modification request/ })
    .click();
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

test("D12 W5 shared-Case pending recovery navigates to its original record without changing the command", async (t) => {
  const {
    h,
    page,
    context,
    records: [a, b],
  } = await host(t, undefined, await sharedCaseWork(t));
  await publish(page);
  await prepare(page);
  await openRecord(page, 1);
  await expect(page.locator(".preparation-work h2")).toBeFocused();
  await page
    .getByText("Publication & withdrawal — inspect or change", { exact: true })
    .click();
  await publish(page);
  let saved;
  page.on("request", (request) => {
    if (request.url().endsWith(`${WORK}/commands`))
      saved ??= request.postData();
  });
  // A committed start with a lost acknowledgment leaves no computed result.
  h.fault({ tag: "COMMIT", after: true });
  await page
    .getByRole("button", { name: /^Prepare evidence-request packet/ })
    .click();
  await expect(page.getByRole("alert")).toContainText("Submission uncertain");
  assert.equal(JSON.parse(saved).binding.record_key, b.b.record_key);
  await h.restart();
  const second = await context.newPage();
  second.setDefaultTimeout(12000);
  await second.goto(h.base + "/?view=intake");
  await expect(second.locator(".preparation-work")).toContainText("dispute-18");
  await openRecord(second, 0);
  await expect(second.locator(".preparation-work h2")).toBeFocused();
  await expect(second.locator(".work-preview")).toContainText("DEL-4");
  await expect(second.locator(".work-preview")).not.toContainText("DEL-5");
  await second.reload();
  const route = second.getByRole("button", {
    name: /^Open pending preparation’s record/,
  });
  await expect(route).toBeVisible();
  const before = await h.snapshot();
  const view = await h.ok(b.path),
    run = view.invocations.at(-1);
  assert.equal(run.outcome, "started");
  assert.equal(view.current.can_start, false);
  assert.equal(view.current.pending_invocation, run.invocation_id);
  await route.focus();
  await second.keyboard.press("Enter");
  await expect(second.locator(".preparation-work")).toContainText("dispute-18");
  await expect(second.locator(".work-preview")).toHaveCount(0);
  await expect(
    second.getByRole("button", { name: /^Interrupt pending preparation/ }),
  ).toBeDisabled();
  assert.deepEqual(await h.snapshot(), before);
  const [response] = await Promise.all([
    second.waitForResponse((r) => r.url().endsWith(`${WORK}/commands`)),
    second
      .getByRole("button", { name: /^Recover original submission/ })
      .click(),
  ]);
  assert.equal(response.status(), 200);
  assert.equal(response.request().postData(), saved);
  const receipt = await response.json();
  assert.equal(receipt.entry.record_key, b.b.record_key);
  await expect(
    second.getByRole("button", { name: /^Interrupt pending preparation/ }),
  ).toBeEnabled();
  assert.deepEqual(await h.snapshot(), before);
  await second
    .getByLabel("Interruption reason", { exact: true })
    .fill(
      "Explicitly stop the pending B invocation after recovering its original key",
    );
  await second
    .getByRole("button", { name: /^Interrupt pending preparation/ })
    .click();
  await expect(second.locator(".work-confirmed")).toContainText(
    "Confirmed interrupt receipt",
  );
  const after = await h.snapshot();
  await h.restart();
  assert.deepEqual(await h.ok(`${WORK}/commands`, JSON.parse(saved)), receipt);
  assert.equal((await h.ok(b.path)).invocations.at(-1).outcome, "interrupted");
  assert.equal((await h.ok(a.path)).invocations.length, 1);
  assert.deepEqual(await h.snapshot(), after);
});
