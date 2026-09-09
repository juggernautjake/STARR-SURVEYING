/**
 * Milam County GIS viewer capture — the county map, drawn and photographed.
 *
 * Two kinds of frame, because they answer different questions:
 *
 *   1. RENDERED (no browser). The viewer at maps.pandai.com draws from an ArcGIS MapServer whose
 *      `/export` renders any bounding box on request, and Esri serves the aerial under it by the
 *      same kind of call. So the county map is composed here from its own sources — parcel lines
 *      (and, when the frame is wide, the survey and subdivision boundaries) over the imagery for
 *      exactly that box, the subject parcel outlined from the polygon the run already holds, a
 *      title and a scale bar typed by us. Three frames (parcel, neighbours, subdivision) in two
 *      styles (aerial + lines, lines alone). Deterministic; nothing to dismiss; the row gets its
 *      text without OCR. This is the same reasoning as research/parcel-map-render.ts, applied to
 *      Milam's own service, which has a server-side renderer Bell's does not.
 *
 *   2. PHOTOGRAPHED (browser, best-effort). The county's viewer as a person would see it: opened by
 *      its own deep link (`?find=<propertyId>` — the button on the appraisal page), which zooms to
 *      the parcel and opens its popup; the popup closed, the view photographed at three zoom
 *      levels; then the imagery basemap with and without the parcel lines, when the map exposes
 *      the switch. Web AppBuilder 2.18 on the ArcGIS 3.34 API leaves the map on `window._viewerMap`,
 *      which is how the zoom and the layer switch are driven without selectors that drift.
 *
 * Every frame is hashed and a repeat of one already taken is dropped — a frame that did not change
 * is not a second picture (run 7, 2026-09-09).
 */

import { createHash } from 'node:crypto';
import { MILAM_ENDPOINTS, MILAM_TIMEOUTS } from '../config/endpoints.js';
import type { GisViewerCaptureInput, GisViewerCaptureProgress } from '../../bell/scrapers/gis-viewer-capture.js';
import type { ScreenshotCapture } from '../../bell/types/research-result.js';
import { acquireBrowser } from '../../../lib/browser-factory.js';
import { hostCircuit, tripHost } from '../../../infra/host-circuit.js';
import { frameFromHalfWidth, fetchBasemap } from '../../../research/parcel-map-render.js';

// ── Geometry ─────────────────────────────────────────────────────────

const R = 6378137;
function toMercator(lon: number, lat: number): { x: number; y: number } {
  const x = (lon * Math.PI / 180) * R;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * R;
  return { x, y };
}

interface Frame { xmin: number; ymin: number; xmax: number; ymax: number; width: number; height: number }

function bboxCentre(rings: number[][][]): { lon: number; lat: number } {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const ring of rings) for (const [lon, lat] of ring) { if (lon < xmin) xmin = lon; if (lon > xmax) xmax = lon; if (lat < ymin) ymin = lat; if (lat > ymax) ymax = lat; }
  return { lon: (xmin + xmax) / 2, lat: (ymin + ymax) / 2 };
}

/** Half-width, in metres on the ground, that frames a parcel of `acres` with room around it. */
export function halfWidthForAcres(acres: number | null | undefined): number {
  const a = acres && acres > 0 ? acres : 0.25;
  const side = Math.sqrt(a * 4046.86);
  return Math.max(45, Math.min(1500, side * 0.9));
}

function frameSha(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex');
}

// ── Rendered frames ──────────────────────────────────────────────────

interface Band { key: string; label: string; factor: number; layers: number[]; labelNeighbours: boolean }

const BANDS: Band[] = [
  { key: 'parcel',       label: 'subject parcel',             factor: 1,   layers: [0],       labelNeighbours: true },
  { key: 'neighbours',   label: 'parcel with its neighbours', factor: 3.5, layers: [0],       labelNeighbours: true },
  { key: 'subdivision',  label: 'subdivision / survey context', factor: 10, layers: [0, 3, 5], labelNeighbours: false },
];

async function fetchPng(url: string): Promise<Buffer | null> {
  const circuit = hostCircuit(url);
  if (circuit.down) return null;
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'STARR-SURVEYING/1.0' }, signal: AbortSignal.timeout(MILAM_TIMEOUTS.arcgisQuery) });
    if (!resp.ok || !/image\//.test(resp.headers.get('content-type') ?? '')) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch (err) {
    tripHost(url, err);
    return null;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The subject outline, title strip and scale bar as an SVG the size of the frame. */
function overlaySvg(f: Frame, subject: number[][][] | null, title: string, ground: boolean): string {
  const px = (lon: number, lat: number) => {
    const m = toMercator(lon, lat);
    return [((m.x - f.xmin) / (f.xmax - f.xmin)) * f.width, ((f.ymax - m.y) / (f.ymax - f.ymin)) * f.height];
  };
  const paths = (subject ?? []).map((ring) => 'M' + ring.map(([lon, lat]) => px(lon, lat).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z').join(' ');
  // Scale bar: metres per pixel on the ground at the frame's centre latitude.
  const midLat = Math.atan(Math.sinh(((f.ymin + f.ymax) / 2) / R)) * 180 / Math.PI;
  const mpp = ((f.xmax - f.xmin) / f.width) * Math.cos(midLat * Math.PI / 180);
  const targetPx = f.width / 5;
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  const metres = nice.reduce((best, n) => (Math.abs(n / mpp - targetPx) < Math.abs(best / mpp - targetPx) ? n : best), nice[0]);
  const barPx = metres / mpp;
  const feet = Math.round(metres * 3.28084);
  const y = f.height - 28;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f.width}" height="${f.height}">
  <rect x="0" y="0" width="${f.width}" height="34" fill="rgba(20,26,34,0.82)"/>
  <text x="12" y="23" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#ffffff">${esc(title)}</text>
  ${paths ? `<path d="${paths}" fill="none" stroke="#ff2d2d" stroke-width="4" stroke-linejoin="round"/><path d="${paths}" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" stroke-dasharray="6,6"/>` : ''}
  <rect x="6" y="${y - 30}" width="${(barPx + 12).toFixed(0)}" height="36" rx="4" fill="rgba(20,26,34,0.75)"/>
  <rect x="12" y="${y - 6}" width="${barPx.toFixed(0)}" height="6" fill="#ffffff" stroke="#1f2a33" stroke-width="1"/>
  <text x="12" y="${y - 12}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#ffffff">${metres} m / ${feet} ft</text>
</svg>`;
}

/**
 * Compose the county map for one band and one style. Returns null when either source did not
 * answer — a frame with no parcel lines or no ground is not the county map.
 */
async function renderFrame(
  band: Band, style: 'aerial' | 'lines', centre: { lon: number; lat: number }, halfWidthM: number,
  subject: number[][][] | null, propertyId: string | null,
): Promise<{ png: Buffer; url: string; description: string } | null> {
  // Square, through the parcel-map renderer's frame: the half-width is asked for on the ground and
  // Web Mercator metres are 1/cos(lat) of that, so it is scaled into map units for the box.
  const sizePx = 1200;
  const fr = frameFromHalfWidth({ lon: centre.lon, lat: centre.lat }, (halfWidthM * band.factor) / Math.cos(centre.lat * Math.PI / 180), sizePx);
  const width = sizePx, height = sizePx;
  const f: Frame = { xmin: fr.xmin, ymin: fr.ymin, xmax: fr.xmax, ymax: fr.ymax, width, height };
  const bbox = `${f.xmin},${f.ymin},${f.xmax},${f.ymax}`;
  const linesUrl = `${MILAM_ENDPOINTS.gis.mapServer}/export?bbox=${encodeURIComponent(bbox)}&bboxSR=102100&imageSR=102100&size=${width},${height}&format=png32&transparent=true&dpi=96&layers=show:${band.layers.join(',')}&f=image`;
  const lines = await fetchPng(linesUrl);
  if (!lines) return null;
  const { default: sharp } = await import('sharp');
  let base: import('sharp').Sharp;
  if (style === 'aerial') {
    // TILES, not `/export`: Esri's World Imagery export refuses a box tighter than ~100 m with HTTP
    // 500 at any requested size — the first live run (2026-09-09) lost the subject-parcel aerial to
    // it. The parcel-map renderer already stitches the imagery tiles for exactly this square frame
    // and steps down a level when a level answers with placeholders; its function is reused.
    try {
      const ground = await fetchBasemap(fr, fetch);
      base = sharp(ground.png);
    } catch {
      return null;
    }
  } else {
    base = sharp({ create: { width, height, channels: 3, background: '#f4f1ea' } });
  }
  const title = `Milam AD parcel map — ${band.label}${propertyId ? `, parcel ${propertyId}` : ''} — ${style === 'aerial' ? 'aerial with parcel lines' : 'parcel lines only'}`;
  const png = await base
    .composite([
      { input: await sharp(lines).resize(width, height, { fit: 'fill' }).png().toBuffer(), blend: 'over' },
      { input: Buffer.from(overlaySvg(f, subject, title, style === 'lines')), blend: 'over' },
    ])
    .png()
    .toBuffer();
  const layersNamed = band.layers.map((id) => Object.entries(MILAM_ENDPOINTS.gis.layerIds).find(([, v]) => v === id)?.[0] ?? String(id)).join(', ');
  const description =
    `${title}. Framed ±${Math.round(halfWidthM * band.factor)} m around ${centre.lat.toFixed(5)}, ${centre.lon.toFixed(5)}` +
    `${subject ? '; the subject parcel is outlined in red' : ''}. Drawn from the Milam AD MapServer (layers: ${layersNamed})` +
    `${style === 'aerial' ? ' over Esri World Imagery' : ' on a plain ground'}; labels are the county's own.`;
  return { png, url: linesUrl, description };
}

/** The six rendered frames. Never throws; a source that did not answer is reported and skipped. */
export async function renderMilamMapFrames(
  input: GisViewerCaptureInput,
  progress: (msg: string) => void,
): Promise<ScreenshotCapture[]> {
  const centre = input.parcelBoundary && input.parcelBoundary.length > 0 ? bboxCentre(input.parcelBoundary) : { lon: input.lon, lat: input.lat };
  if (!centre.lat || !centre.lon) { progress('Rendered map skipped — no centre'); return []; }
  // Acreage is not on the viewer input; the subject polygon's extent frames it, or a house lot's.
  let halfWidthM = halfWidthForAcres(null);
  if (input.parcelBoundary && input.parcelBoundary.length > 0) {
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const [lon, lat] of input.parcelBoundary[0]) { const m = toMercator(lon, lat); xmin = Math.min(xmin, m.x); xmax = Math.max(xmax, m.x); ymin = Math.min(ymin, m.y); ymax = Math.max(ymax, m.y); }
    const k = Math.cos(centre.lat * Math.PI / 180);
    halfWidthM = Math.max(45, Math.min(1500, Math.max(xmax - xmin, ymax - ymin) * k * 0.8));
  }
  const out: ScreenshotCapture[] = [];
  const seen = new Set<string>();
  for (const band of BANDS) {
    for (const style of ['aerial', 'lines'] as const) {
      const frame = await renderFrame(band, style, centre, halfWidthM, input.parcelBoundary, input.propertyId);
      if (!frame) { progress(`Rendered map (${band.key}, ${style}) — a source did not answer; skipped`); continue; }
      const sha = frameSha(frame.png);
      if (seen.has(sha)) { progress(`Rendered map (${band.key}, ${style}) is the same picture as one already taken — dropped`); continue; }
      seen.add(sha);
      out.push({
        source: 'GIS Viewer',
        url: frame.url,
        imageBase64: frame.png.toString('base64'),
        capturedAt: new Date().toISOString(),
        description: frame.description,
        pageText: frame.description,
        classification: 'useful',
      });
      progress(`✓ Rendered map: ${band.label}, ${style}`);
    }
  }
  return out;
}

// ── Photographed frames ──────────────────────────────────────────────

const VIEWER_URL = MILAM_ENDPOINTS.gis.viewer;

async function settle(page: any, ms = 2500): Promise<void> {
  await page.waitForFunction(() => { const m = (window as any)._viewerMap; return !!m && !m.updating; }, null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function shoot(page: any, description: string, seen: Set<string>, out: ScreenshotCapture[], progress: (msg: string) => void): Promise<void> {
  const buf: Buffer = await page.screenshot({ fullPage: false, type: 'png', timeout: MILAM_TIMEOUTS.screenshotCapture });
  const sha = frameSha(buf);
  if (seen.has(sha)) { progress(`Viewer frame "${description}" is the same picture as one already taken — dropped`); return; }
  seen.add(sha);
  out.push({ source: 'GIS Viewer', url: page.url(), imageBase64: buf.toString('base64'), capturedAt: new Date().toISOString(), description, classification: 'useful' });
  progress(`✓ Viewer frame: ${description}`);
}

/** The county's viewer, photographed — best-effort and bounded. */
export async function photographMilamViewer(
  input: GisViewerCaptureInput,
  progress: (msg: string) => void,
): Promise<ScreenshotCapture[]> {
  const out: ScreenshotCapture[] = [];
  if (!input.propertyId) { progress('Viewer skipped — no property ID to find'); return out; }
  const circuit = hostCircuit(VIEWER_URL, undefined, 'browser');
  if (circuit.down) { progress(`Viewer skipped — ${VIEWER_URL} did not answer ${Math.round((circuit.ageMs ?? 0) / 1000)}s ago (${circuit.reason ?? 'no answer'})`); return out; }
  const seen = new Set<string>();
  let browser: any = null;
  try {
    browser = await acquireBrowser({ adapterId: 'cad', launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] } });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
    const page = await context.newPage();
    const url = MILAM_ENDPOINTS.gis.viewerByPropertyId(input.propertyId);
    progress(`Opening the county viewer: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => !!(window as any)._viewerMap, null, { timeout: 40_000 });
    // The splash ("Accept") — the disclaimer that stands in front of the map. It renders AFTER the
    // map object exists (the widgets load later), so it is waited for, not merely looked for.
    await page.waitForFunction(() => !!document.querySelector('button[title="Accept"], .jimu-overlay'), null, { timeout: 15_000 }).catch(() => {});
    progress(await acceptSplash(page));
    // The deep link's search: the popup with "Parcel:" proves the map found and framed the parcel.
    const found = await page.waitForFunction(() => /Parcel:\s*\d+/.test(document.body.innerText), null, { timeout: 30_000 }).then(() => true).catch(() => false);
    progress(found ? 'Viewer found the parcel and opened its popup' : 'Viewer popup did not appear — photographing what the map shows');
    await settle(page);
    // The popup covers the parcel; the frames want the land.
    await page.evaluate(() => { const b = document.querySelector('.esriPopup .titleButton.close') as HTMLElement | null; b?.click(); });
    await page.waitForTimeout(600);

    const levelOf = async () => page.evaluate(() => (window as any)._viewerMap?.getLevel?.() ?? null);
    const setLevel = async (n: number) => { await page.evaluate((lvl: number) => (window as any)._viewerMap.setLevel(lvl), n); await settle(page); };
    const startLevel = (await levelOf()) ?? 20;
    await shoot(page, `County viewer — subject parcel as the map opens it (zoom level ${startLevel})`, seen, out, progress);
    await setLevel(18);
    await shoot(page, 'County viewer — parcel with its neighbours (zoom level 18)', seen, out, progress);
    await setLevel(16);
    await shoot(page, 'County viewer — subdivision / area context (zoom level 16)', seen, out, progress);

    // Imagery basemap, with and without the parcel lines — through the Basemap Gallery widget,
    // which is where the county keeps its OWN aerials (EagleView 2014–2025 and NAIP; read live
    // 2026-09-09). `setBasemap('satellite')` returned true and changed nothing on this web map.
    const choice = await pickAerialBasemap(page);
    const basemap = choice.picked;
    progress(basemap ? `Viewer basemap switched to "${basemap}" — ${choice.why}` : `Viewer: no aerial basemap could be selected from the gallery (${choice.why}) — no imagery frames from the viewer (the rendered frames carry the aerial)`);
    if (basemap) {
      await setLevel(19);
      await shoot(page, `County viewer — ${basemap} aerial with parcel lines (zoom level 19)`, seen, out, progress);
      const hid = await page.evaluate(() => {
        const m = (window as any)._viewerMap;
        const ids: string[] = m.layerIds ?? [];
        let hidden = 0;
        for (const id of ids) { const l = m.getLayer(id); if (l && /MilamCADPublic/i.test(String(l.url ?? ''))) { l.setVisibility(false); hidden++; } }
        return hidden;
      });
      if (hid > 0) {
        await settle(page);
        await shoot(page, `County viewer — ${basemap} aerial without parcel lines (zoom level 19)`, seen, out, progress);
      } else {
        progress('Viewer: the parcel layer could not be switched off — no lines-off aerial');
      }
    }
    await context.close();
  } catch (err) {
    tripHost(VIEWER_URL, err, undefined, 'browser');
    progress(`Viewer capture stopped: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return out;
}

/**
 * Dismiss the viewer's disclaimer. Its "Accept" is a real `<button>`, but a `.jimu-overlay` sits
 * over it and swallows pointer events, so a Playwright click never lands (the first live frames,
 * 2026-09-09, all had the splash in them). A DOM click goes through; the overlay's disappearance
 * is the proof. Returns the sentence for the log.
 */
export async function acceptSplash(page: any): Promise<string> {
  const clicked = await page.evaluate(() => {
    const b = document.querySelector('button[title="Accept"], .jimu-widget-splash .jimu-btn.enable-btn, .jimu-btn.enable-btn') as HTMLElement | null;
    if (!b) return false;
    b.click();
    return true;
  }).catch(() => false);
  if (!clicked) return 'Viewer: no disclaimer to accept';
  const gone = await page.waitForFunction(() => !document.querySelector('.jimu-overlay'), null, { timeout: 8_000 }).then(() => true).catch(() => false);
  return gone ? 'Viewer disclaimer accepted' : 'Viewer: Accept was clicked but the overlay stayed — frames may carry the splash';
}

/**
 * Choose the county's newest aerial from the Basemap Gallery widget. Prefers the county's own
 * EagleView flights (newest year), then NAIP / any "Imagery" entry. Returns the entry's label when
 * the map's basemap layers changed to it, else null.
 */
export async function pickAerialBasemap(page: any): Promise<{ picked: string | null; why: string }> {
  const opened = await page.evaluate(() => { const b = document.querySelector('[title="Basemap Gallery"]') as HTMLElement | null; if (!b) return false; b.click(); return true; }).catch(() => false);
  if (!opened) return { picked: null, why: 'no Basemap Gallery control on the page' };
  // What the map draws now (this web map keeps its ground in layerIds, not basemapLayerIds, so both
  // lists are read) — the proof of a switch is that this set changes. The
  // county's EagleView flights are served from a Pictometry tile URL that names neither, so a
  // name match would call a successful switch a failure (it did, 2026-09-09).
  const groundBefore: string = await page.evaluate(() => { const m = (window as any)._viewerMap; return JSON.stringify([...(m?.basemapLayerIds ?? []), ...(m?.layerIds ?? [])].map((id: string) => String(m.getLayer(id)?.url ?? id))); }).catch(() => '[]');
  await page.waitForFunction(() => document.querySelectorAll('.esriBasemapGalleryNode').length > 0, null, { timeout: 10_000 }).catch(() => {});
  const picked: string | null = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.esriBasemapGalleryNode')) as HTMLElement[];
    const label = (n: HTMLElement) => (n.textContent ?? '').trim();
    const eagle = nodes.filter((n) => /eagleview\s*(\d{4})/i.test(label(n))).sort((a, b) => Number((label(b).match(/(\d{4})/) ?? [0, 0])[1]) - Number((label(a).match(/(\d{4})/) ?? [0, 0])[1]));
    const other = nodes.filter((n) => /naip|imagery|aerial/i.test(label(n))).sort((a, b) => Number((label(b).match(/(\d{4})/) ?? [0, 0])[1]) - Number((label(a).match(/(\d{4})/) ?? [0, 0])[1]));
    const n = eagle[0] ?? other[0];
    if (!n) return null;
    const t = (n.querySelector('.esriBasemapGalleryThumbnail, img, a') as HTMLElement | null) ?? n;
    t.click();
    return label(n);
  }).catch(() => null);
  if (!picked) return { picked: null, why: 'the gallery listed no aerial entry' };
  const changed = await page.waitForFunction((before: string) => {
    const m = (window as any)._viewerMap;
    const now = JSON.stringify([...(m?.basemapLayerIds ?? []), ...(m?.layerIds ?? [])].map((id: string) => String(m.getLayer(id)?.url ?? id)));
    return now !== before && now !== '[]';
  }, groundBefore, { timeout: 15_000 }).then(() => true).catch(() => false);
  // Close the gallery panel so it is not in the frame (toggling the same icon closes it).
  await page.evaluate(() => { const c = document.querySelector('.jimu-panel .close-btn, .jimu-panel-title .close-btn') as HTMLElement | null; if (c) c.click(); else (document.querySelector('[title="Basemap Gallery"]') as HTMLElement | null)?.click(); }).catch(() => {});
  await page.waitForTimeout(800);
  return changed ? { picked, why: `basemap layers changed after choosing "${picked}"` } : { picked: null, why: `"${picked}" was chosen but the basemap layers did not change within 15 s (before: ${groundBefore.slice(0, 120)})` };
}

// ── Entry ────────────────────────────────────────────────────────────

/**
 * The Milam GIS viewer capture: the rendered frames first (they cannot fail for a reason on the
 * page), then the photographed ones.
 */
export async function captureMilamGisViewerScreenshots(
  input: GisViewerCaptureInput,
  onProgress: (p: GisViewerCaptureProgress) => void,
): Promise<ScreenshotCapture[]> {
  const progress = (msg: string) => onProgress({ phase: 'GIS Viewer', message: msg, timestamp: new Date().toISOString() });
  const rendered = await renderMilamMapFrames(input, progress);
  const photographed = await photographMilamViewer(input, progress);
  progress(`GIS viewer capture complete: ${rendered.length} rendered + ${photographed.length} photographed frame(s)`);
  return [...rendered, ...photographed];
}
