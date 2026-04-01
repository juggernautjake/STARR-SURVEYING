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

// Module → worker endpoint mapping
const MODULE_ENDPOINTS: Record<string, { method: string; path: string }> = {
  // Scrapers
  'cad-scraper':         { method: 'POST', path: '/research/discover' },
  'gis-scraper':         { method: 'POST', path: '/research/discover' },
  'clerk-scraper':       { method: 'POST', path: '/research/harvest' },
  'plat-scraper':        { method: 'POST', path: '/research/harvest' },
  'fema-scraper':        { method: 'POST', path: '/research/flood-zone' },
  'txdot-scraper':       { method: 'POST', path: '/research/row' },
  'tax-scraper':         { method: 'POST', path: '/research/tax' },
  'map-screenshot':      { method: 'POST', path: '/research/harvest' },
  'gis-viewer':          { method: 'POST', path: '/research/harvest' },
  'screenshot-collector': { method: 'POST', path: '/research/harvest' },

  // Analyzers
  'deed-analyzer':       { method: 'POST', path: '/research/analyze' },
  'plat-analyzer':       { method: 'POST', path: '/research/analyze' },
  'lot-correlator':      { method: 'POST', path: '/research/analyze' },
  'discrepancy':         { method: 'POST', path: '/research/analyze' },
  'confidence':          { method: 'POST', path: '/research/confidence' },
  'relevance':           { method: 'POST', path: '/research/analyze' },
  'gis-quality':         { method: 'POST', path: '/research/analyze' },
  'screenshot-classifier': { method: 'POST', path: '/research/analyze' },

  // Pipeline phases
  'phase-1-discover':    { method: 'POST', path: '/research/discover' },
  'phase-2-harvest':     { method: 'POST', path: '/research/harvest' },
  'phase-3-analyze':     { method: 'POST', path: '/research/analyze' },
  'phase-4-subdivision': { method: 'POST', path: '/research/subdivision' },
  'phase-5-adjacent':    { method: 'POST', path: '/research/adjacent' },
  'phase-6-row':         { method: 'POST', path: '/research/row' },
  'phase-7-reconcile':   { method: 'POST', path: '/research/reconcile' },
  'phase-8-confidence':  { method: 'POST', path: '/research/confidence' },
  'phase-9-purchase':    { method: 'POST', path: '/research/purchase' },

  // Full pipeline
  'full-pipeline':       { method: 'POST', path: '/research/run' },

  // Supplementary
  'flood-zone':          { method: 'POST', path: '/research/flood-zone' },
  'chain-of-title':      { method: 'POST', path: '/research/chain-of-title' },
  'topo':                { method: 'POST', path: '/research/topo' },
  'cross-county':        { method: 'POST', path: '/research/cross-county/detect' },
  'validate-address':    { method: 'POST', path: '/research/validate-address' },

  // Health
  'health':              { method: 'GET',  path: '/health' },
  'health-sites':        { method: 'GET',  path: '/admin/health/sites' },
  'health-check-all':    { method: 'POST', path: '/admin/health/check-all' },
};

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Worker not configured' }, { status: 503 });
  }

  const body = await req.json();
  const { module, inputs, projectId } = body as {
    module: string;
    inputs: Record<string, unknown>;
    projectId?: string;
  };

  const endpoint = MODULE_ENDPOINTS[module];
  if (!endpoint) {
    return NextResponse.json({ error: `Unknown module: ${module}` }, { status: 400 });
  }

  const startTime = Date.now();
  // 3 minutes default — some scrapers (GIS Viewer, full pipeline) can run 90s+
  const timeoutMs = 180_000;

  try {
    const url = `${WORKER_URL}${endpoint.path}`;
    const workerBody = {
      ...inputs,
      projectId: projectId || inputs.projectId,
      testMode: true,
      module,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const workerRes = await fetch(url, {
      method: endpoint.method,
      headers: workerHeaders(),
      body: endpoint.method === 'POST' ? JSON.stringify(workerBody) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    const contentType = workerRes.headers.get('content-type') || '';
    let result: unknown;

    if (contentType.includes('application/json')) {
      result = await workerRes.json();
    } else {
      result = await workerRes.text();
    }

    return NextResponse.json({
      success: workerRes.ok,
      duration,
      result,
      status: workerRes.status,
      error: workerRes.ok ? undefined : `Worker returned ${workerRes.status}`,
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json({
      success: false,
      duration,
      result: null,
      error: isTimeout
        ? `Worker request timed out after ${Math.round(timeoutMs / 1000)}s`
        : (err instanceof Error ? err.message : 'Worker request failed'),
    }, { status: isTimeout ? 504 : 502 });
  }
});
