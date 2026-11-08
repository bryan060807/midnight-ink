import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

const dataDir = `.data/studio-e2e-${process.pid}`;
export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/auth.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      MIDNIGHT_INK_DATA_DIR: dataDir,
      DATABASE_PATH: `${dataDir}/studio.sqlite`,
      LOCAL_DEMO_ENABLED: 'true',
      ROOK_PROVIDER: 'offline',
      AIBRY_ID_ISSUER: '', AIBRY_ID_CLIENT_ID: '', APP_ORIGIN: '', SESSION_SECRET: '',
      AIBRY_ID_ALLOW_HTTP_LOCALHOST: 'false', DEMO_IMPORT_TOKEN_HASH: '',
    },
  },
});
