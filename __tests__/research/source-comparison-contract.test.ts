// __tests__/research/source-comparison-contract.test.ts — plan 1.6 (A6).
//
// The free-first engine's source-comparison manifest, surfaced in the Artifacts tab. The worker
// (`runEarlyChecklistPurchase` in worker/src/index.ts) writes one row per document to
// `analysis_metadata.sourceComparison`; the page reads them through `sourceComparisonOf`. The same
// "authored but not wired" failure this repo keeps hitting is guarded three ways: the worker
// produces every key the page reads, the page mounts the card, and the shaper is unit-tested.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ResearchProject } from '@/types/research';
import {
  sourceComparisonOf, rowLabel, SOURCE_COMPARISON_KEYS,
} from '@/app/admin/research/[projectId]/_sections/source-comparison-data';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PAGE = 'app/admin/research/[projectId]/page.tsx';
const CARD = 'app/admin/research/[projectId]/_sections/SourceComparisonCard.tsx';
const WORKER = 'worker/src/index.ts';

const project = (sourceComparison: unknown): ResearchProject =>
  ({ analysis_metadata: { sourceComparison } }) as unknown as ResearchProject;

// ── THE CONTRACT — the worker writes every key the page reads ────────────────────────────────────
describe('the worker produces the manifest the page reads', () => {
  const worker = read(WORKER);
  const build = worker.slice(
    worker.indexOf('const sourceComparison = plan.actions'),
    worker.indexOf('handshakeLogger.attempt(\'[Purchase]\', \'info\', \'Cross-source decision\''),
  );

  it('the producer is where this test thinks it is', () => {
    // Control: if the manifest build moved, every key assertion below would pass against '' .
    expect(build.length, 'the sourceComparison build was not found in index.ts').toBeGreaterThan(200);
    expect(build).toContain('.map((a) => ({');
  });

  for (const key of SOURCE_COMPARISON_KEYS) {
    it(`\`${key}\` is produced`, () => {
      expect(build, `${key} is read by the Artifacts tab and written by nobody`)
        .toMatch(new RegExp(`\\b${key}\\b`));
    });
  }

  it('the worker persists it to analysis_metadata (not a local that never leaves the function)', () => {
    expect(build).toContain('analysis_metadata');
    expect(worker).toContain('sourceComparison, sourceComparisonAt');
  });
});

describe('the page mounts the card (not authored-and-orphaned)', () => {
  it('renders SourceComparisonCard from sourceComparisonOf', () => {
    const src = read(PAGE);
    expect(src).toContain('<SourceComparisonCard report={sourceComparisonOf(project)} />');
    expect(src).toContain("from './_sections/source-comparison-data'");
  });

  it('the card imports its shape from the data module, not a second hand-cast', () => {
    const src = read(CARD);
    expect(src).toContain("from './source-comparison-data'");
  });
});

// ── THE SHAPER ───────────────────────────────────────────────────────────────────────────────────
describe('sourceComparisonOf shapes and summarises the manifest', () => {
  it('returns null when there is no manifest (a free-only or pre-engine run)', () => {
    expect(sourceComparisonOf(project(undefined))).toBeNull();
    expect(sourceComparisonOf(project([]))).toBeNull();
    expect(sourceComparisonOf(null)).toBeNull();
  });

  it('counts the decisions and totals only the planned PAID spend', () => {
    const report = sourceComparisonOf(project([
      { docType: 'deed', decision: 'purchase', costUsd: 3, chosenSource: 'texasfile',
        sources: [{ sourceId: 'texasfile', kind: 'paid', unitCostUsd: 3, canPurchase: true, canFreeCapture: false }], reason: 'paid-only' },
      { docType: 'plat', decision: 'free_capture', costUsd: 0, chosenSource: 'cad',
        sources: [{ sourceId: 'cad', kind: 'free', unitCostUsd: 0, canFreeCapture: true, canPurchase: false }], reason: 'free copy exists' },
      { docType: 'deed', decision: 'skip', costUsd: 5, chosenSource: null,
        sources: [{ sourceId: 'texasfile', kind: 'paid', unitCostUsd: 5, canPurchase: true, canFreeCapture: false }], reason: 'over budget' },
    ]));
    expect(report).not.toBeNull();
    expect(report!.rows).toHaveLength(3);
    expect(report!.purchaseCount).toBe(1);
    expect(report!.freeCount).toBe(1);
    expect(report!.skipCount).toBe(1);
    // A skipped $5 must NOT be counted as planned spend — only the bought $3.
    expect(report!.plannedPaidUsd).toBe(3);
  });

  it('rowLabel prefers instrument, then vol/page, then the type', () => {
    expect(rowLabel({ instrument: '2019-3389', book: null, page: null, docType: 'deed' } as never)).toBe('Instrument 2019-3389');
    expect(rowLabel({ instrument: null, book: '5456', page: '704', docType: 'deed' } as never)).toBe('Vol 5456 / Pg 704');
    expect(rowLabel({ instrument: null, book: null, page: null, docType: 'plat' } as never)).toBe('plat');
  });
});
