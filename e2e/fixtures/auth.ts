// e2e/fixtures/auth.ts — admin-app login helper.
//
// Reads credentials from environment variables so they never enter
// the git history. Run the suite with:
//
//   E2E_LOGIN_EMAIL=jacobmaddux@starr-surveying.com \
//   E2E_LOGIN_PASSWORD=... \
//   npx playwright test

import type { Page } from '@playwright/test';

export function requireLoginEnv(): { email: string; password: string } {
  const email = process.env.E2E_LOGIN_EMAIL;
  const password = process.env.E2E_LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing E2E_LOGIN_EMAIL or E2E_LOGIN_PASSWORD. Set both before running Playwright; see playwright.config.ts.',
    );
  }
  return { email, password };
}

/**
 * Log in via the admin email/password form and wait until the
 * post-login redirect lands on `/admin/dashboard` (or any non-login
 * route). Idempotent: returns immediately if a session cookie is
 * already valid.
 */
export async function loginAsAdmin(page: Page, callbackUrl = '/admin/cad'): Promise<void> {
  const { email, password } = requireLoginEnv();
  await page.goto(`/admin/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  // If already authenticated next-auth redirects away from /admin/login.
  if (!page.url().includes('/admin/login')) return;

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/admin/login'), { timeout: 30_000 }),
    page.locator('button[type="submit"]:has-text("Sign In")').click(),
  ]);
}
