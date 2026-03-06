// worker/src/services/purchase-adapters/texasfile-purchase-adapter.ts — Phase 9 §9.4
// TexasFile statewide document purchase adapter.
// Provides access to documents from all 254 Texas counties at $1/page.
// Used as fallback when county-specific Kofile adapter is unavailable.
//
// Spec §9.4 — TexasFile Purchase Adapter

import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import type {
  DocumentPurchaseResult,
  ImageQuality,
  TexasFileCredentials,
} from '../../types/purchase.js';

// ── TexasFile Purchase Adapter ──────────────────────────────────────────────

export class TexasFilePurchaseAdapter {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private credentials: TexasFileCredentials;
  private outputDir: string;

  constructor(credentials: TexasFileCredentials, outputDir: string) {
    this.credentials = credentials;
    this.outputDir = outputDir;
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // ── Session Management ──────────────────────────────────────────────────

  async initSession(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    this.page = await context.newPage();

    console.log(`[TexasFile] Logging in...`);
    await this.page.goto('https://www.texasfile.com/login', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await this.page.waitForTimeout(2000);

    const userInput = await this.page.$(
      'input[name="username"], input[type="email"]',
    );
    const passInput = await this.page.$('input[type="password"]');
    const loginBtn = await this.page.$(
      'button[type="submit"], input[type="submit"]',
    );

    if (userInput && passInput && loginBtn) {
      await userInput.fill(this.credentials.username);
      await passInput.fill(this.credentials.password);
      await loginBtn.click();
      await this.page.waitForTimeout(3000);
      console.log(`[TexasFile] ✓ Logged in`);
    }
  }

  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  // ── Purchase Flow ───────────────────────────────────────────────────────

  async purchaseDocument(
    county: string,
    instrumentNumber: string,
    documentType: string,
  ): Promise<DocumentPurchaseResult> {
    if (!this.page) throw new Error('Session not initialized');

    const result: DocumentPurchaseResult = {
      instrument: instrumentNumber,
      documentType,
      source: `texasfile:${county}`,
      status: 'failed',
      pages: 0,
      costPerPage: 1.0,
      totalCost: 0,
      paymentMethod: 'texasfile_wallet',
      transactionId: null,
      downloadedImages: [],
      imageQuality: { format: 'unknown', hasWatermark: true, qualityScore: 0 },
    };

    try {
      // Navigate to county search on TexasFile
      const countySlug = county.toLowerCase().replace(/\s+/g, '-');
      await this.page.goto(
        `https://www.texasfile.com/search/${countySlug}`,
        { waitUntil: 'networkidle', timeout: 30000 },
      );
      await this.page.waitForTimeout(2000);

      // Search by instrument number
      const searchInput = await this.page.$(
        'input[name="instrument"], input[placeholder*="nstrument"]',
      );
      if (searchInput) {
        await searchInput.fill(instrumentNumber);
        const searchBtn = await this.page.$(
          'button:has-text("Search"), button[type="submit"]',
        );
        if (searchBtn) await searchBtn.click();
        await this.page.waitForTimeout(5000);
      }

      // Find the document
      const docLink = await this.page.$(
        `a:has-text("${instrumentNumber}"), [data-instrument="${instrumentNumber}"]`,
      );
      if (!docLink) {
        result.status = 'not_available';
        result.error = `Document ${instrumentNumber} not found on TexasFile for ${county} County`;
        return result;
      }

      await docLink.click();
      await this.page.waitForTimeout(3000);

      // Get pricing info
      const priceEl = await this.page.$('.price, .cost, [data-price]');
      const priceText = priceEl ? await priceEl.textContent() : '';
      const priceMatch = priceText?.match(/\$(\d+\.?\d*)/);
      result.totalCost = priceMatch ? parseFloat(priceMatch[1]) : 0;

      // Purchase
      const buyBtn = await this.page.$(
        'button:has-text("Purchase"), button:has-text("Download"), button:has-text("Buy")',
      );
      if (buyBtn) {
        await buyBtn.click();
        await this.page.waitForTimeout(5000);

        // Confirm if prompted
        const confirmBtn = await this.page.$(
          'button:has-text("Confirm"), button:has-text("Yes")',
        );
        if (confirmBtn) {
          await confirmBtn.click();
          await this.page.waitForTimeout(5000);
        }
      }

      // Download images
      const downloadLinks = await this.page.$$(
        'a[href*="download"], a[href*=".pdf"], a[href*=".tiff"]',
      );
      for (let i = 0; i < downloadLinks.length; i++) {
        const href = await downloadLinks[i].getAttribute('href');
        if (!href) continue;

        const ext = href.includes('.pdf')
          ? 'pdf'
          : href.includes('.tiff')
            ? 'tiff'
            : 'png';
        const filename = `${documentType}_${instrumentNumber}_p${i + 1}_official.${ext}`;
        const filePath = path.join(this.outputDir, filename);

        // Trigger download
        const [download] = await Promise.all([
          this.page
            .waitForEvent('download', { timeout: 30000 })
            .catch(() => null),
          downloadLinks[i].click(),
        ]);

        if (download) {
          await download.saveAs(filePath);
          result.downloadedImages.push(filePath);
        }

        await this.page.waitForTimeout(1000);
      }

      result.pages = result.downloadedImages.length;
      result.costPerPage = 1.0;
      if (result.pages > 0 && result.totalCost === 0) {
        result.totalCost = result.pages * 1.0;
      }
      result.status =
        result.downloadedImages.length > 0 ? 'purchased' : 'failed';
      result.imageQuality = {
        format: 'TIFF',
        hasWatermark: false,
        qualityScore: 90,
      };
      result.transactionId = `TF-${instrumentNumber}-${Date.now()}`;
    } catch (error: any) {
      result.error = error.message;
      console.error(`[TexasFile] ✗ Failed: ${error.message}`);
    }

    return result;
  }
}
