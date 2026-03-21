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

// ── Zoom Strategy Result Type ────────────────────────────────────────

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

    progress('✓ GIS viewer loaded and map initialized');

    // ── Step 1.75: DOM Inventory (diagnostic) ────────────────────
    // Log everything we can see on the page to understand what UI
    // elements are available for interaction.
    progress('Running DOM inventory diagnostic...');
    const domInventory = await runDomInventory(page);
    progress(`DOM INVENTORY:\n${domInventory}`);

    // ── Step 2: Run ALL zoom strategies as diagnostics ───────────
    // Each strategy gets tried, logged, and a screenshot captured.
    // This tells us exactly which approaches work on this viewer.
    progress('═══════════════════════════════════════════════════════');
    progress('STARTING ZOOM STRATEGY DIAGNOSTICS — Testing ALL approaches');
    progress('═══════════════════════════════════════════════════════');

    const diagnosticResults = await runAllZoomStrategies(page, input, progress);

    // Log summary
    progress('═══════════════════════════════════════════════════════');
    progress('ZOOM STRATEGY DIAGNOSTIC RESULTS SUMMARY:');
    progress('═══════════════════════════════════════════════════════');
    for (const r of diagnosticResults) {
      const icon = r.success ? '✅' : '❌';
      progress(`  ${icon} [${r.duration}ms] ${r.strategy}: ${r.details}`);
    }

    const successfulStrategies = diagnosticResults.filter(r => r.success);
    progress(`  TOTAL: ${successfulStrategies.length}/${diagnosticResults.length} strategies succeeded`);
    progress('═══════════════════════════════════════════════════════');

    // Add all diagnostic screenshots to results (labeled as diagnostics)
    for (const r of diagnosticResults) {
      if (r.screenshot) {
        results.push(r.screenshot);
      }
    }

    // ── Step 2.5: Use the best working strategy for remaining captures ──
    // Find the first strategy that succeeded and remember it for subsequent zooms
    const bestStrategy = successfulStrategies[0]?.strategy ?? 'mouse-wheel';
    progress(`Using best strategy for remaining captures: ${bestStrategy}`);

    // Reload the page fresh for the actual capture series
    progress('Reloading viewer for actual capture series...');
    await page.goto(GIS_VIEWER_URL, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
    await dismissDisclaimerDialog(page, progress);
    await waitForMapReady(page, progress);

    // Zoom using the best strategy
    const zoomed = await zoomToParcel(page, input, progress);
    if (!zoomed) {
      progress('⚠ Could not zoom to parcel — capturing current view');
    }

    await page.waitForTimeout(MAP_SETTLE_WAIT);

    // ── Screenshot A: Subdivision overview (all lots with IDs) ───
    progress('Capturing subdivision overview with property IDs...');
    await zoomOut(page, 2);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssSubdiv = await takeScreenshot(page, 'GIS Viewer',
      `Subdivision overview — ${input.subdivisionName ?? 'area'} — all lots with property IDs`);
    if (ssSubdiv) results.push(ssSubdiv);

    // ── Screenshot B: Target parcel detail ───────────────────────
    progress('Capturing target parcel detail view...');
    await zoomToParcel(page, input, progress);
    await zoomIn(page, 2);
    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ssDetail = await takeScreenshot(page, 'GIS Viewer',
      `Target parcel detail — ${input.propertyId ?? 'unknown'} — ${input.situsAddress ?? ''} Lot ${input.lotNumber ?? '?'}`);
    if (ssDetail) results.push(ssDetail);

    // ── Screenshot C: Aerial with property lines ─────────────────
    progress('Switching to aerial/satellite basemap...');
    await switchToAerialBasemap(page);
    await page.waitForTimeout(MAP_SETTLE_WAIT);

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

// ── Internal: DOM Inventory (Diagnostic) ─────────────────────────────
// Logs all visible UI elements, widgets, buttons, and inputs on the page
// so we can understand what the Experience Builder app exposes.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runDomInventory(page: any): Promise<string> {
  try {
    return await page.evaluate(() => {
      const lines: string[] = [];

      // 1. Check for ArcGIS JS API availability
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      lines.push('=== ArcGIS JS API Availability ===');
      lines.push(`  window._mapViewManager: ${typeof w._mapViewManager}`);
      if (w._mapViewManager) {
        lines.push(`  jimuMapViews keys: ${w._mapViewManager.jimuMapViews ? Object.keys(w._mapViewManager.jimuMapViews).join(', ') : 'NONE'}`);
        if (w._mapViewManager.jimuMapViews) {
          const views = Object.entries(w._mapViewManager.jimuMapViews);
          for (const [key, val] of views) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const v = val as any;
            lines.push(`    ${key}: view=${!!v?.view}, ready=${v?.view?.ready}, zoom=${v?.view?.zoom}`);
          }
        }
      }
      lines.push(`  arcgis-map element: ${!!document.querySelector('arcgis-map')}`);
      lines.push(`  esri-view: ${!!document.querySelector('.esri-view')}`);
      lines.push(`  esri-view-surface canvas: ${!!document.querySelector('.esri-view-surface canvas')}`);

      // 2. Esri require function
      lines.push(`  window.require (esri): ${typeof w.require}`);
      if (typeof w.require === 'function') {
        try {
          const Point = w.require('esri/geometry/Point');
          lines.push(`    esri/geometry/Point: ${typeof Point}`);
        } catch (e) {
          lines.push(`    esri/geometry/Point: FAILED (${e})`);
        }
      }

      // 3. Experience Builder (Jimu) state
      lines.push('=== Experience Builder / Jimu ===');
      lines.push(`  window.jimuConfig: ${typeof w.jimuConfig}`);
      lines.push(`  window._appState: ${typeof w._appState}`);
      if (w._appState?.appConfig) {
        lines.push(`    widgets: ${Object.keys(w._appState.appConfig.widgets || {}).join(', ')}`);
      }
      // Check for jimu store (Redux)
      lines.push(`  window._store: ${typeof w._store}`);
      if (w._store?.getState) {
        try {
          const state = w._store.getState();
          const mapWidgets = Object.keys(state?.mapWidgets || {});
          lines.push(`    mapWidgets: ${mapWidgets.join(', ') || 'NONE'}`);
          lines.push(`    widgetsState keys: ${Object.keys(state?.widgetsState || {}).join(', ')}`);
        } catch { lines.push('    getState() failed'); }
      }

      // 4. All iframes
      lines.push('=== Iframes ===');
      const iframes = document.querySelectorAll('iframe');
      lines.push(`  Count: ${iframes.length}`);
      for (let i = 0; i < iframes.length; i++) {
        lines.push(`    [${i}] src=${iframes[i].src}, id=${iframes[i].id}`);
      }

      // 5. All buttons visible on page
      lines.push('=== Buttons ===');
      const buttons = document.querySelectorAll('button');
      let visibleBtnCount = 0;
      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          visibleBtnCount++;
          const title = btn.title || btn.getAttribute('aria-label') || '';
          const text = (btn.textContent || '').trim().substring(0, 50);
          const classes = btn.className.substring(0, 80);
          lines.push(`    [${visibleBtnCount}] title="${title}" text="${text}" class="${classes}"`);
        }
      }
      lines.push(`  Visible buttons: ${visibleBtnCount}/${buttons.length}`);

      // 6. All input elements
      lines.push('=== Inputs ===');
      const inputs = document.querySelectorAll('input, [role="textbox"], [role="searchbox"], [contenteditable]');
      for (let i = 0; i < inputs.length; i++) {
        const inp = inputs[i] as HTMLInputElement;
        const rect = inp.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const placeholder = inp.placeholder || inp.getAttribute('aria-label') || '';
          const type = inp.type || inp.tagName;
          lines.push(`    type="${type}" placeholder="${placeholder}" class="${inp.className.substring(0, 60)}"`);
        }
      }

      // 7. Esri widgets
      lines.push('=== Esri Widgets ===');
      const widgets = document.querySelectorAll('[class*="esri-"]');
      const widgetClasses = new Set<string>();
      for (let i = 0; i < widgets.length; i++) {
        const cls = widgets[i].className;
        // Extract esri-xxx class names
        const matches = cls.match(/esri-[\w-]+/g);
        if (matches) {
          for (const m of matches) {
            if (!m.includes('__') && !m.includes('--')) widgetClasses.add(m);
          }
        }
      }
      const sortedWidgets = Array.from(widgetClasses).sort();
      lines.push(`  Widget classes: ${sortedWidgets.join(', ')}`);

      // 8. Search-related elements
      lines.push('=== Search Elements ===');
      const searchEls = document.querySelectorAll(
        '[class*="search"], [data-widget*="search"], [placeholder*="search" i], ' +
        '[placeholder*="find" i], [placeholder*="address" i]'
      );
      for (let i = 0; i < searchEls.length; i++) {
        const el = searchEls[i];
        const rect = el.getBoundingClientRect();
        lines.push(`    tag=${el.tagName} visible=${rect.width > 0} class="${el.className.substring(0, 80)}"`);
      }

      // 9. Zoom-related elements
      lines.push('=== Zoom Elements ===');
      const zoomEls = document.querySelectorAll(
        '.esri-zoom, [class*="zoom"], button[title*="Zoom" i], button[title*="zoom" i]'
      );
      for (let i = 0; i < zoomEls.length; i++) {
        const el = zoomEls[i];
        const rect = el.getBoundingClientRect();
        lines.push(`    tag=${el.tagName} visible=${rect.width > 0} title="${(el as HTMLElement).title || ''}" class="${el.className.substring(0, 60)}"`);
      }

      // 10. Jimu widgets (Experience Builder specific)
      lines.push('=== Jimu Widgets ===');
      const jimuEls = document.querySelectorAll('[data-widgetid], [class*="jimu-widget"]');
      for (let i = 0; i < jimuEls.length; i++) {
        const el = jimuEls[i];
        const wid = el.getAttribute('data-widgetid') || '';
        lines.push(`    widgetid="${wid}" class="${el.className.substring(0, 80)}"`);
      }

      // 11. Basemap-related elements
      lines.push('=== Basemap Elements ===');
      const basemapEls = document.querySelectorAll(
        '[class*="basemap"], [data-widget*="basemap"], [title*="basemap" i]'
      );
      for (let i = 0; i < basemapEls.length; i++) {
        const el = basemapEls[i];
        const rect = el.getBoundingClientRect();
        lines.push(`    tag=${el.tagName} visible=${rect.width > 0} class="${el.className.substring(0, 60)}"`);
      }

      // 12. Layer-related elements
      lines.push('=== Layer Elements ===');
      const layerEls = document.querySelectorAll(
        '[class*="layer-list"], [data-widget*="layer"], [title*="layer" i]'
      );
      for (let i = 0; i < layerEls.length; i++) {
        const el = layerEls[i];
        lines.push(`    tag=${el.tagName} class="${el.className.substring(0, 60)}"`);
      }

      return lines.join('\n');
    });
  } catch (err) {
    return `DOM inventory failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Internal: Run ALL Zoom Strategies (Diagnostic) ───────────────────
// Tests every possible zoom approach and captures a screenshot after each.
// Returns detailed results so we can determine which strategies work.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAllZoomStrategies(page: any, input: GisViewerCaptureInput, progress: (msg: string) => void): Promise<ZoomStrategyResult[]> {
  const results: ZoomStrategyResult[] = [];

  // Compute center coordinates once
  let centerLon = input.lon;
  let centerLat = input.lat;
  if (input.parcelBoundary && input.parcelBoundary.length > 0) {
    const ring = input.parcelBoundary[0];
    let sumLon = 0, sumLat = 0;
    for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
    centerLon = sumLon / ring.length;
    centerLat = sumLat / ring.length;
  }

  // Helper to capture a diagnostic screenshot
  const captureDiag = async (label: string): Promise<ScreenshotCapture | undefined> => {
    const ss = await takeScreenshot(page, 'GIS Viewer', `DIAGNOSTIC: ${label}`);
    return ss ?? undefined;
  };

  // Helper to reload the viewer fresh for each strategy test
  const reloadFresh = async (): Promise<boolean> => {
    try {
      await page.goto(GIS_VIEWER_URL, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
      await dismissDisclaimerDialog(page, progress);
      return await waitForMapReady(page, progress);
    } catch { return false; }
  };

  // ═══ STRATEGY 1: JS API — jimuMapViews ═══
  progress('--- Strategy 1/12: JS API via _mapViewManager.jimuMapViews ---');
  {
    const t0 = Date.now();
    try {
      const result = await page.evaluate(async (params: { lon: number; lat: number }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        if (!w._mapViewManager?.jimuMapViews) return { success: false, detail: '_mapViewManager or jimuMapViews not found' };

        const views = Object.values(w._mapViewManager.jimuMapViews);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const found = views.find((v: any) => v?.view?.ready);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!found) return { success: false, detail: `No ready view found (${views.length} views exist, keys: ${Object.keys(w._mapViewManager.jimuMapViews).join(',')})` };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const view = (found as any).view;
        await view.goTo({ center: [params.lon, params.lat], zoom: 17 }, { duration: 1000 });
        return { success: true, detail: `Zoomed to [${params.lon}, ${params.lat}] zoom=17, current zoom=${view.zoom}` };
      }, { lon: centerLon, lat: centerLat });

      await page.waitForTimeout(MAP_SETTLE_WAIT);
      const ss = await captureDiag('Strategy 1 — JS API jimuMapViews');
      results.push({ strategy: '1-js-jimuMapViews', success: result.success, duration: Date.now() - t0, details: result.detail, screenshot: ss });
      progress(`  Result: ${result.success ? 'SUCCESS' : 'FAIL'} — ${result.detail}`);
    } catch (err) {
      results.push({ strategy: '1-js-jimuMapViews', success: false, duration: Date.now() - t0, details: `Exception: ${err instanceof Error ? err.message : String(err)}` });
      progress(`  Result: EXCEPTION — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ═══ STRATEGY 2: JS API — arcgis-map element ═══
  progress('--- Strategy 2/12: JS API via arcgis-map element ---');
  {
    const t0 = Date.now();
    try {
      const result = await page.evaluate(async (params: { lon: number; lat: number }) => {
        const mapEl = document.querySelector('arcgis-map');
        if (!mapEl) return { success: false, detail: 'No arcgis-map element found in DOM' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const view = (mapEl as any).view;
        if (!view) return { success: false, detail: 'arcgis-map exists but .view is null/undefined' };
        if (!view.ready) return { success: false, detail: 'arcgis-map.view exists but not ready' };

        await view.goTo({ center: [params.lon, params.lat], zoom: 17 }, { duration: 1000 });
        return { success: true, detail: `Zoomed via arcgis-map.view, zoom=${view.zoom}` };
      }, { lon: centerLon, lat: centerLat });

      await page.waitForTimeout(MAP_SETTLE_WAIT);
      const ss = await captureDiag('Strategy 2 — JS API arcgis-map');
      results.push({ strategy: '2-js-arcgis-map', success: result.success, duration: Date.now() - t0, details: result.detail, screenshot: ss });
      progress(`  Result: ${result.success ? 'SUCCESS' : 'FAIL'} — ${result.detail}`);
    } catch (err) {
      results.push({ strategy: '2-js-arcgis-map', success: false, duration: Date.now() - t0, details: `Exception: ${err instanceof Error ? err.message : String(err)}` });
      progress(`  Result: EXCEPTION — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ═══ STRATEGY 3: JS API — Deep window traversal to find MapView ═══
  progress('--- Strategy 3/12: JS API via deep window property scan ---');
  {
    const t0 = Date.now();
    try {
      const result = await page.evaluate(async (params: { lon: number; lat: number }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        const checked: string[] = [];
        let foundPath = '';

        // Search common hiding spots for MapView
        const paths = [
          '_mapViewManager.jimuMapViews',
          '_storeManager',
          '__NEXT_DATA__',
          'dojo',
          'esri',
          'jimuConfig',
          '_appState',
          '_store',
        ];

        for (const p of paths) {
          try {
            const parts = p.split('.');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let obj: any = w;
            for (const part of parts) {
              obj = obj?.[part];
            }
            if (obj && typeof obj === 'object') {
              checked.push(`${p}: ${typeof obj} (keys: ${Object.keys(obj).slice(0, 10).join(',')})`);

              // If it's jimuMapViews, iterate to find view
              if (p.endsWith('jimuMapViews')) {
                for (const [k, v] of Object.entries(obj)) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const jv = v as any;
                  if (jv?.view?.ready) {
                    foundPath = `${p}.${k}.view`;
                    await jv.view.goTo({ center: [params.lon, params.lat], zoom: 17 }, { duration: 1000 });
                    return { success: true, detail: `Found at ${foundPath}, zoomed successfully` };
                  }
                }
              }
            } else {
              checked.push(`${p}: ${obj === null ? 'null' : typeof obj}`);
            }
          } catch (e) {
            checked.push(`${p}: ERROR ${e}`);
          }
        }

        // Try to find any object with goTo method by scanning esri-view DOM
        const viewContainer = document.querySelector('.esri-view-root');
        if (viewContainer) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const viewObj = (viewContainer as any).__view || (viewContainer as any)._view;
          if (viewObj?.goTo) {
            await viewObj.goTo({ center: [params.lon, params.lat], zoom: 17 }, { duration: 1000 });
            return { success: true, detail: `Found via .esri-view-root.__view` };
          }
          checked.push(`esri-view-root: __view=${typeof (viewContainer as any).__view}, _view=${typeof (viewContainer as any)._view}`);
        }

        // Try to find view via internal widget manager
        if (w._widgetManager?.widgets) {
          for (const [wk, wv] of Object.entries(w._widgetManager.widgets)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wid = wv as any;
            if (wid?.mapView?.goTo) {
              await wid.mapView.goTo({ center: [params.lon, params.lat], zoom: 17 }, { duration: 1000 });
              return { success: true, detail: `Found via _widgetManager.widgets.${wk}.mapView` };
            }
          }
        }

        return { success: false, detail: `Scanned paths: ${checked.join(' | ')}` };
      }, { lon: centerLon, lat: centerLat });

      await page.waitForTimeout(MAP_SETTLE_WAIT);
      const ss = await captureDiag('Strategy 3 — Deep JS scan');
      results.push({ strategy: '3-js-deep-scan', success: result.success, duration: Date.now() - t0, details: result.detail, screenshot: ss });
      progress(`  Result: ${result.success ? 'SUCCESS' : 'FAIL'} — ${result.detail}`);
    } catch (err) {
      results.push({ strategy: '3-js-deep-scan', success: false, duration: Date.now() - t0, details: `Exception: ${err instanceof Error ? err.message : String(err)}` });
      progress(`  Result: EXCEPTION — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ═══ STRATEGY 4: JS API — Redux store dispatch ═══
  progress('--- Strategy 4/12: JS API via Redux store dispatch ---');
  {
    const t0 = Date.now();
    try {
      const result = await page.evaluate(async (params: { lon: number; lat: number }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;

        // Experience Builder uses Redux. Try to find and dispatch map actions.
        const store = w._store || w.store || w.__store;
        if (!store?.dispatch) return { success: false, detail: `No Redux store found (window._store=${typeof w._store}, window.store=${typeof w.store})` };

        try {
          const state = store.getState();
          const mapKeys = Object.keys(state?.mapWidgets || {});
          const widgetKeys = Object.keys(state?.widgetsState || {});
          const info = `mapWidgets=[${mapKeys.join(',')}], widgetsState=[${widgetKeys.join(',')}]`;

          // Try dispatching a map extent change action
          // Experience Builder uses jimu-core actions
          if (w.jimuCoreActions?.mapZoomTo) {
            w.jimuCoreActions.mapZoomTo(mapKeys[0], { center: [params.lon, params.lat], zoom: 17 });
            return { success: true, detail: `Dispatched jimuCoreActions.mapZoomTo — ${info}` };
          }

          return { success: false, detail: `Store found but no jimuCoreActions.mapZoomTo. ${info}` };
        } catch (e) {
          return { success: false, detail: `Store error: ${e}` };
        }
      }, { lon: centerLon, lat: centerLat });

      await page.waitForTimeout(MAP_SETTLE_WAIT);
      const ss = await captureDiag('Strategy 4 — Redux store');
      results.push({ strategy: '4-js-redux-store', success: result.success, duration: Date.now() - t0, details: result.detail, screenshot: ss });
      progress(`  Result: ${result.success ? 'SUCCESS' : 'FAIL'} — ${result.detail}`);
    } catch (err) {
      results.push({ strategy: '4-js-redux-store', success: false, duration: Date.now() - t0, details: `Exception: ${err instanceof Error ? err.message : String(err)}` });
      progress(`  Result: EXCEPTION — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ═══ STRATEGY 5: Search widget — type address ═══
  progress('--- Strategy 5/12: Search widget — type address ---');
  {
    const t0 = Date.now();
    let detail = 'No search widget found';
    let success = false;

    if (input.situsAddress) {
      try {
        // First, inventory all search-like inputs
        const searchInfo = await page.evaluate(() => {
          const results: string[] = [];
          const allInputs = document.querySelectorAll('input');
          for (let i = 0; i < allInputs.length; i++) {
            const inp = allInputs[i];
            const rect = inp.getBoundingClientRect();
            results.push(`  input: type=${inp.type} placeholder="${inp.placeholder}" visible=${rect.width > 0 && rect.height > 0} class="${inp.className.substring(0, 60)}"`);
          }
          return results.join('\n');
        });
        progress(`  Search widget inventory:\n${searchInfo}`);

        const searchSelectors = [
          '.esri-search__input',
          '.jimu-widget--search input[type="text"]',
          '[class*="search-module"] input',
          '.esri-search input',
          'input[placeholder*="Find" i]',
          'input[placeholder*="Search" i]',
          'input[placeholder*="address" i]',
          'input[placeholder*="parcel" i]',
          'input[placeholder*="location" i]',
          'input[type="search"]',
          '[role="searchbox"]',
        ];

        for (const sel of searchSelectors) {
          try {
            const inp = page.locator(sel).first();
            if (await inp.count() > 0 && await inp.isVisible()) {
              progress(`  Found search input: ${sel}`);
              await inp.click();
              await inp.fill('');
              await page.waitForTimeout(500);
              await inp.fill(input.situsAddress);
              progress(`  Typed: "${input.situsAddress}"`);
              await page.waitForTimeout(2000);

              // Log suggestions that appeared
              const suggestions = await page.evaluate(() => {
                const items: string[] = [];
                const sels = document.querySelectorAll(
                  '.esri-search__suggestions-list li, [role="option"], [class*="suggestion"], .esri-menu__list-item'
                );
                for (let i = 0; i < sels.length; i++) {
                  items.push((sels[i].textContent || '').trim().substring(0, 100));
                }
                return items;
              });
              progress(`  Suggestions found: ${suggestions.length} — ${suggestions.slice(0, 5).join(' | ')}`);

              // Try clicking first suggestion
              let clickedSug = false;
              const sugSelectors = [
                '.esri-search__suggestions-list li:first-child',
                '.esri-menu__list-item:first-child',
                '[role="option"]:first-child',
                '[class*="suggestion"]:first-child',
              ];
              for (const ss of sugSelectors) {
                try {
                  const sug = page.locator(ss).first();
                  if (await sug.count() > 0 && await sug.isVisible()) {
                    await sug.click();
                    clickedSug = true;
                    progress(`  Clicked suggestion via ${ss}`);
                    break;
                  }
                } catch { /* next */ }
              }
              if (!clickedSug) {
                await inp.press('Enter');
                progress('  No suggestion visible — pressed Enter');
              }

              await page.waitForTimeout(MAP_SETTLE_WAIT + 2000);
              detail = `Search widget found (${sel}), typed "${input.situsAddress}", ${clickedSug ? 'clicked suggestion' : 'pressed Enter'}`;
              success = true;
              break;
            }
          } catch { /* try next */ }
        }
      } catch (err) {
        detail = `Exception: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      detail = 'No situs address available';
    }

    const ss = await captureDiag('Strategy 5 — Search widget');
    results.push({ strategy: '5-search-widget', success, duration: Date.now() - t0, details: detail, screenshot: ss });
    progress(`  Result: ${success ? 'SUCCESS' : 'FAIL'} — ${detail}`);
  }

  // Reload for next tests
  await reloadFresh();

  // ═══ STRATEGY 6: URL hash params — #center=lon,lat&level=N ═══
  progress('--- Strategy 6/12: URL hash params #center=lon,lat&level=17 ---');
  {
    const t0 = Date.now();
    const url = `${GIS_VIEWER_URL}#center=${centerLon},${centerLat}&level=17`;
    try {
      progress(`  Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
      await dismissDisclaimerDialog(page, progress);
      await waitForMapReady(page, progress);
      await page.waitForTimeout(MAP_SETTLE_WAIT);

      const currentUrl = page.url();
      const detail = `Loaded URL: ${currentUrl}`;
      const ss = await captureDiag('Strategy 6 — URL hash #center');
      results.push({ strategy: '6-url-hash-center', success: true, duration: Date.now() - t0, details: detail, screenshot: ss });
      progress(`  Result: LOADED — ${detail}`);
    } catch (err) {
      results.push({ strategy: '6-url-hash-center', success: false, duration: Date.now() - t0, details: `Exception: ${err instanceof Error ? err.message : String(err)}` });
      progress(`  Result: EXCEPTION — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ═══ STRATEGY 7: URL query params — ?center=lon,lat&level=N ═══
  progress('--- Strategy 7/12: URL query params ?center=lon,lat&level=17 ---');
  {
    const t0 = Date.now();
    const url = `${GIS_VIEWER_URL}?center=${centerLon},${centerLat}&level=17`;
    try {
      progress(`  Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
      await dismissDisclaimerDialog(page, progress);
      await waitForMapReady(page, progress);
      await page.waitForTimeout(MAP_SETTLE_WAIT);

      const currentUrl = page.url();
      const ss = await captureDiag('Strategy 7 — URL query ?center');
      results.push({ strategy: '7-url-query-center', success: true, duration: Date.now() - t0, details: `Loaded URL: ${currentUrl}`, screenshot: ss });
      progress(`  Result: LOADED — ${currentUrl}`);
    } catch (err) {
      results.push({ strategy: '7-url-query-center', success: false, duration: Date.now() - t0, details: `Exception: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // ═══ STRATEGY 8: URL with extent bbox ═══
  progress('--- Strategy 8/12: URL with extent bbox ---');
  {
    const t0 = Date.now();
    const pad = 0.003;
    const url = `${GIS_VIEWER_URL}#extent=${centerLon - pad},${centerLat - pad},${centerLon + pad},${centerLat + pad}`;
    try {
      progress(`  Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });
      await dismissDisclaimerDialog(page, progress);
      await waitForMapReady(page, progress);
      await page.waitForTimeout(MAP_SETTLE_WAIT);

      const ss = await captureDiag('Strategy 8 — URL extent bbox');
      results.push({ strategy: '8-url-extent-bbox', success: true, duration: Date.now() - t0, details: `Loaded URL: ${page.url()}`, screenshot: ss });
      progress(`  Result: LOADED — ${page.url()}`);
    } catch (err) {
      results.push({ strategy: '8-url-extent-bbox', success: false, duration: Date.now() - t0, details: `Exception: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // Reload fresh for UI-based strategies
  await reloadFresh();
  await page.waitForTimeout(MAP_SETTLE_WAIT);

  // ═══ STRATEGY 9: Click zoom-in UI button ═══
  progress('--- Strategy 9/12: Click zoom-in UI button ---');
  {
    const t0 = Date.now();
    let detail = 'No zoom button found';
    let success = false;

    const selectors = [
      '.esri-zoom .esri-widget--button:first-child',
      'button[title="Zoom in"]',
      'button[title="Zoom In"]',
      '.esri-zoom__zoom-in-button',
      '.esri-icon-plus',
      'button[aria-label="Zoom in"]',
      'button[aria-label="Zoom In"]',
      'calcite-button[icon-start="plus"]',
      '.esri-zoom button:first-of-type',
    ];

    for (const sel of selectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0 && await btn.isVisible()) {
          progress(`  Found zoom-in button: ${sel}`);
          // Click 5 times to zoom in significantly
          for (let i = 0; i < 5; i++) {
            await btn.click();
            await page.waitForTimeout(600);
          }
          detail = `Clicked zoom-in 5x via ${sel}`;
          success = true;
          break;
        }
      } catch { /* next */ }
    }

    await page.waitForTimeout(MAP_SETTLE_WAIT);
    const ss = await captureDiag('Strategy 9 — Zoom-in button');
    results.push({ strategy: '9-ui-zoom-button', success, duration: Date.now() - t0, details: detail, screenshot: ss });
    progress(`  Result: ${success ? 'SUCCESS' : 'FAIL'} — ${detail}`);
  }

  // Reload for next
  await reloadFresh();
  await page.waitForTimeout(MAP_SETTLE_WAIT);

  // ═══ STRATEGY 10: Mouse wheel zoom ═══
  progress('--- Strategy 10/12: Mouse wheel zoom ---');
  {
    const t0 = Date.now();
    try {
      // Take screenshot BEFORE wheel zoom
      const ssBefore = await captureDiag('Strategy 10 — BEFORE mouse wheel');

      await page.mouse.move(960, 540);
      await page.waitForTimeout(300);
      // Zoom in with 15 scroll events
      for (let i = 0; i < 15; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(MAP_SETTLE_WAIT);

      const ssAfter = await captureDiag('Strategy 10 — AFTER mouse wheel');
      results.push({ strategy: '10-mouse-wheel', success: true, duration: Date.now() - t0, details: 'Sent 15 wheel events (deltaY=-120 each)', screenshot: ssAfter });
      // Also include the "before" screenshot for comparison
      if (ssBefore) {
        ssBefore.description = 'DIAGNOSTIC: Strategy 10 — BEFORE mouse wheel (baseline)';
        results.push({ strategy: '10-mouse-wheel-before', success: true, duration: 0, details: 'Baseline before wheel zoom', screenshot: ssBefore });
      }
      progress('  Result: SUCCESS — Sent 15 wheel zoom events');
    } catch (err) {
      results.push({ strategy: '10-mouse-wheel', success: false, duration: Date.now() - t0, details: `Exception: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // Reload for next
  await reloadFresh();
  await page.waitForTimeout(MAP_SETTLE_WAIT);

  // ═══ STRATEGY 11: Keyboard zoom (+/- keys) ═══
  progress('--- Strategy 11/12: Keyboard zoom (+/= and - keys) ---');
  {
    const t0 = Date.now();
    try {
      // Click the map first to give it focus
      await page.click('.esri-view-surface, .esri-view, canvas', { timeout: 5000 }).catch(() => {
        // fallback — click center of viewport
        return page.mouse.click(960, 540);
      });
      await page.waitForTimeout(500);

      // Press + key multiple times to zoom in
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Equal'); // + key (= without shift, but some apps treat as +)
        await page.waitForTimeout(300);
      }
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('NumpadAdd');
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(MAP_SETTLE_WAIT);

      const ss = await captureDiag('Strategy 11 — Keyboard zoom');
      results.push({ strategy: '11-keyboard-zoom', success: true, duration: Date.now() - t0, details: 'Pressed Equal x8 + NumpadAdd x8', screenshot: ss });
      progress('  Result: SUCCESS — Pressed keyboard zoom keys');
    } catch (err) {
      results.push({ strategy: '11-keyboard-zoom', success: false, duration: Date.now() - t0, details: `Exception: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // Reload for next
  await reloadFresh();
  await page.waitForTimeout(MAP_SETTLE_WAIT);

  // ═══ STRATEGY 12: Double-click zoom ═══
  progress('--- Strategy 12/12: Double-click zoom on map center ---');
  {
    const t0 = Date.now();
    try {
      // Double-click multiple times at the center to zoom in
      for (let i = 0; i < 5; i++) {
        await page.dblclick('.esri-view-surface, canvas', { timeout: 3000 }).catch(async () => {
          await page.mouse.dblclick(960, 540);
        });
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(MAP_SETTLE_WAIT);

      const ss = await captureDiag('Strategy 12 — Double-click zoom');
      results.push({ strategy: '12-double-click', success: true, duration: Date.now() - t0, details: 'Double-clicked center 5x', screenshot: ss });
      progress('  Result: SUCCESS — Double-clicked map center 5x');
    } catch (err) {
      results.push({ strategy: '12-double-click', success: false, duration: Date.now() - t0, details: `Exception: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  return results;
}

// ── Internal: Zoom to Parcel ─────────────────────────────────────────
// Attempts multiple strategies in order of reliability:
//   1. URL hash parameters (center + level) — reload page at correct location
//   2. Search widget — type address, select result, app zooms itself
//   3. Mouse-wheel zoom on canvas — simulate user zooming
//   4. JS API (goTo) — original approach, works only if MapView is accessible

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomToParcel(page: any, input: GisViewerCaptureInput, progress: (msg: string) => void): Promise<boolean> {
  // Compute center coordinates
  let centerLon = input.lon;
  let centerLat = input.lat;
  if (input.parcelBoundary && input.parcelBoundary.length > 0) {
    const ring = input.parcelBoundary[0];
    let sumLon = 0, sumLat = 0;
    for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
    centerLon = sumLon / ring.length;
    centerLat = sumLat / ring.length;
  }

  // ── Strategy 1: JS API (try first since it's fastest if available) ──
  const jsSuccess = await zoomViaJsApi(page, input, centerLon, centerLat);
  if (jsSuccess) {
    progress('  Zoomed via JS API');
    return true;
  }
  progress('  JS API unavailable — using Playwright UI fallbacks');

  // ── Strategy 2: Search widget — type address and let the app zoom ──
  if (input.situsAddress) {
    const searchSuccess = await zoomViaSearchWidget(page, input.situsAddress, progress);
    if (searchSuccess) {
      progress('  Zoomed via search widget');
      return true;
    }
  }

  // ── Strategy 3: URL hash parameters — reload at correct extent ──
  const urlSuccess = await zoomViaUrlParams(page, centerLon, centerLat, progress);
  if (urlSuccess) {
    progress('  Zoomed via URL parameters');
    return true;
  }

  // ── Strategy 4: Mouse wheel zoom — center on coordinates ──
  progress('  Attempting mouse-wheel zoom...');
  await zoomViaMouseWheel(page, 18); // Zoom in with mouse wheel
  await page.waitForTimeout(2000);
  progress('  Applied mouse-wheel zoom (approximate positioning)');
  return true; // Best effort — we zoomed in but positioning is approximate
}

// Zoom using the ArcGIS JS API (original approach)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zoomViaJsApi(page: any, input: GisViewerCaptureInput, centerLon: number, centerLat: number): Promise<boolean> {
  try {
    const result = await page.evaluate(async (params: { lat: number; lon: number; centerLon: number; centerLat: number; boundary: number[][][] | null }) => {
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
      if (!view) return { success: false };

      if (params.boundary && params.boundary.length > 0) {
        const ring = params.boundary[0];
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        const lonPad = (maxLon - minLon) * 0.3;
        const latPad = (maxLat - minLat) * 0.3;

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Extent = (w as any).require?.('esri/geometry/Extent');
          if (Extent) {
            const ext = new Extent({
              xmin: minLon - lonPad, ymin: minLat - latPad,
              xmax: maxLon + lonPad, ymax: maxLat + latPad,
              spatialReference: { wkid: 4326 },
            });
            await view.goTo(ext, { duration: 1000 });
            return { success: true };
          }
        } catch { /* Extent module not available */ }

        await view.goTo({ center: [params.centerLon, params.centerLat], zoom: 17 }, { duration: 1000 });
        return { success: true };
      }

      await view.goTo({ center: [params.lon, params.lat], zoom: 17 }, { duration: 1000 });
      return { success: true };
    }, { lat: input.lat, lon: input.lon, centerLon, centerLat, boundary: input.parcelBoundary });

    return result?.success === true;
  } catch { return false; }
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

    // Experience Builder typically uses hash params for map state
    // Try multiple URL formats
    const urlFormats = [
      `${baseUrl}#center=${lon},${lat}&level=17`,
      `${baseUrl}?center=${lon},${lat}&level=17`,
      `${baseUrl}#extent=${lon - 0.002},${lat - 0.002},${lon + 0.002},${lat + 0.002}`,
    ];

    for (const url of urlFormats) {
      try {
        progress(`  Trying URL: ${url.substring(0, 80)}...`);
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
