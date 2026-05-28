// e2e/harness/ux-audit.spec.ts
// Renders real admin page components via /ux-harness (seeded mock session +
// mocked /api/admin data) and screenshots them for formatting/styling audit.

import { test } from '@playwright/test';
import { AUDIT_DIR } from './_harness';

const MOCK_SESSION = {
  user: {
    name: 'Test Admin',
    email: 'jacobmaddux@starr-surveying.com',
    role: 'admin',
    roles: ['admin', 'developer', 'field_crew', 'researcher', 'tech_support'],
  },
  expires: '2999-12-31T23:59:59.999Z',
};

// Stub auth + admin data so pages render populated, deterministic content.
async function stubBackend(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: MOCK_SESSION }));
  await page.route('**/api/admin/**', (r) => {
    const url = r.request().url();
    // Reasonable empty-but-valid shapes for the common list endpoints.
    let body: Record<string, unknown> = {};
    if (url.includes('/jobs')) body = { jobs: [], total: 0 };
    else if (url.includes('/settings')) body = { settings: {} };
    else if (url.includes('/learn/modules')) body = { modules: [] };
    else if (url.includes('/learn/progress')) body = { progress: [] };
    else if (url.includes('/time-logs')) body = { logs: [], work_types: [] };
    return r.fulfill({ json: body });
  });
}

const PAGES = [
  'dashboard', 'jobs', 'leads', 'notes', 'receipts', 'payroll',
  'settings', 'mileage', 'assignments', 'reports', 'equipment', 'invites',
];

for (const p of PAGES) {
  test(`ux-harness renders /${p}`, async ({ page }) => {
    await stubBackend(page);
    await page.goto(`/ux-harness?page=${p}`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${AUDIT_DIR}/ux-${p}.png`, fullPage: true });
  });
}
