// worker/src/index.ts — Express server entry point for the Starr Research Worker
// Runs on DigitalOcean droplet (port 3100), managed by PM2.
// Provides API endpoints for the Vercel frontend to trigger and poll research pipelines.

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import type { Request, Response } from 'express';
import type { PipelineInput, PipelineResult, ActivePipeline, UserFile } from './types/index.js';
import { runPipeline } from './services/pipeline.js';
import { PropertyDiscoveryEngine } from './services/property-discovery.js';
import { DocumentHarvester, type HarvestInput } from './services/document-harvester.js';
import { SubdivisionIntelligenceEngine } from './services/subdivision-intelligence.js';
import { runAdjacentResearch, type FullCrossValidationReport } from './services/adjacent-research-orchestrator.js';
import { runROWIntegration, type ROWReport } from './services/row-integration-engine.js';
import { GeometricReconciliationEngine } from './services/geometric-reconciliation-engine.js';
import { ConfidenceScoringEngine } from './services/confidence-scoring-engine.js';
import { DocumentPurchaseOrchestrator } from './services/document-purchase-orchestrator.js';
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
const completedResults = new Map<string, PipelineResult>();

// Keep completed results for 4 hours
const RESULT_TTL_MS = 4 * 60 * 60 * 1000;

function cleanupOldResults(): void {
  const cutoff = Date.now() - RESULT_TTL_MS;
  for (const [key, result] of completedResults.entries()) {
    // Use the last log entry timestamp if available, otherwise the duration
    const lastLog = result.log.length > 0 ? result.log[result.log.length - 1] : null;
    const completedAt = lastLog?.timestamp ? new Date(lastLog.timestamp).getTime() : 0;
    if (completedAt > 0 && completedAt < cutoff) {
      completedResults.delete(key);
    }
  }
}

setInterval(cleanupOldResults, 10 * 60 * 1000);

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

// ── POST /research/property-lookup ─────────────────────────────────────────

app.post('/research/property-lookup', requireAuth, (req: Request, res: Response) => {
  const body = req.body as Partial<PipelineInput> & { userFiles?: unknown };

  const { projectId, address, county, state, propertyId, ownerName, userFiles } = body;

  // Validate input: need at least (address + county) or propertyId
  if (!projectId) {
    res.status(400).json({ error: 'Missing required field: projectId' });
    return;
  }

  if (!address && !propertyId && !ownerName) {
    res.status(400).json({
      error: 'Must provide at least one of: address, propertyId, or ownerName',
      hint: 'address + county is the standard search. propertyId skips address lookup. ownerName searches by owner.',
    });
    return;
  }

  if (!county) {
    res.status(400).json({ error: 'Missing required field: county' });
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
        const f = file as Record<string, unknown>;
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

  const input: PipelineInput = {
    projectId,
    address: address ?? '',
    county,
    state: state ?? 'TX',
    propertyId: propertyId ?? undefined,
    ownerName: ownerName ?? undefined,
    userFiles: parsedUserFiles,
  };

  // Register active pipeline
  activePipelines.set(projectId, {
    projectId,
    address: input.address,
    county,
    state: input.state,
    startedAt: new Date().toISOString(),
    currentStage: 'Stage0',
  });

  // Return 202 immediately
  res.status(202).json({
    message: 'Pipeline started',
    projectId,
    status: 'running',
    pollUrl: `/research/status/${projectId}`,
    input: {
      address: input.address || undefined,
      county,
      propertyId: input.propertyId,
      ownerName: input.ownerName,
      userFileCount: parsedUserFiles?.length ?? 0,
    },
  });

  // Run pipeline in background
  runPipeline(input)
    .then((result) => {
      completedResults.set(projectId, result);
      activePipelines.delete(projectId);
      console.log(`[Pipeline] ${projectId}: ${result.status.toUpperCase()} in ${(result.duration_ms / 1000).toFixed(1)}s`);
    })
    .catch((err) => {
      console.error(`[Pipeline] ${projectId} CRASH:`, err);
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
        log: [{ layer: 'Pipeline', source: 'crash', method: 'unhandled', input: '', status: 'fail', duration_ms: 0, dataPointsFound: 0, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }],
        duration_ms: 0,
      };
      completedResults.set(projectId, fallback);
      activePipelines.delete(projectId);
    });
});

// ── GET /research/status/:projectId ────────────────────────────────────────

app.get('/research/status/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (completedResults.has(projectId)) {
    const result = completedResults.get(projectId)!;
    res.json({
      projectId,
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
        hasImage: !!d.imageBase64,
        hasOcr: !!d.ocrText,
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
      log: result.log,
    });
    return;
  }

  if (activePipelines.has(projectId)) {
    const pipeline = activePipelines.get(projectId)!;
    res.json({
      projectId,
      status: 'running',
      startedAt: pipeline.startedAt,
      currentStage: pipeline.currentStage,
      address: pipeline.address,
      county: pipeline.county,
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

  const result = completedResults.get(projectId)!;
  res.json({
    ...result,
    documents: result.documents.map((d) => ({
      ref: d.ref,
      textContent: d.textContent,
      ocrText: d.ocrText,
      hasImage: !!d.imageBase64,
      imageFormat: d.imageFormat,
      fromUserUpload: d.fromUserUpload,
      processingErrors: d.processingErrors,
      extractedData: d.extractedData,
    })),
  });
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
    res.json({ message: `Result for ${projectId} deleted` });
  } else {
    res.status(404).json({ error: `No result found for ${projectId}` });
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

    // TODO: Update Supabase with harvest results for the frontend dashboard
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

  const previous = completedResults.get(projectId)!;
  const { PipelineLogger } = await import('./lib/logger.js');
  const logger = new PipelineLogger(projectId);

  try {
    const result = await runReanalysis(previous, newDocs, anthropicApiKey, logger);

    // Store the updated result in memory
    completedResults.set(projectId, result.updated);

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
      } catch {
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
      } catch {
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
      const result = await client.queryFloodZones({ centroid, polygon });

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

// ── Site Health Monitor ───────────────────────────────────────────────────
// Probes all county CAD portals and clerk systems to detect selector drift.
// Broadcasts alerts when sites change or go down.

const siteHealthMonitor = new SiteHealthMonitor({
  onAlert: (alert) => {
    console.warn(`[SiteHealth ALERT] [${alert.severity}] ${alert.message}`);
    // TODO: integrate with WebSocket broadcast to admin dashboard
    // TODO: integrate with email/Slack notifications
  },
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
  console.log('  POST   /research/full-pipeline');
  console.log('  POST   /research/property-lookup');
  console.log('  GET    /research/status/:projectId');
  console.log('  GET    /research/result/:projectId/full');
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

  // Start periodic health checks (every 30 minutes)
  siteHealthMonitor.startPeriodicChecks(30 * 60 * 1000);
});
