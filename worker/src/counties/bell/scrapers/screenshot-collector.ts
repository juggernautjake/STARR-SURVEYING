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

import { TIMEOUTS } from '../config/endpoints';
import type { ScreenshotCapture } from '../types/research-result';

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
    const pw = await import('playwright');
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    for (const req of requests) {
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

        if (req.additionalWait) {
          await page.waitForTimeout(req.additionalWait);
        }

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
          description: req.description,
        });

        await page.close();
      } catch (err) {
        progress(`Failed to capture ${req.description}: ${err instanceof Error ? err.message : String(err)}`);
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
  page: { screenshot: (opts: Record<string, unknown>) => Promise<Buffer>; url: () => string },
  source: string,
  description: string,
): Promise<ScreenshotCapture | null> {
  try {
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
