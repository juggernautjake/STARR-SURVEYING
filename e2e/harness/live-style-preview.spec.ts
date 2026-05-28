// e2e/harness/live-style-preview.spec.ts
// Verifies the Properties panel renders style changes LIVE: increasing a
// selected line's weight thickens it on the canvas immediately, before the
// input blurs. Uses the harness CadTestHooks (cad:test:seedLine) to seed +
// select a line deterministically (synthetic canvas input is unreliable).

import { test, expect, type Page } from '@playwright/test';
import { openHarness, createBlankDrawing } from './_harness';

// Near-black pixels in the drawing area (excludes title block + north arrow).
async function ink(page: Page): Promise<number> {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async (base64) => {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('decode')); img.src = `data:image/png;base64,${base64}`; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const x0 = 300, y0 = 140, x1 = 1240, y1 = 650;
    const { data, width } = ctx.getImageData(0, 0, c.width, c.height);
    let dark = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (data[i] < 120 && data[i + 1] < 120 && data[i + 2] < 120) dark++;
    }
    return dark;
  }, b64);
}

test('Properties panel renders line-weight changes live', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);
  await page.waitForTimeout(800);

  // Deterministically seed + select a line via the harness test hook.
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.addEventListener('cad:test:seedLine:done', () => resolve(), { once: true });
    window.dispatchEvent(new CustomEvent('cad:test:seedLine', {
      detail: { start: { x: 100, y: 450 }, end: { x: 700, y: 450 } },
    }));
    setTimeout(resolve, 3000); // safety
  }));
  await page.waitForTimeout(400);

  const weight = page.locator('input[type="number"][max="20"]').first();
  await weight.waitFor({ state: 'visible', timeout: 10_000 });

  const before = await ink(page);
  await weight.fill('16');        // keeps focus → must render live (pre-blur)
  await page.waitForTimeout(300);
  const after = await ink(page);

  // eslint-disable-next-line no-console
  console.log('[live-style] ink before=', before, 'after(focused)=', after);
  expect(before).toBeGreaterThan(0);
  expect(after).toBeGreaterThan(before * 1.5);
});
