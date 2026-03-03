// worker/src/services/pipeline.ts — Main 4-stage pipeline orchestrator
// Coordinates Stage 0 (normalize) → Stage 1 (CAD) → Stage 2 (Clerk) → Stage 3 (AI) → Stage 4 (Validate)

import type { PipelineInput, PipelineResult, DocumentResult } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';
import { normalizeAddress } from './address-utils.js';
import { searchBisCad } from './bell-cad.js';
import { searchClerkRecords } from './bell-clerk.js';
import { extractDocuments } from './ai-extraction.js';
import { validateBoundary } from './validation.js';

// ── Supabase Client (Lazy Init) ───────────────────────────────────────────

let supabaseClient: ReturnType<typeof import('@supabase/supabase-js').createClient> | null = null;

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

    if (metadata) {
      update.research_metadata = metadata;
    }

    const { error } = await supabase
      .from('research_projects')
      .update(update)
      .eq('id', projectId);

    if (error) {
      // Columns may not exist — log but don't crash
      console.warn(`[Pipeline] Supabase update warning for ${projectId}: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[Pipeline] Supabase update failed for ${projectId}:`, err instanceof Error ? err.message : err);
  }
}

// ── Main Pipeline ──────────────────────────────────────────────────────────

/**
 * Run the full 4-stage research pipeline for a property.
 * Returns structured results with validation and quality scoring.
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const startTime = Date.now();
  const logger = new PipelineLogger(input.projectId);
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';

  if (!anthropicApiKey) {
    logger.error('Pipeline', 'ANTHROPIC_API_KEY is not set');
    return {
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
    };
  }

  logger.info('Pipeline', `Starting pipeline for: ${input.address}, ${input.county} County, ${input.state}`);
  await updateStatus(input.projectId, 'running', 'Pipeline started — normalizing address');

  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 0: Address Normalization
  // ═══════════════════════════════════════════════════════════════════════

  logger.info('Stage0', '═══ STAGE 0: Address Normalization ═══');
  const normalized = await normalizeAddress(input.address, logger);
  logger.info('Stage0', `Canonical: ${normalized.canonical ?? 'N/A'} (source: ${normalized.source}, ${normalized.variants.length} variants)`);

  if (normalized.variants.length === 0) {
    logger.error('Stage0', 'No address variants generated — cannot search');
    await updateStatus(input.projectId, 'failed', 'Address normalization produced no search variants');
    return {
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
    };
  }

  await updateStatus(input.projectId, 'running', `Address normalized: ${normalized.canonical}. Searching CAD...`);

  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 1: Property Identification
  // ═══════════════════════════════════════════════════════════════════════

  logger.info('Stage1', '═══ STAGE 1: Property Identification ═══');
  const propertyResult = await searchBisCad(
    input.county,
    normalized,
    anthropicApiKey,
    logger,
  );

  if (!propertyResult) {
    logger.error('Stage1', 'Property not found in CAD system');
    await updateStatus(input.projectId, 'failed', `Property not found at ${input.address} in ${input.county} County CAD`);
    return {
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
    };
  }

  logger.info('Stage1', `Property found: ID=${propertyResult.propertyId}, Owner=${propertyResult.ownerName}, Layer=${propertyResult.layer}`);
  await updateStatus(input.projectId, 'running', `Property found: ${propertyResult.propertyId} (${propertyResult.ownerName}). Searching clerk records...`, {
    propertyId: propertyResult.propertyId,
    ownerName: propertyResult.ownerName,
    layer: propertyResult.layer,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 2: Document Retrieval
  // ═══════════════════════════════════════════════════════════════════════

  logger.info('Stage2', '═══ STAGE 2: Document Retrieval ═══');
  let documents: DocumentResult[] = [];

  if (propertyResult.ownerName) {
    documents = await searchClerkRecords(input.county, propertyResult.ownerName, logger);
    logger.info('Stage2', `Retrieved ${documents.length} documents from clerk`);
  } else {
    logger.warn('Stage2', 'No owner name available — skipping clerk search');
  }

  await updateStatus(input.projectId, 'running', `Found ${documents.length} documents. Running AI extraction...`);

  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 3: AI Extraction (with multi-pass verification)
  // ═══════════════════════════════════════════════════════════════════════

  logger.info('Stage3', '═══ STAGE 3: AI Extraction ═══');
  const { documents: processedDocs, boundary } = await extractDocuments(
    documents,
    propertyResult.legalDescription,
    anthropicApiKey,
    logger,
  );

  logger.info('Stage3', `Extraction complete. Boundary type: ${boundary?.type ?? 'none'}, Calls: ${boundary?.calls.length ?? 0}`);
  await updateStatus(input.projectId, 'running', `Extraction complete. Validating boundary data...`);

  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 4: Validation
  // ═══════════════════════════════════════════════════════════════════════

  logger.info('Stage4', '═══ STAGE 4: Validation ═══');
  const validation = validateBoundary(boundary, propertyResult.acreage, logger);
  logger.info('Stage4', `Quality: ${validation.overallQuality}, Flags: ${validation.flags.length}`);

  // ═══════════════════════════════════════════════════════════════════════
  // Determine final status
  // ═══════════════════════════════════════════════════════════════════════

  let status: PipelineResult['status'] = 'failed';
  if (boundary && boundary.calls.length > 0 && validation.overallQuality !== 'failed') {
    status = validation.overallQuality === 'excellent' || validation.overallQuality === 'good'
      ? 'complete'
      : 'partial';
  } else if (boundary && (boundary.type === 'lot_and_block' || boundary.type === 'reference_only')) {
    status = 'partial'; // Valid result but no metes & bounds to fully validate
  } else if (propertyResult.propertyId) {
    status = 'partial'; // At least found the property
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
    log: logger.getAttempts(),
    duration_ms,
  };

  // Store full result in Supabase
  await updateStatus(input.projectId, status === 'complete' ? 'complete' : status === 'partial' ? 'partial' : 'failed', `Pipeline ${status} in ${(duration_ms / 1000).toFixed(1)}s — Quality: ${validation.overallQuality}`, {
    propertyId: propertyResult.propertyId,
    ownerName: propertyResult.ownerName,
    acreage: propertyResult.acreage,
    boundaryType: boundary?.type ?? null,
    callCount: boundary?.calls.length ?? 0,
    referenceCount: boundary?.references.length ?? 0,
    quality: validation.overallQuality,
    closureError_ft: validation.closureError_ft,
    precisionRatio: validation.precisionRatio,
    computedArea_acres: validation.computedArea_acres,
    documentCount: processedDocs.length,
    flagCount: validation.flags.length,
    duration_ms,
  });

  return result;
}
