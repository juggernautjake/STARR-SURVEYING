// e2e/harness/command-bar.spec.ts — typed commands activate tools.
import { test, expect } from '@playwright/test';
import { openHarness, createBlankDrawing, shot } from './_harness';

test('typing a command in the CommandBar activates the tool', async ({ page }) => {
  await openHarness(page);
  await createBlankDrawing(page);

  const cmd = page.locator('input.placeholder-gray-600').first();
  await expect(cmd).toBeVisible();
  await cmd.click();

  // "line" → Line tool active (button aria-pressed).
  await cmd.fill('line');
  await cmd.press('Enter');
  await expect(page.getByRole('button', { name: 'Line', exact: true }).first())
    .toHaveAttribute('aria-pressed', 'true');

  // "p" → Point tool.
  await cmd.fill('p');
  await cmd.press('Enter');
  await expect(page.getByRole('button', { name: 'Point', exact: true }).first())
    .toHaveAttribute('aria-pressed', 'true');

  await shot(page, 'command-bar');
});
