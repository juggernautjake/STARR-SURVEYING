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
  });

  it.each([...SURVEY_RESULT_KEYS])('%s is produced', (key) => {
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
