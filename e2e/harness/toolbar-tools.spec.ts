// e2e/harness/toolbar-tools.spec.ts — tool buttons activate their tool.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md
// (per-surface audit: ToolBar)

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

const TOOLS = ['Point', 'Line', 'Polyline', 'Polygon', 'Move', 'Select'];

test('toolbar buttons have accessible names and activate their tool', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Every tool button now exposes an accessible name (a11y fix).
  for (const label of TOOLS) {
    await expect(
      page.getByRole('button', { name: label, exact: true }).first(),
      `tool "${label}" has an accessible name`,
    ).toBeVisible();
  }

  // Activation + pressed-state works (use force to bypass the hover
  // tooltip overlay that otherwise intercepts the click).
  const point = page.getByRole('button', { name: 'Point', exact: true }).first();
  await point.click({ force: true });
  await expect(point).toHaveAttribute('aria-pressed', 'true');

  const polygon = page.getByRole('button', { name: 'Polygon', exact: true }).first();
  await polygon.click({ force: true });
  await expect(polygon).toHaveAttribute('aria-pressed', 'true');
  await expect(point).toHaveAttribute('aria-pressed', 'false');

  await shot(page, 'toolbar-tools');
});
