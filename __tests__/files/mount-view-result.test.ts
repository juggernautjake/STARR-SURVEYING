// __tests__/files/mount-view-result.test.ts
//
// A job file that will not open used to say only "Could not open X." (and a download "no download
// location"), which left a worker with nothing to report. The route's own reason now reaches them.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mountViewResult, mountViewUrl } from '@/lib/files/adapters/mount';

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })));
}

describe('mountViewResult', () => {
  it('returns the signed URL on success', async () => {
    stubFetch(200, { url: 'https://example.test/signed', name: 'a.pdf' });
    await expect(mountViewResult('mnt:job-files:1')).resolves.toEqual({ url: 'https://example.test/signed' });
    await expect(mountViewUrl('mnt:job-files:1')).resolves.toBe('https://example.test/signed');
  });

  it('carries the route\'s reason on a refusal', async () => {
    stubFetch(403, { error: 'You do not have access to this file.' });
    await expect(mountViewResult('mnt:job-files:1')).resolves.toEqual({ error: 'You do not have access to this file.' });
    await expect(mountViewUrl('mnt:job-files:1')).resolves.toBeNull();
  });

  it('names the status when the body is not JSON (a 504 from the edge)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('An error occurred', { status: 504 })));
    await expect(mountViewResult('mnt:job-files:1')).resolves.toEqual({ error: 'HTTP 504' });
  });

  it('reports a network failure instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(mountViewResult('mnt:job-files:1')).resolves.toEqual({ error: 'Failed to fetch' });
  });
});
