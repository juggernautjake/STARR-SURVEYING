/**
 * Milam County Clerk Scraper
 *
 * Milam's clerk is Kofile/GovOS PublicSearch at milam.tx.publicsearch.us — the same product as
 * Bell's — so this is the Bell clerk cascade (instruments → owner → subdivision → volume/page)
 * pointed at Milam's site through services/bell-clerk.ts with the county key 'milam'.
 *
 * What is Milam's own (driven live 2026-09-09):
 *   - Department RP ("Property Records"), 1983 → certified 2026-09-04. Instrument numbers are
 *     year-prefixed: "2009-109100".
 *   - The appraisal district cites every deed by volume/page, so Path D (volume/page) is the main
 *     road from the CAD's deed history to a document here. The site's advanced search resolves
 *     OR/1093/560 to 2009-109100 (see config/endpoints.ts `volumePageSearch`).
 *   - Plats are their own document group, PL: PLAT, SURVEY PLAT, AMENDMENT TO PLAT, REPLAT.
 *   - The viewer serves watermarked page images without purchase; a copy is $1/page + $2/document.
 */

import { scrapeKofileClerk, type KofileClerkProfile, type ClerkSearchInput, type ClerkSearchResult, type ClerkScraperProgress } from '../../bell/scrapers/clerk-scraper.js';
import { MILAM_ENDPOINTS } from '../config/endpoints.js';

export const MILAM_CLERK_PROFILE: KofileClerkProfile = {
  key: 'milam',
  label: 'Milam County Clerk',
  endpoints: MILAM_ENDPOINTS.clerk,
};

/** Search the Milam County Clerk for recorded documents. */
export async function scrapeMilamClerk(
  input: ClerkSearchInput,
  onProgress: (p: ClerkScraperProgress) => void,
): Promise<ClerkSearchResult> {
  return scrapeKofileClerk(MILAM_CLERK_PROFILE, input, onProgress);
}
