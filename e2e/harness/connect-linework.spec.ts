// e2e/harness/connect-linework.spec.ts — the Survey ▸ Connect Points into
// Linework command is wired (field-to-finish is user-triggered, not
// automatic on import).
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('Survey menu exposes a manual Connect Points into Linework command', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.getByRole('button', { name: 'Survey', exact: true }).click();
  const item = page.getByText('Connect Points into Linework', { exact: true });
  await expect(item).toBeVisible();
  await item.click();

  // With no imported points it reports the empty state (proves the
  // command is wired end-to-end through the canvas handler).
  await expect(page.getByText(/No imported survey points to connect/)).toBeVisible({ timeout: 5000 });
  await shot(page, 'connect-linework-empty');
});
