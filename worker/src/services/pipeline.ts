// worker/src/services/pipeline.ts — Main 4-stage pipeline orchestrator
// Coordinates: Stage 0 (normalize) → Stage 1 (CAD) → Stage 2 (Clerk) → Stage 3 (AI) → Stage 4 (Validate)
// Supports: direct property ID lookup, owner name search, user file uploads.

import type { PipelineInput, PipelineResult, DocumentResult, UserFile, PropertyIdResult, SearchDiagnostics } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';
import { normalizeAddress } from './address-utils.js';
import { searchBisCad, BIS_CONFIGS } from './bell-cad.js';
import { searchClerkRecords } from './bell-clerk.js';
import { extractDocuments } from './ai-extraction.js';
import { validateBoundary } from './validation.js';
import { runGeoReconcile } from './geo-reconcile.js';

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
    const url = `${baseUrl}/Property/View?Id=${propertyId}&year=${year}`;

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

    // Extract data from detail page
    const ownerMatch = html.match(/(?:Owner|Owner\s*Name)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i);
    const legalMatch = html.match(/(?:Legal\s*Description|Legal\s*Desc)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i);
    const acreageMatch = html.match(/(?:Acreage|Acres)\s*:?\s*(?:<[^>]*>\s*)*?([\d,.]+)/i);
    const geoIdMatch = html.match(/(?:GEO\s*ID|Geographic\s*ID)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i);
    const addressMatch = html.match(/(?:Situs|Address|Location)\s*:?\s*(?:<[^>]*>\s*)*([^<]+)/i);

    const ownerName = ownerMatch?.[1]?.trim() ?? null;
    const legalDescription = legalMatch?.[1]?.trim() ?? null;
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

  logger.info('Pipeline', `Starting pipeline for: ${input.address}, ${input.county} County, ${input.state}`);
  if (input.propertyId) logger.info('Pipeline', `Direct property ID provided: ${input.propertyId}`);
  if (input.ownerName) logger.info('Pipeline', `Owner name provided: ${input.ownerName}`);
  if (input.userFiles?.length) logger.info('Pipeline', `${input.userFiles.length} user file(s) uploaded`);

  await updateStatus(input.projectId, 'running', 'Pipeline started');

  try {
    // ═══════════════════════════════════════════════════════════════════
    // PROCESS USER FILES (if any) — available for all stages
    // ═══════════════════════════════════════════════════════════════════

    let userDocuments: DocumentResult[] = [];
    if (input.userFiles && input.userFiles.length > 0) {
      userDocuments = processUserFiles(input.userFiles, logger);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 0: Address Normalization
    // ═══════════════════════════════════════════════════════════════════

    logger.info('Stage0', '═══ STAGE 0: Address Normalization ═══');
    const normalized = await normalizeAddress(input.address, logger);
    logger.info('Stage0', `Canonical: ${normalized.canonical ?? 'N/A'} (source: ${normalized.source}, ${normalized.variants.length} variants)`);

    // Warn if detected county differs from user input
    if (normalized.detectedCounty && normalized.detectedCounty.toLowerCase() !== input.county.toLowerCase()) {
      logger.warn('Stage0', `Detected county "${normalized.detectedCounty}" differs from input "${input.county}" — using input`);
    }

    await updateStatus(input.projectId, 'running', `Address normalized: ${normalized.canonical}. Searching CAD...`);

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 1: Property Identification
    // ═══════════════════════════════════════════════════════════════════

    logger.info('Stage1', '═══ STAGE 1: Property Identification ═══');
    let propertyResult: PropertyIdResult | null = null;
    let searchDiagnostics: SearchDiagnostics | undefined;

    // Path A: Direct property ID lookup (user knows the ID)
    if (input.propertyId) {
      logger.info('Stage1', `Using direct property ID: ${input.propertyId}`);
      propertyResult = await lookupByPropertyId(input.county, input.propertyId, logger);
    }

    // Path B: Address-based search (with all variants)
    if (!propertyResult && normalized.variants.length > 0) {
      const cadResult = await searchBisCad(input.county, normalized, anthropicApiKey, logger);
      propertyResult = cadResult.property;
      searchDiagnostics = cadResult.diagnostics;
    }

    // Path C: If user provided owner name and address search failed, try owner name search via clerk
    if (!propertyResult && input.ownerName) {
      logger.info('Stage1', `Address search failed — trying owner name search: "${input.ownerName}"`);

      // Use AI to generate best search name formats
      const nameVariants = await aiFormatOwnerName(input.ownerName, anthropicApiKey, logger);
      logger.info('Stage1', `AI generated ${nameVariants.length} name variants for clerk/CAD search`);

      // Try Playwright search with owner name — wrapped in try/finally for cleanup
      const { chromium } = await import('playwright');
      let ownerBrowser = null;
      try {
        ownerBrowser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' });
        const context = await ownerBrowser.newContext();
        const page = await context.newPage();

        const ownerCadConfig = BIS_CONFIGS[input.county.toLowerCase()];
        const ownerBaseUrl = ownerCadConfig?.baseUrl;

        if (ownerBaseUrl) {
          for (const nameVariant of nameVariants.slice(0, 5)) {
            try {
              logger.info('Stage1', `Owner search: trying "${nameVariant}" on ${ownerCadConfig.name}`);

              // Try the "By Owner" search on CAD
              await page.goto(ownerBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

              // Click owner tab
              const ownerTabSelectors = ['text=By Owner', 'a:has-text("Owner")', '[data-tab="owner"]'];
              for (const sel of ownerTabSelectors) {
                try {
                  const tab = page.locator(sel).first();
                  if (await tab.isVisible({ timeout: 2_000 })) {
                    await tab.click();
                    await page.waitForTimeout(800);
                    break;
                  }
                } catch { continue; }
              }

              // Fill owner name
              await page.evaluate((name: string) => {
                const inputs = document.querySelectorAll('input[type="text"]');
                const ownerInput = Array.from(inputs).find((el) => {
                  const placeholder = (el as HTMLInputElement).placeholder?.toLowerCase() ?? '';
                  const nameAttr = (el as HTMLInputElement).name?.toLowerCase() ?? '';
                  return placeholder.includes('owner') || nameAttr.includes('owner') || nameAttr.includes('name');
                }) as HTMLInputElement | undefined;
                if (ownerInput) {
                  ownerInput.value = name;
                  ownerInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }, nameVariant);

              // Submit
              const btn = page.locator('button:has-text("Search"), input[type="submit"]').first();
              await btn.click({ timeout: 5_000 });
              await page.waitForTimeout(3_000);

              // Check for results
              const resultText = await page.evaluate(() => {
                const firstRow = document.querySelector('table tbody tr');
                if (!firstRow) return null;
                const link = firstRow.querySelector('a[href]');
                const href = link?.getAttribute('href') ?? '';
                const idMatch = href.match(/Id=(\w+)/);
                return {
                  id: idMatch?.[1] ?? null,
                  text: firstRow.textContent?.trim() ?? '',
                };
              });

              if (resultText?.id) {
                logger.info('Stage1', `Owner name "${nameVariant}" found property ID: ${resultText.id}`);
                propertyResult = await lookupByPropertyId(input.county, resultText.id, logger);
                if (propertyResult) break;
              }
            } catch (err) {
              logger.warn('Stage1', `Owner search "${nameVariant}" failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } else {
          logger.warn('Stage1', `No CAD config for county "${input.county}" — cannot search by owner name`);
        }
      } finally {
        if (ownerBrowser) {
          try { await ownerBrowser.close(); } catch { /* ignore */ }
        }
      }
    }

    if (!propertyResult) {
      logger.error('Stage1', 'Property not found via any search method');
      await updateStatus(input.projectId, 'failed', `Property not found at ${input.address} in ${input.county} County`);

      // Even without property info, we can still process user files
      if (userDocuments.length > 0) {
        logger.info('Pipeline', 'No property found but processing user files...');
        const { documents: processed, boundary } = await extractDocuments(userDocuments, null, anthropicApiKey, logger);
        const validation = validateBoundary(boundary, null, logger);

        const result = emptyResult();
        result.status = boundary ? 'partial' : 'failed';
        result.documents = processed;
        result.boundary = boundary;
        result.validation = validation;
        result.log = logger.getAttempts();
        result.duration_ms = Date.now() - startTime;
        return result;
      }

      return emptyResult();
    }

    logger.info('Stage1', `Property: ID=${propertyResult.propertyId}, Owner=${propertyResult.ownerName}, Confidence=${propertyResult.matchConfidence.toFixed(2)}`);
    await updateStatus(input.projectId, 'running', `Property found: ${propertyResult.propertyId} (${propertyResult.ownerName}). Searching clerk...`, {
      propertyId: propertyResult.propertyId,
      ownerName: propertyResult.ownerName,
    });

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 2: Document Retrieval
    // ═══════════════════════════════════════════════════════════════════

    logger.info('Stage2', '═══ STAGE 2: Document Retrieval ═══');
    let documents: DocumentResult[] = [];

    // Use the owner name from CAD result, or from user input, or AI-reformatted
    const ownerForClerk = propertyResult.ownerName ?? input.ownerName ?? null;

    if (ownerForClerk) {
      documents = await searchClerkRecords(input.county, ownerForClerk, logger);
      logger.info('Stage2', `Retrieved ${documents.length} documents from clerk`);
    } else {
      logger.warn('Stage2', 'No owner name available — skipping clerk search');
    }

    // Add user-uploaded documents
    if (userDocuments.length > 0) {
      documents = [...documents, ...userDocuments];
      logger.info('Stage2', `Added ${userDocuments.length} user files → ${documents.length} total documents`);
    }

    await updateStatus(input.projectId, 'running', `${documents.length} documents. Running AI extraction...`);

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 3: AI Extraction (multi-pass verification)
    // ═══════════════════════════════════════════════════════════════════

    logger.info('Stage3', '═══ STAGE 3: AI Extraction ═══');
    const { documents: processedDocs, boundary } = await extractDocuments(
      documents,
      propertyResult.legalDescription,
      anthropicApiKey,
      logger,
    );

    logger.info('Stage3', `Extraction complete. Boundary: ${boundary?.type ?? 'none'}, Calls: ${boundary?.calls.length ?? 0}`);
    await updateStatus(input.projectId, 'running', 'Extraction complete. Running geometric reconciliation...');

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
      const mediaType = (platDoc.imageFormat === 'jpg' ? 'image/jpeg' : 'image/png') as 'image/png' | 'image/jpeg';
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

    await updateStatus(input.projectId, 'running', 'Reconciliation complete. Validating...');

    // ═══════════════════════════════════════════════════════════════════
    // STAGE 4: Validation
    // ═══════════════════════════════════════════════════════════════════

    logger.info('Stage4', '═══ STAGE 4: Validation ═══');
    const validation = validateBoundary(boundary, propertyResult.acreage, logger);
    logger.info('Stage4', `Quality: ${validation.overallQuality}, Flags: ${validation.flags.length}`);

    // ═══════════════════════════════════════════════════════════════════
    // Final Result
    // ═══════════════════════════════════════════════════════════════════

    let status: PipelineResult['status'] = 'failed';
    if (boundary && boundary.calls.length > 0 && validation.overallQuality !== 'failed') {
      status = (validation.overallQuality === 'excellent' || validation.overallQuality === 'good') ? 'complete' : 'partial';
    } else if (boundary && (boundary.type === 'lot_and_block' || boundary.type === 'reference_only')) {
      status = 'partial';
    } else if (propertyResult.propertyId) {
      status = 'partial';
    }

    const duration_ms = Date.now() - startTime;
    logger.info('Pipeline', `Pipeline ${status.toUpperCase()} in ${(duration_ms / 1000).toFixed(1)}s`);

    const result: PipelineResult = {
      projectId: input.projectId,
      status,
      propertyId: propertyResult.propertyId,
      geoId: propertyResult.geoId,
      ownerName: propertyResult.ownerName,
      legalDescription: propertyResult.legalDescription,
      acreage: propertyResult.acreage,
      documents: processedDocs,
      boundary,
      validation,
      reconciliation,
      log: logger.getAttempts(),
      duration_ms,
      searchDiagnostics,
    };

    await updateStatus(input.projectId, status, `Pipeline ${status} in ${(duration_ms / 1000).toFixed(1)}s — Quality: ${validation.overallQuality}`, {
      propertyId: propertyResult.propertyId,
      ownerName: propertyResult.ownerName,
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
