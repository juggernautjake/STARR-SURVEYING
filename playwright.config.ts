// playwright.config.ts
//
// E2E test configuration. Tests live in ./e2e. Login credentials
// for the admin app come from the E2E_LOGIN_EMAIL and
// E2E_LOGIN_PASSWORD environment variables — never commit real
// creds to git. See docs/planning/in-progress/CAD_POINTS_AND_AI.md
// slice G.
//
// Run against a local dev server:
//   E2E_BASE_URL=http://localhost:3000 \
//   E2E_LOGIN_EMAIL=... E2E_LOGIN_PASSWORD=... \
//   npx playwright test
//
// Or against any deployed environment by changing E2E_BASE_URL.

import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/harness/**', // UX-audit harness uses playwright.harness.config.ts
  fullyParallel: false, // login is serial; CAD state is shared
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Some sandboxed CI runners ship without the public CA bundle
    // Chromium needs to validate the deployment cert. We accept
    // self-signed / unrecognised CAs only because the target URL
    // is set explicitly via E2E_BASE_URL and is not user input.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
