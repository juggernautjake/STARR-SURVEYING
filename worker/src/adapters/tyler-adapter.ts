// worker/src/adapters/tyler-adapter.ts
// Tyler Technologies (Aumentum / iasWorld) CAD adapter.
// Covers Williamson, Hays, Comal, Guadalupe, and ~50+ other Texas counties.
//
// Spec §1.5 — Tyler Adapter (stub — full implementation in Phase 1 build-out)

import { CADAdapter, type PropertySearchResult, type PropertyDetail } from './cad-adapter.js';
import type { AddressVariant } from '../services/address-normalizer.js';
import type { ElementHandle } from 'playwright';

export class TylerAdapter extends CADAdapter {

  // ── Private helper ───────────────────────────────────────────────────────────

  /** Extract a property ID from a result row's link href. */
  private async extractPropertyId(row: ElementHandle): Promise<string> {
    const directAttr = await row.getAttribute(this.config.propertyIdField).catch(() => null);
    if (directAttr) return directAttr;

    return row.$eval('a', (a: HTMLAnchorElement) => {
      const m = a.href.match(/PropertyQuickRefID\/(\w+)/i);
      return m?.[1] ?? '';
    }).catch(() => '');
  }

  // ── searchByAddress ──────────────────────────────────────────────────────────

  async searchByAddress(variants: AddressVariant[]): Promise<PropertySearchResult[]> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    for (const variant of variants) {
      try {
        await this.page.goto(this.config.searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // Tyler search forms use a text input for address
        await this.page.fill(
          `input[name="${this.config.addressField}"], input[id="${this.config.addressField}"]`,
          variant.searchString,
        );
        await this.page.keyboard.press('Enter');

        await this.page
          .waitForSelector(this.config.resultSelector, { timeout: 15000 })
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
          console.log(`[Tyler] Playwright hit on variant: "${variant.searchString}" (${variant.strategy})`);
          return results;
        }
      } catch (e) {
        console.warn(`[Tyler] Search failed for "${variant.searchString}":`, e);
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
    await this.page.keyboard.press('Enter');

    await this.page
      .waitForSelector(this.config.resultSelector, { timeout: 15000 })
      .catch(() => {});

    const rows  = await this.page.$$(this.config.resultSelector);
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

    // Try AI OCR since Tyler layout varies by county
    const aiText = await this.aiParseScreen(
      `This is a Texas County Appraisal District property detail page (Tyler Technologies / Aumentum system).

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
