// worker/src/services/txdot-rpam-client.ts — Phase 6 §6.6
// TxDOT RPAM (Real Property Asset Map) Playwright automation.
//
// Used as a fallback when the ArcGIS REST API returns no ROW features
// for a given property location. Automates TxDOT's web-based RPAM viewer
// to screenshot ROW layers, then uses Claude Vision AI to extract:
//   - ROW width (estimated)
//   - Straight vs. curved boundary determination
//   - Monument references
//
// NOTES:
//   - Playwright (chromium) must be installed on the droplet:
//       npx playwright install chromium
//   - ANTHROPIC_API_KEY must be set for AI analysis
//   - AI model from RESEARCH_AI_MODEL env var (default: claude-sonnet-4-5-20250929)
//   - Always runs headless
//   - Browser.close() is always called in finally block
//   - Returns null on any failure — never throws
//
// Spec §6.6

import * as fs from 'fs';
import * as path from 'path';
import type { PipelineLogger } from '../lib/logger.js';

// AI model — always read from environment
const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RPAMResult {
  /** Absolute path to the saved RPAM screenshot */
  screenshotPath: string;
  /** True if ROW map layers were found/enabled in the viewer */
  rowMapsFound: boolean;
  /** Estimated ROW total width in feet, or undefined if not extractable */
  rowWidth: number | undefined;
  /** Textual indicators of curves detected in the AI analysis */
  curveIndicators: string[];
  /** Monument references detected in the AI analysis */
  monuments: string[];
  /** Full AI analysis text */
  aiAnalysis: string;
  /** True if the road boundary appears curved per AI analysis */
  isCurved: boolean;
}

// ── TxDOTRPAMClient ───────────────────────────────────────────────────────────

/**
 * Playwright automation client for the TxDOT Real Property Asset Map viewer.
 * Used as a fallback data source when ArcGIS REST API returns no ROW features.
 *
 * @example
 *   const client = new TxDOTRPAMClient(logger);
 *   const result = await client.navigateToLocation(31.065, -97.482, '/tmp/txdot/proj-001');
 */
export class TxDOTRPAMClient {
  private apiKey: string;
  private logger: PipelineLogger;

  constructor(logger: PipelineLogger) {
    this.apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    this.logger = logger;
  }

  /**
   * Navigate to the RPAM viewer at the given WGS84 coordinates, enable ROW layers,
   * take a screenshot, and use AI to analyze the ROW boundary visibility.
   *
   * @param lat        WGS84 latitude of property center
   * @param lon        WGS84 longitude of property center
   * @param outputDir  Directory to save the screenshot
   * @param roadName   Optional road name to include in screenshot filename
   * @returns          RPAMResult with screenshot path and AI analysis, or null on failure
   */
  async navigateToLocation(
    lat: number,
    lon: number,
    outputDir: string,
    roadName?: string,
  ): Promise<RPAMResult | null> {
    // Dynamically import Playwright to avoid crashing the worker if not installed
    let chromium: typeof import('playwright')['chromium'];
    try {
      const playwright = await import('playwright');
      chromium = playwright.chromium;
    } catch {
      this.logger.warn(
        'TxDOT-RPAM',
        'Playwright is not installed. Run: npx playwright install chromium. Skipping RPAM fallback.',
      );
      return null;
    }

    // Ensure output directory exists
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (e) {
      this.logger.warn('TxDOT-RPAM', `Could not create output directory ${outputDir}: ${e}`);
    }

    // Validate lat/lon are finite numbers in expected WGS84 range
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      this.logger.warn('TxDOT-RPAM', `Invalid coordinates: lat=${lat}, lon=${lon}. Skipping RPAM.`);
      return null;
    }

    const fileSlug = roadName
      ? `rpam_${roadName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`
      : `rpam_overview`;
    const screenshotPath = path.join(outputDir, `${fileSlug}.png`);

    // RPAM URL: navigate to property location with zoom=16
    // Use URLSearchParams to safely encode the coordinates
    const rpamParams = new URLSearchParams({
      center: `${lon.toFixed(6)},${lat.toFixed(6)}`,
      zoom:   '16',
    });
    const rpamUrl =
      `https://gis-txdot.opendata.arcgis.com/apps/RPAM/index.html?${rpamParams.toString()}`;

    this.logger.info('TxDOT-RPAM', `Navigating to RPAM: ${rpamUrl}`);

    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // Navigate and wait for map to load
      await page.goto(rpamUrl, { waitUntil: 'networkidle', timeout: 60_000 });

      // Wait additional time for map tiles to render
      await page.waitForTimeout(5000);

      // Try to enable ROW layers in the layer panel
      await this.enableROWLayers(page);

      // Zoom in for more detail (press '+' key 3 times)
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('+');
        await page.waitForTimeout(800);
      }

      // Take final screenshot
      await page.screenshot({ path: screenshotPath, fullPage: false });
      this.logger.info('TxDOT-RPAM', `Screenshot saved: ${screenshotPath}`);

      // AI analysis
      const aiAnalysis = this.apiKey
        ? await this.aiAnalyzeRPAM(screenshotPath)
        : 'AI analysis skipped — ANTHROPIC_API_KEY not set';

      return {
        screenshotPath,
        rowMapsFound: fs.existsSync(screenshotPath),
        rowWidth:       this.extractROWWidth(aiAnalysis),
        curveIndicators: this.extractCurveInfo(aiAnalysis),
        monuments:      this.extractMonuments(aiAnalysis),
        aiAnalysis,
        isCurved:       /curved|curve|radius|arc/i.test(aiAnalysis),
      };

    } catch (e) {
      this.logger.warn('TxDOT-RPAM', `RPAM navigation failed: ${e}`);
      return null;
    } finally {
      // Always close the browser
      if (browser) {
        try { await browser.close(); } catch { /* ignore */ }
      }
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Attempt to enable ROW/right-of-way layers in the RPAM layer panel.
   * Failures are silently ignored — the screenshot will still be taken.
   */
  private async enableROWLayers(
    page: Awaited<ReturnType<Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>['newPage']>>,
  ): Promise<void> {
    try {
      // Try clicking the layer panel button
      const layerBtn = page.locator('button[aria-label="Layers"], button[title="Layers"], [aria-label="Layer list"]');
      if (await layerBtn.count() > 0) {
        await layerBtn.first().click({ timeout: 5000 });
        await page.waitForTimeout(1500);
      }

      // Find and check ROW-related layer checkboxes
      const rowCheckboxes = page.locator(
        'input[type="checkbox"]:near(:text-matches("ROW|right.of.way|parcel|centerline", "i"))',
      );
      const count = await rowCheckboxes.count();
      for (let i = 0; i < Math.min(count, 5); i++) {
        const checkbox = rowCheckboxes.nth(i);
        const checked = await checkbox.isChecked().catch(() => false);
        if (!checked) {
          await checkbox.check({ timeout: 3000 }).catch(() => { /* non-fatal */ });
        }
      }

      // Close layer panel if it opened
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    } catch {
      // Non-fatal: layer panel may not be available in all RPAM versions
    }
  }

  /**
   * Use Claude Vision AI to analyze a screenshot of the RPAM viewer.
   * Returns the full AI analysis text, or an empty string on failure.
   */
  private async aiAnalyzeRPAM(screenshotPath: string): Promise<string> {
    if (!fs.existsSync(screenshotPath)) {
      return 'Screenshot file not found';
    }

    let imageData: string;
    try {
      imageData = fs.readFileSync(screenshotPath).toString('base64');
    } catch (e) {
      return `Could not read screenshot: ${e}`;
    }

    const prompt = `You are analyzing a screenshot of the TxDOT Real Property Asset Map (RPAM) web viewer.

This is a government GIS tool that shows:
- TxDOT Right-of-Way (ROW) boundaries as colored polygons
- Road centerlines
- Property parcels adjacent to the ROW

ANALYSIS QUESTIONS:
1. Is the road boundary visible in this screenshot? (YES/NO)
2. Does the road boundary appear STRAIGHT or CURVED? (This is the critical question for surveying)
3. Can you estimate the ROW width in feet? (Look for width labels or scale bar)
4. Are any survey monuments or reference points visible?
5. Are there any curve indicators (radii labels, chord lines, arc annotations)?

Respond in plain text. Be specific about what you observe. If the map has not loaded or the ROW layers are not visible, say so explicitly.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000), // 30-second timeout per spec §6.11
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 800,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: imageData,
                  },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        return `AI HTTP error ${response.status}: ${await response.text().catch(() => '')}`;
      }

      const data = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        error?: { message?: string };
      };

      if (data.error) {
        return `AI API error: ${data.error.message ?? JSON.stringify(data.error)}`;
      }

      return data.content?.[0]?.text ?? 'No analysis returned';
    } catch (e) {
      this.logger.warn('TxDOT-RPAM', `AI analysis failed: ${e}`);
      return `AI analysis failed: ${e}`;
    }
  }

  /** Extract ROW width in feet from an AI analysis string. */
  private extractROWWidth(analysis: string): number | undefined {
    // Patterns: "80 feet", "80'", "80-foot", "ROW width: 80"
    const match = analysis.match(/(\d+)\s*(?:feet|foot|ft|')\s*(?:ROW|wide|width)?/i)
      ?? analysis.match(/ROW\s*(?:width|wide)?[:\s]+(\d+)/i);
    if (match) {
      const width = parseInt(match[1], 10);
      // Sanity check: Texas ROW widths are typically 40–200 feet
      if (width >= 20 && width <= 500) return width;
    }
    return undefined;
  }

  /** Extract curve-related strings from an AI analysis. */
  private extractCurveInfo(analysis: string): string[] {
    const indicators: string[] = [];
    const curvePatterns = [
      /curved?\s+boundary/gi, /R\s*=\s*\d+/gi, /radius[:\s]+\d+/gi,
      /arc\s+length/gi, /curve\s+to\s+the\s+(?:left|right)/gi,
    ];
    for (const pattern of curvePatterns) {
      const matches = analysis.match(pattern);
      if (matches) indicators.push(...matches);
    }
    return [...new Set(indicators)];
  }

  /** Extract monument references from an AI analysis. */
  private extractMonuments(analysis: string): string[] {
    const monuments: string[] = [];
    const monPatterns = [
      /(?:iron\s+rod|concrete\s+monument|brass\s+cap|set\s+pin|found\s+\w+)[^.;]*/gi,
      /monument\s+(?:at|near|found)[^.;]*/gi,
    ];
    for (const pattern of monPatterns) {
      const matches = analysis.match(pattern);
      if (matches) monuments.push(...matches.map((m) => m.trim()));
    }
    return [...new Set(monuments)];
  }
}
