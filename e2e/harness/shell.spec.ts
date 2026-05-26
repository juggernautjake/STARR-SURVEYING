// e2e/harness/shell.spec.ts — Slice 1 smoke: the CAD shell renders.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §2

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('CAD shell mounts and renders the editor', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Menu bar present.
  await expect(page.locator('button:has-text("File")').first()).toBeVisible();
  await expect(page.locator('button:has-text("AI")').first()).toBeVisible();

  await shot(page, 'shell');
});
