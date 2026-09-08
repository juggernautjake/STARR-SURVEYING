// Bell County's free plat portal, searched FIRST (owner, 2026-09-08): "We need to always search this portal
// for free plats for bell county searches once we have any subdivision information."
//
// Run 6 asked the portal on every run and was refused every time: bellcountytx.com answers 403 to the
// worker's datacentre address and to Browserbase's, and the Browserbase plan has no residential proxies.
// The app on Vercel (a US address the site answers) now fetches for the worker, and the free plat is
// filed BEFORE the paid TexasFile pass.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appRelayEnabled, appRelayUrl, platSourceStatus, platSourceStatement, normalizePlatName } from '../services/county-plats.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('E2 — the app relay is the first road around a 403', () => {
  it('is on only when the worker knows the app and its key, and builds the relay URL', () => {
    expect(appRelayEnabled({})).toBe(false);
    expect(appRelayEnabled({ APP_BASE_URL: 'https://www.starr-surveying.com', WORKER_API_KEY: 'k' })).toBe(true);
    expect(appRelayUrl('https://www.bellcountytx.com/county_government/county_clerk/w.php', { APP_BASE_URL: 'https://www.starr-surveying.com/' }))
      .toBe('https://www.starr-surveying.com/api/admin/research/egress?url=https%3A%2F%2Fwww.bellcountytx.com%2Fcounty_government%2Fcounty_clerk%2Fw.php');
  });
  it('Bell is recorded as reached through the app relay, and says so before a run searches', () => {
    expect(platSourceStatus('bell')).toMatchObject({ available: true, egress: 'app-relay' });
    expect(platSourceStatement('Bell')).toContain('app relay');
  });
  it('every refused fetch — index page, direct PDF, matched PDF — goes to another address, relay first', () => {
    const src = read('services/county-plats.ts');
    expect(src).toContain('async function fetchOnAnotherAddress(');
    expect(src).toContain('const relay = await fetchThroughAppRelay(url, headers);');
    expect(src).toContain('const browser = await fetchThroughBrowser(url, headers);');
    expect(src.split('await fetchOnAnotherAddress(').length - 1).toBe(3);
    expect(src).toContain("headers: { 'x-worker-key': process.env.WORKER_API_KEY!, 'x-forward-user-agent': headers['User-Agent'] ?? '' },");
  });
  it('the portal\'s own spelling of the Winnie Mae plat matches the CAD legal description', () => {
    expect(normalizePlatName('WINNIE MAE ADN')).toBe(normalizePlatName('WINNIE MAE ADDITION'));
  });
});

describe('E3 — the free plat is filed before the paid pass, and the plat want is then satisfied', () => {
  const src = read('index.ts');
  it('fetches the county portal at property identification, files it under the Phase 2 label, and drops the plat want', () => {
    expect(src).toContain("if (identified?.subdivisionName && county && platSourceStatus(county).available) {");
    expect(src).toContain("const hit = await fetchBestMatchingPlat(county, identified.subdivisionName, new PipelineLogger(projectId));");
    expect(src).toContain("pageImages = (await rasterisePdf(Buffer.from(hit.base64, 'base64'), { dpi: 200 })).map((b) => b.toString('base64'));");
    expect(src).toContain("...(pi === 0 ? { documentLabel: `Subdivision Plat: ${hit.name}`, recordingInfo: null, recordedDate: null, documentType: 'plat' } : {}),");
    expect(src).toContain("const wants = freePlatFiled ? allWants.filter((w) => w.documentType !== 'plat') : allWants;");
    // Ordered BEFORE the cross-source engine's free-first discovery.
    const portalAt = src.indexOf('THE FREE PLAT PORTAL FIRST');
    const engineAt = src.indexOf('FREE-FIRST via the cross-source engine (plan 1.4)');
    expect(portalAt).toBeGreaterThan(-1);
    expect(engineAt).toBeGreaterThan(-1);
    expect(portalAt).toBeLessThan(engineAt);
  });
  it('the Phase 2 plat search files under the same label, so the two rows merge', () => {
    const orch = read('counties/bell/orchestrator.ts');
    expect(orch).toContain('const platDocLabel = `Subdivision Plat: ${plat.name}${platInstrStr}`;');
  });
});
