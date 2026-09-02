// __tests__/research/owner-name-reaches-the-run.test.ts
//
// ── THE OWNER NAME WAS COLLECTED, SAVED, DISPLAYED — AND NEVER USED ─────────────────────────────
//
// The New Research Project form has an Owner field. The create route saves it. The project page
// then read it like this:
//
//     ownerName={pendingSearchParams?.ownerName
//       ?? (project as unknown as { owner_name?: string }).owner_name ?? ''}
//
// `research_projects` has **no `owner_name` column** — the create route stores it inside
// `analysis_metadata`, and says so in its own comment. So that expression was always `undefined`
// and the owner name fell through to `''`.
//
// It is not cosmetic. `ResearchRunPanel` sends `ownerName` with the run, and the worker's clerk
// scraper branches on `if (input.ownerName)` to run its owner-based searches — one of the main ways
// documents are found for a property. **Every project created through the form ran with that search
// path switched off.** Nothing indicated it: the field accepted the name, saved it, and showed it
// back on the form.
//
// ── THE CAST IS WHAT HID IT ─────────────────────────────────────────────────────────────────────
//
// `as unknown as { owner_name?: string }` tells the compiler to stop asking. `ResearchProject` does
// not declare `owner_name` precisely BECAUSE the column does not exist — the type was right and the
// cast overrode it. Reading through a typed accessor instead is what makes this checkable at all.
//
// This is the same shape as three other defects found on 2026-08-31: `skipped_work` (`{step}`
// written, `{what}` read), `limits` (`maxWallClockMs` written, `maxMinutes` read) and five selects
// naming columns that do not exist. Every one lived between a producer and a consumer, and every one
// was invisible to any check that looked at either side alone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PAGE = read('app/admin/research/[projectId]/page.tsx');
const CREATE = read('app/api/admin/research/route.ts');
const FORM = read('app/admin/research/_tabs/ProjectsTab.tsx');

describe('the owner name survives the whole journey', () => {
  it('the form collects it', () => {
    expect(FORM).toContain('value={newProject.owner_name}');
  });

  it('the create route saves it — inside analysis_metadata, not as a column', () => {
    // The pairing is the point. If it ever becomes a real column, this assertion should be updated
    // deliberately rather than the reader quietly going back to the top level.
    const at = CREATE.indexOf('analysis_metadata: {');
    expect(at, 'analysis_metadata is where owner_name lives').toBeGreaterThan(-1);
    expect(CREATE.slice(at, at + 300)).toContain('owner_name');
  });

  it('the page reads it FROM THERE', () => {
    expect(PAGE).toContain('function projectOwnerName(');
    const fn = PAGE.slice(PAGE.indexOf('function projectOwnerName('));
    expect(fn.slice(0, 400)).toContain('analysis_metadata');
    expect(fn.slice(0, 400)).toContain('owner_name');
  });

  it('and hands it to the run panel', () => {
    expect(PAGE).toContain('ownerName={pendingSearchParams?.ownerName ?? projectOwnerName(project)');
  });

  // The 'run panel sends it' assertion lived here until 2026-09-02. Its own comment already said it
  // was no longer load-bearing — ResearchRunPanel was superseded and nothing mounted it — and the
  // file has now been deleted outright. The test below is the one that proves the property, and it
  // always was.

  it('and the LIVE run path — useRunState — sends it', () => {
    // The guard follows the code. ResearchRunView/useRunState replaced the panel, and a guard
    // left pointing at the old file would keep passing while the shipping path dropped
    // ownerName entirely. A vacuous guard is worse than no guard: it reports safety.
    const HOOK = read('app/admin/research/components/useRunState.ts');
    expect(HOOK).toMatch(/ownerName: input\.ownerName\?\.trim\(\)/);
    const VIEW = read('app/admin/research/components/ResearchRunView.tsx');
    expect(VIEW).toContain('ownerName');
  });

  it('and the RE-RUN paths carry it too', () => {
    // `pendingSearchParams` takes precedence over the project value, so the two places that seed it
    // — auto-start and re-run — decide the owner for exactly the case an operator hits when a run
    // disappointed them and they try again. Setting `ownerName: ''` there loses it just as
    // completely as the original bug did, and the assertion above would not have noticed: a
    // mutation to `ownerName: ''` passed every other test in this file.
    const seeds = PAGE.split('ownerName: projectOwnerName(project)').length - 1;
    expect(seeds, 'both setPendingSearchParams sites should seed the owner').toBe(2);
    expect(PAGE, 'a re-run must not blank the owner').not.toContain("ownerName: ''");
  });
});

describe('the mistake cannot come back the same way', () => {
  it('nothing reads owner_name off the project top level again', async () => {
    // Stripped, because `projectOwnerName`'s own doc comment QUOTES the expression it replaced —
    // so the raw-source version of this assertion failed on the sentence explaining the rule.
    // Sixth guard in this repository to match its own explanatory text this month; the fix is the
    // one hardened `stripComments`, not a seventh ad-hoc one.
    const { stripComments } = await import('../../scripts/audit-starr-assumptions.mjs');
    const code = stripComments(PAGE);

    // A control: a stripper that returned '' would make this vacuous.
    expect(code).toContain('function projectOwnerName(');

    expect(code, 'research_projects has no owner_name column')
      .not.toContain('as unknown as { owner_name?: string }');
  });

  it('the accessor is typed, not cast', () => {
    const fn = PAGE.slice(PAGE.indexOf('function projectOwnerName('), PAGE.indexOf('export default function'));
    expect(fn).toContain('project: ResearchProject | null');
    expect(fn, 'a cast on the project is what hid this').not.toContain('as unknown as');
  });

  it('an empty or whitespace owner is treated as absent, not as a search for nothing', () => {
    // `ownerName: '   '` would reach the worker, pass `if (input.ownerName)`, and run an owner
    // search for a blank string — slower than not searching and with worse results.
    const fn = PAGE.slice(PAGE.indexOf('function projectOwnerName('), PAGE.indexOf('export default function'));
    expect(fn).toContain('owner.trim()');
  });
});
