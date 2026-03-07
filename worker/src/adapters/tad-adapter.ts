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
// VERIFIED: 2026-03-07 — Search form + results + detail selectors confirmed.
// Results: table.table.table-bordered.table-hover.search-results
// Rows: tr.property-header[data-account-number], td[data-label="..."]
// Detail URL: https://www.tad.org/property?account={account_number}

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
  // Results selectors (verified 2026-03-07):
  // Table: table.table.table-bordered.table-hover.search-results
  // Rows: tr.property-header with data-account-number attribute
  // Cells use data-label attributes: "Property Address", "Property City",
  //   "Primary Owner Name", "Market Value"
  // Account #: td > a[href="property?account={id}"]
  // Type icons: i.fa-solid.fa-building (Commercial), i.fa-solid.fa-dolly (BPP)
  // Expanded details: Current Owner, Legal Description, Agent, State Code, etc.
  private static readonly RESULT_TABLE     = 'table.search-results, table.table.table-bordered.table-hover';
  private static readonly RESULT_ROW       = 'tr.property-header';
  private static readonly RESULT_SELECTORS = [
    'tr.property-header',                              // primary (verified 2026-03-07)
    'table.search-results tbody tr',                   // table-level fallback
    'table.table.table-bordered.table-hover tbody tr', // full class chain
    'table.table tbody tr',                            // generic Bootstrap
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
   * TAD detail page: https://www.tad.org/property?account={accountNumber}
   *
   * The page is a Laravel/Blade app — we wait for data sections to appear
   * before parsing.  AI OCR is used as the primary fallback given that the
   * layout can change between TAD site deployments.
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

    // Primary: wait for the TAD results table or row selector
    let foundResults = false;
    try {
      await this.page.waitForSelector('table.search-results, tr.property-header', { timeout: 8000 });
      foundResults = true;
    } catch {
      // Try fallback selectors
      for (const sel of TADAdapter.RESULT_SELECTORS) {
        try {
          await this.page.waitForSelector(sel, { timeout: 5000 });
          foundResults = true;
          break;
        } catch {
          // Try next
        }
      }
    }
    if (!foundResults) {
      // Give page extra time to render, then rely on AI OCR
      await this.page.waitForTimeout(3000);
    }
  }

  // ── Private: DOM extraction from search results ────────────────────────────────

  /**
   * Parse the TAD search results table from the DOM.
   *
   * TAD results page (verified 2026-03-07):
   *   - Table: table.table.table-bordered.table-hover.search-results
   *   - Result rows: tr.property-header with data-account-number attribute
   *   - Account #: first td > a[href="property?account={id}"]
   *   - Property Address: td[data-label="Property Address"]
   *   - Property City: td[data-label="Property City"]
   *   - Primary Owner: td[data-label="Primary Owner Name"]
   *   - Market Value: td[data-label="Market Value"] (e.g. "$849,119 (2025)")
   *   - Type icons: i.fa-solid.fa-building (Commercial), i.fa-solid.fa-dolly (BPP)
   *   - Expanded inline details include Legal Description, State Code, etc.
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

      // Primary strategy: use data-account-number attribute on tr.property-header
      let accountNumber = await row.getAttribute('data-account-number') ?? '';

      // Fallback: extract from link href (property?account={id})
      if (!accountNumber) {
        const accountLink = await row.$('td a[href*="property?account="], td a[href*="property/"]');
        if (accountLink) {
          const href = await accountLink.getAttribute('href') ?? '';
          const m = href.match(/account=([^&]+)/i) || href.match(/\/property\/([^/?]+)/i);
          accountNumber = m ? decodeURIComponent(m[1]) : await accountLink.innerText().then(t => t.trim());
        }
      }

      // Last fallback: first td text
      if (!accountNumber) {
        const firstTd = await row.$('td');
        if (firstTd) accountNumber = await firstTd.innerText().then(t => t.trim());
      }

      if (!accountNumber) continue;

      // Use data-label attributes for reliable field extraction
      const addressCell = await row.$('td[data-label="Property Address"]');
      const cityCell    = await row.$('td[data-label="Property City"]');
      const ownerCell   = await row.$('td[data-label="Primary Owner Name"]');
      const valueCell   = await row.$('td[data-label="Market Value"]');

      const address  = addressCell ? await addressCell.innerText().then(t => t.trim()) : '';
      const city     = cityCell    ? await cityCell.innerText().then(t => t.trim()) : '';
      const owner    = ownerCell   ? await ownerCell.innerText().then(t => t.trim()) : '';
      const valueStr = valueCell   ? await valueCell.innerText().then(t => t.trim()) : '';

      // Combine address + city
      const fullAddress = city ? `${address}, ${city}` : address;

      // Parse market value — format: "$849,119 (2025)"
      const marketValue = parseFloat(valueStr.replace(/[$,]/g, '').replace(/\s*\(\d{4}\)/, '')) || undefined;

      // Determine property type from icon classes
      let propertyType: 'real' | 'personal' = 'real';
      const bppIcon = await row.$('i.fa-solid.fa-dolly, i.fa-dolly');
      if (bppIcon) {
        propertyType = 'personal';
      }
      // Also check if account is numeric-only (real property)
      if (!/^\d+$/.test(accountNumber)) {
        propertyType = 'personal';
      }

      results.push({
        propertyId:       accountNumber,
        owner,
        situsAddress:     fullAddress,
        legalDescription: '',  // Not in main results row — available in expanded details
        acreage:          undefined,
        assessedValue:    marketValue,
        propertyType,
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
   * TAD uses a Laravel/Blade app with data-label attributes on table cells
   * (verified 2026-03-07). The expanded inline details on the search results
   * page include fields like:
   *   - Current Owner, Primary Owner Address, Legal Description
   *   - Agent, State Code, Business Name, Georeference
   *   - Instrument, Site Class, Site Number, Site Name, Number of Parcels
   *
   * The detail page at /property?account={id} shows more comprehensive data.
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
     * Helper: try data-label attributes first (TAD pattern), then fall back
     * to text-based strategies.
     */
    const extractField = async (labels: string[]): Promise<string> => {
      for (const label of labels) {
        try {
          // Strategy 1: TAD data-label attribute (primary — verified 2026-03-07)
          const labeled = await this.page!.$(`[data-label="${label}"], td[data-label="${label}"]`);
          if (labeled) {
            const val = await labeled.innerText();
            if (val.trim()) return val.trim();
          }
          // Strategy 2: th → adjacent td
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
          // Strategy 3: td label → adjacent td value
          const tdNext = await this.page!.$(`td:has-text("${label}") + td`);
          if (tdNext) {
            const val = await tdNext.innerText();
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

    detail.owner               = await extractField(['Current Owner', 'Primary Owner Name', 'Owner Name', 'Owner']);
    detail.ownerMailingAddress = await extractField(['Primary Owner Address', 'Mailing Address', 'Owner Address']) || undefined;
    detail.situsAddress        = await extractField(['Property Address', 'Property Location', 'Site Address', 'Situs Address']);
    detail.legalDescription    = await extractField(['Legal Description', 'Legal Desc', 'Legal']);
    detail.geoId               = await extractField(['Account Number', 'Account No', 'Acct No']) || propertyId;
    detail.abstractSurvey      = await extractField(['Abstract/Survey', 'Abstract', 'Survey']) || undefined;

    const acreStr  = await extractField(['Acreage', 'Acres', 'Land Area', 'Land Acres']);
    detail.acreage = parseFloat(acreStr.replace(/[^\d.]/g, '')) || 0;

    const valueStr       = await extractField(['Market Value', 'Total Appraised Value', 'Appraised Value', 'Total Value']);
    detail.assessedValue = parseFloat(valueStr.replace(/[$,]/g, '').replace(/\s*\(\d{4}\)/, '')) || undefined;

    const yearStr  = await extractField(['Tax Year', 'Year']);
    detail.taxYear = parseInt(yearStr) || undefined;

    // TAD-specific fields
    const stateCode = await extractField(['State Code']);
    if (stateCode) detail.abstractSurvey = detail.abstractSurvey || stateCode;

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
