import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "./scripts/load-env.mjs";

/**
 * End-to-end tests: a real browser driving the built app.
 *
 * They need a database and nothing else. Chat replies come from the stand-in
 * provider in scripts/mock-openrouter.mjs, so a run costs nothing and does
 * not depend on any model being up.
 *
 * The database is whichever DATABASE_URL is found first in .env.test.local
 * and then .env.local. The tests create accounts, change event settings and
 * tidy up after themselves, so give them a database of their own if you
 * would rather your development data was left alone. Never point this at
 * production: nothing here reads .env.production.local, on purpose.
 *
 *   npm run test:e2e:prepare   once, to migrate and seed that database
 *   npm run test:e2e           run everything
 *   npm run test:e2e -- --ui   watch it happen
 */
loadEnvFile(".env.test.local");
loadEnvFile(".env.local");

const PORT = 3100;
const MOCK_PORT = 4100;
const baseURL = `http://localhost:${PORT}`;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  // One at a time. Several tests change settings that apply to everyone
  // (the nomination deadline, the default allowance), so running them side
  // by side would have them trip over each other.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL,
    // Recording every test is slow; keep the evidence only where it is
    // needed, and only in CI where nobody is watching.
    trace: CI ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 950 } },
    },
  ],
  webServer: [
    {
      command: `node scripts/mock-openrouter.mjs ${MOCK_PORT}`,
      port: MOCK_PORT,
      reuseExistingServer: !CI,
    },
    {
      // A production build, because that is what participants get, and
      // because the development server compiles each page on first visit,
      // which makes timings meaningless.
      command: `npm run build && npx next start -p ${PORT}`,
      url: `${baseURL}/sign-in`,
      timeout: 300_000,
      reuseExistingServer: !CI,
      env: {
        ...(process.env as Record<string, string>),
        BETTER_AUTH_URL: baseURL,
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET ?? "e2e-only-secret-not-used-anywhere-else",
        OPENROUTER_API_KEY: "sk-or-v1-e2e",
        OPENROUTER_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/api/v1`,
      },
    },
  ],
});
