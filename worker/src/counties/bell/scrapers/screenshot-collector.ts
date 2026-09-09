/**
 * Bell County Screenshot Collector
 *
 * Captures full-page screenshots of every page visited during research.
 * Screenshots serve three purposes:
 *   1. User verification — see exactly what the system saw
 *   2. System improvement — AI analyzes for unexploited features
 *   3. Audit trail — debug failures after the fact
 *
 * Uses Playwright for rendering pages and capturing screenshots.
 */

import { TIMEOUTS } from '../config/endpoints.js';
import { hostCircuit, tripHost } from '../../../infra/host-circuit.js';
import type { ScreenshotCapture } from '../types/research-result.js';
import { acquireBrowser } from '../../../lib/browser-factory.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ScreenshotRequest {
  url: string;
  source: string;
  description: string;
  /** Wait for a specific selector before capturing */
  waitForSelector?: string;
  /** Additional wait time after page load (ms) */
  additionalWait?: number;
  /** Capture full page or just viewport */
  fullPage?: boolean;
}

export interface ScreenshotCollectorProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Capture screenshots of multiple URLs.
 * Manages a single Playwright browser instance for efficiency.
 */
export async function captureScreenshots(
  requests: ScreenshotRequest[],
  onProgress: (p: ScreenshotCollectorProgress) => void,
): Promise<ScreenshotCapture[]> {
  const results: ScreenshotCapture[] = [];

  if (requests.length === 0) return results;

  const progress = (msg: string) => {
    onProgress({ phase: 'Screenshots', message: msg, timestamp: new Date().toISOString() });
  };

  progress(`Capturing ${requests.length} screenshot(s)...`);

  let browser;
  try {
    // Dynamic import — Playwright may not be available in all environments
    browser = await acquireBrowser({
      adapterId: 'bell-clerk',
      launchOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    for (const req of requests) {
      // ── A HOST THAT DID NOT ANSWER IS NOT ASKED AGAIN AT 45 s A TIME ──────────────────────
      //
      // On 2026-09-06 the CAD circuit had been open since Phase 1 (esearch.bellcad.org never
      // answered), yet this loop still tried three CAD screenshots at the full navigation
      // timeout each — 135 s of a capped run spent on a host the run already knew was down.
      const circuit = hostCircuit(req.url, undefined, 'browser');
      if (circuit.down) {
        progress(`Skipping ${req.description} — ${new URL(req.url).host} did not answer ${Math.round((circuit.ageMs ?? 0) / 1000)}s ago (${circuit.reason ?? 'no answer'}); not retrying until the circuit reopens.`);
        continue;
      }
      try {
        progress(`Capturing: ${req.description} (${req.url.substring(0, 80)}...)`);

        const page = await context.newPage();
        await page.goto(req.url, {
          waitUntil: 'networkidle',
          timeout: TIMEOUTS.playwrightNavigation,
        });

        if (req.waitForSelector) {
          await page.waitForSelector(req.waitForSelector, {
            timeout: TIMEOUTS.playwrightAction,
          }).catch(() => { /* selector may not exist */ });
        }

        // Always wait at least 7 seconds to ensure the page has fully loaded
        // (PDF viewers, image viewers, SPAs, and lazy content need time to render)
        const minWait = 7_000;
        const wait = Math.max(req.additionalWait ?? 0, minWait);
        await page.waitForTimeout(wait);

        // Capture visible page text for screenshot classification
        let pageText = '';
        try {
          pageText = await page.evaluate(() => {
            const body = document.body?.innerText || '';
            return body.substring(0, 500).trim();
          });
        } catch { /* page may not support evaluate */ }

        const buffer = await page.screenshot({
          fullPage: req.fullPage ?? true,
          type: 'png',
          timeout: TIMEOUTS.screenshotCapture,
        });

        results.push({
          source: req.source,
          url: req.url,
          imageBase64: buffer.toString('base64'),
          capturedAt: new Date().toISOString(),
          description: describeCapturedPage(req.url, pageText) ?? req.description,
          pageText: pageText || undefined,
        });

        await page.close();
      } catch (err) {
        progress(`Failed to capture ${req.description}: ${err instanceof Error ? err.message : String(err)}`);
        // A navigation timeout trips the host's circuit so the NEXT request to it is skipped.
        tripHost(req.url, err, undefined, 'browser');
      }
    }

    await context.close();
  } catch (err) {
    progress(`Screenshot collector error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  progress(`Captured ${results.length} of ${requests.length} screenshot(s)`);
  return results;
}

/**
 * Capture a single screenshot from an already-open Playwright page.
 * Used by scrapers that already have a browser open.
 */
export async function capturePageScreenshot(
  page: { screenshot: (opts: Record<string, unknown>) => Promise<Buffer>; url: () => string; waitForTimeout?: (ms: number) => Promise<void> },
  source: string,
  description: string,
): Promise<ScreenshotCapture | null> {
  try {
    // Wait for dynamic content to finish rendering before capture
    if (page.waitForTimeout) {
      await page.waitForTimeout(5_000);
    }
    const buffer = await page.screenshot({
      fullPage: true,
      type: 'png',
      timeout: TIMEOUTS.screenshotCapture,
    });

    return {
      source,
      url: page.url(),
      imageBase64: buffer.toString('base64'),
      capturedAt: new Date().toISOString(),
      description,
    };
  } catch {
    return null;
  }
}

/**
 * Build a list of screenshot requests from all URLs visited during research.
 * Filters out API/JSON endpoints (only screenshot HTML pages).
 */
/**
 * A name for a captured page that says what it shows. "research: /results" named three different
 * clerk searches the same way (run 7, 2026-09-08); the page's own text says which search and how
 * many results, and the URL says which site. Null when the page is not one this knows.
 */
export function describeCapturedPage(url: string, pageText: string | undefined): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const text = (pageText ?? '').replace(/\s+/g, ' ');
  const host = u.hostname.toLowerCase();
  if (host.endsWith('publicsearch.us')) {
    if (u.pathname.startsWith('/results')) {
      // The quick search carries its term as searchValue; the index search as q.
      const q = u.searchParams.get('q') ?? u.searchParams.get('searchValue') ?? (text.match(/results for "([^"]+)"/i)?.[1] ?? '');
      const count = text.match(/\b\d+\s*-\s*\d+ of (\d+) results?/i)?.[1];
      const outcome = /no results found/i.test(text) ? 'no results' : count ? `${count} result${count === '1' ? '' : 's'}` : 'results';
      return `Clerk search — "${q || '?'}" — ${outcome}`;
    }
    const doc = u.pathname.match(/^\/doc\/(\d+)/);
    if (doc) return `Clerk document viewer — ${doc[1]}`;
    if (u.pathname === '/') return 'Clerk records — home page';
  }
  if (host.includes('bellcad.org')) {
    const view = u.pathname.match(/\/Property\/View\/(\d+)/i);
    if (view) return /an error occurred/i.test(text) ? `Bell CAD property page — ${view[1]} — error page` : `Bell CAD property page — ${view[1]}`;
    if (u.pathname.startsWith('/search/result')) {
      const kw = (u.searchParams.get('keywords') ?? '').replace(/PropertyType:\S*/i, '').trim();
      const total = text.match(/Total:\s*(\d+)/i)?.[1];
      return `Bell CAD search — ${kw || '?'}${total !== undefined ? ` — ${total} result${total === '1' ? '' : 's'}` : ''}`;
    }
    if (u.pathname === '/') return 'Bell CAD — home page';
  }
  return null;
}

export function buildScreenshotRequests(
  urlsVisited: string[],
  source: string,
): ScreenshotRequest[] {
  const seen = new Set<string>();
  const requests: ScreenshotRequest[] = [];

  for (const url of urlsVisited) {
    // Skip API/JSON endpoints
    if (url.includes('/query?') || url.includes('f=json') || url.includes('/rest/services/')) {
      continue;
    }
    // Skip already-seen URLs
    if (seen.has(url)) continue;
    seen.add(url);

    requests.push({
      url,
      source,
      description: `${source}: ${new URL(url).pathname}`,
      fullPage: true,
    });
  }

  return requests;
}
