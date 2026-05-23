// e2e/fixtures/auth.ts — admin-app login helper.
//
// Reads credentials from environment variables so they never enter
// the git history. Run the suite with:
//
//   E2E_LOGIN_EMAIL=jacobmaddux@starr-surveying.com \
//   E2E_LOGIN_PASSWORD=... \
//   npx playwright test

import { expect, type Page } from '@playwright/test';

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

/**
 * On a fresh load, /admin/cad shows the NewDrawingDialog (a
 * full-screen z-[200] modal) until the surveyor creates or imports
 * a drawing. Until it's dismissed the menu bar is unclickable. This
 * helper creates a blank drawing so the rest of a test can drive the
 * tools. Safe to call when no dialog is present — it no-ops after a
 * short wait.
 */
export async function dismissStartupDialog(page: Page): Promise<void> {
  const createBtn = page.locator('button:has-text("Create New Drawing")').first();
  if (await createBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await createBtn.click();
    // The modal animates out; wait for the overlay to detach so
    // subsequent menu clicks aren't intercepted.
    await expect(createBtn).toBeHidden({ timeout: 8_000 }).catch(() => {});
  }
}

/** Login + land on /admin/cad + create a blank drawing. */
export async function openCadWithDrawing(page: Page): Promise<void> {
  await loginAsAdmin(page, '/admin/cad');
  await page.waitForLoadState('networkidle');
  await dismissStartupDialog(page);
}

