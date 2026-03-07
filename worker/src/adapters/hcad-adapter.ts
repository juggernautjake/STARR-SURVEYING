// worker/src/adapters/hcad-adapter.ts
// Harris County Appraisal District (HCAD) adapter.
//
// Harris County (Houston) is the most populous county in Texas and uses a
// custom CAD portal at https://public.hcad.org — it does NOT run BIS,
// TrueAutomation, or Tyler Technologies.  This adapter handles HCAD's unique
// search and detail workflows.
//
// HCAD-specific notes:
//   • Account numbers are the primary identifier (13-digit format: XXXXXXXXXX000)
//   • No city/zip needed — just street number + name
//   • HCAD's portal was redesigned as a Blazor SPA (verified 2026-03-07):
//       – Radio buttons: name="filterOptions", values: PROPERTYADDRESS / OWNERNAME
//       – Search input:  class "inputSearch" (no name attribute)
//       – Submit button: button.btn-primary.buttonFontsize (type="button", JS-driven)
//       – Results load dynamically via Blazor SignalR
//   • The old quicksearch.asp / ".searchResults tr" interface is GONE.
//   • Detail pages may still work at /records/details.asp but this needs verification.
//   • AI OCR fallback (aiParseScreen) covers results parsing when DOM selectors drift.
//
// Spec §1.5 — HCAD Adapter
//
// VERIFIED: 2026-03-07 — Search form + results + detail selectors confirmed.
// Results page uses jQuery DataTables: table.data-table, tr.resulttr.dataTableGridText
// Detail page uses Blazor components: #OwnerInfoComponent, #ValuationComponent, etc.

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

  // ── Blazor SPA selectors (verified 2026-03-07) ─────────────────────────────
  // The new HCAD portal uses a Blazor app with these selectors:
  private static readonly RADIO_ADDRESS  = 'input#PROPERTYADDRESS, input[value="PROPERTYADDRESS"]';
  private static readonly RADIO_OWNER    = 'input#OWNERNAME, input[value="OWNERNAME"]';
  private static readonly RADIO_ACCOUNT  = 'input#ACCOUNTNUMBER, input[value="ACCOUNTNUMBER"]';
  private static readonly SEARCH_INPUT   = 'input.inputSearch, input[type="search"].searchTerm';
  private static readonly SEARCH_SUBMIT  = 'button.btn-primary.buttonFontsize';
  // Results selector — HCAD uses jQuery DataTables plugin (verified 2026-03-07).
  // Results are inside div.dataTables_wrapper > table.data-table.
  // Each result row: tr.resulttr.dataTableGridText (clickable, cursor: pointer).
  // Columns: Account (td.resulttd > b), Owner (td.resulttd), Address (td.resulttd),
  //          Type (td.resulttd > label.blue-rounded-text: "Personal"|"Commercial")
  private static readonly RESULT_ROW_SELECTOR = 'tr.resulttr.dataTableGridText';
  private static readonly RESULT_TABLE        = 'table.data-table';
  // Fallback selectors in case class names change
  private static readonly RESULT_SELECTORS = [
    'tr.resulttr.dataTableGridText',          // primary (verified 2026-03-07)
    'tr.resulttr',                            // without grid text class
    'div.dataTables_wrapper table tbody tr',   // DataTables wrapper fallback
    'table.data-table tbody tr',              // direct table fallback
  ];
  // Detail page Blazor component selectors (verified 2026-03-07)
  private static readonly DETAIL_OWNER_INFO   = '#OwnerInfoComponent';
  private static readonly DETAIL_VALUATION    = '#ValuationComponent';
  private static readonly DETAIL_VALUE_HISTORY= '#ValueHistoryComponent';
  private static readonly DETAIL_JURISDICTIONS= '#JurisdictionsComponent';
  private static readonly DETAIL_PROPERTY     = '#PropertyComponent';
  private static readonly DETAIL_STATUS       = '#StatusComponent';

  /**
   * Search HCAD by situs address.
   *
   * HCAD address search quirks:
   *   • Strip city/zip — HCAD only uses street number + name
   *   • No FM/RM prefix needed — Houston rarely uses FM roads
   *   • New Blazor SPA uses radio name="filterOptions" and class "inputSearch"
   *
   * Tries each address variant in order (most → least specific) and returns
   * the first non-empty result set.
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

        const stripped = this.stripCityState(variant.searchString);
        await this.fillAndSubmitSearch(HCADAdapter.RADIO_ADDRESS, stripped);

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
   * Uses the same search input as address search but selects the OWNERNAME
   * radio button first (new Blazor interface uses name="filterOptions").
   */
  async searchByOwner(ownerName: string): Promise<PropertySearchResult[]> {
    await this.initBrowser();
    if (!this.page) throw new Error('Browser not initialized');

    try {
      await this.page.goto(this.config.searchUrl, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      await this.fillAndSubmitSearch(HCADAdapter.RADIO_OWNER, ownerName);

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
    // Wait for Blazor components to render (OwnerInfo is first to appear)
    try {
      await this.page.waitForSelector('#OwnerInfoComponent, #ValuationComponent', { timeout: 10000 });
    } catch {
      // Components didn't appear — fall through to AI OCR
      await this.page.waitForTimeout(3000);
    }

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

  // ── Private: fill and submit the search form ─────────────────────────────────

  /**
   * Shared helper: select a radio button, fill the search input, and submit.
   *
   * The new Blazor SPA uses:
   *   - Radio buttons with name="filterOptions" (e.g. value="PROPERTYADDRESS")
   *   - A single search input with class "inputSearch" (no name attribute)
   *   - A submit button with type="button" (JS-driven, not form submit)
   *
   * Falls back to the legacy selectors if the new ones aren't found.
   */
  private async fillAndSubmitSearch(radioSelector: string, query: string): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    // Select search mode via radio button
    await this.page.click(radioSelector).catch(() => {
      // Radio might not exist or may be pre-selected — continue anyway
      console.warn(`[HCAD] Radio selector "${radioSelector}" not found, continuing`);
    });

    // Fill the search input — try new Blazor selector first, then legacy
    const inputSelector = HCADAdapter.SEARCH_INPUT;
    const inputEl = await this.page.$(inputSelector);
    if (inputEl) {
      await inputEl.fill(query);
    } else {
      // Legacy fallback: input[name="search_str"]
      console.warn('[HCAD] New inputSearch not found, trying legacy search_str');
      await this.page.fill('input[name="search_str"]', query);
    }

    // Click submit — try new Blazor button first, then legacy
    const submitEl = await this.page.$(HCADAdapter.SEARCH_SUBMIT);
    if (submitEl) {
      await submitEl.click();
    } else {
      // Legacy fallback
      await this.page.click(
        'input[type="submit"][value*="Search"], button[type="submit"]',
      ).catch(() => this.page!.keyboard.press('Enter'));
    }

    // Wait for results to load — Blazor renders DataTables asynchronously.
    // Primary: wait for the DataTables wrapper or result rows to appear.
    let foundResults = false;
    try {
      // First try waiting for the DataTables wrapper (appears once results load)
      await this.page.waitForSelector('div.dataTables_wrapper, table.data-table', { timeout: 10000 });
      foundResults = true;
      // Give DataTables a moment to populate rows
      await this.page.waitForTimeout(1000);
    } catch {
      // DataTables wrapper didn't appear — try individual result selectors
      for (const sel of HCADAdapter.RESULT_SELECTORS) {
        try {
          await this.page.waitForSelector(sel, { timeout: 5000 });
          foundResults = true;
          break;
        } catch {
          // Try next selector
        }
      }
    }
    if (!foundResults) {
      // None of the known selectors matched — wait for the Blazor app to
      // finish rendering, then rely on AI OCR to parse whatever appeared.
      await this.page.waitForTimeout(5000);
    }
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
   *
   * HCAD uses jQuery DataTables (verified 2026-03-07):
   *   - Table: table.data-table inside div.dataTables_wrapper
   *   - Rows: tr.resulttr.dataTableGridText (clickable)
   *   - Column 0: Account number in bold — td.resulttd > b (e.g. <b>0077396</b>)
   *   - Column 1: Owner name — td.resulttd (left-aligned)
   *   - Column 2: Address — td.resulttd (e.g. "3401 LOUISIANA ST # 400, HOUSTON, TX 77002")
   *   - Column 3: Type — td.resulttd > label.blue-rounded-text ("Personal"|"Commercial")
   */
  private async parseSearchResultsDOM(): Promise<PropertySearchResult[]> {
    if (!this.page) return [];

    const results: PropertySearchResult[] = [];

    // Try each known result selector until one produces rows
    let rows: Awaited<ReturnType<typeof this.page.$$>> = [];
    for (const sel of HCADAdapter.RESULT_SELECTORS) {
      rows = await this.page.$$(sel);
      if (rows.length > 0) {
        console.log(`[HCAD] Found ${rows.length} rows with selector "${sel}"`);
        break;
      }
    }
    if (rows.length === 0) return [];

    for (const row of rows) {
      // Skip header rows
      const isHeader = await row.$('th');
      if (isHeader) continue;

      const cells = await row.$$('td.resulttd');
      // Fall back to generic td if .resulttd not found
      const tdCells = cells.length >= 3 ? cells : await row.$$('td');
      if (tdCells.length < 3) continue;

      // Column 0: Account number — inside a <b> tag within td.resulttd
      let accountNumber = '';
      const boldEl = await tdCells[0]?.$('b');
      if (boldEl) {
        accountNumber = await boldEl.innerText().then(t => t.trim());
      } else {
        // Fallback: try link or raw text
        const linkEl = await tdCells[0]?.$('a');
        if (linkEl) {
          accountNumber = await linkEl.innerText().then(t => t.trim());
        } else {
          accountNumber = await tdCells[0]?.innerText().then(t => t.trim()) ?? '';
        }
      }

      if (!accountNumber) continue;

      // Column 1: Owner name (left-aligned text)
      const owner = await tdCells[1]?.innerText().then(t => t.trim()) ?? '';

      // Column 2: Address (e.g. "3401 LOUISIANA ST # 400, HOUSTON, TX 77002")
      const address = await tdCells[2]?.innerText().then(t => t.trim()) ?? '';

      // Column 3: Type — label.blue-rounded-text contains "Personal" or "Commercial"
      let propertyType: 'real' | 'personal' = 'real';
      if (tdCells.length > 3) {
        const typeLabel = await tdCells[3]?.$('label.blue-rounded-text');
        if (typeLabel) {
          const typeText = await typeLabel.innerText().then(t => t.trim().toLowerCase());
          if (typeText === 'personal') {
            propertyType = 'personal';
          }
        }
      }

      // Also check account number suffix: real property ends in 000
      if (!accountNumber.endsWith('000')) {
        propertyType = 'personal';
      }

      results.push({
        propertyId:       accountNumber,
        owner,
        situsAddress:     address,
        legalDescription: '',  // Not shown in results table — fetched from detail page
        acreage:          undefined,
        propertyType,
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
   * HCAD detail page is a Blazor SPA with distinct component sections
   * (verified 2026-03-07):
   *   - #OwnerInfoComponent: account, owner name, situs address, mailing address
   *   - #ValuationComponent: assessed values (may show "Pending")
   *   - #ValueHistoryComponent: bar chart (canvas#BarChart)
   *   - #JurisdictionsComponent: tax districts, exemptions, rates
   *   - #PropertyComponent: description, square ft, SIC code
   *   - #StatusComponent: value notice date, protest deadline, ARB status
   *   - Year dropdown: 2022–2026
   *   - Location table: State Class Code, Property Type, Key Map
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

    // Wait for Blazor components to render
    try {
      await this.page.waitForSelector(HCADAdapter.DETAIL_OWNER_INFO, { timeout: 10000 });
    } catch {
      // Component didn't appear — may still have data via generic selectors
    }

    /**
     * Helper: extract text from within a specific Blazor component container,
     * searching for label/value pairs. Falls back to page-wide search.
     */
    const extractFromComponent = async (
      componentSelector: string,
      labels: string[],
    ): Promise<string> => {
      const component = await this.page!.$(componentSelector);
      const scope = component ?? this.page!;

      for (const label of labels) {
        try {
          // Strategy 1: td label → adjacent td value (HCAD uses table layout)
          const td = await scope.$(`td:has-text("${label}") + td`);
          if (td) {
            const val = await td.innerText();
            if (val.trim()) return val.trim();
          }
          // Strategy 2: th → adjacent td
          const th = await scope.$(`th:has-text("${label}")`);
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
          // Strategy 3: labeled span/div pattern (Blazor often uses these)
          const labelEl = await scope.$(`*:has-text("${label}:")`);
          if (labelEl) {
            const text = await labelEl.innerText();
            const val = text.replace(new RegExp(`${label}:?\\s*`, 'i'), '').trim();
            if (val) return val;
          }
        } catch {
          // Try next label
        }
      }
      return '';
    };

    // Extract from #OwnerInfoComponent
    detail.owner               = await extractFromComponent(HCADAdapter.DETAIL_OWNER_INFO, ['Owner Name', 'Owner', 'Name of Owner']);
    detail.ownerMailingAddress = await extractFromComponent(HCADAdapter.DETAIL_OWNER_INFO, ['Mailing Address', 'Mail Address']) || undefined;
    detail.situsAddress        = await extractFromComponent(HCADAdapter.DETAIL_OWNER_INFO, ['Site Address', 'Situs Address', 'Property Address', 'Location']);
    detail.geoId               = await extractFromComponent(HCADAdapter.DETAIL_OWNER_INFO, ['Account No', 'Account Number', 'Account', 'Acct']) || propertyId;

    // Extract from #PropertyComponent
    detail.legalDescription    = await extractFromComponent(HCADAdapter.DETAIL_PROPERTY, ['Legal Description', 'Legal Desc', 'Description', 'Legal']);
    const sqftStr              = await extractFromComponent(HCADAdapter.DETAIL_PROPERTY, ['Square Ft', 'Square Feet', 'Sq Ft', 'Building Area']);
    const acreStr              = await extractFromComponent(HCADAdapter.DETAIL_PROPERTY, ['Land Area', 'Acres', 'Acreage', 'Total Acres']);
    detail.acreage = parseFloat(acreStr.replace(/[^\d.]/g, '')) || 0;

    // Extract from #ValuationComponent
    const valueStr       = await extractFromComponent(HCADAdapter.DETAIL_VALUATION, ['Total Appraised', 'Appraised Value', 'Market Value', 'Total Value', 'Assessed Value']);
    detail.assessedValue = parseFloat(valueStr.replace(/[$,]/g, '')) || undefined;

    // Extract tax year from dropdown or status
    const yearStr  = await extractFromComponent(HCADAdapter.DETAIL_STATUS, ['Tax Year', 'Year']);
    detail.taxYear = parseInt(yearStr) || undefined;

    // Try to get improvements from square footage
    if (sqftStr) {
      const sqft = parseFloat(sqftStr.replace(/[^\d.]/g, ''));
      if (sqft > 0) {
        detail.improvements = [{ type: 'Building', sqft, yearBuilt: 0 }];
      }
    }

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
