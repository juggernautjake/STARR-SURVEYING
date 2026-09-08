// The app fetches Bell County's free plat portal for the worker (2026-09-08). The worker's datacentre
// address is refused; the app's US address is answered. A strict allowlist, the worker's key, a body cap.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { egressAllowed, EGRESS_MAX_BYTES } from '../../lib/research/egress-allowlist';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('the relay allowlist', () => {
  it('allows the Bell clerk site and its CMS tenant path only', () => {
    expect(egressAllowed('https://www.bellcountytx.com/county_government/county_clerk/w.php')).toBe(true);
    expect(egressAllowed('https://bellcountytx.com/county_government/county_clerk/docs/plats/W/WINNIE%20MAE%20ADN.PDF')).toBe(true);
    expect(egressAllowed('https://cms3.revize.com/revize/bellcountytx/county_government/county_clerk/docs/plats/W/WINNIE%20MAE%20ADN.PDF')).toBe(true);
    expect(egressAllowed('https://cms3.revize.com/revize/othertown/x.pdf')).toBe(false);
    expect(egressAllowed('https://evil.example.com/?bellcountytx.com')).toBe(false);
    expect(egressAllowed('https://user:pw@www.bellcountytx.com/x')).toBe(false);
    expect(egressAllowed('ftp://www.bellcountytx.com/x')).toBe(false);
    expect(egressAllowed('not a url')).toBe(false);
  });
  it('caps the body under Vercel\'s response limit', () => {
    expect(EGRESS_MAX_BYTES).toBe(3 * 1024 * 1024);
  });
});

describe('the egress route', () => {
  const route = read('app/api/admin/research/egress/route.ts');
  it('is the worker\'s alone, checks the allowlist before any request, and follows the CMS redirect', () => {
    expect(route).toContain("const key = req.headers.get('x-worker-key');");
    expect(route).toContain('if (!egressAllowed(target)) {');
    expect(route).toContain("redirect: 'follow',");
    expect(route).toContain('bodyBase64: bytes.toString(\'base64\'),');
    expect(route).toContain('export const maxDuration = 60;');
  });
  it('has its duration in vercel.json', () => {
    const vercel = JSON.parse(read('vercel.json')) as { functions: Record<string, { maxDuration: number }> };
    expect(vercel.functions['app/api/admin/research/egress/route.ts'].maxDuration).toBe(60);
  });
});
