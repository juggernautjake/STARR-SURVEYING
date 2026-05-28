// e2e/harness/export-elements.spec.ts
// Verifies the Print dialog's "Print Elements" toggles affect the export:
// turning OFF the Title Block must remove its ink from the exported PNG.
// (Slice 17 of the backend-audit planning doc.)

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { openHarness, createBlankDrawing, AUDIT_DIR } from './_harness';

async function darkPixelCount(page: Page, pngPath: string): Promise<number> {
  const b64 = fs.readFileSync(pngPath).toString('base64');
  return page.evaluate(async (base64) => {
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
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128) dark++;
    }
    return dark;
  }, b64);
}

async function exportPng(page: Page, name: string): Promise<string> {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openPrintDialog')));
  const btn = page.locator('button:has-text("Export PNG")');
  await btn.waitFor({ state: 'visible', timeout: 20_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    btn.click(),
  ]);
  const p = `${AUDIT_DIR}/${name}.png`;
  await dl.saveAs(p);
  return p;
}

test('Print Elements toggle removes the title block from the export', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  // Baseline: everything on.
  const allOn = await exportPng(page, 'elements-all-on');
  const darkAllOn = await darkPixelCount(page, allOn);

  // Re-open the dialog and turn the Title Block element OFF.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openPrintDialog')));
  const tbCheckbox = page.locator('label:has-text("Title Block") input[type="checkbox"]');
  await tbCheckbox.waitFor({ state: 'visible', timeout: 20_000 });
  if (await tbCheckbox.isChecked()) await tbCheckbox.uncheck();

  const tbOffBtn = page.locator('button:has-text("Export PNG")');
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    tbOffBtn.click(),
  ]);
  const tbOff = `${AUDIT_DIR}/elements-tb-off.png`;
  await dl.saveAs(tbOff);
  const darkTbOff = await darkPixelCount(page, tbOff);

  // eslint-disable-next-line no-console
  console.log('[export-elements] dark all-on=', darkAllOn, 'dark tb-off=', darkTbOff);
  expect(darkAllOn).toBeGreaterThan(0);
  // Removing the title block must drop a meaningful amount of ink.
  expect(darkTbOff).toBeLessThan(darkAllOn * 0.9);
});
