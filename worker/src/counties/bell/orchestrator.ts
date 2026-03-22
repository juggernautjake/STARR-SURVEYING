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
  SiteIntelligenceNote,
  EasementRecord,
} from './types/research-result.js';

import { scrapeBellCad } from './scrapers/cad-scraper.js';
import { scrapeBellGis, discoverSiblingLots } from './scrapers/gis-scraper.js';
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
import { validateDeedRelevance, validatePlatRelevance, preFilterIrrelevantDocuments, extractAbstractAndSurvey, type PropertyIdentifiers } from './analyzers/document-relevance-validator.js';
import { correlateTargetLot, type LotCorrelationInput } from './analyzers/lot-correlator.js';
import { computeConfidence, SOURCE_RELIABILITY } from './types/confidence.js';

import { TIMEOUTS } from './config/endpoints.js';
import { resolveAddressToLot, validateAddressParcelMatch } from '../../services/address-lot-resolver.js';
import type { GisFeatureForMatching } from '../../services/address-lot-resolver.js';
import {
  resetCreditGuard,
  isCreditDepleted,
  isCreditDepletionError,
  AnthropicCreditDepletedError,
} from '../../lib/credit-guard.js';

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
  signal?: AbortSignal,
): Promise<BellResearchResult> {
  const startedAt = new Date();
  const errors: ResearchError[] = [];
  const allScreenshots: ScreenshotCapture[] = [];
  const allLinks: ResearchedLink[] = [];
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';

  /** Throws if the pipeline has been cancelled via AbortController */
  function checkAborted(): void {
    if (signal?.aborted) {
      throw new DOMException('Pipeline cancelled by user', 'AbortError');
    }
  }

  // Reset the credit guard so previous pipeline state doesn't carry over
  resetCreditGuard();

  console.log(
    `[BellOrchestrator] ${input.projectId ?? 'no-id'}: START — address="${input.address ?? ''}" propertyId="${input.propertyId ?? ''}" ownerName="${input.ownerName ?? ''}"`,
  );

  /** Tracks whether we've already emitted the credit-depleted progress message */
  let creditDepletionNotified = false;

  /** If AI credits are depleted, emit a prominent progress message (once) */
  function notifyCreditDepleted(): void {
    if (isCreditDepleted() && !creditDepletionNotified) {
      creditDepletionNotified = true;
      const msg = 'AI CREDIT BALANCE DEPLETED — Remaining AI analysis steps will be skipped. Please add funds to your Anthropic account at console.anthropic.com/settings/billing and re-run research.';
      progress('CREDIT ERROR', msg);
      console.error(`[BellOrchestrator] ${input.projectId ?? 'no-id'}: ${msg}`);
      errors.push({
        phase: 'AI Credits',
        source: 'Anthropic API',
        message: msg,
        timestamp: new Date().toISOString(),
        recovered: false,
      });
    }
  }

  // ── Accumulated identifiers: grows throughout the pipeline ─────────
  const knownIds = {
    addresses: new Set<string>(input.address ? [input.address] : []),
    propertyIds: new Set<string>(input.propertyId ? [input.propertyId] : []),
    ownerNames: new Set<string>(input.ownerName ? [input.ownerName] : []),
    instrumentNumbers: new Set<string>(input.instrumentNumber ? [input.instrumentNumber] : []),
    subdivisionNames: new Set<string>(),
    volumePages: new Set<string>(), // format: "vol/page"
    lotNumber: null as string | null,
    blockNumber: null as string | null,
  };

  const pctStart = Date.now();
  const progress = (phase: string, message: string, pct?: number) => {
    const elapsed = Math.round((Date.now() - pctStart) / 1000);
    onProgress({ phase, message: `[${elapsed}s] ${message}`, timestamp: new Date().toISOString(), pct });
  };

  const recordError = (phase: string, source: string, err: unknown, recovered = true) => {
    // Detect credit depletion from any error — sets the module-level flag
    // so all subsequent AI calls short-circuit immediately
    if (isCreditDepletionError(err)) {
      const creditMsg = 'AI CREDIT BALANCE DEPLETED — Please add funds to your Anthropic account at console.anthropic.com/settings/billing and re-run research.';
      errors.push({ phase, source: 'AI Credits', message: creditMsg, timestamp: new Date().toISOString(), recovered: false });
      console.error(`[BellOrchestrator] ${input.projectId ?? 'no-id'} [${phase}] CREDIT DEPLETED detected in ${source}`);
      progress('CREDIT ERROR', creditMsg);
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    errors.push({ phase, source, message: msg, timestamp: new Date().toISOString(), recovered });
    console.error(`[BellOrchestrator] ${input.projectId ?? 'no-id'} [${phase}] ERROR ${source}: ${msg.slice(0, 200)}`);
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
  const absorbIdentifiers = async (source: string, ids: {
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
      // Extract subdivision name from legal description using dynamic import
      try {
        const platScraper = await import('./scrapers/plat-scraper.js');
        const subdivName = platScraper.extractSubdivisionNameFromLegal(ids.legalDescription);
        if (subdivName && !knownIds.subdivisionNames.has(subdivName)) {
          knownIds.subdivisionNames.add(subdivName); discovered++;
          progress('Enrich', `  ← New subdivision from ${source}: "${subdivName}"`);
        }
      } catch (err) {
        console.warn(`[orchestrator] Could not extract subdivision from "${source}": ${err instanceof Error ? err.message : String(err)}`);
      }
      // Extract lot and block numbers from legal description
      // Bell CAD uses both "BLOCK X, LOT Y" and "LOT X, BLOCK Y" formats
      const { extractLotBlock: extractLB } = await import('../../services/bell-county-classifier.js');
      const lotBlock = extractLB(ids.legalDescription);
      if (lotBlock.lot && !knownIds.lotNumber) {
        knownIds.lotNumber = lotBlock.lot;
        knownIds.blockNumber = lotBlock.block;
        discovered++;
        progress('Enrich', `  ← Lot/Block from ${source}: Lot ${lotBlock.lot}, Block ${lotBlock.block ?? '—'}`);
      }
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
  checkAborted();

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
        projectId: input.projectId,
      },
      (p) => progress('Phase 1', `CAD: ${p.message}`),
    ),
    scrapeBellGis(
      { propertyId: input.propertyId, ownerName: input.ownerName, lat, lon, address: input.address },
      (p) => progress('Phase 1', `GIS: ${p.message}`),
    ),
  ]);

  const cad = cadResult.status === 'fulfilled' ? cadResult.value : null;
  const gis = gisResult.status === 'fulfilled' ? gisResult.value : null;

  if (cadResult.status === 'rejected') recordError('Phase 1', 'CAD', cadResult.reason);
  if (gisResult.status === 'rejected') recordError('Phase 1', 'GIS', gisResult.reason);

  checkAborted();

  // Record links and screenshots from Phase 1
  if (cad) {
    allScreenshots.push(...cad.screenshots);
    recordLinks(cad.urlsVisited, 'Bell CAD eSearch', true);

    // Absorb all CAD-discovered identifiers into knownIds
    await absorbIdentifiers('Bell CAD', {
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

    await absorbIdentifiers('Bell GIS', {
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
  const property = resolveProperty(cad, gis, input, lat, lon, knownIds);

  // ── Sibling Lot Discovery ──────────────────────────────────────────
  // When GIS returns a single parcel (by property ID), we only have one
  // lot's data. For subdivision properties, we need ALL sibling lots so
  // the address-to-lot resolver can match situs addresses accurately.
  // This spatial query finds nearby parcels in the same subdivision.
  let gisFeatsForMatching: GisFeatureForMatching[] = (gis?.allFeatures ?? []).map(f => ({
    propertyId: f.propertyId,
    ownerName: f.ownerName,
    acreage: f.acreage,
    situsAddress: f.situsAddress,
    legalDescription: f.legalDescription,
  }));

  if (gis?.parcelBoundary && gisFeatsForMatching.length <= 2) {
    try {
      const siblings = await discoverSiblingLots(
        gis.parcelBoundary,
        gis.propertyId,
        gis.legalDescription,
        (p) => progress('Phase 1', p.message),
      );
      if (siblings.length > 0) {
        // Merge sibling data with existing features (avoid duplicates by property ID)
        const existingPids = new Set(gisFeatsForMatching.map(f => f.propertyId));
        const newSiblings = siblings
          .filter(s => s.propertyId && !existingPids.has(s.propertyId))
          .map(s => ({
            propertyId: s.propertyId,
            ownerName: s.ownerName,
            acreage: s.acreage,
            situsAddress: s.situsAddress,
            legalDescription: s.legalDescription,
          }));
        gisFeatsForMatching = [...gisFeatsForMatching, ...newSiblings];
        progress('Phase 1',
          `Address resolution: ${gisFeatsForMatching.length} total lot(s) available ` +
          `(${newSiblings.length} sibling lot(s) discovered)`);
      }
    } catch (err) {
      progress('Phase 1', `⚠ Sibling lot discovery failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Address-to-Lot Resolution ─────────────────────────────────────
  // For subdivision properties, resolve which specific lot the input address
  // corresponds to. Uses GIS situs addresses, CAD legal descriptions, and
  // acreage cross-referencing to find the exact lot.

  // Lightweight logger adapter for address-lot resolver (orchestrator uses progress callback)
  const resolverLogger = {
    info: (_tag: string, msg: string) => progress('Phase 1', msg),
    warn: (_tag: string, msg: string) => progress('Phase 1', `⚠ ${msg}`),
    error: (_tag: string, msg: string) => progress('Phase 1', `✗ ${msg}`),
    startAttempt: () => { const fn = (() => {}) as unknown as import('../../lib/logger.js').StepTracker; return fn; },
  } as unknown as import('../../lib/logger.js').PipelineLogger;

  const lotResolution = resolveAddressToLot(
    input.address ?? undefined,
    gisFeatsForMatching,
    [], // plat lots not yet available in Phase 1 — will be populated in Phase 3
    property.lotNumber,
    property.blockNumber,
    property.acreage,
    property.propertyId,
    resolverLogger,
  );

  if (lotResolution) {
    // Update property with resolved lot info
    if (lotResolution.lotNumber && !property.lotNumber) {
      property.lotNumber = lotResolution.lotNumber;
    }
    if (lotResolution.blockNumber && !property.blockNumber) {
      property.blockNumber = lotResolution.blockNumber;
    }
    if (lotResolution.propertyId && !property.propertyId) {
      property.propertyId = lotResolution.propertyId;
    }
    if (lotResolution.ownerName && !property.ownerName) {
      property.ownerName = lotResolution.ownerName;
    }
    if (lotResolution.acreage && !property.acreage) {
      property.acreage = lotResolution.acreage;
    }

    progress('Phase 1',
      `Lot resolution: ${lotResolution.lotName} (${lotResolution.resolvedBy}, ` +
      `confidence ${lotResolution.confidence}%, ` +
      `${lotResolution.candidates.length} candidate(s) evaluated)`);
  }

  // Validate address-to-parcel match
  const addrWarnings = validateAddressParcelMatch(
    input.address ?? undefined,
    property.propertyId,
    property.acreage,
    property.situsAddress ?? null,
    property.lotNumber,
    gisFeatsForMatching,
    resolverLogger,
  );
  for (const w of addrWarnings) {
    progress('Phase 1', `⚠ ${w}`);
    recordError('Phase 1', 'AddressValidation', w, false);
  }

  if (!property.propertyId && !property.ownerName) {
    progress('Phase 1', '⚠ WARNING: Could not identify property from CAD or GIS — continuing with limited data', 10);
    progress('Phase 1', '  Possible causes: property not yet in CAD, rural acreage with no situs address, FM road variant mismatch');
    recordError('Phase 1', 'Resolution', 'Property could not be identified from any source', false);
  } else {
    const lotBlockInfo = property.lotNumber
      ? ` Lot ${property.lotNumber} Block ${property.blockNumber ?? '?'}`
      : '';
    const subdivInfo = property.subdivisionName
      ? ` in ${property.subdivisionName}`
      : '';
    progress('Phase 1',
      `✓ Property identified: "${property.ownerName || '(no owner)'}" ` +
      `ID=${property.propertyId || '(none)'}${lotBlockInfo}${subdivInfo} ` +
      `type=${property.propertyType ?? '?'} ` +
      `legal="${(property.legalDescription ?? '').slice(0, 60)}..."`,
      15,
    );
  }

  // Final identifier summary before Phase 2
  const lotBlockStr = knownIds.lotNumber
    ? `, Lot ${knownIds.lotNumber} Block ${knownIds.blockNumber ?? '?'}`
    : '';
  progress('Phase 1',
    `Phase 1 complete — accumulated identifiers: ` +
    `${knownIds.propertyIds.size} property ID(s), ` +
    `${knownIds.ownerNames.size} owner name(s), ` +
    `${knownIds.instrumentNumbers.size} instrument number(s), ` +
    `${knownIds.subdivisionNames.size} subdivision name(s)${lotBlockStr}`,
    15,
  );

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 2: SCRAPE EVERYTHING (~5-10 minutes)
  //  Uses ALL identifiers accumulated in Phase 1 — not just the input.
  //  Clerk + Plats run sequentially (clerk feeds plat instrument numbers).
  //  FEMA + TxDOT + Tax run in parallel.
  // ══════════════════════════════════════════════════════════════════
  checkAborted();

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
        projectId: input.projectId,
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
      `images=${clerk.stats.imagesCaptured}`,
      32,
    );
  } catch (err) {
    recordError('Phase 2', 'Clerk', err);
  }

  checkAborted();

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
        projectId: input.projectId,
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

  checkAborted();

  // ── 2C/2D/2E: FEMA, TxDOT, Tax (parallel) ────────────────────────
  progress('Phase 2', '2C/D/E — FEMA + TxDOT + Tax (parallel)...', 45);

  if (!lat || !lon) {
    progress('Phase 2',
      '⚠ No coordinates available — FEMA flood zone and TxDOT ROW lookups will be skipped. ' +
      'Provide a valid street address or explicit lat/lon to enable these checks.',
    );
  }
  if (!property.propertyId) {
    progress('Phase 2', '⚠ No property ID resolved — Bell CAD tax detail lookup will be skipped.');
  }
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

  checkAborted();

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

  // ── Capture GIS viewer screenshots ──────────────────────────────────
  // Open the Bell County GIS viewer in Playwright, zoom to the target
  // parcel, and capture multiple views: subdivision overview, parcel
  // detail, aerial with/without property lines, and adjacent lots.
  if (property.parcelBoundary || (property.lat && property.lon)) {
    progress('Phase 2', 'Capturing GIS viewer screenshots (multiple views)...', 59);
    try {
      const { captureGisViewerScreenshots } = await import('./scrapers/gis-viewer-capture.js');
      const gisViewerScreenshots = await captureGisViewerScreenshots(
        {
          parcelBoundary: property.parcelBoundary ?? null,
          lat: property.lat,
          lon: property.lon,
          propertyId: property.propertyId ?? null,
          situsAddress: property.situsAddress ?? null,
          lotNumber: property.lotNumber ?? null,
          subdivisionName: property.subdivisionName ?? (knownIds.subdivisionNames.size > 0 ? [...knownIds.subdivisionNames][0] : null),
        },
        (p) => progress('Phase 2', `GIS Viewer: ${p.message}`),
      );
      allScreenshots.push(...gisViewerScreenshots);
      progress('Phase 2', `✓ ${gisViewerScreenshots.length} GIS viewer screenshot(s) captured`);
    } catch (err) {
      recordError('Phase 2', 'GIS Viewer Screenshots', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 3: AI ANALYSIS (~5-15 minutes)
  // ══════════════════════════════════════════════════════════════════

  checkAborted();
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

  // ── Pre-filter: remove clearly irrelevant documents BEFORE AI ────
  // Build property identifiers early so we can pre-filter
  const legalAbsSurvey = extractAbstractAndSurvey(property.legalDescription ?? '');
  const gisAbstractSubdiv = gis?.abstractSubdiv ?? null;
  const gisAbstractNum = gisAbstractSubdiv
    ? (gisAbstractSubdiv.match(/\d+/)?.[0] ?? null)
    : null;

  const propertyIds: PropertyIdentifiers = {
    ownerName: property.ownerName,
    legalDescription: property.legalDescription,
    acreage: property.acreage,
    lotNumber: property.lotNumber ?? knownIds.lotNumber,
    blockNumber: property.blockNumber ?? knownIds.blockNumber,
    subdivisionName: property.subdivisionName ?? (knownIds.subdivisionNames.size > 0 ? [...knownIds.subdivisionNames][0] : null),
    situsAddress: property.situsAddress,
    abstractNumber: legalAbsSurvey.abstractNumber ?? gisAbstractNum,
    surveyName: legalAbsSurvey.surveyName,
  };

  progress('Phase 3',
    `Property identifiers: abstract=${propertyIds.abstractNumber ?? 'unknown'}, ` +
    `survey="${propertyIds.surveyName ?? 'unknown'}", subdivision="${propertyIds.subdivisionName ?? 'unknown'}"`,
    61,
  );

  const preFilterDeeds = preFilterIrrelevantDocuments(
    deedRecords,
    propertyIds,
    (msg) => progress('Phase 3', `Pre-filter deeds: ${msg}`),
  );
  const filteredDeedRecords = preFilterDeeds.kept;
  if (preFilterDeeds.removed.length > 0) {
    for (const w of preFilterDeeds.warnings) recordError('Phase 3', 'Pre-Filter', w);
  }

  // Also pre-filter plats
  let filteredPlats = plats?.plats ?? [];
  if (filteredPlats.length > 0) {
    const preFilterPlats = preFilterIrrelevantDocuments(
      filteredPlats.map(p => ({
        ...p,
        legalDescription: p.aiAnalysis?.narrative ?? p.name,
        grantor: null,
        grantee: null,
        documentType: 'Plat',
      })),
      propertyIds,
      (msg) => progress('Phase 3', `Pre-filter plats: ${msg}`),
    );
    if (preFilterPlats.removed.length > 0) {
      const removedNames = new Set(preFilterPlats.removed.map(r => r.name));
      filteredPlats = filteredPlats.filter(p => !removedNames.has(p.name));
      for (const w of preFilterPlats.warnings) recordError('Phase 3', 'Pre-Filter', w);
    }
  }

  progress('Phase 3', `Analyzing ${filteredDeedRecords.length} deed(s) + ${filteredPlats.length} plat(s)...`, 62);

  // Extract bearing/distance calls from deed legal descriptions for plat cross-validation
  const deedCalls = extractDeedCallsFromLegalDescriptions(
    filteredDeedRecords.map(r => r.legalDescription ?? ''),
  );
  if (deedCalls.length > 0) {
    progress('Phase 3', `Extracted ${deedCalls.length} bearing/distance call(s) from deed legal descriptions`);
  }

  // Run AI analysis in parallel where possible — using PRE-FILTERED records
  const [deedAnalysisResult, platAnalysisResult] = await Promise.allSettled([
    analyzeBellDeeds(
      {
        deedRecords: filteredDeedRecords,
        cadLegalDescription: property.legalDescription,
        currentOwner: property.ownerName,
        targetProperty: {
          situsAddress: property.situsAddress,
          acreage: property.acreage,
          abstractNumber: propertyIds.abstractNumber,
          surveyName: propertyIds.surveyName,
          subdivisionName: propertyIds.subdivisionName,
          propertyId: property.propertyId,
        },
      },
      anthropicApiKey,
      (p) => progress('Phase 3', `Deeds: ${p.message}`, 65),
    ),
    analyzeBellPlats(
      { platRecords: filteredPlats, legalDescription: property.legalDescription, deedCalls },
      anthropicApiKey,
      (p) => progress('Phase 3', `Plats: ${p.message}`, 75),
    ),
  ]);

  const deedResult = deedAnalysisResult.status === 'fulfilled' ? deedAnalysisResult.value : null;
  const platResult = platAnalysisResult.status === 'fulfilled' ? platAnalysisResult.value : null;
  const deeds = deedResult?.section ?? null;
  const platSection = platResult?.section ?? null;

  if (deedAnalysisResult.status === 'rejected') recordError('Phase 3', 'Deed Analysis', deedAnalysisResult.reason);
  if (platAnalysisResult.status === 'rejected') recordError('Phase 3', 'Plat Analysis', platAnalysisResult.reason);

  checkAborted();
  // If AI credits ran out during deed/plat analysis, notify and skip remaining AI work
  notifyCreditDepleted();

  progress('Phase 3',
    `AI analysis complete: ` +
    `deeds=${deeds ? 'analyzed' : 'skipped'} ` +
    `plats=${platSection ? 'analyzed' : 'skipped'} ` +
    `chainOfTitle=${deeds?.chainOfTitle.length ?? 0} links`,
    78,
  );

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 3B: RECURSIVE DEED CHAIN TRACING
  //  Mine AI summaries for historical references (Vol/Page, instrument
  //  numbers) and fetch those older deeds from the clerk. This deepens
  //  the chain of title automatically.
  // ══════════════════════════════════════════════════════════════════
  if (deeds && deeds.records.length > 0) {
    checkAborted();
    progress('Phase 3B', 'Mining deed summaries for historical references...', 79);

    const existingInstruments = new Set(
      (clerk?.documents ?? []).map(d => d.instrumentNumber).filter(Boolean) as string[],
    );

    // Extract references from AI summaries
    const discoveredInstruments: string[] = [];
    const discoveredVolPages: Array<{ volume: string; page: string }> = [];

    for (const record of deeds.records) {
      const text = (record.aiSummary ?? '') + ' ' + (record.legalDescription ?? '');
      if (!text || text.length < 20) continue;

      // Find instrument numbers in text (8-10 digit sequences starting with 19xx or 20xx)
      const instrMatches = text.matchAll(/\b((?:19|20)\d{2}\d{5,7})\b/g);
      for (const m of instrMatches) {
        if (!existingInstruments.has(m[1]) && !discoveredInstruments.includes(m[1])) {
          discoveredInstruments.push(m[1]);
        }
      }

      // Find Vol/Page references: "Vol. 465, Pg. 96", "Volume 1234 Page 567"
      const volPgMatches = text.matchAll(/Vol(?:ume)?\.?\s*(\d+)[,\s]+P(?:age|g)\.?\s*(\d+)/gi);
      for (const m of volPgMatches) {
        const key = `VOL${m[1]}-PG${m[2]}`;
        if (!existingInstruments.has(key)) {
          discoveredVolPages.push({ volume: m[1], page: m[2] });
          existingInstruments.add(key);
        }
      }
    }

    const totalDiscovered = discoveredInstruments.length + discoveredVolPages.length;

    if (totalDiscovered > 0) {
      progress('Phase 3B',
        `Found ${totalDiscovered} historical reference(s) in deed summaries: ` +
        `${discoveredInstruments.length} instrument(s), ${discoveredVolPages.length} vol/page ref(s)`,
      );

      // Limit recursive depth to avoid runaway — fetch up to 10 additional historical docs
      const maxHistorical = 10;
      const histInstruments = discoveredInstruments.slice(0, maxHistorical);
      const histVolPages = discoveredVolPages.slice(0, maxHistorical - histInstruments.length);

      progress('Phase 3B',
        `Fetching up to ${histInstruments.length + histVolPages.length} historical deed(s) from clerk...`,
      );

      try {
        const historicalClerk = await scrapeBellClerk(
          {
            instrumentNumbers: histInstruments,
            volumePages: histVolPages,
            maxDocuments: maxHistorical,
            captureImages: true,
            projectId: input.projectId,
          },
          (p) => progress('Phase 3B', `Historical: ${p.message}`),
        );

        if (historicalClerk.documents.length > 0) {
          progress('Phase 3B',
            `Retrieved ${historicalClerk.documents.length} historical document(s) — running AI analysis`,
          );

          // Collect screenshots from historical fetch
          allScreenshots.push(...historicalClerk.screenshots);
          recordLinks(historicalClerk.urlsVisited, 'Phase 3B historical deed fetch', true);

          // Analyze historical deeds
          const historicalDeedRecords = historicalClerk.documents.map(doc => ({
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
            source: 'Bell County Clerk (Historical)',
            confidence: scoreOverallConfidence([]),
          }));

          const historicalAnalysis = await analyzeBellDeeds(
            {
              deedRecords: historicalDeedRecords,
              cadLegalDescription: property.legalDescription,
              currentOwner: property.ownerName,
            },
            anthropicApiKey,
            (p) => progress('Phase 3B', `Historical AI: ${p.message}`),
          );

          if (historicalAnalysis.section.records.length > 0) {
            // Merge historical records into the main deed section
            deeds.records.push(...historicalAnalysis.section.records);
            deeds.chainOfTitle.push(...historicalAnalysis.section.chainOfTitle);
            // Re-sort chain of title by date
            deeds.chainOfTitle.sort((a, b) => {
              const dateA = a.date ? new Date(a.date).getTime() : 0;
              const dateB = b.date ? new Date(b.date).getTime() : 0;
              return dateA - dateB;
            });
            // Re-number
            deeds.chainOfTitle.forEach((link, i) => { link.order = i + 1; });

            progress('Phase 3B',
              `Historical analysis complete: added ${historicalAnalysis.section.records.length} record(s), ` +
              `chain of title now ${deeds.chainOfTitle.length} links deep`,
            );
          }
        } else {
          progress('Phase 3B', 'No additional historical documents found at clerk');
        }
      } catch (err) {
        recordError('Phase 3B', 'Historical Deed Fetch', err);
      }
    } else {
      progress('Phase 3B', 'No additional historical references found in deed summaries');
    }
  }

  checkAborted();

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 3C: DOCUMENT RELEVANCE VALIDATION (POST-AI)
  //  Second pass: now that AI summaries are available, run the full
  //  relevance check (heuristic + AI) to catch any remaining
  //  unrelated documents that slipped past pre-filtering.
  //  PropertyIdentifiers were already built before Phase 3.
  // ══════════════════════════════════════════════════════════════════
  progress('Phase 3C',
    `Post-AI relevance check: abstract=${propertyIds.abstractNumber ?? 'unknown'}, ` +
    `survey="${propertyIds.surveyName ?? 'unknown'}", subdivision="${propertyIds.subdivisionName ?? 'unknown'}"`,
    81,
  );

  if (deeds && deeds.records.length > 0) {
    progress('Phase 3C', `Validating relevance of ${deeds.records.length} deed(s) to target property...`, 81);
    try {
      const deedValidation = await validateDeedRelevance(
        deeds.records,
        propertyIds,
        anthropicApiKey,
        (msg) => progress('Phase 3C', msg),
      );

      if (deedValidation.summary.removed > 0) {
        deeds.records = deedValidation.relevant;
        // Also filter chain of title to only include kept instruments
        const keptInstruments = new Set(deedValidation.relevant.map(d => d.instrumentNumber).filter(Boolean));
        deeds.chainOfTitle = deeds.chainOfTitle.filter(link => {
          // Keep links whose instrument number is in the kept set, or links without an instrument number
          if (!link.instrumentNumber) return true;
          return keptInstruments.has(link.instrumentNumber);
        });
        deeds.chainOfTitle.forEach((link, i) => { link.order = i + 1; });

        progress('Phase 3C',
          `Deed relevance: kept ${deedValidation.summary.kept} of ${deedValidation.summary.total}, removed ${deedValidation.summary.removed} unrelated`,
        );
      }

      // Surface relevance warnings as discrepancy-level notes
      for (const w of deedValidation.summary.warnings) {
        recordError('Phase 3C', 'Deed Relevance', w);
      }
    } catch (err) {
      recordError('Phase 3C', 'Deed Relevance Validation', err);
    }
  }

  if (platSection && platSection.plats && platSection.plats.length > 0) {
    progress('Phase 3C', `Validating relevance of ${platSection.plats.length} plat(s)...`, 82);
    try {
      const platValidation = validatePlatRelevance(
        platSection.plats,
        propertyIds,
        (msg) => progress('Phase 3C', msg),
      );

      if (platValidation.warnings.length > 0) {
        platSection.plats = platValidation.relevant;
        progress('Phase 3C',
          `Plat relevance: kept ${platValidation.relevant.length} of ${platValidation.relevant.length + platValidation.warnings.filter(w => w.startsWith('REMOVED')).length}`,
        );
      }

      for (const w of platValidation.warnings) {
        recordError('Phase 3C', 'Plat Relevance', w);
      }
    } catch (err) {
      recordError('Phase 3C', 'Plat Relevance Validation', err);
    }
  }

  checkAborted();

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 3D: LOT CORRELATION
  //  For multi-lot plats, identify which specific lot corresponds to
  //  the target property using data matching, GIS parcel map, and
  //  AI visual correlation.
  // ══════════════════════════════════════════════════════════════════
  if (platSection && platSection.plats.length > 0) {
    progress('Phase 3D', 'Correlating target lot on plat(s)...', 83);

    const lotInput: LotCorrelationInput = {
      lotNumber: property.lotNumber ?? knownIds.lotNumber,
      blockNumber: property.blockNumber ?? knownIds.blockNumber,
      acreage: property.acreage,
      ownerName: property.ownerName,
      propertyId: property.propertyId,
      situsAddress: property.situsAddress,
      parcelBoundary: property.parcelBoundary ?? null,
      lat: property.lat,
      lon: property.lon,
      subdivisionName: property.subdivisionName ?? propertyIds.subdivisionName,
    };

    for (const plat of platSection.plats) {
      if (!plat.aiAnalysis && plat.images.length === 0) continue;

      try {
        const correlation = await correlateTargetLot(
          lotInput,
          plat.images,
          plat.name,
          plat.aiAnalysis,
          anthropicApiKey,
          (msg) => progress('Phase 3D', msg),
        );

        // Store result in plat analysis
        if (plat.aiAnalysis) {
          plat.aiAnalysis.targetLot = {
            lotId: correlation.identifiedLot,
            confidence: correlation.confidence,
            method: correlation.method,
            reasoning: correlation.reasoning,
          };
        }

        // Store parcel map as a screenshot if generated
        if (correlation.parcelMapImage) {
          allScreenshots.push({
            source: 'GIS Parcel Map',
            url: `generated://parcel-map/${property.propertyId}`,
            imageBase64: correlation.parcelMapImage,
            capturedAt: new Date().toISOString(),
            description: `GIS parcel boundary map for ${property.situsAddress} (Lot ${property.lotNumber ?? '?'})`,
          });
        }

        if (correlation.identifiedLot) {
          progress('Phase 3D',
            `✓ Target lot on "${plat.name}": Lot ${correlation.identifiedLot} ` +
            `(${correlation.confidence}% confidence, method: ${correlation.method})`,
          );
        } else {
          progress('Phase 3D',
            `⚠ Could not identify target lot on "${plat.name}" — ${correlation.reasoning}`,
          );
        }
      } catch (err) {
        recordError('Phase 3D', 'Lot Correlation', err);
      }
    }
  }

  checkAborted();

  // ── Extract easements & restrictive covenants from clerk documents ─
  const easementRecords = extractEasementRecords(clerk?.documents ?? []);
  const restrictiveCovenants = extractRestrictiveCovenants(clerk?.documents ?? [], plats?.plats ?? []);
  if (easementRecords.length > 0) {
    progress('Phase 3', `Extracted ${easementRecords.length} easement record(s) from clerk documents`);
  }
  if (restrictiveCovenants.length > 0) {
    progress('Phase 3', `Extracted ${restrictiveCovenants.length} restrictive covenant(s)`);
  }

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
    easements: easementRecords.map(e => ({ source: e.source, description: e.description })),
  });
  if (discrepancies.length > 0) {
    progress('Phase 3', `⚠ Found ${discrepancies.length} discrepancy/ies between sources`);
    for (const d of discrepancies.slice(0, 5)) {
      progress('Phase 3', `  • [${d.category}] ${d.description}: "${d.source1Value}" vs "${d.source2Value}" (${d.severity})`);
    }
  }

  // ── Site intelligence ──────────────────────────────────────────────
  let siteIntelligence: SiteIntelligenceNote[] = [];
  if (isCreditDepleted()) {
    progress('Phase 3', 'Skipping site intelligence analysis — AI credits depleted', 85);
  } else {
  progress('Phase 3', 'Analyzing site screenshots for system improvement...', 85);
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
  } // end if !isCreditDepleted

  // ── GIS screenshot quality analysis ────────────────────────────────
  // Use AI vision to evaluate each GIS screenshot for zoom correctness,
  // layer visibility, and overall quality. Results are logged to both
  // worker console and frontend progress logs with recommendations.
  let gisQualityReport: {
    summary: string;
    checks: Array<{ label: string; qualityScore: number; zoomAssessment: string; whatIsShown: string; recommendations: string[] }>;
    actionableAdjustments: string[];
  } | null = null;

  const gisScreenshots = allScreenshots.filter(ss => ss.source === 'GIS Viewer');
  if (gisScreenshots.length === 0) {
    progress('Phase 3', 'No GIS screenshots to analyze for quality', 86);
  } else if (isCreditDepleted()) {
    progress('Phase 3', 'Skipping GIS quality analysis — AI credits depleted', 86);
  } else {
    progress('Phase 3', `Analyzing ${gisScreenshots.length} GIS screenshot(s) for quality...`, 86);
    try {
      const { analyzeGisScreenshotQuality } = await import('./analyzers/gis-quality-analyzer.js');
      const report = await analyzeGisScreenshotQuality(
        gisScreenshots,
        anthropicApiKey,
        property.propertyId ?? null,
        (msg) => progress('Phase 3', `GIS Quality: ${msg}`),
      );
      gisQualityReport = {
        summary: report.summary,
        checks: report.checks.map(c => ({
          label: c.label,
          qualityScore: c.qualityScore,
          zoomAssessment: c.zoomAssessment,
          whatIsShown: c.whatIsShown,
          recommendations: c.recommendations,
        })),
        actionableAdjustments: report.actionableAdjustments,
      };
      // Accumulate AI usage
      for (const key of ['totalCalls', 'totalInputTokens', 'totalOutputTokens', 'estimatedCostUsd'] as const) {
        // aiUsage is accumulated in Phase 4 — track it in the deed/plat usage objects for now
      }
      progress('Phase 3', `GIS Quality Analysis: ${report.summary}`);
    } catch (err) {
      recordError('Phase 3', 'GIS Quality Analysis', err);
    }
  }

  // ── Screenshot classification ─────────────────────────────────────
  // Use AI vision to review each screenshot and classify it as useful
  // or misc. Misc screenshots (error pages, empty results, auth walls,
  // blank PDF viewers) are tagged so the frontend can show them in a
  // collapsed section at the bottom instead of cluttering the main view.
  if (isCreditDepleted()) {
    progress('Phase 3', 'Skipping screenshot classification — AI credits depleted', 87);
  } else {
  progress('Phase 3', 'Classifying screenshots for review...', 87);
  try {
    const { classifyScreenshots } = await import('./analyzers/screenshot-classifier.js');
    const classResult = await classifyScreenshots(
      allScreenshots,
      anthropicApiKey,
      (msg) => progress('Phase 3', `Screenshots: ${msg}`),
    );

    // Tag each screenshot with its classification
    for (const ss of classResult.useful) {
      ss.classification = 'useful';
    }
    for (const ss of classResult.misc) {
      ss.classification = 'misc';
    }

    if (classResult.misc.length > 0) {
      progress('Phase 3',
        `Screenshot classification: ${classResult.useful.length} useful, ${classResult.misc.length} misc (hidden in review)`,
      );
    }
  } catch (err) {
    recordError('Phase 3', 'Screenshot Classification', err);
    // On failure, all screenshots stay as-is (default = useful)
  }
  } // end if !isCreditDepleted

  // ══════════════════════════════════════════════════════════════════
  //  PHASE 4: ASSEMBLE REPORT (~10-30 seconds)
  // ══════════════════════════════════════════════════════════════════

  checkAborted();
  // Final credit-depletion notification (catches any late-stage detection)
  notifyCreditDepleted();
  progress('Phase 4', '─────────────────────────────────────────────', 90);
  progress('Phase 4', 'PHASE 4 — Assembling Research Report', 90);

  // Aggregate AI usage across all analyzers
  const aiUsage: AiUsageSummary = {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estimatedCostUsd: 0,
  };
  for (const u of [deedResult?.aiUsage, platResult?.aiUsage]) {
    if (u) {
      aiUsage.totalCalls += u.totalCalls;
      aiUsage.totalInputTokens += u.totalInputTokens;
      aiUsage.totalOutputTokens += u.totalOutputTokens;
      aiUsage.estimatedCostUsd += u.estimatedCostUsd;
    }
  }

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

  // Build per-section confidence using relevant data items (not an empty array)
  const cadDataItems = dataItems.filter(d => d.source === 'Bell CAD' || d.source === 'Bell GIS');
  const deedDataItems = deedRecords.length > 0
    ? deedRecords.map(d => ({ key: 'instrument', value: d.instrumentNumber ?? d.documentType, source: 'Clerk', dataType: 'instrument_ref' as const }))
    : [];
  const platDataItems = (plats?.plats.length ?? 0) > 0
    ? [{ key: 'plat', value: 'found', source: 'Bell County Plat Repository', dataType: 'instrument_ref' as const }]
    : [];
  const easementDataItems = [
    ...(fema?.result ? [{ key: 'fema', value: fema.result.floodZone, source: 'FEMA NFHL', dataType: 'classification' as const }] : []),
    ...(txdot?.result ? [{ key: 'txdot', value: txdot.result.highwayName ?? 'ROW', source: 'TxDOT', dataType: 'classification' as const }] : []),
    ...easementRecords.map(e => ({ key: 'easement', value: e.type, source: e.source, dataType: 'instrument_ref' as const })),
  ];

  // Optional: find adjacent properties (only if user requested it)
  let adjacentProperties: BellResearchResult['adjacentProperties'] = [];
  if (input.includeAdjacentProperties && property.parcelBoundary && property.parcelBoundary.length > 0) {
    progress('Phase 4', 'Finding adjacent properties from GIS...', 92);
    try {
      const { analyzeAdjacentProperties } = await import('./analyzers/adjacent-analyzer');
      adjacentProperties = await analyzeAdjacentProperties(
        { parcelBoundary: property.parcelBoundary, targetPropertyId: property.propertyId },
        (p) => progress('Phase 4', `Adjacent: ${p.message}`),
      );
      progress('Phase 4', `Found ${adjacentProperties.length} adjacent parcel(s)`);
    } catch (err) {
      recordError('Phase 4', 'Adjacent Properties', err);
    }
  } else if (input.includeAdjacentProperties) {
    progress('Phase 4', '⚠ Adjacent property search requested but no parcel boundary available — skipping');
  }

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
    `| AI: ${aiUsage.totalCalls} calls / ~$${aiUsage.estimatedCostUsd.toFixed(4)} ` +
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
      confidence: scoreOverallConfidence(deedDataItems),
    },
    plats: platSection ?? {
      summary: plats && plats.plats.length > 0
        ? `Found ${plats.plats.length} plat(s) but AI analysis was not completed.`
        : 'No plat records were found.',
      plats: plats?.plats ?? [],
      crossValidation: [],
      confidence: scoreOverallConfidence(platDataItems),
    },
    easementsAndEncumbrances: {
      fema: fema?.result ?? null,
      txdot: txdot?.result ?? null,
      easements: easementRecords,
      restrictiveCovenants,
      summary: buildEasementSummary(fema?.result ?? null, txdot?.result ?? null, easementRecords, restrictiveCovenants),
      confidence: scoreOverallConfidence(easementDataItems),
    },
    propertyDetails: {
      cadData: cad ? { propertyId: cad.propertyId, ownerName: cad.ownerName, acreage: cad.acreage } : {},
      gisData: gis?.rawAttributes ?? {},
      aerialScreenshot: null,
      taxInfo: tax?.taxInfo ?? null,
      confidence: scoreOverallConfidence(cadDataItems),
    },
    researchedLinks: allLinks,
    discrepancies,
    adjacentProperties,
    siteIntelligence: siteIntelligence ?? [],
    gisQualityReport,

    screenshots: allScreenshots,
    errors,
    aiUsage,
    overallConfidence,
    creditDepleted: isCreditDepleted() || undefined,
  };

  progress('Phase 4', 'Research complete!', 100);

  console.log(
    `[BellOrchestrator] ${input.projectId ?? 'no-id'}: COMPLETE — duration=${Math.round(durationMs / 1000)}s ` +
    `owner="${property.ownerName ?? ''}" propertyId="${property.propertyId ?? ''}" ` +
    `deeds=${deedRecords.length} plats=${plats?.plats.length ?? 0} discrepancies=${discrepancies.length} ` +
    `errors=${errors.filter(e => !e.recovered).length} fatal + ${errors.filter(e => e.recovered).length} recovered ` +
    `confidence=${overallConfidence.tier}(${overallConfidence.score})`,
  );

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
  } catch (err) {
    console.warn(`[orchestrator] Census geocoder failed for "${address}": ${err instanceof Error ? err.message : String(err)}`);
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
  } catch (err) {
    console.warn(`[orchestrator] Nominatim geocoder failed for "${address}": ${err instanceof Error ? err.message : String(err)}`);
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
  knownIds?: { lotNumber?: string | null; blockNumber?: string | null; subdivisionNames?: Set<string> },
): ResolvedProperty {
  // Extract lot/block from legal description if not already in knownIds
  // Use the robust extractLotBlock from bell-county-classifier which handles
  // both "BLOCK X, LOT Y" (Bell CAD standard) and "LOT X, BLOCK Y" formats
  const legalDesc = cad?.legalDescription ?? gis?.legalDescription ?? '';
  let lotNumber = knownIds?.lotNumber ?? null;
  let blockNumber = knownIds?.blockNumber ?? null;
  if (!lotNumber && legalDesc) {
    const desc = legalDesc.toUpperCase();
    // Try BLOCK-first pattern (Bell CAD standard: "BLOCK 001, LOT 0002")
    const blockFirst = desc.match(/BLOCK\s+([\dA-Z]+)[,\s]+LOT\s+([\dA-Z]+)/);
    if (blockFirst) {
      blockNumber = blockFirst[1];
      lotNumber = blockFirst[2];
    } else {
      // Try LOT-first pattern ("LOT 3, BLOCK A")
      const lotFirst = desc.match(/LOT\s+([\dA-Z]+)[,\s]+(?:BLK|BLOCK)\s+([\dA-Z]+)/);
      if (lotFirst) {
        lotNumber = lotFirst[1];
        blockNumber = lotFirst[2];
      } else {
        // Fallback: independent extraction
        const lotOnly = desc.match(/\bLOT\s+([\dA-Z]+)/);
        const blockOnly = desc.match(/\bBLOCK\s+([\dA-Z]+)/);
        lotNumber = lotOnly?.[1] ?? null;
        blockNumber = blockOnly?.[1] ?? null;
      }
    }
  }
  const subdivisionName = knownIds?.subdivisionNames?.size
    ? [...knownIds.subdivisionNames][0]
    : null;

  // Extract abstract number and survey name from legal description
  const absSurvey = extractAbstractAndSurvey(legalDesc);
  // Also try GIS abstractSubdiv field (e.g., "A-12")
  const gisAbsNum = gis?.abstractSubdiv ? (gis.abstractSubdiv.match(/\d+/)?.[0] ?? null) : null;

  return {
    propertyId: cad?.propertyId ?? gis?.propertyId ?? input.propertyId ?? '',
    ownerName: cad?.ownerName ?? gis?.ownerName ?? input.ownerName ?? '',
    legalDescription: legalDesc,
    acreage: cad?.acreage ?? gis?.acreage ?? null,
    situsAddress: cad?.situsAddress ?? gis?.situsAddress ?? input.address ?? '',
    mailingAddress: cad?.mailingAddress,
    propertyType: cad?.propertyType ?? undefined,
    lotNumber,
    blockNumber,
    subdivisionName,
    abstractNumber: absSurvey.abstractNumber ?? gisAbsNum,
    surveyName: absSurvey.surveyName,
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
  easements: EasementRecord[] = [],
  covenants: string[] = [],
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

  if (easements.length > 0) {
    const types = [...new Set(easements.map(e => e.type))];
    parts.push(`Recorded easements (${easements.length}): ${types.join(', ')}.`);
  }

  if (covenants.length > 0) {
    parts.push(`Restrictive covenants found: ${covenants.length} instrument(s).`);
  }

  return parts.join(' ');
}

// ── Internal: Easement Record Extraction ──────────────────────────────

/**
 * Easement document type keywords (Bell County Clerk terminology).
 * Maps clerk document type strings → our EasementRecord.type values.
 */
const EASEMENT_DOCUMENT_TYPES: Record<string, string> = {
  EASEMENT: 'Easement',
  'ACCESS EASEMENT': 'Access Easement',
  'UTILITY EASEMENT': 'Utility Easement',
  'DRAINAGE EASEMENT': 'Drainage Easement',
  'PIPELINE EASEMENT': 'Pipeline Easement',
  'POWER LINE EASEMENT': 'Power Line Easement',
  'INGRESS EGRESS': 'Ingress/Egress Easement',
  'INGRESS/EGRESS': 'Ingress/Egress Easement',
  'ROAD EASEMENT': 'Road Easement',
  'ROW EASEMENT': 'ROW Easement',
  'RIGHT OF WAY': 'Right-of-Way',
  'RIGHT-OF-WAY': 'Right-of-Way',
};

/**
 * Restrictive covenant document type keywords.
 */
const COVENANT_DOCUMENT_TYPES = new Set([
  'DEED RESTRICTIONS',
  'RESTRICTIVE COVENANT',
  'PROTECTIVE COVENANTS',
  'DECLARATION OF RESTRICTIONS',
  'COVENANT',
  'CCR',
  'CC&R',
]);

type ClerkDocument = Awaited<ReturnType<typeof scrapeBellClerk>>['documents'][number];

/**
 * Extract EasementRecord objects from a list of clerk documents whose
 * document type identifies them as easements.
 */
function extractEasementRecords(documents: ClerkDocument[]): EasementRecord[] {
  const records: EasementRecord[] = [];

  for (const doc of documents) {
    const typeUpper = doc.documentType.toUpperCase().trim();

    // Exact match first, then partial match
    let easementType = EASEMENT_DOCUMENT_TYPES[typeUpper];
    if (!easementType) {
      for (const [key, value] of Object.entries(EASEMENT_DOCUMENT_TYPES)) {
        if (typeUpper.includes(key)) {
          easementType = value;
          break;
        }
      }
    }

    if (!easementType) continue;

    records.push({
      type: easementType,
      description: doc.legalDescription
        ? `${easementType} — ${doc.legalDescription.slice(0, 200)}`
        : `${easementType} recorded ${doc.recordingDate ?? 'unknown date'}` +
          (doc.grantor ? ` — Grantor: ${doc.grantor}` : '') +
          (doc.grantee ? `, Grantee: ${doc.grantee}` : ''),
      instrumentNumber: doc.instrumentNumber,
      width: extractWidthFromText(doc.legalDescription ?? ''),
      location: extractLocationFromLegal(doc.legalDescription ?? ''),
      image: doc.pageImages[0] ?? null,
      sourceUrl: doc.sourceUrl,
      source: 'Bell County Clerk',
      confidence: computeConfidence({
        sourceReliability: SOURCE_RELIABILITY['county-clerk-official'],
        dataUsefulness: doc.pageImages.length > 0 ? 20 : 10,
        crossValidation: 0,
        sourceName: 'Bell County Clerk',
        validatedBy: [],
        contradictedBy: [],
      }),
    });
  }

  return records;
}

/**
 * Extract restrictive covenant instrument references from clerk documents
 * and plat records.
 */
function extractRestrictiveCovenants(
  documents: ClerkDocument[],
  platRecords: Array<{ name: string; instrumentNumber: string | null; source: string }>,
): string[] {
  const covenants: string[] = [];
  const seen = new Set<string>();

  // From clerk documents
  for (const doc of documents) {
    const typeUpper = doc.documentType.toUpperCase().trim();
    const isCovenant = COVENANT_DOCUMENT_TYPES.has(typeUpper) ||
      [...COVENANT_DOCUMENT_TYPES].some(k => typeUpper.includes(k));

    if (isCovenant) {
      const ref = doc.instrumentNumber ?? `${doc.volume ?? '?'}/${doc.page ?? '?'}`;
      if (!seen.has(ref)) {
        seen.add(ref);
        const label = doc.instrumentNumber
          ? `Inst# ${doc.instrumentNumber} (${doc.documentType}${doc.recordingDate ? ', ' + doc.recordingDate : ''})`
          : `Vol ${doc.volume}/${doc.page} (${doc.documentType})`;
        covenants.push(label);
      }
    }
  }

  // From plat records — plats often incorporate deed restrictions by reference
  for (const plat of platRecords) {
    if (/restriction|covenant|CCR/i.test(plat.name)) {
      const ref = plat.instrumentNumber ?? plat.name;
      if (!seen.has(ref)) {
        seen.add(ref);
        covenants.push(`Plat restrictions: ${plat.name}${plat.instrumentNumber ? ` (Inst# ${plat.instrumentNumber})` : ''}`);
      }
    }
  }

  return covenants;
}

// ── Internal: Text Extraction Helpers ────────────────────────────────

/** Try to extract an easement width like "20 ft", "15-foot", "20'" from text. */
function extractWidthFromText(text: string): string | undefined {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:ft|foot|feet|'|LF)/i);
  return m ? `${m[1]} ft` : undefined;
}

/** Try to extract a brief location description from a legal description. */
function extractLocationFromLegal(text: string): string | undefined {
  if (!text) return undefined;
  // Return first 120 chars of the legal description as a location hint
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : undefined;
}

/**
 * Extract metes-and-bounds bearing/distance calls from deed legal descriptions.
 *
 * Recognises standard surveying notation, e.g.:
 *   "N 45°30'15\" E, 200.50 ft"
 *   "S89°45'W 150.00 feet"
 *   "NORTH 45 DEG 30 MIN 15 SEC EAST 200.50 FEET"
 *
 * Returned strings are already normalised for direct comparison with plat calls.
 */
export function extractDeedCallsFromLegalDescriptions(legalDescriptions: string[]): string[] {
  // Match bearing/distance calls in multiple common surveying notations.
  // Uses fresh regex instances per call to avoid lastIndex state leaks.
  const calls = new Set<string>();
  for (const text of legalDescriptions) {
    if (!text) continue;

    // Pattern 1 — Symbol notation (multiple Unicode degree/quote variants):
    //   "N 45°30'15" E, 200.50 ft"  or  "S89°45'W 150.00 feet"
    //   Also handles: ˚ (ring), ° (HTML entity result), fancy quotes ′″, and
    //   optional leading zeros like "N 045°30'15" E"
    const symbolPattern =
      /[NSEW]\s*0?\d+\s*[°˚ᵒ]\s*\d+\s*[''′']\s*(?:\d+\s*[""″"]\s*)?[NSEW]?\s*[,;]?\s*\d+(?:\.\d+)?\s*(?:ft|feet|foot|LF|')\b/gi;

    // Pattern 2 — Spelled-out notation:
    //   "NORTH 30 DEG 15 MIN 00 SEC EAST 125.00 FEET"
    //   Also handles: "DEGREES" / "MINUTES" / "SECONDS" long-form,
    //   optional seconds, and both N/S/E/W abbreviations
    const spelledPattern =
      /(?:NORTH|SOUTH|EAST|WEST|[NSEW])\s+\d+\s+(?:DEG(?:REES?)?)\s+\d+\s+(?:MIN(?:UTES?)?)\s*(?:\d+\s+(?:SEC(?:ONDS?)?))?\.?\s+(?:NORTH|SOUTH|EAST|WEST|[NSEW])\s+\d+(?:\.\d+)?\s+(?:FEET|FOOT|FT|LF)\b/gi;

    // Pattern 3 — "thence" notation (common in Texas deeds):
    //   "thence N 45°30'15" E a distance of 200.50 feet"
    //   Captures the bearing and distance when separated by filler words
    const thencePattern =
      /(?:thence|then)\s+[NSEW]\s*0?\d+\s*[°˚ᵒ]\s*\d+\s*[''′']\s*(?:\d+\s*[""″"]\s*)?[NSEW]\s*[,;]?\s*(?:a\s+distance\s+of\s+)?\d+(?:\.\d+)?\s*(?:ft|feet|foot|LF)\b/gi;

    // Pattern 4 — Simple cardinal + distance (less common but found in some deeds):
    //   "along the north line 150.00 feet" or "easterly 200 ft"
    const cardinalPattern =
      /(?:along\s+the\s+)?(?:north(?:erly|ern)?|south(?:erly|ern)?|east(?:erly|ern)?|west(?:erly|ern)?)\s+(?:line\s+)?\d+(?:\.\d+)?\s*(?:ft|feet|foot|LF)\b/gi;

    for (const pattern of [symbolPattern, spelledPattern, thencePattern, cardinalPattern]) {
      const matches = text.match(pattern);
      if (matches) {
        for (const m of matches) {
          calls.add(m.replace(/\s+/g, ' ').trim());
        }
      }
    }
  }
  return [...calls];
}
