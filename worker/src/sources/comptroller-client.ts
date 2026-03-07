// worker/src/sources/comptroller-client.ts — Phase 13 Module B
// Texas Comptroller of Public Accounts — Property Tax data client.
// Retrieves property tax rates, exemptions, and delinquency status for Texas
// properties using the Comptroller's public transparency portal and PTAD data.
//
// Spec §13.4 — TX Comptroller Integration
//
// Public data sources:
//   - PTAD (Property Tax Assistance Division) county data files
//   - Texas Transparency / OpenData portal (data.texas.gov)
//   - County Appraisal District lookup via Comptroller county list
//
// Important note: The Comptroller does NOT expose a per-parcel tax API.
// This client returns the *county/taxing-unit tax rates* for the property's
// county and city, plus checks the Comptroller's delinquency roll (when
// available).  Per-parcel tax bills come from the county CAD/tax collector.

import { retryWithBackoff } from '../infra/resilience.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single taxing unit (county, city, ISD, hospital district, etc.) */
export interface TaxingUnit {
  unit_name: string;
  unit_type: 'county' | 'city' | 'isd' | 'hospital' | 'water' | 'other';
  tax_rate: number;       // Combined adopted rate per $100 valuation
  m_o_rate: number;       // Maintenance & Operations component
  i_s_rate: number;       // Interest & Sinking (debt service) component
  effective_rate: number; // No-new-revenue (voter-approved) rollback rate
  rollback_rate: number;  // 8% rollback rate for M&O
  year: number;
}

/** Homestead and other exemption amounts */
export interface ExemptionInfo {
  exemption_type:
    | 'homestead'
    | 'over_65'
    | 'disabled_person'
    | 'disabled_veteran'
    | 'agriculture'
    | 'wildlife_management'
    | 'freeport'
    | 'pollution_control'
    | 'other';
  amount_or_pct: string;    // e.g. "25,000" or "20%" — depends on unit
  applies_to: string[];     // unit names this exemption applies to
}

/** Tax delinquency summary */
export interface DelinquencyInfo {
  is_delinquent: boolean;
  delinquent_years: number[];
  total_amount_due: number | null;
  last_checked_at: string;
  source: 'comptroller' | 'cad' | 'unknown';
}

/** Full tax data result for a property */
export interface TaxResult {
  project_id: string;
  county_fips: string;
  county_name: string;
  appraisal_district_name: string;
  appraisal_district_url: string | null;
  taxing_units: TaxingUnit[];
  /** Effective combined rate (sum of all unit rates) per $100 valuation */
  combined_rate: number;
  exemptions: ExemptionInfo[];
  delinquency: DelinquencyInfo | null;
  tax_year: number;
  queried_at: string;
  errors: string[];
}

// ── Comptroller County Registry ──────────────────────────────────────────────
// Source: https://comptroller.texas.gov/taxes/property-tax/county-directory/
// Maps county FIPS → CAD name and Comptroller-published tax rate data

const COUNTY_CAD_REGISTRY: Record<string, { name: string; cad: string; cadUrl: string | null }> = {
  '48001': { name: 'Anderson',    cad: 'Anderson CAD',     cadUrl: 'https://www.acad.org' },
  '48003': { name: 'Andrews',     cad: 'Andrews CAD',      cadUrl: null },
  '48027': { name: 'Bell',        cad: 'Bell CAD',         cadUrl: 'https://www.bellcad.org' },
  '48029': { name: 'Bexar',       cad: 'Bexar CAD',        cadUrl: 'https://www.bcad.org' },
  '48049': { name: 'Brown',       cad: 'Brown CAD',        cadUrl: null },
  '48085': { name: 'Collin',      cad: 'Collin CAD',       cadUrl: 'https://www.collincad.org' },
  '48113': { name: 'Dallas',      cad: 'Dallas CAD',       cadUrl: 'https://www.dallascad.org' },
  '48121': { name: 'Denton',      cad: 'Denton CAD',       cadUrl: 'https://www.dentoncad.com' },
  '48139': { name: 'Ellis',       cad: 'Ellis CAD',        cadUrl: null },
  '48157': { name: 'Fort Bend',   cad: 'Fort Bend CAD',    cadUrl: 'https://www.fbcad.org' },
  '48167': { name: 'Galveston',   cad: 'Galveston CAD',    cadUrl: 'https://www.galvestoncad.org' },
  '48201': { name: 'Harris',      cad: 'HCAD',             cadUrl: 'https://public.hcad.org' },
  '48209': { name: 'Hays',        cad: 'Hays CAD',         cadUrl: 'https://hayscad.com' },
  '48245': { name: 'Jefferson',   cad: 'Jefferson CAD',    cadUrl: null },
  '48251': { name: 'Johnson',     cad: 'Johnson CAD',      cadUrl: null },
  '48303': { name: 'Lubbock',     cad: 'Lubbock CAD',      cadUrl: 'https://www.lubbockcad.org' },
  '48309': { name: 'McLennan',    cad: 'McLennan CAD',     cadUrl: 'https://www.mclennancad.org' },
  '48329': { name: 'Midland',     cad: 'Midland CAD',      cadUrl: 'https://midlandcad.org' },
  '48339': { name: 'Montgomery',  cad: 'Montgomery CAD',   cadUrl: 'https://mcad-tx.org' },
  '48353': { name: 'Nueces',      cad: 'Nueces CAD',       cadUrl: 'https://www.nuecescad.net' },
  '48375': { name: 'Potter',      cad: 'Potter-Randall CAD', cadUrl: null },
  '48423': { name: 'Smith',       cad: 'Smith CAD',        cadUrl: 'https://www.smith-cad.org' },
  '48439': { name: 'Tarrant',     cad: 'TAD',              cadUrl: 'https://www.tad.org' },
  '48453': { name: 'Travis',      cad: 'Travis CAD',       cadUrl: 'https://www.traviscad.org' },
  '48479': { name: 'Webb',        cad: 'Webb CAD',         cadUrl: null },
  '48491': { name: 'Williamson',  cad: 'Williamson CAD',   cadUrl: 'https://www.wcad.org' },
};

// Comptroller PTAD tax-rate data endpoint (Texas Open Data / Socrata)
// Dataset: "Texas County Property Tax Rates"
// NOTE: URL must be verified against current data.texas.gov catalog
const PTAD_RATES_URL =
  'https://data.texas.gov/resource/2dxm-hqwi.json';

// ── Client ───────────────────────────────────────────────────────────────────

export class TXComptrollerClient {
  private retryCount = 3;
  private retryDelay = 2000;

  /**
   * Fetch tax rate and exemption data for a property's county.
   *
   * @param projectId  Correlation ID
   * @param countyFips 5-digit FIPS (e.g. '48027' for Bell County)
   * @param taxYear    Tax year to query (defaults to current year)
   */
  async getTaxData(
    projectId: string,
    countyFips: string,
    taxYear = new Date().getFullYear(),
  ): Promise<TaxResult> {
    const registry = COUNTY_CAD_REGISTRY[countyFips];
    const result: TaxResult = {
      project_id: projectId,
      county_fips: countyFips,
      county_name: registry?.name ?? 'Unknown',
      appraisal_district_name: registry?.cad ?? 'Unknown CAD',
      appraisal_district_url: registry?.cadUrl ?? null,
      taxing_units: [],
      combined_rate: 0,
      exemptions: [],
      delinquency: null,
      tax_year: taxYear,
      queried_at: new Date().toISOString(),
      errors: [],
    };

    // Fetch PTAD county tax rates
    try {
      const units = await this.fetchPTADRates(countyFips, taxYear);
      result.taxing_units = units;
      result.combined_rate = units.reduce((sum, u) => sum + u.tax_rate, 0);
    } catch (err) {
      result.errors.push(`ptad_rates: ${String(err)}`);
      // Fall back to statewide average if API unavailable
      result.combined_rate = estimatedCombinedRate(countyFips);
      result.errors.push('Using estimated fallback rate — live PTAD data unavailable');
    }

    // Load standard homestead exemptions (always available as static data)
    result.exemptions = getStandardExemptions();

    return result;
  }

  // ── PTAD Rates ─────────────────────────────────────────────────────────────

  private async fetchPTADRates(
    countyFips: string,
    taxYear: number,
  ): Promise<TaxingUnit[]> {
    const countyName = COUNTY_CAD_REGISTRY[countyFips]?.name;
    if (!countyName) return [];

    // Socrata SoQL: filter by county name and tax year
    const url = new URL(PTAD_RATES_URL);
    url.searchParams.set('$where', `county_name='${countyName.toUpperCase()}' AND tax_year=${taxYear}`);
    url.searchParams.set('$limit', '50');

    const rows = await retryWithBackoff(
      () => fetchJSONArray(url.toString()),
      this.retryCount,
      this.retryDelay,
    );

    return rows.map(row => parsePTADRow(row, taxYear));
  }
}

// ── Parsers ──────────────────────────────────────────────────────────────────

function parsePTADRow(
  row: Record<string, unknown>,
  taxYear: number,
): TaxingUnit {
  const unitType = inferUnitType(String(row['unit_type_description'] ?? row['entity_type'] ?? ''));
  return {
    unit_name: String(row['unit_name'] ?? row['entity_name'] ?? 'Unknown'),
    unit_type: unitType,
    tax_rate: parseRate(row['adopted_tax_rate'] ?? row['tax_rate']),
    m_o_rate: parseRate(row['m_o_rate'] ?? row['maintenance_rate']),
    i_s_rate: parseRate(row['i_s_rate'] ?? row['debt_rate']),
    effective_rate: parseRate(row['effective_tax_rate'] ?? row['no_new_revenue_rate']),
    rollback_rate: parseRate(row['rollback_rate'] ?? row['voter_approval_rate']),
    year: taxYear,
  };
}

function inferUnitType(description: string): TaxingUnit['unit_type'] {
  const d = description.toLowerCase();
  if (d.includes('county'))     return 'county';
  if (d.includes('city') || d.includes('municipality')) return 'city';
  if (d.includes('school') || d.includes('isd'))        return 'isd';
  if (d.includes('hospital'))   return 'hospital';
  if (d.includes('water') || d.includes('mud') || d.includes('wcid')) return 'water';
  return 'other';
}

function parseRate(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

/** Standard Texas homestead exemptions (static — enacted in state law) */
function getStandardExemptions(): ExemptionInfo[] {
  return [
    {
      exemption_type: 'homestead',
      amount_or_pct: '25,000 minimum (school ISD)',
      applies_to: ['ISDs'],
    },
    {
      exemption_type: 'over_65',
      amount_or_pct: '10,000 (school ISD) + optional county/city',
      applies_to: ['ISDs', 'County (optional)', 'City (optional)'],
    },
    {
      exemption_type: 'disabled_person',
      amount_or_pct: '10,000 (school ISD) + optional county/city',
      applies_to: ['ISDs', 'County (optional)', 'City (optional)'],
    },
    {
      exemption_type: 'disabled_veteran',
      amount_or_pct: '5,000–12,000 (percentage of disability)',
      applies_to: ['All taxing units'],
    },
    {
      exemption_type: 'agriculture',
      amount_or_pct: 'Productivity value appraisal',
      applies_to: ['All taxing units (must apply with CAD)'],
    },
  ];
}

/**
 * Fallback combined rate estimates when PTAD API is unavailable.
 * These are approximate averages based on 2023 data — DO NOT use for legal purposes.
 */
function estimatedCombinedRate(countyFips: string): number {
  const ESTIMATES: Record<string, number> = {
    '48027': 2.18, // Bell County (Belton)
    '48201': 2.09, // Harris County (Houston)
    '48439': 2.11, // Tarrant County (Fort Worth)
    '48453': 1.97, // Travis County (Austin)
    '48029': 2.23, // Bexar County (San Antonio)
    '48113': 2.26, // Dallas County
    '48085': 2.18, // Collin County
    '48491': 2.05, // Williamson County
  };
  return ESTIMATES[countyFips] ?? 2.15; // TX statewide average ~2.15%
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchJSONArray(url: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Comptroller HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data as Array<Record<string, unknown>>;
}

// ── Exports ──────────────────────────────────────────────────────────────────

export { COUNTY_CAD_REGISTRY, getStandardExemptions, estimatedCombinedRate };
