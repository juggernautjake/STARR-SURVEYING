/**
 * Milam County direct map captures — the county map by its deep link, then Google.
 *
 * The Bell capture takes three deterministic frames (county viewer, Google satellite, Google
 * place) in one browser. Its county frame is Bell's BIS viewer; the Google frames are county-
 * agnostic. Milam supplies its own county frame — maps.pandai.com opened by `?find=<propertyId>`,
 * the popup closed, one zoom level out so the parcel sits in its street — and reuses the rest.
 */

import { MILAM_ENDPOINTS, MILAM_TIMEOUTS } from '../config/endpoints.js';
import {
  captureMapScreenshots, type CountyGisCapture, type MapScreenshotInput, type MapScreenshotProgress,
} from '../../bell/scrapers/map-screenshot-capture.js';
import type { ScreenshotCapture } from '../../bell/types/research-result.js';
import { hostCircuit, tripHost } from '../../../infra/host-circuit.js';

/** One frame of the county's own viewer, in the shared browser context. */
export const capturePandaiParcelFrame: CountyGisCapture = async (context, input, progress) => {
  const url = MILAM_ENDPOINTS.gis.viewerByPropertyId(input.propertyId);
  const circuit = hostCircuit(url, undefined, 'browser');
  if (circuit.down) { progress(`[Milam GIS] skipped — the viewer host did not answer ${Math.round((circuit.ageMs ?? 0) / 1000)}s ago (${circuit.reason ?? 'no answer'})`); return null; }
  const page = await context.newPage();
  try {
    progress(`[Milam GIS] Op 1/3: opening ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: MILAM_TIMEOUTS.playwrightNavigation });
    await page.waitForFunction(() => !!(window as any)._viewerMap, null, { timeout: 40_000 });
    const accept = page.locator('.jimu-btn, button').filter({ hasText: /^(Accept|OK|I Agree|Agree)$/i }).first();
    if (await accept.count()) await accept.click().catch(() => {});
    progress('[Milam GIS] Op 2/3: waiting for the map to find the parcel...');
    const found = await page.waitForFunction(() => /Parcel:\s*\d+/.test(document.body.innerText), null, { timeout: 30_000 }).then(() => true).catch(() => false);
    await page.waitForFunction(() => { const m = (window as any)._viewerMap; return !!m && !m.updating; }, null, { timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => { const b = document.querySelector('.esriPopup .titleButton.close') as HTMLElement | null; b?.click(); });
    await page.evaluate(() => { const m = (window as any)._viewerMap; if (m && typeof m.setLevel === 'function') m.setLevel(19); });
    await page.waitForFunction(() => { const m = (window as any)._viewerMap; return !!m && !m.updating; }, null, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    progress('[Milam GIS] Op 3/3: capturing the frame...');
    const buffer: Buffer = await page.screenshot({ fullPage: false, type: 'png', timeout: MILAM_TIMEOUTS.screenshotCapture });
    const shot: ScreenshotCapture = {
      source: 'Milam GIS (maps.pandai.com)',
      url,
      imageBase64: buffer.toString('base64'),
      capturedAt: new Date().toISOString(),
      description:
        `Milam AD parcel map, opened by the appraisal page's own "Interactive Map" link for parcel ${input.propertyId}` +
        `${found ? ' — the map found the parcel and framed it' : ' — the map did not confirm the parcel; the frame shows where it opened'}` +
        `; popup closed, one level out (zoom 19)${input.situsAddress ? `; ${input.situsAddress}` : ''}.`,
      classification: 'useful',
    };
    return shot;
  } catch (err) {
    tripHost(url, err, undefined, 'browser');
    progress(`[Milam GIS] ✗ ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
};

/** The Milam county frame plus the two Google frames. */
export async function captureMilamMapScreenshots(
  input: MapScreenshotInput,
  onProgress: (p: MapScreenshotProgress) => void,
): Promise<ScreenshotCapture[]> {
  return captureMapScreenshots(input, onProgress, { countyGis: capturePandaiParcelFrame });
}
