import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const dataDir = `.data/auth-e2e-${process.pid}`;
export default defineConfig({
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
      command: "npm run dev -- --port 3101",
      url: "http://localhost:3101/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        MIDNIGHT_INK_DATA_DIR: dataDir,
        DATABASE_PATH: `${dataDir}/studio.sqlite`,
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
