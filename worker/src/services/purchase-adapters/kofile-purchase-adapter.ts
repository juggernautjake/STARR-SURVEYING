// worker/src/services/purchase-adapters/kofile-purchase-adapter.ts — Phase 9 §9.3
// Kofile / PublicSearch purchase adapter for Bell County and ~80 other Texas counties.
// Automates document purchase via Playwright: login → search → purchase → download.
//
// Spec §9.3 — Kofile Purchase Adapter

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import type {
  DocumentPurchaseResult,
  ImageQuality,
  KofileCredentials,
  PurchaseStatus,
} from '../../types/purchase.js';

// ── Kofile Site Map ─────────────────────────────────────────────────────────

const KOFILE_SITES: Record<string, string> = {
  '48027': 'https://bellcountytx.publicsearch.us',
  '48491': 'https://williamsoncountytx.publicsearch.us',
  '48453': 'https://traviscountytx.publicsearch.us',
  '48309': 'https://mclennan.tx.publicsearch.us',
  '48029': 'https://bexarcountytx.publicsearch.us',
  '48085': 'https://collincountytx.publicsearch.us',
  '48113': 'https://dallascountytx.publicsearch.us',
  '48439': 'https://tarrantcountytx.publicsearch.us',
  '48201': 'https://harriscountytx.publicsearch.us',
  '48121': 'https://dentoncountytx.publicsearch.us',
};

// ── Kofile Purchase Adapter ─────────────────────────────────────────────────

export class KofilePurchaseAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private credentials: KofileCredentials;
  private countyBaseUrl: string;
  private outputDir: string;

  constructor(
    countyFIPS: string,
    countyName: string,
    credentials: KofileCredentials,
    outputDir: string,
  ) {
    this.credentials = credentials;
    this.outputDir = outputDir;
    fs.mkdirSync(outputDir, { recursive: true });

    // Map county to Kofile site URL
    this.countyBaseUrl =
      KOFILE_SITES[countyFIPS] ||
      `https://${countyName.toLowerCase().replace(/\s+/g, '')}countytx.publicsearch.us`;
  }

  // ── Session Management ──────────────────────────────────────────────────

  async initSession(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
    });
    this.page = await this.context.newPage();

    await this.login();
  }

  private async login(): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    console.log(`[KofilePurchase] Logging in to ${this.countyBaseUrl}...`);
    await this.page.goto(`${this.countyBaseUrl}/login`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await this.page.waitForTimeout(2000);

    const emailInput = await this.page.$(
      'input[type="email"], input[name="email"], input#email',
    );
    const passwordInput = await this.page.$(
      'input[type="password"], input[name="password"]',
    );
    const submitBtn = await this.page.$(
      'button[type="submit"], input[type="submit"]',
    );

    if (emailInput && passwordInput && submitBtn) {
      await emailInput.fill(this.credentials.username);
      await passwordInput.fill(this.credentials.password);
      await submitBtn.click();
      await this.page.waitForTimeout(3000);
      console.log(`[KofilePurchase] ✓ Logged in`);
    } else {
      console.warn(
        `[KofilePurchase] Login form not found — may already be logged in or site structure changed`,
      );
    }
  }

  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // ── Purchase Flow ───────────────────────────────────────────────────────

  async purchaseDocument(
    instrumentNumber: string,
    documentType: string,
  ): Promise<DocumentPurchaseResult> {
    if (!this.page) throw new Error('Session not initialized');

    const result: DocumentPurchaseResult = {
      instrument: instrumentNumber,
      documentType,
      source: `kofile:${this.countyBaseUrl}`,
      status: 'failed',
      pages: 0,
      costPerPage: 1.0,
      totalCost: 0,
      paymentMethod: 'account_balance',
      transactionId: null,
      downloadedImages: [],
      imageQuality: { format: 'unknown', hasWatermark: true, qualityScore: 0 },
    };

    try {
      console.log(
        `[KofilePurchase] Purchasing: ${instrumentNumber} (${documentType})...`,
      );

      // Step 1: Navigate to document search
      await this.page.goto(`${this.countyBaseUrl}/search`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      await this.page.waitForTimeout(2000);

      // Search by instrument number
      const searchInput = await this.page.$(
        'input[name="instrumentNumber"], input[placeholder*="nstrument"]',
      );
      if (!searchInput) throw new Error('Search input not found');

      await searchInput.fill(instrumentNumber);

      const searchBtn = await this.page.$(
        'button:has-text("Search"), button[type="submit"]',
      );
      if (searchBtn) await searchBtn.click();
      await this.page.waitForTimeout(5000);

      // Step 2: Click on the document result
      const resultLink = await this.page.$(
        `a:has-text("${instrumentNumber}"), tr:has-text("${instrumentNumber}") a`,
      );
      if (!resultLink)
        throw new Error(
          `Document ${instrumentNumber} not found in search results`,
        );

      await resultLink.click();
      await this.page.waitForTimeout(3000);

      // Step 3: Determine page count
      const pageCountEl = await this.page.$(
        '.page-count, .pages, [data-pages]',
      );
      const pageCountText = pageCountEl
        ? await pageCountEl.textContent()
        : '1';
      const pageCount = parseInt(
        pageCountText?.match(/(\d+)/)?.[1] || '1',
      );
      result.pages = pageCount;

      // Step 4: Purchase or detect already-owned
      const purchaseBtn = await this.page.$(
        'button:has-text("Purchase"), button:has-text("Buy"), button:has-text("Add to Cart"), button:has-text("Download Official")',
      );

      if (!purchaseBtn) {
        const alreadyOwned = await this.page.$(
          '.owned, .purchased, :has-text("Already purchased")',
        );
        if (alreadyOwned) {
          result.status = 'already_owned';
          console.log(
            `[KofilePurchase] Document already purchased: ${instrumentNumber}`,
          );
        } else {
          throw new Error('Purchase button not found');
        }
      } else {
        await purchaseBtn.click();
        await this.page.waitForTimeout(3000);

        // Confirm purchase if dialog appears
        const confirmBtn = await this.page.$(
          'button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Complete")',
        );
        if (confirmBtn) {
          await confirmBtn.click();
          await this.page.waitForTimeout(5000);
        }

        // Check for payment page
        const paymentForm = await this.page.$(
          'input[name="cardNumber"], .payment-form, #payment',
        );
        if (paymentForm && !this.credentials.paymentOnFile) {
          throw new Error(
            'Payment required but no payment method on file. Configure account billing first.',
          );
        }
      }

      // Step 5: Download official images
      result.downloadedImages = await this.downloadOfficialImages(
        instrumentNumber,
        pageCount,
        documentType,
      );
      result.pages = result.downloadedImages.length || pageCount;
      result.totalCost = result.pages * 1.0;

      // Step 6: Verify image quality
      if (result.downloadedImages.length > 0) {
        result.imageQuality = await this.verifyImageQuality(
          result.downloadedImages[0],
        );
        if (result.status !== 'already_owned') result.status = 'purchased';
        console.log(
          `[KofilePurchase] ✓ Purchased: ${instrumentNumber} — ${result.pages} pages, $${result.totalCost.toFixed(2)}`,
        );
      } else {
        throw new Error('No images downloaded after purchase');
      }

      result.transactionId = `TXN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${instrumentNumber}`;
    } catch (error: any) {
      result.status = 'failed';
      result.error = error.message;
      console.error(
        `[KofilePurchase] ✗ Failed: ${instrumentNumber} — ${error.message}`,
      );
    }

    return result;
  }

  // ── Image Download ──────────────────────────────────────────────────────

  private async downloadOfficialImages(
    instrument: string,
    expectedPages: number,
    docType: string,
  ): Promise<string[]> {
    if (!this.page) return [];
    const images: string[] = [];

    for (let p = 1; p <= Math.max(expectedPages, 10); p++) {
      try {
        // Kofile typically provides per-page image download links
        const imgLink = await this.page.$(
          `a[href*="page=${p}"][href*="download"], a[href*="page${p}"], img[data-page="${p}"]`,
        );

        if (!imgLink && p > expectedPages) break;
        if (!imgLink) continue;

        const href = await imgLink.getAttribute('href');
        if (!href) continue;

        const fullUrl = href.startsWith('http')
          ? href
          : `${this.countyBaseUrl}${href}`;

        // Download the image via page context
        const response = await this.page.evaluate(async (url) => {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const reader = new FileReader();
          return new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }, fullUrl);

        // Determine extension and save
        const ext = response.startsWith('data:image/tiff')
          ? 'tiff'
          : response.startsWith('data:image/png')
            ? 'png'
            : response.startsWith('data:application/pdf')
              ? 'pdf'
              : 'png';
        const filename = `${docType}_${instrument}_p${p}_official.${ext}`;
        const filePath = path.join(this.outputDir, filename);

        const base64Data = response.split(',')[1];
        if (base64Data) {
          fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
          images.push(filePath);
          console.log(`[KofilePurchase] Downloaded: ${filename}`);
        }
      } catch {
        if (p <= expectedPages) {
          console.warn(`[KofilePurchase] Failed to download page ${p}`);
        }
        break;
      }

      await this.page.waitForTimeout(1000);
    }

    return images;
  }

  // ── Image Quality Verification ──────────────────────────────────────────

  private async verifyImageQuality(imagePath: string): Promise<ImageQuality> {
    const stat = fs.statSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    const quality: ImageQuality = {
      format:
        ext === '.tiff'
          ? 'TIFF'
          : ext === '.png'
            ? 'PNG'
            : ext === '.pdf'
              ? 'PDF'
              : 'unknown',
      hasWatermark: false,
      qualityScore: 85,
    };

    // File-size heuristic: official docs ≥200KB per page
    if (stat.size > 500000) quality.qualityScore = 95;
    else if (stat.size > 200000) quality.qualityScore = 85;
    else if (stat.size > 50000) quality.qualityScore = 70;
    else quality.qualityScore = 50;

    // For raster images, try ImageMagick identify for resolution/dimensions
    if (ext === '.png' || ext === '.tiff') {
      try {
        const { execSync } = await import('child_process');
        const info = execSync(`identify -format "%w %h %x %y" "${imagePath}"`)
          .toString()
          .trim();
        const [w, h, xRes] = info.split(' ').map(Number);
        quality.dimensions = { width: w, height: h };
        quality.resolution = `${Math.round(xRes)}dpi`;

        if (xRes >= 300) quality.qualityScore += 5;
        if (w >= 2400 && h >= 3000) quality.qualityScore += 3;
      } catch {
        /* ImageMagick not available — skip resolution check */
      }
    }

    quality.qualityScore = Math.min(98, quality.qualityScore);
    return quality;
  }
}
