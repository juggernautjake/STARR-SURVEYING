// e2e/harness/job-files-delete.spec.ts — the job page's Photos grid (FolderExplorer), the screen the
// owner sent (2026-09-27): delete beside view/download, multi-select with Shift ranges, one
// confirmation with names and count, Undo, partial failures reported — and the HEIC tiles, which
// were broken images, rendering.
//
// Real component, real Chromium, real HEIC decoder. Every /api call is answered by page.route and
// any supabase.co request is aborted: nothing reaches a database or a bucket.
//
// Run (on Windows start the server yourself; the config's webServer line is POSIX-only):
//   NEXT_PUBLIC_E2E_HARNESS=1 AUTH_SECRET=<any throwaway value> npx next dev -p 3100
//   npx playwright test --config=playwright.harness.config.ts job-files-delete

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.describe.configure({ timeout: 180_000 });

const J = '11111111-1111-4111-8111-111111111111';
const ROOT = `mnt:jobs:${J}`;
const PHOTOS = `${ROOT}:photos`;
const HEIC = fs.readFileSync(path.join(process.cwd(), '__tests__', 'fixtures', 'heic', 'orientation-6.heic'));
/** A real 1×1 JPEG. */
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');

interface FileSpec { id: string; name: string; mime: string; size: number; thumb_state?: string }
const FILES: FileSpec[] = [
  { id: 'jf1', name: 'IMG_5791.HEIC', mime: 'image/heic', size: 2_800_000, thumb_state: 'failed' },
  { id: 'jf2', name: 'IMG_5792.jpg', mime: 'image/jpeg', size: 90_000 },
  { id: 'jf3', name: 'IMG_5793.jpg', mime: 'image/jpeg', size: 95_000 },
  { id: 'jf4', name: 'walkthrough.mov', mime: 'video/quicktime', size: 9_000_000 },
];

function node(f: FileSpec) {
  return {
    id: `mnt:job-files:${f.id}`, parent_id: PHOTOS, node_type: 'file', name: f.name, mime_type: f.mime,
    size_bytes: f.size, updated_at: '2026-09-20T12:00:00Z', access: 'download',
    source: { table: 'job_files', id: f.id, job_id: J, section: 'photos' },
    thumb_state: f.thumb_state ?? 'pending',
  };
}

interface Api {
  deletes: Array<Array<{ kind: string; id: string }>>;
  restores: Array<Array<{ kind: string; id: string }>>;
  thumbs: Array<{ node_id: string; data_url?: string }>;
  gone: Set<string>;
  /** Items the fake server refuses (403). */
  refuse: Set<string>;
  supabaseHits: string[];
}

async function mockApi(page: Page): Promise<Api> {
  const api: Api = { deletes: [], restores: [], thumbs: [], gone: new Set(), refuse: new Set(), supabaseHits: [] };
  await page.route(/supabase\.co/, (r) => { api.supabaseHits.push(r.request().url()); return r.abort(); });
  await page.route('**/stored/**', (r) => {
    const heic = r.request().url().includes('.HEIC');
    return r.fulfill({ body: heic ? HEIC : JPEG, contentType: heic ? 'image/heic' : 'image/jpeg' });
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (p === '/api/admin/files/tree') {
      const live = FILES.filter((f) => !api.gone.has(f.id)).map(node);
      return route.fulfill({ json: {
        root: { id: ROOT, name: '24-103 — Harness job' }, breadcrumb: [], truncated: false, total_files: live.length,
        folders: [
          { id: ROOT, name: '24-103 — Harness job', path: [], depth: 0, parent_id: null, files: [] },
          { id: PHOTOS, name: 'Photos', path: ['Photos'], depth: 1, parent_id: ROOT, folder_key: 'photos', files: live },
        ],
      } });
    }
    const dl = /^\/api\/admin\/files\/(.+)\/download$/.exec(p);
    if (dl) {
      const f = FILES.find((x) => decodeURIComponent(dl[1]!) === `mnt:job-files:${x.id}`);
      return route.fulfill({ json: { url: `/stored/${f?.name ?? 'x.jpg'}?token=t`, name: f?.name, mime_type: f?.mime } });
    }
    if (p === '/api/admin/files/thumbnail') {
      api.thumbs.push(req.postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    if (p === '/api/admin/files/bulk-delete') {
      const targets = (req.postDataJSON() as { targets: Array<{ kind: string; id: string }> }).targets;
      api.deletes.push(targets);
      const results = targets.map((t) => {
        const name = FILES.find((f) => f.id === t.id)?.name;
        if (api.refuse.has(t.id)) return { ...t, ok: false, status: 403, error: 'Your role cannot delete job files.', name };
        api.gone.add(t.id);
        return { ...t, ok: true, restorable: true, name };
      });
      const bad = results.filter((r) => !r.ok).length;
      return route.fulfill({ status: bad === 0 ? 200 : bad === results.length ? 403 : 207, json: { results } });
    }
    if (p === '/api/admin/files/bulk-restore') {
      const targets = (req.postDataJSON() as { targets: Array<{ kind: string; id: string }> }).targets;
      api.restores.push(targets);
      targets.forEach((t) => api.gone.delete(t.id));
      return route.fulfill({ json: { results: targets.map((t) => ({ ...t, ok: true })) } });
    }
    return route.fulfill({ json: {} });
  });
  return api;
}

async function openGrid(page: Page, view: 'list' | 'medium' = 'medium') {
  await page.goto('/ux-harness?page=job-files');
  await expect(page.getByText('IMG_5792.jpg').first()).toBeVisible({ timeout: 90_000 });
  await page.getByTestId(`fe-view-${view}`).click();
}

const tile = (page: Page, name: string) => page.locator('.fe__card', { hasText: name });

test.describe('job files grid — delete and multi-select', () => {
  test('Delete sits on the tile toolbar beside View and Download; one file, confirmed by name, then Undo', async ({ page }) => {
    const api = await mockApi(page);
    await openGrid(page);
    const t = tile(page, 'IMG_5792.jpg');
    await t.hover();
    await expect(t.getByRole('button', { name: 'Open IMG_5792.jpg' })).toBeVisible();
    await expect(t.getByRole('button', { name: 'Download IMG_5792.jpg' })).toBeVisible();
    await t.getByRole('button', { name: 'Delete IMG_5792.jpg' }).click();

    const dialog = page.getByTestId('fdel-dialog');
    await expect(dialog).toContainText('Delete “IMG_5792.jpg”?');
    await expect(dialog).toContainText('Undo');
    await expect(page.getByTestId('fdel-cancel')).toBeFocused();
    await page.getByTestId('fdel-confirm').click();

    await expect(page.getByTestId('fdel-toast')).toContainText('Deleted 1 file.');
    expect(api.deletes).toEqual([[{ kind: 'job_file', id: 'jf2' }]]);
    await expect(tile(page, 'IMG_5792.jpg')).toHaveCount(0);

    await page.getByTestId('fdel-undo').click();
    await expect(page.getByTestId('fdel-toast')).toContainText('Restored 1 file.');
    expect(api.restores).toEqual([[{ kind: 'job_file', id: 'jf2' }]]);
    await expect(tile(page, 'IMG_5792.jpg')).toHaveCount(1);
    expect(api.supabaseHits).toEqual([]);
  });

  test('Cancel (button or Esc) deletes nothing', async ({ page }) => {
    const api = await mockApi(page);
    await openGrid(page);
    await tile(page, 'IMG_5793.jpg').hover();
    await tile(page, 'IMG_5793.jpg').getByRole('button', { name: 'Delete IMG_5793.jpg' }).click();
    await page.getByTestId('fdel-cancel').click();
    await expect(page.getByTestId('fdel-dialog')).toHaveCount(0);
    await tile(page, 'IMG_5793.jpg').getByRole('button', { name: 'Delete IMG_5793.jpg' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('fdel-dialog')).toHaveCount(0);
    expect(api.deletes).toEqual([]);
  });

  test('Shift-click selects a range; one confirmation lists every name; a refusal is reported by name', async ({ page }) => {
    const api = await mockApi(page);
    api.refuse.add('jf3');
    await openGrid(page);

    await page.getByTestId('fsel-check-mnt:job-files:jf1').click();
    await page.getByTestId('fsel-check-mnt:job-files:jf3').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('fsel-bar')).toContainText('3 selected');
    // Once something is selected, every tile shows its checkbox.
    await expect(page.getByTestId('fsel-check-mnt:job-files:jf4')).toBeVisible();

    await page.getByTestId('fsel-delete').click();
    const dialog = page.getByTestId('fdel-dialog');
    await expect(dialog).toContainText('Delete 3 files?');
    for (const n of ['IMG_5791.HEIC', 'IMG_5792.jpg', 'IMG_5793.jpg']) await expect(dialog).toContainText(n);
    await page.getByTestId('fdel-confirm').click();

    expect(api.deletes[0]!.map((t) => t.id)).toEqual(['jf1', 'jf2', 'jf3']);
    const toast = page.getByTestId('fdel-toast');
    await expect(toast).toContainText('Deleted 2 of 3 files.');
    await expect(toast).toContainText('IMG_5793.jpg');
    await expect(toast).toContainText('Your role cannot delete job files.');
    await expect(tile(page, 'IMG_5793.jpg')).toHaveCount(1);
    await expect(tile(page, 'IMG_5792.jpg')).toHaveCount(0);
  });

  test('Select all takes the whole folder — images and videos — and Clear lets go', async ({ page }) => {
    const api = await mockApi(page);
    await openGrid(page, 'list');
    await page.getByTestId('fsel-all').check();
    await expect(page.getByTestId('fsel-bar')).toContainText('4 selected');
    await page.getByTestId('fsel-clear').click();
    await expect(page.getByTestId('fsel-bar')).toHaveCount(0);

    // Keyboard: Tab to a row checkbox, Space ticks it.
    await page.getByTestId('fsel-check-mnt:job-files:jf4').focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('fsel-bar')).toContainText('1 selected');
    await page.getByTestId('fsel-delete').click();
    await expect(page.getByTestId('fdel-dialog')).toContainText('walkthrough.mov');
    await page.getByTestId('fdel-confirm').click();
    await expect.poll(() => api.deletes.length).toBe(1);
    expect(api.deletes[0]).toEqual([{ kind: 'job_file', id: 'jf4' }]);
  });
});

test.describe('job files grid — HEIC', () => {
  test('an existing HEIC tile (previously a broken image) gets a real preview, made once and kept', async ({ page }) => {
    const api = await mockApi(page);
    await openGrid(page);
    // The preview is made from the converted HEIC and posted for everybody…
    await expect.poll(() => api.thumbs.find((t) => t.node_id === 'mnt:job-files:jf1')?.data_url ?? '', { timeout: 60_000 })
      .toMatch(/^data:image\//);
    // …and the tile shows it.
    const img = tile(page, 'IMG_5791.HEIC').locator('img.fe__card-img');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  });

  test('a HEIC dropped on the grid reaches the Upload files pop-up as a JPEG', async ({ page }) => {
    await mockApi(page);
    await openGrid(page);
    await page.locator('[data-testid="folder-explorer"]').evaluate((el, b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'IMG_0200.HEIC', { type: 'image/heic' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      }
    }, HEIC.toString('base64'));
    await expect(page.getByText('IMG_0200.jpg').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('IMG_0200.HEIC')).toHaveCount(0);
  });
});
