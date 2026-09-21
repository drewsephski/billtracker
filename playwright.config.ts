import { defineConfig, devices } from "@playwright/test";
import { assertDevelopmentWrites } from "./lib/release/development-guard";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (existsSync(".env.seed")) process.loadEnvFile(".env.seed");
if (process.env.SEED_ALLOWED === "true")
  assertDevelopmentWrites(process.env, true);
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-webkit",
      testMatch: [
        "design.spec.ts",
        "mobile-release.spec.ts",
        "activity.spec.ts",
      ],
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    ignoreHTTPSErrors: true,
    command: process.env.E2E_SERVER_COMMAND || "pnpm dev",
    url: process.env.E2E_BASE_URL || "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
