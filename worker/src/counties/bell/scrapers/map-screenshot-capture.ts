/**
 * Bell County Map Screenshot Capture — Direct URL Method
 *
 * Captures map screenshots using deterministic URLs that go directly to
 * the target property, eliminating search widget unreliability.
 *
 * Two capture sources:
 *
 * 1. **BIS Client GIS** (gis.bisclient.com/bellcad/)
 *    - Uses property ID in the URL hash params to jump straight to the parcel
 *    - Shows parcel boundaries, lot lines, dimensions, and property IDs
 *    - URL pattern: /bellcad/?page=Page#data_s=id:dataSource_1-...:{OBJECTID}&widget_27=searchText:{PROP_ID}
 *    - Captured at slightly zoomed-out level for surrounding context
 *
 * 2. **Google Maps**
 *    - Uses lat/lon from the property centroid
 *    - Captured at a tighter zoom for close-up satellite/aerial detail
 *    - Shows building footprints, driveways, vegetation, terrain
 *
 * Both screenshots use Playwright headless Chromium for reliable capture.
 */

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints.js';
import type { ScreenshotCapture } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface MapScreenshotInput {
  /** Bell CAD property ID (e.g. "123484") */
  propertyId: string;
  /**
   * ArcGIS FeatureServer OBJECTID for the parcel.
   * Used in the BIS GIS URL `data_s` param to pre-select the parcel feature.
   * Without this, the search widget still finds the property but it won't
   * be pre-highlighted on the map.
   */
  arcgisObjectId: string | number | null;
  /** Situs address for Google Maps lookup */
  situsAddress: string | null;
  /** WGS84 latitude of parcel centroid */
  lat: number;
  /** WGS84 longitude of parcel centroid */
  lon: number;
  /** Owner name for labeling */
  ownerName: string | null;
  /**
   * Anthropic API key for OCR verification after each operation.
   * If not provided, OCR verification is skipped (screenshots still captured).
   */
  anthropicApiKey?: string;
}

export interface MapScreenshotProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Constants ────────────────────────────────────────────────────────

/** How long to wait for the GIS map tiles and layers to fully render before interacting */
const GIS_MAP_SETTLE_MS = 10_000;

/** How long to wait for Google Maps tiles to fully render before screenshotting */
const GOOGLE_MAP_SETTLE_MS = 10_000;

/** Viewport dimensions for map captures */
const VIEWPORT = { width: 1920, height: 1080 };

/** Zoom-out clicks on GIS viewer for slightly wider context */
const GIS_ZOOM_OUT_CLICKS = 2;

/** Google Maps zoom level for close-up property view */
const GOOGLE_MAPS_ZOOM = 20;

/** AI model for lightweight OCR verification checks */
const OCR_VERIFY_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

/** Max tokens for OCR verify responses (keep small — we just want a brief description) */
const OCR_VERIFY_MAX_TOKENS = 1024;

// ── OCR Verification Helper ─────────────────────────────────────────

/**
 * OCR verification result from scanning the page after an operation.
 */
interface OcrVerifyResult {
  /** Short description of what was observed on the page */
  observation: string;
  /** Whether the operation appears to have succeeded */
  success: boolean;
  /** Timestamp of the check */
  timestamp: string;
}

/**
 * Take a screenshot of the current page and send it to Claude Vision
 * to verify what's on screen. This runs after every significant operation
 * (page load, search click, zoom, panel close) and logs the result.
 *
 * If no API key is provided, falls back to DOM text extraction.
 */
async function ocrVerifyPage(
  page: any,
  operationName: string,
  expectedOutcome: string,
  apiKey: string | undefined,
  progress: (msg: string) => void,
): Promise<OcrVerifyResult> {
  const timestamp = new Date().toISOString();
  const logPrefix = `[ocr-verify][${operationName}]`;

  try {
    // Take a screenshot for analysis
    const buffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 70, timeout: 8000 });
    const base64 = buffer.toString('base64');
    const sizeKb = Math.round(base64.length * 3 / 4 / 1024);
    console.log(`${logPrefix} Screenshot captured (${sizeKb}KB JPEG)`);

    if (!apiKey) {
      // Fallback: extract visible text from the DOM
      const domText = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const texts: string[] = [];
        let node: Node | null;
        while ((node = walker.nextNode()) && texts.length < 50) {
          const t = (node.textContent ?? '').trim();
          if (t.length > 2) texts.push(t);
        }
        return texts.join(' | ').substring(0, 500);
      });
      const observation = `[DOM fallback] Visible text: ${domText || '(no text found)'}`;
      console.log(`${logPrefix} ${observation}`);
      progress(`[OCR] ${operationName}: ${observation.substring(0, 120)}`);
      return { observation, success: domText.length > 0, timestamp };
    }

    // Send to Claude Vision for OCR analysis
    const prompt = [
      `You are verifying a map screenshot capture operation for a land surveying system.`,
      ``,
      `OPERATION JUST PERFORMED: "${operationName}"`,
      `EXPECTED OUTCOME: "${expectedOutcome}"`,
      ``,
      `Look at this screenshot and respond with a brief JSON object:`,
      `{`,
      `  "observation": "Describe what you see on the page in 1-2 sentences — what map/content is showing, any visible text (property IDs, addresses, labels), any panels or popups open, any error messages",`,
      `  "success": true/false (did the operation achieve the expected outcome?)`,
      `}`,
      ``,
      `Be specific about what's visible. Mention property IDs, addresses, zoom level, and any UI panels you see.`,
    ].join('\n');

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: OCR_VERIFY_MODEL,
      max_tokens: OCR_VERIFY_MAX_TOKENS,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    // Parse the JSON response
    let observation = rawText;
    let success = false;
    try {
      // Extract JSON from potential markdown code fences
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        observation = parsed.observation ?? rawText;
        success = parsed.success === true;
      }
    } catch {
      // If JSON parsing fails, use raw text — still valuable
      observation = rawText.substring(0, 300);
      // Heuristic: if it mentions errors or failures, mark as unsuccessful
      success = !/(error|fail|blank|empty|not found|timed out)/i.test(rawText);
    }

    const status = success ? '✓ SUCCESS' : '✗ ISSUE';
    console.log(`${logPrefix} ${status}: ${observation}`);
    progress(`[OCR] ${operationName}: ${status} — ${observation.substring(0, 150)}`);

    return { observation, success, timestamp };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`${logPrefix} OCR verify failed: ${errMsg}`);
    progress(`[OCR] ${operationName}: verification error — ${errMsg.substring(0, 80)}`);
    return { observation: `OCR error: ${errMsg}`, success: false, timestamp };
  }
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Capture map screenshots from BIS Client GIS and Google Maps.
 *
 * This is the new primary method for map screenshots. It uses
 * deterministic URLs that jump directly to the target property,
 * replacing the unreliable search widget approach.
 *
 * Returns up to 3 screenshots:
 *   1. BIS GIS parcel map (zoomed out slightly for context)
 *   2. Google Maps satellite view (zoomed in tight)
 *   3. Google Maps place view (street context with pin)
 */
export async function captureMapScreenshots(
  input: MapScreenshotInput,
  onProgress: (p: MapScreenshotProgress) => void,
): Promise<ScreenshotCapture[]> {
  const results: ScreenshotCapture[] = [];
  const captureStart = Date.now();

  const progress = (msg: string) => {
    onProgress({ phase: 'Map Capture', message: msg, timestamp: new Date().toISOString() });
  };

  if (!input.propertyId) {
    console.log('[map-capture] Skipped — no property ID provided');
    progress('Map capture skipped — no property ID');
    return results;
  }

  console.log(`[map-capture] Starting direct-URL map captures for property ${input.propertyId}`);
  console.log(`[map-capture]   address="${input.situsAddress ?? 'none'}", lat=${input.lat}, lon=${input.lon}, owner="${input.ownerName ?? 'unknown'}"`);

  let browser: any;
  try {
    const pw = await import('playwright');
    const browserStart = Date.now();
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    });
    console.log(`[map-capture] Chromium launched in ${Date.now() - browserStart}ms`);

    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    // ── 1. BIS Client GIS — Direct Property Lookup ─────────────────
    progress('Capturing BIS GIS parcel map (direct property lookup)...');
    const gisScreenshot = await captureBisGisParcel(context, input, progress);
    if (gisScreenshot) {
      results.push(gisScreenshot);
      const sizeKb = Math.round(gisScreenshot.imageBase64.length * 3 / 4 / 1024);
      progress(`✓ BIS GIS parcel map captured (${sizeKb}KB)`);
      console.log(`[map-capture] ✓ BIS GIS: ${sizeKb}KB`);
    } else {
      progress('✗ BIS GIS parcel map capture failed');
      console.log('[map-capture] ✗ BIS GIS: capture failed');
    }

    // ── 2. Google Maps Satellite — Tight Zoom ──────────────────────
    const hasCoords = input.lat != null && input.lon != null && (input.lat !== 0 || input.lon !== 0);
    if (hasCoords) {
      progress('Capturing Google Maps satellite view (close-up)...');
      const satScreenshot = await captureGoogleMapsSatellite(context, input, progress);
      if (satScreenshot) {
        results.push(satScreenshot);
        const sizeKb = Math.round(satScreenshot.imageBase64.length * 3 / 4 / 1024);
        progress(`✓ Google Maps satellite captured (${sizeKb}KB)`);
        console.log(`[map-capture] ✓ Google Satellite: ${sizeKb}KB`);
      } else {
        progress('✗ Google Maps satellite capture failed');
        console.log('[map-capture] ✗ Google Satellite: capture failed');
      }

      // ── 3. Google Maps Place — Street Context ──────────────────────
      if (input.situsAddress) {
        progress('Capturing Google Maps place view (street context)...');
        const placeScreenshot = await captureGoogleMapsPlace(context, input, progress);
        if (placeScreenshot) {
          results.push(placeScreenshot);
          const sizeKb = Math.round(placeScreenshot.imageBase64.length * 3 / 4 / 1024);
          progress(`✓ Google Maps place view captured (${sizeKb}KB)`);
          console.log(`[map-capture] ✓ Google Place: ${sizeKb}KB`);
        } else {
          progress('✗ Google Maps place view capture failed');
          console.log('[map-capture] ✗ Google Place: capture failed');
        }
      } else {
        console.log('[map-capture] Google Place: skipped — no situs address available');
        progress('Google Maps place view skipped — no address');
      }
    } else {
      console.log(`[map-capture] Google Maps: skipped — no valid coordinates (lat=${input.lat}, lon=${input.lon})`);
      progress('Google Maps captures skipped — no coordinates');
    }

    await context.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[map-capture] Fatal error: ${msg}`);
    progress(`✗ Map capture error: ${msg}`);
  } finally {
    if (browser) {
      await browser.close().catch((e: unknown) => {
        console.warn(`[map-capture] Browser close failed: ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  }

  const elapsed = ((Date.now() - captureStart) / 1000).toFixed(1);
  const totalKb = results.reduce((sum, r) => sum + Math.round(r.imageBase64.length * 3 / 4 / 1024), 0);
  console.log(`[map-capture] Complete: ${results.length} screenshot(s), ${totalKb}KB total, ${elapsed}s`);
  progress(`Map capture complete: ${results.length} screenshot(s) in ${elapsed}s`);

  return results;
}

// ── BIS Client GIS — Direct Property ID Lookup ────────────────────

async function captureBisGisParcel(
  context: any,
  input: MapScreenshotInput,
  progress: (msg: string) => void,
): Promise<ScreenshotCapture | null> {
  const page = await context.newPage();
  const apiKey = input.anthropicApiKey;

  // Collect all verification results for the final log
  const verifyLog: OcrVerifyResult[] = [];
  const verify = async (op: string, expected: string) => {
    const result = await ocrVerifyPage(page, op, expected, apiKey, progress);
    verifyLog.push(result);
    return result;
  };

  try {
    // ── OPERATION 1: Navigate to BIS GIS URL ──────────────────────
    const url = BELL_ENDPOINTS.gis.viewerByPropertyId(
      input.propertyId,
      input.arcgisObjectId ?? undefined,
    );
    console.log(`[map-capture] BIS GIS URL: ${url}`);
    console.log(`[map-capture]   propertyId=${input.propertyId}, objectId=${input.arcgisObjectId ?? 'unknown (search-only mode)'}`);
    progress(`[BIS GIS] Op 1/6: Loading parcel ${input.propertyId} via direct URL...`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.playwrightNavigation,
    });

    // Wait for the map container to appear
    try {
      await page.waitForSelector('.esri-view-root, .jimu-widget-map, canvas', { timeout: 20_000 });
      console.log('[map-capture] BIS GIS: map container found');
    } catch {
      console.log('[map-capture] BIS GIS: no map container found, waiting anyway...');
    }

    // Wait 10 seconds for full page load
    progress(`[BIS GIS] Waiting ${GIS_MAP_SETTLE_MS / 1000}s for page to fully load...`);
    await page.waitForTimeout(GIS_MAP_SETTLE_MS);

    // OCR VERIFY: Did the page load with a map and search widget?
    const loadCheck = await verify(
      'Page Load',
      `BIS GIS map loaded with parcel layer visible, search widget showing property ID ${input.propertyId}`,
    );

    // ── OPERATION 2: Dismiss disclaimer dialogs ───────────────────
    progress('[BIS GIS] Op 2/6: Dismissing any disclaimer dialogs...');
    await dismissDialogs(page);

    // OCR VERIFY: Are dialogs cleared?
    await verify(
      'Dismiss Dialogs',
      'Any modal/disclaimer dialogs should be closed, map should be visible and interactive',
    );

    // ── OPERATION 3: Click search result to select parcel ─────────
    progress('[BIS GIS] Op 3/6: Clicking search result to select parcel...');
    const searchSelectors = [
      '.search-result-item',
      '.jimu-widget--search .search-result-item',
      '.esri-search__suggestions-list li',
      '.esri-search__suggestion-item',
      '[class*="search-result"]',
    ];

    let searchResultClicked = false;
    for (const sel of searchSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          console.log(`[map-capture] BIS GIS: search result found via selector "${sel}"`);
          await el.click();
          searchResultClicked = true;
          console.log('[map-capture] BIS GIS: clicked search result to select parcel');
          await page.waitForTimeout(4000);
          break;
        }
      } catch {
        // Try next selector
      }
    }
    if (!searchResultClicked) {
      console.log('[map-capture] BIS GIS: no search result dropdown found — URL may have triggered auto-zoom');
    }

    // OCR VERIFY: Did clicking the search result zoom to the parcel?
    await verify(
      'Search Result Click',
      `Map should be zoomed to property ${input.propertyId}, parcel should be highlighted or centered, lot lines/dimensions visible`,
    );

    // ── OPERATION 4: Zoom out for context ─────────────────────────
    progress(`[BIS GIS] Op 4/6: Zooming out ${GIS_ZOOM_OUT_CLICKS} click(s) for surrounding context...`);
    for (let i = 0; i < GIS_ZOOM_OUT_CLICKS; i++) {
      let zoomed = false;

      // Method 1: ArcGIS JS API (most reliable)
      try {
        const jsZoomWorked = await page.evaluate(() => {
          const containers = Array.from(document.querySelectorAll('[data-widgetid]'));
          for (const c of containers) {
            const mv = (c as any)._mapView ?? (c as any).__mapView;
            if (mv?.zoom) { mv.zoom = mv.zoom - 1; return true; }
          }
          const view = (window as any)._mapView ??
            (window as any).jimuMapView?.view ??
            (document.querySelector('.esri-view') as any)?.__view;
          if (view?.zoom) { view.zoom = view.zoom - 1; return true; }
          return false;
        });
        if (jsZoomWorked) {
          zoomed = true;
          console.log(`[map-capture] BIS GIS: zoom out ${i + 1}/${GIS_ZOOM_OUT_CLICKS} via JS API`);
        }
      } catch { /* JS API not available */ }

      // Method 2: Click zoom-out button
      if (!zoomed) {
        try {
          const zoomOutBtn = await page.$('.esri-zoom .esri-widget--button:last-child');
          if (zoomOutBtn) {
            await zoomOutBtn.click();
            zoomed = true;
            console.log(`[map-capture] BIS GIS: zoom out ${i + 1}/${GIS_ZOOM_OUT_CLICKS} via button click`);
          }
        } catch { /* button not found */ }
      }

      // Method 3: Keyboard minus
      if (!zoomed) {
        await page.keyboard.press('Minus');
        console.log(`[map-capture] BIS GIS: zoom out ${i + 1}/${GIS_ZOOM_OUT_CLICKS} via keyboard`);
      }

      await page.waitForTimeout(2000);
    }

    // Let tiles settle after zoom changes
    await page.waitForTimeout(3000);

    // OCR VERIFY: Did zoom-out work? Can we see surrounding parcels and streets?
    await verify(
      'Zoom Out',
      `Map should be zoomed out ${GIS_ZOOM_OUT_CLICKS} levels from default — target parcel still visible but with surrounding lots, street names, and neighboring properties visible for context`,
    );

    // ── OPERATION 5: Close side panels ────────────────────────────
    progress('[BIS GIS] Op 5/6: Closing side panels for clean screenshot...');
    const layerPanelSelectors = [
      '.jimu-widget--header-close',
      '.panel-close-btn',
      'button.close-button',
      '.esri-layer-list__close-button',
      '.jimu-widget-panel [aria-label="Close"]',
    ];
    let panelClosed = false;
    for (const sel of layerPanelSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          const isVisible = await btn.isVisible();
          if (isVisible) {
            await btn.click();
            await page.waitForTimeout(500);
            console.log(`[map-capture] BIS GIS: closed side panel via "${sel}"`);
            panelClosed = true;
            break;
          }
        }
      } catch { /* panel may not be open */ }
    }
    if (!panelClosed) {
      console.log('[map-capture] BIS GIS: no side panel found to close');
    }

    // Close search results dropdown
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await page.click('.esri-view-root, canvas', { timeout: 2000 });
      await page.waitForTimeout(500);
      console.log('[map-capture] BIS GIS: dismissed search dropdown');
    } catch {
      console.log('[map-capture] BIS GIS: search dropdown dismiss skipped');
    }

    // Final settle
    await page.waitForTimeout(2000);

    // OCR VERIFY: Is the view clean? No panels or dropdowns overlaying the map?
    await verify(
      'Panel Cleanup',
      'Map should be fully visible with no side panels (Map Layers, search dropdowns) overlaying it — clean view of parcel and surroundings ready for screenshot',
    );

    // ── OPERATION 6: Final screenshot capture ─────────────────────
    progress('[BIS GIS] Op 6/6: Capturing final screenshot...');
    const zoomLevel = await page.evaluate(() => {
      const view = (window as any)._mapView ?? (document.querySelector('.esri-view') as any)?.__view;
      return view?.zoom ?? null;
    });
    console.log(`[map-capture] BIS GIS: final zoom level=${zoomLevel}`);

    const buffer = await page.screenshot({
      fullPage: false,
      type: 'png',
      timeout: TIMEOUTS.screenshotCapture,
    });

    // OCR VERIFY: Final screenshot quality check
    const finalCheck = await verify(
      'Final Screenshot',
      `Clean BIS GIS parcel map showing property ${input.propertyId} with lot lines, dimensions, and surrounding context at zoom ~${zoomLevel ?? '?'}`,
    );

    // ── Print verification summary log ────────────────────────────
    const successCount = verifyLog.filter(v => v.success).length;
    const failCount = verifyLog.filter(v => !v.success).length;
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`[map-capture] BIS GIS VERIFICATION LOG — Property ${input.propertyId}`);
    console.log(`${'═'.repeat(80)}`);
    for (let i = 0; i < verifyLog.length; i++) {
      const v = verifyLog[i];
      const status = v.success ? '✓ PASS' : '✗ FAIL';
      const ops = ['Page Load', 'Dismiss Dialogs', 'Search Result Click', 'Zoom Out', 'Panel Cleanup', 'Final Screenshot'];
      console.log(`  ${status}  Op ${i + 1}/6 [${ops[i] ?? '?'}]: ${v.observation}`);
    }
    console.log(`${'─'.repeat(80)}`);
    console.log(`  RESULT: ${successCount} passed, ${failCount} failed out of ${verifyLog.length} checks`);
    if (failCount > 0) {
      console.log(`  ⚠ ATTENTION: ${failCount} operation(s) did not produce expected results — review above for details`);
    }
    console.log(`${'═'.repeat(80)}\n`);

    progress(`[BIS GIS] Verification: ${successCount}/${verifyLog.length} checks passed${failCount > 0 ? ` — ${failCount} FAILED` : ''}`);

    return {
      source: 'BIS GIS (direct URL)',
      url: page.url(),
      imageBase64: buffer.toString('base64'),
      capturedAt: new Date().toISOString(),
      description: `BIS GIS parcel map — Property ${input.propertyId}${input.ownerName ? ` (${input.ownerName})` : ''} — zoom ${zoomLevel ?? '?'} — OCR verify: ${successCount}/${verifyLog.length} passed`,
      classification: finalCheck.success ? 'useful' : 'misc',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[map-capture] BIS GIS capture failed: ${msg}`);
    return null;
  } finally {
    await page.close().catch((e: unknown) => {
      console.warn(`[map-capture] Page close failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  }
}

// ── Google Maps — Satellite Close-Up ──────────────────────────────

async function captureGoogleMapsSatellite(
  context: any,
  input: MapScreenshotInput,
  progress: (msg: string) => void,
): Promise<ScreenshotCapture | null> {
  const page = await context.newPage();
  const apiKey = input.anthropicApiKey;
  const verifyLog: OcrVerifyResult[] = [];
  const verify = async (op: string, expected: string) => {
    const result = await ocrVerifyPage(page, op, expected, apiKey, progress);
    verifyLog.push(result);
    return result;
  };

  try {
    // ── OPERATION 1: Navigate to satellite view ───────────────────
    const url = BELL_ENDPOINTS.googleMaps.satellite(input.lat, input.lon, GOOGLE_MAPS_ZOOM);
    console.log(`[map-capture] Google Satellite URL: ${url}`);
    progress(`[Google Sat] Op 1/3: Loading satellite view at zoom ${GOOGLE_MAPS_ZOOM}...`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.playwrightNavigation,
    });

    // ── OPERATION 2: Dismiss consent ──────────────────────────────
    progress('[Google Sat] Op 2/3: Dismissing consent popup if present...');
    await dismissGoogleConsent(page);

    // Wait for canvas and 10s settle
    try {
      await page.waitForSelector('canvas, #map, .widget-scene, #scene', { timeout: 15_000 });
    } catch {
      console.log('[map-capture] Google Maps: no canvas found, proceeding anyway');
    }
    progress(`[Google Sat] Waiting ${GOOGLE_MAP_SETTLE_MS / 1000}s for satellite tiles to render...`);
    await page.waitForTimeout(GOOGLE_MAP_SETTLE_MS);

    // OCR VERIFY: Did satellite imagery load?
    const loadCheck = await verify(
      'Google Satellite Load',
      `Satellite/aerial imagery visible centered near coordinates ${input.lat.toFixed(4)}, ${input.lon.toFixed(4)} at zoom ${GOOGLE_MAPS_ZOOM} — should show building footprints, roofs, driveways, vegetation`,
    );

    // ── OPERATION 3: Capture screenshot ───────────────────────────
    progress('[Google Sat] Op 3/3: Capturing satellite screenshot...');
    const buffer = await page.screenshot({
      fullPage: false,
      type: 'png',
      timeout: TIMEOUTS.screenshotCapture,
    });

    // OCR VERIFY: Final quality check on captured image
    const finalCheck = await verify(
      'Google Satellite Screenshot',
      `Clean satellite image showing the property area — no consent dialogs, error messages, or "couldn't load" overlays`,
    );

    // Print verification log
    const successCount = verifyLog.filter(v => v.success).length;
    const failCount = verifyLog.filter(v => !v.success).length;
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[map-capture] GOOGLE SATELLITE VERIFICATION LOG`);
    for (const v of verifyLog) {
      console.log(`  ${v.success ? '✓ PASS' : '✗ FAIL'}: ${v.observation}`);
    }
    console.log(`  RESULT: ${successCount}/${verifyLog.length} passed${failCount > 0 ? ` — ${failCount} FAILED` : ''}`);
    console.log(`${'─'.repeat(60)}\n`);

    progress(`[Google Sat] Verification: ${successCount}/${verifyLog.length} checks passed${failCount > 0 ? ` — ${failCount} FAILED` : ''}`);

    return {
      source: 'Google Maps Satellite',
      url: page.url(),
      imageBase64: buffer.toString('base64'),
      capturedAt: new Date().toISOString(),
      description: `Google Maps satellite — ${input.situsAddress ?? `${input.lat}, ${input.lon}`} — zoom ${GOOGLE_MAPS_ZOOM} — OCR verify: ${successCount}/${verifyLog.length} passed`,
      classification: finalCheck.success ? 'useful' : 'misc',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[map-capture] Google Satellite capture failed: ${msg}`);
    return null;
  } finally {
    await page.close().catch((e: unknown) => {
      console.warn(`[map-capture] Page close failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  }
}

// ── Google Maps — Place/Address View ──────────────────────────────

async function captureGoogleMapsPlace(
  context: any,
  input: MapScreenshotInput,
  progress: (msg: string) => void,
): Promise<ScreenshotCapture | null> {
  if (!input.situsAddress) return null;

  const page = await context.newPage();
  const apiKey = input.anthropicApiKey;
  const verifyLog: OcrVerifyResult[] = [];
  const verify = async (op: string, expected: string) => {
    const result = await ocrVerifyPage(page, op, expected, apiKey, progress);
    verifyLog.push(result);
    return result;
  };

  try {
    // ── OPERATION 1: Navigate to place view ───────────────────────
    const url = BELL_ENDPOINTS.googleMaps.place(input.situsAddress, input.lat, input.lon, 19);
    console.log(`[map-capture] Google Place URL: ${url}`);
    progress(`[Google Place] Op 1/3: Loading place view for "${input.situsAddress}"...`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.playwrightNavigation,
    });

    // ── OPERATION 2: Dismiss consent + wait ───────────────────────
    progress('[Google Place] Op 2/3: Dismissing consent popup if present...');
    await dismissGoogleConsent(page);

    // Wait for place panel
    try {
      await page.waitForSelector('[role="main"], .section-hero-header, #pane, #content-container', { timeout: 15_000 });
    } catch {
      console.log('[map-capture] Google Maps: no place panel found, proceeding');
    }
    progress(`[Google Place] Waiting ${GOOGLE_MAP_SETTLE_MS / 1000}s for page to fully render...`);
    await page.waitForTimeout(GOOGLE_MAP_SETTLE_MS);

    // OCR VERIFY: Did the place page load with address info?
    const loadCheck = await verify(
      'Google Place Load',
      `Google Maps place view showing "${input.situsAddress}" with a pin on the map, address info panel on the left, and street/map context`,
    );

    // ── OPERATION 3: Capture screenshot ───────────────────────────
    progress('[Google Place] Op 3/3: Capturing place view screenshot...');
    const buffer = await page.screenshot({
      fullPage: false,
      type: 'png',
      timeout: TIMEOUTS.screenshotCapture,
    });

    // OCR VERIFY: Final quality check
    const finalCheck = await verify(
      'Google Place Screenshot',
      `Clean Google Maps place view with address pin, no consent dialogs or error overlays blocking the view`,
    );

    // Print verification log
    const successCount = verifyLog.filter(v => v.success).length;
    const failCount = verifyLog.filter(v => !v.success).length;
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[map-capture] GOOGLE PLACE VERIFICATION LOG`);
    for (const v of verifyLog) {
      console.log(`  ${v.success ? '✓ PASS' : '✗ FAIL'}: ${v.observation}`);
    }
    console.log(`  RESULT: ${successCount}/${verifyLog.length} passed${failCount > 0 ? ` — ${failCount} FAILED` : ''}`);
    console.log(`${'─'.repeat(60)}\n`);

    progress(`[Google Place] Verification: ${successCount}/${verifyLog.length} checks passed${failCount > 0 ? ` — ${failCount} FAILED` : ''}`);

    return {
      source: 'Google Maps Place',
      url: page.url(),
      imageBase64: buffer.toString('base64'),
      capturedAt: new Date().toISOString(),
      description: `Google Maps place — ${input.situsAddress} — street context with pin — OCR verify: ${successCount}/${verifyLog.length} passed`,
      classification: finalCheck.success ? 'useful' : 'misc',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[map-capture] Google Place capture failed: ${msg}`);
    return null;
  } finally {
    await page.close().catch((e: unknown) => {
      console.warn(`[map-capture] Page close failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  }
}

// ── Utilities ────────────────────────────────────────────────────────

/**
 * Dismiss common modal/disclaimer dialog overlays on the BIS GIS viewer.
 * Only targets actual modal dialogs — NOT side panels or search dropdowns,
 * which are handled separately after interaction.
 */
async function dismissDialogs(page: any): Promise<void> {
  const selectors = [
    // Modal dialog confirmation buttons
    'button:has-text("OK")',
    'button:has-text("Accept")',
    'button:has-text("I Agree")',
    // ArcGIS popup close (info popup, not side panel)
    '.esri-popup__button--close',
    // Overlay/modal close buttons (scoped to overlay containers)
    '.modal button:has-text("Close")',
    '.overlay button:has-text("Close")',
    '[data-testid="close-button"]',
  ];

  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(500);
        console.log(`[map-capture] Dismissed dialog: ${sel}`);
      }
    } catch { /* dialog may not exist */ }
  }
}

/** Dismiss Google consent / cookies popup */
async function dismissGoogleConsent(page: any): Promise<void> {
  const selectors = [
    'button[aria-label="Accept all"]',
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'form[action*="consent"] button',
    '#L2AGLb', // Google consent "I agree" button ID
  ];

  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(1000);
        console.log(`[map-capture] Dismissed Google consent: ${sel}`);
        break;
      }
    } catch { /* consent may not appear */ }
  }
}
