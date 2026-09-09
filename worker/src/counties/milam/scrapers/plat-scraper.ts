/**
 * Milam County Plat Scraper
 *
 * Milam has NO free plat repository — the county site and the clerk's site list none, and the
 * plat-repository registry (services/county-plats.ts) has no Milam entry, so the shared scraper
 * says so in the log and skips Layer 1. Plats come from:
 *
 *   Layer 2 — the clerk (Kofile, milam.tx.publicsearch.us): the PL document group — PLAT, SURVEY
 *             PLAT, AMENDMENT TO PLAT, PLAT VACATE AND REPLAT, RATIFICATION OF PLAT — searched by
 *             subdivision name, owner, cabinet/slide and volume/page. Free preview images.
 *   Layer 3 — instrument numbers from the deed history checked for a plat document type.
 *   TexasFile — the paid pass ($10 flat per plat) runs from the cross-source engine, not here.
 */

import { scrapeCountyPlats, type PlatProfile, type PlatSearchInput, type PlatSearchResult, type PlatScraperProgress } from '../../bell/scrapers/plat-scraper.js';
import { MILAM_ENDPOINTS } from '../config/endpoints.js';

export const MILAM_PLAT_PROFILE: PlatProfile = {
  key: 'milam',
  clerkLabel: 'Milam County Clerk',
  repoLabel: 'Milam County Plat Repository (none registered)',
  endpoints: MILAM_ENDPOINTS.clerk,
};

/** Search for Milam plat records at the clerk. */
export async function scrapeMilamPlats(
  input: PlatSearchInput,
  onProgress: (p: PlatScraperProgress) => void,
): Promise<PlatSearchResult> {
  return scrapeCountyPlats(MILAM_PLAT_PROFILE, input, onProgress);
}
