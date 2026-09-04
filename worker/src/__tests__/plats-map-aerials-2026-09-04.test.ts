import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { preferBetterSitusMatch, type GisFeatureForMatching } from '../services/address-lot-resolver.js';
import { noteHostRefused, hostRefused, _resetRefusedHosts } from '../services/county-plats.js';
import { renderParcelMap, frameFromHalfWidth } from '../research/parcel-map-render.js';
import { planCaptures } from '../research/capture-plan.js';

// ── "Please make it so that we are retrieving the plats and drawings and the correct view of
//     the cad map and the satellite aerial view." (owner, 2026-09-04, after run 4's log)
//
// Run 4 said, in its own words, what stood in the way:
//   • Phase 1 chose parcel 118937 (1401 Chisholm) while GIS matched 9158 (1512 Chisholm) and the
//     validator called the mismatch fatal twice — the run researched the neighbour.
//   • The clerk step captured six plats and five deeds and threw them away at the ceiling, while
//     its browsers kept downloading for five more minutes.
//   • The subdivision sweep downloaded 37 liens and releases for the whole neighbourhood first.
//   • The plat repository answered 403 six times: the county blocks the worker's IP.
//   • Not one aerial was ever filed in four runs, and no line in the run log said so.
// Each fix below has a probe here; the source-text probes carry a control.

const SRC = path.resolve(process.cwd(), 'src');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));

const feat = (propertyId: string, situs: string, owner = 'X'): GisFeatureForMatching =>
  ({ propertyId, situsAddress: situs, ownerName: owner, acreage: 0.4, legalDescription: null });

describe('the parcel is the one whose situs carries the input address', () => {
  const gis = [feat('9158', '1512 CHISHOLM, TX', 'VANCE'), feat('107593', '1518 CHISHOLM, TX'), feat('118937', '1401 CHISHOLM, TX', 'SCHWINDT')];

  it('run 4: resolved 118937 at 1401 Chisholm for input 1512 Chisholm Trail → switch to 9158', () => {
    const out = preferBetterSitusMatch('1512 CHISHOLM TRAIL, SALADO, TX 76571', { propertyId: '118937', situsAddress: '1401 CHISHOLM, TX' }, gis);
    expect(out?.feature.propertyId).toBe('9158');
    expect(out?.reason).toMatch(/only parcel that does/);
  });

  it('CONTROL: a resolved parcel whose situs matches the input is left alone', () => {
    expect(preferBetterSitusMatch('1512 CHISHOLM TRAIL, SALADO, TX', { propertyId: '9158', situsAddress: '1512 CHISHOLM, TX' }, gis)).toBeNull();
  });

  it('two GIS parcels with the same street number is a question for a person — no switch', () => {
    const twin = [...gis, feat('9159', '1512 CHISHOLM UNIT B, TX')];
    expect(preferBetterSitusMatch('1512 CHISHOLM TRAIL', { propertyId: '118937', situsAddress: '1401 CHISHOLM, TX' }, twin)).toBeNull();
  });

  it('no input address, or no street number in it, decides nothing', () => {
    expect(preferBetterSitusMatch(undefined, { propertyId: '1', situsAddress: 'x' }, gis)).toBeNull();
    expect(preferBetterSitusMatch('CHISHOLM TRAIL', { propertyId: '1', situsAddress: 'x' }, gis)).toBeNull();
  });

  it('the orchestrator applies it — and drops the other parcel\'s lot, block and legal', () => {
    const orch = read('counties/bell/orchestrator.ts');
    expect(orch).toContain('const better = preferBetterSitusMatch(');
    expect(orch).toContain('property.propertyId = f.propertyId ?? property.propertyId;');
    expect(orch).toContain('const lb = parseLotBlock(property.legalDescription);');
    expect(orch).toMatch(/Switched to parcel \$\{property\.propertyId\}/);
  });
});

describe('the clerk step keeps what it captured when the ceiling falls, and stops starting more', () => {
  const orch = read('counties/bell/orchestrator.ts');
  const scraper = read('counties/bell/scrapers/clerk-scraper.ts');

  it('CONTROL: the probes read the clerk step and the scraper', () => {
    expect(orch).toContain("withStepDeadline(input.projectId, 'clerk deed search'");
    expect(scraper).toContain('async function searchClerkBySubdivision(');
  });
  it('a sink receives every document as it is captured; the deadline uses the sink', () => {
    expect(scraper).toContain('onDocument?: (doc: ClerkDocument) => void;');
    expect(scraper).toContain('input.onDocument?.(doc);');
    expect(scraper).toContain('const file = (doc: ClerkDocument) => { documents.push(doc); opts.onDocument?.(doc); };');
    expect((scraper.match(/\n\s+file\(\{/g) ?? []).length).toBe(3); // plat, deed, other
    expect(orch).toContain('onDocument: (d) => { clerkSink.set(');
    expect(orch).toContain('clerkAbort.abort();');
    expect(orch).toMatch(/2A stopped at the run's ceiling with \$\{docs\.length\} document\(s\) already captured/);
  });
  it('the abort is checked before every page capture', () => {
    expect(scraper).toContain('signal?: AbortSignal;');
    expect((scraper.match(/stillAllowed\(`/g) ?? []).length).toBe(3);
    expect(orch).toContain('signal: clerkAbort.signal,');
  });
});

describe('the subdivision sweep downloads what is about the land', () => {
  const scraper = read('counties/bell/scrapers/clerk-scraper.ts');
  it('liens and releases are indexed, not downloaded; easements and restrictions are', () => {
    expect(scraper).toContain('const landOthers = otherInstruments.filter((n) => isAboutTheLand(typeOf(n))).slice(0, 8);');
    expect(scraper).toContain('captureImages ? landOthers : []');
    expect(scraper).toContain('for (const [idx, instrNum] of landOthers.entries())');
    expect(scraper).toMatch(/indexed but not downloaded/);
    // The regexes: what they keep and what they refuse.
    const keep = /EASEMENT|RIGHT[\s-]*OF[\s-]*WAY|R\.?O\.?W\.?|RESTRICT|COVENANT|DEDICAT|REPLAT|PLAT|VACAT|AMEND|BOUNDARY|SURVEY|AGREEMENT|ABANDON/i;
    const drop = /LIEN|RELEASE|DEED OF TRUST|ASSIGNMENT|UCC|MECHANIC/i;
    const about = (t: string) => keep.test(t) && !drop.test(t);
    expect(about('EASEMENT & RIGHT OF WAY')).toBe(true);
    expect(about('RESTRICTIONS')).toBe(true);
    expect(about('AMENDMENT')).toBe(true);
    expect(about('MECHANICS LIEN')).toBe(false);
    expect(about('PARTIAL RELEASE')).toBe(false);
    expect(about('RELEASE')).toBe(false);
  });
});

describe('the plat repository is asked once when it refuses this server', () => {
  beforeEach(() => _resetRefusedHosts());
  it('a 403 marks the host for an hour; other hosts are unaffected; the mark expires', () => {
    const t0 = 1_000_000;
    expect(hostRefused('https://www.bellcountytx.com/x.pdf', t0)).toBe(false);
    noteHostRefused('https://www.bellcountytx.com/county_government/county_clerk/m.php', 'Bell plats', t0);
    expect(hostRefused('https://www.bellcountytx.com/docs/plats/M/MILL.pdf', t0 + 1)).toBe(true);
    expect(hostRefused('https://hayscad.com/subdivisionplats/sublista/', t0 + 1)).toBe(false);
    expect(hostRefused('https://www.bellcountytx.com/docs/plats/M/MILL.pdf', t0 + 61 * 60 * 1000)).toBe(false);
  });
  it('both fetch layers consult the mark before asking and set it on 403', () => {
    const src = read('services/county-plats.ts');
    expect(src).toContain('if (hostRefused(url)) {');
    expect(src).toContain('if (hostRefused(fileUrl)) {');
    expect(src).toContain('if (response.status === 403) noteHostRefused(url, config.countyDisplayName);');
    expect(src).toContain('if (response.status === 403) noteHostRefused(fileUrl, config.countyDisplayName);');
  });
});

describe('the clerk plat search waits for the page to finish loading', () => {
  it('polls "Loading Results" away for up to 30 s after the fixed wait', () => {
    const src = read('services/bell-clerk.ts');
    expect(src).toContain('/loading results/i.test(document.body?.innerText');
    expect(src).toContain('for (let waited = 0; waited < 30_000; waited += 1_000)');
  });
});

describe('the aerials are rendered from imagery tiles with the parcel drawn on', () => {
  it('a fixed half-width frame is honoured and a layer-less render is imagery only', async () => {
    const f = frameFromHalfWidth({ lat: 30.9586, lon: -97.5249 }, 200, 800);
    expect(f.xmax - f.xmin).toBeCloseTo(400, 6);
    expect(f.metresPerPixel).toBeCloseTo(0.5, 6);

    const calls: string[] = [];
    const tile = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#335533' } }).png().toBuffer();
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes('World_Imagery/MapServer/tile/')) return new Response(new Uint8Array(tile), { status: 200 });
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;
    const out = await renderParcelMap({
      county: 'Bell', parcelId: '9158', centre: { lat: 30.9586, lon: -97.5249 }, parcelLayerUrl: null,
      halfWidthMetres: 200, sizePx: 128, fetchImpl, title: 'Aerial — wide, parcel in context', labelNeighbours: false,
    });
    expect(calls.some((u) => u.includes('/query?'))).toBe(false);
    expect(out.parcelCount).toBe(0);
    expect(out.metresPerPixel).toBeCloseTo(400 / 128, 6);
    expect(out.text).toContain('was NOT among the 0 parcel(s)');
  });

  it('the planner puts the parcel on every aerial band so the render can outline it', () => {
    const plan = planCaptures({
      projectId: 'p', county: 'Bell', latitude: 30.9586, longitude: -97.5249, acreage: 0.3857, parcelId: '9158',
      gisBaseUrl: 'https://gis.bisclient.com/bellcad/', parcelLayerUrl: 'https://l/FeatureServer/0',
    });
    const bands = plan.captures.filter((c) => c.kind.startsWith('aerial_'));
    expect(bands.length).toBeGreaterThanOrEqual(3);
    for (const b of bands) {
      expect(b.parcelId).toBe('9158');
      expect(b.parcelLayerUrl).toBe('https://l/FeatureServer/0');
      expect(b.centre).toEqual({ lat: 30.9586, lon: -97.5249 });
    }
  });

  it('the runner renders the sharp-enough bands from tiles, tries the provider for the close one, and logs into the run', () => {
    const index = read('index.ts');
    expect(index).toContain("const AERIAL = new Set(['aerial_wide', 'aerial_subject', 'aerial_close', 'aerial_neighbours']);");
    expect(index).toContain('const tilesAreSharpEnough = (item.metresPerPixel ?? 0) >= 0.2;');
    expect(index).toContain("return await renderAerial('tile cache is at least this sharp');");
    expect(index).toContain("return await renderAerial('provider failed');");
    // The dismisser runs for every provider now, not only the GIS viewer.
    expect(index).not.toContain("if (item.kind === 'cad_gis') {\n            const { dismissDialogs }");
    expect(index).toContain('await dismissDialogs(page).catch(() => {});');
    // Capture lines reach the run log.
    expect(index).toContain('const capLog = await captureLoggerFor(projectId);');
    expect(index).toContain('log: capLog,');
    expect(index).toContain("runLog.warn('Capture', message); else runLog.info('Capture', message);");
  });
});
