// e2e/hub-customize.spec.ts
//
// Smoke spec for the customizable hub canvas. Rewritten for Slice 18
// of employee-hub-overhaul-2026-05-30.md after the
// employee-hub-overhaul collapsed the two editing surfaces (Slice 2),
// retired the SettingsPanel side rail (Slice 17), and moved every
// per-widget option into the GridEditor modal's WidgetOptionsPanel
// (Slice 11 / 13).
//
// Round-trip the spec walks:
//
//   sign in → /admin/me → persona-default widgets render →
//   click "✏️ Customize Hub" → GridEditor modal opens →
//   click a painted widget to select it → click ⚙ Options →
//   WidgetOptionsPanel opens → type a custom title →
//   close panel → Save layout → modal closes →
//   reload → assert the custom title persists on the canvas.
//
// Drag-to-move + resize + the schema-driven options renderer have
// vitest source-regex specs at __tests__/hub/grid-editor-move.test.ts,
// __tests__/hub/grid-editor-drop-commit.test.ts, and
// __tests__/hub/schema-options-form.test.ts. They aren't repeated
// here — Playwright's `.click()` exercises the click-toggle branch of
// the modal's pointer pipeline (threshold-gated startMove), which is
// what we need for selection.
//
// Run:
//   E2E_BASE_URL=http://localhost:3000 \
//     E2E_LOGIN_EMAIL=… E2E_LOGIN_PASSWORD=… \
//     npx playwright test --grep hub-customize

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

  test('customize → modal → options → title persists round-trip', async ({ page }) => {
    await loginAsAdmin(page, '/admin/me');
    await expect(page).toHaveURL(/\/admin\/me/);

    // 1. Canvas mounts with persona defaults.
    await expect(page.locator('.hub-canvas')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Your hub' })).toBeVisible();
    await expect(page.locator('[data-widget-id]').first()).toBeVisible();

    // 2. Click "✏️ Customize Hub" — the single editor entry point —
    //    opens the GridEditor modal (Slice 2 fixup made
    //    `open={isEditMode}` so the modal opens in one click).
    await page.getByTestId('open-grid-editor').click();
    await expect(page.getByTestId('grid-editor')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('grid-editor-grid')).toBeVisible();
    await expect(page.getByTestId('grid-editor-palette')).toBeVisible();

    // 3. Click a painted widget in the modal to select it.
    //    A pointer-down + pointer-up without movement falls into
    //    startMove's click-toggle branch (6 px drag threshold).
    const firstPainted = page.getByTestId('grid-editor-placed-widget').first();
    await firstPainted.scrollIntoViewIfNeeded();
    await firstPainted.click();
    await expect(firstPainted).toHaveAttribute('data-selected', 'true');

    // 4. Click ⚙ Options — the per-widget Options button — to open
    //    the WidgetOptionsPanel (Slice 11).
    await page.getByTestId('grid-editor-placed-options').click();
    await expect(page.getByTestId('widget-options-panel')).toBeVisible();
    await expect(page.getByTestId('widget-options-section-size')).toBeVisible();
    await expect(page.getByTestId('widget-options-section-header-color')).toBeVisible();
    await expect(page.getByTestId('widget-options-section-title')).toBeVisible();

    // 5. Type a custom title via the panel's title input.
    const titleInput = page.getByTestId('widget-options-title');
    await titleInput.fill(CUSTOM_TITLE);

    // 6. Close the panel and Save the layout from the modal footer.
    await page.getByTestId('widget-options-close').click();
    await expect(page.getByTestId('widget-options-panel')).not.toBeVisible();
    await page.getByRole('button', { name: 'Save layout' }).click();

    // 7. The modal closes (isEditMode flips off via saveDraft) and
    //    the "Customize Hub" entry button reappears on the canvas.
    await expect(page.getByTestId('open-grid-editor')).toBeVisible({ timeout: 15_000 });

    // 8. Reload + assert the customised title persisted onto the
    //    read-only canvas. WidgetFrame's <h2> renders titleOverride
    //    when present.
    await page.reload();
    await expect(page.locator('.hub-canvas')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(CUSTOM_TITLE).first()).toBeVisible();
  });

  // Drag-to-move via the pointer pipeline + the corner-drag resize
  // need a hand-built PointerEvent sequence (Playwright's `.dragTo`
  // doesn't fire the pointer events at the rate the threshold gate
  // expects). The vitest source-regex specs at
  // __tests__/hub/grid-editor-{move,drop-commit}.test.ts cover the
  // wiring; dedicated end-to-end drag coverage stays as a follow-up.
  test.fixme('drag-to-move + resize in the modal commit on save', async () => {
    // TODO: dispatch pointerdown/move/up via page.evaluate so the
    // threshold-gated drag actually engages.
  });
});
