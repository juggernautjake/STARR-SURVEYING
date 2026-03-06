// worker/src/adapters/hcad-adapter.ts
// Harris County Appraisal District (HCAD) adapter.
//
// Harris County (Houston) is the most populous county in Texas and uses a
// custom CAD portal at https://public.hcad.org — it does NOT run BIS,
// TrueAutomation, or Tyler Technologies.  This adapter handles HCAD's unique
// search and detail workflows.
//
// HCAD-specific notes (from spec §3 and empirical testing):
//   • Account numbers are the primary identifier (13-digit format: XXXXXXXXXX000)
//   • Address search uses a single "search_str" field
//   • The same field is used for owner search (different form action)
//   • No city/zip needed — just street number + name
//   • Results are rendered as an HTML table with class ".searchResults"
//   • Detail pages live at /records/details.asp?cession=1&search={accountNumber}
//   • HCAD uses "cession" (session) IDs that expire — we always start fresh
//
// Spec §1.5 — HCAD Adapter
//
// STATUS: ⚠️  NEEDS LIVE TESTING
//   The selectors, form action URLs, and field names in this file were derived
//   from publicly available HCAD documentation and inspection of the portal at
//   https://public.hcad.org.  They must be verified against the live site
//   before relying on this adapter in production.  The AI OCR fallback
//   (aiParseScreen) will handle any selector drift in the meantime.
//
// TODO (before marking Phase 1 HCAD ✅):
//   • Confirm address search field name on live site (currently "search_str")
//   • Confirm results table CSS class (currently ".searchResults tr")
//   • Confirm account number format and detail URL pattern
//   • Add integration test against a known Harris County address

import {
  CADAdapter,
  type PropertySearchResult,
  type PropertyDetail,
} from './cad-adapter.js';
import type { AddressVariant } from '../services/address-normalizer.js';

// ── HCAD raw response shapes ──────────────────────────────────────────────────

/**
 * Shape of a single row extracted from HCAD search results HTML.
 * Column order: Account | Address | Owner | Legal Description | Acreage
 */
interface HcadResultRow {
  accountNumber: string;
  address:       string;
  owner:         string;
  legalDesc:     string;
  acreage:       string;
}

// ── HCADAdapter ───────────────────────────────────────────────────────────────

export class HCADAdapter extends CADAdapter {

  // ── searchByAddress ──────────────────────────────────────────────────────────

  /**
   * Search HCAD by situs address.
   *
   * HCAD address search quirks:
   *   • Strip city/zip — HCAD only uses street number + name
   *   • No FM/RM prefix needed — Houston rarely uses FM roads
   *   • Input field: name="search_str" on form action /records/quicksearch.asp
   *
   * Tries each address variant in order (most → least specific) and returns
   * the first non-empty result set.
   */
  async searchByAddress(variants: AddressVariant[]): Promise<PropertySearchResult[]> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    for (const variant of variants) {
      try {
        // Navigate to the HCAD quick search page
        await this.page.goto(this.config.searchUrl, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });

        // HCAD address format: "1234 MAIN ST" — strip everything after the
        // street suffix since HCAD doesn't use city/zip in the search
        const stripped = this.stripCityState(variant.searchString);

        // Fill the search field and submit the address search form
        // The radio button selects "Address" search mode
        await this.page
          .click('input[value="A"], input[name="search_type"][value="A"]')
          .catch(() => {
            // Some HCAD page versions omit the radio — default is address search
          });

        await this.page.fill(
          `input[name="${this.config.addressField}"]`,
          stripped,
        );

        // Submit via the search button
        await this.page.click(
          'input[type="submit"][value*="Search"], button[type="submit"]',
        ).catch(() => this.page!.keyboard.press('Enter'));

        // Wait for the results table
        await this.page
          .waitForSelector(this.config.resultSelector, { timeout: 20000 })
          .catch(() => {});

        const results = await this.parseSearchResultsDOM();
        if (results.length > 0) {
          console.log(
            `[HCAD] Hit on variant: "${stripped}" (${variant.strategy}) — ${results.length} results`,
          );
          return results;
        }

        // DOM parsing produced no results — try AI OCR fallback
        const aiResults = await this.parseSearchResultsAI(variant.searchString);
        if (aiResults.length > 0) {
          console.log(
            `[HCAD] AI OCR hit on variant: "${stripped}" (${variant.strategy})`,
          );
          return aiResults;
        }

      } catch (e) {
        console.warn(`[HCAD] Search failed for "${variant.searchString}":`, e);
      }
    }

    return [];
  }

  // ── searchByOwner ────────────────────────────────────────────────────────────

  /**
   * Search HCAD by owner name.
   *
   * HCAD uses the same "search_str" field for both address and owner search;
   * the search type is toggled by a radio button.  This method selects the
   * "Owner Name" radio before submitting.
   */
  async searchByOwner(ownerName: string): Promise<PropertySearchResult[]> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    try {
      await this.page.goto(this.config.searchUrl, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Select "Owner Name" search mode radio button
      await this.page
        .click('input[value="O"], input[name="search_type"][value="O"]')
        .catch(() => {});

      await this.page.fill(
        `input[name="${this.config.ownerField}"]`,
        ownerName,
      );

      await this.page.click(
        'input[type="submit"][value*="Search"], button[type="submit"]',
      ).catch(() => this.page!.keyboard.press('Enter'));

      await this.page
        .waitForSelector(this.config.resultSelector, { timeout: 20000 })
        .catch(() => {});

      const results = await this.parseSearchResultsDOM();
      if (results.length > 0) return results;

      // AI fallback
      return this.parseSearchResultsAI(ownerName);

    } catch (e) {
      console.warn(`[HCAD] Owner search failed for "${ownerName}":`, e);
      return [];
    }
  }

  // ── getPropertyDetail ────────────────────────────────────────────────────────

  /**
   * Fetch full property detail from the HCAD detail page.
   *
   * HCAD detail page: /records/details.asp?cession=1&search={accountNumber}
   *
   * The page renders in a frameset in older browser mode.  We navigate
   * directly to the data-only URL and use AI OCR as the primary extraction
   * method since HCAD's detail page layout changes occasionally.
   */
  async getPropertyDetail(propertyId: string): Promise<PropertyDetail> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    // Build the detail URL using the config pattern
    const detailUrl = this.config.detailUrlPattern.replace(
      '{propertyId}',
      encodeURIComponent(propertyId),
    );

    await this.page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
    // HCAD pages can take longer to fully render their detail tables
    await this.page.waitForTimeout(2000);

    // Save a screenshot for the AI OCR fallback
    const screenshotPath = `/tmp/hcad_detail_${propertyId}.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });

    // Try DOM extraction first (faster, more reliable when layout is stable)
    const detail = await this.extractDetailFromDOM(propertyId);

    // If critical fields are missing, fall back to AI OCR
    if (!detail.owner || !detail.legalDescription) {
      const aiDetail = await this.extractDetailFromAI(propertyId);
      if (!detail.owner && aiDetail.owner)                       detail.owner = aiDetail.owner;
      if (!detail.legalDescription && aiDetail.legalDescription) detail.legalDescription = aiDetail.legalDescription;
      if (!detail.acreage && aiDetail.acreage)                   detail.acreage = aiDetail.acreage;
      if (detail.deedReferences.length === 0)                    detail.deedReferences = aiDetail.deedReferences;
    }

    // Detect subdivision membership from the legal description
    const subInfo = this.detectSubdivision(detail.legalDescription);
    detail.subdivisionName = subInfo.subdivisionName;
    detail.lotNumber        = subInfo.lotNumber;
    detail.blockNumber      = subInfo.blockNumber;

    // If this is a subdivision lot, find all related lots
    if (subInfo.isSubdivision && subInfo.subdivisionName) {
      detail.relatedPropertyIds = await this.findSubdivisionLotIds(
        subInfo.subdivisionName,
        propertyId,
      );
    }

    detail.screenshotPath = screenshotPath;
    return detail;
  }

  // ── findSubdivisionLots ──────────────────────────────────────────────────────

  /**
   * Find all lots in a HCAD subdivision by searching the subdivision name.
   * HCAD supports legal description search — subdivision name queries work
   * through the owner/legal description search mode.
   */
  async findSubdivisionLots(subdivisionName: string): Promise<PropertySearchResult[]> {
    return this.searchByOwner(subdivisionName);
  }

  // ── Private: strip city/state from address ────────────────────────────────────

  /**
   * HCAD only needs the street part of an address (no city/zip).
   * "3401 Louisiana St, Houston TX 77002" → "3401 LOUISIANA ST"
   */
  private stripCityState(address: string): string {
    // Remove everything from the comma onward (", City, TX Zip")
    const withoutCity = address.split(',')[0].trim().toUpperCase();
    // Also strip common unit/apt suffixes that confuse HCAD
    return withoutCity
      .replace(/\s+(APT|UNIT|STE|SUITE|#)\s*\S+$/i, '')
      .trim();
  }

  // ── Private: DOM extraction from search results ────────────────────────────────

  /**
   * Parse the HCAD search results table from the DOM.
   * Table structure (typical):
   *   Column 1: Account number (link to detail page)
   *   Column 2: Address
   *   Column 3: Owner name
   *   Column 4: Legal description
   *   Column 5: Acreage
   */
  private async parseSearchResultsDOM(): Promise<PropertySearchResult[]> {
    if (!this.page) return [];

    const results: PropertySearchResult[] = [];

    // Grab all data rows (skip the header row)
    const rows = await this.page.$$(this.config.resultSelector);

    for (const row of rows) {
      // Skip header rows (cells with <th>)
      const isHeader = await row.$('th');
      if (isHeader) continue;

      const cells = await row.$$('td');
      if (cells.length < 3) continue;

      // Column 0: account number — often inside an anchor tag
      const accountLink = await cells[0]?.$('a');
      let accountNumber = '';
      if (accountLink) {
        // Try to get the href first: /records/details.asp?...&search=1234567890000
        const href = await accountLink.getAttribute('href') ?? '';
        const m = href.match(/search=([^&]+)/i);
        accountNumber = m ? decodeURIComponent(m[1]) : await accountLink.innerText().then(t => t.trim());
      } else {
        accountNumber = await cells[0]?.innerText().then(t => t.trim()) ?? '';
      }

      if (!accountNumber) continue;

      const address  = await cells[1]?.innerText().then(t => t.trim()) ?? '';
      const owner    = await cells[2]?.innerText().then(t => t.trim()) ?? '';
      const legalDesc= await cells[3]?.innerText().then(t => t.trim()) ?? '';
      const acreStr  = await cells[4]?.innerText().then(t => t.trim()) ?? '';

      results.push({
        propertyId:       accountNumber,
        owner,
        situsAddress:     address,
        legalDescription: legalDesc,
        acreage:          parseFloat(acreStr) || undefined,
        // Filter: HCAD mixes real property and personal property in results;
        // real property accounts end in 000 (personal property use other suffixes).
        propertyType:     accountNumber.endsWith('000') ? 'real' : 'personal',
        matchScore:       50,
      });
    }

    // Filter to real property only (spec requirement: no vehicles, etc.)
    return results.filter(r => r.propertyType === 'real');
  }

  // ── Private: AI OCR fallback for search results ────────────────────────────────

  private async parseSearchResultsAI(query: string): Promise<PropertySearchResult[]> {
    const aiText = await this.aiParseScreen(
      `This is a Harris County Appraisal District (HCAD) property search results page for the query "${query}".

Extract ALL REAL PROPERTY records visible (not vehicles or personal property).
HCAD account numbers for real property end in "000" (13 digits total).

Return as JSON array:
[{
  "accountNumber": "1234567890000",
  "owner": "OWNER NAME",
  "address": "123 MAIN ST",
  "legalDescription": "...",
  "acreage": 0.0
}]

Return ONLY the JSON array, no explanation.`,
    );

    try {
      const items = JSON.parse(
        aiText.replace(/```json?|```/g, '').trim(),
      ) as Array<{
        accountNumber?: string;
        owner?:         string;
        address?:       string;
        legalDescription?: string;
        acreage?:       number;
      }>;

      return items
        .filter(i => i.accountNumber)
        .map(i => ({
          propertyId:       i.accountNumber!,
          owner:            i.owner ?? '',
          situsAddress:     i.address ?? '',
          legalDescription: i.legalDescription ?? '',
          acreage:          i.acreage ?? undefined,
          propertyType:     'real' as const,
          matchScore:       35,   // AI-parsed results get a lower confidence score
        }));

    } catch (e) {
      console.warn('[HCAD] AI search result parse failed:', e);
      return [];
    }
  }

  // ── Private: DOM extraction for property detail ────────────────────────────────

  /**
   * Extract property detail fields from the HCAD detail page DOM.
   *
   * HCAD detail pages use a <table>-heavy layout with label/value pairs.
   * Labels may appear as bold text in the left cell of a two-column row, or
   * as a "th" element.  We try several CSS selector strategies.
   */
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

    /**
     * Helper: look for a label string in the DOM and return the associated
     * value from the adjacent cell or sibling element.
     */
    const extractField = async (labels: string[]): Promise<string> => {
      for (const label of labels) {
        try {
          // Strategy 1: label cell followed by value cell in same row
          const td = await this.page!.$(`td:has-text("${label}") + td`);
          if (td) {
            const val = await td.innerText();
            if (val.trim()) return val.trim();
          }
          // Strategy 2: th followed by td
          const th = await this.page!.$(`th:has-text("${label}")`);
          if (th) {
            const sibling = await th.evaluateHandle(
              (el: Element) => el.nextElementSibling,
            );
            const siblingEl = sibling.asElement();
            if (siblingEl) {
              const val = await siblingEl.innerText();
              if (val.trim()) return val.trim();
            }
          }
          // Strategy 3: text match anywhere, return parent text minus the label
          const anyEl = await this.page!.$(`*:has-text("${label}:")`);
          if (anyEl) {
            const text = await anyEl.innerText();
            const val = text.replace(new RegExp(`${label}:?\\s*`, 'i'), '').trim();
            if (val) return val;
          }
        } catch {
          // Try next label variant
        }
      }
      return '';
    };

    detail.owner               = await extractField(['Owner Name', 'Owner', 'Name of Owner']);
    detail.ownerMailingAddress = await extractField(['Mailing Address', 'Mail Address']) || undefined;
    detail.situsAddress        = await extractField(['Site Address', 'Situs Address', 'Property Address', 'Location']);
    detail.legalDescription    = await extractField(['Legal Description', 'Legal Desc', 'Legal']);
    detail.geoId               = await extractField(['Account No', 'Account Number', 'Acct']) || propertyId;

    const acreStr  = await extractField(['Land Area', 'Acres', 'Acreage', 'Total Acres']);
    detail.acreage = parseFloat(acreStr.replace(/[^\d.]/g, '')) || 0;

    const valueStr       = await extractField(['Total Appraised', 'Appraised Value', 'Market Value', 'Total Value']);
    detail.assessedValue = parseFloat(valueStr.replace(/[$,]/g, '')) || undefined;

    const yearStr  = await extractField(['Tax Year', 'Year']);
    detail.taxYear = parseInt(yearStr) || undefined;

    return detail;
  }

  // ── Private: AI OCR fallback for property detail ──────────────────────────────

  private async extractDetailFromAI(propertyId: string): Promise<PropertyDetail> {
    const aiText = await this.aiParseScreen(
      `This is a Harris County Appraisal District (HCAD) property detail page for account ${propertyId}.

Extract ALL available information and return as JSON:
{
  "owner": "full owner name",
  "ownerMailingAddress": "mailing address",
  "situsAddress": "property address in Harris County",
  "legalDescription": "EXACT legal description as shown",
  "acreage": 0.0,
  "assessedValue": 0,
  "marketValue": 0,
  "taxYear": 2025,
  "abstractSurvey": "abstract and survey name if shown",
  "geoId": "account number",
  "deedReferences": [
    { "instrumentNumber": "...", "type": "deed|plat|easement", "date": "YYYY-MM-DD" }
  ],
  "improvements": [
    { "type": "Residential|Commercial|etc", "sqft": 0, "yearBuilt": 0 }
  ]
}

CRITICAL: Copy the legal description EXACTLY — it is needed to identify subdivision membership.
Return ONLY valid JSON, no explanation.`,
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
        marketValue:         parseFloat(String(p.marketValue  ?? '0')) || undefined,
        taxYear:             p.taxYear ? Number(p.taxYear) : undefined,
        abstractSurvey:      p.abstractSurvey ? String(p.abstractSurvey) : undefined,
        geoId:               p.geoId ? String(p.geoId) : propertyId,
        subdivisionName:     subdiv.subdivisionName,
        lotNumber:           subdiv.lotNumber,
        blockNumber:         subdiv.blockNumber,
        deedReferences:      [],
        relatedPropertyIds:  [],
        improvements:        [],
      };
    } catch (e) {
      console.warn('[HCAD] AI detail parse failed:', e);
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

  // ── Private: find subdivision lot IDs ────────────────────────────────────────

  /**
   * Find all lot property IDs in the same subdivision.
   * HCAD doesn't expose a direct subdivision search — we use the owner/legal
   * search with the subdivision name and collect all matching account numbers.
   */
  private async findSubdivisionLotIds(
    subdivisionName: string,
    excludePropertyId: string,
  ): Promise<string[]> {
    try {
      const results = await this.searchByOwner(subdivisionName);
      return results
        .map(r => r.propertyId)
        .filter(id => id !== excludePropertyId);
    } catch {
      return [];
    }
  }
}
