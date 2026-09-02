// What changed since the last run (research plan R27).
//
// Two gaps, not one. `PipelineDiffEngine` exists, diffs boundary calls between two stored versions,
// and an API route calls it — but no screen ever rendered it, so the engine has been running for
// nobody. And its scope is narrower than the plan asks for: "new instruments, changed CAD values,
// new imagery" is document- and fact-level change, and a job that sat for three months and gained
// two new deeds needs to be told that.
//
// The honest problem is CHANGES. Nothing snapshots a CAD value per run, so "this acreage used to
// read 2.45" is unanswerable in general — except where a row keeps both halves, which is exactly
// what R23's corrections do. A diff that silently omits changed values is worse than one that says
// it detects additions and corrections only.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  diffSinceLastRun,
  materialChanges,
  packetImpact,
  type DocumentLite,
  type FactLite,
} from '@/lib/research/run-diff';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const PREV = '2026-05-01T00:00:00.000Z';
const NOW = '2026-08-01T00:00:00.000Z';
const win = { since: PREV, previousRunAt: PREV, currentRunAt: NOW };

const doc = (over: Partial<DocumentLite> = {}): DocumentLite => ({
  id: 'd1',
  document_label: '2026 warranty deed',
  document_type: 'deed',
  created_at: '2026-07-15T00:00:00.000Z',
  ...over,
});

const fact = (over: Partial<FactLite> = {}): FactLite => ({
  id: 'f1',
  data_category: 'distance',
  raw_value: '210.5 feet',
  display_value: '210.5 ft',
  created_at: '2026-07-15T00:00:00.000Z',
  ...over,
});

describe('the first run is not "no changes"', () => {
  it('says there is nothing to compare against', () => {
    const d = diffSinceLastRun({ since: null, previousRunAt: null, currentRunAt: NOW }, [doc()], [fact()]);
    expect(d.firstRun).toBe(true);
    expect(d.changes).toHaveLength(0);
    expect(d.headline).toContain('not the same as nothing having changed');
  });
});

describe('what arrived since the previous run', () => {
  it('reports a new deed as a new instrument', () => {
    const d = diffSinceLastRun(win, [doc()], []);
    expect(d.counts.new_document).toBe(1);
    expect(d.changes[0]!.detail).toContain('not in the previous run');
  });

  it('separates imagery from instruments', () => {
    const d = diffSinceLastRun(win, [doc({ document_type: 'aerial_photo' })], []);
    expect(d.counts.new_imagery).toBe(1);
    expect(d.counts.new_document).toBe(0);
  });

  it('ignores anything that predates the window', () => {
    const d = diffSinceLastRun(win, [doc({ created_at: '2026-01-01T00:00:00.000Z' })], []);
    expect(d.changes).toHaveLength(0);
  });

  it('windows on the previous run’s START, not its finish', () => {
    // A document fetched DURING the previous run belongs to it; windowing on the finish would report
    // that whole run's haul as new work on the next one.
    const during = diffSinceLastRun(win, [doc({ created_at: '2026-05-01T00:30:00.000Z' })], []);
    expect(during.counts.new_document).toBe(1);
    const before = diffSinceLastRun(win, [doc({ created_at: '2026-04-30T23:00:00.000Z' })], []);
    expect(before.counts.new_document).toBe(0);
  });

  it('lists the newest change first', () => {
    const d = diffSinceLastRun(win, [
      doc({ id: 'old', created_at: '2026-06-01T00:00:00.000Z' }),
      doc({ id: 'new', created_at: '2026-07-20T00:00:00.000Z' }),
    ], []);
    expect(d.changes[0]!.at).toContain('2026-07-20');
  });
});

describe('the one change we can prove', () => {
  it('reports a correction with both halves', () => {
    // The row keeps raw_value alongside corrected_value (R23), which is what makes this knowable.
    const d = diffSinceLastRun(win, [], [fact({
      review_status: 'corrected',
      corrected_value: '210.8 ft',
      reviewed_at: '2026-07-20T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    })]);
    expect(d.counts.corrected_fact).toBe(1);
    expect(d.changes[0]!.detail).toContain('the extraction had read "210.5 ft"');
  });

  it('does not double-count a fact that is both new and corrected', () => {
    const d = diffSinceLastRun(win, [], [fact({
      review_status: 'corrected', corrected_value: 'x', reviewed_at: '2026-07-20T00:00:00.000Z',
    })]);
    expect(d.changes).toHaveLength(1);
    expect(d.counts.new_fact).toBe(0);
  });

  it('states what it cannot detect', () => {
    // A CAD acreage revised in place by the county is invisible, and pretending otherwise would
    // imply a complete change list.
    const d = diffSinceLastRun(win, [], []);
    expect(d.caveats.join(' ')).toContain('revised in place');
    expect(d.headline).toContain('Additions and corrections only');
  });

  it('carries no caveat on a first run, where it would be meaningless', () => {
    expect(diffSinceLastRun({ since: null, previousRunAt: null, currentRunAt: NOW }, [], []).caveats).toHaveLength(0);
  });
});

describe('which changes should make somebody re-read the packet', () => {
  it('counts a new deed and a correction, not a new photo', () => {
    // The difference between a change list and a to-do.
    const d = diffSinceLastRun(win, [
      doc({ id: 'deed' }),
      doc({ id: 'photo', document_type: 'aerial_photo' }),
    ], [fact({ review_status: 'corrected', corrected_value: 'x', reviewed_at: '2026-07-20T00:00:00.000Z' })]);
    expect(materialChanges(d)).toHaveLength(2);
    expect(materialChanges(d).every(c => c.kind !== 'new_imagery')).toBe(true);
  });

  it('tells an approved packet it is out of date', () => {
    const d = diffSinceLastRun(win, [doc({ created_at: '2026-07-20T00:00:00.000Z' })], []);
    const msg = packetImpact(d, '2026-06-01T00:00:00.000Z');
    expect(msg).toContain('does not reflect them');
    expect(msg).toContain('re-assemble it');
  });

  it('says nothing when the packet postdates every material change', () => {
    const d = diffSinceLastRun(win, [doc({ created_at: '2026-06-01T00:00:00.000Z' })], []);
    expect(packetImpact(d, '2026-07-01T00:00:00.000Z')).toBe('');
  });

  it('says nothing when no packet has been approved', () => {
    const d = diffSinceLastRun(win, [doc()], []);
    expect(packetImpact(d, null)).toBe('');
  });
});

describe('the surface', () => {
  it('does not report a failed read as "nothing changed"', () => {
    const route = read('app/api/admin/research/[projectId]/run-diff/route.ts');
    expect(route).toContain('not the same as there having been one run');
    const panel = read('app/admin/research/components/RunDiffPanel.tsx');
    expect(panel).toContain('not the same as nothing having changed');
  });

  it('is actually mounted — the defect that left PipelineDiffEngine invisible', () => {
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
    const VIEW = 'app/admin/research/components/ResearchRunView.tsx';
    const SECTION = 'app/admin/research/[projectId]/_sections/ResearchStagePanel.tsx';
    // Innermost: the view renders it (as a tab body — see plan E1).
    expect(read(VIEW)).toContain('<RunDiffPanel projectId={projectId} />');
    // Middle: the section mounts the view.
    expect(read(SECTION)).toContain('<ResearchRunView');
    // Outermost: the page mounts the section.
    expect(read('app/admin/research/[projectId]/page.tsx')).toMatch(/<ResearchStagePanel\s/);
    expect(read('app/admin/research/[projectId]/page.tsx'))
      .toMatch(/<ResearchStagePanel\s/);
  });

  it('shows the packet-impact warning prominently, not as a footnote', () => {
    const panel = read('app/admin/research/components/RunDiffPanel.tsx');
    expect(panel).toContain('run-diff__packet-impact');
    expect(panel.indexOf('run-diff__packet-impact')).toBeLessThan(panel.indexOf('run-diff__list'));
  });

  it('prints the caveat rather than hiding it', () => {
    expect(read('app/admin/research/components/RunDiffPanel.tsx')).toContain('run-diff__caveat');
  });
});
