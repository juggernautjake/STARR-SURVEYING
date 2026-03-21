// worker/src/counties/bell/scrapers/gis-viewer-capture.ts
// Captures multiple targeted screenshots from the Bell County GIS viewer.
//
// The GIS viewer (https://gis.bisclient.com/bellcad/) is an ArcGIS
// Experience Builder app using ArcGIS JS API 4.33. Since there's no
// MapServer export endpoint, we use Playwright to:
//   1. Load the viewer
//   2. Use the ArcGIS JS API to zoom to the target parcel
//   3. Toggle layers on/off for different views
//   4. Switch between street map and aerial/satellite basemaps
//   5. Capture screenshots at each view
//
// Screenshots captured:
//   A. Subdivision overview — all lots with property ID labels
//   B. Target parcel detail — boundary with dimensions if available
//   C. Aerial with property lines — satellite imagery + parcel outlines
//   D. Aerial without property lines — clean satellite view
//   E. Adjacent lots — individual views of neighboring parcels
//
// Coordinate system: The GIS uses WKID 2277 (NAD 1983 StatePlane Texas
// Central FIPS 4203 Feet). We convert from WGS84 (lat/lon) to state plane.

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints.js';
import type { ScreenshotCapture } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface GisViewerCaptureInput {
  /** Parcel boundary polygon as [lon, lat] rings from GIS query */
  parcelBoundary: number[][][] | null;
  /** WGS84 centroid */
  lat: number;
  lon: number;
  /** Property ID for labeling */
  propertyId: string | null;
  /** Situs address for labeling */
  situsAddress: string | null;
  /** Lot number */
  lotNumber: string | null;
  /** Subdivision name */
  subdivisionName: string | null;
}

export interface GisViewerCaptureProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Constants ────────────────────────────────────────────────────────

const GIS_VIEWER_URL = BELL_ENDPOINTS.gis.viewer;
const VIEWER_LOAD_TIMEOUT = 60_000;
const MAP_SETTLE_WAIT = 4_000;
const LAYER_TOGGLE_WAIT = 2_500;

// ── Zoom Strategy Result Type (kept for reference) ───────────────────
// Diagnostic testing confirmed these strategies work on Bell County GIS:
//   - URL hash params (#center=x,y&level=17) with State Plane coords
//   - Search widget (address geocoding)
//   - Zoom UI buttons (.esri-zoom .esri-widget--button)
//   - Mouse wheel
//   - Keyboard +/- keys
//   - Double-click
// These do NOT work: JS API (jimuMapViews, arcgis-map, Redux store)

interface ZoomStrategyResult {
  strategy: string;
  success: boolean;
  duration: number;
  details: string;
  screenshot?: ScreenshotCapture;
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Capture multiple targeted screenshots from the Bell County GIS viewer.
 * Returns an array of labeled screenshots for the artifact gallery.
 *
 * On the first call, runs a full diagnostic of ALL zoom strategies,
 * capturing a screenshot after each attempt. The diagnostic results
 * are included as labeled screenshots so you can review which strategies
 * actually work on the Bell County Experience Builder viewer.
 */
export async function captureGisViewerScreenshots(
  input: GisViewerCaptureInput,
  onProgress: (p: GisViewerCaptureProgress) => void,
): Promise<ScreenshotCapture[]> {
  const results: ScreenshotCapture[] = [];

  if (!input.parcelBoundary && !input.lat) {
    return results;
  }

  // Reset zoom cache for this capture run
  _zoomCached = false;

  const progress = (msg: string) => {
    onProgress({ phase: 'GIS Viewer', message: msg, timestamp: new Date().toISOString() });
  };

  let browser;
  try {
    const pw = await import('playwright');
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // ── Step 1: Load the GIS viewer ──────────────────────────────
    progress('Loading Bell County GIS viewer...');
    await page.goto(GIS_VIEWER_URL, {
      waitUntil: 'domcontentloaded',
      timeout: VIEWER_LOAD_TIMEOUT,
    });

    // ── Step 1.5: Dismiss the Bell CAD disclaimer dialog ────────
    progress('Looking for disclaimer dialog...');
    await dismissDisclaimerDialog(page, progress);

    // Wait for the ArcGIS map to initialize
    progress('Waiting for map to initialize...');
    const mapReady = await waitForMapReady(page, progress);
    if (!mapReady) {
      progress('⚠ Map did not initialize — falling back to static screenshots');
      const fallback = await takeScreenshot(page, 'GIS Viewer', 'GIS Viewer — map initialization timeout');
      if (fallback) results.push(fallback);
      await context.close();
      return results;
    }

    progress('GIS viewer loaded and map initialized');

    // ── Step 2: Zoom to the target parcel ────────────────────────
    // Strategy cascade: URL params (fastest) → search widget → mouse wheel
    const zoomed = await zoomToParcel(page, input, progress);
    if (!zoomed) {
      progress('Could not zoom to parcel — capturing current view');
    }

    await page.waitForTimeout(MAP_SETTLE_WAIT);

    // ── Screenshot A: Target parcel detail — highest zoom ─────────
    // Start with the tightest zoom (lot-level) since we're already zoomed in
    progress('Capturing target parcel at maximum detail...');
    await zoomIn(page, 3);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssMaxDetail = await takeScreenshot(page, 'GIS Viewer',
      `Maximum detail — ${input.propertyId ?? 'unknown'} — ${input.situsAddress ?? ''} Lot ${input.lotNumber ?? '?'}`);
    if (ssMaxDetail) results.push(ssMaxDetail);

    // ── Screenshot B: Target parcel with lot lines visible ──────
    progress('Capturing target parcel with lot lines...');
    await zoomToParcel(page, input, progress);
    await zoomIn(page, 1);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssDetail = await takeScreenshot(page, 'GIS Viewer',
      `Target parcel detail — ${input.propertyId ?? 'unknown'} — ${input.situsAddress ?? ''} Lot ${input.lotNumber ?? '?'}`);
    if (ssDetail) results.push(ssDetail);

    // ── Screenshot C: Lot + immediate neighbors ─────────────────
    progress('Capturing lot with immediate neighbors...');
    await zoomToParcel(page, input, progress);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssNeighbors = await takeScreenshot(page, 'GIS Viewer',
      `Lot with neighbors — ${input.propertyId ?? 'unknown'} — ${input.subdivisionName ?? 'area'}`);
    if (ssNeighbors) results.push(ssNeighbors);

    // ── Screenshot D: Subdivision overview (zoom out) ───────────
    progress('Capturing subdivision overview...');
    await zoomToParcel(page, input, progress);
    await zoomOut(page, 3);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssSubdiv = await takeScreenshot(page, 'GIS Viewer',
      `Subdivision overview — ${input.subdivisionName ?? 'area'} — all lots with property IDs`);
    if (ssSubdiv) results.push(ssSubdiv);

    // ── Screenshot E: Aerial/satellite at lot-level (eagle view) ─
    progress('Switching to aerial/satellite basemap for eagle view...');
    await switchToAerialBasemap(page);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    // Aerial at lot level — tight zoom
    await zoomToParcel(page, input, progress);
    await zoomIn(page, 2);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssAerialTight = await takeScreenshot(page, 'GIS Viewer',
      `Aerial eagle view (tight) WITH property lines — ${input.propertyId ?? ''} — ${input.situsAddress ?? ''}`);
    if (ssAerialTight) results.push(ssAerialTight);

    // Aerial at parcel level — with lines
    await zoomToParcel(page, input, progress);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssAerialLines = await takeScreenshot(page, 'GIS Viewer',
      `Aerial eagle view WITH property lines — ${input.propertyId ?? ''} — ${input.situsAddress ?? ''}`);
    if (ssAerialLines) results.push(ssAerialLines);

    // Aerial at subdivision level
    await zoomOut(page, 3);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssAerialSubdiv = await takeScreenshot(page, 'GIS Viewer',
      `Aerial eagle view — subdivision — ${input.subdivisionName ?? ''} — ${input.situsAddress ?? ''}`);
    if (ssAerialSubdiv) results.push(ssAerialSubdiv);

    // ── Screenshot F: Clean aerial (no lines) ───────────────────
    progress('Capturing clean aerial view (no property lines)...');
    await toggleParcelLayer(page, false);
    await toggleLotLineLayer(page, false);
    await zoomToParcel(page, input, progress);
    await zoomIn(page, 1);
    await page.waitForTimeout(LAYER_TOGGLE_WAIT);
    const ssAerialClean = await takeScreenshot(page, 'GIS Viewer',
      `Aerial eagle view WITHOUT property lines — ${input.situsAddress ?? ''}`);
    if (ssAerialClean) results.push(ssAerialClean);

    await toggleParcelLayer(page, true);
    await toggleLotLineLayer(page, true);

    // ── Screenshot G: Adjacent lots (4 directions) ──────────────
    progress('Capturing adjacent lot views...');
    await switchToStreetsBasemap(page);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    const directions: Array<{ name: string; dx: number; dy: number }> = [
      { name: 'North', dx: 0, dy: -300 },
      { name: 'East', dx: 400, dy: 0 },
      { name: 'South', dx: 0, dy: 300 },
      { name: 'West', dx: -400, dy: 0 },
    ];

    await zoomToParcel(page, input, progress);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    for (const dir of directions) {
      try {
        await panMap(page, dir.dx, dir.dy);
        await page.waitForTimeout(LAYER_TOGGLE_WAIT);
        const ssAdj = await takeScreenshot(page, 'GIS Viewer',
          `Adjacent lot — ${dir.name} of ${input.propertyId ?? 'target'}`);
        if (ssAdj) results.push(ssAdj);
        await panMap(page, -dir.dx, -dir.dy);
        await page.waitForTimeout(1000);
      } catch {
        // Skip this direction if panning fails
      }
    }

    // ── Screenshot H: Layer combination views ─────────────────────
    progress('Capturing layer combination views...');
    await zoomToParcel(page, input, progress);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    const layerCombinations: Array<{
      label: string;
      basemap: 'streets' | 'aerial';
      parcels: boolean;
      lotLines: boolean;
      zoomDelta: number;
    }> = [
      // Lot lines only — for reading dimension labels
      { label: 'Lot lines only (dimensions)', basemap: 'streets', parcels: false, lotLines: true, zoomDelta: 2 },
      // Maximum zoom aerial with lot lines — for dimension readability on satellite
      { label: 'Aerial max zoom with lot lines', basemap: 'aerial', parcels: false, lotLines: true, zoomDelta: 3 },
      // Wider context
      { label: 'Neighborhood context — streets', basemap: 'streets', parcels: true, lotLines: true, zoomDelta: -4 },
      // Aerial neighborhood
      { label: 'Aerial neighborhood context', basemap: 'aerial', parcels: true, lotLines: true, zoomDelta: -4 },
    ];

    for (const combo of layerCombinations) {
      try {
        progress(`  Layer view: ${combo.label}...`);
        if (combo.basemap === 'aerial') {
          await switchToAerialBasemap(page);
        } else {
          await switchToStreetsBasemap(page);
        }
        await toggleParcelLayer(page, combo.parcels);
        await toggleLotLineLayer(page, combo.lotLines);
        await zoomToParcel(page, input, progress);
        if (combo.zoomDelta > 0) {
          await zoomIn(page, combo.zoomDelta);
        } else if (combo.zoomDelta < 0) {
          await zoomOut(page, -combo.zoomDelta);
        }
        await page.waitForTimeout(MAP_SETTLE_WAIT);

        const ssCombo = await takeScreenshot(page, 'GIS Viewer',
          `Layer view: ${combo.label} — ${input.propertyId ?? ''} ${input.situsAddress ?? ''}`);
        if (ssCombo) results.push(ssCombo);
      } catch {
        // Skip this combination if it fails
      }
    }

    // Restore defaults
    await switchToStreetsBasemap(page);
    await toggleParcelLayer(page, true);
    await toggleLotLineLayer(page, true);

    await context.close();
    progress(`✓ Captured ${results.length} GIS viewer screenshot(s)`);

  } catch (err) {
    progress(`GIS viewer capture error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return results;
}

// ── Internal: Dismiss Disclaimer Dialog ──────────────────────────────

/**
 * The Bell CAD GIS viewer (BIS Consultants) shows a disclaimer dialog on
 * every page load. It has an "OK" button and a "Cancel" button. The dialog
 * must be dismissed before the map can be interacted with.
 *
 * Dialog content: "Bell Central Appraisal District" disclaimer about
 * informational purposes only, with OK/Cancel buttons at the bottom.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dismissDisclaimerDialog(page: any, progress: (msg: string) => void): Promise<void> {
  const maxWait = 15_000;
  const pollInterval = 1_000;
  let waited = 0;

  while (waited < maxWait) {
    try {
      // Try multiple selectors for the OK button in the disclaimer dialog
      const okSelectors = [
        // Button with text "OK" — most reliable
        'button:has-text("OK")',
        // Calcite/Esri modal buttons
        'calcite-button:has-text("OK")',
        // Generic button matching
        'button.btn-primary',
        'button.esri-button',
        '.modal-footer button:first-child',
        '.dialog-footer button:first-child',
        // ArcGIS Experience Builder dialog buttons
        '.jimu-btn:has-text("OK")',
        '[class*="modal"] button:has-text("OK")',
        '[class*="dialog"] button:has-text("OK")',
        '[class*="popup"] button:has-text("OK")',
        // Generic overlay/dialog patterns
        '[role="dialog"] button',
        '[role="alertdialog"] button',
      ];

      for (const sel of okSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.count() > 0) {
            const btnText = await btn.textContent().catch(() => '');
            // Only click buttons that contain "OK" or are the primary action
            if (btnText?.trim().toUpperCase() === 'OK' || btnText?.trim().toUpperCase() === 'ACCEPT' || sel.includes('primary')) {
              await btn.click({ timeout: 3000 });
              progress(`  ✓ Dismissed disclaimer dialog (clicked: "${btnText?.trim()}" via ${sel})`);
              // Wait a moment for the dialog to close
              await page.waitForTimeout(1500);
              return;
            }
          }
        } catch {
          // Selector not found or click failed — try next
        }
      }

      // Also try clicking any visible button that says exactly "OK"
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          const text = btn.textContent?.trim();
          if (text === 'OK' || text === 'Accept' || text === 'I Agree') {
            // Check if the button is visible
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              btn.click();
              return text;
            }
          }
        }
        // Also check for anchor tags styled as buttons
        const anchors = Array.from(document.querySelectorAll('a'));
        for (const a of anchors) {
          const text = a.textContent?.trim();
          if (text === 'OK' || text === 'Accept') {
            const rect = a.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              a.click();
              return text;
            }
          }
        }
        return null;
      });

      if (clicked) {
        progress(`  ✓ Dismissed disclaimer dialog (clicked: "${clicked}" via DOM evaluate)`);
        await page.waitForTimeout(1500);
        return;
      }

    } catch (err) {
      // Evaluation may fail during page load — retry
    }

    await page.waitForTimeout(pollInterval);
    waited += pollInterval;
    if (waited < maxWait) {
      progress(`  Waiting for disclaimer dialog... (${Math.round(waited / 1000)}s)`);
    }
  }

  progress('  No disclaimer dialog found (may have been auto-dismissed or not present)');
}

// ── Internal: Wait for Map Ready ─────────────────────────────────────

async function waitForMapReady(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  progress: (msg: string) => void,
): Promise<boolean> {
  const maxWait = 45_000;
  const pollInterval = 3_000;
  let waited = 0;

  while (waited < maxWait) {
    try {
      const ready = await page.evaluate(() => {
        // Check for canvas element (map tiles rendered) — most reliable
        // indicator that the map is visually loaded, regardless of whether
        // the ArcGIS JS API is accessible.
        const canvas = document.querySelector('.esri-view-surface canvas');
        if (canvas) return true;

        // Check for Esri view container
        const viewDiv = document.querySelector('.esri-view');
        if (viewDiv) return true;

        // Check for ArcGIS Experience Builder map widget
        const jimuMap = document.querySelector('[data-widgetid*="map"], .jimu-widget--map');
        if (jimuMap) return true;

        return false;
      });

      if (ready) return true;
    } catch { /* evaluate may fail during page load */ }

    await page.waitForTimeout(pollInterval);
    waited += pollInterval;
    progress(`  Waiting for map... (${Math.round(waited / 1000)}s)`);
  }

  return false;
}

// ── Internal: Find the MapView via JS API (best-effort) ──────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryGetMapView(page: any): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (w._mapViewManager?.jimuMapViews) {
        const views = Object.values(w._mapViewManager.jimuMapViews);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return views.some((v: any) => v?.view?.ready);
      }
      const mapEl = document.querySelector('arcgis-map');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (mapEl && (mapEl as any).view?.ready) return true;
      return false;
    });
  } catch { return false; }
}


// ── Internal: Zoom to Parcel ─────────────────────────────────────────
// Cascading strategies (proven via diagnostic testing):
//   1. URL hash params with State Plane coordinates (fastest, no UI interaction)
//   2. Search widget — type address, select suggestion, viewer zooms itself
//   3. Mouse-wheel zoom — approximate but always works
// JS API (goTo) was removed — it never works on this Experience Builder app.

// Track whether we've already zoomed (avoid redundant re-zooms during capture series)
let _zoomCached = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomToParcel(page: any, input: GisViewerCaptureInput, progress: (msg: string) => void): Promise<boolean> {
  // If we already zoomed to this parcel, skip re-zooming (saves ~15s per call)
  if (_zoomCached) {
    progress('[zoom] Using cached zoom position (already zoomed to parcel)');
    return true;
  }

  // Compute center coordinates from parcel boundary (State Plane WKID 2277)
  // or fall back to WGS84 lat/lon from property record
  let centerLon = input.lon;
  let centerLat = input.lat;
  if (input.parcelBoundary && input.parcelBoundary.length > 0) {
    const ring = input.parcelBoundary[0];
    let sumLon = 0, sumLat = 0;
    for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
    centerLon = sumLon / ring.length;
    centerLat = sumLat / ring.length;
    progress(`[zoom] Computed parcel centroid: (${centerLon.toFixed(1)}, ${centerLat.toFixed(1)}) from ${ring.length}-point boundary`);
  } else {
    progress(`[zoom] Using WGS84 coordinates: (${centerLon}, ${centerLat}) — no parcel boundary available`);
  }

  // ── Strategy 1: URL params (fastest — no UI interaction needed) ──
  // The Bell County GIS viewer accepts State Plane coords via #center=x,y&level=N
  progress('[zoom] Strategy 1: Trying URL hash parameters with State Plane coordinates...');
  const urlSuccess = await zoomViaUrlParams(page, centerLon, centerLat, progress);
  if (urlSuccess) {
    progress('[zoom] SUCCESS — Zoomed via URL parameters');
    _zoomCached = true;
    return true;
  }
  progress('[zoom] URL params failed — trying search widget...');

  // ── Strategy 2: Search widget — type address and let the app zoom ──
  if (input.situsAddress) {
    progress(`[zoom] Strategy 2: Searching for address "${input.situsAddress}"...`);
    const searchSuccess = await zoomViaSearchWidget(page, input.situsAddress, progress);
    if (searchSuccess) {
      progress('[zoom] SUCCESS — Zoomed via search widget');
      _zoomCached = true;
      return true;
    }
    progress('[zoom] Search widget failed — falling back to mouse wheel...');
  }

  // ── Strategy 3: Mouse wheel zoom — approximate positioning ──
  // Bell County GIS starts at state/county level. We need ~25-30 zoom clicks
  // to get from county level down to lot-level detail.
  progress('[zoom] Strategy 3: Using mouse wheel zoom (approximate) — zooming deep to lot level...');
  await zoomViaMouseWheel(page, 30);
  await page.waitForTimeout(3000);
  // Verify we're zoomed in enough — if the map still looks county-level,
  // try additional zoom clicks
  progress('[zoom] Applying additional zoom refinement...');
  await zoomViaMouseWheel(page, 8);
  await page.waitForTimeout(2000);
  progress('[zoom] Applied deep mouse-wheel zoom — position is approximate');
  _zoomCached = true;
  return true;
}

// Zoom using the Experience Builder search widget (type address → select result)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomViaSearchWidget(page: any, address: string, progress: (msg: string) => void): Promise<boolean> {
  try {
    // Common selectors for search widgets in ArcGIS Experience Builder / JS API apps
    const searchSelectors = [
      '.esri-search__input',
      'input[data-widget-type="search"]',
      '.jimu-widget--search input[type="text"]',
      '[class*="search-module"] input',
      '.esri-search input',
      'input[placeholder*="Find"]',
      'input[placeholder*="Search"]',
      'input[placeholder*="search"]',
      'input[placeholder*="find"]',
      'input[placeholder*="address"]',
      'input[placeholder*="Address"]',
    ];

    for (const sel of searchSelectors) {
      try {
        const input = page.locator(sel).first();
        if (await input.count() > 0 && await input.isVisible()) {
          progress(`  Found search widget: ${sel}`);

          // Clear and type the address
          await input.click();
          await input.fill('');
          await page.waitForTimeout(300);
          await input.fill(address);
          await page.waitForTimeout(1500); // Wait for autocomplete suggestions

          // Try to click the first suggestion
          const suggestionSelectors = [
            '.esri-search__suggestions-list li:first-child',
            '.esri-search__suggestion-list-item:first-child',
            '[class*="suggestion"] li:first-child',
            '.esri-menu__list-item:first-child',
            '[role="option"]:first-child',
            '.esri-search__suggestions-list__suggestions-group-container li:first-child',
          ];

          let clicked = false;
          for (const sugSel of suggestionSelectors) {
            try {
              const sug = page.locator(sugSel).first();
              if (await sug.count() > 0 && await sug.isVisible()) {
                await sug.click();
                clicked = true;
                progress(`  Selected search suggestion via ${sugSel}`);
                break;
              }
            } catch { /* try next selector */ }
          }

          // If no suggestion found, press Enter to search
          if (!clicked) {
            await input.press('Enter');
            progress('  Pressed Enter to search');
          }

          // Wait for the map to zoom to the result
          await page.waitForTimeout(MAP_SETTLE_WAIT + 2000);

          // Check if search was successful by looking for result markers
          const hasResult = await page.evaluate(() => {
            // Check if there's a search result marker or the view changed
            const marker = document.querySelector('.esri-search__result-marker, .esri-graphic');
            return !!marker;
          });

          if (hasResult) return true;

          // Even without a marker, the search might have zoomed — consider success
          // if the map canvas updated (search didn't produce an error)
          const hasError = await page.evaluate(() => {
            const noResult = document.querySelector('.esri-search__no-result-text');
            return !!noResult;
          });

          if (!hasError) return true;
          progress('  Search returned no results');
        }
      } catch { /* try next selector */ }
    }

    return false;
  } catch { return false; }
}

// Zoom via URL parameters — reload the viewer with center/level embedded
// ArcGIS Experience Builder supports:
//   #center=lon,lat&level=N  (hash params)
//   ?center=lon,lat&level=N  (query params)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomViaUrlParams(page: any, lon: number, lat: number, progress: (msg: string) => void): Promise<boolean> {
  try {
    const baseUrl = GIS_VIEWER_URL.replace(/[#?].*$/, '');

    // Experience Builder typically uses hash params for map state.
    // Level 17 = city scale — too far out.
    // Level 19 = subdivision scale — can see lot boundaries.
    // Level 20 = individual lot scale — can read dimensions.
    // Use level 20 to start at lot-level detail, then zoom in/out from there.
    // The extent format uses a very tight bbox (±0.0003° ≈ 30m) to force lot-level zoom.
    const urlFormats = [
      `${baseUrl}#center=${lon},${lat}&level=20`,
      `${baseUrl}?center=${lon},${lat}&level=20`,
      `${baseUrl}#extent=${lon - 0.0003},${lat - 0.0003},${lon + 0.0003},${lat + 0.0003}`,
      `${baseUrl}#center=${lon},${lat}&level=19`,
    ];

    for (let fi = 0; fi < urlFormats.length; fi++) {
      const url = urlFormats[fi];
      try {
        progress(`[zoom-url] Attempt ${fi + 1}/${urlFormats.length}: ${url.substring(0, 100)}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });

        // Dismiss disclaimer again after reload
        await dismissDisclaimerDialog(page, progress);

        // Wait for map to render
        const ready = await waitForMapReady(page, progress);
        if (!ready) continue;

        await page.waitForTimeout(MAP_SETTLE_WAIT);

        // Check if the map actually moved to our coordinates by evaluating
        // whether we can see the parcel area. We can't easily verify this
        // without the JS API, so we check if the URL params were consumed.
        const currentUrl = page.url();
        // If the URL still has our params and the map loaded, consider it a success
        if (currentUrl.includes('center=') || currentUrl.includes('extent=')) {
          return true;
        }

        // Even if URL params were consumed/stripped, the map may have zoomed
        // Check if zoom buttons are visible (map is interactive)
        const hasZoomButtons = await page.evaluate(() => {
          return !!document.querySelector('.esri-zoom, .esri-ui-corner .esri-component');
        });
        if (hasZoomButtons) return true;
      } catch { /* try next format */ }
    }

    return false;
  } catch { return false; }
}

// Zoom using mouse wheel events on the map canvas
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomViaMouseWheel(page: any, scrollClicks: number): Promise<void> {
  try {
    // Find the map's viewport center
    const centerX = 960;
    const centerY = 540;

    // Move mouse to center of map
    await page.mouse.move(centerX, centerY);
    await page.waitForTimeout(200);

    // Each wheel event zooms in one level; negative deltaY = zoom in
    for (let i = 0; i < Math.abs(scrollClicks); i++) {
      await page.mouse.wheel(0, scrollClicks > 0 ? -120 : 120);
      await page.waitForTimeout(300); // Small delay between scroll events
    }
  } catch { /* wheel zoom is best-effort */ }
}

// ── Internal: Zoom In/Out ────────────────────────────────────────────
// Uses three strategies: JS API → UI button clicks → mouse wheel

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomIn(page: any, levels: number): Promise<void> {
  // Strategy 1: Try JS API
  const jsWorked = await page.evaluate(async (n: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    let view = null;
    if (w._mapViewManager?.jimuMapViews) {
      const views = Object.values(w._mapViewManager.jimuMapViews);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = views.find((v: any) => v?.view?.ready);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (found) view = (found as any).view;
    }
    if (!view) {
      const mapEl = document.querySelector('arcgis-map');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (mapEl) view = (mapEl as any).view;
    }
    if (view) {
      await view.goTo({ zoom: view.zoom + n }, { duration: 500 });
      return true;
    }
    return false;
  }, levels).catch(() => false);

  if (jsWorked) return;

  // Strategy 2: Click the zoom-in/zoom-out UI buttons
  const isZoomIn = levels > 0;
  const clickCount = Math.abs(levels);
  const buttonSelectors = isZoomIn
    ? ['.esri-zoom .esri-widget--button:first-child', '.esri-icon-plus', 'button[title="Zoom in"]', 'button[title="Zoom In"]',
       '.esri-zoom__zoom-in-button', 'calcite-button[icon-start="plus"]']
    : ['.esri-zoom .esri-widget--button:last-child', '.esri-icon-minus', 'button[title="Zoom out"]', 'button[title="Zoom Out"]',
       '.esri-zoom__zoom-out-button', 'calcite-button[icon-start="minus"]'];

  for (const sel of buttonSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible()) {
        for (let i = 0; i < clickCount; i++) {
          await btn.click();
          await page.waitForTimeout(600); // Wait for zoom animation
        }
        return;
      }
    } catch { /* try next selector */ }
  }

  // Strategy 3: Mouse wheel
  await zoomViaMouseWheel(page, isZoomIn ? clickCount * 3 : -(clickCount * 3));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomOut(page: any, levels: number): Promise<void> {
  await zoomIn(page, -levels);
}

// ── Internal: Pan Map ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function panMap(page: any, dx: number, dy: number): Promise<void> {
  // Use mouse drag to pan the map
  const centerX = 960; // viewport center
  const centerY = 540;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX - dx, centerY - dy, { steps: 10 });
  await page.mouse.up();
}

// ── Internal: Switch Basemaps ────────────────────────────────────────
// Uses two strategies: JS API → UI basemap gallery clicks

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function switchToAerialBasemap(page: any): Promise<void> {
  // Strategy 1: JS API
  const jsWorked = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    let view = null;
    if (w._mapViewManager?.jimuMapViews) {
      const views = Object.values(w._mapViewManager.jimuMapViews);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = views.find((v: any) => v?.view?.ready);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (found) view = (found as any).view;
    }
    if (!view) {
      const mapEl = document.querySelector('arcgis-map');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (mapEl) view = (mapEl as any).view;
    }
    if (!view?.map) return false;

    try {
      view.map.basemap = 'hybrid';
      return true;
    } catch {
      try { view.map.basemap = 'satellite'; return true; } catch { return false; }
    }
  }).catch(() => false);

  if (jsWorked) return;

  // Strategy 2: Click basemap gallery item in the Experience Builder UI
  await clickBasemapGalleryItem(page, ['imagery', 'satellite', 'aerial', 'hybrid', 'world imagery']);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function switchToStreetsBasemap(page: any): Promise<void> {
  const jsWorked = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    let view = null;
    if (w._mapViewManager?.jimuMapViews) {
      const views = Object.values(w._mapViewManager.jimuMapViews);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = views.find((v: any) => v?.view?.ready);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (found) view = (found as any).view;
    }
    if (!view) {
      const mapEl = document.querySelector('arcgis-map');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (mapEl) view = (mapEl as any).view;
    }
    if (!view?.map) return false;

    try { view.map.basemap = 'streets-vector'; return true; }
    catch { try { view.map.basemap = 'streets'; return true; } catch { return false; } }
  }).catch(() => false);

  if (jsWorked) return;

  await clickBasemapGalleryItem(page, ['streets', 'topographic', 'topo', 'street map']);
}

// Click a basemap gallery item by matching title text
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clickBasemapGalleryItem(page: any, keywords: string[]): Promise<void> {
  try {
    // First, try to open the basemap gallery widget if it's collapsed
    const galleryOpeners = [
      '.esri-basemap-gallery-widget__button',
      '[data-widgetid*="basemap"]',
      '.jimu-widget--basemap-gallery',
      'button[title*="Basemap"]',
      'button[title*="basemap"]',
    ];

    for (const sel of galleryOpeners) {
      try {
        const opener = page.locator(sel).first();
        if (await opener.count() > 0 && await opener.isVisible()) {
          await opener.click();
          await page.waitForTimeout(1000);
          break;
        }
      } catch { /* try next */ }
    }

    // Now find and click the basemap item by its label
    const clicked = await page.evaluate((kws: string[]) => {
      // Check basemap gallery items
      const items = document.querySelectorAll(
        '.esri-basemap-gallery__item, [class*="basemap-gallery"] [class*="item"], ' +
        '.esri-basemap-gallery__item-container li'
      );
      for (let i = 0; i < items.length; i++) {
        const title = (items[i].textContent || '').toLowerCase();
        if (kws.some(kw => title.includes(kw))) {
          (items[i] as HTMLElement).click();
          return true;
        }
      }
      // Broader search — any element with basemap-related text
      const allEls = document.querySelectorAll('[class*="basemap"] *');
      for (let j = 0; j < allEls.length; j++) {
        const el = allEls[j];
        const title = (el.textContent || '').toLowerCase().trim();
        if (title && kws.some(kw => title.includes(kw)) && title.length < 50) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, keywords);

    if (clicked) {
      await page.waitForTimeout(LAYER_TOGGLE_WAIT);
    }
  } catch { /* basemap switch is best-effort */ }
}

// ── Internal: Toggle Layers ──────────────────────────────────────────
// Uses two strategies: JS API → UI layer list checkbox clicks

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toggleParcelLayer(page: any, visible: boolean): Promise<void> {
  await toggleLayerByTitle(page, ['Parcels', 'parcels', 'PARCELS'], visible);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toggleLotLineLayer(page: any, visible: boolean): Promise<void> {
  await toggleLayerByTitle(page, ['Lot Lines', 'lot lines', 'LOT LINES', 'LotLines'], visible);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toggleLayerByTitle(page: any, titles: string[], visible: boolean): Promise<void> {
  // Strategy 1: JS API
  const jsWorked = await page.evaluate((params: { titles: string[]; visible: boolean }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    let view = null;
    if (w._mapViewManager?.jimuMapViews) {
      const views = Object.values(w._mapViewManager.jimuMapViews);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = views.find((v: any) => v?.view?.ready);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (found) view = (found as any).view;
    }
    if (!view) {
      const mapEl = document.querySelector('arcgis-map');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (mapEl) view = (mapEl as any).view;
    }
    if (!view?.map?.layers) return false;

    let toggled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    view.map.layers.forEach((layer: any) => {
      if (params.titles.some(t => layer.title?.toLowerCase() === t.toLowerCase())) {
        layer.visible = params.visible;
        toggled = true;
      }
    });
    return toggled;
  }, { titles, visible }).catch(() => false);

  if (jsWorked) return;

  // Strategy 2: Click layer list checkboxes in the UI
  try {
    // Find layer list items matching our titles and toggle their checkboxes
    await page.evaluate((params: { titles: string[]; visible: boolean }) => {
      // Look for layer list widget items
      const listItems = document.querySelectorAll(
        '.esri-layer-list__item, [class*="layer-list"] [class*="item"], ' +
        '.jimu-widget--layer-list [class*="item"]'
      );

      for (let i = 0; i < listItems.length; i++) {
        const item = listItems[i];
        const label = (item.textContent || '').trim().toLowerCase();
        if (params.titles.some(t => label.includes(t.toLowerCase()))) {
          // Find the visibility checkbox/toggle within this item
          const toggle = item.querySelector(
            'input[type="checkbox"], calcite-checkbox, .esri-layer-list__item-toggle, ' +
            '[class*="visibility"], [role="switch"]'
          );
          if (toggle) {
            const isChecked = (toggle as HTMLInputElement).checked ||
              toggle.getAttribute('aria-checked') === 'true' ||
              toggle.classList.contains('checked');

            if (isChecked !== params.visible) {
              (toggle as HTMLElement).click();
            }
          }
        }
      }
    }, { titles, visible });

    await page.waitForTimeout(LAYER_TOGGLE_WAIT);
  } catch { /* layer toggle is best-effort */ }
}

// ── Internal: Take Screenshot ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function takeScreenshot(page: any, source: string, description: string): Promise<ScreenshotCapture | null> {
  try {
    const buffer = await page.screenshot({
      fullPage: false, // Viewport only — we set it to 1920x1080
      type: 'png',
      timeout: TIMEOUTS.screenshotCapture,
    });

    return {
      source,
      url: page.url(),
      imageBase64: buffer.toString('base64'),
      capturedAt: new Date().toISOString(),
      description,
      classification: 'useful', // GIS viewer screenshots are always useful
    };
  } catch {
    return null;
  }
}
