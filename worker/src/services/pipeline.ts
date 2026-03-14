// worker/src/services/pipeline.ts — Main 4-stage pipeline orchestrator
// Coordinates: Stage 0 (normalize) → Stage 1 (CAD) → Stage 2 (Clerk) → Stage 3 (AI) → Stage 4 (Validate)
// Supports: direct property ID lookup, owner name search, user file uploads.

import type { PipelineInput, PipelineResult, DocumentResult, UserFile, PropertyIdResult, SearchDiagnostics } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';
import { normalizeAddress } from './address-utils.js';
import { searchBisCad, BIS_CONFIGS } from './bis-cad.js';
import { searchClerkRecords, fetchDocumentImages, hasKofileConfig, getKofileBaseUrl, searchBellClerkOwnerForPlatDeed } from './bell-clerk.js';
import { extractDocuments, extractPlatBoundary } from './ai-extraction.js';
import { validateBoundary } from './validation.js';
import { runGeoReconcile } from './geo-reconcile.js';
import { bundleAndUploadPages } from './pages-to-pdf.js';
import { extractSubdivisionName, fetchBestMatchingPlat, hasPlatRepository } from './county-plats.js';
import {
  createSearchState,
  ingestCADResult,
  ingestDeedHistory,
  pivotPersonalPropertyToLand,
  findRelatedBellProperties,
  summarizeSearchState,
  mergeCascadeIntoPipeline,
} from './bell-county-research.js';
import { classifyBellProperty } from './bell-county-classifier.js';

// ── Deed Reference Parser ─────────────────────────────────────────────────

/**
 * Parse a BIS/CAD legal description for deed references that can be used to
 * search the county clerk directly by instrument number, volume/page, or plat
 * cabinet/slide. This gives us precise clerk search targets instead of the
 * fragile owner-name SPA search.
 *
 * Examples of strings that are parsed:
 *   "Inst 2010043440"  →  instrumentNumbers: ["2010043440"]
 *   "Vol 7687 Pg 112"  →  volumePages: [{ volume: "7687", page: "112" }]
 *   "OPR/7687/112"     →  volumePages: [{ volume: "7687", page: "112" }]
 *   "Cabinet A Slide 5"→  platRefs: [{ cabinet: "A", slide: "5" }]
 */
export function parseDeedReferences(legalDescription: string): {
  instrumentNumbers: string[];
  volumePages: { volume: string; page: string }[];
  platRefs: { cabinet: string; slide: string }[];
} {
  const instrumentNumbers: string[] = [];
  const volumePages: { volume: string; page: string }[] = [];
  const platRefs: { cabinet: string; slide: string }[] = [];

  // Instrument numbers (7+ digit standalone numbers or Inst/Doc prefixed)
  const instMatches = legalDescription.matchAll(/(?:Inst(?:rument)?|Doc(?:ument)?)[\s#:]*(\d{7,})/gi);
  for (const m of instMatches) {
    if (!instrumentNumbers.includes(m[1])) instrumentNumbers.push(m[1]);
  }

  // Bare 10-digit numbers that look like clerk instrument numbers (not part of longer numbers)
  const bareMatches = legalDescription.matchAll(/\b(\d{10})\b/g);
  for (const m of bareMatches) {
    if (!instrumentNumbers.includes(m[1])) instrumentNumbers.push(m[1]);
  }

  // Volume/Page references: "Vol 7687 Pg 112" / "Vol. 7687, Page 112"
  const vpMatches = legalDescription.matchAll(/Vol(?:ume)?\.?\s*(\d+)[,\s]*(?:Pg|Page)\.?\s*(\d+)/gi);
  for (const m of vpMatches) volumePages.push({ volume: m[1], page: m[2] });

  // OPR/volume/page format (Official Public Records): "OPR/7687/112"
  const oprMatches = legalDescription.matchAll(/OPR\/(\d+)\/(\d+)/gi);
  for (const m of oprMatches) volumePages.push({ volume: m[1], page: m[2] });

  // Plat Cabinet/Slide references: "Cabinet A Slide 5" / "Cab. B, Sl. 12"
  const platMatches = legalDescription.matchAll(/(?:Cabinet|Cab)\.?\s*([A-Z])[\s,]*(?:Slide|Sl)\.?\s*(\d+)/gi);
  for (const m of platMatches) platRefs.push({ cabinet: m[1].toUpperCase(), slide: m[2] });

  return { instrumentNumbers, volumePages, platRefs };
}

// ── Supabase Client (Lazy Init) ───────────────────────────────────────────

let supabaseClient: Awaited<ReturnType<typeof import('@supabase/supabase-js').createClient>> | null = null;

async function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Pipeline] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — status updates disabled');
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');
  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

// ── Status Updates ─────────────────────────────────────────────────────────

async function updateStatus(
  projectId: string,
  status: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;

    const update: Record<string, unknown> = {
      research_status: status,
      research_message: message,
      updated_at: new Date().toISOString(),
    };
    if (metadata) update.research_metadata = metadata;

    // The supabase client is typed via ReturnType<typeof createClient> without a
    // database schema generic, which causes the update() parameter to resolve to
    // `never`.  Casting to `any` here is intentional and safe: the update object
    // is built explicitly above with known-safe string/Date values.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('research_projects')
      .update(update)
      .eq('id', projectId);

    if (error) {
      console.warn(`[Pipeline] Supabase update warning for ${projectId}: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[Pipeline] Supabase update failed:`, err instanceof Error ? err.message : err);
  }
}

// ── AI-Assisted Owner Name Formatting ──────────────────────────────────────

/**
 * If the user provides an owner name, use Claude to determine the best
 * search format for that name against the county clerk system.
 */
async function aiFormatOwnerName(
  ownerName: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<string[]> {
  const finish = logger.startAttempt({
    layer: 'OwnerFormat',
    source: 'Claude',
    method: 'name-formatting',
    input: ownerName,
  });

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Given this property owner name: "${ownerName}"

Generate ALL plausible search formats that a Texas county clerk or CAD system might use to index this name. Consider:
- LAST, FIRST format (most common for clerk records)
- FIRST LAST format
- Business entity variations (with/without LLC, Inc, etc.)
- Common abbreviations (Wm for William, Chas for Charles, etc.)
- Initials instead of full names
- Maiden name / married name possibilities
- Trust or estate variations

Return ONLY a JSON array of strings, no explanation. Example: ["SMITH, JOHN", "JOHN SMITH", "SMITH JOHN"]`,
      }],
    });

    const text = response.content.find((c) => c.type === 'text');
    if (!text || text.type !== 'text') {
      finish({ status: 'fail', error: 'No response' });
      return [ownerName];
    }

    const cleaned = text.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) {
      finish({ status: 'success', dataPointsFound: parsed.length, details: `Generated ${parsed.length} name variants` });
      return parsed.map(String);
    }
  } catch (err) {
    finish({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
  }

  // Fallback: basic formatting
  return [ownerName, ownerName.toUpperCase()];
}

// ── User File Processing ───────────────────────────────────────────────────

function processUserFiles(userFiles: UserFile[], logger: PipelineLogger): DocumentResult[] {
  const results: DocumentResult[] = [];

  for (const file of userFiles) {
    logger.info('UserFiles', `Processing: ${file.filename} (${file.mimeType}, ${(file.size / 1024).toFixed(0)} KB)`);

    const isImage = file.mimeType.startsWith('image/');
    const isPdf = file.mimeType === 'application/pdf';
    const isText = file.mimeType.startsWith('text/') || file.mimeType === 'application/json';

    let textContent: string | null = null;
    let imageBase64: string | null = null;
    let imageFormat: DocumentResult['imageFormat'] = null;

    if (isText) {
      // Decode base64 to text
      try {
        textContent = Buffer.from(file.data, 'base64').toString('utf-8');
      } catch {
        textContent = null;
      }
    }

    if (isImage || isPdf) {
      imageBase64 = file.data;
      if (file.mimeType === 'image/png') imageFormat = 'png';
      else if (file.mimeType === 'image/jpeg') imageFormat = 'jpg';
      else if (file.mimeType === 'image/tiff') imageFormat = 'tiff';
      else if (isPdf) imageFormat = 'pdf';
    }

    results.push({
      ref: {
        instrumentNumber: null,
        volume: null,
        page: null,
        documentType: file.description ?? `User upload: ${file.filename}`,
        recordingDate: null,
        grantors: [],
        grantees: [],
        source: 'user-upload',
        url: null,
      },
      textContent,
      imageBase64,
      imageFormat,
      ocrText: null,
      extractedData: null,
      fromUserUpload: true,
    });
  }

  logger.info('UserFiles', `Processed ${results.length} user files: ${results.filter((r) => r.textContent).length} text, ${results.filter((r) => r.imageBase64).length} image/PDF`);
  return results;
}

// ── Direct Property ID Lookup ──────────────────────────────────────────────

async function lookupByPropertyId(
  county: string,
  propertyId: string,
  logger: PipelineLogger,
): Promise<PropertyIdResult | null> {
  const finish = logger.startAttempt({
    layer: 'Stage1-Direct',
    source: 'CAD-Direct',
    method: 'property-id-lookup',
    input: propertyId,
  });

  // Use the BIS config to fetch property detail directly
  const config = BIS_CONFIGS[county.toLowerCase()];
  const baseUrl = config?.baseUrl;
  if (!baseUrl) {
    finish({ status: 'fail', error: `No CAD URL for county: ${county}` });
    return null;
  }

  try {
    const year = new Date().getFullYear();
    // CRITICAL: Bell CAD uses path parameter, not query string — /Property/View/{id}?year={year}
    const url = `${baseUrl}/Property/View/${propertyId}?year=${year}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      finish({ status: 'fail', error: `HTTP ${response.status}` });
      return null;
    }

    const html = await response.text();

    // Extract data from detail page.
    // NOTE: The disclaimer text ("Legal descriptions...for Appraisal District use only")
    // must be filtered out — it matches "Legal Description" but is not property-specific.
    const ownerMatch = html.match(/(?:Owner|Owner\s*Name)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i);

    // BIS table-row pattern: <td>Legal Description</td><td>VALUE</td>
    let legalDescription: string | null = null;
    const bisLegalRow = html.match(
      /<td[^>]*>\s*Legal\s*(?:Description|Descriptions|Desc\.?)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
    );
    if (bisLegalRow) {
      const raw = bisLegalRow[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (raw.length > 5 && !/appraisal district|should be verified|legal purpose/i.test(raw)) {
        legalDescription = raw;
      }
    }
    if (!legalDescription) {
      const legalMatch = html.match(/(?:Legal\s*Description|Legal\s*Desc)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i);
      if (legalMatch) {
        const candidate = legalMatch[1].trim();
        if (!/appraisal district|should be verified|legal purpose/i.test(candidate)) {
          legalDescription = candidate;
        }
      }
    }

    const acreageMatch = html.match(/(?:Acreage|Acres)\s*:?\s*(?:<[^>]*>\s*)*?([\d,.]+)/i);
    const geoIdMatch = html.match(/(?:GEO\s*ID|Geographic\s*ID)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i);
    const addressMatch = html.match(/(?:Situs|Address|Location)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i);

    const ownerName = ownerMatch?.[1]?.trim() ?? null;
    const acreage = acreageMatch ? parseFloat(acreageMatch[1].replace(/,/g, '')) : null;

    if (!ownerName && !legalDescription) {
      finish({ status: 'fail', error: 'Could not extract property data from detail page' });
      return null;
    }

    finish({ status: 'success', dataPointsFound: 1, details: `Owner: ${ownerName}, Legal: ${legalDescription ? 'found' : 'N/A'}` });

    return {
      propertyId,
      geoId: geoIdMatch?.[1]?.trim() ?? null,
      ownerName,
      legalDescription,
      acreage: acreage && !isNaN(acreage) ? acreage : null,
      propertyType: null,
      situsAddress: addressMatch?.[1]?.trim() ?? null,
      source: `${county} CAD (direct)`,
      layer: 'Stage1-Direct',
      matchConfidence: 1.0,
      validationNotes: ['Direct property ID lookup — exact match'],
    };
  } catch (err) {
    finish({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ── Main Pipeline ──────────────────────────────────────────────────────────

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const startTime = Date.now();
  const logger = new PipelineLogger(input.projectId);
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';

  // Build empty result template (used for early returns and crash recovery)
  const emptyResult = (): PipelineResult => ({
    projectId: input.projectId,
    status: 'failed',
    propertyId: null,
    geoId: null,
    ownerName: null,
    legalDescription: null,
    acreage: null,
    documents: [],
    boundary: null,
    validation: null,
    log: logger.getAttempts(),
    duration_ms: Date.now() - startTime,
  });

  if (!anthropicApiKey) {
    logger.error('Pipeline', 'ANTHROPIC_API_KEY is not set');
    return emptyResult();
  }

  // Build one-line header: what we know before touching the network
  const hints: string[] = [];
  if (input.propertyId) hints.push(`ID:${input.propertyId}`);
  if (input.ownerName)  hints.push(`owner:"${input.ownerName}"`);
  if (input.userFiles?.length) hints.push(`${input.userFiles.length} file(s)`);
  logger.info('Pipeline', `${input.county} County, ${input.state} — ${input.address}${hints.length ? ` [${hints.join(', ')}]` : ''}`);

  await updateStatus(input.projectId, 'running', 'Stage 0: Normalizing address…');

  try {
    // ═══════════════════════════════════════════════════════════════════
    // PROCESS USER FILES (if any) — available for all stages
    // ═══════════════════════════════════════════════════════════════════

    let userDocuments: DocumentResult[] = [];
    if (input.userFiles && input.userFiles.length > 0) {
      userDocuments = processUserFiles(input.userFiles, logger);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 0: Address Normalization + County Capability Discovery
    // ═══════════════════════════════════════════════════════════════════

    const normalized = await normalizeAddress(input.address, logger);

    // Warn once if geocoder disagrees with the supplied county
    if (normalized.detectedCounty && normalized.detectedCounty.toLowerCase() !== input.county.toLowerCase()) {
      logger.warn('Stage0', `Geocoder detected county "${normalized.detectedCounty}" — input says "${input.county}" — using input`);
    }

    // County capability summary — computed once, reused for all stage gates.
    // Replaces per-stage hasKofileConfig/hasPlatRepository calls and eliminates
    // "skipping because county X has no Y" noise logs.
    const cadConfig   = BIS_CONFIGS[input.county.toLowerCase()] ?? null;
    const kofile      = hasKofileConfig(input.county);
    const kofileBase  = getKofileBaseUrl(input.county) ?? '';
    const platRepo    = hasPlatRepository(input.county);

    const capParts = [
      cadConfig  ? `CAD:${cadConfig.name}`                       : 'CAD:none',
      kofile     ? `Clerk:Kofile(${kofileBase.replace('https://', '')})` : 'Clerk:none',
      platRepo   ? 'Plat:repo'                                   : null,
    ].filter(Boolean);
    logger.info('Stage0', `${normalized.canonical ?? input.address} — ${input.county} County [${capParts.join(' · ')}]`);

    await updateStatus(input.projectId, 'running', `Stage 1: Searching ${input.county} CAD…`);

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 1: Property Identification
    // ═══════════════════════════════════════════════════════════════════

    let propertyResult: PropertyIdResult | null = null;
    let searchDiagnostics: SearchDiagnostics | undefined;

    // Path A: Direct property ID lookup (user already knows the ID)
    if (input.propertyId) {
      logger.info('Stage1', `Direct ID lookup: ${input.propertyId}`);
      propertyResult = await lookupByPropertyId(input.county, input.propertyId, logger);
    }

    // Path B: Address-based CAD search (tries HTTP → Playwright → Vision OCR layers)
    // Owner name and property ID are passed as options so searchBisCad can use them
    // as fallback search methods internally (owner name tab, property ID tab, etc.).
    if (!propertyResult && normalized.variants.length > 0) {
      const cadResult = await searchBisCad(input.county, normalized, anthropicApiKey, logger, {
        ownerName: input.ownerName,
        propertyId: input.propertyId,
      });
      propertyResult = cadResult.property;
      searchDiagnostics = cadResult.diagnostics;
    }

    if (!propertyResult) {
      if (searchDiagnostics?.siteUnreachable) {
        const cadName = cadConfig?.name ?? `${input.county} CAD`;
        const cadUrl  = cadConfig?.baseUrl ?? 'the county appraisal website';
        logger.warn('Stage1', `⚠ ${cadName} (${cadUrl}) is UNREACHABLE — continuing research with alternative sources`);
        logger.warn('Stage1', `  ↳ Alternatives: ${input.county} County Clerk records${kofile ? ` (${kofileBase})` : ''}, plat repository${platRepo ? ' (available)' : ' (none)'}, user-uploaded documents`);
        if (searchDiagnostics.cadSiteError) {
          logger.warn('Stage1', `  ↳ Error detail: ${searchDiagnostics.cadSiteError}`);
        }
        await updateStatus(input.projectId, 'running', `Stage 1: ${cadName} unreachable — trying clerk records & alternative sources for ${input.address}…`);
      } else if (searchDiagnostics?.cadSiteError) {
        const cadName = cadConfig?.name ?? `${input.county} CAD`;
        logger.warn('Stage1', `⚠ ${cadName} reports a site error — continuing research with alternative sources`);
        logger.warn('Stage1', `  ↳ ${searchDiagnostics.cadSiteError}`);
        await updateStatus(input.projectId, 'running', `Stage 1: ${cadName} site error — trying clerk records for ${input.address}…`);
      } else {
        logger.warn('Stage1', `CAD lookup failed for ${input.address} in ${input.county} County — continuing to clerk search`);
        await updateStatus(input.projectId, 'running', `Stage 1: CAD lookup failed — trying clerk records for ${input.address}…`);
      }
      // Do NOT return early — fall through to Stage 2 so clerk search and AI
      // extraction can still run using input.ownerName or user-supplied files.
    } else {
      logger.info('Stage1', `Found: ${propertyResult.ownerName} · ID ${propertyResult.propertyId} · conf ${propertyResult.matchConfidence.toFixed(2)}${propertyResult.acreage ? ` · ${propertyResult.acreage} ac` : ''}`);
    }

    // ── Bell County Cascading Enrichment ──────────────────────────────────────
    // For Bell County properties, run a multi-wave cascade that:
    //   1. Builds a KnownIdentifiers state from whatever Stage 1 found
    //   2. Follows deed history instrument numbers
    //   3. Detects personal property and pivots to the land account
    //   4. Finds related parcels owned by the same entity
    //   5. Enriches the primary property with all discovered instrument numbers
    //
    // This runs ONLY for Bell County and is non-destructive — if the cascade
    // fails entirely, the pipeline continues with the original Stage 1 result.
    // All state is passed through the knownIds object for Stage 2 to consume.
    let bellKnownIds: ReturnType<typeof createSearchState> | null = null;
    let bellAllProperties: PropertyIdResult[] = [];
    let isPlatted = false; // set during Bell County classification if applicable

    if (input.county.toLowerCase() === 'bell') {
      logger.info('Stage1-Bell', '═══ Bell County Cascade Enrichment ═══');
      try {
        // Seed the cascade state with everything we know so far
        const cascadeState = createSearchState({
          address: input.address,
          propertyId: input.propertyId ?? propertyResult?.propertyId ?? undefined,
          ownerName: input.ownerName ?? propertyResult?.ownerName ?? undefined,
          instrumentNumbers: propertyResult?.instrumentNumbers,
        });

        // Ingest the Stage 1 result (if any) to extract all embedded references
        if (propertyResult) {
          ingestCADResult(cascadeState, propertyResult, logger);
        }
        if (propertyResult?.deedHistory) {
          ingestDeedHistory(cascadeState, propertyResult.deedHistory, logger);
        }

        logger.info('Stage1-Bell',
          `After Stage1 ingest: ${summarizeSearchState(cascadeState)}`);

        // Wave: personal property pivot — find land accounts if BP/P result returned
        const firstTypeCode = (propertyResult?.propertyType ?? '').toUpperCase();
        const resultIsBP = firstTypeCode === 'BP' || firstTypeCode === 'P' ||
          /business personal property/i.test(propertyResult?.legalDescription ?? '');

        if (resultIsBP && propertyResult) {
          logger.info('Stage1-Bell',
            `Personal property account (${propertyResult.propertyId}) — pivoting to land accounts`);
          const landAccounts = await pivotPersonalPropertyToLand(
            propertyResult, cascadeState, logger,
          );
          if (landAccounts.length > 0) {
            for (const r of landAccounts) {
              ingestCADResult(cascadeState, r, logger);
              bellAllProperties.push(r);
            }
            // Replace propertyResult with the best land account
            const best = bellAllProperties[0];
            if (best) {
              propertyResult = best;
              logger.info('Stage1-Bell',
                `BP pivot: using land account ${best.propertyId} ` +
                `owner="${best.ownerName}" type=${best.propertyType}`);
            }
          } else {
            logger.warn('Stage1-Bell',
              'BP pivot found no land accounts — continuing with personal property result');
          }
        }

        // Wave: related parcel search — find other parcels owned by the same entity
        // Only runs if we have a real property result (not BP/P)
        const currentTypeCode = (propertyResult?.propertyType ?? '').toUpperCase();
        const currentIsBP = currentTypeCode === 'BP' || currentTypeCode === 'P';
        if (propertyResult && !currentIsBP && cascadeState.ownerNames.length > 0) {
          const related = await findRelatedBellProperties(
            cascadeState, propertyResult.propertyId, logger,
          );
          for (const r of related) {
            if (!bellAllProperties.find((p) => p.propertyId === r.propertyId)) {
              ingestCADResult(cascadeState, r, logger);
              bellAllProperties.push(r);
            }
          }
          if (related.length > 0) {
            logger.info('Stage1-Bell',
              `Related parcel search: ${related.length} additional account(s) found for ` +
              `"${cascadeState.ownerNames[0]}"`);
          }
        }

        // Enrich the primary property result with ALL instrument numbers discovered
        // across every account (primary + related + deed history).  Stage 2 uses these
        // for the instrument-number search channel.
        if (propertyResult && cascadeState.instrumentNumbers.length > 0) {
          const existingInstrs = new Set(propertyResult.instrumentNumbers ?? []);
          const newInstrs = cascadeState.instrumentNumbers.filter(
            (n) => !existingInstrs.has(n),
          );
          if (newInstrs.length > 0) {
            propertyResult = {
              ...propertyResult,
              instrumentNumbers: [
                ...(propertyResult.instrumentNumbers ?? []),
                ...newInstrs,
              ],
            };
            logger.info('Stage1-Bell',
              `Enriched primary with ${newInstrs.length} new instrument(s): ` +
              `[${newInstrs.slice(0, 5).join(', ')}${newInstrs.length > 5 ? '…' : ''}]`);
          }
        }

        // Store the cascade state for Stage 2 subdivision search
        bellKnownIds = cascadeState;

        logger.info('Stage1-Bell',
          `Cascade complete: primary=${propertyResult?.propertyId ?? 'none'} ` +
          `related=${bellAllProperties.length} ` +
          `total_instruments=${cascadeState.instrumentNumbers.length} ` +
          `subdivisions=${cascadeState.subdivisionNames.length}`);

        // Log Bell County property classification for operators
        if (propertyResult) {
          const classification = classifyBellProperty(
            propertyResult.propertyType,
            propertyResult.legalDescription,
            propertyResult.ownerName,
          );
          isPlatted = classification.isPlatted;
          logger.info('Stage1-Bell',
            `Classification: type=${classification.typeCode} ` +
            `cat=${classification.landCategory} ` +
            `isPlatted=${classification.isPlatted} ` +
            `isRural=${classification.isRuralAcreage} ` +
            `strategy="${classification.strategyRationale}"`);
          if (classification.subdivisionName) {
            logger.info('Stage1-Bell',
              `  → Subdivision: "${classification.subdivisionName}"`);
          }
          if (classification.abstractSurveyName) {
            logger.info('Stage1-Bell',
              `  → Abstract Survey: "${classification.abstractSurveyName}"`);
          }
        }
      } catch (cascadeErr) {
        // Cascade failures are non-fatal — log and continue
        const msg = cascadeErr instanceof Error ? cascadeErr.message : String(cascadeErr);
        logger.warn('Stage1-Bell',
          `Cascade enrichment error (non-fatal): ${msg} — continuing with Stage 1 result`);
      }
    }

    // ── Detect personal property result (Type P / "BUSINESS PERSONAL PROPERTY") ──
    // Bell CAD returns the business tenant's equipment record (Type P) when the
    // address belongs to a commercial property. Real land records (Type R) may
    // exist for the same address under a different owner name.
    // Example: 3779 FM 436 → ID 498826 "STARR SURVEYING" Type P — the land is
    //          owned by "ASH FAMILY TRUST" under IDs 524311-524316.
    const isPersonalProperty = propertyResult && (
      propertyResult.propertyType?.toUpperCase() === 'P' ||
      /^BUSINESS\s+PERSONAL\s+PROPERTY/i.test(propertyResult.legalDescription ?? '') ||
      /personal\s+property/i.test(propertyResult.propertyType ?? '')
    );

    // Preserve the Map ID from the Type P record before clearing it.
    // Map ID is a geographic grid reference (e.g., "61B01") — it anchors the
    // address to a physical map sheet. Owner search results with the same Map ID
    // prefix are almost certainly the geographically adjacent real property.
    const typePMapId: string | null = (isPersonalProperty && propertyResult?.mapId)
      ? propertyResult.mapId
      : null;

    if (isPersonalProperty && propertyResult) {
      const mapIdHint = typePMapId ? ` (Map ID ${typePMapId})` : '';
      logger.warn('Stage1',
        `⚠ Address matched PERSONAL PROPERTY record (ID ${propertyResult.propertyId}, ` +
        `owner "${propertyResult.ownerName}")${mapIdHint} — this is a business equipment record, not land. ` +
        `Switching to owner-name-based document search. ` +
        `Tip: provide input.ownerName (e.g. the landlord name) for more precise results.`);
      // Clear the personal property result so document search falls through to owner/clerk paths.
      // The instrument numbers from a Type P record are not deed references for the land.
      propertyResult = null;
    }

    // If we detected Type P and have an ownerName, try a second Bell CAD "By Owner"
    // pass to find the real land record. searchBisCad already does this automatically
    // when all address results are Type P (bis-cad.ts searchBisCadBrowserLayer), but
    // only if ownerName is provided in options. Since stage 1 already called searchBisCad
    // above, and we have propertyResult = null at this point, we don't need a second call
    // here — the work was done inside searchBisCad if ownerName was provided. The 
    // typePMapId is preserved for filtering in Path B2 below.

    await updateStatus(
      input.projectId, 'running',
      `Stage 2: Retrieving documents${propertyResult ? ` for ${propertyResult.ownerName}` : input.ownerName ? ` for "${input.ownerName}"` : ''}…`,
      { propertyId: propertyResult?.propertyId, ownerName: propertyResult?.ownerName ?? input.ownerName },
    );

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 2: Document Retrieval
    // ═══════════════════════════════════════════════════════════════════

    let documents: DocumentResult[] = [];

    const legalDesc = propertyResult?.legalDescription ?? '';
    const deedRefs  = parseDeedReferences(legalDesc);

    // Merge instrument numbers from both sources: legal description text +
    // deed history table rows from the CAD detail page.
    const allInstrumentNumbers = Array.from(new Set([
      ...deedRefs.instrumentNumbers,
      ...(propertyResult?.instrumentNumbers ?? []),
    ]));

    let instrumentSearchSucceeded = false;

    // ── Path A: Instrument number search (fast, precise, no SPA) ─────────
    if (allInstrumentNumbers.length > 0 && kofile) {
      const docsAdded: string[] = [];
      const instrErrors: string[] = [];

      for (const instrNum of allInstrumentNumbers.slice(0, 5)) {
        // Use more expected pages for plats — large multi-lot plats can have 10+ pages
        const expectedPages = /plat/i.test(legalDesc) ? 10 : 2;
        try {
          const pages = await fetchDocumentImages(instrNum, expectedPages, logger);
          if (pages.length > 0) {
            const docResult: DocumentResult = {
              ref: {
                instrumentNumber: instrNum,
                volume: null, page: null,
                documentType: 'Deed (instrument search)',
                recordingDate: null, grantors: [], grantees: [],
                source: `${input.county.charAt(0).toUpperCase() + input.county.slice(1)} County Clerk`,
                url: `${kofileBase}/doc/${instrNum}/details`,
              },
              textContent: null, pages, ocrText: null, extractedData: null,
            };
            documents.push(docResult);
            instrumentSearchSucceeded = true;
            docsAdded.push(`${instrNum}(${pages.length}pp)`);
            // Bundle pages → PDF non-fatally
            bundleAndUploadPages(pages, input.projectId, instrNum, docResult.ref.documentType)
              .then(url => { if (url) docResult.pagesPdfUrl = url; })
              .catch(() => undefined);
          }
        } catch (imgErr) {
          instrErrors.push(`${instrNum}: ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`);
        }
      }

      if (docsAdded.length > 0) logger.info('Stage2', `Instruments: ${docsAdded.join(', ')}`);
      if (instrErrors.length > 0) logger.warn('Stage2', `Instrument errors: ${instrErrors.join(' | ')}`);
    }

    // ── Path B: County plat repository (free direct-download PDFs) ───────
    // Primary: extract subdivision name from legal description.
    // Enriched: when Bell County cascade found subdivision names, try all of them.
    // Fallback: when CAD is unreachable, use owner name as subdivision hint
    // (e.g. "ASH FAMILY TRUST" finds "ASH FAMILY TRUST 12.358 ACRE ADDITION").
    if (platRepo) {
      const subdivisionFromLegal = legalDesc ? extractSubdivisionName(legalDesc) : null;

      // Build the full list of subdivision names to try:
      //   1. From legal description (most precise)
      //   2. From Bell County cascade enrichment (may include related-parcel names)
      //   3. From owner name fallback (when CAD unreachable)
      const subdivisionCandidates: string[] = [];
      if (subdivisionFromLegal) subdivisionCandidates.push(subdivisionFromLegal);
      if (bellKnownIds) {
        for (const s of bellKnownIds.subdivisionNames) {
          if (!subdivisionCandidates.includes(s)) subdivisionCandidates.push(s);
        }
      }
      if (!propertyResult && input.ownerName) {
        subdivisionCandidates.push(input.ownerName.trim());
      }

      if (subdivisionCandidates.length === 0) {
        if (!legalDesc && !input.ownerName) {
          logger.warn('Stage2A', 'Plat repo: no legal description or owner name — skipping plat search');
        }
      } else {
        // Try each subdivision candidate until we find a plat (stop at first hit)
        for (const subdivisionName of subdivisionCandidates) {
          if (documents.some((d) => d.ref.documentType === 'Plat (county repository)')) break;
          try {
            logger.info('Stage2A', `Plat repo: searching for "${subdivisionName}"`);
            const platResult = await fetchBestMatchingPlat(input.county, subdivisionName, logger, anthropicApiKey);
            if (platResult) {
              logger.info('Stage2A', `Plat: "${platResult.name}" (${platResult.source})`);
              documents.push({
                ref: {
                  instrumentNumber: null, volume: null, page: null,
                  documentType: 'Plat (county repository)',
                  recordingDate: null, grantors: [], grantees: [],
                  source: platResult.source, url: platResult.url,
                },
                textContent: null, pages: [],
                imageFormat: platResult.mimeType === 'image/png' ? 'png' : 'pdf',
                imageBase64: platResult.base64,
                pagesPdfUrl: platResult.url,
                ocrText: null, extractedData: null,
              });
            }
          } catch (platErr) {
            logger.warn('Stage2A',
              `Plat repo "${subdivisionName}": ` +
              `${platErr instanceof Error ? platErr.message : String(platErr)}`);
          }
        }
      }
    }

    // ── Path B2: Bell County Clerk direct plat+deed search ───────────────
    // Runs when:
    //   (a) CAD was unreachable/errored, OR
    //   (b) CAD returned only personal property (Type P) — owner name unknown
    // Searches Bell County Clerk by owner/subdivision name using the proven
    // quickSearch approach (8s SPA wait + response interceptor + signed URL download).
    // Example: ownerName="ASH FAMILY TRUST" → plat 2023032044, deed 2010043440.
    const ownerNameForPlatSearch = input.ownerName ?? propertyResult?.ownerName ?? null;
    const cadWasUnreachable = !propertyResult && (
      searchDiagnostics?.siteUnreachable || !!searchDiagnostics?.cadSiteError || isPersonalProperty
    );

    if (!instrumentSearchSucceeded && cadWasUnreachable && ownerNameForPlatSearch && kofile &&
        input.county.toLowerCase() === 'bell') {
      const mapHint = typePMapId ? ` (Type P Map ID: ${typePMapId})` : '';
      logger.info('Stage2B',
        `CAD unreachable/personal-property${mapHint} — searching Bell County Clerk directly for plat+deed: "${ownerNameForPlatSearch}"`);
      try {
        const { platInstruments, deedInstruments } =
          await searchBellClerkOwnerForPlatDeed(ownerNameForPlatSearch, logger);

        // Retrieve page images for each instrument (plats get 3 expected pages)
        const instrToFetch: Array<{ instrNum: string; docType: string }> = [
          ...platInstruments.slice(0, 2).map(n => ({ instrNum: n, docType: 'Final Plat' })),
          ...deedInstruments.slice(0, 3).map(n => ({ instrNum: n, docType: 'Warranty Deed' })),
        ];

        for (const { instrNum, docType } of instrToFetch) {
          try {
            const isPlat = /plat/i.test(docType);
            const pages = await fetchDocumentImages(instrNum, isPlat ? 3 : 2, logger);
            if (pages.length > 0) {
              const docResult: DocumentResult = {
                ref: {
                  instrumentNumber: instrNum,
                  volume: null, page: null,
                  documentType: docType,
                  recordingDate: null, grantors: [], grantees: [],
                  source: 'Bell County Clerk PublicSearch',
                  url: `${kofileBase}/doc/${instrNum}/details`,
                },
                textContent: null, pages,
                ocrText: null, extractedData: null,
              };
              documents.push(docResult);
              instrumentSearchSucceeded = true;
              bundleAndUploadPages(pages, input.projectId, instrNum, docType)
                .then(url => { if (url) docResult.pagesPdfUrl = url; })
                .catch(() => undefined);
              logger.info('Stage2B', `Retrieved ${pages.length} page(s) for ${docType} ${instrNum}`);
            }
          } catch (imgErr) {
            logger.warn('Stage2B',
              `Could not get images for ${instrNum}: ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`);
          }
        }
      } catch (b2Err) {
        logger.warn('Stage2B',
          `Clerk plat+deed search failed: ${b2Err instanceof Error ? b2Err.message : String(b2Err)}`);
      }
    }

    // ── Path B3: Bell County Clerk search by discovered subdivision/plat names ──
    // Triggered for Bell County when Stage 1 or the cascade discovered subdivision
    // names. This finds ALL historical records (deeds, plats, easements, right-of-way)
    // for that subdivision — fulfilling the requirement that "if the research process
    // captures the name of the plat of subdivision... it needs to search bell.tx.publicsearch.us".
    if (kofile && input.county.toLowerCase() === 'bell') {
      // Build list of subdivision names from legal description + cascade enrichment
      const subdivisionNamesForClerk: string[] = [];
      const subdivisionFromLegal = legalDesc ? extractSubdivisionName(legalDesc) : null;
      if (subdivisionFromLegal) subdivisionNamesForClerk.push(subdivisionFromLegal);
      if (bellKnownIds) {
        for (const s of bellKnownIds.subdivisionNames) {
          if (!subdivisionNamesForClerk.includes(s)) subdivisionNamesForClerk.push(s);
        }
      }

      if (subdivisionNamesForClerk.length > 0) {
        for (const subdivName of subdivisionNamesForClerk.slice(0, 3)) {
          try {
            logger.info('Stage2C',
              `Bell County Clerk search by subdivision name: "${subdivName}"`);
            const { platInstruments, deedInstruments, allDocuments } =
              await searchBellClerkOwnerForPlatDeed(subdivName, logger);

            // Track which instruments we already have to avoid duplicates
            const existingInstrNums = new Set(
              documents.map((d) => d.ref.instrumentNumber).filter(Boolean),
            );

            const newInstrNums = [...platInstruments, ...deedInstruments].filter(
              (n) => !existingInstrNums.has(n),
            );

            for (const instrNum of newInstrNums.slice(0, 5)) {
              try {
                const isPlat = platInstruments.includes(instrNum);
                // Fetch more pages for plats (large plats may have many pages)
                const expectedPgs = isPlat ? 10 : 2;
                const pages = await fetchDocumentImages(instrNum, expectedPgs, logger);
                if (pages.length > 0) {
                  const docType = isPlat ? 'Final Plat' : 'Warranty Deed';
                  const docResult: DocumentResult = {
                    ref: {
                      instrumentNumber: instrNum,
                      volume: null, page: null,
                      documentType: docType,
                      recordingDate: allDocuments.find((d) => d.instrumentNumber === instrNum)?.recordingDate ?? null,
                      grantors: allDocuments.find((d) => d.instrumentNumber === instrNum)?.grantors ?? [],
                      grantees: allDocuments.find((d) => d.instrumentNumber === instrNum)?.grantees ?? [],
                      source: 'Bell County Clerk PublicSearch',
                      url: `${kofileBase}/doc/${instrNum}/details`,
                    },
                    textContent: null, pages, ocrText: null, extractedData: null,
                  };
                  documents.push(docResult);
                  instrumentSearchSucceeded = true;
                  bundleAndUploadPages(pages, input.projectId, instrNum, docType)
                    .then(url => { if (url) docResult.pagesPdfUrl = url; })
                    .catch(() => undefined);
                  logger.info('Stage2C',
                    `Retrieved ${pages.length} page(s) for ${docType} ${instrNum} (${subdivName})`);
                }
              } catch (imgErr) {
                logger.warn('Stage2C',
                  `Could not get images for ${instrNum}: ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`);
              }
            }

            if (allDocuments.length > 0) {
              logger.info('Stage2C',
                `Subdivision "${subdivName}": ${allDocuments.length} total records ` +
                `(${platInstruments.length} plat, ${deedInstruments.length} deed)`);
            }
          } catch (b3Err) {
            logger.warn('Stage2C',
              `Clerk subdivision search "${subdivName}" failed: ${b3Err instanceof Error ? b3Err.message : String(b3Err)}`);
          }
        }
      }
    }

    // ── Path C: Owner-name SPA search (fallback) ──────────────────────────
    const ownerForClerk = propertyResult?.ownerName ?? input.ownerName ?? null;

    if (!instrumentSearchSucceeded && ownerForClerk) {
      let ownerDocs: DocumentResult[] = [];
      try {
        ownerDocs = await searchClerkRecords(input.county, ownerForClerk, logger);
      } catch (clerkErr) {
        logger.warn('Stage2', `Owner-name search failed: ${clerkErr instanceof Error ? clerkErr.message : String(clerkErr)}`);
      }

      if (ownerDocs.length > 0 && kofile) {
        let totalPages = 0;
        const imgErrors: string[] = [];
        for (const doc of ownerDocs.slice(0, 5)) {
          if (!doc.ref.instrumentNumber) continue;
          try {
            const isPlat = /plat/i.test(doc.ref.documentType);
            const pages = await fetchDocumentImages(doc.ref.instrumentNumber, isPlat ? 10 : 2, logger);
            if (pages.length > 0) {
              doc.pages = pages;
              totalPages += pages.length;
              bundleAndUploadPages(pages, input.projectId, doc.ref.instrumentNumber, doc.ref.documentType)
                .then(url => { if (url) doc.pagesPdfUrl = url; })
                .catch(() => undefined);
            }
          } catch (e) { imgErrors.push(`${doc.ref.instrumentNumber}: ${e instanceof Error ? e.message : String(e)}`); }
        }
        const imgNote = totalPages > 0 ? `${totalPages}pp` : '0pp';
        logger.info('Stage2', `Owner-name: ${ownerDocs.length} doc(s), ${imgNote}${imgErrors.length ? ` [${imgErrors.length} img error(s)]` : ''}`);
      } else if (ownerDocs.length > 0) {
        logger.info('Stage2', `Owner-name: ${ownerDocs.length} doc(s) (text only)`);
      } else {
        logger.warn('Stage2', `No documents found for "${ownerForClerk}"`);
      }
      documents = [...documents, ...ownerDocs];
    } else if (!instrumentSearchSucceeded && !ownerForClerk) {
      // No owner name is available — clerk SPA search cannot proceed.
      // Log with context so operators know what to provide to unblock research.
      if (searchDiagnostics?.siteUnreachable) {
        logger.warn('Stage2',
          `CAD was unreachable and no owner name provided — clerk name search skipped. ` +
          `Provide owner name via input.ownerName to enable clerk record search.`);
      } else {
        logger.warn('Stage2', 'No instruments and no owner name — document retrieval skipped');
      }
    }

    // Merge user-uploaded documents
    if (userDocuments.length > 0) documents = [...documents, ...userDocuments];

    const totalPages = documents.reduce((n, d) => n + (d.pages?.length ?? 0), 0);
    const docSummary = `${documents.length} doc(s)${totalPages > 0 ? `, ${totalPages} pages` : ''}`;
    logger.info('Stage2', `Total: ${docSummary}`);
    await updateStatus(input.projectId, 'running', `Stage 3: AI extraction — ${docSummary}…`);

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 3: AI Extraction
    // ═══════════════════════════════════════════════════════════════════

    const { documents: processedDocs, boundary: rawBoundary } = await extractDocuments(
      documents,
      propertyResult?.legalDescription ?? null,
      anthropicApiKey,
      logger,
    );

    // ── Stage 3C: Plat-based extraction (platted subdivisions) ───────────────
    // If the property is a platted subdivision AND all extractions returned only
    // lot_and_block references (no metes-and-bounds calls), route to a
    // plat-specific Vision extraction to get the actual lot boundary from the
    // plat drawing.  This covers cases where deeds reference "Lot 24 Block 8"
    // but the geometry lives in the recorded plat image, not the deed text.
    let boundary = rawBoundary;
    const needsPlatExtraction = isPlatted && (
      boundary === null ||
      (boundary.type === 'lot_and_block' && boundary.calls.length === 0)
    );

    if (needsPlatExtraction) {
      // Find the lot/block from the best extraction we have
      const lotBlockSource = rawBoundary?.lotBlock
        ?? processedDocs
             .map(d => d.extractedData?.lotBlock)
             .find(lb => lb?.lot && lb.block);

      if (lotBlockSource?.lot && lotBlockSource.block) {
        const lot          = lotBlockSource.lot;
        const block        = lotBlockSource.block;
        // Prefer the subdivision name from the extracted lot/block; fall back to the first
        // segment of the CAD legal description (strips ", Lot N Block M …" trailing detail).
        const subdivision  = lotBlockSource.subdivision || propertyResult?.legalDescription?.replace(/,.*$/, '').trim() || 'Unknown Subdivision';

        logger.info('Stage3', `All documents are lot_and_block (0 boundary calls) — property is platted`);
        logger.info('Stage3', `Routing to plat-based extraction for Lot ${lot}, Block ${block} from plat document`);

        // Find plat document: prefer 'Final Plat', 'Plat', or any doc whose type includes 'plat'
        const platDocForExtraction = processedDocs.find(d =>
          (d.imageBase64 || (d.pageScreenshots && d.pageScreenshots.length > 0)) &&
          /plat/i.test(d.ref.documentType)
        ) ?? processedDocs.find(d =>
          d.imageBase64 || (d.pageScreenshots && d.pageScreenshots.length > 0)
        );

        if (platDocForExtraction) {
          logger.info('Stage3-Plat', `Sending plat image to Claude Vision with lot-specific prompt…`);
          try {
            const platBoundary = await extractPlatBoundary(
              platDocForExtraction,
              lot,
              block,
              subdivision,
              anthropicApiKey,
              logger,
            );
            if (platBoundary && platBoundary.calls.length > 0) {
              boundary = platBoundary;
              logger.info('Stage3-Plat', `Extracted ${boundary.calls.length} boundary calls from plat for Lot ${lot}, Block ${block} (confidence: ${boundary.confidence})`);
            } else {
              logger.warn('Stage3-Plat', `Plat extraction returned no boundary calls — falling back to lot_and_block result`);
            }
          } catch (platErr) {
            logger.warn('Stage3-Plat', `Plat extraction failed (non-fatal): ${platErr instanceof Error ? platErr.message : String(platErr)}`);
          }
        } else {
          logger.warn('Stage3', `No plat document with image available — cannot attempt plat-based extraction`);
        }
      }
    }

    const boundaryNote = boundary
      ? `${boundary.type}, ${boundary.calls.length} calls`
      : 'no boundary';
    logger.info('Stage3', `Extraction: ${boundaryNote}`);
    await updateStatus(input.projectId, 'running', `Stage 3.5: Geometric reconciliation…`);

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 3.5: Geometric Reconciliation
    // Visual geometry analysis of the plat image vs OCR text extraction.
    // Identifies watermark-obscured digit conflicts (e.g. the L4 N86°/N36°/N56° case).
    // Only runs when a plat document with an image is available.
    // ═══════════════════════════════════════════════════════════════════

    logger.info('Stage3.5', '═══ STAGE 3.5: Geometric Reconciliation ═══');

    // Find the best plat image document (prefer plats, then surveys, then any image)
    const platDoc = processedDocs.find(d =>
      d.imageBase64 && d.imageFormat &&
      (d.ref.documentType.toLowerCase().includes('plat') ||
       d.ref.documentType.toLowerCase().includes('survey'))
    ) ?? processedDocs.find(d => d.imageBase64 && d.imageFormat);

    let reconciliation: import('../types/index.js').PipelineResult['reconciliation'] = undefined;

    if (platDoc?.imageBase64 && platDoc.imageFormat && platDoc.imageFormat !== 'pdf') {
      // PDFs use Claude's 'document' source type and are handled in Stage3/ai-extraction.
      // runGeoReconcile only accepts rasterised images (image/png | image/jpeg).
      const mediaType = (
        platDoc.imageFormat === 'jpg' ? 'image/jpeg' :
        'image/png'
      ) as 'image/png' | 'image/jpeg';
      try {
        reconciliation = await runGeoReconcile(
          boundary,
          platDoc.imageBase64,
          mediaType,
          anthropicApiKey,
          logger,
          platDoc.ref.instrumentNumber ?? platDoc.ref.documentType,
        );
        logger.info('Stage3.5',
          `Reconciliation: ${reconciliation.agreementCount} confirmed, ` +
          `${reconciliation.conflictCount} conflicts, ` +
          `${reconciliation.overallAgreementPct}% agreement`);
      } catch (err) {
        logger.warn('Stage3.5', `Geometric reconciliation failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.info('Stage3.5', 'No plat image available — skipping geometric reconciliation');
    }

    await updateStatus(input.projectId, 'running', 'Stage 4: Validating…');

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 4: Validation
    // ═══════════════════════════════════════════════════════════════════

    logger.info('Stage4', '═══ STAGE 4: Validation ═══');
    const validation = validateBoundary(boundary, propertyResult?.acreage ?? null, logger);
    logger.info('Stage4', `Quality: ${validation.overallQuality}, Flags: ${validation.flags.length}`);

    // ═══════════════════════════════════════════════════════════════════
    // Final Result
    // ═══════════════════════════════════════════════════════════════════

    let status: PipelineResult['status'] = 'failed';
    if (boundary && boundary.calls.length > 0 && validation.overallQuality !== 'failed') {
      status = (validation.overallQuality === 'excellent' || validation.overallQuality === 'good') ? 'complete' : 'partial';
    } else if (boundary && (boundary.type === 'lot_and_block' || boundary.type === 'reference_only')) {
      status = 'partial';
    } else if (propertyResult?.propertyId) {
      status = 'partial';
    } else if (processedDocs.length > 0 || userDocuments.length > 0) {
      // CAD lookup failed but documents were found via clerk search or user upload
      status = 'partial';
    }

    const duration_ms = Date.now() - startTime;
    logger.info('Pipeline', `Pipeline ${status.toUpperCase()} in ${(duration_ms / 1000).toFixed(1)}s`);

    // Build human-readable failure/warning reason for the frontend.
    // Shown for 'failed' status always; also surfaced for 'partial' when the CAD
    // was unreachable so operators know to retry once the site is back up.
    let failureReason: string | undefined;
    if (searchDiagnostics?.siteUnreachable) {
      const cadName = cadConfig?.name ?? `${input.county} CAD`;
      const cadUrl  = cadConfig?.baseUrl ?? 'the county appraisal website';
      const altSources: string[] = [];
      if (kofile) altSources.push(`${input.county} County Clerk (${kofileBase})`);
      if (platRepo) altSources.push('county plat repository');
      const altNote = altSources.length > 0
        ? ` Research continued using: ${altSources.join(', ')}.`
        : '';
      failureReason = `${cadName} (${cadUrl}) was unreachable during this search.${altNote} ` +
        `Please verify the site is operational and retry for complete results.`;
    } else if (status === 'failed') {
      if (searchDiagnostics?.cadSiteError) {
        const cadName = cadConfig?.name ?? `${input.county} CAD`;
        const cadUrl  = cadConfig?.baseUrl ?? 'the county appraisal website';
        failureReason = `${cadName} is experiencing a temporary data access issue — the search could not be completed. ` +
          `Please visit ${cadUrl} to verify the site is operational, then retry your search.`;
      } else if (!propertyResult && searchDiagnostics && searchDiagnostics.variantsTried.length > 0) {
        const cadName = cadConfig?.name ?? `${input.county} CAD`;
        const cadUrl  = cadConfig?.baseUrl ?? 'the county appraisal website';
        failureReason = `Property not found after trying ${searchDiagnostics.variantsTried.length} address variants on ${cadName}. ` +
          `The property may be indexed differently (e.g., by legal description or owner name instead of street address). ` +
          `Try searching manually at ${cadUrl} to find how the property is listed.`;
      }
    }

    const result: PipelineResult = {
      projectId: input.projectId,
      status,
      propertyId: propertyResult?.propertyId ?? null,
      geoId: propertyResult?.geoId ?? null,
      ownerName: propertyResult?.ownerName ?? null,
      legalDescription: propertyResult?.legalDescription ?? null,
      acreage: propertyResult?.acreage ?? null,
      documents: processedDocs,
      boundary,
      validation,
      reconciliation,
      log: logger.getAttempts(),
      duration_ms,
      searchDiagnostics,
      failureReason,
    };

    await updateStatus(input.projectId, status, `Pipeline ${status} in ${(duration_ms / 1000).toFixed(1)}s — Quality: ${validation.overallQuality}`, {
      propertyId: propertyResult?.propertyId,
      ownerName: propertyResult?.ownerName,
      quality: validation.overallQuality,
      duration_ms,
    });

    return result;

  } catch (err) {
    // Pipeline crash — capture logs before cleanup
    const duration_ms = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Pipeline', `CRASH: ${errMsg}`, err);

    await updateStatus(input.projectId, 'failed', `Pipeline crashed: ${errMsg}`);

    const result = emptyResult();
    result.log = logger.getAttempts(); // Preserve all diagnostic logs
    result.duration_ms = duration_ms;
    return result;
  }
}

/** Alias for runPipeline — used by newer pipeline orchestration code. */
export { runPipeline as runResearchPipeline };
