// playwright.harness.config.ts
//
// Config for the UX-audit harness (NOT the auth-gated e2e suite). It
// boots `next dev` with NEXT_PUBLIC_E2E_HARNESS=1 and points specs at
// the unauthenticated /cad-harness route so the CAD shell can be driven
// and screenshotted without admin credentials.
//
// Run: npx playwright test --config=playwright.harness.config.ts
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §2

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.HARNESS_PORT || 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e/harness',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 90_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } },
    },
  ],
  webServer: {
    command: `NEXT_PUBLIC_E2E_HARNESS=1 npx next dev -p ${PORT}`,
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: true,
    env: { NEXT_PUBLIC_E2E_HARNESS: '1' },
  },
});
