// e2e/harness/video-viewer-stays.spec.ts — a job's video stays open and keeps its place (owner,
// 2026-11-09): "I need the video player to stay open and keep its place in the video until the user
// clicks the x button on the modal. Also, we need better video controls like changing the speed."
//
// Real FolderExplorer + FileViewer + VideoPlayer in real Chromium, playing a real (generated, 6 s)
// MP4. Every /api call is answered by page.route; nothing reaches a database or a bucket.
//
// Run (on Windows start the server yourself; the config's webServer line is POSIX-only):
//   NEXT_PUBLIC_E2E_HARNESS=1 AUTH_SECRET=<any throwaway value> npx next dev -p 3100
//   npx playwright test --config=playwright.harness.config.ts video-viewer-stays

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.describe.configure({ timeout: 180_000 });

const J = '11111111-1111-4111-8111-111111111111';
const ROOT = `mnt:jobs:${J}`;
const PHOTOS = `${ROOT}:photos`;
const MP4 = fs.readFileSync(path.join(process.cwd(), '__tests__', 'fixtures', 'video', 'test-pattern-6s.mp4'));
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');

const FILES = [
  { id: 'jv1', name: 'fence-walk.mp4', mime: 'video/mp4', size: MP4.length },
  { id: 'jv2', name: 'pole-line.mp4', mime: 'video/mp4', size: MP4.length },
  { id: 'jf1', name: 'IMG_5792.jpg', mime: 'image/jpeg', size: 90_000 },
];

async function mockApi(page: Page, opts: { downloadDelayMs?: number } = {}) {
  await page.route(/supabase\.co/, (r) => r.abort());
  await page.route('**/stored/**', (r) => {
    const video = r.request().url().includes('.mp4');
    if (!video) return r.fulfill({ body: JPEG, contentType: 'image/jpeg' });
    // Byte ranges, as storage serves them — without them Chromium cannot seek at all.
    const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()['range'] ?? '');
    if (!m) return r.fulfill({ body: MP4, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes' } });
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), MP4.length - 1) : MP4.length - 1;
    return r.fulfill({
      status: 206, body: MP4.subarray(start, end + 1), contentType: 'video/mp4',
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${MP4.length}` },
    });
  });
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/api/admin/files/tree') {
      const files = FILES.map((f) => ({
        id: `mnt:job-files:${f.id}`, parent_id: PHOTOS, node_type: 'file', name: f.name, mime_type: f.mime,
        size_bytes: f.size, updated_at: '2026-11-05T12:00:00Z', access: 'download',
        source: { table: 'job_files', id: f.id, job_id: J, section: 'photos' }, thumb_state: 'pending',
      }));
      return route.fulfill({ json: {
        root: { id: ROOT, name: '24-103 — Harness job' }, breadcrumb: [], truncated: false, total_files: files.length,
        folders: [
          { id: ROOT, name: '24-103 — Harness job', path: [], depth: 0, parent_id: null, files: [] },
          { id: PHOTOS, name: 'Photos', path: ['Photos'], depth: 1, parent_id: ROOT, folder_key: 'photos', files },
        ],
      } });
    }
    const dl = /^\/api\/admin\/files\/(.+)\/download$/.exec(p);
    if (dl) {
      if (opts.downloadDelayMs) await new Promise((r) => setTimeout(r, opts.downloadDelayMs));
      const f = FILES.find((x) => decodeURIComponent(dl[1]!) === `mnt:job-files:${x.id}`);
      // A fresh signature every time, as the real route gives — the player must not restart for it.
      return route.fulfill({ json: { url: `/stored/${f?.name ?? 'x.jpg'}?token=${Math.random().toString(36).slice(2)}`, name: f?.name, mime_type: f?.mime } });
    }
    return route.fulfill({ json: {} });
  });
}

async function openGrid(page: Page) {
  await page.goto('/ux-harness?page=job-files');
  await expect(page.getByText('IMG_5792.jpg').first()).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('fe-view-medium').click();
}

const openButton = (page: Page, name: string) => page.locator('.fe__card', { hasText: name }).getByRole('button', { name: `Open ${name}` });
const videoTime = (page: Page) => page.evaluate(() => document.querySelector('video')?.currentTime ?? -1);
const videoReady = (page: Page) => page.evaluate(() => document.querySelector('video')?.readyState ?? 0);

test('a video stays open through Escape and the window losing focus, survives a reload where it was, and closes on the ✕', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApi(page);
  await openGrid(page);

  const card = page.locator('.fe__card', { hasText: 'fence-walk.mp4' });
  await card.hover();
  await openButton(page, 'fence-walk.mp4').click();
  const player = page.locator('.vp');
  await expect(player).toBeVisible();
  await expect.poll(() => videoReady(page), { timeout: 30_000 }).toBeGreaterThan(0);

  // Better controls: speed, skip, frame step, loop.
  await page.getByLabel('Playback speed').selectOption('2');
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.playbackRate)).toBe(2);
  await page.evaluate(() => { const v = document.querySelector('video')!; v.currentTime = 3; });
  await expect.poll(() => videoTime(page)).toBeCloseTo(3, 0);
  await page.getByRole('button', { name: 'Back one frame' }).click();
  await expect.poll(() => videoTime(page)).toBeLessThan(3);
  await page.evaluate(() => { const v = document.querySelector('video')!; v.currentTime = 3; });
  await expect.poll(() => videoTime(page)).toBeCloseTo(3, 0);
  await page.screenshot({ path: 'test-results/video-viewer-open.png' });

  // Escape is how people leave fullscreen; it must not take the video away. Nor may the window
  // losing focus or being hidden and shown again.
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(500);
  await expect(player).toBeVisible();
  expect(await videoTime(page)).toBeCloseTo(3, 0);

  // The worst case: the whole page is rebuilt. The viewer comes back on the same video, same place,
  // same speed.
  await page.reload();
  await expect(page.locator('.vp')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.fv-head__title')).toContainText('fence-walk.mp4');
  await expect.poll(() => videoReady(page), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => videoTime(page)).toBeCloseTo(3, 0);
  await expect(page.getByLabel('Playback speed')).toHaveValue('2');

  // The ✕ closes it, and then it stays closed.
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.fv-overlay')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('IMG_5792.jpg').first()).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('.fv-overlay')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('two files opened in quick succession settle on the second — no "Maximum update depth" (error #185)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApi(page, { downloadDelayMs: 400 });
  await openGrid(page);

  await page.locator('.fe__card', { hasText: 'fence-walk.mp4' }).hover();
  await openButton(page, 'fence-walk.mp4').click();
  await page.locator('.fe__card', { hasText: 'pole-line.mp4' }).hover();
  await openButton(page, 'pole-line.mp4').click();

  await expect(page.locator('.vp')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('.fv-head__title')).toContainText('pole-line.mp4');
  expect(errors.filter((e) => /185|Maximum update depth/.test(e))).toEqual([]);
});
