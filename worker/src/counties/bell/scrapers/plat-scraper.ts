/**
 * Bell County Plat Scraper
 *
 * Searches for plat records from multiple sources:
 *   1. Bell County plat repository (free direct PDF downloads)
 *   2. Kofile PublicSearch (plat document type filter)
 *   3. AI extraction of plat references from legal descriptions
 *
 * Plats are the most important visual document for surveyors — the system
 * prioritizes finding and capturing every available plat image.
 */

import { BELL_ENDPOINTS, RATE_LIMITS, TIMEOUTS } from '../config/endpoints.js';
import type { ScreenshotCapture, PlatRecord, PlatAnalysis } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface PlatSearchInput {
  /** Subdivision name from legal description */
  subdivisionName?: string;
  /** Instrument numbers that may reference plats */
  instrumentNumbers?: string[];
  /** Owner name for searching plat records */
  ownerName?: string;
  /** Legal description (to extract plat references) */
  legalDescription?: string;
}

export interface PlatSearchResult {
  plats: PlatRecord[];
  screenshots: ScreenshotCapture[];
  urlsVisited: string[];
}

export interface PlatScraperProgress {
  phase: string;
  message: string;
  timestamp: string;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Search for all available plat records for a Bell County property.
 */
export async function scrapeBellPlats(
  input: PlatSearchInput,
  onProgress: (p: PlatScraperProgress) => void,
): Promise<PlatSearchResult> {
  const plats: PlatRecord[] = [];
  const screenshots: ScreenshotCapture[] = [];
  const urlsVisited: string[] = [];

  const progress = (msg: string) => {
    onProgress({ phase: 'Plats', message: msg, timestamp: new Date().toISOString() });
  };

  // ── Extract plat references from legal description ─────────────────
  const platRefs = input.legalDescription
    ? extractPlatReferences(input.legalDescription)
    : [];

  if (platRefs.length > 0) {
    progress(`Found ${platRefs.length} plat reference(s) in legal description`);
  }

  // ── Search county plat repository by subdivision ───────────────────
  if (input.subdivisionName) {
    progress(`Searching county plat repository: "${input.subdivisionName}"`);
    const repoPlats = await searchPlatRepository(input.subdivisionName, screenshots, urlsVisited);
    plats.push(...repoPlats);
  }

  // ── Search clerk for plat document types ───────────────────────────
  if (input.instrumentNumbers && input.instrumentNumbers.length > 0) {
    progress(`Checking ${input.instrumentNumbers.length} instrument(s) for plat records`);
    for (const instrNum of input.instrumentNumbers) {
      // Check if any referenced instruments are plats
      const platDoc = await checkInstrumentForPlat(instrNum, screenshots, urlsVisited);
      if (platDoc) {
        plats.push(platDoc);
        progress(`Found plat: instrument ${instrNum}`);
      }
    }
  }

  // ── Search clerk by plat references from legal description ─────────
  for (const ref of platRefs) {
    if (ref.cabinetSlide) {
      progress(`Searching for plat: Cabinet ${ref.cabinetSlide}`);
      const platDoc = await searchForPlatByCabinetSlide(ref.cabinetSlide, screenshots, urlsVisited);
      if (platDoc) plats.push(platDoc);
    }
    if (ref.volume && ref.page) {
      progress(`Searching for plat: Vol ${ref.volume}, Pg ${ref.page}`);
      const platDoc = await searchForPlatByVolumePage(ref.volume, ref.page, screenshots, urlsVisited);
      if (platDoc) plats.push(platDoc);
    }
  }

  progress(`Plat search complete: ${plats.length} plat(s) found`);
  return { plats, screenshots, urlsVisited };
}

// ── Internal: Plat Reference Extraction ──────────────────────────────

interface PlatReference {
  type: 'cabinet_slide' | 'volume_page' | 'plat_name';
  cabinetSlide?: string;
  volume?: string;
  page?: string;
  platName?: string;
}

function extractPlatReferences(legalDesc: string): PlatReference[] {
  const refs: PlatReference[] = [];

  // Cabinet/Slide pattern: "CAB A, SL 123" or "CABINET 1, SLIDE 45"
  const cabSlidePattern = /CAB(?:INET)?\s*([A-Z0-9]+)\s*,?\s*SL(?:IDE)?\s*(\d+)/gi;
  let match;
  while ((match = cabSlidePattern.exec(legalDesc)) !== null) {
    refs.push({
      type: 'cabinet_slide',
      cabinetSlide: `${match[1]}-${match[2]}`,
    });
  }

  // Volume/Page pattern: "VOL 123 PG 45" or "V. 123, P. 45"
  const volPagePattern = /VOL(?:UME)?\.?\s*(\d+)\s*,?\s*P(?:AGE|G)?\.?\s*(\d+)/gi;
  while ((match = volPagePattern.exec(legalDesc)) !== null) {
    refs.push({
      type: 'volume_page',
      volume: match[1],
      page: match[2],
    });
  }

  // Plat name pattern: "PLAT OF [name]" or "[name] SUBDIVISION PLAT"
  const platNamePattern = /PLAT\s+OF\s+(.+?)(?:\s+(?:RECORDED|FILED|IN|VOL))/gi;
  while ((match = platNamePattern.exec(legalDesc)) !== null) {
    refs.push({
      type: 'plat_name',
      platName: match[1].trim(),
    });
  }

  return refs;
}

// ── Internal: County Plat Repository ─────────────────────────────────

async function searchPlatRepository(
  subdivisionName: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): Promise<PlatRecord[]> {
  // TODO: Implement Bell County plat repository search.
  // The existing county-plats.ts service has this logic for
  // searching and downloading plat PDFs from the county repository.
  // It will be migrated here with Bell-specific URL handling.
  return [];
}

// ── Internal: Instrument Plat Check ──────────────────────────────────

async function checkInstrumentForPlat(
  instrumentNumber: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): Promise<PlatRecord | null> {
  // TODO: Check if an instrument number corresponds to a plat
  // by querying the clerk and checking the document type.
  return null;
}

// ── Internal: Cabinet/Slide Search ───────────────────────────────────

async function searchForPlatByCabinetSlide(
  cabinetSlide: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): Promise<PlatRecord | null> {
  // TODO: Search clerk by cabinet/slide reference
  return null;
}

// ── Internal: Volume/Page Plat Search ────────────────────────────────

async function searchForPlatByVolumePage(
  volume: string,
  page: string,
  screenshots: ScreenshotCapture[],
  urlsVisited: string[],
): Promise<PlatRecord | null> {
  // TODO: Search clerk by volume/page for plat documents
  return null;
}
