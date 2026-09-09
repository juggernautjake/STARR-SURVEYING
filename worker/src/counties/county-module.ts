/**
 * County Module — the shape of a dedicated county research module.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
 *
 * The Bell orchestrator (counties/bell/orchestrator.ts, ~2,800 lines) is the run: identification,
 * plats-first, clerk, FEMA/TxDOT/tax, captures, AI reading, relevance, lot correlation, adjoiners,
 * completeness, summary. Almost none of it is about Bell. What IS about Bell fits on one screen —
 * which sites to hit, which scraper reads each one, and the words used in the log — and until
 * 2026-09-09 those were written inline as `scrapeBellCad(...)`, `'Bell CAD'`, `BELL_ENDPOINTS`.
 *
 * A second county could copy the file (17,000 lines of Bell to keep in step, every fix twice) or
 * the orchestrator could take the county-shaped part as a parameter. This is that parameter.
 *
 * A module is DATA plus FUNCTIONS: the identity the log and the health registry need, the hosts
 * the dead-host gate watches, and one function per source. Each function returns the same result
 * type the Bell scraper of that kind returns, because the orchestrator's downstream (relevance,
 * analyzers, reports, persistence) is written against those types. A county whose source has no
 * equivalent (Milam has no free plat repository) still provides the function — it says so in its
 * result rather than being absent, so the run log carries the fact.
 *
 * The result types are imported from the Bell scrapers. They are the de-facto shared contract; a
 * later move to `counties/shared/` is a rename, not a redesign.
 */

import type { CadSearchInput, CadSearchResult, CadScraperProgress } from './bell/scrapers/cad-scraper.js';
import type { GisSearchInput, GisSearchResult, GisScraperProgress, GisFeatureSummary } from './bell/scrapers/gis-scraper.js';
import type { ClerkSearchInput, ClerkSearchResult, ClerkScraperProgress } from './bell/scrapers/clerk-scraper.js';
import type { PlatSearchInput, PlatSearchResult, PlatScraperProgress } from './bell/scrapers/plat-scraper.js';
import type { FemaSearchInput, FemaScraperProgress } from './bell/scrapers/fema-scraper.js';
import type { TxDotSearchInput, TxDotScraperProgress } from './bell/scrapers/txdot-scraper.js';
import type { TaxSearchInput, TaxSearchResult, TaxScraperProgress } from './bell/scrapers/tax-scraper.js';
import type { GisViewerCaptureInput, GisViewerCaptureProgress } from './bell/scrapers/gis-viewer-capture.js';
import type { MapScreenshotInput, MapScreenshotProgress } from './bell/scrapers/map-screenshot-capture.js';
import type { ScreenshotCapture, FemaFloodInfo, TxDotRowInfo } from './bell/types/research-result.js';

type Progress<P> = (p: P) => void;

export interface CountyModule {
  /** "Bell", "Milam" — the word the log, the labels and the AI prompts use. */
  name: string;
  /** Lower-case registry key: `BIS_CONFIGS`, `KOFILE_CONFIGS`, `county-fips` all key on it. */
  key: string;
  /** Five-digit FIPS, e.g. "48027". The health registry's site ids are built from it. */
  fips: string;

  /** The words the run log and the confidence data items use for each source. */
  labels: {
    /** e.g. "Bell CAD" — the appraisal district, short form. */
    cad: string;
    /** e.g. "Bell CAD eSearch" — the appraisal site as a researched link. */
    cadSite: string;
    /** e.g. "Bell GIS" / "Bell CAD GIS". */
    gis: string;
    gisSite: string;
    /** e.g. "Bell County Clerk". */
    clerk: string;
    /** e.g. "Bell County Clerk (Kofile)" — the health registry name. */
    clerkSite: string;
    /** e.g. "Bell County Plat Repository" — the confidence label for a plat the run found. */
    platRepo: string;
  };

  /** The two hosts the dead-host gate and the health registry watch. */
  hosts: {
    cad: string;
    clerk: string;
    /** Vendor tags for the health registry site ids (`cad-${fips}-${cadVendor}`). */
    cadVendor: 'bis';
    clerkVendor: 'kofile';
  };

  /** One function per source. Same result shapes as the Bell scrapers. */
  scrapers: {
    cad: (input: CadSearchInput, onProgress: Progress<CadScraperProgress>) => Promise<CadSearchResult | null>;
    gis: (input: GisSearchInput, onProgress: Progress<GisScraperProgress>) => Promise<GisSearchResult | null>;
    siblingLots: (
      parcelBoundary: number[][][] | null,
      targetPropertyId: string | null,
      targetLegalDesc: string | null,
      onProgress: Progress<GisScraperProgress>,
    ) => Promise<GisFeatureSummary[]>;
    adjacentParcels: (parcelBoundary: number[][][], onProgress: Progress<GisScraperProgress>) => Promise<GisSearchResult[]>;
    clerk: (input: ClerkSearchInput, onProgress: Progress<ClerkScraperProgress>) => Promise<ClerkSearchResult>;
    plats: (input: PlatSearchInput, onProgress: Progress<PlatScraperProgress>) => Promise<PlatSearchResult>;
    fema: (input: FemaSearchInput, onProgress: Progress<FemaScraperProgress>) => Promise<{ result: FemaFloodInfo | null; screenshots: ScreenshotCapture[]; urlsVisited: string[] }>;
    txdot: (input: TxDotSearchInput, onProgress: Progress<TxDotScraperProgress>) => Promise<{ result: TxDotRowInfo | null; screenshots: ScreenshotCapture[]; urlsVisited: string[] }>;
    tax: (input: TaxSearchInput, onProgress: Progress<TaxScraperProgress>) => Promise<TaxSearchResult>;
  };

  /** The county's own map viewer, and the direct map captures (county map + Google). */
  captures: {
    gisViewer: (input: GisViewerCaptureInput, onProgress: Progress<GisViewerCaptureProgress>) => Promise<ScreenshotCapture[]>;
    maps: (input: MapScreenshotInput, onProgress: Progress<MapScreenshotProgress>) => Promise<ScreenshotCapture[]>;
  };
}

/** The county name in the shape the county-agnostic services take ("Bell", never "bell"). */
export function countyDisplayName(m: Pick<CountyModule, 'name'>): string {
  return m.name;
}
