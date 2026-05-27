// e2e/harness/exit-button.spec.ts — the CAD menu bar exposes an Exit
// control to leave the standalone editor and return to the backend.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('menu bar shows an Exit-to-dashboard control', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  const exit = page.locator('button[aria-label="Exit to dashboard"]');
  await expect(exit).toBeVisible();
  await expect(exit).toBeEnabled();
  await shot(page, 'exit-button');
});
