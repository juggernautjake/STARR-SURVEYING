// app/api/admin/research/[projectId]/boundary/route.ts
// Phase 13: Interactive Boundary Viewer data API.
//
// GET — Assembles the boundary viewer payload for a project:
//        1. Fetches reconciled boundary calls from worker /research/reconcile/:projectId
//        2. Fetches confidence scores from worker /research/confidence/:projectId
//        3. Looks up project address/county from Supabase
//        4. Walks the traverse (bearing + distance → Cartesian x/y) so the SVG
//           can render line segments without knowing surveying math
//
// The traverse walk uses local Cartesian coordinates (feet) with origin at the
// first Point of Beginning.  SVG renders northing as -y (SVG y-axis is inverted).
//
// POST — Re-fetches data from the worker (bypasses any stale cache).
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

function workerHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WORKER_API_KEY}`,
  };
}

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

// ── Bearing parser ────────────────────────────────────────────────────────────
// Converts "N 45°30'00\" E" to decimal degrees (north=0, clockwise).

function parseBearingToDecimal(bearing: string | null): number | null {
  if (!bearing) return null;
  const m = bearing.match(
    /^([NS])\s*(\d{1,3})[°\s]+(\d{1,2})[''′]?\s*(\d{0,2})[""″]?\s*([EW])/i,
  );
  if (!m) return null;
  const ns = m[1].toUpperCase();
  const ew = m[5].toUpperCase();
  const deg = parseFloat(m[2]);
  const min = parseFloat(m[3] || '0');
  const sec = parseFloat(m[4] || '0');
  const quad = deg + min / 60 + sec / 3600;
  // Convert quadrant bearing to azimuth (clockwise from North, 0-360°).
  // Quadrant bearings use the form N/S + degrees + E/W, measuring the angle
  // from either North or South toward either East or West.
  // NE quadrant: azimuth = quad
  // SE quadrant: azimuth = 180° - quad (flip about E-W axis)
  // SW quadrant: azimuth = 180° + quad
  // NW quadrant: azimuth = 360° - quad
  if (ns === 'N' && ew === 'E') return quad;
  if (ns === 'S' && ew === 'E') return 180 - quad;
  if (ns === 'S' && ew === 'W') return 180 + quad;
  if (ns === 'N' && ew === 'W') return 360 - quad;
  return null;
}

// ── Traverse walk ─────────────────────────────────────────────────────────────
// Returns SVG-ready line segments (x1,y1 → x2,y2) in local Cartesian feet.
// SVG y-axis is inverted: north = -y.

interface TraverseSeg {
  callIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function walkTraverse(
  calls: Array<{
    callId?: string;
    reconciledBearing?: string | null;
    reconciledDistance?: number | null;
    type?: string;
  }>,
): TraverseSeg[] {
  const segs: TraverseSeg[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const azDeg = parseBearingToDecimal(call.reconciledBearing ?? null);
    const dist = call.reconciledDistance ?? 0;
    if (azDeg === null || dist === 0) {
      segs.push({ callIndex: i, x1: x, y1: y, x2: x, y2: y });
      continue;
    }
    const azRad = (azDeg * Math.PI) / 180;
    const dx = dist * Math.sin(azRad);
    const dy = -dist * Math.cos(azRad); // North = -Y in SVG
    segs.push({ callIndex: i, x1: x, y1: y, x2: x + dx, y2: y + dy });
    x += dx;
    y += dy;
  }
  return segs;
}

// ── Call merge ────────────────────────────────────────────────────────────────
// Merges reconciled calls + confidence scores + discrepancy flags into the
// BoundaryCall shape expected by the InteractiveBoundaryViewer page.

interface ReconCall {
  callId?: string;
  reconciledBearing?: string | null;
  reconciledDistance?: number | null;
  type?: string;
  along?: string;
  finalConfidence?: number;
  reconciliation?: { method?: string; agreement?: string; notes?: string };
  readings?: Array<{ source: string }>;
}

interface ConfidenceCallScore {
  callId?: string;
  score?: number;
  grade?: string;
  riskLevel?: string;
  notes?: string | null;
}

interface DiscrepancyReport {
  severity?: string;
  description?: string;
  affectedCalls?: string[];
}

function mergeBoundaryCalls(
  reconCalls: ReconCall[],
  callScores: ConfidenceCallScore[],
  discrepancies: DiscrepancyReport[],
  traverseSegs: TraverseSeg[],
) {
  const scoreByCallId = new Map<string, ConfidenceCallScore>();
  for (const s of callScores) { if (s.callId) scoreByCallId.set(s.callId, s); }

  const discByCallId = new Map<string, DiscrepancyReport>();
  for (const d of discrepancies) {
    for (const cid of (d.affectedCalls ?? [])) {
      if (!discByCallId.has(cid) || (d.severity === 'critical')) {
        discByCallId.set(cid, d);
      }
    }
  }

  return reconCalls.map((call, i) => {
    const seg = traverseSegs[i];
    const score = call.callId ? scoreByCallId.get(call.callId) : undefined;
    const disc = call.callId ? discByCallId.get(call.callId) : undefined;

    return {
      callIndex: i,
      callId: call.callId ?? `call-${i}`,
      bearing: call.reconciledBearing ?? undefined,
      distance: call.reconciledDistance ?? undefined,
      isCurve: call.type === 'curve',
      along: call.along,
      source: call.readings?.[0]?.source,
      rawText: call.reconciliation?.notes,
      score: score?.score ?? call.finalConfidence,
      grade: score?.grade,
      riskLevel: score?.riskLevel,
      discrepancy: disc
        ? { severity: disc.severity as 'critical' | 'major' | 'minor', description: disc.description ?? '' }
        : null,
      x1: seg?.x1,
      y1: seg?.y1,
      x2: seg?.x2,
      y2: seg?.y2,
    };
  });
}

/* GET — Assemble boundary viewer payload */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // 1. Verify project exists and get metadata
  const { data: project, error: projErr } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, state')
    .eq('id', projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // 2. Fetch reconciled boundary and confidence from worker (or cached file)
  let reconciledBoundary: { calls?: ReconCall[]; closure?: { closureRatio?: string; errorDistance?: number } } = {};
  let confidenceReport: {
    overallConfidence?: { score?: number; grade?: string };
    callConfidence?: ConfidenceCallScore[];
    discrepancies?: DiscrepancyReport[];
  } = {};

  if (WORKER_URL && WORKER_API_KEY) {
    const [reconRes, confRes] = await Promise.allSettled([
      fetch(`${WORKER_URL}/research/reconcile/${projectId}`, {
        headers: workerHeaders(),
        signal: AbortSignal.timeout(15_000),
      }).then(r => r.ok ? r.json() : null),
      fetch(`${WORKER_URL}/research/confidence/${projectId}`, {
        headers: workerHeaders(),
        signal: AbortSignal.timeout(15_000),
      }).then(r => r.ok ? r.json() : null),
    ]);

    if (reconRes.status === 'fulfilled' && reconRes.value) {
      reconciledBoundary = reconRes.value as typeof reconciledBoundary;
    }
    if (confRes.status === 'fulfilled' && confRes.value) {
      confidenceReport = confRes.value as typeof confidenceReport;
    }
  }

  const reconCalls = reconciledBoundary?.calls ?? [];
  const callScores = confidenceReport?.callConfidence ?? [];
  const discrepancies = confidenceReport?.discrepancies ?? [];
  const overallConfidence = confidenceReport?.overallConfidence ?? {};
  const closure = reconciledBoundary?.closure ?? {};

  // 3. Walk traverse to compute SVG coordinates
  const traverseSegs = walkTraverse(reconCalls);

  // 4. Merge into viewer payload
  const calls = mergeBoundaryCalls(reconCalls, callScores, discrepancies, traverseSegs);

  return NextResponse.json({
    projectId,
    address: project.property_address ?? '',
    countyName: project.county,
    overallScore: overallConfidence.score,
    overallGrade: overallConfidence.grade,
    closureRatio: closure.closureRatio,
    closureError: closure.errorDistance,
    calls,
    callCount: calls.length,
    hasWorkerData: WORKER_URL !== '' && reconCalls.length > 0,
  });
}, { routeName: 'research/boundary/get' });

/* POST — Force re-fetch from worker (bypasses file cache) */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Research worker not configured' }, { status: 503 });
  }

  // Just return the same data — the worker always reads from its local files
  return GET(req);
}, { routeName: 'research/boundary/refresh' });
