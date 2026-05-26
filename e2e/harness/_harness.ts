// e2e/harness/_harness.ts — shared helpers for the UX-audit harness.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §2

import { type Page } from '@playwright/test';

export const AUDIT_DIR = 'test-results/audit';

/** Load the unauthenticated harness route and wait for the shell. */
export async function openHarness(page: Page): Promise<void> {
  await page.goto('/cad-harness');
  // Either the startup dialog or the canvas-loading text proves the
  // client bundle mounted.
  await page
    .locator('text=Starr CAD, text=Create New Drawing, text=Loading canvas')
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(() => {});
}

/** Dismiss the startup New Drawing modal by creating a blank drawing. */
export async function createBlankDrawing(page: Page): Promise<void> {
  const createBtn = page.locator('button:has-text("Create New Drawing")').first();
  if (await createBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await createBtn.click();
    await createBtn.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }
}

/** Screenshot helper that always writes under the audit dir. */
export async function shot(page: Page, name: string, fullPage = true): Promise<string> {
  const path = `${AUDIT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage });
  return path;
}
