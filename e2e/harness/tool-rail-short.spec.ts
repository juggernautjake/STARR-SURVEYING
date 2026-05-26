// e2e/harness/tool-rail-short.spec.ts — left tool rail on a short viewport.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md
// (resizable panels: left tool rail overflow)

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('tool rail stays reachable (scrolls) on a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await openHarness(page);
  await createBlankDrawing(page);

  // The first and a later tool button both exist; the rail scrolls so
  // even the lower tools are reachable rather than clipped away.
  const select = page.getByRole('button', { name: 'Select', exact: true }).first();
  const text = page.getByRole('button', { name: 'Text', exact: true }).first();
  await expect(select).toBeVisible();
  await expect(text).toBeAttached();
  // Scroll the rail to the bottom tool and confirm it becomes visible.
  await text.scrollIntoViewIfNeeded();
  await expect(text).toBeVisible();

  await shot(page, 'tool-rail-short', false);
});
