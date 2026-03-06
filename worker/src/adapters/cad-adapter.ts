// worker/src/adapters/cad-adapter.ts
// Abstract base class for all Texas CAD system adapters.
//
// Each county adapter extends this class and implements the four abstract
// search/detail methods.  Shared utilities (browser lifecycle, AI OCR fallback,
// subdivision detection, match scoring) live here so they only need to be
// written once.
//
// Spec §1.5 — Base Adapter Interface

import { chromium, type Browser, type Page } from 'playwright';
import type { CADConfig } from '../services/cad-registry.js';
import type { AddressVariant } from '../services/address-normalizer.js';

// ── Adapter-level types ────────────────────────────────────────────────────────
// These are the raw scraping types used inside the adapter layer.
// They are richer (volume, page, description) than the canonical DeedReference
// in types/property-discovery.ts which is the final pipeline output type.

export interface PropertySearchResult {
  propertyId: string;
  geoId?: string;
  owner: string;
  situsAddress: string;
  legalDescription: string;
  acreage?: number;
  propertyType: 'real' | 'personal' | 'mineral' | 'unknown';
  assessedValue?: number;
  /** 0–100: how well this result matches the search query */
  matchScore: number;
}

export interface DeedReference {
  instrumentNumber?: string;
  volume?: string;
  page?: string;
  type: 'deed' | 'plat' | 'easement' | 'restriction' | 'lien' | 'other';
  date?: string;
  description?: string;
}

export interface Improvement {
  type: string;     // "Residential", "Commercial", "Barn", etc.
  sqft?: number;
  yearBuilt?: number;
  condition?: string;
}

export interface PropertyDetail {
  propertyId: string;
  geoId?: string;
  owner: string;
  ownerMailingAddress?: string;
  situsAddress: string;
  legalDescription: string;
  acreage: number;
  propertyType: string;
  assessedValue?: number;
  marketValue?: number;
  taxYear?: number;
  abstractSurvey?: string;
  subdivisionName?: string;
  lotNumber?: string;
  blockNumber?: string;
  deedReferences: DeedReference[];
  /** All other lot property IDs found in the same subdivision */
  relatedPropertyIds: string[];
  improvements: Improvement[];
  /** Raw HTML preserved for AI fallback parsing */
  rawHtml?: string;
  screenshotPath?: string;
}

// ── SubdivisionDetection result ───────────────────────────────────────────────

export interface SubdivisionDetection {
  isSubdivision: boolean;
  subdivisionName?: string;
  lotNumber?: string;
  blockNumber?: string;
}

// ── Abstract base class ───────────────────────────────────────────────────────

export abstract class CADAdapter {
  protected config: CADConfig;
  protected browser: Browser | null = null;
  protected page: Page | null = null;

  constructor(config: CADConfig) {
    this.config = config;
  }

  // ── Abstract interface (each adapter must implement) ─────────────────────────

  abstract searchByAddress(variants: AddressVariant[]): Promise<PropertySearchResult[]>;
  abstract searchByOwner(ownerName: string): Promise<PropertySearchResult[]>;
  abstract getPropertyDetail(propertyId: string): Promise<PropertyDetail>;
  abstract findSubdivisionLots(subdivisionName: string): Promise<PropertySearchResult[]>;

  // ── Browser lifecycle ────────────────────────────────────────────────────────

  async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
        viewport: { width: 1920, height: 1080 },
      });
      this.page = await context.newPage();
    }
  }

  async destroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  // ── Screenshot + AI OCR fallback ─────────────────────────────────────────────

  /** Take a full-page screenshot and ask Claude Vision to parse it. */
  async aiParseScreen(prompt: string): Promise<string> {
    if (!this.page) throw new Error('Browser not initialized');

    const screenshotBuffer = await this.page.screenshot({ fullPage: true });
    const base64 = screenshotBuffer.toString('base64');
    const model =
      process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    const data = await response.json() as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? '';
  }

  // ── Subdivision detection ────────────────────────────────────────────────────

  /**
   * Analyse a legal description and detect subdivision membership.
   *
   * Texas legal descriptions appear in several formats.  We try patterns in
   * order from most specific to least specific:
   *
   *   1. Lot-first:  "LOT X, BLOCK Y, SUBDIVISION NAME"
   *   2. Sub-first:  "SUBDIVISION NAME, LOT X, BLOCK Y"
   *   3. Lot-only:   "SUBDIVISION NAME, LOT X"
   *   4. Sub-only:   "SUBDIVISION NAME" (ADDITION / ESTATES / HEIGHTS / etc.)
   *   5. Reserve:    "RESERVE A" / "COMMON AREA" / "OPEN SPACE"
   *
   * Block numbers in Texas can be purely alphabetical (e.g. "BLOCK A"),
   * numeric (e.g. "BLOCK 12"), or alphanumeric (e.g. "BLOCK 2A") — all forms
   * are captured by `\w+`.
   *
   * NOTE: "ACRES" is intentionally excluded from the keyword pattern because
   * metes-and-bounds tracts routinely contain phrases like "12.358 ACRES",
   * which should NOT be flagged as subdivision membership.
   */
  detectSubdivision(legalDesc: string): SubdivisionDetection {
    if (!legalDesc) return { isSubdivision: false };

    const upper = legalDesc.trim().toUpperCase();

    // ── Pattern 1: "LOT X, BLOCK Y, SUBDIVISION NAME" (lot/block first) ────────
    // e.g. "LOT 3, BLOCK B, CEDAR PARK HEIGHTS"
    const lotFirstBlockPattern =
      /^LOT\s+(\w+)\s*,?\s*(?:BLOCK|BLK)\s+(\w+)[,\s]+(.+)/i;
    const lotFirstBlock = upper.match(lotFirstBlockPattern);
    if (lotFirstBlock) {
      return {
        isSubdivision:   true,
        lotNumber:       lotFirstBlock[1],
        blockNumber:     lotFirstBlock[2],
        subdivisionName: lotFirstBlock[3].trim(),
      };
    }

    // ── Pattern 2: "LOT X, SUBDIVISION NAME" (lot first, no block) ─────────────
    const lotFirstOnlyPattern = /^LOT\s+(\w+)[,\s]+(.+)/i;
    const lotFirstOnly = upper.match(lotFirstOnlyPattern);
    if (lotFirstOnly) {
      return {
        isSubdivision:   true,
        lotNumber:       lotFirstOnly[1],
        subdivisionName: lotFirstOnly[2].trim(),
      };
    }

    // ── Pattern 3: "SUBDIVISION NAME, LOT X, BLOCK Y" (subdivision first) ──────
    // Block numbers can be alphabetical (BLOCK A), numeric (BLOCK 12), or
    // alphanumeric (BLOCK 2A) — `\w+` covers all cases.
    const subFirstBlockPattern =
      /^(.+?),?\s+LOT\s+(\w+)\s*,?\s*(?:BLOCK|BLK)\s+(\w+)/i;
    const subFirstBlock = upper.match(subFirstBlockPattern);
    if (subFirstBlock) {
      return {
        isSubdivision:   true,
        subdivisionName: subFirstBlock[1].trim(),
        lotNumber:       subFirstBlock[2],
        blockNumber:     subFirstBlock[3],
      };
    }

    // ── Pattern 4: "SUBDIVISION NAME, LOT X" (subdivision first, no block) ─────
    const subFirstLotPattern = /^(.+?),?\s+LOT\s+(\w+)/i;
    const subFirstLot = upper.match(subFirstLotPattern);
    if (subFirstLot) {
      return {
        isSubdivision:   true,
        subdivisionName: subFirstLot[1].trim(),
        lotNumber:       subFirstLot[2],
      };
    }

    // ── Pattern 5: Subdivision keyword (no explicit lot/block) ──────────────────
    // Intentionally omits "ACRES" — a metes-and-bounds acreage description
    // (e.g. "WILLIAM HARTRICK SURVEY, 12.358 ACRES") is NOT a subdivision.
    //
    // Guard: skip when the description also contains any metes-and-bounds marker
    // (SURVEY, ABSTRACT, "A-NNN" abstract number, or a decimal acreage quantity).
    // This prevents false positives like "JOHNSON RANCH SURVEY, A-488" from
    // being flagged as a subdivision just because "RANCH" appears.
    const METES_AND_BOUNDS_INDICATORS = /\bSURVEY\b|\bABSTRACT\b|\bA-\d+|\d+\.?\d*\s*ACRES?\b/i;
    const additionPattern =
      /(.+(?:ADDITION|SUBDIVISION|ESTATES|HEIGHTS|PARK|RANCH))/i;
    const addMatch = upper.match(additionPattern);
    if (addMatch && !METES_AND_BOUNDS_INDICATORS.test(upper)) {
      return {
        isSubdivision:   true,
        subdivisionName: addMatch[1].trim(),
      };
    }

    // ── Pattern 6: Reserve / common area ────────────────────────────────────────
    if (/RESERVE\s+[A-Z]|COMMON\s+AREA|OPEN\s+SPACE/i.test(upper)) {
      return { isSubdivision: true };
    }

    // Likely a standalone metes-and-bounds tract (abstract/survey description)
    return { isSubdivision: false };
  }

}
