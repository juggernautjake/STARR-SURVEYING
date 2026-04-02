// app/api/admin/research/testing/run/route.ts
// Proxy any scraper/analyzer/phase to the DigitalOcean worker.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

function workerHeaders(method: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${WORKER_API_KEY}`,
  };
  // Only set Content-Type for POST — sending it on a GET with no body
  // is non-standard and some servers reject it.
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

// ── Module → worker endpoint mapping ────────────────────────────────────────
const MODULE_ENDPOINTS: Record<string, { method: string; path: string }> = {
  // Scrapers
  'cad-scraper':           { method: 'POST', path: '/research/discover' },
  'gis-scraper':           { method: 'POST', path: '/research/discover' },
  'clerk-scraper':         { method: 'POST', path: '/research/harvest' },
  'plat-scraper':          { method: 'POST', path: '/research/harvest' },
  'fema-scraper':          { method: 'POST', path: '/research/flood-zone' },
  'txdot-scraper':         { method: 'POST', path: '/research/row' },
  'tax-scraper':           { method: 'POST', path: '/research/tax' },
  'map-screenshot':        { method: 'POST', path: '/research/harvest' },
  'gis-viewer':            { method: 'POST', path: '/research/harvest' },
  'screenshot-collector':  { method: 'POST', path: '/research/harvest' },

  // Analyzers
  'deed-analyzer':         { method: 'POST', path: '/research/analyze' },
  'plat-analyzer':         { method: 'POST', path: '/research/analyze' },
  'lot-correlator':        { method: 'POST', path: '/research/analyze' },
  'discrepancy':           { method: 'POST', path: '/research/analyze' },
  'confidence':            { method: 'POST', path: '/research/confidence' },
  'relevance':             { method: 'POST', path: '/research/analyze' },
  'gis-quality':           { method: 'POST', path: '/research/analyze' },
  'screenshot-classifier': { method: 'POST', path: '/research/analyze' },

  // Pipeline phases
  'phase-1-discover':      { method: 'POST', path: '/research/discover' },
  'phase-2-harvest':       { method: 'POST', path: '/research/harvest' },
  'phase-3-analyze':       { method: 'POST', path: '/research/analyze' },
  'phase-4-subdivision':   { method: 'POST', path: '/research/subdivision' },
  'phase-5-adjacent':      { method: 'POST', path: '/research/adjacent' },
  'phase-6-row':           { method: 'POST', path: '/research/row' },
  'phase-7-reconcile':     { method: 'POST', path: '/research/reconcile' },
  'phase-8-confidence':    { method: 'POST', path: '/research/confidence' },
  'phase-9-purchase':      { method: 'POST', path: '/research/purchase' },

  // Full pipeline
  'full-pipeline':         { method: 'POST', path: '/research/full-pipeline' },

  // Supplementary
  'flood-zone':            { method: 'POST', path: '/research/flood-zone' },
  'chain-of-title':        { method: 'POST', path: '/research/chain-of-title' },
  'topo':                  { method: 'POST', path: '/research/topo' },
  'cross-county':          { method: 'POST', path: '/research/cross-county/detect' },
  'validate-address':      { method: 'POST', path: '/research/validate-address' },

  // Health
  'health':                { method: 'GET',  path: '/health' },
  'health-sites':          { method: 'GET',  path: '/admin/health/sites' },
  'health-check-all':      { method: 'POST', path: '/admin/health/check-all' },

  // Pipeline control (path is a template — /{projectId} appended by transformInputs)
  'cancel':                { method: 'POST', path: '/research/cancel/{projectId}' },
  'pause':                 { method: 'POST', path: '/research/pause/{projectId}' },
  'resume':                { method: 'POST', path: '/research/resume/{projectId}' },

  // Worker deployment
  'deploy':                { method: 'POST', path: '/admin/deploy' },
  'deploy-status':         { method: 'GET',  path: '/admin/deploy/status' },
};

// ── Per-module fetch timeout (ms) ────────────────────────────────────────────
// Browser-based scrapers can take up to 90 seconds; full pipeline up to 5 min.
// For async endpoints (202) the timeout covers only the acceptance handshake.
const MODULE_TIMEOUTS: Record<string, number> = {
  'clerk-scraper':        120_000,
  'plat-scraper':         90_000,
  'map-screenshot':       90_000,
  'gis-viewer':           120_000,
  'screenshot-collector': 90_000,
  'cad-scraper':          60_000,
  'gis-scraper':          30_000,
  'full-pipeline':        300_000,
  'phase-2-harvest':      120_000,
  'phase-3-analyze':      120_000,
  'phase-5-adjacent':     60_000,
};
const DEFAULT_TIMEOUT_MS = 30_000;

// ── Module group constants ────────────────────────────────────────────────────
// These lists drive the input-field transforms in transformInputs().
// Add new modules to the appropriate group when extending the MODULE_ENDPOINTS map.
//
//   HARVEST_MODULES         → sets `owner` (from ownerName) + `propertyId` (from parcelId)
//   ANALYZE_MODULES         → injects `harvestResultPath` (Phase 2 output file)
//   INTELLIGENCE_PATH_MODULES → injects `intelligencePath` (Phase 3 output file)
//   CONFIDENCE_MODULES      → injects `reconciledPath` (Phase 7 output file)
const HARVEST_MODULES = [
  'clerk-scraper', 'plat-scraper', 'map-screenshot', 'gis-viewer',
  'screenshot-collector', 'phase-2-harvest',
] as const;

const ANALYZE_MODULES = [
  'deed-analyzer', 'plat-analyzer', 'lot-correlator', 'relevance',
  'gis-quality', 'screenshot-classifier', 'discrepancy', 'phase-3-analyze',
] as const;

const INTELLIGENCE_PATH_MODULES = [
  'phase-4-subdivision', 'phase-5-adjacent', 'txdot-scraper', 'phase-6-row',
] as const;

const CONFIDENCE_MODULES = ['confidence', 'phase-8-confidence'] as const;

// ── Input field transforms ───────────────────────────────────────────────────
// Some worker endpoints use different field names than the UI context, or
// require filesystem paths that can be derived from projectId.
function transformInputs(
  module: string,
  inputs: Record<string, unknown>,
  resolvedProjectId: string | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...inputs };

  // Harvest endpoints: worker expects `owner`, UI context sends `ownerName`
  if ((HARVEST_MODULES as readonly string[]).includes(module)) {
    if (!out.owner && out.ownerName) {
      out.owner = out.ownerName;
    }
    // propertyId is required by HarvestInput
    if (!out.propertyId) {
      out.propertyId = out.parcelId ?? '';
    }
  }

  const pid = resolvedProjectId;
  if (!pid) return out;

  // Analyze endpoint requires harvestResultPath (Phase 2 output)
  if ((ANALYZE_MODULES as readonly string[]).includes(module)) {
    if (!out.harvestResultPath) {
      out.harvestResultPath = `/tmp/harvest/${pid}/harvest_result.json`;
    }
  }

  // Subdivision / adjacent / ROW endpoints require intelligencePath (Phase 3 output)
  if ((INTELLIGENCE_PATH_MODULES as readonly string[]).includes(module)) {
    if (!out.intelligencePath) {
      out.intelligencePath = `/tmp/analysis/${pid}/property_intelligence.json`;
    }
  }

  // Reconcile requires phasePaths.intelligence (Phase 3 output)
  if (module === 'phase-7-reconcile') {
    if (!out.phasePaths) {
      out.phasePaths = {
        intelligence: `/tmp/analysis/${pid}/property_intelligence.json`,
        subdivision:  `/tmp/analysis/${pid}/subdivision_model.json`,
        crossValidation: `/tmp/analysis/${pid}/cross_validation_report.json`,
        rowReport:    `/tmp/analysis/${pid}/row_report.json`,
      };
    }
  }

  // Confidence endpoint requires reconciledPath (Phase 7 output)
  if ((CONFIDENCE_MODULES as readonly string[]).includes(module)) {
    if (!out.reconciledPath) {
      out.reconciledPath = `/tmp/analysis/${pid}/reconciled_boundary.json`;
    }
  }

  return out;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isDeveloper(session.user.roles)) {
    return NextResponse.json({ error: 'Admin or Developer only' }, { status: 403 });
  }
  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Worker not configured' }, { status: 503 });
  }

  const body = await req.json();
  const { module, inputs, projectId, branch } = body as {
    module: string;
    inputs: Record<string, unknown>;
    projectId?: string;
    branch?: string;
  };

  if (!module) {
    return NextResponse.json({ error: 'module is required' }, { status: 400 });
  }

  const endpoint = MODULE_ENDPOINTS[module];
  if (!endpoint) {
    return NextResponse.json({ error: `Unknown module: ${module}` }, { status: 400 });
  }

  const resolvedProjectId = projectId || (typeof inputs?.projectId === 'string' ? inputs.projectId : undefined);
  const timeoutMs = MODULE_TIMEOUTS[module] ?? DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  // Build the body sent to the worker
  const transformedInputs = transformInputs(module, inputs ?? {}, resolvedProjectId);
  const workerBody = {
    ...transformedInputs,
    projectId: resolvedProjectId,
    testMode: true,
    module,
    ...(branch ? { branch } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Replace {projectId} template in path for control endpoints (cancel/pause/resume)
    let resolvedPath = endpoint.path;
    if (resolvedPath.includes('{projectId}')) {
      if (!resolvedProjectId) {
        clearTimeout(timer);
        return NextResponse.json({ error: 'projectId is required for this operation' }, { status: 400 });
      }
      resolvedPath = resolvedPath.replace('{projectId}', encodeURIComponent(resolvedProjectId));
    }
    const url = `${WORKER_URL}${resolvedPath}`;
    const workerRes = await fetch(url, {
      method: endpoint.method,
      headers: workerHeaders(endpoint.method),
      body: endpoint.method === 'POST' ? JSON.stringify(workerBody) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const duration = Date.now() - startTime;
    const contentType = workerRes.headers.get('content-type') || '';
    let result: unknown;

    if (contentType.includes('application/json')) {
      result = await workerRes.json();
    } else {
      result = await workerRes.text();
    }

    // 202 Accepted = async job started; return async flag + pollUrl
    if (workerRes.status === 202) {
      const asyncResult = result as Record<string, unknown>;
      const rawPollUrl = asyncResult?.pollUrl;
      const pollUrl = typeof rawPollUrl === 'string' && rawPollUrl.length > 0 ? rawPollUrl : undefined;
      return NextResponse.json({
        success: true,
        async: true,
        duration,
        result,
        status: 202,
        pollUrl,
        message: typeof asyncResult?.message === 'string' && asyncResult.message.length > 0
          ? asyncResult.message
          : 'Job accepted and running in the background. Poll the status endpoint for completion.',
      });
    }

    return NextResponse.json({
      success: workerRes.ok,
      async: false,
      duration,
      result,
      status: workerRes.status,
      // Include the worker's own error message when available so TestCard can
      // display it directly without the user having to open the OutputViewer.
      error: workerRes.ok ? undefined : (() => {
        if (result && typeof result === 'object') {
          const r = result as Record<string, unknown>;
          const workerMsg = typeof r.error === 'string' ? r.error
            : typeof r.message === 'string' ? r.message
            : undefined;
          if (workerMsg) return `Worker error: ${workerMsg}`;
        }
        return `Worker returned ${workerRes.status}`;
      })(),
    });
  } catch (err) {
    clearTimeout(timer);
    const duration = Date.now() - startTime;
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json({
      success: false,
      async: false,
      duration,
      result: null,
      error: isTimeout
        ? `Worker timed out after ${timeoutMs / 1000}s — module "${module}" may still be running`
        : err instanceof Error ? err.message : 'Worker request failed',
    }, { status: isTimeout ? 504 : 502 });
  }
});
