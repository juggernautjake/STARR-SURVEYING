// worker/src/adapters/tad-adapter.ts
// Tarrant Appraisal District (TAD) adapter.
//
// Tarrant County (Fort Worth) is the 3rd most populous county in Texas and
// runs its own custom CAD portal at https://www.tad.org — it does NOT run
// BIS, TrueAutomation, or Tyler Technologies.
//
// TAD-specific notes (verified 2026-03-07):
//   • Property identifiers are "account numbers" (numeric)
//   • TAD is a Laravel app (NOT React — the 2024 redesign used Laravel/Blade)
//   • Search form uses:
//       – Dropdown: select#search-type[name="searchType"] with values
//         "PropertyAddress", "OwnerName", "AccountNumber", etc.
//       – Text input: input#query[name="query"]
//       – Submit: button.btn-tad-light-blue[type="submit"]
//       – Form action: POST to "search-results" (relative URL)
//       – CSRF token: hidden input name="_token" (Laravel)
//   • Property type checkboxes: name="filter[]", values R/C/M/P
//   • Deprecation notice on site: "current Property Search will no longer
//     be available in 2027" — a new search is being built.
//   • Detail page URL pattern not yet confirmed.
//   • AI OCR fallback handles results parsing when DOM selectors drift.
//
// Spec §1.5 — TAD Adapter
//
// VERIFIED: 2026-03-07 — Search form selectors confirmed against live site.
// PENDING:  Results table selector + detail page URL pattern need verification.

import {
  CADAdapter,
  type PropertySearchResult,
  type PropertyDetail,
} from './cad-adapter.js';
import type { AddressVariant } from '../services/address-normalizer.js';

// ── TADAdapter ────────────────────────────────────────────────────────────────

export class TADAdapter extends CADAdapter {

  // ── TAD selectors (verified 2026-03-07) ───────────────────────────────────
  private static readonly SEARCH_TYPE_DROPDOWN = 'select#search-type, select[name="searchType"]';
  private static readonly SEARCH_INPUT         = 'input#query, input[name="query"]';
  private static readonly SEARCH_SUBMIT        = 'button.btn-tad-light-blue[type="submit"], button[type="submit"]';
  // Property type checkboxes — ensure "Real" is checked, optionally uncheck "Personal"
  private static readonly CHECKBOX_RESIDENTIAL  = 'input#residential[value="R"]';
  private static readonly CHECKBOX_PERSONAL     = 'input#personal-property[value="P"]';
  // Results — try multiple selectors since we haven't captured results HTML yet
  private static readonly RESULT_SELECTORS = [
    '.search-results-table tr',   // original guess
    'table.table tbody tr',       // Bootstrap pattern
    '.property-results tr',       // common pattern
    'table tbody tr',             // generic fallback
  ];

  // ── searchByAddress ──────────────────────────────────────────────────────────

  /**
   * Search TAD by situs address.
   *
   * TAD uses a dropdown to select search type ("PropertyAddress") and a single
   * input#query field for the search text.  Form POSTs to "search-results".
   */
  async searchByAddress(variants: AddressVariant[]): Promise<PropertySearchResult[]> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    for (const variant of variants) {
      try {
        await this.page.goto(this.config.searchUrl, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });

        await this.fillAndSubmitSearch('PropertyAddress', variant.searchString);

        // Check for empty results
        const noResults = await this.page.$('.no-results, .alert-warning, *:has-text("No results found")');
        if (noResults) continue;

        const results = await this.parseSearchResultsDOM();
        if (results.length > 0) {
          console.log(
            `[TAD] Hit on variant: "${variant.searchString}" (${variant.strategy}) — ${results.length} results`,
          );
          return results;
        }

        // DOM parsing produced nothing — try AI OCR fallback
        const aiResults = await this.parseSearchResultsAI(variant.searchString);
        if (aiResults.length > 0) {
          console.log(
            `[TAD] AI OCR hit on variant: "${variant.searchString}" (${variant.strategy})`,
          );
          return aiResults;
        }

      } catch (e) {
        console.warn(`[TAD] Address search failed for "${variant.searchString}":`, e);
      }
    }

    return [];
  }

  // ── searchByOwner ────────────────────────────────────────────────────────────

  /**
   * Search TAD by owner name.
   *
   * Uses the same form as address search — selects "OwnerName" from the
   * searchType dropdown instead of "PropertyAddress".
   */
  async searchByOwner(ownerName: string): Promise<PropertySearchResult[]> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    try {
      await this.page.goto(this.config.searchUrl, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      await this.fillAndSubmitSearch('OwnerName', ownerName);

      const results = await this.parseSearchResultsDOM();
      if (results.length > 0) return results;

      return this.parseSearchResultsAI(ownerName);

    } catch (e) {
      console.warn(`[TAD] Owner search failed for "${ownerName}":`, e);
      return [];
    }
  }

  // ── getPropertyDetail ────────────────────────────────────────────────────────

  /**
   * Fetch full property detail from the TAD detail page.
   *
   * TAD detail page: https://www.tad.org/property/{accountNumber}/
   *
   * The page is a React SPA — we wait for the data sections to appear before
   * parsing.  AI OCR is used as the primary fallback given that the React
   * component tree can change between TAD site deployments.
   */
  async getPropertyDetail(propertyId: string): Promise<PropertyDetail> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    // Build the detail URL
    const detailUrl = this.config.detailUrlPattern.replace(
      '{propertyId}',
      encodeURIComponent(propertyId),
    );

    await this.page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
    // TAD SPA may lazy-load the property data sections
    await this.page.waitForTimeout(2500);

    // Save a screenshot for audit / AI fallback
    const screenshotPath = `/tmp/tad_detail_${propertyId}.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });

    // Try DOM extraction first
    const detail = await this.extractDetailFromDOM(propertyId);

    // Supplement with AI OCR if critical fields are missing
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

    // If this is a subdivision lot, look up all related lots
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
   * Find all lots in a TAD subdivision by searching the subdivision name as an
   * owner/legal description query.
   */
  async findSubdivisionLots(subdivisionName: string): Promise<PropertySearchResult[]> {
    return this.searchByOwner(subdivisionName);
  }

  // ── Private: fill and submit the TAD search form ────────────────────────────

  /**
   * Shared helper: select search type from dropdown, fill query, submit.
   *
   * TAD's form (verified 2026-03-07):
   *   - Dropdown: select#search-type[name="searchType"]
   *   - Input:    input#query[name="query"]
   *   - Submit:   button.btn-tad-light-blue[type="submit"]
   *   - CSRF:     hidden input name="_token" (Laravel)
   *
   * @param searchType - Value for the searchType dropdown (e.g. "PropertyAddress", "OwnerName")
   * @param query      - Search text to enter
   */
  private async fillAndSubmitSearch(searchType: string, query: string): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    // Select search type from dropdown
    await this.page.selectOption(TADAdapter.SEARCH_TYPE_DROPDOWN, searchType).catch(() => {
      console.warn(`[TAD] Could not select searchType "${searchType}" from dropdown`);
    });

    // Ensure Residential checkbox is checked, uncheck Personal Property
    await this.page.$eval(TADAdapter.CHECKBOX_RESIDENTIAL, (el: HTMLInputElement) => {
      if (!el.checked) el.click();
    }).catch(() => {});
    await this.page.$eval(TADAdapter.CHECKBOX_PERSONAL, (el: HTMLInputElement) => {
      if (el.checked) el.click();
    }).catch(() => {});

    // Fill search input
    const inputEl = await this.page.$(TADAdapter.SEARCH_INPUT);
    if (inputEl) {
      await inputEl.fill(query);
    } else {
      console.warn('[TAD] Search input not found, trying legacy selectors');
      await this.page.fill('input[placeholder*="Search" i]', query);
    }

    // Submit form
    await this.page.click(TADAdapter.SEARCH_SUBMIT)
      .catch(() => this.page!.keyboard.press('Enter'));

    // Wait for results — form POSTs to search-results page
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    // Try each known result selector
    for (const sel of TADAdapter.RESULT_SELECTORS) {
      try {
        await this.page.waitForSelector(sel, { timeout: 5000 });
        break;
      } catch {
        // Try next
      }
    }
  }

  // ── Private: DOM extraction from search results ────────────────────────────────

  /**
   * Parse the TAD search results table from the DOM.
   *
   * Tries multiple result selectors since the results HTML structure
   * hasn't been captured yet.
   *
   * Typical column order (may vary by TAD site version):
   *   Column 0: Account number (link to detail page)
   *   Column 1: Owner name
   *   Column 2: Property address
   *   Column 3: Legal description
   *   Column 4: Acreage / land area
   */
  private async parseSearchResultsDOM(): Promise<PropertySearchResult[]> {
    if (!this.page) return [];

    const results: PropertySearchResult[] = [];

    // Try each known result selector until one produces rows
    let rows: Awaited<ReturnType<typeof this.page.$$>> = [];
    for (const sel of TADAdapter.RESULT_SELECTORS) {
      rows = await this.page.$$(sel);
      if (rows.length > 0) {
        console.log(`[TAD] Found ${rows.length} rows with selector "${sel}"`);
        break;
      }
    }
    if (rows.length === 0) return [];

    for (const row of rows) {
      // Skip header rows
      const isHeader = await row.$('th');
      if (isHeader) continue;

      const cells = await row.$$('td');
      if (cells.length < 3) continue;

      // Account number — may be in a link or the raw cell text
      const accountLink = await cells[0]?.$('a');
      let accountNumber = '';
      if (accountLink) {
        const href = await accountLink.getAttribute('href') ?? '';
        // TAD detail URLs: /property/1234567890/
        const m = href.match(/\/property\/([^/]+)/i);
        accountNumber = m ? m[1] : await accountLink.innerText().then(t => t.trim());
      } else {
        accountNumber = await cells[0]?.innerText().then(t => t.trim()) ?? '';
      }

      if (!accountNumber) continue;

      const owner    = await cells[1]?.innerText().then(t => t.trim()) ?? '';
      const address  = await cells[2]?.innerText().then(t => t.trim()) ?? '';
      const legalDesc= cells.length > 3
        ? await cells[3]?.innerText().then(t => t.trim()) ?? ''
        : '';
      const acreStr  = cells.length > 4
        ? await cells[4]?.innerText().then(t => t.trim()) ?? ''
        : '';

      results.push({
        propertyId:       accountNumber,
        owner,
        situsAddress:     address,
        legalDescription: legalDesc,
        acreage:          parseFloat(acreStr) || undefined,
        // TAD mixes real and personal property in its results table;
        // real property accounts are numeric-only
        propertyType:     /^\d+$/.test(accountNumber) ? 'real' : 'personal',
        matchScore:       50,
      });
    }

    // Return only real property results
    return results.filter(r => r.propertyType === 'real');
  }

  // ── Private: AI OCR fallback for search results ────────────────────────────────

  private async parseSearchResultsAI(query: string): Promise<PropertySearchResult[]> {
    const aiText = await this.aiParseScreen(
      `This is a Tarrant Appraisal District (TAD) property search results page for the query "${query}".

Extract ALL REAL PROPERTY records visible (not vehicles, boats, or business personal property).
TAD account numbers are numeric (8–12 digits).

Return as JSON array:
[{
  "accountNumber": "12345678",
  "owner": "OWNER NAME",
  "address": "123 MAIN ST, FORT WORTH TX",
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
      console.warn('[TAD] AI search result parse failed:', e);
      return [];
    }
  }

  // ── Private: DOM extraction for property detail ────────────────────────────────

  /**
   * Extract property detail from the TAD detail page DOM.
   *
   * TAD uses a React SPA with data sections rendered as labeled cards or
   * tables.  We try multiple selector strategies for each field.
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
     * Helper: try multiple label strings and return the first matching value
     * found in the DOM using adjacent-cell or child-text strategies.
     */
    const extractField = async (labels: string[]): Promise<string> => {
      for (const label of labels) {
        try {
          // Strategy 1: <td> label → adjacent <td> value
          const tdNext = await this.page!.$(`td:has-text("${label}") + td`);
          if (tdNext) {
            const val = await tdNext.innerText();
            if (val.trim()) return val.trim();
          }
          // Strategy 2: <th> → adjacent <td>
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
          // Strategy 3: React data-label attribute pattern
          const labeled = await this.page!.$(`[data-label="${label}"]`);
          if (labeled) {
            const val = await labeled.innerText();
            if (val.trim()) return val.trim();
          }
          // Strategy 4: text-based search with label prefix
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

    detail.owner               = await extractField(['Owner Name', 'Owner', 'Property Owner']);
    detail.ownerMailingAddress = await extractField(['Mailing Address', 'Mail Address', 'Owner Address']) || undefined;
    detail.situsAddress        = await extractField(['Property Location', 'Site Address', 'Situs Address', 'Address']);
    detail.legalDescription    = await extractField(['Legal Description', 'Legal Desc', 'Legal']);
    detail.geoId               = await extractField(['Account Number', 'Acct No', 'Account No']) || propertyId;
    detail.abstractSurvey      = await extractField(['Abstract/Survey', 'Abstract', 'Survey']) || undefined;

    const acreStr  = await extractField(['Acreage', 'Acres', 'Land Area', 'Land Acres']);
    detail.acreage = parseFloat(acreStr.replace(/[^\d.]/g, '')) || 0;

    const valueStr       = await extractField(['Total Appraised Value', 'Appraised Value', 'Total Value', 'Market Value']);
    detail.assessedValue = parseFloat(valueStr.replace(/[$,]/g, '')) || undefined;

    const yearStr  = await extractField(['Tax Year', 'Year']);
    detail.taxYear = parseInt(yearStr) || undefined;

    return detail;
  }

  // ── Private: AI OCR fallback for property detail ──────────────────────────────

  private async extractDetailFromAI(propertyId: string): Promise<PropertyDetail> {
    const aiText = await this.aiParseScreen(
      `This is a Tarrant Appraisal District (TAD) property detail page for account ${propertyId}.

Extract ALL available information and return as JSON:
{
  "owner": "full owner name",
  "ownerMailingAddress": "mailing address",
  "situsAddress": "property address in Fort Worth / Tarrant County",
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
      console.warn('[TAD] AI detail parse failed:', e);
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
   * Find all lot property IDs in the same TAD subdivision.
   * We search by subdivision name via the owner/legal description search
   * and collect all matching account numbers.
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
