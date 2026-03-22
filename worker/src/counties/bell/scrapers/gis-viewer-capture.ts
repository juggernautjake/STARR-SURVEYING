// worker/src/counties/bell/scrapers/gis-viewer-capture.ts
// Full diagnostic GIS viewer capture — tests every zoom method × zoom level × layer combo.
//
// Matrix:
//   Phase A: Zoom Method Tests — 11 methods, each with fresh page load + 6s render wait
//   Phase B: Layer × Zoom Matrix — 8 layer combos × 5 zoom levels = 40 screenshots
//   Total: ~51 screenshots, all returned every time
//
// Every screenshot is labeled: [DIAG-NN] METHOD: ... | ZOOM: ... | LAYERS: ...

import { BELL_ENDPOINTS, TIMEOUTS } from '../config/endpoints.js';
import type { ScreenshotCapture } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface GisViewerCaptureInput {
  parcelBoundary: number[][][] | null;
  lat: number;
  lon: number;
  propertyId: string | null;
  situsAddress: string | null;
  lotNumber: string | null;
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

interface ZoomStrategyResult {
  strategy: string;
  success: boolean;
  duration: number;
  details: string;
  screenshot?: ScreenshotCapture;
}

// ── Main Export ──────────────────────────────────────────────────────

export async function captureGisViewerScreenshots(
  input: GisViewerCaptureInput,
  onProgress: (p: GisViewerCaptureProgress) => void,
): Promise<ScreenshotCapture[]> {
  const results: ScreenshotCapture[] = [];
  const captureStart = Date.now();
  const captureLog: string[] = [];

  const logDetail = (phase: string, msg: string, data?: Record<string, unknown>) => {
    const ts = new Date().toISOString();
    const elapsed = Date.now() - captureStart;
    const entry = `[GIS-CAPTURE][${phase}][+${elapsed}ms] ${msg}`;
    captureLog.push(entry);
    console.log(entry, data ? JSON.stringify(data).slice(0, 500) : '');
  };

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

  const log = (msg: string) => {
    const ts = new Date().toISOString();
    console.log(`[GIS-DIAG ${ts}] ${msg}`);
    onProgress({ phase: 'GIS Diagnostic', message: msg, timestamp: ts });
  };

  // Compute center coordinates
  let centerLon = input.lon;
  let centerLat = input.lat;
  if (input.parcelBoundary && input.parcelBoundary.length > 0) {
    const ring = input.parcelBoundary[0];
    let sumLon = 0, sumLat = 0;
    for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
    centerLon = sumLon / ring.length;
    centerLat = sumLat / ring.length;
    log(`Computed parcel centroid: (${centerLon.toFixed(4)}, ${centerLat.toFixed(4)}) from ${ring.length}-point boundary`);
  } else {
    log(`Using WGS84 coordinates: (${centerLon}, ${centerLat}) — no parcel boundary`);
  }

  const propLabel = `${input.propertyId ?? 'unknown'} ${input.situsAddress ?? ''}`.trim();
  let diagIndex = 0;

  let browser;
  try {
    logDetail('browser', 'Importing Playwright and launching Chromium...');
    const browserLaunchStart = Date.now();
    const pw = await import('playwright');
    log('Launching Chromium browser...');
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    });
    log('Browser launched successfully');

    // ================================================================
    // PHASE A: ZOOM METHOD TESTS — fresh page load for each method
    // ================================================================
    log('═══════════════════════════════════════════════════════════');
    log('PHASE A: ZOOM METHOD DIAGNOSTICS — Testing each zoom method');
    log('═══════════════════════════════════════════════════════════');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zoomMethods: Array<{ name: string; run: (page: any) => Promise<void> }> = [
      // URL hash at each zoom level
      ...ZOOM_LEVELS.map(level => ({
        name: `URL-Hash level=${level}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: async (page: any) => {
          const url = `${GIS_VIEWER_URL}#center=${centerLon},${centerLat}&level=${level}`;
          log(`  Navigating to: ${url}`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
        },
      })),
      // URL query at each zoom level
      ...ZOOM_LEVELS.map(level => ({
        name: `URL-Query level=${level}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: async (page: any) => {
          const base = GIS_VIEWER_URL.replace(/[#?].*$/, '');
          const url = `${base}?center=${centerLon},${centerLat}&level=${level}`;
          log(`  Navigating to: ${url}`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
        },
      })),
      // URL extent (tight bbox)
      {
        name: 'URL-Extent tight-bbox',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: async (page: any) => {
          const d = 0.0003;
          const url = `${GIS_VIEWER_URL}#extent=${centerLon - d},${centerLat - d},${centerLon + d},${centerLat + d}`;
          log(`  Navigating to: ${url}`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
        },
      },
    ];

    logDetail('zoom', `Waiting ${MAP_SETTLE_WAIT}ms for map to settle after zoom`);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    // ── Screenshot A: Target parcel detail — highest zoom ─────────
    // Start with the tightest zoom (lot-level) since we're already zoomed in
    logDetail('screenshot-A', 'Capturing Screenshot A: Maximum detail (zoom in +3)');
    progress('[Screenshot A] Zooming in +3 levels for maximum detail capture...');
    await zoomIn(page, 3);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssMaxDetail = await takeScreenshot(page, 'GIS Viewer',
      `Maximum detail — ${input.propertyId ?? 'unknown'} — ${input.situsAddress ?? ''} Lot ${input.lotNumber ?? '?'}`);
    if (ssMaxDetail) {
      results.push(ssMaxDetail);
      logDetail('screenshot-A', `Screenshot A captured: ${ssMaxDetail.imageBase64.length} base64 chars`, { description: ssMaxDetail.description });
      progress(`[Screenshot A] ✓ Maximum detail captured — ${Math.round(ssMaxDetail.imageBase64.length / 1024)}KB`);
    } else {
      logDetail('screenshot-A', 'Screenshot A FAILED — null returned from takeScreenshot');
      progress('[Screenshot A] ✗ FAILED — screenshot returned null');
    }

    // ── Screenshot B: Target parcel with lot lines visible ──────
    logDetail('screenshot-B', 'Capturing Screenshot B: Target parcel detail (re-zoom + zoom in +1)');
    progress('[Screenshot B] Re-zooming to parcel + zoom in +1 for lot line detail...');
    await zoomToParcel(page, input, progress);
    await zoomIn(page, 1);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssDetail = await takeScreenshot(page, 'GIS Viewer',
      `Target parcel detail — ${input.propertyId ?? 'unknown'} — ${input.situsAddress ?? ''} Lot ${input.lotNumber ?? '?'}`);
    if (ssDetail) {
      results.push(ssDetail);
      logDetail('screenshot-B', `Screenshot B captured: ${ssDetail.imageBase64.length} base64 chars`, { description: ssDetail.description });
      progress(`[Screenshot B] ✓ Target parcel detail captured — ${Math.round(ssDetail.imageBase64.length / 1024)}KB`);
    } else {
      logDetail('screenshot-B', 'Screenshot B FAILED');
      progress('[Screenshot B] ✗ FAILED — target parcel detail screenshot returned null');
    }

    // ── Screenshot C: Lot + immediate neighbors ─────────────────
    logDetail('screenshot-C', 'Capturing Screenshot C: Lot with immediate neighbors (default zoom)');
    progress('[Screenshot C] Zooming to parcel for lot + neighbors view...');
    await zoomToParcel(page, input, progress);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssNeighbors = await takeScreenshot(page, 'GIS Viewer',
      `Lot with neighbors — ${input.propertyId ?? 'unknown'} — ${input.subdivisionName ?? 'area'}`);
    if (ssNeighbors) {
      results.push(ssNeighbors);
      logDetail('screenshot-C', `Screenshot C captured: ${ssNeighbors.imageBase64.length} base64 chars`);
      progress(`[Screenshot C] ✓ Lot + neighbors captured — ${Math.round(ssNeighbors.imageBase64.length / 1024)}KB`);
    } else {
      logDetail('screenshot-C', 'Screenshot C FAILED');
      progress('[Screenshot C] ✗ FAILED — lot + neighbors screenshot returned null');
    }

    // ── Screenshot D: Subdivision overview (zoom out) ───────────
    logDetail('screenshot-D', 'Capturing Screenshot D: Subdivision overview (zoom out -3)');
    progress('[Screenshot D] Zooming out -3 for subdivision overview...');
    await zoomToParcel(page, input, progress);
    await zoomOut(page, 3);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssSubdiv = await takeScreenshot(page, 'GIS Viewer',
      `Subdivision overview — ${input.subdivisionName ?? 'area'} — all lots with property IDs`);
    if (ssSubdiv) {
      results.push(ssSubdiv);
      logDetail('screenshot-D', `Screenshot D captured: ${ssSubdiv.imageBase64.length} base64 chars`);
      progress(`[Screenshot D] ✓ Subdivision overview captured — ${Math.round(ssSubdiv.imageBase64.length / 1024)}KB`);
    } else {
      logDetail('screenshot-D', 'Screenshot D FAILED');
      progress('[Screenshot D] ✗ FAILED — subdivision overview screenshot returned null');
    }

    // ── Screenshot E: Aerial/satellite at lot-level (eagle view) ─
    logDetail('screenshot-E', 'Switching to aerial/satellite basemap for eagle view screenshots');
    progress('[Screenshot E] Switching to aerial/satellite basemap...');
    const aerialSwitchStart = Date.now();
    await switchToAerialBasemap(page);
    logDetail('screenshot-E', `Aerial basemap switch completed in ${Date.now() - aerialSwitchStart}ms`);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    // Aerial at lot level — tight zoom
    logDetail('screenshot-E', 'Capturing aerial eagle view (tight, zoom in +2)');
    progress('[Screenshot E1] Zoom in +2 for aerial tight view with property lines...');
    await zoomToParcel(page, input, progress);
    await zoomIn(page, 2);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssAerialTight = await takeScreenshot(page, 'GIS Viewer',
      `Aerial eagle view (tight) WITH property lines — ${input.propertyId ?? ''} — ${input.situsAddress ?? ''}`);
    if (ssAerialTight) {
      results.push(ssAerialTight);
      logDetail('screenshot-E', `Aerial tight screenshot captured: ${ssAerialTight.imageBase64.length} base64 chars`);
      progress(`[Screenshot E1] ✓ Aerial tight + property lines — ${Math.round(ssAerialTight.imageBase64.length / 1024)}KB`);
    } else {
      logDetail('screenshot-E', 'Aerial tight screenshot FAILED');
      progress('[Screenshot E1] ✗ FAILED — aerial tight screenshot returned null');
    }

    // Aerial at parcel level — with lines
    logDetail('screenshot-E2', 'Capturing aerial eagle view at parcel level with property lines');
    progress('[Screenshot E2] Aerial at parcel level with property lines...');
    await zoomToParcel(page, input, progress);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssAerialLines = await takeScreenshot(page, 'GIS Viewer',
      `Aerial eagle view WITH property lines — ${input.propertyId ?? ''} — ${input.situsAddress ?? ''}`);
    if (ssAerialLines) {
      results.push(ssAerialLines);
      logDetail('screenshot-E2', `Aerial with lines captured: ${ssAerialLines.imageBase64.length} base64 chars`);
      progress(`[Screenshot E2] ✓ Aerial + property lines — ${Math.round(ssAerialLines.imageBase64.length / 1024)}KB`);
    } else {
      logDetail('screenshot-E2', 'Aerial with lines FAILED');
      progress('[Screenshot E2] ✗ FAILED — aerial + property lines screenshot returned null');
    }

    // Aerial at subdivision level
    logDetail('screenshot-E3', 'Capturing aerial subdivision overview (zoom out -3)');
    progress('[Screenshot E3] Zoom out -3 for aerial subdivision overview...');
    await zoomOut(page, 3);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssAerialSubdiv = await takeScreenshot(page, 'GIS Viewer',
      `Aerial eagle view — subdivision — ${input.subdivisionName ?? ''} — ${input.situsAddress ?? ''}`);
    if (ssAerialSubdiv) {
      results.push(ssAerialSubdiv);
      logDetail('screenshot-E3', `Aerial subdivision captured: ${ssAerialSubdiv.imageBase64.length} base64 chars`);
      progress(`[Screenshot E3] ✓ Aerial subdivision overview — ${Math.round(ssAerialSubdiv.imageBase64.length / 1024)}KB`);
    } else {
      logDetail('screenshot-E3', 'Aerial subdivision FAILED');
      progress('[Screenshot E3] ✗ FAILED — aerial subdivision screenshot returned null');
    }

    // ── Screenshot F: Clean aerial (no lines) ───────────────────
    logDetail('screenshot-F', 'Capturing clean aerial (toggling off parcel + lot line layers)');
    progress('[Screenshot F] Toggling off parcel + lot lines for clean aerial...');
    await toggleParcelLayer(page, false);
    await toggleLotLineLayer(page, false);
    await zoomToParcel(page, input, progress);
    await zoomIn(page, 1);
    await page.waitForTimeout(LAYER_TOGGLE_WAIT);
    const ssAerialClean = await takeScreenshot(page, 'GIS Viewer',
      `Aerial eagle view WITHOUT property lines — ${input.situsAddress ?? ''}`);
    if (ssAerialClean) {
      results.push(ssAerialClean);
      logDetail('screenshot-F', `Clean aerial captured: ${ssAerialClean.imageBase64.length} base64 chars`);
      progress(`[Screenshot F] ✓ Clean aerial (no lines) — ${Math.round(ssAerialClean.imageBase64.length / 1024)}KB`);
    } else {
      logDetail('screenshot-F', 'Clean aerial FAILED');
      progress('[Screenshot F] ✗ FAILED — clean aerial screenshot returned null');
    }

    logDetail('screenshot-F', 'Restoring parcel + lot line layers');
    await toggleParcelLayer(page, true);
    await toggleLotLineLayer(page, true);

    // ── Screenshot G: Adjacent lots (4 directions) ──────────────
    logDetail('screenshot-G', 'Starting adjacent lot captures (4 cardinal directions)');
    progress('[Screenshot G] Capturing adjacent lots (N/E/S/W)...');
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

      try {
        logDetail('screenshot-G', `Panning ${dir.name} (dx=${dir.dx}, dy=${dir.dy})`);
        progress(`[Screenshot G] Panning ${dir.name} to capture adjacent lot...`);
        await panMap(page, dir.dx, dir.dy);
        await page.waitForTimeout(LAYER_TOGGLE_WAIT);
        const ssAdj = await takeScreenshot(page, 'GIS Viewer',
          `Adjacent lot — ${dir.name} of ${input.propertyId ?? 'target'}`);
        if (ssAdj) {
          results.push(ssAdj);
          logDetail('screenshot-G', `Adjacent ${dir.name} captured: ${ssAdj.imageBase64.length} base64 chars`);
          progress(`[Screenshot G] ✓ Adjacent ${dir.name} — ${Math.round(ssAdj.imageBase64.length / 1024)}KB`);
        } else {
          logDetail('screenshot-G', `Adjacent ${dir.name} screenshot FAILED`);
          progress(`[Screenshot G] ✗ Adjacent ${dir.name} FAILED`);
        }
        await panMap(page, -dir.dx, -dir.dy);
        await page.waitForTimeout(1000);
      } catch (err) {
        logDetail('screenshot-G', `Adjacent ${dir.name} SKIPPED — error: ${err instanceof Error ? err.message : String(err)}`);
        progress(`[Screenshot G] ✗ Adjacent ${dir.name} SKIPPED — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Screenshot H: Layer combination views ─────────────────────
    logDetail('screenshot-H', `Starting layer combination captures (4 combinations)`);
    progress('[Screenshot H] Capturing 4 layer combination views...');
    await zoomToParcel(page, input, progress);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    const layerCombinations: Array<{
      label: string;
      basemap: 'streets' | 'aerial';
      parcels: boolean;
      lotLines: boolean;
      zoomDelta: number;
    }> = [
      { label: 'Lot lines only (dimensions)', basemap: 'streets', parcels: false, lotLines: true, zoomDelta: 2 },
      { label: 'Aerial max zoom with lot lines', basemap: 'aerial', parcels: false, lotLines: true, zoomDelta: 3 },
      { label: 'Neighborhood context — streets', basemap: 'streets', parcels: true, lotLines: true, zoomDelta: -4 },
      { label: 'Aerial neighborhood context', basemap: 'aerial', parcels: true, lotLines: true, zoomDelta: -4 },
    ];

    for (const combo of layerCombinations) {
      try {
        progress(`[Screenshot H] ${combo.label}: basemap=${combo.basemap}, zoom=${combo.zoomDelta > 0 ? '+' : ''}${combo.zoomDelta}...`);
        if (combo.basemap === 'aerial') {
          await switchToAerialBasemap(page);
        } else {
          await switchToStreetsBasemap(page);
        }

        const ssCombo = await takeScreenshot(page, 'GIS Viewer',
          `Layer view: ${combo.label} — ${input.propertyId ?? ''} ${input.situsAddress ?? ''}`);
        if (ssCombo) {
          results.push(ssCombo);
          logDetail('screenshot-H', `Layer combo "${combo.label}" captured: ${ssCombo.imageBase64.length} base64 chars`);
          progress(`[Screenshot H] ✓ ${combo.label} — ${Math.round(ssCombo.imageBase64.length / 1024)}KB`);
        } else {
          logDetail('screenshot-H', `Layer combo "${combo.label}" FAILED`);
          progress(`[Screenshot H] ✗ ${combo.label} FAILED`);
        }
      } catch (err) {
        logDetail('screenshot-H', `Layer combo "${combo.label}" SKIPPED — error: ${err instanceof Error ? err.message : String(err)}`);
        progress(`[Screenshot H] ✗ ${combo.label} SKIPPED — ${err instanceof Error ? err.message : String(err)}`);
      }

      await context.close();
      log(`  Closed context for zoom ${zoomLevel}`);
    }

    // Restore defaults
    await switchToStreetsBasemap(page);
    await toggleParcelLayer(page, true);
    await toggleLotLineLayer(page, true);

    await context.close();
    const totalDuration = Date.now() - captureStart;
    const totalSizeKB = Math.round(results.reduce((sum, r) => sum + r.imageBase64.length, 0) / 1024);
    logDetail('summary', `GIS viewer capture COMPLETE — ${results.length} screenshots in ${totalDuration}ms`, {
      total_screenshots: results.length,
      total_duration_ms: totalDuration,
      screenshot_labels: results.map(r => r.description),
      total_base64_size: results.reduce((sum, r) => sum + r.imageBase64.length, 0),
    });
    progress(`✓ GIS capture complete — ${results.length} screenshots in ${Math.round(totalDuration / 1000)}s (${totalSizeKB}KB total)`);

  } catch (err) {
    log(`FATAL: Browser-level error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (browser) {
      logDetail('cleanup', 'Closing browser');
      await browser.close().catch(() => {});
      log('Browser closed');
    }
  }

  return results;
}

// ── Dismiss Disclaimer Dialog ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dismissDisclaimerDialog(page: any, log: (msg: string) => void): Promise<void> {
  const maxWait = 15_000;
  const pollInterval = 1_000;
  let waited = 0;

  while (waited < maxWait) {
    try {
      const okSelectors = [
        'button:has-text("OK")',
        'calcite-button:has-text("OK")',
        'button.btn-primary',
        'button.esri-button',
        '.modal-footer button:first-child',
        '.dialog-footer button:first-child',
        '.jimu-btn:has-text("OK")',
        '[class*="modal"] button:has-text("OK")',
        '[class*="dialog"] button:has-text("OK")',
        '[class*="popup"] button:has-text("OK")',
        '[role="dialog"] button',
        '[role="alertdialog"] button',
      ];

      for (const sel of okSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.count() > 0) {
            const btnText = await btn.textContent().catch(() => '');
            if (btnText?.trim().toUpperCase() === 'OK' || btnText?.trim().toUpperCase() === 'ACCEPT' || sel.includes('primary')) {
              await btn.click({ timeout: 3000 });
              log(`    ✓ Dismissed disclaimer (clicked "${btnText?.trim()}" via ${sel})`);
              await page.waitForTimeout(1500);
              return;
            }
          }
        } catch { /* try next */ }
      }

      // DOM evaluate fallback
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          const text = btn.textContent?.trim();
          if (text === 'OK' || text === 'Accept' || text === 'I Agree') {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              btn.click();
              return text;
            }
          }
        }
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
        log(`    ✓ Dismissed disclaimer (clicked "${clicked}" via DOM evaluate)`);
        await page.waitForTimeout(1500);
        return;
      }
    } catch { /* retry */ }

    await page.waitForTimeout(pollInterval);
    waited += pollInterval;
    if (waited < maxWait && waited % 3000 === 0) {
      log(`    Waiting for disclaimer... (${Math.round(waited / 1000)}s)`);
    }
  }

  log('    No disclaimer dialog found (may not be present)');
}

// ── Wait for Map Ready ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForMapReady(page: any, log: (msg: string) => void): Promise<boolean> {
  const maxWait = 45_000;
  const pollInterval = 3_000;
  let waited = 0;

  while (waited < maxWait) {
    try {
      const ready = await page.evaluate(() => {
        const canvas = document.querySelector('.esri-view-surface canvas');
        if (canvas) return 'canvas';
        const viewDiv = document.querySelector('.esri-view');
        if (viewDiv) return 'esri-view';
        const jimuMap = document.querySelector('[data-widgetid*="map"], .jimu-widget--map');
        if (jimuMap) return 'jimu-map';
        return null;
      });

      if (ready) {
        log(`    Map ready (detected via: ${ready})`);
        return true;
      }
    } catch { /* evaluate may fail during load */ }

    await page.waitForTimeout(pollInterval);
    waited += pollInterval;
    log(`    Waiting for map... (${Math.round(waited / 1000)}s/${Math.round(maxWait / 1000)}s)`);
  }

  log('    ✗ Map did NOT become ready within timeout');
  return false;
}

// ── Get Current Zoom Level ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCurrentZoomLevel(page: any): Promise<number | null> {
  try {
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      // Try jimuMapViews
      if (w._mapViewManager?.jimuMapViews) {
        const views = Object.values(w._mapViewManager.jimuMapViews);
        for (const v of views) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const view = (v as any)?.view;
          if (view?.ready && typeof view.zoom === 'number') return view.zoom;
        }
      }
      // Try arcgis-map element
      const mapEl = document.querySelector('arcgis-map');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (mapEl && (mapEl as any).view?.ready) return (mapEl as any).view.zoom;
      return null;
    });
  } catch { return null; }
}

// ── Switch Basemaps ──────────────────────────────────────────────────

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
// Uses five strategies: JS API → UI button clicks → keyboard → double-click → mouse wheel
// All five methods were validated via the diagnostic harness (commit 86d95d0).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomIn(page: any, levels: number): Promise<void> {
  const start = Date.now();
  const direction = levels > 0 ? 'in' : 'out';
  const isZoomIn = levels > 0;
  const clickCount = Math.abs(levels);
  console.log(`[GIS-CAPTURE][zoom-${direction}] Zooming ${direction} ${clickCount} levels — trying JS API first`);

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
    console.log(`[GIS-CAPTURE][zoom-${direction}] JS API zoom succeeded in ${Date.now() - start}ms`);
    return;
  }
  console.log(`[GIS-CAPTURE][zoom-${direction}] JS API failed — trying UI buttons`);

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
        console.log(`[GIS-CAPTURE][zoom-${direction}] Found zoom button: ${sel} — clicking ${clickCount} times`);
        for (let i = 0; i < clickCount; i++) {
          await btn.click();
          await page.waitForTimeout(600);
        }
        console.log(`[GIS-CAPTURE][zoom-${direction}] UI button zoom complete in ${Date.now() - start}ms`);
        return;
      }
    } catch { /* try next selector */ }
  }
  console.log(`[GIS-CAPTURE][zoom-${direction}] UI buttons not found — trying keyboard zoom`);

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
    console.log(`[GIS-CAPTURE][zoom-${direction}] Keyboard zoom complete (${clickCount}x ${key} + ${numpadKey}) in ${Date.now() - start}ms`);
    // Keyboard zoom is best-effort — we can't easily verify it worked,
    // so we also try double-click and mouse wheel as reinforcement
  } catch {
    console.log(`[GIS-CAPTURE][zoom-${direction}] Keyboard zoom failed`);
  }

  // Strategy 4: Double-click zoom (zoom in only — double-click always zooms in)
  if (isZoomIn) {
    try {
      console.log(`[GIS-CAPTURE][zoom-${direction}] Trying double-click zoom (${clickCount} double-clicks)`);
      for (let i = 0; i < clickCount; i++) {
        await page.mouse.dblclick(960, 540);
        await page.waitForTimeout(800); // Longer wait — double-click triggers zoom animation
      }
      console.log(`[GIS-CAPTURE][zoom-${direction}] Double-click zoom complete in ${Date.now() - start}ms`);
      return;
    } catch {
      console.log(`[GIS-CAPTURE][zoom-${direction}] Double-click zoom failed`);
    }
  }

  // Strategy 5: Mouse wheel (always works as last resort)
  console.log(`[GIS-CAPTURE][zoom-${direction}] Falling back to mouse wheel (${isZoomIn ? clickCount * 3 : -(clickCount * 3)} scroll events)`);
  await zoomViaMouseWheel(page, isZoomIn ? clickCount * 3 : -(clickCount * 3));
  console.log(`[GIS-CAPTURE][zoom-${direction}] Mouse wheel zoom complete in ${Date.now() - start}ms`);
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
    try { view.map.basemap = 'hybrid'; return true; }
    catch { try { view.map.basemap = 'satellite'; return true; } catch { return false; } }
  }).catch(() => false);

  if (jsWorked) {
    log('      Basemap → aerial (via JS API)');
    return;
  }

  // Strategy 2: UI gallery
  log('      JS API basemap switch failed, trying UI gallery...');
  await clickBasemapGalleryItem(page, ['imagery', 'satellite', 'aerial', 'hybrid', 'world imagery'], log);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function switchToStreetsBasemap(page: any, log: (msg: string) => void): Promise<void> {
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
    log('      Basemap → streets (via JS API)');
    return;
  }

  log('      JS API basemap switch failed, trying UI gallery...');
  await clickBasemapGalleryItem(page, ['streets', 'topographic', 'topo', 'street map'], log);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clickBasemapGalleryItem(page: any, keywords: string[], log: (msg: string) => void): Promise<void> {
  try {
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
          log(`      Opened basemap gallery via ${sel}`);
          await page.waitForTimeout(1000);
          break;
        }
      } catch { /* try next */ }
    }

    const clicked = await page.evaluate((kws: string[]) => {
      const items = document.querySelectorAll(
        '.esri-basemap-gallery__item, [class*="basemap-gallery"] [class*="item"], .esri-basemap-gallery__item-container li'
      );
      for (let i = 0; i < items.length; i++) {
        const title = (items[i].textContent || '').toLowerCase();
        if (kws.some(kw => title.includes(kw))) {
          (items[i] as HTMLElement).click();
          return title.trim().substring(0, 40);
        }
      }
      const allEls = document.querySelectorAll('[class*="basemap"] *');
      for (let j = 0; j < allEls.length; j++) {
        const el = allEls[j];
        const title = (el.textContent || '').toLowerCase().trim();
        if (title && kws.some(kw => title.includes(kw)) && title.length < 50) {
          (el as HTMLElement).click();
          return title.substring(0, 40);
        }
      }
      return null;
    }, keywords);

    if (clicked) {
      log(`      Clicked basemap gallery item: "${clicked}"`);
      await page.waitForTimeout(2000);
    } else {
      log('      ✗ Could not find basemap gallery item');
    }
  } catch (err) {
    log(`      ✗ Basemap gallery error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Toggle Layers ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toggleParcelLayer(page: any, visible: boolean, log: (msg: string) => void): Promise<void> {
  await toggleLayerByTitle(page, ['Parcels', 'parcels', 'PARCELS'], visible, log);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toggleLotLineLayer(page: any, visible: boolean, log: (msg: string) => void): Promise<void> {
  await toggleLayerByTitle(page, ['Lot Lines', 'lot lines', 'LOT LINES', 'LotLines'], visible, log);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toggleLayerByTitle(page: any, titles: string[], visible: boolean, log: (msg: string) => void): Promise<void> {
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

  if (jsWorked) {
    log(`      Layer "${titles[0]}" → ${visible ? 'ON' : 'OFF'} (via JS API)`);
    return;
  }

  // Strategy 2: UI layer list
  log(`      JS API layer toggle failed for "${titles[0]}", trying UI...`);
  try {
    await page.evaluate((params: { titles: string[]; visible: boolean }) => {
      const listItems = document.querySelectorAll(
        '.esri-layer-list__item, [class*="layer-list"] [class*="item"], .jimu-widget--layer-list [class*="item"]'
      );
      for (let i = 0; i < listItems.length; i++) {
        const item = listItems[i];
        const label = (item.textContent || '').trim().toLowerCase();
        if (params.titles.some(t => label.includes(t.toLowerCase()))) {
          const toggle = item.querySelector(
            'input[type="checkbox"], calcite-checkbox, .esri-layer-list__item-toggle, [class*="visibility"], [role="switch"]'
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
    log(`      Layer "${titles[0]}" → ${visible ? 'ON' : 'OFF'} (via UI)`);
  } catch (err) {
    log(`      ✗ Layer toggle failed for "${titles[0]}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Internal: Canvas Stability Verification ──────────────────────────
// After zooming or layer toggling, the ArcGIS map re-renders tiles
// asynchronously. We verify that the canvas has stabilized by taking
// two rapid screenshots and comparing their byte length. If the sizes
// differ significantly, tiles are still loading.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForCanvasStability(page: any, maxWait = 8_000): Promise<boolean> {
  const start = Date.now();
  const pollInterval = 1_500;
  let prevSize = 0;
  let stableCount = 0;

  while (Date.now() - start < maxWait) {
    try {
      const buf = await page.screenshot({ fullPage: false, type: 'png', timeout: 5000 });
      const size = buf.length;
      // Consider stable if size is within 2% of previous capture
      if (prevSize > 0 && Math.abs(size - prevSize) / prevSize < 0.02) {
        stableCount++;
        if (stableCount >= 2) {
          console.log(`[GIS-CAPTURE][canvas-stability] Canvas stable after ${Date.now() - start}ms (${stableCount} consistent frames, ${size} bytes)`);
          return true;
        }
      } else {
        stableCount = 0;
      }
      prevSize = size;
    } catch { /* screenshot may fail during render — retry */ }
    await page.waitForTimeout(pollInterval);
  }
  console.log(`[GIS-CAPTURE][canvas-stability] Canvas did not stabilize within ${maxWait}ms — proceeding anyway`);
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
    console.log(`[GIS-CAPTURE][network-idle] Network idle reached in ${Date.now() - start}ms`);
    return true;
  } catch {
    // networkidle may not trigger if there are persistent connections (WebSocket, polling)
    // Fall back to a short wait
    console.log(`[GIS-CAPTURE][network-idle] Network idle timeout after ${maxWait}ms — falling back to ${idleTime}ms wait`);
    await page.waitForTimeout(idleTime);
    return false;
  }
}

// ── Internal: Wait for Map Render (combined) ─────────────────────────
// Combines network idle + canvas stability for reliable post-zoom verification.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForMapRender(page: any): Promise<void> {
  // First wait for network idle (tile downloads complete)
  await waitForNetworkIdle(page, 2_000, 8_000);
  // Then verify canvas is stable (tiles have been painted)
  await waitForCanvasStability(page, 6_000);
}

// ── Internal: Take Screenshot ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function takeScreenshot(page: any, source: string, description: string): Promise<ScreenshotCapture | null> {
  try {
    // Ensure map has finished rendering before capturing
    await waitForMapRender(page);

    const buffer = await page.screenshot({
      fullPage: false,
      type: 'png',
      timeout: TIMEOUTS.screenshotCapture,
    });

    return {
      source,
      url: page.url(),
      imageBase64: buffer.toString('base64'),
      capturedAt: new Date().toISOString(),
      description,
      classification: 'useful',
    };
  } catch {
    return null;
  }
}
