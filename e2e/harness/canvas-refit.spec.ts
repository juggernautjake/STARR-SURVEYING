// e2e/harness/canvas-refit.spec.ts — Slice 5: does the Pixi canvas
// re-fit after a panel resize settles? (gray-band investigation)
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md

import { test } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('canvas repaints cleanly after a layer-panel resize settles', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  const handle = page.locator('[aria-label="Resize layer panel"]');
  const before = await handle.boundingBox();
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(before!.x + 140, before!.y + 5, { steps: 10 });
  await page.mouse.up();

  // Let the ResizeObserver rAF + a few render frames settle.
  await page.waitForTimeout(800);
  await shot(page, 'canvas-refit-settled');
});
