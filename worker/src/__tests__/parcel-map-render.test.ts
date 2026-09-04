import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  toMercator, fromMercator, frameFor, frameBboxLonLat, parcelQueryUrl, basemapUrl, tilePlanFor, MAX_TILE_ZOOM,
  parseParcelFeatures, renderOverlaySvg, scaleBarFor, describeParcelMap, renderParcelMap,
} from '../research/parcel-map-render.js';

// ── THE CAD MAP, DRAWN FROM ITS OWN SOURCES ────────────────────────────────────────────────────
//
// The run's "County GIS map" was a screenshot of a single-page app with the disclaimer still up
// and 6 px labels. This module draws the map from the parcel layer the run already queries and
// Esri imagery for the same box, and types the labels itself, so the row has text without OCR
// and nothing in a browser can block it. These tests hold the projection, the framing, the two
// source URLs, the overlay's contents, and the whole composite against a fake fetch.

// Parcel 9158 (1512 Chisholm Trail) and two neighbours, as the Bell layer returns them.
const LAYER_JSON = {
  features: [
    { attributes: { prop_id: 9158, file_as_name: 'VANCE, TAMORA JOANNE', situs_num: '1512', situs_street: 'CHISHOLM', legal_acreage: 0.3857 },
      geometry: { rings: [[[-97.5251, 30.9584], [-97.5247, 30.9584], [-97.5247, 30.9588], [-97.5251, 30.9588], [-97.5251, 30.9584]]] } },
    { attributes: { prop_id: 107593, file_as_name: 'SMITH, A', situs_num: '1518', situs_street: 'CHISHOLM', legal_acreage: 0.4 },
      geometry: { rings: [[[-97.5247, 30.9584], [-97.5243, 30.9584], [-97.5243, 30.9588], [-97.5247, 30.9588], [-97.5247, 30.9584]]] } },
    { attributes: { prop_id: 60560, file_as_name: 'VANCE, EARNEST L III ETUX DONNA MARIE', situs_num: '1525', situs_street: 'CHISHOLM', legal_acreage: 0.6025 },
      geometry: { rings: [[[-97.5251, 30.9588], [-97.5247, 30.9588], [-97.5247, 30.9592], [-97.5251, 30.9592], [-97.5251, 30.9588]]] } },
    { attributes: { prop_id: 1, file_as_name: 'NO GEOMETRY' }, geometry: {} },
  ],
};

describe('projection', () => {
  it('Web Mercator round-trips', () => {
    const p = { lat: 30.9586, lon: -97.5249 };
    const back = fromMercator(toMercator(p).x, toMercator(p).y);
    expect(back.lat).toBeCloseTo(p.lat, 6);
    expect(back.lon).toBeCloseTo(p.lon, 6);
  });
});

describe('framing', () => {
  it('frames on the subject polygon, square, with room for the neighbours', () => {
    const f = frameFor(LAYER_JSON.features[0].geometry.rings as number[][][], { lat: 0, lon: 0 }, null, 1000);
    expect(f.xmax - f.xmin).toBeCloseTo(f.ymax - f.ymin, 6);
    const [w, s, e, n] = frameBboxLonLat(f);
    expect(w).toBeLessThan(-97.5251); expect(e).toBeGreaterThan(-97.5247);
    expect(s).toBeLessThan(30.9584); expect(n).toBeGreaterThan(30.9588);
    expect(f.metresPerPixel).toBeGreaterThan(0);
  });

  it('without a polygon, frames on the centre from the acreage, never tighter than 120 m', () => {
    const tiny = frameFor(null, { lat: 30.9586, lon: -97.5249 }, 0.05, 1000);
    expect(tiny.xmax - tiny.xmin).toBeGreaterThanOrEqual(120 - 1e-6);
    const big = frameFor(null, { lat: 30.9586, lon: -97.5249 }, 22.495, 1000);
    expect(big.xmax - big.xmin).toBeGreaterThan(900);
  });

  it('CONTROL: the two source URLs ask for exactly the frame, in the projections each side expects', () => {
    const f = frameFor(null, { lat: 30.9586, lon: -97.5249 }, 1, 512);
    const q = parcelQueryUrl('https://x/FeatureServer/0/', f);
    expect(q).toContain('/FeatureServer/0/query?');
    expect(q).toContain('inSR=4326'); expect(q).toContain('returnGeometry=true');
    // Imagery comes from the tile cache (the export endpoint refuses parcel-sized boxes): the
    // zoom must be at least as fine as the frame, and the plan must cover the whole frame.
    const plan = tilePlanFor(f);
    expect(plan.metresPerPixel).toBeLessThanOrEqual(f.metresPerPixel + 1e-9);
    expect(plan.z).toBeLessThanOrEqual(MAX_TILE_ZOOM);
    expect(plan.mosaicXmin).toBeLessThanOrEqual(f.xmin);
    expect(plan.mosaicYmax).toBeGreaterThanOrEqual(f.ymax);
    expect(plan.mosaicXmin + plan.mosaicWidth * plan.metresPerPixel).toBeGreaterThanOrEqual(f.xmax);
    expect(plan.tiles[0].url).toMatch(/World_Imagery\/MapServer\/tile\/\d+\/\d+\/\d+$/);
    expect(basemapUrl(f)).toContain('/tile/');
  });
});

describe('parsing the layer', () => {
  it('keeps every feature with rings and reads id, owner, situs and acreage by the layer\'s names', () => {
    const p = parseParcelFeatures(LAYER_JSON);
    expect(p).toHaveLength(3);
    expect(p[0]).toMatchObject({ propId: '9158', owner: 'VANCE, TAMORA JOANNE', situs: '1512 CHISHOLM', acreage: 0.3857 });
  });
});

describe('the overlay', () => {
  const parcels = parseParcelFeatures(LAYER_JSON);
  const f = frameFor(parcels[0].rings, { lat: 0, lon: 0 }, null, 1000);
  const svg = renderOverlaySvg(f, parcels, '9158', 'Bell CAD parcels — #9158', 'attribution line');

  it('draws every parcel, the subject in the accent, with labels a person can read', () => {
    // Parcel outlines carry stroke-linejoin; the north arrow is the only other <path>.
    expect((svg.match(/stroke-linejoin="round"/g) ?? []).length).toBe(3);
    expect(svg).toContain('stroke="#FF7A1A"');
    expect(svg).toContain('#9158'); expect(svg).toContain('1512 CHISHOLM');
    expect(svg).toContain('#107593'); expect(svg).toContain('1518 CHISHOLM');
  });

  it('carries a title strip, a north arrow and a scale bar in metres and feet', () => {
    expect(svg).toContain('Bell CAD parcels — #9158');
    expect(svg).toContain('>N</text>');
    const sb = scaleBarFor(f);
    expect(svg).toContain(`${sb.metres} m · ${sb.feet} ft`);
    expect(sb.feet).toBe(Math.round(sb.metres * 3.28084));
  });

  it('escapes what the county typed', () => {
    const odd = parseParcelFeatures({ features: [{ attributes: { prop_id: 5, file_as_name: 'A & B <TRUST>' }, geometry: { rings: LAYER_JSON.features[0].geometry.rings } }] });
    const s = renderOverlaySvg(f, odd, null, 't', 'a');
    expect(s).toContain('A &amp; B &lt;TRUST&gt;');
    expect(s).not.toContain('A & B <TRUST>');
  });
});

describe('the text the row keeps instead of OCR', () => {
  it('names the subject, every neighbour in frame, and both sources', () => {
    const parcels = parseParcelFeatures(LAYER_JSON);
    const f = frameFor(parcels[0].rings, { lat: 0, lon: 0 }, null, 1000);
    const text = describeParcelMap('Bell', '9158', parcels, f, { parcelQueryUrl: 'https://p', basemapUrl: 'https://b' }, new Date('2026-09-04T04:00:00Z'));
    expect(text).toContain('SUBJECT parcel #9158 — 1512 CHISHOLM — VANCE, TAMORA JOANNE — 0.3857 ac');
    expect(text).toContain('Adjoining and nearby parcels in frame (2)');
    expect(text).toContain('#60560 — 1525 CHISHOLM');
    expect(text).toContain('Parcels: https://p'); expect(text).toContain('Imagery: https://b');
  });

  it('says plainly when the subject polygon was not matched', () => {
    const parcels = parseParcelFeatures(LAYER_JSON);
    const f = frameFor(null, { lat: 30.9586, lon: -97.5249 }, 1, 1000);
    const text = describeParcelMap('Bell', '999999', parcels, f, { parcelQueryUrl: 'p', basemapUrl: 'b' }, new Date());
    expect(text).toContain('#999999 was NOT among the 3 parcel(s)');
  });
});

describe('renderParcelMap end to end against a fake fetch', () => {
  it('queries, reframes on the subject, fetches imagery for that frame, and composites a PNG with text', async () => {
    const calls: string[] = [];
    const tile = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#335533' } }).png().toBuffer();
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes('/query?')) return new Response(JSON.stringify(LAYER_JSON), { status: 200 });
      if (url.includes('World_Imagery/MapServer/tile/')) return new Response(new Uint8Array(tile), { status: 200 });
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;

    const out = await renderParcelMap({
      county: 'Bell', parcelId: '9158', centre: { lat: 30.9586, lon: -97.5249 }, acreage: 0.3857,
      parcelLayerUrl: 'https://layer/FeatureServer/0', sizePx: 256, fetchImpl, now: new Date('2026-09-04T04:00:00Z'),
    });
    // Two parcel queries (seed frame, then the subject frame) and a mosaic of imagery tiles.
    expect(calls.filter((u) => u.includes('/query?')).length).toBe(2);
    expect(calls.filter((u) => u.includes('World_Imagery/MapServer/tile/')).length).toBeGreaterThanOrEqual(1);
    expect(out.subjectFound).toBe(true);
    expect(out.parcelCount).toBe(3);
    expect(out.text).toContain('SUBJECT parcel #9158');
    const meta = await sharp(out.png).metadata();
    expect(meta.width).toBe(256); expect(meta.height).toBe(256); expect(meta.format).toBe('png');
  });

  it('a layer that refuses is an error the caller can fall back from, not a blank map', async () => {
    const fetchImpl = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(renderParcelMap({ county: 'Bell', parcelId: '1', centre: { lat: 30, lon: -97 }, parcelLayerUrl: 'https://l/0', sizePx: 64, fetchImpl }))
      .rejects.toThrow(/HTTP 503/);
  });

  it('imagery that cannot be fetched at all is an error too — never a map drawn on nothing', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes('/query?')) return new Response(JSON.stringify(LAYER_JSON), { status: 200 });
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    await expect(renderParcelMap({ county: 'Bell', parcelId: '9158', centre: { lat: 30.9586, lon: -97.5249 }, parcelLayerUrl: 'https://l/0', sizePx: 64, fetchImpl }))
      .rejects.toThrow(/no imagery tiles/);
  });
});
