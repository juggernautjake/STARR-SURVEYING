// e2e/hub-editor-perf.spec.ts
//
// Slice 208 of hub-editor-performance-and-ux-2026-05-29.md. Smoke
// covering the things only a browser can verify deterministically:
// the ?debug=hub-perf URL flag mounts the overlay, the overlay's
// data-testid is reachable, and the canvas reports a render count.
//
// Drag-end-to-end + window-resize-breakpoint flows from the original
// scope are deferred — both need dnd-kit mouse simulation or viewport
// resize at multiple sizes, which is brittle in the shared Playwright
// fixture today. The 684+ vitest specs across __tests__/hub already
// lock the underlying contracts (memo skip, single ResizeObserver,
// startTransition scheduling); this e2e spec only confirms the
// observability surface is wired into the live shell.
//
// Run:
//   E2E_BASE_URL=http://localhost:3000 \
//     E2E_LOGIN_EMAIL=… E2E_LOGIN_PASSWORD=… \
//     npx playwright test --grep hub-editor-perf

import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('hub-editor-perf — debug overlay', () => {
  test('?debug=hub-perf mounts the floating render-count overlay', async ({ page }) => {
    await loginAsAdmin(page, '/admin/me?debug=hub-perf');
    await expect(page).toHaveURL(/\/admin\/me/);

    // The overlay carries data-testid="hub-perf-overlay" and the
    // hub-perf title token; both are stable contracts the vitest
    // suite locks at the component level.
    const overlay = page.getByTestId('hub-perf-overlay');
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await expect(overlay).toContainText('hub-perf');
    await expect(overlay).toContainText('Canvas renders');
    await expect(overlay).toContainText('Mode');
  });

  test('overlay is absent without the debug flag', async ({ page }) => {
    await loginAsAdmin(page, '/admin/me');
    await expect(page).toHaveURL(/\/admin\/me/);
    // The hub-canvas should mount with no overlay.
    await expect(page.getByTestId('hub-perf-overlay')).toHaveCount(0);
  });

  test('overlay reports a positive canvas render count after first paint', async ({ page }) => {
    await loginAsAdmin(page, '/admin/me?debug=hub-perf');
    const overlay = page.getByTestId('hub-perf-overlay');
    await expect(overlay).toBeVisible({ timeout: 15_000 });

    // Pull the displayed number — at least 1 by the time the
    // overlay paints (one render to set perfActive, the second
    // to mount the overlay).
    const text = await overlay.innerText();
    const match = text.match(/Canvas renders\s+(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });
});
