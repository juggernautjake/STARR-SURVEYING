// e2e/harness/layer-scoped-editing.spec.ts — the "Edit: active layer only"
// preference stops features on non-active layers from being selected.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('restricting editing to the active layer blocks selecting other layers', async ({ page }) => {
  test.slow(); // cold-compile + many interactions; triple the default budget
  await openHarness(page);
  await createBlankDrawing(page);

  // Draw a point on the default layer.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_POINT' } })));
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(150);

  async function boxSelect() {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'SELECT' } })));
    await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.6, { steps: 8 });
    await page.mouse.up();
  }

  // Baseline (any visible layer): the point selects.
  await boxSelect();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible({ timeout: 5000 });
  await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.15); // deselect

  // Create a new layer (becomes active) so the point is on a NON-active layer.
  await page.getByRole('button', { name: 'New Layer' }).click();
  const dialogHeading = page.getByRole('heading', { name: 'New layer' });
  await expect(dialogHeading).toBeVisible();
  await page.getByRole('button', { name: 'Create layer' }).click();
  // Wait for the modal (and its click-blocking backdrop) to fully close.
  await expect(dialogHeading).toHaveCount(0);

  // Ensure the preference is "active layer only" regardless of any persisted
  // state, then confirm.
  const editBtn = page.getByRole('button', { name: /Edit:/ });
  if (!(await editBtn.innerText()).includes('active layer only')) {
    await editBtn.click();
  }
  await expect(page.getByRole('button', { name: /active layer only/ })).toBeVisible();

  // The point is on the old layer → box-select no longer selects it.
  await boxSelect();
  await expect(page.getByText('1 selected', { exact: true })).toHaveCount(0);
  await shot(page, 'layer-scoped-editing');

  // Switch back to "any visible layer" → it selects again.
  await page.getByRole('button', { name: /Edit:/ }).click();
  await expect(page.getByRole('button', { name: /any visible layer/ })).toBeVisible();
  await boxSelect();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible({ timeout: 5000 });
});
