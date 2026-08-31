// What a run achieved, per dollar (research plan R30).
//
// The owner's requirement is "as cheap but as effective as possible". Neither half has been a number.
// R4 made spend measurable, R5 made the budget enforceable, R22 put both on a screen — but nothing
// said whether a run that cost $4.20 did more than one that cost $1.10, so there was no way to tell
// a cheap run from a thin one.
//
// The plan asks for "facts extracted vs expected for that property type". THERE IS NO BASELINE.
// Nobody has established what a 40-acre rural tract in Bell County should yield, and inventing a
// number would produce a score that looks objective and means nothing — the exact failure this whole
// document has been closing everywhere else.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildReportCard,
  compareCards,
  type RunContent,
  type RunFacts,
} from '@/lib/research/report-card';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const run = (over: Partial<RunFacts> = {}): RunFacts => ({
  runId: 'run1',
  status: 'complete',
  startedAt: '2026-08-02T10:00:00.000Z',
  finishedAt: '2026-08-02T10:24:00.000Z',
  costUsd: 4.2,
  paidPages: 3,
  limits: { maxMinutes: 30 },
  skippedWork: [],
  budgetSummary: null,
  ...over,
});

const content = (over: Partial<RunContent> = {}): RunContent => ({
  documents: 10,
  unreadableDocuments: 0,
  sourcesRegistered: 4,
  sourcesReached: 3,
  facts: 42,
  factsWithEvidence: 40,
  factsReviewed: 10,
  conflicts: 2,
  ...over,
});

describe('the cheap-but-effective number', () => {
  it('computes cost per fact', () => {
    const c = buildReportCard(run(), content());
    expect(c.costPerFact).toBeCloseTo(0.1, 3);
    expect(c.headline).toContain('per fact');
  });

  it('returns null, not zero, when nothing was extracted', () => {
    // A divide-by-zero rendered as $0.00 would make the emptiest run look the most efficient.
    const c = buildReportCard(run(), content({ facts: 0 }));
    expect(c.costPerFact).toBeNull();
  });

  it('does not count an unreadable document as a source reached', () => {
    // Counting it is how a thin run scores well.
    const c = buildReportCard(run(), content({ documents: 10, unreadableDocuments: 4, sourcesReached: 6 }));
    expect(c.notMeasured.join(' ')).toContain('could not be read');
  });

  it('reports coverage as null when the denominator is unknown', () => {
    // "Reached 3 of ?" is not zero coverage.
    const c = buildReportCard(run(), content({ sourcesRegistered: 0 }));
    expect(c.sourceCoverage).toBeNull();
    expect(c.notMeasured.join(' ')).toContain('has no denominator');
  });

  it('carries the evidence and review rates from R17 and R23', () => {
    const c = buildReportCard(run(), content());
    expect(c.evidenceRate).toBeCloseTo(40 / 42, 2);
    expect(c.reviewRate).toBeCloseTo(10 / 42, 2);
  });
});

describe('what the card refuses to claim', () => {
  it('always states that the expected fact count is unknown', () => {
    // A score that looks objective and is not is worse than no score.
    const c = buildReportCard(run(), content());
    expect(c.notMeasured[0]).toContain('No baseline exists');
    expect(c.notMeasured[0]).toContain('not evidence of a poor run');
  });
});

describe('a truncated run must never read as a good one', () => {
  it('is flagged when work was skipped', () => {
    const c = buildReportCard(run({ skippedWork: [{ what: 'Deed chain', reason: 'time ceiling' }] }), content());
    expect(c.truncated).toBe(true);
    expect(c.headline).toContain('do not read this as a complete run');
  });

  it('is flagged when a ceiling ended it, or a restart did', () => {
    expect(buildReportCard(run({ budgetSummary: 'Stopped at the spend ceiling.' }), content()).truncated).toBe(true);
    expect(buildReportCard(run({ status: 'interrupted' }), content()).truncated).toBe(true);
  });

  it('fills in a missing skip reason rather than showing undefined', () => {
    const c = buildReportCard(run({ skippedWork: [{}] }), content());
    expect(c.skipped[0]).toEqual({ what: 'unnamed work', reason: 'no reason recorded' });
  });
});

describe('two runs on one property, different budgets', () => {
  const cheap = buildReportCard(run({ runId: 'a', costUsd: 1.1 }), content({ facts: 20, conflicts: 1 }));
  const rich = buildReportCard(run({ runId: 'b', costUsd: 4.2 }), content({ facts: 42, conflicts: 2 }));

  it('compares cost, facts and cost per fact', () => {
    const cmp = compareCards(cheap, rich);
    expect(cmp.lines.join(' ')).toContain('Cost: $1.10 → $4.20');
    expect(cmp.lines.join(' ')).toContain('Facts: 20 → 42');
    expect(cmp.lines.join(' ')).toContain('Cost per fact');
  });

  it('refuses a verdict when either run was truncated', () => {
    // A truncated run always looks cheaper per fact, and rewarding that would train the system to do
    // less work for a better score.
    const truncated = buildReportCard(
      run({ runId: 'c', costUsd: 0.5, skippedWork: [{ what: 'Deed chain', reason: 'ceiling' }] }),
      content({ facts: 5 }),
    );
    expect(compareCards(truncated, rich).verdict).toContain('not comparable');
    expect(compareCards(rich, truncated).verdict).toContain('reward');
  });

  it('calls a strictly better run strictly better', () => {
    const better = buildReportCard(run({ runId: 'd', costUsd: 1.0 }), content({ facts: 50 }));
    expect(compareCards(cheap, better).verdict).toContain('Strictly better');
  });

  it('will not call a cheaper, thinner run a saving on the numbers alone', () => {
    const cmp = compareCards(rich, cheap);
    expect(cmp.verdict).toContain('depends on what the missing facts were');
  });

  it('says when more money bought nothing', () => {
    const same = buildReportCard(run({ runId: 'e', costUsd: 9 }), content({ facts: 20 }));
    expect(compareCards(cheap, same).verdict).toContain('cost more and found no more');
  });

  it('does not compare cost per fact when one run extracted nothing', () => {
    const empty = buildReportCard(run({ runId: 'f' }), content({ facts: 0 }));
    expect(compareCards(empty, rich).lines.join(' ')).toContain('not comparable');
  });
});

describe('the surface', () => {
  it('does not report a failed read as "no run"', () => {
    const route = read('app/api/admin/research/[projectId]/report-card/route.ts');
    expect(route).toContain('not the same as no run having happened');
  });

  it('admits the counts are per project, not per run', () => {
    // Nothing tags a document or fact with the run that produced it, and silently attributing every
    // fact ever extracted to the latest run would be the fabrication this card exists to avoid.
    const route = read('app/api/admin/research/[projectId]/report-card/route.ts');
    expect(route).toContain('contentIsPerProject');
    const panel = read('app/admin/research/components/ReportCardPanel.tsx');
    expect(panel).toContain('not this run alone');
  });

  it('gives "does not measure" real weight rather than tucking it away', () => {
    const css = read('app/admin/styles/AdminResearch.css');
    expect(css).toContain('.report-card__not-measured');
    expect(css).toContain('worse than no score');
  });

  it('offers the two-run comparison the acceptance asks for', () => {
    const panel = read('app/admin/research/components/ReportCardPanel.tsx');
    expect(panel).toContain('Compare with the previous run');
    expect(panel).toContain('nothing to compare it against');
  });

  it('is actually mounted', () => {
    // ── THE GUARD FOLLOWED THE CODE ──────────────────────────────────────────────────────────
    //
    // This asserted on `[projectId]/page.tsx`, and the stage-2 block moved into
    // `_sections/ResearchStagePanel.tsx` (B1a). The check went red, correctly.
    //
    // A guard that names a FILE has to be pointed at the file after a move — but pointing it at
    // the section alone would be weaker than what it replaced, because a section nothing mounts
    // satisfies it just as well. So it asserts BOTH: the section renders it, AND the page mounts
    // the section. That is the same two-part shape the county-check guard took when C3 extracted
    // `CountyNote`.
    expect(read('app/admin/research/[projectId]/_sections/ResearchStagePanel.tsx'))
      .toContain('<ReportCardPanel projectId={projectId} />');
    expect(read('app/admin/research/[projectId]/page.tsx'))
      .toMatch(/<ResearchStagePanel\s/);
  });
});
