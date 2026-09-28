// e2e/harness/heic-upload.spec.ts — an iPhone HEIC uploaded through real admin screens arrives at
// the server as a JPEG.
//
// Owner, 2026-09-27: *"Can we create a built in converter on starr surveying so it can automatically
// convert HEIC files into jpg files? if it is possible to build in the converter tool on upload,
// then please do that."*
//
// Drives the REAL components (My Files — a document store with a picker and a drop zone; the Profile
// avatar — an image-only picker) in the unauthenticated /ux-harness, in real Chromium, with the real
// WebAssembly converter in its real Web Worker. Nothing here reaches Supabase: every /api call is
// answered by `page.route`, and any request to a supabase.co host is aborted and fails the test.
//
// What is asserted is the REQUEST BODY the page sends — i.e. what would have been stored.
//
// Run (the harness config's webServer line is POSIX-only; on Windows start the server yourself):
//   NEXT_PUBLIC_E2E_HARNESS=1 AUTH_SECRET=<any throwaway value> npx next dev -p 3100
//   npx playwright test --config=playwright.harness.config.ts heic-upload

import { test, expect, type Page, type Request } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const FIX = path.join(process.cwd(), '__tests__', 'fixtures', 'heic');
const HEIC = fs.readFileSync(path.join(FIX, 'plain.heic'));
const PORTRAIT = fs.readFileSync(path.join(FIX, 'orientation-6.heic'));
/** A HEIC header over bytes that are not a HEIF file: detected as HEIC, cannot be decoded. */
const BROKEN_HEIC = Buffer.concat([HEIC.subarray(0, 40), Buffer.alloc(400)]);

test.describe.configure({ timeout: 180_000 });

function bytesOfDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
  const m = /^data:([^;]*);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error(`not a data URL: ${dataUrl.slice(0, 40)}`);
  return { mime: m[1]!, bytes: Buffer.from(m[2]!, 'base64') };
}
const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isHeicBytes = (b: Buffer) => b.subarray(4, 8).toString('latin1') === 'ftyp';

/** Mock the whole API surface, and make any attempt to reach Supabase a test failure. */
async function mockEverything(page: Page): Promise<{ uploads: Request[]; supabaseHits: string[] }> {
  const uploads: Request[] = [];
  const supabaseHits: string[] = [];
  await page.route(/supabase\.co/, (route) => {
    supabaseHits.push(route.request().url());
    return route.abort();
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/api/admin/my-files' && req.method() === 'POST') {
      uploads.push(req);
      const body = req.postDataJSON() as { name: string };
      return route.fulfill({ status: 201, json: { file: { id: `f${uploads.length}`, file_name: body.name, file_type: 'image/jpeg', file_size: 1, folder: 'other', uploaded_at: new Date().toISOString() } } });
    }
    if (url.pathname === '/api/admin/profile/avatar' && req.method() === 'POST') {
      uploads.push(req);
      return route.fulfill({ status: 200, json: { avatar_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } });
    }
    if (url.pathname === '/api/auth/session') {
      return route.fulfill({ json: { user: { name: 'Test Admin', email: 'harness@example.com', role: 'admin', roles: ['admin'] }, expires: '2999-12-31T23:59:59.999Z' } });
    }
    // Everything else: an empty, successful answer. Lists come back empty.
    return route.fulfill({ json: { files: [], images: [], jobs: [], methods: [], items: [], salary_history: [], bonuses: [], payouts: [] } });
  });
  return { uploads, supabaseHits };
}

async function open(page: Page, which: 'my-files' | 'profile') {
  page.on('console', (m) => { if (m.type() === 'error' || /heic/i.test(m.text())) console.log(`[browser ${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  await page.goto(`/ux-harness?page=${which}`);
}

test.describe('HEIC is converted to JPEG before it is uploaded', () => {
  test('My Files — file picker: IMG_5782.HEIC is sent as IMG_5782.jpg, a real JPEG', async ({ page }) => {
    const { uploads, supabaseHits } = await mockEverything(page);
    await open(page, 'my-files');
    const input = page.locator('input[type="file"]').first();
    await input.waitFor({ state: 'attached', timeout: 90_000 });

    await input.setInputFiles({ name: 'IMG_5782.HEIC', mimeType: 'image/heic', buffer: HEIC });

    await expect.poll(() => uploads.length, { timeout: 60_000 }).toBe(1);
    const body = uploads[0]!.postDataJSON() as { dataUrl: string; name: string };
    expect(body.name).toBe('IMG_5782.jpg');
    const { mime, bytes } = bytesOfDataUrl(body.dataUrl);
    expect(mime).toBe('image/jpeg');
    expect(isJpeg(bytes)).toBe(true);
    await expect(page.getByTestId('heic-guard-notice').first()).toContainText('Converted');
    expect(supabaseHits).toEqual([]);
  });

  test('My Files — drag and drop: a dropped HEIC is sent as a JPEG, other files untouched', async ({ page }) => {
    const { uploads, supabaseHits } = await mockEverything(page);
    await open(page, 'my-files');
    const zone = page.locator('.job-import__dropzone').first();
    await zone.waitFor({ state: 'visible', timeout: 90_000 });

    await zone.evaluate((el, { heic, pdf }) => {
      const toBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([toBytes(heic)], 'IMG_0100.HEIC', { type: '' })); // Windows: no type at all
      dt.items.add(new File([toBytes(pdf)], 'deed.pdf', { type: 'application/pdf' }));
      el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, { heic: PORTRAIT.toString('base64'), pdf: Buffer.from('%PDF-1.4\n%fake').toString('base64') });

    await expect.poll(() => uploads.length, { timeout: 60_000 }).toBe(2);
    const bodies = uploads.map((r) => r.postDataJSON() as { dataUrl: string; name: string });
    const photo = bodies.find((b) => b.name === 'IMG_0100.jpg');
    const deed = bodies.find((b) => b.name === 'deed.pdf');
    expect(photo, JSON.stringify(bodies.map((b) => b.name))).toBeTruthy();
    expect(isJpeg(bytesOfDataUrl(photo!.dataUrl).bytes)).toBe(true);
    expect(bytesOfDataUrl(deed!.dataUrl).mime).toBe('application/pdf');
    expect(supabaseHits).toEqual([]);
  });

  test('Profile avatar (image-only) — the wrong-MIME case: HEIC bytes named .JPG still arrive as JPEG', async ({ page }) => {
    const { uploads, supabaseHits } = await mockEverything(page);
    await open(page, 'profile');
    const input = page.getByTestId('profile-avatar-input');
    await input.waitFor({ state: 'attached', timeout: 90_000 });

    await input.setInputFiles({ name: 'IMG_0001.JPG', mimeType: 'image/jpeg', buffer: HEIC });

    await expect.poll(() => uploads.length, { timeout: 60_000 }).toBe(1);
    const { mime, bytes } = bytesOfDataUrl((uploads[0]!.postDataJSON() as { dataUrl: string }).dataUrl);
    expect(mime).toBe('image/jpeg');
    expect(isJpeg(bytes)).toBe(true);
    expect(isHeicBytes(bytes)).toBe(false);
    expect(supabaseHits).toEqual([]);
  });

  test('a HEIC ALREADY in storage is shown: a broken <img> is converted on view', async ({ page }) => {
    await mockEverything(page);
    // Stands in for a signed Supabase URL to an old upload. Served by the page route, not Supabase.
    await page.route('**/stored/IMG_0042.HEIC*', (route) => route.fulfill({ body: PORTRAIT, contentType: 'image/heic' }));
    await open(page, 'my-files');
    await page.locator('.job-import__dropzone').first().waitFor({ state: 'visible', timeout: 90_000 });

    await page.evaluate(() => {
      const img = document.createElement('img');
      img.id = 'old-heic';
      img.src = '/stored/IMG_0042.HEIC?token=abc';
      document.body.appendChild(img);
    });

    const img = page.locator('#old-heic');
    await expect(img).toHaveAttribute('data-heic-state', 'converted', { timeout: 60_000 });
    // Drawn, upright (portrait): 32 wide, 64 tall.
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([32, 64]);
  });

  test('Profile avatar (image-only) — a HEIC that cannot be converted is not uploaded, and the person is told why', async ({ page }) => {
    const { uploads } = await mockEverything(page);
    await open(page, 'profile');
    const input = page.getByTestId('profile-avatar-input');
    await input.waitFor({ state: 'attached', timeout: 90_000 });

    await input.setInputFiles({ name: 'IMG_0002.HEIC', mimeType: 'image/heic', buffer: BROKEN_HEIC });

    const notice = page.getByTestId('heic-guard-notice').first();
    await expect(notice).toContainText('only accepts JPEG or PNG', { timeout: 60_000 });
    await expect(notice).toContainText('Most Compatible');
    expect(uploads).toHaveLength(0);
  });
});
