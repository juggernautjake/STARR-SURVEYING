// __tests__/research/project-stats-section-is-mounted.test.tsx — Phase B2 (under B1a).
//
// ── THE FAILURE THIS FILE EXISTS FOR ────────────────────────────────────────────────────────────
//
// An extraction that nothing mounts is a deletion with extra steps, and this repository's own record
// says so: a component was once rebuilt in full, its author's "is this wired?" test passed, and
// nothing on any page rendered it — because the test asserted that the component imported ITS
// helpers rather than that anything imported the component.
//
// So the first assertion below is about `page.tsx`, not about `ProjectStats.tsx`. The section's own
// correctness is worth much less than the fact that the page still renders it.
//
// ── AND THE MARKUP MUST NOT HAVE CHANGED ────────────────────────────────────────────────────────
//
// B1a's rule is "behaviour identical; the route renders the same markup". That was verified
// mechanically at extraction time — the 49 moved lines compared byte-for-byte against `HEAD`, with
// only the two inline handlers normalised into named callbacks. What is pinned here is the part a
// later edit could quietly undo: the aria-labels, and which tiles disable at zero.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

import ProjectStats from '../../app/admin/research/[projectId]/_sections/ProjectStats';

const ROOT = process.cwd();
const PAGE = fs.readFileSync(
  path.join(ROOT, 'app/admin/research/[projectId]/page.tsx'),
  'utf8',
);

describe('the page still mounts it — the assertion that actually matters', () => {
  it('page.tsx imports the section', () => {
    expect(PAGE).toContain("import ProjectStats from './_sections/ProjectStats'");
  });

  it('and RENDERS it, not merely imports it', () => {
    // Importing without rendering is exactly what an abandoned half-refactor looks like.
    expect(PAGE).toMatch(/<ProjectStats\s/);
  });

  it('renders it UNCONDITIONALLY — a guard that is never true is not wiring', () => {
    // `toMatch(/<ProjectStats\s/)` alone was not enough: a mutation to `{false && <ProjectStats`
    // passed it, which is the exact failure this whole file exists to catch — a section that is
    // imported, referenced, and never on screen. The grid sits at the top level of the returned
    // JSX today, so any `&&` or `?` on that line is a regression, not a refactor.
    const line = PAGE.split('\n').find((l) => l.includes('<ProjectStats'))!;
    expect(line, 'the stats grid should not be behind a condition').not.toMatch(/&&|\?/);
    expect(line.trim().startsWith('<ProjectStats'), `unexpected wrapper: ${line.trim()}`).toBe(true);
  });

  it('feeds it the real stats object and both callbacks', () => {
    const at = PAGE.indexOf('<ProjectStats');
    const el = PAGE.slice(at, PAGE.indexOf('/>', at));
    expect(el).toContain('stats={stats}');
    expect(el, 'the documents tile must still navigate').toContain('/documents');
    expect(el, 'the other tiles must still scroll in place').toContain('onScrollToReview={scrollToReview}');
  });

  it('the old inline markup is gone from the page', () => {
    // If both exist, the page renders the grid twice and the extraction achieved nothing.
    expect(PAGE, 'the grid should live in exactly one place now')
      .not.toContain('<div className="research-hub__stats">');
  });
});

describe('what the tiles promise a keyboard and a screen reader', () => {
  const render = (stats: React.ComponentProps<typeof ProjectStats>['stats']) =>
    ReactDOMServer.renderToStaticMarkup(
      React.createElement(ProjectStats, { stats, onOpenDocuments: () => {}, onScrollToReview: () => {} }),
    );

  const FULL = { document_count: 7, data_point_count: 42, discrepancy_count: 3, resolved_count: 2 };
  const EMPTY = { document_count: 0, data_point_count: 0, discrepancy_count: 0, resolved_count: 0 };

  it('every tile is a real button', () => {
    // Slice C4's original point: a div with onClick looks identical in a screenshot and cannot be
    // reached with a keyboard.
    expect(render(FULL).match(/<button/g)?.length).toBe(4);
  });

  it('and every one is type="button"', () => {
    // A `<button>` with no explicit type defaults to `submit`. These tiles sit outside a form
    // today, so it changes nothing today — but the day one of them is moved inside a form, a click
    // meant to scroll the page submits it instead, and the bug looks like the form misbehaving
    // rather than like the tile. A mutation to `type="submit"` passed the count above.
    expect(render(FULL).match(/type="button"/g)?.length).toBe(4);
    expect(render(FULL)).not.toContain('type="submit"');
  });

  it('each aria-label names both the number and where it goes', () => {
    const html = render(FULL);
    expect(html).toContain('7 documents — open documents library');
    expect(html).toContain('42 data points — open artifacts tab');
    expect(html).toContain('3 discrepancies — open discrepancies tab');
    expect(html).toContain('2 of 3 discrepancies resolved');
  });

  it('disables the three tiles that would scroll to an empty panel', () => {
    // A tile that scrolls to nothing is a promise the page cannot keep.
    expect(render(EMPTY).match(/disabled=""/g)?.length).toBe(3);
  });

  it('but never disables Documents — that is where you go to ADD some', () => {
    const first = render(EMPTY).slice(0, render(EMPTY).indexOf('</button>'));
    expect(first).toContain('open documents library');
    expect(first, 'the documents tile stays reachable when empty').not.toContain('disabled');
  });

  it('says "-" rather than "0/0" when there is nothing to resolve', () => {
    // "0/0 resolved" reads as a result. A dash reads as "not applicable", which is the truth.
    expect(render(EMPTY)).toContain('>-<');
    expect(render(EMPTY)).not.toContain('0/0');
  });

  it('and the resolved label stops claiming a ratio it does not have', () => {
    expect(render(EMPTY)).toContain('No discrepancies to resolve yet');
  });
});

describe('the section stayed presentational', () => {
  // ── STRIPPED, BECAUSE THIS FILE'S OWN PROSE MENTIONS WHAT IT FORBIDS ─────────────────────────
  //
  // The first version read the raw source and failed: `ProjectStats.tsx` explains, in a comment,
  // that "the original read `router.push` and `scrollToReview` directly" — so the assertion matched
  // the sentence describing the rule it was checking.
  //
  // **Fifth guard in this repository to match its own explanatory text this month**, after
  // `derive-portal-tabs.mjs`, the A3 CSS check, the Starr-assumptions scanner, and the E2 role
  // check. Long comments are the deliberate house style here, so this is not going to stop
  // happening; the fix is to reuse the one hardened stripper rather than write a sixth ad-hoc one.
  // That helper has its own tests, including that it does not eat a line containing a URL.
  const RAW = fs.readFileSync(
    path.join(ROOT, 'app/admin/research/[projectId]/_sections/ProjectStats.tsx'),
    'utf8',
  );

  it('holds no state and no router', async () => {
    const { stripComments } = await import('../../scripts/audit-starr-assumptions.mjs');
    const code = stripComments(RAW);

    // A control, because a stripper that returned '' would make every assertion below vacuous.
    expect(code, 'the stripper removed the code as well as the prose').toContain('export default function ProjectStats');

    // The point of extracting by section is that each piece can be reasoned about alone. A section
    // that reaches for the router can navigate anywhere and needs a router to test.
    expect(code).not.toContain('useState');
    expect(code).not.toContain('useRouter');
    expect(code, 'navigation belongs to the caller').not.toContain('router.push');
  });
});
