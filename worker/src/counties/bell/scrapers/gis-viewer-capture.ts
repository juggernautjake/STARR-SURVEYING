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
/** 6-second render wait — gives tiles, layers, and lines time to fully draw */
const RENDER_WAIT = 6_000;
/** Extra wait after layer toggle — layers need time to redraw */
const LAYER_TOGGLE_WAIT = 6_000;
/** Wait after page load + disclaimer dismissal before interacting */
const POST_LOAD_WAIT = 4_000;

/** Zoom levels to test (ArcGIS JS API / Experience Builder zoom levels) */
const ZOOM_LEVELS = [25, 23, 21, 19, 17] as const;

/** All 8 layer combinations: parcels (on/off) × lotLines (on/off) × basemap (streets/aerial) */
const LAYER_COMBOS: Array<{
  label: string;
  parcels: boolean;
  lotLines: boolean;
  basemap: 'streets' | 'aerial';
}> = [
  { label: 'Parcels=ON LotLines=ON Basemap=Streets',  parcels: true,  lotLines: true,  basemap: 'streets' },
  { label: 'Parcels=ON LotLines=OFF Basemap=Streets', parcels: true,  lotLines: false, basemap: 'streets' },
  { label: 'Parcels=OFF LotLines=ON Basemap=Streets', parcels: false, lotLines: true,  basemap: 'streets' },
  { label: 'Parcels=OFF LotLines=OFF Basemap=Streets',parcels: false, lotLines: false, basemap: 'streets' },
  { label: 'Parcels=ON LotLines=ON Basemap=Aerial',   parcels: true,  lotLines: true,  basemap: 'aerial' },
  { label: 'Parcels=ON LotLines=OFF Basemap=Aerial',  parcels: true,  lotLines: false, basemap: 'aerial' },
  { label: 'Parcels=OFF LotLines=ON Basemap=Aerial',  parcels: false, lotLines: true,  basemap: 'aerial' },
  { label: 'Parcels=OFF LotLines=OFF Basemap=Aerial', parcels: false, lotLines: false, basemap: 'aerial' },
];

// ── Main Export ──────────────────────────────────────────────────────

export async function captureGisViewerScreenshots(
  input: GisViewerCaptureInput,
  onProgress: (p: GisViewerCaptureProgress) => void,
): Promise<ScreenshotCapture[]> {
  const results: ScreenshotCapture[] = [];

  if (!input.parcelBoundary && !input.lat) {
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

    for (const method of zoomMethods) {
      diagIndex++;
      const label = `[DIAG-${String(diagIndex).padStart(2, '0')}] METHOD: ${method.name} | ${propLabel}`;
      log(`──────────────────────────────────────────────────────────`);
      log(`Starting test ${diagIndex}: ${method.name}`);

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });
      const page = await context.newPage();

      try {
        await method.run(page);
        log(`  Page loaded. URL: ${page.url()}`);

        // Dismiss disclaimer
        log('  Looking for disclaimer dialog...');
        await dismissDisclaimerDialog(page, log);

        // Wait for map
        log('  Waiting for map to initialize...');
        const mapReady = await waitForMapReady(page, log);
        log(`  Map ready: ${mapReady}`);

        // 6-second render wait
        log(`  Waiting ${RENDER_WAIT}ms for tiles/layers to render...`);
        await page.waitForTimeout(RENDER_WAIT);

        // Capture current zoom level
        const currentZoom = await getCurrentZoomLevel(page);
        log(`  Current zoom level reported by map: ${currentZoom ?? 'unknown'}`);

        // Screenshot
        log(`  Taking screenshot: ${label}`);
        const ss = await takeScreenshot(page, 'GIS Diagnostic', label);
        if (ss) {
          results.push(ss);
          log(`  ✓ Screenshot captured (${Math.round(ss.imageBase64.length / 1024)}KB base64)`);
        } else {
          log(`  ✗ Screenshot FAILED`);
        }
      } catch (err) {
        log(`  ✗ ERROR in ${method.name}: ${err instanceof Error ? err.message : String(err)}`);
        // Still try to screenshot the error state
        try {
          const ss = await takeScreenshot(page, 'GIS Diagnostic', `${label} [ERROR]`);
          if (ss) results.push(ss);
        } catch { /* ignore */ }
      }

      await context.close();
      log(`  Context closed. Moving to next method.`);
    }

    log(`Phase A complete: ${results.length} screenshots from ${zoomMethods.length} zoom method tests`);

    // ================================================================
    // PHASE B: LAYER × ZOOM MATRIX — 8 combos × 5 zoom levels = 40
    // ================================================================
    log('═══════════════════════════════════════════════════════════');
    log('PHASE B: LAYER × ZOOM MATRIX — 8 combos × 5 zoom levels');
    log('═══════════════════════════════════════════════════════════');

    for (const zoomLevel of ZOOM_LEVELS) {
      log(`────── ZOOM LEVEL ${zoomLevel} ──────`);

      // Fresh page load for each zoom level
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });
      const page = await context.newPage();

      try {
        // Navigate with URL hash for this zoom level
        const url = `${GIS_VIEWER_URL}#center=${centerLon},${centerLat}&level=${zoomLevel}`;
        log(`  Loading page at zoom ${zoomLevel}: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: VIEWER_LOAD_TIMEOUT });

        log('  Dismissing disclaimer...');
        await dismissDisclaimerDialog(page, log);

        log('  Waiting for map...');
        const mapReady = await waitForMapReady(page, log);
        if (!mapReady) {
          log(`  ✗ Map did not initialize at zoom ${zoomLevel} — skipping layer tests`);
          await context.close();
          continue;
        }

        log(`  Waiting ${POST_LOAD_WAIT}ms post-load settle...`);
        await page.waitForTimeout(POST_LOAD_WAIT);

        const actualZoom = await getCurrentZoomLevel(page);
        log(`  Actual zoom level: ${actualZoom ?? 'unknown'} (requested: ${zoomLevel})`);

        // Test each layer combo at this zoom level
        for (const combo of LAYER_COMBOS) {
          diagIndex++;
          const label = `[DIAG-${String(diagIndex).padStart(2, '0')}] ZOOM=${zoomLevel} | ${combo.label} | ${propLabel}`;
          log(`  ── Test ${diagIndex}: ${combo.label} at zoom ${zoomLevel}`);

          try {
            // Set basemap
            log(`    Setting basemap to ${combo.basemap}...`);
            if (combo.basemap === 'aerial') {
              await switchToAerialBasemap(page, log);
            } else {
              await switchToStreetsBasemap(page, log);
            }

            // Set layer visibility
            log(`    Setting Parcels=${combo.parcels ? 'ON' : 'OFF'}...`);
            await toggleParcelLayer(page, combo.parcels, log);

            log(`    Setting LotLines=${combo.lotLines ? 'ON' : 'OFF'}...`);
            await toggleLotLineLayer(page, combo.lotLines, log);

            // 6-second render wait for layers to draw
            log(`    Waiting ${LAYER_TOGGLE_WAIT}ms for layer render...`);
            await page.waitForTimeout(LAYER_TOGGLE_WAIT);

            // Screenshot
            log(`    Taking screenshot: ${label}`);
            const ss = await takeScreenshot(page, 'GIS Diagnostic', label);
            if (ss) {
              results.push(ss);
              log(`    ✓ Screenshot captured (${Math.round(ss.imageBase64.length / 1024)}KB)`);
            } else {
              log(`    ✗ Screenshot FAILED`);
            }
          } catch (err) {
            log(`    ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`);
            try {
              const ss = await takeScreenshot(page, 'GIS Diagnostic', `${label} [ERROR]`);
              if (ss) results.push(ss);
            } catch { /* ignore */ }
          }
        }
      } catch (err) {
        log(`  ✗ FATAL ERROR at zoom ${zoomLevel}: ${err instanceof Error ? err.message : String(err)}`);
      }

      await context.close();
      log(`  Closed context for zoom ${zoomLevel}`);
    }

    log('═══════════════════════════════════════════════════════════');
    log(`DIAGNOSTIC COMPLETE: ${results.length} total screenshots captured`);
    log(`  Phase A (zoom methods): ${zoomMethods.length} tests`);
    log(`  Phase B (layer × zoom): ${ZOOM_LEVELS.length} levels × ${LAYER_COMBOS.length} combos = ${ZOOM_LEVELS.length * LAYER_COMBOS.length} tests`);
    log('═══════════════════════════════════════════════════════════');

  } catch (err) {
    log(`FATAL: Browser-level error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (browser) {
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
async function switchToAerialBasemap(page: any, log: (msg: string) => void): Promise<void> {
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

// ── Take Screenshot ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function takeScreenshot(page: any, source: string, description: string): Promise<ScreenshotCapture | null> {
  try {
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
