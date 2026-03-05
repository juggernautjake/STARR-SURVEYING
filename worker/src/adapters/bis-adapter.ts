// worker/src/adapters/bis-adapter.ts
// BIS Consultants eSearch adapter — covers Bell, McLennan, Coryell, Lampasas,
// and ~60+ other Texas counties that all run the same BIS platform.
//
// Search strategy (in order of preference):
//   1. JSON API at {baseUrl}/api/search  (fast, no browser needed)
//   2. Playwright DOM scrape             (fallback)
//   3. Claude Vision OCR                 (last resort when DOM fails)
//
// Spec §1.5 — BIS Adapter

import {
  CADAdapter,
  type PropertySearchResult,
  type PropertyDetail,
  type DeedReference,
} from './cad-adapter.js';
import type { AddressVariant } from '../services/address-normalizer.js';
import { buildDetailUrl } from '../services/cad-registry.js';

// ── BIS raw API response shapes ───────────────────────────────────────────────

interface BisApiItem {
  PropertyId?: unknown;
  property_id?: unknown;
  ID?: unknown;
  GeoId?: unknown;
  geo_id?: unknown;
  OwnerName?: unknown;
  owner_name?: unknown;
  SitusAddress?: unknown;
  situs_address?: unknown;
  LegalDescription?: unknown;
  legal_description?: unknown;
  Acreage?: unknown;
  acreage?: unknown;
  PropertyType?: unknown;
  property_type?: unknown;
  AssessedValue?: unknown;
  assessed_value?: unknown;
}

interface BisApiResponse {
  results?: BisApiItem[];
  Properties?: BisApiItem[];
}

interface AiSearchItem {
  propertyId?: string;
  owner?: string;
  address?: string;
  legalDescription?: string;
  propertyType?: string;
  acreage?: string;
}

interface AiDetailResult {
  owner?: string;
  ownerMailingAddress?: string;
  situsAddress?: string;
  legalDescription?: string;
  acreage?: string | number;
  assessedValue?: string | number;
  marketValue?: string | number;
  abstractSurvey?: string;
  subdivisionName?: string;
  lotNumber?: string;
  blockNumber?: string;
  geoId?: string;
  taxYear?: number;
  deedReferences?: Array<{
    instrumentNumber?: string;
    type?: string;
    date?: string;
    description?: string;
  }>;
  improvements?: Array<{
    type?: string;
    sqft?: number;
    yearBuilt?: number;
  }>;
}

// ── BISAdapter ────────────────────────────────────────────────────────────────

export class BISAdapter extends CADAdapter {

  // ── searchByAddress ──────────────────────────────────────────────────────────

  async searchByAddress(variants: AddressVariant[]): Promise<PropertySearchResult[]> {
    // Try the backend JSON API first (fast, no browser overhead)
    if (this.config.apiUrl) {
      for (const variant of variants) {
        try {
          const results = await this.apiSearch(variant.searchString, 'address');
          if (results.length > 0) {
            console.log(`[BIS] API hit on variant: "${variant.searchString}" (${variant.strategy})`);
            return results;
          }
        } catch (e) {
          console.warn(`[BIS] API failed for "${variant.searchString}":`, e);
        }
      }
    }

    // Fallback to Playwright
    await this.initBrowser();
    for (const variant of variants) {
      try {
        const results = await this.playwrightSearch(variant.searchString, 'address');
        if (results.length > 0) {
          console.log(`[BIS] Playwright hit on variant: "${variant.searchString}" (${variant.strategy})`);
          return results;
        }
      } catch (e) {
        console.warn(`[BIS] Playwright failed for "${variant.searchString}":`, e);
      }
    }

    return [];
  }

  // ── searchByOwner ────────────────────────────────────────────────────────────

  async searchByOwner(ownerName: string): Promise<PropertySearchResult[]> {
    if (this.config.apiUrl) {
      try {
        return await this.apiSearch(ownerName, 'owner');
      } catch (e) {
        console.warn('[BIS] Owner API search failed:', e);
      }
    }

    await this.initBrowser();
    return this.playwrightSearch(ownerName, 'owner');
  }

  // ── findSubdivisionLots ──────────────────────────────────────────────────────

  async findSubdivisionLots(subdivisionName: string): Promise<PropertySearchResult[]> {
    // BIS legal description search often works via owner name search field
    return this.searchByOwner(subdivisionName);
  }

  // ── getPropertyDetail ────────────────────────────────────────────────────────

  async getPropertyDetail(propertyId: string): Promise<PropertyDetail> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    const detailUrl = buildDetailUrl(this.config, propertyId);
    await this.page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await this.page.waitForTimeout(1500);

    // Screenshot for AI fallback
    const screenshotPath = `/tmp/cad_detail_${propertyId}.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });

    // Try DOM extraction first
    const detail = await this.extractDetailFromDOM(propertyId);

    // Supplement with AI if critical fields are missing
    if (!detail.owner || !detail.legalDescription) {
      const aiDetail = await this.extractDetailFromAI(propertyId);
      if (!detail.owner && aiDetail.owner)                               detail.owner = aiDetail.owner;
      if (!detail.legalDescription && aiDetail.legalDescription)         detail.legalDescription = aiDetail.legalDescription;
      if (!detail.acreage && aiDetail.acreage)                           detail.acreage = aiDetail.acreage;
      if (detail.deedReferences.length === 0)                            detail.deedReferences = aiDetail.deedReferences;
    }

    // Detect subdivision membership
    const subInfo = this.detectSubdivision(detail.legalDescription);
    detail.subdivisionName = subInfo.subdivisionName;
    detail.lotNumber        = subInfo.lotNumber;
    detail.blockNumber      = subInfo.blockNumber;

    // Find all related lots if this is part of a subdivision
    if (subInfo.isSubdivision && subInfo.subdivisionName) {
      detail.relatedPropertyIds = await this.findSubdivisionLotIds(
        subInfo.subdivisionName,
        propertyId,
      );
    }

    detail.screenshotPath = screenshotPath;
    return detail;
  }

  // ── Private: DOM extraction ───────────────────────────────────────────────────

  private async extractDetailFromDOM(propertyId: string): Promise<PropertyDetail> {
    if (!this.page) throw new Error('Browser not initialized');

    const detail: PropertyDetail = {
      propertyId,
      owner:             '',
      situsAddress:      '',
      legalDescription:  '',
      acreage:           0,
      propertyType:      'real',
      deedReferences:    [],
      relatedPropertyIds:[],
      improvements:      [],
    };

    // Helper: try several label variants and return the first non-empty match
    const extractField = async (labels: string[]): Promise<string> => {
      for (const label of labels) {
        try {
          // "Label: Value" pattern in a parent element
          const el = await this.page!.$(`text=${label}`);
          if (el) {
            const parent = await el.$('xpath=..');
            if (parent) {
              const text = await parent.innerText();
              const value = text.replace(new RegExp(`${label}:?\\s*`, 'i'), '').trim();
              if (value) return value;
            }
          }
          // Table layout: label cell followed by value cell
          const td = await this.page!.$(`td:has-text("${label}") + td`);
          if (td) {
            const value = await td.innerText();
            if (value.trim()) return value.trim();
          }
        } catch {
          // Continue to next label variant
        }
      }
      return '';
    };

    detail.owner               = await extractField(['Owner Name', 'Owner', 'Property Owner']);
    detail.ownerMailingAddress = await extractField(['Mailing Address', 'Mail Address', 'Owner Address']) || undefined;
    detail.situsAddress        = await extractField(['Situs Address', 'Property Address', 'Location']);
    detail.legalDescription    = await extractField(['Legal Description', 'Legal', 'Legal Desc']);
    detail.geoId               = await extractField(['Geographic ID', 'Geo ID', 'GEO ID']) || undefined;
    detail.abstractSurvey      = await extractField(['Abstract', 'Survey', 'Abstract/Survey']) || undefined;

    const acreageStr   = await extractField(['Acreage', 'Acres', 'Land Area']);
    detail.acreage     = parseFloat(acreageStr) || 0;

    const valueStr     = await extractField(['Assessed Value', 'Total Value', 'Market Value', 'Appraised Value']);
    detail.assessedValue = parseFloat(valueStr.replace(/[$,]/g, '')) || undefined;

    return detail;
  }

  // ── Private: AI detail extraction ────────────────────────────────────────────

  private async extractDetailFromAI(propertyId: string): Promise<PropertyDetail> {
    const aiResult = await this.aiParseScreen(
      `This is a property detail page from a Texas County Appraisal District website (BIS Consultants system).

Extract ALL available information and return as JSON:
{
  "owner": "owner name",
  "ownerMailingAddress": "mailing address",
  "situsAddress": "property address",
  "legalDescription": "full legal description exactly as shown",
  "acreage": 0.0,
  "assessedValue": 0,
  "marketValue": 0,
  "abstractSurvey": "abstract and survey name",
  "subdivisionName": "if part of a subdivision",
  "lotNumber": "lot number if shown",
  "blockNumber": "block number if shown",
  "geoId": "geographic ID if shown",
  "taxYear": 2025,
  "deedReferences": [
    { "instrumentNumber": "...", "type": "deed|plat|easement", "date": "...", "description": "..." }
  ],
  "improvements": [
    { "type": "Residential", "sqft": 0, "yearBuilt": 0 }
  ]
}

CRITICAL: Extract the legal description EXACTLY as shown — it contains the subdivision name and lot/block which are essential for further research.
Return ONLY valid JSON, no explanation.`,
    );

    try {
      const parsed = JSON.parse(
        aiResult.replace(/```json?|```/g, '').trim(),
      ) as AiDetailResult;

      return {
        propertyId,
        owner:               parsed.owner ?? '',
        ownerMailingAddress: parsed.ownerMailingAddress,
        situsAddress:        parsed.situsAddress ?? '',
        legalDescription:    parsed.legalDescription ?? '',
        acreage:             parseFloat(String(parsed.acreage ?? '0')) || 0,
        propertyType:        'real',
        assessedValue:       parseFloat(String(parsed.assessedValue ?? '0')) || undefined,
        marketValue:         parseFloat(String(parsed.marketValue ?? '0')) || undefined,
        taxYear:             parsed.taxYear,
        abstractSurvey:      parsed.abstractSurvey,
        subdivisionName:     parsed.subdivisionName,
        lotNumber:           parsed.lotNumber,
        blockNumber:         parsed.blockNumber,
        geoId:               parsed.geoId,
        deedReferences:      (parsed.deedReferences ?? []).map(d => ({
          instrumentNumber: d.instrumentNumber,
          type:             (d.type ?? 'other') as DeedReference['type'],
          date:             d.date,
          description:      d.description,
        })),
        relatedPropertyIds:  [],
        improvements:        (parsed.improvements ?? []).map(i => ({
          type:      i.type ?? 'Unknown',
          sqft:      i.sqft,
          yearBuilt: i.yearBuilt,
        })),
      };
    } catch (e) {
      console.warn('[BIS] AI detail parse failed:', e);
      return {
        propertyId,
        owner:             '',
        situsAddress:      '',
        legalDescription:  '',
        acreage:           0,
        propertyType:      'real',
        deedReferences:    [],
        relatedPropertyIds:[],
        improvements:      [],
      };
    }
  }

  // ── Private: API search ───────────────────────────────────────────────────────

  private async apiSearch(
    query: string,
    type: 'address' | 'owner',
  ): Promise<PropertySearchResult[]> {
    const apiUrl = this.config.apiUrl!;

    const body =
      type === 'address'
        ? { situs_street: query, search_type: 'address' }
        : { owner_name:   query, search_type: 'owner' };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`BIS API returned ${response.status}`);

    const data = await response.json() as BisApiResponse;
    const items: BisApiItem[] = data.results ?? data.Properties ?? [];

    return items
      .map(item => this.mapApiItem(query, item))
      .filter((r): r is PropertySearchResult => r !== null)
      .sort((a, b) => b.matchScore - a.matchScore);
  }

  // ── Private: Playwright search ────────────────────────────────────────────────

  private async playwrightSearch(
    query: string,
    type: 'address' | 'owner',
  ): Promise<PropertySearchResult[]> {
    if (!this.page) throw new Error('Browser not initialized');

    await this.page.goto(this.config.searchUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // BIS search forms have tabs for different search types
    if (type === 'owner') {
      await this.page.click('text=Owner Name').catch(() => {});
      await this.page.waitForTimeout(500);
    }

    const field = type === 'address'
      ? this.config.addressField
      : this.config.ownerField;

    await this.page.fill(
      `input[name="${field}"], input[id="${field}"], input[placeholder*="${type}"]`,
      query,
    );
    await this.page.keyboard.press('Enter');

    // Wait for AJAX results
    await this.page
      .waitForSelector('.search-result-row, .no-results, #searchResults', {
        timeout: 15000,
      })
      .catch(() => {});
    await this.page.waitForTimeout(1000);

    // Empty results indicator
    const noResults = await this.page.$('.no-results, text=No records found');
    if (noResults) return [];

    // DOM parse: BIS rows are typically tab-separated: ID | Owner | Address | Legal
    const results: PropertySearchResult[] = [];
    const rows = await this.page.$$('.search-result-row, #searchResults tr');

    for (const row of rows) {
      const text = await row.innerText();
      const link = await row.$('a');
      const href = link ? await link.getAttribute('href') : '';

      const idMatch =
        href?.match(/\/Property\/View\/(\d+)/i) ??
        href?.match(/prop_id=(\d+)/i);
      if (!idMatch) continue;

      const cells = text.split('\t').map((s: string) => s.trim()).filter(Boolean);

      results.push({
        propertyId:       idMatch[1],
        owner:            cells[1] ?? '',
        situsAddress:     cells[2] ?? '',
        legalDescription: cells[3] ?? '',
        propertyType:     'real',
        matchScore:       50,
      });
    }

    // Last resort: Claude Vision OCR
    if (results.length === 0) {
      const aiResult = await this.aiParseScreen(
        `This is a property search results page from a Texas County Appraisal District (BIS Consultants system).

Extract ALL property records visible in the search results. For each record provide:
- Property ID (numeric)
- Owner name
- Address
- Legal description
- Property type (Real or Personal)
- Acreage if shown

Return as JSON array:
[{ "propertyId": "...", "owner": "...", "address": "...", "legalDescription": "...", "propertyType": "...", "acreage": "..." }]

Only include REAL property records (not vehicles or personal property).`,
      );

      try {
        const parsed = JSON.parse(
          aiResult.replace(/```json?|```/g, '').trim(),
        ) as AiSearchItem[];

        for (const item of parsed) {
          if (!item.propertyId) continue;
          results.push({
            propertyId:       item.propertyId,
            owner:            item.owner ?? '',
            situsAddress:     item.address ?? '',
            legalDescription: item.legalDescription ?? '',
            propertyType:     item.propertyType?.toLowerCase() === 'personal'
              ? 'personal'
              : 'real',
            acreage:          parseFloat(item.acreage ?? '') || undefined,
            matchScore:       40,  // AI-parsed results get lower confidence score
          });
        }
      } catch (e) {
        console.warn('[BIS] AI parse failed:', e);
      }
    }

    return results.filter(r => r.propertyType === 'real');
  }

  // ── Private: helpers ──────────────────────────────────────────────────────────

  /** Map a raw BIS API item to a PropertySearchResult, filtering out personal property. */
  private mapApiItem(
    query: string,
    item: BisApiItem,
  ): PropertySearchResult | null {
    const rawType = String(
      item.property_type ?? item.PropertyType ?? '',
    ).toUpperCase();
    // Filter personal property (vehicles, etc.)
    if (rawType === 'P' || rawType === 'PERSONAL') return null;

    const propType: PropertySearchResult['propertyType'] =
      rawType === 'R' || rawType === 'REAL' ? 'real' : 'unknown';

    return {
      propertyId:       String(item.PropertyId ?? item.property_id ?? item.ID ?? ''),
      geoId:            String(item.GeoId ?? item.geo_id ?? '') || undefined,
      owner:            String(item.OwnerName ?? item.owner_name ?? ''),
      situsAddress:     String(item.SitusAddress ?? item.situs_address ?? ''),
      legalDescription: String(item.LegalDescription ?? item.legal_description ?? ''),
      acreage:          parseFloat(String(item.Acreage ?? item.acreage ?? '0')) || undefined,
      propertyType:     propType,
      assessedValue:    parseFloat(String(item.AssessedValue ?? item.assessed_value ?? '0')) || undefined,
      matchScore:       this.calculateMatchScore(query, item as Record<string, unknown>),
    };
  }

  /** Collect all lot property IDs in the same subdivision, excluding the current parcel. */
  private async findSubdivisionLotIds(
    subdivisionName: string,
    currentId: string,
  ): Promise<string[]> {
    try {
      const lots = await this.findSubdivisionLots(subdivisionName);
      return lots
        .map(l => l.propertyId)
        .filter(id => id !== currentId);
    } catch (e) {
      console.warn(`[BIS] Could not find subdivision lots for "${subdivisionName}":`, e);
      return [];
    }
  }

  /** Compute a 0–100 relevance score for a search result against the query. */
  private calculateMatchScore(query: string, item: Record<string, unknown>): number {
    let score = 50;

    const address   = String(item.SitusAddress ?? item.situs_address ?? '').toUpperCase();
    const queryUpper = query.toUpperCase();

    if (address.includes(queryUpper)) score += 30;
    if (address.startsWith(queryUpper.split(' ')[0])) score += 10;

    const propType = String(item.property_type ?? item.PropertyType ?? '').toUpperCase();
    if (propType === 'R' || propType === 'REAL') score += 10;

    return Math.min(100, score);
  }
}
