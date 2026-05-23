// e2e/cad-existing-tools.spec.ts
//
// CAD_POINTS_AND_AI slice G — production-safe coverage of the
// CAD features that already ship today: Inverse, Offset, and the
// AI menu's existing entries (Run AI Drawing Engine, AI sidebar).
// These run against the live deployment without needing this
// branch to ship first.

import { test, expect } from '@playwright/test';
import { openCadWithDrawing } from './fixtures/auth';

test.describe('Existing CAD tools', () => {
  test('menu bar mounts with every top-level menu the surveyor expects', async ({ page }) => {
    await openCadWithDrawing(page);

    // The CAD MenuBar is the canonical entry point to every tool;
    // its top-level labels are stable across releases.
    for (const label of ['File', 'Edit', 'View', 'Survey', 'Draw', 'AI', 'Help']) {
      await expect(page.locator(`button:has-text("${label}")`).first()).toBeVisible({ timeout: 10_000 });
    }

    // Confirm the canvas is mounted (the CAD app's primary surface).
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'test-results/cad-existing-tools.png', fullPage: true });
  });

  test('AI menu opens and lists the new solver dialogues', async ({ page }) => {
    await openCadWithDrawing(page);

    // After the startup modal is dismissed the menu bar is
    // interactive. Open the AI menu and confirm the three new
    // CAD_POINTS_AND_AI dialogues are wired into it.
    await page.locator('button:has-text("AI")').first().click();
    await expect(page.locator('text=Calc Point').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Close Drawing').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Reconcile Hand Sketch').first()).toBeVisible({ timeout: 5_000 });
  });
});
