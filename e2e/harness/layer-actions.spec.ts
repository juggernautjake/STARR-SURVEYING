// e2e/harness/layer-actions.spec.ts — layer panel bulk actions function.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md
// (layers panel control)

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing } from './_harness';

test('New Layer from the panel menu adds a layer', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Right-click the empty layer-list area to open the panel menu.
  const filter = page.locator('input[placeholder="Filter layers…"]');
  const box = await filter.boundingBox();
  await page.mouse.click(box!.x + 40, box!.y + 220, { button: 'right' });

  // Two "New Layer" buttons exist (footer + this menu); the menu's is
  // last in the DOM.
  await page.getByRole('button', { name: 'New Layer', exact: true }).last().click();

  // Default new-layer name is "Layer 3" (2 existing layers).
  await expect(page.getByText('Layer 3', { exact: true }).first()).toBeVisible();
});

test('Hide all / Reveal all run without error', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  const filter = page.locator('input[placeholder="Filter layers…"]');
  const box = await filter.boundingBox();

  await page.mouse.click(box!.x + 40, box!.y + 220, { button: 'right' });
  await page.getByRole('button', { name: 'Hide all layers', exact: true }).click();

  await page.mouse.click(box!.x + 40, box!.y + 220, { button: 'right' });
  await page.getByRole('button', { name: 'Reveal all layers', exact: true }).click();

  // Panel still renders (no crash) — layers are still listed.
  await expect(page.getByText('Layer 0', { exact: true }).first()).toBeVisible();
});
