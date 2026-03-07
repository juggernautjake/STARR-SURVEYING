// worker/src/services/cad-registry.ts
// Unified CAD registry — maps county FIPS codes to CAD system configurations.
//
// Design notes (spec §1.2):
//   • FIPS-keyed entries (e.g. '48027' = Bell County) are the canonical keys.
//   • BIS Consultants counties all share identical selectors/patterns; we store
//     only their baseUrl and derive the rest via BIS_PATTERN helpers — this
//     avoids 130+ near-identical config entries.
//   • Non-BIS counties each have a full CADConfig entry with explicit fields.
//   • Counties not listed fall back to TexasFile or AI-assisted discovery.

import type { CadSystemName } from '../types/property-discovery.js';
import { resolveCounty } from '../lib/county-fips.js';
import { BIS_CONFIGS } from './bell-cad.js';

// ── CADConfig interface (spec §1.2) ───────────────────────────────────────────

export type CadVendor =
  | 'bis'            // BIS Consultants eSearch
  | 'trueautomation' // TrueAutomation / PropAccess
  | 'tyler'          // Tyler Technologies Aumentum / iasWorld
  | 'hcad'           // Harris County Appraisal District (custom)
  | 'tad'            // Tarrant Appraisal District (custom)
  | 'dcad'           // Dallas CAD (custom)
  | 'capitol'        // Capitol Appraisal Group
  | 'pritchard'      // Pritchard & Abbott
  | 'texasfile'      // TexasFile universal fallback
  | 'generic';       // AI-assisted discovery (future)

export type SearchMethod = 'api' | 'playwright' | 'hybrid';

export interface CADConfig {
  /** Display name of the CAD system */
  name:               string;
  vendor:             CadVendor;
  /** Primary search page URL */
  searchUrl:          string;
  /** Backend JSON API URL, if discovered (BIS: /api/search) */
  apiUrl?:            string;
  /** Pattern for property detail page — use {propertyId} placeholder */
  detailUrlPattern:   string;
  /** Preferred search strategy */
  searchMethod:       SearchMethod;
  /** HTML form field name for address search */
  addressField:       string;
  /** HTML form field name for owner name search */
  ownerField:         string;
  /** CSS selector that matches each result row/card */
  resultSelector:     string;
  /** JSON key or DOM attribute name that holds the Property ID in results */
  propertyIdField:    string;
  /** County-specific quirks, edge cases, and notes */
  customNotes?:       string;
  /** For TrueAutomation: the client ID (cid) */
  trueAutoCid?:       number;
  /** Corresponding CadSystemName for cross-reference */
  cadSystem:          CadSystemName;
}

// ── BIS helpers ────────────────────────────────────────────────────────────────

/**
 * Build a CADConfig for any BIS Consultants eSearch county from its base URL.
 *
 * BIS v2.0 (verified 2026-03-07) HTML form uses:
 *   - Tabs: Owner (#home-page-tabs), Address, ID, ARB Search, Advanced
 *   - Owner:   input#OwnerName[name="OwnerName"]
 *   - Address: input#StreetNumber + input#StreetName (split fields!)
 *   - Submit:  onclick="AdvancedSearch();" or onclick="Search();"
 *   - Type:    select#PropertyType (Real, Personal, Mineral, Auto, Mobile Home)
 *   - Year:    select#Year[name="Year"]
 *
 * The API endpoint (/api/search) may use different field names (situs_street,
 * owner_name).  The hybrid search method tries API first, then Playwright.
 */
function bisConfig(baseUrl: string, name: string, customNotes?: string): CADConfig {
  return {
    name,
    vendor:           'bis',
    searchUrl:        `${baseUrl}/Search/Result`,
    apiUrl:           `${baseUrl}/api/search`,
    detailUrlPattern: `${baseUrl}/Property/View/{propertyId}`,
    searchMethod:     'hybrid',
    addressField:     'situs_street',   // API param name (HTML form uses StreetNumber + StreetName)
    ownerField:       'owner_name',     // API param name (HTML form uses OwnerName)
    resultSelector:   '.search-result-row',
    propertyIdField:  'PropertyId',
    cadSystem:        'bis_consultants',
    customNotes,
  };
}

// ── Registry ───────────────────────────────────────────────────────────────────
// Primary key: 5-digit FIPS code.  Accessor also supports county name via the
// resolveCounty() helper in county-fips.ts.

const _REGISTRY = new Map<string, CADConfig>();

/** Register a config entry for a FIPS code */
function reg(fips: string, config: CADConfig): void {
  _REGISTRY.set(fips, config);
}

// ── BIS Consultants entries (auto-generated from bell-cad.ts BIS_CONFIGS) ─────
// We lazily populate the registry from BIS_CONFIGS so we never need to maintain
// two lists.  Bell County gets an extra note from the production spec.
function populateBisEntries(): void {
  const EXTRA_NOTES: Record<string, string> = {
    bell: [
      'BIS API discovered at /api/search endpoint.',
      'Filter personal property: IsUDI=false or PropertyType=R.',
      'FM roads may be indexed without the "FM" prefix.',
    ].join(' '),
  };

  for (const [key, cfg] of Object.entries(BIS_CONFIGS)) {
    const county = resolveCounty(key);
    if (!county) continue; // skip if not in FIPS table
    if (_REGISTRY.has(county.fips)) continue; // explicit entry already registered
    reg(county.fips, bisConfig(cfg.baseUrl, cfg.name, EXTRA_NOTES[key]));
  }
}

// ── Explicit non-BIS entries (spec §1.2 + additional known systems) ─────────

// WILLIAMSON COUNTY — Tyler/Aumentum
reg('48491', {
  name:             'Williamson CAD',
  vendor:           'tyler',
  searchUrl:        'https://search.wcad.org/Search',
  detailUrlPattern: 'https://search.wcad.org/Property-Detail/PropertyQuickRefID/{propertyId}',
  searchMethod:     'playwright',
  addressField:     'txtAddress',
  ownerField:       'txtOwnerName',
  resultSelector:   '.property-results tbody tr',
  propertyIdField:  'data-quickrefid',
  cadSystem:        'bis_consultants', // wcad.org runs BIS eSearch under the hood
});

// TRAVIS COUNTY — TrueAutomation (Austin / TCAD)
reg('48453', {
  name:             'Travis Central Appraisal District',
  vendor:           'trueautomation',
  searchUrl:        'https://travis.trueautomation.com/clientdb/PropertySearch.aspx',
  detailUrlPattern: 'https://travis.trueautomation.com/clientdb/Property.aspx?prop_id={propertyId}',
  searchMethod:     'playwright',
  addressField:     'ctl00$ContentPlaceHolder1$TextBoxAddress',
  ownerField:       'ctl00$ContentPlaceHolder1$TextBoxOwner',
  resultSelector:   '#ctl00_ContentPlaceHolder1_GridViewSearchResults tr',
  propertyIdField:  'prop_id',
  trueAutoCid:      13,
  cadSystem:        'trueautomation',
});

// HARRIS COUNTY — Custom HCAD (Houston — largest TX county)
// VERIFIED 2026-03-07: HCAD rebuilt as Blazor SPA.  Old quicksearch.asp is gone.
// Search uses radio name="filterOptions" + class "inputSearch" (no name attr).
reg('48201', {
  name:             'Harris County Appraisal District (HCAD)',
  vendor:           'hcad',
  searchUrl:        'https://public.hcad.org',
  detailUrlPattern: 'https://public.hcad.org/records/details.asp?cession=1&search={propertyId}',
  searchMethod:     'playwright',
  addressField:     'inputSearch',   // CSS class — new Blazor SPA has no name attr
  ownerField:       'inputSearch',   // same input, mode selected via radio
  resultSelector:   'table.table tbody tr',  // best guess for Blazor table; AI OCR fallback covers drift
  propertyIdField:  'acct',
  cadSystem:        'hcad',
  customNotes: [
    'HCAD rebuilt as Blazor SPA (verified 2026-03-07).',
    'Radio: name="filterOptions", values: PROPERTYADDRESS / OWNERNAME / ACCOUNTNUMBER.',
    'Input: class "inputSearch" (no name attribute).',
    'Submit: button.btn-primary.buttonFontsize (type="button", JS-driven).',
    'Account format: 13-digit ending in 000 for real property.',
    'Detail URL pattern retained from legacy — needs live verification.',
  ].join(' '),
});

// TARRANT COUNTY — Custom TAD (Fort Worth)
// VERIFIED 2026-03-07: TAD is a Laravel app with dropdown searchType + input#query.
// Deprecation notice: "current Property Search will no longer be available in 2027".
reg('48439', {
  name:             'Tarrant Appraisal District (TAD)',
  vendor:           'tad',
  searchUrl:        'https://www.tad.org/property-search/',
  detailUrlPattern: 'https://www.tad.org/property/{propertyId}/',
  searchMethod:     'playwright',
  addressField:     'query',       // input#query[name="query"] — same field for all search types
  ownerField:       'query',       // searchType dropdown selects mode (PropertyAddress vs OwnerName)
  resultSelector:   'table tbody tr',  // best guess; AI OCR fallback covers drift
  propertyIdField:  'account_num',
  cadSystem:        'tad',
  customNotes: [
    'TAD is a Laravel app (verified 2026-03-07, NOT React).',
    'Dropdown: select#search-type[name="searchType"] with values PropertyAddress, OwnerName, AccountNumber, etc.',
    'Input: input#query[name="query"].',
    'Submit: button.btn-tad-light-blue[type="submit"].',
    'Property type checkboxes: name="filter[]", values R/C/M/P.',
    'CSRF token: hidden input name="_token".',
    'Deprecation warning: site says search will be removed in 2027.',
  ].join(' '),
});

// DALLAS COUNTY — DCAD (custom TrueAutomation variant)
reg('48113', {
  name:             'Dallas Central Appraisal District (DCAD)',
  vendor:           'dcad',
  searchUrl:        'https://www.dallascad.org/SearchAddr.aspx',
  detailUrlPattern: 'https://www.dallascad.org/AcctDetailRes.aspx?ID={propertyId}',
  searchMethod:     'playwright',
  addressField:     'txtAddress',
  ownerField:       'txtOwnerName',
  resultSelector:   '.datagrid tr',
  propertyIdField:  'ID',
  cadSystem:        'trueautomation',
  customNotes:      'DCAD uses its own custom front-end but underlying data follows TrueAutomation structure.',
});

// BEXAR COUNTY — TrueAutomation (San Antonio)
reg('48029', {
  name:             'Bexar County Appraisal District',
  vendor:           'trueautomation',
  searchUrl:        'https://bexar.trueautomation.com/clientdb/PropertySearch.aspx',
  detailUrlPattern: 'https://bexar.trueautomation.com/clientdb/Property.aspx?prop_id={propertyId}',
  searchMethod:     'playwright',
  addressField:     'ctl00$ContentPlaceHolder1$TextBoxAddress',
  ownerField:       'ctl00$ContentPlaceHolder1$TextBoxOwner',
  resultSelector:   '#ctl00_ContentPlaceHolder1_GridViewSearchResults tr',
  propertyIdField:  'prop_id',
  trueAutoCid:      5,
  cadSystem:        'trueautomation',
});

// HAYS COUNTY — BIS eSearch (note: spec listed as Tyler, but code shows esearch.hayscad.com)
reg('48209', {
  name:             'Hays Central Appraisal District',
  vendor:           'bis',
  searchUrl:        'https://esearch.hayscad.com/Search/Result',
  apiUrl:           'https://esearch.hayscad.com/api/search',
  detailUrlPattern: 'https://esearch.hayscad.com/Property/View/{propertyId}',
  searchMethod:     'hybrid',
  addressField:     'situs_street',
  ownerField:       'owner_name',
  resultSelector:   '.search-result-row',
  propertyIdField:  'PropertyId',
  cadSystem:        'bis_consultants',
});

// COMAL COUNTY — BIS eSearch
reg('48091', {
  name:             'Comal Appraisal District',
  vendor:           'bis',
  searchUrl:        'https://esearch.comalcad.org/Search/Result',
  apiUrl:           'https://esearch.comalcad.org/api/search',
  detailUrlPattern: 'https://esearch.comalcad.org/Property/View/{propertyId}',
  searchMethod:     'hybrid',
  addressField:     'situs_street',
  ownerField:       'owner_name',
  resultSelector:   '.search-result-row',
  propertyIdField:  'PropertyId',
  cadSystem:        'bis_consultants',
});

// ── Lazy population of BIS entries ────────────────────────────────────────────
// Must be called after the explicit entries above so they take precedence.
populateBisEntries();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up a CADConfig by county.
 * Accepts: FIPS code ("48027"), county name ("Bell"), "bell county", key ("san_saba").
 * Returns null for counties with no configured adapter (use TexasFile fallback).
 */
export function getCADConfig(county: string): CADConfig | null {
  // Try direct FIPS lookup first
  if (/^\d{5}$/.test(county)) {
    return _REGISTRY.get(county) ?? null;
  }
  // Resolve county name → FIPS → config
  const rec = resolveCounty(county);
  if (!rec) return null;
  return _REGISTRY.get(rec.fips) ?? null;
}

/** Return all registered CADConfig entries as an array, sorted by FIPS code */
export function listRegisteredCounties(): Array<{ fips: string; config: CADConfig }> {
  return Array.from(_REGISTRY.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fips, config]) => ({ fips, config }));
}

/** Build the property detail URL for a given county and property ID */
export function buildDetailUrl(config: CADConfig, propertyId: string): string {
  return config.detailUrlPattern.replace('{propertyId}', encodeURIComponent(propertyId));
}

/** How many counties have a dedicated adapter (non-fallback) */
export function registeredCountyCount(): number {
  return _REGISTRY.size;
}
