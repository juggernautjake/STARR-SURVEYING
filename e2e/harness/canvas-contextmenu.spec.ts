// e2e/harness/canvas-contextmenu.spec.ts — right-click on the canvas opens
// the app's context menu (native menu is suppressed) and dismisses on an
// outside click.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('canvas right-click opens the app context menu and dismisses', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.4, { button: 'right' });

  const item = page.getByText('Zoom Extents', { exact: true });
  await expect(item).toBeVisible({ timeout: 4000 });
  await shot(page, 'canvas-contextmenu');

  // A normal left-click on empty canvas elsewhere dismisses it.
  await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height * 0.2);
  await expect(item).toHaveCount(0);
});
