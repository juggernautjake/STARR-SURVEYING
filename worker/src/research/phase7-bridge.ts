// worker/src/research/phase7-bridge.ts — the run's own reconciliation, in the shape the rest of the
// system already reads.
//
// ── THE KEYSTONE THIS REPLACES ──────────────────────────────────────────────────────────────────
//
// Every downstream consumer of a reconciled boundary reads one file:
// `/tmp/analysis/{projectId}/reconciled_boundary.json`.
//
//   GET  /research/reconcile/:projectId    the boundary viewer's calls
//   GET  /research/boundary/:projectId     the assembled boundary payload
//   POST /research/confidence              Phase 8 takes `reconciledPath` as its INPUT
//   orchestrator/master-orchestrator.ts    loads it by name
//
// That file is written by exactly one thing: the Testing Lab's `POST /research/reconcile`. A normal
// run never writes it, so every one of those consumers reads nothing for every run an operator
// actually started — and Phase 8 cannot run at all, because its input does not exist. Phase 9's
// purchase recommendations come out of Phase 8, which is why `research_document_purchases` has 0 rows.
//
// The run is not missing the work. It reconciles at Stage 3.5 through `runGeoReconcile`, and keeps
// the result in memory and nowhere else. So the gap is not a missing phase — it is a missing
// FORMAT: the answer exists and is never written down where anything can read it.
//
// ── WHY A BRIDGE AND NOT "RUN PHASE 7 IN THE PIPELINE" ──────────────────────────────────────────
//
// `GeometricReconciliationEngine` (669 lines) is a second implementation of reconciliation, built for
// the Lab. Running it as well would reconcile the same boundary twice, at AI cost, and then have to
// decide which answer wins. The run's own pass is the one whose output the operator is already
// looking at. This writes THAT down.
//
// What the run's pass does not have is Phase 7's cross-source aggregation — several readings of one
// call, weighted. So every bridged call is marked `single_source` with `sourceCount: 1`, which is
// true, and lets a reader tell a bridged boundary from an aggregated one instead of guessing.

import * as fs from 'fs';
import * as path from 'path';

/** A boundary call as the pipeline produces it. Structural, to avoid importing the whole type tree. */
export interface RunBoundaryCall {
  sequence: number;
  callId?: string;
  bearing?: { raw: string; decimalDegrees: number; quadrant: string } | null;
  distance?: { raw: string; value: number; unit: string } | null;
  along?: string | null;
  toPoint?: string | null;
  confidence?: number;
}

export interface Phase7Call {
  callIndex: number;
  callId?: string;
  bearing?: string;
  distance?: number;
  consensusMethod: 'single_source';
  sourceCount: 1;
  along?: string;
  toPoint?: string;
  finalConfidence?: number;
}

export interface Phase7Document {
  projectId: string;
  reconciledBoundary: Phase7Call[];
  closureError?: number;
  closureRatio?: number;
  compassRuleApplied: boolean;
  reconcileAt: string;
  /** Where this came from. Absent on a real Phase-7 run, so a reader can tell them apart. */
  source: 'pipeline-stage-3.5';
}

/**
 * The schema's bearing format, e.g. `N 45°30'00" E`.
 *
 * Returned only when the raw string already matches. A bearing that does not is DROPPED rather than
 * coerced: the schema exists to keep malformed geometry out, and a bearing invented to satisfy a
 * regex is worse than a call with no bearing — one is missing data and the other is wrong data with
 * a survey's authority behind it.
 */
const BEARING_RE =
  /^[NS]\s*\d{1,2}°(?:\d{1,2}['′](?:\d{1,2}["″])?)?(?:\s*\d{1,2}°(?:\d{1,2}['′](?:\d{1,2}["″])?)?)?[\s°]\s*[EW]$/i;

export function bearingForSchema(raw: string | null | undefined): string | undefined {
  const t = (raw ?? '').trim();
  return t && BEARING_RE.test(t) ? t : undefined;
}

/** Distances must be positive; a zero or negative one is dropped for the same reason. */
export function distanceForSchema(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Convert the run's boundary into the Phase-7 document every downstream reader expects. */
export function buildPhase7Document(
  projectId: string,
  calls: RunBoundaryCall[],
  closure?: { closureError?: number | null; closureRatio?: number | null },
  now: Date = new Date(),
): Phase7Document {
  const reconciledBoundary: Phase7Call[] = calls.map((c, i) => {
    const call: Phase7Call = {
      callIndex: i,
      consensusMethod: 'single_source',
      sourceCount: 1,
    };
    if (c.callId) call.callId = c.callId;
    const bearing = bearingForSchema(c.bearing?.raw);
    if (bearing) call.bearing = bearing;
    const distance = distanceForSchema(c.distance?.value);
    if (distance !== undefined) call.distance = distance;
    if (c.along) call.along = c.along;
    if (c.toPoint) call.toPoint = c.toPoint;
    if (typeof c.confidence === 'number') call.finalConfidence = c.confidence;
    return call;
  });

  const doc: Phase7Document = {
    projectId,
    reconciledBoundary,
    compassRuleApplied: false,
    reconcileAt: now.toISOString(),
    source: 'pipeline-stage-3.5',
  };

  // Non-negative only, because the schema says so and a negative closure is a bug upstream rather
  // than a fact to record.
  if (typeof closure?.closureError === 'number' && closure.closureError >= 0) {
    doc.closureError = closure.closureError;
  }
  if (typeof closure?.closureRatio === 'number' && closure.closureRatio >= 0) {
    doc.closureRatio = closure.closureRatio;
  }
  return doc;
}

/**
 * Write it where every reader already looks.
 *
 * Never throws, and never overwrites a REAL Phase-7 report: if the Lab has produced one for this
 * project it is the better answer — it carries cross-source aggregation this does not — and
 * replacing it with a single-source bridge would be a downgrade nobody asked for.
 */
export function writePhase7Document(
  analysisDir: string,
  doc: Phase7Document,
): { written: boolean; reason: string } {
  const target = path.join(analysisDir, doc.projectId, 'reconciled_boundary.json');

  try {
    if (fs.existsSync(target)) {
      const existing = JSON.parse(fs.readFileSync(target, 'utf-8')) as { source?: string };
      if (existing.source !== 'pipeline-stage-3.5') {
        return { written: false, reason: 'a full Phase-7 report already exists and is the better answer' };
      }
    }
    if (doc.reconciledBoundary.length === 0) {
      return { written: false, reason: 'the run produced no boundary calls, so there is nothing to reconcile' };
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(doc, null, 2));
    return { written: true, reason: `${doc.reconciledBoundary.length} call(s)` };
  } catch (err) {
    return { written: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
