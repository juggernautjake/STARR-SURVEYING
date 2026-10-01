/**
 * Uploads that survive a field controller (owner, 2026-10-01).
 *
 * "whenever I tried to do the same on the tdc600, I struggled to find the job data and upload it to
 *  the website. It told me I had network error and wouldn't upload. … I need to always be able to
 *  access the files app and the google drive app if possible."
 *
 *   1. content types for every survey file Android cannot name
 *   2. the in-memory copy that stops Chrome's ERR_UPLOAD_FILE_CHANGED ("network error")
 *   3. checks before sending: empty, too large, too big for a function
 *   4. what a failure means, in words, and whether to try again
 *   5. the retry policy
 *   6. which pickers each device gets (TDC600, TSC5, phones, laptops)
 *   7. a folder instead of a refusal; survey files to CAD; same-name files
 *   8. My Files' direct-to-storage rules
 *   9. the wiring — the dialog, My Files, collector import, receipts, email replies
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  contentTypeForAnyFile, extensionOf, planSnapshots, snapshotFile, SNAPSHOT_MAX_BYTES, SNAPSHOT_BUDGET_BYTES,
  preflight, classifyUploadFailure, classifyError, UploadError, retryDelayMs, runWithRetry, asStep, MAX_ATTEMPTS,
  planPickers, isAndroid, isAndroidWebView, isJunkFile, duplicateNames, fitsThroughFunction, FUNCTION_BODY_LIMIT_BYTES,
  readJsonLoose, explainReadFailure, TRIMBLE_HELP, type FailureContext, type UploadPhase,
} from '@/lib/files/upload-resilience';
import { resolveDestination, suggestFolderKey, type UploadDestination } from '@/lib/files/upload-destinations';
import { checkMyFilesUpload, ownsStoragePath, myFilesStoragePath, MY_FILES_MAX_BYTES } from '@/lib/files/my-files-upload';
import { shrinkPlan, SHRINK_PASSES } from '@/lib/images/shrink-for-upload';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const MB = 1024 * 1024;

// ── 1. content types ─────────────────────────────────────────────────────────────────────────────

describe('a content type for any file', () => {
  it('keeps the browser’s own type when there is one', () => {
    expect(contentTypeForAnyFile('a.csv', 'application/vnd.ms-excel')).toBe('application/vnd.ms-excel');
  });

  it('derives one from the extension when Android hands over none', () => {
    expect(contentTypeForAnyFile('Smith Points.CSV', '')).toBe('text/csv');
    expect(contentTypeForAnyFile('notes.txt', null)).toBe('text/plain');
    expect(contentTypeForAnyFile('Smith.jxl', ''), 'Trimble JobXML is XML, not JPEG XL').toBe('application/xml');
    expect(contentTypeForAnyFile('plan.pdf', '')).toBe('application/pdf');
    expect(contentTypeForAnyFile('IMG_1.HEIC', '')).toBe('image/heic');
    expect(contentTypeForAnyFile('walk.mov', '')).toBe('video/quicktime');
    expect(contentTypeForAnyFile('base.dxf', '')).toBe('image/vnd.dxf');
  });

  it('falls back to octet-stream for formats with no registered type', () => {
    for (const n of ['Smith.job', 'raw.rw5', 'x.dc', 'trav.trv', 'trav.trb', 'noextension']) {
      expect(contentTypeForAnyFile(n, ''), n).toBe('application/octet-stream');
    }
  });

  it('reads the extension from the last dot only, ignoring paths and dotfiles', () => {
    expect(extensionOf('Trimble Data/Projects/Smith.v2.JOB')).toBe('job');
    expect(extensionOf('.hidden')).toBe('');
    expect(extensionOf(undefined)).toBe('');
  });
});

// ── 2. the in-memory copy ────────────────────────────────────────────────────────────────────────

describe('copying a picked file into memory (the TDC600 "network error")', () => {
  it('copies small files, streams large ones, and keeps a list within budget', () => {
    expect(planSnapshots([1_000, 2 * MB, SNAPSHOT_MAX_BYTES + 1])).toEqual([true, true, false]);
    const sixty = 60 * MB;
    const many = planSnapshots([sixty, sixty, sixty, sixty, sixty]);
    expect(many.filter(Boolean).length).toBe(Math.floor(SNAPSHOT_BUDGET_BYTES / sixty));
    expect(planSnapshots([10 * MB], SNAPSHOT_BUDGET_BYTES - 5 * MB), 'what is already in memory counts').toEqual([false]);
  });

  it('a 0-byte file is still read — Android can report 0 for a file it has not opened', () => {
    expect(planSnapshots([0])).toEqual([true]);
  });

  it('keeps the name and date, fills in a type, and holds the same bytes', async () => {
    const original = new File(['P1,100,200,10,IP'], 'Smith.csv', { type: '', lastModified: 1_700_000_000_000 });
    const copy = await snapshotFile(original);
    expect(copy).not.toBe(original);
    expect(copy.name).toBe('Smith.csv');
    expect(copy.lastModified).toBe(1_700_000_000_000);
    expect(copy.type).toBe('text/csv');
    expect(await copy.text()).toBe('P1,100,200,10,IP');
  });

  it('a file the device will not hand over is refused at once, in words, with the Trimble advice', async () => {
    const f = new File(['x'], 'Smith.job');
    const err = await snapshotFile(f, () => Promise.reject(new DOMException('changed', 'NotReadableError'))).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err.kind).toBe('unreadable');
    expect(err.message).toContain('Smith.job');
    expect(err.message).toContain('Trimble Access');
    expect(err.message).toMatch(/choose it again/);
    expect(classifyError(err, ctx()).transient, 'reading it again will not help on its own').toBe(false);
  });
});

// ── 3. before sending ────────────────────────────────────────────────────────────────────────────

describe('checks before a byte is sent', () => {
  it('an empty file is refused with what to do', () => {
    const r = preflight({ name: 'Smith.job', size: 0 }, 500 * MB);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.kind).toBe('empty'); expect(r.message).toContain('0 bytes'); }
  });

  it('a file over the limit is refused with both numbers', () => {
    const r = preflight({ name: 'walk.mp4', size: 600 * MB }, 500 * MB);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.kind).toBe('too-large'); expect(r.message).toContain('600 MB'); expect(r.message).toContain('500 MB'); }
  });

  it('anything else goes', () => {
    expect(preflight({ name: 'a.csv', size: 1 }, 500 * MB)).toEqual({ ok: true });
  });

  it('routes that take the file in the request stay under Vercel’s 4.5 MB body cap', () => {
    expect(FUNCTION_BODY_LIMIT_BYTES).toBeLessThan(4.5 * MB);
    expect(fitsThroughFunction(3 * MB)).toBe(true);
    expect(fitsThroughFunction(5 * MB)).toBe(false);
  });

  it('a platform 413 (plain text, not JSON) is read without throwing', async () => {
    const res = new Response('Request Entity Too Large\nFUNCTION_PAYLOAD_TOO_LARGE', { status: 413 });
    expect(await readJsonLoose(res)).toEqual({});
    expect(await readJsonLoose(new Response('{"error":"bad"}', { status: 400 }))).toEqual({ error: 'bad' });
  });
});

// ── 4. what a failure means ──────────────────────────────────────────────────────────────────────

function ctx(over: Partial<FailureContext> = {}): FailureContext {
  return { fileName: 'Smith.job', sizeBytes: 2 * MB, buffered: false, online: true, ...over };
}
const fail = (status: number | null, phase: UploadPhase, over: Partial<FailureContext> = {}, extra: { serverMessage?: string; responseText?: string } = {}) =>
  classifyUploadFailure({ status, phase, ...extra }, ctx(over));

describe('a failure, in words', () => {
  it('never says a bare "network error"', () => {
    const statuses = [null, 0, 400, 401, 403, 404, 408, 413, 429, 500, 502, 503, 504];
    for (const status of statuses) {
      for (const phase of ['start', 'send', 'save'] as const) {
        for (const buffered of [true, false]) {
          const m = fail(status, phase, { buffered }).message;
          expect(m, `${status} ${phase}`).not.toMatch(/^network error/i);
          expect(m.length, `${status} ${phase}`).toBeGreaterThan(25);
        }
      }
    }
  });

  it('a dropped send of a file NOT in memory names both causes, including an open Trimble job', () => {
    const c = fail(0, 'send');
    expect(c.kind).toBe('network');
    expect(c.transient).toBe(true);
    expect(c.message).toContain('Smith.job');
    expect(c.message).toContain('Trimble Access');
    expect(c.message).toMatch(/connection dropped/);
  });

  it('a dropped send of a file in memory can only be the connection', () => {
    const c = fail(0, 'send', { buffered: true });
    expect(c.message).not.toContain('Trimble');
    expect(c.message).toMatch(/connection/);
    expect(c.transient).toBe(true);
  });

  it('no answer while starting or saving says which step', () => {
    expect(fail(null, 'start').message).toMatch(/reach the website to start/);
    expect(fail(null, 'save').message).toMatch(/reach the website to finish/);
  });

  it('offline is offline, and waits rather than gives up', () => {
    const c = fail(0, 'send', { online: false });
    expect(c.kind).toBe('offline');
    expect(c.transient).toBe(true);
    expect(c.message).toMatch(/offline/);
  });

  it('413 is "too large", never a network error, with where to go instead', () => {
    const start = fail(413, 'start');
    expect(start.kind).toBe('too-large');
    expect(start.transient).toBe(false);
    expect(start.message).toContain('Upload files');
    const send = fail(400, 'send', {}, { responseText: '{"statusCode":"413","message":"The object exceeded the maximum allowed size"}' });
    expect(send.kind).toBe('too-large');
    expect(fail(413, 'start', {}, { responseText: 'FUNCTION_PAYLOAD_TOO_LARGE' }).kind).toBe('too-large');
  });

  it('an expired upload link is retried with a fresh one; a signed-out session is not', () => {
    expect(fail(403, 'send')).toMatchObject({ kind: 'expired', transient: true });
    expect(fail(401, 'send')).toMatchObject({ kind: 'expired', transient: true });
    const out = fail(401, 'start');
    expect(out).toMatchObject({ kind: 'signed-out', transient: false });
    expect(out.message).toMatch(/still listed here/);
  });

  it('the server’s own reason wins where it has one', () => {
    expect(fail(403, 'start', {}, { serverMessage: 'You cannot upload here.' }).message).toBe('You cannot upload here.');
    expect(fail(404, 'start', {}, { serverMessage: 'That job no longer exists.' })).toMatchObject({ kind: 'not-found', transient: false, message: 'That job no longer exists.' });
    expect(fail(400, 'start', {}, { serverMessage: 'That file is empty.' })).toMatchObject({ kind: 'refused', transient: false, message: 'That file is empty.' });
  });

  it('server trouble, timeouts and rate limits pass, so they are retried', () => {
    for (const s of [500, 502, 503, 504, 408, 429]) expect(fail(s, 'send').transient, String(s)).toBe(true);
  });

  it('classifies what a step threw: fetch’s TypeError, an UploadError, anything else', () => {
    expect(classifyError(new TypeError('Failed to fetch'), ctx(), 'start').message).toMatch(/to start/);
    expect(classifyError(new UploadError('x', { status: 503, phase: 'save' }), ctx()).kind).toBe('server');
    expect(classifyError(new Error('Odd thing'), ctx())).toEqual({ kind: 'refused', transient: false, message: 'Odd thing' });
  });

  it('asStep labels "no answer" with the step it happened in', async () => {
    const err = await asStep('save', () => Promise.reject(new TypeError('Failed to fetch'))).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err.phase).toBe('save');
    expect(err.status).toBeNull();
    const other = new Error('keep me');
    expect(await asStep('start', () => Promise.reject(other)).catch((e) => e)).toBe(other);
  });

  it('the read-failure sentence tells a crew member what to do', () => {
    const m = explainReadFailure('Smith.job');
    expect(m).toContain('Downloads');
    expect(m).toContain('export');
  });
});

// ── 5. trying again ──────────────────────────────────────────────────────────────────────────────

describe('the retry policy', () => {
  it('waits longer each time, capped, with jitter inside ±20%', () => {
    const mid = () => 0.5;
    expect(retryDelayMs(1, mid)).toBe(2_000);
    expect(retryDelayMs(2, mid)).toBe(6_000);
    expect(retryDelayMs(3, mid)).toBe(18_000);
    expect(retryDelayMs(9, mid)).toBe(30_000);
    expect(retryDelayMs(1, () => 0)).toBe(1_600);
    expect(retryDelayMs(1, () => 1)).toBe(2_400);
  });

  const transient = () => ({ kind: 'network' as const, transient: true, message: 'dropped' });
  const permanent = () => ({ kind: 'refused' as const, transient: false, message: 'refused for a reason' });

  it('succeeds after transient failures, telling the caller each time', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const onRetry = vi.fn();
    let n = 0;
    const out = await runWithRetry(async (attempt) => { n = attempt; if (attempt < 3) throw new Error('x'); return 'ok'; },
      { classify: transient, sleep, onRetry, random: () => 0.5 });
    expect(out).toBe('ok');
    expect(n).toBe(3);
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([2_000, 6_000]);
    expect(onRetry.mock.calls.map((c) => c[0].nextAttempt)).toEqual([2, 3]);
  });

  it('stops at once on a failure that cannot pass', async () => {
    const op = vi.fn(() => Promise.reject(new Error('x')));
    const err = await runWithRetry(op, { classify: permanent, sleep: () => Promise.resolve() }).catch((e) => e);
    expect(op).toHaveBeenCalledTimes(1);
    expect(err.message).toBe('refused for a reason');
  });

  it('gives up after MAX_ATTEMPTS with the last sentence', async () => {
    const op = vi.fn(() => Promise.reject(new Error('x')));
    const err = await runWithRetry(op, { classify: transient, sleep: () => Promise.resolve() }).catch((e) => e);
    expect(op).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(err.message).toBe('dropped');
    expect(err.failure.kind).toBe('network');
  });

  it('waits for the connection before every try, and an offline failure retries without delay', async () => {
    const waitForOnline = vi.fn(() => Promise.resolve());
    const sleep = vi.fn(() => Promise.resolve());
    let first = true;
    await runWithRetry(async () => { if (first) { first = false; throw new Error('off'); } return 1; }, {
      classify: () => ({ kind: 'offline', transient: true, message: 'offline' }), waitForOnline, sleep,
    });
    expect(waitForOnline).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);
  });
});

// ── 6. pickers per device ────────────────────────────────────────────────────────────────────────

const UA = {
  // TDC600: Android 8/10, a Chrome that may predate the system Files picker on the web.
  tdc600: 'Mozilla/5.0 (Linux; Android 10; TDC600) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  tsc5: 'Mozilla/5.0 (Linux; Android 12; TSC5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  webview: 'Mozilla/5.0 (Linux; Android 10; TDC600; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Mobile Safari/537.36',
  pixel: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

describe('which pickers each device gets', () => {
  it('Android Chrome with the system picker: "Choose files" opens Files, with Other apps beside it', () => {
    const p = planPickers({ userAgent: UA.tsc5, hasOpenFilePicker: true, coarsePointer: true, supportsDirectory: true });
    expect(p).toMatchObject({ primary: 'system-files', otherApps: true, photos: true, camera: true, folder: false, android: true });
  });

  it('an older Android Chrome (TDC600) keeps the plain picker, plus gallery and camera', () => {
    const p = planPickers({ userAgent: UA.tdc600, hasOpenFilePicker: false, coarsePointer: true, supportsDirectory: true });
    expect(p).toMatchObject({ primary: 'input', otherApps: false, photos: true, camera: true, folder: false });
  });

  it('an Android WebView is never trusted with the newer picker', () => {
    expect(isAndroidWebView(UA.webview)).toBe(true);
    expect(isAndroidWebView(UA.tsc5)).toBe(false);
    expect(planPickers({ userAgent: UA.webview, hasOpenFilePicker: true, coarsePointer: true, supportsDirectory: false }).primary).toBe('input');
  });

  it('an iPhone gets the gallery and camera; a laptop gets folder upload and no camera', () => {
    expect(planPickers({ userAgent: UA.iphone, hasOpenFilePicker: false, coarsePointer: true, supportsDirectory: true }))
      .toMatchObject({ primary: 'input', photos: true, camera: true, folder: false, android: false });
    expect(planPickers({ userAgent: UA.windows, hasOpenFilePicker: true, coarsePointer: false, supportsDirectory: true }))
      .toMatchObject({ primary: 'input', otherApps: false, photos: false, camera: false, folder: true });
  });

  it('knows Android when it sees it', () => {
    expect(isAndroid(UA.pixel)).toBe(true);
    expect(isAndroid(UA.iphone)).toBe(false);
  });

  it('the on-screen help says where Trimble keeps jobs', () => {
    const text = TRIMBLE_HELP.steps.join(' ');
    expect(text).toContain('Trimble Data');
    expect(text).toContain('Projects');
    expect(text).toContain('.job');
    expect(text).toContain('Downloads');
  });
});

// ── 7. folders, survey files, same names ─────────────────────────────────────────────────────────

const J = '11111111-1111-4111-8111-111111111111';
function dest(folder: string, only: 'image' | 'video' | null = null): UploadDestination {
  const label = folder === 'cad' ? 'CAD' : folder[0]!.toUpperCase() + folder.slice(1);
  return {
    id: `mnt:jobs:${J}:${folder}`, label, group: '24-103', groupId: `mnt:jobs:${J}`,
    owner: { kind: 'job', jobId: J }, section: folder, fileType: null, only, folderId: null, depth: 0,
  } as UploadDestination;
}
const DESTS = [dest('research'), dest('cad'), dest('photos', 'image'), dest('videos', 'video'), dest('documents')];

describe('a folder instead of a refusal', () => {
  it('a survey file dropped while Photos was open goes to CAD, and says so', () => {
    const r = resolveDestination(DESTS, `mnt:jobs:${J}:photos`, { name: 'Smith.job', type: '' });
    expect(r.rerouted).toBe(true);
    expect(r.id).toBe(`mnt:jobs:${J}:cad`);
    expect(r.note).toContain('Photos takes photos only');
    expect(r.note).toContain('CAD');
  });

  it('a PDF dropped into Videos goes to Documents', () => {
    expect(resolveDestination(DESTS, `mnt:jobs:${J}:videos`, { name: 'deed.pdf', type: 'application/pdf' }).id).toBe(`mnt:jobs:${J}:documents`);
  });

  it('a folder that takes the file is left alone; an unknown id is not touched', () => {
    expect(resolveDestination(DESTS, `mnt:jobs:${J}:photos`, { name: 'a.jpg', type: 'image/jpeg' })).toEqual({ id: `mnt:jobs:${J}:photos`, rerouted: false });
    expect(resolveDestination(DESTS, 'nope', { name: 'a.job' })).toEqual({ id: 'nope', rerouted: false });
  });

  it('every survey and CAD format is suggested into CAD', () => {
    for (const n of ['a.job', 'a.jxl', 'a.csv', 'a.txt', 'a.rw5', 'a.dc', 'a.trv', 'a.trb', 'a.dxf', 'a.dwg', 'a.pnezd', 'a.gsi']) {
      expect(suggestFolderKey({ name: n }), n).toBe('cad');
    }
    expect(suggestFolderKey({ name: 'a.pdf' })).toBe('documents');
    expect(suggestFolderKey({ name: 'a.heic' })).toBe('photos');
    expect(suggestFolderKey({ name: 'a.mp4' })).toBe('videos');
  });

  it('same-name files are flagged (both are kept); junk from a folder pick is dropped', () => {
    expect([...duplicateNames([{ name: 'Export.csv' }, { name: 'export.CSV' }, { name: 'a.job' }])]).toEqual(['export.csv']);
    expect(isJunkFile('.DS_Store')).toBe(true);
    expect(isJunkFile('Thumbs.db')).toBe(true);
    expect(isJunkFile('._Smith.job')).toBe(true);
    expect(isJunkFile('Smith.job')).toBe(false);
  });
});

// ── 8. My Files ──────────────────────────────────────────────────────────────────────────────────

describe('My Files goes straight to storage', () => {
  it('checks name, size and the 50 MB bucket limit, with a 413 for too large', () => {
    expect(checkMyFilesUpload({ name: 'a.pdf', sizeBytes: 10 * MB })).toEqual({ ok: true });
    expect(checkMyFilesUpload({ name: '', sizeBytes: 1 })).toMatchObject({ ok: false, status: 400 });
    expect(checkMyFilesUpload({ name: 'a', sizeBytes: 0 })).toMatchObject({ ok: false, status: 400 });
    expect(checkMyFilesUpload({ name: 'a', sizeBytes: MY_FILES_MAX_BYTES + 1 })).toMatchObject({ ok: false, status: 413 });
  });

  it('a row may only point at the caller’s own objects', () => {
    const p = myFilesStoragePath('crew@starr.com', 'abc', 'My Points (1).csv');
    expect(p).toBe('crew@starr.com/abc-My_Points_1_.csv');
    expect(ownsStoragePath('crew@starr.com', p)).toBe(true);
    expect(ownsStoragePath('other@starr.com', p)).toBe(false);
    expect(ownsStoragePath('crew@starr.com', 'crew@starr.com/../other@starr.com/x')).toBe(false);
    expect(ownsStoragePath('crew@starr.com', 42)).toBe(false);
  });
});

describe('a receipt photo is shrunk to fit, never enlarged', () => {
  it('scales the long edge down and keeps the aspect', () => {
    expect(shrinkPlan(8000, 6000, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(shrinkPlan(3000, 4000, 2560)).toEqual({ width: 1920, height: 2560 });
    expect(shrinkPlan(1200, 900, 2560)).toEqual({ width: 1200, height: 900 });
    expect(SHRINK_PASSES[0]!.maxEdge).toBeGreaterThan(SHRINK_PASSES[SHRINK_PASSES.length - 1]!.maxEdge);
  });
});

// ── 9. the wiring ────────────────────────────────────────────────────────────────────────────────

describe('the wiring', () => {
  const dialog = read('app/admin/components/files/UploadFilesDialog.tsx');
  // Each <input …/> element whole (arrow functions inside contain '>', so split on the tags).
  const inputs = dialog.split('<input').slice(1).map((t) => t.slice(0, t.indexOf('/>'))).filter((t) => t.includes('type="file"'));

  it('the general picker has no accept and no capture; capture is only on the camera buttons', () => {
    const general = inputs.find((i) => i.includes('data-testid="ufd-input"'))!;
    expect(general).toBeTruthy();
    expect(general).not.toMatch(/accept=/);
    expect(general).not.toMatch(/capture=/);
    expect(general).toMatch(/multiple/);
    const withCapture = inputs.filter((i) => i.includes('capture='));
    expect(withCapture.map((i) => /data-testid="([^"]+)"/.exec(i)?.[1]).sort()).toEqual(['ufd-input-camera', 'ufd-input-record']);
  });

  it('Android opens the system Files picker, and its files still go through the HEIC guard', () => {
    expect(dialog).toContain('showOpenFilePicker!({ multiple: true })');
    expect(dialog).toContain("prepareFilesForUpload(picked, { destination: 'any-file' })");
    expect(dialog).toContain("err.name === 'AbortError'");
  });

  it('picked files are copied into memory, uploads retry, wait for the connection and keep the screen on', () => {
    expect(dialog).toContain('await snapshotFile(it.file)');
    expect(dialog).toContain('runWithRetry(');
    expect(dialog).toContain('waitForOnline(');
    expect(dialog).toContain("wakeLock.request('screen')");
    expect(dialog).toContain('data-testid="ufd-retry-failed"');
    expect(dialog).toContain('data-testid="ufd-trimble-help"');
    expect(dialog).toContain('data-testid="ufd-offline"');
  });

  it('the upload client throws typed errors and sends a type for every file', () => {
    const client = read('lib/jobs/upload-client.ts');
    expect(client).toContain("contentTypeForAnyFile(file.name, file.type)");
    expect(client).not.toContain("new Error('Network error during upload");
    expect(client).toContain("new UploadError('The connection dropped while sending the file.'");
  });

  it('My Files no longer posts base64 through a function', () => {
    const panel = read('app/admin/my-files/MyFilesPanel.tsx');
    expect(panel).not.toContain('readAsDataURL');
    expect(panel).toContain("fetch('/api/admin/my-files/upload'");
    expect(panel).toContain('putWithProgress(started.signed_url, body)');
    expect(read('app/api/admin/my-files/route.ts')).toContain('ownsStoragePath(email, body.storage_path)');
  });

  it('collector import, receipts and email replies respect the function body cap', () => {
    const arrivals = read('app/admin/jobs/_tabs/CollectorArrivals.tsx');
    expect(arrivals).toContain('fitsThroughFunction(picked.size)');
    expect(arrivals).toContain('await snapshotFile(picked)');
    expect(arrivals).toContain('readJsonLoose(res)');
    expect(read('app/admin/receipts/new/page.tsx').match(/fitImageForFunction\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(read('app/admin/leads/[id]/ReplyDialog.tsx')).toContain('fitsThroughFunction(attachedBytes)');
  });

  it('the service worker leaves uploads alone (it handles GET only)', () => {
    expect(read('public/admin/sw.js')).toMatch(/if \(request\.method !== 'GET'\) return;/);
  });
});
