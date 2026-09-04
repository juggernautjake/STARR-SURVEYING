import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { identityKey, yearStamped, compareDocuments } from '../research/document-identity.js';
import { DEFAULT_LIMITS, checkBudget, endRun, recordSkipped, recordPartial, startRun, windDownSummary } from '../infra/run-budget.js';
import { platBrowserRouteEnabled } from '../services/county-plats.js';

// ── After run 5 (2026-09-04) ───────────────────────────────────────────────────────────────────
//
//   • Plat 1982002520 was on file three times, every row with a null identity key: the key needed
//     a recording date and two of the three filings had none. A YYYYNNNNNN instrument number
//     carries its year; it is the identity on its own, date or no date.
//   • The summary said "Not attempted: clerk deed search" for a step that had kept ten documents.
//   • The plat repository blocks the worker's IP; a browser on another address is the way round,
//     gated on the operator naming `plat-repo` in BROWSERBASE_ENABLED_ADAPTERS.

const SRC = path.resolve(process.cwd(), 'src');
const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), 'utf8'));

describe('a year-stamped instrument number is its own identity', () => {
  it('recognises the Tyler/Kofile form and refuses shorter numbers', () => {
    expect(yearStamped('1982002520')).toBe(true);
    expect(yearStamped('2024039298')).toBe(true);
    expect(yearStamped('201600013474')).toBe(true);
    expect(yearStamped('12345')).toBe(false);
    expect(yearStamped('1982')).toBe(false);
    expect(yearStamped('3082002520')).toBe(false);
  });

  it('the plat filed by the upload (no date) and by the clerk sink (with date) share one key', () => {
    const noDate = identityKey({ county: 'Bell', instrumentNumber: '1982002520' });
    const withDate = identityKey({ county: 'Bell', instrumentNumber: '1982002520', recordingDate: '1982-11-03' });
    expect(noDate).toBe('BELL|I:1982002520');
    expect(withDate).toBe(noDate);
    expect(compareDocuments(
      { county: 'Bell', instrumentNumber: '1982002520' },
      { county: 'Bell', instrumentNumber: '1982002520', recordingDate: '1982-11-03' },
    )).toEqual({ kind: 'same', key: 'BELL|I:1982002520' });
  });

  it('CONTROL: a short instrument number without a date is still unidentifiable', () => {
    expect(identityKey({ county: 'Bell', instrumentNumber: '45812' })).toBeNull();
    expect(identityKey({ county: 'Bell', instrumentNumber: '45812', recordingDate: '1994-02-01' })).toBe('BELL|I:45812|1994-02-01');
  });
});

describe('a kept partial is not "not attempted"', () => {
  const PROJECT = 'proj-partial';
  const T0 = 1_700_000_000_000;
  beforeEach(() => { endRun(PROJECT); });

  it('run 5: the clerk step kept ten documents; the summary says so and keeps the untried steps apart', () => {
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxWallClockMs: 1000 }, T0);
    recordSkipped(PROJECT, 'clerk deed search', 'it did not finish within the 7 minute(s) the run had left');
    recordSkipped(PROJECT, 'adjoiner research', 'no time remained');
    recordPartial(PROJECT, 'clerk deed search', '10 document(s) kept');
    const summary = windDownSummary(checkBudget(PROJECT, 0, T0 + 2000))!;
    expect(summary).toContain('Stopped mid-step, work kept: clerk deed search (10 document(s) kept).');
    expect(summary).toContain('Not attempted: adjoiner research.');
    expect(summary).not.toMatch(/Not attempted: .*clerk deed search/);
    expect(summary).toContain('Re-run with a higher limit');
  });

  it('CONTROL: without a partial the wording is unchanged', () => {
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxWallClockMs: 1000 }, T0);
    recordSkipped(PROJECT, 'adjoiner research', 'no time remained');
    const summary = windDownSummary(checkBudget(PROJECT, 0, T0 + 2000))!;
    expect(summary).toContain('Not attempted: adjoiner research.');
    expect(summary).not.toContain('Stopped mid-step');
  });

  it('the orchestrator records the partial when it keeps the sink', () => {
    const orch = read('counties/bell/orchestrator.ts');
    expect(orch).toContain("import { recordPartial } from '../../infra/run-budget.js';");
    expect(orch).toContain("recordPartial(input.projectId, 'clerk deed search', kept);");
    expect(orch).toContain('onPathComplete: (p) => { clerkPaths.add(p); },');
    expect(orch).toMatch(/the subject's deed chain finished/);
  });
});

describe('the plat repository is reached through a browser on another address when refused', () => {
  it('the route is gated on the operator naming plat-repo', () => {
    expect(platBrowserRouteEnabled({ BROWSERBASE_ENABLED_ADAPTERS: 'cad,plat-repo' })).toBe(true);
    expect(platBrowserRouteEnabled({ BROWSERBASE_ENABLED_ADAPTERS: 'cad' })).toBe(false);
    expect(platBrowserRouteEnabled({})).toBe(false);
  });
  it('both fetch layers take the browser route after a 403, and say when it was not enabled', () => {
    const src = read('services/county-plats.ts');
    expect((src.match(/const alt = await fetchThroughBrowser\((url|fileUrl), headers\);/g) ?? []).length).toBe(2);
    expect(src).toContain("withBrowser({ adapterId: 'plat-repo' }");
    expect(src).toContain('context.request.get(url, { headers, timeout: 30_000, maxRedirects: 5 })');
    expect(src).toContain('plat-repo is not in BROWSERBASE_ENABLED_ADAPTERS, so no other address was tried');
  });
});

describe('the scraping steps leave time for the reading (analysis reserve)', () => {
  const PROJECT = 'proj-reserve';
  const T0 = 1_700_000_000_000;
  beforeEach(() => { endRun(PROJECT); });

  it('holds back 30% of the ceiling, never under three minutes nor over eight', async () => {
    const { analysisReserveMs } = await import('../research/budget-gate.js');
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxWallClockMs: 15 * 60_000 }, T0);
    expect(analysisReserveMs(PROJECT)).toBe(4.5 * 60_000);
    endRun(PROJECT);
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxWallClockMs: 5 * 60_000 }, T0);
    expect(analysisReserveMs(PROJECT)).toBe(3 * 60_000);
    endRun(PROJECT);
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxWallClockMs: 60 * 60_000 }, T0);
    expect(analysisReserveMs(PROJECT)).toBe(8 * 60_000);
    endRun(PROJECT);
    expect(analysisReserveMs('no-such-run')).toBe(0);
  });

  it('a step given a reserve still runs (45 s floor) and returns its value', async () => {
    const { withStepDeadline } = await import('../research/budget-gate.js');
    // Started NOW: the deadline is measured against the wall clock, and a run started in 2023 has no time left.
    startRun(PROJECT, { ...DEFAULT_LIMITS, maxWallClockMs: 2 * 60_000 }, Date.now());
    const notes: string[] = [];
    const out = await withStepDeadline(PROJECT, 'plat search', async () => 'found', 'fallback', (m) => notes.push(m), { reserveMs: 3 * 60_000 });
    expect(out).toBe('found');
    expect(notes.some((n) => /held back for reading what it finds/.test(n))).toBe(true);
  });

  it('all four Bell scraping steps carry the reserve', () => {
    // plat search, clerk deed search, deed-chain fetch and historical deed fetch — every
    // browser-driving step holds back the analysis reserve (the last two were added with the
    // runaway fix, 8382b640f).
    const orch = read('counties/bell/orchestrator.ts');
    expect(orch).toContain('const analysisReserve = analysisReserveMs(input.projectId);');
    expect(orch.split('reserveMs: analysisReserve').length - 1).toBe(4);
  });
});
