// e2e/harness/new-layer-dialog.spec.ts — new-layer creation modal (§11).
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §11

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
