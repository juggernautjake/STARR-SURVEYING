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
 *    - URL pattern: /bellcad/?page=Page#data_s=id:dataSource_1-...:{PROP_ID}&widget_27=...
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

  try {
    // Build the direct-lookup URL from property ID + optional OBJECTID
    const url = BELL_ENDPOINTS.gis.viewerByPropertyId(
      input.propertyId,
      input.arcgisObjectId ?? undefined,
    );
    console.log(`[map-capture] BIS GIS URL: ${url}`);
    console.log(`[map-capture]   propertyId=${input.propertyId}, objectId=${input.arcgisObjectId ?? 'unknown (search-only mode)'}`);
    progress(`[BIS GIS] Loading parcel ${input.propertyId} via direct URL${input.arcgisObjectId ? ` (OBJECTID=${input.arcgisObjectId})` : ' (search-only mode)'}...`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.playwrightNavigation,
    });

    // Wait for the map container to appear
    progress('[BIS GIS] Waiting for map to render...');
    try {
      await page.waitForSelector('.esri-view-root, .jimu-widget-map, canvas', {
        timeout: 20_000,
      });
      console.log('[map-capture] BIS GIS: map container found');
    } catch {
      console.log('[map-capture] BIS GIS: no map container found, waiting anyway...');
    }

    // ── Wait 10 seconds for the page to fully load ──────────────────
    // The BIS GIS viewer needs time for:
    //   1. ArcGIS Experience Builder framework to initialize
    //   2. Map tiles and parcel layers to render
    //   3. Search widget to auto-populate from URL hash params
    //   4. Map to zoom/pan to the target parcel
    progress(`[BIS GIS] Waiting ${GIS_MAP_SETTLE_MS / 1000}s for page to fully load before scanning...`);
    await page.waitForTimeout(GIS_MAP_SETTLE_MS);
    console.log(`[map-capture] BIS GIS: ${GIS_MAP_SETTLE_MS / 1000}s page load wait complete — now scanning page`);

    // ── Scan and interact with the loaded page ────────────────────
    // Dismiss any disclaimer/popup dialogs that may block interaction
    await dismissDialogs(page);

    // Check if search result dropdown appeared (confirms property was found).
    // The BIS GIS viewer shows: "Search result" header + "123484, OWNER NAME"
    // Using multiple selectors for the Experience Builder search widget.
    const searchSelectors = [
      // Experience Builder search result items
      '.search-result-item',
      '.jimu-widget--search .search-result-item',
      // ArcGIS search suggestion list
      '.esri-search__suggestions-list li',
      '.esri-search__suggestion-item',
      // Generic result containers
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
          // Wait for the map to zoom to the selected parcel
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

    // Zoom out slightly for more context (surrounding parcels, roads, street names).
    // The default BIS GIS view from the URL is tightly zoomed on the parcel.
    // We zoom out a few clicks so the surveyor can see the surrounding context.
    progress(`[BIS GIS] Zooming out ${GIS_ZOOM_OUT_CLICKS} click(s) for context...`);
    for (let i = 0; i < GIS_ZOOM_OUT_CLICKS; i++) {
      let zoomed = false;

      // Method 1: ArcGIS JS API (most reliable)
      try {
        const jsZoomWorked = await page.evaluate(() => {
          // Experience Builder stores the MapView in various places
          const containers = Array.from(document.querySelectorAll('[data-widgetid]'));
          for (const c of containers) {
            const mv = (c as any)._mapView ?? (c as any).__mapView;
            if (mv?.zoom) { mv.zoom = mv.zoom - 1; return true; }
          }
          // Fallback: global search
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
          // The minus button in ArcGIS zoom widget
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

      // Wait for tiles to update
      await page.waitForTimeout(2000);
    }

    // Let the tiles settle after zoom changes
    await page.waitForTimeout(3000);

    // Close the Map Layers panel if it's open on the right side.
    // The screenshot shows "Map Layers" with Parcels, Abstracts, etc.
    // This panel takes up the right 20% of the viewport — close it.
    const layerPanelSelectors = [
      // Experience Builder panel close buttons
      '.jimu-widget--header-close',
      '[aria-label="Close"]',
      // The X button on the Map Layers panel
      '.panel-close-btn',
      'button.close-button',
      // ArcGIS LayerList panel close
      '.esri-layer-list__close-button',
    ];
    for (const sel of layerPanelSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          const isVisible = await btn.isVisible();
          if (isVisible) {
            await btn.click();
            await page.waitForTimeout(500);
            console.log(`[map-capture] BIS GIS: closed side panel via "${sel}"`);
            break;
          }
        }
      } catch { /* panel may not be open */ }
    }

    // Close the search results dropdown/panel.
    // The screenshot shows the search dropdown with "Search result" header.
    // Press Escape or click outside to close it without clearing the search.
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      // Click on the map canvas to dismiss any floating panels
      await page.click('.esri-view-root, canvas', { timeout: 2000 });
      await page.waitForTimeout(500);
      console.log('[map-capture] BIS GIS: dismissed search dropdown');
    } catch {
      console.log('[map-capture] BIS GIS: search dropdown dismiss skipped');
    }

    // Final settle for clean screenshot
    await page.waitForTimeout(2000);

    // Get current zoom level for logging
    const zoomLevel = await page.evaluate(() => {
      const view = (window as any)._mapView ?? (document.querySelector('.esri-view') as any)?.__view;
      return view?.zoom ?? null;
    });
    console.log(`[map-capture] BIS GIS: final zoom level=${zoomLevel}`);

    // Capture the screenshot
    const buffer = await page.screenshot({
      fullPage: false,
      type: 'png',
      timeout: TIMEOUTS.screenshotCapture,
    });

    return {
      source: 'BIS GIS (direct URL)',
      url: page.url(),
      imageBase64: buffer.toString('base64'),
      capturedAt: new Date().toISOString(),
      description: `BIS GIS parcel map — Property ${input.propertyId}${input.ownerName ? ` (${input.ownerName})` : ''} — zoom ${zoomLevel ?? '?'}`,
      classification: 'useful',
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

  try {
    const url = BELL_ENDPOINTS.googleMaps.satellite(input.lat, input.lon, GOOGLE_MAPS_ZOOM);
    console.log(`[map-capture] Google Satellite URL: ${url}`);
    progress(`[Google Maps] Loading satellite view at zoom ${GOOGLE_MAPS_ZOOM}...`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.playwrightNavigation,
    });

    // Accept Google cookies/consent if prompted
    await dismissGoogleConsent(page);

    // ── Wait 10 seconds for the page to fully load ──────────────────
    progress(`[Google Maps] Waiting ${GOOGLE_MAP_SETTLE_MS / 1000}s for page to fully load before screenshot...`);
    try {
      await page.waitForSelector('canvas, #map, .widget-scene, #scene', { timeout: 15_000 });
      console.log('[map-capture] Google Maps: map canvas found');
    } catch {
      console.log('[map-capture] Google Maps: no canvas found, proceeding anyway');
    }
    await page.waitForTimeout(GOOGLE_MAP_SETTLE_MS);
    console.log(`[map-capture] Google Maps: ${GOOGLE_MAP_SETTLE_MS / 1000}s page load wait complete — taking screenshot`);

    // Capture screenshot
    const buffer = await page.screenshot({
      fullPage: false,
      type: 'png',
      timeout: TIMEOUTS.screenshotCapture,
    });

    return {
      source: 'Google Maps Satellite',
      url: page.url(),
      imageBase64: buffer.toString('base64'),
      capturedAt: new Date().toISOString(),
      description: `Google Maps satellite — ${input.situsAddress ?? `${input.lat}, ${input.lon}`} — zoom ${GOOGLE_MAPS_ZOOM}`,
      classification: 'useful',
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

  try {
    // Build the Google Maps place URL with tighter zoom than default 17z
    const url = BELL_ENDPOINTS.googleMaps.place(input.situsAddress, input.lat, input.lon, 19);
    console.log(`[map-capture] Google Place URL: ${url.substring(0, 120)}...`);
    progress(`[Google Maps] Loading place view for "${input.situsAddress}"...`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.playwrightNavigation,
    });

    // Accept Google cookies/consent if prompted
    await dismissGoogleConsent(page);

    // ── Wait 10 seconds for the page to fully load ──────────────────
    progress(`[Google Maps] Waiting ${GOOGLE_MAP_SETTLE_MS / 1000}s for page to fully load before screenshot...`);
    try {
      await page.waitForSelector('[role="main"], .section-hero-header, #pane, #content-container', { timeout: 15_000 });
      console.log('[map-capture] Google Maps: place panel found');
    } catch {
      console.log('[map-capture] Google Maps: no place panel found, proceeding');
    }
    await page.waitForTimeout(GOOGLE_MAP_SETTLE_MS);
    console.log(`[map-capture] Google Maps: ${GOOGLE_MAP_SETTLE_MS / 1000}s page load wait complete — taking screenshot`);

    // Capture screenshot
    const buffer = await page.screenshot({
      fullPage: false,
      type: 'png',
      timeout: TIMEOUTS.screenshotCapture,
    });

    return {
      source: 'Google Maps Place',
      url: page.url(),
      imageBase64: buffer.toString('base64'),
      capturedAt: new Date().toISOString(),
      description: `Google Maps place — ${input.situsAddress} — street context with pin`,
      classification: 'useful',
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

/** Dismiss common dialog overlays on the BIS GIS viewer */
async function dismissDialogs(page: any): Promise<void> {
  const selectors = [
    'button:has-text("OK")',
    'button:has-text("Accept")',
    'button:has-text("I Agree")',
    'button:has-text("Close")',
    '.esri-popup__button--close',
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
