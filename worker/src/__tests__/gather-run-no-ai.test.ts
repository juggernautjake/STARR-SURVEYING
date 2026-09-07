// worker/src/__tests__/gather-run-no-ai.test.ts — the research run GATHERS; the user ANALYZES.
//
// From the 2026-09-06 run of 1401 North East St (Bell): the gather run spent 65 of its 76 minutes in
// Phase 3 AI deed analysis (35 min PER DEED), blew through the wall clock, tripped the stall watchdog,
// and was then reported as "Research Failed … found no property record and no documents" although it
// had identified the parcel, captured five images and filed eleven documents. Three defects, each
// guarded here:
//   1. the phase never reached the Bell orchestrator (nothing sent it; nothing carried it);
//   2. a stall abort was a bare Error, so the router treated the stop as a crash;
//   3. screenshot capture re-tried a host the run already knew was down, at 45 s a time.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { StallAbort, BudgetAbort, describeAbort } from '../research/abort-reason.js';
import { googleZoomForParcel } from '../counties/bell/scrapers/map-screenshot-capture.js';
import { MAX_ZOOM, zoomForBand } from '../research/capture-plan.js';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('a gather run reads nothing with AI (Bell)', () => {
  const orchestrator = read('src/counties/bell/orchestrator.ts');
  const router = read('src/counties/router.ts');
  const index = read('src/index.ts');

  it('index.ts carries the run phase onto the research input the county router receives', () => {
    expect(index).toContain('researchInput.phase = runSettings.phase;');
  });
  it('the router hands the phase to the Bell module', () => {
    expect(router).toContain('phase: input.phase,');
    expect(router).toMatch(/phase\?: 'gather' \| 'analyze';/);
  });
  it('the orchestrator blanks the AI key for a gather run — the one switch every Phase 3 use reads', () => {
    expect(orchestrator).toContain("const isGatherRun = input.phase === 'gather';");
    expect(orchestrator).toContain("const anthropicApiKey = isGatherRun ? '' : configuredApiKey;");
    // Nothing below the switch reaches for the deployment's key directly.
    const afterSwitch = orchestrator.slice(orchestrator.indexOf('const anthropicApiKey = isGatherRun'));
    expect(afterSwitch).not.toContain('process.env.ANTHROPIC_API_KEY');
    expect(afterSwitch).not.toContain('configuredApiKey,');
    // And it says so in the run log, where the operator will look for Phase 3.
    expect(orchestrator).toContain('Gather run — AI reading skipped on purpose');
  });
});

describe('a stall stop is a partial result, not a crash', () => {
  it('StallAbort is an expected stop of kind stall', () => {
    const d = describeAbort(new StallAbort('Stopped after 12 minutes with no progress'));
    expect(d.kind).toBe('stall');
    expect(d.isExpected).toBe(true);
    expect(describeAbort(new BudgetAbort('x')).isExpected).toBe(true);
    expect(describeAbort(new Error('boom')).isExpected).toBe(false);
  });
  it('the stall watchdog aborts with a StallAbort and records kind stall', () => {
    const index = read('src/index.ts');
    const watchdog = index.slice(index.indexOf('THE STALL WATCHDOG'), index.indexOf('THE STALL WATCHDOG') + 3000);
    expect(watchdog).toContain("active.stopReason = { kind: 'stall', message };");
    expect(watchdog).toContain('abort(new StallAbort(message))');
    expect(watchdog).not.toContain('abort(new Error(message))');
  });
  it('the router files a stall as partial (kept), like a budget stop', () => {
    const router = read('src/counties/router.ts');
    expect(router).toContain("(abort?.kind === 'budget' || abort?.kind === 'stall')");
  });
});

describe('screenshot capture respects the host circuit', () => {
  it('the Bell screenshot collector skips a tripped host and trips it on a timeout', () => {
    const src = read('src/counties/bell/scrapers/screenshot-collector.ts');
    expect(src).toContain("from '../../../infra/host-circuit.js'");
    // Per transport since 2026-09-07: the collector drives a browser, so it checks and trips the
    // browser circuit — a geo-blocked direct fetch no longer skips these captures.
    expect(src).toContain("hostCircuit(req.url, undefined, 'browser')");
    expect(src).toContain("tripHost(req.url, err, undefined, 'browser')");
    // The skip happens BEFORE the navigation, inside the request loop.
    const check = src.indexOf("hostCircuit(req.url, undefined, 'browser')");
    const nav = src.indexOf('await page.goto(req.url');
    expect(check).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(-1);
    expect(check).toBeLessThan(nav);
  });
  it('the GIS viewer capture and the direct BIS map capture both consult and trip the circuit', () => {
    const gis = read('src/counties/bell/scrapers/gis-viewer-capture.ts');
    expect(gis).toContain("hostCircuit(GIS_VIEWER_URL, undefined, 'browser')");
    expect(gis).toContain("tripHost(GIS_VIEWER_URL, err, undefined, 'browser')");
    const map = read('src/counties/bell/scrapers/map-screenshot-capture.ts');
    expect(map).toContain("const circuit = hostCircuit(url, undefined, 'browser');");
    expect(map).toContain("tripHost(url, err, undefined, 'browser');");
  });
});

describe('the Analyze run starts on the worker and then runs the app analysis', () => {
  it('read-documents accepts thenAnalyze and triggers the app analysis in finally, with the cost cap', () => {
    const index = read('src/index.ts');
    const start = index.indexOf("app.post('/research/read-documents/:projectId'");
    const handler = index.slice(start, index.indexOf('\napp.', start + 10));
    expect(handler).toContain('thenAnalyze?: boolean');
    expect(handler).toContain('if (thenAnalyze)');
    // Since 2026-09-06 the worker DRIVES the analysis (one awaited call per document, then a
    // finalize) instead of firing one background call — drive-app-analysis.ts, with the cap.
    expect(handler).toContain("await import('./research/drive-app-analysis.js')");
    expect(handler).toContain('maxCostUsd: benchmark ? undefined : body.maxCostUsd,');
    expect(handler).toContain('triggerAppAnalysis(projectId, { allow: true, ...opts, awaitCompletion: true');
    // in finally — a capped read still hands over, and nothing is left parked at `analyzing`.
    // Presence before order: `indexOf` is -1 for an absent needle, and -1 is less than everything.
    const finallyAt = handler.indexOf('finally {');
    const thenAnalyzeAt = handler.indexOf('if (thenAnalyze)');
    expect(finallyAt).toBeGreaterThan(-1);
    expect(thenAnalyzeAt).toBeGreaterThan(-1);
    expect(finallyAt).toBeLessThan(thenAnalyzeAt);
    // the benchmark no longer wipes analysis_metadata wholesale
    expect(handler).toContain('...priorMeta, benchmark_total_pages');
  });
  it('triggerAppAnalysis forwards the cost cap only when given one', () => {
    const src = read('src/research/trigger-app-analysis.ts');
    expect(src).toContain('maxCostUsd?: number');
    // The body is assembled field by field since the chunk options arrived (2026-09-06); the cap is
    // still only sent when it is a finite number — the behaviour is pinned by
    // drive-app-analysis-2026-09-06.test.ts ("a plain call still sends only the cap").
    expect(src).toContain("if (typeof opts.maxCostUsd === 'number' && Number.isFinite(opts.maxCostUsd)) body.maxCostUsd = opts.maxCostUsd;");
  });
});

describe('overhead views zoom in closer on a house lot (owner, 2026-09-06)', () => {
  it('Bell Google satellite: 22 for a lot, 21 for a few acres, 20 for a tract or unknown', () => {
    expect(googleZoomForParcel(0.2949)).toBe(22);
    expect(googleZoomForParcel(0.75)).toBe(22);
    expect(googleZoomForParcel(2)).toBe(21);
    expect(googleZoomForParcel(12)).toBe(20);
    expect(googleZoomForParcel(null)).toBe(20);
    expect(googleZoomForParcel(0)).toBe(20);
  });
  it('the capture plan ceiling reaches 22, so a small lot\'s close band gets there', () => {
    expect(MAX_ZOOM).toBe(22);
    expect(zoomForBand(20, 2)).toBe(22);
    expect(zoomForBand(21, 2)).toBe(22); // clamped, not beyond
  });
  it('the orchestrator passes the acreage the zoom is chosen from', () => {
    expect(read('src/counties/bell/orchestrator.ts')).toContain('acreage: property.acreage ?? null,');
  });
});

describe('the paid path no longer requires the checklist to be PRESENT', () => {
  it('all three purchase sites run with the default checklist when none was sent', () => {
    const index = read('src/index.ts');
    expect(index).not.toContain('!runSettings.gatherSelections || !projectId');
    expect(index).not.toContain('if (runSettings.gatherSelections) {');
    // and they still resolve the selections through the defaulting helper
    expect((index.match(/resolveGatherSelections\(runSettings\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
