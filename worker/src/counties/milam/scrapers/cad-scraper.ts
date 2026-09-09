/**
 * Milam County CAD Scraper
 *
 * The Milam Appraisal District runs BIS Consultants eSearch (esearch.milamad.org, v2.0.9734) —
 * the same product as Bell's — so this is the Bell cascade pointed at Milam's host:
 *
 *   Layer 1 — Direct property ID fetch          esearch.milamad.org/Property/View/{id}?year=
 *   Layer 2 — HTTP search: the results API      POST /search/SearchResults (JSON), then the HTML
 *   Layer 3 — searchBisCad() Playwright          services/bis-cad.ts with key 'milam'
 *   Layer 4 — Owner name API                     /api/Search/GetPropertySearchByOwner
 *
 * Milam-specific facts the profile carries (driven live 2026-09-09):
 *   - The deed history table cites deeds by VOLUME/PAGE; the "Number" column is empty or 0. The
 *     header-aware table parser in the shared scraper reads those rows; the clerk scraper's
 *     volume/page path (Kofile advanced search) turns them into instruments.
 *   - The situs is written "309 N TRAVIS" on the detail page and the towns are Cameron, Rockdale,
 *     Thorndale, Milano, Buckholts, Gause, Davilla … — the list the address parser strips.
 */

import { scrapeBisCad, type BisCadProfile, type CadSearchInput, type CadSearchResult, type CadScraperProgress } from '../../bell/scrapers/cad-scraper.js';
import { MILAM_ENDPOINTS } from '../config/endpoints.js';
import { MILAM_CITIES } from './gis-scraper.js';

export const MILAM_CAD_PROFILE: BisCadProfile = {
  key: 'milam',
  label: 'Milam CAD',
  cities: MILAM_CITIES,
  endpoints: MILAM_ENDPOINTS.cad,
};

/** Search Milam CAD for a property using every layer the BIS scraper has. */
export async function scrapeMilamCad(
  input: CadSearchInput,
  onProgress: (p: CadScraperProgress) => void,
): Promise<CadSearchResult | null> {
  return scrapeBisCad(MILAM_CAD_PROFILE, input, onProgress);
}
