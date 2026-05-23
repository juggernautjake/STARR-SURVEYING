// e2e/cad-calc-point-compute.spec.ts
//
// CAD_POINTS_AND_AI slice G — end-to-end functional check of the
// Calc Point solver against the live deployment. Places a real
// POINT via the command bar, selects it, and drives the
// BEARING_DISTANCE method (the only method that needs just one
// point), asserting the computed coordinate matches forward
// geometry. This proves the dialog → lib/cad/geometry/solver
// wiring is intact in the deployed build, not just that the UI
// renders.
//
// NOTE: this spec surfaced a real bug — the dialog read the POINT
// coordinate from `geometry.position` when the field is actually
// `geometry.point`, crashing whenever a point was selected. Fixed
// in this commit (see lib/cad/ai/selection-points.ts + its unit
// test). The spec is deployment-gated: it goes green once the fix
// ships; against the pre-fix production build it fails because the
// dialog crashes on a selected point.

import { test, expect } from '@playwright/test';
import { openCadWithDrawing } from './fixtures/auth';

// The command-bar input is unique on the page. Prefer the testid
// (added this session); fall back to the structural selector so the
// test also works against builds that predate the testid.
function commandBar(page: import('@playwright/test').Page) {
  return page
    .getByTestId('command-bar-input')
    .or(page.locator('form input[autocomplete="off"][spellcheck="false"]'))
    .first();
}

test.describe('Calc Point — compute', () => {
  test('bearing+distance computes the expected coordinate from a placed point', async ({ page }) => {
    await openCadWithDrawing(page);

    // Activate the Point tool via the Draw menu. The bare 'p'
    // shortcut is a chord prefix (p l / p g) so the menu entry is
    // the deterministic way to enter DRAW_POINT.
    await page.locator('button:has-text("Draw")').first().click();
    await page.getByRole('button', { name: 'Point', exact: true })
      .or(page.locator('text="Point"').first())
      .first()
      .click();

    // Place a point by clicking the canvas. The exact survey
    // coordinate depends on the viewport transform, so we don't
    // assume it — we read it back from the dialog and assert the
    // solver output relative to it. This keeps the test robust to
    // pan/zoom while still proving the math end-to-end.
    const canvas = page.locator('canvas').first();
    await canvas.click({ position: { x: 500, y: 350 } });
    await page.keyboard.press('Escape'); // finish the point tool
    await page.keyboard.press('Control+a'); // select the placed point

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:openCalcPointDialog')));
    const methodPicker = page.getByTestId('calc-point-method');
    await expect(methodPicker).toBeVisible({ timeout: 5_000 });

    // BEARING_DISTANCE needs exactly one selected point.
    await methodPicker.selectOption('BEARING_DISTANCE');

    // The dialog lists each selected point as "N. name (x.xx, y.yy)".
    // Parse the first listed coordinate so the assertion doesn't
    // depend on where the canvas click landed in survey space.
    const listItem = page.locator('li:has-text("(")').first();
    await expect(listItem).toBeVisible({ timeout: 5_000 });
    const listText = await listItem.innerText();
    const m = listText.match(/\(([-\d.]+),\s*([-\d.]+)\)/);
    expect(m, `could not parse coordinate from "${listText}"`).not.toBeNull();
    const px = parseFloat(m![1]);
    const py = parseFloat(m![2]);

    // Due north (azimuth 0), 50 units → (px, py + 50).
    await page.getByTestId('calc-point-bearing').fill('0');
    await page.getByTestId('calc-point-distance').fill('50');
    await page.getByTestId('calc-point-compute').click();

    const result = page.getByTestId('calc-point-result');
    await expect(result).toBeVisible({ timeout: 5_000 });
    const resultText = await result.innerText();
    const rm = resultText.match(/\(([-\d.]+),\s*([-\d.]+)\)/);
    expect(rm, `could not parse result from "${resultText}"`).not.toBeNull();
    const rx = parseFloat(rm![1]);
    const ry = parseFloat(rm![2]);

    expect(Math.abs(rx - px)).toBeLessThan(0.01);
    expect(Math.abs(ry - (py + 50))).toBeLessThan(0.01);

    // Suggest becomes enabled once a result exists.
    await expect(page.getByTestId('calc-point-suggest')).toBeEnabled();
  });
});
