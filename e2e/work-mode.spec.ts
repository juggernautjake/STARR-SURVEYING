// e2e/work-mode.spec.ts
//
// Smoke spec for the Work Mode flow. Walks Phase 21–24's wiring:
//
//   sign in → /admin/me → "Enter Work Mode" link in the greeting →
//   role picker (multi-role) OR fast-path (single-role) → field crew
//   shell renders with the 10-tab strip → click a non-default tab →
//   tab panel updates → click "Exit Work Mode" → confirm modal →
//   "Exit only" → land back on /admin/me with the hub canvas mounted.
//
// AdminLayoutClient bypasses its sidebar/IconRail/topbar on
// `/admin/work-mode/*` per Slice 190, so the spec also asserts the
// "no admin chrome competing" invariant by checking the regular
// admin sidebar is NOT visible while in Work Mode.
//
// Run:
//   E2E_BASE_URL=http://localhost:3000 \
//     E2E_LOGIN_EMAIL=… E2E_LOGIN_PASSWORD=… \
//     npx playwright test --grep work-mode
//
// Slice 193 of customizable-hub-and-work-mode-2026-05-28.md.

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('work-mode', () => {
  test('enter → field crew shell → switch tab → exit lands back on hub', async ({ page }) => {
    await loginAsAdmin(page, '/admin/me');
    await expect(page).toHaveURL(/\/admin\/me/);

    // 1. The greeting carries an "Enter Work Mode" anchor.
    const enterLink = page.getByRole('link', { name: 'Enter Work Mode' });
    await expect(enterLink).toBeVisible({ timeout: 20_000 });
    await enterLink.click();

    // 2. Lands on the start picker OR (single-role) fast-paths.
    await page.waitForURL((url) => url.pathname.startsWith('/admin/work-mode'), { timeout: 15_000 });

    // The multi-role picker renders "Pick a work mode" + role tiles.
    // The single-role fast-path skips straight to /admin/work-mode/<role>.
    // Either way is fine — we drive the test from the URL.
    const pickerHeading = page.getByRole('heading', { name: /Pick a work mode/i });
    if (await pickerHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Click the Field Crew tile if it's available, otherwise pick the
      // first available role tile.
      const fieldCrewTile = page.getByRole('button', { name: /Field Crew/i });
      if (await fieldCrewTile.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await fieldCrewTile.click();
      } else {
        await page.locator('button[type="button"]').first().click();
      }
    }

    await page.waitForURL((url) => /\/admin\/work-mode\/[a-z_]+/.test(url.pathname), { timeout: 15_000 });

    // 3. Work Mode chrome owns the screen — no admin sidebar visible.
    //    The regular admin sidebar has the `admin-layout__main` wrapper
    //    + the IconRail. Slice 190's bypass returns `<>{children}</>`
    //    so neither should render.
    await expect(page.locator('.admin-layout__main')).toHaveCount(0);

    // The Work Mode top bar shows the "Exit Work Mode" button.
    const exitButton = page.getByRole('button', { name: /Exit Work Mode/i });
    await expect(exitButton).toBeVisible();

    // 4. If we landed on the field-crew shell specifically, switch a
    //    tab + assert the panel body updates.
    if (page.url().includes('/admin/work-mode/field_crew')) {
      // Default tab is "Job" → switch to "Photo".
      await page.getByRole('tab', { name: /Photo/i }).click();
      await expect(page.getByRole('heading', { name: 'Photo + Video' })).toBeVisible();
      // Switch back to Job to leave a deterministic state.
      await page.getByRole('tab', { name: /^Job$/ }).click();
      await expect(page.getByRole('heading', { name: 'Job summary' })).toBeVisible();
    }

    // 5. Exit Work Mode → confirm modal → "Exit only" → /admin/me.
    await exitButton.click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(/Exit Work Mode\?/i)).toBeVisible();
    await confirm.getByRole('button', { name: 'Exit only' }).click();

    await page.waitForURL((url) => url.pathname === '/admin/me', { timeout: 15_000 });
    await expect(page.locator('.hub-canvas')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Your hub' })).toBeVisible();
  });
});
