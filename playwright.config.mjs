import { defineConfig } from "@playwright/test";

const baseURL = process.env.D6_WORKBENCH_URL ?? "http://127.0.0.1:3210";
const target = new URL(baseURL);
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.protocol !== "http:" ||
  target.pathname !== "/" ||
  target.search ||
  target.username ||
  target.password
)
  throw new Error(
    "Workbench browser tests require a credential-free local appliance",
  );

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
