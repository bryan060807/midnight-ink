import path from 'node:path';
import { tmpdir } from 'node:os';
import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const databaseFixtureFile = path.join(tmpdir(), `midnight-browser-fixture-${process.pid}-auth.json`);
export default defineConfig({
  globalTeardown: './e2e/database-teardown.ts',
  metadata: { databaseFixtureFile },
  testDir: "./e2e",
  testMatch: "**/auth.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/auth" }],
  ],
  use: {
    baseURL: "http://localhost:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [{ name: "auth-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --import tsx scripts/mock-oidc.ts",
      url: "http://127.0.0.1:3211/health",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        NODE_ENV: "test",
        MOCK_OIDC_PORT: "3211",
        MOCK_CALLBACK_URI: "http://localhost:3101/auth/aibry-id/callback",
      },
    },
    {
      command: "node --import tsx scripts/test-database.ts --port 3101",
      url: "http://localhost:3101/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        MIDNIGHT_INK_TEST_FIXTURE_FILE: databaseFixtureFile,
        LOCAL_DEMO_ENABLED: "false",
        ROOK_PROVIDER: "offline",
        AIBRY_ID_ISSUER: "http://127.0.0.1:3211",
        AIBRY_ID_CLIENT_ID: "midnight-ink-public-web",
        APP_ORIGIN: "http://localhost:3101",
        SESSION_SECRET:
          "test-only-generated-provider-e2e-session-secret-do-not-deploy",
        AIBRY_ID_ALLOW_HTTP_LOCALHOST: "true",
      },
    },
  ],
});
