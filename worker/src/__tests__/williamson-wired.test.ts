/**
 * Williamson is wired — assert the CALLERS, not just the modules.
 *
 * Every capability built for this county over 2026-09-21 existed as a tested module before it
 * existed as a thing a run does. Twice the orphaned-module ratchet caught that before I did.
 *
 * These tests assert the seams: that the pipeline reaches the county's own CAD client instead of
 * the BIS one, that it reaches the county's own clerk driver instead of the Kofile one, that the
 * capture runner can refuse a useless image, and that Stage 1 classifies a refusal rather than
 * calling everything "unreachable".
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf8');

/** Source with comments removed — this codebase names what it decided against inside them. */
const code = (rel: string) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');

describe('Stage 1 reaches the county\'s own appraisal client', () => {
  const pipeline = code('services/pipeline.ts');

  it('calls williamsonStage1', () => {
    expect(pipeline).toContain("await import('../counties/williamson/stage1.js')");
    expect(pipeline).toContain('williamsonStage1(');
  });

  it('runs it BEFORE the BIS search, not as a fallback after it', () => {
    // For a county with its own client the BIS attempt is not a fallback, it is a wrong turn: it
    // would generate address variants for a search box that does not exist and report their
    // failure as evidence about the property.
    const mine = pipeline.indexOf('williamsonStage1(');
    const bis = pipeline.indexOf('searchBisCad(');
    expect(mine).toBeGreaterThan(0);
    expect(bis).toBeGreaterThan(0);
    expect(mine).toBeLessThan(bis);
  });

  it('hands it the geocoder\'s corrected line', () => {
    expect(pipeline).toContain('canonical: normalized.canonical');
  });
});

describe('Stage 2 reaches the county\'s own clerk driver', () => {
  const pipeline = code('services/pipeline.ts');

  it('calls the county driver, in its many-search form', () => {
    expect(pipeline).toContain("await import('../counties/williamson/clerk-driver.js')");
    // Many, not one per citation: a fresh context per book/page trips the county's bot wall.
    expect(pipeline).toContain('searchWilliamsonClerkMany(');
  });

  it('runs it BEFORE the Kofile driver', () => {
    const mine = pipeline.indexOf('searchWilliamsonClerkMany(');
    const kofile = pipeline.indexOf('searchClerkRecords(input.county, ownerForClerk');
    expect(mine).toBeGreaterThan(0);
    expect(kofile).toBeGreaterThan(0);
    expect(mine).toBeLessThan(kofile);
  });

  it('SKIPS the Kofile driver entirely when the county driver answered', () => {
    // Running it afterwards would search a portal Williamson does not use — one that holds only
    // Commissioners Court minutes — and append its guaranteed zero rows to a correct result set.
    expect(pipeline).toContain('williamsonDocs !== null');
  });

  it('classifies a refusal instead of filing it as an empty result', () => {
    // Every clerk search is checked, not just the first — the citation walk runs one search per
    // book/page, and one of them being refused says nothing about the others.
    expect(pipeline).toContain('.verdict.kind !== ');
    expect(pipeline).toContain('rejectionLine(o.verdict)');
    expect(pipeline).toContain('retrievalFailures.push(o.verdict.message)');
  });

  it('walks every book/page the appraisal district cites, not only the newest', () => {
    // Nine citations on the test parcel. Searching one and stopping threw away eight, and a chain
    // of title is exactly the part that was being thrown away.
    expect(pipeline).toContain('MAX_CITATIONS');
    expect(pipeline).toContain('citations.slice(0, MAX_CITATIONS)');
    expect(pipeline).toContain('searchWilliamsonClerkMany(session.browser, queries');
  });

  it('sends the citation number to Volume, never to Book', () => {
    // The Book box on this clerk holds a TYPE code. A number in it matches nothing, silently.
    expect(pipeline).toContain('volume: d.volume!, page: d.page!');
    expect(pipeline).not.toContain('book: citations[0]');
  });

  it('de-duplicates, because one deed can be cited by several sales rows', () => {
    expect(pipeline).toContain('seenDocs');
    expect(pipeline).toContain('mergedRecords');
  });

  it('orders the walk so a wall takes the oldest deed, not the newest', () => {
    // The county cuts long walks short, so the last query is the one that never runs. Ordering is
    // therefore a decision about what we are willing to lose.
    expect(pipeline).toContain(".sort((a, b) => (b.deedDate ?? '').localeCompare(a.deedDate ?? ''))");
    // And the name search — the only route to the current owner's vesting deed — goes FIRST.
    const name = pipeline.indexOf('queries.push({ bothNames: ownerForClerk })');
    const cites = pipeline.indexOf('for (const d of toSearch) queries.push(');
    expect(name).toBeGreaterThan(0);
    expect(cites).toBeGreaterThan(0);
    expect(name).toBeLessThan(cites);
  });

  it('adds a name search when transfers carry a date but no citation', () => {
    // This county stopped recording by book/page around 2000, so the deed that vests the CURRENT
    // owner is unreachable by citation. Book/page alone stopped twenty years short of the present.
    expect(pipeline).toContain('const uncited');
    expect(pipeline).toContain('searchByName');
    expect(pipeline).toContain('queries.push({ bothNames: ownerForClerk })');
  });

  it('filters name-search rows to this parcel, and only those', () => {
    // A company that owns hundreds of houses answers a name search with all of them.
    expect(pipeline).toContain("await import('../counties/williamson/parcel-match.js')");
    expect(pipeline).toContain('rowCouldBeThisParcel(');
    // Citations are parcel-specific by construction, so the filter must not touch them.
    expect(pipeline).toContain("o.plan.kind !== 'name'");
  });

  it('uses a real browser, through the shared factory', () => {
    // The name fields are chip lists; the term is the selected entry, not the typed text. No
    // amount of fetch gets there.
    expect(pipeline).toContain("await import('../lib/browser-factory.js')");
    expect(pipeline).toMatch(/withBrowser\(\{ adapterId: 'tyler-clerk' \}/);
  });
});

describe('Stage 1 says whose problem an unreachable site is', () => {
  const pipeline = code('services/pipeline.ts');

  it('classifies the transport error rather than calling everything UNREACHABLE', () => {
    // "UNREACHABLE" covered four conditions with four different remedies, and that is how a
    // hostname which has never existed read as a county website being down.
    expect(pipeline).toContain("await import('../research/site-rejection.js')");
    expect(pipeline).toContain('readTransportError(');
    expect(pipeline).toContain('rejectionLine(verdict)');
  });
});

describe('the capture runner can refuse a useless image', () => {
  const runner = code('research/capture-runner.ts');

  it('assesses before storing', () => {
    // A useless capture must never reach the library, so a report does not carry a picture of an
    // error page somebody has to scroll past.
    const assessed = runner.indexOf('assessCapture(');
    const stored = runner.indexOf('await deps.store(');
    expect(assessed).toBeGreaterThan(0);
    expect(stored).toBeGreaterThan(0);
    expect(assessed).toBeLessThan(stored);
  });

  it('assesses AFTER the OCR, because the text is the cheapest evidence there is', () => {
    const ocr = runner.indexOf('deps.ocr(');
    expect(ocr).toBeGreaterThan(0);
    expect(runner.indexOf('assessCapture(')).toBeGreaterThan(ocr);
  });

  it('records a refused capture as its own outcome, not as a failure', () => {
    // "We chose not to file this" and "we could not take it" are different facts.
    expect(runner).toContain("status: 'not-useful'");
  });

  it('the vision judge is OPTIONAL, so a deployment with no key still works', () => {
    expect(runner).toContain('judgeCapture?: VisionJudge');
    expect(runner).toContain('deps.judgeCapture ? shot.bytes.toString');
  });
});

describe('the vision judge is actually supplied', () => {
  const index = read('index.ts');

  it('the worker passes one to the capture runner', () => {
    expect(index).toContain('judgeCapture:');
    expect(index).toContain("await import('./research/capture-usefulness.js')");
    expect(index).toContain('VISION_PROMPT');
  });

  it('returns null without a key rather than throwing', () => {
    const start = index.indexOf('judgeCapture:');
    const block = index.slice(start, start + 2000);
    expect(block).toContain('if (!apiKey) return null;');
  });

  it('extracts the JSON object rather than parsing the whole reply', () => {
    // The model is asked for JSON only and a fenced block is still the common failure.
    const start = index.indexOf('judgeCapture:');
    expect(index.slice(start, start + 2500)).toContain('/\\{[\\s\\S]*\\}/'.replace(/\\\\/g, '\\'));
  });
});

describe('the plat fallback runs when there is no free repository', () => {
  const pipeline = code('services/pipeline.ts');

  it('offers a paid plat search with the subdivision name', () => {
    expect(pipeline).toContain("await import('../adapters/texasfile-plats.js')");
    expect(pipeline).toContain('planPlatSearch(input.county, { subdivision: identified.subdivisionName })');
  });

  it('only when the county has no free one', () => {
    expect(pipeline).toContain('!platRepo && identified.subdivisionName');
  });
});

describe('the county is curated and the dead BIS row is gone', () => {
  it('Williamson is in the curated list', () => {
    expect(code('counties/profile.ts')).toContain('WILLIAMSON_PROFILE');
  });

  it('bis-cad.ts no longer claims Williamson', () => {
    // esearch.wilcotx.gov returns NXDOMAIN and the county is not a BIS county at all.
    const bis = code('services/bis-cad.ts');
    expect(bis).not.toMatch(/^\s*williamson:\s*\{/m);
    expect(bis).not.toContain('esearch.wilcotx.gov');
  });

  it('the Kofile table no longer claims Williamson either', () => {
    // Its portal holds only Commissioners Court minutes; a deed search there returns an empty page
    // that reads as "this property has no deeds".
    const clerk = code('services/bell-clerk.ts');
    expect(clerk).not.toMatch(/^\s*williamson:\s*\{/m);
  });
});
