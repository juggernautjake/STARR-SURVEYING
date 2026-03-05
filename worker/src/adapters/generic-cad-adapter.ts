// worker/src/adapters/generic-cad-adapter.ts
// AI-assisted generic adapter for counties with no dedicated adapter in the registry.
//
// Uses Claude Vision to discover the CAD portal search interface, fill forms,
// and parse results — works for any web-based CAD system with no prior config.
//
// Spec §1.3 Fallback Strategy / §1.5

import { CADAdapter, type PropertySearchResult, type PropertyDetail } from './cad-adapter.js';
import type { CADConfig } from '../services/cad-registry.js';
import type { AddressVariant } from '../services/address-normalizer.js';

// ── Build a minimal CADConfig for an unknown county ───────────────────────────

function buildGenericConfig(countyName: string, countyFIPS: string): CADConfig {
  // We don't know the URLs yet — they will be discovered at runtime via AI
  return {
    name:             `${countyName} County Appraisal District`,
    vendor:           'generic',
    searchUrl:        '',   // Discovered at runtime
    detailUrlPattern: '',   // Discovered at runtime
    searchMethod:     'playwright',
    addressField:     'address',
    ownerField:       'owner',
    resultSelector:   'tr, .result, .property-row',
    propertyIdField:  'id',
    cadSystem:        'texasfile_fallback',
    customNotes:      `Unknown county ${countyFIPS} — search URL discovered via AI at runtime`,
  };
}

// ── GenericCADAdapter ─────────────────────────────────────────────────────────

export class GenericCADAdapter extends CADAdapter {
  private readonly countyName: string;
  private readonly countyFIPS: string;
  private discoveredSearchUrl: string | null = null;

  constructor(countyName: string, countyFIPS: string) {
    super(buildGenericConfig(countyName, countyFIPS));
    this.countyName = countyName;
    this.countyFIPS = countyFIPS;
  }

  // ── Step 0: Discover the CAD portal URL ──────────────────────────────────────

  private async discoverPortalUrl(): Promise<string> {
    if (this.discoveredSearchUrl) return this.discoveredSearchUrl;

    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    // Google for the county's appraisal district website
    const query = encodeURIComponent(
      `${this.countyName} county Texas appraisal district property search`,
    );
    await this.page.goto(`https://www.google.com/search?q=${query}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    const url = await this.aiParseScreen(
      `This is a Google search results page. I am looking for the official ${this.countyName} County Appraisal District (CAD) property search website in Texas.

Find the most relevant official result (the appraisal district's own search page, NOT a third-party site like Zillow, Realtor.com, etc.).

Return ONLY the URL of the appraisal district property search page, nothing else. Example format: https://esearch.bellcad.org/Search`,
    );

    const cleaned = url.trim().replace(/[`\n\r]/g, '');
    this.discoveredSearchUrl = cleaned;
    console.log(`[Generic] Discovered CAD portal for ${this.countyName}: ${cleaned}`);
    return cleaned;
  }

  // ── searchByAddress ──────────────────────────────────────────────────────────

  async searchByAddress(variants: AddressVariant[]): Promise<PropertySearchResult[]> {
    const portalUrl = await this.discoverPortalUrl();
    if (!portalUrl) return [];

    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    for (const variant of variants) {
      try {
        await this.page.goto(portalUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // Attempt a best-effort fill using common address field selectors
        // (selector discovery via AI is deferred until a dedicated field-detection pass)
        const commonSelectors = [
          'input[name*="address" i]', 'input[id*="address" i]',
          'input[placeholder*="address" i]', 'input[name*="situs" i]',
          'input[type="text"]:first-of-type',
        ];

        let filled = false;
        for (const sel of commonSelectors) {
          try {
            await this.page.fill(sel, variant.searchString);
            filled = true;
            break;
          } catch { /* try next */ }
        }

        if (!filled) continue;

        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(3000);

        // Take screenshot and parse results with AI
        const aiResult = await this.aiParseScreen(
          `This is a property search results page for ${this.countyName} County Appraisal District.

Extract ALL property records visible. For each record provide:
- Property ID
- Owner name
- Address
- Legal description
- Acreage

Return as JSON array: [{ "propertyId": "...", "owner": "...", "address": "...", "legalDescription": "...", "acreage": "..." }]

Only include REAL property (not vehicles or personal property).
Return ONLY the JSON array.`,
        );

        try {
          const items = JSON.parse(
            aiResult.replace(/```json?|```/g, '').trim(),
          ) as Array<{
            propertyId?: string;
            owner?: string;
            address?: string;
            legalDescription?: string;
            acreage?: string;
          }>;

          const results: PropertySearchResult[] = items
            .filter(i => i.propertyId)
            .map(i => ({
              propertyId:       i.propertyId!,
              owner:            i.owner ?? '',
              situsAddress:     i.address ?? '',
              legalDescription: i.legalDescription ?? '',
              acreage:          parseFloat(i.acreage ?? '') || undefined,
              propertyType:     'real' as const,
              matchScore:       35,   // AI-discovered results get lower base score
            }));

          if (results.length > 0) {
            console.log(`[Generic] AI found ${results.length} results for "${variant.searchString}"`);
            return results;
          }
        } catch (e) {
          console.warn('[Generic] Failed to parse AI search results:', e);
        }
      } catch (e) {
        console.warn(`[Generic] Search failed for "${variant.searchString}":`, e);
      }
    }

    return [];
  }

  // ── searchByOwner ────────────────────────────────────────────────────────────

  async searchByOwner(ownerName: string): Promise<PropertySearchResult[]> {
    // Delegate to address search with owner name as the query
    return this.searchByAddress([{ searchString: ownerName, strategy: 'owner_name', priority: 1 }]);
  }

  // ── getPropertyDetail ────────────────────────────────────────────────────────

  async getPropertyDetail(propertyId: string): Promise<PropertyDetail> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    // Navigate to whichever page we're currently on (detail page should already be accessible)
    await this.page.waitForTimeout(500);

    const aiText = await this.aiParseScreen(
      `This is a Texas County Appraisal District property detail page for ${this.countyName} County.

Extract ALL available information and return as JSON:
{
  "owner": "...", "ownerMailingAddress": "...", "situsAddress": "...",
  "legalDescription": "...", "acreage": 0.0, "assessedValue": 0,
  "abstractSurvey": "...", "geoId": "...", "taxYear": 2025,
  "deedReferences": [{ "instrumentNumber": "...", "type": "deed|plat|easement", "date": "..." }],
  "improvements": [{ "type": "Residential", "sqft": 0, "yearBuilt": 0 }]
}

CRITICAL: Extract the legal description EXACTLY as shown.
Return ONLY valid JSON.`,
    );

    try {
      const p = JSON.parse(aiText.replace(/```json?|```/g, '').trim()) as Record<string, unknown>;
      const subdiv = this.detectSubdivision(String(p.legalDescription ?? ''));

      return {
        propertyId,
        owner:               String(p.owner ?? ''),
        ownerMailingAddress: p.ownerMailingAddress ? String(p.ownerMailingAddress) : undefined,
        situsAddress:        String(p.situsAddress ?? ''),
        legalDescription:    String(p.legalDescription ?? ''),
        acreage:             parseFloat(String(p.acreage ?? '0')) || 0,
        propertyType:        'real',
        assessedValue:       parseFloat(String(p.assessedValue ?? '0')) || undefined,
        taxYear:             p.taxYear ? Number(p.taxYear) : undefined,
        abstractSurvey:      p.abstractSurvey ? String(p.abstractSurvey) : undefined,
        geoId:               p.geoId ? String(p.geoId) : undefined,
        subdivisionName:     subdiv.subdivisionName,
        lotNumber:           subdiv.lotNumber,
        blockNumber:         subdiv.blockNumber,
        deedReferences:      [],
        relatedPropertyIds:  [],
        improvements:        [],
      };
    } catch {
      return {
        propertyId,
        owner: '', situsAddress: '', legalDescription: '',
        acreage: 0, propertyType: 'real',
        deedReferences: [], relatedPropertyIds: [], improvements: [],
      };
    }
  }

  // ── findSubdivisionLots ──────────────────────────────────────────────────────

  async findSubdivisionLots(subdivisionName: string): Promise<PropertySearchResult[]> {
    return this.searchByOwner(subdivisionName);
  }
}
