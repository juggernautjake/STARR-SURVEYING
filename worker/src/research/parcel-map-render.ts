// worker/src/research/parcel-map-render.ts — the CAD parcel map, drawn from the data, not photographed.
//
// > "what are you doing about making sure we can navigate the GIS cad map to actually get good
// >  images of the map?"
//
// ── WHY A RENDERER AND NOT A BETTER SCREENSHOT ─────────────────────────────────────────────────
//
// The run's "County GIS map — Bell CAD" was a bare `page.goto` → four-second wait → 1440×900
// screenshot of an ArcGIS Experience Builder app: disclaimer modal included, parcel not selected,
// map labels 6–7 px tall. Every OCR grid option reported TOO SMALL and the reader still spent 20
// Vision calls on it (run 4, 2026-09-04). A single-page app can be improved on — dismiss the modal,
// select the parcel, zoom, raise the device scale — and it will still break the next time the
// vendor changes a selector, and it can never be told what it is looking at.
//
// The same viewer draws its parcels from an ArcGIS FeatureServer the run ALREADY queries (it found
// parcel 9158 there in one second while the appraisal site was dark), and Esri serves the imagery
// under it by a REST export call that takes a bounding box and returns a PNG. So the map can be
// drawn from its own sources: polygons with owner and situs from the parcel layer, imagery for
// exactly that box, and labels we typed ourselves — which means the row gets its text for free and
// nothing is sent to OCR. No popup, no captcha, no selector.
//
// The viewer screenshot remains as the fallback for a county with no parcel layer registered.
//
// Both external calls are plain GETs. Projection is Web Mercator (EPSG:3857) end to end: the
// imagery is requested in 3857 for a 3857 bbox, so a pixel is a linear function of x/y and the
// overlay cannot drift against the photo.

import { segmentLengthFt, segmentAzimuthDeg, azimuthToBearing, parcelBoundary, type ParcelBoundary } from './parcel-geometry.js';

export interface LonLat { lat: number; lon: number }

export interface ParcelFeature {
  propId: string | null;
  owner: string | null;
  situs: string | null;
  acreage: number | null;
  /** Rings in lon/lat, outer ring first. */
  rings: number[][][];
}

export interface RenderParcelMapInput {
  county: string;
  parcelId: string | null;
  centre: LonLat;
  acreage?: number | null;
  /** ArcGIS FeatureServer/MapServer LAYER url, e.g. …/BellCADWebService/FeatureServer/0.
   *  Optional: without it the map is imagery only (an aerial for a county with no layer). */
  parcelLayerUrl?: string | null;
  /** Frame the map to this half-width in metres around the centre instead of around the subject
   *  polygon — how the three aerial bands (wide / subject / close) ask for their scale. */
  halfWidthMetres?: number;
  /** Title strip override, e.g. "Aerial — wide, parcel in context". */
  title?: string;
  /** Label the neighbours too (default true). Off for a wide aerial, where labels would carpet it. */
  labelNeighbours?: boolean;
  /** 'imagery' (default) draws on Esri tiles; 'none' draws the lines alone on a plain ground — the
   *  county viewer's imagery-off view, which the owner asked for on every run. */
  basemap?: 'imagery' | 'none';
  /** Label each side of the subject parcel with its length in feet (from the layer geometry). */
  edgeLengths?: boolean;
  /** Output edge, px. Square. 2048 keeps Esri's export inside its 4096 ceiling with room. */
  sizePx?: number;
  fetchImpl?: typeof fetch;
  /** For tests: skip the composite and return the SVG + basemap separately. */
  now?: Date;
}

export interface RenderParcelMapResult {
  png: Buffer;
  width: number;
  height: number;
  /** lon/lat bbox actually drawn: [west, south, east, north] */
  bbox: [number, number, number, number];
  metresPerPixel: number;
  /** What the map says, as text — the row's extracted_text, so no OCR is needed. */
  text: string;
  subjectFound: boolean;
  parcelCount: number;
  sources: { parcelQueryUrl: string; basemapUrl: string };
  /** Plan B2 — the subject parcel's boundary as STRUCTURED data (GIS-computed bearing + length per
   *  side, perimeter, area), not only baked into the PNG. null when the subject polygon was not
   *  matched in the layer. */
  subjectGeometry: ParcelBoundary | null;
}

// ── Projection ──────────────────────────────────────────────────────────────────────────────────

const R = 6378137;

/** XML-escape for SVG text. */
function escSvg(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * Plan 4C.2 — the boundary CALL SHEET. Renders the subject parcel's GIS-computed calls (Side · Bearing ·
 * Length, plus perimeter + area) as a clean, filed DOCUMENT, so every side reads legibly even when the map
 * had to drop overlapping labels on a curved frontage. Labelled "GIS-computed, not a recorded plat" — these
 * are parcel-fabric geometry, not record calls. Returns a PNG; the same segment data as the map + the
 * `boundarySegments` metadata, so they can never disagree.
 */
export async function renderBoundaryCallSheet(boundary: ParcelBoundary, title: string): Promise<{ png: Buffer; width: number; height: number }> {
  const { default: sharp } = await import('sharp');
  const rows = boundary.segments;
  const W = 1100;
  const padTop = 150, rowH = 46, padBottom = 120;
  const H = padTop + rows.length * rowH + padBottom;
  const ink = '#1B1E22', sub = '#5A5F66', line = '#D8D2C5', head = '#7A1F00', band = '#F6F1EA';
  const F = 'font-family="Arial, Helvetica, sans-serif"';
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#FFFDF9"/>`);
  parts.push(`<text x="40" y="56" ${F} font-size="30" font-weight="700" fill="${ink}">${escSvg(title)}</text>`);
  parts.push(`<text x="40" y="88" ${F} font-size="18" fill="${sub}">Boundary calls — GIS-computed from the county parcel-fabric geometry, NOT a recorded plat.</text>`);
  parts.push(`<text x="40" y="118" ${F} font-size="19" font-weight="700" fill="${ink}">${rows.length} sides · perimeter ${boundary.perimeterFt.toFixed(0)}′ · area ${boundary.areaAc.toFixed(2)} ac</text>`);
  // Header row
  const cx = { side: 60, bearing: 200, len: 620, az: 880 };
  parts.push(`<text x="${cx.side}" y="${padTop - 12}" ${F} font-size="15" font-weight="700" fill="${head}">SIDE</text>`);
  parts.push(`<text x="${cx.bearing}" y="${padTop - 12}" ${F} font-size="15" font-weight="700" fill="${head}">BEARING</text>`);
  parts.push(`<text x="${cx.len}" y="${padTop - 12}" ${F} font-size="15" font-weight="700" fill="${head}">LENGTH (FT)</text>`);
  parts.push(`<text x="${cx.az}" y="${padTop - 12}" ${F} font-size="15" font-weight="700" fill="${head}">AZIMUTH</text>`);
  parts.push(`<line x1="40" y1="${padTop - 4}" x2="${W - 40}" y2="${padTop - 4}" stroke="${line}" stroke-width="2"/>`);
  rows.forEach((s, i) => {
    const y = padTop + i * rowH;
    if (i % 2 === 1) parts.push(`<rect x="40" y="${y}" width="${W - 80}" height="${rowH}" fill="${band}"/>`);
    const ty = y + rowH * 0.62;
    parts.push(`<text x="${cx.side}" y="${ty}" ${F} font-size="20" font-weight="700" fill="${ink}">${i + 1}</text>`);
    parts.push(`<text x="${cx.bearing}" y="${ty}" font-family="Consolas, monospace" font-size="20" fill="${ink}">${escSvg(s.bearing)}</text>`);
    parts.push(`<text x="${cx.len + 90}" y="${ty}" ${F} font-size="20" fill="${ink}" text-anchor="end">${s.lengthFt.toFixed(1)}</text>`);
    parts.push(`<text x="${cx.az}" y="${ty}" ${F} font-size="20" fill="${sub}">${s.azimuthDeg.toFixed(1)}°</text>`);
  });
  const fy = padTop + rows.length * rowH + 44;
  parts.push(`<line x1="40" y1="${fy - 30}" x2="${W - 40}" y2="${fy - 30}" stroke="${line}" stroke-width="2"/>`);
  parts.push(`<text x="40" y="${fy}" ${F} font-size="16" fill="${sub}">Perimeter ${boundary.perimeterFt.toFixed(1)}′ · Area ${boundary.areaAc.toFixed(3)} ac (${(boundary.areaAc * 43560).toFixed(0)} sq ft). Bearings quadrant, azimuth clockwise from north.</text>`);
  parts.push('</svg>');
  const png = await sharp(Buffer.from(parts.join(''))).png().toBuffer();
  return { png, width: W, height: H };
}

export function toMercator(p: LonLat): { x: number; y: number } {
  const x = (R * p.lon * Math.PI) / 180;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.lat));
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return { x, y };
}

export function fromMercator(x: number, y: number): LonLat {
  const lon = (x / R) * (180 / Math.PI);
  const lat = ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI;
  return { lat, lon };
}

// ── Framing ─────────────────────────────────────────────────────────────────────────────────────

export interface Frame {
  /** Mercator metres */
  xmin: number; ymin: number; xmax: number; ymax: number;
  sizePx: number;
  metresPerPixel: number;
}

/** The subject fills roughly 45% of the frame; the rest is the neighbours a boundary question
 *  is about. Square, north-up, never smaller than 120 m across — a quarter-acre lot at less than
 *  that is a photo of a roof. */
/** A frame of a given half-width around a centre — the aerial bands' way of asking for a scale. */
export function frameFromHalfWidth(centre: LonLat, halfWidthMetres: number, sizePx: number): Frame {
  const m = toMercator(centre);
  const half = Math.max(60, halfWidthMetres);
  return { xmin: m.x - half, ymin: m.y - half, xmax: m.x + half, ymax: m.y + half, sizePx, metresPerPixel: (half * 2) / sizePx };
}

export function frameFor(subjectRings: number[][][] | null, centre: LonLat, acreage: number | null | undefined, sizePx: number): Frame {
  let cx: number, cy: number, half: number;
  if (subjectRings && subjectRings.length > 0 && subjectRings[0].length >= 3) {
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const ring of subjectRings) {
      for (const [lon, lat] of ring) {
        const m = toMercator({ lat, lon });
        if (m.x < xmin) xmin = m.x; if (m.x > xmax) xmax = m.x;
        if (m.y < ymin) ymin = m.y; if (m.y > ymax) ymax = m.y;
      }
    }
    cx = (xmin + xmax) / 2; cy = (ymin + ymax) / 2;
    half = (Math.max(xmax - xmin, ymax - ymin) / 2) * 2.2;
  } else {
    const m = toMercator(centre);
    cx = m.x; cy = m.y;
    // sqrt(area) is the side of the equivalent square; 1.6 leaves the neighbours in view.
    const side = acreage && acreage > 0 ? Math.sqrt(acreage * 4046.8564) : 100;
    half = side * 1.6;
  }
  half = Math.max(half, 60);
  const metresPerPixel = (half * 2) / sizePx;
  return { xmin: cx - half, ymin: cy - half, xmax: cx + half, ymax: cy + half, sizePx, metresPerPixel };
}

function toPixel(f: Frame, lon: number, lat: number): { px: number; py: number } {
  const m = toMercator({ lat, lon });
  return {
    px: ((m.x - f.xmin) / (f.xmax - f.xmin)) * f.sizePx,
    py: ((f.ymax - m.y) / (f.ymax - f.ymin)) * f.sizePx,
  };
}

export function frameBboxLonLat(f: Frame): [number, number, number, number] {
  const sw = fromMercator(f.xmin, f.ymin);
  const ne = fromMercator(f.xmax, f.ymax);
  return [sw.lon, sw.lat, ne.lon, ne.lat];
}

// ── The two source URLs ─────────────────────────────────────────────────────────────────────────

export function parcelQueryUrl(layerUrl: string, f: Frame): string {
  const [w, s, e, n] = frameBboxLonLat(f);
  const q = new URLSearchParams({
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });
  return `${layerUrl.replace(/\/$/, '')}/query?${q}`;
}

// ── Imagery: tiles, not `export` ────────────────────────────────────────────────────────────────
//
// World_Imagery is a CACHED service. Its `export` endpoint answered HTTP 500 for every
// parcel-sized box tried (60–480 m across, 1024 and 2048 px, both projections) while the tile
// endpoint answered 200 — the cache serves tiles; arbitrary boxes are a courtesy it withdraws at
// fine scales. So the basemap is stitched from the standard XYZ tiles at the zoom whose native
// resolution matches the frame, then cropped and scaled to the frame exactly.

export const ESRI_WORLD_IMAGERY_TILES = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const HALF_WORLD = 20037508.342789244;
/** World Imagery is published to zoom 19 across rural Texas (about 0.26 m/px at Bell County's
 *  latitude); deeper levels exist as "Map data not yet available" placeholder tiles, which the
 *  first render of parcel 9158 came back covered in. 19 is the cap; the fetch still steps down
 *  when a level answers with placeholders. */
export const MAX_TILE_ZOOM = 19;
export const MIN_TILE_ZOOM = 15;
export const TILE_PX = 256;
/** A placeholder tile is a tiny JPEG (~2.5 KB); real imagery is tens of KB. */
export const PLACEHOLDER_TILE_BYTES = 4_000;

export interface TilePlan {
  z: number;
  tiles: Array<{ x: number; y: number; url: string; left: number; top: number }>;
  /** Mosaic size in px and its Mercator extent, so the frame can be cropped out exactly. */
  mosaicWidth: number; mosaicHeight: number;
  mosaicXmin: number; mosaicYmax: number;
  metresPerPixel: number;
}

/** The tile zoom whose native resolution is at least as fine as the frame's, capped at the
 *  cache's depth. Finer than the frame is fine — the mosaic is downscaled; coarser would blur. */
export function zoomFor(f: Frame): number {
  const centreLat = fromMercator((f.xmin + f.xmax) / 2, (f.ymin + f.ymax) / 2).lat;
  const groundAtZ0 = (2 * HALF_WORLD) / TILE_PX * Math.cos((centreLat * Math.PI) / 180);
  const z = Math.ceil(Math.log2(groundAtZ0 / f.metresPerPixel));
  return Math.max(1, Math.min(MAX_TILE_ZOOM, z));
}

export function tilePlanFor(f: Frame, z = zoomFor(f)): TilePlan {
  const n = 2 ** z;
  const tileMetres = (2 * HALF_WORLD) / n;
  const tx0 = Math.floor((f.xmin + HALF_WORLD) / tileMetres);
  const tx1 = Math.floor((f.xmax + HALF_WORLD) / tileMetres);
  const ty0 = Math.floor((HALF_WORLD - f.ymax) / tileMetres);
  const ty1 = Math.floor((HALF_WORLD - f.ymin) / tileMetres);
  const tiles: TilePlan['tiles'] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      tiles.push({ x: tx, y: ty, url: `${ESRI_WORLD_IMAGERY_TILES}/${z}/${ty}/${tx}`, left: (tx - tx0) * TILE_PX, top: (ty - ty0) * TILE_PX });
    }
  }
  return {
    z, tiles,
    mosaicWidth: (tx1 - tx0 + 1) * TILE_PX,
    mosaicHeight: (ty1 - ty0 + 1) * TILE_PX,
    mosaicXmin: tx0 * tileMetres - HALF_WORLD,
    mosaicYmax: HALF_WORLD - ty0 * tileMetres,
    metresPerPixel: tileMetres / TILE_PX,
  };
}

async function fetchTiles(plan: TilePlan, doFetch: typeof fetch): Promise<{ results: Array<{ input: Buffer; left: number; top: number } | null>; missing: number; placeholders: number }> {
  let missing = 0, placeholders = 0;
  const limit = 8;
  const results: Array<{ input: Buffer; left: number; top: number } | null> = new Array(plan.tiles.length).fill(null);
  for (let i = 0; i < plan.tiles.length; i += limit) {
    await Promise.all(plan.tiles.slice(i, i + limit).map(async (t, j) => {
      try {
        const res = await doFetch(t.url, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) { missing++; return; }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < PLACEHOLDER_TILE_BYTES) placeholders++;
        results[i + j] = { input: buf, left: t.left, top: t.top };
      } catch { missing++; }
    }));
  }
  return { results, missing, placeholders };
}

/** Fetch the tiles, stitch them, crop the frame out and scale it to the frame's pixel size.
 *  Steps down a zoom level while a level answers mostly with placeholder tiles. */
export async function fetchBasemap(f: Frame, doFetch: typeof fetch): Promise<{ png: Buffer; plan: TilePlan; missing: number }> {
  let z = zoomFor(f);
  let plan = tilePlanFor(f, z);
  let fetched = await fetchTiles(plan, doFetch);
  while (
    z > MIN_TILE_ZOOM &&
    fetched.results.filter(Boolean).length > 0 &&
    fetched.placeholders >= Math.ceil(fetched.results.filter(Boolean).length / 2)
  ) {
    z -= 1;
    plan = tilePlanFor(f, z);
    if (plan.tiles.length > 400) break;
    fetched = await fetchTiles(plan, doFetch);
  }
  const { results, missing } = fetched;
  const { default: sharp } = await import('sharp');
  if (missing === plan.tiles.length) throw new Error(`no imagery tiles could be fetched at zoom ${plan.z}`);
  const mosaic = await sharp({ create: { width: plan.mosaicWidth, height: plan.mosaicHeight, channels: 3, background: '#1f2a33' } })
    .composite(results.filter((r): r is NonNullable<typeof r> => r !== null))
    .png().toBuffer();
  // Crop the frame out of the mosaic (Mercator is linear in both axes at one zoom).
  const left = Math.round((f.xmin - plan.mosaicXmin) / plan.metresPerPixel);
  const top = Math.round((plan.mosaicYmax - f.ymax) / plan.metresPerPixel);
  const width = Math.max(1, Math.round((f.xmax - f.xmin) / plan.metresPerPixel));
  const height = Math.max(1, Math.round((f.ymax - f.ymin) / plan.metresPerPixel));
  const png = await sharp(mosaic)
    .extract({ left: Math.max(0, left), top: Math.max(0, top), width: Math.min(width, plan.mosaicWidth - Math.max(0, left)), height: Math.min(height, plan.mosaicHeight - Math.max(0, top)) })
    .resize(f.sizePx, f.sizePx, { fit: 'fill' })
    .png().toBuffer();
  return { png, plan, missing };
}

/** A human-readable pointer to the imagery source, for the row's text. */
export function basemapUrl(f: Frame): string {
  const p = tilePlanFor(f);
  return `${ESRI_WORLD_IMAGERY_TILES}/${p.z}/{y}/{x} (${p.tiles.length} tiles, rows ${p.tiles[0]?.y}–${p.tiles[p.tiles.length - 1]?.y}, cols ${p.tiles[0]?.x}–${p.tiles[p.tiles.length - 1]?.x})`;
}

// ── Parsing the layer's answer (field names differ by vendor; the Bell layer's are known) ───────

const pick = (a: Record<string, unknown>, names: string[]): unknown => {
  for (const n of names) {
    const k = Object.keys(a).find((x) => x.toLowerCase() === n.toLowerCase());
    if (k && a[k] != null && a[k] !== '') return a[k];
  }
  return null;
};

export function parseParcelFeatures(json: unknown): ParcelFeature[] {
  const feats = (json as { features?: Array<{ attributes?: Record<string, unknown>; geometry?: { rings?: number[][][] } }> })?.features ?? [];
  return feats
    .filter((f) => Array.isArray(f.geometry?.rings) && f.geometry!.rings!.length > 0)
    .map((f) => {
      const a = f.attributes ?? {};
      // The `DBO.*` names are Milam's joined parcel layer (2026-09-09).
      const num = pick(a, ['situs_num', 'situs_number', 'SITUS_NUM', 'DBO.Accounts.Prop_Street_Number']);
      const street = pick(a, ['situs_street', 'situs_addr', 'SITUS_STREET', 'situs_address', 'DBO.Accounts.Prop_Street']);
      const situs = [num, street].filter((x) => x != null && String(x).trim()).map(String).join(' ') || null;
      const acreageRaw = pick(a, ['legal_acreage', 'land_acres', 'acreage', 'ACRES', 'gis_acres', 'DBO.Accounts.Acres']);
      const propIdRaw = pick(a, ['prop_id', 'PROP_ID', 'prop_id_text', 'parcel_id', 'PARCEL_ID', 'DBO.TaxParcels.Name']);
      const ownerRaw = pick(a, ['file_as_name', 'owner_name', 'OWNER_NAME', 'owner', 'DBO.Accounts.Owner_Name']);
      return {
        propId: propIdRaw != null ? String(propIdRaw) : null,
        owner: ownerRaw != null ? String(ownerRaw).trim() : null,
        situs,
        acreage: acreageRaw != null && Number.isFinite(Number(acreageRaw)) ? Number(acreageRaw) : null,
        rings: f.geometry!.rings!,
      };
    });
}

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function centroid(ring: number[][]): { lon: number; lat: number } {
  let lon = 0, lat = 0;
  for (const [x, y] of ring) { lon += x; lat += y; }
  return { lon: lon / ring.length, lat: lat / ring.length };
}

/** The centre of a polygon's bounding box, in lon/lat — where a frame on the parcel belongs. */
export function bboxCentre(rings: number[][][]): LonLat {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const ring of rings) for (const [lon, lat] of ring) { if (lon < xmin) xmin = lon; if (lon > xmax) xmax = lon; if (lat < ymin) ymin = lat; if (lat > ymax) ymax = lat; }
  return { lon: (xmin + xmax) / 2, lat: (ymin + ymax) / 2 };
}

/** A round scale length that fits about a fifth of the frame. Metres and feet both, because the
 *  deed says feet and the layer says metres. */
export function scaleBarFor(f: Frame): { metres: number; px: number; feet: number } {
  const target = (f.sizePx / 5) * f.metresPerPixel;
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const metres = nice.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best), nice[0]);
  return { metres, px: metres / f.metresPerPixel, feet: Math.round(metres * 3.28084) };
}

export function renderOverlaySvg(
  f: Frame,
  parcels: ParcelFeature[],
  subjectId: string | null,
  title: string,
  attribution: string,
  opts: { labelNeighbours?: boolean; linesOnly?: boolean; edgeLengths?: boolean } = {},
): string {
  const labelNeighbours = opts.labelNeighbours !== false;
  const linesOnly = opts.linesOnly === true;
  const ink = linesOnly ? '#1F2A33' : '#FFFFFF';
  const lineColour = linesOnly ? '#C8102E' : '#FFF176';
  const subjectColour = linesOnly ? '#D9480F' : '#FF7A1A';
  const S = f.sizePx;
  const font = Math.max(14, Math.round(S / 90));
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">`);
  parts.push(`<defs><filter id="halo"><feMorphology in="SourceAlpha" operator="dilate" radius="2.5"/><feFlood flood-color="${linesOnly ? '#F4F0E4' : '#000'}" flood-opacity="0.85"/><feComposite in2="SourceAlpha" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`);

  const isSubject = (p: ParcelFeature) => subjectId != null && p.propId != null && String(p.propId) === String(subjectId);
  const ordered = [...parcels.filter((p) => !isSubject(p)), ...parcels.filter(isSubject)];

  for (const p of ordered) {
    const subject = isSubject(p);
    for (const ring of p.rings) {
      const d = ring.map(([lon, lat], i) => { const { px, py } = toPixel(f, lon, lat); return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`; }).join(' ') + ' Z';
      parts.push(
        subject
          ? `<path d="${d}" fill="${subjectColour}" fill-opacity="${linesOnly ? 0.12 : 0.22}" stroke="${subjectColour}" stroke-width="${Math.max(4, S / 400)}" stroke-linejoin="round"/>`
          : `<path d="${d}" fill="none" stroke="${lineColour}" stroke-width="${Math.max(2, S / 900)}" stroke-opacity="0.95" stroke-linejoin="round"/>`,
      );
      if (subject && opts.edgeLengths) {
        // Each side's GIS-computed BEARING and ground length in feet, set along the side at its
        // midpoint. Bearing + length come from the one geometry helper (plan B) so the drawing and
        // the structured segment data can never disagree.
        //
        // Plan 4C.1 — legibility. A curved road frontage is approximated by many short segments whose
        // midpoint labels stack into an unreadable smear (owner screenshot, 2026-09-06). Two guards:
        //   1) skip a side too SHORT in PIXELS to hold its label (it cannot be read at any font); and
        //   2) skip a label whose midpoint collides with one already placed.
        // Every dropped side's bearing + length still appears in the boundary CALL SHEET (4C.2), so
        // no information is lost — the map just stops trying to letter a 6-pixel arc.
        const placed: Array<{ x: number; y: number }> = [];
        const minLabelPx = font * 4.5;   // a "N00°00′W · 000.0′" label needs about this much room
        const minGapPx = font * 1.6;     // keep adjacent labels at least this far apart
        for (let i = 0; i + 1 < ring.length; i++) {
          const aPt: [number, number] = [ring[i][0], ring[i][1]];
          const bPt: [number, number] = [ring[i + 1][0], ring[i + 1][1]];
          const feet = segmentLengthFt(aPt, bPt);
          if (feet < 5) continue;
          const p1 = toPixel(f, ring[i][0], ring[i][1]);
          const p2 = toPixel(f, ring[i + 1][0], ring[i + 1][1]);
          const segPx = Math.hypot(p2.px - p1.px, p2.py - p1.py);
          if (segPx < minLabelPx) continue; // too short on screen to letter legibly
          const mx = (p1.px + p2.px) / 2, my = (p1.py + p2.py) / 2;
          if (placed.some((q) => Math.hypot(q.x - mx, q.y - my) < minGapPx)) continue; // would overlap a placed label
          placed.push({ x: mx, y: my });
          const bearing = azimuthToBearing(segmentAzimuthDeg(aPt, bPt));
          let angle = (Math.atan2(p2.py - p1.py, p2.px - p1.px) * 180) / Math.PI;
          if (angle > 90 || angle < -90) angle += 180; // keep the text upright
          parts.push(`<text x="${mx.toFixed(1)}" y="${(my - font * 0.35).toFixed(1)}" transform="rotate(${angle.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})" font-family="Arial, Helvetica, sans-serif" font-size="${font * 0.9}" font-weight="700" fill="${linesOnly ? '#7A1F00' : '#FFE3C2'}" text-anchor="middle" filter="url(#halo)">${bearing} · ${feet.toFixed(1)}′</text>`);
        }
      }
    }
    const c = centroid(p.rings[0]);
    const { px, py } = toPixel(f, c.lon, c.lat);
    if (px < 0 || py < 0 || px > S || py > S) continue;
    if (!subject && !labelNeighbours) continue;
    const line1 = p.propId ? `#${p.propId}` : '';
    const line2 = p.situs ?? (p.owner ? p.owner.split(',')[0] : '');
    const size = subject ? font * 1.35 : font;
    parts.push(`<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${subject ? 700 : 600}" fill="${linesOnly ? (subject ? '#7A1F00' : ink) : (subject ? '#FFD9BF' : '#FFFFFF')}" text-anchor="middle" filter="url(#halo)">` +
      `<tspan x="${px.toFixed(1)}" dy="-0.2em">${esc(line1)}</tspan><tspan x="${px.toFixed(1)}" dy="1.15em">${esc(line2)}</tspan></text>`);
  }

  // Title strip
  const strip = Math.round(font * 3.4);
  parts.push(`<rect x="0" y="0" width="${S}" height="${strip}" fill="#0B1B2B" fill-opacity="0.82"/>`);
  parts.push(`<text x="${Math.round(font * 0.9)}" y="${Math.round(font * 1.35)}" font-family="Arial, Helvetica, sans-serif" font-size="${font * 1.1}" font-weight="700" fill="#FFFFFF">${esc(title)}</text>`);
  parts.push(`<text x="${Math.round(font * 0.9)}" y="${Math.round(font * 2.7)}" font-family="Arial, Helvetica, sans-serif" font-size="${font * 0.8}" fill="#CFE3F5">${esc(attribution)}</text>`);

  // North arrow (image is north-up in Mercator)
  const nx = S - font * 2.2, ny = strip + font * 2.6;
  parts.push(`<g filter="url(#halo)"><path d="M${nx} ${ny - font * 1.6} L${nx - font * 0.7} ${ny + font * 0.6} L${nx} ${ny} L${nx + font * 0.7} ${ny + font * 0.6} Z" fill="#FFFFFF"/><text x="${nx}" y="${ny + font * 1.8}" font-family="Arial, Helvetica, sans-serif" font-size="${font}" font-weight="700" fill="#FFFFFF" text-anchor="middle">N</text></g>`);

  // Scale bar
  const sb = scaleBarFor(f);
  const sx = font * 1.2, sy = S - font * 1.6;
  parts.push(`<g filter="url(#halo)"><rect x="${sx}" y="${sy}" width="${sb.px.toFixed(1)}" height="${Math.max(6, font * 0.45)}" fill="#FFFFFF"/>` +
    `<text x="${sx}" y="${sy - font * 0.5}" font-family="Arial, Helvetica, sans-serif" font-size="${font * 0.95}" font-weight="600" fill="#FFFFFF">${sb.metres} m · ${sb.feet} ft</text></g>`);

  parts.push('</svg>');
  return parts.join('');
}

/** The row's text: what the map shows, typed rather than read back off the pixels. */
export function describeParcelMap(county: string, subjectId: string | null, parcels: ParcelFeature[], f: Frame, sources: { parcelQueryUrl: string; basemapUrl: string }, when: Date): string {
  const isSubject = (p: ParcelFeature) => subjectId != null && p.propId != null && String(p.propId) === String(subjectId);
  const subject = parcels.find(isSubject);
  const lines: string[] = [];
  lines.push(`${county} County appraisal-district parcel map, rendered ${when.toISOString().slice(0, 10)} at ${f.metresPerPixel.toFixed(3)} m/px, north up.`);
  if (subject) {
    lines.push(`SUBJECT parcel #${subject.propId}${subject.situs ? ` — ${subject.situs}` : ''}${subject.owner ? ` — ${subject.owner}` : ''}${subject.acreage != null ? ` — ${subject.acreage} ac` : ''}.`);
  } else if (subjectId) {
    lines.push(`SUBJECT parcel #${subjectId} was NOT among the ${parcels.length} parcel(s) the layer returned for this frame — the map is centred on the run's coordinates, not on a matched polygon.`);
  }
  const others = parcels.filter((p) => !isSubject(p));
  if (others.length) {
    lines.push(`Adjoining and nearby parcels in frame (${others.length}):`);
    for (const p of others) {
      lines.push(`  #${p.propId ?? '?'}${p.situs ? ` — ${p.situs}` : ''}${p.owner ? ` — ${p.owner}` : ''}${p.acreage != null ? ` — ${p.acreage} ac` : ''}`);
    }
  }
  lines.push(`Parcels: ${sources.parcelQueryUrl}`);
  lines.push(`Imagery: ${sources.basemapUrl}`);
  return lines.join('\n');
}

// ── The render ──────────────────────────────────────────────────────────────────────────────────

export async function renderParcelMap(input: RenderParcelMapInput): Promise<RenderParcelMapResult> {
  const doFetch = input.fetchImpl ?? fetch;
  const sizePx = input.sizePx ?? 2048;
  const now = input.now ?? new Date();

  const layer = (input.parcelLayerUrl ?? '').trim() || null;
  const fixedFrame = input.halfWidthMetres != null ? frameFromHalfWidth(input.centre, input.halfWidthMetres, sizePx) : null;

  // Pass 1: a frame from what we know, to find the subject polygon.
  const seed = fixedFrame ?? frameFor(null, input.centre, input.acreage ?? null, sizePx);
  let parcels: ParcelFeature[] = [];
  let queryUrl = '';
  if (layer) {
    queryUrl = parcelQueryUrl(layer, seed);
    const seedRes = await doFetch(queryUrl, { signal: AbortSignal.timeout(25_000) });
    if (!seedRes.ok) throw new Error(`parcel layer answered HTTP ${seedRes.status}`);
    parcels = parseParcelFeatures(await seedRes.json());
  }
  const subject = input.parcelId ? parcels.find((p) => p.propId != null && String(p.propId) === String(input.parcelId)) ?? null : null;

  // Pass 2: reframe on the subject polygon (unless the caller fixed the frame) and fetch what
  // that frame holds.
  // A fixed-width frame is centred on the SUBJECT POLYGON when one was matched, not on the run's
  // geocode: on run 5 the subject and close aerials had 1512 Chisholm in the top-left corner
  // because the census geocode sits on the street, 40 m from the lot's centre.
  const frame = fixedFrame
    ? (subject ? frameFromHalfWidth(bboxCentre(subject.rings), input.halfWidthMetres!, sizePx) : fixedFrame)
    : frameFor(subject?.rings ?? null, input.centre, input.acreage ?? null, sizePx);
  if (layer && subject && fixedFrame) {
    // Re-query for the re-centred frame so the neighbours in view are the ones drawn.
    queryUrl = parcelQueryUrl(layer, frame);
    const res = await doFetch(queryUrl, { signal: AbortSignal.timeout(25_000) });
    if (res.ok) parcels = parseParcelFeatures(await res.json());
  }
  if (layer && subject && !fixedFrame) {
    queryUrl = parcelQueryUrl(layer, frame);
    const res = await doFetch(queryUrl, { signal: AbortSignal.timeout(25_000) });
    if (res.ok) parcels = parseParcelFeatures(await res.json());
  }

  const linesOnly = input.basemap === 'none';
  const bm = linesOnly ? 'none (parcel lines drawn on a plain ground)' : basemapUrl(frame);
  const { default: sharp } = await import('sharp');
  let basemap: Buffer;
  let plan: TilePlan | null = null;
  if (linesOnly) {
    basemap = await sharp({ create: { width: sizePx, height: sizePx, channels: 3, background: '#F4F0E4' } }).png().toBuffer();
  } else {
    const fetched = await fetchBasemap(frame, doFetch);
    basemap = fetched.png; plan = fetched.plan;
    if (fetched.missing > 0) console.warn(`[parcel-map] ${fetched.missing}/${plan.tiles.length} imagery tile(s) missing at z${plan.z} — drawn on a dark ground`);
  }

  const subjectLabel = subject
    ? `#${subject.propId}${subject.situs ? ` · ${subject.situs}` : ''}${subject.acreage != null ? ` · ${subject.acreage} ac` : ''}`
    : `#${input.parcelId ?? '?'} (polygon not matched — centred on run coordinates)`;
  const title = input.title ?? `${input.county} CAD parcels — ${subjectLabel}`;
  const attribution = `${layer ? 'Parcels: county appraisal district GIS layer · ' : ''}${linesOnly ? 'Lines only, side lengths in feet from the layer geometry' : 'Imagery: Esri World Imagery'} · rendered ${now.toISOString().slice(0, 16).replace('T', ' ')}Z · ${frame.metresPerPixel.toFixed(2)} m/px`;
  const svg = renderOverlaySvg(frame, parcels, input.parcelId, title, attribution, { labelNeighbours: input.labelNeighbours !== false, linesOnly, edgeLengths: input.edgeLengths === true });

  const png = await sharp(basemap)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  const sources = { parcelQueryUrl: queryUrl, basemapUrl: bm };
  // An honest word about sharpness: the close band asks for 0.07 m/px and the cache here stops
  // at 0.26. The frame is right; the pixels are enlarged, and the text says so.
  const upscaled = plan && frame.metresPerPixel < plan.metresPerPixel * 0.95
    ? `\nImagery enlarged ${(plan.metresPerPixel / frame.metresPerPixel).toFixed(1)}× from the ${plan.metresPerPixel.toFixed(2)} m/px tile cache (zoom ${plan.z}); parcel lines are exact, photo detail is not finer than the cache.`
    : '';
  return {
    png, width: sizePx, height: sizePx,
    bbox: frameBboxLonLat(frame),
    metresPerPixel: frame.metresPerPixel,
    text: describeParcelMap(input.county, input.parcelId, parcels, frame, sources, now) + (upscaled || '') + (linesOnly ? '\nLines-only drawing: side lengths are ground distances in feet computed from the parcel-layer geometry, not the recorded plat calls.' : ''),
    subjectFound: Boolean(subject),
    parcelCount: parcels.length,
    sources,
    // B2 — emit the subject's segments/perimeter/area as data. The outer ring is first; a parcel with
    // no matched polygon (centred on run coordinates) has no geometry to emit.
    subjectGeometry: subject && subject.rings[0] && subject.rings[0].length >= 3
      ? parcelBoundary(subject.rings[0] as Array<[number, number]>)
      : null,
  };
}
