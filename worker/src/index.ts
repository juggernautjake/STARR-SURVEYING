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
import { notifyResearchInitiator } from './shared/notify-research-done.js';
import { getLiveLogForProject, clearLiveLogForProject, PipelineLogger } from './lib/logger.js';
import { getTracker, getTrackerIfExists, clearTracker } from './lib/timeline-tracker.js';
import { enableTracing, disableTracing } from './lib/trace.js';
import { globalStepGate } from './lib/step-gate.js';
import { runCountyResearch, validateAddressCounty, type CountyResearchInput, type UnifiedResearchResult, type CountyResearchProgress } from './counties/router.js';
import { PropertyDiscoveryEngine } from './services/property-discovery.js';
import { DocumentHarvester, type HarvestInput } from './services/document-harvester.js';
import { syncHarvestToSupabase } from './services/harvest-supabase-sync.js';
import { SubdivisionIntelligenceEngine } from './services/subdivision-intelligence.js';
import { runAdjacentResearch, type FullCrossValidationReport } from './services/adjacent-research-orchestrator.js';
// The neighbour register the app reads — until this, the adjacent phase's findings lived in a /tmp
// blob the container wipes (research plan R31).
import { describePersist, persistAdjoiners, type AdjoinerInput } from './infra/adjoiner-persistence.js';
import { runROWIntegration, type ROWReport } from './services/row-integration-engine.js';
import { GeometricReconciliationEngine } from './services/geometric-reconciliation-engine.js';
import { uploadPipelineArtifacts, beginFiling, endFiling, type ArtifactScreenshot, type ArtifactPageImage } from './services/artifact-uploader.js';
import { alreadyFiledThisRun, beginGenericFiling, endGenericFiling, genericDocumentRow } from './research/file-generic-document.js';
import { recordSkippedPurchases } from './services/purchase-ledger.js';
import { describeRunOutcome } from './research/run-outcome.js';
import { buildPhase7Document, writePhase7Document } from './research/phase7-bridge.js';
import { lookupCountyFIPS } from './lib/county-fips.js';
import { assessPurchaseReadiness } from './research/purchase-readiness.js';
import { ConfidenceScoringEngine } from './services/confidence-scoring-engine.js';
import { DocumentPurchaseOrchestrator } from './services/document-purchase-orchestrator.js';
// The mode a researcher picks when starting a run — free first, paid on demand (plan S-11).
import { buildPlan, type ResearchMode } from './research/research-modes.js';
import { RunProgressTracker, clampRunMinutes } from './research/run-phases.js';
import { normaliseRunSettings, describeRunSettings, type RunSettings } from './research/run-settings.js';
import { resolveEffectiveSettings, decidePurchase, describeSkippedPurchase, type PurchaseDecision } from './research/purchase-gate.js';
import { planCaptures, type CapturePlanInput } from './research/capture-plan.js';
import { runCaptures } from './research/capture-runner.js';
import { huntDrawings, DRAWING_SEARCH_TERMS } from './research/drawing-hunt.js';
import { describeRunOrder } from './research/run-order.js';
import { platSourceStatement } from './services/county-plats.js';
import {
  reanalyseFiledDocuments, describeReanalysis, type FiledDocument,
} from './research/reanalyze-documents.js';
// The 19 counties that carry a GIS viewer URL. Already in the tree, used only to query features
// until now — never to photograph the viewer, which is what was asked for.
import { BIS_CONFIGS } from './services/bis-cad.js';
import { lookupByCounty } from './research/county-key.js';
import { storeCaptureImage, fileCaptureRow } from './services/artifact-uploader.js';
import type { PurchaseReport } from './types/purchase.js';
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
import { getClerkAdapter } from './services/clerk-registry.js';
import { searchDepsFromAdapter } from './chain-of-title/chain-search-deps.js';
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
import { acquireBrowser, validateAdapterFlagOnStartup } from './lib/browser-factory.js';
import { BrowserHealthCache, buildHealthz, configWarnings } from './infra/health.js';
import { describeCapacity, planCapacity, readMachine } from './infra/capacity.js';
// The research queue: what may run (R29), when to ask (R28/R29), and how to talk to the app.
import { pollOnce, type QueuedRequest, type RunningRun } from './infra/queue-worker.js';
import { pollerEnabled, startPoller } from './infra/queue-poller.js';
import { receiptPollerEnabled, makeSupabaseReceiptTick } from './infra/receipt-poller.js';
import { makeQueueClient } from './infra/queue-client.js';
import { clerkEntriesToCompiled, publishCompiledAdapters } from './infra/adapter-registry.js';
import { parseSiteId, persistHealthResults, persistRunOutcomes } from './infra/health-persistence.js';
import { checkBudget, endRun, limitsFor, startRun, windDownSummary } from './infra/run-budget.js';
import { withStepDeadline } from './research/budget-gate.js';
import { withRunContext, enterRunContext } from './infra/run-context.js';
import {
  persistRunLogs, shouldFlush, markFlushed, resetFlushClock,
} from './research/persist-run-logs.js';
import { BudgetAbort, OperatorAbort } from './research/abort-reason.js';
import { closeOpenRuns, describeRecovery, recordRunFinish, recordRunPhase, recordRunStart, recoverInterruptedRuns, type RunTrigger } from './infra/run-store.js';
import { resetRunSpend, spendForRun } from './infra/usage.js';
import { CLERK_REGISTRY } from './adapters/clerk-registry.js';
import { setSolveAttemptSink } from './lib/captcha-solver.js';
import { makePipelineLoggerCaptchaSink } from './lib/pipeline-logger-sinks.js';

// ── Server Setup ───────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? '3100', 10);
/** Reported by both health endpoints. Kept in one place because a version string that disagrees
 *  with itself is worse than no version string at all. */
const WORKER_VERSION = '5.1.0';

/** How many research runs this machine will hold at once (plan R7). Computed from cores and RAM at
 *  boot, not hardcoded, because the same image runs on a laptop and on a 12-core box — and the
 *  failure mode of guessing high is an OOM at minute 22 of a 25-minute run, after the paid documents
 *  have been bought. */
const CAPACITY = planCapacity(readMachine());

app.use(express.json({ limit: '100mb' })); // Large for file uploads

// ── Startup Validation ─────────────────────────────────────────────────────

function validateEnvironment(): void {
  const required: Array<{ key: string; critical: boolean }> = [
    { key: 'WORKER_API_KEY', critical: true },
    { key: 'ANTHROPIC_API_KEY', critical: true },
    { key: 'SUPABASE_URL', critical: false },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', critical: false },
    // Phase A integrations — all optional. The worker boots fine without
    // them, but specific code paths gate on them. Operators should see a
    // single-line warning per missing key on every boot so misconfiguration
    // is loud rather than silent.
    { key: 'REDIS_URL',                  critical: false }, // research-events publisher
    { key: 'CAPSOLVER_API_KEY',          critical: false }, // captcha-solver real provider
    { key: 'BROWSERBASE_API_KEY',        critical: false }, // browser-factory cloud backend
    { key: 'BROWSERBASE_PROJECT_ID',     critical: false },
    { key: 'BROWSERBASE_ENABLED_ADAPTERS', critical: false },
    { key: 'STORAGE_BACKEND',            critical: false }, // 'local' | 'r2'
    { key: 'R2_ACCOUNT_ID',              critical: false }, // only required when STORAGE_BACKEND=r2
    { key: 'R2_ACCESS_KEY_ID',           critical: false },
    { key: 'R2_SECRET_ACCESS_KEY',       critical: false },
    { key: 'R2_BUCKET',                  critical: false },
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

  // Phase A: log effective integration backend selections so the operator
  // can confirm at-a-glance which providers are active in this boot.
  const captchaProvider = process.env.CAPTCHA_PROVIDER
    ?? (process.env.CAPSOLVER_API_KEY ? 'capsolver (auto)' : 'stub (default)');
  const browserBackend  = process.env.BROWSER_BACKEND ?? 'local (default)';
  const storageBackend  = process.env.STORAGE_BACKEND ?? 'local (default)';
  const redisConfigured = process.env.REDIS_URL        ? 'configured' : 'MISSING (defaulting to redis://localhost:6379)';
  console.log(
    `[startup] Phase A: captcha=${captchaProvider} browser=${browserBackend} storage=${storageBackend} ` +
    `redis=${redisConfigured}`,
  );

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

/** Progress toward the run ENDING (owner, 2026-09-04): cost is primary, but a run also stops at the
 *  one-hour cap — so the bar shows whichever ceiling it is closer to, i.e. how close it is to done.
 *  Capped at 99 until the run truly finishes (finish() sets 100). */
function costProgressPercent(projectId: string): number {
  const status = checkBudget(projectId, spendForRun(projectId));
  const costPct = Number.isFinite(status.limitUsd) && status.limitUsd > 0
    ? (status.spentUsd / status.limitUsd) * 100 : 0;
  const timePct = Number.isFinite(status.limitMs) && status.limitMs > 0
    ? (status.elapsedMs / status.limitMs) * 100 : 0;
  return Math.min(99, Math.max(0, Math.round(Math.max(costPct, timePct))));
}

// ── In-Memory State ────────────────────────────────────────────────────────

const activePipelines = new Map<string, ActivePipeline>();
/**
 * How far each live run has got, kept OUTSIDE `activePipelines` because it must survive the moment
 * the pipeline is removed from that map — the status endpoint needs a truthful final percentage for
 * a run that has just ended, and a run that stopped at 68% should keep saying 68%.
 *
 * The tracker is monotonic by construction; see `research/run-phases.ts` for why that matters more
 * than accuracy at any single instant.
 */
const runProgress = new Map<string, RunProgressTracker>();
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

  // ── 0. The neighbour register (plan E4) ────────────────────────────
  //
  // The only writer of `research_adjoiners` sat behind POST /research/adjacent — a Testing-Lab
  // route — and passed owner names only. A normal Bell run now finds its neighbours from the GIS
  // (orchestrator Phase 4) and files them here with parcel id, situs address, acreage, legal
  // description and the direction they adjoin. Wrapped: bookkeeping on data already gathered
  // must not fail the run that gathered it.
  if (r.adjacentProperties.length > 0) {
    try {
      const inputs: AdjoinerInput[] = r.adjacentProperties.map((p) => ({
        owner: p.ownerName,
        parcelId: p.propertyId && !p.propertyId.startsWith('unknown-') ? p.propertyId : null,
        situsAddress: p.situsAddress ?? null,
        legalDescription: p.legalDescription ?? null,
        acreage: p.acreage ?? null,
        identifiedBy: 'gis_adjacency',
        adjoinsWhere: [p.direction, p.sharedBoundary].filter(Boolean).join(' — ') || null,
        documents: [],
        researchStatus: 'complete',
        sourceUrl: p.sourceUrl ?? null,
      }));
      const result = await persistAdjoiners(supabase, projectId, inputs);
      console.log(describePersist(result, inputs));
    } catch (e) {
      console.warn(`[Adjoiners] ${projectId}: register not written from the Bell run —`, e);
    }
  }

  // ── 0b. What the sources did for this run (plan B*5b) ──────────────
  //
  // The same registry the six-hourly probe writes, fed by the strongest evidence there is: a
  // real search against a real parcel. `no_record` is recorded but never quarantines; two `error`s
  // do. See health-persistence.ts for the judgement.
  if (r.sourceOutcomes && r.sourceOutcomes.length > 0) {
    try {
      const h = await persistRunOutcomes(r.sourceOutcomes, resolveAdapterForSite);
      const bits = [
        `${h.written} source outcome(s) recorded from the run`,
        h.statusChanges.length > 0 ? `${h.statusChanges.length} adapter status change(s): ${h.statusChanges.map((c) => `${c.from}→${c.to}`).join(', ')}` : null,
        h.unmatched.length > 0 ? `${h.unmatched.length} with no registered adapter (${h.unmatched.join(', ')})` : null,
        h.errors.length > 0 ? `errors: ${h.errors.join('; ')}` : null,
      ].filter(Boolean).join(' · ');
      console.log(`[SourceHealth] ${projectId}: ${bits}`);
    } catch (e) {
      console.warn(`[SourceHealth] ${projectId}: run outcomes not recorded —`, e);
    }
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
      // E5 — the tract's abstract and original survey were resolved in Phase 1 and never
      // persisted, so the review page could show Lot/Block/Subdivision and nothing for an
      // acreage tract, which is what most of this county is.
      abstractNumber: property.abstractNumber || null,
      surveyName: property.surveyName || null,
      // E1 — the county's parcel polygon, so the review page can draw the actual lot outline.
      parcelBoundary: property.parcelBoundary ?? null,
      documentCount: deedCount + platCount,
      duration_ms: r.durationMs,
      deedSummary: r.deedsAndRecords.summary || null,
      platSummary: r.plats.summary || null,
      easementSummary: r.easementsAndEncumbrances.summary || null,
      discrepancyCount: r.discrepancies.length,
      confidenceTier: r.overallConfidence.tier,
      confidenceScore: r.overallConfidence.score,
      // E2 — the cited summary when the run wrote one; the five-line field list only as a
      // fallback. `masterReportText` was hardcoded null here, which is why every Bell project's
      // Summary tab showed a form rather than a reading.
      finalSummary: r.propertySummary ?? autoSummary,
      masterReportText: r.propertySummary ?? null,

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
      // ── "THE AI THINKS THE DOCUMENTS ARE UNREADABLE" ────────────────────────────────────
      //
      // This was `deed.aiSummary ?? deed.legalDescription ?? null`. A summary is a CONCLUSION,
      // not an extraction — so when the AI stage was skipped or failed, `extracted_text` went in
      // NULL, `assessArtifact` read that as "No text was extracted from this document at all",
      // and the document was stamped unreadable. All sixteen deeds from the 2026-09-03 run:
      // `extracted_text` NULL, `extracted_text_method` NULL, page images present and legible at
      // 2550×3300.
      //
      // The read now comes first and stands on its own. `legalDescription` remains as a last
      // resort — it is at least text off the record — and the summary goes to its own field rather
      // than impersonating an extraction.
      const deedText = deed.ocrText ?? deed.legalDescription ?? null;
      const deedTextMethod = deed.ocrText
        ? (deed.ocrTextMethod ?? 'bell-deed-regions')
        : (deed.legalDescription ? 'cad-legal-description' : null);

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
            extractedTextMethod: deedTextMethod,
            aiSummary: deed.aiSummary ?? null,
            ocrConfidence: deed.ocrConfidence ?? null,
            ocrSegments: deed.ocrSegments ?? null,
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

// ── Liveness (/healthz) ────────────────────────────────────────────────────
//
// The endpoint the Dockerfile has always polled and the app never defined — see
// `src/infra/health.ts` for why this is a separate, cheaper endpoint rather than an alias of
// /health. Cached browser probe; config gaps are reported, not fatal.

const browserHealth = new BrowserHealthCache(async () => {
  const startedAt = Date.now();
  try {
    const browser = await acquireBrowser({ launchOptions: { headless: true, args: ['--no-sandbox'] } });
    await browser.close();
    return { ok: true, durationMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    };
  }
});

app.get('/healthz', (_req: Request, res: Response) => {
  const { status, body } = buildHealthz({
    version: WORKER_VERSION,
    buildSha: process.env.BUILD_SHA ?? process.env.GIT_SHA ?? 'unknown',
    uptimeSeconds: process.uptime(),
    browserBackend: process.env.BROWSER_BACKEND ?? 'local',
    browser: browserHealth.read(),
    activePipelines: activePipelines.size,
    completedResults: completedResults.size,
    warnings: configWarnings(),
    capacity: CAPACITY,
  });
  res.status(status).json(body);
});

// ── Health Check (deep) ────────────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // Check Playwright
  try {
    const { chromium } = await import('playwright');
    const browser = await acquireBrowser({ launchOptions: { headless: true, args: ['--no-sandbox'] } });
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

  // ── Phase A integrations ──
  // Each check is config-only (does NOT make an outbound call) so /health
  // stays cheap and never times out on a flaky third party. The Testing
  // Lab "Phase A Integrations" section surfaces these statuses.
  // ── CAPTCHA SOLVING IS BUILT AND UNWIRED — corrected 2026-08-30 ──────────────────────────────
  //
  // This used to report `status: 'ok'` whenever CAPSOLVER_API_KEY was present. Measured with a
  // control: `getCaptchaSolver()` has ZERO callers outside its own module and tests, while
  // `browser-factory` has 37 importers. Only `setSolveAttemptSink` — telemetry plumbing — is wired
  // into this file. No adapter ever asks the solver to solve anything.
  //
  // So a green `captcha_solver` meant "a key is present" while reading as "challenges get solved",
  // and an operator setting that key would be paying for a service nothing calls. That is the same
  // shape as the `websocket_auth` check removed from this handler earlier today, and as the
  // TAVILY_API_KEY warning before it.
  //
  // Reported as `unconfigured` rather than `warning` because nothing is broken — the capability was
  // never connected, which is a known state, not a fault. The detail says what an operator would
  // otherwise have to read the source to discover.
  checks.captcha_solver = {
    status: 'unconfigured',
    detail: 'NOT WIRED — no adapter invokes the solver, so a portal that challenges will fail '
      + `regardless of CAPSOLVER_API_KEY (provider=${process.env.CAPTCHA_PROVIDER ?? 'stub'})`,
  };

  const browserBackend = process.env.BROWSER_BACKEND ?? 'local';
  if (browserBackend === 'browserbase') {
    const ok = !!(process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID);
    const enabled = process.env.BROWSERBASE_ENABLED_ADAPTERS ?? '';
    checks.browser_factory = ok
      ? { status: 'ok',      detail: `backend=browserbase enabled=${enabled || '(none — gates all callers to local)'}` }
      : { status: 'warning', detail: 'backend=browserbase but BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID missing' };
  } else {
    checks.browser_factory = { status: 'ok', detail: `backend=${browserBackend}` };
  }

  const storageBackend = process.env.STORAGE_BACKEND ?? 'local';
  if (storageBackend === 'r2') {
    const haveAll = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID
      && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET;
    checks.document_storage = haveAll
      ? { status: 'ok',      detail: `backend=r2 bucket=${process.env.R2_BUCKET}` }
      : { status: 'warning', detail: 'backend=r2 but R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET missing' };
  } else {
    checks.document_storage = { status: 'ok', detail: `backend=${storageBackend}` };
  }

  checks.research_events = process.env.REDIS_URL
    ? { status: 'ok', detail: 'REDIS_URL configured' }
    : { status: 'warning', detail: 'REDIS_URL missing — falling back to redis://localhost:6379' };

  // ── `websocket_auth` REMOVED 2026-08-30 — it was a claim about a different process ───────────
  //
  // It read: ok when `WS_TICKET_SECRET` is set, otherwise "missing — /api/ws/ticket will return
  // 503". Both halves were about somebody else. `/api/ws/ticket` is a Next.js route running on
  // Vercel and reads ITS OWN environment; nothing this worker has or lacks can change what it
  // returns. And this process serves no WebSocket at all — there is no `WebSocketServer` and no
  // `upgrade` handler anywhere in it. `server/ws.ts` is an app process started by `npm run ws`,
  // absent from docker-compose.yml. The only worker file that read the key,
  // `websocket/progress-server.ts`, was an orphan nothing constructed — and it was DELETED on
  // 2026-09-03 (plan F5), after its heartbeat was merged into `server/ws.ts`. So the worker now
  // reads `WS_TICKET_SECRET` nowhere at all, which is the honest end state of this note.
  //
  // So a green `websocket_auth` meant "a string is present in this container's environment" while
  // reading as "WebSocket authentication is working". That is the TAVILY_API_KEY bug exactly —
  // recorded in this repo, in `warnings-are-about-this-process.test.ts`, three weeks before this
  // one was found — and it repeated because that guard scans `infra/health.ts` and this claim lives
  // in the handler here. The guard now covers this handler too, using reachability from index.ts,
  // so a key read only by an orphan no longer counts as used.
  //
  // Nothing replaces it. A health check that cannot observe the thing it reports on has no honest
  // version; the operator is better served by its absence than by a green light for a feature that
  // is switched off. Live progress is polled by the UI on a 3-second interval and is known to be
  // off in production.

  const allOk = Object.values(checks).every((c) => c.status === 'ok' || c.status === 'unconfigured');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    version: WORKER_VERSION,
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

app.post('/research/property-lookup', requireAuth, async (req: Request, res: Response) => {
  const body = req.body as Partial<PipelineInput> & {
    userFiles?: unknown;
    /** Per-run settings the operator chose. See `RunSettings` and seed 623. */
    settings?: Record<string, unknown>;
    /** Free-text starting information the operator typed for this run. */
    operatorNotes?: string;
    trigger?: RunTrigger;
  };

  const { projectId, address, addressParts, county, state, propertyId, ownerName, instrumentNumber, userFiles } = body;

  // Validate input: address and county are both required
  if (!projectId) {
    res.status(400).json({ error: 'Missing required field: projectId' });
    return;
  }

  // ── THE DOOR AND THE READINESS CHECK MUST AGREE ─────────────────────────────────────────
  //
  // `lib/research/run-readiness.ts` — shared by the create form, the Start button and the pipeline
  // route so that "a run refused by the server can never be one the button offered" — says a
  // Property ID alone is 'exact' and an instrument number alone is 'strong'. This door required an
  // address regardless, so those projects showed an enabled Start button and a "Ready to run"
  // headline, then failed with this 400. The 2026-09-03 run log proves the ID is enough: the GIS
  // layer found parcel 42156 by ID at [1s] while the appraisal site was dark, and the generic
  // path's Stage 1 has a direct-ID lookup and Stage 2 a by-instrument fetch. Found by the
  // 2026-09-03 platform audit (api-routes C1).
  if (!address && !propertyId && !instrumentNumber) {
    res.status(400).json({
      error: 'Missing required field: address',
      hint: 'A property address, a Property ID or an instrument number is required to start research.',
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

  // Admission control (plan R7). Refusing a run the machine cannot hold is far better than
  // accepting it and OOM-killing a neighbour at minute 22 — the caller gets a 503 it can queue or
  // retry on, and the runs already in flight survive.
  if (activePipelines.size >= CAPACITY.maxConcurrentPipelines) {
    res.status(503).json({
      error: `This worker is at capacity (${activePipelines.size}/${CAPACITY.maxConcurrentPipelines} research runs).`,
      hint: describeCapacity(CAPACITY),
      retryable: true,
      activePipelines: activePipelines.size,
      maxConcurrentPipelines: CAPACITY.maxConcurrentPipelines,
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
    // The parts the operator typed, carried through rather than re-derived downstream (seed 624).
    addressParts,
    propertyId: propertyId ?? undefined,
    // Seed 625. Without this line the app sends a starting deed and the router never sees it —
    // the payload reaches the door and stops, which is the defect shape this file keeps finding.
    instrumentNumber: instrumentNumber ?? undefined,
    ownerName: ownerName ?? undefined,
    // ── THE NOTES REACHED THE DOOR AND STOPPED ────────────────────────────────────────────
    //
    // `body.operatorNotes` was already read twice below — once into the run record's `inputs`,
    // once into the HTTP response — so both of those said the notes had been sent. Neither is
    // read by any research code. This object is the only thing the research code sees, and the
    // notes were never put on it, so the create form's "Sent to the AI with the run" was false
    // for every run ever made.
    operatorNotes: body.operatorNotes?.trim() || undefined,
    // ── THE ORDER THE OWNER ASKED FOR (plan C3) ───────────────────────────────────────────
    //
    // "the order should be, drawings/plats, then the overhead views, then the rest of the
    // documents". Both research paths await this at the moment they identify the parcel, so the
    // visual evidence is gathered BEFORE the open-ended document search rather than after it.
    //
    // Until now these captures were a post-processing step here in `index.ts`, running after
    // `runCountyResearch` returned. On 2026-09-03 that meant the run reached them at [1377s],
    // having already spent 163 minutes and every dollar of a $2 ceiling, only to print
    // "Direct map screenshots skipped — no property ID or coordinates".
    onPropertyIdentified: async (identified) => {
      try {
        await captureVisualsAtIdentification(projectId, county, identified);
      } catch (e) {
        console.warn(`[Capture] ${projectId}: early visual phase threw — ${String(e)}`);
      }
    },
    uploadedFiles: parsedUserFiles?.map(f => ({
      name: f.filename,
      mimeType: f.mimeType,
      content: f.data,
      description: f.description,
    })),
  };

  // ── Everything the previous run left behind, cleared before this one exists ───────────────────
  //
  // This block used to clear three in-process maps and stop. It was not enough, and the gap was
  // visible on screen: a re-run showed **"Research Failed — Pipeline cancelled by user"** while the
  // new run was happily retrieving documents in the background.
  //
  // The mechanism was a race with a stale cache. `GET /research/status/:projectId` consulted
  // `completedResults` BEFORE `activePipelines`, so between the operator pressing re-run and this
  // handler running, every poll returned the PREVIOUS run's terminal result. The panel latched
  // `failed`, called `stopPolling()`, and never looked again — so the moment the old result was
  // deleted here made no difference, because nothing was still asking.
  //
  // Both halves are fixed: the status endpoint now prefers a live pipeline over any cached result
  // (an actively running pipeline cannot be less current than a finished one), and the clearing
  // happens here as well so a poll landing between the two also gets the right answer.
  completedResults.delete(projectId);
  completedResultsCachedAt.delete(projectId);
  completedLogs.delete(projectId);
  // A re-run must take its own captures. Left set, the second run would see the first run's flag
  // and skip its fallback — the precise shape of stale-state bug this block exists to prevent.
  visualsCaptured.delete(projectId);
  // Otherwise a re-run started within the interval would wait before its first flush, which is
  // exactly the window a crash is most likely to fall in.
  resetFlushClock(projectId);
  clearRunningMessage(projectId);
  clearLiveLogForProject(projectId);
  clearTracker(projectId);
  runProgress.delete(projectId);

  // Any `research_runs` row still marked `running` for this project belongs to a run that is over —
  // this handler refuses to start while one is genuinely active (the 409 above). Leaving it open
  // makes an ended run look live to every DB-fallback path forever.
  await closeOpenRuns(
    projectId,
    'interrupted',
    'A new run was started for this project before this one had been closed out.',
  );

  const pipelineAbortController = new AbortController();
  const startedAtIso = new Date().toISOString();

  // ── The run record, created BEFORE the pipeline, and awaited ──────────────────────────────────
  //
  // It was `void recordRunStart({…})` further down, after the 202 had already gone out. Nothing
  // downstream could know the run's id, which is precisely why the app's own report card carries
  // the line "nothing tags a document or fact with its run". Awaiting it costs one round trip and
  // buys attribution for every document the run files.
  const runSettings = normaliseRunSettings(body.settings);
  const budgetLimits = limitsFor({
    // Both of these were being dropped. `limitsFor()` has accepted a per-run clock and a per-run
    // cost since it was written; the app never sent either, so every run silently got the defaults
    // whatever the operator chose in the UI.
    maxResearchTimeMinutes: runSettings.maxResearchTimeMinutes ?? researchInput.maxResearchTimeMinutes,
    maxCostUsd: runSettings.maxCostUsd ?? researchInput.maxCostUsd,
  });

  const startedRun = await recordRunStart({
    projectId,
    county,
    address: researchInput.address,
    limits: budgetLimits,
    trigger: body.trigger,
    settings: runSettings as unknown as Record<string, unknown>,
    inputs: {
      address: researchInput.address ?? null,
      county,
      state: researchInput.state ?? 'TX',
      parcelId: researchInput.propertyId ?? null,
      ownerName: researchInput.ownerName ?? null,
      operatorNotes: body.operatorNotes ?? null,
      attachedFiles: parsedUserFiles?.map((f) => f.filename) ?? [],
    },
  });

  activePipelines.set(projectId, {
    projectId,
    address: researchInput.address ?? '',
    county,
    state: researchInput.state ?? 'TX',
    startedAt: startedAtIso,
    currentStage: 'Routing',
    abortController: pipelineAbortController,
    runId: startedRun?.runId ?? null,
    runNumber: startedRun?.runNumber ?? null,
    stopReason: null,
    settings: runSettings as unknown as Record<string, unknown>,
  });

  // ── THE WATCHDOG — a ceiling nobody checks is not a ceiling ────────────────────────────────
  //
  // The budget was tested only inside the progress callback. A step that emits no progress —
  // a long owner search, the post-run document re-read — was therefore unstoppable: on
  // 2026-09-03 a 30-minute run showed "2:46:18 / 30:00" on the screen while the status poll
  // said "aborted (budget)", because the abort had fired and nothing running was listening.
  // This timer does not rely on anyone reporting. When the ceiling passes it sets the same stop
  // reason and fires the same abort the progress path would have, and the tail below honours it.
  if (Number.isFinite(budgetLimits.maxWallClockMs) && budgetLimits.maxWallClockMs > 0) {
    const graceMs = 30_000;
    const watchdog = setTimeout(() => {
      const active = activePipelines.get(projectId);
      if (!active || active.abortController?.signal.aborted) return;
      const minutes = Math.round(budgetLimits.maxWallClockMs / 60_000);
      // Cost is primary, but no run goes beyond an hour (owner, 2026-09-04). This is that hard cap.
      const message =
        `Finished at the ${minutes}-minute limit. Cost is the primary ceiling, but a run never goes ` +
        'beyond an hour; what it produced is kept. Raise the cost limit to get more within the hour.';
      active.stopReason = { kind: 'budget', message };
      active.abortController?.abort(new BudgetAbort(message));
      console.warn(`[budget] ${projectId}: WALL-CLOCK cap fired at ${minutes} min`);
    }, budgetLimits.maxWallClockMs + graceMs);
    watchdog.unref?.();
    const active = activePipelines.get(projectId);
    if (active) active.watchdog = watchdog;
  }

  // ── THE COST WATCHDOG — the run ends the moment it reaches its cost limit (owner, 2026-09-04) ──
  //
  // Cost is the ceiling. Checking only at phase boundaries let run 9 spend $2.92 on a $2 cap. This
  // polls the run's spend and fires the same abort the instant spend crosses the cap, so the
  // overshoot is at most one in-flight AI call, not a dollar. Self-clearing: it stops when the run
  // is gone or already aborted. Raising the cost cap mid-run (a later slice) simply lets it run on.
  if (Number.isFinite(budgetLimits.maxCostUsd) && budgetLimits.maxCostUsd > 0) {
    const costPoll = setInterval(() => {
      const active = activePipelines.get(projectId);
      if (!active || active.abortController?.signal.aborted) { clearInterval(costPoll); return; }
      const status = checkBudget(projectId, spendForRun(projectId));
      if (status.exceeded === 'cost' || status.exceeded === 'paid_pages') {
        const message = status.exceeded === 'cost'
          ? `Finished at the $${budgetLimits.maxCostUsd.toFixed(2)} cost limit you set. Raise the cost limit and re-run to research further.`
          : `Finished at the ${budgetLimits.maxPaidPages} paid-page limit you set.`;
        active.stopReason = { kind: 'budget', message };
        active.abortController?.abort(new BudgetAbort(message));
        console.warn(`[budget] ${projectId}: COST watchdog fired — spent $${status.spentUsd.toFixed(2)} of $${budgetLimits.maxCostUsd.toFixed(2)}`);
        clearInterval(costPoll);
      }
    }, 500);
    costPoll.unref?.();
  }
  // The bar paces itself to the length this run was given (15–60 min, 30 default). The SHARES
  // are unchanged — retrieval is the same proportion of a short run as of a long one, because it
  // is the same work — so only the speed differs. Without this the bar is calibrated to one
  // nominal length and lies about every other.
  runProgress.set(
    projectId,
    new RunProgressTracker(
      Date.now(),
      clampRunMinutes(runSettings.maxResearchTimeMinutes) * 60,
    ),
  );

  // ── The project's existing library, loaded before a single document is filed ─────────────────
  //
  // Opened HERE and not at the artifact-upload step, because most of a county run's documents are
  // written incrementally while the run is still going — the deed images as the clerk scraper finds
  // them, the plats as the plat scraper finds them. A check that only ran at the end would miss
  // every one of them and dedupe only the tail.
  //
  // Failure to load is not fatal: with no context the filer writes as it always did. A document
  // lost because its bookkeeping was unavailable is a worse outcome than a duplicate.
  // B2. Opened unconditionally and before the library, because it tracks what the run has FILED
  // rather than what it has seen before. If the library fails to open, documents still file (without
  // cross-run dedupe), and the end-of-run sweep must still know which of them already landed —
  // otherwise a failed library turns into duplicated rows.
  beginGenericFiling(projectId);

  try {
    const supabaseForFiling = await getSupabase();
    if (supabaseForFiling) {
      await beginFiling(supabaseForFiling as never, projectId, county, startedRun?.runId ?? null);
    }
  } catch (err) {
    console.warn(
      `[Worker] ${projectId}: could not open the project library — documents will be filed without ` +
      `the cross-run duplicate check. ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Initialize the timeline tracker for this pipeline run so every log entry
  // and phase transition is captured as a granular timeline event for the
  // Testing Lab's ExecutionTimeline + CodeViewer.
  const timeline = getTracker(projectId);
  timeline.add('phase-start', 'Pipeline started', `${county} County — ${researchInput.address ?? ''}`);

  // Budget + timebox (plan R5). The owner's ask is a run that works for 20–30 minutes and is "as
  // cheap but as effective as possible" — both halves are ceilings, and without them a run that
  // finds an interesting chain of title follows it for an hour.
  //
  // `budgetLimits` is computed further up now, because the run record has to carry it and the run
  // record has to exist before the pipeline files its first document.
  resetRunSpend(projectId);
  startRun(projectId, budgetLimits);
  console.log(
    `[budget] ${projectId}: ${Math.round(budgetLimits.maxWallClockMs / 60_000)} min, ` +
    `$${budgetLimits.maxCostUsd.toFixed(2)}, ${budgetLimits.maxPaidPages} paid page(s)` +
    `, paid documents ${runSettings.allowPaidDocuments === false ? 'OFF' : 'on'}`,
  );

  // Enable function-level tracing when the request came from the Testing Lab.
  // testMode is set by the run proxy route's workerBody.
  if ((body as Record<string, unknown>).testMode) enableTracing(projectId);

  // Enable step-through mode when executionMode='step' is set by the Testing Lab.
  if ((body as Record<string, unknown>).executionMode === 'step') {
    globalStepGate.enableStepMode(projectId);
  }

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

  // Return 202 immediately.
  //
  // `runId` travels in the acceptance, and that is what lets the client refuse a stale answer. The
  // panel records the run it started; any status payload naming a different run — or naming none —
  // cannot end its poll. Without it, a poll landing on the previous run's cached terminal result
  // latched "Research Failed" and called `stopPolling()` while this run was still working.
  res.status(202).json({
    message: 'Pipeline started',
    projectId,
    status: 'running',
    runId: startedRun?.runId ?? null,
    runNumber: startedRun?.runNumber ?? null,
    startedAt: startedAtIso,
    settings: runSettings,
    settingsSummary: describeRunSettings(runSettings),
    pollUrl: `/research/status/${projectId}`,
    input: {
      address: researchInput.address || undefined,
      county,
      propertyId: researchInput.propertyId,
      ownerName: researchInput.ownerName,
      userFileCount: parsedUserFiles?.length ?? 0,
      operatorNotes: body.operatorNotes ?? null,
    },
  });

  // The order this run will follow, said out loud before it starts. An operator who asked for
  // "drawings/plats, then the overhead views, then the rest" should be able to see that is what
  // they got, rather than infer it from timestamps.
  for (const line of describeRunOrder()) {
    handshakeLogger.attempt('[Order]', 'info', 'Run order', line).success(0, line);
  }

  // C4: say where this county's plats come from — or that it has no free source — before searching,
  // so an unindexed county says so rather than searching in silence.
  {
    const platLine = platSourceStatement(county);
    handshakeLogger.attempt('[Plats]', 'info', 'Plat source', platLine).success(0, platLine);
  }

  // B3: name the site playbooks this run drives from (or say the county has none authored yet).
  {
    const { describePlaybooks } = await import('./playbooks/index.js');
    const pbLine = describePlaybooks(county);
    handshakeLogger.attempt('[Playbooks]', 'info', 'Site playbooks', pbLine).success(0, pbLine);
  }

  // ── A4: read the queue we already paid for, before searching for more ────────────────────────
  //
  // A run leaves documents `processing_status = 'queued'` when its reading allowance runs out (see
  // the tail). Those pages are on file and already bought — so the NEXT run reads them FIRST, and a
  // backlog is worked down instead of growing while every run searches afresh. Gated on a queue
  // actually existing (never on a first run) and bounded by its own head allowance and the cost
  // budget, so the new search still happens. Non-fatal: a failure here never stops the run.
  try {
    const supaQueue = await getSupabase();
    if (supaQueue) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: queuedCount } = await (supaQueue as any)
        .from('research_documents')
        .select('id', { count: 'exact', head: true })
        .eq('research_project_id', projectId)
        .eq('processing_status', 'queued');
      const queued = queuedCount ?? 0;
      if (queued > 0) {
        handshakeLogger
          .attempt('[Reading]', 'info', 'Queue', `${queued} document(s) queued by an earlier run — reading them before searching.`)
          .success(0, `Reading ${queued} queued document(s) first.`);
        const headStartedAt = Date.now();
        const { readingAllowanceMs, summariseUnsummarisedDocuments } = await import('./research/reading-pass.js');
        // A slice of the reading allowance, never more than 4 minutes: the backlog is read first but
        // must not eat the run whole. The cost budget stops it too.
        const headCapMs = Math.min(readingAllowanceMs(budgetLimits.maxWallClockMs), 4 * 60_000);
        const mayReadHead = () => {
          if (Date.now() - headStartedAt > headCapMs) return false;
          if (pipelineAbortController.signal.aborted) return false;
          const ex = checkBudget(projectId, spendForRun(projectId)).exceeded;
          return ex !== 'cost' && ex !== 'paid_pages';
        };
        await withRunContext(projectId, async () => {
          await reanalyseProjectDocuments(projectId, (line) => console.log(`[Reading:queue] ${projectId}: ${line}`), mayReadHead);
          await summariseUnsummarisedDocuments(supaQueue as never, projectId, process.env.ANTHROPIC_API_KEY ?? '', mayReadHead, (line) => console.log(`[Reading:queue] ${projectId}: ${line}`));
        });
      }
    }
  } catch (err) {
    console.warn(`[Worker] ${projectId}: head-of-run queue read failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── ATTRIBUTE EVERY AI CALL THIS RUN MAKES TO THIS RUN ───────────────────────────────────────
  //
  // Without this the main pipeline (all of Phase 1/2/3 — the analyzers and the adaptive-vision OCR,
  // which is the single biggest spender) ran OUTSIDE the run context, so its AI cost was neither
  // priced against the run nor counted toward the cost ceiling. Fresh run #1 (2026-09-05) recorded
  // $1.28 to its budget while the usage ledger showed the project spent tens of dollars — the $5 cap
  // never fired because it could not see the spend. `enterRunContext` makes the rest of this run's
  // async flow (the pipeline AND the tail) attribute to `projectId`, so the cost watchdog sees the
  // real number and the hard stop works.
  enterRunContext(projectId);

  // Run research pipeline in background — routes to county-specific or generic
  runCountyResearch(
    researchInput,
    (progress: CountyResearchProgress) => {
      // ── Budget check at the phase boundary (plan R5) ──
      //
      // Between phases, not inside one: stopping between leaves a coherent partial result;
      // stopping inside leaves half a chain of title. When a ceiling is hit the run is ABORTED
      // rather than failed — the abort unwinds to the caller, which returns what it has, and the
      // wind-down summary says what was skipped and why.
      // ── FLUSH THE DIARY WHILE THE RUN IS STILL ALIVE (plan F3) ────────────────────────────
      //
      // Both log writers fired at completion, so a run that is killed lost everything it learned —
      // which is what "there are no logs really" was. Safe to call repeatedly BY CONSTRUCTION:
      // `persistRunLogs` reads what is stored and merges, so a flush can only grow the record.
      //
      // Deliberately not awaited. The research must not wait on the diary, and a flush that loses
      // a race with the next one merges with it rather than overwriting it.
      if (shouldFlush(projectId, Date.now())) {
        markFlushed(projectId, Date.now());
        void (async () => {
          const supabase = await getSupabase().catch(() => null);
          const live = getLiveLogForProject(projectId) ?? [];
          if (live.length === 0) return;
          const outcome = await persistRunLogs(supabase as never, projectId, [live]);
          if (!outcome.saved) {
            console.warn(`[Worker] ${projectId}: mid-run log flush failed (${outcome.error ?? 'unknown'})`);
          }
        })();
      }

      const budget = checkBudget(projectId, spendForRun(projectId));
      if (!budget.ok && !pipelineAbortController.signal.aborted) {
        const summary = windDownSummary(budget);
        console.warn(`[budget] ${projectId}: ${summary}`);
        setRunningMessage(projectId, summary ?? 'Finished early — budget reached.');
        timeline.add('log', 'Budget', summary ?? 'budget reached');
        // ── SAY WHY, BEFORE ABORTING ──────────────────────────────────────────────────────────
        //
        // The abort itself carries no reason, and the status endpoint could only see
        // `signal.aborted`. So this — a run reaching the operator's own ceiling, which is a normal
        // and successful early finish — was reported identically to a person pressing cancel:
        // `{ status: 'failed', failureReason: 'Pipeline cancelled by user' }`. Operators saw
        // "Research Failed — Pipeline cancelled by user" beside a bar reading "Finished in 2
        // minutes for $0.02", describing the same run.
        const active = activePipelines.get(projectId);
        if (active) {
          active.stopReason = {
            kind: 'budget',
            message: summary ?? 'Finished early because this run reached its configured ceiling.',
          };
        }
        // The reason travels ON THE SIGNAL, not only in `activePipelines`. `stopReason` above
        // fixed the STATUS endpoint; the orchestrator throws its own exception and cannot see
        // that map, so it went on hardcoding "cancelled by user" — and that string, not the
        // status, is what lands in `research_runs.message` and in the Activity log. Half the fix
        // reached half the surfaces. `signal.reason` is readable anywhere the signal is.
        pipelineAbortController.abort(new BudgetAbort(summary ?? 'This run reached its configured ceiling.'));
      }

      // Update active pipeline stage from progress events
      const pipeline = activePipelines.get(projectId);
      if (pipeline) {
        pipeline.currentStage = progress.phase;
        pipeline.lastUpdate = progress.timestamp;
      }

      // Where the run actually is. Monotonic by construction — see research/run-phases.ts for why a
      // bar that walks backwards is read as "it crashed and started over", which is the complaint
      // this replaces.
      const tracker = runProgress.get(projectId);
      // `progress.pct` is documented as 0–100 WITHIN the current phase, and the tracker wants a
      // 0–1 fraction. Converting here rather than changing the field's meaning: `pct` has been on
      // `CountyResearchProgress` since the router was written and has never been set by anything,
      // so its meaning is still ours to fix rather than to preserve.
      const withinPhase = typeof progress.pct === 'number' ? progress.pct / 100 : 0;
      const snapshot = tracker?.observe(progress.phase, progress.message, withinPhase);

      // Heartbeat the durable record (plan R3). Carries the spend, so an interrupted run's cost is
      // known to within one phase rather than being reconstructed afterwards — and now the phase and
      // percentage too, so a poll that cannot reach this process still draws a truthful bar.
      void recordRunPhase(
        projectId,
        progress.phase,
        progress.message ?? null,
        spendForRun(projectId),
        0,
        pipeline?.runId ?? null,
        costProgressPercent(projectId), // the bar is cost, not time (owner, 2026-09-04)
      );
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
      disableTracing(projectId);
      globalStepGate.disableStepMode(projectId);

      // A run that stopped at a ceiling is not a failure — it is a usable answer plus a decision
      // for a person (plan R5). Say which, and what was not attempted, on the result itself: a
      // partial result that does not name what is missing is indistinguishable from a complete one,
      // and a surveyor cannot tell "no easements found" from "we stopped looking".
      const finalBudget = checkBudget(projectId, spendForRun(projectId));
      const windDown = windDownSummary(finalBudget);
      if (windDown) {
        (unifiedResult as unknown as Record<string, unknown>).budgetSummary = windDown;
        (unifiedResult as unknown as Record<string, unknown>).skippedWork = finalBudget.skipped;
        handshakeLogger.attempt('[Budget]', 'info', 'Budget reached', windDown).warn(windDown);
      }
      console.log(
        `[budget] ${projectId}: finished — ${Math.round(finalBudget.elapsedMs / 60_000)} min, ` +
        `${finalBudget.spentUsd.toFixed(4)} spent${finalBudget.exceeded ? ` (stopped on ${finalBudget.exceeded})` : ''}`,
      );
      // What the cross-run duplicate check actually did, said out loud. The owner asked for "a very
      // clear and detailed check"; a check whose result is never reported is indistinguishable from
      // no check at all.
      // ── THE TAIL RUNS INSIDE THE CEILING OR NOT AT ALL ─────────────────────────────────
      //
      // Everything below this line (imagery, the drawing hunt, the document re-read) ran AFTER
      // the pipeline returned, with no budget check, no deadline, and outside the run context —
      // so its model spend was not even attributed to the run. On 2026-09-03 the re-read kept a
      // 30-minute run alive for 2 h 46 m, at four-plus Vision calls a page, while the status poll
      // said "aborted (budget)". A run that has hit its ceiling now skips the tail and says so;
      // a run that has not is bounded by whatever time it has left, like every other step.
      const tailSignal = activePipelines.get(projectId)?.abortController?.signal;
      const ceilingHit = Boolean(finalBudget.exceeded) || Boolean(tailSignal?.aborted);
      const tailLog = (m: string) => handshakeLogger.attempt('[Budget]', 'info', 'Tail', m).warn(m);
      if (ceilingHit) {
        // Imagery capture is skipped at the ceiling; the READING pass is NOT — it reads what the
        // search already bought, bounded by cost rather than the clock. See below.
        tailLog('Imagery capture was not attempted — the run reached its wall-clock ceiling. The reading of documents already found still runs, under the cost budget.');
      }

      // ── IMAGERY, CAD GIS AND DRAWINGS (plan F1–F7) ──────────────────────────────────────
      //
      // Runs BEFORE endFiling, deliberately: the filing context holds the project library and
      // this run's id, so a capture goes down the same dedupe-and-attribute path as a deed. Move
      // this below endFiling and every screenshot is filed again on every run, which is the exact
      // defect that produced 19 of the 53 duplicate document groups measured in production.
      //
      // Never allowed to fail the run. The research is the point; imagery is supporting evidence,
      // and losing a completed run because a map server was slow would be a bad trade.
      if (!ceilingHit) {
        try {
          await withStepDeadline(projectId, 'imagery capture',
            () => captureImageryForRun(projectId, county, unifiedResult), undefined, tailLog);
        } catch (e) {
          console.warn(`[Capture] ${projectId}: imagery phase threw — ${String(e)}`);
        }
      }

      // ── THE DRAWING HUNT (plan F6) ──────────────────────────────────────────────────────
      //
      // "Work especially hard on finding drawings and cad work." The cheap half of that is to
      // recognise the drawings this run ALREADY retrieved: `DocumentType` is a five-value union
      // and the clerk classifier tests only the literal word PLAT, so "MAP OF SURVEY" — a
      // completed retracement with monuments called for, the single most useful document a
      // surveyor can find — was filed as `other` and became invisible.
      try {
        const docs = documentsForDrawingHunt(unifiedResult);
        const hunt = huntDrawings(docs, DRAWING_SEARCH_TERMS.map((t) => t.term));
        console.log(`[Drawings] ${projectId}: ${hunt.summary}`);
        for (const d of hunt.found) {
          console.log(`[Drawings] ${projectId}: ${d.category} (${d.strength}) — ${d.reason}`);
        }
        // Onto the result, so the report and the review screen can show it. A hunt whose answer
        // never leaves the log is indistinguishable from no hunt.
        (unifiedResult as unknown as Record<string, unknown>).drawingHunt = hunt;
      } catch (e) {
        console.warn(`[Drawings] ${projectId}: hunt threw — ${String(e)}`);
      }

      // ── EVERY DOCUMENT ON FILE, NOT EVERY DOCUMENT A STAGE TOUCHED (plan D6) ────────────
      //
      // "the analysis should run on each document to get a comprehensive idea of each one."
      //
      // Analysis used to happen where a STAGE touched a document. A deed retrieved by a path with
      // no analyser attached was a deed nobody ever read — measured on 2026-09-03 across the live
      // database: 87 documents with no extracted text at all (50 deeds, 26 plats, 2 easements),
      // every one of them with its page images sitting in storage, found and fetched and paid for
      // and never read.
      //
      // Asked here because this is after everything has filed and before the run reports. Never
      // allowed to fail the run: the research is the point, and a re-read that times out must not
      // lose work that succeeded.
      //
      // Inside the run context, so every Vision call it makes is attributed to THIS run's spend;
      // bounded by the time the run has left; and it asks the budget between documents and
      // between pages, so a ceiling reached mid-read stops the read rather than the read
      // outliving the run.
      // NOT gated on the ceiling. The wall-clock ceiling bounds the SEARCH; it does not cancel the
      // reading of what the search found. Those pages are bought and stored, and the run's COST
      // limit — asked between documents and between pages — is what bounds the reading. Runs 4, 5
      // and 6 (2026-09-04) each hit the ceiling inside Phase 2 and, under the old `!ceilingHit`
      // gate, read nothing: 60 documents on file, none summarised. The reading pass has its own
      // allowance (a slice of the ceiling) so it cannot itself run without end.
      try {
        // ── COST IS THE CEILING: read until the cost cap or an abort (owner, 2026-09-04) ──────────
        //
        // The documents already fetched are read until the run reaches its COST limit (the cost
        // watchdog aborts hard at the cap) or the safety net trips. No time window any more: a run
        // that stays under its cost cap reads everything it found; one that reaches the cap stops
        // there. Run 9 (36:25 on a 30-minute ceiling) is the run this replaces — there is no clock
        // to overrun now, only the cost limit, and the cost watchdog holds that to the dollar.
        const mayRead = () => {
          if (tailSignal?.aborted) return false;
          const ex = checkBudget(projectId, spendForRun(projectId)).exceeded;
          return ex !== 'cost' && ex !== 'paid_pages';
        };
        const report = await withRunContext(projectId, () =>
          reanalyseProjectDocuments(projectId, (line) => console.log(`[Reading] ${projectId}: ${line}`), mayRead));
        if (report) {
          tailLog(
            `Reading pass: ${report.reanalysed} document(s) read with the tiled reader` +
            (report.leftUnread ? `, ${report.leftUnread} queued for the next run` : '') +
            (report.failed ? `, ${report.failed} could not be read` : '') +
            ` of ${report.considered} on file.`);
        }
        // And a summary for every file that has text but no summary — including the ones read
        // cleanly on an earlier run, which the reader rightly skipped. Same cost budget.
        const summaryKey = process.env.ANTHROPIC_API_KEY ?? '';
        if (summaryKey) {
          const supa = await getSupabase().catch(() => null);
          if (supa) {
            const { summariseUnsummarisedDocuments } = await import('./research/reading-pass.js');
            const sweep = await withRunContext(projectId, () =>
              summariseUnsummarisedDocuments(supa as never, projectId, summaryKey, mayRead,
                (line) => console.log(`[Summary] ${projectId}: ${line}`)));
            if (sweep.considered > 0) tailLog(sweep.statement);
          }
        }

        // ── C3: read the plat/survey citations OUT OF the text the reading pass produced ──────
        //
        // A deed or survey names the drawings it depends on — "Cabinet A, Slide 312", "Volume
        // 1234, Page 56", "Abstract No. 123". Those are the documents a surveyor pulls next.
        // Scanned here, after the reading pass, so it runs on the text just read; attached to the
        // result so the review screen can show what to chase (the fetch of each is a later slice).
        try {
          const supaCite = await getSupabase().catch(() => null);
          if (supaCite) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: textRows } = await (supaCite as any)
              .from('research_documents')
              .select('extracted_text, recording_info, document_label')
              .eq('research_project_id', projectId);
            const rows = (textRows ?? []) as Array<{ extracted_text: string | null; recording_info: string | null; document_label: string | null }>;
            const { citationsFromText, reconcileCitations, describeReconciliation } = await import('./research/drawing-hunt.js');
            // Referenced in the read text; held = the drawings we already filed (by their own
            // recording info / label). What is left is a stated miss (C3).
            const referenced = citationsFromText(...rows.map((r) => r.extracted_text));
            const held = citationsFromText(...rows.map((r) => `${r.recording_info ?? ''} ${r.document_label ?? ''}`));
            const statuses = reconcileCitations(referenced, held);
            tailLog(describeReconciliation(statuses));
            (unifiedResult as unknown as Record<string, unknown>).citedDrawings = statuses;
          }
        } catch (e) {
          console.warn(`[Drawings] ${projectId}: citation scan threw — ${String(e)}`);
        }
      } catch (e) {
        console.warn(`[Reading] ${projectId}: pass threw — ${String(e)}`);
      }

      resetFlushClock(projectId);
      const filing = endFiling(projectId);
      if (filing) {
        // B1. This logged 'info' and `.success()` unconditionally, so `1 could not be written` was
        // reported to the screen as a successful step. A run that captured a document and then lost
        // it has not succeeded at filing, and the one place that knows must be the place that says so.
        const summary = filing.describe();
        if (filing.hasFailures) {
          handshakeLogger.attempt('[Library]', 'warn', 'Duplicate check', summary)
            .warn(summary);
          console.warn(`[Library] ${projectId}: ${filing.describeFailures()}`);
        } else {
          handshakeLogger.attempt('[Library]', 'info', 'Duplicate check', summary)
            .success(0, summary);
        }
      }
      const stopped = activePipelines.get(projectId)?.stopReason;
      void recordRunFinish({
        projectId,
        runId: activePipelines.get(projectId)?.runId ?? null,
        status: 'complete',
        stopReason: stopped?.kind === 'budget' ? 'budget_reached' : 'finished',
        progressPercent: runProgress.get(projectId)?.finish('complete').percent,
        costUsd: finalBudget.spentUsd,
        paidPages: finalBudget.paidPages,
        skippedWork: finalBudget.skipped,
        budgetSummary: windDown,
      });
      clearTimeout(activePipelines.get(projectId)?.watchdog);
      endRun(projectId);

      // P3/A5: auto-run the app's AI data-point analysis after every run (owner's decision
      // 2026-09-04) so the Data Points / Briefing panels populate without pressing Analyze.
      // Fire-and-forget and non-fatal — the research is filed regardless.
      void (async () => {
        try {
          const { triggerAppAnalysis } = await import('./research/trigger-app-analysis.js');
          const r = await triggerAppAnalysis(projectId, { allow: true });
          tailLog(r.statement);
        } catch (e) {
          console.warn(`[Analysis] ${projectId}: auto-run trigger threw — ${String(e)}`);
        }
      })();

      setCompletedResult(projectId, unifiedResult);
      activePipelines.delete(projectId);
      // Clear the running-message cache — the pipeline has finished.
      // For generic pipelines this is already done inside runPipeline(); for
      // county-specific pipelines (Bell etc.) the progress callback calls
      // setRunningMessage on every event but nothing ever clears it.
      clearRunningMessage(projectId);
      // ── Handshake: emit a lifecycle entry so the final poll sees it ────────────────────────
      //
      // D2. This said "Pipeline Complete" and called `.success()` no matter what the run found,
      // which is how the Milam log came to carry `Pipeline FAILED in 261.9s` at 10:53 and
      // `Pipeline Complete` at 15:58 about the same run. This line is about the LIFECYCLE — the
      // pipeline resolved rather than threw — and it was being read as a verdict on the RESULT.
      //
      // It now takes its wording from the same place the pipeline's own line does, so the two
      // cannot disagree, and a run that found nothing is not announced as a success.
      const lifecycleOutcome = unifiedResult.resultType === 'generic-pipeline'
        ? describeRunOutcome(unifiedResult.data.status, {
            documents: unifiedResult.data.documents?.length ?? 0,
            durationMs: unifiedResult.data.duration_ms ?? 0,
          })
        : describeRunOutcome('complete', { documents: 0, durationMs: 0 });

      const lifecycleDetail = unifiedResult.resultType === 'generic-pipeline'
        ? `status=${unifiedResult.data.status} docs=${unifiedResult.data.documents?.length ?? 0}`
        : `status=complete county=${unifiedResult.county}`;

      const lifecycleAttempt = handshakeLogger.attempt(
        '[Pipeline Lifecycle]',
        lifecycleOutcome.isProblem ? 'warn' : 'handshake',
        lifecycleOutcome.label,
        lifecycleDetail,
      );
      if (lifecycleOutcome.isProblem) {
        lifecycleAttempt.warn(`[Worker→Frontend] ${lifecycleOutcome.sentence}`);
      } else {
        lifecycleAttempt.success(0, `[Worker→Frontend] ${lifecycleOutcome.sentence}`);
      }
      console.log(`[Worker] ${projectId} → Frontend: ${lifecycleOutcome.label} handshake emitted`);

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
        // ── BOTH SOURCES, NOT WHICHEVER THIS BRANCH HAPPENS TO HOLD ──────────────────────────
        //
        // This wrote `r.log` alone, and eleven lines above it the FULL live log was captured into
        // an in-memory `completedLogs` map that dies with the process. Measured 2026-09-03: a
        // 163-minute Bell County run that produced 19 documents and spent $29.19 left exactly ONE
        // entry in `research_logs` — the crash line — because `r.log` for a crashed county run is
        // the crash and nothing else. The rich log was collected, held in memory, and never
        // written; the thin one was written.
        //
        // `persistRunLogs` merges every source it is given, de-duplicates, orders by time, and
        // reads what is already stored so a later thin write can never shrink an earlier fuller
        // one — the second call site did the mirror-image of this bug, and the two were racing
        // with no ordering between them.
        //
        // Still non-fatal: a run that did real work must not be reported as failed because its
        // diary could not be filed. But it now says what happened rather than assuming.
        void (async () => {
          const supabase = await getSupabase().catch(() => null);
          const outcome = await persistRunLogs(supabase as never, projectId, [r.log ?? [], capturedLiveLog]);
          if (outcome.saved) {
            console.log(`[Worker] ${projectId}: saved ${outcome.entries} log entries to Supabase`);
          } else {
            console.warn(`[Worker] ${projectId}: could not save run logs (${outcome.error ?? 'unknown'}) — ${outcome.entries} entries were ready`);
          }
        })();
        // ── Persist pipeline documents to research_documents table ────────────
        // Save every document the pipeline found so the Review stage can display
        // them after navigating away or refreshing the page.
        // User-uploaded documents (fromUserUpload=true) already exist in the DB
        // from Stage 1 — skip them to avoid duplicates.
        // ── B2: a SWEEP, not the filing ─────────────────────────────────────
        //
        // This used to be where generic-pipeline documents were written, and it did two harmful
        // things. It waited for the run to end, so nothing was viewable until then — the batching
        // the owner asked us to stop. And it DELETED the project's previous `property_search` rows
        // first, so a re-run destroyed what the last run found, and a run that crashed after the
        // delete left the project with fewer documents than it started with. That is the precise
        // opposite of the supersede-not-delete rule the cross-run library exists to enforce.
        //
        // Documents are now filed by `onDocument` as the pipeline finds them, through the same
        // duplicate check Bell uses. What remains here is a safety net for anything the incremental
        // path could not write — a transient Supabase failure mid-run should not cost the document.
        // Anything already filed this run is skipped, so the net cannot double-write.
        // ── C2b: write the run's reconciliation where every reader already looks ──────────
        //
        // `/tmp/analysis/{id}/reconciled_boundary.json` is read by the boundary viewer, by
        // `GET /research/boundary/:id`, by the master orchestrator, and — as its INPUT — by
        // Phase 8. Only the Testing Lab ever wrote it, so all four read nothing for every real
        // run, and Phase 8 could not run at all. Phase 9 takes its purchase recommendations from
        // Phase 8, which is why no run has ever bought a document.
        //
        // The run was not missing the work — it reconciles at Stage 3.5 and kept the answer in
        // memory. This writes it down.
        try {
          const p7 = buildPhase7Document(
            projectId,
            (r.boundary?.calls ?? []) as never,
            {
              // Closure lives on the VALIDATION result, not the boundary.
              closureError: r.validation?.closureError_ft ?? null,
              // `precisionRatio` is a string — "1:5000" — and the schema wants a number whose
              // units are not stated. Parsing it would be guessing at what the number means, and
              // a wrong closure ratio on a survey is a confident wrong answer with a surveyor's
              // authority behind it. Omitted until something needs it and can say what it is.
              closureRatio: null,
            },
          );
          const wrote = writePhase7Document(ANALYSIS_DIR, p7);
          console.log(
            `[Worker] ${projectId}: reconciled_boundary.json ` +
              (wrote.written ? `written — ${wrote.reason}` : `not written — ${wrote.reason}`),
          );

          // ── C2c: Phase 8 can finally run, and it is free ────────────────────────────────
          //
          // The confidence engine takes the reconciled boundary as its INPUT, which is why it
          // has never run outside the Testing Lab: the file did not exist. It is pure
          // computation — no model calls, measured — so there is nothing to gate and no reason
          // to make an operator ask for it.
          //
          // It writes confidence_report.json beside the reconciled file, which is what the
          // boundary viewer reads for per-call scores and what Phase 9 reads for its purchase
          // recommendations. Both have been reading an absent file.
          if (wrote.written) {
            try {
              const reconciledPath = path.join(ANALYSIS_DIR, projectId, 'reconciled_boundary.json');
              const report = await new ConfidenceScoringEngine().score(projectId, reconciledPath);
              handshakeLogger
                .attempt('[Confidence]', 'info', 'Scored the boundary',
                  `${report.overallConfidence?.score ?? 0} (${report.overallConfidence?.grade ?? '?'})`)
                .success(
                  report.documentPurchaseRecommendations?.length ?? 0,
                  `Confidence ${report.overallConfidence?.score ?? 0} (${report.overallConfidence?.grade ?? '?'}). ` +
                  `${report.documentPurchaseRecommendations?.length ?? 0} document(s) would raise it if bought.`,
                );

              // ── D1: buy the documents the report says are worth buying ──────────────────
              //
              // The last link. Phase 9 has existed, complete, with one caller: the Testing Lab.
              // It needs recommendations, which come from Phase 8, which needed the reconciled
              // boundary, which nothing wrote. Three phases were never "unwired" — they were
              // waiting on a file.
              //
              // Every safeguard this needs was built for it and has never run: `decidePurchase`
              // (which refuses when permission cannot be READ, not just when it is denied), the
              // per-run spend ceiling, the cross-run library that will not buy a page twice, and
              // the skip ledger.
              const recs = report.documentPurchaseRecommendations ?? [];
              if (recs.length > 0) {
                const permission = await resolvePurchasePermission(projectId);
                const countyFIPS = lookupCountyFIPS(county ?? '', state ?? 'TX');

                if (!permission.allowed) {
                  // Recorded, not just logged — the notice on the screen counts these rows, and
                  // for months there were none to count.
                  if (permission.skipStatus) {
                    const skipRec = await recordSkippedPurchases(
                      recs.map((rec: { instrument: string; documentType: string; source: string }) => ({
                        projectId,
                        runId: activePipelines.get(projectId)?.runId ?? null,
                        countyFips: countyFIPS,
                        instrument: rec.instrument,
                        documentType: rec.documentType,
                        platformId: rec.source,
                        pages: 0,
                      })),
                      permission.skipStatus,
                      permission.reason,
                    );
                    if (skipRec.error) {
                      // A run that correctly declined to spend must not fail because it could not
                      // file the note saying so — but the note going missing is why the notice on
                      // screen was empty for months, so it is reported rather than swallowed.
                      console.warn(
                        `[Worker] ${projectId}: Could not record the skipped documents — ${skipRec.error}`,
                      );
                    }
                  }
                  handshakeLogger
                    .attempt('[Purchase]', 'info', 'Nothing purchased', permission.reason)
                    .success(0, describeSkippedPurchase(permission, recs.length));
                } else {
                  // SAID BEFORE IT IS SPENT. A run that announces a purchase after making it has
                  // told the operator nothing they could have acted on.
                  const ceiling = runSettings.maxCostUsd ?? 25;
                  handshakeLogger
                    .attempt('[Purchase]', 'info', 'Buying documents',
                      `${recs.length} recommended, ceiling $${ceiling.toFixed(2)}`)
                    .success(recs.length,
                      `Buying up to ${recs.length} document(s) that would raise this boundary’s ` +
                      `confidence, within the $${ceiling.toFixed(2)} ceiling this run was given.`);

                  const orchestrator = new DocumentPurchaseOrchestrator(projectId);
                  const purchaseResult = await orchestrator.executePurchases(
                    projectId,
                    recs,
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
                      budget: ceiling,
                      autoReanalyze: false,
                    },
                    countyFIPS,
                    county ?? '',
                  );

                  const bought = purchaseResult.purchases.filter((x) => x.status === 'purchased');
                  const spent = purchaseResult.billing?.totalCharged ?? 0;
                  handshakeLogger
                    .attempt('[Purchase]', bought.length > 0 ? 'info' : 'warn', 'Purchase finished',
                      `${bought.length} bought, $${spent.toFixed(2)}`)
                    .success(bought.length,
                      `${bought.length} document(s) purchased for $${spent.toFixed(2)}. ` +
                      `${purchaseResult.purchases.length - bought.length} were not obtained.`);
                }
              }
            } catch (err) {
              // Scoring is an enhancement to a run that has already succeeded.
              console.warn(`[Worker] ${projectId}: confidence scoring failed:`, err);
            }
          }
        } catch (err) {
          // Bookkeeping must not fail a run whose research succeeded.
          console.warn(`[Worker] ${projectId}: could not write the reconciled boundary:`, err);
        }

        const pipelineDocs = r.documents
          .filter((d) => !d.fromUserUpload)
          .filter((d) => !alreadyFiledThisRun(projectId, d));
        if (pipelineDocs.length > 0) {
          console.log(
            `[Worker] ${projectId}: ${pipelineDocs.length} document(s) were not filed during the run — sweeping`,
          );
          getSupabase()
            .then(async (supabase) => {
              if (!supabase) return;
              const now = new Date().toISOString();
              // One row shape, shared with the incremental path in file-generic-document.ts. It was
              // inlined here and nowhere else, which is how a column comes to be added to one
              // writer and not the other.
              const docInserts = pipelineDocs.map((doc) => genericDocumentRow(projectId, doc, now));

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
            })
            // Released only once the sweep has finished with it. `endFiling` runs earlier in this
            // handler, and clearing the filed-set at the same time would leave the sweep unable to
            // tell what had already landed — it writes with a plain insert, so it would have
            // duplicated every document in the run rather than skipping them.
            .finally(() => { endGenericFiling(projectId); });
        } else {
          endGenericFiling(projectId);
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
                // ── THE OUTCOME WAS NEVER WRITTEN DOWN ────────────────────────────────────
                //
                // Everything else about a finished run was persisted here — owner, boundary,
                // documents, the validation report — and the one fact that says whether any of it
                // can be trusted was not. So the review page had nothing to read, and passed the
                // LITERAL string 'success' to its log panel: every project, forever, under a green
                // "Research complete" tick, including the ones that failed.
                //
                // `stopReason` travels with it because "complete" and "stopped at the ceiling you
                // set" are both non-failures that mean different things to a reviewer.
                status: r.status ?? null,
                stopReason: (r as { stopReason?: string | null }).stopReason ?? null,
                failureReason: r.failureReason ?? null,
                ownerName: r.ownerName ?? null,
                propertyId: r.propertyId ?? null,
                geoId: r.geoId ?? null,
                legalDescription: r.legalDescription ?? null,
                acreage: r.acreage ?? null,
                // ── E1: the GIS parcel polygon, so the review page can draw the actual lot ──
                //
                // The run has the county's own parcel outline (rings of [lon, lat]) from Phase 1,
                // uses it to frame the maps and find the adjoiners, and then dropped it here: the
                // persisted result carried the metes-and-bounds `boundary` reconstruction but not
                // the polygon the county draws. The review page had no shape to render. It is a
                // handful of points; no cap needed.
                parcelBoundary: r.parcelBoundary ?? null,
                documentCount: r.documents.length,
                duration_ms: r.duration_ms,
                boundary: r.boundary ? {
                  type: r.boundary.type,
                  callCount: r.boundary.calls.length,
                  // ── C2: the CALLS, not just how many there were ──────────────────────────
                  //
                  // The run computes the boundary calls at Stage 2 and reconciles them at Stage
                  // 3.5, and persisted only the count. The boundary viewer asks the worker for
                  // `/research/reconcile/:projectId`, which reads a Phase-7 file written ONLY by
                  // the Testing Lab — so for every normal run the viewer had nothing to draw and
                  // reported `hasWorkerData: false`, which reads as "the worker is down" rather
                  // than "nobody computed this".
                  //
                  // Capped: a boundary is a few dozen calls, and a runaway extraction must not
                  // push a megabyte of JSON into a metadata column. Truncation is stated rather
                  // than silent, because a boundary missing its last calls does not close, and a
                  // reader would blame the survey.
                  calls: r.boundary.calls.slice(0, 400).map((c) => ({
                    sequence: c.sequence,
                    callId: c.callId ?? null,
                    bearing: c.bearing?.raw ?? null,
                    bearingDegrees: c.bearing?.decimalDegrees ?? null,
                    distance: c.distance?.value ?? null,
                    distanceUnit: c.distance?.unit ?? null,
                    along: c.along ?? null,
                    toPoint: c.toPoint ?? null,
                    confidence: c.confidence,
                  })),
                  callsTruncated: r.boundary.calls.length > 400,
                  referenceCount: r.boundary.references.length,
                  confidence: r.boundary.confidence,
                  lotBlock: r.boundary.lotBlock,
                  area: r.boundary.area,
                  verified: r.boundary.verified ?? false,
                } : null,
                validation: r.validation ?? null,

                // ── C2e: the Stage 5 validation report, which the run paid for and threw away ──
                //
                // `runPropertyValidationPipeline` is an AI pass over everything the run found. It
                // produces the most decision-shaped output a run has: an overall confidence with a
                // rating, the documents worth buying next WITH cost estimates and the confidence
                // boost each would give, a ranked list of adjacent owners to research, per-call
                // evidence strength, and discrepancies with severity.
                //
                // Three lines of it reached the log — the top 3 actions and the top 3 adjacent
                // owners — and nothing was persisted. `grep validationReport index.ts` returned
                // nothing, and the app had never heard of it. So the run bought an analysis on
                // every property and kept a summary sentence.
                //
                // Arrays are capped. A boundary with 200 calls produces 200 per-call confidence
                // entries, and a metadata column is not the place for that — but the caps are
                // STATED, because a truncated list of discrepancies that does not say it was
                // truncated reads as a property with fewer problems than it has.
                validationReport: r.validationReport ? {
                  overallConfidencePct: r.validationReport.overallConfidencePct ?? null,
                  overallRating: r.validationReport.overallRating ?? null,
                  propertyName: r.validationReport.propertyName ?? null,
                  acreage: r.validationReport.acreage ?? null,
                  datum: r.validationReport.datum ?? null,
                  pobDescription: r.validationReport.pobDescription ?? null,
                  recordingReferences: (r.validationReport.recordingReferences ?? []).slice(0, 40),

                  // What to do next, and what it would cost. The single most useful thing here.
                  topActions: (r.validationReport.topActions ?? []).slice(0, 20),
                  topActionsTruncated: (r.validationReport.topActions ?? []).length > 20,

                  // Which neighbour to research first, and why. Computed on every run and, until
                  // now, printed three at a time and discarded.
                  adjacentResearchOrder: (r.validationReport.adjacentResearchOrder ?? []).slice(0, 20),
                  adjacentResearchOrderTruncated: (r.validationReport.adjacentResearchOrder ?? []).length > 20,

                  discrepancies: (r.validationReport.discrepancies ?? []).slice(0, 50),
                  discrepanciesTruncated: (r.validationReport.discrepancies ?? []).length > 50,

                  perCallConfidence: (r.validationReport.perCallConfidence ?? []).slice(0, 200),
                  perCallConfidenceTruncated: (r.validationReport.perCallConfidence ?? []).length > 200,

                  adjacentProperties: (r.validationReport.adjacentProperties ?? []).slice(0, 40),
                  roads: (r.validationReport.roads ?? []).slice(0, 20),
                  easements: (r.validationReport.easements ?? []).slice(0, 40),
                } : null,
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

            // ── THE PROPERTY SUMMARY, ON EVERY RUN ─────────────────────────────────────────
            //
            // Written AFTER the meta above (which the run's own summary, if any, lands in), so a
            // richer run-written summary is kept and only a run that produced none gets one built
            // from the library — every document with text, cited. The owner: "build the analysis
            // and review and summary builder into the platform so that it will always happen on
            // any given run." Never fatal.
            try {
              const summaryKey = process.env.ANTHROPIC_API_KEY ?? '';
              if (summaryKey) {
                const { writeRunSummaryFromLibrary } = await import('./research/reading-pass.js');
                await withRunContext(projectId, () =>
                  writeRunSummaryFromLibrary(supabase as never, projectId, summaryKey,
                    (line) => console.log(`[Summary] ${projectId}: ${line}`)));
              }
            } catch (e) {
              console.warn(`[Summary] ${projectId}: write threw — ${String(e)}`);
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
              // Tell whoever started the run that it finished (W-2). Same supabase client, same
              // fire-and-forget tail; idempotent, so the county-specific path reaching the same end
              // does not double-notify.
              await notifyResearchInitiator(supabase, {
                projectId,
                outcome: r.status === 'partial' ? 'partial' : 'complete',
              });
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

        // Final summary entry.
        //
        // D2. The county path had its own third phrasing of the same idea. Left alone it would have
        // been the one place still able to say "Pipeline Complete" about a run that had errors —
        // and one exception is all it takes for two logs to disagree again. A run that reached the
        // end carrying errors is PARTIAL: a usable answer with something missing, which is a
        // different claim from a clean finish and from a run that found nothing.
        const bellOutcome = describeRunOutcome(errorCount > 0 ? 'partial' : 'complete', {
          documents: deedCount + platCount,
          durationMs: Number(durationSec) * 1000,
        });
        handshakeLogger.attempt('Results', 'info', bellOutcome.label,
          `Confidence: ${r.overallConfidence?.tier ?? 'unknown'} (${r.overallConfidence?.score ?? 0}/100)`)
          .success(0, `${bellOutcome.sentence} ${errorCount} error(s), confidence: ${r.overallConfidence?.tier ?? 'unknown'} (${r.overallConfidence?.score ?? 0}/100)`);

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
        // The mirror image of the site above: that one persisted `r.log` and dropped the live log,
        // this one persists the live log and drops `r.log`. Both fire-and-forget, no ordering
        // between them, so when both ran the last writer won and the answer to "what is in
        // research_logs?" depended on which path a run happened to take. One function, both
        // sources, and a read-before-write so neither can shrink the other.
        void (async () => {
          const supabase = await getSupabase().catch(() => null);
          // Only the live log here — `BellResearchResult` carries no `log` field of its own, which
          // is itself part of the story: the Bell path's entries reach the database ONLY through
          // the live registry, so the other site overwriting that registry's contents with a
          // one-entry `r.log` erased the only copy that existed.
          const outcome = await persistRunLogs(supabase as never, projectId, [capturedLiveLog]);
          if (outcome.saved) {
            console.log(`[Worker] ${projectId}: saved ${outcome.entries} run log entries to Supabase`);
          } else {
            console.warn(`[Worker] ${projectId}: could not save county run logs (${outcome.error ?? 'unknown'}) — ${outcome.entries} entries were ready`);
          }
        })();

        // ── THE RUN IS NOT DONE UNTIL THE DOCUMENTS ARE ────────────────────────
        //
        // This was fire-and-forget: `persistCountyResults(...).catch(...)`, with no await. It is
        // the call that uploads the artifacts, so the run announced itself complete and then went
        // on writing documents for minutes afterwards. The owner watched it happen — "two new
        // documents suddenly showed up" while they were reviewing results — and the Milam log of
        // 2026-09-02 shows the same shape from the other side:
        //
        //     [00:10:53] Pipeline FAILED in 261.9s
        //     [00:11:02] AdaptiveVision: ...          ← five more minutes of work
        //     [00:15:58] [Library]: 0 new document(s) filed
        //
        // "Complete" has to mean the review is ready, or it means nothing an operator can act on.
        //
        // Bounded, because a hung upload must not hold a finished run open forever: past the
        // deadline the run completes anyway and SAYS the persistence was still going, which is a
        // different and much smaller lie than silently finishing early.
        await settlePersistence(
          projectId,
          persistCountyResults(projectId, r),
          handshakeLogger,
        );

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
            // W-2 — notify the initiator. Idempotent with the unified path above.
            await notifyResearchInitiator(supabase, { projectId, outcome: 'complete' });
          })
          .catch((err: unknown) => {
            console.warn(`[Worker] ${projectId}: error setting status=review (county-specific):`, err instanceof Error ? err.message : String(err));
          });
      }
    })
    .catch((err) => {
      // Emit pipeline-failed timeline event
      disableTracing(projectId);
      globalStepGate.disableStepMode(projectId);
      const crashMsg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
      timeline.add('phase-failed', 'Pipeline failed', crashMsg.slice(0, 200));

      const isAborted = err instanceof DOMException && err.name === 'AbortError';
      const isCreditError = err instanceof AnthropicCreditDepletedError || isCreditDepleted();
      // ── WHO STOPPED IT decides everything below ─────────────────────────────────────────────
      //
      // A5a fixed the signal and the router's phase, and this handler — the one that builds the
      // result the status endpoint serves for the next four hours — was not touched. So a budget
      // wind-down on the generic path still logged "CANCELLED by user", emitted a "User requested
      // cancellation" handshake, and cached `status: 'failed', failureReason: 'Pipeline cancelled
      // by user'` — the exact screen the owner disputed. Found by the 2026-09-03 audit (RL-1).
      const stop = activePipelines.get(projectId)?.stopReason;
      const budgetStop = isAborted && stop?.kind === 'budget';
      if (budgetStop) {
        console.log(`[Worker] ${projectId}: pipeline STOPPED at the budget ceiling — ${stop!.message}`);
        handshakeLogger.attempt('[Pipeline Lifecycle]', 'handshake', 'Pipeline Stopped', stop!.message.slice(0, 160))
          .warn(`[Worker→Frontend] Stopped at the ceiling you set: ${stop!.message.slice(0, 120)}`);
      } else if (isAborted) {
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
            // W-2 — the initiator should hear that it stopped, not just find it stalled later.
            await notifyResearchInitiator(supabase, {
              projectId,
              outcome: 'failed',
              detail: 'AI credits were depleted mid-run.',
            });
          })
          .catch(() => { /* best-effort */ });
      } else {
        console.error(`[Worker] ${projectId} CRASH:`, err);
      }
      const errMessage = budgetStop
        ? stop!.message
        : isAborted
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
        // A budget stop is a PARTIAL result, not a failed one: the documents it filed are real and
        // the project moves to review on it, exactly as it does for a run that finished on its own.
        status: budgetStop ? 'partial' : 'failed',
        stopReason: budgetStop ? 'budget_reached' : isAborted ? 'cancelled_by_user' : 'error',
        propertyId: null,
        geoId: null,
        ownerName: null,
        legalDescription: null,
        acreage: null,
        documents: [],
        boundary: null,
        validation: null,
        log: [{
          layer: 'Pipeline',
          source: budgetStop ? 'budget' : isAborted ? 'cancelled' : 'crash',
          method: budgetStop ? 'budget-ceiling' : isAborted ? 'user-cancel' : 'unhandled',
          input: '',
          status: budgetStop ? 'skip' : 'fail',
          duration_ms: 0,
          dataPointsFound: 0,
          error: errMessage,
          timestamp: new Date().toISOString(),
        }],
        // ── ZERO IS NOT WHAT HAPPENED ──────────────────────────────────────────────────────
        //
        // `duration_ms: 0` and `documents: []` were hardcoded on this path, so an aborted run
        // reported "Duration 0.0s" and "Documents: none retrieved" — on the 2026-09-03 run that
        // meant 0.0s for 163 minutes of work, and "none retrieved" printed beside a documents
        // panel reading 19. The run had done real work; the crash object simply never asked.
        //
        // `endFiling` was ALREADY being called on the next line and its return value discarded.
        // It returns the tally that knows how many documents were filed.
        duration_ms: Math.max(0, Date.now() - (Date.parse(activePipelines.get(projectId)?.startedAt ?? '') || Date.now())),
        // `failureReason` exists for genuine errors; filling it on a wind-down is what made the
        // ceiling render as a crash.
        failureReason: budgetStop ? undefined : errMessage,
      };
      const finalTally = endFiling(projectId);
      if (finalTally) {
        // The count the operator can verify against the Documents panel, rather than a zero that
        // contradicts it on the same screen.
        fallback.filedDocumentCount = finalTally.filed + finalTally.merged;
      }
      // An abort caused by the BUDGET is a completion, not a cancellation and not a failure. The
      // run did the work it could afford and stopped at a phase boundary, which is what the ceiling
      // is for. Only the operator's cancel is a cancellation. (`stop`/`budgetStop` are decided
      // at the top of this handler, so the log, the handshake, the cached result and this row
      // all describe the same ending.)
      void recordRunFinish({
        projectId,
        runId: activePipelines.get(projectId)?.runId ?? null,
        status: budgetStop ? 'complete' : isAborted ? 'cancelled' : 'failed',
        stopReason: budgetStop ? 'budget_reached' : isAborted ? 'cancelled_by_user' : 'error',
        progressPercent: runProgress.get(projectId)?.finish(
          budgetStop ? 'complete' : isAborted ? 'cancelled' : 'failed',
        ).percent,
        costUsd: spendForRun(projectId),
        budgetSummary: budgetStop ? stop?.message ?? null : null,
        failureReason: budgetStop ? null : errMessage.slice(0, 500),
      });
      clearTimeout(activePipelines.get(projectId)?.watchdog);
      endRun(projectId);
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

/**
 * The status of a run that is happening right now.
 *
 * Pulled out of the route so the route can consult it FIRST, before any cached result — see the
 * comment at the call site for why that ordering is the whole fix for "it says failed while it is
 * still working".
 *
 * Every payload names its run. A client that knows which run it started can then refuse an answer
 * about a different one, which is the second half of the same fix: a terminal status for run 1 must
 * never be able to stop the poll for run 2.
 */
async function respondWithLivePipeline(projectId: string, res: Response): Promise<void> {
  const pipeline = activePipelines.get(projectId)!;
  const snapshot = runProgress.get(projectId)?.snapshot() ?? null;
  const liveLog = getLiveLogForProject(projectId) ?? [];
  const timelineEntries = getTrackerIfExists(projectId)?.getEntries() ?? [];

  const base = {
    projectId,
    runId: pipeline.runId ?? null,
    runNumber: pipeline.runNumber ?? null,
    startedAt: pipeline.startedAt,
    currentStage: pipeline.currentStage,
    address: pipeline.address,
    county: pipeline.county,
    settings: pipeline.settings ?? {},
    phaseId: snapshot?.phaseId ?? null,
    phaseLabel: snapshot?.phaseLabel ?? null,
    phaseIndex: snapshot?.phaseIndex ?? 0,
    phaseCount: snapshot?.phaseCount ?? 0,
    percent: costProgressPercent(projectId), // cost proximity, not time (owner, 2026-09-04)
    log: liveLog,
    timeline: timelineEntries,
  };

  // ── AN ABORTED RUN IS NOT AUTOMATICALLY A FAILED ONE ────────────────────────────────────────
  //
  // Two things abort a run and they mean opposite things to the operator. Reporting both as
  // `failed` + "Pipeline cancelled by user" told people their research had broken because of
  // something they did, when in fact it had finished early inside the ceiling they set.
  if (pipeline.abortController?.signal.aborted) {
    const stop = pipeline.stopReason;
    const isBudget = stop?.kind === 'budget';
    console.log(
      `[Worker] ${projectId} → Frontend: status poll — aborted (${stop?.kind ?? 'cancelled'})`,
    );
    res.json({
      ...base,
      // A budget wind-down produces a usable result: the run did the work it could afford and
      // stopped at a boundary, which is what the ceiling is for.
      status: isBudget ? 'complete' : 'cancelled',
      stopReason: isBudget ? 'budget_reached' : 'cancelled_by_user',
      message: stop?.message ?? 'The run was cancelled.',
      // `failureReason` stays null for both: neither is a failure. It exists for genuine errors and
      // filling it here is what made a wind-down render as a crash.
      failureReason: null,
      windDownSummary: isBudget ? stop?.message ?? null : null,
    });
    return;
  }

  // Prefer the in-memory message cache (updated synchronously by updateStatus in pipeline.ts) over
  // a Supabase round-trip, so the UI sees live stage updates even when Supabase is slow.
  let message: string | undefined = getRunningMessage(projectId);
  if (!message) {
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

  console.log(
    `[Worker] ${projectId} → Frontend: status poll — run=${pipeline.runNumber ?? '?'} ` +
    `phase="${snapshot?.phaseId ?? 'unknown'}" ${snapshot?.percent ?? 0}% logEntries=${liveLog.length}`,
  );

  res.json({ ...base, status: 'running', stopReason: null, message, failureReason: null });
}

app.get('/research/status/:projectId', requireAuth, async (req: Request, res: Response) => {
  const { projectId } = req.params;

  // ── A LIVE PIPELINE OUTRANKS ANY CACHED RESULT ────────────────────────────────────────────────
  //
  // This block used to come SECOND, after `completedResults`, and that ordering is the mechanism
  // behind the complaint that a re-run "shows that the run failed, but really the AI is still
  // working in the background".
  //
  // On a re-run the previous run's terminal result sits in `completedResults` until
  // `property-lookup` deletes it. Every poll in that window returned it. `ResearchRunPanel` sets its
  // state from whatever arrives and then calls `stopPolling()` on a terminal status — permanently.
  // So by the time the new run registered, nothing was still asking, and the screen kept saying
  // "Research Failed" over a run that went on to retrieve seventeen documents.
  //
  // The ordering is not a heuristic. A pipeline that is running RIGHT NOW cannot be less current
  // than one that finished earlier; there is no case where the cached answer is the better one.
  if (activePipelines.has(projectId)) {
    respondWithLivePipeline(projectId, res);
    return;
  }

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
          documentCount: result.documents.length || result.filedDocumentCount || 0,
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
        // The live branch above already says `budget_reached`; the cached branch said nothing,
        // so the screen changed its story the moment the run left `activePipelines`.
        stopReason: result.stopReason ?? null,
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
    // Say WHY before aborting. The signal carries no reason, and until this line the status
    // endpoint had to guess — so it called every abort a user cancellation, including the ones
    // caused by the budget ceiling. Now only this path is a user cancellation.
    pipeline.stopReason = { kind: 'cancelled', message: 'Cancelled by the operator.' };
    pipeline.abortController.abort(new OperatorAbort('Cancelled by the operator.'));
    console.log(`[Worker] ${projectId}: cancel requested by the operator — stop signal sent`);
    res.json({ message: `Cancel signal sent for project ${projectId}`, status: 'cancelling' });
  } else {
    // Legacy pipeline without AbortController — force-remove from active
    activePipelines.delete(projectId);
    console.log(`[Worker] ${projectId}: cancel requested — no AbortController, force-removed from active`);
    res.json({ message: `Pipeline force-removed for project ${projectId}`, status: 'removed' });
  }
});

// ── POST /research/reset/:projectId ───────────────────────────────────────
//
// Everything this process remembers about a project's previous run, forgotten on purpose.
//
// ── WHY THE APP CANNOT DO THIS ITSELF ─────────────────────────────────────
//
// A re-run's reset lives in the app: it clears analysis rows and flips the project's status. But
// the state that actually breaks the next run is HERE, in this process's memory —
// `completedResults` holding the last run's terminal outcome, `completedLogs` holding its log, the
// live-log registry, the timeline tracker and the progress tracker. The app has no reach into any
// of it, so a re-run inherited the previous run's outcome and the operator was shown "Research
// Failed" over a run that had not started yet.
//
// Idempotent, and deliberately forgiving: resetting a project with nothing to reset is a success,
// because the caller's intent — "make sure nothing stale is left" — is satisfied either way. A 404
// here would make the app's reset fail for the most common case of all, a first run.
app.post('/research/reset/:projectId', requireAuth, async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const cleared: string[] = [];

  const active = activePipelines.get(projectId);
  if (active) {
    if (active.abortController && !active.abortController.signal.aborted) {
      active.stopReason = {
        kind: 'cancelled',
        message: 'Stopped because the operator restarted this project from the beginning.',
      };
      active.abortController.abort(new OperatorAbort('Stopped because the operator restarted this project from the beginning.'));
      cleared.push('aborted the run that was still in flight');
    }
    activePipelines.delete(projectId);
    cleared.push('active pipeline');
  }

  if (completedResults.delete(projectId)) cleared.push('cached result from the previous run');
  completedResultsCachedAt.delete(projectId);
  if (completedLogs.delete(projectId)) cleared.push('cached log from the previous run');
  if (runProgress.delete(projectId)) cleared.push('progress tracker');
  clearRunningMessage(projectId);
  clearLiveLogForProject(projectId);
  clearTracker(projectId);
  cleared.push('live log and timeline');

  // The durable side: any run row still marked `running` is over, whatever it says.
  await closeOpenRuns(
    projectId,
    'cancelled',
    'The operator restarted this project from the beginning.',
  );
  cleared.push('closed any open run record');

  console.log(`[Worker] ${projectId}: reset — ${cleared.join('; ')}`);
  res.json({ projectId, reset: true, cleared });
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

// ── POST /research/step/:projectId ────────────────────────────────────────
// Advance one step in step-through mode. Resolves the currently waiting
// __trace() checkpoint so the pipeline executes the next traced instruction.

app.post('/research/step/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;
  const advanced = globalStepGate.advance(projectId);
  const currentCheckpoint = globalStepGate.getCurrentCheckpoint(projectId);
  if (advanced) {
    res.json({ success: true, message: 'Advanced one step', nextCheckpoint: currentCheckpoint });
  } else {
    res.json({ success: false, message: 'No checkpoint waiting' });
  }
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
      // The county travels with the sync. Identity is county-scoped — the same instrument number
      // exists in many Texas counties — so without it the duplicate check degrades to matching
      // identical files only, and says so in the log rather than pretending to have checked.
      const syncResult = await syncHarvestToSupabase(input.projectId, result, {
        county: input.county ?? '',
        runId: activePipelines.get(input.projectId)?.runId ?? null,
      });
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
    .then(async (report) => {
      activeAdjacentJobs.set(projectId, { status: 'complete', result: report });
      console.log(
        `[Adjacent] ${projectId} complete: ` +
        `${report.crossValidationSummary.successfullyResearched}/` +
        `${report.crossValidationSummary.totalAdjacentProperties} researched, ` +
        `confidence: ${report.crossValidationSummary.overallBoundaryConfidence}%`,
      );

      // Write the neighbour register the app reads (plan R31). Until this, everything the adjacent
      // phase found lived in a /tmp blob that the container wipes — so nobody could list the
      // neighbours, see which had a survey on file, or ask for one to be researched properly.
      //
      // Wrapped: this is bookkeeping on data already gathered, and a failure here must not turn a
      // completed adjacent phase into a failed one.
      try {
        const supabase = await getSupabase();
        if (supabase) {
          const inputs: AdjoinerInput[] = report.adjacentProperties.map((p) => ({
            owner: p.owner,
            identifiedBy: 'deed_call',
            researchStatus: p.researchStatus,
            documents: [
              ...p.documentsFound.deeds.map((d) => ({ type: d.type || 'deed', date: d.date, instrumentNumber: d.instrumentNumber })),
              ...p.documentsFound.plats.map((d) => ({ type: d.type || 'plat', date: d.date, instrumentNumber: d.instrumentNumber })),
            ],
          }));
          const result = await persistAdjoiners(supabase, projectId, inputs);
          console.log(describePersist(result, inputs));
        }
      } catch (e) {
        console.warn(`[Adjoiners] ${projectId}: register not written —`, e);
      }
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

// ── Imagery, CAD GIS and drawings ─────────────────────────────────────────────────────────────
//
// Plan F1–F7, and the answer to "we need to make sure we are collecting and saving screenshots of
// satellite and eagle eye views of properties and their surrounding properties if possible, as
// well as screenshots of the relevant CAD GIS maps that show the land."
//
// Everything this needs already existed and none of it was joined up: `planImagery()` had no
// caller outside its own tests, `frameParcel()` had one (in a Bell analyzer), Bell's capture took
// Google satellite at a FIXED zoom 20, and `BIS_CONFIGS` carried a `gisBaseUrl` for 19 counties
// that was used only to query features and never to photograph the viewer.
//
// This is the caller. It is county-general.
async function captureImageryForRun(
  projectId: string,
  county: string,
  unifiedResult: UnifiedResearchResult,
): Promise<void> {
  // ── THIS IS NOW THE FALLBACK, NOT THE ROUTE ─────────────────────────────────────────────────
  //
  // Captures moved to the identification boundary (plan C3), which is where the owner asked for
  // them: "drawings/plats, then the overhead views, then the rest of the documents". This call
  // stays because a run can reach the end WITHOUT ever having identified a parcel — the 2026-09-03
  // run did exactly that — and in that case the finished result may carry a centroid that Phase 1
  // did not have. Running the plan twice would re-file every screenshot, so it is skipped when the
  // early pass already ran.
  // Not skipped wholesale any more: the early pass cannot take the historical aerial (it needs
  // the controlling deed date, known only after the documents are read), so the tail runs the
  // kinds the early pass did not take, and only those. Re-filing is what the kind filter prevents.
  const supabase = await getSupabase();
  if (!supabase) {
    console.warn(`[Capture] ${projectId}: no Supabase client — captures cannot be stored, so none were taken.`);
    return;
  }

  const input = capturePlanInputFor(projectId, county, unifiedResult);
  const planned = planCaptures(input);
  const already = visualsCaptured.get(projectId) ?? new Set<string>();
  const remaining = planned.captures.filter((c) => !already.has(c.kind));
  const plan = { ...planned, captures: remaining };
  console.log(
    `[Capture] ${projectId}: ${planned.summary}` +
    (already.size > 0
      ? ` — ${planned.captures.length - remaining.length} kind(s) already captured at identification, ${remaining.length} to take now`
      : ''),
  );
  for (const skip of planned.skipped) console.log(`[Capture] ${projectId}: skipped ${skip.kind} — ${skip.reason}`);
  if (plan.captures.length === 0) return;
  await runCapturePlan(projectId, plan);
}

/** Execute a capture plan: screenshot, OCR, store, file. Shared by the early and fallback paths. */
async function runCapturePlan(
  projectId: string,
  plan: ReturnType<typeof planCaptures>,
): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;
  const county = activePipelines.get(projectId)?.county ?? '';
  const capLog = await captureLoggerFor(projectId);
  // Google Maps timed out at 45 s for the subject band AND again for the close band on run 5
  // (2026-09-04) — 90 s of a 15-minute run spent learning the same thing twice. One timeout
  // marks the provider down for the rest of this plan; later bands go straight to the tiles.
  let providerDown = false;
  const report = await runCaptures(plan, {
    // Playwright, through the same browser factory every scraper uses — so a capture inherits the
    // proxy, the user agent and the Browserbase routing rather than opening its own unmanaged page.
    screenshot: async (item) => {
      // ── THE CAD MAP IS DRAWN, NOT PHOTOGRAPHED ─────────────────────────────────────────────
      //
      // The viewer screenshot below was the whole of the "County GIS map" capture: a bare goto,
      // a four-second wait, 1440×900 with the disclaimer modal in it and 6 px labels that every
      // OCR grid option called TOO SMALL (run 4, 2026-09-04, 20 Vision calls for nothing). When
      // the county has a parcel layer, the map is rendered from it and from Esri imagery for the
      // same box, with labels we typed — so the row gets its text without OCR and no popup,
      // captcha or selector can stand in the way. The viewer remains the fallback.
      if (item.kind === 'cad_gis' && item.parcelLayerUrl && item.centre) {
        try {
          const { renderParcelMap } = await import('./research/parcel-map-render.js');
          const map = await renderParcelMap({
            county, parcelId: item.parcelId ?? null, centre: item.centre,
            acreage: item.acreage ?? null, parcelLayerUrl: item.parcelLayerUrl,
          });
          capLog('info',
            `${item.label}: rendered from the parcel layer — ${map.parcelCount} parcel(s), ` +
            `subject ${map.subjectFound ? 'matched' : 'NOT matched'}, ${map.metresPerPixel.toFixed(2)} m/px`,
          );
          return {
            bytes: map.png, width: map.width, height: map.height, text: map.text,
            source: 'esri_world_imagery' as const, sourceUrl: map.sources.parcelQueryUrl || map.sources.basemapUrl, metresPerPixel: map.metresPerPixel,
          };
        } catch (e) {
          capLog('warn', `${item.label}: render from the parcel layer failed (${String(e)}) — falling back to the viewer screenshot.`);
        }
      }
      // ── THE PARCEL LINES ALONE ─────────────────────────────────────────────────────────────
      //
      // The county viewer's imagery-off view, drawn from the layer with each side's length in feet.
      // Owner, 2026-09-04: "at least one where it is just the parcel lines". Never photographed;
      // if it cannot be drawn there is nothing to fall back to, and the outcome says so.
      if (item.kind === 'cad_parcel_lines') {
        if (!item.parcelLayerUrl || !item.centre) return null;
        try {
          const { renderParcelMap } = await import('./research/parcel-map-render.js');
          const map = await renderParcelMap({
            county, parcelId: item.parcelId ?? null, centre: item.centre, acreage: item.acreage ?? null,
            parcelLayerUrl: item.parcelLayerUrl, basemap: 'none', edgeLengths: true, title: item.label,
          });
          capLog('info', `${item.label}: drawn from the parcel layer — ${map.parcelCount} parcel(s), subject ${map.subjectFound ? 'matched' : 'NOT matched'}`);
          return { bytes: map.png, width: map.width, height: map.height, text: map.text, sourceUrl: map.sources.parcelQueryUrl, metresPerPixel: map.metresPerPixel };
        } catch (e) {
          capLog('warn', `${item.label}: could not be drawn (${String(e)})`);
          return null;
        }
      }
      // ── THE AERIALS ARE RENDERED TOO ──────────────────────────────────────────────────────
      //
      // This project holds two captured images after four runs, both the GIS map: not one
      // aerial was ever filed, and no line in the run log said why — the Google Maps screenshot
      // path failed silently. Esri's imagery tiles are the same satellite photography without a
      // consent page, a viewport of chrome or a selector, so the wide, subject and adjoiner bands
      // are rendered from them with the parcel outline drawn on. The close band wants finer
      // pixels than the tile cache serves here (~0.26 m/px), so it still tries Google first and
      // falls back to tiles rather than to nothing.
      const AERIAL = new Set(['aerial_wide', 'aerial_subject', 'aerial_close', 'aerial_neighbours']);
      const renderAerial = async (why: string) => {
        const { renderParcelMap } = await import('./research/parcel-map-render.js');
        const sizePx = 1600;
        const mpp = item.metresPerPixel ?? 0.3;
        const map = await renderParcelMap({
          county, parcelId: item.parcelId ?? null, centre: item.centre!,
          parcelLayerUrl: item.parcelLayerUrl ?? parcelLayerUrlFor(county), halfWidthMetres: (mpp * sizePx) / 2, sizePx,
          title: item.label, labelNeighbours: item.kind !== 'aerial_wide',
        });
        capLog('info', `${item.label}: rendered from imagery tiles (${why}) — ${map.metresPerPixel.toFixed(2)} m/px, ${map.parcelCount} parcel outline(s)`);
        return {
          bytes: map.png, width: map.width, height: map.height, text: map.text,
          // The caption credits who supplied the pixels. Run 5 filed tile renders as "©Google".
          source: 'esri_world_imagery' as const, sourceUrl: map.sources.basemapUrl, metresPerPixel: map.metresPerPixel,
        };
      };
      const tilesAreSharpEnough = (item.metresPerPixel ?? 0) >= 0.2;
      if (AERIAL.has(item.kind) && item.centre && (tilesAreSharpEnough || providerDown)) {
        try { return await renderAerial(providerDown ? 'map provider is down this run' : 'tile cache is at least this sharp'); }
        catch (e) { capLog('warn', `${item.label}: tile render failed (${String(e)}) — trying the map provider.`); }
      }
      if (!item.url) return null;
      const { withBrowser } = await import('./lib/browser-factory.js');
      try {
      return await withBrowser({ adapterId: 'cad' }, async (session) => {
        // `browser`, not `context`: BrowserSession hands back the Playwright Browser and leaves
        // context creation to the caller, so a capture gets its own isolated context rather than
        // inheriting cookies from whatever scraper ran last. deviceScaleFactor 2: the labels on a
        // 1440×900 viewer were 6 px; doubled they are legible.
        const context = await session.browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        try {
          await page.goto(item.url!, { waitUntil: 'networkidle', timeout: 45_000 });
          // Map tiles load after networkidle fires. A fixed settle beats a selector here because
          // the providers differ and a missing selector would silently produce a grey square.
          await page.waitForTimeout(4_000);
          // The disclaimer modal was IN the GIS screenshot before, and Google's consent page is
          // the same failure. Same dismisser the guided flow uses, for every provider.
          const { dismissDialogs } = await import('./counties/bell/scrapers/map-screenshot-capture.js');
          await dismissDialogs(page).catch(() => {});
          await page.waitForTimeout(1_500);
          const bytes = await page.screenshot({ type: 'png' });
          return { bytes: Buffer.from(bytes) };
        } finally {
          await page.close().catch(() => {});
          await context.close().catch(() => {});
        }
      });
      } catch (e) {
        capLog('warn', `${item.label}: the map provider could not be captured (${String(e).split('\n')[0]})`);
        if (/Timeout|net::ERR|ERR_|ECONN|blocked/i.test(String(e))) providerDown = true;
        if (AERIAL.has(item.kind) && item.centre) {
          try { return await renderAerial('provider failed'); }
          catch (e2) { capLog('warn', `${item.label}: tile render failed too (${String(e2)})`); }
        }
        return null;
      }
    },
    // A lot number, a scale bar or a subdivision name inside a map image is TEXT. Left as pixels
    // it is invisible to every search and every later question.
    ocr: async (bytes, item) => {
      // Needs a model key. Without one the image is still captured and filed — losing the
      // picture because the reader is unconfigured would be the worse trade, and a map with no
      // extracted text is still the map.
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return null;
      try {
        const { adaptiveVisionOcr } = await import('./services/adaptive-vision.js');
        const { PipelineLogger: OcrLog } = await import('./lib/logger.js');
        const out = await adaptiveVisionOcr(
          bytes, 'image/png', apiKey, new OcrLog(projectId), item.label,
        );
        return out.mergedText || null;
      } catch {
        return null;
      }
    },
    store: (item, bytes) => storeCaptureImage(supabase as never, projectId, item.key, bytes),
    file: (row) => fileCaptureRow(supabase as never, projectId, row),
    log: capLog,
  }, { projectId, runId: activePipelines.get(projectId)?.runId ?? null, county });

  capLog('info', report.summary);
  for (const o of report.outcomes) {
    capLog(o.status === 'filed' || o.status === 'already-held' ? 'info' : 'warn', `${o.label} — ${o.status}: ${o.detail}`);
  }
}

/** The capture stage's log line goes to the console AND the run's own log. Four runs of captures
 *  left no trace in the run log because these went to the console only, so "no aerial was ever
 *  filed" had to be discovered from the library instead of read from the run. */
async function captureLoggerFor(projectId: string): Promise<(level: 'info' | 'warn', message: string) => void> {
  const { PipelineLogger } = await import('./lib/logger.js');
  const runLog = new PipelineLogger(projectId);
  return (level, message) => {
    const line = `[Capture] ${projectId}: ${message}`;
    if (level === 'warn') console.warn(line); else console.log(line);
    try {
      if (level === 'warn') runLog.warn('Capture', message); else runLog.info('Capture', message);
    } catch { /* the run log is a courtesy; the capture is the work */ }
  };
}

/** Every document a run retrieved, in the one shape the drawing hunt needs.
 *
 *  Reads both result shapes. A county result keeps its documents in typed sections; a generic
 *  pipeline result keeps them in one array. Missing either would silently halve the hunt. */
function documentsForDrawingHunt(
  unifiedResult: UnifiedResearchResult,
): Array<{ label?: string | null; documentType?: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (unifiedResult as any)?.data ?? {};
  const out: Array<{ label?: string | null; documentType?: string | null }> = [];

  // Generic pipeline: one flat array of documents, each with a ref.
  if (Array.isArray(data.documents)) {
    for (const d of data.documents) {
      out.push({
        label: d?.ref?.documentType ?? d?.ref?.description ?? d?.documentLabel ?? null,
        documentType: d?.ref?.documentType ?? d?.extractedData?.type ?? null,
      });
    }
  }

  // County result: deeds and plats live in their own sections.
  for (const rec of (data.deedsAndRecords?.records ?? []) as Array<Record<string, unknown>>) {
    out.push({ label: String(rec.documentType ?? rec.description ?? ''), documentType: String(rec.documentType ?? '') });
  }
  for (const rec of (data.plats?.records ?? []) as Array<Record<string, unknown>>) {
    out.push({ label: String(rec.title ?? rec.description ?? 'PLAT'), documentType: 'plat' });
  }

  return out.filter((d) => (d.label ?? d.documentType ?? '').toString().trim().length > 0);
}

/** Everything the capture plan needs, pulled off whatever shape of result the county produced.
 *
 *  Reads defensively because the two result shapes differ and a missing centroid is a legitimate
 *  state, not an error — `planCaptures` records it as a gap in what the run identified rather than
 *  as a fact about the land. */
/**
 * The same plan input, built from what a run knows at the IDENTIFICATION boundary (plan C3).
 *
 * `capturePlanInputFor` below reads a finished `UnifiedResearchResult`, which is why imagery
 * could only ever run after everything else. Every field it actually uses is available the moment
 * the parcel is identified; this is that same set, taken from the earlier moment.
 */
function capturePlanInputFromIdentified(
  projectId: string,
  county: string,
  p: import('./research/run-order.js').IdentifiedProperty,
): CapturePlanInput {
  return {
    projectId,
    county,
    latitude: p.latitude,
    longitude: p.longitude,
    acreage: p.acreage,
    parcelId: p.propertyId,
    gisBaseUrl: gisBaseUrlFor(county),
    parcelLayerUrl: parcelLayerUrlFor(county),
    controllingDeedDate: p.controllingDeedDate,
    neighbours: p.neighbours,
    obliqueProvider: process.env.OBLIQUE_IMAGERY_PROVIDER || null,
    refreshImagery: (activePipelines.get(projectId)?.settings as { refreshImagery?: boolean } | undefined)?.refreshImagery === true,
  };
}

/** Projects whose visual stage already ran at the identification boundary this run. */
/** Which capture KINDS the early pass took, per project. A set of project ids made the tail pass
 *  skip everything, including the one capture the early pass cannot take — the historical aerial,
 *  which needs the controlling deed date known only after the documents are read (second review
 *  pass, MD-6). The tail now runs only the kinds the early pass did not. */
const visualsCaptured = new Map<string, Set<string>>();

/**
 * The owner's requested order, made real: drawings and overhead views BEFORE the documents.
 *
 * Handed to `runCountyResearch` as `onPropertyIdentified` and awaited by both research paths, so
 * it runs between "we know which parcel this is" and "start searching the clerk" — rather than at
 * the very end, where on 2026-09-03 it printed "[1377s] Direct map screenshots skipped" after the
 * run had already spent 163 minutes and every dollar of its ceiling.
 *
 * Never throws. Both call sites also wrap it, deliberately: this is supporting evidence, and a
 * completed run must not be lost to a slow map server.
 */
async function captureVisualsAtIdentification(
  projectId: string,
  county: string,
  p: import('./research/run-order.js').IdentifiedProperty,
): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) {
    console.warn(`[Capture] ${projectId}: no Supabase client — captures cannot be stored, so none were taken.`);
    return;
  }
  const plan = planCaptures(capturePlanInputFromIdentified(projectId, county, p));
  console.log(`[Capture] ${projectId}: (early) ${plan.summary}`);
  for (const skip of plan.skipped) console.log(`[Capture] ${projectId}: skipped ${skip.kind} — ${skip.reason}`);
  if (plan.captures.length === 0) return;
  await runCapturePlan(projectId, plan);
  visualsCaptured.set(projectId, new Set(plan.captures.map((c) => c.kind)));
}

function capturePlanInputFor(
  projectId: string,
  county: string,
  unifiedResult: UnifiedResearchResult,
): CapturePlanInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (unifiedResult as any)?.data ?? {};
  const property = data.property ?? {};
  const adjacent: Array<Record<string, unknown>> = Array.isArray(data.adjacentProperties)
    ? data.adjacentProperties
    : [];

  const neighbours = adjacent
    .map((a) => ({
      label: String(a.ownerName ?? a.situsAddress ?? a.propertyId ?? 'adjoiner'),
      lat: Number(a.lat), lon: Number(a.lon),
    }))
    .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon));

  return {
    projectId,
    county,
    latitude: Number.isFinite(Number(property.lat)) ? Number(property.lat) : null,
    longitude: Number.isFinite(Number(property.lon)) ? Number(property.lon) : null,
    acreage: Number.isFinite(Number(property.acreage)) ? Number(property.acreage) : null,
    parcelId: property.propertyId ? String(property.propertyId) : (data.propertyId ? String(data.propertyId) : null),
    // The 19 counties that carry a GIS viewer. This is the line that generalises CAD GIS capture
    // past Bell — the data was already there, addressed by county key.
    gisBaseUrl: gisBaseUrlFor(county),
    parcelLayerUrl: parcelLayerUrlFor(county),
    controllingDeedDate: data.deedsAndRecords?.records?.[0]?.recordingDate ?? null,
    neighbours,
    // Bird's-eye is licensed, not free. Absent env, the plan records a configuration gap in those
    // words rather than implying the county has no oblique coverage.
    obliqueProvider: process.env.OBLIQUE_IMAGERY_PROVIDER || null,
    refreshImagery: (activePipelines.get(projectId)?.settings as { refreshImagery?: boolean } | undefined)?.refreshImagery === true,
  };
}

/**
 * Read every document this project has on file that we have not already read.
 *
 * The selection and the write-back live in `research/reanalyze-documents.ts` and are tested there
 * without a network. This supplies the two things that need one: the rows, and a reader.
 *
 * The reader is `adaptiveVisionOcr` — the same six-phase quadrant pass the run itself uses, so a
 * document re-read here is read exactly as well as one read the first time. Pages are fetched from
 * the storage URLs already on the row; they are bought and stored, so this costs model time only.
 */
async function reanalyseProjectDocuments(
  projectId: string,
  log: (line: string) => void,
  /** The run's budget, asked between documents and between pages. See the tail in property-lookup. */
  mayContinue: () => boolean = () => true,
): Promise<import('./research/reanalyze-documents.js').ReanalysisReport | null> {
  const supabase = await getSupabase();
  if (!supabase) {
    log('No Supabase client — nothing could be read back.');
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('research_documents')
    .select('id, document_type, document_label, extracted_text, extracted_text_method, page_count, processing_status, ocr_regions')
    .eq('research_project_id', projectId);

  if (error) {
    // A failed read is not "nothing to do". Said out loud rather than reported as a clean pass.
    log(`Could not list this project's documents, so none were re-read: ${error.message}`);
    return null;
  }

  // Read in a surveyor's order — the subject's deeds, then plats, then easements/restrictions,
  // then the rest — so a run that runs out of allowance has read what matters most, not whatever
  // the database returned first.
  const { orderForReading } = await import('./research/reading-pass.js');
  const docs = orderForReading((data ?? []) as FiledDocument[]);
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const { PipelineLogger } = await import('./lib/logger.js');
  const logger = new PipelineLogger(projectId);

  const report = await reanalyseFiledDocuments(
    supabase as never,
    docs,
    async (doc, pageUrls) => {
      if (!apiKey) return null;
      const { adaptiveVisionOcr } = await import('./services/adaptive-vision.js');
      const texts: string[] = [];
      let confidenceTotal = 0;
      let confidenceCount = 0;
      const segments: unknown[] = [];

      // Every page. The owner asked that the tiled reader see each page of each document; the
      // cost budget (asked between pages) is what bounds a forty-page instrument, not a fixed cap.
      for (const url of pageUrls) {
        // Between pages too: one deed page is four-plus Vision calls, and a ceiling reached on
        // page two must not buy pages three, four and five.
        if (!mayContinue()) break;
        const resp = await fetch(url).catch(() => null);
        if (!resp?.ok) continue;
        const bytes = Buffer.from(await resp.arrayBuffer());
        const mediaType = url.toLowerCase().endsWith('.jpg') || url.toLowerCase().endsWith('.jpeg')
          ? 'image/jpeg' as const
          : 'image/png' as const;
        const out = await adaptiveVisionOcr(bytes, mediaType, apiKey, logger, doc.document_label ?? doc.id);
        if (out.mergedText.trim()) texts.push(out.mergedText);
        confidenceTotal += out.overallConfidence;
        confidenceCount++;
        segments.push({ gridUsed: out.gridUsed, totalSegments: out.totalSegments, escalated: out.escalatedSegments });
      }

      if (texts.length === 0) return null;
      return {
        text: texts.join('\n\n'),
        method: 'adaptive-vision-reread',
        // adaptiveVisionOcr scores 0–100; `normaliseConfidence` in the caller brings it to 0–1.
        confidence: confidenceCount > 0 ? confidenceTotal / confidenceCount : null,
        segments,
      };
    },
    log,
    mayContinue,
    // Summarise each document from the text just read — the summary and the read are one pass.
    async (doc, result) => {
      if (!apiKey) return;
      const { summariseDocumentText } = await import('./research/reading-pass.js');
      const summary = await summariseDocumentText(doc, result.text, apiKey).catch(() => null);
      if (!summary) return;
      const { error: upErr } = await (supabase as any).from('research_documents')
        .update({ analysis_metadata: { aiSummary: summary, summarisedAt: new Date().toISOString() }, processing_status: 'analyzed', updated_at: new Date().toISOString() })
        .eq('id', doc.id);
      if (upErr) log(`  summary for ${doc.document_label ?? doc.id} not saved: ${upErr.message}`);
    },
  );

  log(describeReanalysis(report));
  // Mark whatever the allowance did not reach as queued, so the next run reads it first.
  for (const id of report.leftUnreadIds) {
    await (supabase as any).from('research_documents').update({ processing_status: 'queued', updated_at: new Date().toISOString() }).eq('id', id).then(() => {}, () => {});
  }
  return report;
}

/** The county's GIS viewer URL, from the registry that already knows it.
 *
 *  ── THE NINTH SITE OF THE SAME DEFECT ─────────────────────────────────────────────────────────
 *
 *  This normalised by hand: lowercase, strip a trailing " County", index. It handled the word and
 *  not the space, so `"Fort Bend"` became `"fort bend"` while the key is `fort_bend` — and this is
 *  the function that generalises imagery capture past Bell to the nineteen counties carrying a GIS
 *  viewer. Six of them could never be reached, and the capture planner recorded it as the county
 *  having no viewer: a fact about our table, reported as a fact about the county, for the third
 *  time in one plan.
 *
 *  Missed by the sweep that fixed the other eight sites because it does not spell `.toLowerCase()`
 *  AT the index — it wrote its own normaliser two lines earlier. Copying a rule is how a rule
 *  drifts, so the guard now scans for the SHAPE rather than listing the known lines.
 */
function gisBaseUrlFor(county: string): string | null {
  const cfg = lookupByCounty(BIS_CONFIGS, county) as { gisBaseUrl?: string } | undefined;
  return cfg?.gisBaseUrl ?? null;
}

/** The county's parcel FeatureServer layer, when the registry knows one. Bell's is the layer the
 *  run already uses to find the parcel; the CAD map is rendered from it. */
function parcelLayerUrlFor(county: string): string | null {
  const cfg = lookupByCounty(BIS_CONFIGS, county) as { gisParcelLayerUrls?: string[] } | undefined;
  return cfg?.gisParcelLayerUrls?.[0] ?? null;
}

/** How long a finished run will wait for its own documents to finish uploading. */
const PERSIST_SETTLE_MS = 120_000;

/**
 * Wait for a run's documents to be written before calling the run complete.
 *
 * Bounded and non-throwing. The three ways this ends are all reported rather than swallowed:
 * finished, timed out, or failed — and in the last two the run still completes, because a run
 * whose research succeeded is not a failed run just because its bookkeeping was slow. What it must
 * never do is claim the review is ready when it is not.
 */
async function settlePersistence(
  projectId: string,
  work: Promise<unknown>,
  logger: import('./lib/logger.js').PipelineLogger,
): Promise<void> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), PERSIST_SETTLE_MS);
  });

  try {
    const outcome = await Promise.race([work.then(() => 'done' as const), timeout]);
    const secs = Math.round((Date.now() - started) / 1000);
    if (outcome === 'timeout') {
      console.warn(`[Worker] ${projectId}: documents still uploading after ${secs}s — completing anyway`);
      logger.attempt('[Save Check]', 'warn', 'Documents still uploading',
        `Still writing after ${secs}s`)
        .warn(`Some documents were still uploading when this run finished. They will appear shortly; ` +
              `nothing was lost, but the review may be incomplete for a moment.`);
      return;
    }
    console.log(`[Worker] ${projectId}: documents persisted in ${secs}s — run is genuinely complete`);
    logger.attempt('[Save Check]', 'info', 'Documents persisted', `${secs}s`)
      .success(0, `All documents were written before this run reported complete.`);
  } catch (err) {
    // A persistence failure is worth stating loudly, and is still not a research failure.
    console.warn(`[Worker] ${projectId}: persistence failed —`, err instanceof Error ? err.message : String(err));
    logger.attempt('[Save Check]', 'warn', 'Persistence failed', String(err))
      .warn(`The research finished but some documents could not be written. The run is complete; ` +
            `the review may be missing files.`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── May this run spend money? ─────────────────────────────────────────────────────────────────
//
// Plan C3. `mayRunBuyDocuments` existed, was careful, and was called by nothing — so the owner's
// "whether or not it uses texasfile" switch changed a value in Postgres and changed nothing about
// what a run bought. This is the reader the three spend sites consult.
//
// Three sources, most specific first, because the whole point of a per-run override is that a
// re-run can turn paid documents off for one attempt without changing the project.
//
// A read that FAILS returns `unreadable`, and `decidePurchase` refuses on it. That is the money
// direction of the same asymmetry `document-identity.ts` applies to identity: uncertainty resolves
// toward the outcome you can undo, and an unspent dollar is recoverable while a spent one is not.
async function resolvePurchasePermission(projectId: string): Promise<PurchaseDecision> {
  const live = activePipelines.get(projectId)?.settings as RunSettings | undefined;

  let runRecordSettings: Record<string, unknown> | null | undefined;
  let projectAllowPaid: boolean | null | undefined;
  try {
    const supabase = await getSupabase();
    if (supabase) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [runRes, projRes] = await Promise.all([
        sb.from('research_runs')
          .select('settings')
          .eq('research_project_id', projectId)
          .order('started_at', { ascending: false })
          .limit(1),
        sb.from('research_projects')
          .select('allow_paid_documents')
          .eq('id', projectId)
          .single(),
      ]);
      if (!runRes.error) runRecordSettings = runRes.data?.[0]?.settings ?? null;
      if (!projRes.error && projRes.data) {
        // `!== false` and not truthiness: the column defaults to true and NULL must not read as
        // "off". Only an explicit false is an instruction not to spend.
        projectAllowPaid = projRes.data.allow_paid_documents !== false;
      }
    }
  } catch {
    // Leave both undefined. `resolveEffectiveSettings` reports `unreadable`, which is a decision
    // the caller can log and act on — not an exception that would abort a run mid-phase.
  }

  return decidePurchase(resolveEffectiveSettings(live, runRecordSettings, projectAllowPaid));
}

// ── POST /research/purchase ────────────────────────────────────────────────
// Phase 9: Document Purchase & Automated Re-Analysis.
// Takes Phase 8's purchase recommendations, automatically purchases official
// unwatermarked documents, re-extracts data from clean images, and produces
// an updated reconciled model with improved confidence.
//
// Long-running (up to ~5 minutes). Returns HTTP 202 immediately.
// Results are persisted to /tmp/analysis/{projectId}/purchase_report.json.

app.post('/research/purchase', requireAuth, rateLimit(5, 60_000), async (req: Request, res: Response) => {
  const { projectId, confidenceReportPath, budget, autoReanalyze, paymentMethod, mode } = req.body as {
    projectId?: string;
    confidenceReportPath?: string;
    budget?: number;
    autoReanalyze?: boolean;
    paymentMethod?: string;
    /** The run's research mode (plan S-11). 'free' means no paid source is touched at all.
     *
     *  Defaults to 'paid' so existing callers keep their behaviour — this endpoint IS the paid
     *  phase, and silently turning it into a no-op for everyone who has not been updated would look
     *  exactly like a run that found nothing to buy. */
    mode?: ResearchMode;
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

    // ── C3: THE PAID-DOCUMENTS SWITCH, HONOURED ────────────────────────────────────────────
    //
    // Checked BEFORE the free/paid mode block below, because it is a harder veto: `mode` picks a
    // source plan, this is a flat refusal to spend that applies whatever the plan says. Keeping
    // them separate is what makes "run the paid plan but buy nothing" expressible, which is what
    // a dry run is.
    //
    // The reason travels into the report. "Paid documents were switched off for this run" and
    // "the county holds no such record" are completely different states of the world, and a
    // report that renders them alike invites a conclusion about the property the run never tested.
    const permission = await resolvePurchasePermission(projectId);
    if (!permission.allowed) {
      purchaseLog.info(
        'Purchase',
        `Paid documents NOT purchased (${permission.source}): ${permission.reason}`,
      );

      // ── B3: the skip is now EVIDENCE, not just a sentence in a log ──────────────────────────
      //
      // The explanation path existed at both ends and nothing joined them in the middle. The app's
      // analyze route counts `research_document_purchases` rows carrying a skip status to size its
      // notice, and `paidDocumentsNotice()` returns null at a count of zero — and nothing in the
      // product had ever written such a row. The table held 0 rows of any kind. So "N documents
      // behind a paywall were not retrieved" was unreachable by construction, and the screen said
      // nothing at all about the most expensive decision a run makes.
      //
      // Written here, at the moment of refusal, because this is the only place that knows both WHICH
      // documents were skipped and WHY. Failure to write is reported and not thrown: a run that
      // correctly declined to spend must not fail because it could not file the note saying so.
      if (permission.skipStatus && recommendations.length > 0) {
        const { recorded, error: skipErr } = await recordSkippedPurchases(
          // Annotated because `confReport` is parsed as `any`; without it the row shape below is
          // unchecked, which is how a column name drifts silently.
          recommendations.map((rec: { instrument: string; documentType: string; source: string }) => ({
            projectId,
            runId: activePipelines.get(projectId)?.runId ?? null,
            countyFips: countyFIPS,
            instrument: rec.instrument,
            documentType: rec.documentType,
            platformId: rec.source,
            pages: 0,
          })),
          permission.skipStatus,
          permission.reason,
        );
        if (skipErr) {
          purchaseLog.warn('Purchase', `Could not record the skipped documents: ${skipErr}`);
        } else {
          purchaseLog.info('Purchase', `Recorded ${recorded} skipped document(s) as ${permission.skipStatus}`);
        }
      }

      const blockedReport: PurchaseReport = {
        status: 'no_purchases_needed',
        projectId,
        purchases: [],
        reanalysis: { status: 'skipped', documentReanalyses: [], discrepanciesResolved: [] },
        updatedReconciliation: null,
        billing: {
          totalDocumentCost: 0, taxOrFees: 0, totalCharged: 0,
          paymentMethod: 'account_balance', remainingBalance: budget || 25.0, invoicePath: '',
        },
        timing: { totalMs: 0, purchaseMs: 0, downloadMs: 0, reanalysisMs: 0 },
        aiCalls: 0,
        // Not an error. Nothing failed — a decision was honoured.
        errors: [],
        mode: 'free',
        modeStatement: describeSkippedPurchase(permission, recommendations.length),
      };
      const blockedPath = `/tmp/analysis/${projectId}/purchase_report.json`;
      fs.mkdirSync(path.dirname(blockedPath), { recursive: true });
      fs.writeFileSync(blockedPath, JSON.stringify(blockedReport, null, 2));
      return;
    }

    // ── The mode the researcher picked, finally governing something (plan S-11) ─────────────
    //
    // `research-modes.ts` was built for the owner's requirement — "a researcher picks a mode when
    // starting a run", FREE or PAID — and had zero callers. No type carried a mode, no endpoint
    // read one, and this endpoint bought documents regardless. The picker governed nothing.
    //
    // FREE is not a filter applied afterwards. Filtering after the fact does not refund anything,
    // so free mode must mean the paid phase does not RUN — and it says what it skipped, because a
    // run that silently bought nothing is indistinguishable from one that found nothing to buy.
    const runMode: ResearchMode = mode === 'free' ? 'free' : 'paid';
    const plan = buildPlan(countyName, runMode);
    purchaseLog.info('Purchase', `Mode: ${plan.statement}`);

    if (runMode === 'free') {
      const skipped = recommendations.length;
      purchaseLog.info(
        'Purchase',
        `FREE mode — the paid phase did not run. ${skipped} document(s) were recommended for ` +
          `purchase and were NOT bought. Re-run in paid mode to reach them.`,
      );
      const freeReport: PurchaseReport = {
        status: 'no_purchases_needed',
        projectId,
        purchases: [],
        reanalysis: { status: 'skipped', documentReanalyses: [], discrepanciesResolved: [] },
        updatedReconciliation: null,
        billing: {
          totalDocumentCost: 0, taxOrFees: 0, totalCharged: 0,
          paymentMethod: 'account_balance', remainingBalance: budget || 25.0, invoicePath: '',
        },
        timing: { totalMs: 0, purchaseMs: 0, downloadMs: 0, reanalysisMs: 0 },
        aiCalls: 0,
        // An error list is the wrong home for this — nothing failed. It is a deliberate choice, and
        // the sentence has to survive into the report a person reads, not only the run log.
        errors: [],
        mode: 'free',
        modeStatement:
          `FREE mode: the paid phase was not run. ${skipped} document(s) the confidence report ` +
          `recommended buying were NOT purchased — this is a spending decision, not a finding that ` +
          `nothing was available. ${plan.statement}`,
      };
      const outputPath = `/tmp/analysis/${projectId}/purchase_report.json`;
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(freeReport, null, 2));
      return;
    }

    // ── What the free pass already brought back (plan S-14) ─────────────────────────────
    //
    // Built BEFORE any paid source is touched. That ordering is the whole mechanism: a document a
    // free source already returned must be in the index before the purchase step can consider
    // paying for it, because filtering after the fact does not refund anything.
    //
    // If the harvest result is missing or unreadable, no index is passed at all. That is on purpose
    // — an EMPTY index would assert "we hold nothing", and the purchase step would buy everything
    // while reporting a confident zero skipped. No index says "not checked", which is true.
    let heldIndex: import('./research/held-documents.js').HeldIndexSummary | null = null;
    try {
      const harvestPath = `/tmp/harvest/${projectId}/harvest_result.json`;
      if (fs.existsSync(harvestPath)) {
        const { buildHeldIndexFromHarvest } = await import('./research/held-documents.js');
        const harvest = JSON.parse(fs.readFileSync(harvestPath, 'utf-8'));
        heldIndex = buildHeldIndexFromHarvest(harvest, countyName, 'free');
        purchaseLog.info('Purchase', `Free pass: ${heldIndex.summary}`);
      } else {
        purchaseLog.warn(
          'Purchase',
          `No harvest result at ${harvestPath} — duplicate checking against the free pass is NOT ` +
            `active for this run, so a document the free pass already returned may be bought again.`,
        );
      }
    } catch (e) {
      // Stated, not swallowed: the run proceeds and may pay for something it already has.
      purchaseLog.warn(
        'Purchase',
        `Could not read the free pass results (${String(e)}) — proceeding without duplicate checking, ` +
          `which risks paying for documents already in hand.`,
      );
    }

    // ── AND EVERYTHING EVERY PREVIOUS RUN ALREADY BOUGHT ────────────────────────────────────────
    //
    // The free-pass index above covers what THIS run found for nothing. It has never covered what an
    // EARLIER run already paid for, because until now no document could say which run produced it.
    //
    // That is a money bug, not a tidiness one. The whole reason a re-run exists is that the first
    // run was cut short — and a run cut short at minute 20 has usually already bought several
    // documents. Re-running it bought them again.
    //
    // The purchase rule itself is unchanged and unchangeable: an UNCERTAIN match still buys, because
    // a false match silently omits a document we do not have. Only exact matches against documents
    // this project demonstrably holds can prevent a purchase.
    try {
      const supabaseForLibrary = await getSupabase();
      if (supabaseForLibrary) {
        const { ProjectLibrary } = await import('./research/project-library.js');
        const library = await ProjectLibrary.load(supabaseForLibrary as never, projectId, countyName);
        if (library.size > 0) {
          const priorIndex = library.toDocumentIndex('paid');
          purchaseLog.info(
            'Purchase',
            `Earlier runs: ${library.describe()} Anything exactly matching one of these will not be ` +
              `bought again.`,
          );
          if (heldIndex) {
            // Fold the library into the free pass's index rather than replacing it — the free pass
            // knows what arrived in the last twenty minutes and the library knows what arrived in
            // the last six weeks, and a purchase decision needs both.
            for (const doc of priorIndex.all()) heldIndex.index.register(doc, doc.cost);
          } else {
            heldIndex = {
              index: priorIndex,
              registered: priorIndex.size,
              watermarkedNotHeld: 0,
              noImagesNotHeld: 0,
              unkeyable: 0,
              summary: library.describe(),
            };
          }
        }
      }
    } catch (e) {
      purchaseLog.warn(
        'Purchase',
        `Could not read what earlier runs already hold (${String(e)}) — a document a previous run ` +
          `bought may be bought again.`,
      );
    }

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
      heldIndex?.index,
    );

    const purchased = result.purchases.filter(p => p.status === 'purchased');
    purchaseLog.info(
      'Purchase',
      `Complete: ${purchased.length}/${result.purchases.length} purchased, $${result.billing.totalCharged.toFixed(2)} spent`,
    );
    if (result.identity) {
      purchaseLog.info('Purchase', `Identity: ${result.identity.summary}`);
    }

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

// ── Starr Field F2: Receipt Extraction ─────────────────────────────────────
//
// Mobile/web call POST /starr-field/receipts/extract to flush the queue
// of pending receipts (extraction_status='queued'). The CLI at
// src/cli/extract-receipts.ts is the cron entry point; this endpoint is
// the on-demand trigger for "user just snapped a receipt and wants AI to
// run RIGHT NOW" or "extraction failed and the user tapped Retry."
//
// Body: { batchSize?: number; receiptId?: string }
//   - batchSize: cap on rows processed in one shot (default 10).
//   - receiptId: when set, marks JUST that row as queued before
//     running the batch — handy for "retry this one" buttons.
app.post(
  '/starr-field/receipts/extract',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        res.status(500).json({ error: 'Supabase not configured' });
        return;
      }
      const body = (req.body ?? {}) as { batchSize?: number; receiptId?: string };

      // Optional re-queue for a specific receipt (Retry button on
      // mobile / web admin). The retry only applies to rows currently
      // 'failed' so we don't trample an in-flight extraction.
      if (body.receiptId) {
        // The supabase client is typed via ReturnType<typeof
        // createClient> without a Database generic, so update()
        // narrows the payload to `never` (see pipeline.ts:247
        // comment). Cast matches the project-wide convention.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: requeueErr } = await (supabase as any)
          .from('receipts')
          .update({
            extraction_status: 'queued',
            extraction_started_at: null,
            extraction_completed_at: null,
            extraction_error: null,
          })
          .eq('id', body.receiptId)
          .eq('extraction_status', 'failed');
        if (requeueErr) {
          // Log the underlying Postgres / PostgREST error so ops can
          // correlate failed retries with worker logs. The 500 body
          // only carries the message; this gives us the full code
          // and stack at the worker side.
          console.error('[starr-field/receipts/extract] requeue failed', {
            receiptId: body.receiptId,
            error: requeueErr.message,
            code: (requeueErr as { code?: string }).code ?? null,
          });
          res.status(500).json({ error: `requeue failed: ${requeueErr.message}` });
          return;
        }
      }

      const { processQueuedReceipts } = await import(
        './services/receipt-extraction.js'
      );
      const results = await processQueuedReceipts(supabase, {
        batchSize: body.batchSize,
      });

      const done = results.filter((r) => r.status === 'done').length;
      const failed = results.filter((r) => r.status === 'failed').length;
      const totalCostCents = results.reduce(
        (sum, r) => sum + (r.costCents ?? 0),
        0
      );
      // Audit trail: every on-demand extraction lands in worker logs
      // alongside the CLI batch lines so ops can see the full timeline
      // of what processed which row at what cost.
      console.log('[starr-field/receipts/extract] processed', {
        processed: results.length,
        done,
        failed,
        totalCostCents,
        receiptId: body.receiptId ?? null,
      });
      res.json({
        processed: results.length,
        done,
        failed,
        totalCostCents,
        results,
      });
    } catch (err) {
      console.error('[starr-field/receipts/extract] failed:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

// ── Starr Field F4: Voice Memo Transcription ──────────────────────────────
//
// Mobile/web call POST /starr-field/voice/transcribe to flush the
// queue of voice memos (field_media.transcription_status='queued').
// The CLI at src/cli/transcribe-voice.ts is the cron entry point;
// this endpoint is the on-demand trigger for "office reviewer wants
// the transcript NOW" or "transcription failed and the admin tapped
// Retry."
//
// Body: { batchSize?: number; mediaId?: string }
//   - batchSize: cap on rows processed in one shot (default 5).
//   - mediaId: when set, marks JUST that row as queued before
//     running the batch — handy for "retry this one" buttons.
app.post(
  '/starr-field/voice/transcribe',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        res.status(500).json({ error: 'Supabase not configured' });
        return;
      }
      const body = (req.body ?? {}) as { batchSize?: number; mediaId?: string };

      // Optional re-queue for a specific memo (Retry button on
      // mobile / web admin). Only applies to 'failed' rows so we
      // don't trample an in-flight transcription.
      if (body.mediaId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: requeueErr } = await (supabase as any)
          .from('field_media')
          .update({
            transcription_status: 'queued',
            transcription_started_at: null,
            transcription_completed_at: null,
            transcription_error: null,
          })
          .eq('id', body.mediaId)
          .eq('transcription_status', 'failed');
        if (requeueErr) {
          console.error('[starr-field/voice/transcribe] requeue failed', {
            mediaId: body.mediaId,
            error: requeueErr.message,
            code: (requeueErr as { code?: string }).code ?? null,
          });
          res
            .status(500)
            .json({ error: `requeue failed: ${requeueErr.message}` });
          return;
        }
      }

      const { processVoiceTranscriptionBatch } = await import(
        './services/voice-transcription.js'
      );
      const summary = await processVoiceTranscriptionBatch(supabase, {
        batchSize: body.batchSize,
      });

      const totalCostCents = summary.results.reduce(
        (sum, r) => sum + (r.costCents ?? 0),
        0
      );
      // Audit trail line — every on-demand transcribe lands in worker
      // logs alongside the CLI batch lines.
      console.log('[starr-field/voice/transcribe] processed', {
        processed: summary.total,
        done: summary.done,
        failed: summary.failed,
        skipped: summary.skipped,
        totalCostCents,
        mediaId: body.mediaId ?? null,
      });
      res.json({
        processed: summary.total,
        done: summary.done,
        failed: summary.failed,
        skipped: summary.skipped,
        totalCostCents,
        results: summary.results,
      });
    } catch (err) {
      console.error('[starr-field/voice/transcribe] failed:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

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
 * Body: { projectId, currentOwner, documents, extractionData, maxDepth?, county?, countyFIPS?,
 *         indexBeginsYear? }
 *
 * `county` (or `countyFIPS`) is what turns this from a walk over already-harvested documents into
 * the backward RE-QUERY R14 specified. Without it the builder had no searches at all — see
 * `chain-of-title/chain-search-deps.ts`. It stays optional so existing callers keep working, and
 * the response says which of the two happened rather than leaving them indistinguishable.
 */
app.post(
  '/research/chain-of-title',
  requireAuth,
  rateLimit(5, 60_000),
  async (req: Request, res: Response) => {
    const logger = new (await import('./lib/logger.js')).PipelineLogger(
      req.body?.projectId || 'unknown',
    );
    const { projectId, currentOwner, documents, extractionData, maxDepth,
            county, countyFIPS, indexBeginsYear } = req.body || {};

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
      // The searches R14 built and nobody supplied.
      //
      // `ChainOfTitleBuilder` takes `searchAsGrantee` / `fetchByVolumePage` / `fetchByInstrument` as
      // OPTIONAL constructor options, and this — its only caller — passed no options object at all.
      // Every module degrades honestly when its dependency is missing, which is exactly why an
      // entirely inert backward re-query never failed a test: the chain walked only the documents
      // already harvested, and said so truthfully, forever.
      let searchDeps: ReturnType<typeof searchDepsFromAdapter> = {};
      let searchedWith: string | null = null;
      if (county || countyFIPS) {
        const entry = county ? getClerkByCountyName(county) : null;
        const fips = countyFIPS || (entry ? `48${entry.fips}` : null);
        const name = county || entry?.county || '';
        if (fips && name) {
          searchDeps = searchDepsFromAdapter(getClerkAdapter(fips, name));
          searchedWith = `${name} (FIPS ${fips})`;
        }
      }

      const builder = new ChainOfTitleBuilder(
        maxDepth || 5,
        ANALYSIS_DIR,
        searchDeps,
      );
      const result = await builder.buildChain(
        projectId,
        currentOwner,
        documents || [],
        extractionData || {},
        indexBeginsYear ? { indexBeginsYear } : {},
      );

      attempt({ status: 'success', dataPointsFound: result.chain.length });
      // Stated rather than implied: a chain built WITHOUT a county was walked over harvested
      // documents only, and a reader cannot tell that from the chain itself. It is the difference
      // between "no earlier deed exists" and "nobody went to look".
      res.json({
        projectId,
        chainOfTitle: result,
        searchedWith,
        note: searchedWith
          ? `Backward re-query ran against ${searchedWith}'s clerk index.`
          : 'No county was supplied, so NO clerk searches were run — this chain walks only the ' +
            'documents already harvested. Pass `county` or `countyFIPS` to re-query the index.',
      });
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

/** Look up the registry row a monitor result belongs to (plan R9).
 *
 *  Returns null for a site the registry does not know about — the monitor probes more than has been
 *  registered, and that gap is reported rather than hidden. */
async function resolveAdapterForSite(result: { siteId: string; vendor: string }) {
  const parsed = parseSiteId(result.siteId, result.vendor);
  if (!parsed) return null;
  // A statewide vendor has no county row to match. It is reported as unmatched, honestly, rather
  // than being resolved to whichever county happens to sort first.
  if (parsed.statewide) return null;
  const supabase = await getSupabase();
  if (!supabase) return null;
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        ilike: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { id: string } | null }> };
        eq: (c: string, v: unknown) => {
          maybeSingle: () => Promise<{ data: { id: string } | null }>;
          eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: { id: string; status: string } | null }> };
        };
      };
    };
  };

  // ── FIPS FIRST, AND IT IS ALWAYS FIPS IN PRACTICE ────────────────────────────────────────────
  //
  // `buildCheckList` emits `cad-<fips>-<vendor>`, so every CAD probe carries a five-digit FIPS —
  // which this used to pass to `.ilike('name', ...)` as though it were a county name. "48027" is
  // not a county name, so the match failed for every probe, every time, and the health table the
  // self-heal pipeline reads stayed empty.
  //
  // `research_counties.fips` is UNIQUE, so this is an exact match rather than a case-insensitive
  // comparison against free text.
  const countyRow = parsed.fips
    ? await db.from('research_counties').select('id').eq('fips', parsed.fips).maybeSingle()
    : parsed.county
      ? await db.from('research_counties').select('id').ilike('name', parsed.county).maybeSingle()
      : { data: null };
  const countyId = countyRow.data?.id;
  if (!countyId) return null;

  const { data: adapter } = await db.from('research_site_adapters')
    .select('id, status').eq('county_id', countyId).eq('site_type', parsed.siteType).maybeSingle();
  return adapter ?? null;
}

/** Persist whatever the monitor last sensed (plan R9).
 *
 *  This is the link that was missing: the monitor has always detected selector drift and always
 *  thrown the answer away into memory and a WebSocket, while the self-heal pipeline read a table
 *  nothing wrote to. */
async function recordSiteHealth(triggeredBy: string): Promise<void> {
  const summary = siteHealthMonitor.getSummary();
  const persisted = await persistHealthResults(summary.sites, resolveAdapterForSite, triggeredBy);
  const bits = [
    `${persisted.written} check(s) recorded`,
    persisted.statusChanges.length > 0 ? `${persisted.statusChanges.length} adapter status change(s)` : null,
    persisted.unmatched.length > 0 ? `${persisted.unmatched.length} probe(s) with no registered adapter` : null,
    persisted.errors.length > 0 ? `errors: ${persisted.errors.join('; ')}` : null,
  ].filter(Boolean).join(' · ');
  console.log(`[SiteHealth] persisted — ${bits}`);
}

/**
 * POST /admin/health/sites/check
 * Run every probe now and RECORD the outcome against the adapter registry, so the self-heal
 * pipeline has something to diagnose (plan R9).
 */
app.post('/admin/health/sites/check', requireAuth, async (_req: Request, res: Response) => {
  try {
    const summary = await siteHealthMonitor.checkAll();
    await recordSiteHealth('manual');
    res.json({ ...summary, recorded: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
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

// ── POST /admin/deploy — Pull a branch and restart the worker ────────────
// Used by the Testing Lab to hot-reload worker code from a feature branch.
// Executes `git fetch && git checkout <branch> && git pull` then restarts
// the worker via PM2 (or process.exit for Docker auto-restart).

import { execSync } from 'child_process';

app.post('/admin/deploy', requireAuth, (req: Request, res: Response) => {
  const { branch } = req.body as { branch?: string };

  if (!branch) {
    res.status(400).json({ error: 'branch is required' });
    return;
  }

  // Sanitize branch name to prevent command injection
  if (!/^[\w.\-/]+$/.test(branch)) {
    res.status(400).json({ error: 'Invalid branch name' });
    return;
  }

  try {
    // Get current branch and commit before switching
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    const currentCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

    console.log(`[Deploy] Switching from ${currentBranch} (${currentCommit}) to ${branch}`);

    // Fetch latest from remote
    execSync('git fetch origin', { encoding: 'utf-8', timeout: 30000 });

    // Checkout the target branch
    execSync(`git checkout ${branch}`, { encoding: 'utf-8', timeout: 10000 });

    // Pull latest changes
    execSync(`git pull origin ${branch}`, { encoding: 'utf-8', timeout: 30000 });

    // Get new commit
    const newCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const newMessage = execSync('git log -1 --pretty=%s', { encoding: 'utf-8' }).trim();

    console.log(`[Deploy] Now on ${branch} (${newCommit}): ${newMessage}`);

    res.json({
      success: true,
      previousBranch: currentBranch,
      previousCommit: currentCommit,
      branch,
      commit: newCommit,
      message: newMessage,
      note: 'Worker will restart automatically. New code takes effect in ~5 seconds.',
    });

    // Schedule a restart after sending the response.
    // PM2 will auto-restart. Docker will auto-restart if restart policy is set.
    // Plain Node.js: process.exit(0) with a process manager will restart.
    setTimeout(() => {
      console.log(`[Deploy] Restarting worker to load ${branch} (${newCommit})...`);
      process.exit(0);
    }, 1000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Deploy] Failed:`, msg);
    res.status(500).json({
      success: false,
      error: `Deploy failed: ${msg.split('\n')[0]}`,
    });
  }
});

// ── GET /admin/deploy/status — Current branch and commit ─────────────────
app.get('/admin/deploy/status', requireAuth, (_req: Request, res: Response) => {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const message = execSync('git log -1 --pretty=%s', { encoding: 'utf-8' }).trim();
    const date = execSync('git log -1 --pretty=%ci', { encoding: 'utf-8' }).trim();
    res.json({ branch, commit, message, date });
  } catch {
    res.json({ branch: 'unknown', commit: 'unknown', message: '', date: '' });
  }
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

  // ── C3: the run's paid-documents switch forces freeOnly ────────────────────────────────────
  //
  // The flag already existed and only the CALLER could set it, so a run configured with paid
  // documents off still reached the paid tier whenever the caller did not think to pass it.
  // The run's own setting is not advice; a request may make a run freer than it was configured
  // to be, never richer.
  const permission = await resolvePurchasePermission(projectId);
  const forcedFreeOnly = (freeOnly ?? false) || !permission.allowed;
  if (!permission.allowed) {
    logger.info('DocAccess', `Paid tier skipped (${permission.source}): ${permission.reason}`);
  }

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
      freeOnly: forcedFreeOnly,
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

  // ── C3: this route has no free tier, so the switch is a flat refusal ───────────────────────
  //
  // Every branch below calls purchaseDocument(). Answered 200 with a reason rather than 4xx: a
  // run that was told not to spend has not hit an error, and returning one would put a red
  // failure on a screen describing a setting working exactly as configured.
  const permission = await resolvePurchasePermission(projectId);
  if (!permission.allowed) {
    res.json({
      status: 'not_purchased',
      projectId,
      instrumentNumber,
      purchased: false,
      reason: permission.reason,
      settingsSource: permission.source,
      // Said explicitly, because the absence of a document must never be read as a fact about
      // the county. It was not looked for at a source that charges.
      note: describeSkippedPurchase(permission, 1),
    });
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
/**
 * GET /research/purchase/readiness/:projectId
 *
 * "Will a paid run work?", answered without spending anything — D3.
 *
 * The route below reports six Phase 15 adapters and NOT TexasFile or Kofile, which are the two the
 * purchase orchestrator actually buys through, and it has no callers. So the one question worth
 * asking before a deliberate paid run had no way to be asked.
 *
 * Nothing here logs in or buys. Credential checks are PRESENCE, and say so: a username being set
 * proves nothing about whether the vendor accepts it or the account is funded.
 */
app.get('/research/purchase/readiness/:projectId', requireAuth, rateLimit(30, 60_000), async (req: Request, res: Response) => {
  const { projectId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }

  const reconPath = path.join(ANALYSIS_DIR, projectId, 'reconciled_boundary.json');
  const confPath = path.join(ANALYSIS_DIR, projectId, 'confidence_report.json');

  let recommendationCount: number | null = null;
  try {
    if (fs.existsSync(confPath)) {
      const report = JSON.parse(fs.readFileSync(confPath, 'utf-8')) as
        { documentPurchaseRecommendations?: unknown[] };
      recommendationCount = report.documentPurchaseRecommendations?.length ?? 0;
    }
  } catch { recommendationCount = null; }

  let permission: { allowed: boolean; reason: string } | null = null;
  try {
    const decision = await resolvePurchasePermission(projectId);
    permission = { allowed: decision.allowed, reason: decision.reason };
  } catch { permission = null; }

  res.json(assessPurchaseReadiness({
    env: process.env,
    permission,
    recommendationCount,
    hasReconciledBoundary: fs.existsSync(reconPath),
  }));
});

/**
 * GET /research/purchase/platforms/status
 *
 * Phase 15 adapters only. For "can this run buy?", use the readiness route above — these six are
 * not the vendors the purchase orchestrator uses.
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

// ── Phase 19: Project Cleanup / Retention Policy ──────────────────────────

/**
 * POST /research/cleanup
 * Run the retention pass (archives expired projects).
 * Body: { projectsBaseDir?: string, dryRun?: boolean, retentionDays?: number }
 */
app.post('/research/cleanup', requireAuth, rateLimit(5, 60_000), async (req: Request, res: Response) => {
  try {
    const { ProjectCleanupService } = await import('./services/project-cleanup-service.js');
    const { projectsBaseDir = '/tmp/analysis', dryRun = false, retentionDays = 90 } = req.body as {
      projectsBaseDir?: string;
      dryRun?: boolean;
      retentionDays?: number;
    };
    const service = new ProjectCleanupService(retentionDays);
    const report = await service.runRetentionPass(projectsBaseDir, { dryRun });
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /research/cleanup/stats
 * Return retention stats for the projects directory.
 * Query: ?projectsBaseDir=/tmp/analysis
 */
app.get('/research/cleanup/stats', requireAuth, rateLimit(30, 60_000), async (req: Request, res: Response) => {
  try {
    const { ProjectCleanupService } = await import('./services/project-cleanup-service.js');
    const projectsBaseDir = (req.query.projectsBaseDir as string | undefined) ?? '/tmp/analysis';
    const service = new ProjectCleanupService();
    const stats = await service.getRetentionStats(projectsBaseDir);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start Server ───────────────────────────────────────────────────────────

validateEnvironment();
validateAdapterFlagOnStartup();

// Install the PipelineLogger-aware captcha sink so every solve attempt
// becomes a LayerAttempt entry on the active project's logger AND keeps
// firing the default console line. Effect: captcha activity now appears
// in the in-app Log Viewer (Research & Analysis → Logs tab) for the
// running project, matching the visibility level of every other
// pipeline subsystem. See worker/src/lib/pipeline-logger-sinks.ts.
setSolveAttemptSink(makePipelineLoggerCaptchaSink());
console.log('[startup] captcha sink → PipelineLogger bridge installed');

// ── Binding the queue to the pipeline (plans R28/R29) ─────────────────────────────────────────
//
// `pollOnce` needs three things from this process: what is running, how many may run, and how to
// run one. The first two come straight from the capacity accounting the HTTP path already uses —
// deliberately the SAME map, so a queued run and a manually-started one compete for the same slots
// rather than each thinking it has the box to itself.

/** What is running right now, in the shape R29's admission check expects. */
function currentRunningRuns(): RunningRun[] {
  return [...activePipelines.values()].map((p) => ({
    requestId: p.projectId,
    county: p.county,
    startedAt: Date.parse(p.startedAt) || Date.now(),
  }));
}

/** Run one claimed request to completion.
 *
 *  Registers in `activePipelines` BEFORE awaiting, because that map is what both the capacity limit
 *  and R29's one-run-per-county rule read. Registering after the run began would let the next tick
 *  see a free slot that is not free and start a second session on the same clerk portal — the
 *  failure that loses access permanently rather than merely degrading.
 *
 *  Rejecting is a failed run, not a crashed poller: `pollOnce` reports the failure and carries on. */
async function runQueuedRequest(req: QueuedRequest): Promise<{ projectId?: string }> {
  const projectId = `REQ-${req.id.slice(0, 8).toUpperCase()}`;
  const abortController = new AbortController();

  activePipelines.set(projectId, {
    projectId,
    address: req.address,
    county: req.county,
    state: 'TX',
    startedAt: new Date().toISOString(),
    currentStage: 'Queued run starting',
    abortController,
  });

  try {
    const result = await runCountyResearch(
      { projectId, county: req.county, state: 'TX', address: req.address || undefined },
      (p) => {
        const active = activePipelines.get(projectId);
        if (active) active.currentStage = p.phase;
      },
      abortController.signal,
    );

    // A pipeline that returns `failed` is a failed REQUEST too. Reporting it as complete would
    // notify the requester that their property was researched when nothing was found — the exact
    // shape R28's notify-either-way rule exists to prevent.
    // `UnifiedResearchResult` is { resultType, county, data } (router.ts) — the status lives on
    // `data`, not on the envelope. This read `result.status`, which is always undefined, so
    // `undefined === 'failed'` was false and a failed run was reported to the requester as a
    // completed one: the exact outcome the sentence above says R28 prevents. Found by the
    // 2026-09-03 platform audit (county-routing C4 / generic-pipeline).
    const status = (result.data as { status?: string } | undefined)?.status;
    if (status === 'failed') {
      throw new Error(`The research pipeline reported failed for ${req.address}, ${req.county} County.`);
    }
    return { projectId };
  } finally {
    activePipelines.delete(projectId);
  }
}

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║       Starr Research Worker v5.1                     ║
║       Port: ${PORT}                                      ║
║       Node: ${process.version}                           ║
║       Env:  ${process.env.NODE_ENV ?? 'development'}                         ║
╚══════════════════════════════════════════════════════╝
`);
  // Warm the browser probe immediately rather than waiting for the first /healthz. A container
  // that cannot launch Chromium should say so within seconds of booting, not after somebody asks.
  void browserHealth.refresh().then((r) => {
    console.log(r.ok
      ? `[startup] browser probe OK (${r.durationMs}ms, backend=${process.env.BROWSER_BACKEND ?? 'local'})`
      : `[startup] browser probe FAILED — ${r.error ?? 'unknown'} (this worker cannot run research)`);
  });

  console.log(`[startup] capacity — ${describeCapacity(CAPACITY)}`);

  // Any run still marked `running` belonged to a process that no longer exists (plan R3). Marked
  // interrupted, NOT failed: the research did not fail, the process holding it stopped — usually a
  // deploy — and somebody scanning failures should not have to work out which were releases.
  void recoverInterruptedRuns().then((recovered) => {
    console.log(`[startup] run recovery — ${describeRecovery(recovered)}`);
  });

  // Publish the compiled county knowledge into research_site_adapters (plan R8). Until this ran,
  // the self-healing subsystem monitored an EMPTY table while the scrapers that actually break were
  // compiled into this service — so "self-healing adapters" was true of nothing. Idempotent and
  // non-destructive: an existing row may carry a repair somebody accepted, and a restart must not
  // undo it.
  void publishCompiledAdapters(clerkEntriesToCompiled(CLERK_REGISTRY)).then((r) => {
    if (r.errors.length > 0) {
      console.warn(`[startup] adapter registry sync: ${r.errors.join('; ')}`);
    } else {
      const skipped = r.skippedNoCounty.length > 0 ? ` (${r.skippedNoCounty.length} county name(s) not in research_counties)` : '';
      console.log(`[startup] adapter registry — published ${r.published} compiled adapter(s)${skipped}`);
    }
  });

  // ── The research queue poller (plans R28/R29) ───────────────────────────────────────────────
  //
  // R28 built the queue and the atomic claim; R29 built `pollOnce` with its admission and
  // per-county limits. Nothing called it, so the unattended path ended at a table nobody read.
  //
  // OFF unless RESEARCH_QUEUE_POLLER=1. This is the only loop here that spends money and touches
  // other people's servers with no human in the loop — each tick can start a 20–30 minute run that
  // logs into a county clerk portal and may buy pages. `pollerEnabled` also refuses when the flag is
  // on but the key or the app URL is missing, because polling every tick into a 401 is worse than
  // not polling: it is noise that hides the misconfiguration causing it.
  void (async () => {
    const gate = pollerEnabled();
    console.log(`[startup] research queue poller — ${gate.reason}`);
    if (!gate.enabled) return;

    const client = makeQueueClient({
      baseUrl: process.env.APP_BASE_URL!,
      workerKey: process.env.WORKER_API_KEY!,
      log: (m) => console.log(m),
    });

    const poller = startPoller({
      tick: () =>
        pollOnce({
          claim: () => client.claim(),
          report: (req, outcome, detail) => client.report(req, outcome, detail),
          run: (req) => runQueuedRequest(req),
          currentRunning: () => currentRunningRuns(),
          maxConcurrent: () => CAPACITY.maxConcurrentPipelines,
          log: (m) => console.log(m),
        }),
      log: (m) => console.log(m),
    });

    // Stop claiming on shutdown, but let in-flight runs finish and report. A run killed mid-flight
    // leaves its request claimed and unreported — indistinguishable from one still working, which is
    // the state R28's notify-either-way rule exists to prevent.
    for (const sig of ['SIGTERM', 'SIGINT'] as const) {
      process.on(sig, () => {
        console.log(`[Queue] ${sig} — no longer claiming; in-flight runs are left to finish.`);
        poller.stop();
      });
    }
  })();

  // ── Receipt extraction, unattended (2026-08-13) ────────────────────────────────────────────────
  //
  // Owner: *"if the browser/app is closed, then it should still run in the background on the server
  // or on our dedicated AI server, the same one we use for research purposes."* This is that.
  //
  // The capture page still fires an extraction per receipt as each upload lands — that is the fast
  // path and it is unchanged. This is the one that does not care whether a browser is open: it
  // drains whatever is queued, including rows the mobile app inserted, which never had a browser to
  // fire from at all.
  //
  // Safe to run beside the Vercel cron. The claim in `receipt-extraction.ts` is a compare-and-set,
  // so two drainers racing produce one winner per row and the loser moves to the next.
  void (async () => {
    const gate = receiptPollerEnabled();
    console.log(`[startup] receipt extraction poller — ${gate.reason}`);
    if (!gate.enabled) return;

    const supabase = await getSupabase();
    if (!supabase) {
      console.log('[startup] receipt extraction poller — Supabase is not configured; not polling.');
      return;
    }

    const receiptPoller = startPoller(
      {
        tick: makeSupabaseReceiptTick(supabase, (m) => console.log(m)),
        log: (m) => console.log(m),
      },
      // Tighter than the research poller's defaults. A receipt is seconds of work, not half an hour,
      // and somebody is usually waiting to see the total appear on the row they just photographed.
      { busyIntervalMs: 1_000, idleIntervalMs: 10_000, maxIdleIntervalMs: 60_000 },
    );

    for (const sig of ['SIGTERM', 'SIGINT'] as const) {
      process.on(sig, () => {
        console.log(`[receipt-poller] ${sig} — no longer claiming receipts.`);
        receiptPoller.stop();
      });
    }
  })();

  console.log('[Server] Endpoints:');
  console.log('  GET    /healthz                         ← liveness (what the container probes)');
  console.log('  GET    /health                          ← deep check (config + reachability)');
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
  console.log('  POST   /research/step/:projectId        ← Advance one step in step-through mode');
  console.log('  POST   /admin/deploy                    ← Pull branch + restart worker');
  console.log('  GET    /admin/deploy/status             ← Current branch + commit');
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

  // Start periodic health checks (every 6 hours — reduced to minimise log noise).
  //
  // Plan R9: the monitor has always detected selector drift and always thrown the answer away.
  // `onCheckComplete` records it against the adapter registry, which is what the app's self-heal
  // pipeline reads — so a county changing its site now reaches the repair queue instead of a log
  // line that scrolls past.
  siteHealthMonitor.startPeriodicChecks(6 * 60 * 60 * 1000, () => {
    void recordSiteHealth('scheduled');
  });
});
