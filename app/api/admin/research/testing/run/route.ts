// app/api/admin/research/testing/run/route.ts
// Proxy any scraper/analyzer/phase to the DigitalOcean worker.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

function workerHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WORKER_API_KEY}`,
  };
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
  if (
    ['clerk-scraper', 'plat-scraper', 'map-screenshot', 'gis-viewer',
     'screenshot-collector', 'phase-2-harvest'].includes(module)
  ) {
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
  if (
    ['deed-analyzer', 'plat-analyzer', 'lot-correlator', 'relevance',
     'gis-quality', 'screenshot-classifier', 'discrepancy',
     'phase-3-analyze'].includes(module)
  ) {
    if (!out.harvestResultPath) {
      out.harvestResultPath = `/tmp/harvest/${pid}/harvest_result.json`;
    }
  }

  // Subdivision endpoint requires intelligencePath (Phase 3 output)
  if (['phase-4-subdivision'].includes(module)) {
    if (!out.intelligencePath) {
      out.intelligencePath = `/tmp/analysis/${pid}/property_intelligence.json`;
    }
  }

  // Adjacent endpoint uses defaults from intelligencePath (Phase 3 output)
  if (['phase-5-adjacent'].includes(module)) {
    if (!out.intelligencePath) {
      out.intelligencePath = `/tmp/analysis/${pid}/property_intelligence.json`;
    }
  }

  // ROW endpoint uses intelligencePath (Phase 3 output)
  if (['txdot-scraper', 'phase-6-row'].includes(module)) {
    if (!out.intelligencePath) {
      out.intelligencePath = `/tmp/analysis/${pid}/property_intelligence.json`;
    }
  }

  // Reconcile requires phasePaths.intelligence (Phase 3 output)
  if (['phase-7-reconcile'].includes(module)) {
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
  if (['confidence', 'phase-8-confidence'].includes(module)) {
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
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
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

  const resolvedProjectId = (projectId || inputs?.projectId as string | undefined) || undefined;
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
    const url = `${WORKER_URL}${endpoint.path}`;
    const workerRes = await fetch(url, {
      method: endpoint.method,
      headers: workerHeaders(),
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
      error: workerRes.ok ? undefined : `Worker returned ${workerRes.status}`,
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
