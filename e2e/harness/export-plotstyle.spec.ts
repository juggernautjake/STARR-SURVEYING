// e2e/harness/export-plotstyle.spec.ts
// Verifies the Print dialog's Plot Style actually affects the export:
// a GRAYSCALE PNG must have every pixel R==G==B, with real (dark) content
// present. (Slice 16 of the backend-audit planning doc.)

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openHarness, createBlankDrawing, AUDIT_DIR } from './_harness';

test('Grayscale plot style produces a grayscale PNG', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openPrintDialog')));

  // Pick the Plot Style <select> (the one offering AS_DISPLAYED) → Grayscale.
  const plotSelect = page.locator('select', { has: page.locator('option[value="AS_DISPLAYED"]') });
  await plotSelect.waitFor({ state: 'visible', timeout: 20_000 });
  await plotSelect.selectOption('GRAYSCALE');

  const exportBtn = page.locator('button:has-text("Export PNG")');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    exportBtn.click(),
  ]);
  const outPath = `${AUDIT_DIR}/${download.suggestedFilename()}`;
  await download.saveAs(outPath);

  // Decode the PNG in-browser and inspect pixels.
  const b64 = fs.readFileSync(outPath).toString('base64');
  const result = await page.evaluate(async (base64) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode failed'));
      img.src = `data:image/png;base64,${base64}`;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let nonGray = 0;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.abs(r - g) > 1 || Math.abs(g - b) > 1) nonGray++;
      if (r < 128 && g < 128 && b < 128) dark++;
    }
    return { nonGray, dark, pixels: (data.length / 4) };
  }, b64);

  // eslint-disable-next-line no-console
  console.log('[export-plotstyle]', result);
  expect(result.nonGray).toBe(0);      // fully grayscale
  expect(result.dark).toBeGreaterThan(0); // real content (title-block lines), not a blank sheet
});
