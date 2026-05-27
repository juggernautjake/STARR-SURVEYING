// e2e/harness/native-contextmenu.spec.ts — the CAD app suppresses the
// browser's native right-click menu (but leaves text fields alone).
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing } from './_harness';

test('right-click on the canvas suppresses the native context menu', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  const preventedOnCanvas = await page.evaluate(() => {
    const el = document.querySelector('canvas') ?? document.body;
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(preventedOnCanvas).toBe(true);

  // The layers filter input keeps native behavior (copy/paste/spellcheck).
  const preventedOnInput = await page.evaluate(() => {
    const el = document.querySelector('input');
    if (!el) return null;
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(preventedOnInput).toBe(false);
});
