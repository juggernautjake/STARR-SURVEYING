// __tests__/research/research-stage-panel-is-mounted.test.tsx — Phase B1a.
//
// Fourth extraction from `[projectId]/page.tsx`: Stage 2, the screen an operator watches while a
// run is going. 52 lines out.
//
// ── THE SEARCH INPUTS ARE A DECISION, NOT MARKUP ────────────────────────────────────────────────
//
// Each of the four search fields was a three-way fallback inline in the JSX —
// `pendingSearchParams?.county ?? project.county ?? ''` — repeated four times with a different
// field. **That is the exact line G10 got wrong**: the owner name fell back to a project column
// that does not exist, so the worker's owner-based clerk search never ran, and the repetition is
// what made one wrong entry among four hard to see.
//
// They are resolved on the page and passed in as four plain strings. The panel renders what it is
// given, and the resolution sits in one place where it can be read.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PAGE = read('app/admin/research/[projectId]/page.tsx');
const SECT = read('app/admin/research/[projectId]/_sections/ResearchStagePanel.tsx');

describe('the page still mounts it', () => {
  it('imports the section', () => {
    expect(PAGE).toContain("import ResearchStagePanel from './_sections/ResearchStagePanel'");
  });

  it('renders it on the research stage, and only there', () => {
    // The stage condition is the ONE condition that belongs on the mount — it is what stage 2
    // means. Everything else about open/closed lives inside a component.
    expect(PAGE).toContain("{currentStage === 'research' && (");
    expect(PAGE).toMatch(/<ResearchStagePanel\s/);
  });

  it('with no SECOND guard smuggled onto the same line', () => {
    // B2's lesson, adapted. The blanket "the mount line has no `&&`" rule does not work here —
    // this mount legitimately lives inside the stage condition — so the check is narrower: the
    // element's own line carries the element and nothing else. `{false && <ResearchStagePanel` on
    // that line passed every other assertion in this file.
    const line = PAGE.split('\n').find((l) => l.includes('<ResearchStagePanel'))!;
    expect(line.trim(), `unexpected wrapper: ${line.trim()}`).toBe('<ResearchStagePanel');
  });

  it('passes all four resolved search fields', () => {
    const at = PAGE.indexOf('<ResearchStagePanel');
    const el = PAGE.slice(at, PAGE.indexOf('/>', at));
    for (const p of ['address=', 'county=', 'parcelId=', 'ownerName=']) {
      expect(el, `${p} is missing`).toContain(p);
    }
  });

  it('and the owner still comes from analysis_metadata — G10 must not come back here', () => {
    const at = PAGE.indexOf('<ResearchStagePanel');
    const el = PAGE.slice(at, PAGE.indexOf('/>', at));
    expect(el).toContain('projectOwnerName(project)');
  });

  it('the old inline block is gone', () => {
    expect(PAGE).not.toContain('<div className="research-stage2">');
  });
});

describe('the panel is presentational', () => {
  it('holds no state and fetches nothing', () => {
    // Everything it needs arrives as a prop. A stage panel that reloads on its own would race the
    // page's own loaders — which is what the four callbacks it calls are for.
    expect(SECT).not.toContain('useState');
    expect(SECT).not.toContain('useEffect');
    expect(SECT).not.toContain('fetch(');
  });

  it('resolves nothing itself — the fallbacks stayed with the caller', async () => {
    // If a `??` chain reappears here, the decision has been split across two files again, and that
    // is how one of four ended up wrong the first time.
    //
    // Stripped, because this section's own header comment names `pendingSearchParams` while
    // explaining why it must not appear in the code. Seventh guard in this repository to match its
    // own explanatory text this month — the house style is long comments, so the answer is the one
    // hardened stripper rather than an eighth ad-hoc dodge.
    const { stripComments } = await import('../../scripts/audit-starr-assumptions.mjs');
    const code = stripComments(SECT);
    expect(code, 'the stripper ate the code too').toContain('export default function ResearchStagePanel');

    expect(code).not.toContain('pendingSearchParams');
    expect(code).not.toContain('projectOwnerName');
  });

  it('still mounts the four run-visibility panels, in order', () => {
    // RunConsoleBar shows spend and elapsed-vs-budget; RunDiffPanel flags a stale packet;
    // ReportCardPanel scores the run. Dropping one is invisible — the page still renders.
    const order = ['RunConsoleBar', 'RunDiffPanel', 'ReportCardPanel', 'ResearchRunPanel']
      .map((n) => SECT.indexOf(`<${n}`));
    expect(order.every((i) => i > -1), 'a run-visibility panel went missing').toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('forwards every callback the page needs to stay in sync', () => {
    for (const cb of ['onPipelineStart', 'onPipelineComplete', 'onBack', 'onContinueToReview']) {
      expect(SECT, `${cb} must reach ResearchRunPanel`).toContain(`${cb}={${cb}}`);
    }
  });
});
