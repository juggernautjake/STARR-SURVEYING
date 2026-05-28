// e2e/harness/canvas-touch-gestures.spec.ts
//
// Two-finger trackpad pan + pinch-zoom support and two-finger
// touch pan + pinch on touchscreens. The canvas listens for:
//   • wheel + ctrlKey       → pinch zoom (browser convention)
//   • wheel small / deltaX  → trackpad two-finger pan
//   • wheel large deltaY    → mouse wheel zoom (legacy)
//   • two-touch touchmove   → pan + zoom by centroid + distance
//
// Spec: user request 2026-05-28 (autonomous-loop session).

import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing } from './_harness';

async function readViewport(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    type Vp = { centerX: number; centerY: number; zoom: number };
    const win = window as unknown as {
      __cad?: { viewportStore?: { getState: () => Vp } };
    };
    const vp = win.__cad?.viewportStore?.getState();
    return vp ? { centerX: vp.centerX, centerY: vp.centerY, zoom: vp.zoom } : null;
  });
}

test.describe('Canvas touch + trackpad gestures', () => {
  test('trackpad two-finger drag pans the viewport (wheel without ctrlKey)', async ({ page }) => {
    await openHarness(page);
    await createBlankDrawing(page);

    const before = await readViewport(page);
    if (!before) test.skip(true, 'viewport store not exposed on window');

    // Dispatch a synthetic trackpad-pan: small fractional deltaY + deltaX,
    // no ctrlKey. Repeat enough times to overcome any quantisation.
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      for (let i = 0; i < 8; i++) {
        canvas.dispatchEvent(new WheelEvent('wheel', {
          clientX: cx, clientY: cy,
          deltaX: 6, deltaY: 4, deltaMode: 0,
          ctrlKey: false, bubbles: true, cancelable: true,
        }));
      }
    });
    await page.waitForTimeout(120);

    const after = await readViewport(page);
    // The drawing should have grabbed and shifted — zoom unchanged,
    // center moved.
    expect(after!.zoom).toBeCloseTo(before!.zoom, 5);
    expect(
      Math.abs(after!.centerX - before!.centerX) +
      Math.abs(after!.centerY - before!.centerY)
    ).toBeGreaterThan(0);
  });

  test('trackpad pinch (wheel + ctrlKey) zooms at the cursor', async ({ page }) => {
    await openHarness(page);
    await createBlankDrawing(page);

    const before = await readViewport(page);
    if (!before) test.skip(true, 'viewport store not exposed on window');

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      for (let i = 0; i < 5; i++) {
        canvas.dispatchEvent(new WheelEvent('wheel', {
          clientX: cx, clientY: cy,
          deltaX: 0, deltaY: -5, deltaMode: 0,
          ctrlKey: true, bubbles: true, cancelable: true,
        }));
      }
    });
    await page.waitForTimeout(120);

    const after = await readViewport(page);
    expect(after!.zoom).toBeGreaterThan(before!.zoom);
  });

  test('mouse wheel still zooms (large round deltaY without ctrlKey)', async ({ page }) => {
    await openHarness(page);
    await createBlankDrawing(page);

    const before = await readViewport(page);
    if (!before) test.skip(true, 'viewport store not exposed on window');

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // -200 with deltaMode=0 matches what Playwright's mouse.wheel produces
      // and looks like a discrete mouse-wheel tick.
      for (let i = 0; i < 5; i++) {
        canvas.dispatchEvent(new WheelEvent('wheel', {
          clientX: cx, clientY: cy,
          deltaX: 0, deltaY: -200, deltaMode: 0,
          ctrlKey: false, bubbles: true, cancelable: true,
        }));
      }
    });
    await page.waitForTimeout(120);

    const after = await readViewport(page);
    expect(after!.zoom).toBeGreaterThan(before!.zoom);
  });

  test('touchscreen two-finger drag pans the viewport', async ({ page }) => {
    await openHarness(page);
    await createBlankDrawing(page);

    const before = await readViewport(page);
    if (!before) test.skip(true, 'viewport store not exposed on window');

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const baseX = rect.left + rect.width / 2;
      const baseY = rect.top + rect.height / 2;
      const mk = (id: number, x: number, y: number) =>
        new Touch({ identifier: id, target: canvas, clientX: x, clientY: y });

      const start1 = mk(1, baseX - 30, baseY);
      const start2 = mk(2, baseX + 30, baseY);
      canvas.dispatchEvent(new TouchEvent('touchstart', {
        touches: [start1, start2], targetTouches: [start1, start2], changedTouches: [start1, start2],
        bubbles: true, cancelable: true,
      }));

      // Walk both fingers right + down by 80px in 8 steps.
      for (let step = 1; step <= 8; step++) {
        const dx = step * 10;
        const dy = step * 10;
        const t1 = mk(1, baseX - 30 + dx, baseY + dy);
        const t2 = mk(2, baseX + 30 + dx, baseY + dy);
        canvas.dispatchEvent(new TouchEvent('touchmove', {
          touches: [t1, t2], targetTouches: [t1, t2], changedTouches: [t1, t2],
          bubbles: true, cancelable: true,
        }));
      }
      canvas.dispatchEvent(new TouchEvent('touchend', {
        touches: [], targetTouches: [], changedTouches: [],
        bubbles: true, cancelable: true,
      }));
    });
    await page.waitForTimeout(120);

    const after = await readViewport(page);
    expect(after!.zoom).toBeCloseTo(before!.zoom, 5);
    // Both centers must have moved — fingers walked +x and +y in screen coords.
    expect(after!.centerX).not.toBeCloseTo(before!.centerX, 3);
    expect(after!.centerY).not.toBeCloseTo(before!.centerY, 3);
  });

  test('touchscreen pinch (two fingers spreading) zooms in', async ({ page }) => {
    await openHarness(page);
    await createBlankDrawing(page);

    const before = await readViewport(page);
    if (!before) test.skip(true, 'viewport store not exposed on window');

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const baseX = rect.left + rect.width / 2;
      const baseY = rect.top + rect.height / 2;
      const mk = (id: number, x: number, y: number) =>
        new Touch({ identifier: id, target: canvas, clientX: x, clientY: y });

      const start1 = mk(1, baseX - 30, baseY);
      const start2 = mk(2, baseX + 30, baseY);
      canvas.dispatchEvent(new TouchEvent('touchstart', {
        touches: [start1, start2], targetTouches: [start1, start2], changedTouches: [start1, start2],
        bubbles: true, cancelable: true,
      }));

      // Spread fingers apart symmetrically — distance grows from 60 to 200.
      for (let step = 1; step <= 7; step++) {
        const spread = 30 + step * 10;
        const t1 = mk(1, baseX - spread, baseY);
        const t2 = mk(2, baseX + spread, baseY);
        canvas.dispatchEvent(new TouchEvent('touchmove', {
          touches: [t1, t2], targetTouches: [t1, t2], changedTouches: [t1, t2],
          bubbles: true, cancelable: true,
        }));
      }
      canvas.dispatchEvent(new TouchEvent('touchend', {
        touches: [], targetTouches: [], changedTouches: [],
        bubbles: true, cancelable: true,
      }));
    });
    await page.waitForTimeout(120);

    const after = await readViewport(page);
    expect(after!.zoom).toBeGreaterThan(before!.zoom);
  });
});
