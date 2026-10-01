// e2e/harness/upload-android.spec.ts — the Upload files pop-up on an Android phone / field
// controller (owner, 2026-10-01: "whenever I tried to do the same on the tdc600 … It told me I had
// network error and wouldn't upload").
//
// Real FolderExplorer + UploadFilesDialog, real Chromium emulating a Pixel 7 (Android user agent,
// touch, phone viewport). Every /api call is answered by page.route and the "storage" PUT goes to a
// fake URL on the harness origin: nothing reaches a database or a bucket.
//
// Run (on Windows start the server yourself; the config's webServer line is POSIX-only):
//   NEXT_PUBLIC_E2E_HARNESS=1 AUTH_SECRET=<any throwaway value> npx next dev -p 3100
//   npx playwright test --config=playwright.harness.config.ts upload-android

import { test, expect, devices, type Page, type Route } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

// `defaultBrowserType` cannot be set inside a describe; everything else about the phone can.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...PIXEL } = devices['Pixel 7'];
test.use({ ...PIXEL });

const J = '11111111-1111-4111-8111-111111111111';
const ROOT = `mnt:jobs:${J}`;
const PHOTOS = `${ROOT}:photos`;
const CAD = `${ROOT}:cad`;
const DOCS = `${ROOT}:documents`;

interface Api {
  signs: Array<Record<string, unknown>>;
  puts: Array<{ url: string; contentType: string | null; bytes: number }>;
  rows: Array<Record<string, unknown>>;
  /** Answer for the Nth sign request (0-based); default = a signed URL. */
  signAnswer: (n: number, route: Route) => Promise<void> | null;
  /** Answer for the Nth PUT; default = 200. */
  putAnswer: (n: number, route: Route) => Promise<void> | null;
  supabaseHits: string[];
}

async function mockApi(page: Page): Promise<Api> {
  const api: Api = { signs: [], puts: [], rows: [], signAnswer: () => null, putAnswer: () => null, supabaseHits: [] };
  await page.route(/supabase\.co/, (r) => { api.supabaseHits.push(r.request().url()); return r.abort(); });
  await page.route('**/fake-storage/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const n = api.puts.length;
    api.puts.push({ url: req.url(), contentType: req.headers()['content-type'] ?? null, bytes: req.postDataBuffer()?.length ?? 0 });
    const custom = api.putAnswer(n, route);
    if (custom) return custom;
    return route.fulfill({ status: 200, json: { Key: 'ok' } });
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/admin/files/tree') {
      return route.fulfill({ json: {
        root: { id: ROOT, name: '24-103 — Harness job' }, breadcrumb: [], truncated: false, total_files: 0,
        folders: [
          { id: ROOT, name: '24-103 — Harness job', path: [], depth: 0, parent_id: null, files: [] },
          { id: `${ROOT}:research`, name: 'Research', path: ['Research'], depth: 1, parent_id: ROOT, folder_key: 'research', files: [] },
          { id: CAD, name: 'CAD', path: ['CAD'], depth: 1, parent_id: ROOT, folder_key: 'cad', files: [] },
          { id: PHOTOS, name: 'Photos', path: ['Photos'], depth: 1, parent_id: ROOT, folder_key: 'photos', files: [] },
          { id: `${ROOT}:videos`, name: 'Videos', path: ['Videos'], depth: 1, parent_id: ROOT, folder_key: 'videos', files: [] },
          { id: DOCS, name: 'Documents', path: ['Documents'], depth: 1, parent_id: ROOT, folder_key: 'documents', files: [] },
        ],
      } });
    }
    if (p === '/api/admin/jobs/files/upload' && req.method() === 'POST') {
      const n = api.signs.length;
      const body = req.postDataJSON() as Record<string, unknown>;
      api.signs.push(body);
      const custom = api.signAnswer(n, route);
      if (custom) return custom;
      return route.fulfill({ json: {
        file_id: `f${n}`, bucket: 'starr-field-files', path: `web/f${n}/${String(body.name)}`,
        signed_url: `${new URL(req.url()).origin}/fake-storage/put/${n}?token=t`,
      } });
    }
    if (p === '/api/admin/jobs/files' && req.method() === 'POST') {
      api.rows.push(req.postDataJSON() as Record<string, unknown>);
      return route.fulfill({ json: { file: { id: 'row' } } });
    }
    return route.fulfill({ json: {} });
  });
  return api;
}

async function openUpload(page: Page) {
  await page.goto('/ux-harness?page=job-files');
  await page.getByTestId('fe-upload').click({ timeout: 90_000 });
  await expect(page.getByTestId('upload-files-dialog')).toBeVisible();
}

const csv = (name: string, text = 'P1,1000.00,2000.00,100.0,IP\n') => ({ name, mimeType: '', buffer: Buffer.from(text) });

test.describe('Upload files on an Android phone / controller', () => {
  test('offers the Files app, the gallery and the camera — and the general picker is not narrowed', async ({ page }) => {
    await mockApi(page);
    await openUpload(page);
    // Chromium has showOpenFilePicker, and the user agent says Android → the system Files picker.
    await expect(page.getByTestId('ufd-choose')).toHaveText(/Choose files \(Files app\)/);
    await expect(page.getByTestId('ufd-choose-apps')).toBeVisible();
    await expect(page.getByTestId('ufd-choose-photos')).toBeVisible();
    await expect(page.getByTestId('ufd-take-photo')).toBeVisible();
    await expect(page.getByTestId('ufd-record-video')).toBeVisible();
    await expect(page.getByTestId('ufd-choose-folder')).toHaveCount(0);

    const general = page.getByTestId('ufd-input');
    expect(await general.getAttribute('accept')).toBeNull();
    expect(await general.getAttribute('capture')).toBeNull();
    expect(await general.getAttribute('multiple')).not.toBeNull();
    expect(await page.getByTestId('ufd-input-camera').getAttribute('capture')).toBe('environment');

    await expect(page.getByTestId('ufd-limits')).toContainText('.job');
    const help = page.getByTestId('ufd-trimble-help');
    await help.locator('summary').click();
    await expect(help).toContainText('Trimble Data');

    // Nothing scrolls sideways at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('a Trimble .job with no type uploads: rerouted from Photos to CAD, typed, filed', async ({ page }) => {
    const api = await mockApi(page);
    await openUpload(page);
    await page.getByTestId('ufd-input').setInputFiles([csv('Smith 24-103.job', 'TRIMBLE JOB BYTES')]);
    await expect(page.getByTestId('ufd-reroute-note')).toContainText('Photos takes photos only, so this goes in CAD');
    await page.getByTestId('ufd-upload').click();
    await expect(page.getByTestId('ufd-item')).toContainText('Saved in CAD');

    expect(api.signs).toHaveLength(1);
    expect(api.signs[0]).toMatchObject({ job_id: J, name: 'Smith 24-103.job', size_bytes: 17, mime_type: 'application/octet-stream' });
    expect(api.puts).toHaveLength(1);
    expect(api.puts[0]!.contentType).toBe('application/octet-stream');
    expect(api.puts[0]!.bytes).toBe(17);
    expect(api.rows[0]).toMatchObject({ job_id: J, file_name: 'Smith 24-103.job', section: 'drawing', file_type: 'trimble' });
    expect(api.supabaseHits).toEqual([]);
  });

  test('a dropped connection mid-send is retried automatically with a fresh link, and says so', async ({ page }) => {
    const api = await mockApi(page);
    api.putAnswer = (n, route) => (n === 0 ? route.abort('connectionreset') : null);
    await openUpload(page);
    await page.getByTestId('ufd-input').setInputFiles([csv('Points.csv')]);
    await page.getByTestId('ufd-upload').click();
    await expect(page.getByTestId('ufd-retry-note')).toContainText('Trying again');
    await expect(page.getByTestId('ufd-retry-note')).not.toContainText(/^network error/i);
    await expect(page.getByTestId('ufd-item')).toContainText('Saved in CAD', { timeout: 30_000 });
    expect(api.signs).toHaveLength(2);
    expect(api.puts).toHaveLength(2);
    expect(api.puts[1]!.contentType).toBe('text/csv');
    expect(api.rows).toHaveLength(1);
  });

  test('a 413 says the file is too large and where to go — not "network error"', async ({ page }) => {
    const api = await mockApi(page);
    api.signAnswer = (_n, route) => route.fulfill({ status: 413, contentType: 'text/plain', body: 'Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE' });
    await openUpload(page);
    await page.getByTestId('ufd-input').setInputFiles([csv('Big.csv')]);
    await page.getByTestId('ufd-upload').click();
    const item = page.getByTestId('ufd-item');
    await expect(item.getByRole('alert')).toContainText('larger than this upload accepts');
    await expect(item.getByRole('alert')).not.toContainText(/network/i);
    expect(api.signs, 'a 413 is not retried').toHaveLength(1);
  });

  test('one failed file does not fail the batch; "Retry failed" finishes it', async ({ page }) => {
    const api = await mockApi(page);
    let signedOut = true;
    api.signAnswer = (_n, route) => {
      const name = String((route.request().postDataJSON() as { name: string }).name);
      return name === 'B.csv' && signedOut ? route.fulfill({ status: 401, json: { error: 'Unauthorized' } }) : null;
    };
    await openUpload(page);
    await page.getByTestId('ufd-input').setInputFiles([csv('A.csv'), csv('B.csv'), csv('C.csv')]);
    await page.getByTestId('ufd-upload').click();
    await expect(page.getByTestId('ufd-failed-summary')).toContainText('1 file did not upload');
    await expect(page.getByTestId('ufd-item').filter({ hasText: 'B.csv' })).toContainText('You have been signed out');
    await expect(page.getByTestId('ufd-item').filter({ hasText: 'Saved in CAD' })).toHaveCount(2);

    signedOut = false;
    await page.getByTestId('ufd-retry-failed').click();
    await expect(page.getByTestId('ufd-item').filter({ hasText: 'Saved in CAD' })).toHaveCount(3);
    expect(api.rows.map((r) => r.file_name).sort()).toEqual(['A.csv', 'B.csv', 'C.csv']);
  });

  test('offline: the pop-up says so, waits, and finishes when the connection returns', async ({ page, context }) => {
    const api = await mockApi(page);
    await openUpload(page);
    await page.getByTestId('ufd-input').setInputFiles([csv('Field.csv')]);
    await context.setOffline(true);
    await expect(page.getByTestId('ufd-offline')).toBeVisible();
    await page.getByTestId('ufd-upload').click();
    await expect(page.getByTestId('ufd-retry-note')).toContainText('offline');
    expect(api.signs).toHaveLength(0);
    await context.setOffline(false);
    await expect(page.getByTestId('ufd-item')).toContainText('Saved in CAD', { timeout: 30_000 });
    await expect(page.getByTestId('ufd-offline')).toHaveCount(0);
  });

  test('an empty file is refused before sending, with what to do', async ({ page }) => {
    const api = await mockApi(page);
    await openUpload(page);
    await page.getByTestId('ufd-input').setInputFiles([{ name: 'Empty.job', mimeType: '', buffer: Buffer.alloc(0) }, csv('Ok.csv')]);
    await expect(page.getByTestId('ufd-item').filter({ hasText: 'Empty.job' })).toContainText('0 bytes');
    await page.getByTestId('ufd-upload').click();
    await expect(page.getByTestId('ufd-item').filter({ hasText: 'Ok.csv' })).toContainText('Saved in CAD');
    expect(api.signs.map((s) => s.name)).toEqual(['Ok.csv']);
  });
});
