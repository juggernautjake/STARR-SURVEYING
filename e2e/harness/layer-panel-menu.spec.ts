// e2e/harness/layer-panel-menu.spec.ts — layer panel right-click menu.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §5
// (layers panel control)

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('right-clicking the layers panel shows bulk actions', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Right-click empty space in the layer list (below the rows).
  const filter = page.locator('input[placeholder="Filter layers…"]');
  await expect(filter).toBeVisible();
  const box = await filter.boundingBox();
  // Click well below the filter, in the scroll-list empty area.
  await page.mouse.click(box!.x + 40, box!.y + 220, { button: 'right' });

  await expect(page.getByRole('button', { name: 'Reveal all layers', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide all layers', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lock all layers', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock all layers', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duplicate active layer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export layers…', exact: true })).toBeVisible();

  await shot(page, 'layer-panel-menu');
});
