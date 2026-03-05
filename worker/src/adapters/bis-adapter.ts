// worker/src/adapters/bis-adapter.ts
// BIS Consultants eSearch adapter — covers Bell, McLennan, Coryell, Lampasas,
// and ~60+ other Texas counties that all run the same BIS platform.
//
// Search strategy:
//   1. JSON API at {baseUrl}/api/search  (fast, preferred)
//   2. Playwright DOM scrape             (fallback)
//   3. Claude Vision OCR                 (last resort)
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

// ── BISAdapter ────────────────────────────────────────────────────────────────

export class BISAdapter extends CADAdapter {

  // ── searchByAddress ──────────────────────────────────────────────────────────

  async searchByAddress(variants: AddressVariant[]): Promise<PropertySearchResult[]> {
    // BIS systems have a backend API — try that first
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
    // BIS API: search by legal description / subdivision name
    if (this.config.apiUrl) {
      try {
        const response = await fetch(this.config.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            legal_description: subdivisionName,
            search_type: 'legal',
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
          const data = await response.json() as BisApiResponse;
          const items: BisApiItem[] = data.results ?? data.Properties ?? [];
          return items
            .map(item => this.mapApiItem(subdivisionName, item))
            .filter((r): r is PropertySearchResult => r !== null)
            .sort((a, b) => b.matchScore - a.matchScore);
        }
      } catch (e) {
        console.warn('[BIS] Subdivision API search failed:', e);
      }
    }

    // Playwright fallback: use address field with subdivision name
    await this.initBrowser();
    return this.playwrightSearch(subdivisionName, 'address');
  }

  // ── getPropertyDetail ────────────────────────────────────────────────────────

  async getPropertyDetail(propertyId: string): Promise<PropertyDetail> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    const detailUrl = buildDetailUrl(this.config, propertyId);
    await this.page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await this.page.waitForTimeout(500);

    const rawHtml = await this.page.content();

    // ── Try structured DOM extraction first ──────────────────────────────────

    const detail = await this.page.evaluate(() => {
      function text(selector: string): string {
        return (document.querySelector(selector) as HTMLElement)?.innerText?.trim() ?? '';
      }
      function allText(selector: string): string[] {
        return Array.from(document.querySelectorAll(selector))
          .map(el => (el as HTMLElement).innerText?.trim())
          .filter(Boolean);
      }

      return {
        owner:       text('[data-field="owner_name"], .owner-name, #ownerName'),
        ownerAddr:   text('[data-field="owner_address"], .owner-address'),
        situs:       text('[data-field="situs_address"], .situs-address, #situsAddress'),
        legal:       text('[data-field="legal_description"], .legal-description, #legalDescription'),
        acreage:     text('[data-field="acreage"], .acreage, #acreage'),
        assessed:    text('[data-field="assessed_value"], .assessed-value'),
        market:      text('[data-field="market_value"], .market-value'),
        geoId:       text('[data-field="geo_id"], .geo-id, #geoId'),
        taxYear:     text('[data-field="tax_year"], .tax-year'),
        abstract:    text('[data-field="abstract_survey"], .abstract-survey'),
        deedRows:    allText('.deed-reference tr, .instrument-row, [data-type="deed"]'),
        improvRows:  allText('.improvement-row, [data-type="improvement"]'),
      };
    });

    // ── Fall back to AI OCR if key fields are empty ──────────────────────────

    let finalDetail = detail;
    if (!detail.owner && !detail.legal) {
      const aiText = await this.aiParseScreen(
        `This is a Texas County Appraisal District property detail page (BIS Consultants system).

Extract the following fields and return as JSON:
{
  "owner": "...",
  "ownerAddr": "...",
  "situs": "...",
  "legal": "...",
  "acreage": "...",
  "assessed": "...",
  "market": "...",
  "geoId": "...",
  "taxYear": "...",
  "abstract": "...",
  "deedRows": ["..."],
  "improvRows": ["..."]
}

Return ONLY the JSON object, no explanation.`,
      );
      try {
        const parsed = JSON.parse(aiText) as typeof detail;
        finalDetail = parsed;
      } catch {
        // AI fallback also failed — return what we have from DOM
      }
    }

    // ── Parse deed references ────────────────────────────────────────────────

    const deedReferences: DeedReference[] = finalDetail.deedRows
      .map(row => this.parseDeedRow(row))
      .filter((r): r is DeedReference => r !== null);

    // ── Parse improvements ───────────────────────────────────────────────────

    const improvements = finalDetail.improvRows.map(row => {
      const parts = row.split(/\t|\s{2,}/).map(s => s.trim()).filter(Boolean);
      return {
        type:      parts[0] ?? 'Unknown',
        sqft:      parseInt(parts[1] ?? '', 10) || undefined,
        yearBuilt: parseInt(parts[2] ?? '', 10) || undefined,
        condition: parts[3] ?? undefined,
      };
    });

    // ── Detect subdivision ───────────────────────────────────────────────────

    const subdiv = this.detectSubdivision(finalDetail.legal ?? '');

    return {
      propertyId,
      geoId:               finalDetail.geoId || undefined,
      owner:               finalDetail.owner ?? '',
      ownerMailingAddress: finalDetail.ownerAddr || undefined,
      situsAddress:        finalDetail.situs ?? '',
      legalDescription:    finalDetail.legal ?? '',
      acreage:             parseFloat(finalDetail.acreage ?? '') || 0,
      propertyType:        'real',
      assessedValue:       parseFloat(finalDetail.assessed?.replace(/[$,]/g, '') ?? '') || undefined,
      marketValue:         parseFloat(finalDetail.market?.replace(/[$,]/g, '') ?? '') || undefined,
      taxYear:             parseInt(finalDetail.taxYear ?? '', 10) || undefined,
      abstractSurvey:      finalDetail.abstract || undefined,
      subdivisionName:     subdiv.subdivisionName,
      lotNumber:           subdiv.lotNumber,
      blockNumber:         subdiv.blockNumber,
      deedReferences,
      relatedPropertyIds:  [],   // Populated by findSubdivisionLots after this call
      improvements,
      rawHtml,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

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

  /** Map a raw BIS API item to a PropertySearchResult, or null if filtered out. */
  private mapApiItem(
    query: string,
    item: BisApiItem,
  ): PropertySearchResult | null {
    // Filter personal property (vehicles, etc.)
    const rawType = String(
      item.property_type ?? item.PropertyType ?? '',
    ).toUpperCase();
    if (rawType === 'P' || rawType === 'PERSONAL') return null;

    const propType: PropertySearchResult['propertyType'] =
      rawType === 'R' || rawType === 'REAL' ? 'real' : 'unknown';

    return {
      propertyId:      String(item.PropertyId ?? item.property_id ?? item.ID ?? ''),
      geoId:           String(item.GeoId       ?? item.geo_id       ?? '') || undefined,
      owner:           String(item.OwnerName    ?? item.owner_name   ?? ''),
      situsAddress:    String(item.SitusAddress ?? item.situs_address ?? ''),
      legalDescription:String(item.LegalDescription ?? item.legal_description ?? ''),
      acreage:         parseFloat(String(item.Acreage ?? item.acreage ?? '0')) || undefined,
      propertyType:    propType,
      assessedValue:   parseFloat(String(item.AssessedValue ?? item.assessed_value ?? '0')) || undefined,
      matchScore:      this.calculateMatchScore(query, item as Record<string, unknown>),
    };
  }

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

    // Check for empty results
    const noResults = await this.page.$('.no-results, text=No records found');
    if (noResults) return [];

    // Parse results from DOM
    const results: PropertySearchResult[] = [];
    const rows = await this.page.$$('.search-result-row, #searchResults tr');

    for (const row of rows) {
      const text  = await row.innerText();
      const link  = await row.$('a');
      const href  = link ? await link.getAttribute('href') : '';

      const idMatch =
        href?.match(/\/Property\/View\/(\d+)/i) ??
        href?.match(/prop_id=(\d+)/i);
      if (!idMatch) continue;

      // BIS rows: ID | Owner | Address | Legal (tab-separated)
      const cells = text.split('\t').map(s => s.trim()).filter(Boolean);

      results.push({
        propertyId:       idMatch[1],
        owner:            cells[1] ?? '',
        situsAddress:     cells[2] ?? '',
        legalDescription: cells[3] ?? '',
        propertyType:     'real',
        matchScore:       50,
      });
    }

    // Last resort: AI screenshot OCR
    if (results.length === 0) {
      const aiText = await this.aiParseScreen(
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

Return ONLY the JSON array, no explanation.`,
      );

      try {
        const items = JSON.parse(aiText) as AiSearchItem[];
        for (const item of items) {
          if (!item.propertyId) continue;
          const pt = (item.propertyType ?? '').toUpperCase();
          if (pt === 'PERSONAL' || pt === 'P') continue;
          results.push({
            propertyId:       item.propertyId,
            owner:            item.owner ?? '',
            situsAddress:     item.address ?? '',
            legalDescription: item.legalDescription ?? '',
            acreage:          parseFloat(item.acreage ?? '') || undefined,
            propertyType:     pt === 'REAL' || pt === 'R' ? 'real' : 'unknown',
            matchScore:       30,   // AI-sourced results get lower base score
          });
        }
      } catch {
        console.warn('[BIS] Failed to parse AI OCR result as JSON');
      }
    }

    return results.sort((a, b) => b.matchScore - a.matchScore);
  }

  /** Parse a single deed-reference row string into a DeedReference. */
  private parseDeedRow(row: string): DeedReference | null {
    const clean = row.trim();
    if (!clean) return null;

    // Instrument number pattern: "2023032044" or "VOL 123 PG 456"
    const instrMatch = clean.match(/\b(\d{10,})\b/);
    const volMatch   = clean.match(/VOL(?:UME)?\s*(\d+)/i);
    const pgMatch    = clean.match(/(?:PG|PAGE)\s*(\d+)/i);
    const dateMatch  = clean.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/);

    // Determine document type from keywords
    let type: DeedReference['type'] = 'other';
    const upper = clean.toUpperCase();
    if (upper.includes('DEED') || upper.includes('WARRANTY') || upper.includes('QUITCLAIM')) {
      type = 'deed';
    } else if (upper.includes('PLAT') || upper.includes('FINAL PLAT') || upper.includes('SUBDIVISION PLAT')) {
      type = 'plat';
    } else if (upper.includes('EASEMENT') || upper.includes('RIGHT-OF-WAY')) {
      type = 'easement';
    } else if (upper.includes('RESTRICT')) {
      type = 'restriction';
    } else if (upper.includes('LIEN') || upper.includes('MORTGAGE')) {
      type = 'lien';
    }

    // Normalise date to ISO 8601
    let date: string | undefined;
    if (dateMatch) {
      const raw = dateMatch[1];
      if (raw.includes('/')) {
        const [m, d, y] = raw.split('/');
        date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      } else {
        date = raw;
      }
    }

    return {
      instrumentNumber: instrMatch?.[1],
      volume:           volMatch?.[1],
      page:             pgMatch?.[1],
      type,
      date,
      description:      clean,
    };
  }
}
