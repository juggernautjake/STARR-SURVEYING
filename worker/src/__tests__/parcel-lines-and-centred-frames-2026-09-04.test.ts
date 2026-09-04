import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { renderParcelMap, renderOverlaySvg, frameFromHalfWidth, parseParcelFeatures, bboxCentre, toMercator } from '../research/parcel-map-render.js';
import { planCaptures } from '../research/capture-plan.js';
import { ProjectLibrary } from '../research/project-library.js';

// ── The owner's four images, 2026-09-04 ────────────────────────────────────────────────────────
//
//   "two of them do not center on the property well, one of them does … I need every run to
//    try and capture the map both the actual imagery overlaid on the map, and at least one where
//    it is just the parcel lines. Each image should be correctly focused on the parcel."
//
// The two off-centre ones were the fixed-width aerial bands, framed on the run's geocode (the
// census point sits on the street). The centred one reframed on the polygon. So a fixed-width
// frame is now centred on the subject polygon whenever one was matched, and a lines-only drawing
// with each side's length in feet is planned for every run that has a parcel layer.

const SRC = path.resolve(process.cwd(), 'src');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));

// A ~30 m × 40 m lot whose centre is 60 m east of the geocode the run would have used.
const SUBJECT_RINGS = [[[-97.5245, 30.9584], [-97.5242, 30.9584], [-97.5242, 30.95876], [-97.5245, 30.95876], [-97.5245, 30.9584]]];
const LAYER = { features: [
  { attributes: { prop_id: 9158, file_as_name: 'VANCE, TAMORA JOANNE', situs_num: '1512', situs_street: 'CHISHOLM', legal_acreage: 0.3857 }, geometry: { rings: SUBJECT_RINGS } },
  { attributes: { prop_id: 107593, file_as_name: 'SMITH', situs_num: '1518', situs_street: 'CHISHOLM' }, geometry: { rings: [[[-97.5242, 30.9584], [-97.5239, 30.9584], [-97.5239, 30.95876], [-97.5242, 30.95876], [-97.5242, 30.9584]]] } },
] };
const GEOCODE = { lat: 30.95858, lon: -97.5251 };

async function fakeFetch(calls: string[] = []) {
  const noise = Buffer.alloc(256 * 256 * 3); for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
  const tile = await sharp(noise, { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer();
  return (async (url: string) => {
    calls.push(url);
    if (url.includes('/query?')) return new Response(JSON.stringify(LAYER), { status: 200 });
    if (url.includes('World_Imagery/MapServer/tile/')) return new Response(new Uint8Array(tile), { status: 200 });
    return new Response('nope', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('a fixed-width frame is centred on the parcel, not the geocode', () => {
  it('the frame centre equals the subject polygon\'s bbox centre when the subject is matched', async () => {
    const calls: string[] = [];
    const out = await renderParcelMap({ county: 'Bell', parcelId: '9158', centre: GEOCODE, parcelLayerUrl: 'https://l/0', halfWidthMetres: 100, sizePx: 128, fetchImpl: await fakeFetch(calls) });
    const c = bboxCentre(SUBJECT_RINGS);
    const [w, s, e, n] = out.bbox;
    expect((w + e) / 2).toBeCloseTo(c.lon, 4);
    expect((s + n) / 2).toBeCloseTo(c.lat, 4);
    // and NOT on the geocode, 60 m away
    expect(Math.abs((w + e) / 2 - GEOCODE.lon)).toBeGreaterThan(0.0003);
    // the frame kept its requested width
    const m1 = toMercator({ lat: s, lon: w }), m2 = toMercator({ lat: n, lon: e });
    expect(m2.x - m1.x).toBeCloseTo(200, 3);
    // re-queried for the recentred frame (seed query + recentred query)
    expect(calls.filter((u) => u.includes('/query?')).length).toBe(2);
  });

  it('CONTROL: with no subject matched the frame stays on the centre given', async () => {
    const out = await renderParcelMap({ county: 'Bell', parcelId: '999', centre: GEOCODE, parcelLayerUrl: 'https://l/0', halfWidthMetres: 100, sizePx: 128, fetchImpl: await fakeFetch() });
    const [w, , e] = out.bbox;
    expect((w + e) / 2).toBeCloseTo(GEOCODE.lon, 5);
  });
});

describe('the lines-only drawing', () => {
  it('draws on a plain ground, in red, with each side of the subject labelled in feet', async () => {
    const parcels = parseParcelFeatures(LAYER);
    const f = frameFromHalfWidth(bboxCentre(SUBJECT_RINGS), 60, 800);
    const svg = renderOverlaySvg(f, parcels, '9158', 'lines', 'attr', { linesOnly: true, edgeLengths: true });
    expect(svg).toContain('stroke="#C8102E"');           // neighbour lines
    expect(svg).toContain('stroke="#D9480F"');           // subject
    expect(svg).toContain('flood-color="#F4F0E4"');      // pale halo for a pale ground
    const lengths = [...svg.matchAll(/>(\d+\.\d\d)′<\/text>/g)].map((m) => Number(m[1]));
    expect(lengths.length).toBe(4);                      // four sides
    // ~30 m east-west sides ≈ 94 ft, ~40 m north-south ≈ 131 ft (geometry, not plat calls)
    expect(Math.min(...lengths)).toBeGreaterThan(80); expect(Math.max(...lengths)).toBeLessThan(145);
  });

  it('CONTROL: the imagery overlay has no side lengths and keeps its dark halo', () => {
    const parcels = parseParcelFeatures(LAYER);
    const f = frameFromHalfWidth(bboxCentre(SUBJECT_RINGS), 60, 800);
    const svg = renderOverlaySvg(f, parcels, '9158', 't', 'a');
    expect(svg).not.toMatch(/′<\/text>/);
    expect(svg).toContain('flood-color="#000"');
  });

  it('renders end to end without fetching a single imagery tile and says what the lengths are', async () => {
    const calls: string[] = [];
    const out = await renderParcelMap({ county: 'Bell', parcelId: '9158', centre: GEOCODE, parcelLayerUrl: 'https://l/0', basemap: 'none', edgeLengths: true, sizePx: 128, fetchImpl: await fakeFetch(calls) });
    expect(calls.some((u) => u.includes('World_Imagery'))).toBe(false);
    expect(out.sources.basemapUrl).toContain('none');
    expect(out.text).toContain('Lines-only drawing');
    expect((await sharp(out.png).metadata()).width).toBe(128);
  });

  it('is planned for every run that has a parcel layer, and its absence is a stated skip', () => {
    const withLayer = planCaptures({ projectId: 'p', county: 'Bell', latitude: 30.9586, longitude: -97.5249, acreage: 0.3857, parcelId: '9158', gisBaseUrl: 'https://gis/', parcelLayerUrl: 'https://l/0' });
    const lines = withLayer.captures.find((c) => c.kind === 'cad_parcel_lines');
    expect(lines).toBeTruthy();
    expect(lines!.ocr).toBe(false);
    expect(lines!.parcelLayerUrl).toBe('https://l/0');
    expect(withLayer.captures.some((c) => c.kind === 'cad_gis')).toBe(true); // both views, every run
    const without = planCaptures({ projectId: 'p', county: 'Coryell', latitude: 31.4, longitude: -97.8, acreage: 1, gisBaseUrl: 'https://gis/' });
    expect(without.captures.some((c) => c.kind === 'cad_parcel_lines')).toBe(false);
    expect(without.skipped.find((s) => s.kind === 'cad_parcel_lines')?.reason).toMatch(/No parcel layer is registered/);
  });

  it('the runner draws it (no fallback) and files it as a gis_map', () => {
    const index = read('index.ts');
    expect(index).toContain("if (item.kind === 'cad_parcel_lines') {");
    expect(index).toContain("basemap: 'none', edgeLengths: true, title: item.label,");
    const runner = read('research/capture-runner.ts');
    expect(runner).toContain("case 'cad_parcel_lines': return 'gis_map';");
  });
});

describe('the library sees the copies the app has marked as duplicates', () => {
  it('a candidate matching a marked copy is already held — on the canonical row', async () => {
    const rows = [
      { id: 'old-copy', identity_key: null, content_sha256: null, document_label: 'Subdivision Plat (Instr. 1982002520)', recording_info: 'Instrument No. 1982002520', original_filename: null, recorded_date: null, storage_path: 'a', research_run_id: 'r1', run_seen_count: 1, harvest_metadata: null, duplicate_of: 'canonical-row' },
    ];
    const db = { from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }) };
    const lib = await ProjectLibrary.load(db as never, 'p', 'Bell');
    const v = lib.classify({ county: 'Bell', instrumentNumber: '1982002520', recordingDate: '1982-11-03' });
    expect(v.kind).toBe('already-held');
    expect((v as { existingId: string }).existingId).toBe('canonical-row');
  });
  it('the load no longer filters on duplicate_of', () => {
    const src = read('research/project-library.ts');
    expect(src).not.toContain(".is('duplicate_of', null)");
    expect(src).toContain("run_seen_count, harvest_metadata, duplicate_of'");
  });
});
