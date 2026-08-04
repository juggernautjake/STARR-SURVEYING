// The USLandRecords adapter must actually walk the grid, not just be able to describe having done so.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// `describeUslrCompleteness` is well tested: it says INCOMPLETE when rows were missed, and UNKNOWN
// when the grid states no total. Every one of those tests passes whether or not the adapter ever
// pages, because they call the reporter directly.
//
// That is the gap this repository keeps finding. Robertson answers a bare surname with **239 rows
// across 12 pages at the default page size**; returning page one is 20 documents presented as the
// whole answer, with nothing marking it short. A deleted paging loop leaves every existing test
// green and turns a complete search into a confident, wrong one — the same defect as an empty
// result, wearing a more convincing disguise.
//
// So these are source-level guards on the wiring. They are deliberately about *reachability*, not
// about the parse: the parse has its own tests, and duplicating them here would just make two
// places to update.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ADAPTER = path.join(process.cwd(), 'src/adapters/uslandrecords-adapter.ts');

/** Comments stripped: a note explaining that the adapter pages is not the adapter paging. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const SRC = code(fs.readFileSync(ADAPTER, 'utf8'));

describe('the sweep is looking at something', () => {
  it('reads an adapter that exists and has content', () => {
    // A guard whose subject was renamed passes forever while the thing it watched rotted.
    expect(SRC.length).toBeGreaterThan(2000);
    expect(SRC).toContain('class');
  });

  it('is not satisfied by prose', () => {
    const proseOnly = '// This adapter calls readAllPages and clickNextPage on every search.\n';
    expect(code(proseOnly).includes('readAllPages')).toBe(false);
  });
});

describe('the grid is walked, not sampled', () => {
  it('the search path hands off to the pager instead of returning page one', () => {
    expect(SRC).toContain('return this.readAllPages(');
  });

  it('the pager is a loop, not a single extra page', () => {
    // A "read page two as well" fix would answer Robertson's 239 rows with 40 and look like paging.
    expect(SRC).toMatch(/while \(pagesRead < USLR_MAX_PAGES\)/);
    expect(SRC).toContain('clickNextPage(');
  });

  it('the loop is bounded, so a pager that never reports done cannot spin forever', () => {
    expect(SRC).toContain('USLR_MAX_PAGES');
  });

  it('asks for the bigger page size before walking', () => {
    // 100 rows a page turns Robertson's twelve pages into three. Optional by design — if the control
    // is missing the read still happens at 20 — so this asserts the attempt, not the outcome.
    //
    // The CALL, not the name. `toContain('setPageSize100(')` matched the method DEFINITION, so
    // deleting the only call left this green — found by a negative control that did not fire, and
    // the same shape as the bug it is guarding against.
    expect(SRC).toContain('await this.setPageSize100()');
  });

  it('deduplicates across pages', () => {
    // A record shifting page mid-walk would otherwise be read twice, and two rows for one deed read
    // as two conveyances of the same land.
    expect(SRC).toMatch(/byKey\.(has|set)\(/);
  });

  it('reports completeness from the WALK, not from one page', () => {
    // `rowsSeen` accumulates across pages; passing a single page's length would report a complete
    // read of 20 rows against a 239-row grid and say nothing was missed.
    expect(SRC).toMatch(/describeUslrCompleteness\([^)]*rowsSeen/s);
  });

  it('stops when it has seen everything the grid claims', () => {
    expect(SRC).toMatch(/rowsSeen >= reported/);
  });
});

describe('a page that cannot be read is not an empty page', () => {
  it('breaks out rather than treating a failed advance as the end of the results', () => {
    // `advanced === false` means the pager did not move — which is not the same as "no more rows".
    // The completeness line is what distinguishes them, and it only does so because the loop breaks
    // here instead of concluding.
    expect(SRC).toMatch(/if \(!advanced\) break;/);
  });

  it('confirms the grid actually changed before counting a page as read', () => {
    // Clicking an ASP.NET postback and reading immediately returns the previous page's rows, which
    // would then dedupe to nothing and look like the end of the result set.
    expect(SRC).toMatch(/previousFirstCell|firstCell/);
  });
});
