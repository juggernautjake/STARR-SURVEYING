// e2e/hub-customize.spec.ts
//
// Smoke spec for the customizable hub canvas. Walks the round-trip
// the Slice 187 cutover wired up:
//
//   sign in → /admin/me → persona-default widgets render →
//   "Customize Hub" opens edit mode → "+ Add widget" opens the modal →
//   click a widget → SettingsPanel opens → change custom title →
//   Save → reload → assert the title persisted.
//
// Drag-and-drop + resize are exercised in a fixme test below — they
// need a hand-built PointerEvent sequence to drive @dnd-kit/sortable
// reliably and are intentionally deferred to a follow-up so this
// spec stays green as a baseline.
//
// Run:
//   E2E_BASE_URL=http://localhost:3000 \
//     E2E_LOGIN_EMAIL=… E2E_LOGIN_PASSWORD=… \
//     npx playwright test --grep hub-customize
//
// Slice 192 of customizable-hub-and-work-mode-2026-05-28.md.

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

const CUSTOM_TITLE = 'Smoke spec title';

test.describe('hub-customize', () => {
  // Reset the layout between runs so a previous failed run doesn't
  // leave the test user with a half-edited hub. Best-effort — the
  // endpoint exists from Slice 79 (`POST /api/admin/me/hub-layout/reset`).
  test.afterEach(async ({ page }) => {
    await page.request.post('/api/admin/me/hub-layout/reset').catch(() => {});
  });

  test('renders the hub canvas + customize → add → settings → save → persists', async ({ page }) => {
    await loginAsAdmin(page, '/admin/me');
    await expect(page).toHaveURL(/\/admin\/me/);

    // 1. Canvas mounts with persona defaults.
    await expect(page.locator('.hub-canvas')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Your hub' })).toBeVisible();
    await expect(page.locator('[data-widget-id]').first()).toBeVisible();

    // 2. Customize Hub button flips into edit mode.
    await page.getByRole('button', { name: /Customize Hub/i }).click();
    await expect(page.getByText(/Editing hub/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ Add widget/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save layout' })).toBeVisible();

    // 3. Add Widget modal opens + closes via Escape.
    await page.getByRole('button', { name: /\+ Add widget/i }).click();
    const addModal = page.getByRole('dialog', { name: /Add widget/i });
    await expect(addModal).toBeVisible();
    await expect(addModal.getByPlaceholder(/Search widgets/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(addModal).not.toBeVisible();

    // 4. Clicking a widget cell in edit mode opens the SettingsPanel.
    const firstCell = page.locator('[data-widget-id]').first();
    const widgetId = await firstCell.getAttribute('data-widget-id');
    await firstCell.click();

    const settingsHeading = page.getByRole('heading', { name: /— settings$/ });
    await expect(settingsHeading).toBeVisible();

    // 5. Type a custom title in the Layout tab.
    const titleInput = page.getByPlaceholder('Defaults to the catalog label');
    await titleInput.fill(CUSTOM_TITLE);

    // 6. Close the panel + Save layout.
    await page.keyboard.press('Escape');
    await expect(settingsHeading).not.toBeVisible();
    await page.getByRole('button', { name: 'Save layout' }).click();

    // The Save button is disabled while in flight + the edit bar
    // unmounts on success. Wait for the regular Customize button to
    // come back as a stable "save finished" signal.
    await expect(page.getByRole('button', { name: /Customize Hub/i })).toBeVisible({ timeout: 15_000 });

    // 7. Reload + assert the customised title persisted.
    await page.reload();
    await expect(page.locator('.hub-canvas')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Customize Hub/i }).click();
    if (widgetId) {
      await page.locator(`[data-widget-id="${widgetId}"]`).click();
    } else {
      await page.locator('[data-widget-id]').first().click();
    }
    await expect(page.getByPlaceholder('Defaults to the catalog label')).toHaveValue(CUSTOM_TITLE);
  });

  // Drag + resize via @dnd-kit/sortable + the pointer-event-based
  // resize handle need a hand-built PointerEvent sequence to fire
  // dnd-kit's PointerSensor (Playwright's `.dragTo` uses
  // mousedown/mousemove which dnd-kit's PointerSensor ignores). The
  // smoke above already proves the round-trip works end-to-end;
  // dedicated drag/resize coverage lives in a follow-up.
  test.fixme('drag reorders + resize updates the saved layout', async () => {
    // TODO: dispatch pointerdown/pointermove/pointerup via
    // page.evaluate so dnd-kit's PointerSensor activates.
  });
});
