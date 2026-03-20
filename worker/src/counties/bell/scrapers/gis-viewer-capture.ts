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

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Capture multiple targeted screenshots from the Bell County GIS viewer.
 * Returns an array of labeled screenshots for the artifact gallery.
 */
export async function captureGisViewerScreenshots(
  input: GisViewerCaptureInput,
  onProgress: (p: GisViewerCaptureProgress) => void,
): Promise<ScreenshotCapture[]> {
  const results: ScreenshotCapture[] = [];

  if (!input.parcelBoundary && !input.lat) {
    return results;
  }

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
    // The GIS viewer always shows a disclaimer popup from BIS Consultants
    // on first load with "OK" and "Cancel" buttons. We must click OK
    // before we can interact with the map.
    progress('Looking for disclaimer dialog...');
    await dismissDisclaimerDialog(page, progress);

    // Wait for the ArcGIS map to initialize
    progress('Waiting for map to initialize...');
    const mapReady = await waitForMapReady(page, progress);
    if (!mapReady) {
      progress('⚠ Map did not initialize — falling back to static screenshots');
      // Take a screenshot of whatever loaded
      const fallback = await takeScreenshot(page, 'GIS Viewer', 'GIS Viewer — map initialization timeout');
      if (fallback) results.push(fallback);
      await context.close();
      return results;
    }

    progress('✓ GIS viewer loaded and map initialized');

    // ── Step 2: Zoom to target parcel area ───────────────────────
    progress('Zooming to target parcel...');
    const zoomed = await zoomToParcel(page, input, progress);
    if (!zoomed) {
      progress('⚠ Could not zoom to parcel — capturing current view');
    }

    await page.waitForTimeout(MAP_SETTLE_WAIT);

    // ── Screenshot A: Subdivision overview (all lots with IDs) ───
    progress('Capturing subdivision overview with property IDs...');
    await zoomOut(page, 2); // Zoom out to show full subdivision
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssSubdiv = await takeScreenshot(page, 'GIS Viewer',
      `Subdivision overview — ${input.subdivisionName ?? 'area'} — all lots with property IDs`);
    if (ssSubdiv) results.push(ssSubdiv);

    // ── Screenshot B: Target parcel detail ───────────────────────
    progress('Capturing target parcel detail view...');
    await zoomToParcel(page, input, progress); // Zoom back to parcel
    await zoomIn(page, 2); // Zoom in closer for detail
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssDetail = await takeScreenshot(page, 'GIS Viewer',
      `Target parcel detail — ${input.propertyId ?? 'unknown'} — ${input.situsAddress ?? ''} Lot ${input.lotNumber ?? '?'}`);
    if (ssDetail) results.push(ssDetail);

    // ── Screenshot C: Aerial with property lines ─────────────────
    progress('Switching to aerial/satellite basemap...');
    await switchToAerialBasemap(page);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    // Zoom to show parcel in context
    await zoomToParcel(page, input, progress);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssAerialLines = await takeScreenshot(page, 'GIS Viewer',
      `Aerial view WITH property lines — ${input.propertyId ?? ''} — ${input.situsAddress ?? ''}`);
    if (ssAerialLines) results.push(ssAerialLines);

    // ── Screenshot D: Aerial without property lines ──────────────
    progress('Hiding parcel boundaries for clean aerial...');
    await toggleParcelLayer(page, false);
    await toggleLotLineLayer(page, false);
    await page.waitForTimeout(LAYER_TOGGLE_WAIT);
    const ssAerialClean = await takeScreenshot(page, 'GIS Viewer',
      `Aerial view WITHOUT property lines — ${input.situsAddress ?? ''}`);
    if (ssAerialClean) results.push(ssAerialClean);

    // Restore parcel layer
    await toggleParcelLayer(page, true);
    await toggleLotLineLayer(page, true);

    // ── Screenshot E: Adjacent lots ──────────────────────────────
    // Switch back to streets basemap for clearer lot identification
    progress('Capturing adjacent lot views...');
    await switchToStreetsBasemap(page);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    // Pan to each cardinal direction to capture neighboring lots
    const directions: Array<{ name: string; dx: number; dy: number }> = [
      { name: 'North', dx: 0, dy: -300 },
      { name: 'East', dx: 400, dy: 0 },
      { name: 'South', dx: 0, dy: 300 },
      { name: 'West', dx: -400, dy: 0 },
    ];

    // First center on the parcel
    await zoomToParcel(page, input, progress);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    for (const dir of directions) {
      try {
        await panMap(page, dir.dx, dir.dy);
        await page.waitForTimeout(LAYER_TOGGLE_WAIT);
        const ssAdj = await takeScreenshot(page, 'GIS Viewer',
          `Adjacent lot — ${dir.name} of ${input.propertyId ?? 'target'}`);
        if (ssAdj) results.push(ssAdj);
        // Pan back to center for next direction
        await panMap(page, -dir.dx, -dir.dy);
        await page.waitForTimeout(1000);
      } catch {
        // Skip this direction if panning fails
      }
    }

    // ── Screenshot F: Layer combination views ─────────────────────
    // Cycle through different layer combinations to extract maximum info
    progress('Capturing layer combination views...');
    await zoomToParcel(page, input, progress);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

    const layerCombinations: Array<{
      label: string;
      basemap: 'streets' | 'aerial';
      parcels: boolean;
      lotLines: boolean;
      zoomDelta: number; // Relative zoom adjustment from parcel view
    }> = [
      // Lot lines only (no parcel fills) on streets — shows dimensions
      { label: 'Lot lines only (dimensions)', basemap: 'streets', parcels: false, lotLines: true, zoomDelta: 1 },
      // Tight zoom on aerial with lot lines — for dimension readability
      { label: 'Aerial tight zoom with lot lines', basemap: 'aerial', parcels: false, lotLines: true, zoomDelta: 2 },
      // Wide context view with all layers — for surrounding lots
      { label: 'Wide context — surrounding lots', basemap: 'streets', parcels: true, lotLines: true, zoomDelta: -3 },
      // Aerial wide for neighborhood context
      { label: 'Aerial wide — neighborhood', basemap: 'aerial', parcels: true, lotLines: true, zoomDelta: -4 },
    ];

    for (const combo of layerCombinations) {
      try {
        progress(`  Layer view: ${combo.label}...`);

        // Set basemap
        if (combo.basemap === 'aerial') {
          await switchToAerialBasemap(page);
        } else {
          await switchToStreetsBasemap(page);
        }

        // Set layer visibility
        await toggleParcelLayer(page, combo.parcels);
        await toggleLotLineLayer(page, combo.lotLines);

        // Zoom to parcel and adjust
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

    // ── Screenshot G: Multi-zoom detail series ────────────────────
    // Capture at multiple zoom levels for complete context
    progress('Capturing multi-zoom detail series...');
    const zoomLevels: Array<{ label: string; zoomDelta: number }> = [
      { label: 'Maximum detail (lot boundaries)', zoomDelta: 3 },
      { label: 'Lot + immediate neighbors', zoomDelta: 0 },
      { label: 'Block level context', zoomDelta: -2 },
    ];

    for (const zl of zoomLevels) {
      try {
        await zoomToParcel(page, input, progress);
        if (zl.zoomDelta > 0) {
          await zoomIn(page, zl.zoomDelta);
        } else if (zl.zoomDelta < 0) {
          await zoomOut(page, -zl.zoomDelta);
        }
        await page.waitForTimeout(MAP_SETTLE_WAIT);

        const ssZoom = await takeScreenshot(page, 'GIS Viewer',
          `Zoom: ${zl.label} — ${input.propertyId ?? ''}`);
        if (ssZoom) results.push(ssZoom);
      } catch {
        // Skip on failure
      }
    }

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
        // ArcGIS Experience Builder stores the map view in various places.
        // Try to find the MapView instance.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;

        // Method 1: Check for jimu mapViews
        if (w._mapViewManager?.jimuMapViews) {
          const views = Object.values(w._mapViewManager.jimuMapViews);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return views.some((v: any) => v?.view?.ready);
        }

        // Method 2: Check for ArcGIS map component
        const mapEl = document.querySelector('arcgis-map');
        if (mapEl) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const view = (mapEl as any).view;
          if (view?.ready) return true;
        }

        // Method 3: Check for canvas element (map tiles rendered)
        const canvas = document.querySelector('.esri-view-surface canvas');
        if (canvas) return true;

        // Method 4: Check for Esri view container
        const viewDiv = document.querySelector('.esri-view');
        if (viewDiv) return true;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomToParcel(page: any, input: GisViewerCaptureInput, progress: (msg: string) => void): Promise<boolean> {
  try {
    // Use the ArcGIS JS API to go to a specific extent
    const result = await page.evaluate(async (params: { lat: number; lon: number; boundary: number[][][] | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;

      // Find the MapView
      let view = null;

      // Method 1: jimu mapViews
      if (w._mapViewManager?.jimuMapViews) {
        const views = Object.values(w._mapViewManager.jimuMapViews);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const found = views.find((v: any) => v?.view?.ready);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (found) view = (found as any).view;
      }

      // Method 2: arcgis-map element
      if (!view) {
        const mapEl = document.querySelector('arcgis-map');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (mapEl) view = (mapEl as any).view;
      }

      if (!view) return { success: false, reason: 'MapView not found' };

      // If we have a boundary, compute extent from it
      if (params.boundary && params.boundary.length > 0) {
        const ring = params.boundary[0];
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }

        // Add some padding
        const lonPad = (maxLon - minLon) * 0.3;
        const latPad = (maxLat - minLat) * 0.3;

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Extent = (w as any).require?.('esri/geometry/Extent');
          if (Extent) {
            const ext = new Extent({
              xmin: minLon - lonPad,
              ymin: minLat - latPad,
              xmax: maxLon + lonPad,
              ymax: maxLat + latPad,
              spatialReference: { wkid: 4326 },
            });
            await view.goTo(ext, { duration: 1000 });
            return { success: true, reason: 'Zoomed via Extent' };
          }
        } catch { /* Extent module not available via require */ }

        // Fallback: use view.goTo with center + zoom
        const centerLon = (minLon + maxLon) / 2;
        const centerLat = (minLat + maxLat) / 2;
        await view.goTo({ center: [centerLon, centerLat], zoom: 17 }, { duration: 1000 });
        return { success: true, reason: 'Zoomed via center + zoom' };
      }

      // Fallback: zoom to lat/lon
      await view.goTo({ center: [params.lon, params.lat], zoom: 17 }, { duration: 1000 });
      return { success: true, reason: 'Zoomed via lat/lon' };

    }, { lat: input.lat, lon: input.lon, boundary: input.parcelBoundary });

    if (result?.success) {
      progress(`  ${result.reason}`);
      return true;
    }
    progress(`  ⚠ Zoom failed: ${result?.reason}`);
    return false;
  } catch (err) {
    progress(`  ⚠ Zoom error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ── Internal: Zoom In/Out ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomIn(page: any, levels: number): Promise<void> {
  await page.evaluate(async (n: number) => {
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
    if (view) await view.goTo({ zoom: view.zoom + n }, { duration: 500 });
  }, levels);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function switchToAerialBasemap(page: any): Promise<void> {
  await page.evaluate(async () => {
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
    if (!view?.map) return;

    // Try common aerial basemap IDs
    const aerialIds = ['satellite', 'hybrid', 'world-imagery'];
    for (const id of aerialIds) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Basemap = (w as any).require?.('esri/Basemap');
        if (Basemap) {
          view.map.basemap = Basemap.fromId(id);
          return;
        }
      } catch { /* try next */ }
    }

    // Fallback: set basemap directly
    try {
      view.map.basemap = 'hybrid';
    } catch {
      try {
        view.map.basemap = 'satellite';
      } catch { /* unable to switch */ }
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function switchToStreetsBasemap(page: any): Promise<void> {
  await page.evaluate(async () => {
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
    if (!view?.map) return;

    try {
      view.map.basemap = 'streets-vector';
    } catch {
      try {
        view.map.basemap = 'streets';
      } catch { /* unable to switch */ }
    }
  });
}

// ── Internal: Toggle Layers ──────────────────────────────────────────

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
  await page.evaluate((params: { titles: string[]; visible: boolean }) => {
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
    if (!view?.map?.layers) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    view.map.layers.forEach((layer: any) => {
      if (params.titles.some(t => layer.title?.toLowerCase() === t.toLowerCase())) {
        layer.visible = params.visible;
      }
    });
  }, { titles, visible });
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
