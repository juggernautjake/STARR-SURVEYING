/**
 * Milam County Tax Record Scraper
 *
 * Reads valuation, improvements and taxing units from the Milam CAD property detail page — the
 * same BIS layout as Bell's, so this is the Bell reader pointed at Milam's host. The taxing units
 * named on a Milam page are the county, the cities (Cameron, Rockdale, Thorndale, Milano,
 * Buckholts), the school districts and the groundwater district.
 */

import { scrapeBisTax, type TaxProfile, type TaxSearchInput, type TaxSearchResult, type TaxScraperProgress } from '../../bell/scrapers/tax-scraper.js';
import { MILAM_ENDPOINTS } from '../config/endpoints.js';

export const MILAM_TAX_PROFILE: TaxProfile = {
  label: 'Milam CAD',
  propertyDetail: MILAM_ENDPOINTS.cad.propertyDetail,
  taxingEntityPattern: /(?:Milam\s*County|City\s*of\s*\w+|(?:Cameron|Rockdale|Thorndale|Milano|Buckholts|Gause|Bartlett|Holland|Lexington|Rosebud-Lott)\s*ISD|Post\s*Oak\s*Savannah\s*GCD)/,
};

/** Scrape the Milam CAD detail page for tax and valuation data. */
export async function scrapeMilamTax(
  input: TaxSearchInput,
  onProgress: (p: TaxScraperProgress) => void,
): Promise<TaxSearchResult> {
  return scrapeBisTax(MILAM_TAX_PROFILE, input, onProgress);
}
