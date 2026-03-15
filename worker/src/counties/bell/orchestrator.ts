/**
 * Bell County Research Orchestrator
 *
 * The master coordinator that runs when the user clicks
 * "Initiate Research & Analysis". Executes all scrapers and analyzers
 * in parallel where possible, merges results, and builds the final
 * structured research result.
 *
 * Flow:
 *   Phase 1 — Identify property (CAD + GIS + geocode)         ~30s
 *   Phase 2 — Scrape everything (clerk, plats, FEMA, TxDOT)   ~5-10min
 *   Phase 3 — AI analysis (deeds, plats, cross-validation)     ~5-15min
 *   Phase 4 — Report assembly                                  ~10-30s
 */

import type { BellResearchInput } from './types/research-input.js';
import type {
  BellResearchResult,
  ResolvedProperty,
  ScreenshotCapture,
  ResearchedLink,
  ResearchError,
  AiUsageSummary,
} from './types/research-result.js';

import { scrapeBellCad } from './scrapers/cad-scraper.js';
import { scrapeBellGis } from './scrapers/gis-scraper.js';
import { scrapeBellClerk } from './scrapers/clerk-scraper.js';
import { scrapeBellPlats } from './scrapers/plat-scraper.js';
import { scrapeBellFema } from './scrapers/fema-scraper.js';
import { scrapeBellTxDot } from './scrapers/txdot-scraper.js';
import { scrapeBellTax } from './scrapers/tax-scraper.js';
import { captureScreenshots, buildScreenshotRequests } from './scrapers/screenshot-collector.js';

import { analyzeBellDeeds } from './analyzers/deed-analyzer.js';
import { analyzeBellPlats } from './analyzers/plat-analyzer.js';
import { detectDiscrepancies } from './analyzers/discrepancy-detector.js';
import { scoreOverallConfidence, type DataItem } from './analyzers/confidence-scorer.js';
import { analyzeSiteScreenshots } from './analyzers/site-intelligence.js';

import { TIMEOUTS } from './config/endpoints.js';

// ── Types ────────────────────────────────────────────────────────────

export interface OrchestratorProgress {
  phase: string;
  message: string;
  timestamp: string;
  /** Progress percentage (0-100) */
  pct?: number;
}

export type ProgressCallback = (p: OrchestratorProgress) => void;

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Execute the complete Bell County research pipeline.
 * This is the single function called when the user clicks the button.
 */
export async function orchestrateBellResearch(
  input: BellResearchInput,
  onProgress: ProgressCallback,
): Promise<BellResearchResult> {
  const startedAt = new Date();
  const errors: ResearchError[] = [];
  const allScreenshots: ScreenshotCapture[] = [];
  const allLinks: ResearchedLink[] = [];
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';

  const progress = (phase: string, message: string, pct?: number) => {
    onProgress({ phase, message, timestamp: new Date().toISOString(), pct });
  };

  const recordError = (phase: string, source: string, err: unknown, recovered = true) => {
    errors.push({
      phase,
      source,
      message: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
      recovered,
    });
  };

  const recordLinks = (urls: string[], source: string, dataFound: boolean) => {
    for (const url of urls) {
      if (!allLinks.find(l => l.url === url)) {
        allLinks.push({
          url,
          title: source,
          source,
          dataFound,
          error: null,
          visitedAt: new Date().toISOString(),
        });
      }
    }
  };

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 1: IDENTIFY THE PROPERTY (~30 seconds)
  // ══════════════════════════════════════════════════════════════════

  progress('Phase 1', 'Identifying property...', 5);

  // Geocode the address (if provided)
  let lat: number | null = null;
  let lon: number | null = null;

  if (input.address) {
    progress('Phase 1', 'Geocoding address...');
    try {
      const geocodeResult = await geocodeAddress(input.address);
      if (geocodeResult) {
        lat = geocodeResult.lat;
        lon = geocodeResult.lon;
        progress('Phase 1', `Geocoded: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
      }
    } catch (err) {
      recordError('Phase 1', 'Geocode', err);
    }
  }

  // Run CAD and GIS searches in parallel
  const [cadResult, gisResult] = await Promise.allSettled([
    scrapeBellCad(
      { address: input.address, propertyId: input.propertyId, ownerName: input.ownerName, instrumentNumber: input.instrumentNumber },
      (p) => progress('Phase 1', `CAD: ${p.message}`),
    ),
    scrapeBellGis(
      { propertyId: input.propertyId, ownerName: input.ownerName, lat, lon },
      (p) => progress('Phase 1', `GIS: ${p.message}`),
    ),
  ]);

  const cad = cadResult.status === 'fulfilled' ? cadResult.value : null;
  const gis = gisResult.status === 'fulfilled' ? gisResult.value : null;

  if (cadResult.status === 'rejected') recordError('Phase 1', 'CAD', cadResult.reason);
  if (gisResult.status === 'rejected') recordError('Phase 1', 'GIS', gisResult.reason);

  // Record links and screenshots from Phase 1
  if (cad) {
    allScreenshots.push(...cad.screenshots);
    recordLinks(cad.urlsVisited, 'Bell CAD eSearch', true);
  }
  if (gis) {
    allScreenshots.push(...gis.screenshots);
    recordLinks(gis.urlsVisited, 'Bell CAD GIS', true);
  }

  // Merge CAD + GIS into resolved property
  const property = resolveProperty(cad, gis, input, lat, lon);

  if (!property.propertyId && !property.ownerName) {
    progress('Phase 1', 'WARNING: Could not identify property — continuing with limited data', 10);
    recordError('Phase 1', 'Resolution', 'Property could not be identified from any source', false);
  } else {
    progress('Phase 1', `Property identified: ${property.ownerName ?? property.propertyId}`, 15);
  }

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 2: SCRAPE EVERYTHING (~5-10 minutes)
  // ══════════════════════════════════════════════════════════════════

  progress('Phase 2', 'Scraping all Bell County sources...', 20);

  // Collect all instrument numbers
  const instrumentNumbers = [
    ...(input.instrumentNumber ? [input.instrumentNumber] : []),
    ...(cad?.instrumentNumbers ?? []),
    ...(gis?.instrumentNumbers ?? []),
  ];
  const uniqueInstruments = [...new Set(instrumentNumbers)];

  // Run all scrapers concurrently
  const [clerkResult, platResult, femaResult, txdotResult, taxResult] = await Promise.allSettled([
    scrapeBellClerk(
      { instrumentNumbers: uniqueInstruments, ownerName: property.ownerName ?? undefined },
      (p) => progress('Phase 2', `Clerk: ${p.message}`, 30),
    ),
    scrapeBellPlats(
      { instrumentNumbers: uniqueInstruments, ownerName: property.ownerName ?? undefined, legalDescription: property.legalDescription },
      (p) => progress('Phase 2', `Plats: ${p.message}`, 35),
    ),
    lat && lon
      ? scrapeBellFema({ lat, lon }, (p) => progress('Phase 2', `FEMA: ${p.message}`, 40))
      : Promise.resolve({ result: null, screenshots: [] as ScreenshotCapture[], urlsVisited: [] as string[] }),
    lat && lon
      ? scrapeBellTxDot({ lat, lon }, (p) => progress('Phase 2', `TxDOT: ${p.message}`, 45))
      : Promise.resolve({ result: null, screenshots: [] as ScreenshotCapture[], urlsVisited: [] as string[] }),
    property.propertyId
      ? scrapeBellTax({ propertyId: property.propertyId }, (p) => progress('Phase 2', `Tax: ${p.message}`, 50))
      : Promise.resolve({ taxInfo: null, improvements: [], valuationHistory: [], screenshots: [] as ScreenshotCapture[], urlsVisited: [] as string[] }),
  ]);

  // Collect results and record errors
  const clerk = clerkResult.status === 'fulfilled' ? clerkResult.value : null;
  const plats = platResult.status === 'fulfilled' ? platResult.value : null;
  const fema = femaResult.status === 'fulfilled' ? femaResult.value : null;
  const txdot = txdotResult.status === 'fulfilled' ? txdotResult.value : null;
  const tax = taxResult.status === 'fulfilled' ? taxResult.value : null;

  if (clerkResult.status === 'rejected') recordError('Phase 2', 'Clerk', clerkResult.reason);
  if (platResult.status === 'rejected') recordError('Phase 2', 'Plats', platResult.reason);
  if (femaResult.status === 'rejected') recordError('Phase 2', 'FEMA', femaResult.reason);
  if (txdotResult.status === 'rejected') recordError('Phase 2', 'TxDOT', txdotResult.reason);
  if (taxResult.status === 'rejected') recordError('Phase 2', 'Tax', taxResult.reason);

  // Collect screenshots and links
  for (const result of [clerk, plats, fema, txdot, tax]) {
    if (result) {
      allScreenshots.push(...(result.screenshots ?? []));
      recordLinks(result.urlsVisited ?? [], 'Phase 2 scrapers', true);
    }
  }

  progress('Phase 2', 'All scrapers complete', 55);

  // ── Capture additional page screenshots ────────────────────────────
  progress('Phase 2', 'Capturing page screenshots...', 58);
  const allVisitedUrls = allLinks.map(l => l.url);
  const screenshotRequests = buildScreenshotRequests(allVisitedUrls, 'research');
  if (screenshotRequests.length > 0) {
    try {
      const pageScreenshots = await captureScreenshots(
        screenshotRequests.slice(0, 20), // Cap at 20 screenshots
        (p) => progress('Phase 2', `Screenshots: ${p.message}`),
      );
      allScreenshots.push(...pageScreenshots);
    } catch (err) {
      recordError('Phase 2', 'Screenshots', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 3: AI ANALYSIS (~5-15 minutes)
  // ══════════════════════════════════════════════════════════════════

  progress('Phase 3', 'Starting AI analysis...', 60);

  // Convert clerk documents to deed records for analyzer
  const deedRecords = (clerk?.documents ?? []).map(doc => ({
    instrumentNumber: doc.instrumentNumber,
    volume: doc.volume,
    page: doc.page,
    recordingDate: doc.recordingDate,
    documentType: doc.documentType,
    grantor: doc.grantor,
    grantee: doc.grantee,
    legalDescription: doc.legalDescription,
    aiSummary: null as string | null,
    pageImages: doc.pageImages,
    sourceUrl: doc.sourceUrl,
    source: 'Bell County Clerk',
    confidence: scoreOverallConfidence([]).score === 0 ? scoreOverallConfidence([]) : scoreOverallConfidence([]),
  }));

  // Run AI analysis in parallel where possible
  const [deedAnalysis, platAnalysis] = await Promise.allSettled([
    analyzeBellDeeds(
      { deedRecords, cadLegalDescription: property.legalDescription, currentOwner: property.ownerName },
      anthropicApiKey,
      (p) => progress('Phase 3', `Deeds: ${p.message}`, 65),
    ),
    analyzeBellPlats(
      { platRecords: plats?.plats ?? [], legalDescription: property.legalDescription, deedCalls: [] },
      anthropicApiKey,
      (p) => progress('Phase 3', `Plats: ${p.message}`, 75),
    ),
  ]);

  const deeds = deedAnalysis.status === 'fulfilled' ? deedAnalysis.value : null;
  const platSection = platAnalysis.status === 'fulfilled' ? platAnalysis.value : null;

  if (deedAnalysis.status === 'rejected') recordError('Phase 3', 'Deed Analysis', deedAnalysis.reason);
  if (platAnalysis.status === 'rejected') recordError('Phase 3', 'Plat Analysis', platAnalysis.reason);

  // ── Detect discrepancies ───────────────────────────────────────────
  progress('Phase 3', 'Detecting discrepancies...', 80);
  const discrepancies = detectDiscrepancies({
    cadLegalDescription: cad?.legalDescription ?? null,
    cadAcreage: cad?.acreage ?? null,
    cadOwner: cad?.ownerName ?? null,
    gisLegalDescription: gis?.legalDescription ?? null,
    gisAcreage: gis?.acreage ?? null,
    gisOwner: gis?.ownerName ?? null,
    deedLegalDescriptions: deedRecords
      .filter(d => d.legalDescription)
      .map(d => ({ source: `Deed ${d.instrumentNumber ?? '?'}`, text: d.legalDescription! })),
    deedAcreages: [],
    platDimensions: [],
    chainOfTitle: (deeds?.chainOfTitle ?? []).map(c => ({ from: c.from, to: c.to, date: c.date })),
    easements: [],
  });

  // ── Site intelligence ──────────────────────────────────────────────
  progress('Phase 3', 'Analyzing screenshots for system improvement...', 85);
  let siteIntelligence;
  try {
    siteIntelligence = await analyzeSiteScreenshots(
      allScreenshots.slice(0, 10), // Analyze top 10 screenshots
      anthropicApiKey,
      (msg) => progress('Phase 3', `Intelligence: ${msg}`),
    );
  } catch (err) {
    recordError('Phase 3', 'Site Intelligence', err);
    siteIntelligence = [];
  }

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 4: ASSEMBLE REPORT (~10-30 seconds)
  // ══════════════════════════════════════════════════════════════════

  progress('Phase 4', 'Assembling research report...', 90);

  // Build overall confidence from all data items
  const dataItems: DataItem[] = [];
  if (property.ownerName) dataItems.push({ key: 'owner', value: property.ownerName, source: 'Bell CAD', dataType: 'name' });
  if (property.legalDescription) dataItems.push({ key: 'legal', value: property.legalDescription, source: 'Bell CAD', dataType: 'legal_description' });
  if (gis?.ownerName) dataItems.push({ key: 'owner', value: gis.ownerName, source: 'Bell GIS', dataType: 'name' });
  if (gis?.legalDescription) dataItems.push({ key: 'legal', value: gis.legalDescription, source: 'Bell GIS', dataType: 'legal_description' });
  for (const doc of deedRecords) {
    if (doc.instrumentNumber) dataItems.push({ key: 'instrument', value: doc.instrumentNumber, source: 'Clerk', dataType: 'instrument_ref' });
  }
  const overallConfidence = scoreOverallConfidence(dataItems);

  const completedAt = new Date();

  const result: BellResearchResult = {
    researchId: `bell-${input.projectId}-${startedAt.getTime()}`,
    projectId: input.projectId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),

    property,

    deedsAndRecords: deeds ?? {
      summary: 'Deed analysis was not completed.',
      records: deedRecords,
      chainOfTitle: [],
      confidence: scoreOverallConfidence([]),
    },
    plats: platSection ?? {
      summary: 'No plat analysis available.',
      plats: [],
      crossValidation: [],
      confidence: scoreOverallConfidence([]),
    },
    easementsAndEncumbrances: {
      fema: fema?.result ?? null,
      txdot: txdot?.result ?? null,
      easements: [],
      restrictiveCovenants: [],
      summary: buildEasementSummary(fema?.result ?? null, txdot?.result ?? null),
      confidence: scoreOverallConfidence([]),
    },
    propertyDetails: {
      cadData: cad ? { propertyId: cad.propertyId, ownerName: cad.ownerName, acreage: cad.acreage } : {},
      gisData: gis?.rawAttributes ?? {},
      aerialScreenshot: null,
      taxInfo: tax?.taxInfo ?? null,
      confidence: scoreOverallConfidence(dataItems.filter(d => d.source === 'Bell CAD')),
    },
    researchedLinks: allLinks,
    discrepancies,
    adjacentProperties: [],
    siteIntelligence: siteIntelligence ?? [],

    screenshots: allScreenshots,
    errors,
    aiUsage: {
      totalCalls: 0, // TODO: Track actual AI usage
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCostUsd: 0,
    },
    overallConfidence,
  };

  progress('Phase 4', 'Research complete!', 100);
  return result;
}

// ── Internal: Geocoding ──────────────────────────────────────────────

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  // Try Census geocoder first
  try {
    const params = new URLSearchParams({
      address,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (resp.ok) {
      const data = await resp.json() as {
        result?: { addressMatches?: Array<{ coordinates: { y: number; x: number } }> };
      };
      const match = data.result?.addressMatches?.[0];
      if (match) {
        return { lat: match.coordinates.y, lon: match.coordinates.x };
      }
    }
  } catch {
    // Census geocoder failed — try Nominatim
  }

  // Nominatim fallback
  try {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      countrycodes: 'us',
    });
    const url = `https://nominatim.openstreetmap.org/search?${params}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'STARR-SURVEYING/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.ok) {
      const data = await resp.json() as Array<{ lat: string; lon: string }>;
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      }
    }
  } catch {
    // Both geocoders failed
  }

  return null;
}

// ── Internal: Property Resolution ────────────────────────────────────

function resolveProperty(
  cad: Awaited<ReturnType<typeof scrapeBellCad>> | null,
  gis: Awaited<ReturnType<typeof scrapeBellGis>> | null,
  input: BellResearchInput,
  lat: number | null,
  lon: number | null,
): ResolvedProperty {
  return {
    propertyId: cad?.propertyId ?? gis?.propertyId ?? input.propertyId ?? '',
    ownerName: cad?.ownerName ?? gis?.ownerName ?? input.ownerName ?? '',
    legalDescription: cad?.legalDescription ?? gis?.legalDescription ?? '',
    acreage: cad?.acreage ?? gis?.acreage ?? null,
    situsAddress: cad?.situsAddress ?? gis?.situsAddress ?? input.address ?? '',
    mailingAddress: cad?.mailingAddress,
    propertyType: cad?.propertyType ?? undefined,
    parcelBoundary: gis?.parcelBoundary ?? undefined,
    lat: lat ?? 0,
    lon: lon ?? 0,
    mapId: cad?.mapId ?? gis?.mapId ?? undefined,
    geoId: gis?.geoId ?? undefined,
  };
}

// ── Internal: Easement Summary ───────────────────────────────────────

function buildEasementSummary(
  fema: BellResearchResult['easementsAndEncumbrances']['fema'],
  txdot: BellResearchResult['easementsAndEncumbrances']['txdot'],
): string {
  const parts: string[] = [];

  if (fema) {
    parts.push(`FEMA Flood Zone: ${fema.floodZone}${fema.inSFHA ? ' (IN Special Flood Hazard Area — flood insurance required)' : ' (outside SFHA)'}.`);
  } else {
    parts.push('FEMA flood zone data not available.');
  }

  if (txdot && txdot.rowWidth) {
    parts.push(`TxDOT ROW: ${txdot.highwayName ?? 'adjacent highway'}, ${txdot.rowWidth}ft right-of-way.`);
  } else if (txdot) {
    parts.push(`TxDOT: ${txdot.highwayName ?? 'highway'} identified nearby.`);
  }

  return parts.join(' ');
}
