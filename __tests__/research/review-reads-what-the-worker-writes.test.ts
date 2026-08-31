// __tests__/research/review-reads-what-the-worker-writes.test.ts — B1a.
//
// ── A CAST IS A CLAIM, NOT A CHECK ──────────────────────────────────────────────────────────────
//
// The Review tab's Survey panel reads **29 keys** out of `analysis_metadata.result`, across four
// nested structures. The worker builds that object by hand in `worker/src/index.ts`; the panel
// declares by hand what it expects to find. Nothing connects the two.
//
// TypeScript will happily let the panel read `result.platSummaries` from an object whose key is
// `platSummary`. Nothing throws. The section renders empty — and an empty "Plat Analyses" section
// looks exactly like a deed that had no plats.
//
// That is [[project_map_and_surveying_backend_complete]]'s "written in units nobody produces"
// defect, and this repository has shipped it more than once.
//
// ── THE SWEEP THAT FOUND NOTHING TOOK THREE TRIES ───────────────────────────────────────────────
//
// All 29 keys are produced. Getting to that answer required three versions of the question, and the
// first two were the probe rather than the code:
//
//   1. accepting `foo,` ANYWHERE reported all 29 produced — it matches any variable in an argument
//      list, so the sweep could not have returned a negative;
//   2. rejecting it reported `platAnalyses` as never produced, when `worker/src/index.ts:475` writes
//      exactly that, in shorthand, on its own line.
//
// A probe that cannot produce a negative is worthless, and a probe that produces a false one sends
// somebody to fix working code. Both controls are below.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SURVEY_RESULT_KEYS, surveyReviewData } from
  '../../app/admin/research/[projectId]/_sections/survey-review-data';
import { SUMMARY_RESULT_KEYS, summaryReviewData, formatDuration } from
  '../../app/admin/research/[projectId]/_sections/summary-review-data';
import { EASEMENT_RESULT_KEYS, easementsReviewData, EASEMENT_DATA_SOURCES } from
  '../../app/admin/research/[projectId]/_sections/easements-review-data';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Everything that builds the research result object, app-side or worker-side. */
function producerSource(): string {
  const files: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.next'].includes(e.name) || e.name.startsWith('.')) continue;
      const next = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(next);
      else if (next.endsWith('.ts') && !next.includes('.test.')) files.push(next);
    }
  };
  walk('worker/src');
  walk('lib/research');
  walk('app/api/admin/research');
  return files.map(read).join('\n');
}

const PROD = producerSource();

/**
 * Is this key WRITTEN somewhere, in any of the three forms an object key takes?
 *
 * Shorthand is anchored to its own line. Unanchored, it matches any variable in an argument list
 * and the check reports everything as produced — which is how the first version of this passed
 * while proving nothing.
 */
export function isWrittenIn(key: string, corpus: string): boolean {
  const k = key.includes('.') ? key.split('.').pop()! : key;
  const keyForm = new RegExp(`(^|[{,;])\\s*${k}\\??\\s*:`, 'm');
  const writeForm = new RegExp(`\\.${k}\\s*=[^=]`);
  const shorthand = new RegExp(`^\\s+${k},\\s*$`, 'm');
  return keyForm.test(corpus) || writeForm.test(corpus) || shorthand.test(corpus);
}

const isWritten = (key: string) => isWrittenIn(key, PROD);

describe('the probe can answer both ways', () => {
  it('finds a key the worker certainly writes', () => {
    expect(isWritten('ownerName'), 'the producer source is not being read').toBe(true);
  });

  it('does NOT find a key nobody writes', () => {
    // Without this, a matcher that returns true for everything passes the whole file.
    expect(isWritten('zzzKeyNobodyWrites')).toBe(false);
  });

  it('recognises shorthand, on its own line only', () => {
    // `platAnalyses,` — the form that made version two of this report a false negative.
    expect(isWritten('platAnalyses')).toBe(true);
  });

  it('and does NOT treat a variable in an argument list as a written key', () => {
    // Measured against a synthetic corpus rather than the real one, because the distinction the
    // anchor draws does not show up against `zzzKeyNobodyWrites` — that string appears nowhere at
    // all, so removing the anchor still returned false and the mutation survived. Anchoring is what
    // separates "this is an object key" from "this word appeared before a comma".
    expect(isWrittenIn('needle', 'doSomething(needle, other);'), 'an argument is not a key')
      .toBe(false);
    expect(isWrittenIn('needle', 'const o = {\n  needle,\n};'), 'shorthand IS a key').toBe(true);
    expect(isWrittenIn('needle', 'const o = { needle: 1 };')).toBe(true);
    expect(isWrittenIn('needle', 'o.needle = 1;')).toBe(true);
    expect(isWrittenIn('needle', 'if (o.needle === 1) {}'), 'a read is not a write').toBe(false);
  });

  it('read a substantial producer corpus', () => {
    expect(PROD.length, 'the producer walk found almost nothing').toBeGreaterThan(200_000);
  });
});

describe('every key the Survey panel reads is one the worker writes', () => {
  it('has a key list to check', () => {
    // Control: an empty list agrees with everything.
    expect(SURVEY_RESULT_KEYS.length).toBeGreaterThanOrEqual(29);
    expect(SUMMARY_RESULT_KEYS.length).toBeGreaterThanOrEqual(26);
    expect(EASEMENT_RESULT_KEYS.length).toBeGreaterThanOrEqual(27);
  });

  it.each([...SURVEY_RESULT_KEYS, ...SUMMARY_RESULT_KEYS, ...EASEMENT_RESULT_KEYS])('%s is produced', (key) => {
    expect(
      isWritten(key),
      `The Survey panel reads \`${key}\`, and nothing in the worker or the API writes it. `
      + 'The section will render empty, which looks exactly like a property that genuinely has none.',
    ).toBe(true);
  });
});

describe('the shaping itself', () => {
  it('defaults every list and summary rather than handing the panel undefined', () => {
    const d = surveyReviewData(null);
    expect(d.chainOfTitle).toEqual([]);
    expect(d.platAnalyses).toEqual([]);
    expect(d.crossValidation).toEqual([]);
    expect(d.deedSummary).toBe('');
    expect(d.platSummary).toBe('');
    expect(d.boundary).toBeNull();
  });

  it('keeps `boundary` nullable, because the panel draws that distinction', () => {
    // No boundary at all gets an explanation of WHY — plat images need AI analysis. An empty array
    // would render the same section with nothing in it and no reason given.
    expect(surveyReviewData({ result: {} }).boundary).toBeNull();
    expect(surveyReviewData({ result: { boundary: { callCount: 0 } } }).boundary).not.toBeNull();
  });

  it('returns a BOOLEAN for hasBoundary, not a truthy object or null', () => {
    // `boundary && (…)` evaluates to the LEFT operand when it is falsy — so with no boundary at all
    // `hasBoundary` was `null`, and with an empty call list it was `false`. The empty-list case
    // alone does not distinguish the two forms, which is why the no-boundary case is here: that is
    // the one where `&&` hands back something that is not a boolean.
    const empty = surveyReviewData({ result: { boundary: { bearingsAndDistances: [] } } });
    expect(typeof empty.hasBoundary).toBe('boolean');
    expect(empty.hasBoundary).toBe(false);

    const none = surveyReviewData({ result: {} });
    expect(typeof none.hasBoundary, 'no boundary must still be a boolean').toBe('boolean');
    expect(none.hasBoundary).toBe(false);
  });

  it('is true only when there is at least one call to show', () => {
    expect(surveyReviewData({ result: { boundary: { bearingsAndDistances: ['N 30° E 100'] } } }).hasBoundary)
      .toBe(true);
  });

  it('survives metadata of the wrong shape', () => {
    for (const junk of [null, undefined, 'a string', 42, { result: 'not an object' }, { result: null }]) {
      expect(() => surveyReviewData(junk), String(junk)).not.toThrow();
    }
    expect(surveyReviewData({ result: { chainOfTitle: 'not an array' } }).chainOfTitle).toEqual([]);
  });
});

describe('the page uses it', () => {
  const PAGE = read('app/admin/research/[projectId]/page.tsx');

  it('imports and calls it', () => {
    expect(PAGE).toContain("from './_sections/survey-review-data'");
    expect(PAGE).toContain('surveyReviewData(project.analysis_metadata)');
  });

  it('no longer carries the inline cast', () => {
    expect(PAGE, 'the 25-line inline cast is back')
      .not.toContain('const platAnalyses = (result?.platAnalyses ?? []) as Array<{');
  });
});

describe('the Summary panel\'s shaping', () => {
  const stats = { document_count: 0, data_point_count: 0, discrepancy_count: 0 };
  const proj = (result: Record<string, unknown> | null = null) => ({ analysis_metadata: { result } });

  it('renders 0 documents rather than hiding the row', () => {
    // `docCount > 0` hid the stat entirely, so a run that retrieved NOTHING looked identical to one
    // where the count was never reported. This is the screen somebody signs off from — a missing
    // row there reads as "not applicable", which is the opposite of what it means.
    const d = summaryReviewData(proj({ documentCount: 0 }), stats);
    expect(d.docCount).toBe(0);
    expect(d.hasDocCount, '0 documents is a finding, not an absence').toBe(true);
  });

  it('still reports a real count', () => {
    expect(summaryReviewData(proj({ documentCount: 7 }), stats).docCount).toBe(7);
    expect(summaryReviewData(proj(), { ...stats, document_count: 4 }).docCount).toBe(4);
  });

  it('prefers the stats row, falling through a zero to the run result', () => {
    // `||` rather than `??` is deliberate here: the stats row is not populated until the run's rows
    // land, so a 0 there really does mean "not counted yet" rather than "none found".
    const d = summaryReviewData(proj({ documentCount: 9 }), { ...stats, document_count: 0 });
    expect(d.docCount).toBe(9);
  });

  it('coerces every count, so a malformed result cannot render NaN', () => {
    const d = summaryReviewData(proj({
      duration_ms: 'not a number', confidenceScore: null, screenshotCount: undefined,
    }), stats);
    expect(d.durationMs).toBe(0);
    expect(d.confidenceScore).toBe(0);
    expect(d.screenshotCount).toBe(0);
  });

  it('counts fatal errors separately from recovered ones', () => {
    const d = summaryReviewData(proj({
      errors: [{ recovered: true }, { recovered: false }, { recovered: false }],
    }), stats);
    expect(d.errorCount).toBe(3);
    expect(d.fatalErrors).toBe(2);
  });

  it('treats a missing `recovered` flag as fatal', () => {
    // Not knowing whether an error was recovered is not the same as knowing it was. The safe
    // reading is the one that surfaces it.
    expect(summaryReviewData(proj({ errors: [{}] }), stats).fatalErrors).toBe(1);
  });

  it('falls back from the boundary call count to the number of calls present', () => {
    expect(summaryReviewData(proj({ boundary: { callCount: 12 } }), stats).callCount).toBe(12);
    expect(summaryReviewData(proj({ boundary: { bearingsAndDistances: ['a', 'b'] } }), stats).callCount).toBe(2);
    expect(summaryReviewData(proj({ boundary: {} }), stats).callCount).toBe(0);
  });

  it('survives junk metadata', () => {
    for (const junk of [null, 'a string', { result: 'not an object' }, { result: { errors: 'nope' } }]) {
      expect(() => summaryReviewData({ analysis_metadata: junk }, stats), String(junk)).not.toThrow();
    }
    expect(summaryReviewData({ analysis_metadata: { result: { errors: 'nope' } } }, stats).errorCount).toBe(0);
  });
});

describe('duration formatting', () => {
  it('uses seconds below a minute and minutes above', () => {
    expect(formatDuration(1_500)).toBe('1.5s');
    expect(formatDuration(59_900)).toBe('59.9s');
    expect(formatDuration(60_000)).toBe('1m 0s');
    expect(formatDuration(125_000)).toBe('2m 5s');
  });

  it('does not render a bare 0 as a minute', () => {
    expect(formatDuration(0)).toBe('0.0s');
  });
});

describe('the Summary panel is wired', () => {
  const PAGE = read('app/admin/research/[projectId]/page.tsx');

  it('calls the shaping function', () => {
    expect(PAGE).toContain('summaryReviewData(project, stats)');
  });

  it('renders the zero-document state rather than hiding it', () => {
    expect(PAGE, 'the > 0 guard is back').not.toContain('{docCount > 0 &&');
    expect(PAGE).toContain('hasDocCount &&');
  });

  it('no longer paints the flood zone in unreadable colours', () => {
    // #f87171 is 2.77:1 and #4ade80 is 1.74:1 on white. A flood zone is a material fact for a
    // survey; it was being signalled in two colours at ratios neither of which could be read.
    expect(PAGE).not.toContain("'#f87171'");
    expect(PAGE).not.toContain("'#4ade80'");
  });
});

// ── The Easements panel — the last cast on the Review tab ──────────────────────────────────────
//
// Twenty-seven keys across four nested structures: FEMA, TxDOT, the clerk's recorded easements, and
// two lists the plat analyser hangs off `boundary`. Checked against the same producer corpus above,
// which is why they are in this file rather than in one of their own — the coherence panel gets its
// own file precisely because it is the one panel this corpus does NOT produce.

describe('the Easements panel shaping', () => {
  const withResult = (result: Record<string, unknown> | null) => ({ result });

  it('defaults every list rather than handing the panel undefined', () => {
    const d = easementsReviewData(withResult(null));
    expect(d.easements).toEqual([]);
    expect(d.covenants).toEqual([]);
    expect(d.rowWidths).toEqual([]);
    expect(d.platEasements).toEqual([]);
    expect(d.summary).toBe('');
    expect(d.fema).toBeNull();
    expect(d.txdot).toBeNull();
  });

  it('survives metadata of every wrong shape', () => {
    for (const junk of [null, undefined, 'a string', 42, [], { result: 'nope' }, { result: [] }]) {
      expect(() => easementsReviewData(junk), String(junk)).not.toThrow();
    }
    expect(easementsReviewData({ result: { easements: 'not an array' } }).easements).toEqual([]);
    expect(easementsReviewData({ result: { boundary: 'not an object' } }).rowWidths).toEqual([]);
  });

  it('treats an EMPTY fema object as no reading, not as a reading', () => {
    // `result.fema = {}` renders a grid of six blank fields under a heading that says the data is
    // there. The empty state — "requires valid coordinates from geocoding" — is the true answer and
    // is the one a surveyor can act on.
    expect(easementsReviewData(withResult({ fema: {} })).fema).toBeNull();
    expect(easementsReviewData(withResult({ txdot: {} })).txdot).toBeNull();
    expect(easementsReviewData(withResult({ fema: { floodZone: 'AE' } })).fema).not.toBeNull();
  });

  // ── hasData COUNTED FOUR OF THE SIX SECTIONS IT RENDERS ──────────────────────────────────────
  //
  // `fema || txdot || easements.length || covenants.length`. The two plat-derived lists were not in
  // it, so a run that read the plats and found nothing at the courthouse listed the right-of-way
  // widths and then printed "No easement or encumbrance data found" underneath them. Not a hidden
  // section — a contradiction, on the tab whose job is to say what encumbers the tract.

  it.each([
    ['fema', { fema: { floodZone: 'X' } }],
    ['txdot', { txdot: { rowWidth: 80 } }],
    ['easements', { easements: [{ type: 'Utility' }] }],
    ['covenants', { restrictiveCovenants: ['No mobile homes'] }],
    ['rowWidths', { boundary: { rowWidths: ['60 ft ROW'] } }],
    ['platEasements', { boundary: { platEasements: ['10 ft UE along the east line'] } }],
  ])('hasData is true when only %s came back', (_source, result) => {
    expect(easementsReviewData(withResult(result)).hasData).toBe(true);
  });

  it('and false when nothing did', () => {
    expect(easementsReviewData(withResult({})).hasData).toBe(false);
    expect(easementsReviewData(withResult({
      easements: [], restrictiveCovenants: [], boundary: { rowWidths: [], platEasements: [] },
    })).hasData).toBe(false);
  });

  it('a summary alone does NOT count as data', () => {
    // The summary is prose the model wrote about the sections; it is not a source. If it counted,
    // the empty state would never render on a run that produced a paragraph and nothing else.
    expect(easementsReviewData(withResult({ easementSummary: 'No easements were located.' })).hasData)
      .toBe(false);
  });

  it('returns a BOOLEAN, not the first truthy source', () => {
    expect(typeof easementsReviewData(withResult({ fema: { floodZone: 'X' } })).hasData).toBe('boolean');
    expect(typeof easementsReviewData(withResult({})).hasData).toBe('boolean');
  });

  it('every source it renders is one hasData counts', () => {
    // The list is what stops a seventh section being added above the empty state without being
    // counted — which is exactly how the two plat lists got there.
    const shaped = easementsReviewData(withResult({}));
    for (const source of EASEMENT_DATA_SOURCES) {
      expect(shaped, `EASEMENT_DATA_SOURCES names ${source}, which the shaping does not return`)
        .toHaveProperty(source);
    }
    expect(EASEMENT_DATA_SOURCES.length, 'a source was added to the tab but not to the list').toBe(6);
  });
});

describe('the Easements panel is wired, and is no longer a dark island', () => {
  const PAGE = read('app/admin/research/[projectId]/page.tsx');
  const CSS = read('app/admin/styles/AdminResearch.css');

  it('imports and calls the shaping function', () => {
    expect(PAGE).toContain("from './_sections/easements-review-data'");
    expect(PAGE).toContain('easementsReviewData(project.analysis_metadata)');
  });

  it('no longer carries the inline cast', () => {
    expect(PAGE, 'the 20-line inline cast is back')
      .not.toContain("const easementSummary = (result?.easementSummary ?? '') as string;");
    expect(PAGE).not.toContain('const hasData = fema || txdot');
  });

  it('renders no #0f172a card on this page any more', () => {
    // The tab was a dark panel inside a light portal, and then had light-theme greys put on it.
    // #4B5563 on #0f172a is 2.36:1 — the description of every recorded easement, and all three
    // "no data available" lines.
    expect(PAGE, 'the dark encumbrance cards are back').not.toContain("'#0f172a'");
    expect(PAGE).not.toContain("'#1e293b'");
    expect(PAGE).not.toContain("'#64748b'");
  });

  it('and the classes it moved to are actually defined', () => {
    // "Authored but not wired", the stylesheet half: a class that no rule defines renders unstyled,
    // and an unstyled dark-card replacement is a white box with no border.
    for (const cls of [
      'review-encumbrance-box', 'review-encumbrance-box__title', 'review-encumbrance-grid',
      'review-encumbrance-field__label', 'review-encumbrance-field__value',
      'review-encumbrance-field__value--flag-on', 'review-encumbrance-field__value--flag-off',
      'review-encumbrance-field__value--unknown', 'review-encumbrance-field__value--strong',
      'review-encumbrance-link', 'review-encumbrance-empty', 'review-encumbrance-list',
      'review-encumbrance-item', 'review-encumbrance-item__title', 'review-encumbrance-item__desc',
      'review-encumbrance-item__meta', 'review-encumbrance-section',
    ]) {
      expect(CSS, `.${cls} is used by the page and defined nowhere`).toContain(`.${cls}`);
    }
  });

  it('shows the easement LOCATION, which was cast and never rendered', () => {
    // `location?: string | null` was in the inline cast, is produced by the worker, and appeared in
    // no JSX. Same shape as the owner name (G10): collected, typed, never shown. It says WHERE on
    // the tract the easement runs, which is the thing a field crew needs.
    expect(PAGE).toContain('Location: {e.location}');
  });

  it('does not signal the flood hazard by colour alone', () => {
    // Red/green carries nothing for a red-green colour-blind reader, and this one is a material
    // fact about the property. The words carry it; the colour reinforces.
    expect(PAGE).toContain("'YES — flood insurance required' : 'No'");
  });
});
