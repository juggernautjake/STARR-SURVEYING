// e2e/harness/resize-dock-table.spec.ts — Slice 4: right dock + point
// table resize.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('right dock is draggable to a new width', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  const handle = page.locator('[aria-label="Resize properties panel"]');
  await expect(handle).toBeVisible();
  const before = await handle.boundingBox();
  expect(before).not.toBeNull();

  // Handle is on the dock's LEFT edge; drag it left to widen the dock.
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(before!.x - 120, before!.y + 5, { steps: 8 });
  await page.mouse.up();

  const after = await handle.boundingBox();
  expect(after!.x).toBeLessThan(before!.x - 80);

  await shot(page, 'right-dock-resized');
});

test('point table opens and is draggable to a new height', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Open the point table via the View menu.
  await page.locator('button:has-text("View")').first().click();
  await page.locator('text=Toggle Point Table').first().click();

  const handle = page.locator('[aria-label="Resize point table"]');
  await expect(handle).toBeVisible();
  const before = await handle.boundingBox();
  expect(before).not.toBeNull();

  // Handle is on the table's TOP edge; drag it up to grow the table.
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(before!.x + 5, before!.y - 100, { steps: 8 });
  await page.mouse.up();

  const after = await handle.boundingBox();
  expect(after!.y).toBeLessThan(before!.y - 60);

  await shot(page, 'point-table-resized');
});
