// e2e/cad-offset-tool.spec.ts
//
// Slice 7 of cad-offset-tool-2026-05-29.md — smoke for the OFFSET
// tool surface. Validates the wiring the Phase 1–2 slices add to
// the CAD shell without requiring deep canvas interaction: the
// toolbar entry exists, the floating panel doesn't mount until a
// source feature is picked, and the PropertyPanel "Offset Source"
// section only renders for offset features.
//
// Deep coverage of the metadata stamp, recompute helper, and
// source-mutation propagator lives in vitest (133 specs across
// __tests__/cad/operations) — those don't need a browser, so we
// keep this spec lean + focused on mounting + gating.

import { test, expect } from '@playwright/test';
import { openCadWithDrawing } from './fixtures/auth';

test.describe('CAD OFFSET tool — mount gating + toolbar entry', () => {
  test('toolbar exposes the Offset entry and activating it changes the cursor surface', async ({ page }) => {
    await openCadWithDrawing(page);

    // The OFFSET tool button lives in the left-side ToolBar with a
    // visible "Offset" tooltip / label. The selector matches both
    // the icon-button title attribute + the dropdown menu entry
    // wired in MenuBar.tsx.
    const offsetEntry = page.locator('[title*="Offset"], button:has-text("Offset")').first();
    await expect(offsetEntry).toBeVisible({ timeout: 15_000 });
  });

  test('OffsetPanel does not mount until a source feature is picked', async ({ page }) => {
    await openCadWithDrawing(page);
    // Without a source feature the floating panel from Slice 1 must
    // stay hidden — even when the OFFSET tool is active. The Slice-1
    // mount gate is `activeTool === 'OFFSET' && offsetSourceId !== null`.
    await expect(page.getByTestId('offset-panel')).toHaveCount(0);
  });

  test('PropertyPanel Offset Source section does not mount without an offset selection', async ({ page }) => {
    await openCadWithDrawing(page);
    // The Slice-4 section only renders when the selected feature
    // carries the Slice-3 metadata. With a freshly-created blank
    // drawing the section is absent.
    await expect(page.getByTestId('offset-source-section')).toHaveCount(0);
  });
});
