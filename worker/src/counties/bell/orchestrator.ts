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

import type { BellResearchInput } from './types/research-input';
import type {
  BellResearchResult,
  ResolvedProperty,
  ScreenshotCapture,
  ResearchedLink,
  ResearchError,
  AiUsageSummary,
  SiteIntelligenceNote,
} from './types/research-result';

import { scrapeBellCad } from './scrapers/cad-scraper';
import { scrapeBellGis } from './scrapers/gis-scraper';
import { scrapeBellClerk } from './scrapers/clerk-scraper';
import { scrapeBellPlats } from './scrapers/plat-scraper';
import { scrapeBellFema } from './scrapers/fema-scraper';
import { scrapeBellTxDot } from './scrapers/txdot-scraper';
import { scrapeBellTax } from './scrapers/tax-scraper';
import { captureScreenshots, buildScreenshotRequests } from './scrapers/screenshot-collector';

import { analyzeBellDeeds } from './analyzers/deed-analyzer';
import { analyzeBellPlats } from './analyzers/plat-analyzer';
import { detectDiscrepancies } from './analyzers/discrepancy-detector';
import { scoreOverallConfidence, type DataItem } from './analyzers/confidence-scorer';
import { analyzeSiteScreenshots } from './analyzers/site-intelligence';

import { TIMEOUTS } from './config/endpoints';

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
 *
 * ARCHITECTURE — Cascading Identifier Enrichment:
 *   Every time we discover a new identifier (property ID, owner name,
 *   instrument number, subdivision name), it is added to the shared
 *   `knownIds` accumulator. Later phases and scrapers use ALL known
 *   identifiers, not just the original input, for maximum coverage.
 *
 *   CAD (property ID) → Deed History (instruments) → Clerk (deeds/plats)
 *                    ↘ Owner Name → Owner API → Related Parcels
 *                    ↘ Legal Description → Subdivision → Plat Repository
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

  // ── Accumulated identifiers: grows throughout the pipeline ─────────
  const knownIds = {
    addresses: new Set<string>(input.address ? [input.address] : []),
    propertyIds: new Set<string>(input.propertyId ? [input.propertyId] : []),
    ownerNames: new Set<string>(input.ownerName ? [input.ownerName] : []),
    instrumentNumbers: new Set<string>(input.instrumentNumber ? [input.instrumentNumber] : []),
    subdivisionNames: new Set<string>(),
    volumePages: new Set<string>(), // format: "vol/page"
  };

  const pctStart = Date.now();
  const progress = (phase: string, message: string, pct?: number) => {
    const elapsed = Math.round((Date.now() - pctStart) / 1000);
    onProgress({ phase, message: `[${elapsed}s] ${message}`, timestamp: new Date().toISOString(), pct });
  };

  const recordError = (phase: string, source: string, err: unknown, recovered = true) => {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push({ phase, source, message: msg, timestamp: new Date().toISOString(), recovered });
    progress(phase, `⚠ ${source} error (${recovered ? 'recovered' : 'fatal'}): ${msg.slice(0, 100)}`);
  };

  const recordLinks = (urls: string[], source: string, dataFound: boolean) => {
    for (const url of urls) {
      if (url && !allLinks.find(l => l.url === url)) {
        allLinks.push({ url, title: source, source, dataFound, error: null, visitedAt: new Date().toISOString() });
      }
    }
  };

  /** Absorb all identifiers discovered from any source into knownIds */
  const absorbIdentifiers = (source: string, ids: {
    propertyId?: string | null;
    ownerName?: string | null;
    instrumentNumbers?: string[];
    legalDescription?: string | null;
    mapId?: string | null;
  }) => {
    let discovered = 0;
    if (ids.propertyId && !knownIds.propertyIds.has(ids.propertyId)) {
      knownIds.propertyIds.add(ids.propertyId); discovered++;
      progress('Enrich', `  ← New property ID from ${source}: ${ids.propertyId}`);
    }
    if (ids.ownerName && !knownIds.ownerNames.has(ids.ownerName)) {
      knownIds.ownerNames.add(ids.ownerName); discovered++;
      progress('Enrich', `  ← New owner from ${source}: ${ids.ownerName}`);
    }
    for (const instr of (ids.instrumentNumbers ?? [])) {
      if (!knownIds.instrumentNumbers.has(instr)) {
        knownIds.instrumentNumbers.add(instr); discovered++;
      }
    }
    if (ids.legalDescription) {
      // Extract subdivision name from legal description
      try {
        const { extractSubdivisionNameFromLegal } = require('./scrapers/plat-scraper');
        const subdivName = extractSubdivisionNameFromLegal(ids.legalDescription);
        if (subdivName && !knownIds.subdivisionNames.has(subdivName)) {
          knownIds.subdivisionNames.add(subdivName); discovered++;
          progress('Enrich', `  ← New subdivision from ${source}: "${subdivName}"`);
        }
      } catch { /* ignore */ }
    }
    if (discovered > 0) {
      progress('Enrich',
        `Absorbed ${discovered} new identifier(s) from ${source} ` +
        `(total: ${knownIds.propertyIds.size} IDs, ${knownIds.ownerNames.size} owners, ` +
        `${knownIds.instrumentNumbers.size} instruments, ${knownIds.subdivisionNames.size} subdivisions)`,
      );
    }
  };

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 1: IDENTIFY THE PROPERTY (~30 seconds)
  //  Uses CAD + GIS in parallel.
  //  After each result, absorbs all discovered identifiers into knownIds
  //  so Phase 2 benefits from the full picture.
  // ══════════════════════════════════════════════════════════════════

  progress('Phase 1', '─────────────────────────────────────────────', 5);
  progress('Phase 1', 'PHASE 1 — Property Identification', 5);
  progress('Phase 1', `  Input: address="${input.address ?? '—'}" propertyId="${input.propertyId ?? '—'}" owner="${input.ownerName ?? '—'}"`, 5);

  // Geocode the address (if provided)
  let lat: number | null = null;
  let lon: number | null = null;

  if (input.address) {
    progress('Phase 1', 'Geocoding address...', 6);
    try {
      const geocodeResult = await geocodeAddress(input.address);
      if (geocodeResult) {
        lat = geocodeResult.lat;
        lon = geocodeResult.lon;
        progress('Phase 1', `✓ Geocoded: ${lat.toFixed(5)}, ${lon.toFixed(5)}`, 7);
      } else {
        progress('Phase 1', '✗ Geocoder returned no result — FEMA/TxDOT spatial queries will be skipped', 7);
      }
    } catch (err) {
      recordError('Phase 1', 'Geocode', err);
    }
  }

  // Run CAD and GIS searches in parallel for speed
  progress('Phase 1', 'Running Bell CAD eSearch + GIS in parallel...', 8);
  const [cadResult, gisResult] = await Promise.allSettled([
    scrapeBellCad(
      {
        address: input.address,
        propertyId: input.propertyId,
        ownerName: input.ownerName,
        instrumentNumber: input.instrumentNumber,
      },
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

    // Absorb all CAD-discovered identifiers into knownIds
    absorbIdentifiers('Bell CAD', {
      propertyId: cad.propertyId,
      ownerName: cad.ownerName,
      instrumentNumbers: cad.instrumentNumbers,
      legalDescription: cad.legalDescription,
      mapId: cad.mapId,
    });

    // Also absorb each deed history entry's instrument number
    for (const deed of cad.deedHistory) {
      if (deed.instrumentNumber) knownIds.instrumentNumbers.add(deed.instrumentNumber);
      if (deed.volume && deed.page) knownIds.volumePages.add(`${deed.volume}/${deed.page}`);
    }

    progress('Phase 1', `CAD result: ID=${cad.propertyId} owner="${cad.ownerName}" type=${cad.propertyType ?? '?'} deeds=${cad.deedHistory.length}`);
  } else {
    progress('Phase 1', '✗ Bell CAD: no result found');
  }

  if (gis) {
    allScreenshots.push(...gis.screenshots);
    recordLinks(gis.urlsVisited, 'Bell CAD GIS', true);

    absorbIdentifiers('Bell GIS', {
      propertyId: gis.propertyId ?? undefined,
      ownerName: gis.ownerName ?? undefined,
      instrumentNumbers: gis.instrumentNumbers,
      legalDescription: gis.legalDescription ?? undefined,
      mapId: gis.mapId ?? undefined,
    });

    progress('Phase 1', `GIS result: ID=${gis.propertyId} owner="${gis.ownerName}" acreage=${gis.acreage}`);
  } else {
    progress('Phase 1', '✗ Bell GIS: no result found');
  }

  // Merge CAD + GIS into resolved property (CAD takes priority)
  const property = resolveProperty(cad, gis, input, lat, lon);

  if (!property.propertyId && !property.ownerName) {
    progress('Phase 1', '⚠ WARNING: Could not identify property from CAD or GIS — continuing with limited data', 10);
    progress('Phase 1', '  Possible causes: property not yet in CAD, rural acreage with no situs address, FM road variant mismatch');
    recordError('Phase 1', 'Resolution', 'Property could not be identified from any source', false);
  } else {
    progress('Phase 1',
      `✓ Property identified: "${property.ownerName || '(no owner)'}" ` +
      `ID=${property.propertyId || '(none)'} ` +
      `type=${property.propertyType ?? '?'} ` +
      `legal="${(property.legalDescription ?? '').slice(0, 60)}..."`,
      15,
    );
  }

  // Final identifier summary before Phase 2
  progress('Phase 1',
    `Phase 1 complete — accumulated identifiers: ` +
    `${knownIds.propertyIds.size} property ID(s), ` +
    `${knownIds.ownerNames.size} owner name(s), ` +
    `${knownIds.instrumentNumbers.size} instrument number(s), ` +
    `${knownIds.subdivisionNames.size} subdivision name(s)`,
    15,
  );

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 2: SCRAPE EVERYTHING (~5-10 minutes)
  //  Uses ALL identifiers accumulated in Phase 1 — not just the input.
  //  Clerk + Plats run sequentially (clerk feeds plat instrument numbers).
  //  FEMA + TxDOT + Tax run in parallel.
  // ══════════════════════════════════════════════════════════════════

  progress('Phase 2', '─────────────────────────────────────────────', 20);
  progress('Phase 2', 'PHASE 2 — Scraping Bell County Records', 20);

  // Assemble the full set of identifiers accumulated in Phase 1
  const uniqueInstruments = [...knownIds.instrumentNumbers];
  const uniqueOwnerNames = [...knownIds.ownerNames];
  const uniqueSubdivisions = [...knownIds.subdivisionNames];
  const uniqueVolPages = [...knownIds.volumePages].map(vp => {
    const [volume, page] = vp.split('/');
    return { volume, page };
  });

  progress('Phase 2',
    `Identifiers for Phase 2: ` +
    `${uniqueInstruments.length} instruments, ` +
    `${uniqueOwnerNames.length} owner(s), ` +
    `${uniqueSubdivisions.length} subdivision(s), ` +
    `${uniqueVolPages.length} vol/page ref(s)`,
    21,
  );

  // ── 2A: Bell County Clerk (deeds, easements, restrictions) ────────
  progress('Phase 2', '2A — Bell County Clerk search...', 25);
  let clerk: Awaited<ReturnType<typeof scrapeBellClerk>> | null = null;
  try {
    clerk = await scrapeBellClerk(
      {
        instrumentNumbers: uniqueInstruments,
        ownerName: uniqueOwnerNames[0] ?? property.ownerName ?? undefined,
        subdivisionName: uniqueSubdivisions[0] ?? undefined,
        volumePages: uniqueVolPages,
      },
      (p) => progress('Phase 2', `Clerk: ${p.message}`, 30),
    );

    // Absorb any new instrument numbers discovered by clerk
    for (const doc of clerk.documents) {
      if (doc.instrumentNumber && !knownIds.instrumentNumbers.has(doc.instrumentNumber)) {
        knownIds.instrumentNumbers.add(doc.instrumentNumber);
        progress('Phase 2', `  ← New instrument from clerk: ${doc.instrumentNumber} (${doc.documentType})`);
      }
    }

    progress('Phase 2',
      `2A complete: ${clerk.stats.instrumentsFound} doc(s) | ` +
      `deeds=${clerk.stats.deedsFound} | plats=${clerk.stats.platsFound} | ` +
      `images=${clerk.stats.imagesCapured}`,
      32,
    );
  } catch (err) {
    recordError('Phase 2', 'Clerk', err);
  }

  // ── 2B: Bell County Plat Repository + Clerk Plats ─────────────────
  progress('Phase 2', '2B — Plat repository + clerk plat search...', 35);
  let plats: Awaited<ReturnType<typeof scrapeBellPlats>> | null = null;
  try {
    // Include any plat instrument numbers discovered by clerk in Phase 2A
    const allInstruments = [...knownIds.instrumentNumbers];

    plats = await scrapeBellPlats(
      {
        subdivisionName: uniqueSubdivisions[0] ?? undefined,
        subdivisionVariants: uniqueSubdivisions.slice(1),
        instrumentNumbers: allInstruments,
        ownerName: uniqueOwnerNames[0] ?? property.ownerName ?? undefined,
        legalDescription: property.legalDescription ?? undefined,
      },
      (p) => progress('Phase 2', `Plats: ${p.message}`, 40),
    );

    progress('Phase 2',
      `2B complete: ${plats.plats.length} plat(s) | ` +
      `repository=${plats.stats.repositoryFound} | clerk=${plats.stats.clerkFound}`,
      42,
    );
  } catch (err) {
    recordError('Phase 2', 'Plats', err);
  }

  // ── 2C/2D/2E: FEMA, TxDOT, Tax (parallel) ────────────────────────
  progress('Phase 2', '2C/D/E — FEMA + TxDOT + Tax (parallel)...', 45);
  const [femaResult, txdotResult, taxResult] = await Promise.allSettled([
    lat && lon
      ? scrapeBellFema({ lat, lon }, (p) => progress('Phase 2', `FEMA: ${p.message}`, 47))
      : Promise.resolve({ result: null, screenshots: [] as ScreenshotCapture[], urlsVisited: [] as string[] }),
    lat && lon
      ? scrapeBellTxDot({ lat, lon }, (p) => progress('Phase 2', `TxDOT: ${p.message}`, 50))
      : Promise.resolve({ result: null, screenshots: [] as ScreenshotCapture[], urlsVisited: [] as string[] }),
    property.propertyId
      ? scrapeBellTax({ propertyId: property.propertyId }, (p) => progress('Phase 2', `Tax: ${p.message}`, 52))
      : Promise.resolve({ taxInfo: null, improvements: [], valuationHistory: [], screenshots: [] as ScreenshotCapture[], urlsVisited: [] as string[] }),
  ]);

  const fema = femaResult.status === 'fulfilled' ? femaResult.value : null;
  const txdot = txdotResult.status === 'fulfilled' ? txdotResult.value : null;
  const tax = taxResult.status === 'fulfilled' ? taxResult.value : null;

  if (femaResult.status === 'rejected') recordError('Phase 2', 'FEMA', femaResult.reason);
  if (txdotResult.status === 'rejected') recordError('Phase 2', 'TxDOT', txdotResult.reason);
  if (taxResult.status === 'rejected') recordError('Phase 2', 'Tax', taxResult.reason);

  progress('Phase 2',
    `2C/D/E complete: FEMA=${fema?.result ? fema.result.floodZone : 'none'} ` +
    `TxDOT=${txdot?.result ? 'yes' : 'none'} ` +
    `Tax=${tax?.taxInfo ? 'yes' : 'none'}`,
    54,
  );

  // Collect screenshots and links from all Phase 2 sources
  for (const result of [clerk, plats, fema, txdot, tax]) {
    if (result) {
      allScreenshots.push(...((result as { screenshots?: ScreenshotCapture[] }).screenshots ?? []));
      recordLinks((result as { urlsVisited?: string[] }).urlsVisited ?? [], 'Phase 2 scrapers', true);
    }
  }

  progress('Phase 2',
    `Phase 2 complete. Total accumulated: ` +
    `${knownIds.instrumentNumbers.size} instruments, ` +
    `${(clerk?.documents.length ?? 0) + (plats?.plats.length ?? 0)} records found`,
    55,
  );

  // ── Capture additional page screenshots ────────────────────────────
  progress('Phase 2', 'Capturing supplemental page screenshots...', 58);
  const allVisitedUrls = allLinks.map(l => l.url);
  const screenshotRequests = buildScreenshotRequests(allVisitedUrls, 'research');
  if (screenshotRequests.length > 0) {
    try {
      progress('Phase 2', `Capturing ${Math.min(screenshotRequests.length, 20)} screenshot(s)...`);
      const pageScreenshots = await captureScreenshots(
        screenshotRequests.slice(0, 20),
        (p) => progress('Phase 2', `Screenshots: ${p.message}`),
      );
      allScreenshots.push(...pageScreenshots);
      progress('Phase 2', `✓ ${pageScreenshots.length} screenshot(s) captured`);
    } catch (err) {
      recordError('Phase 2', 'Screenshots', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 3: AI ANALYSIS (~5-15 minutes)
  // ══════════════════════════════════════════════════════════════════

  progress('Phase 3', '─────────────────────────────────────────────', 60);
  progress('Phase 3', 'PHASE 3 — AI Analysis', 60);

  if (!anthropicApiKey) {
    progress('Phase 3', '⚠ ANTHROPIC_API_KEY not set — AI analysis will be skipped');
  }

  // Convert clerk documents to deed records for the analyzer
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
    confidence: scoreOverallConfidence([]),
  }));

  progress('Phase 3', `Analyzing ${deedRecords.length} deed(s) + ${plats?.plats.length ?? 0} plat(s)...`, 62);

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

  progress('Phase 3',
    `AI analysis complete: ` +
    `deeds=${deeds ? 'analyzed' : 'skipped'} ` +
    `plats=${platSection ? 'analyzed' : 'skipped'} ` +
    `chainOfTitle=${deeds?.chainOfTitle.length ?? 0} links`,
    78,
  );

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
  if (discrepancies.length > 0) {
    progress('Phase 3', `⚠ Found ${discrepancies.length} discrepancy/ies between sources`);
    for (const d of discrepancies.slice(0, 5)) {
      progress('Phase 3', `  • [${d.category}] ${d.description}: "${d.source1Value}" vs "${d.source2Value}" (${d.severity})`);
    }
  }

  // ── Site intelligence ──────────────────────────────────────────────
  progress('Phase 3', 'Analyzing site screenshots for system improvement...', 85);
  let siteIntelligence: SiteIntelligenceNote[] = [];
  try {
    siteIntelligence = await analyzeSiteScreenshots(
      allScreenshots.slice(0, 10),
      anthropicApiKey,
      (msg) => progress('Phase 3', `Intelligence: ${msg}`),
    );
    if (siteIntelligence.length > 0) {
      progress('Phase 3', `Site intelligence: ${siteIntelligence.length} note(s)`);
    }
  } catch (err) {
    recordError('Phase 3', 'Site Intelligence', err);
    siteIntelligence = [];
  }

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 4: ASSEMBLE REPORT (~10-30 seconds)
  // ══════════════════════════════════════════════════════════════════

  progress('Phase 4', '─────────────────────────────────────────────', 90);
  progress('Phase 4', 'PHASE 4 — Assembling Research Report', 90);

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
  const durationMs = completedAt.getTime() - startedAt.getTime();

  // ── Research summary log ───────────────────────────────────────────
  progress('Phase 4',
    `RESEARCH SUMMARY ` +
    `| Property: "${property.ownerName || '?'}" ID=${property.propertyId || '?'} ` +
    `| Documents: ${deedRecords.length} deeds + ${plats?.plats.length ?? 0} plats ` +
    `| Discrepancies: ${discrepancies.length} ` +
    `| Confidence: ${overallConfidence.tier} (${overallConfidence.score}) ` +
    `| Duration: ${Math.round(durationMs / 1000)}s ` +
    `| Errors: ${errors.filter(e => !e.recovered).length} fatal, ${errors.filter(e => e.recovered).length} recovered`,
    95,
  );

  const result: BellResearchResult = {
    researchId: `bell-${input.projectId}-${startedAt.getTime()}`,
    projectId: input.projectId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,

    property,

    deedsAndRecords: deeds ?? {
      summary: deedRecords.length > 0
        ? `Found ${deedRecords.length} deed record(s) but AI analysis was not completed.`
        : 'No deed records were found.',
      records: deedRecords,
      chainOfTitle: [],
      confidence: scoreOverallConfidence([]),
    },
    plats: platSection ?? {
      summary: plats && plats.plats.length > 0
        ? `Found ${plats.plats.length} plat(s) but AI analysis was not completed.`
        : 'No plat records were found.',
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
