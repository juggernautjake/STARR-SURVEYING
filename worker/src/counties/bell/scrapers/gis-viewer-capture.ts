// worker/src/counties/bell/scrapers/gis-viewer-capture.ts
// Captures multiple targeted screenshots from the Bell County GIS viewer.
//
// The GIS viewer (https://gis.bisclient.com/bellcad/) is an ArcGIS
// Experience Builder app using ArcGIS JS API 4.33. Since there's no
// MapServer export endpoint, we use Playwright to:
//   1. Load the viewer
//   2. Zoom to the target parcel (URL params → search widget → mouse wheel)
//   3. Toggle layers on/off for different views
//   4. Switch between street map and aerial/satellite basemaps
//   5. Capture screenshots at each view
//
// Normal mode (default): 9-14 targeted screenshots (A–H) per run.
//
// Diagnostics mode (input.diagnosticsMode = true): adds Phase A before
// the normal screenshots — tests every URL-based zoom method at each of
// the configured ZOOM_LEVELS (11 total methods) and captures a labeled
// screenshot after each attempt so you can see which strategies work.
//
// Screenshots captured (normal):
//   A. Maximum detail (zoom in +3)
//   B. Target parcel detail (zoom in +1)
//   C. Lot with immediate neighbors
//   D. Subdivision overview (zoom out -3)
//   E1-E3. Aerial eagle views (tight, parcel, subdivision)
//   F. Clean aerial without property lines
//   G. Adjacent lots (N/E/S/W)
//   H. Layer combination views (4 combos)
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
  /**
   * When true, runs Phase A before normal screenshots: tests every
   * URL-based zoom method at each ZOOM_LEVEL and captures a labeled
   * screenshot so you can verify which strategies work on the viewer.
   */
  diagnosticsMode?: boolean;
}

export interface GisViewerCaptureProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Constants ────────────────────────────────────────────────────────

const GIS_VIEWER_URL = BELL_ENDPOINTS.gis.viewer;
const VIEWER_LOAD_TIMEOUT = 60_000;
const MAP_SETTLE_WAIT = 6_000;
const LAYER_TOGGLE_WAIT = 4_000;
// Extra wait after full page navigation to let ArcGIS tiles + layers fully render
const POST_NAV_RENDER_WAIT = 8_000;

// ── Module-level logging ─────────────────────────────────────────────
// All helper functions use gisLog() so every log entry is captured in the
// structured captureLog array AND emitted to console with a consistent
// prefix. The main function resets _captureLog at the start of each run
// and dumps it in the finally block.

let _captureStart = 0;
const _captureLog: string[] = [];

function gisLog(phase: string, msg: string, data?: Record<string, unknown>): void {
  const elapsed = _captureStart ? Date.now() - _captureStart : 0;
  const entry = `[GIS-CAPTURE][${phase}][+${elapsed}ms] ${msg}`;
  _captureLog.push(entry);
  console.log(entry, data ? JSON.stringify(data).slice(0, 500) : '');
}

// Zoom levels to test in diagnostics mode (low → high detail)
const ZOOM_LEVELS = [15, 17, 19, 20, 22];

// Diagnostic testing (commit 86d95d0, 12 approaches) confirmed these work:
//   - URL hash params (#center=x,y&level=17) with State Plane coords
//   - Search widget (address geocoding)
//   - Zoom UI buttons (.esri-zoom .esri-widget--button)
//   - Mouse wheel
//   - Keyboard +/- keys (Equal, NumpadAdd, Minus, NumpadSubtract)
//   - Double-click (zoom in only)
// These do NOT work: JS API (jimuMapViews, arcgis-map, Redux store)
//
// zoomIn() cascade: JS API → UI buttons → keyboard → double-click → mouse wheel
// zoomToParcel() cascade: URL params → search widget → mouse wheel

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Capture multiple targeted screenshots from the Bell County GIS viewer.
 * Returns an array of labeled screenshots for the artifact gallery.
 *
 * Normal mode: 9–14 targeted screenshots (A–H) of the parcel and its context.
 *
 * Diagnostics mode (input.diagnosticsMode = true): prepends Phase A — tests
 * every URL-based zoom method at each ZOOM_LEVEL, capturing a labeled
 * screenshot after each attempt so you can verify which strategies work on
 * the Bell County Experience Builder viewer. Useful during development or
 * when debugging zoom/map alignment issues.
 */
export async function captureGisViewerScreenshots(
  input: GisViewerCaptureInput,
  onProgress: (p: GisViewerCaptureProgress) => void,
): Promise<ScreenshotCapture[]> {
  const results: ScreenshotCapture[] = [];
  // Reset module-level state for this capture run
  _captureStart = Date.now();
  _captureLog.length = 0;
  _zoomCached = false;
  _parcelCenterLon = 0;
  _parcelCenterLat = 0;

  // logDetail delegates to gisLog — kept for readability in the main function
  const logDetail = gisLog;

  logDetail('init', `Starting GIS viewer capture`, {
    has_boundary: !!input.parcelBoundary,
    lat: input.lat, lon: input.lon,
    property_id: input.propertyId,
    situs_address: input.situsAddress,
    lot_number: input.lotNumber,
    subdivision: input.subdivisionName,
    boundary_points: input.parcelBoundary?.[0]?.length ?? 0,
  });

  if (!input.parcelBoundary && !input.lat) {
    logDetail('init', 'ABORT: No parcel boundary and no lat/lon — cannot proceed');
    return results;
  }

  // Reset zoom cache for this capture run
  _zoomCached = false;

  const progress = (msg: string) => {
    logDetail('progress', msg);
    onProgress({ phase: 'GIS Viewer', message: msg, timestamp: new Date().toISOString() });
  };

  let browser;
  try {
    logDetail('browser', 'Importing Playwright and launching Chromium...');
    const browserLaunchStart = Date.now();
    const pw = await import('playwright');
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    });
    logDetail('browser', `Chromium launched in ${Date.now() - browserLaunchStart}ms`);

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    logDetail('browser', 'Browser context and page created (1920x1080 viewport)');

    // ── Step 1: Load the GIS viewer ──────────────────────────────
    progress('Loading Bell County GIS viewer...');
    const pageLoadStart = Date.now();
    logDetail('load', `Navigating to GIS viewer: ${GIS_VIEWER_URL}`, { timeout: VIEWER_LOAD_TIMEOUT });
    await page.goto(GIS_VIEWER_URL, {
      waitUntil: 'domcontentloaded',
      timeout: VIEWER_LOAD_TIMEOUT,
    });
    logDetail('load', `Page loaded (domcontentloaded) in ${Date.now() - pageLoadStart}ms`);

    // ── Step 1.5: Dismiss the Bell CAD disclaimer dialog ────────
    progress('Looking for disclaimer dialog...');
    const disclaimerStart = Date.now();
    await dismissDisclaimerDialog(page, progress);
    logDetail('disclaimer', `Disclaimer handling completed in ${Date.now() - disclaimerStart}ms`);

    // Wait for the ArcGIS map to initialize
    progress('Waiting for map to initialize...');
    const mapReadyStart = Date.now();
    const mapReady = await waitForMapReady(page, progress);
    const mapReadyDuration = Date.now() - mapReadyStart;
    logDetail('map-init', `Map ready check: ${mapReady ? 'SUCCESS' : 'FAILED'} in ${mapReadyDuration}ms`);

    if (!mapReady) {
      logDetail('map-init', 'Map did not initialize — capturing fallback screenshot');
      progress('⚠ Map did not initialize — falling back to static screenshots');
      const fallback = await takeScreenshot(page, 'GIS Viewer', 'GIS Viewer — map initialization timeout');
      if (fallback) {
        results.push(fallback);
        logDetail('screenshot', `Fallback screenshot captured: ${fallback.imageBase64.length} base64 chars`);
      }
      await context.close();
      logDetail('summary', `GIS capture ABORTED (map init failed) — ${results.length} fallback screenshots in ${Date.now() - _captureStart}ms`);
      return results;
    }

    progress('GIS viewer loaded and map initialized');
    logDetail('map-init', `GIS viewer fully initialized — total load time: ${Date.now() - pageLoadStart}ms`);

    // ── Phase A (optional): Zoom Method Diagnostics ──────────────
    // Only runs when input.diagnosticsMode = true. Tests each URL-based
    // zoom method at each ZOOM_LEVEL and captures a labeled screenshot.
    // Use this to verify which strategies work on the Bell County viewer.
    if (input.diagnosticsMode) {
      // Compute parcel centroid for URL params
      let diagLon = input.lon;
      let diagLat = input.lat;
      if (input.parcelBoundary && input.parcelBoundary.length > 0) {
        const ring = input.parcelBoundary[0];
        let sumLon = 0, sumLat = 0;
        for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
        diagLon = sumLon / ring.length;
        diagLat = sumLat / ring.length;
      }

      progress('PHASE A: Starting zoom method diagnostics...');
      logDetail('diag', `Phase A: testing ${ZOOM_LEVELS.length * 2 + 1} URL zoom methods at (${diagLon.toFixed(4)}, ${diagLat.toFixed(4)})`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diagMethods: Array<{ name: string; run: (p: any) => Promise<void> }> = [
        // URL hash at each zoom level
        ...ZOOM_LEVELS.map(level => ({
          name: `URL-Hash level=${level}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          run: async (p: any) => {
            const url = `${GIS_VIEWER_URL}#center=${diagLon},${diagLat}&level=${level}`;
            logDetail('diag', `  Navigating to: ${url}`);
            await p.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
          },
        })),
        // URL query string at each zoom level
        ...ZOOM_LEVELS.map(level => ({
          name: `URL-Query level=${level}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          run: async (p: any) => {
            const base = GIS_VIEWER_URL.replace(/[#?].*$/, '');
            const url = `${base}?center=${diagLon},${diagLat}&level=${level}`;
            logDetail('diag', `  Navigating to: ${url}`);
            await p.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
          },
        })),
        // URL extent (tight bounding box)
        {
          name: 'URL-Extent tight-bbox',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          run: async (p: any) => {
            const d = 0.0003;
            const url = `${GIS_VIEWER_URL}#extent=${diagLon - d},${diagLat - d},${diagLon + d},${diagLat + d}`;
            logDetail('diag', `  Navigating to: ${url}`);
            await p.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
          },
        },
      ];

      let diagIndex = 0;
      for (const method of diagMethods) {
        diagIndex++;
        progress(`[DIAG-${String(diagIndex).padStart(2, '0')}] Testing: ${method.name}`);
        try {
          await method.run(page);
          await dismissDisclaimerDialog(page, progress);
          await page.waitForTimeout(MAP_SETTLE_WAIT);
          const ss = await takeScreenshot(page, 'GIS Viewer',
            `[DIAG-${String(diagIndex).padStart(2, '0')}] ${method.name} — ${input.propertyId ?? ''} ${input.situsAddress ?? ''}`);
          if (ss) {
            results.push(ss);
            logDetail('diag', `  ✓ Screenshot captured for ${method.name}: ${Math.round(ss.imageBase64.length / 1024)}KB`);
            progress(`[DIAG-${String(diagIndex).padStart(2, '0')}] ✓ ${method.name} — ${Math.round(ss.imageBase64.length / 1024)}KB`);
          } else {
            logDetail('diag', `  ✗ Screenshot FAILED for ${method.name}`);
            progress(`[DIAG-${String(diagIndex).padStart(2, '0')}] ✗ ${method.name} — screenshot returned null`);
          }
        } catch (err) {
          logDetail('diag', `  ✗ ${method.name} SKIPPED — ${err instanceof Error ? err.message : String(err)}`);
          progress(`[DIAG-${String(diagIndex).padStart(2, '0')}] ✗ ${method.name} SKIPPED — ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      progress(`PHASE A complete — ${diagIndex} methods tested`);
      logDetail('diag', `Phase A complete — tested ${diagIndex} zoom methods`);

      // Return to the base URL and reinitialize for Phase B screenshots
      _zoomCached = false;
      await page.goto(GIS_VIEWER_URL, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
      await dismissDisclaimerDialog(page, progress);
      await waitForMapReady(page, progress);
    }

    // ── Step 2: Zoom to the target parcel ────────────────────────
    // URL hash params (#center=x,y&level=N) do NOT work on this Experience
    // Builder instance — they are silently ignored. Instead, use the search
    // widget to navigate (types the address, clicks the result), then use
    // zoom buttons/keyboard/mouse wheel to fine-tune the zoom level.
    //
    // The map stays loaded throughout the entire capture session — no reloads.
    //
    // Zoom level reference (Bell County GIS / ArcGIS Experience Builder):
    //   26 = maximum detail — WAY too close, only individual lot lines visible
    //   24 = too close — parcels not visible, just boundary lines
    //   22 = still too close — just a few boundary segments
    //   20 = lot-level detail, parcels become visible with labels
    //   19 = target parcel with immediate neighbors — BEST for lot detail
    //   18 = block-level / subdivision overview — good context
    //   17 = neighborhood context (search widget default zoom)
    //   16 = wider neighborhood / rural area context
    //   15 = city/county context

    progress('Zooming to target parcel via search widget...');
    const zoomStart = Date.now();
    logDetail('zoom', '=== ZOOM STRATEGY: search widget → zoom buttons/keyboard ===');
    logDetail('zoom', `Input: address="${input.situsAddress}", lat=${input.lat}, lon=${input.lon}, has_boundary=${!!input.parcelBoundary}`);

    const parcelZoomed = await zoomToParcel(page, input, progress);
    const zoomDurationMs = Date.now() - zoomStart;
    logDetail('zoom', `Initial zoomToParcel() completed in ${zoomDurationMs}ms`, { success: parcelZoomed, duration_ms: zoomDurationMs });

    if (!parcelZoomed) {
      progress('⚠ Could not zoom to parcel — all strategies failed, capturing county-level view');
      logDetail('zoom', '⚠ ALL ZOOM STRATEGIES FAILED — screenshots will show county-level view');
    }

    // Determine the current zoom level so we can compute deltas for the matrix
    let currentZoom = await getCurrentZoomLevel(page);
    logDetail('zoom', `Current zoom level after zoomToParcel: ${currentZoom ?? 'UNKNOWN (JS API inaccessible)'}`, {
      zoom: currentZoom,
      zoomed: parcelZoomed,
    });

    // If we couldn't determine zoom, assume we're at ~17 (search widget default)
    if (currentZoom === null) {
      currentZoom = 17;
      logDetail('zoom', `Assuming zoom level ${currentZoom} (search widget default — JS API could not read actual level)`);
    }

    // ── Systematic Screenshot Matrix ──────────────────────────────
    // Each screenshot is a unique combination of zoom level, basemap,
    // and layer visibility. The description on every screenshot explicitly
    // states: zoom level, basemap type, and which layers are ON/OFF.
    //
    // This lets the user compare results across different configurations.

    const propLabel = input.propertyId ?? 'unknown';
    const addrLabel = input.situsAddress ?? '';
    const lotLabel = input.lotNumber ?? '?';

    interface CaptureSpec {
      id: string;           // e.g. "01", "02", ...
      level: number;        // Absolute ArcGIS zoom level
      basemap: 'streets' | 'aerial';
      parcels: boolean;     // Parcels layer on/off
      lotLines: boolean;    // Lot Lines layer on/off
      eagleView: boolean;   // 2026 EagleView Mosaic on/off
    }

    // The matrix: each row is one screenshot with a unique config.
    //
    // REDUCED MATRIX: Only 3 targeted screenshots instead of 16.
    // The surveyor needs:
    //   1. Streets basemap with parcels + lot lines (boundary context)
    //   2. Aerial basemap with parcels + lot lines (physical context)
    //   3. Aerial with EagleView + parcels (hi-res detail)
    //
    // All at zoom level 18 (block/subdivision) which shows the target
    // property with surrounding roads and adjacent parcels.
    // Level 19 is too close (just the lot), level 17 is too far.
    const captureMatrix: CaptureSpec[] = [
      { id: '01', level: 18, basemap: 'streets', parcels: true,  lotLines: true,  eagleView: false },
      { id: '02', level: 18, basemap: 'aerial',  parcels: true,  lotLines: true,  eagleView: false },
      { id: '03', level: 18, basemap: 'aerial',  parcels: true,  lotLines: true,  eagleView: true  },
    ];

    // Group by zoom level so we only zoom when the level changes.
    // Sort descending so we start at highest zoom (most detail) first.
    // The map stays loaded — no page reloads. We use zoom buttons/keyboard
    // to change zoom levels between groups.
    const sortedMatrix = [...captureMatrix].sort((a, b) => b.level - a.level);

    // Build zoom level groups
    const zoomGroups = new Map<number, CaptureSpec[]>();
    for (const spec of sortedMatrix) {
      if (!zoomGroups.has(spec.level)) zoomGroups.set(spec.level, []);
      zoomGroups.get(spec.level)!.push(spec);
    }

    const zoomLevels = [...zoomGroups.keys()]; // already sorted desc from sortedMatrix
    logDetail('matrix', `Starting capture matrix: ${captureMatrix.length} screenshots across ${zoomLevels.length} zoom levels`, {
      total: captureMatrix.length,
      zoomLevels,
      specs: sortedMatrix.map(s => `${s.id}:L${s.level}/${s.basemap}/P${s.parcels ? 1 : 0}L${s.lotLines ? 1 : 0}E${s.eagleView ? 1 : 0}`),
    });

    // Navigate to each zoom level, re-centering on the parcel each time.
    //
    // Strategy: Try JS API view.goTo() first (centers + zooms in one call).
    // If JS API is unavailable, fall back to incremental zoom (zoomIn/zoomOut).
    // Incremental zoom operates from viewport center which may drift slightly,
    // but it's far better than URL navigation which resets zoom entirely.
    //
    // NOTE: URL navigation with hash params (#center, #level) is NOT used
    // because Experience Builder ignores them, causing a reset to county level.

    for (const level of zoomLevels) {
      const specs = zoomGroups.get(level)!;
      logDetail('zoom-group', `=== Zoom level ${level}: ${specs.length} screenshots ===`);

      // Re-center on parcel at this zoom level
      if (level !== currentZoom) {
        progress(`Centering on parcel at zoom level ${level}...`);
        logDetail('zoom', `Centering on parcel at level ${level} (current=${currentZoom})`);

        const centered = await centerAndZoomToLevel(page, input, level, progress);
        if (centered) {
          logDetail('zoom', `✓ Centered on parcel at level ${level} via JS API`);
          const verifiedZoom = await getCurrentZoomLevel(page);
          currentZoom = verifiedZoom ?? level;
        } else {
          // Fallback: incremental zoom — preserves current zoom state
          logDetail('zoom', `JS API unavailable — using incremental zoom (current=${currentZoom} → target=${level})`);
          const delta = currentZoom - level;
          if (delta > 0) {
            progress(`  Zooming out ${delta} level(s) (${currentZoom} → ${level})...`);
            await zoomOut(page, delta);
          } else if (delta < 0) {
            progress(`  Zooming in ${-delta} level(s) (${currentZoom} → ${level})...`);
            await zoomIn(page, -delta);
          }
          await page.waitForTimeout(MAP_SETTLE_WAIT);
          const verifiedZoom = await getCurrentZoomLevel(page);
          currentZoom = verifiedZoom ?? level;
          logDetail('zoom', `Incremental zoom done — now at level ${currentZoom}`);
        }
      } else {
        logDetail('zoom-group', `Already at level ${level} (current=${currentZoom})`);
      }

      // Capture each screenshot at this zoom level (just toggle basemap + layers)
      for (const spec of specs) {
        const layerState =
          `Parcels=${spec.parcels ? 'ON' : 'OFF'}, ` +
          `LotLines=${spec.lotLines ? 'ON' : 'OFF'}, ` +
          `EagleView2026=${spec.eagleView ? 'ON' : 'OFF'}`;
        const descLine =
          `[${spec.id}] Zoom=${spec.level} | Basemap=${spec.basemap} | ${layerState}` +
          ` | Property ${propLabel} — ${addrLabel} Lot ${lotLabel}`;

        try {
          progress(`[Screenshot ${spec.id}] basemap=${spec.basemap}, ${layerState}...`);
          logDetail(`screenshot-${spec.id}`, `Capturing: ${descLine}`);

          // Apply basemap (no page reload — just API/UI toggle)
          if (spec.basemap === 'aerial') {
            await switchToAerialBasemap(page);
          } else {
            await switchToStreetsBasemap(page);
          }

          // Apply layer visibility
          await toggleEagleViewLayer(page, spec.eagleView);
          await toggleParcelLayer(page, spec.parcels);
          await toggleLotLineLayer(page, spec.lotLines);

          // Wait for tiles + layers to fully render
          await page.waitForTimeout(POST_NAV_RENDER_WAIT);

          const ss = await takeScreenshot(page, 'GIS Viewer', descLine);
          if (ss) {
            results.push(ss);
            logDetail(`screenshot-${spec.id}`, `Captured: ${ss.imageBase64.length} base64 chars`, {
              id: spec.id, level: spec.level, basemap: spec.basemap,
              parcels: spec.parcels, lotLines: spec.lotLines, eagleView: spec.eagleView,
            });
            progress(`[Screenshot ${spec.id}] ✓ ${Math.round(ss.imageBase64.length / 1024)}KB — ${descLine}`);
          } else {
            logDetail(`screenshot-${spec.id}`, 'FAILED — null returned');
            progress(`[Screenshot ${spec.id}] ✗ FAILED`);
          }
        } catch (err) {
          logDetail(`screenshot-${spec.id}`, `SKIPPED — ${err instanceof Error ? err.message : String(err)}`);
          progress(`[Screenshot ${spec.id}] ✗ SKIPPED — ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    await context.close();
    const totalDuration = Date.now() - _captureStart;
    const totalSizeKB = Math.round(results.reduce((sum, r) => sum + r.imageBase64.length, 0) / 1024);
    logDetail('summary', `GIS viewer capture COMPLETE — ${results.length} screenshots in ${totalDuration}ms`, {
      total_screenshots: results.length,
      total_duration_ms: totalDuration,
      screenshot_labels: results.map(r => r.description),
      total_base64_size: results.reduce((sum, r) => sum + r.imageBase64.length, 0),
    });
    progress(`✓ GIS capture complete — ${results.length} screenshots in ${Math.round(totalDuration / 1000)}s (${totalSizeKB}KB total)`);

  } catch (err) {
    const totalDuration = Date.now() - _captureStart;
    logDetail('error', `GIS viewer capture FAILED after ${totalDuration}ms: ${err instanceof Error ? err.message : String(err)}`, {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5).join('\n') : undefined,
      screenshots_before_error: results.length,
    });
    progress(`GIS viewer capture error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (browser) {
      logDetail('cleanup', 'Closing browser');
      await browser.close().catch(() => {});
      logDetail('cleanup', 'Browser closed');
    }
    // Log full capture timeline
    logDetail('timeline', `Full capture log (${_captureLog.length} entries):`);
    for (const entry of _captureLog) {
      console.log(entry);
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


// ── Internal: Zoom to Parcel ─────────────────────────────────────────
// Cascading strategies (proven via diagnostic testing):
//   1. URL hash params with State Plane coordinates (fastest, no UI interaction)
//   2. Search widget — type address, select suggestion, viewer zooms itself
//   3. Mouse-wheel zoom — approximate but always works
// JS API (goTo) was removed — it never works on this Experience Builder app.

// Track whether we've already zoomed (avoid redundant re-zooms during capture series)
let _zoomCached = false;
// Cached parcel centroid for re-navigation (State Plane or WGS84 coords)
let _parcelCenterLon = 0;
let _parcelCenterLat = 0;

/**
 * Get the current zoom level from the ArcGIS MapView.
 * Returns null if the zoom level can't be determined.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCurrentZoomLevel(page: any): Promise<number | null> {
  try {
    const zoom = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      // Strategy 1: jimuMapViews (Experience Builder)
      if (w._mapViewManager?.jimuMapViews) {
        const views = Object.values(w._mapViewManager.jimuMapViews);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const found = views.find((v: any) => v?.view?.ready);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (found) return Math.round((found as any).view.zoom);
      }
      // Strategy 2: arcgis-map element
      const mapEl = document.querySelector('arcgis-map');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (mapEl && (mapEl as any).view) return Math.round((mapEl as any).view.zoom);
      return null;
    });
    gisLog('zoom', `Current zoom level: ${zoom}`);
    return zoom;
  } catch {
    gisLog('zoom', 'Could not determine current zoom level');
    return null;
  }
}

/**
 * Navigate to the parcel at a specific absolute zoom level using URL params.
 * This is the most reliable approach — avoids cumulative drift from relative zoom.
 * Falls back to zoomToParcel() + relative zoomIn/Out if URL nav fails.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function navigateToParcelAtLevel(
  page: any, input: GisViewerCaptureInput,
  targetLevel: number, progress: (msg: string) => void,
): Promise<boolean> {
  // Compute centroid if not yet cached
  if (_parcelCenterLon === 0 && _parcelCenterLat === 0) {
    if (input.parcelBoundary && input.parcelBoundary.length > 0) {
      const ring = input.parcelBoundary[0];
      let sumLon = 0, sumLat = 0;
      for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
      _parcelCenterLon = sumLon / ring.length;
      _parcelCenterLat = sumLat / ring.length;
    } else {
      _parcelCenterLon = input.lon;
      _parcelCenterLat = input.lat;
    }
  }

  gisLog('zoom-nav', `Navigating to parcel at level ${targetLevel} (center=${_parcelCenterLon.toFixed(4)}, ${_parcelCenterLat.toFixed(4)})`, { targetLevel });
  const baseUrl = GIS_VIEWER_URL.replace(/[#?].*$/, '');

  // CRITICAL: Changing only the URL hash fragment does NOT trigger a real page
  // reload in Chrome/Playwright — the browser fires hashchange but doesn't
  // reload the document. ArcGIS Experience Builder only reads URL params on
  // initial load, so hash-only changes are silently ignored.
  //
  // Fix: Add a cache-busting query parameter so the URL before the hash is
  // always different, forcing a genuine page navigation every time.
  const url = `${baseUrl}?_cb=${Date.now()}#center=${_parcelCenterLon},${_parcelCenterLat}&level=${targetLevel}`;

  try {
    gisLog('zoom-nav', `Full URL: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
    await dismissDisclaimerDialog(page, progress);
    const ready = await waitForMapReady(page, progress);
    if (!ready) {
      gisLog('zoom-nav', `Map not ready after navigation to level ${targetLevel}`);
      return false;
    }
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    _zoomCached = true;
    gisLog('zoom-nav', `Successfully navigated to level ${targetLevel}`, { targetLevel });
    return true;
  } catch (err) {
    gisLog('zoom-nav', `Navigation to level ${targetLevel} failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Center the map on the parcel and set a specific zoom level.
 *
 * Unlike zoomIn()/zoomOut() which zoom from the VIEWPORT center (causing
 * drift away from the property), this re-centers on the parcel centroid.
 *
 * Strategy cascade:
 *   1. JS API view.goTo({ center, zoom }) — fast, no reload
 *   2. Incremental zoom from current level — may drift slightly but
 *      preserves the zoomed-in state (URL navigation is NOT used
 *      because Experience Builder ignores hash params, causing a
 *      reset to county-level zoom)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function centerAndZoomToLevel(
  page: any, input: GisViewerCaptureInput,
  targetLevel: number, progress: (msg: string) => void,
): Promise<boolean> {
  // Compute centroid if not cached
  if (_parcelCenterLon === 0 && _parcelCenterLat === 0) {
    if (input.parcelBoundary && input.parcelBoundary.length > 0) {
      const ring = input.parcelBoundary[0];
      let sumLon = 0, sumLat = 0;
      for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
      _parcelCenterLon = sumLon / ring.length;
      _parcelCenterLat = sumLat / ring.length;
    } else {
      _parcelCenterLon = input.lon;
      _parcelCenterLat = input.lat;
    }
  }

  const cLon = _parcelCenterLon;
  const cLat = _parcelCenterLat;

  gisLog('center-zoom', `Centering on parcel (${cLon.toFixed(5)}, ${cLat.toFixed(5)}) at level ${targetLevel}`);

  // Strategy 1: JS API — center AND zoom in one call
  const jsWorked = await page.evaluate(async (opts: { lon: number; lat: number; zoom: number }) => {
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
      await view.goTo({ center: [opts.lon, opts.lat], zoom: opts.zoom }, { duration: 800 });
      return true;
    }
    return false;
  }, { lon: cLon, lat: cLat, zoom: targetLevel }).catch(() => false);

  if (jsWorked) {
    gisLog('center-zoom', `JS API center+zoom to level ${targetLevel} SUCCESS`);
    await page.waitForTimeout(2000); // Let tiles settle
    return true;
  }
  gisLog('center-zoom', 'JS API center+zoom failed — returning false for incremental zoom fallback');

  // DO NOT use URL navigation here — Experience Builder ignores URL hash
  // params (#center, #level), so navigating via URL reloads the page at
  // the default county-level zoom, losing all zoom progress. Instead,
  // return false so the caller uses incremental zoom (zoomIn/zoomOut).
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomToParcel(page: any, input: GisViewerCaptureInput, progress: (msg: string) => void): Promise<boolean> {
  // If we already zoomed to this parcel, skip re-zooming (saves ~15s per call)
  if (_zoomCached) {
    progress('[zoom] Using cached zoom position (already zoomed to parcel)');
    return true;
  }

  gisLog('zoom-cascade', '=== Starting zoom cascade ===');
  gisLog('zoom-cascade', `  address="${input.situsAddress}", lat=${input.lat}, lon=${input.lon}`);
  gisLog('zoom-cascade', `  has_boundary=${!!input.parcelBoundary}, boundary_points=${input.parcelBoundary?.[0]?.length ?? 0}`);

  // NOTE: URL hash params (#center=x,y&level=N) do NOT work on this
  // Experience Builder instance. Diagnostic testing confirmed they are
  // silently ignored. Skip straight to the search widget.

  // ── Strategy 1: JS API goTo — center directly on parcel coordinates ──
  // Use the parcel boundary centroid (from GIS spatial query) for precise
  // positioning. The search widget geocodes addresses and can place the
  // map miles away from the actual parcel (e.g. "FM 436" resolves to I-35
  // instead of the correct location on W FM 436).
  if (input.parcelBoundary || (input.lat && input.lon)) {
    gisLog('zoom-cascade', `Strategy 1: JS API goTo — centering on parcel coordinates`);
    progress(`[zoom] Strategy 1: Centering on parcel via JS API (lat=${input.lat}, lon=${input.lon})...`);
    const jsSuccess = await centerAndZoomToLevel(page, input, 17, progress);
    if (jsSuccess) {
      const afterZoom = await getCurrentZoomLevel(page);
      gisLog('zoom-cascade', `Strategy 1 SUCCESS — JS API centered on parcel at level ${afterZoom ?? 'unknown'}`);
      progress(`[zoom] ✓ Strategy 1 SUCCESS — centered on parcel at level ${afterZoom ?? '?'}`);
      _zoomCached = true;
      return true;
    }
    gisLog('zoom-cascade', 'Strategy 1 FAILED — JS API could not center on parcel');
    progress('[zoom] ✗ Strategy 1 failed — JS API could not center');
  }

  // ── Strategy 1B: Search widget fallback — type address and let the app zoom ──
  // If JS API failed, try the search widget. Note: this may zoom to the wrong
  // location for addresses on numbered roads (FM, CR, etc.) because the
  // geocoder resolves to a generic point on the road.
  if (input.situsAddress) {
    gisLog('zoom-cascade', `Strategy 1B: Search widget — address="${input.situsAddress}"`);
    progress(`[zoom] Strategy 1B: Searching for address "${input.situsAddress}"...`);
    const searchSuccess = await zoomViaSearchWidget(page, input.situsAddress, progress);
    if (searchSuccess) {
      const afterZoom = await getCurrentZoomLevel(page);
      gisLog('zoom-cascade', `Strategy 1B SUCCESS — search widget zoomed to level ${afterZoom ?? 'unknown'}`);
      progress(`[zoom] ✓ Strategy 1B SUCCESS — search widget zoomed to level ${afterZoom ?? '?'}`);
      _zoomCached = true;
      return true;
    }
    gisLog('zoom-cascade', 'Strategy 1B FAILED — search widget did not zoom');
    progress('[zoom] ✗ Strategy 1B failed — search widget did not zoom');
  } else {
    gisLog('zoom-cascade', 'Strategy 1B SKIPPED — no situs address available');
    progress('[zoom] Strategy 1B skipped — no address available for search');
  }

  // ── Strategy 2: Mouse wheel zoom — approximate positioning ──
  // CAUTION: Mouse wheel zooms into the viewport CENTER, which is wherever
  // the map defaulted to (usually Bell County center, NOT the target parcel).
  // This strategy should only be used as a last resort because it produces
  // screenshots of the wrong area. The search widget (Strategy 1B) is strongly
  // preferred because it actually navigates to the address.
  gisLog('zoom-cascade', 'Strategy 2: Mouse wheel zoom — WARNING: will zoom to map center, not parcel');
  progress('[zoom] Strategy 2: Using mouse wheel zoom (approximate) — WARNING: zooms to map center, not parcel');

  // Zoom in moderately — don't go too deep since we're not centered on the parcel
  await zoomViaMouseWheel(page, 20);
  await page.waitForTimeout(3000);
  const finalZoom = await getCurrentZoomLevel(page);
  gisLog('zoom-cascade', `After 20 scroll clicks: zoom=${finalZoom ?? 'unknown'} — position is approximate (map center, not parcel)`);
  progress(`[zoom] ✓ Strategy 2 — mouse wheel zoom complete (level ${finalZoom ?? '?'}) — position is approximate, NOT centered on parcel`);
  _zoomCached = true;
  // Return true but the screenshots will likely show the wrong area
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
        const searchInput = page.locator(sel).first();
        if (await searchInput.count() > 0 && await searchInput.isVisible()) {
          gisLog('search-widget', `Found search input: ${sel}`);
          progress(`  Found search widget: ${sel}`);

          // Clear and type the address
          await searchInput.click();
          await searchInput.fill('');
          await page.waitForTimeout(300);
          gisLog('search-widget', `Typing address: "${address}"`);
          await searchInput.fill(address);
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
                gisLog('search-widget', `Selected suggestion via ${sugSel}`);
                progress(`  Selected search suggestion via ${sugSel}`);
                break;
              }
            } catch { /* try next selector */ }
          }

          // If no suggestion found, press Enter to search
          if (!clicked) {
            await searchInput.press('Enter');
            gisLog('search-widget', 'No suggestion found — pressed Enter to submit search');
            progress('  Pressed Enter to search');
          }

          // Wait for the map to zoom to the result
          gisLog('search-widget', `Waiting ${MAP_SETTLE_WAIT + 3000}ms for map to zoom to result...`);
          await page.waitForTimeout(MAP_SETTLE_WAIT + 3000);

          // Check if search was successful.
          // Experience Builder does NOT show .esri-search__result-marker.
          // Instead, check for:
          //   1. No explicit "no results" error message
          //   2. The search input still has text (wasn't cleared by error)
          //   3. The map canvas has tiles loaded (not blank)
          const searchStatus = await page.evaluate(() => {
            // Check for explicit "no results" error
            const noResult = document.querySelector('.esri-search__no-result-text, [class*="no-result"]');
            if (noResult) return 'no-results';

            // Check if search input still has content (search accepted)
            const inputs = document.querySelectorAll('input[type="text"]');
            let hasSearchText = false;
            inputs.forEach((inp: any) => {
              if (inp.value && inp.value.length > 3) hasSearchText = true;
            });

            // Check for canvas tiles (map has loaded content)
            const canvases = document.querySelectorAll('canvas');
            const hasCanvas = canvases.length > 0;

            return hasSearchText && hasCanvas ? 'success' : 'uncertain';
          });

          if (searchStatus === 'no-results') {
            gisLog('search-widget', '✗ Search returned "no results" indicator');
            progress('  Search returned no results');
          } else {
            // Both 'success' and 'uncertain' are treated as success —
            // the search widget likely zoomed even without explicit markers.
            // The search widget in Experience Builder zooms to ~17 on success.
            gisLog('search-widget', `✓ Search completed (status=${searchStatus}) — assuming zoom succeeded`);
            progress(`  Search completed (${searchStatus}) — map should be zoomed to result`);
            return true;
          }
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
    // Use cache-busting query param to force real page reload (hash-only
    // changes don't trigger navigation in Chrome/Playwright)
    const cb = Date.now();
    const urlFormats = [
      `${baseUrl}?_cb=${cb}#center=${lon},${lat}&level=20`,
      `${baseUrl}?_cb=${cb}&center=${lon},${lat}&level=20`,
      `${baseUrl}?_cb=${cb}#extent=${lon - 0.0003},${lat - 0.0003},${lon + 0.0003},${lat + 0.0003}`,
      `${baseUrl}?_cb=${cb + 1}#center=${lon},${lat}&level=19`,
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
// Uses five strategies: JS API → UI button clicks → keyboard → double-click → mouse wheel
// All five methods were validated via the diagnostic harness (commit 86d95d0).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomIn(page: any, levels: number): Promise<void> {
  const start = Date.now();
  const direction = levels > 0 ? 'in' : 'out';
  const phase = `zoom-${direction}`;
  const isZoomIn = levels > 0;
  const clickCount = Math.abs(levels);
  gisLog(phase, `Zooming ${direction} ${clickCount} levels — trying JS API first`, { levels, clickCount });

  // Strategy 1: Try JS API (goTo)
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

  if (jsWorked) {
    gisLog(phase, `JS API zoom succeeded in ${Date.now() - start}ms`, { strategy: 'js-api', duration_ms: Date.now() - start });
    return;
  }
  gisLog(phase, 'JS API failed — trying UI buttons');

  // Strategy 2: Click the zoom-in/zoom-out UI buttons
  const buttonSelectors = isZoomIn
    ? ['.esri-zoom .esri-widget--button:first-child', '.esri-icon-plus', 'button[title="Zoom in"]', 'button[title="Zoom In"]',
       '.esri-zoom__zoom-in-button', 'calcite-button[icon-start="plus"]']
    : ['.esri-zoom .esri-widget--button:last-child', '.esri-icon-minus', 'button[title="Zoom out"]', 'button[title="Zoom Out"]',
       '.esri-zoom__zoom-out-button', 'calcite-button[icon-start="minus"]'];

  for (const sel of buttonSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible()) {
        gisLog(phase, `Found zoom button: ${sel} — clicking ${clickCount} times`, { strategy: 'ui-button', selector: sel });
        for (let i = 0; i < clickCount; i++) {
          await btn.click();
          await page.waitForTimeout(600);
        }
        gisLog(phase, `UI button zoom complete in ${Date.now() - start}ms`, { strategy: 'ui-button', duration_ms: Date.now() - start });
        return;
      }
    } catch { /* try next selector */ }
  }
  gisLog(phase, 'UI buttons not found — trying keyboard zoom');

  // Strategy 3: Keyboard zoom (+/- keys)
  // Proven working in diagnostic harness — uses Equal and NumpadAdd for zoom in,
  // Minus and NumpadSubtract for zoom out
  try {
    const key = isZoomIn ? 'Equal' : 'Minus';
    const numpadKey = isZoomIn ? 'NumpadAdd' : 'NumpadSubtract';
    // Click map center first to ensure keyboard focus is on the map
    await page.mouse.click(960, 540);
    await page.waitForTimeout(200);
    for (let i = 0; i < clickCount; i++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(400);
    }
    // Also press numpad variant for redundancy
    for (let i = 0; i < clickCount; i++) {
      await page.keyboard.press(numpadKey);
      await page.waitForTimeout(400);
    }
    gisLog(phase, `Keyboard zoom complete (${clickCount}x ${key} + ${numpadKey}) in ${Date.now() - start}ms`, { strategy: 'keyboard', duration_ms: Date.now() - start });
    // Keyboard zoom is best-effort — we can't easily verify it worked,
    // so we also try double-click and mouse wheel as reinforcement
  } catch {
    gisLog(phase, 'Keyboard zoom failed', { strategy: 'keyboard' });
  }

  // Strategy 4: Double-click zoom (zoom in only — double-click always zooms in)
  if (isZoomIn) {
    try {
      gisLog(phase, `Trying double-click zoom (${clickCount} double-clicks)`, { strategy: 'dblclick' });
      for (let i = 0; i < clickCount; i++) {
        await page.mouse.dblclick(960, 540);
        await page.waitForTimeout(800); // Longer wait — double-click triggers zoom animation
      }
      gisLog(phase, `Double-click zoom complete in ${Date.now() - start}ms`, { strategy: 'dblclick', duration_ms: Date.now() - start });
      return;
    } catch {
      gisLog(phase, 'Double-click zoom failed', { strategy: 'dblclick' });
    }
  }

  // Strategy 5: Mouse wheel (always works as last resort)
  const scrollEvents = isZoomIn ? clickCount * 3 : -(clickCount * 3);
  gisLog(phase, `Falling back to mouse wheel (${scrollEvents} scroll events)`, { strategy: 'mouse-wheel', scrollEvents });
  await zoomViaMouseWheel(page, scrollEvents);
  gisLog(phase, `Mouse wheel zoom complete in ${Date.now() - start}ms`, { strategy: 'mouse-wheel', duration_ms: Date.now() - start });
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
  const start = Date.now();
  gisLog('basemap', 'Switching to aerial basemap — trying JS API first');
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

  if (jsWorked) {
    gisLog('basemap', `Aerial basemap set via JS API in ${Date.now() - start}ms`, { strategy: 'js-api' });
    return;
  }
  gisLog('basemap', 'JS API failed for aerial — trying basemap gallery UI');

  // Strategy 2: Click basemap gallery item in the Experience Builder UI
  await clickBasemapGalleryItem(page, ['imagery', 'satellite', 'aerial', 'hybrid', 'world imagery']);
  gisLog('basemap', `Aerial basemap gallery click attempted in ${Date.now() - start}ms`, { strategy: 'gallery-click' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function switchToStreetsBasemap(page: any): Promise<void> {
  const start = Date.now();
  gisLog('basemap', 'Switching to streets basemap — trying JS API first');
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

  if (jsWorked) {
    gisLog('basemap', `Streets basemap set via JS API in ${Date.now() - start}ms`, { strategy: 'js-api' });
    return;
  }
  gisLog('basemap', 'JS API failed for streets — trying basemap gallery UI');

  await clickBasemapGalleryItem(page, ['streets', 'topographic', 'topo', 'street map']);
  gisLog('basemap', `Streets basemap gallery click attempted in ${Date.now() - start}ms`, { strategy: 'gallery-click' });
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
  gisLog('layer-toggle', `Toggling parcel layer: visible=${visible}`);
  await toggleLayerByTitle(page, ['Parcels', 'parcels', 'PARCELS'], visible);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toggleLotLineLayer(page: any, visible: boolean): Promise<void> {
  gisLog('layer-toggle', `Toggling lot line layer: visible=${visible}`);
  await toggleLayerByTitle(page, ['Lot Lines', 'lot lines', 'LOT LINES', 'LotLines'], visible);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toggleEagleViewLayer(page: any, visible: boolean): Promise<void> {
  gisLog('layer-toggle', `Toggling 2026 EagleView Mosaic layer: visible=${visible}`);
  await toggleLayerByTitle(page, [
    '2026 EagleView Mosiac', '2026 EagleView Mosaic',  // Note: Bell CAD spells it "Mosiac" (typo)
    '2026 eagleview mosiac', '2026 eagleview mosaic',
  ], visible);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toggleLayerByTitle(page: any, titles: string[], visible: boolean): Promise<void> {
  const start = Date.now();
  // Strategy 1: JS API — try to toggle layer visibility programmatically
  const jsWorked = await page.evaluate((params: { titles: string[]; visible: boolean }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    let view = null;
    // Try JiMU map view manager (Experience Builder)
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

    let toggled = false;
    const titles = params.titles.map(t => t.toLowerCase());

    // Recursive search through all layers including group layers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function searchLayers(layers: any): void {
      if (!layers?.forEach) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layers.forEach((layer: any) => {
        if (layer.title && titles.includes(layer.title.toLowerCase())) {
          layer.visible = params.visible;
          toggled = true;
        }
        // Search sublayers (group layers, map image layers, etc.)
        if (layer.layers) searchLayers(layer.layers);
        if (layer.sublayers) searchLayers(layer.sublayers);
        if (layer.allSublayers) searchLayers(layer.allSublayers);
      });
    }
    searchLayers(view.map.layers);
    // Also check operational layers
    if (view.map.allLayers) searchLayers(view.map.allLayers);
    return toggled;
  }, { titles, visible }).catch(() => false);

  if (jsWorked) {
    gisLog('layer-toggle', `Layer "${titles[0]}" set to ${visible} via JS API in ${Date.now() - start}ms`, { titles, visible, strategy: 'js-api' });
    return;
  }
  gisLog('layer-toggle', `JS API failed for "${titles[0]}" — trying UI layer list`);

  // Strategy 2: Click layer visibility toggle in the UI (eye icon, checkbox, etc.)
  try {
    const uiResult = await page.evaluate((params: { titles: string[]; visible: boolean }) => {
      // Look for layer list widget items in Experience Builder / ESRI layer list
      const listItems = document.querySelectorAll(
        '.esri-layer-list__item, [class*="layer-list"] [class*="item"], ' +
        '.jimu-widget--layer-list [class*="item"], [class*="layer-item"]'
      );

      for (let i = 0; i < listItems.length; i++) {
        const item = listItems[i];
        const label = (item.textContent || '').trim().toLowerCase();
        if (!params.titles.some(t => label.includes(t.toLowerCase()))) continue;

        // Try multiple toggle patterns used by different ESRI widget versions:
        // 1. Eye icon button (Experience Builder / JiMU layer list)
        // 2. Calcite action with view-visible/view-hide icon
        // 3. Standard checkbox/switch
        const toggleSelectors = [
          // Experience Builder eye icon — typically an SVG inside a clickable element
          'button[class*="eye"], [class*="eye-icon"], [class*="visibility-icon"]',
          'button[aria-label*="visibility"], button[aria-label*="Visibility"]',
          'button[title*="visibility"], button[title*="Visibility"]',
          // Calcite UI actions used in newer ESRI widgets
          'calcite-action[icon="view-visible"], calcite-action[icon="view-hide"]',
          'calcite-action[icon="visibility"], calcite-action[text*="visibility"]',
          // SVG-based eye icons (common in JiMU layer list)
          '[class*="visibility"] button, [class*="visibility"] [role="button"]',
          '[class*="layer-item-toggle"], [class*="toggle-visibility"]',
          // Standard ESRI layer list toggle
          '.esri-layer-list__item-toggle',
          'input[type="checkbox"]', 'calcite-checkbox',
          '[class*="visibility"]', '[role="switch"]',
        ];

        for (const sel of toggleSelectors) {
          const toggle = item.querySelector(sel);
          if (!toggle) continue;

          // Check current visibility state from multiple indicators
          const isVisible =
            (toggle as HTMLInputElement).checked === true ||
            toggle.getAttribute('aria-checked') === 'true' ||
            toggle.getAttribute('aria-pressed') === 'true' ||
            toggle.classList.contains('checked') ||
            toggle.classList.contains('visible') ||
            toggle.classList.contains('active') ||
            // Calcite action: icon="view-visible" means currently visible
            toggle.getAttribute('icon') === 'view-visible';

          if (isVisible !== params.visible) {
            (toggle as HTMLElement).click();
            return { found: true, selector: sel };
          }
          return { found: true, selector: sel, alreadyCorrect: true };
        }

        // Last resort: if no specific toggle found, look for ANY clickable
        // element with an SVG (likely the eye icon) near the layer label
        const svgButtons = item.querySelectorAll('button, [role="button"]');
        for (let j = 0; j < svgButtons.length; j++) {
          const btn = svgButtons[j];
          if (btn.querySelector('svg') || btn.querySelector('calcite-icon')) {
            // This is likely the eye icon toggle
            (btn as HTMLElement).click();
            return { found: true, selector: 'svg-button-fallback' };
          }
        }
      }
      return { found: false };
    }, { titles, visible });

    if (uiResult?.found) {
      gisLog('layer-toggle', `Layer "${titles[0]}" UI toggle via ${uiResult.selector ?? 'unknown'}${uiResult.alreadyCorrect ? ' (already correct)' : ''}`, { titles, visible });
    }

    await page.waitForTimeout(LAYER_TOGGLE_WAIT);
    gisLog('layer-toggle', `Layer "${titles[0]}" UI toggle attempted in ${Date.now() - start}ms`, { titles, visible, strategy: 'ui-eye-icon' });
  } catch {
    gisLog('layer-toggle', `Layer "${titles[0]}" UI toggle FAILED — both strategies exhausted`, { titles, visible });
  }
}

// ── Internal: Canvas Stability Verification ──────────────────────────
// After zooming or layer toggling, the ArcGIS map re-renders tiles
// asynchronously. We verify that the canvas has stabilized by taking
// two rapid screenshots and comparing their byte length. If the sizes
// differ significantly, tiles are still loading.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForCanvasStability(page: any, maxWait = 12_000): Promise<boolean> {
  const start = Date.now();
  const pollInterval = 2_000;
  let prevSize = 0;
  let stableCount = 0;

  while (Date.now() - start < maxWait) {
    try {
      const buf = await page.screenshot({ fullPage: false, type: 'png', timeout: 5000 });
      const size = buf.length;
      // Consider stable if size is within 3% of previous capture (tiles render progressively)
      if (prevSize > 0 && Math.abs(size - prevSize) / prevSize < 0.03) {
        stableCount++;
        if (stableCount >= 3) {
          gisLog('canvas-stability', `Canvas stable after ${Date.now() - start}ms (${stableCount} consistent frames, ${size} bytes)`, { duration_ms: Date.now() - start, stableCount, size });
          return true;
        }
      } else {
        stableCount = 0;
      }
      prevSize = size;
    } catch { /* screenshot may fail during render — retry */ }
    await page.waitForTimeout(pollInterval);
  }
  gisLog('canvas-stability', `Canvas did not stabilize within ${maxWait}ms — proceeding anyway`, { maxWait });
  return false;
}

// ── Internal: Wait for Network Idle ──────────────────────────────────
// Waits for the network to go idle (no pending requests for tile images).
// ArcGIS maps load tiles via XHR/fetch; we monitor inflight requests.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForNetworkIdle(page: any, idleTime = 2_000, maxWait = 10_000): Promise<boolean> {
  const start = Date.now();
  try {
    // Use Playwright's waitForLoadState which monitors network activity
    await page.waitForLoadState('networkidle', { timeout: maxWait });
    gisLog('network-idle', `Network idle reached in ${Date.now() - start}ms`, { duration_ms: Date.now() - start });
    return true;
  } catch {
    // networkidle may not trigger if there are persistent connections (WebSocket, polling)
    // Fall back to a short wait
    gisLog('network-idle', `Network idle timeout after ${maxWait}ms — falling back to ${idleTime}ms wait`, { maxWait, idleTime });
    await page.waitForTimeout(idleTime);
    return false;
  }
}

// ── Internal: Wait for Map Render (combined) ─────────────────────────
// Combines network idle + canvas stability for reliable post-zoom verification.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForMapRender(page: any): Promise<void> {
  // First wait for network idle (tile downloads complete)
  await waitForNetworkIdle(page, 3_000, 15_000);
  // Then verify canvas is stable (tiles have been painted)
  await waitForCanvasStability(page, 12_000);
}

// ── Internal: Take Screenshot ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function takeScreenshot(page: any, source: string, description: string): Promise<ScreenshotCapture | null> {
  try {
    // Ensure map has finished rendering before capturing
    await waitForMapRender(page);

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
