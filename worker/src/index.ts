// worker/src/index.ts — Express server entry point for the Starr Research Worker
// Runs on DigitalOcean droplet (port 3100), managed by PM2.
// Provides API endpoints for the Vercel frontend to trigger and poll research pipelines.

import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import type { PipelineInput, PipelineResult, ActivePipeline, UserFile } from './types/index.js';
import { runPipeline } from './services/pipeline.js';

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
  console.log('  POST   /research/property-lookup');
  console.log('  GET    /research/status/:projectId');
  console.log('  GET    /research/result/:projectId/full');
  console.log('  GET    /research/active');
  console.log('  DELETE /research/result/:projectId');
  console.log('');
  console.log('[Server] Supported search modes:');
  console.log('  - By address:     { address, county }');
  console.log('  - By property ID: { propertyId, county }');
  console.log('  - By owner name:  { ownerName, county }');
  console.log('  - With files:     { ..., userFiles: [{ filename, mimeType, data }] }');
  console.log('');
});
