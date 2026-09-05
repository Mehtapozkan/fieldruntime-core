// Actual browser -> HTTP -> PostgreSQL. Run once against the disposable local
// appliance after build/start; this suite intentionally retains its synthetic Case.
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  CASE_ID,
  CASE_ROOT,
  REVIEW_ROOT,
  TENANT,
  STORAGE_KEY,
  DEMO_CASE,
} from "../../apps/admin/public/authority-client.js";

test.describe.configure({ mode: "serial" });
let primary;
const current = (page) => page.locator("#review-current-status");
const submit = (page, decision = "approve") =>
  page.getByRole("button", { name: `Record ${decision}`, exact: true });
async function packet(api, id) {
  const response = await api.get(`${REVIEW_ROOT}/${id}/packet`);
  expect(response.status()).toBe(200);
  return response.json();
}
async function fresh(api) {
  let response = await api.get(`${CASE_ROOT}/cases/${CASE_ID}`);
  if (response.status() === 404) {
    // Explicit test setup via the same command API; production reads never seed.
    const created = await api.post(`${CASE_ROOT}/case-commands`, {
      data: DEMO_CASE,
    });
    expect(created.status()).toBe(200);
    response = await api.get(`${CASE_ROOT}/cases/${CASE_ID}`);
  }
  expect(response.status()).toBe(200);
  const record = await response.json();
  const catalog = await (
    await api.get(`/v1/tenants/${TENANT}/authority-catalog`)
  ).json();
  const created = await api.post(REVIEW_ROOT, {
    data: {
      type: "authority.request.create",
      tenant_id: TENANT,
      case_id: CASE_ID,
      expected_case_version: record.document.case.version,
      expected_authority_state_revision: catalog.authority_state_revision,
      proposal_key: "credit_15000",
      idempotency_key: `browser:${randomUUID()}`,
      correlation_id: "browser-test",
    },
  });
  expect(created.status()).toBe(200);
  return (await created.json()).receipt.authority_request_id;
}
async function open(page, id) {
  await page.goto(`/?request=${id}`);
  await expect(
    page.getByRole("button", { name: "Refresh packet", exact: true }),
  ).toBeEnabled();
  await expect(current(page)).not.toContainText("unconfirmed");
}
async function refresh(page) {
  await page
    .getByRole("button", { name: "Refresh packet", exact: true })
    .click();
  await expect(current(page)).not.toContainText("unconfirmed");
}
async function vote(page, seat, decision = "approve") {
  await page.getByLabel("Reviewer", { exact: true }).selectOption(seat);
  await page.getByLabel("Decision", { exact: true }).selectOption(decision);
  if (decision !== "approve")
    await page
      .getByLabel("Reason (required)")
      .fill("Independent synthetic review requires this intervention.");
  if (decision === "modify")
    await page
      .getByLabel("Replacement proposal · starts without approvals")
      .selectOption("credit_12000");
  await submit(page, decision).click();
  await expect(
    page.getByText("Last response · historical receipt", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#stage-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(current(page)).not.toContainText("unconfirmed");
}

test("explicit init → Finance → refresh → Executive → reload reconstructs, with no read writes or local authorization", async ({
  page,
  request,
}) => {
  const writes = [],
    errors = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const start = page.getByRole("button", {
    name: "Start or reopen $15,000 review",
    exact: true,
  });
  await expect(start).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  const safety = await page
    .getByText("External writes off", { exact: true })
    .boundingBox();
  expect(safety.x).toBeGreaterThanOrEqual(0);
  expect(safety.x + safety.width).toBeLessThanOrEqual(390);
  const navigation = await page.locator(".stage-list").boundingBox();
  const legacy = await page
    .getByRole("link", { name: "Legacy action simulation ↗" })
    .boundingBox();
  expect(legacy.y).toBeGreaterThanOrEqual(navigation.y + navigation.height);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(writes).toHaveLength(0);
  await start.click();
  await expect(submit(page)).toBeEnabled();
  primary = new URL(page.url()).searchParams.get("request");
  const initial = await packet(request, primary);
  expect(initial.review_revision).toBe(0);
  await expect(
    page.getByRole("heading", { name: "Orchid / $15,000 proposed credit" }),
  ).toBeVisible();
  await expect(current(page)).toHaveText(
    "Prepare the synthetic Case before fresh review",
  );
  await expect(
    page
      .getByText("Customer requests a service credit after an interruption.")
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Customer-reported impact has not been independently confirmed.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Independent impact verification remains outstanding."),
  ).toBeVisible();
  await expect(
    page.getByText(
      /bound policy requires Finance and Executive.*above \$10,000/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Finance · Needed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Executive · Needed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("synthetic://accounts/orchid", { exact: true }),
  ).toBeHidden();
  await expect(page.getByText(/Case C1 · Review R0/)).toBeHidden();
  // Controls are beside the concise summary, before detailed evidence.
  const form = await page
    .getByRole("form", { name: "Record synthetic review" })
    .boundingBox();
  const evidence = await page
    .getByRole("heading", { name: "Linked evidence", exact: true })
    .boundingBox();
  expect(form.y + form.height).toBeLessThan(evidence.y);
  await page.getByText("Citation and provenance", { exact: true }).click();
  await expect(
    page.getByText("synthetic://d6/intake", { exact: true }),
  ).toBeVisible();
  await page.getByText("Citation and provenance", { exact: true }).click();
  // Keyboard order and visible focus stay usable after a confirmed write.
  await page.getByLabel("Reviewer", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Decision", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(submit(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(current(page)).toHaveText("Finance approved — Executive needed");
  await expect(current(page)).toBeFocused();
  await expect(page.getByLabel("Reviewer", { exact: true })).toHaveValue(
    "finance",
  );
  await expect(
    page.getByText("Finance · Approved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Executive · Needed", { exact: true }),
  ).toBeVisible();
  await vote(page, "executive");
  await expect(current(page)).toHaveText(
    "Approvals complete; credit not recorded",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => globalThis.document.documentElement.scrollWidth),
  ).toBe(390);
  await expect(
    page.getByText(
      "Customer-reported impact has not been independently confirmed.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Reviewer", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const approved = await packet(request, primary);
  expect(approved.case_version).toBe(initial.case_version);
  expect(approved.review_revision).toBe(2);
  expect(approved.action_permission).toBe(false);
  const writeCount = writes.length;
  await page.reload();
  await expect(current(page)).toHaveText(
    "Approvals complete; credit not recorded",
  );
  await refresh(page);
  await page.locator('[data-stage="history"]').click();
  await expect(
    page.getByRole("heading", { name: "Finance · Approve", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Executive · Approve", exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(writeCount);
  expect((await packet(request, primary)).history).toEqual(approved.history);
  const saved = await page.evaluate(
    (key) => JSON.parse(globalThis.localStorage.getItem(key)),
    STORAGE_KEY,
  );
  expect(Object.keys(saved).sort()).toEqual(["pending", "requestId"]);
  expect(saved.pending).toBe(null);
  expect(errors).toEqual([]);
});

test("concurrent review conflicts require refresh; lost response survives reload with byte-identical retry", async ({
  page,
  context,
  request,
}) => {
  const id = await fresh(request);
  const other = await context.newPage();
  await open(page, id);
  await open(other, id);
  await vote(other, "finance");
  await page.getByLabel("Reviewer", { exact: true }).selectOption("executive");
  const staleResponse = page.waitForResponse((response) =>
    response.url().endsWith("/decisions/executive"),
  );
  await submit(page).click();
  expect((await staleResponse).status()).toBe(409);
  await expect(
    page
      .locator("#stage-content")
      .getByText(/Another reviewer changed the review history/),
  ).toBeVisible();
  await expect(submit(page)).toBeDisabled();
  expect((await packet(request, id)).review_revision).toBe(1);
  await refresh(page);
  const sent = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/decisions/executive"))
      sent.push(request.postData());
  });
  await page.route(
    "**/decisions/executive",
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await submit(page).click();
  await expect(
    page.getByRole("button", { name: "Retry exact command" }),
  ).toBeEnabled();
  await expect(
    page
      .locator("#stage-content")
      .getByText(/Result unconfirmed\. The server may/),
  ).toBeVisible();
  await expect(current(page)).not.toHaveText(
    "Approvals complete; credit not recorded",
  );
  await expect(
    page.getByText("Last response · historical receipt", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry exact command" }),
  ).toBeEnabled();
  await expect(current(page)).toContainText("unconfirmed");
  await page.getByRole("button", { name: "Retry exact command" }).click();
  await expect(
    page.getByRole("button", { name: "Retry exact command" }),
  ).toHaveCount(0);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
  expect((await packet(request, id)).review_revision).toBe(2);
  await refresh(page);
  await expect(current(page)).toHaveText(
    "Approvals complete; credit not recorded",
  );
  await other.close();
});

for (const decision of ["reject", "modify", "escalate"])
  test(`${decision} removes current authorization; reasons and unapproved replacement survive reload`, async ({
    page,
    request,
  }) => {
    const id = await fresh(request);
    await open(page, id);
    await vote(page, "finance");
    await refresh(page);
    await vote(page, "executive");
    await refresh(page);
    await expect(current(page)).toHaveText(
      "Approvals complete; credit not recorded",
    );
    await page.getByLabel("Decision", { exact: true }).selectOption(decision);
    await submit(page, decision).click();
    expect((await packet(request, id)).review_revision).toBe(
      2,
      "HTML required reason prevents submission",
    );
    await vote(page, "finance", decision);
    await refresh(page);
    const terminal = await packet(request, id);
    expect(terminal.review_revision).toBe(3);
    expect(terminal.current.authorized).toBe(false);
    expect(terminal.current.effective_approval_ids).toEqual([]);
    await expect(submit(page, decision)).toBeDisabled();
    await page.reload();
    await expect(current(page)).toHaveText(
      {
        reject: "Request rejected",
        modify: "Request replaced",
        escalate: "Request escalated",
      }[decision],
    );
    await page.locator('[data-stage="history"]').click();
    await expect(
      page.getByRole("heading", {
        name: `Finance · ${decision[0].toUpperCase()}${decision.slice(1)}`,
        exact: true,
      }),
    ).toBeVisible();
    if (decision === "modify") {
      await page
        .getByRole("button", {
          name: "Open unapproved replacement",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { name: "Orchid / $12,000 proposed credit" }),
      ).toBeVisible();
      await expect(submit(page)).toBeEnabled();
      const replacement = await packet(
        request,
        new URL(page.url()).searchParams.get("request"),
      );
      expect(replacement.review_revision).toBe(0);
      expect(replacement.current.effective_approval_ids).toEqual([]);
      expect(replacement.current.authorized).toBe(false);
    }
  });

test("retained evidence through Case API invalidates prior approvals; fresh request needs both reviewers", async ({
  page,
  request,
}) => {
  await open(page, primary);
  await expect(current(page)).toHaveText(
    "Approvals complete; credit not recorded",
  );
  await page.getByRole("button", { name: /Changed evidence/ }).click();
  await page
    .getByRole("button", {
      name: "Attach evidence · invalidate prior approvals",
      exact: true,
    })
    .click();
  await expect(page.locator("#stage-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(current(page)).not.toContainText("unconfirmed");
  await expect(current(page)).toHaveText("Case changed — fresh review needed");
  await expect(
    page.locator("#stage-content").getByText(/Prior approvals no longer apply/),
  ).toBeVisible();
  const old = await packet(request, primary);
  expect(old.case_version).toBe(old.request.case_version + 1);
  expect(old.current.effective_approval_ids).toEqual([]);
  expect(old.history).toHaveLength(3);
  await page
    .getByRole("button", { name: "Create fresh $15,000 request", exact: true })
    .click();
  await expect(submit(page)).toBeEnabled();
  const replacement = await packet(
    request,
    new URL(page.url()).searchParams.get("request"),
  );
  expect(replacement.review_revision).toBe(0);
  expect(replacement.current.authorized).toBe(false);
  expect(replacement.material.evidence).toHaveLength(2);
  await page.locator('[data-stage="history"]').click();
  await expect(
    page.getByRole("button", {
      name: "Inspect predecessor history",
      exact: true,
    }),
  ).toBeVisible();
});

test("ineligible seats and unsafe packet responses never become accepted decisions", async ({
  page,
  request,
}) => {
  const id = await fresh(request);
  await open(page, id);
  await page.getByLabel("Reviewer", { exact: true }).selectOption("business");
  await page.getByLabel("Decision", { exact: true }).selectOption("reject");
  await page
    .getByLabel("Reason (required)")
    .fill("An unrelated seat cannot veto this request.");
  await submit(page, "reject").click();
  await expect(
    page
      .locator("#stage-content")
      .getByText(/This synthetic reviewer is not currently eligible/),
  ).toBeVisible();
  expect((await packet(request, id)).review_revision).toBe(0);
  await expect(
    page.getByText("Last response · historical receipt", { exact: true }),
  ).toHaveCount(0);
  for (const unsafePermission of [true, false]) {
    await page.route(
      `**/${id}/packet`,
      async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.action_permission = unsafePermission;
        body.current.authorized = true;
        await route.fulfill({ response, json: body });
      },
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Refresh packet", exact: true })
      .click();
    await expect(
      page
        .getByText("The API returned an invalid review response.", {
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await expect(current(page)).toContainText("unconfirmed");
    await expect(submit(page, "reject")).toBeDisabled();
    expect((await packet(request, id)).current.authorized).toBe(false);
    await refresh(page);
    await expect(submit(page, "reject")).toBeEnabled();
  }
});

test("confirmed-write read failure keeps the receipt, requires refresh and never offers a duplicate decision", async ({
  page,
  request,
}) => {
  const id = await fresh(request);
  await open(page, id);
  let posts = 0;
  page.on("request", (req) => {
    if (req.method() === "POST") posts++;
  });
  await page.route(`**/${id}/packet`, (route) => route.abort("failed"), {
    times: 1,
  });
  await submit(page).click();
  await expect(page.getByRole("alert")).toContainText(
    "The command was recorded, but current review could not be refreshed.",
  );
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(current(page)).toContainText("unconfirmed");
  await expect(submit(page)).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry exact command" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Last response · historical receipt" }),
  ).toBeVisible();
  await refresh(page);
  await expect(current(page)).toHaveText("Finance approved — Executive needed");
  expect(posts).toBe(1);
  expect((await packet(request, id)).review_revision).toBe(1);
});
