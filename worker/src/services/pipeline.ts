// worker/src/services/pipeline.ts — Main 4-stage pipeline orchestrator
// Coordinates: Stage 0 (normalize) → Stage 1 (CAD) → Stage 2 (Clerk) → Stage 3 (AI) → Stage 4 (Validate)
// Supports: direct property ID lookup, owner name search, user file uploads.

import type { PipelineInput, PipelineResult, DocumentResult, UserFile, PropertyIdResult, SearchDiagnostics } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';
import { normalizeAddress } from './address-utils.js';
import { searchBisCad, BIS_CONFIGS } from './bis-cad.js';
import { searchClerkRecords, fetchDocumentImages, hasKofileConfig, getKofileBaseUrl, searchSuperSearch, searchClerkByAddress, searchClerkForPlats } from './bell-clerk.js';
import { extractDocuments } from './ai-extraction.js';
import { validateBoundary } from './validation.js';
import { runGeoReconcile } from './geo-reconcile.js';
import { bundleAndUploadPages } from './pages-to-pdf.js';
import { extractSubdivisionName, fetchBestMatchingPlat, hasPlatRepository } from './county-plats.js';

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
      } catch (decodeErr) {
        logger.warn('UserFiles', `Failed to decode text from ${file.filename}: ${decodeErr instanceof Error ? decodeErr.message : String(decodeErr)}`);
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

    const stage0Start = Date.now();
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
    logger.info('Stage0', `${normalized.canonical ?? input.address} — ${input.county} County [${capParts.join(' · ')}] (${Date.now() - stage0Start}ms)`);

    // Log county-specific capabilities for transparency
    if (cadConfig) {
      logger.info('Stage0', `Using ${cadConfig.name} for property lookups — ${input.county} County-specific CAD system detected`);
    }
    if (kofile) {
      logger.info('Stage0', `${input.county} County clerk records available via Kofile — will search for deeds, plats, and instruments`);
    }
    if (!cadConfig && !kofile) {
      logger.warn('Stage0', `No county-specific services configured for ${input.county} County — using generic search methods only`);
    }

    await updateStatus(input.projectId, 'running', `Stage 1: Searching ${input.county} CAD…`);
    const stage1Start = Date.now();

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
      logger.warn('Stage1', `CAD lookup failed for ${input.address} in ${input.county} County — continuing to clerk search`);
      await updateStatus(input.projectId, 'running', `Stage 1: CAD lookup failed — trying clerk records for ${input.address}…`);
      // Do NOT return early — fall through to Stage 2 so clerk search and AI
      // extraction can still run using input.ownerName or user-supplied files.
    } else {
      logger.info('Stage1', `Found: ${propertyResult.ownerName} · ID ${propertyResult.propertyId} · conf ${propertyResult.matchConfidence.toFixed(2)}${propertyResult.acreage ? ` · ${propertyResult.acreage} ac` : ''}`);
    }
    logger.info('Stage1', `Stage 1 completed in ${Date.now() - stage1Start}ms`);

    const stage2Start = Date.now();
    await updateStatus(input.projectId, 'running', `Stage 2: Retrieving documents${propertyResult ? ` for ${propertyResult.ownerName}` : ''}…`, {
      propertyId: propertyResult?.propertyId,
      ownerName: propertyResult?.ownerName,
    });

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
      const MAX_INSTRUMENTS = 10;
      const instrToFetch = allInstrumentNumbers.slice(0, MAX_INSTRUMENTS);
      if (allInstrumentNumbers.length > MAX_INSTRUMENTS) {
        logger.warn('Stage2', `Found ${allInstrumentNumbers.length} instrument numbers — capping at ${MAX_INSTRUMENTS} (dropped ${allInstrumentNumbers.length - MAX_INSTRUMENTS})`);
      }

      // Fetch documents in parallel (batches of 3 to avoid overloading)
      const BATCH_SIZE = 3;
      const docsAdded: string[] = [];
      const instrErrors: string[] = [];

      for (let batch = 0; batch < instrToFetch.length; batch += BATCH_SIZE) {
        const batchItems = instrToFetch.slice(batch, batch + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batchItems.map(async (instrNum) => {
            const expectedPages = /plat/i.test(legalDesc) ? 3 : 2;
            const fetchStart = Date.now();
            const pages = await fetchDocumentImages(instrNum, expectedPages, logger);
            const fetchDuration = Date.now() - fetchStart;
            logger.info('Stage2', `Fetched ${instrNum}: ${pages.length} pages in ${fetchDuration}ms`);
            return { instrNum, pages };
          }),
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value.pages.length > 0) {
            const { instrNum, pages } = result.value;
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
            // Bundle pages → PDF non-fatally but LOG failures
            bundleAndUploadPages(pages, input.projectId, instrNum, docResult.ref.documentType)
              .then(url => {
                if (url) {
                  docResult.pagesPdfUrl = url;
                  logger.info('Stage2-PDF', `Bundled ${pages.length} pages for ${instrNum} → ${url.substring(0, 80)}`);
                }
              })
              .catch((pdfErr) => {
                logger.warn('Stage2-PDF', `PDF bundling failed for ${instrNum}: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`);
              });
          } else if (result.status === 'rejected') {
            const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
            instrErrors.push(errMsg);
          }
        }
      }

      if (docsAdded.length > 0) logger.info('Stage2', `Instruments: ${docsAdded.join(', ')}`);
      if (instrErrors.length > 0) logger.warn('Stage2', `Instrument errors: ${instrErrors.join(' | ')}`);
    }

    // ── Path B: County plat repository (free direct-download PDFs) ───────
    if (platRepo && legalDesc) {
      const subdivisionName = extractSubdivisionName(legalDesc);
      if (subdivisionName) {
        try {
          const platResult = await fetchBestMatchingPlat(input.county, subdivisionName, logger);
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
          logger.warn('Stage2A', `Plat repo: ${platErr instanceof Error ? platErr.message : String(platErr)}`);
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
        const docsToFetch = ownerDocs.slice(0, 10).filter(d => d.ref.instrumentNumber);
        if (ownerDocs.length > 10) {
          logger.warn('Stage2', `Owner search returned ${ownerDocs.length} docs — capping image fetch at 10`);
        }

        // Parallel fetch in batches of 3
        const BATCH_SIZE = 3;
        for (let batch = 0; batch < docsToFetch.length; batch += BATCH_SIZE) {
          const batchItems = docsToFetch.slice(batch, batch + BATCH_SIZE);
          const batchResults = await Promise.allSettled(
            batchItems.map(async (doc) => {
              const fetchStart = Date.now();
              const pages = await fetchDocumentImages(doc.ref.instrumentNumber!, /plat/i.test(doc.ref.documentType) ? 3 : 2, logger);
              logger.info('Stage2', `Fetched ${doc.ref.instrumentNumber}: ${pages.length} pages in ${Date.now() - fetchStart}ms`);
              return { doc, pages };
            }),
          );

          for (const result of batchResults) {
            if (result.status === 'fulfilled' && result.value.pages.length > 0) {
              const { doc, pages } = result.value;
              doc.pages = pages;
              totalPages += pages.length;
              bundleAndUploadPages(pages, input.projectId, doc.ref.instrumentNumber!, doc.ref.documentType)
                .then(url => {
                  if (url) {
                    doc.pagesPdfUrl = url;
                    logger.info('Stage2-PDF', `Bundled ${pages.length} pages for ${doc.ref.instrumentNumber} → ${url.substring(0, 80)}`);
                  }
                })
                .catch((pdfErr) => {
                  logger.warn('Stage2-PDF', `PDF bundling failed for ${doc.ref.instrumentNumber}: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`);
                });
            } else if (result.status === 'rejected') {
              imgErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
            }
          }
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
      logger.warn('Stage2', 'No instruments and no owner name — document retrieval skipped');
    }

    // ── Path D: SUPERSEARCH fallback (full-text OCR search) ──────────────
    // If no documents found yet, try SUPERSEARCH with the legal description.
    // SUPERSEARCH searches inside scanned document text, not just metadata.
    if (documents.length === 0 && legalDesc && kofile) {
      logger.info('Stage2-SS', 'No documents from owner/instrument search — trying SUPERSEARCH with legal description');
      // Extract the most useful search terms from legal description
      // (subdivision name + lot/block is usually the best query)
      const subdivName = extractSubdivisionName(legalDesc);
      const ssQuery = subdivName || legalDesc.substring(0, 120);
      try {
        const ssDocs = await searchSuperSearch(input.county, ssQuery, logger);
        if (ssDocs.length > 0) {
          logger.info('Stage2-SS', `SUPERSEARCH found ${ssDocs.length} documents for "${ssQuery}"`);
          documents = [...documents, ...ssDocs];
        }
      } catch (ssErr) {
        logger.warn('Stage2-SS', `SUPERSEARCH failed: ${ssErr instanceof Error ? ssErr.message : String(ssErr)}`);
      }
    }

    // ── Path E: Address-based clerk search ────────────────────────────────
    // When owner/instrument searches fail, search the clerk by property
    // address using all the address variants we generated in Stage 0.
    if (documents.length === 0 && kofile && normalized.variants.length > 0) {
      logger.info('Stage2-Addr', 'No documents yet — trying address-based clerk search');
      const addressQueries = normalized.variants
        .filter((v) => v.streetNumber && v.streetName)
        .map((v) => ({
          streetNumber: v.streetNumber,
          streetName: v.streetName,
          format: v.format,
        }));

      // Also add the situs address from the CAD result if available
      if (propertyResult?.situsAddress) {
        const situs = propertyResult.situsAddress.trim();
        if (situs) {
          addressQueries.unshift({
            streetNumber: '',
            streetName: situs,
            format: 'situs_address',
          });
        }
      }

      if (addressQueries.length > 0) {
        try {
          const addrDocs = await searchClerkByAddress(input.county, addressQueries, logger);
          if (addrDocs.length > 0) {
            logger.info('Stage2-Addr', `Address search found ${addrDocs.length} documents — fetching images`);
            // Fetch page images for address-found documents
            const docsWithInstr = addrDocs.filter(d => d.ref.instrumentNumber).slice(0, 8);
            const BATCH_SIZE = 3;
            for (let batch = 0; batch < docsWithInstr.length; batch += BATCH_SIZE) {
              const batchItems = docsWithInstr.slice(batch, batch + BATCH_SIZE);
              const batchResults = await Promise.allSettled(
                batchItems.map(async (doc) => {
                  const fetchStart = Date.now();
                  const pages = await fetchDocumentImages(doc.ref.instrumentNumber!, /plat/i.test(doc.ref.documentType) ? 3 : 2, logger);
                  logger.info('Stage2-Addr', `Fetched ${doc.ref.instrumentNumber}: ${pages.length} pages in ${Date.now() - fetchStart}ms`);
                  return { doc, pages };
                }),
              );
              for (const result of batchResults) {
                if (result.status === 'fulfilled' && result.value.pages.length > 0) {
                  const { doc, pages } = result.value;
                  doc.pages = pages;
                  bundleAndUploadPages(pages, input.projectId, doc.ref.instrumentNumber!, doc.ref.documentType)
                    .then(url => { if (url) doc.pagesPdfUrl = url; })
                    .catch((e) => { logger.warn('Stage2-PDF', `PDF bundling failed: ${e instanceof Error ? e.message : String(e)}`); });
                }
              }
            }
            documents = [...documents, ...addrDocs];
          }
        } catch (addrErr) {
          logger.warn('Stage2-Addr', `Address clerk search failed: ${addrErr instanceof Error ? addrErr.message : String(addrErr)}`);
        }
      }
    }

    // ── Path F: Plat-specific clerk search ────────────────────────────────
    // Targeted search for subdivision plats even if we already have deeds.
    // Plats are critical for boundary surveys — search if we have a
    // subdivision name and haven't found any plat documents yet.
    const hasPlat = documents.some((d) =>
      /\bplat\b/i.test(d.ref.documentType) || /^PLT$/i.test(d.ref.documentType.trim()),
    );
    const subdivForPlat = legalDesc ? extractSubdivisionName(legalDesc) : null;

    if (!hasPlat && subdivForPlat && kofile) {
      logger.info('Stage2-Plat', `No plats found yet — searching clerk for "${subdivForPlat}" plat`);
      // Extract lot/block info for more targeted search
      const lotBlockMatch = legalDesc.match(/\b(?:lot|lt)\s*(\d+)/i);
      const blockMatch = legalDesc.match(/\b(?:block|blk)\s*(\w+)/i);
      const additionalTerms = [
        lotBlockMatch ? `LOT ${lotBlockMatch[1]}` : '',
        blockMatch ? `BLOCK ${blockMatch[1]}` : '',
      ].filter(Boolean).join(' ');

      try {
        const platDocs = await searchClerkForPlats(input.county, subdivForPlat, logger, additionalTerms || undefined);
        if (platDocs.length > 0) {
          logger.info('Stage2-Plat', `Plat search found ${platDocs.length} documents — fetching images`);
          // Fetch page images for plat documents (use higher page count for plats)
          const platsWithInstr = platDocs.filter(d => d.ref.instrumentNumber).slice(0, 5);
          const BATCH_SIZE = 3;
          for (let batch = 0; batch < platsWithInstr.length; batch += BATCH_SIZE) {
            const batchItems = platsWithInstr.slice(batch, batch + BATCH_SIZE);
            const batchResults = await Promise.allSettled(
              batchItems.map(async (doc) => {
                const fetchStart = Date.now();
                // Plats often have more pages — request up to 5
                const pages = await fetchDocumentImages(doc.ref.instrumentNumber!, 5, logger);
                logger.info('Stage2-Plat', `Fetched plat ${doc.ref.instrumentNumber}: ${pages.length} pages in ${Date.now() - fetchStart}ms`);
                return { doc, pages };
              }),
            );
            for (const result of batchResults) {
              if (result.status === 'fulfilled' && result.value.pages.length > 0) {
                const { doc, pages } = result.value;
                doc.pages = pages;
                bundleAndUploadPages(pages, input.projectId, doc.ref.instrumentNumber!, doc.ref.documentType)
                  .then(url => { if (url) doc.pagesPdfUrl = url; })
                  .catch((e) => { logger.warn('Stage2-PDF', `PDF bundling failed: ${e instanceof Error ? e.message : String(e)}`); });
              }
            }
          }
          documents = [...documents, ...platDocs];
        }
      } catch (platErr) {
        logger.warn('Stage2-Plat', `Plat search failed: ${platErr instanceof Error ? platErr.message : String(platErr)}`);
      }
    }

    // Merge user-uploaded documents
    if (userDocuments.length > 0) documents = [...documents, ...userDocuments];

    const totalPages = documents.reduce((n, d) => n + (d.pages?.length ?? 0), 0);
    const docSummary = `${documents.length} doc(s)${totalPages > 0 ? `, ${totalPages} pages` : ''}`;
    logger.info('Stage2', `Total: ${docSummary} (${Date.now() - stage2Start}ms)`);

    const stage3Start = Date.now();
    await updateStatus(input.projectId, 'running', `Stage 3: AI extraction — ${docSummary}…`);

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 3: AI Extraction
    // ═══════════════════════════════════════════════════════════════════

    const { documents: processedDocs, boundary } = await extractDocuments(
      documents,
      propertyResult?.legalDescription ?? null,
      anthropicApiKey,
      logger,
    );

    const boundaryNote = boundary
      ? `${boundary.type}, ${boundary.calls.length} calls`
      : 'no boundary';
    logger.info('Stage3', `Extraction: ${boundaryNote} (${Date.now() - stage3Start}ms)`);
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

    if (platDoc?.imageBase64 && platDoc.imageFormat) {
      const mediaType = (
        platDoc.imageFormat === 'jpg' ? 'image/jpeg' :
        platDoc.imageFormat === 'pdf' ? 'image/png'  : // PDFs are pre-rasterised to PNG by bundler
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

    // Build human-readable failure reason for the frontend when the pipeline fails.
    let failureReason: string | undefined;
    if (status === 'failed') {
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
