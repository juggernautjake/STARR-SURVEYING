// e2e/harness/export-pdf.spec.ts
// Verifies the Print/Export dialog produces a real PDF download (Slice 2 of
// docs/planning/completed/backend-audit-and-improvements-2026-05-27.md).

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openHarness, createBlankDrawing, AUDIT_DIR } from './_harness';

test('Print dialog exports a non-empty PDF', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openPrintDialog')));

  const exportBtn = page.locator('button:has-text("Export PDF")');
  await exportBtn.waitFor({ state: 'visible', timeout: 20_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    exportBtn.click(),
  ]);

  const fname = download.suggestedFilename();
  expect(fname.toLowerCase().endsWith('.pdf')).toBeTruthy();

  const outPath = `${AUDIT_DIR}/${fname}`;
  await download.saveAs(outPath);
  const bytes = fs.statSync(outPath).size;
  // PDF magic header "%PDF".
  const raw = fs.readFileSync(outPath);
  const head = raw.subarray(0, 5).toString('latin1');
  expect(head.startsWith('%PDF')).toBeTruthy();
  expect(bytes).toBeGreaterThan(1000);

  // Page must be sized to the selected paper (default Tabloid Landscape =
  // 17in x 11in = 1224 x 792 pt), proving Slice 18's paper sizing.
  const text = raw.toString('latin1');
  const mb = text.match(/MediaBox\s*\[\s*0(?:\.0+)?\s+0(?:\.0+)?\s+([\d.]+)\s+([\d.]+)\s*\]/);
  expect(mb, 'PDF should declare a MediaBox').not.toBeNull();
  if (mb) {
    const pageW = Math.round(parseFloat(mb[1]));
    const pageH = Math.round(parseFloat(mb[2]));
    // eslint-disable-next-line no-console
    console.log(`[export-pdf] MediaBox ${pageW} x ${pageH} pt`);
    expect(pageW).toBe(1224);
    expect(pageH).toBe(792);
  }
  // eslint-disable-next-line no-console
  console.log(`[export-pdf] wrote ${outPath} (${bytes} bytes), header=${head}`);
});
