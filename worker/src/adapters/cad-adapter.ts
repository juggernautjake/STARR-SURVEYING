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

  /** Analyse a legal description and detect subdivision membership. */
  detectSubdivision(legalDesc: string): SubdivisionDetection {
    const upper = legalDesc.toUpperCase();

    // Pattern: "SUBDIVISION_NAME, LOT X, BLOCK Y"
    const lotBlockPattern =
      /^(.+?),?\s+LOT\s+(\d+[A-Z]?)\s*,?\s*(?:BLOCK|BLK)\s+(\d+[A-Z]?)/i;
    const lotMatch = upper.match(lotBlockPattern);
    if (lotMatch) {
      return {
        isSubdivision: true,
        subdivisionName: lotMatch[1].trim(),
        lotNumber:       lotMatch[2],
        blockNumber:     lotMatch[3],
      };
    }

    // Pattern: "SUBDIVISION_NAME, LOT X" (no block)
    const lotOnlyPattern = /^(.+?),?\s+LOT\s+(\d+[A-Z]?)/i;
    const lotOnlyMatch = upper.match(lotOnlyPattern);
    if (lotOnlyMatch) {
      return {
        isSubdivision: true,
        subdivisionName: lotOnlyMatch[1].trim(),
        lotNumber:       lotOnlyMatch[2],
      };
    }

    // Pattern: "X ACRE ADDITION" / "SUBDIVISION" / "ESTATES" etc.
    const additionPattern =
      /(.+(?:ADDITION|SUBDIVISION|ESTATES|HEIGHTS|PARK|RANCH|ACRES))/i;
    const addMatch = upper.match(additionPattern);
    if (addMatch) {
      return {
        isSubdivision: true,
        subdivisionName: addMatch[1].trim(),
      };
    }

    // Pattern: "RESERVE A" / "COMMON AREA" / "OPEN SPACE"
    if (/RESERVE\s+[A-Z]|COMMON\s+AREA|OPEN\s+SPACE/i.test(upper)) {
      return { isSubdivision: true };
    }

    // Likely a standalone metes-and-bounds tract
    return { isSubdivision: false };
  }

}
