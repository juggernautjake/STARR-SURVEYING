// worker/src/index.ts — Express server entry point for the Starr Research Worker
// Runs on DigitalOcean droplet (port 3100), managed by PM2.
// Provides API endpoints for the Vercel frontend to trigger and poll research pipelines.

import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import type { PipelineInput, PipelineResult, ActivePipeline } from './types/index.js';
import { runPipeline } from './services/pipeline.js';

// ── Server Setup ───────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT ?? '3100', 10);

app.use(express.json({ limit: '50mb' }));

// ── Auth Middleware ─────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: () => void): void {
  const apiKey = process.env.WORKER_API_KEY;
  if (!apiKey) {
    console.warn('[Auth] WORKER_API_KEY not set — auth disabled');
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== apiKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
}

// ── In-Memory State ────────────────────────────────────────────────────────

const activePipelines = new Map<string, ActivePipeline>();
const completedResults = new Map<string, PipelineResult>();

// Keep completed results for 1 hour, then clean up
const RESULT_TTL_MS = 60 * 60 * 1000;

function cleanupOldResults(): void {
  const cutoff = Date.now() - RESULT_TTL_MS;
  for (const [key, result] of completedResults.entries()) {
    const completedAt = new Date(result.log[result.log.length - 1]?.timestamp ?? 0).getTime();
    if (completedAt < cutoff) {
      completedResults.delete(key);
    }
  }
}

setInterval(cleanupOldResults, 5 * 60 * 1000);

// ── Health Check ───────────────────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // Check Playwright
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    checks.playwright = { status: 'ok' };
  } catch (err) {
    checks.playwright = { status: 'error', detail: err instanceof Error ? err.message : String(err) };
  }

  // Check Supabase connection
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        signal: AbortSignal.timeout(5_000),
      });
      checks.supabase = { status: response.ok ? 'ok' : 'error', detail: `HTTP ${response.status}` };
    } else {
      checks.supabase = { status: 'unconfigured' };
    }
  } catch (err) {
    checks.supabase = { status: 'error', detail: err instanceof Error ? err.message : String(err) };
  }

  // Check Anthropic
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      // Just check the key format is present — don't make an actual API call on health check
      checks.anthropic = { status: apiKey.startsWith('sk-') ? 'ok' : 'warning', detail: 'Key present' };
    } else {
      checks.anthropic = { status: 'unconfigured' };
    }
  } catch {
    checks.anthropic = { status: 'error' };
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok' || c.status === 'unconfigured');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    version: '5.0.0',
    uptime: process.uptime(),
    activePipelines: activePipelines.size,
    checks,
  });
});

// ── POST /research/property-lookup ─────────────────────────────────────────

app.post('/research/property-lookup', requireAuth, (req: Request, res: Response) => {
  const { projectId, address, county, state } = req.body as Partial<PipelineInput>;

  // Validate input
  if (!projectId || !address || !county) {
    res.status(400).json({
      error: 'Missing required fields: projectId, address, county',
      received: { projectId: !!projectId, address: !!address, county: !!county },
    });
    return;
  }

  // Check for already-running pipeline
  if (activePipelines.has(projectId)) {
    res.status(409).json({
      error: `Pipeline already running for project ${projectId}`,
      startedAt: activePipelines.get(projectId)!.startedAt,
    });
    return;
  }

  const input: PipelineInput = {
    projectId,
    address,
    county,
    state: state ?? 'TX',
  };

  // Register active pipeline
  activePipelines.set(projectId, {
    projectId,
    address,
    county,
    state: input.state,
    startedAt: new Date().toISOString(),
    currentStage: 'Stage0',
  });

  // Return 202 immediately, run pipeline in background
  res.status(202).json({
    message: 'Pipeline started',
    projectId,
    status: 'running',
    pollUrl: `/research/status/${projectId}`,
  });

  // Run pipeline asynchronously
  runPipeline(input)
    .then((result) => {
      completedResults.set(projectId, result);
      activePipelines.delete(projectId);
      console.log(`[Pipeline] ${projectId} completed: ${result.status} in ${(result.duration_ms / 1000).toFixed(1)}s`);
    })
    .catch((err) => {
      console.error(`[Pipeline] ${projectId} crashed:`, err);
      completedResults.set(projectId, {
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
        log: [],
        duration_ms: 0,
      });
      activePipelines.delete(projectId);
    });
});

// ── GET /research/status/:projectId ────────────────────────────────────────

app.get('/research/status/:projectId', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  // Check completed results first
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
        } : null,
        validation: result.validation,
        duration_ms: result.duration_ms,
      },
      // Include full documents data (minus large base64 images to keep payload manageable)
      documents: result.documents.map((d) => ({
        ref: d.ref,
        hasText: !!d.textContent,
        textLength: d.textContent?.length ?? 0,
        hasImage: !!d.imageBase64,
        hasOcr: !!d.ocrText,
        extractedData: d.extractedData ? {
          type: d.extractedData.type,
          callCount: d.extractedData.calls.length,
          confidence: d.extractedData.confidence,
          lotBlock: d.extractedData.lotBlock,
        } : null,
      })),
      log: result.log,
    });
    return;
  }

  // Check active pipelines
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

// ── GET /research/active ───────────────────────────────────────────────────

app.get('/research/active', requireAuth, (_req: Request, res: Response) => {
  const active = Array.from(activePipelines.values());
  res.json({ count: active.length, pipelines: active });
});

// ── GET /research/result/:projectId/full ───────────────────────────────────
// Returns the complete result including full document text/OCR and boundary calls

app.get('/research/result/:projectId/full', requireAuth, (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!completedResults.has(projectId)) {
    res.status(404).json({ error: `No completed result for project ${projectId}` });
    return;
  }

  const result = completedResults.get(projectId)!;

  res.json({
    projectId: result.projectId,
    status: result.status,
    propertyId: result.propertyId,
    geoId: result.geoId,
    ownerName: result.ownerName,
    legalDescription: result.legalDescription,
    acreage: result.acreage,
    boundary: result.boundary,
    validation: result.validation,
    documents: result.documents.map((d) => ({
      ref: d.ref,
      textContent: d.textContent,
      ocrText: d.ocrText,
      // Omit imageBase64 to reduce payload — can be fetched separately if needed
      hasImage: !!d.imageBase64,
      extractedData: d.extractedData,
    })),
    log: result.log,
    duration_ms: result.duration_ms,
  });
});

// ── Start Server ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║         Starr Research Worker v5.0                   ║
║         Port: ${PORT}                                    ║
║         Node: ${process.version}                         ║
║         Env:  ${process.env.NODE_ENV ?? 'development'}                       ║
╚══════════════════════════════════════════════════════╝
  `);
  console.log('[Server] Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /research/property-lookup');
  console.log('  GET  /research/status/:projectId');
  console.log('  GET  /research/result/:projectId/full');
  console.log('  GET  /research/active');
  console.log('');
});
