// e2e/harness/canvas-measure.spec.ts — diagnostic: canvas vs container size.
import { test } from '@playwright/test';
import { openHarness, createBlankDrawing } from './_harness';

test('measure canvas vs container after resize', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  const measure = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const container = canvas?.parentElement;
      const cr = canvas?.getBoundingClientRect();
      const pr = container?.getBoundingClientRect();
      return {
        canvasRect: cr ? { w: Math.round(cr.width), h: Math.round(cr.height) } : null,
        containerRect: pr ? { w: Math.round(pr.width), h: Math.round(pr.height) } : null,
        styleW: canvas?.style.width,
        styleH: canvas?.style.height,
        bufW: canvas?.width,
        bufH: canvas?.height,
      };
    });

  console.log('BEFORE', JSON.stringify(await measure()));

  const handle = page.locator('[aria-label="Resize layer panel"]');
  const before = await handle.boundingBox();
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(before!.x + 140, before!.y + 5, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(900);

  console.log('AFTER', JSON.stringify(await measure()));
});
