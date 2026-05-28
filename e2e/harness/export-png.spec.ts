// e2e/harness/export-png.spec.ts
// Verifies the Print/Export dialog produces a real PNG download (Slice 1 of
// docs/planning/completed/backend-audit-and-improvements-2026-05-27.md).

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openHarness, createBlankDrawing, shot, AUDIT_DIR } from './_harness';

test('Print dialog exports a non-empty PNG', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Open the Print / Export dialog through its window event.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openPrintDialog')));

  const exportBtn = page.locator('button:has-text("Export PNG")');
  await exportBtn.waitFor({ state: 'visible', timeout: 20_000 });
  await shot(page, 'print-dialog-open');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    exportBtn.click(),
  ]);

  const fname = download.suggestedFilename();
  expect(fname.toLowerCase().endsWith('.png')).toBeTruthy();

  const outPath = `${AUDIT_DIR}/${fname}`;
  await download.saveAs(outPath);
  const bytes = fs.statSync(outPath).size;
  // PNG header check + non-trivial size.
  const head = fs.readFileSync(outPath).subarray(0, 8);
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  expect(isPng).toBeTruthy();
  expect(bytes).toBeGreaterThan(1000);
  // eslint-disable-next-line no-console
  console.log(`[export-png] wrote ${outPath} (${bytes} bytes), valid PNG=${isPng}`);
});
