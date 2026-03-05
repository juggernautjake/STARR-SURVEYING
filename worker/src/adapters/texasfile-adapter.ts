// worker/src/adapters/texasfile-adapter.ts
// Phase 2 (TODO): TexasFileAdapter — universal fallback for all 254 Texas counties.
//
// TexasFile.com provides an index-only view for every Texas county clerk system.
// Free access returns metadata only (no document images); $1/page for images.
//
// Architecture:
//   - SPA (React) — requires Playwright
//   - Universal coverage: works for any Texas county
//   - Free: instrument numbers, dates, grantor/grantee, doc types
//   - Paid: $1/page for un-watermarked images (wallet-based payment)
//   - API endpoint: https://www.texasfile.com/api/search (authenticated)
//
// This adapter is used as a fallback when no county-specific adapter exists
// (CountyFusion, Kofile, Tyler, etc.) and provides index-level data to
// identify which instrument numbers exist before handing off to purchase.
//
// Spec §2.7 — TexasFile Universal Fallback Adapter
// Status: STUB — full implementation is a Phase 2 TODO

import { chromium } from 'playwright';
import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type DocumentImage,
  type PricingInfo,
  type ClerkSearchOptions,
} from './clerk-adapter.js';

export class TexasFileAdapter extends ClerkAdapter {
  /** Per-page price for TexasFile document purchases */
  private static readonly PRICE_PER_PAGE = 1.00;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  async initSession(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1920, height: 1080 },
    });

    this.page = await context.newPage();
  }

  async destroySession(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  // ── Search methods (TODO: full implementation) ────────────────────────────────

  async searchByInstrumentNumber(
    instrumentNo: string,
  ): Promise<ClerkDocumentResult[]> {
    // TODO: implement TexasFile instrument search
    // URL pattern: https://www.texasfile.com/search?county=FIPS&instrno=XXXXX
    console.warn(
      `[TexasFile/${this.countyName}] searchByInstrumentNumber not yet implemented`,
    );
    return [];
  }

  async searchByVolumePage(
    volume: string,
    page: string,
  ): Promise<ClerkDocumentResult[]> {
    // TODO: implement TexasFile volume/page search
    console.warn(
      `[TexasFile/${this.countyName}] searchByVolumePage not yet implemented`,
    );
    return [];
  }

  async searchByGranteeName(
    name: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    // TODO: implement TexasFile grantee name search
    // URL pattern: https://www.texasfile.com/search?county=FIPS&grantee=NAME
    console.warn(
      `[TexasFile/${this.countyName}] searchByGranteeName not yet implemented`,
    );
    return [];
  }

  async searchByGrantorName(
    name: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    // TODO: implement TexasFile grantor name search
    console.warn(
      `[TexasFile/${this.countyName}] searchByGrantorName not yet implemented`,
    );
    return [];
  }

  async searchByLegalDescription(
    legalDesc: string,
    _options?: ClerkSearchOptions,
  ): Promise<ClerkDocumentResult[]> {
    // TexasFile does not support legal-description full-text search in the free tier
    console.warn(
      `[TexasFile/${this.countyName}] Legal description search not supported`,
    );
    return [];
  }

  // ── Document access (TODO: full implementation) ───────────────────────────────

  async getDocumentImages(_instrumentNo: string): Promise<DocumentImage[]> {
    // TODO: implement TexasFile image retrieval (requires wallet / purchase)
    // Stub returns empty — caller should check purchaseAvailable in PricingInfo
    console.warn(
      `[TexasFile/${this.countyName}] getDocumentImages not yet implemented — ` +
      `use getDocumentPricing() to check cost, then implement purchase flow`,
    );
    return [];
  }

  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    // TexasFile charges $1.00/page universally across all Texas counties
    // TODO: query the TexasFile API to get actual page count for this instrument
    return {
      available: true,
      pricePerPage: TexasFileAdapter.PRICE_PER_PAGE,
      paymentMethod: 'wallet',
      source: `texasfile_${this.countyFIPS}`,
    };
  }
}
