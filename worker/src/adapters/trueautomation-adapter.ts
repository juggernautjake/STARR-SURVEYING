// worker/src/adapters/trueautomation-adapter.ts
// TrueAutomation / PropAccess CAD adapter.
// Covers Travis (TCAD), Dallas (DCAD), Bexar, Fort Bend, and ~80+ Texas counties.
//
// Spec §1.5 — TrueAutomation Adapter (stub — full implementation in Phase 1 build-out)

import { CADAdapter, type PropertySearchResult, type PropertyDetail } from './cad-adapter.js';
import type { AddressVariant } from '../services/address-normalizer.js';
import type { ElementHandle } from 'playwright';

export class TrueAutomationAdapter extends CADAdapter {

  // ── Private helper ───────────────────────────────────────────────────────────

  /** Extract a property ID from a result row's link href. */
  private async extractPropertyId(row: ElementHandle): Promise<string> {
    const link = await row.$('a');
    if (!link) return '';
    const href = await link.getAttribute('href') ?? '';
    return (href.match(/prop_id=(\d+)/i) ?? href.match(/ID=(\d+)/i))?.[1] ?? '';
  }

  // ── searchByAddress ──────────────────────────────────────────────────────────

  async searchByAddress(variants: AddressVariant[]): Promise<PropertySearchResult[]> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    for (const variant of variants) {
      try {
        await this.page.goto(this.config.searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // TrueAutomation uses ASP.NET WebForms with long control IDs
        await this.page.fill(
          `input[name="${this.config.addressField}"], input[id="${this.config.addressField}"]`,
          variant.searchString,
        );

        // Submit via the search button (not Enter — ASP.NET postback)
        await this.page.click('input[type="submit"], input[value*="Search"]').catch(() =>
          this.page!.keyboard.press('Enter'),
        );

        await this.page
          .waitForSelector(this.config.resultSelector, { timeout: 20000 })
          .catch(() => {});

        const rows = await this.page.$$(this.config.resultSelector);
        if (rows.length === 0) continue;

        const results: PropertySearchResult[] = [];
        for (const row of rows) {
          const id = await this.extractPropertyId(row);
          if (!id) continue;

          const text  = await row.innerText();
          const cells = text.split('\t').map((s: string) => s.trim()).filter(Boolean);

          results.push({
            propertyId:       id,
            owner:            cells[1] ?? '',
            situsAddress:     cells[2] ?? '',
            legalDescription: cells[3] ?? '',
            propertyType:     'real',
            matchScore:       50,
          });
        }

        if (results.length > 0) {
          console.log(`[TrueAuto] Playwright hit on variant: "${variant.searchString}" (${variant.strategy})`);
          return results;
        }
      } catch (e) {
        console.warn(`[TrueAuto] Search failed for "${variant.searchString}":`, e);
      }
    }

    return [];
  }

  async searchByOwner(ownerName: string): Promise<PropertySearchResult[]> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    await this.page.goto(this.config.searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    await this.page.fill(
      `input[name="${this.config.ownerField}"], input[id="${this.config.ownerField}"]`,
      ownerName,
    );
    await this.page.click('input[type="submit"], input[value*="Search"]').catch(() =>
      this.page!.keyboard.press('Enter'),
    );

    await this.page
      .waitForSelector(this.config.resultSelector, { timeout: 20000 })
      .catch(() => {});

    const rows   = await this.page.$$(this.config.resultSelector);
    const results: PropertySearchResult[] = [];

    for (const row of rows) {
      const id = await this.extractPropertyId(row);
      if (!id) continue;
      const text  = await row.innerText();
      const cells = text.split('\t').map((s: string) => s.trim()).filter(Boolean);

      results.push({
        propertyId:       id,
        owner:            cells[1] ?? '',
        situsAddress:     cells[2] ?? '',
        legalDescription: cells[3] ?? '',
        propertyType:     'real',
        matchScore:       50,
      });
    }

    return results;
  }

  async getPropertyDetail(propertyId: string): Promise<PropertyDetail> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    const detailUrl = this.config.detailUrlPattern.replace(
      '{propertyId}',
      encodeURIComponent(propertyId),
    );

    await this.page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await this.page.waitForTimeout(1000);

    const aiText = await this.aiParseScreen(
      `This is a Texas County Appraisal District property detail page (TrueAutomation / PropAccess system).

Extract ALL available information and return as JSON:
{
  "owner": "...", "ownerMailingAddress": "...", "situsAddress": "...",
  "legalDescription": "...", "acreage": 0.0, "assessedValue": 0,
  "abstractSurvey": "...", "geoId": "...", "taxYear": 2025,
  "deedReferences": [{ "instrumentNumber": "...", "type": "deed|plat|easement", "date": "..." }],
  "improvements": [{ "type": "Residential", "sqft": 0, "yearBuilt": 0 }]
}

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

  async findSubdivisionLots(subdivisionName: string): Promise<PropertySearchResult[]> {
    return this.searchByOwner(subdivisionName);
  }
}
