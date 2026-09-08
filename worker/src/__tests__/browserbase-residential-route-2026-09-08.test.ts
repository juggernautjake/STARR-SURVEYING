// Browserbase, residential Texas, and a browser route that actually leaves the datacentre.
//
// Measured 2026-09-08 on the worker: Playwright's `context.request` on a CDP-connected Browserbase
// browser sends from the WORKER's process (api.ipify.org answered with the worker's own address), so the
// first "browser route" never used Browserbase's network. A real navigation inside a residential US/TX
// session reached bellcountytx.com (index 200, plat PDF downloaded), Bell CAD, the BIS GIS viewer,
// Google Maps, the clerk's records site and TexasFile. These pins keep that road open.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  parseProxyGeolocation,
  residentialProxyDefault,
  browserbaseProxiesParam,
  browserbaseSessionTimeoutSeconds,
} from '../lib/browser-factory.js';
import { readZipEntries } from '../lib/zip-reader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('residential Texas is the Browserbase default once the host says where to stand', () => {
  it('parses BROWSERBASE_PROXY_GEO', () => {
    expect(parseProxyGeolocation('US:TX')).toEqual({ country: 'US', state: 'TX' });
    expect(parseProxyGeolocation('us:tx:Austin')).toEqual({ country: 'US', state: 'TX', city: 'Austin' });
    expect(parseProxyGeolocation('US')).toEqual({ country: 'US' });
    expect(parseProxyGeolocation('')).toBeNull();
    expect(parseProxyGeolocation(undefined)).toBeNull();
    expect(parseProxyGeolocation('Texas')).toBeNull();
  });
  it('is residential by default only when the operator set a geography (or said so), and can be switched off', () => {
    expect(residentialProxyDefault({})).toBe(false);
    expect(residentialProxyDefault({ BROWSERBASE_PROXY_GEO: 'US:TX' })).toBe(true);
    expect(residentialProxyDefault({ BROWSERBASE_RESIDENTIAL: '1' })).toBe(true);
    expect(residentialProxyDefault({ BROWSERBASE_PROXY_GEO: 'US:TX', BROWSERBASE_RESIDENTIAL: '0' })).toBe(false);
  });
  it('builds the proxies parameter: pinned residential, plain residential, or none', () => {
    const env = { BROWSERBASE_PROXY_GEO: 'US:TX' };
    expect(browserbaseProxiesParam({}, env)).toEqual([{ type: 'browserbase', geolocation: { country: 'US', state: 'TX' } }]);
    expect(browserbaseProxiesParam({ useResidentialProxy: false }, env)).toBeUndefined();
    expect(browserbaseProxiesParam({ useResidentialProxy: true }, {})).toBe(true);
    expect(browserbaseProxiesParam({}, {})).toBeUndefined();
    expect(browserbaseProxiesParam({ useResidentialProxy: true, proxyGeolocation: { country: 'US' } }, env))
      .toEqual([{ type: 'browserbase', geolocation: { country: 'US' } }]);
  });
  it('asks for a session long enough for a scrape', () => {
    expect(browserbaseSessionTimeoutSeconds({})).toBe(1800);
    expect(browserbaseSessionTimeoutSeconds({ BROWSERBASE_SESSION_TIMEOUT_SECONDS: '600' })).toBe(600);
    expect(browserbaseSessionTimeoutSeconds({ BROWSERBASE_SESSION_TIMEOUT_SECONDS: '5' })).toBe(1800);
  });
  it('launchBrowserbase passes the proxies and the timeout it computed', () => {
    const src = read('lib/browser-factory.ts');
    expect(src).toContain('const proxies = browserbaseProxiesParam(opts);');
    expect(src).toContain('const sessionParams: Record<string, unknown> = { projectId, timeout: browserbaseSessionTimeoutSeconds() };');
    expect(src).toContain('if (proxies !== undefined) sessionParams.proxies = proxies;');
    expect(src).not.toContain('sessionParams.proxies = true;');
  });
});

describe('the plat browser route navigates INSIDE the remote browser', () => {
  const cp = read('services/county-plats.ts');
  it('never uses context.request (that sends from the worker)', () => {
    expect(cp).not.toContain('context.request.get(');
  });
  it('uses the remote browser’s own context, a page, and fetchInPage', () => {
    expect(cp).toContain("const context = session.browser.contexts()[0] ?? await session.browser.newContext();");
    expect(cp).toContain('return await fetchInPage(page, url, session.browserbaseSessionId);');
  });
  it('keeps Layer-0 guesses off the paid road and does not wait 90 s for a download after a plain error', () => {
    expect(cp).toContain('const alt = await fetchOnAnotherAddress(directUrl, headers, { browser: false });');
    expect(cp).toContain("if (opts.browser === false) return relay ? { ...relay, via: 'app-relay' } : null;");
    expect(cp).toContain('const downloadLikely = navErr !== null && /Download is starting|ERR_ABORTED/i.test(navErr);');
    expect(cp).toContain('downloadLikely ? 90_000 : 5_000');
    expect(cp).toContain('if (req.isNavigationRequest() && req.frame() === page.mainFrame()) mainResp = r;');
  });
  it('allows downloads through CDP and reads them back from the session downloads zip', () => {
    expect(cp).toContain("await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: 'downloads', eventsEnabled: true })");
    expect(cp).toContain('? await readBrowserbaseDownload(browserbaseSessionId, name)');
    expect(cp).toContain(': await fs.promises.readFile(await dl.path());');
    expect(cp).toContain("const { browserbaseDownloadsZip } = await import('../lib/browser-factory.js');");
    expect(cp).toContain("const { readZipEntries } = await import('../lib/zip-reader.js');");
  });
});

// A tiny zip writer (stored + deflated entries) so the reader is exercised on real bytes.
function buildZip(files: Array<{ name: string; data: Buffer; deflate?: boolean }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const method = f.deflate ? 8 : 0;
    const payload = f.deflate ? deflateRawSync(f.data) : f.data;
    const name = Buffer.from(f.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, payload);
    centrals.push(central, name);
    offset += local.length + name.length + payload.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

describe('zip-reader reads the session downloads archive', () => {
  it('reads stored and deflated entries by name', () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(5000, 0x41)]);
    const zip = buildZip([
      { name: 'WINNIE MAE ADN-1757370000000.PDF', data: pdf, deflate: true },
      { name: 'note.txt', data: Buffer.from('hello') },
    ]);
    const entries = readZipEntries(zip);
    expect(entries.map((e) => e.name)).toEqual(['WINNIE MAE ADN-1757370000000.PDF', 'note.txt']);
    expect(entries[0].data.equals(pdf)).toBe(true);
    expect(entries[1].data.toString()).toBe('hello');
  });
  it('is empty for an empty archive and loud for a broken one', () => {
    expect(readZipEntries(buildZip([]))).toEqual([]);
    expect(readZipEntries(Buffer.alloc(5))).toEqual([]);
    expect(() => readZipEntries(Buffer.alloc(64, 1))).toThrow(/end-of-central-directory/);
  });
});
