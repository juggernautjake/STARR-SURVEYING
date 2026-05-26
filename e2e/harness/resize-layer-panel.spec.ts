// e2e/harness/resize-layer-panel.spec.ts — Slice 3: layer panel resize.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('layer panel is draggable to a new width', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  const handle = page.locator('[aria-label="Resize layer panel"]');
  await expect(handle).toBeVisible();

  const before = await handle.boundingBox();
  expect(before).not.toBeNull();

  // Drag the splitter ~120px to the right.
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(before!.x + 120, before!.y + 5, { steps: 8 });
  await page.mouse.up();

  const after = await handle.boundingBox();
  expect(after).not.toBeNull();
  // Handle (at the panel's right edge) should have moved meaningfully right.
  expect(after!.x).toBeGreaterThan(before!.x + 80);

  await shot(page, 'layer-panel-resized');
});
