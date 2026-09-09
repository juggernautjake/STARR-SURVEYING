// Captures that mean something (plan 2026-09-09): every filed image distinct, every row viewable.
//
// Run 7 (project 18a3de22) filed 35 rows; 7 were exact or same-frame copies, 2 were pages nobody wants,
// 5 were React shells, 1 was a PDF served as an image, 1 was the wrong property. These pin the fixes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planCaptures, type PlannedCaptureItem } from '../research/capture-plan.js';
import { describeCapturedPage } from '../counties/bell/scrapers/screenshot-collector.js';
import { textRelevanceVerdict, subdivisionsNamed, surveysNamed, abstractsNamed } from '../research/text-relevance.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('A — the uploader asks "already filed?" before it writes a byte, and refuses a PDF as a page', () => {
  const up = read('services/artifact-uploader.ts');
  it('checks label + source first and leaves storage as it was', () => {
    const fn = up.indexOf('export async function uploadDocumentIncremental');
    const body = up.slice(fn, fn + 9000);
    const held = body.indexOf('const heldId = await alreadyFiledId(supabase, projectId, displayLabel, firstPage.sourceUrl ?? \'\');');
    const write = body.indexOf('.upload(storagePath, buffer, { contentType, upsert: true, cacheControl: \'86400\' });');
    expect(held >= 0 && write >= 0 && held < write).toBe(true);
    expect(body).toContain('storage left as it was');
  });
  it('refuses PDF bytes handed over as a page image', () => {
    expect(up).toContain("if (buffer.subarray(0, 4).toString('latin1') === '%PDF') {");
    expect(up).toContain('is a PDF, not an image — rasterise it before filing');
  });
  it('the plat scraper rasterises a PDF result at 200 dpi', () => {
    const ps = read('counties/bell/scrapers/plat-scraper.ts');
    expect(ps).toContain("if (result.mimeType === 'application/pdf') {");
    expect(ps).toContain('rasterisePdf(Buffer.from(result.base64, \'base64\'), { dpi: 200 })');
    expect(ps).not.toContain('images: captureImages ? [result.base64] : [],');
  });
});

describe('B — one picture, one file: same-frame bands and the rendered county map', () => {
  const base = { projectId: 'p', county: 'Bell', latitude: 31.0697, longitude: -97.4577, parcelId: '64567', gisBaseUrl: 'https://gis/', parcelLayerUrl: 'https://l/0' };
  it('the RUNNER drops a render whose frame it has already filed — the case run 7 hit', () => {
    // At 1280 px the plan gives subject zoom 21 and close zoom 22, yet the renderer produced both at
    // 0.07 m/px on the same centre (the scale bars on the two files are identical). The runner keeps
    // the frame each render produced and answers "same frame" for a repeat.
    const index = read('index.ts');
    expect(index).toContain('const framesFiled = new Map<string, string>();');
    expect(index).toContain('const key = frameKey(item.centre!, map.metresPerPixel, map.width, map.height);');
    expect(index).toContain('const gisKey = frameKey(item.centre, map.metresPerPixel, map.width, map.height);');
    expect(index).toContain("o.status === 'same-frame' ? 'info' : 'warn'");
  });
  it('the runner records a same-frame answer as a skip, not a failure, and files nothing', async () => {
    const { runCaptures } = await import('../research/capture-runner.js');
    const plan = planCaptures({ ...base, acreage: 0.29 });
    const stored: string[] = [];
    const report = await runCaptures(plan, {
      screenshot: async (item: PlannedCaptureItem) => item.kind === 'aerial_close'
        ? { sameFrameAs: 'Aerial — subject parcel', detail: 'Same picture as "Aerial — subject parcel" — one frame twice.' }
        : { bytes: Buffer.from('png'), width: 1, height: 1, text: 'x' },
      store: async (item: PlannedCaptureItem) => { stored.push(item.kind); return { storagePath: `p/${item.kind}`, publicUrl: null }; },
      file: async () => ({ outcome: 'new', id: 'd' } as never),
    } as never, { projectId: 'p', runId: null, county: 'Bell' });
    const close = report.outcomes.find((o) => o.kind === 'aerial_close');
    expect(close?.status).toBe('same-frame');
    expect(close?.detail).toMatch(/one frame twice/);
    expect(stored).not.toContain('aerial_close');
    expect(stored).toContain('aerial_subject');
  });
  it('a large tract keeps all three aerial bands', () => {
    const p = planCaptures({ ...base, acreage: 40 });
    const kinds = p.captures.map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(['aerial_wide', 'aerial_subject', 'aerial_close']));
  });
  it('the RENDERED county map is not planned beside a rendered aerial of the same frame', () => {
    const p = planCaptures({ ...base, acreage: 0.29 });
    expect(p.captures.some((c) => c.kind === 'cad_gis')).toBe(false);
    expect(p.skipped.find((s) => s.kind === 'cad_gis')?.reason).toMatch(/Same picture as "Aerial — subject parcel"/);
    // Without a parcel layer nothing is rendered, so the county's viewer is still photographed.
    const photographed = planCaptures({ projectId: 'p', county: 'Bell', latitude: 31.07, longitude: -97.46, acreage: 0.29, gisBaseUrl: 'https://gis/' });
    expect(photographed.captures.some((c) => c.kind === 'cad_gis')).toBe(true);
  });
});

describe('C — screenshots are filed once, junk never, and named by what they show', () => {
  it('describes clerk and CAD pages by the search and its outcome', () => {
    expect(describeCapturedPage('https://bell.tx.publicsearch.us/results?search=index,fullText&q=5456-704', '1-1 of 1 results for "5456/704"')).toBe('Clerk search — "5456-704" — 1 result');
    expect(describeCapturedPage('https://bell.tx.publicsearch.us/results?department=RP&q=WINNIE%20MAE%20ADDITION', 'No Results Found Your search for "WINNIE MAE ADDITION" returned no results.')).toBe('Clerk search — "WINNIE MAE ADDITION" — no results');
    expect(describeCapturedPage('https://bell.tx.publicsearch.us/results?department=RP&searchType=quickSearch&searchValue=EVERS%2C%20JONATHAN', '1-1 of 1 results for "EVERS, JONATHAN"')).toBe('Clerk search — "EVERS, JONATHAN" — 1 result');
    expect(describeCapturedPage('https://bell.tx.publicsearch.us/doc/98737982', '')).toBe('Clerk document viewer — 98737982');
    expect(describeCapturedPage('https://esearch.bellcad.org/Property/View/64567?year=2026', 'Property ID: 64567')).toBe('Bell CAD property page — 64567');
    expect(describeCapturedPage('https://esearch.bellcad.org/Property/View/64567', 'ERROR An Error Occurred!')).toBe('Bell CAD property page — 64567 — error page');
    expect(describeCapturedPage('https://esearch.bellcad.org/', '')).toBe('Bell CAD — home page');
    expect(describeCapturedPage('https://example.com/x', '')).toBeNull();
  });
  it('the incremental filing reports what it filed and what it set aside, and the orchestrator marks the originals', () => {
    const up = read('services/artifact-uploader.ts');
    expect(up).toContain('): Promise<{ ok: boolean; uploaded: number; error?: string; filed: number[]; misc: number[] }> {');
    expect(up).toContain('is byte-identical to a capture already filed in this set');
    const orch = read('counties/bell/orchestrator.ts');
    expect((orch.match(/markScreenshotsFiled\(\w+, await uploadScreenshotsIncremental\(/g) ?? []).length).toBe(3);
    expect(orch).toContain('if (up.filed) for (const i of up.filed) if (shots[i]) shots[i].filedIncrementally = true;'.replace('if (up.filed) ', ''));
  });
  it('the end-of-run pass skips what was filed, never files misc, and files identical bytes once', () => {
    const up = read('services/artifact-uploader.ts');
    expect(up).toContain('const candidates = screenshots.filter((ss) => {');
    expect(up).toContain('if (ss.filedIncrementally) return false;');
    expect(up).toContain("for (const cs of process.env.MISC_SCREENSHOTS_TO_STORAGE === '1' ? miscScreenshots : []) {");
    expect(read('index.ts')).toContain('filedIncrementally: ss.filedIncrementally,');
  });
  it('a home page and an error page are misc', () => {
    const up = read('services/artifact-uploader.ts');
    expect(up).toContain("if (new URL(url).pathname === '/' && !/[?#]./.test(url)) return 'misc';");
    expect(up).toContain('/an\\s*error\\s*occurred/i,');
  });
});

describe('D — the GIS viewer\'s map view is found the one way Bell\'s viewer exposes it', () => {
  it('every finder asks getAllJimuMapViews(); none reads the empty jimuMapViews property first', () => {
    const src = read('counties/bell/scrapers/gis-viewer-capture.ts');
    expect((src.match(/getAllJimuMapViews\?\.\(\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(src).not.toContain('if (w._mapViewManager?.jimuMapViews) {');
  });
});

describe('D — a GIS viewer frame identical to the last is not a capture', () => {
  it('re-takes once, then drops and names the toggle that did not take', () => {
    const src = read('counties/bell/scrapers/gis-viewer-capture.ts');
    expect(src).toContain('if (ss && lastFrameSha && frameSha(ss) === lastFrameSha) {');
    expect(src).toContain('DROPPED — identical to [${lastFrameId}]: the viewer did not apply basemap=${spec.basemap}, ${layerState}');
  });
});

describe('E — the clerk viewer says how many pages there are', () => {
  it('reads the page box and waits for a promised next page', () => {
    const src = read('services/bell-clerk.ts');
    expect(src).toContain('const viewerTotal = await readViewerPageCount(page);');
    expect(src).toContain('const maxPages = Math.min(viewerTotal ?? expectedPages, 20);');
    expect(src).toContain('[aria-label="Go To Next Page"]:not([disabled])');
    expect(src).toContain('export const NEXT_PAGE_ENABLED_WAIT_MS = 12_000;');
  });
});

describe('F — the BIS disclaimer is waited for and asserted gone before the screenshot', () => {
  it('waits, dismisses, and refuses a frame with the modal in it', () => {
    const src = read('counties/bell/scrapers/map-screenshot-capture.ts');
    expect(src).toContain('const modalAppeared = await page.waitForSelector(DISCLAIMER_OK_SELECTOR, { timeout: 10_000, state: \'visible\' })');
    expect(src).toContain("throw new Error('BIS GIS disclaimer modal could not be dismissed');");
    expect(src).toContain('export async function modalStillVisible(page: any): Promise<boolean> {');
    // Only the disclaimer counts — Experience Builder's panels are role="dialog" too.
    expect(src).not.toContain("document.querySelectorAll('[role=\"dialog\"], .modal, .jimu-modal");
  });
});

describe('G — a bought document is named by its row and judged by its text', () => {
  it('the buy returns the row, the adapter names the parties', () => {
    expect(read('services/texasfile-buy.ts')).toContain('row: { grantor: chosen.grantor, grantee: chosen.grantee, type: chosen.type, date: chosen.date, legal: chosen.legal, subdivision: chosen.subdivision, survey: chosen.survey, abstract: chosen.abstract },');
    const ad = read('services/purchase-adapters/texasfile-purchase-adapter.ts');
    expect(ad).toContain('const parties = row?.grantor && row?.grantee ? `${tidyName(row.grantor)} to ${tidyName(row.grantee)}`');
  });
  it('names what a deed text names', () => {
    const t = 'All that certain lot, tract or parcel of land lying and being situated in the County of Bell, State of Texas, and being part of the John Lewis Survey, Abstract Number 512, and being the same two tracts called 2.862 acres';
    expect(surveysNamed(t)).toEqual(['John Lewis']);
    expect(abstractsNamed(t)).toEqual(['512']);
    expect(subdivisionsNamed('Lot Four (4) and the East Thirty-four feet of Lot Three (3), in Block One (1), of Winnie Mae Addition, in the City of Belton')).toEqual(['Winnie Mae Addition']);
  });
  it('the 1984 Caffrey → Smith deed is unrelated to a Winnie Mae lot; the 2004 Ferrell deed is related', () => {
    const subject = { subdivision: 'WINNIE MAE ADDITION', lot: '4', block: '001', propertyId: '64567', address: '1401 North East St' };
    const caffrey = textRelevanceVerdict('BARBARA ANN CAFFREY and husband RAYMOND J. CAFFREY … part of the John Lewis Survey, Abstract Number 512, and being the same two tracts called 2.862 acres as recorded in Volume 1462, Page 187', subject);
    expect(caffrey.verdict).toBe('unrelated');
    expect(caffrey.reason).toMatch(/John Lewis Survey; Abstract 512; the subject is WINNIE MAE ADDITION/);
    const ferrell = textRelevanceVerdict('PROPERTY: Lot Four (4) and the East Thirty-four feet (E. 34\') of Lot Three (3), in Block One (1), of Winnie Mae Addition, in the City of Belton, Bell County, Texas', subject);
    expect(ferrell.verdict).toBe('related');
    expect(ferrell.reason).toMatch(/names WINNIE MAE ADDITION/);
  });
  it('says undecided when the text names nothing, or the subject has nothing to compare', () => {
    expect(textRelevanceVerdict('FILED FOR RECORD THIS 29 DAY OF February 1984', { subdivision: 'WINNIE MAE ADDITION' }).verdict).toBe('undecided');
    expect(textRelevanceVerdict('part of the John Lewis Survey, Abstract 512', {}).verdict).toBe('undecided');
  });
  it('the worker-driven analysis asks after every document it read', () => {
    expect(read('research/drive-app-analysis.ts')).toContain('if (r.ok && input.afterDocument) {');
    expect(read('index.ts')).toContain("const { assessRelevanceAfterRead } = await import('./research/text-relevance.js');");
  });
});
