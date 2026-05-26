// e2e/harness/new-layer-dialog.spec.ts — new-layer creation modal (§11).
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §11

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('New Layer opens a modal to name/describe/pick points, then creates', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Footer "New Layer" button (first in the DOM).
  await page.getByRole('button', { name: 'New Layer', exact: true }).first().click();

  // Modal with all the fields.
  await expect(page.getByRole('heading', { name: 'New layer' })).toBeVisible();
  const nameInput = page.getByLabel('Layer name');
  await expect(page.getByText('Description (optional)')).toBeVisible();
  await expect(page.getByText(/Move points into this layer/)).toBeVisible();
  await shot(page, 'new-layer-dialog');

  // Name it and create.
  await nameInput.fill('Boundary');
  await page.getByRole('button', { name: 'Create layer' }).click();

  // The new layer appears in the panel.
  await expect(page.getByText('Boundary', { exact: true }).first()).toBeVisible();
});

test('Cancel smoothly closes the New Layer modal (§17a exit transition)', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);
  await page.getByRole('button', { name: 'New Layer', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'New layer' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  // After the exit transition the modal unmounts.
  await expect(page.getByRole('heading', { name: 'New layer' })).toBeHidden({ timeout: 4000 });
});
