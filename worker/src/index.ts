// worker/src/index.ts — Express server entry point for the Starr Research Worker
// Runs on DigitalOcean droplet (port 3100), managed by PM2.
// Provides API endpoints for the Vercel frontend to trigger and poll research pipelines.

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import type { Request, Response } from 'express';
import type { PipelineInput, PipelineResult, ActivePipeline, UserFile, LayerAttempt } from './types/index.js';
import { runPipeline, getSupabase, getRunningMessage, setRunningMessage, clearRunningMessage } from './services/pipeline.js';
import { getLiveLogForProject, clearLiveLogForProject, PipelineLogger } from './lib/logger.js';
import { getTracker, getTrackerIfExists, clearTracker } from './lib/timeline-tracker.js';
import { enableTracing, disableTracing } from './lib/trace.js';
import { runCountyResearch, validateAddressCounty, type CountyResearchInput, type UnifiedResearchResult, type CountyResearchProgress } from './counties/router.js';
import { PropertyDiscoveryEngine } from './services/property-discovery.js';
import { DocumentHarvester, type HarvestInput } from './services/document-harvester.js';
import { syncHarvestToSupabase } from './services/harvest-supabase-sync.js';
import { SubdivisionIntelligenceEngine } from './services/subdivision-intelligence.js';
import { runAdjacentResearch, type FullCrossValidationReport } from './services/adjacent-research-orchestrator.js';
import { runROWIntegration, type ROWReport } from './services/row-integration-engine.js';
import { GeometricReconciliationEngine } from './services/geometric-reconciliation-engine.js';
import { uploadPipelineArtifacts, type ArtifactScreenshot, type ArtifactPageImage } from './services/artifact-uploader.js';
import { ConfidenceScoringEngine } from './services/confidence-scoring-engine.js';
import { DocumentPurchaseOrchestrator } from './services/document-purchase-orchestrator.js';
import { PaidPlatformRegistry } from './services/paid-platform-registry.js';
import { createDocumentAccessOrchestrator } from './services/document-access-orchestrator.js';
import { createReportRoutes } from './routes/report-routes.js';
// Phase 11 imports
import { FEMANFHLClient } from './sources/fema-nfhl-client.js';
import { GLOClient } from './sources/glo-client.js';
import { TCEQClient } from './sources/tceq-client.js';
import { RRCClient } from './sources/rrc-client.js';
import { NRCSSoilClient } from './sources/nrcs-soil-client.js';
import { ChainOfTitleBuilder } from './chain-of-title/chain-builder.js';
import { BatchProcessor } from './batch/batch-processor.js';
import { UsageTracker } from './analytics/usage-tracker.js';
import { getClerkByCountyName } from './adapters/clerk-registry.js';
import { SiteHealthMonitor } from './infra/site-health-monitor.js';
// Phase 13 imports
import { USGSClient } from './sources/usgs-client.js';
import { TXComptrollerClient } from './sources/comptroller-client.js';
import { validateOrNull } from './infra/schema-validator.js';
// Phase 15 imports
import { TylerPayAdapter } from './services/purchase-adapters/tyler-pay-adapter.js';
import { HenschenPayAdapter } from './services/purchase-adapters/henschen-pay-adapter.js';
import { IDocketPayAdapter } from './services/purchase-adapters/idocket-pay-adapter.js';
import { FidlarPayAdapter } from './services/purchase-adapters/fidlar-pay-adapter.js';
import { GovOSGuestAdapter } from './services/purchase-adapters/govos-guest-adapter.js';
import { LandExApiAdapter } from './services/purchase-adapters/landex-api-adapter.js';
import { NotificationService } from './services/notification-service.js';
import { isCreditDepleted, getDepletionMessage, AnthropicCreditDepletedError } from './lib/credit-guard.js';

// ── Server Setup ───────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? '3100', 10);

app.use(express.json({ limit: '100mb' })); // Large for file uploads

// ── Startup Validation ─────────────────────────────────────────────────────

function validateEnvironment(): void {
  const required: Array<{ key: string; critical: boolean }> = [
    { key: 'WORKER_API_KEY', critical: true },
    { key: 'ANTHROPIC_API_KEY', critical: true },
    { key: 'SUPABASE_URL', critical: false },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', critical: false },
  ];

  let hasErrors = false;
  for (const { key, critical } of required) {
    if (!process.env[key]) {
      if (critical) {
        console.error(`[FATAL] Missing required environment variable: ${key}`);
        hasErrors = true;
      } else {
        console.warn(`[WARN] Missing optional environment variable: ${key}`);
      }
    }
  }

  if (hasErrors) {
    console.error('[FATAL] Server cannot start without required environment variables.');
    console.error('[FATAL] Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

// ── Auth Middleware ─────────────────────────────────────────────────────────

// ── Simple In-Memory Rate Limiter ───────────────────────────────────────────
// Lightweight sliding-window rate limiter for file-system-touching routes.
// Shared across all callers since this is an internal single-tenant worker.
// Note: this is reset on process restart (intentional for a worker process).

const _rateLimitWindows = new Map<string, number[]>();

/**
 * Rate-limit middleware — allows at most `maxReq` requests per `windowMs`
 * from a single IP. Returns 429 when exceeded.
 */
function rateLimit(maxReq: number, windowMs: number) {
  return (req: Request, res: Response, next: () => void): void => {
    const ip  = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const hits = (_rateLimitWindows.get(key) ?? []).filter(ts => now - ts < windowMs);
    hits.push(now);
    _rateLimitWindows.set(key, hits);
    if (hits.length > maxReq) {
      res.status(429).json({ error: 'Too many requests — please slow down and try again' });
      return;
    }
    next();
  };
}

function requireAuth(req: Request, res: Response, next: () => void): void {
  const apiKey = process.env.WORKER_API_KEY;

  // Auth is ALWAYS required in production
  if (!apiKey) {
    console.error('[Auth] WORKER_API_KEY not set — this should have been caught at startup');
    res.status(500).json({ error: 'Server misconfigured — auth key not set' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header. Use: Bearer <token>' });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (token !== apiKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
}

// ── In-Memory State ────────────────────────────────────────────────────────

const activePipelines = new Map<string, ActivePipeline>();
const completedResults = new Map<string, UnifiedResearchResult>();
/** Cached live log entries for county-specific pipelines, keyed by projectId. */
const completedLogs = new Map<string, LayerAttempt[]>();
/**
 * Wall-clock timestamp (ms) when each project was added to completedResults.
 * Used as a fallback TTL for entries that have no log timestamp or completedAt field —
 * without this, entries with missing timestamps would never be evicted (memory leak).
 */
const completedResultsCachedAt = new Map<string, number>();

/**
 * Helper: set a completed result and record its insertion timestamp.
 * Both maps MUST be updated together. Without completedResultsCachedAt,
 * entries whose log carries no valid timestamp would never be evicted by
 * cleanupOldResults(), causing an unbounded memory leak in long-running workers.
 */
function setCompletedResult(projectId: string, result: UnifiedResearchResult): void {
  completedResults.set(projectId, result);
  completedResultsCachedAt.set(projectId, Date.now());
}

// Keep completed results for 4 hours
const RESULT_TTL_MS = 4 * 60 * 60 * 1000;
const MS_PER_HOUR   = 3_600_000;

function cleanupOldResults(): void {
  const cutoff = Date.now() - RESULT_TTL_MS;
  let evicted = 0;
  for (const [key, unified] of completedResults.entries()) {
    let completedAt = 0;
    if (unified.resultType === 'generic-pipeline') {
      const result = unified.data;
      const lastLog = result.log.length > 0 ? result.log[result.log.length - 1] : null;
      completedAt = lastLog?.timestamp ? new Date(lastLog.timestamp).getTime() : 0;
    } else {
      completedAt = unified.data.completedAt ? new Date(unified.data.completedAt).getTime() : 0;
    }
    // Fall back to the wall-clock time when the entry was cached. This prevents
    // entries with missing/unparseable timestamps from leaking in memory forever.
    if (completedAt === 0) {
      completedAt = completedResultsCachedAt.get(key) ?? 0;
    }
    if (completedAt > 0 && completedAt < cutoff) {
      completedResults.delete(key);
      completedLogs.delete(key);
      completedResultsCachedAt.delete(key);
      clearTracker(key); // Clean up timeline tracker memory
      evicted++;
    }
  }
  if (evicted > 0) {
    console.log(`[Worker] cleanupOldResults: evicted ${evicted} expired result(s) (TTL=${RESULT_TTL_MS / MS_PER_HOUR}h)`);
  }
}

setInterval(cleanupOldResults, 10 * 60 * 1000);

// ── Document Type Normalizer ───────────────────────────────────────────────
// Maps free-text document type strings from the pipeline to the canonical set
// used by the research_documents table (matches page.tsx docTypeIcons keys).

/** Maximum number of characters to store in the extracted_text column. */
const MAX_EXTRACTED_TEXT_LENGTH = 50_000;

function normDocType(rawType: string | null | undefined): string {
  if (!rawType) return 'other';
  const lower = rawType.toLowerCase();
  if (/warranty deed|general warranty|deed of trust|trustee.*deed|deed/i.test(lower)) return 'deed';
  if (/subdivision plat|plat/i.test(lower)) return lower.includes('subdivision') ? 'subdivision_plat' : 'plat';
  if (/survey/i.test(lower)) return 'survey';
  if (/legal desc/i.test(lower)) return 'legal_description';
  if (/easement/i.test(lower)) return 'easement';
  if (/covenant|restriction/i.test(lower)) return 'restrictive_covenant';
  if (/field note/i.test(lower)) return 'field_notes';
  if (/metes|bounds/i.test(lower)) return 'metes_and_bounds';
  if (/appraisal|assessment|cad record/i.test(lower)) return 'appraisal_record';
  if (/county record/i.test(lower)) return 'county_record';
  if (/title commitment/i.test(lower)) return 'title_commitment';
  if (/aerial|satellite/i.test(lower)) return 'aerial_photo';
  if (/topo|topographic/i.test(lower)) return 'topo_map';
  if (/utility/i.test(lower)) return 'utility_map';
  return 'other';
}


// ── persistCountyResults ───────────────────────────────────────────────────
// Saves a completed Bell County research result to Supabase so the Review
// stage can display it after page refresh.
//
// Three writes:
//   1. analysis_metadata on research_projects — summary, owner, acreage, etc.
//   2. Delete + re-insert research_documents rows for deed records.
//   3. Delete + re-insert research_documents rows for plat records.

async function persistCountyResults(
  projectId: string,
  r: import('./counties/bell/types/research-result.js').BellResearchResult,
): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) {
    console.warn(`[Worker] ${projectId}: persistCountyResults — Supabase not available`);
    return;
  }

  // ── 1. Save analysis_metadata ──────────────────────────────────────
  const now = new Date().toISOString();
  const property = r.property;

  // Fetch current metadata to avoid overwriting user-authored job_notes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingRow } = await (supabase as any)
    .from('research_projects')
    .select('analysis_metadata')
    .eq('id', projectId)
    .single();
  const currentMeta = (existingRow?.analysis_metadata as Record<string, unknown>) ?? {};

  const autoSummaryParts: string[] = [];
  if (property.ownerName) autoSummaryParts.push(`Owner: ${property.ownerName}`);
  if (property.propertyId) autoSummaryParts.push(`Property ID: ${property.propertyId}`);
  if (property.acreage) autoSummaryParts.push(`Acreage: ${property.acreage} ac`);
  if (property.legalDescription) autoSummaryParts.push(`Legal Description: ${property.legalDescription.slice(0, 300)}`);
  const deedCount = r.deedsAndRecords.records.length;
  const platCount = r.plats.plats.length;
  if (deedCount > 0) autoSummaryParts.push(`${deedCount} deed record(s) retrieved`);
  if (platCount > 0) autoSummaryParts.push(`${platCount} plat record(s) retrieved`);
  if (r.discrepancies.length > 0) autoSummaryParts.push(`${r.discrepancies.length} discrepancy/ies flagged`);
  const autoSummary = autoSummaryParts.join('\n') || 'Bell County research completed.';

  // Build boundary data from plat AI analysis + deed calls
  const allBearings: string[] = [];
  const allMonuments: string[] = [];
  const allCurves: string[] = [];
  const allLotDimensions: string[] = [];
  const allRowWidths: string[] = [];
  const allPlatEasements: string[] = [];
  for (const plat of r.plats.plats) {
    if (plat.aiAnalysis) {
      allBearings.push(...plat.aiAnalysis.bearingsAndDistances);
      allMonuments.push(...plat.aiAnalysis.monuments);
      allCurves.push(...plat.aiAnalysis.curves);
      allLotDimensions.push(...plat.aiAnalysis.lotDimensions);
      allRowWidths.push(...plat.aiAnalysis.rowWidths);
      allPlatEasements.push(...plat.aiAnalysis.easements);
    }
  }

  // Build easement records for persistence (strip base64 images to save space)
  const easementRecordsForMeta = r.easementsAndEncumbrances.easements.map(e => ({
    type: e.type,
    description: e.description,
    instrumentNumber: e.instrumentNumber,
    width: e.width ?? null,
    location: e.location ?? null,
    sourceUrl: e.sourceUrl,
    source: e.source,
  }));

  // Build chain of title for persistence
  const chainOfTitle = r.deedsAndRecords.chainOfTitle.map(c => ({
    order: c.order,
    instrumentNumber: c.instrumentNumber,
    date: c.date,
    from: c.from,
    to: c.to,
    type: c.type,
  }));

  // Build discrepancies for persistence
  const discrepanciesForMeta = r.discrepancies.map(d => ({
    category: d.category,
    description: d.description,
    source1: d.source1,
    source1Value: d.source1Value,
    source2: d.source2,
    source2Value: d.source2Value,
    severity: d.severity,
    aiRecommendation: d.aiRecommendation,
  }));

  // Plat analysis summaries (per-plat, without base64 images)
  const platAnalyses = r.plats.plats
    .filter(p => p.aiAnalysis)
    .map(p => ({
      name: p.name,
      instrumentNumber: p.instrumentNumber,
      date: p.date,
      narrative: p.aiAnalysis!.narrative,
      bearingsAndDistances: p.aiAnalysis!.bearingsAndDistances,
      lotDimensions: p.aiAnalysis!.lotDimensions,
      monuments: p.aiAnalysis!.monuments,
      easements: p.aiAnalysis!.easements,
      curves: p.aiAnalysis!.curves,
      rowWidths: p.aiAnalysis!.rowWidths,
      adjacentReferences: p.aiAnalysis!.adjacentReferences,
      changesFromPrevious: p.aiAnalysis!.changesFromPrevious,
    }));

  const updatedMeta: Record<string, unknown> = {
    ...currentMeta,
    result: {
      ownerName: property.ownerName || null,
      propertyId: property.propertyId || null,
      legalDescription: property.legalDescription || null,
      acreage: property.acreage ?? null,
      situsAddress: property.situsAddress || null,
      lat: property.lat || null,
      lon: property.lon || null,
      mapId: property.mapId || null,
      propertyType: property.propertyType || null,
      lotNumber: property.lotNumber || null,
      blockNumber: property.blockNumber || null,
      subdivisionName: property.subdivisionName || null,
      documentCount: deedCount + platCount,
      duration_ms: r.durationMs,
      deedSummary: r.deedsAndRecords.summary || null,
      platSummary: r.plats.summary || null,
      easementSummary: r.easementsAndEncumbrances.summary || null,
      discrepancyCount: r.discrepancies.length,
      confidenceTier: r.overallConfidence.tier,
      confidenceScore: r.overallConfidence.score,
      finalSummary: autoSummary,
      masterReportText: null,

      // ── FEMA Flood Zone Data ──
      fema: r.easementsAndEncumbrances.fema ? {
        floodZone: r.easementsAndEncumbrances.fema.floodZone,
        zoneSubtype: r.easementsAndEncumbrances.fema.zoneSubtype,
        inSFHA: r.easementsAndEncumbrances.fema.inSFHA,
        firmPanel: r.easementsAndEncumbrances.fema.firmPanel,
        effectiveDate: r.easementsAndEncumbrances.fema.effectiveDate,
        sourceUrl: r.easementsAndEncumbrances.fema.sourceUrl,
      } : null,

      // ── TxDOT ROW Data ──
      txdot: r.easementsAndEncumbrances.txdot ? {
        rowWidth: r.easementsAndEncumbrances.txdot.rowWidth,
        csjNumber: r.easementsAndEncumbrances.txdot.csjNumber,
        highwayName: r.easementsAndEncumbrances.txdot.highwayName,
        highwayClass: r.easementsAndEncumbrances.txdot.highwayClass,
        district: r.easementsAndEncumbrances.txdot.district,
        acquisitionDate: r.easementsAndEncumbrances.txdot.acquisitionDate,
        sourceUrl: r.easementsAndEncumbrances.txdot.sourceUrl,
      } : null,

      // ── Easement Records ──
      easements: easementRecordsForMeta,
      restrictiveCovenants: r.easementsAndEncumbrances.restrictiveCovenants,

      // ── Boundary Data (bearings, distances, monuments) ──
      boundary: {
        bearingsAndDistances: allBearings,
        lotDimensions: allLotDimensions,
        monuments: allMonuments,
        curves: allCurves,
        rowWidths: allRowWidths,
        platEasements: allPlatEasements,
        callCount: allBearings.length,
        confidence: r.overallConfidence.score,
      },

      // ── Chain of Title ──
      chainOfTitle,

      // ── Plat Analyses ──
      platAnalyses,
      crossValidation: r.plats.crossValidation,

      // ── Discrepancies ──
      discrepancies: discrepanciesForMeta,

      // ── Links & Screenshots ──
      researchedLinks: r.researchedLinks.map(l => ({
        url: l.url,
        title: l.title,
        source: l.source,
        dataFound: l.dataFound,
      })),
      screenshotCount: r.screenshots.length,

      // ── Errors ──
      errors: r.errors.map(e => ({
        phase: e.phase,
        source: e.source,
        message: e.message,
        recovered: e.recovered,
      })),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: metaErr } = await (supabase as any)
    .from('research_projects')
    .update({ analysis_metadata: updatedMeta })
    .eq('id', projectId);
  if (metaErr) {
    console.warn(`[Worker] ${projectId}: failed to save county analysis_metadata: ${metaErr.message}`);
  } else {
    console.log(`[Worker] ${projectId}: saved county analysis_metadata to Supabase`);
  }

  // ── 2. Delete previous property_search document rows ─────────────────
  // The artifact uploader (step 4) creates fresh rows with page images,
  // PDF URLs, AND the rich metadata (labels, recording info, AI text).
  // We no longer create separate text-only rows here — that caused duplicates.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('research_documents')
    .delete()
    .eq('research_project_id', projectId)
    .eq('source_type', 'property_search');

  // ── 3. Insert documents that have NO page images (metadata-only) ─────
  // Deeds/plats with page images are handled by the artifact uploader.
  // Only insert here if a deed/plat has zero page images.
  const metadataOnlyInserts: Record<string, unknown>[] = [];

  for (const deed of r.deedsAndRecords.records) {
    if (deed.pageImages.length > 0) continue; // Artifact uploader will handle
    const instr = deed.instrumentNumber;
    const volPage = deed.volume && deed.page ? `Vol. ${deed.volume}, Pg. ${deed.page}` : null;
    const recordingInfo = [instr ? `Instrument No. ${instr}` : null, volPage].filter(Boolean).join(' — ') || null;
    const grantorStr = deed.grantor ?? null;
    const granteeStr = deed.grantee ?? null;
    const partyStr = grantorStr && granteeStr ? ` — ${grantorStr} to ${granteeStr}` : (grantorStr ? ` — ${grantorStr}` : '');
    const instrStr = instr ? ` (Instr. ${instr})` : '';
    const docLabel = `${deed.documentType || 'Deed'}${partyStr}${instrStr}`;
    const rawText = deed.legalDescription ?? deed.aiSummary ?? null;
    const extractedText = rawText ? rawText.slice(0, MAX_EXTRACTED_TEXT_LENGTH) : null;

    metadataOnlyInserts.push({
      research_project_id: projectId,
      source_type: 'property_search',
      original_filename: docLabel,
      file_type: 'pdf',
      document_type: normDocType(deed.documentType),
      document_label: docLabel,
      recording_info: recordingInfo,
      recorded_date: deed.recordingDate ?? null,
      extracted_text: extractedText,
      processing_status: deed.aiSummary ? 'analyzed' : 'extracted',
      source_url: deed.sourceUrl ?? null,
      created_at: now,
      updated_at: now,
    });
  }

  for (const plat of r.plats.plats) {
    if (plat.images.length > 0) continue; // Artifact uploader will handle
    const instr = plat.instrumentNumber;
    const instrStr = instr ? ` (Instr. ${instr})` : '';
    const docLabel = `Subdivision Plat: ${plat.name}${instrStr}`;
    const rawText = plat.aiAnalysis ? JSON.stringify(plat.aiAnalysis).slice(0, MAX_EXTRACTED_TEXT_LENGTH) : null;

    metadataOnlyInserts.push({
      research_project_id: projectId,
      source_type: 'property_search',
      original_filename: docLabel,
      file_type: 'pdf',
      document_type: normDocType('plat'),
      document_label: docLabel,
      recording_info: instr ? `Instrument No. ${instr}` : null,
      recorded_date: plat.date ?? null,
      extracted_text: rawText,
      processing_status: plat.aiAnalysis ? 'analyzed' : 'extracted',
      source_url: plat.sourceUrl ?? null,
      created_at: now,
      updated_at: now,
    });
  }

  if (metadataOnlyInserts.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: docsErr } = await (supabase as any)
      .from('research_documents')
      .insert(metadataOnlyInserts);
    if (docsErr) {
      console.warn(`[Worker] ${projectId}: failed to save metadata-only documents: ${docsErr.message}`);
    } else {
      console.log(`[Worker] ${projectId}: saved ${metadataOnlyInserts.length} metadata-only document(s) to Supabase`);
    }
  }

  // ── 4. Upload pipeline artifacts (screenshots + page images) ────────
  // This makes captured images viewable on the frontend.
  try {
    console.log(`[Worker] ${projectId}: Preparing artifact upload — ${r.screenshots.length} screenshots, ${r.deedsAndRecords.records.length} deed(s), ${r.plats.plats.length} plat(s)`);
    const classifiedScreenshots = r.screenshots.filter(ss => ss.classification != null).length;
    const usefulScreenshots = r.screenshots.filter(ss => ss.classification === 'useful').length;
    const miscScreenshots = r.screenshots.filter(ss => ss.classification === 'misc').length;
    console.log(`[Worker] ${projectId}: Screenshot classifications — ${classifiedScreenshots} pre-classified (${usefulScreenshots} useful, ${miscScreenshots} misc), ${r.screenshots.length - classifiedScreenshots} unclassified`);

    const artifactScreenshots: ArtifactScreenshot[] = r.screenshots.map(ss => ({
      source: ss.source,
      url: ss.url,
      imageBase64: ss.imageBase64,
      capturedAt: ss.capturedAt,
      description: ss.description,
      pageText: ss.pageText,
      classification: ss.classification,
    }));

    // Collect page images from deeds and plats
    const artifactPageImages: ArtifactPageImage[] = [];

    for (const deed of r.deedsAndRecords.records) {
      if (deed.pageImages.length > 0) {
        console.log(`[Worker] ${projectId}: Deed artifact: inst#${deed.instrumentNumber ?? '?'}, type=${deed.documentType}, pages=${deed.pageImages.length}, sourceUrl=${deed.sourceUrl ?? 'NONE'}`);
      }
      // Build rich metadata for the artifact uploader
      const instr = deed.instrumentNumber;
      const volPage = deed.volume && deed.page ? `Vol. ${deed.volume}, Pg. ${deed.page}` : null;
      const recordingInfo = [instr ? `Instrument No. ${instr}` : null, volPage].filter(Boolean).join(' — ') || null;
      const grantorStr = deed.grantor ?? null;
      const granteeStr = deed.grantee ?? null;
      const partyStr = grantorStr && granteeStr ? ` — ${grantorStr} to ${granteeStr}` : (grantorStr ? ` — ${grantorStr}` : '');
      const instrStr = instr ? ` (Instr. ${instr})` : '';
      const deedDocLabel = `${deed.documentType || 'Deed'}${partyStr}${instrStr}`;
      const deedText = deed.aiSummary ?? deed.legalDescription ?? null;

      for (let pi = 0; pi < deed.pageImages.length; pi++) {
        artifactPageImages.push({
          category: 'deed',
          label: deed.instrumentNumber ?? deed.documentType ?? 'unknown',
          pageNumber: pi + 1,
          imageBase64: deed.pageImages[pi],
          sourceUrl: deed.sourceUrl,
          // Rich metadata — only set on first page (artifact uploader uses firstPage)
          ...(pi === 0 ? {
            documentLabel: deedDocLabel,
            recordingInfo,
            recordedDate: deed.recordingDate ?? null,
            extractedText: deedText?.slice(0, MAX_EXTRACTED_TEXT_LENGTH) ?? null,
            documentType: normDocType(deed.documentType),
          } : {}),
        });
      }
    }

    for (const plat of r.plats.plats) {
      if (plat.images.length > 0) {
        console.log(`[Worker] ${projectId}: Plat artifact: inst#${plat.instrumentNumber ?? '?'}, name="${plat.name}", pages=${plat.images.length}, sourceUrl=${plat.sourceUrl ?? 'NONE'}`);
      }
      const platInstr = plat.instrumentNumber;
      const platInstrStr = platInstr ? ` (Instr. ${platInstr})` : '';
      const platDocLabel = `Subdivision Plat: ${plat.name}${platInstrStr}`;
      const platText = plat.aiAnalysis ? JSON.stringify(plat.aiAnalysis) : null;

      for (let pi = 0; pi < plat.images.length; pi++) {
        artifactPageImages.push({
          category: 'plat',
          label: plat.instrumentNumber ?? plat.name ?? 'unknown',
          pageNumber: pi + 1,
          imageBase64: plat.images[pi],
          sourceUrl: plat.sourceUrl,
          ...(pi === 0 ? {
            documentLabel: platDocLabel,
            recordingInfo: platInstr ? `Instrument No. ${platInstr}` : null,
            recordedDate: plat.date ?? null,
            extractedText: platText?.slice(0, MAX_EXTRACTED_TEXT_LENGTH) ?? null,
            documentType: normDocType('plat'),
          } : {}),
        });
      }
    }

    // Upload FEMA and TxDOT map screenshots if they exist
    if (r.easementsAndEncumbrances.fema?.mapScreenshot) {
      artifactPageImages.push({
        category: 'fema',
        label: 'flood_map',
        pageNumber: 1,
        imageBase64: r.easementsAndEncumbrances.fema.mapScreenshot,
        sourceUrl: r.easementsAndEncumbrances.fema.sourceUrl,
      });
    }
    if (r.easementsAndEncumbrances.txdot?.mapScreenshot) {
      artifactPageImages.push({
        category: 'txdot',
        label: 'row_map',
        pageNumber: 1,
        imageBase64: r.easementsAndEncumbrances.txdot.mapScreenshot,
        sourceUrl: r.easementsAndEncumbrances.txdot.sourceUrl,
      });
    }

    // Upload easement images
    for (const eas of r.easementsAndEncumbrances.easements) {
      if (eas.image) {
        artifactPageImages.push({
          category: 'easement',
          label: eas.instrumentNumber ?? eas.type ?? 'easement',
          pageNumber: 1,
          imageBase64: eas.image,
          sourceUrl: eas.sourceUrl,
        });
      }
    }

    const uploadResult = await uploadPipelineArtifacts(
      supabase as any,
      projectId,
      artifactScreenshots,
      artifactPageImages,
    );

    console.log(
      `[Worker] ${projectId}: artifact upload complete — ` +
      `${uploadResult.screenshotsUploaded} screenshots, ${uploadResult.pageImagesUploaded} page images` +
      (uploadResult.errors.length > 0 ? ` (${uploadResult.errors.length} error(s))` : ''),
    );
  } catch (err) {
    console.warn(
      `[Worker] ${projectId}: artifact upload failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── 5. Save discrepancies to discrepancies table ─────────────────────
  if (r.discrepancies.length > 0) {
    // Delete previous discrepancies for this project
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('discrepancies')
      .delete()
      .eq('research_project_id', projectId);

    // Map severity levels: our pipeline uses high/medium/low, table uses
    // info/unclear/uncertain/discrepancy/contradiction/error
    const severityMap: Record<string, string> = {
      high: 'error',
      medium: 'discrepancy',
      low: 'info',
    };

    // Map category to probable_cause
    const causeMap: Record<string, string> = {
      legal_description: 'transcription_error',
      acreage: 'rounding_difference',
      boundary: 'surveying_error',
      ownership: 'clerical_error',
      easement: 'missing_information',
      other: 'unknown',
    };

    const discInserts = r.discrepancies.map(d => ({
      research_project_id: projectId,
      severity: severityMap[d.severity] ?? 'discrepancy',
      probable_cause: causeMap[d.category] ?? 'unknown',
      title: `${d.category}: ${d.source1} vs ${d.source2}`,
      description: d.description,
      ai_recommendation: d.aiRecommendation || null,
      affects_boundary: d.category === 'boundary' || d.category === 'legal_description',
      affects_area: d.category === 'acreage',
      affects_closure: d.category === 'boundary',
      estimated_impact: `${d.source1}: "${d.source1Value}" vs ${d.source2}: "${d.source2Value}"`,
      resolution_status: 'open',
      created_at: now,
      updated_at: now,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: discErr } = await (supabase as any)
      .from('discrepancies')
      .insert(discInserts);
    if (discErr) {
      console.warn(`[Worker] ${projectId}: failed to save county discrepancies: ${discErr.message}`);
    } else {
      console.log(`[Worker] ${projectId}: saved ${discInserts.length} county discrepancy/ies to Supabase`);
    }
  }
}

// ── Health Check ───────────────────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // Check Playwright
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    await browser.close();
    checks.playwright = { status: 'ok' };
  } catch (err) {
    checks.playwright = { status: 'error', detail: err instanceof Error ? err.message : String(err) };
  }

  // Check Supabase
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      checks.supabase = { status: response.ok ? 'ok' : 'error', detail: `HTTP ${response.status}` };
    } else {
      checks.supabase = { status: 'unconfigured' };
    }
  } catch (err) {
    checks.supabase = { status: 'error', detail: err instanceof Error ? err.message : String(err) };
  }

  // Check Anthropic key format
  const apiKey = process.env.ANTHROPIC_API_KEY;
  checks.anthropic = apiKey
    ? { status: apiKey.startsWith('sk-') ? 'ok' : 'warning', detail: 'Key present' }
    : { status: 'unconfigured' };

  const allOk = Object.values(checks).every((c) => c.status === 'ok' || c.status === 'unconfigured');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    version: '5.1.0',
    uptime: process.uptime(),
    activePipelines: activePipelines.size,
    completedResults: completedResults.size,
    checks,
  });
});

// ── POST /research/validate-address ───────────────────────────────────────
// Pre-flight check: verify the address and county match before starting the
// full pipeline. Returns immediately with validation result.
// The frontend should call this before starting research.

app.post('/research/validate-address', requireAuth, async (req: Request, res: Response) => {
  const { address, county } = req.body as { address?: string; county?: string };

  if (!address || !county) {
    res.status(400).json({
      valid: false,
      error: {
        code: !address ? 'MISSING_ADDRESS' : 'MISSING_COUNTY',
        message: !address
          ? 'Property address is required.'
          : 'County is required.',
      },
    });
    return;
  }

  try {
    const validationError = await validateAddressCounty(address, county);

    if (!validationError) {
      res.json({
        valid: true,
        address,
        county,
        message: 'Address and county match.',
      });
      return;
    }

    res.status(422).json({
      valid: false,
      error: validationError,
    });
  } catch (err) {
    res.status(500).json({
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
  }
});

// ── POST /research/property-lookup ─────────────────────────────────────────

app.post('/research/property-lookup', requireAuth, (req: Request, res: Response) => {
  const body = req.body as Partial<PipelineInput> & { userFiles?: unknown };

  const { projectId, address, county, state, propertyId, ownerName, userFiles } = body;

  // Validate input: address and county are both required
  if (!projectId) {
    res.status(400).json({ error: 'Missing required field: projectId' });
    return;
  }

  if (!address) {
    res.status(400).json({
      error: 'Missing required field: address',
      hint: 'A property address is required to start research.',
    });
    return;
  }

  if (!county) {
    res.status(400).json({
      error: 'Missing required field: county',
      hint: 'A Texas county name is required. The address and county will be verified to match.',
    });
    return;
  }

  // Check for duplicate pipeline
  if (activePipelines.has(projectId)) {
    res.status(409).json({
      error: `Pipeline already running for project ${projectId}`,
      startedAt: activePipelines.get(projectId)!.startedAt,
    });
    return;
  }

  // Validate and parse user files
  let parsedUserFiles: UserFile[] | undefined;
  if (Array.isArray(userFiles) && userFiles.length > 0) {
    parsedUserFiles = [];
    for (const file of userFiles) {
      if (file && typeof file === 'object' && 'filename' in file && 'data' in file) {
        // `file` is narrowed from `unknown` via property guards above; the
        // double-cast to Record<string, unknown> lets us safely read arbitrary
        // keys before constructing the typed UserFile below.
        const f = file as unknown as Record<string, unknown>;
        parsedUserFiles.push({
          filename: String(f.filename),
          mimeType: String(f.mimeType ?? 'application/octet-stream'),
          data: String(f.data),
          size: typeof f.size === 'number' ? f.size : String(f.data ?? '').length,
          description: typeof f.description === 'string' ? f.description : undefined,
        });
      }
    }
    if (parsedUserFiles.length === 0) parsedUserFiles = undefined;
  }

  // Build unified input — works for any Texas county
  const researchInput: CountyResearchInput = {
    projectId,
    county,
    state: state ?? 'TX',
    address: address ?? undefined,
    propertyId: propertyId ?? undefined,
    ownerName: ownerName ?? undefined,
    uploadedFiles: parsedUserFiles?.map(f => ({
      name: f.filename,
      mimeType: f.mimeType,
      content: f.data,
      description: f.description,
    })),
  };

  // Register active pipeline — clear any stale completed result so that
  // the status endpoint returns "running" (not the old failed/complete result)
  // while this new run is in progress.
  completedResults.delete(projectId);
  completedResultsCachedAt.delete(projectId);
  // Also clear any stale running-message from a previous run so that a
  // crash/abort that didn't clean up doesn't bleed into the new run's status.
  clearRunningMessage(projectId);
  const pipelineAbortController = new AbortController();
  activePipelines.set(projectId, {
    projectId,
    address: researchInput.address ?? '',
    county,
    state: researchInput.state ?? 'TX',
    startedAt: new Date().toISOString(),
    currentStage: 'Routing',
    abortController: pipelineAbortController,
  });

  // Initialize the timeline tracker for this pipeline run so every log entry
  // and phase transition is captured as a granular timeline event for the
  // Testing Lab's ExecutionTimeline + CodeViewer.
  const timeline = getTracker(projectId);
  timeline.add('phase-start', 'Pipeline started', `${county} County — ${researchInput.address ?? ''}`);

  // Enable function-level tracing when the request came from the Testing Lab.
  // testMode is set by the run proxy route's workerBody.
  if ((body as Record<string, unknown>).testMode) enableTracing();

  console.log(
    `[Worker] ${projectId}: pipeline START — county="${county}" address="${researchInput.address ?? ''}" propertyId="${researchInput.propertyId ?? ''}" ownerName="${researchInput.ownerName ?? ''}" files=${parsedUserFiles?.length ?? 0}`,
  );

  // ── Mark project as 'analyzing' in DB immediately so that page refreshes
  // during the run still land on Stage 2 (Research & Analysis) instead of
  // reverting to Stage 1 (Property Information / configure).
  getSupabase()
    .then(async (supabase) => {
      if (!supabase) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('research_projects')
        .update({
          status: 'analyzing',
          research_status: 'running',
          research_message: `Pipeline started for ${county} County`,
        })
        .eq('id', projectId);
      if (error) {
        console.warn(`[Worker] ${projectId}: failed to set status=analyzing at start: ${error.message}`);
      } else {
        console.log(`[Worker] ${projectId}: status set to 'analyzing' in DB (pipeline started)`);
      }
    })
    .catch((err: unknown) => {
      console.warn(`[Worker] ${projectId}: error setting status=analyzing:`, err instanceof Error ? err.message : String(err));
    });

  // ── Handshake logger — emits visible phase-transition entries into the live
  // log registry so the frontend's log viewer can confirm pipeline progress.
  const handshakeLogger = new PipelineLogger(projectId);
  // Emit an initial "pipeline started" handshake entry
  handshakeLogger.attempt('[Pipeline Lifecycle]', 'handshake', 'Pipeline Started', `county=${county} address=${researchInput.address ?? ''}`)
    .success(0, `[Worker→Frontend] Pipeline starting for ${county} County`);
  console.log(`[Worker] ${projectId} → Frontend: pipeline started handshake emitted`);

  // Return 202 immediately
  res.status(202).json({
    message: 'Pipeline started',
    projectId,
    status: 'running',
    pollUrl: `/research/status/${projectId}`,
    input: {
      address: researchInput.address || undefined,
      county,
      propertyId: researchInput.propertyId,
      ownerName: researchInput.ownerName,
      userFileCount: parsedUserFiles?.length ?? 0,
    },
  });

  // Run research pipeline in background — routes to county-specific or generic
  runCountyResearch(
    researchInput,
    (progress: CountyResearchProgress) => {
      // Update active pipeline stage from progress events
      const pipeline = activePipelines.get(projectId);
      if (pipeline) {
        pipeline.currentStage = progress.phase;
        pipeline.lastUpdate = progress.timestamp;
      }
      // Push the latest phase message to the running-message cache so the status
      // endpoint can return it as the `message` field. Without this, Bell County
      // runs always return `message: undefined` and the frontend stays stuck on
      // "Compiling Resources" (the default when no message is present).
      if (typeof progress.message === 'string' && progress.message) {
        setRunningMessage(projectId, `[${progress.phase}] ${progress.message}`);
      }
      // ── Emit timeline event for each progress update ──
      if (typeof progress.phase === 'string' && typeof progress.message === 'string' && progress.message) {
        const msgLower = progress.message.toLowerCase();
        const isError = msgLower.includes('failed') || msgLower.includes('error');
        const isComplete = msgLower.includes('complete') || msgLower.includes('finished') || msgLower.includes('done');
        const evtType = isError ? 'phase-failed' as const
          : isComplete ? 'phase-complete' as const
          : 'log' as const;
        timeline.add(evtType, progress.phase, progress.message.slice(0, 200));
      }

      // ── Log each county progress event as a detailed LayerAttempt entry ──
      // These appear in the live log registry and are persisted to Supabase,
      // so the review page's log viewer shows the full pipeline activity.
      // Using the phase as the 'layer' and 'info' as the source so the
      // frontend visibleLogs filter does NOT exclude them (it only excludes
      // entries with source='handshake' and layer='[Pipeline Phase]').
      if (typeof progress.phase === 'string' && typeof progress.message === 'string' && progress.message) {
        const truncated = progress.message.slice(0, 200);
        // Determine status from message content
        const msgLower = progress.message.toLowerCase();
        const builder = handshakeLogger.attempt(progress.phase, 'info', progress.phase, truncated);
        if (msgLower.includes('failed') || msgLower.includes('error') || msgLower.includes('crash')) {
          builder.fail(truncated);
        } else if (msgLower.includes('warn') || msgLower.includes('⚠') || msgLower.includes('skip') || msgLower.includes('not found') || msgLower.includes('no data')) {
          builder.warn(truncated);
        } else {
          builder.success(0, truncated);
        }
        console.log(`[Worker] ${projectId} → log: phase="${progress.phase}" msg="${truncated.slice(0, 80)}"`);
      }
    },
    pipelineAbortController.signal,
  )
    .then(async (unifiedResult) => {
      // Emit pipeline-complete timeline event
      timeline.add('phase-complete', 'Pipeline complete', `${county} County research finished`);
      disableTracing();

      setCompletedResult(projectId, unifiedResult);
      activePipelines.delete(projectId);
      // Clear the running-message cache — the pipeline has finished.
      // For generic pipelines this is already done inside runPipeline(); for
      // county-specific pipelines (Bell etc.) the progress callback calls
      // setRunningMessage on every event but nothing ever clears it.
      clearRunningMessage(projectId);
      // ── Handshake: emit a pipeline-complete entry so the final poll sees it
      handshakeLogger.attempt('[Pipeline Lifecycle]', 'handshake', 'Pipeline Complete',
        unifiedResult.resultType === 'generic-pipeline'
          ? `status=${unifiedResult.data.status} docs=${unifiedResult.data.documents?.length ?? 0}`
          : `status=complete county=${unifiedResult.county}`)
        .success(0, `[Worker→Frontend] Pipeline finished — results ready`);
      console.log(`[Worker] ${projectId} → Frontend: pipeline complete handshake emitted`);

      // ── Save verification handshake entries (captured before live-log clear) ──
      // Emit structured entries announcing what will be saved to the review DB.
      // These are captured below in capturedLiveLog so the frontend log viewer
      // can show them when the user loads the review page.
      if (unifiedResult.resultType === 'generic-pipeline') {
        const rv = unifiedResult.data;
        const docsToSave = rv.documents?.filter((d) => !d.fromUserUpload).length ?? 0;
        const hasReport  = !!rv.masterReportText;
        const ocrCount   = rv.documents?.filter((d) => d.ocrText).length ?? 0;
        const aiCount    = rv.documents?.filter((d) => d.extractedData).length ?? 0;
        const urlCount   = rv.documents?.filter((d) => d.ref?.url).length ?? 0;
        handshakeLogger.attempt('[Save Check]', 'info', 'Persisting Documents',
          `${docsToSave} research documents → review database`)
          .success(docsToSave,
            docsToSave > 0
              ? `Saving ${docsToSave} documents to review DB (OCR: ${ocrCount}, AI extracted: ${aiCount}, source URLs: ${urlCount})`
              : '⚠ No documents to save — pipeline found 0 documents from research sources');
        if (hasReport) {
          handshakeLogger.attempt('[Save Check]', 'info', 'Persisting AI Summary',
            `masterReportText: ${rv.masterReportText!.length} chars`)
            .success(1, `AI master report (${rv.masterReportText!.length} chars) saved to analysis_metadata`);
        } else {
          handshakeLogger.attempt('[Save Check]', 'warn', 'No AI Summary',
            'masterReportText is empty')
            .warn('⚠ No master report text — Stage 5/6 may have been skipped or failed. Review summary will show auto-generated fallback.');
        }
        console.log(
          `[Worker] ${projectId}: save check — docs=${docsToSave} hasReport=${hasReport} ocr=${ocrCount} aiExtracted=${aiCount} urls=${urlCount}`,
        );
      }

      if (unifiedResult.resultType === 'generic-pipeline') {
        // For generic pipelines, capture live log before clearing — the summary
        // entries were already emitted above in the save-check section.
        const capturedLiveLog = getLiveLogForProject(projectId) ?? [];
        clearLiveLogForProject(projectId);
        const r = unifiedResult.data;
        const durationSec = (r.duration_ms / 1000).toFixed(1);
        console.log(
          `[Worker] ${projectId} (${county}, generic): COMPLETE status=${r.status.toUpperCase()} duration=${durationSec}s docs=${r.documents?.length ?? 0} logEntries=${r.log?.length ?? 0}`,
        );
        // ── Cache handshake entries so logs endpoint can serve them ──────────
        // capturedLiveLog contains the handshake/save-check entries emitted
        // just before live-log-clear.  Store them in completedLogs so the
        // /research/logs/ endpoint can merge them with result.log.
        if (capturedLiveLog.length > 0) {
          completedLogs.set(projectId, capturedLiveLog);
        }
        // Persist log to Supabase so the frontend can retrieve it after page refresh.
        // Fire-and-forget — a save failure must never affect the completed result.
        if (r.log.length > 0) {
          getSupabase()
            .then((supabase) => {
              if (!supabase) return;
              // `as any` because the Supabase client types haven't been regenerated
              // to include the new `research_logs` column from migration 104.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (supabase as any)
                .from('research_projects')
                .update({ research_logs: r.log })
                .eq('id', projectId);
            })
            .then((dbRes: { error?: { message?: string } } | null | undefined) => {
              if (dbRes?.error) {
                console.warn(`[Worker] ${projectId}: failed to save logs to Supabase: ${dbRes.error.message}`);
              } else {
                console.log(`[Worker] ${projectId}: saved ${r.log.length} log entries to Supabase`);
              }
            })
            .catch((err: unknown) => {
              console.warn(`[Worker] ${projectId}: error saving logs to Supabase:`, err instanceof Error ? err.message : String(err));
            });
        }
        // ── Persist pipeline documents to research_documents table ────────────
        // Save every document the pipeline found so the Review stage can display
        // them after navigating away or refreshing the page.
        // User-uploaded documents (fromUserUpload=true) already exist in the DB
        // from Stage 1 — skip them to avoid duplicates.
        const pipelineDocs = r.documents.filter(d => !d.fromUserUpload);
        if (pipelineDocs.length > 0) {
          getSupabase()
            .then(async (supabase) => {
              if (!supabase) return;
              // Delete documents from any previous pipeline run for this project
              // so a re-run always shows fresh results.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase as any)
                .from('research_documents')
                .delete()
                .eq('research_project_id', projectId)
                .eq('source_type', 'property_search');

              const now = new Date().toISOString();
              const docInserts = pipelineDocs.map((doc) => {
                const ref = doc.ref;
                const instr = ref.instrumentNumber;
                const volPage = ref.volume && ref.page ? `Vol. ${ref.volume}, Pg. ${ref.page}` : null;
                const recordingInfo = [
                  instr ? `Instrument No. ${instr}` : null,
                  volPage,
                ].filter(Boolean).join(' — ') || null;
                const pageCount = (doc.pages?.length ?? doc.pageScreenshots?.length) || null;
                const rawText = doc.ocrText ?? doc.textContent ?? null;
                // Cap at MAX_EXTRACTED_TEXT_LENGTH chars to stay within DB limits
                const extractedText = rawText ? rawText.slice(0, MAX_EXTRACTED_TEXT_LENGTH) : null;
                // Build a descriptive label: "Warranty Deed - Smith to Jones (Instr. 12345)"
                const grantorStr = ref.grantors?.length ? ref.grantors.slice(0, 2).join(', ') : null;
                const granteeStr = ref.grantees?.length ? ref.grantees.slice(0, 2).join(', ') : null;
                const partyStr = grantorStr && granteeStr ? ` — ${grantorStr} to ${granteeStr}` : (grantorStr ? ` — ${grantorStr}` : '');
                const instrStr = instr ? ` (Instr. ${instr})` : '';
                const docLabel = `${ref.documentType || 'Document'}${partyStr}${instrStr}`;

                return {
                  research_project_id: projectId,
                  source_type: 'property_search',
                  original_filename: docLabel,
                  file_type: doc.imageFormat ?? 'pdf',
                  document_type: normDocType(ref.documentType),
                  document_label: ref.documentType || 'Document',
                  recording_info: recordingInfo,
                  recorded_date: ref.recordingDate ?? null,
                  extracted_text: extractedText,
                  processing_status: 'analyzed',
                  page_count: pageCount ?? null,
                  source_url: ref.url ?? null,
                  ocr_confidence: doc.extractedData?.confidence ?? null,
                  created_at: now,
                  updated_at: now,
                };
              });

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error: docsErr } = await (supabase as any)
                .from('research_documents')
                .insert(docInserts);
              if (docsErr) {
                console.warn(`[Worker] ${projectId}: failed to save pipeline docs: ${docsErr.message}`);
              } else {
                console.log(`[Worker] ${projectId}: saved ${docInserts.length} pipeline documents to Supabase`);
              }
            })
            .catch((err: unknown) => {
              console.warn(`[Worker] ${projectId}: error saving pipeline docs:`, err instanceof Error ? err.message : String(err));
            });
        }

        // ── Persist result summary to analysis_metadata ────────────────────
        // The Review stage reads project.analysis_metadata.result.* to render
        // the Summary tab (owner, legal desc, boundary, acreage, final summary).
        // Merge with existing metadata so user-authored job_notes are preserved.
        getSupabase()
          .then(async (supabase) => {
            if (!supabase) return;
            // Fetch current metadata to preserve job_notes
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: existingRow } = await (supabase as any)
              .from('research_projects')
              .select('analysis_metadata')
              .eq('id', projectId)
              .single();
            const currentMeta = (existingRow?.analysis_metadata as Record<string, unknown>) ?? {};

            // Build auto-summary if Stage 6 master report is not available
            const parts: string[] = [];
            if (r.ownerName) parts.push(`Owner: ${r.ownerName}`);
            if (r.propertyId) parts.push(`Property ID: ${r.propertyId}`);
            if (r.acreage) parts.push(`Acreage: ${r.acreage} ac`);
            if (r.legalDescription) parts.push(`Legal Description: ${r.legalDescription.slice(0, 300)}`);
            if (r.documents.length > 0) parts.push(`${r.documents.length} document(s) found and analyzed`);
            if (r.boundary?.calls?.length) parts.push(`${r.boundary.calls.length} boundary call(s) extracted`);
            if (r.boundary?.confidence) parts.push(`Confidence: ${Math.round(r.boundary.confidence * 100)}%`);
            const autoSummary = parts.length > 0 ? parts.join('\n') : 'Research pipeline completed.';

            const updatedMeta: Record<string, unknown> = {
              ...currentMeta,
              result: {
                ownerName: r.ownerName ?? null,
                propertyId: r.propertyId ?? null,
                geoId: r.geoId ?? null,
                legalDescription: r.legalDescription ?? null,
                acreage: r.acreage ?? null,
                documentCount: r.documents.length,
                duration_ms: r.duration_ms,
                boundary: r.boundary ? {
                  type: r.boundary.type,
                  callCount: r.boundary.calls.length,
                  referenceCount: r.boundary.references.length,
                  confidence: r.boundary.confidence,
                  lotBlock: r.boundary.lotBlock,
                  area: r.boundary.area,
                  verified: r.boundary.verified ?? false,
                } : null,
                validation: r.validation ?? null,
                // finalSummary is what the Summary tab renders as "Research Summary"
                finalSummary: r.masterReportText ?? autoSummary,
                masterReportText: r.masterReportText ?? null,
              },
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: metaErr } = await (supabase as any)
              .from('research_projects')
              .update({ analysis_metadata: updatedMeta })
              .eq('id', projectId);
            if (metaErr) {
              console.warn(`[Worker] ${projectId}: failed to save analysis_metadata: ${metaErr.message}`);
            } else {
              console.log(`[Worker] ${projectId}: saved analysis_metadata to Supabase`);
            }
          })
          .catch((err: unknown) => {
            console.warn(`[Worker] ${projectId}: error saving analysis_metadata:`, err instanceof Error ? err.message : String(err));
          });

        // Update project status to 'review' in Supabase so a page-refresh still
        // lands the user on Stage 3 after the pipeline finishes.
        if (r.status === 'complete' || r.status === 'partial') {
          getSupabase()
            .then(async (supabase) => {
              if (!supabase) return;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error } = await (supabase as any)
                .from('research_projects')
                .update({
                  status: 'review',
                  research_status: 'complete',
                  research_message: isCreditDepleted()
                    ? `Pipeline completed in ${(r.duration_ms / 1000).toFixed(1)}s — ⚠ AI CREDITS DEPLETED: Some analysis was skipped. Add funds at console.anthropic.com/settings/billing and re-run.`
                    : `Pipeline completed in ${(r.duration_ms / 1000).toFixed(1)}s`,
                })
                .eq('id', projectId);
              if (error) {
                console.warn(`[Worker] ${projectId}: failed to set status=review: ${error.message}`);
              } else {
                console.log(`[Worker] ${projectId}: status set to 'review' in Supabase`);
              }
            })
            .catch((err: unknown) => {
              console.warn(`[Worker] ${projectId}: error setting status=review:`, err instanceof Error ? err.message : String(err));
            });
        }
      } else {
        const r = unifiedResult.data;
        const durationSec = (r.durationMs / 1000).toFixed(1);
        const errorCount = r.errors?.length ?? 0;
        console.log(
          `[Worker] ${projectId} (${county}, county-specific): COMPLETE duration=${durationSec}s errors=${errorCount} confidence=${r.overallConfidence?.score?.toFixed(2) ?? r.overallConfidence?.tier ?? 'n/a'}`,
        );

        // ── Emit county-specific completion summary log entries ──────────────
        // These are structured entries that appear in the review log viewer
        // alongside the progress entries emitted during the pipeline run.
        const deedCount = r.deedsAndRecords?.records?.length ?? 0;
        const platCount = r.plats?.plats?.length ?? 0;
        const easementCount = r.easementsAndEncumbrances?.easements?.length ?? 0;
        const femaResult = r.easementsAndEncumbrances?.fema;
        const txdotResult = r.easementsAndEncumbrances?.txdot;
        const discrepancyCount = r.discrepancies?.length ?? 0;
        const screenshotCount = r.screenshots?.length ?? 0;

        handshakeLogger.attempt('Results', 'info', 'Documents Found', `${deedCount} deeds, ${platCount} plats`)
          .success(deedCount + platCount, `${deedCount} deed record(s) and ${platCount} plat record(s) retrieved from county clerk`);

        if (femaResult) {
          handshakeLogger.attempt('Results', 'info', 'FEMA Flood Zone', `Zone: ${femaResult.floodZone}`)
            .success(1, `Flood zone: ${femaResult.floodZone}${femaResult.inSFHA ? ' — IN Special Flood Hazard Area' : ''}`);
        }
        if (txdotResult) {
          handshakeLogger.attempt('Results', 'info', 'TxDOT ROW', `Highway: ${txdotResult.highwayName ?? 'unnamed'}`)
            .success(1, `TxDOT ROW: ${txdotResult.highwayName ?? 'unnamed'}${txdotResult.rowWidth ? ` — ${txdotResult.rowWidth}ft wide` : ''}`);
        }
        if (easementCount > 0) {
          handshakeLogger.attempt('Results', 'info', 'Easements', `${easementCount} found`)
            .success(easementCount, `${easementCount} easement record(s) identified from deed records`);
        }
        if (discrepancyCount > 0) {
          handshakeLogger.attempt('Results', 'warn', 'Discrepancies', `${discrepancyCount} flagged`)
            .warn(`${discrepancyCount} discrepancy/ies detected between data sources`);
        }
        if (screenshotCount > 0) {
          handshakeLogger.attempt('Results', 'info', 'Screenshots', `${screenshotCount} captured`)
            .success(screenshotCount, `${screenshotCount} screenshot(s) captured from research sources`);
          // Emit individual screenshot timeline events so the Testing Lab can
          // display them in the OutputViewer as they're captured.
          for (const ss of r.screenshots) {
            const label = ss.description || ss.source || ss.url.split('/').pop();
            timeline.screenshot(ss.url, label);
          }
        }

        // AI analysis summary
        const platsWithAI = r.plats?.plats?.filter(p => p.aiAnalysis)?.length ?? 0;
        const totalBearings = r.plats?.plats?.reduce((n, p) => n + (p.aiAnalysis?.bearingsAndDistances?.length ?? 0), 0) ?? 0;
        const totalMonuments = r.plats?.plats?.reduce((n, p) => n + (p.aiAnalysis?.monuments?.length ?? 0), 0) ?? 0;
        if (platsWithAI > 0) {
          handshakeLogger.attempt('Results', 'info', 'AI Plat Analysis', `${platsWithAI} plat(s) analyzed`)
            .success(totalBearings + totalMonuments, `AI extracted ${totalBearings} bearing/distance call(s) and ${totalMonuments} monument(s) from ${platsWithAI} plat image(s)`);
        } else if (platCount > 0) {
          handshakeLogger.attempt('Results', 'warn', 'AI Plat Analysis', 'No plats analyzed')
            .warn(`${platCount} plat(s) found but AI analysis failed — check if sharp is installed on the worker`);
        }

        // ── Credit depletion warning ──────────────────────────────────────
        // If AI credits ran out during the pipeline, emit a prominent warning
        // in the log so the user can see exactly what happened.
        if (r.creditDepleted || isCreditDepleted()) {
          console.error(`[Worker] ${projectId}: AI CREDIT DEPLETION — pipeline completed with partial AI results`);
          handshakeLogger.attempt('CREDIT ERROR', 'warn', 'AI Credits Depleted',
            'Anthropic API credit balance too low')
            .fail('AI CREDIT BALANCE DEPLETED — Some analysis steps were skipped because your Anthropic API credits ran out. Please add funds at console.anthropic.com/settings/billing, then re-run research for complete results.');
        }

        // Final summary entry
        handshakeLogger.attempt('Results', 'info', 'Pipeline Complete',
          `Confidence: ${r.overallConfidence?.tier ?? 'unknown'} (${r.overallConfidence?.score ?? 0}/100)`)
          .success(0, `Pipeline completed in ${durationSec}s — ${deedCount + platCount} documents, ${errorCount} error(s), confidence: ${r.overallConfidence?.tier ?? 'unknown'} (${r.overallConfidence?.score ?? 0}/100)`);

        // ── Capture live logs NOW (after summary entries) and cache ──────────
        // capturedLiveLog includes ALL entries: progress events from the
        // pipeline run + the summary entries emitted above. The live log
        // registry is then cleared so it doesn't leak memory.
        const capturedLiveLog = getLiveLogForProject(projectId) ?? [];
        clearLiveLogForProject(projectId);

        if (capturedLiveLog.length > 0) {
          completedLogs.set(projectId, capturedLiveLog);
        }

        // ── Persist live logs to Supabase for county-specific pipelines ────────
        // These are the entries shown in the live log viewer; we persist them so
        // the Review stage can reload them on page refresh.
        const logsToSave = capturedLiveLog.length > 0 ? capturedLiveLog : [];
        console.log(`[Worker] ${projectId}: persisting ${logsToSave.length} live log entries to Supabase`);
        if (logsToSave.length > 0) {
          getSupabase()
            .then((supabase) => {
              if (!supabase) return;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (supabase as any)
                .from('research_projects')
                .update({ research_logs: logsToSave })
                .eq('id', projectId);
            })
            .catch((err: unknown) => {
              console.warn(`[Worker] ${projectId}: error saving county logs to Supabase:`, err instanceof Error ? err.message : String(err));
            });
        }

        // ── Persist results to Supabase ────────────────────────────────────────
        // The Review stage reads from analysis_metadata and research_documents.
        // Without this, all Bell County results are only in memory and disappear
        // on page refresh.
        persistCountyResults(projectId, r).catch((err: unknown) => {
          console.warn(`[Worker] ${projectId}: persistCountyResults error:`, err instanceof Error ? err.message : String(err));
        });

        // ── Update project status to 'review' ─────────────────────────────────
        getSupabase()
          .then(async (supabase) => {
            if (!supabase) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
              .from('research_projects')
              .update({
                status: 'review',
                research_status: 'complete',
                research_message: (r.creditDepleted || isCreditDepleted())
                  ? `Pipeline completed in ${durationSec}s — ⚠ AI CREDITS DEPLETED: Some analysis was skipped. Add funds at console.anthropic.com/settings/billing and re-run.`
                  : `Pipeline completed in ${durationSec}s`,
              })
              .eq('id', projectId);
            if (error) {
              console.warn(`[Worker] ${projectId}: failed to set status=review (county-specific): ${error.message}`);
            } else {
              console.log(`[Worker] ${projectId}: status set to 'review' in Supabase (county-specific)`);
            }
          })
          .catch((err: unknown) => {
            console.warn(`[Worker] ${projectId}: error setting status=review (county-specific):`, err instanceof Error ? err.message : String(err));
          });
      }
    })
    .catch((err) => {
      // Emit pipeline-failed timeline event
      disableTracing();
      const crashMsg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
      timeline.add('phase-failed', 'Pipeline failed', crashMsg.slice(0, 200));

      const isAborted = err instanceof DOMException && err.name === 'AbortError';
      const isCreditError = err instanceof AnthropicCreditDepletedError || isCreditDepleted();
      if (isAborted) {
        console.log(`[Worker] ${projectId}: pipeline CANCELLED by user`);
        handshakeLogger.attempt('[Pipeline Lifecycle]', 'handshake', 'Pipeline Cancelled', 'User requested cancellation')
          .warn(`[Worker→Frontend] Pipeline cancelled by user`);
      } else if (isCreditError) {
        console.error(`[Worker] ${projectId}: pipeline FAILED — AI CREDITS DEPLETED`);
        handshakeLogger.attempt('CREDIT ERROR', 'warn', 'AI Credits Depleted', 'Pipeline failed due to credit depletion')
          .fail('AI CREDIT BALANCE DEPLETED — The research pipeline could not complete because your Anthropic API credits ran out. Please add funds at console.anthropic.com/settings/billing, then re-run research.');
        // Persist credit depletion status to DB so the frontend shows it on refresh
        getSupabase()
          .then(async (supabase) => {
            if (!supabase) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from('research_projects')
              .update({
                status: 'configure',
                research_status: 'failed',
                research_message: 'AI CREDITS DEPLETED — Please add funds to your Anthropic account at console.anthropic.com/settings/billing, then re-run research.',
              })
              .eq('id', projectId);
          })
          .catch(() => { /* best-effort */ });
      } else {
        console.error(`[Worker] ${projectId} CRASH:`, err);
      }
      const errMessage = isAborted
        ? 'Pipeline cancelled by user'
        : isCreditError
          ? 'AI credit balance depleted. Please add funds to your Anthropic account and re-run research.'
          : (err instanceof Error
            ? (err.message || `${err.constructor?.name ?? 'Error'}: (no message)`)
            : String(err ?? 'Unknown error'));
      if (!isAborted && !isCreditError) {
        // Emit a failure handshake so the frontend log shows the crash reason
        handshakeLogger.attempt('[Pipeline Lifecycle]', 'handshake', 'Pipeline Failed', errMessage.slice(0, 160))
          .fail(`[Worker→Frontend] Pipeline crashed: ${errMessage.slice(0, 120)}`);
        console.log(`[Worker] ${projectId} → Frontend: pipeline failure handshake emitted`);
      }
      const fallback: PipelineResult = {
        projectId,
        status: 'failed',
        propertyId: null,
        geoId: null,
        ownerName: null,
        legalDescription: null,
        acreage: null,
        documents: [],
        boundary: null,
        validation: null,
        log: [{ layer: 'Pipeline', source: isAborted ? 'cancelled' : 'crash', method: isAborted ? 'user-cancel' : 'unhandled', input: '', status: 'fail', duration_ms: 0, dataPointsFound: 0, error: errMessage, timestamp: new Date().toISOString() }],
        duration_ms: 0,
        failureReason: errMessage,
      };
      setCompletedResult(projectId, { resultType: 'generic-pipeline', county, data: fallback });
      activePipelines.delete(projectId);
      clearLiveLogForProject(projectId);
      clearRunningMessage(projectId);
      if (!isAborted) {
        console.error(`[Worker] ${projectId}: pipeline crash recorded — failureReason="${errMessage.slice(0, 120)}"`);
      }
    });
});

// ── GET /research/logs/:projectId ──────────────────────────────────────────
// Returns the persisted log for a completed pipeline run.  When the result is
// still cached in-memory the log is served from there.  Otherwise the worker
// falls back to reading `research_logs` from Supabase (saved on completion).

app.get('/research/logs/:projectId', requireAuth, async (req: Request, res: Response) => {
  const { projectId } = req.params;

  // Fast path: still in-memory cache
  if (completedResults.has(projectId)) {
    const unified = completedResults.get(projectId)!;
    if (unified.resultType === 'generic-pipeline') {
      // Merge pipeline log (result.log) with handshake/save-check entries
      // captured at completion (stored in completedLogs for generic pipelines).
      const pipelineLog = unified.data.log ?? [];
      const handshakeEntries = completedLogs.get(projectId) ?? [];
      const mergedLog = handshakeEntries.length > 0
        ? [...pipelineLog, ...handshakeEntries]
        : pipelineLog;
      res.json({ projectId, log: mergedLog });
    } else {
      // County-specific results: serve from the in-memory cache populated at completion.
      res.json({ projectId, log: completedLogs.get(projectId) ?? [] });
    }
    return;
  }

  // Slow path: read from Supabase persisted column
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      res.status(503).json({ error: 'Supabase not configured' });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('research_projects')
      .select('research_logs')
      .eq('id', projectId)
      .single();
    if (error || !data) {
      res.status(404).json({ error: `No log found for project ${projectId}` });
      return;
    }
    res.json({ projectId, log: data.research_logs ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /research/status/:projectId ────────────────────────────────────────

app.get('/research/status/:projectId', requireAuth, async (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (completedResults.has(projectId)) {
    const unified = completedResults.get(projectId)!;

    if (unified.resultType === 'generic-pipeline') {
      // Generic pipeline result — existing response format
      const result = unified.data;
      res.json({
        projectId,
        resultType: 'generic-pipeline',
        county: unified.county,
        status: result.status,
        result: {
          propertyId: result.propertyId,
          geoId: result.geoId,
          ownerName: result.ownerName,
          legalDescription: result.legalDescription,
          acreage: result.acreage,
          documentCount: result.documents.length,
          boundary: result.boundary ? {
            type: result.boundary.type,
            callCount: result.boundary.calls.length,
            referenceCount: result.boundary.references.length,
            confidence: result.boundary.confidence,
            lotBlock: result.boundary.lotBlock,
            area: result.boundary.area,
            verified: result.boundary.verified,
          } : null,
          validation: result.validation,
          duration_ms: result.duration_ms,
          searchDiagnostics: result.searchDiagnostics,
        },
        documents: result.documents.map((d) => ({
          ref: d.ref,
          hasText: !!d.textContent,
          textLength: d.textContent?.length ?? 0,
          hasImage: !!d.imageBase64 || (d.pages?.length ?? 0) > 0 || (d.pageScreenshots?.length ?? 0) > 0,
          hasOcr: !!d.ocrText,
          pageCount: d.pages?.length ?? d.pageScreenshots?.length ?? 0,
          /** Public PDF URL for embedded viewer — null if not uploaded yet */
          pagesPdfUrl: d.pagesPdfUrl ?? null,
          fromUserUpload: d.fromUserUpload ?? false,
          processingErrors: d.processingErrors,
          extractedData: d.extractedData ? {
            type: d.extractedData.type,
            callCount: d.extractedData.calls.length,
            confidence: d.extractedData.confidence,
            lotBlock: d.extractedData.lotBlock,
            verified: d.extractedData.verified,
          } : null,
        })),
        log: completedLogs.has(projectId)
          ? [...result.log, ...completedLogs.get(projectId)!]
          : result.log,
        timeline: getTrackerIfExists(projectId)?.getEntries() ?? [],
        failureReason: result.failureReason,
        masterReportText: result.masterReportText,
      });
    } else {
      // County-specific result — richer data structure
      const result = unified.data;
      res.json({
        projectId,
        resultType: 'county-specific',
        county: unified.county,
        status: 'complete',
        result: {
          researchId: result.researchId,
          propertyId: result.property.propertyId,
          ownerName: result.property.ownerName,
          legalDescription: result.property.legalDescription,
          acreage: result.property.acreage,
          situsAddress: result.property.situsAddress,
          overallConfidence: result.overallConfidence,
          durationMs: result.durationMs,
        },
        sections: {
          property: result.property,
          deedsAndRecords: {
            summary: result.deedsAndRecords.summary,
            recordCount: result.deedsAndRecords.records.length,
            chainOfTitleLength: result.deedsAndRecords.chainOfTitle.length,
            confidence: result.deedsAndRecords.confidence,
          },
          plats: {
            summary: result.plats.summary,
            platCount: result.plats.plats.length,
            confidence: result.plats.confidence,
          },
          easementsAndEncumbrances: {
            summary: result.easementsAndEncumbrances.summary,
            hasFema: !!result.easementsAndEncumbrances.fema,
            hasTxdot: !!result.easementsAndEncumbrances.txdot,
            easementCount: result.easementsAndEncumbrances.easements.length,
            confidence: result.easementsAndEncumbrances.confidence,
          },
          discrepancies: result.discrepancies,
          adjacentPropertyCount: result.adjacentProperties.length,
        },
        researchedLinks: result.researchedLinks,
        errors: result.errors,
        screenshotCount: result.screenshots.length,
        aiUsage: result.aiUsage,
        log: completedLogs.get(projectId) ?? [],
        timeline: getTrackerIfExists(projectId)?.getEntries() ?? [],
      });
    }
    return;
  }

  if (activePipelines.has(projectId)) {
    const pipeline = activePipelines.get(projectId)!;

    // If the abort controller has been triggered, report 'failed' (cancelled)
    // immediately — don't wait for the async pipeline unwinding to finish.
    if (pipeline.abortController?.signal.aborted) {
      const liveLog = getLiveLogForProject(projectId) ?? [];
      console.log(`[Worker] ${projectId} → Frontend: status poll — pipeline ABORTED, reporting failed`);
      res.json({
        projectId,
        status: 'failed',
        failureReason: 'Pipeline cancelled by user',
        startedAt: pipeline.startedAt,
        currentStage: pipeline.currentStage,
        message: 'Pipeline cancelled by user',
        address: pipeline.address,
        county: pipeline.county,
        log: liveLog,
        timeline: getTrackerIfExists(projectId)?.getEntries() ?? [],
      });
      return;
    }

    // Prefer the in-memory message cache (updated synchronously by updateStatus
    // in pipeline.ts) over a Supabase round-trip. This ensures the UI sees live
    // stage updates immediately even when Supabase is slow or not configured,
    // which was the primary cause of the stepper appearing permanently "stuck".
    let message: string | undefined = getRunningMessage(projectId);

    if (!message) {
      // Fallback: read from Supabase (covers cross-process / restarted-worker cases)
      try {
        const supabase = await getSupabase();
        if (supabase) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from('research_projects')
            .select('research_message')
            .eq('id', projectId)
            .single();
          if (data?.research_message) message = String(data.research_message);
        }
      } catch { /* non-fatal — return without message */ }
    }

    const liveLog = getLiveLogForProject(projectId) ?? [];
    // Log a confirmation that we're actively sending live data to the frontend
    console.log(`[Worker] ${projectId} → Frontend: status poll — stage="${pipeline.currentStage ?? 'unknown'}" logEntries=${liveLog.length} msg="${(message ?? '').slice(0, 60)}"`);

    // Include timeline events for the Testing Lab's ExecutionTimeline
    const timelineEntries = getTrackerIfExists(projectId)?.getEntries() ?? [];

    res.json({
      projectId,
      status: 'running',
      startedAt: pipeline.startedAt,
      currentStage: pipeline.currentStage,
      message,
      address: pipeline.address,
      county: pipeline.county,
      log: liveLog,
      timeline: timelineEntries,
    });
    return;
  }

  res.status(404).json({ error: `No pipeline found for project ${projectId}` });
});

// ── GET /research/result/:projectId/full ───────────────────────────────────

app.get('/research/result/:projectId/full', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!completedResults.has(projectId)) {
    res.status(404).json({ error: `No completed result for project ${projectId}` });
    return;
  }

  const unified = completedResults.get(projectId)!;

  if (unified.resultType === 'generic-pipeline') {
    const result = unified.data;
    res.json({
      resultType: 'generic-pipeline',
      county: unified.county,
      ...result,
      documents: result.documents.map((d) => ({
        ref: d.ref,
        textContent: d.textContent,
        ocrText: d.ocrText,
        hasImage: !!d.imageBase64,
        imageFormat: d.imageFormat,
        pageCount: d.pages?.length ?? d.pageScreenshots?.length ?? 0,
        pagesPdfUrl: d.pagesPdfUrl ?? null,
        fromUserUpload: d.fromUserUpload,
        processingErrors: d.processingErrors,
        extractedData: d.extractedData,
      })),
    });
  } else {
    // County-specific: return the full result directly
    res.json({
      resultType: 'county-specific',
      county: unified.county,
      ...unified.data,
    });
  }
});

// ── GET /research/active ───────────────────────────────────────────────────

app.get('/research/active', requireAuth, (_req: Request, res: Response) => {
  const active = Array.from(activePipelines.values());
  res.json({ count: active.length, pipelines: active });
});

// ── DELETE /research/result/:projectId ─────────────────────────────────────

app.delete('/research/result/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;
  if (completedResults.has(projectId)) {
    completedResults.delete(projectId);
    completedResultsCachedAt.delete(projectId);
    res.json({ message: `Result for ${projectId} deleted` });
  } else {
    res.status(404).json({ error: `No result found for ${projectId}` });
  }
});

// ── POST /research/cancel/:projectId ──────────────────────────────────────
// Cancel a running pipeline by triggering its AbortController.

app.post('/research/cancel/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!activePipelines.has(projectId)) {
    res.status(404).json({ error: `No active pipeline for project ${projectId}` });
    return;
  }

  const pipeline = activePipelines.get(projectId)!;
  if (pipeline.abortController) {
    pipeline.abortController.abort();
    console.log(`[Worker] ${projectId}: cancel requested — AbortController.abort() called`);
    res.json({ message: `Cancel signal sent for project ${projectId}`, status: 'cancelling' });
  } else {
    // Legacy pipeline without AbortController — force-remove from active
    activePipelines.delete(projectId);
    console.log(`[Worker] ${projectId}: cancel requested — no AbortController, force-removed from active`);
    res.json({ message: `Pipeline force-removed for project ${projectId}`, status: 'removed' });
  }
});

// ── POST /research/pause/:projectId ───────────────────────────────────────
// Pause the timeline tracker for a running pipeline. Note: the pipeline
// itself continues running (we can't pause Playwright mid-action), but the
// timeline tracker adjusts its timestamps so the Testing Lab frontend can
// replay the execution without the pause gap.

app.post('/research/pause/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!activePipelines.has(projectId)) {
    res.status(404).json({ error: `No active pipeline for project ${projectId}` });
    return;
  }

  const tracker = getTracker(projectId);
  if (tracker.isPaused()) {
    res.json({ message: 'Already paused', status: 'paused' });
    return;
  }

  tracker.pause();
  console.log(`[Worker] ${projectId}: timeline PAUSED by user`);
  res.json({ message: `Timeline paused for project ${projectId}`, status: 'paused' });
});

// ── POST /research/resume/:projectId ──────────────────────────────────────
// Resume a paused timeline tracker. Adjusts internal timestamps so the
// paused gap is excluded from the timeline.

app.post('/research/resume/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!activePipelines.has(projectId)) {
    res.status(404).json({ error: `No active pipeline for project ${projectId}` });
    return;
  }

  const tracker = getTracker(projectId);
  if (!tracker.isPaused()) {
    res.json({ message: 'Not paused', status: 'running' });
    return;
  }

  tracker.resume();
  console.log(`[Worker] ${projectId}: timeline RESUMED by user`);
  res.json({ message: `Timeline resumed for project ${projectId}`, status: 'running' });
});

// ── POST /research/discover ────────────────────────────────────────────────
// Phase 1: Universal property discovery across any Texas county CAD system.
// Geocodes the address, selects the appropriate CAD adapter, and returns a
// fully enriched PropertyDetail object.

app.post('/research/discover', requireAuth, async (req: Request, res: Response) => {
  const { address, county, state } = req.body as {
    address?: string;
    county?:  string;
    state?:   string;
  };

  if (!address) {
    res.status(400).json({ error: 'address is required' });
    return;
  }

  try {
    const engine = new PropertyDiscoveryEngine();
    const result = await engine.discover(address, county, state ?? 'TX');
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Discovery failed: ${msg}` });
  }
});

// ── POST /research/harvest ─────────────────────────────────────────────────
// Phase 2: Free document harvesting — multi-county clerk automation.
// Takes Phase 1 PropertyIdentity output and downloads every available free
// document from the county clerk system for the target property, subdivision
// lots, and adjacent owners.
//
// Long-running (up to ~3 minutes).  Returns HTTP 202 immediately.
// Results are persisted to /tmp/harvest/{projectId}/harvest_result.json and
// can be retrieved via GET /research/harvest/:projectId.

app.post('/research/harvest', requireAuth, async (req: Request, res: Response) => {
  const input = req.body as HarvestInput;

  if (!input.projectId || !input.owner || !input.county) {
    res.status(400).json({ error: 'projectId, owner, and county are required' });
    return;
  }

  // countyFIPS is required for clerk adapter routing; default to empty string
  // falls back to TexasFile but we warn so operators can see the gap.
  if (!input.countyFIPS) {
    console.warn(
      `[Harvest] countyFIPS not provided for project ${input.projectId} — ` +
      `falling back to TexasFile universal adapter`,
    );
    input.countyFIPS = '';
  }

  // Validate FIPS format: either empty (TexasFile fallback) or 5-digit Texas code
  if (input.countyFIPS && !/^\d{5}$/.test(input.countyFIPS)) {
    res.status(400).json({ error: 'countyFIPS must be a 5-digit FIPS code (e.g. "48027")' });
    return;
  }

  // Validate projectId to safe characters — prevents path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(input.projectId)) {
    res.status(400).json({
      error: 'projectId may only contain alphanumeric characters, hyphens, and underscores',
    });
    return;
  }

  // Return 202 immediately — harvest runs asynchronously in the background
  res.status(202).json({ status: 'accepted', projectId: input.projectId });

  // Run harvest in background
  const harvester = new DocumentHarvester();
  try {
    const result = await harvester.harvest(input);

    // Persist result to filesystem so the status endpoint can serve it
    try {
      const outputPath = `/tmp/harvest/${input.projectId}/harvest_result.json`;
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    } catch (fsError) {
      console.error(
        `[Harvest] Failed to write result for ${input.projectId} — ` +
        `check /tmp permissions and disk space:`,
        fsError,
      );
    }

    console.log(
      `[Harvest] Complete: ${result.documentIndex.totalDocumentsFound} docs, ` +
      `${result.documentIndex.totalPagesDownloaded} pages`,
    );

    // Sync harvest results to Supabase: insert research_documents rows and
    // upload any downloaded images to Supabase Storage.
    try {
      const syncResult = await syncHarvestToSupabase(input.projectId, result);
      if (syncResult.errors.length > 0) {
        console.warn(
          `[Harvest] Supabase sync completed with ${syncResult.errors.length} warning(s) ` +
          `for ${input.projectId}:`,
          syncResult.errors.slice(0, 5),
        );
      }
      console.log(
        `[Harvest] Supabase sync: ${syncResult.documentsInserted} docs inserted, ` +
        `${syncResult.imagesUploaded} images uploaded for project ${input.projectId}`,
      );
    } catch (syncErr) {
      // Never let a sync failure crash the harvest — the filesystem result is
      // still written above and the frontend can poll for it.
      console.error(`[Harvest] Supabase sync failed for ${input.projectId}:`, syncErr);
    }
  } catch (error) {
    console.error(`[Harvest] Failed for ${input.projectId}:`, error);
  }
});

// ── GET /research/harvest/:projectId ──────────────────────────────────────
// Quick status check — returns the completed harvest result or in_progress.

app.get('/research/harvest/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  // Validate projectId to safe characters — prevents path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const resultPath = `/tmp/harvest/${projectId}/harvest_result.json`;

  if (fs.existsSync(resultPath)) {
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as unknown;
    res.json(result);
  } else {
    res.json({ status: 'in_progress' });
  }
});

// ── POST /research/full-pipeline ───────────────────────────────────────────
// Accepts a project ID + address and runs the full multi-phase research
// pipeline asynchronously in the background.
// Returns HTTP 202 immediately so the client can poll /research/status/:id.

app.post('/research/full-pipeline', requireAuth, (req: Request, res: Response) => {
  const { projectId, address, county, state } = req.body as {
    projectId?: string;
    address?:   string;
    county?:    string;
    state?:     string;
  };

  if (!projectId || !address) {
    res.status(400).json({ error: 'projectId and address are required' });
    return;
  }

  // Return 202 immediately — pipeline runs in background
  res.status(202).json({ status: 'accepted', projectId });

  // Run discovery then hand off to full pipeline asynchronously
  (async () => {
    try {
      const engine = new PropertyDiscoveryEngine();
      await engine.discover(address, county, state ?? 'TX');
      // Phase 2+ pipeline stages would be chained here as they are implemented
    } catch (err) {
      console.error(`[Pipeline] Discovery phase failed for ${projectId}:`, err);
    }
  })();
});

// ── POST /research/reanalyze/:projectId ────────────────────────────────────
// Stage 11: Re-analysis after document acquisition.
// Accepts newly purchased/uploaded documents and re-runs only the affected stages.
// Returns before/after comparison and an updated PipelineResult.

app.post('/research/reanalyze/:projectId', requireAuth, async (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!completedResults.has(projectId)) {
    res.status(404).json({ error: `No completed result for project ${projectId} — run initial pipeline first` });
    return;
  }

  const { runReanalysis } = await import('./services/reanalysis.js');
  type NewDocument = import('./services/reanalysis.js').NewDocument;

  const body = req.body as { documents?: unknown[] };
  if (!Array.isArray(body.documents) || body.documents.length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "documents" array' });
    return;
  }

  // Validate document entries
  const validTypes = ['unwatermarked_plat', 'adjacent_deed', 'txdot_row_map'];
  const newDocs: NewDocument[] = [];
  for (const doc of body.documents) {
    const d = doc as Record<string, unknown>;
    if (!d.type || !validTypes.includes(String(d.type))) {
      res.status(400).json({ error: `Invalid document type "${d.type}" — must be one of: ${validTypes.join(', ')}` });
      return;
    }
    if (!d.data || typeof d.data !== 'string') {
      res.status(400).json({ error: 'Each document must have a base64-encoded "data" field' });
      return;
    }
    newDocs.push({
      type:                   d.type as NewDocument['type'],
      label:                  String(d.label ?? d.type),
      data:                   d.data as string,
      mimeType:               (d.mimeType as NewDocument['mimeType']) ?? 'image/png',
      adjacentPropertyOwner:  d.adjacentPropertyOwner ? String(d.adjacentPropertyOwner) : undefined,
    });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    return;
  }

  const previousUnified = completedResults.get(projectId)!;
  if (previousUnified.resultType !== 'generic-pipeline') {
    res.status(400).json({ error: 'Re-analysis with new documents is only supported for generic pipeline results. County-specific results use their own re-analysis flow.' });
    return;
  }
  const previous = previousUnified.data;
  const previousCounty = previousUnified.county;
  const { PipelineLogger } = await import('./lib/logger.js');
  const logger = new PipelineLogger(projectId);

  try {
    const result = await runReanalysis(previous, newDocs, anthropicApiKey, logger);

    // Store the updated result in memory
    setCompletedResult(projectId, { resultType: 'generic-pipeline', county: previousCounty, data: result.updated });

    res.json({
      projectId,
      status:              result.updated.status,
      stagesRerun:         result.stagesRerrun,
      beforeScore:         result.beforeScore,
      afterScore:          result.afterScore,
      changeSummary:       result.changeSummary,
      additionalApiCalls:  result.additionalApiCalls,
      durationMs:          result.durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Re-analysis failed: ${msg}` });
  }
});

// ── POST /research/analyze ─────────────────────────────────────────────────
// Phase 3: AI Document Intelligence.
// Takes the Phase 2 harvest result and runs all AI extraction pipelines.
// Long-running (3–10 minutes for a 6-lot subdivision). Returns HTTP 202
// immediately. Results saved to /tmp/analysis/{projectId}/property_intelligence.json.

app.post('/research/analyze', requireAuth, rateLimit(10, 60_000), async (req: Request, res: Response) => {
  const { projectId, harvestResultPath } = req.body as {
    projectId?: string;
    harvestResultPath?: string;
  };

  // ── Validate required fields ──────────────────────────────────────────
  if (!projectId || !harvestResultPath) {
    res.status(400).json({ error: 'projectId and harvestResultPath are required' });
    return;
  }

  // Validate projectId — prevent path traversal attacks
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({
      error: 'projectId may only contain alphanumeric characters, hyphens, and underscores',
    });
    return;
  }

  // Validate harvest result path: must exist and be under /tmp/harvest/
  const resolvedPath = path.resolve(harvestResultPath);
  if (!resolvedPath.startsWith('/tmp/harvest/') || !fs.existsSync(resolvedPath)) {
    res.status(400).json({
      error: 'harvestResultPath must point to an existing file under /tmp/harvest/',
    });
    return;
  }

  // Confirm ANTHROPIC_API_KEY is set before accepting the job
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    res.status(503).json({
      error: 'ANTHROPIC_API_KEY not configured on this worker — Phase 3 cannot run',
    });
    return;
  }

  // Return 202 immediately — analysis runs asynchronously in the background
  res.status(202).json({
    status:   'accepted',
    projectId,
    pollUrl:  `/research/analyze/${projectId}`,
    message:  'Analysis started. Poll pollUrl for completion (typically 3–10 minutes).',
  });

  // ── Run analysis in the background ───────────────────────────────────
  const { AIDocumentAnalyzer } = await import('./services/ai-document-analyzer.js');
  const { PipelineLogger }     = await import('./lib/logger.js');
  const logger  = new PipelineLogger(projectId);
  const analyzer = new AIDocumentAnalyzer(anthropicApiKey, logger);

  analyzer.analyze({ projectId, harvestResultPath: resolvedPath }).then(result => {
    console.log(
      `[Analyze] Complete: ${projectId} — status=${result.status}, ` +
      `lots=${result.intelligence?.lots.length ?? 0}, ` +
      `confidence=${result.intelligence?.confidenceSummary.overall ?? '?'}% ` +
      `(${result.intelligence?.confidenceSummary.rating ?? '?'}), ` +
      `errors=${result.errors.length}`,
    );
  }).catch(err => {
    console.error(`[Analyze] Unhandled error for ${projectId}:`, err);
  });
});

// ── GET /research/analyze/:projectId ─────────────────────────────────────
// Returns the completed PropertyIntelligence JSON or { status: "in_progress" }.

app.get('/research/analyze/:projectId', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { projectId } = req.params;

  // Validate projectId — prevent path traversal attacks
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const resultPath = `/tmp/analysis/${projectId}/property_intelligence.json`;

  if (fs.existsSync(resultPath)) {
    try {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as unknown;
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Failed to read analysis result: ${msg}` });
    }
  } else {
    res.json({ status: 'in_progress', projectId });
  }
});

// ── POST /research/subdivision ────────────────────────────────────────────
// Phase 4: Subdivision & Plat Intelligence.
// Takes Phase 3 intelligence output and builds a complete SubdivisionModel
// with every lot's metes and bounds, interior lines, common elements, and
// subdivision-wide validation.
//
// Long-running (up to ~2.5 minutes).  Returns HTTP 202 immediately.
// Results are persisted to /tmp/analysis/{projectId}/subdivision_model.json.

app.post('/research/subdivision', requireAuth, async (req: Request, res: Response) => {
  const { projectId, intelligencePath } = req.body as {
    projectId?: string;
    intelligencePath?: string;
  };

  if (!projectId || !intelligencePath) {
    res.status(400).json({ error: 'projectId and intelligencePath required' });
    return;
  }

  // Validate projectId to safe characters — prevents path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({
      error: 'projectId may only contain alphanumeric characters, hyphens, and underscores',
    });
    return;
  }

  // Validate intelligencePath is a reasonable file path
  if (!intelligencePath.endsWith('.json')) {
    res.status(400).json({ error: 'intelligencePath must point to a .json file' });
    return;
  }

  res.status(202).json({ status: 'accepted', projectId });

  try {
    const engine = new SubdivisionIntelligenceEngine();
    const result = await engine.analyze(projectId, intelligencePath);

    console.log(
      `[Subdivision] Complete: ${result.lots?.length || 0} lots, ` +
      `${result.reserves?.length || 0} reserves`,
    );
  } catch (error) {
    console.error(`[Subdivision] Failed for ${projectId}:`, error);
  }
});

// ── GET /research/subdivision/:projectId ─────────────────────────────────
// Quick status check — returns the completed subdivision model or in_progress.

app.get('/research/subdivision/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const resultPath = `/tmp/analysis/${projectId}/subdivision_model.json`;

  if (fs.existsSync(resultPath)) {
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as unknown;
    res.json(result);
  } else {
    res.json({ status: 'in_progress' });
  }
});

// ── POST /research/adjacent ───────────────────────────────────────────────
// Phase 5: Adjacent Property Research & Boundary Cross-Validation.
// Takes Phase 3 intelligence output + optional Phase 4 subdivision model,
// researches every neighboring property, downloads deeds, extracts boundary
// calls via Claude Vision, and cross-validates shared boundaries.
//
// Long-running (~10-30 minutes for a typical subdivision). Returns HTTP 202.
// Results are persisted to /tmp/analysis/{projectId}/cross_validation_report.json.

// In-memory job state (per-worker-process; does not persist across PM2 restarts)
const activeAdjacentJobs = new Map<
  string,
  { status: 'running' | 'complete' | 'failed'; result?: FullCrossValidationReport }
>();

app.post('/research/adjacent', requireAuth, rateLimit(5, 60_000), async (req: Request, res: Response) => {
  const { projectId, intelligencePath, subdivisionPath } = req.body as {
    projectId?: string;
    intelligencePath?: string;
    subdivisionPath?: string;
  };

  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  // Validate projectId to safe characters — prevents path traversal
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(projectId)) {
    res.status(400).json({
      error: 'projectId may only contain alphanumeric characters, hyphens, and underscores (max 100 chars)',
    });
    return;
  }

  const resolvedIntelPath =
    intelligencePath ?? `/tmp/analysis/${projectId}/property_intelligence.json`;

  if (!fs.existsSync(resolvedIntelPath)) {
    res.status(400).json({
      error: `Intelligence file not found at: ${resolvedIntelPath}`,
      hint: 'Run POST /research/analyze (Phase 3) first.',
    });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set — required for Phase 5 AI deed extraction',
    });
    return;
  }

  // Accept immediately and run asynchronously
  activeAdjacentJobs.set(projectId, { status: 'running' });
  res.status(202).json({
    status: 'accepted',
    projectId,
    pollUrl: `/research/adjacent/${projectId}`,
    resultsPath: `/tmp/analysis/${projectId}/cross_validation_report.json`,
    note: 'Phase 5 takes 10-30 minutes depending on the number of adjacent properties.',
  });

  // Run in background
  runAdjacentResearch(projectId, resolvedIntelPath, subdivisionPath)
    .then((report) => {
      activeAdjacentJobs.set(projectId, { status: 'complete', result: report });
      console.log(
        `[Adjacent] ${projectId} complete: ` +
        `${report.crossValidationSummary.successfullyResearched}/` +
        `${report.crossValidationSummary.totalAdjacentProperties} researched, ` +
        `confidence: ${report.crossValidationSummary.overallBoundaryConfidence}%`,
      );
    })
    .catch((err: unknown) => {
      console.error(`[Adjacent] ${projectId} failed:`, err);
      activeAdjacentJobs.set(projectId, { status: 'failed' });
    });
});

// ── GET /research/adjacent/:projectId ────────────────────────────────────────
// Phase 5: Check status of an adjacent research job, or retrieve completed result.

app.get('/research/adjacent/:projectId', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const state = activeAdjacentJobs.get(projectId);

  if (!state) {
    // Check if result was written to disk from a previous run
    const diskPath = `/tmp/analysis/${projectId}/cross_validation_report.json`;
    if (fs.existsSync(diskPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(diskPath, 'utf-8')) as FullCrossValidationReport;
        res.json({ status: 'complete', result });
        return;
      } catch (parseErr) {
        console.error(`[Worker] ${projectId}: failed to parse cross_validation_report.json —`, parseErr instanceof Error ? parseErr.message : String(parseErr));
        res.status(500).json({ error: 'Failed to parse cross_validation_report.json' });
        return;
      }
    }
    res.status(404).json({
      error: `No adjacent research found for project: ${projectId}`,
      hint: 'Start with POST /research/adjacent',
    });
    return;
  }

  if (state.status === 'running') {
    res.json({
      status: 'in_progress',
      projectId,
      message: 'Each adjacent property takes 2-5 minutes. Check back soon.',
    });
    return;
  }

  if (state.status === 'failed') {
    res.status(500).json({ status: 'failed', projectId });
    return;
  }

  res.json({ status: 'complete', projectId, result: state.result });
});

// ── POST /research/row ────────────────────────────────────────────────────────
// Phase 6: TxDOT ROW & Public Infrastructure Integration.
// Reads property_intelligence.json (Phase 3 output), queries TxDOT ArcGIS and
// optionally RPAM/Texas Digital Archive for every road bordering the property.
// Resolves deed-vs-plat road boundary discrepancies using authoritative TxDOT geometry.
//
// Long-running (up to ~5 minutes). Returns HTTP 202 immediately.
// Results are persisted to /tmp/analysis/{projectId}/row_data.json.

// In-memory job state for Phase 6 (does not persist across PM2 restarts)
const activeROWJobs = new Map<
  string,
  { status: 'running' | 'complete' | 'failed'; result?: ROWReport }
>();

app.post('/research/row', requireAuth, rateLimit(5, 60_000), async (req: Request, res: Response) => {
  const { projectId, intelligencePath } = req.body as {
    projectId?: string;
    intelligencePath?: string;
  };

  if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
    res.status(400).json({ error: 'Missing or empty required field: projectId' });
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId — use only letters, numbers, hyphens, underscores' });
    return;
  }

  const resolvedIntelPath = intelligencePath
    ?? `/tmp/analysis/${projectId}/property_intelligence.json`;

  if (!fs.existsSync(resolvedIntelPath)) {
    res.status(400).json({
      error: `property_intelligence.json not found at: ${resolvedIntelPath}`,
      hint: 'Run Phase 3 (POST /research/analyze) before Phase 6.',
    });
    return;
  }

  // Reject if already running
  const existing = activeROWJobs.get(projectId);
  if (existing?.status === 'running') {
    res.status(409).json({
      error: 'Phase 6 ROW integration already running for this project',
      hint: `Poll GET /research/row/${projectId} for status`,
    });
    return;
  }

  // ── Create a PipelineLogger for the engine ─────────────────────────────────
  // Phase 6 requires PipelineLogger (no bare console.log) per spec §6.11 implementation rules.
  // Dynamic import used for consistency with adjacent and analysis route patterns.

  // Respond 202 immediately
  activeROWJobs.set(projectId, { status: 'running' });
  res.status(202).json({
    status: 'accepted',
    projectId,
    pollUrl: `/research/row/${projectId}`,
    note: 'Phase 6 ROW integration runs in ~2-5 minutes.',
  });

  // Run async (detached from response) using PipelineLogger
  import('./lib/logger.js').then(({ PipelineLogger }) => {
    const logger = new PipelineLogger(projectId);
    return runROWIntegration(projectId, resolvedIntelPath, logger)
      .then((report) => {
        activeROWJobs.set(projectId, { status: 'complete', result: report });
        logger.info(
          'ROW',
          `Phase 6 complete for ${projectId}: ${report.roads.length} road(s), status=${report.status}`,
        );
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('ROW', `Phase 6 failed for ${projectId}: ${msg}`, err);
        activeROWJobs.set(projectId, {
          status: 'failed',
          result: {
            status: 'failed',
            roads: [],
            resolvedDiscrepancies: [],
            timing: { totalMs: 0 },
            sources: [],
            errors: [msg],
          },
        });
      });
  }).catch((importErr: unknown) => {
    // Fallback if logger import fails — should never happen in production
    console.error(`[ROW] Logger import failed for ${projectId}:`, importErr);
    activeROWJobs.set(projectId, { status: 'failed' });
  });
});

// ── GET /research/row/:projectId ─────────────────────────────────────────────
// Phase 6: Check status of a ROW integration job, or retrieve completed result.

app.get('/research/row/:projectId', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const state = activeROWJobs.get(projectId);

  if (!state) {
    // Check disk for completed result from a previous run
    const diskPath = `/tmp/analysis/${projectId}/row_data.json`;
    if (fs.existsSync(diskPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(diskPath, 'utf-8')) as ROWReport;
        res.json({ status: 'complete', result });
        return;
      } catch (parseErr) {
        console.error(`[Worker] ${projectId}: failed to parse row_data.json —`, parseErr instanceof Error ? parseErr.message : String(parseErr));
        res.status(500).json({ error: 'Failed to parse row_data.json' });
        return;
      }
    }
    res.status(404).json({
      error: `No ROW integration found for project: ${projectId}`,
      hint: 'Start with POST /research/row',
    });
    return;
  }

  if (state.status === 'running') {
    res.json({
      status: 'in_progress',
      projectId,
      message: 'TxDOT ROW query in progress. Usually completes in 2-5 minutes.',
    });
    return;
  }

  if (state.status === 'failed') {
    res.status(500).json({
      status: 'failed',
      projectId,
      errors: state.result?.errors ?? [],
      hint: 'Check worker logs: pm2 logs starr-worker',
    });
    return;
  }

  res.json({ status: 'complete', projectId, result: state.result });
});
// Phase 7: Geometric Reconciliation & Multi-Source Cross-Validation.
// Consumes every data source from Phases 3-6, treats each as an independent
// "reading" of every boundary call, and produces a single reconciled boundary.
//
// Long-running (up to ~60 seconds). Returns HTTP 202 immediately.
// Results are persisted to /tmp/analysis/{projectId}/reconciled_boundary.json.

app.post('/research/reconcile', requireAuth, async (req: Request, res: Response) => {
  const { projectId, phasePaths } = req.body as {
    projectId?: string;
    phasePaths?: {
      intelligence?: string;
      subdivision?: string;
      crossValidation?: string;
      rowReport?: string;
    };
  };

  if (!projectId || !phasePaths?.intelligence) {
    res.status(400).json({ error: 'projectId and phasePaths.intelligence required' });
    return;
  }

  // Validate projectId to safe characters — prevents path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({
      error: 'projectId may only contain alphanumeric characters, hyphens, and underscores',
    });
    return;
  }

  // Validate all paths are .json files
  const paths = [
    phasePaths.intelligence,
    phasePaths.subdivision,
    phasePaths.crossValidation,
    phasePaths.rowReport,
  ].filter(Boolean) as string[];

  for (const p of paths) {
    if (!p.endsWith('.json')) {
      res.status(400).json({ error: `All phase paths must be .json files: ${p}` });
      return;
    }
  }

  res.status(202).json({ status: 'accepted', projectId });

  try {
    const engine = new GeometricReconciliationEngine();
    const result = await engine.reconcile(projectId, {
      intelligence: phasePaths.intelligence,
      subdivision: phasePaths.subdivision,
      crossValidation: phasePaths.crossValidation,
      rowReport: phasePaths.rowReport,
    });

    const before = result.closureOptimization?.beforeReconciliation || 'n/a';
    const after = result.closureOptimization?.afterCompassRule || 'n/a';
    // Use PipelineLogger (no bare console.log) — consistent with Phase 6 pattern
    const { PipelineLogger: PL } = await import('./lib/logger.js');
    const reconLogger = new PL(projectId);
    reconLogger.info('Reconcile', `Complete: closure ${before} → ${after}`);
    reconLogger.info(
      'Reconcile',
      `Avg confidence: ${result.reconciledPerimeter?.previousAverageConfidence}% → ${result.reconciledPerimeter?.averageConfidence}%`,
    );
  } catch (error) {
    const { PipelineLogger: PL } = await import('./lib/logger.js');
    const reconLogger = new PL(projectId);
    reconLogger.error('Reconcile', `Failed for ${projectId}`, error);
  }
});

// ── GET /research/reconcile/:projectId ───────────────────────────────────
// Quick status check — returns the completed reconciliation or in_progress.

app.get('/research/reconcile/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const resultPath = `/tmp/analysis/${projectId}/reconciled_boundary.json`;

  if (fs.existsSync(resultPath)) {
    try {
      const raw = fs.readFileSync(resultPath, 'utf-8');
      const result = JSON.parse(raw) as unknown;
      res.json(result);
    } catch (e) {
      // Malformed JSON (e.g., partial write during reconciliation) — return 500
      // rather than crashing the Express request handler
      res.status(500).json({
        error: 'Reconciliation result file is corrupt or unreadable',
        detail: String(e),
      });
    }
  } else {
    res.json({ status: 'in_progress' });
  }
});

// ── POST /research/confidence ─────────────────────────────────────────────
// Phase 8: Confidence Scoring & Discrepancy Intelligence.
// Consumes Phase 7 reconciled model and produces a hierarchical confidence
// report with call-level, lot-level, boundary-side scoring, discrepancy
// analysis, purchase recommendations, and surveyor decision matrix.

app.post('/research/confidence', requireAuth, async (req: Request, res: Response) => {
  const { projectId, reconciledPath } = req.body as {
    projectId?: string;
    reconciledPath?: string;
  };

  if (!projectId || !reconciledPath) {
    res.status(400).json({ error: 'projectId and reconciledPath required' });
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({
      error: 'projectId may only contain alphanumeric characters, hyphens, and underscores',
    });
    return;
  }

  if (!reconciledPath.endsWith('.json')) {
    res.status(400).json({ error: 'reconciledPath must point to a .json file' });
    return;
  }

  res.status(202).json({ status: 'accepted', projectId });

  try {
    const engine = new ConfidenceScoringEngine();
    const report = await engine.score(projectId, reconciledPath);

    // Use PipelineLogger (no bare console.log) — consistent with Phase 6/7 pattern
    const { PipelineLogger: PL } = await import('./lib/logger.js');
    const confLogger = new PL(projectId);
    confLogger.info(
      'Confidence',
      `Complete: Overall ${report.overallConfidence?.score} (${report.overallConfidence?.grade})`,
    );
    confLogger.info(
      'Confidence',
      `Discrepancies: ${report.discrepancySummary?.unresolved} unresolved, ${report.discrepancySummary?.resolved} resolved`,
    );
    confLogger.info(
      'Confidence',
      `${report.surveyorDecisionMatrix?.readyForField ? '✓ READY FOR FIELD' : '✗ NOT ready — purchase documents first'}`,
    );
  } catch (error) {
    const { PipelineLogger: PL } = await import('./lib/logger.js');
    const confLogger = new PL(projectId);
    confLogger.error('Confidence', `Failed for ${projectId}`, error);
  }
});

// ── GET /research/confidence/:projectId ──────────────────────────────────
// Returns the confidence report or in_progress status.

app.get('/research/confidence/:projectId', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const resultPath = `/tmp/analysis/${projectId}/confidence_report.json`;

  if (fs.existsSync(resultPath)) {
    try {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as unknown;
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Failed to read confidence report', details: String(e) });
    }
  } else {
    res.json({ status: 'in_progress' });
  }
});

// ── POST /research/purchase ────────────────────────────────────────────────
// Phase 9: Document Purchase & Automated Re-Analysis.
// Takes Phase 8's purchase recommendations, automatically purchases official
// unwatermarked documents, re-extracts data from clean images, and produces
// an updated reconciled model with improved confidence.
//
// Long-running (up to ~5 minutes). Returns HTTP 202 immediately.
// Results are persisted to /tmp/analysis/{projectId}/purchase_report.json.

app.post('/research/purchase', requireAuth, rateLimit(5, 60_000), async (req: Request, res: Response) => {
  const { projectId, confidenceReportPath, budget, autoReanalyze, paymentMethod } = req.body as {
    projectId?: string;
    confidenceReportPath?: string;
    budget?: number;
    autoReanalyze?: boolean;
    paymentMethod?: string;
  };

  if (!projectId || !confidenceReportPath) {
    res.status(400).json({ error: 'projectId and confidenceReportPath required' });
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({
      error: 'projectId may only contain alphanumeric characters, hyphens, and underscores',
    });
    return;
  }

  if (!confidenceReportPath.endsWith('.json')) {
    res.status(400).json({ error: 'confidenceReportPath must point to a .json file' });
    return;
  }

  res.status(202).json({ status: 'accepted', projectId });

  // Use PipelineLogger (no bare console.* calls) — consistent with Phase 6/7/8 pattern
  const { PipelineLogger: PL9 } = await import('./lib/logger.js');
  const purchaseLog = new PL9(projectId);

  try {
    let confReport: any;
    try {
      confReport = JSON.parse(fs.readFileSync(confidenceReportPath, 'utf-8'));
    } catch (e) {
      purchaseLog.error('Purchase', `Failed to read confidence report: ${String(e)}`);
      return;
    }
    const recommendations = confReport.documentPurchaseRecommendations || [];

    if (recommendations.length === 0) {
      purchaseLog.info('Purchase', 'No documents recommended for purchase');
      const emptyReport = {
        status: 'no_purchases_needed',
        projectId,
        purchases: [],
        reanalysis: { status: 'skipped', documentReanalyses: [], discrepanciesResolved: [] },
        updatedReconciliation: null,
        billing: {
          totalDocumentCost: 0,
          taxOrFees: 0,
          totalCharged: 0,
          paymentMethod: paymentMethod || 'account_balance',
          remainingBalance: budget || 25,
          invoicePath: '',
        },
        timing: { totalMs: 0, purchaseMs: 0, downloadMs: 0, reanalysisMs: 0 },
        aiCalls: 0,
        errors: [],
      };
      const outputPath = `/tmp/analysis/${projectId}/purchase_report.json`;
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(emptyReport, null, 2));
      return;
    }

    const countyFIPS = confReport.propertyContext?.countyFIPS || '48027';
    const countyName = confReport.propertyContext?.county || 'Bell';

    const orchestrator = new DocumentPurchaseOrchestrator(projectId);
    const result = await orchestrator.executePurchases(
      projectId,
      recommendations,
      {
        kofileCredentials: process.env.KOFILE_USERNAME ? {
          username: process.env.KOFILE_USERNAME,
          password: process.env.KOFILE_PASSWORD!,
          paymentOnFile: true,
        } : undefined,
        texasfileCredentials: process.env.TEXASFILE_USERNAME ? {
          username: process.env.TEXASFILE_USERNAME,
          password: process.env.TEXASFILE_PASSWORD!,
          accountType: 'pay_per_page',
        } : undefined,
        budget: budget || 25.00,
        autoReanalyze: autoReanalyze !== false,
      },
      countyFIPS,
      countyName,
    );

    const purchased = result.purchases.filter(p => p.status === 'purchased');
    purchaseLog.info(
      'Purchase',
      `Complete: ${purchased.length}/${result.purchases.length} purchased, $${result.billing.totalCharged.toFixed(2)} spent`,
    );

    if (result.reanalysis.documentReanalyses.length > 0 && autoReanalyze !== false) {
      const totalChanged = result.reanalysis.documentReanalyses.reduce(
        (s, r) => s + r.callsChanged, 0,
      );
      purchaseLog.info(
        'Purchase',
        `Re-analysis changed ${totalChanged} calls. Re-reconciliation triggered.`,
      );
    }
  } catch (error) {
    purchaseLog.error('Purchase', 'Orchestration failed', error instanceof Error ? error : new Error(String(error)));
  }
});

// ── GET /research/purchase/:projectId ─────────────────────────────────────
// Returns the purchase report or in_progress status.

app.get('/research/purchase/:projectId', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const resultPath = `/tmp/analysis/${projectId}/purchase_report.json`;

  if (fs.existsSync(resultPath)) {
    try {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as unknown;
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Failed to read purchase report', details: String(e) });
    }
  } else {
    res.json({ status: 'in_progress' });
  }
});

// ── Phase 10: Report & Pipeline Routes ─────────────────────────────────────

app.use(createReportRoutes(requireAuth));

// ── Phase 11: Data Source Routes ────────────────────────────────────────────

// Configurable paths for Phase 11 output directories
const ANALYTICS_DIR = process.env.ANALYTICS_DIR || '/tmp/analytics';
const ANALYSIS_DIR = process.env.ANALYSIS_DIR || '/tmp/analysis';
const BATCH_DIR = process.env.BATCH_DIR || '/tmp/batch';

// Module-level singleton instances (avoid repeated instantiation per request)
const usageTracker = new UsageTracker(ANALYTICS_DIR);
const p11BatchProcessor = new BatchProcessor(BATCH_DIR);

/**
 * POST /research/flood-zone
 * Query FEMA NFHL flood zone data for a property.
 * Body: { projectId, centroid: [lon, lat], polygon?: [[lon,lat],...] }
 */
app.post(
  '/research/flood-zone',
  requireAuth,
  rateLimit(5, 60_000),
  async (req: Request, res: Response) => {
    const logger = new (await import('./lib/logger.js')).PipelineLogger(
      req.body?.projectId || 'unknown',
    );
    const { projectId, centroid, polygon } = req.body || {};

    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' });
      return;
    }
    if (!centroid || !Array.isArray(centroid) || centroid.length !== 2) {
      res.status(400).json({ error: 'centroid [lon, lat] is required' });
      return;
    }

    const attempt = logger.startAttempt({
      layer: 'Phase11_FloodZone',
      source: 'FEMA NFHL',
      method: 'POST /research/flood-zone',
      input: projectId,
    });

    try {
      const client = new FEMANFHLClient();
      const result = await client.queryFloodZones({ centroid: centroid as [number, number], polygon });

      // Save to project directory
      const outDir = path.join(ANALYSIS_DIR, projectId);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'flood_zone.json'),
        JSON.stringify(result, null, 2),
      );

      attempt({ status: 'success', dataPointsFound: result.zones.length });
      res.json({ projectId, floodZone: result });
    } catch (err: any) {
      attempt({ status: 'fail', error: err.message });
      logger.error('Phase11_FloodZone', 'FEMA NFHL query failed', err);
      res.status(500).json({ error: err.message, attempts: logger.getAttempts() });
    }
  },
);

/**
 * GET /research/flood-zone/:projectId
 * Retrieve saved flood zone data for a project.
 */
app.get(
  '/research/flood-zone/:projectId',
  requireAuth,
  rateLimit(60, 60_000),
  (req: Request, res: Response) => {
    const { projectId } = req.params;
    const filePath = path.join(ANALYSIS_DIR, projectId, 'flood_zone.json');
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: `No flood zone data for project ${projectId}` });
      return;
    }
    try {
      res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } catch {
      res.status(500).json({ error: 'Failed to read flood zone data' });
    }
  },
);

/**
 * POST /research/chain-of-title
 * Build deep chain of title for a property.
 * Body: { projectId, currentOwner, documents, extractionData, maxDepth? }
 */
app.post(
  '/research/chain-of-title',
  requireAuth,
  rateLimit(5, 60_000),
  async (req: Request, res: Response) => {
    const logger = new (await import('./lib/logger.js')).PipelineLogger(
      req.body?.projectId || 'unknown',
    );
    const { projectId, currentOwner, documents, extractionData, maxDepth } =
      req.body || {};

    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' });
      return;
    }
    if (!currentOwner) {
      res.status(400).json({ error: 'currentOwner is required' });
      return;
    }

    const attempt = logger.startAttempt({
      layer: 'Phase11_ChainOfTitle',
      source: 'Document Database',
      method: 'POST /research/chain-of-title',
      input: projectId,
    });

    try {
      const builder = new ChainOfTitleBuilder(
        maxDepth || 5,
        ANALYSIS_DIR,
      );
      const result = await builder.buildChain(
        projectId,
        currentOwner,
        documents || [],
        extractionData || {},
      );

      attempt({ status: 'success', dataPointsFound: result.chain.length });
      res.json({ projectId, chainOfTitle: result });
    } catch (err: any) {
      attempt({ status: 'fail', error: err.message });
      logger.error('Phase11_ChainOfTitle', 'Chain of title build failed', err);
      res.status(500).json({ error: err.message, attempts: logger.getAttempts() });
    }
  },
);

/**
 * GET /research/chain-of-title/:projectId
 * Retrieve saved chain of title for a project.
 */
app.get(
  '/research/chain-of-title/:projectId',
  requireAuth,
  rateLimit(60, 60_000),
  (req: Request, res: Response) => {
    const { projectId } = req.params;
    const filePath = path.join(
      ANALYSIS_DIR,
      projectId,
      'chain_of_title.json',
    );
    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: `No chain of title data for project ${projectId}`,
      });
      return;
    }
    try {
      res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } catch {
      res.status(500).json({ error: 'Failed to read chain of title data' });
    }
  },
);

/**
 * POST /research/batch
 * Create a new batch research job.
 * Body: { userId, properties: [{address, county?, label?}], options? }
 */
app.post(
  '/research/batch',
  requireAuth,
  rateLimit(3, 60_000),
  async (req: Request, res: Response) => {
    const { userId, properties, options } = req.body || {};

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    if (!Array.isArray(properties) || properties.length === 0) {
      res.status(400).json({ error: 'properties array is required and must be non-empty' });
      return;
    }
    if (properties.length > 500) {
      res.status(400).json({ error: 'Batch size limit is 500 properties' });
      return;
    }

    try {
      const batch = await p11BatchProcessor.createBatch(userId, properties, options || {});
      usageTracker.track({
        eventType: 'pipeline_started',
        userId,
        projectId: batch.batchId,
        county: 'batch',
      });
      res.json({ batchId: batch.batchId, status: batch.status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * GET /research/batch/:batchId
 * Get batch job status.
 */
app.get(
  '/research/batch/:batchId',
  requireAuth,
  rateLimit(60, 60_000),
  async (req: Request, res: Response) => {
    const { batchId } = req.params;
    try {
      const batch = await p11BatchProcessor.checkBatchStatus(batchId);
      res.json(batch);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  },
);

/**
 * GET /research/clerk-registry/:county
 * Look up the clerk system for a Texas county.
 */
app.get(
  '/research/clerk-registry/:county',
  requireAuth,
  rateLimit(60, 60_000),
  (req: Request, res: Response) => {
    const { county } = req.params;
    if (!county) {
      res.status(400).json({ error: 'county name is required' });
      return;
    }
    // Reject unusually long or non-alphanumeric county names to prevent abuse.
    // Also reject consecutive special characters (spaces, hyphens, apostrophes).
    if (county.length > 64 || !/^[a-zA-Z\s'-]+$/.test(county) ||
        /[\s'-]{2,}/.test(county)) {
      res.status(400).json({ error: 'county name contains invalid characters or is too long' });
      return;
    }
    const entry = getClerkByCountyName(county.trim());
    res.json(entry);
  },
);

// ── Phase 13: USGS Topographic Data ──────────────────────────────────────────
//
// POST /research/topo  — Query USGS National Map for elevation, contours, NHD
// GET  /research/topo/:projectId — Return saved topographic result

const usgsClient = new USGSClient();

/**
 * POST /research/topo
 * Queries USGS 3DEP elevation, contour lines, and NHD water features
 * for the specified coordinates.  Saves result to the project output directory.
 */
app.post('/research/topo', requireAuth, rateLimit(5, 60_000), async (req: Request, res: Response) => {
  const { projectId, lat, lon, radiusM } = req.body as {
    projectId?: string;
    lat?: number;
    lon?: number;
    radiusM?: number;
  };

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    res.status(400).json({ error: 'lat and lon are required numeric fields' });
    return;
  }
  if (lat < 25.8 || lat > 36.5 || lon < -106.65 || lon > -93.5) {
    res.status(400).json({ error: 'Coordinates appear outside Texas bounds' });
    return;
  }

  res.status(202).json({ message: 'Topographic data query started', projectId });

  // Run async — save result to project output directory
  try {
    const topo = await usgsClient.getTopoData(projectId, lat, lon, radiusM ?? 200);
    const outDir = `/tmp/analysis/${projectId}`;
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(`${outDir}/topo.json`, JSON.stringify(topo, null, 2));
  } catch (err) {
    console.error(`[TOPO] Error for project ${projectId}:`, err);
    // Write error state so GET /research/topo/:projectId can distinguish
    // "never queried" (file absent) from "query failed" (error file present)
    const outDir = `/tmp/analysis/${projectId}`;
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      `${outDir}/topo_error.json`,
      JSON.stringify({ status: 'error', error: String(err), timestamp: new Date().toISOString() }),
    );
  }
});

/**
 * GET /research/topo/:projectId
 * Returns saved topographic result from disk.
 */
app.get('/research/topo/:projectId', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { projectId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }
  const resultPath = `/tmp/analysis/${projectId}/topo.json`;
  const errorPath  = `/tmp/analysis/${projectId}/topo_error.json`;
  if (!fs.existsSync(resultPath)) {
    // Check whether a query was attempted but failed
    if (fs.existsSync(errorPath)) {
      try {
        const errState = JSON.parse(fs.readFileSync(errorPath, 'utf-8')) as unknown;
        res.status(500).json({ status: 'error', projectId, detail: errState });
        return;
      } catch { /* fall through to not_queried */ }
    }
    res.status(404).json({ status: 'not_queried', projectId });
    return;
  }
  try {
    const topo = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as unknown;
    res.json({ projectId, topo });
  } catch {
    res.status(500).json({ error: 'Topographic result file is corrupt or unreadable' });
  }
});

// ── Phase 13: TX Comptroller Tax Data ────────────────────────────────────────
//
// POST /research/tax  — Query TX Comptroller PTAD for county tax rates
// GET  /research/tax/:projectId — Return saved tax rate result

const comptrollerClient = new TXComptrollerClient();

/**
 * POST /research/tax
 * Queries TX Comptroller PTAD for taxing unit rates by county FIPS code.
 * Saves result to the project output directory.
 */
app.post('/research/tax', requireAuth, rateLimit(5, 60_000), async (req: Request, res: Response) => {
  const { projectId, countyFips, taxYear } = req.body as {
    projectId?: string;
    countyFips?: string;
    taxYear?: number;
  };

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }
  if (!countyFips || !/^\d{5}$/.test(countyFips)) {
    res.status(400).json({ error: 'countyFips must be a 5-digit string (e.g. "48027")' });
    return;
  }

  res.status(202).json({ message: 'Tax data query started', projectId });

  // Run async
  try {
    const tax = await comptrollerClient.getTaxData(projectId, countyFips, taxYear);
    const outDir = `/tmp/analysis/${projectId}`;
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(`${outDir}/tax.json`, JSON.stringify(tax, null, 2));
  } catch (err) {
    console.error(`[TAX] Error for project ${projectId}:`, err);
    // Write error state so GET /research/tax/:projectId can distinguish
    // "never queried" from "query attempted but failed"
    const outDir = `/tmp/analysis/${projectId}`;
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      `${outDir}/tax_error.json`,
      JSON.stringify({ status: 'error', error: String(err), timestamp: new Date().toISOString() }),
    );
  }
});

/**
 * GET /research/tax/:projectId
 * Returns saved tax rate result from disk.
 */
app.get('/research/tax/:projectId', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { projectId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }
  const resultPath = `/tmp/analysis/${projectId}/tax.json`;
  const errorPath  = `/tmp/analysis/${projectId}/tax_error.json`;
  if (!fs.existsSync(resultPath)) {
    if (fs.existsSync(errorPath)) {
      try {
        const errState = JSON.parse(fs.readFileSync(errorPath, 'utf-8')) as unknown;
        res.status(500).json({ status: 'error', projectId, detail: errState });
        return;
      } catch { /* fall through to not_queried */ }
    }
    res.status(404).json({ status: 'not_queried', projectId });
    return;
  }
  try {
    const tax = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as unknown;
    res.json({ projectId, tax });
  } catch {
    res.status(500).json({ error: 'Tax result file is corrupt or unreadable' });
  }
});

// ── Phase 13: Boundary Viewer Data ───────────────────────────────────────────
//
// GET /research/boundary/:projectId — Combine reconcile + confidence data for
// the Interactive Boundary Viewer.  Clients can also call /research/reconcile
// and /research/confidence directly, but this endpoint pre-merges them.

/**
 * GET /research/boundary/:projectId
 * Returns merged reconcile + confidence payload for the boundary viewer.
 */
app.get('/research/boundary/:projectId', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { projectId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const reconPath   = `/tmp/analysis/${projectId}/reconciled_boundary.json`;
  const confPath    = `/tmp/analysis/${projectId}/confidence_report.json`;
  const topoPath    = `/tmp/analysis/${projectId}/topo.json`;
  const taxPath     = `/tmp/analysis/${projectId}/tax.json`;

  if (!fs.existsSync(reconPath)) {
    res.json({ status: 'not_ready', message: 'Boundary reconciliation not yet complete', projectId });
    return;
  }

  try {
    const rawRecon = fs.readFileSync(reconPath, 'utf-8');
    const rawConf  = fs.existsSync(confPath) ? fs.readFileSync(confPath, 'utf-8') : null;
    const rawTopo  = fs.existsSync(topoPath) ? fs.readFileSync(topoPath, 'utf-8') : null;
    const rawTax   = fs.existsSync(taxPath)  ? fs.readFileSync(taxPath,  'utf-8') : null;

    const recon = JSON.parse(rawRecon) as unknown;
    const conf  = rawConf ? (JSON.parse(rawConf)  as unknown) : null;
    const topo  = rawTopo ? (JSON.parse(rawTopo)  as unknown) : null;
    const tax   = rawTax  ? (JSON.parse(rawTax)   as unknown) : null;

    // Validate reconciliation output before returning
    const validatedRecon = validateOrNull('reconciliation', recon, (msg) => {
      console.warn(`[Boundary] Phase 7 schema warning for ${projectId}: ${msg}`);
    });

    res.json({
      projectId,
      reconciliation: validatedRecon ?? recon,
      confidence: conf,
      topo,
      tax,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assemble boundary data', detail: String(err) });
  }
});

// ── Site Health Monitor ───────────────────────────────────────────────────
// Probes all county CAD portals and clerk systems to detect selector drift.
// Broadcasts alerts when sites change or go down.

const siteHealthMonitor = new SiteHealthMonitor({
  onAlert: (alert) => {
    console.warn(`[SiteHealth ALERT] [${alert.severity}] ${alert.message}`);
    // TODO: integrate with WebSocket broadcast to admin dashboard
    // TODO: integrate with email/Slack notifications
  },
  // Only check Bell County CAD + clerk sites (the only county with a live orchestrator)
  countyFips: ['48027'],
});

/**
 * GET /admin/health/sites
 * Returns the full health summary for all monitored sites.
 */
app.get('/admin/health/sites', requireAuth, (_req: Request, res: Response) => {
  res.json(siteHealthMonitor.getSummary());
});

/**
 * GET /admin/health/sites/:vendor
 * Returns health results for a specific vendor (bis, hcad, tad, kofile, etc).
 */
app.get('/admin/health/sites/:vendor', requireAuth, (req: Request, res: Response) => {
  const { vendor } = req.params;
  const summary = siteHealthMonitor.getSummary();
  const vendorSites = summary.sites.filter(s => s.vendor === vendor);
  res.json({
    vendor,
    totalSites: vendorSites.length,
    healthy:   vendorSites.filter(s => s.status === 'healthy').length,
    degraded:  vendorSites.filter(s => s.status === 'degraded').length,
    down:      vendorSites.filter(s => s.status === 'down').length,
    sites: vendorSites,
  });
});

/**
 * POST /admin/health/check-all
 * Trigger a full health check of all sites immediately.
 * Returns the complete health summary.
 */
app.post(
  '/admin/health/check-all',
  requireAuth,
  rateLimit(1, 300_000), // At most once per 5 min
  async (_req: Request, res: Response) => {
    try {
      const summary = await siteHealthMonitor.checkAll();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * POST /admin/health/check/:siteId
 * Trigger a health check for a specific site.
 */
app.post(
  '/admin/health/check/:siteId',
  requireAuth,
  rateLimit(10, 60_000),
  async (req: Request, res: Response) => {
    const { siteId } = req.params;
    try {
      const result = await siteHealthMonitor.checkOne(siteId);
      if (!result) {
        res.status(404).json({ error: `Site "${siteId}" not found in registry` });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * POST /admin/health/check-vendor/:vendor
 * Trigger health checks for all sites of a specific vendor.
 */
app.post(
  '/admin/health/check-vendor/:vendor',
  requireAuth,
  rateLimit(2, 300_000),
  async (req: Request, res: Response) => {
    const { vendor } = req.params;
    try {
      const results = await siteHealthMonitor.checkVendor(vendor);
      if (results.length === 0) {
        res.status(404).json({ error: `No sites found for vendor "${vendor}"` });
        return;
      }
      res.json({
        vendor,
        checked: results.length,
        healthy: results.filter(r => r.status === 'healthy').length,
        degraded: results.filter(r => r.status === 'degraded').length,
        down: results.filter(r => r.status === 'down').length,
        sites: results,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * GET /admin/health/alerts
 * Returns recent health alerts. Optional ?since=ISO timestamp query param.
 */
app.get('/admin/health/alerts', requireAuth, (req: Request, res: Response) => {
  const since = req.query.since as string | undefined;
  res.json(siteHealthMonitor.getAlerts(since));
});

/**
 * DELETE /admin/health/alerts
 * Clear all health alerts.
 */
app.delete('/admin/health/alerts', requireAuth, (_req: Request, res: Response) => {
  siteHealthMonitor.clearAlerts();
  res.json({ message: 'Alerts cleared' });
});

// ── Phase 14: Document Access Tier Routes ──────────────────────────────────

/**
 * GET /research/access/platforms
 * Returns all available paid document platforms and their availability summary.
 * Also shows which platforms are currently configured (have credentials set).
 */
app.get('/research/access/platforms', requireAuth, rateLimit(60, 60_000), (_req: Request, res: Response) => {
  const configuredPlatforms = PaidPlatformRegistry.getConfiguredPlatforms();
  const summary = PaidPlatformRegistry.getAvailabilitySummary(configuredPlatforms);
  res.json({ summary, configuredPlatforms });
});

/**
 * GET /research/access/plan/:countyFIPS
 * Returns the complete document access plan for a specific Texas county:
 *  - Free tier options (watermarked preview vs index-only)
 *  - All paid platforms that cover this county (sorted cheapest-first)
 *  - Recommended platform
 *
 * Example: GET /research/access/plan/48027  → Bell County plan
 */
app.get('/research/access/plan/:countyFIPS', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { countyFIPS } = req.params;

  if (!/^\d{5}$/.test(countyFIPS)) {
    res.status(400).json({ error: 'countyFIPS must be a 5-digit code (e.g. 48027)' });
    return;
  }

  const countyName = req.query.county as string | undefined ?? 'Unknown';
  const plan = PaidPlatformRegistry.getAccessPlan(countyFIPS, countyName);
  res.json(plan);
});

/**
 * POST /research/access/document
 * Fetch a specific document using the best available tier (free-first, then paid).
 *
 * Body: DocumentAccessRequest
 *   { projectId, countyFIPS, countyName, instrumentNumber, documentType,
 *     freeOnly?, maxCostPerDocument?, preferredPlatform? }
 *
 * Returns: DocumentAccessResult with imagePaths, tier, costUSD, isWatermarked, etc.
 */
app.post('/research/access/document', requireAuth, rateLimit(5, 60_000), async (req: Request, res: Response) => {
  const {
    projectId, countyFIPS, countyName, instrumentNumber,
    documentType, freeOnly, maxCostPerDocument, preferredPlatform,
    stripeCustomerId,
  } = req.body as {
    projectId?: string;
    countyFIPS?: string;
    countyName?: string;
    instrumentNumber?: string;
    documentType?: string;
    freeOnly?: boolean;
    maxCostPerDocument?: number;
    preferredPlatform?: string;
    stripeCustomerId?: string;
  };

  if (!projectId || !countyFIPS || !instrumentNumber || !documentType) {
    res.status(400).json({
      error: 'projectId, countyFIPS, instrumentNumber, and documentType are required',
    });
    return;
  }

  const logger = new (await import('./lib/logger.js')).PipelineLogger(projectId);
  logger.info('DocAccess', `POST /research/access/document — ${instrumentNumber} (${countyName ?? countyFIPS})`);

  try {
    const orchestrator = createDocumentAccessOrchestrator(projectId, {
      tryFreeFirst: true,
      maxCostPerDocument: maxCostPerDocument ?? 10.00,
      outputDir: `/tmp/documents/${projectId}`,
    });

    const result = await orchestrator.getDocument({
      projectId,
      countyFIPS,
      countyName: countyName ?? 'Unknown',
      instrumentNumber,
      documentType,
      freeOnly: freeOnly ?? false,
      maxCostPerDocument: maxCostPerDocument ?? 10.00,
      preferredPlatform: preferredPlatform as any ?? undefined,
      stripeCustomerId: stripeCustomerId ?? undefined,
    });

    // Persist result
    const outPath = `/tmp/analysis/${projectId}/access_${instrumentNumber.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('DocAccess', msg);
    res.status(500).json({ error: 'Document access failed', details: msg });
  }
});

/**
 * GET /research/access/result/:projectId/:instrumentNumber
 * Retrieve a previously cached document access result.
 */
app.get('/research/access/result/:projectId/:instrumentNumber', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const { projectId, instrumentNumber } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const safeName = (instrumentNumber ?? '').replace(/[^a-zA-Z0-9]/g, '_');
  const resultPath = `/tmp/analysis/${projectId}/access_${safeName}.json`;

  if (fs.existsSync(resultPath)) {
    try {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as unknown;
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Failed to read access result', details: String(e) });
    }
  } else {
    res.status(404).json({ error: 'No cached result for this document' });
  }
});

// ── Phase 15: Purchase Automation Routes ────────────────────────────────────

const notificationService = new NotificationService();

/**
 * POST /research/purchase/automated
 * Purchase a document using a specific Phase 15 paid platform adapter.
 * Body: { projectId, countyFIPS, countyName, instrumentNumber, documentType, platform, credentials? }
 */
app.post('/research/purchase/automated', requireAuth, rateLimit(5, 60_000), async (req: Request, res: Response) => {
  const {
    projectId, countyFIPS, countyName, instrumentNumber, documentType, platform,
  } = req.body as {
    projectId?: string;
    countyFIPS?: string;
    countyName?: string;
    instrumentNumber?: string;
    documentType?: string;
    platform?: string;
  };

  if (!projectId || !countyFIPS || !instrumentNumber || !documentType || !platform) {
    res.status(400).json({ error: 'projectId, countyFIPS, instrumentNumber, documentType, platform are required' });
    return;
  }

  const outputDir = `/tmp/documents/${projectId}/paid`;
  let result: Awaited<ReturnType<LandExApiAdapter['purchaseDocument']>>;

  try {
    if (platform === 'tyler_pay') {
      const adapter = new TylerPayAdapter(
        countyFIPS, countyName ?? 'Unknown',
        {
          username: process.env.TYLER_PAY_USERNAME ?? '',
          password: process.env.TYLER_PAY_PASSWORD ?? '',
        },
        outputDir, projectId,
      );
      await adapter.initSession();
      try { result = await adapter.purchaseDocument(instrumentNumber, documentType); }
      finally { await adapter.destroySession(); }

    } else if (platform === 'henschen_pay') {
      const adapter = new HenschenPayAdapter(
        countyFIPS, countyName ?? 'Unknown',
        {
          username: process.env.HENSCHEN_PAY_USERNAME ?? '',
          password: process.env.HENSCHEN_PAY_PASSWORD ?? '',
        },
        outputDir, projectId,
      );
      await adapter.initSession();
      try { result = await adapter.purchaseDocument(instrumentNumber, documentType); }
      finally { await adapter.destroySession(); }

    } else if (platform === 'idocket_pay') {
      const adapter = new IDocketPayAdapter(
        countyFIPS, countyName ?? 'Unknown',
        {
          username: process.env.IDOCKET_PAY_USERNAME ?? '',
          password: process.env.IDOCKET_PAY_PASSWORD ?? '',
        },
        outputDir, projectId,
      );
      await adapter.initSession();
      try { result = await adapter.purchaseDocument(instrumentNumber, documentType); }
      finally { await adapter.destroySession(); }

    } else if (platform === 'fidlar_pay') {
      const adapter = new FidlarPayAdapter(
        countyFIPS, countyName ?? 'Unknown',
        {
          username: process.env.FIDLAR_PAY_USERNAME ?? '',
          password: process.env.FIDLAR_PAY_PASSWORD ?? '',
        },
        outputDir, projectId,
      );
      await adapter.initSession();
      try { result = await adapter.purchaseDocument(instrumentNumber, documentType); }
      finally { await adapter.destroySession(); }

    } else if (platform === 'govos_direct') {
      const adapter = new GovOSGuestAdapter(
        countyFIPS, countyName ?? 'Unknown',
        {
          creditCardToken: process.env.GOVOS_CREDIT_CARD_TOKEN,
          accountUsername: process.env.GOVOS_ACCOUNT_USERNAME,
          accountPassword: process.env.GOVOS_ACCOUNT_PASSWORD,
        },
        outputDir, projectId,
      );
      await adapter.initSession();
      try { result = await adapter.purchaseDocument(instrumentNumber, documentType); }
      finally { await adapter.destroySession(); }

    } else if (platform === 'landex') {
      const adapter = new LandExApiAdapter(
        countyFIPS, countyName ?? 'Unknown',
        {
          apiKey: process.env.LANDEX_API_KEY ?? '',
          accountId: process.env.LANDEX_ACCOUNT_ID ?? '',
        },
        outputDir, projectId,
      );
      result = await adapter.purchaseDocument(instrumentNumber, documentType);

    } else {
      res.status(400).json({ error: `Unknown platform: ${platform}. Valid: tyler_pay, henschen_pay, idocket_pay, fidlar_pay, govos_direct, landex` });
      return;
    }

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Purchase automation failed', details: msg });
  }
});

/**
 * GET /research/purchase/platforms/status
 * Returns which Phase 15 purchase adapters are currently configured (have credentials).
 */
app.get('/research/purchase/platforms/status', requireAuth, rateLimit(60, 60_000), (_req: Request, res: Response) => {
  res.json({
    platforms: {
      tyler_pay:    { configured: !!(process.env.TYLER_PAY_USERNAME && process.env.TYLER_PAY_PASSWORD) },
      henschen_pay: { configured: !!(process.env.HENSCHEN_PAY_USERNAME && process.env.HENSCHEN_PAY_PASSWORD) },
      idocket_pay:  { configured: !!(process.env.IDOCKET_PAY_USERNAME && process.env.IDOCKET_PAY_PASSWORD) },
      fidlar_pay:   { configured: !!(process.env.FIDLAR_PAY_USERNAME && process.env.FIDLAR_PAY_PASSWORD) },
      govos_direct: { configured: !!(process.env.GOVOS_ACCOUNT_USERNAME || process.env.GOVOS_CREDIT_CARD_TOKEN) },
      landex:       { configured: !!(process.env.LANDEX_API_KEY && process.env.LANDEX_ACCOUNT_ID) },
    },
    notifications: {
      email: notificationService.isEmailConfigured,
      sms:   notificationService.isSmsConfigured,
    },
  });
});

/**
 * POST /research/notifications/test
 * Send a test notification to verify email/SMS configuration.
 * Body: { recipientEmail, recipientPhone?, eventType }
 */
app.post('/research/notifications/test', requireAuth, rateLimit(5, 60_000), async (req: Request, res: Response) => {
  const { recipientEmail, recipientPhone, eventType } = req.body as {
    recipientEmail?: string;
    recipientPhone?: string;
    eventType?: string;
  };

  if (!recipientEmail) {
    res.status(400).json({ error: 'recipientEmail is required' });
    return;
  }

  try {
    const result = await notificationService.send({
      eventType: (eventType as any) ?? 'pipeline_complete',
      recipientEmail,
      recipientPhone: recipientPhone ?? undefined,
      channel: recipientPhone ? 'both' : 'email',
      projectId: 'test',
      data: {
        address: '1234 Test St, Belton TX 76513',
        countyName: 'Bell',
        confidenceScore: 94,
        runtimeMinutes: 12,
        documentCount: 7,
        reportUrl: 'https://starrsurveying.com/admin/research/test',
      },
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Notification test failed', details: String(err) });
  }
});

/**
 * GET /research/landex/estimate
 * Estimate LandEx cost for a document before purchasing.
 * Query: ?documentType=warranty_deed&pages=2
 */
app.get('/research/landex/estimate', requireAuth, rateLimit(60, 60_000), (req: Request, res: Response) => {
  const documentType = (req.query.documentType as string) ?? 'deed';
  const pages = parseInt((req.query.pages as string) ?? '2', 10);
  const estimatedCost = LandExApiAdapter.estimateCost(documentType, pages);
  res.json({
    documentType,
    pages,
    estimatedCostUsd: estimatedCost,
    platform: 'landex',
    notes: 'Estimate only — actual cost may vary based on document type and county',
  });
});

// ── Phase 19: TNRIS LiDAR & Cross-County Detection ────────────────────────

/**
 * GET /research/lidar/counties
 * List all Texas counties with LiDAR coverage on TNRIS.
 */
app.get('/research/lidar/counties', requireAuth, rateLimit(30, 60_000), async (_req: Request, res: Response) => {
  try {
    const { TNRISLiDARClient } = await import('./sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const counties = await client.listCoveredCounties();
    res.json({ counties, count: counties.length, dataSource: 'TNRIS', apiConfigured: client.isConfigured });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /research/lidar/:projectId
 * Fetch LiDAR data for the centroid of a research project.
 */
app.get('/research/lidar/:projectId', requireAuth, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const lat = parseFloat((req.query.lat as string) ?? '0');
  const lon = parseFloat((req.query.lon as string) ?? '0');
  const radiusM = parseInt((req.query.radiusM as string) ?? '500', 10);

  if (!lat || !lon) {
    res.status(400).json({ error: 'lat and lon query parameters are required' });
    return;
  }

  try {
    const { TNRISLiDARClient } = await import('./sources/tnris-lidar-client.js');
    const client = new TNRISLiDARClient();
    const result = await client.fetchLiDARData(lat, lon, radiusM);
    res.json({ projectId, lidar: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /research/cross-county/detect
 * Detect whether a property straddles county lines.
 * Body: { lat, lon, boundaryCalls: [{bearing, distance}], primaryCountyFIPS }
 */
app.post('/research/cross-county/detect', requireAuth, rateLimit(30, 60_000), async (req: Request, res: Response) => {
  const { lat, lon, boundaryCalls = [], primaryCountyFIPS } = req.body as {
    lat?: number; lon?: number;
    boundaryCalls?: { bearing: string; distance: number }[];
    primaryCountyFIPS?: string;
  };

  if (!lat || !lon || !primaryCountyFIPS) {
    res.status(400).json({ error: 'lat, lon, and primaryCountyFIPS are required' });
    return;
  }

  try {
    const { CrossCountyResolver } = await import('./services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    const detection = resolver.detectCrossCounty(lat, lon, boundaryCalls, primaryCountyFIPS);
    res.json({ detection });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /research/cross-county/:projectId
 * Get the cross-county research plan for a project (if previously detected).
 */
app.get('/research/cross-county/:projectId', requireAuth, rateLimit(60, 60_000), async (req: Request, res: Response) => {
  const { projectId } = req.params;
  try {
    const { CrossCountyResolver } = await import('./services/cross-county-resolver.js');
    const resolver = new CrossCountyResolver();
    // Without DB integration, return available county adjacency info
    const adjInfo = resolver.getAdjacentCounties('48027');
    res.json({ projectId, adjacentCounties: adjInfo, note: 'Use POST /research/cross-county/detect for live detection' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start Server ───────────────────────────────────────────────────────────

validateEnvironment();

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║       Starr Research Worker v5.1                     ║
║       Port: ${PORT}                                      ║
║       Node: ${process.version}                           ║
║       Env:  ${process.env.NODE_ENV ?? 'development'}                         ║
╚══════════════════════════════════════════════════════╝
`);
  console.log('[Server] Endpoints:');
  console.log('  GET    /health');
  console.log('  POST   /research/discover               ← Phase 1: property identity');
  console.log('  POST   /research/harvest                 ← Phase 2: document harvesting');
  console.log('  GET    /research/harvest/:projectId      ← Phase 2: harvest status/result');
  console.log('  POST   /research/analyze                 ← Phase 3: AI document intelligence');
  console.log('  GET    /research/analyze/:projectId      ← Phase 3: analysis status/result');
  console.log('  POST   /research/subdivision             ← Phase 4: subdivision intelligence');
  console.log('  GET    /research/subdivision/:projectId  ← Phase 4: subdivision status/result');
  console.log('  POST   /research/adjacent                ← Phase 5: adjacent property research & cross-validation');
  console.log('  GET    /research/adjacent/:projectId     ← Phase 5: adjacent status/result');
  console.log('  POST   /research/row                    ← Phase 6: TxDOT ROW & public infrastructure integration');
  console.log('  GET    /research/row/:projectId         ← Phase 6: ROW integration status/result');
  console.log('  POST   /research/reconcile               ← Phase 7: geometric reconciliation');
  console.log('  GET    /research/reconcile/:projectId    ← Phase 7: reconciliation status/result');
  console.log('  POST   /research/confidence              ← Phase 8: confidence scoring');
  console.log('  GET    /research/confidence/:projectId   ← Phase 8: confidence report');
  console.log('  POST   /research/purchase                ← Phase 9: document purchase');
  console.log('  GET    /research/purchase/:projectId     ← Phase 9: purchase report');
  console.log('  POST   /research/run                    ← Phase 10: full pipeline');
  console.log('  GET    /research/run/:projectId         ← Phase 10: pipeline status');
  console.log('  POST   /research/report                 ← Phase 10: generate reports');
  console.log('  GET    /research/deliverables/:projectId← Phase 10: list deliverables');
  console.log('  GET    /research/download/:id/:format   ← Phase 10: download file');
  console.log('  POST   /research/flood-zone             ← Phase 11: FEMA flood zone query');
  console.log('  GET    /research/flood-zone/:projectId  ← Phase 11: flood zone result');
  console.log('  POST   /research/chain-of-title         ← Phase 11: deep chain of title');
  console.log('  GET    /research/chain-of-title/:projectId ← Phase 11: chain of title result');
  console.log('  POST   /research/batch                  ← Phase 11: batch processing job');
  console.log('  GET    /research/batch/:batchId         ← Phase 11: batch status');
  console.log('  GET    /research/clerk-registry/:county ← Phase 11: clerk system lookup');
  console.log('  GET    /research/access/platforms       ← Phase 14: paid platform catalog');
  console.log('  GET    /research/access/plan/:fips      ← Phase 14: county access plan');
  console.log('  POST   /research/access/document        ← Phase 14: free-first document fetch');
  console.log('  GET    /research/access/result/:id/:instr ← Phase 14: cached access result');
  console.log('  POST   /research/purchase/automated     ← Phase 15: Tyler/Henschen/iDocket/Fidlar/GovOS/LandEx');
  console.log('  GET    /research/purchase/platforms/status ← Phase 15: adapter configuration status');
  console.log('  POST   /research/notifications/test     ← Phase 15: test email/SMS notification');
  console.log('  GET    /research/landex/estimate        ← Phase 15: LandEx cost estimate');
  console.log('  GET    /research/lidar/counties         ← Phase 19: Texas counties with LiDAR coverage');
  console.log('  GET    /research/lidar/:projectId       ← Phase 19: LiDAR elevation data for project');
  console.log('  POST   /research/cross-county/detect    ← Phase 19: detect cross-county property');
  console.log('  GET    /research/cross-county/:projectId ← Phase 19: cross-county research plan');
  console.log('  POST   /research/topo                   ← Phase 13: USGS topographic data');
  console.log('  GET    /research/topo/:projectId        ← Phase 13: topographic result');
  console.log('  POST   /research/tax                    ← Phase 13: TX Comptroller tax data');
  console.log('  GET    /research/tax/:projectId         ← Phase 13: tax rate result');
  console.log('  GET    /research/boundary/:projectId    ← Phase 13: boundary viewer data');
  console.log('  POST   /research/full-pipeline');
  console.log('  POST   /research/validate-address       ← Pre-flight: verify address/county match');
  console.log('  POST   /research/property-lookup');
  console.log('  GET    /research/status/:projectId');
  console.log('  GET    /research/result/:projectId/full');
  console.log('  POST   /research/cancel/:projectId      ← Cancel running pipeline');
  console.log('  POST   /research/pause/:projectId       ← Pause timeline tracking');
  console.log('  POST   /research/resume/:projectId      ← Resume timeline tracking');
  console.log('  GET    /research/active');
  console.log('  DELETE /research/result/:projectId');
  console.log('');
  console.log('[Server] Site Health Monitor:');
  console.log('  GET    /admin/health/sites              ← All site health status');
  console.log('  GET    /admin/health/sites/:vendor      ← Vendor-specific health');
  console.log('  POST   /admin/health/check-all          ← Trigger full health check');
  console.log('  POST   /admin/health/check/:siteId      ← Check single site');
  console.log('  POST   /admin/health/check-vendor/:v    ← Check all sites for vendor');
  console.log('  GET    /admin/health/alerts             ← Recent health alerts');
  console.log('  DELETE /admin/health/alerts             ← Clear alerts');
  console.log('');

  // Start periodic health checks (every 6 hours — reduced to minimise log noise)
  siteHealthMonitor.startPeriodicChecks(6 * 60 * 60 * 1000);
});
