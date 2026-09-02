import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// C2 — "make sure our normal pipeline is set up to use all of the research and analysis functions."
//
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────────
//
// The boundary viewer fetches `/research/reconcile/:projectId` and `/research/confidence/:projectId`
// from the worker. Both read files under `/tmp/analysis/{id}/` — `reconciled_boundary.json` and
// `confidence_report.json` — and BOTH are written only by the Testing Lab's Phase 7 and Phase 8.
//
// Measured: `POST /research/reconcile` and `POST /research/confidence` have exactly one caller in the
// product, `app/api/admin/research/testing/run/route.ts`. A normal run posts to
// `/research/property-lookup` and never reaches either.
//
// So for every run an operator actually started, the boundary viewer had nothing to draw, and the
// response said `hasWorkerData: false` — which reads as "the worker is down" rather than "nobody
// computed this". A surveyor looking at an empty boundary concludes something about the PROPERTY.
//
// The run was computing the calls the whole time. It reconciles at Stage 3.5 through a different
// module (`runGeoReconcile`) and persisted only `callCount`.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const ROUTE = read('app/api/admin/research/[projectId]/boundary/route.ts');
const WORKER = read('worker/src/index.ts');

describe('the run keeps the calls it computed', () => {
  it('CONTROL: it still records how many there were', () => {
    // If the count vanished, the assertions below could pass against a boundary block that persists
    // nothing useful at all.
    expect(WORKER).toContain('callCount: r.boundary.calls.length');
  });

  it('persists the calls themselves, not only the count', () => {
    expect(WORKER).toContain('calls: r.boundary.calls.slice(0, 400).map(');
  });

  it('keeps what a viewer needs to draw one', () => {
    const at = WORKER.indexOf('calls: r.boundary.calls.slice(0, 400).map(');
    const block = WORKER.slice(at, at + 900);
    for (const field of ['sequence', 'bearing', 'distance', 'confidence']) {
      expect(block, `a persisted call has no ${field}`).toContain(`${field}:`);
    }
  });

  it('says when it truncated rather than dropping calls silently', () => {
    // A boundary missing its last calls does not close, and a reader blames the survey rather than
    // the storage limit.
    expect(WORKER).toContain('callsTruncated: r.boundary.calls.length > 400');
  });
});

describe('the viewer uses them when the Lab report is absent', () => {
  it('reads the run metadata', () => {
    expect(ROUTE).toContain('analysis_metadata');
    expect(ROUTE).toContain('meta.result?.boundary?.calls');
  });

  it('prefers the Phase-7 report when it exists', () => {
    // The richer answer wins. Phase 7 carries cross-source aggregation the run's own pass does not,
    // so the fallback is a fallback and not a replacement.
    expect(ROUTE).toContain('(reconciledBoundary?.calls ?? []).length === 0 && runCalls.length > 0');
  });

  it('maps a run call onto the shape the viewer merges', () => {
    const at = ROUTE.indexOf('usedRunCalls');
    expect(at).toBeGreaterThan(-1);
    const block = ROUTE.slice(at, at + 1200);
    expect(block).toContain('reconciledBearing');
    expect(block).toContain('reconciledDistance');
  });

  it('SAYS which source answered — the part that keeps it honest', () => {
    // "No calls", "the run's own calls" and "the full Phase-7 reconciliation" are three different
    // states. A viewer that renders them identically invites a conclusion about the property from a
    // fact about the pipeline, which is the defect this whole plan keeps meeting.
    expect(ROUTE).toContain("callSource: reconCalls.length === 0 ? 'none' : usedRunCalls ? 'run' : 'phase7'");
  });

  it('does not claim a truncation that belongs to the other source', () => {
    expect(ROUTE).toContain('callsTruncated: usedRunCalls ?');
  });
});

describe('the two Lab-only phases are still Lab-only — recorded, not fixed here', () => {
  it('CONTROL: the Testing Lab is the only caller of the compute routes', () => {
    // This is the measurement C1 rests on. If a second caller appears, the fallback above may no
    // longer be the right default and this test should be revisited rather than deleted.
    const lab = read('app/api/admin/research/testing/run/route.ts');
    expect(lab).toContain("'/research/reconcile'");
    expect(lab).toContain("'/research/confidence'");
  });
});
